import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { ProjectItem } from '@/hooks/useProjects';
import { supabase } from '@/integrations/backend/client';
import { 
  FanSelection, 
  FanDatabase, 
  AIRFLOW_UNITS, 
  PRESSURE_UNITS, 
  FanPerformancePoint,
  OctaveBandData,
  FanDimension,
  getMotorRPM,
  calculateOverallFromOctaveBands,
  Frequency,
  FanSeries,
  FireClass,
  AccessoryType,
  AtexRating,
  applyFanLawsForPoles,
} from './fanData';
import { generateEnhancedDatasheet, DatasheetOptions } from './pdfDatasheetGenerator';
import { formatPower } from './utils';
import { rewriteStorageUrls } from './offline/fileCache';

interface ProjectDatasheetOptions {
  projectName: string;
  projectReference?: string;
  clientName?: string;
  clientAddress?: string;
  items: ProjectItem[];
  logoUrl?: string;
  companyName?: string;
  tenantId: string;
}

// Color palette
const COLORS = {
  primary: [59, 130, 246] as [number, number, number],
  primaryDark: [37, 99, 235] as [number, number, number],
  text: [40, 40, 40] as [number, number, number],
  textLight: [100, 100, 100] as [number, number, number],
  border: [200, 200, 200] as [number, number, number],
  background: [248, 250, 252] as [number, number, number],
  white: [255, 255, 255] as [number, number, number],
};

async function loadImageAsBase64(url: string): Promise<string | null> {
  try {
    const response = await fetch(rewriteStorageUrls(url));
    const blob = await response.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

// Default tenant ID - all fan data is shared from this tenant
const DEFAULT_TENANT_ID = '00000000-0000-0000-0000-000000000001';

// Fetch full fan data and build DatasheetOptions for a project item
export async function buildDatasheetOptionsForItem(
  item: ProjectItem, 
  database: FanDatabase,
  index: number,
  total: number
): Promise<DatasheetOptions | null> {
  const effectiveTenantId = DEFAULT_TENANT_ID;
  
  try {
    // Get series info - fetch ALL fields needed for PDF generation
    const { data: seriesData } = await supabase
      .from('fan_series')
      .select(`
        id, name, drawing_url, image_url, datasheet_description, show_octave_bands, 
        nomenclature_template, fire_rating, amca_certified, ce_certified, ul_certified, 
        iso_certified, atex_certified, iom_url, catalogue_url, compatible_accessories,
        stall_airflow_min_percent, stall_airflow_max_percent, default_noise_distance,
        default_directivity_q, sound_outlet_reduction, amca_logo_url, fire_rating_logo_url,
        ce_logo_url, ul_logo_url, iso_logo_url, atex_logo_url
      `)
      .eq('tenant_id', effectiveTenantId)
      .eq('name', item.series_name)
      .single();

    if (!seriesData) {
      console.warn('Series not found:', item.series_name);
      return null;
    }

    // CRITICAL: Populate database.series with this series info so PDF generator can find it
    // The PDF generator looks up seriesInfo from database.series to get certifications, logos, etc.
    const seriesInfoForDb = {
      id: seriesData.id,
      name: seriesData.name,
      description: seriesData.datasheet_description || '',
      imageUrl: seriesData.image_url || '',
      drawingUrl: seriesData.drawing_url || '',
      showOctaveBands: seriesData.show_octave_bands ?? true,
      fireRating: seriesData.fire_rating || undefined,
      amcaCertified: seriesData.amca_certified ?? false,
      amcaLogoUrl: seriesData.amca_logo_url || undefined,
      fireRatingLogoUrl: seriesData.fire_rating_logo_url || undefined,
      ceCertified: seriesData.ce_certified ?? false,
      ceLogoUrl: seriesData.ce_logo_url || undefined,
      ulCertified: seriesData.ul_certified ?? false,
      ulLogoUrl: seriesData.ul_logo_url || undefined,
      isoCertified: seriesData.iso_certified ?? false,
      isoLogoUrl: seriesData.iso_logo_url || undefined,
      atexCertified: seriesData.atex_certified ?? false,
      atexLogoUrl: seriesData.atex_logo_url || undefined,
      iomUrl: seriesData.iom_url || undefined,
      catalogueUrl: seriesData.catalogue_url || undefined,
      defaultDirectivityQ: seriesData.default_directivity_q ?? 2,
      defaultNoiseDistance: seriesData.default_noise_distance ?? 0,
      soundOutletReduction: seriesData.sound_outlet_reduction ?? 0,
      stallAirflowMinPercent: seriesData.stall_airflow_min_percent ?? 15,
      stallAirflowMaxPercent: seriesData.stall_airflow_max_percent ?? 95,
      compatibleAccessories: seriesData.compatible_accessories || [],
    };
    
    // Add to database.series if not already present
    if (!database.series.find(s => s.id === seriesData.id)) {
      database.series.push(seriesInfoForDb as any);
    }

    // Get fan model - include reference_poles for fan law conversion
    const { data: fanModel } = await supabase
      .from('fan_models')
      .select('id, diameter, reference_poles')
      .eq('tenant_id', effectiveTenantId)
      .eq('series_id', seriesData.id)
      .eq('diameter', item.diameter)
      .single();

    if (!fanModel) {
      console.warn('Fan model not found:', item.diameter);
      return null;
    }

    // Get blade configuration
    const { data: bladeConfig } = await supabase
      .from('blade_configurations')
      .select('id, blade_count, blade_angles')
      .eq('fan_model_id', fanModel.id)
      .eq('blade_count', item.blade_count)
      .single();

    if (!bladeConfig) {
      console.warn('Blade config not found:', item.blade_count);
      return null;
    }

    // Get performance data
    const { data: perfData } = await supabase
      .from('performance_data')
      .select('*')
      .eq('blade_config_id', bladeConfig.id)
      .eq('blade_angle', item.blade_angle)
      .order('point_index', { ascending: true });

    // Convert raw performance data
    let performanceData: FanPerformancePoint[] = (perfData || []).map(p => ({
      airflow: Number(p.airflow),
      staticPressure: Number(p.static_pressure),
      shaftPower: Number(p.shaft_power),
      efficiency: Number(p.efficiency),
      totalEfficiency: p.total_efficiency ? Number(p.total_efficiency) : undefined,
    }));

    if (performanceData.length === 0) {
      console.warn('No performance data found for blade angle:', item.blade_angle);
      return null;
    }

    // CRITICAL: Apply fan laws to convert from reference poles to project item's motor poles
    // Performance data in DB is stored at reference pole count (e.g., 4-pole)
    // We need to scale it to the actual motor poles used in this project item
    const referencePoles = fanModel.reference_poles || 4;
    const targetPoles = item.motor_poles;
    
    if (targetPoles !== referencePoles) {
      console.log(`Applying fan laws: ${referencePoles}P → ${targetPoles}P for ${item.nomenclature}`);
      performanceData = applyFanLawsForPoles(performanceData, referencePoles, targetPoles, 50);
    }

    // Get noise data
    const { data: noiseDataRaw } = await supabase
      .from('noise_data')
      .select('*')
      .eq('blade_config_id', bladeConfig.id)
      .eq('blade_angle', item.blade_angle)
      .single();

    const noiseData: OctaveBandData | null = noiseDataRaw ? {
      hz63: Number(noiseDataRaw.hz63) || 0,
      hz125: Number(noiseDataRaw.hz125) || 0,
      hz250: Number(noiseDataRaw.hz250) || 0,
      hz500: Number(noiseDataRaw.hz500) || 0,
      hz1k: Number(noiseDataRaw.hz1k) || 0,
      hz2k: Number(noiseDataRaw.hz2k) || 0,
      hz4k: Number(noiseDataRaw.hz4k) || 0,
      hz8k: Number(noiseDataRaw.hz8k) || 0,
      overall: Number(noiseDataRaw.overall) || 0,
    } : null;

    // Get dimensions
    const { data: dimData } = await supabase
      .from('fan_dimensions')
      .select('*')
      .eq('series_id', seriesData.id)
      .eq('size', item.diameter)
      .single();

    const fanDimensions: FanDimension | undefined = dimData ? {
      size: dimData.size,
      phiD: dimData.phi_d ? Number(dimData.phi_d) : 0,
      phiD1: dimData.phi_d1 ? Number(dimData.phi_d1) : 0,
      phiD2: dimData.phi_d2 ? Number(dimData.phi_d2) : 0,
      H: dimData.h ? Number(dimData.h) : 0,
      E: dimData.e ? Number(dimData.e) : 0,
      F: dimData.f ? Number(dimData.f) : 0,
      L: dimData.l ? Number(dimData.l) : 0,
      K: dimData.k ? Number(dimData.k) : 0,
      nPhiD: dimData.n_phi_d || '',
      zPhiD1: dimData.z_phi_d1 || '',
      motorMax: dimData.motor_max || '',
    } : undefined;

    // Get flexible dimension schema for this series
    const { data: flexSchemaData } = await supabase
      .from('series_dimension_schema')
      .select('*')
      .eq('series_id', seriesData.id)
      .order('display_order');

    const flexibleDimensionSchema = flexSchemaData?.map(s => ({
      param_key: s.param_key,
      param_label: s.param_label,
      param_type: s.param_type as 'number' | 'text',
      display_order: s.display_order,
    }));

    // Get stored flexible dimension values from project item (extracted early for use below)
    const storedFlexDimValues = (item as any).flexible_dimension_values;

    // Get flexible dimension values if not stored in project item
    let flexibleDimensionValue = storedFlexDimValues 
      ? { size: item.diameter, values: storedFlexDimValues }
      : undefined;

    // If no stored flex values but schema exists, try to fetch from series_dimension_values
    if (!flexibleDimensionValue && flexibleDimensionSchema && flexibleDimensionSchema.length > 0) {
      const { data: flexValueData } = await supabase
        .from('series_dimension_values')
        .select('*')
        .eq('series_id', seriesData.id)
        .eq('size', item.diameter)
        .single();

      if (flexValueData) {
        flexibleDimensionValue = {
          size: flexValueData.size,
          values: flexValueData.values || {},
        };
      }
    }

    // Get motor spec
    const { data: motorSpec } = await supabase
      .from('motor_specifications')
      .select('*, motor_brands(name)')
      .eq('tenant_id', effectiveTenantId)
      .eq('motor_poles', item.motor_poles)
      .eq('rating_kw', item.motor_rating_kw || 0)
      .single();

    // Get casing weight
    const { data: casingData } = await supabase
      .from('casing_weights')
      .select('weight')
      .eq('tenant_id', effectiveTenantId)
      .eq('diameter', item.diameter)
      .single();

    // Get impeller weight
    const { data: impellerData } = await supabase
      .from('impeller_weights')
      .select('weight')
      .eq('tenant_id', effectiveTenantId)
      .eq('diameter', item.diameter)
      .eq('blade_count', item.blade_count)
      .single();

    // Use stored weights if available (from project item), otherwise use fetched data
    const casingWeight = (item as any).casing_weight ?? (casingData?.weight ? Number(casingData.weight) : 0);
    const impellerWeight = (item as any).impeller_weight ?? (impellerData?.weight ? Number(impellerData.weight) : 0);
    const motorWeight = (item as any).motor_weight ?? (motorSpec?.motor_weight ? Number(motorSpec.motor_weight) : 0);

    // Use stored calculated values if available, otherwise derive them
    const storedFanRPM = (item as any).fan_rpm;
    const storedOutletVelocity = (item as any).outlet_velocity;
    const storedDynamicPressure = (item as any).dynamic_pressure;
    const storedTotalPressure = (item as any).total_pressure;
    
    const fanRPM = storedFanRPM ?? getMotorRPM(item.motor_poles, (item.frequency || 50) as Frequency);
    const outletArea = Math.PI * Math.pow(item.diameter / 2000, 2); // m²
    const airflowM3S = (item.operating_airflow || 0) / 3600;
    const outletVelocity = storedOutletVelocity ?? (outletArea > 0 ? airflowM3S / outletArea : 0);
    const airDensity = item.air_density || 1.2;
    const dynamicPressure = storedDynamicPressure ?? (0.5 * airDensity * Math.pow(outletVelocity, 2));
    const totalPressure = storedTotalPressure ?? ((item.operating_pressure || 0) + dynamicPressure);

    // Get stored values from project item for datasheet parity
    const storedNoiseDistance = (item as any).noise_distance;
    const storedNoiseDirectivityQ = (item as any).noise_directivity_q;
    const storedSoundOutletReduction = (item as any).sound_outlet_reduction;
    // For stall values: if stored value matches OLD defaults (15/95), use series defaults instead
    // This handles legacy project items that were saved before the fix
    const rawStoredStallMin = (item as any).stall_min_percent;
    const rawStoredStallMax = (item as any).stall_max_percent;
    const storedStallMin = (rawStoredStallMin === 15) ? null : rawStoredStallMin;
    const storedStallMax = (rawStoredStallMax === 95) ? null : rawStoredStallMax;
    const storedVfdEnabled = (item as any).vfd_enabled;
    const storedVfdFrequency = (item as any).vfd_frequency;
    const storedVoltageDriveEnabled = (item as any).voltage_drive_enabled;
    const storedDriveVoltage = (item as any).drive_voltage;
    const storedNominalVoltage = (item as any).nominal_voltage;
    const storedMotorPhase = (item as any).motor_phase;
    const storedMotorBrandName = (item as any).motor_brand_name;
    // storedFlexibleDimensionValues already extracted earlier as storedFlexDimValues
    const storedFireClass = (item as any).fire_class;
    const storedAtexRating = (item as any).atex_rating;
    const storedSelectedAccessories = (item as any).selected_accessories;

    // Build FanSelection object with all required properties
    const selection: FanSelection = {
      fanId: fanModel?.id || `${item.series_name}-${item.diameter}`,
      seriesId: seriesData.id,
      series: item.series_name as FanSeries,
      diameter: item.diameter,
      motorPole: item.motor_poles,
      bladeCount: item.blade_count,
      bladeAngle: item.blade_angle,
      motorRating: item.motor_rating_kw || 0,
      nomenclature: item.nomenclature || `${item.series_name}-${item.diameter}`,
      operatingPoint: {
        airflow: item.operating_airflow || item.required_airflow,
        staticPressure: item.operating_pressure || item.required_pressure,
        shaftPower: item.shaft_power || 0,
        efficiency: item.efficiency || 0,
      },
      dutyPointMatch: 100, // Project items are considered matched
      noiseData: noiseData || { hz63: 0, hz125: 0, hz250: 0, hz500: 0, hz1k: 0, hz2k: 0, hz4k: 0, hz8k: 0, overall: 0 },
      score: 0,
      fireClass: (storedFireClass || '') as FireClass,
      accessory: (storedSelectedAccessories?.[0] || '') as AccessoryType,
      atexRating: (storedAtexRating || '') as AtexRating,
      frequency: (item.frequency || 50) as Frequency,
      requiredAirflow: item.required_airflow,
      requiredPressure: item.required_pressure,
    };

    // Build DatasheetOptions with ALL settings to match fan selector output
    // Use stored units from project item (user's original selection)
    const airflowUnit = (item.airflow_unit || 'CMH') as keyof typeof AIRFLOW_UNITS;
    const pressureUnit = (item.pressure_unit || 'Pa') as keyof typeof PRESSURE_UNITS;
    
    const options: DatasheetOptions = {
      selection,
      database,
      airflowUnit,
      pressureUnit,
      performanceData,
      fanRPM,
      outletVelocity,
      dynamicPressure,
      totalPressure,
      casingWeight,
      impellerWeight,
      motorWeight,
      fanDimensions,
      seriesDrawingUrl: seriesData.drawing_url || undefined,
      seriesImageUrl: seriesData.image_url || undefined,
      // Use stored motor spec values if available, otherwise use fetched data
      motorSpec: {
        brandName: storedMotorBrandName || (motorSpec?.motor_brands as any)?.name,
        motorFrame: motorSpec?.motor_frame,
        ratedCurrent: (item as any).motor_rated_current ?? (motorSpec?.rated_current ? Number(motorSpec.rated_current) : undefined),
        fullLoadCurrent: (item as any).motor_full_load_current ?? (motorSpec?.full_load_current ? Number(motorSpec.full_load_current) : undefined),
        startingCurrent: (item as any).motor_starting_current ?? (motorSpec?.starting_current ? Number(motorSpec.starting_current) : undefined),
        voltage: (item as any).motor_voltage ?? (motorSpec?.voltage ? Number(motorSpec.voltage) : undefined),
        frequency: motorSpec?.frequency || 50,
        ipRating: (item as any).motor_ip_rating || motorSpec?.ip_rating,
        insulationClass: (item as any).motor_insulation_class || motorSpec?.insulation_class,
        efficiencyClass: (item as any).motor_efficiency_class || motorSpec?.efficiency_class,
        motorWeight: motorWeight,
        fireRating: (item as any).motor_fire_rating || motorSpec?.fire_rating,
      },
      airDensity: item.air_density || 1.2,
      temperature: item.temperature || 20,
      altitude: item.altitude || 0,
      // Noise settings - prefer stored values, fallback to series defaults
      noiseDistance: storedNoiseDistance ?? seriesData.default_noise_distance ?? 0,
      noiseDirectivityQ: storedNoiseDirectivityQ ?? seriesData.default_directivity_q ?? 2,
      soundOutletReduction: storedSoundOutletReduction ?? seriesData.sound_outlet_reduction ?? 0,
      // Stall zone settings - prefer stored values, fallback to series defaults (use ?? to allow 0 as valid value)
      stallAirflowMinPercent: storedStallMin ?? seriesData.stall_airflow_min_percent ?? 0,
      stallAirflowMaxPercent: storedStallMax ?? seriesData.stall_airflow_max_percent ?? 100,
      // Octave bands and description
      showOctaveBands: seriesData.show_octave_bands ?? true,
      datasheetDescription: seriesData.datasheet_description || undefined,
      // Certifications
      fireRating: seriesData.fire_rating || undefined,
      amcaCertified: seriesData.amca_certified ?? false,
      amcaLogoUrl: seriesData.amca_logo_url || undefined,
      fireRatingLogoUrl: seriesData.fire_rating_logo_url || undefined,
      // URLs for QR codes
      iomUrl: seriesData.iom_url || undefined,
      compatibleAccessories: seriesData.compatible_accessories || [],
      // Flexible dimensions - pass both schema and values
      flexibleDimensionSchema,
      flexibleDimensionValue,
      // Project mode options
      skipSave: true,
      pageLabel: `Fan ${index + 1} of ${total}`,
      // VFD/speed control settings from stored values
      vfdEnabled: storedVfdEnabled ?? (item.frequency !== undefined && item.frequency !== 50),
      vfdFrequency: storedVfdFrequency ?? item.frequency ?? 50,
      voltageDriveEnabled: storedVoltageDriveEnabled ?? false,
      driveVoltage: storedDriveVoltage,
      nominalVoltage: storedNominalVoltage ?? 415,
      motorPhase: storedMotorPhase ?? 3,
    };

    return options;
  } catch (error) {
    console.error('Error building datasheet options:', error);
    return null;
  }
}

export async function generateProjectDatasheet(options: ProjectDatasheetOptions): Promise<void> {
  const {
    projectName,
    projectReference,
    clientName,
    clientAddress,
    items,
    logoUrl,
    companyName = 'Fan Selector',
    tenantId,
  } = options;

  const doc = new jsPDF('p', 'mm', 'a4');
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 15;

  // Load logo if provided
  let logoBase64: string | null = null;
  if (logoUrl) {
    logoBase64 = await loadImageAsBase64(logoUrl);
  }

  // Build the database object for the PDF generator
  const database: FanDatabase = {
    logoUrl: logoUrl || '',
    companyName: companyName,
    contactInfo: { email: '', phone: '' },
    fans: [],
    series: [],
    seriesDrawings: [],
    unitPreferences: {
      airflowUnit: 'CMH',
      pressureUnit: 'Pa',
      powerUnit: 'kW',
    },
    motorDatabase: { brands: [], specifications: [] },
    weightDatabase: { casingWeights: [], impellerWeights: [] },
  };

  // ========== COVER PAGE ==========
  // Background gradient effect (solid color simulation)
  doc.setFillColor(...COLORS.primary);
  doc.rect(0, 0, pageWidth, pageHeight * 0.45, 'F');
  
  // White bottom section
  doc.setFillColor(...COLORS.white);
  doc.rect(0, pageHeight * 0.45, pageWidth, pageHeight * 0.55, 'F');

  // Logo
  let logoY = 40;
  if (logoBase64) {
    try {
      const logoWidth = 80;
      const logoHeight = 25;
      doc.addImage(logoBase64, 'PNG', (pageWidth - logoWidth) / 2, logoY, logoWidth, logoHeight);
      logoY += logoHeight + 20;
    } catch (e) {
      console.error('Failed to add logo:', e);
      logoY += 10;
    }
  } else {
    // Text logo fallback
    doc.setTextColor(...COLORS.white);
    doc.setFontSize(36);
    doc.setFont('helvetica', 'bold');
    doc.text(companyName, pageWidth / 2, logoY + 10, { align: 'center' });
    logoY += 30;
  }

  // Title
  doc.setTextColor(...COLORS.white);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'normal');
  doc.text('TECHNICAL DATASHEET', pageWidth / 2, logoY + 10, { align: 'center' });

  // Decorative line
  doc.setDrawColor(...COLORS.white);
  doc.setLineWidth(0.5);
  doc.line(pageWidth * 0.3, logoY + 20, pageWidth * 0.7, logoY + 20);

  // Project Name (large, in white section)
  const projectInfoY = pageHeight * 0.5;
  doc.setTextColor(...COLORS.text);
  doc.setFontSize(28);
  doc.setFont('helvetica', 'bold');
  doc.text(projectName, pageWidth / 2, projectInfoY, { align: 'center' });

  // Project Reference
  if (projectReference) {
    doc.setFontSize(14);
    doc.setTextColor(...COLORS.textLight);
    doc.setFont('helvetica', 'normal');
    doc.text(`Reference: ${projectReference}`, pageWidth / 2, projectInfoY + 12, { align: 'center' });
  }

  // Client Info Box
  if (clientName) {
    const boxY = projectInfoY + 30;
    doc.setDrawColor(...COLORS.border);
    doc.setFillColor(...COLORS.background);
    doc.roundedRect(margin + 30, boxY, pageWidth - margin * 2 - 60, 35, 3, 3, 'FD');
    
    doc.setFontSize(10);
    doc.setTextColor(...COLORS.textLight);
    doc.text('PREPARED FOR', pageWidth / 2, boxY + 10, { align: 'center' });
    
    doc.setFontSize(14);
    doc.setTextColor(...COLORS.text);
    doc.setFont('helvetica', 'bold');
    doc.text(clientName, pageWidth / 2, boxY + 22, { align: 'center' });
    
    if (clientAddress) {
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...COLORS.textLight);
      const addressLines = doc.splitTextToSize(clientAddress, pageWidth - margin * 2 - 80);
      doc.text(addressLines, pageWidth / 2, boxY + 30, { align: 'center' });
    }
  }

  // Fan count summary
  const totalFans = items.reduce((sum, item) => sum + item.quantity, 0);
  const summaryY = pageHeight * 0.75;
  
  doc.setFillColor(...COLORS.primary);
  doc.roundedRect(pageWidth / 2 - 40, summaryY, 80, 25, 3, 3, 'F');
  
  doc.setTextColor(...COLORS.white);
  doc.setFontSize(20);
  doc.setFont('helvetica', 'bold');
  doc.text(`${totalFans}`, pageWidth / 2, summaryY + 12, { align: 'center' });
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(totalFans === 1 ? 'FAN UNIT' : 'FAN UNITS', pageWidth / 2, summaryY + 20, { align: 'center' });

  // Date
  doc.setTextColor(...COLORS.textLight);
  doc.setFontSize(10);
  doc.text(`Generated: ${new Date().toLocaleDateString('en-US', { 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric' 
  })}`, pageWidth / 2, pageHeight - 20, { align: 'center' });

  // Footer line
  doc.setDrawColor(...COLORS.primary);
  doc.setLineWidth(3);
  doc.line(0, pageHeight - 10, pageWidth, pageHeight - 10);

  // ========== SCHEDULE PAGE ==========
  doc.addPage();
  
  // Header
  doc.setFillColor(...COLORS.primary);
  doc.rect(0, 0, pageWidth, 25, 'F');
  
  doc.setTextColor(...COLORS.white);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('FAN SCHEDULE', margin, 16);
  
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(projectName, pageWidth - margin, 16, { align: 'right' });

  // Schedule table - use stored units from first item (all items in project should have same units)
  const firstItemUnit = items[0];
  const scheduleAirflowUnit = (firstItemUnit?.airflow_unit || 'CMH') as keyof typeof AIRFLOW_UNITS;
  const schedulePressureUnit = (firstItemUnit?.pressure_unit || 'Pa') as keyof typeof PRESSURE_UNITS;
  
  // Get unit labels for headers
  const airflowUnitLabel = AIRFLOW_UNITS[scheduleAirflowUnit]?.label || 'm³/h';
  const pressureUnitLabel = PRESSURE_UNITS[schedulePressureUnit]?.label || 'Pa';
  
  // Convert values to display units
  const convertAirflowForDisplay = (value: number | null | undefined): string => {
    if (value === null || value === undefined) return '-';
    // Value is stored in CMH, convert to display unit
    const unitConfig = AIRFLOW_UNITS[scheduleAirflowUnit] as { label: string; factor: number; fromCMH: number };
    const conversionFactor = unitConfig?.fromCMH || 1;
    return (value * conversionFactor).toFixed(0);
  };
  
  const convertPressureForDisplay = (value: number | null | undefined): string => {
    if (value === null || value === undefined) return '-';
    // Value is stored in Pa, convert to display unit
    const unitConfig = PRESSURE_UNITS[schedulePressureUnit] as { label: string; factor: number; fromPa: number };
    const conversionFactor = unitConfig?.fromPa || 1;
    return (value * conversionFactor).toFixed(schedulePressureUnit === 'Pa' ? 0 : 2);
  };
  
  const tableData = items.map((item, idx) => [
    (idx + 1).toString(),
    item.nomenclature || `${item.series_name}-${item.diameter}`,
    `${item.blade_count}B/${item.blade_angle}°`,
    `${item.motor_poles}P`,
    convertAirflowForDisplay(item.operating_airflow),
    convertPressureForDisplay(item.operating_pressure),
    `${item.shaft_power !== undefined && item.shaft_power !== null ? formatPower(item.shaft_power) : '-'}`,
    `${item.efficiency?.toFixed(1) || '-'}%`,
    `${item.motor_rating_kw || '-'}`,
    item.quantity.toString(),
  ]);

  autoTable(doc, {
    startY: 35,
    head: [[
      '#', 'Model', 'Blades', 'Poles', 
      `Airflow\n(${airflowUnitLabel})`, `Pressure\n(${pressureUnitLabel})`, 'Power\n(kW)', 'Eff.', 
      'Motor\n(kW)', 'Qty'
    ]],
    body: tableData,
    theme: 'grid',
    headStyles: {
      fillColor: COLORS.primaryDark,
      textColor: COLORS.white,
      fontSize: 8,
      fontStyle: 'bold',
      halign: 'center',
      valign: 'middle',
      cellPadding: 3,
    },
    bodyStyles: {
      fontSize: 8,
      halign: 'center',
      valign: 'middle',
      cellPadding: 2,
    },
    alternateRowStyles: {
      fillColor: COLORS.background,
    },
    columnStyles: {
      0: { cellWidth: 8 },
      1: { cellWidth: 35, halign: 'left' },
      2: { cellWidth: 18 },
      3: { cellWidth: 12 },
      4: { cellWidth: 20 },
      5: { cellWidth: 18 },
      6: { cellWidth: 15 },
      7: { cellWidth: 15 },
      8: { cellWidth: 15 },
      9: { cellWidth: 12 },
    },
  });

  // ========== INDIVIDUAL FAN DATASHEETS ==========
  // Use stored PDFs if available, otherwise generate on-the-fly
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    
    // Check if this item has a stored datasheet URL
    if (item.datasheet_url) {
      // For now, we still need to regenerate since merging PDFs from URLs is complex
      // The stored URL can be used for individual downloads
      console.log(`Item ${i + 1} has stored datasheet at: ${item.datasheet_url}`);
    }
    
    // Build full datasheet options for this item
    const datasheetOptions = await buildDatasheetOptionsForItem(item, database, i, items.length);
    
    if (datasheetOptions) {
      // Use existing doc and append pages
      datasheetOptions.existingDoc = doc;
      datasheetOptions.skipSave = true;
      datasheetOptions.pageLabel = `Fan ${i + 1} of ${items.length}`;
      
      // Generate the datasheet pages using the main generator
      await generateEnhancedDatasheet(datasheetOptions);
    } else {
      // Fallback: Simple page if data fetch failed
      doc.addPage();
      
      doc.setFillColor(...COLORS.primary);
      doc.rect(0, 0, pageWidth, 25, 'F');
      
      doc.setTextColor(...COLORS.white);
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text(`FAN ${i + 1} OF ${items.length}`, margin, 16);
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.text(item.nomenclature || `${item.series_name}-${item.diameter}`, pageWidth - margin, 16, { align: 'right' });

      let yPos = 40;
      
      doc.setTextColor(...COLORS.text);
      doc.setFontSize(18);
      doc.setFont('helvetica', 'bold');
      doc.text(item.nomenclature || `${item.series_name}-${item.diameter}`, margin, yPos);
      yPos += 8;
      
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...COLORS.textLight);
      doc.text(`${item.series_name} Series • Ø${item.diameter}mm • ${item.blade_count} Blades • ${item.blade_angle}° Pitch • ${item.motor_poles} Pole`, margin, yPos);
      yPos += 15;

      const specData = [
        ['Operating Airflow', `${item.operating_airflow?.toFixed(0) || '-'} m³/h`],
        ['Operating Pressure', `${item.operating_pressure?.toFixed(0) || '-'} Pa`],
        ['Shaft Power', `${item.shaft_power !== undefined && item.shaft_power !== null ? formatPower(item.shaft_power) : '-'} kW`],
        ['Efficiency', `${item.efficiency?.toFixed(1) || '-'} %`],
        ['Motor Rating', `${item.motor_rating_kw || '-'} kW`],
        ['Quantity', `${item.quantity}`],
      ];

      autoTable(doc, {
        startY: yPos,
        body: specData,
        theme: 'striped',
        styles: { fontSize: 9, cellPadding: 3 },
        columnStyles: {
          0: { cellWidth: 50, fontStyle: 'bold', textColor: COLORS.textLight },
          1: { cellWidth: 50, textColor: COLORS.text },
        },
      });
      
      doc.setFontSize(8);
      doc.setTextColor(...COLORS.textLight);
      doc.text('Full datasheet data unavailable - showing summary only.', margin, pageHeight - 20);
    }
  }

  // Save the complete document
  const fileName = `${projectName.replace(/[^a-zA-Z0-9]/g, '_')}_Datasheets.pdf`;
  doc.save(fileName);
}
