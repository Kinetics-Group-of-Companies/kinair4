import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import jsPDF from 'jspdf';
import { Wind, Settings2, Download, FileText, Ruler, MousePointer, Layers, Zap, Weight, Gauge, RotateCcw, Activity, FolderPlus, ChevronDown, Volume2, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { FanSelection, AIRFLOW_UNITS, PRESSURE_UNITS, FanPerformancePoint, OctaveBandData, MOTOR_POLES, getMotorRPM, applyFanLawsForPoles, applyNoiseFanLawsForPoles, applyFrequencyChange, generateDynamicDescription, generateNomenclature, convertAirflow, convertPressure, calculateTotalEfficiency } from '@/lib/fanData';
import { useSupabaseFanDatabase } from '@/hooks/useSupabaseFanDatabase';
import { useFanDimensions } from '@/hooks/useFanDatabase';
import { useDimensionSchema, useDimensionValues } from '@/hooks/useFlexibleDimensions';
import { InteractivePerformanceChart } from './InteractivePerformanceChart';
import { NoiseDataTable } from './NoiseDataTable';
import { FanDrawing } from './FanDrawing';
import { FanAirflowTwin } from './FanAirflowTwin';
import { AddToProjectDialog } from '@/components/projects/AddToProjectDialog';
import { useAuth } from '@/lib/authContext';
import { toast } from 'sonner';
import { generateEnhancedDatasheet, generateDrawingOnlyPDF, generateSoundDataOnlyPDF } from '@/lib/pdfDatasheetGenerator';
import { generateExcelDatasheet } from '@/lib/excelDatasheetGenerator';
import { formatPower } from '@/lib/utils';
import { captureChartAsImage } from '@/lib/chartExporter';

interface FanDetailsPanelProps {
  selection: FanSelection;
  airflowUnit: keyof typeof AIRFLOW_UNITS;
  pressureUnit: keyof typeof PRESSURE_UNITS;
  airDensity?: number;
  temperature?: number;
  altitude?: number;
  onDutyPointChange?: (airflow: number, pressure: number) => void;
}

// Calculate fan RPM based on motor poles and frequency
function calculateRPM(motorPoles: number, frequency: number = 50): number {
  const synchronousSpeed = (120 * frequency) / motorPoles;
  // Assume ~3% slip for induction motor
  return Math.round(synchronousSpeed * 0.97);
}

// Calculate outlet velocity (m/s) from airflow (CMH) and diameter (mm)
function calculateOutletVelocity(airflowCMH: number, diameterMM: number): number {
  const areaM2 = Math.PI * Math.pow(diameterMM / 1000 / 2, 2);
  const airflowCMS = airflowCMH / 3600; // Convert CMH to m³/s
  return airflowCMS / areaM2;
}

// Calculate dynamic pressure (Pa) from velocity (m/s)
function calculateDynamicPressure(velocityMS: number, airDensity: number = 1.2): number {
  return 0.5 * airDensity * Math.pow(velocityMS, 2);
}

// Apply speed ratio fan laws to performance data (used by both VFD and voltage drive)
function applySpeedFanLaws(
  originalData: FanPerformancePoint[],
  speedRatio: number
): FanPerformancePoint[] {
  return originalData.map(point => ({
    airflow: Math.round(point.airflow * speedRatio),
    staticPressure: Math.round(point.staticPressure * Math.pow(speedRatio, 2) * 10) / 10,
    shaftPower: Math.round(point.shaftPower * Math.pow(speedRatio, 3) * 1000) / 1000,
    efficiency: point.efficiency, // Efficiency remains approximately constant
  }));
}

// Apply speed ratio fan laws to noise data (used by both VFD and voltage drive)
function applySpeedNoiseLaws(
  originalNoise: OctaveBandData,
  speedRatio: number
): OctaveBandData {
  // Acoustic fan law: ΔLw = 50 × log₁₀(N₂/N₁) where N is RPM
  const deltaDB = 50 * Math.log10(speedRatio);
  
  const applyDelta = (val: number) => Math.round((val + deltaDB) * 10) / 10;
  
  return {
    hz63: applyDelta(originalNoise.hz63),
    hz125: applyDelta(originalNoise.hz125),
    hz250: applyDelta(originalNoise.hz250),
    hz500: applyDelta(originalNoise.hz500),
    hz1k: applyDelta(originalNoise.hz1k),
    hz2k: applyDelta(originalNoise.hz2k),
    hz4k: applyDelta(originalNoise.hz4k),
    hz8k: applyDelta(originalNoise.hz8k),
    overall: applyDelta(originalNoise.overall),
  };
}

export function FanDetailsPanel({ selection, airflowUnit, pressureUnit, airDensity = 1.2, temperature = 20, altitude = 0, onDutyPointChange }: FanDetailsPanelProps) {
  const { database } = useSupabaseFanDatabase();
  const { isAuthenticated } = useAuth();
  
  // Get fan dimensions for this series using seriesId (UUID)
  const { data: fanDimensionsList = [] } = useFanDimensions(selection.seriesId || null);
  
  // Get flexible dimensions schema and values
  const { data: flexDimensionSchema = [] } = useDimensionSchema(selection.seriesId || null);
  const { data: flexDimensionValues = [] } = useDimensionValues(selection.seriesId || null);
  
  const [activeTab, setActiveTab] = useState('curves');
  const [interactiveMode, setInteractiveMode] = useState(false);
  const [showSystemCurve, setShowSystemCurve] = useState(true);
  const [showFamilyCurve, setShowFamilyCurve] = useState(false);
  const [showStallZone, setShowStallZone] = useState(false);
  const [customDutyPoint, setCustomDutyPoint] = useState<FanPerformancePoint | null>(null);
  const [selectedAngle, setSelectedAngle] = useState<number>(selection.bladeAngle);
  const [hiddenAngles, setHiddenAngles] = useState<Set<number>>(() => new Set());
  
  // Get series info for default noise settings
  const seriesInfo = useMemo(() => 
    database.series.find(s => s.id === selection.seriesId) || 
    database.series.find(s => s.name === selection.series),
    [database.series, selection.seriesId, selection.series]
  );
  
  // Default noise settings from series (or fallback defaults)
  const defaultDirectivityQ = (seriesInfo as any)?.defaultDirectivityQ ?? 2;
  const defaultNoiseDistance = (seriesInfo as any)?.defaultNoiseDistance ?? 0;
  
  // Track if initial noise defaults have been applied
  const [noiseDefaultsApplied, setNoiseDefaultsApplied] = useState(false);
  const [noiseDistance, setNoiseDistance] = useState(0);
  const [directivityQ, setDirectivityQ] = useState(defaultDirectivityQ);
  const [showAddToProject, setShowAddToProject] = useState(false);
  const [pendingPdfDoc, setPendingPdfDoc] = useState<jsPDF | null>(null);
  
  // VFD state (3-phase)
  const [vfdEnabled, setVfdEnabled] = useState(false);
  const [vfdFrequency, setVfdFrequency] = useState<number>(50);
  const baseFrequency = selection.frequency || 50;
  
  // Voltage drive state (1-phase)
  const [voltageDriveEnabled, setVoltageDriveEnabled] = useState(false);
  const [driveVoltage, setDriveVoltage] = useState<number>(220);

  // Reset selected angle, VFD, voltage drive when fan selection or requirements change
  useEffect(() => {
    setSelectedAngle(selection.bladeAngle);
    setCustomDutyPoint(null);
    setVfdEnabled(false);
    setVfdFrequency(selection.frequency || 50);
    setVoltageDriveEnabled(false);
    setDriveVoltage(220);
    setHiddenAngles(new Set());
    // Reset noise defaults applied flag when fan changes
    setNoiseDefaultsApplied(false);
  }, [selection.bladeAngle, selection.fanId, selection.frequency, selection.requiredAirflow, selection.requiredPressure]);
  
  // Apply series default noise settings when seriesInfo loads or changes
  useEffect(() => {
    if (seriesInfo && !noiseDefaultsApplied) {
      const seriesDefaultQ = (seriesInfo as any)?.defaultDirectivityQ ?? 2;
      const seriesDefaultDistance = (seriesInfo as any)?.defaultNoiseDistance ?? 0;
      console.log('Applying series noise defaults:', { seriesDefaultQ, seriesDefaultDistance, seriesName: seriesInfo.name });
      setDirectivityQ(seriesDefaultQ);
      setNoiseDistance(seriesDefaultDistance);
      setNoiseDefaultsApplied(true);
    }
  }, [seriesInfo, noiseDefaultsApplied]);

  // Get full performance data
  const fan = database.fans.find(f => f.id === selection.fanId);
  const bladeConfig = fan?.bladeConfigurations.find(bc => bc.bladeCount === selection.bladeCount);
  const rawPerformanceData = bladeConfig?.performanceData[selectedAngle] || [];
  
  // Get reference poles (base data) - default to 4 if not specified
  const referencePoles = fan?.referencePoles || 4;
  const selectedPoles = selection.motorPole;
  const frequency = selection.frequency || 50;
  
  // Apply fan laws to convert from reference poles to selected poles
  // IMPORTANT: Pole conversion always uses 50Hz since data is stored at 50Hz base
  // Frequency scaling (50Hz to 60Hz) is handled separately in performanceData memo
  const basePerformanceData = useMemo(() => {
    if (rawPerformanceData.length === 0) return [];
    
    // If selected poles matches reference poles, no conversion needed
    if (selectedPoles === referencePoles) {
      return rawPerformanceData;
    }
    
    // Apply fan laws to convert from reference poles to selected poles (using 50Hz base)
    return applyFanLawsForPoles(rawPerformanceData, referencePoles, selectedPoles, 50);
  }, [rawPerformanceData, referencePoles, selectedPoles]);
  
  // Debug log to verify correct data is being loaded
  console.log('FAN DATA DEBUG:', {
    fanId: selection.fanId,
    bladeCount: selection.bladeCount,
    selectedAngle,
    referencePoles,
    selectedPoles,
    configFound: !!bladeConfig,
    rawDataPoints: rawPerformanceData.length,
    convertedDataPoints: basePerformanceData.length,
    firstPoint: basePerformanceData[0],
    lastPoint: basePerformanceData[basePerformanceData.length - 1],
    maxPressure: basePerformanceData.length > 0 ? Math.max(...basePerformanceData.map(d => d.staticPressure)) : 0,
    maxAirflow: basePerformanceData.length > 0 ? Math.max(...basePerformanceData.map(d => d.airflow)) : 0,
  });
  
  // Calculate speed ratio for VFD (3-phase) or voltage drive (1-phase)
  // NOTE: We need motorSpec here, but it's defined later. We'll compute this inside useMemo
  const getSpeedRatio = useCallback((motorPhaseValue: number, nominalVoltageValue: number) => {
    if (motorPhaseValue === 1 && voltageDriveEnabled) {
      return driveVoltage / nominalVoltageValue;
    } else if (motorPhaseValue === 3 && vfdEnabled) {
      return vfdFrequency / baseFrequency;
    }
    return 1;
  }, [voltageDriveEnabled, driveVoltage, vfdEnabled, vfdFrequency, baseFrequency]);

  // Apply frequency scaling and speed control fan laws if enabled (VFD or voltage drive)
  const performanceData = useMemo(() => {
    // First apply frequency scaling if not 50Hz
    let scaledData = basePerformanceData;
    if (frequency !== 50 && basePerformanceData.length > 0) {
      scaledData = applyFrequencyChange(basePerformanceData, selectedPoles, 50, frequency);
    }
    
    // Get motor phase from motorSpec - need to find it here
    const motorSpecLocal = database.motorDatabase.specifications.find(m => {
      const matchesPoleAndRating = m.motorPoles === selection.motorPole && m.ratingKW >= selection.motorRating;
      const requiredFR = selection.fireClass === 'F300' ? 'F300' : selection.fireClass === 'F400' ? 'F400' : '';
      const matchesFireRating = (m.fireRating || '') === requiredFR;
      if (selection.motorBrandId) {
        return matchesPoleAndRating && matchesFireRating && m.brandId === selection.motorBrandId;
      }
      return matchesPoleAndRating && matchesFireRating;
    });
    const phase = (motorSpecLocal as any)?.phase || 3;
    const nomVoltage = motorSpecLocal?.voltage || (phase === 1 ? 220 : 415);
    
    const speedRatio = getSpeedRatio(phase, nomVoltage);
    if (speedRatio === 1) {
      return scaledData;
    }
    return applySpeedFanLaws(scaledData, speedRatio);
  }, [basePerformanceData, frequency, selectedPoles, getSpeedRatio, database.motorDatabase.specifications, selection.motorPole, selection.motorRating, selection.fireClass, selection.motorBrandId]);

  // Base curve data (50Hz / nominal voltage) for comparison when VFD or voltage drive is active
  const baseCurveData = useMemo(() => {
    // Get motor phase from motorSpec
    const motorSpecLocal = database.motorDatabase.specifications.find(m => {
      const matchesPoleAndRating = m.motorPoles === selection.motorPole && m.ratingKW >= selection.motorRating;
      const requiredFR = selection.fireClass === 'F300' ? 'F300' : selection.fireClass === 'F400' ? 'F400' : '';
      const matchesFireRating = (m.fireRating || '') === requiredFR;
      if (selection.motorBrandId) {
        return matchesPoleAndRating && matchesFireRating && m.brandId === selection.motorBrandId;
      }
      return matchesPoleAndRating && matchesFireRating;
    });
    const phase = (motorSpecLocal as any)?.phase || 3;
    const nomVoltage = motorSpecLocal?.voltage || (phase === 1 ? 220 : 415);
    const speedRatio = getSpeedRatio(phase, nomVoltage);
    
    // Only show base curve when VFD/voltage drive is enabled and speed ratio != 1
    if (speedRatio === 1) {
      return undefined;
    }
    
    // Get the base performance data (without VFD/voltage drive applied)
    let baseData = basePerformanceData;
    if (frequency !== 50 && basePerformanceData.length > 0) {
      baseData = applyFrequencyChange(basePerformanceData, selectedPoles, 50, frequency);
    }
    
    // CRITICAL: Trim base data to stable region (same as chart does) before interpolation
    // The chart only displays data from peak pressure onwards - must match for dot alignment
    const sortedFullData = [...baseData].sort((a, b) => a.airflow - b.airflow);
    let peakIndex = 0;
    let peakPressure = -Infinity;
    for (let i = 0; i < sortedFullData.length; i++) {
      if (sortedFullData[i].staticPressure > peakPressure) {
        peakPressure = sortedFullData[i].staticPressure;
        peakIndex = i;
      }
    }
    const stableRegionData = sortedFullData.slice(peakIndex);
    
    // Interpolate the operating point to lie exactly ON the visible stable-region curve
    const opAirflow = selection.operatingPoint.airflow;
    let interpolatedPressure = selection.operatingPoint.staticPressure;
    let interpolatedPower = selection.operatingPoint.shaftPower;
    let interpolatedEfficiency = selection.operatingPoint.efficiency;
    
    // Interpolate using stable region data (what's actually displayed on chart)
    for (let i = 0; i < stableRegionData.length - 1; i++) {
      const p1 = stableRegionData[i];
      const p2 = stableRegionData[i + 1];
      if (opAirflow >= p1.airflow && opAirflow <= p2.airflow) {
        const t = (opAirflow - p1.airflow) / (p2.airflow - p1.airflow);
        interpolatedPressure = p1.staticPressure + t * (p2.staticPressure - p1.staticPressure);
        interpolatedPower = p1.shaftPower + t * (p2.shaftPower - p1.shaftPower);
        interpolatedEfficiency = p1.efficiency + t * (p2.efficiency - p1.efficiency);
        break;
      }
    }
    
    const baseOperatingPoint = {
      airflow: opAirflow,
      staticPressure: interpolatedPressure,
      shaftPower: interpolatedPower,
      efficiency: interpolatedEfficiency,
    };
    
    return {
      label: phase === 1 ? `${nomVoltage}V` : `${baseFrequency}Hz`,
      data: baseData,
      operatingPoint: baseOperatingPoint,
    };
  }, [basePerformanceData, frequency, selectedPoles, getSpeedRatio, database.motorDatabase.specifications, selection.motorPole, selection.motorRating, selection.fireClass, selection.motorBrandId, selection.operatingPoint, baseFrequency]);

  // Adjusted curve label for VFD/voltage drive (only when speed control is active)
  const adjustedCurveData = useMemo(() => {
    // Get motor phase from motorSpec
    const motorSpecLocal = database.motorDatabase.specifications.find(m => {
      const matchesPoleAndRating = m.motorPoles === selection.motorPole && m.ratingKW >= selection.motorRating;
      const requiredFR = selection.fireClass === 'F300' ? 'F300' : selection.fireClass === 'F400' ? 'F400' : '';
      const matchesFireRating = (m.fireRating || '') === requiredFR;
      if (selection.motorBrandId) {
        return matchesPoleAndRating && matchesFireRating && m.brandId === selection.motorBrandId;
      }
      return matchesPoleAndRating && matchesFireRating;
    });
    const phase = (motorSpecLocal as any)?.phase || 3;
    const nomVoltage = motorSpecLocal?.voltage || (phase === 1 ? 220 : 415);
    const speedRatio = getSpeedRatio(phase, nomVoltage);
    
    // Only show adjusted label when VFD/voltage drive is enabled and speed ratio != 1
    if (speedRatio === 1) {
      return undefined;
    }
    
    // Return the adjusted frequency/voltage label
    if (phase === 1 && voltageDriveEnabled) {
      return { label: `${Math.round(driveVoltage)}V` };
    } else if (phase === 3 && vfdEnabled) {
      return { label: `${Math.round(vfdFrequency)}Hz` };
    }
    
    return undefined;
  }, [getSpeedRatio, database.motorDatabase.specifications, selection.motorPole, selection.motorRating, selection.fireClass, selection.motorBrandId, voltageDriveEnabled, driveVoltage, vfdEnabled, vfdFrequency]);

  // Get family curve data - all blade angles for same casing/pole/blade count
  const allFamilyCurveData = useMemo(() => {
    if (!bladeConfig) return undefined;
    
    // Get motor phase from motorSpec
    const motorSpecLocal = database.motorDatabase.specifications.find(m => {
      const matchesPoleAndRating = m.motorPoles === selection.motorPole && m.ratingKW >= selection.motorRating;
      const requiredFR = selection.fireClass === 'F300' ? 'F300' : selection.fireClass === 'F400' ? 'F400' : '';
      const matchesFireRating = (m.fireRating || '') === requiredFR;
      if (selection.motorBrandId) {
        return matchesPoleAndRating && matchesFireRating && m.brandId === selection.motorBrandId;
      }
      return matchesPoleAndRating && matchesFireRating;
    });
    const phase = (motorSpecLocal as any)?.phase || 3;
    const nomVoltage = motorSpecLocal?.voltage || (phase === 1 ? 220 : 415);
    const speedRatio = getSpeedRatio(phase, nomVoltage);
    
    const allAngles: { angle: number; data: FanPerformancePoint[] }[] = [];
    
    bladeConfig.bladeAngles.forEach(angle => {
      let perfData = bladeConfig.performanceData[angle];
      if (perfData && perfData.length > 0) {
        // Apply fan laws for motor poles first (use 50Hz base since data is stored at 50Hz)
        if (selectedPoles !== referencePoles) {
          perfData = applyFanLawsForPoles(perfData, referencePoles, selectedPoles, 50);
        }
        // Apply frequency scaling if not 50Hz
        if (frequency !== 50) {
          perfData = applyFrequencyChange(perfData, selectedPoles, 50, frequency);
        }
        // Then apply speed control laws if enabled
        if (speedRatio !== 1) {
          perfData = applySpeedFanLaws(perfData, speedRatio);
        }
        allAngles.push({ angle, data: perfData });
      }
    });
    
    return allAngles.length > 1 ? allAngles : undefined;
  }, [bladeConfig, selectedPoles, referencePoles, frequency, getSpeedRatio, database.motorDatabase.specifications, selection.motorPole, selection.motorRating, selection.fireClass, selection.motorBrandId]);

  const familyCurveData = useMemo(() => {
    if (!showFamilyCurve || !allFamilyCurveData) return undefined;
    return allFamilyCurveData.filter(curve => !hiddenAngles.has(curve.angle));
  }, [showFamilyCurve, allFamilyCurveData, hiddenAngles]);

  // Apply speed control to noise data
  const adjustedNoiseData = useMemo(() => {
    if (!selection.noiseData) return null;
    
    // Get motor phase from motorSpec
    const motorSpecLocal = database.motorDatabase.specifications.find(m => {
      const matchesPoleAndRating = m.motorPoles === selection.motorPole && m.ratingKW >= selection.motorRating;
      const requiredFR = selection.fireClass === 'F300' ? 'F300' : selection.fireClass === 'F400' ? 'F400' : '';
      const matchesFireRating = (m.fireRating || '') === requiredFR;
      if (selection.motorBrandId) {
        return matchesPoleAndRating && matchesFireRating && m.brandId === selection.motorBrandId;
      }
      return matchesPoleAndRating && matchesFireRating;
    });
    const phase = (motorSpecLocal as any)?.phase || 3;
    const nomVoltage = motorSpecLocal?.voltage || (phase === 1 ? 220 : 415);
    const speedRatio = getSpeedRatio(phase, nomVoltage);
    
    if (speedRatio === 1) {
      return selection.noiseData;
    }
    return applySpeedNoiseLaws(selection.noiseData, speedRatio);
  }, [selection.noiseData, getSpeedRatio, database.motorDatabase.specifications, selection.motorPole, selection.motorRating, selection.fireClass, selection.motorBrandId]);

  // When the user switches blade angle from the family curve, the duty point must
  // move onto the newly selected angle's curve (same airflow, new pressure/power).
  const baseOperatingPoint = useMemo(() => {
    if (selectedAngle === selection.bladeAngle) return selection.operatingPoint;
    const source = [...basePerformanceData].sort((a, b) => a.airflow - b.airflow);
    if (source.length < 2) return selection.operatingPoint;
    const target = selection.operatingPoint.airflow;
    const clamped = Math.min(Math.max(target, source[0].airflow), source[source.length - 1].airflow);
    for (let i = 0; i < source.length - 1; i++) {
      const p1 = source[i];
      const p2 = source[i + 1];
      if (clamped >= p1.airflow && clamped <= p2.airflow) {
        const span = p2.airflow - p1.airflow;
        const t = span === 0 ? 0 : (clamped - p1.airflow) / span;
        return {
          airflow: Math.round(clamped),
          staticPressure: Math.round((p1.staticPressure + t * (p2.staticPressure - p1.staticPressure)) * 10) / 10,
          shaftPower: Math.round((p1.shaftPower + t * (p2.shaftPower - p1.shaftPower)) * 1000) / 1000,
          efficiency: Math.round((p1.efficiency + t * (p2.efficiency - p1.efficiency)) * 10) / 10,
        };
      }
    }
    return selection.operatingPoint;
  }, [selectedAngle, selection.bladeAngle, selection.operatingPoint, basePerformanceData]);

  const adjustedOperatingPoint = useMemo(() => {
    // Get motor phase from motorSpec
    const motorSpecLocal = database.motorDatabase.specifications.find(m => {
      const matchesPoleAndRating = m.motorPoles === selection.motorPole && m.ratingKW >= selection.motorRating;
      const requiredFR = selection.fireClass === 'F300' ? 'F300' : selection.fireClass === 'F400' ? 'F400' : '';
      const matchesFireRating = (m.fireRating || '') === requiredFR;
      if (selection.motorBrandId) {
        return matchesPoleAndRating && matchesFireRating && m.brandId === selection.motorBrandId;
      }
      return matchesPoleAndRating && matchesFireRating;
    });
    const phase = (motorSpecLocal as any)?.phase || 3;
    const nomVoltage = motorSpecLocal?.voltage || (phase === 1 ? 220 : 415);
    const speedRatio = getSpeedRatio(phase, nomVoltage);
    
    if (speedRatio === 1) {
      return baseOperatingPoint;
    }
    return {
      airflow: Math.round(baseOperatingPoint.airflow * speedRatio),
      staticPressure: Math.round(baseOperatingPoint.staticPressure * Math.pow(speedRatio, 2) * 10) / 10,
      shaftPower: Math.round(baseOperatingPoint.shaftPower * Math.pow(speedRatio, 3) * 1000) / 1000,
      efficiency: baseOperatingPoint.efficiency,
    };
  }, [baseOperatingPoint, getSpeedRatio, database.motorDatabase.specifications, selection.motorPole, selection.motorRating, selection.fireClass, selection.motorBrandId]);
  
  const currentOperatingPoint = customDutyPoint || adjustedOperatingPoint;

  // Convert values to display units
  const displayAirflow = currentOperatingPoint.airflow * AIRFLOW_UNITS[airflowUnit].factor;
  const displayPressure = currentOperatingPoint.staticPressure * PRESSURE_UNITS[pressureUnit].factor;

  // Calculate additional performance values - use VFD frequency for RPM
  const effectiveFrequency = vfdEnabled ? vfdFrequency : (selection.frequency || 50);
  const calculatedRPM = calculateRPM(selection.motorPole, effectiveFrequency);
  const outletVelocity = calculateOutletVelocity(currentOperatingPoint.airflow, selection.diameter);
  const dynamicPressure = calculateDynamicPressure(outletVelocity);
  const totalPressure = currentOperatingPoint.staticPressure + dynamicPressure;
  const displayTotalPressure = totalPressure * PRESSURE_UNITS[pressureUnit].factor;
  const displayDynamicPressure = dynamicPressure * PRESSURE_UNITS[pressureUnit].factor;

  // Get weights
  const casingWeight = database.weightDatabase.casingWeights.find(w => w.diameter === selection.diameter)?.weight || 0;
  const impellerWeight = database.weightDatabase.impellerWeights.find(
    w => w.diameter === selection.diameter && w.bladeCount === selection.bladeCount
  )?.weight || 0;
  
  // Get motor specification - prefer selected brand if available and matching fire class
  // Fire class matching: Class F (empty) -> no fire rating, F300 -> F300, F400 -> F400
  const getMotorFireRating = (fireClass: string) => {
    if (fireClass === 'F300') return 'F300';
    if (fireClass === 'F400') return 'F400';
    return ''; // Class F has no fire rating
  };
  const requiredFireRating = getMotorFireRating(selection.fireClass);
  
  const motorSpec = database.motorDatabase.specifications.find(m => {
    // Check for dual-speed motors
    const isDualSpeedMotor = (m as any).is_dual_speed;
    const secondaryPoles = (m as any).secondary_poles;
    const secondaryRatingKW = (m as any).secondary_rating_kw;
    
    let matchesPoleAndRating = false;
    
    if (isDualSpeedMotor && secondaryPoles) {
      // Dual-speed motor: check if primary pole matches AND primary rating meets requirement
      matchesPoleAndRating = m.motorPoles === selection.motorPole && m.ratingKW >= selection.motorRating;
    } else {
      // Single-speed motor: standard matching
      matchesPoleAndRating = m.motorPoles === selection.motorPole && m.ratingKW >= selection.motorRating;
    }
    
    // Match fire rating: empty string matches motors with no fire rating
    const matchesFireRating = (m.fireRating || '') === requiredFireRating;
    if (selection.motorBrandId) {
      return matchesPoleAndRating && matchesFireRating && m.brandId === selection.motorBrandId;
    }
    return matchesPoleAndRating && matchesFireRating;
  });
  const motorWeight = motorSpec?.motorWeight || 0;
  const motorBrand = database.motorDatabase.brands.find(b => b.id === motorSpec?.brandId);
  
  // Determine motor phase (1 = single-phase, 3 = three-phase)
  const motorPhase = (motorSpec as any)?.phase || 3;
  const nominalVoltage = motorSpec?.voltage || (motorPhase === 1 ? 220 : 415);

  // Selection object used for exports (datasheet/Excel) so that the revised
  // duty point (interactive selection) and blade angle are reflected.
  // The PDF re-applies speed-control fan laws internally, so the custom point
  // (which is already speed-adjusted) is converted back to base speed here.
  const exportSelection = useMemo(() => {
    if (!customDutyPoint && selectedAngle === selection.bladeAngle) return selection;
    let basePoint = baseOperatingPoint;
    if (customDutyPoint) {
      const ratio = getSpeedRatio(motorPhase, nominalVoltage);
      basePoint = ratio === 1
        ? customDutyPoint
        : {
            airflow: Math.round(customDutyPoint.airflow / ratio),
            staticPressure: Math.round((customDutyPoint.staticPressure / Math.pow(ratio, 2)) * 10) / 10,
            shaftPower: Math.round((customDutyPoint.shaftPower / Math.pow(ratio, 3)) * 1000) / 1000,
            efficiency: customDutyPoint.efficiency,
          };
    }
    return {
      ...selection,
      bladeAngle: selectedAngle,
      nomenclature: generateNomenclature(
        selection.motorPole,
        selection.diameter,
        selection.bladeCount,
        selectedAngle,
        selection.motorRating,
        selection.fireClass,
        selection.nomenclatureTemplate,
        selection.series,
        selection.accessory,
        selection.atexRating,
      ),
      operatingPoint: basePoint,
    };
  }, [selection, baseOperatingPoint, customDutyPoint, selectedAngle, getSpeedRatio, motorPhase, nominalVoltage]);

  
  // Use motor spec RPM if available, otherwise fall back to calculated RPM
  // For VFD mode (3-phase), scale the motor RPM proportionally
  // For voltage drive (1-phase), RPM scales roughly with voltage squared (simplified)
  const baseMotorRPM = motorSpec?.rpm || calculatedRPM;
  const fanRPM = useMemo(() => {
    if (motorPhase === 1 && voltageDriveEnabled) {
      // Voltage drive: speed roughly proportional to voltage ratio (simplified model)
      const voltageRatio = driveVoltage / nominalVoltage;
      return Math.round(baseMotorRPM * voltageRatio);
    } else if (motorPhase === 3 && vfdEnabled) {
      // VFD: speed proportional to frequency ratio
      return Math.round(baseMotorRPM * (vfdFrequency / (selection.frequency || 50)));
    }
    return baseMotorRPM;
  }, [motorPhase, voltageDriveEnabled, vfdEnabled, driveVoltage, nominalVoltage, baseMotorRPM, vfdFrequency, selection.frequency]);

  // Calculate VFD Required Frequency to achieve the operating point
  // Based on fan law: Q ∝ N, P ∝ N², W ∝ N³
  // Find the max pressure at base frequency from performance data, then calculate required frequency
  const vfdRequiredFrequency = useMemo(() => {
    if (performanceData.length === 0) return null;
    
    // Find the maximum airflow point at full speed (which corresponds to operating near max capacity)
    const maxAirflowPoint = performanceData.reduce((max, p) => p.airflow > max.airflow ? p : max, performanceData[0]);
    
    // Get the base frequency (selection frequency)
    const baseFreq = selection.frequency || 50;
    
    // Find where the current operating point's airflow would intersect with the base curve
    // Operating point airflow at base speed = baseOperatingPoint.airflow
    // Required frequency = baseFreq × (operatingAirflow / maxAirflow at that pressure level)
    
    // For the operating point, we need to find what frequency would give us that exact duty point
    // Using fan law: Q1/Q2 = N1/N2 = f1/f2
    // Find the closest point on the base curve at full speed with similar pressure ratio
    
    // The operating point is where system curve meets fan curve
    // Required Hz = baseFreq × sqrt(operatingPressure / maxPressure_at_operatingAirflow)
    
    // Find the pressure on the full-speed curve at the operating airflow
    let fullSpeedPressureAtOperatingAirflow: number | null = null;
    const opAirflow = baseOperatingPoint.airflow;
    
    // Interpolate to find pressure at operating airflow on the base curve
    for (let i = 0; i < performanceData.length - 1; i++) {
      const p1 = performanceData[i];
      const p2 = performanceData[i + 1];
      if ((p1.airflow <= opAirflow && p2.airflow >= opAirflow) || 
          (p1.airflow >= opAirflow && p2.airflow <= opAirflow)) {
        const t = (opAirflow - p1.airflow) / (p2.airflow - p1.airflow);
        fullSpeedPressureAtOperatingAirflow = p1.staticPressure + t * (p2.staticPressure - p1.staticPressure);
        break;
      }
    }
    
    // If operating airflow is beyond the curve range, use the max airflow point
    if (fullSpeedPressureAtOperatingAirflow === null) {
      // Operating point is at or near max capacity
      fullSpeedPressureAtOperatingAirflow = performanceData[performanceData.length - 1].staticPressure;
    }
    
    // Calculate required frequency using fan law: P ∝ N² (and N ∝ f)
    // P_op / P_full = (f_req / f_base)²
    // f_req = f_base × sqrt(P_op / P_full)
    const pressureRatio = baseOperatingPoint.staticPressure / fullSpeedPressureAtOperatingAirflow;
    
    // Only show if operating below full speed (ratio < 1)
    if (pressureRatio >= 0.98) {
      return null; // Operating at or near full speed, no VFD reduction needed
    }
    
    const requiredFreq = baseFreq * Math.sqrt(pressureRatio);
    
    // Clamp to reasonable VFD range (20-60 Hz)
    return Math.max(20, Math.min(60, Math.round(requiredFreq)));
  }, [performanceData, baseOperatingPoint, selection.frequency]);
  
  const totalWeight = casingWeight + impellerWeight + motorWeight;

  const handleDutyPointChange = useCallback((point: { airflow: number; pressure: number }) => {
    if (performanceData.length === 0) return;

    const sortedData = [...performanceData].sort((a, b) => a.airflow - b.airflow);
    
    let interpolatedPressure = point.pressure;
    let interpolatedPower = 0;
    let interpolatedEfficiency = 0;

    for (let i = 0; i < sortedData.length - 1; i++) {
      if (point.airflow >= sortedData[i].airflow && point.airflow <= sortedData[i + 1].airflow) {
        const ratio = (point.airflow - sortedData[i].airflow) / 
                      (sortedData[i + 1].airflow - sortedData[i].airflow);
        interpolatedPressure = sortedData[i].staticPressure + 
                               ratio * (sortedData[i + 1].staticPressure - sortedData[i].staticPressure);
        interpolatedPower = sortedData[i].shaftPower + 
                           ratio * (sortedData[i + 1].shaftPower - sortedData[i].shaftPower);
        interpolatedEfficiency = sortedData[i].efficiency + 
                                ratio * (sortedData[i + 1].efficiency - sortedData[i].efficiency);
        break;
      }
    }

    const roundedAirflow = Math.round(point.airflow);
    const roundedPressure = Math.round(interpolatedPressure * 10) / 10;
    const roundedPower = Math.round(interpolatedPower * 1000) / 1000;
    const newPoint: FanPerformancePoint = {
      airflow: roundedAirflow,
      staticPressure: roundedPressure,
      shaftPower: roundedPower,
      efficiency: interpolatedEfficiency > 0
        ? Math.round(interpolatedEfficiency * 10) / 10
        : (calculateTotalEfficiency(roundedAirflow, roundedPressure, roundedPower, selection.diameter, airDensity) ?? 0),
    };

    setCustomDutyPoint(newPoint);
    onDutyPointChange?.(newPoint.airflow, newPoint.staticPressure);
  }, [performanceData, onDutyPointChange, selection.diameter, airDensity]);

  const resetDutyPoint = () => {
    setCustomDutyPoint(null);
    setSelectedAngle(selection.bladeAngle);
    setVfdEnabled(false);
    setVfdFrequency(selection.frequency || 50);
  };

  const handleAngleSelect = useCallback((angle: number, clickedPoint?: { airflow: number; pressure: number }) => {
    setSelectedAngle(angle);
    
    // If a clicked point is provided, update the duty point on the new curve
    // Otherwise reset to let the default operating point be used
    if (clickedPoint) {
      // Convert from display units to base units (CMH, Pa) for storage
      const airflowCMH = convertAirflow(clickedPoint.airflow, airflowUnit, 'CMH');
      const pressurePa = convertPressure(clickedPoint.pressure, pressureUnit, 'Pa');
      
      const targetCurve = allFamilyCurveData?.find(curve => curve.angle === angle)?.data;
      const sortedTarget = targetCurve ? [...targetCurve].sort((a, b) => a.airflow - b.airflow) : [];
      let shaftPower = 0;
      let efficiency = 0;
      for (let i = 0; i < sortedTarget.length - 1; i++) {
        const p1 = sortedTarget[i];
        const p2 = sortedTarget[i + 1];
        if (airflowCMH >= p1.airflow && airflowCMH <= p2.airflow) {
          const span = p2.airflow - p1.airflow;
          const ratio = span === 0 ? 0 : (airflowCMH - p1.airflow) / span;
          shaftPower = p1.shaftPower + ratio * (p2.shaftPower - p1.shaftPower);
          efficiency = p1.efficiency + ratio * (p2.efficiency - p1.efficiency);
          break;
        }
      }

      const roundedAirflow = Math.round(airflowCMH);
      const roundedPressure = Math.round(pressurePa * 10) / 10;
      const roundedPower = Math.round(shaftPower * 1000) / 1000;
      const newPoint: FanPerformancePoint = {
        airflow: roundedAirflow,
        staticPressure: roundedPressure,
        shaftPower: roundedPower,
        efficiency: efficiency > 0
          ? Math.round(efficiency * 10) / 10
          : (calculateTotalEfficiency(roundedAirflow, roundedPressure, roundedPower, selection.diameter, airDensity) ?? 0),
      };
      setCustomDutyPoint(newPoint);
      onDutyPointChange?.(newPoint.airflow, newPoint.staticPressure);
    } else {
      setCustomDutyPoint(null);
    }
  }, [airflowUnit, pressureUnit, allFamilyCurveData, onDutyPointChange, selection.diameter, airDensity]);

  // Re-interpolate custom duty point when performanceData changes (e.g., angle switch)
  // This ensures power/efficiency are correctly calculated on the new curve
  useEffect(() => {
    if (!customDutyPoint || performanceData.length === 0) return;
    
    // Power marks a completed interpolation; efficiency can legitimately be zero at shut-off.
    if (customDutyPoint.shaftPower > 0) return;
    
    const sortedData = [...performanceData].sort((a, b) => a.airflow - b.airflow);
    const targetAirflow = customDutyPoint.airflow;
    
    for (let i = 0; i < sortedData.length - 1; i++) {
      if (targetAirflow >= sortedData[i].airflow && targetAirflow <= sortedData[i + 1].airflow) {
        const ratio = (targetAirflow - sortedData[i].airflow) / 
                      (sortedData[i + 1].airflow - sortedData[i].airflow);
        const interpolatedPressure = sortedData[i].staticPressure + 
                               ratio * (sortedData[i + 1].staticPressure - sortedData[i].staticPressure);
        const interpolatedPower = sortedData[i].shaftPower + 
                           ratio * (sortedData[i + 1].shaftPower - sortedData[i].shaftPower);
        const interpolatedEfficiency = sortedData[i].efficiency + 
                                ratio * (sortedData[i + 1].efficiency - sortedData[i].efficiency);
        
        const roundedAirflow = Math.round(targetAirflow);
        const roundedPressure = Math.round(interpolatedPressure * 10) / 10;
        const roundedPower = Math.round(interpolatedPower * 1000) / 1000;
        setCustomDutyPoint({
          airflow: roundedAirflow,
          staticPressure: roundedPressure,
          shaftPower: roundedPower,
          efficiency: interpolatedEfficiency > 0
            ? Math.round(interpolatedEfficiency * 10) / 10
            : (calculateTotalEfficiency(roundedAirflow, roundedPressure, roundedPower, selection.diameter, airDensity) ?? 0),
        });
        break;
      }
    }
  }, [performanceData, customDutyPoint, selection.diameter, airDensity]);

  // Get dimension for this fan size
  const fanDimensions = fanDimensionsList.find(d => d.size === selection.diameter);
  
  // Get flexible dimension for this fan size
  const flexDimensionValue = flexDimensionValues.find(d => d.size === selection.diameter);

  // Refs for capturing charts as images
  const pressureChartRef = useRef<HTMLDivElement>(null);
  const powerChartRef = useRef<HTMLDivElement>(null);
  const efficiencyChartRef = useRef<HTMLDivElement>(null);

  // Generate PDF datasheet
  const generateDatasheet = async () => {
    try {
      // Get series info for drawing URL - use seriesId (UUID) first, then fall back to name
      const seriesInfo = database.series.find(s => s.id === selection.seriesId) || 
                        database.series.find(s => s.name === selection.series);
      
      console.log('PDF Generation - Series Info:', {
        seriesId: selection.seriesId,
        seriesName: selection.series,
        seriesInfoFound: !!seriesInfo,
        iomUrl: (seriesInfo as any)?.iomUrl,
        catalogueUrl: (seriesInfo as any)?.catalogueUrl,
        stallAirflowMinPercent: (seriesInfo as any)?.stallAirflowMinPercent,
        stallAirflowMaxPercent: (seriesInfo as any)?.stallAirflowMaxPercent,
        soundOutletReduction: (seriesInfo as any)?.soundOutletReduction,
      });
      
      // Capture all charts as images for exact reproduction in PDF
      const [chartImage, powerChartImage, efficiencyChartImage] = await Promise.all([
        captureChartAsImage(pressureChartRef.current),
        captureChartAsImage(powerChartRef.current),
        captureChartAsImage(efficiencyChartRef.current),
      ]);

      await generateEnhancedDatasheet({
        selection: exportSelection,
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
        // Pass flexible dimensions for dynamic table
        flexibleDimensionSchema: flexDimensionSchema.length > 0 ? flexDimensionSchema.map(s => ({
          param_key: s.param_key,
          param_label: s.param_label,
          param_type: s.param_type,
          display_order: s.display_order,
        })) : undefined,
        flexibleDimensionValue: flexDimensionValue ? {
          size: flexDimensionValue.size,
          values: flexDimensionValue.values,
        } : undefined,
        airDensity,
        temperature,
        altitude,
        noiseDistance,
        noiseDirectivityQ: directivityQ,
        seriesImageUrl: seriesInfo?.imageUrl,
        seriesDrawingUrl: (seriesInfo as any)?.drawingUrl,
        datasheetDescription: (seriesInfo as any)?.datasheetDescription,
        showOctaveBands: (seriesInfo as any)?.showOctaveBands ?? true,
        amcaCertified: (seriesInfo as any)?.amcaCertified ?? false,
        fireRating: (seriesInfo as any)?.fireRating,
        amcaLogoUrl: (seriesInfo as any)?.amcaLogoUrl,
        fireRatingLogoUrl: (seriesInfo as any)?.fireRatingLogoUrl,
        chartImage, // Pass captured pressure chart image for exact reproduction
        powerChartImage, // Pass captured power chart image
        efficiencyChartImage, // Pass captured efficiency chart image
        // Speed control settings for PDF
        vfdEnabled,
        vfdFrequency,
        voltageDriveEnabled,
        driveVoltage,
        nominalVoltage,
        motorPhase,
        // Adjusted noise data after speed control
        adjustedNoiseData: adjustedNoiseData ? {
          hz63: adjustedNoiseData.hz63,
          hz125: adjustedNoiseData.hz125,
          hz250: adjustedNoiseData.hz250,
          hz500: adjustedNoiseData.hz500,
          hz1k: adjustedNoiseData.hz1k,
          hz2k: adjustedNoiseData.hz2k,
          hz4k: adjustedNoiseData.hz4k,
          hz8k: adjustedNoiseData.hz8k,
          overall: adjustedNoiseData.overall,
        } : undefined,
        // Family curve display
        showFamilyCurve,
        familyCurveData: showFamilyCurve && familyCurveData ? familyCurveData.map(curve => ({
          angle: curve.angle,
          data: curve.data.map(p => ({
            airflow: p.airflow,
            staticPressure: p.staticPressure,
            shaftPower: p.shaftPower,
            efficiency: p.efficiency,
          }))
        })) : undefined,
        motorSpec: motorSpec ? {
          brandName: motorBrand?.name,
          motorFrame: motorSpec.motorFrame,
          ratedCurrent: motorSpec.ratedCurrent,
          fullLoadCurrent: motorSpec.fullLoadCurrent,
          startingCurrent: motorSpec.startingCurrent,
          voltage: motorSpec.voltage,
          frequency: motorSpec.frequency,
          ipRating: motorSpec.ipRating,
          insulationClass: motorSpec.insulationClass,
          efficiencyClass: motorSpec.efficiencyClass,
          motorWeight: motorSpec.motorWeight,
          fireRating: motorSpec.fireRating,
        } : undefined,
        // New datasheet features
        iomUrl: (seriesInfo as any)?.iomUrl,
        soundOutletReduction: (seriesInfo as any)?.soundOutletReduction ?? 0,
        stallAirflowMinPercent: (seriesInfo as any)?.stallAirflowMinPercent ?? 15,
        stallAirflowMaxPercent: (seriesInfo as any)?.stallAirflowMaxPercent ?? 95,
        compatibleAccessories: (seriesInfo as any)?.compatibleAccessories || [],
        // Base curve data for VFD/voltage drive comparison
        baseCurveData: baseCurveData ? {
          label: baseCurveData.label,
          performanceData: baseCurveData.data.map(p => ({
            airflow: p.airflow,
            staticPressure: p.staticPressure,
            shaftPower: p.shaftPower,
            efficiency: p.efficiency,
          })),
          operatingPoint: baseCurveData.operatingPoint ? {
            airflow: baseCurveData.operatingPoint.airflow,
            staticPressure: baseCurveData.operatingPoint.staticPressure,
            shaftPower: baseCurveData.operatingPoint.shaftPower,
            efficiency: baseCurveData.operatingPoint.efficiency,
          } : undefined,
        } : undefined,
      });
      toast.success('Datasheet downloaded successfully');
    } catch (error) {
      console.error('Error generating PDF:', error);
      toast.error('Failed to generate datasheet');
    }
  };

  // Generate PDF for project (without saving, returns the document)
  const generatePdfForProject = async (): Promise<jsPDF | null> => {
    try {
      const seriesInfo = database.series.find(s => s.id === selection.seriesId) || 
                        database.series.find(s => s.name === selection.series);
      
      const [chartImage, powerChartImage, efficiencyChartImage] = await Promise.all([
        captureChartAsImage(pressureChartRef.current),
        captureChartAsImage(powerChartRef.current),
        captureChartAsImage(efficiencyChartRef.current),
      ]);

      const pdfDoc = await generateEnhancedDatasheet({
        selection: exportSelection,
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
        flexibleDimensionSchema: flexDimensionSchema.length > 0 ? flexDimensionSchema.map(s => ({
          param_key: s.param_key,
          param_label: s.param_label,
          param_type: s.param_type,
          display_order: s.display_order,
        })) : undefined,
        flexibleDimensionValue: flexDimensionValue ? {
          size: flexDimensionValue.size,
          values: flexDimensionValue.values,
        } : undefined,
        airDensity,
        temperature,
        altitude,
        noiseDistance,
        noiseDirectivityQ: directivityQ,
        seriesImageUrl: seriesInfo?.imageUrl,
        seriesDrawingUrl: (seriesInfo as any)?.drawingUrl,
        datasheetDescription: (seriesInfo as any)?.datasheetDescription,
        showOctaveBands: (seriesInfo as any)?.showOctaveBands ?? true,
        amcaCertified: (seriesInfo as any)?.amcaCertified ?? false,
        fireRating: (seriesInfo as any)?.fireRating,
        amcaLogoUrl: (seriesInfo as any)?.amcaLogoUrl,
        fireRatingLogoUrl: (seriesInfo as any)?.fireRatingLogoUrl,
        chartImage,
        powerChartImage,
        efficiencyChartImage,
        vfdEnabled,
        vfdFrequency,
        voltageDriveEnabled,
        driveVoltage,
        nominalVoltage,
        motorPhase,
        adjustedNoiseData: adjustedNoiseData ? {
          hz63: adjustedNoiseData.hz63,
          hz125: adjustedNoiseData.hz125,
          hz250: adjustedNoiseData.hz250,
          hz500: adjustedNoiseData.hz500,
          hz1k: adjustedNoiseData.hz1k,
          hz2k: adjustedNoiseData.hz2k,
          hz4k: adjustedNoiseData.hz4k,
          hz8k: adjustedNoiseData.hz8k,
          overall: adjustedNoiseData.overall,
        } : undefined,
        showFamilyCurve,
        familyCurveData: showFamilyCurve && familyCurveData ? familyCurveData.map(curve => ({
          angle: curve.angle,
          data: curve.data.map(p => ({
            airflow: p.airflow,
            staticPressure: p.staticPressure,
            shaftPower: p.shaftPower,
            efficiency: p.efficiency,
          }))
        })) : undefined,
        motorSpec: motorSpec ? {
          brandName: motorBrand?.name,
          motorFrame: motorSpec.motorFrame,
          ratedCurrent: motorSpec.ratedCurrent,
          fullLoadCurrent: motorSpec.fullLoadCurrent,
          startingCurrent: motorSpec.startingCurrent,
          voltage: motorSpec.voltage,
          frequency: motorSpec.frequency,
          ipRating: motorSpec.ipRating,
          insulationClass: motorSpec.insulationClass,
          efficiencyClass: motorSpec.efficiencyClass,
          motorWeight: motorSpec.motorWeight,
          fireRating: motorSpec.fireRating,
        } : undefined,
        iomUrl: (seriesInfo as any)?.iomUrl,
        soundOutletReduction: (seriesInfo as any)?.soundOutletReduction ?? 0,
        stallAirflowMinPercent: (seriesInfo as any)?.stallAirflowMinPercent ?? 15,
        stallAirflowMaxPercent: (seriesInfo as any)?.stallAirflowMaxPercent ?? 95,
        compatibleAccessories: (seriesInfo as any)?.compatibleAccessories || [],
        baseCurveData: baseCurveData ? {
          label: baseCurveData.label,
          performanceData: baseCurveData.data.map(p => ({
            airflow: p.airflow,
            staticPressure: p.staticPressure,
            shaftPower: p.shaftPower,
            efficiency: p.efficiency,
          })),
          operatingPoint: baseCurveData.operatingPoint ? {
            airflow: baseCurveData.operatingPoint.airflow,
            staticPressure: baseCurveData.operatingPoint.staticPressure,
            shaftPower: baseCurveData.operatingPoint.shaftPower,
            efficiency: baseCurveData.operatingPoint.efficiency,
          } : undefined,
        } : undefined,
        skipSave: true, // Don't save - we'll store it
      });
      
      return pdfDoc;
    } catch (error) {
      console.error('Error generating PDF for project:', error);
      return null;
    }
  };

  // Handle Add to Project button click - open dialog immediately, PDF will be generated on save
  const handleAddToProjectClick = async () => {
    // Open dialog immediately - no waiting for PDF generation
    setPendingPdfDoc(null); // Will generate on save
    setShowAddToProject(true);
  };
  
  // Get the PDF generator function for lazy generation
  const getPdfGenerator = () => generatePdfForProject;

  // Export fan data as Excel
  const exportData = () => {
    try {
      // Build dimensions array from flexible dimensions
      const dimensionsArray: { label: string; value: string | number }[] = [];
      
      // Find matching dimension values for this fan size
      const matchingDimValues = flexDimensionValues.find(v => v.size === selection.diameter);
      
      if (matchingDimValues && flexDimensionSchema.length > 0) {
        flexDimensionSchema
          .sort((a, b) => a.display_order - b.display_order)
          .forEach(param => {
            const value = matchingDimValues.values[param.param_key];
            if (value !== undefined && value !== null && value !== '') {
              dimensionsArray.push({
                label: param.param_label,
                value: value,
              });
            }
          });
      }

      // Also add legacy dimensions if available
      const legacyDim = fanDimensionsList.find(d => d.size === selection.diameter);
      if (legacyDim) {
        if (legacyDim.phiD) dimensionsArray.push({ label: 'ØD', value: legacyDim.phiD });
        if (legacyDim.phiD1) dimensionsArray.push({ label: 'ØD1', value: legacyDim.phiD1 });
        if (legacyDim.phiD2) dimensionsArray.push({ label: 'ØD2', value: legacyDim.phiD2 });
        if (legacyDim.L) dimensionsArray.push({ label: 'L', value: legacyDim.L });
        if (legacyDim.E) dimensionsArray.push({ label: 'E', value: legacyDim.E });
        if (legacyDim.F) dimensionsArray.push({ label: 'F', value: legacyDim.F });
        if (legacyDim.H) dimensionsArray.push({ label: 'H', value: legacyDim.H });
        if (legacyDim.K) dimensionsArray.push({ label: 'K', value: legacyDim.K });
      }

      // Get series description
      const seriesDescription = selection.series;

      generateExcelDatasheet({
        selection: exportSelection,
        performanceData,
        operatingPoint: currentOperatingPoint,
        displayAirflow,
        displayPressure,
        displayDynamicPressure,
        displayTotalPressure,
        outletVelocity,
        fanRPM,
        airflowUnit,
        pressureUnit,
        airDensity,
        temperature,
        altitude,
        motorDetails: motorSpec ? {
          brandName: motorBrand?.name,
          frame: motorSpec.motorFrame,
          ratedCurrent: motorSpec.ratedCurrent,
          fullLoadCurrent: motorSpec.fullLoadCurrent,
          startingCurrent: motorSpec.startingCurrent,
          voltage: motorSpec.voltage,
          frequency: motorSpec.frequency,
          ipRating: motorSpec.ipRating,
          insulationClass: motorSpec.insulationClass,
          efficiencyClass: motorSpec.efficiencyClass,
          motorWeight: motorSpec.motorWeight,
          fireRating: motorSpec.fireRating,
        } : undefined,
        weights: {
          casing: casingWeight,
          impeller: impellerWeight,
          motor: motorWeight,
          total: totalWeight,
        },
        dimensions: dimensionsArray.length > 0 ? dimensionsArray : undefined,
        noiseData: adjustedNoiseData || undefined,
        seriesDescription,
      });
      
      toast.success('Excel datasheet exported successfully');
    } catch (error) {
      console.error('Error exporting data:', error);
      toast.error('Failed to export data');
    }
  };

  return (
    <div className="kinair-card p-6 animate-slide-up">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 bg-gradient-primary rounded-xl flex items-center justify-center">
            <Wind className="w-8 h-8 text-primary-foreground" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-foreground">
              {exportSelection.nomenclature}
            </h2>
            <p className="text-muted-foreground">
              {generateDynamicDescription(selection.nomenclatureTemplate, {
                diameter: selection.diameter,
                bladeCount: selection.bladeCount,
                bladeAngle: selectedAngle,
                motorPole: selection.motorPole,
                motorRating: selection.motorRating,
                series: selection.series,
                fireClass: selection.fireClass,
              }) || selection.series}
            </p>
          </div>
        </div>
        
        <div className="flex gap-2">
          {isAuthenticated && (
            <Button 
              variant="outline" 
              size="sm" 
              onClick={handleAddToProjectClick}
            >
              <FolderPlus className="w-4 h-4" />
              Add to Project
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <FileText className="w-4 h-4 mr-1" />
                Datasheet
                <ChevronDown className="w-3 h-3 ml-1" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={generateDatasheet}>
                <FileText className="w-4 h-4 mr-2" />
                Full Datasheet
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={async () => {
                try {
                  const seriesInfo = database.series.find(s => s.id === selection.seriesId) || 
                                    database.series.find(s => s.name === selection.series);
                  await generateDrawingOnlyPDF({
                    selection,
                    database,
                    seriesDrawingUrl: (seriesInfo as any)?.drawingUrl,
                    flexibleDimensionSchema: flexDimensionSchema.length > 0 ? flexDimensionSchema.map(s => ({
                      param_key: s.param_key,
                      param_label: s.param_label,
                      param_type: s.param_type,
                      display_order: s.display_order,
                    })) : undefined,
                    flexibleDimensionValue: flexDimensionValue ? {
                      size: flexDimensionValue.size,
                      values: flexDimensionValue.values,
                    } : undefined,
                    fanDimensions,
                  });
                  toast.success('Drawing PDF downloaded');
                } catch (error) {
                  toast.error('Failed to generate drawing PDF');
                }
              }}>
                <Ruler className="w-4 h-4 mr-2" />
                Technical Drawing Only
              </DropdownMenuItem>
              <DropdownMenuItem onClick={async () => {
                try {
                  await generateSoundDataOnlyPDF({
                    selection,
                    database,
                    noiseDistance,
                  });
                  toast.success('Sound data PDF downloaded');
                } catch (error) {
                  toast.error('No noise data available');
                }
              }}>
                <Volume2 className="w-4 h-4 mr-2" />
                Sound Data Only
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button variant="kinair" size="sm" onClick={exportData}>
            <Download className="w-4 h-4" />
            Export
          </Button>
        </div>
      </div>

      {/* Operating Point Summary - Row 1 */}
      <div className="grid grid-cols-5 gap-3 mb-3">
        <div className="kinair-stat">
          <div className="kinair-stat-value text-sm">{displayAirflow < 10 ? displayAirflow.toFixed(2) : displayAirflow < 100 ? displayAirflow.toFixed(1) : Math.round(displayAirflow).toLocaleString()}</div>
          <div className="kinair-stat-label text-xs">Airflow ({airflowUnit})</div>
        </div>
        <div className="kinair-stat">
          <div className="kinair-stat-value text-sm">{displayPressure < 10 ? displayPressure.toFixed(2) : displayPressure < 100 ? displayPressure.toFixed(1) : Math.round(displayPressure).toLocaleString()}</div>
          <div className="kinair-stat-label text-xs">Static Pr ({pressureUnit})</div>
        </div>
        <div className="kinair-stat">
          <div className="kinair-stat-value text-sm">{displayDynamicPressure < 10 ? displayDynamicPressure.toFixed(2) : displayDynamicPressure.toFixed(1)}</div>
          <div className="kinair-stat-label text-xs">Dynamic Pr ({pressureUnit})</div>
        </div>
        <div className="kinair-stat">
          <div className="kinair-stat-value text-sm">{displayTotalPressure < 10 ? displayTotalPressure.toFixed(2) : displayTotalPressure.toFixed(1)}</div>
          <div className="kinair-stat-label text-xs">Total Pr ({pressureUnit})</div>
        </div>
        <div className="kinair-stat">
          <div className="kinair-stat-value text-sm">{outletVelocity.toFixed(1)}</div>
          <div className="kinair-stat-label text-xs">Velocity (m/s)</div>
        </div>
      </div>

      {/* Operating Point Summary - Row 2 */}
      <div className="grid grid-cols-5 gap-3 mb-6">
        <div className="kinair-stat">
          <div className="kinair-stat-value text-sm">{formatPower(currentOperatingPoint.shaftPower)}</div>
          <div className="kinair-stat-label text-xs">Power (kW)</div>
        </div>
        <div className="kinair-stat">
          <div className="kinair-stat-value text-sm">{currentOperatingPoint.efficiency}%</div>
          <div className="kinair-stat-label text-xs">Efficiency</div>
        </div>
        <div className="kinair-stat">
          <div className="kinair-stat-value text-sm">{fanRPM}</div>
          <div className="kinair-stat-label text-xs">Fan RPM</div>
        </div>
        <div className="kinair-stat">
          <div className="kinair-stat-value text-sm">{selection.noiseData?.overall || '-'}</div>
          <div className="kinair-stat-label text-xs">Noise dB(A)</div>
        </div>
        <div className="kinair-stat">
          <div className="kinair-stat-value text-sm">{totalWeight > 0 ? totalWeight : '-'}</div>
          <div className="kinair-stat-label text-xs">Weight (kg)</div>
        </div>
      </div>

      <FanAirflowTwin
        selection={exportSelection}
        operatingPoint={currentOperatingPoint}
        airflowUnit={airflowUnit}
        outletVelocity={outletVelocity}
        dynamicPressure={dynamicPressure}
        totalPressure={totalPressure}
        fanRPM={fanRPM}
        imageUrl={seriesInfo?.imageUrl}
        fanType={seriesInfo?.fanType}
      />

      {/* Motor Details Section */}
      <div className="bg-muted/30 rounded-lg p-4 border border-border/50 mb-6">
        <h3 className="text-sm font-medium text-foreground mb-3 flex items-center gap-2">
          <Zap className="w-4 h-4 text-primary" />
          Motor Details
        </h3>
        <div className="grid grid-cols-4 gap-4 text-sm">
          <div>
            <span className="text-muted-foreground">Rating:</span>{' '}
            <span className="font-medium">
              {motorSpec && (motorSpec as any).is_dual_speed && (motorSpec as any).secondary_rating_kw
                ? `${formatPower(motorSpec.ratingKW)}/${formatPower((motorSpec as any).secondary_rating_kw)} kW`
                : `${formatPower(selection.motorRating)} kW`
              }
            </span>
          </div>
          <div>
            <span className="text-muted-foreground">Poles:</span>{' '}
            <span className="font-medium">
              {motorSpec && (motorSpec as any).is_dual_speed && (motorSpec as any).secondary_poles
                ? `${motorSpec.motorPoles}/${(motorSpec as any).secondary_poles}P`
                : `${selection.motorPole}P`
              }
            </span>
          </div>
          <div>
            <span className="text-muted-foreground">RPM:</span>{' '}
            <span className="font-medium">
              {motorSpec && (motorSpec as any).is_dual_speed && (motorSpec as any).secondary_rpm
                ? `${fanRPM}/${(motorSpec as any).secondary_rpm}`
                : fanRPM
              }
            </span>
          </div>
          <div>
            <span className="text-muted-foreground">Frequency:</span>{' '}
            <span className="font-medium">{selection.frequency} Hz</span>
          </div>
          {vfdRequiredFrequency && motorPhase === 3 && (
            <div className="bg-primary/10 rounded px-2 py-1 -my-1">
              <span className="text-muted-foreground">Req. VFD Hz:</span>{' '}
              <span className="font-medium text-primary">{vfdRequiredFrequency} Hz</span>
            </div>
          )}
          {motorSpec && (
            <>
              <div>
                <span className="text-muted-foreground">Brand:</span>{' '}
                <span className="font-medium">{motorBrand?.name || '-'}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Frame:</span>{' '}
                <span className="font-medium">{motorSpec.motorFrame || '-'}</span>
              </div>
              <div>
                <span className="text-muted-foreground">FLC:</span>{' '}
                <span className="font-medium">{motorSpec.fullLoadCurrent || '-'} A</span>
              </div>
              <div>
                <span className="text-muted-foreground">Starting:</span>{' '}
                <span className="font-medium">{motorSpec.startingCurrent || '-'} A</span>
              </div>
              <div>
                <span className="text-muted-foreground">IP/Class:</span>{' '}
                <span className="font-medium">{motorSpec.ipRating || 'IP55'} / {motorSpec.insulationClass || 'F'}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Voltage:</span>{' '}
                <span className="font-medium">{motorSpec.voltage || 415}V</span>
              </div>
              <div>
                <span className="text-muted-foreground">Efficiency:</span>{' '}
                <span className="font-medium">{motorSpec.efficiencyClass || 'IE3'}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Motor Wt:</span>{' '}
                <span className="font-medium">{motorSpec.motorWeight || '-'} kg</span>
              </div>
              {motorSpec.fireRating && (
                <div>
                  <span className="text-muted-foreground">Fire Rating:</span>{' '}
                  <span className="font-medium">{motorSpec.fireRating}</span>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Speed Control Panel - VFD for 3-phase, Voltage Drive for 1-phase */}
      <div className="bg-gradient-to-r from-primary/5 to-primary/10 rounded-lg p-4 border border-primary/20 mb-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-primary/20 rounded-lg flex items-center justify-center">
              <Activity className="w-5 h-5 text-primary" />
            </div>
            <div>
              {motorPhase === 1 ? (
                <>
                  <h3 className="text-sm font-medium text-foreground">Voltage Drive Control</h3>
                  <p className="text-xs text-muted-foreground">Single-phase voltage regulation ({Math.round(nominalVoltage * 0.5)}-{nominalVoltage}V)</p>
                </>
              ) : (
                <>
                  <h3 className="text-sm font-medium text-foreground">VFD Selection</h3>
                  <p className="text-xs text-muted-foreground">Variable Frequency Drive simulation (20-60 Hz)</p>
                </>
              )}
            </div>
          </div>
          <div className="flex items-center gap-4">
            {motorPhase === 1 ? (
              <>
                <Switch
                  id="voltage-drive-mode"
                  checked={voltageDriveEnabled}
                  onCheckedChange={(checked) => {
                    setVoltageDriveEnabled(checked);
                    if (!checked) {
                      setDriveVoltage(nominalVoltage);
                    }
                  }}
                />
                <Label htmlFor="voltage-drive-mode" className="text-sm font-medium">Enable Voltage Drive</Label>
              </>
            ) : (
              <>
                <Switch
                  id="vfd-mode"
                  checked={vfdEnabled}
                  onCheckedChange={(checked) => {
                    setVfdEnabled(checked);
                    if (!checked) {
                      setVfdFrequency(baseFrequency);
                    }
                  }}
                />
                <Label htmlFor="vfd-mode" className="text-sm font-medium">Enable VFD</Label>
              </>
            )}
          </div>
        </div>
        
        {/* 1-Phase Voltage Drive Controls */}
        {motorPhase === 1 && voltageDriveEnabled && (
          <div className="mt-4 pt-4 border-t border-primary/20">
            <div className="flex items-center gap-6">
              <div className="flex-1">
                <div className="flex items-center justify-between mb-2">
                  <Label className="text-xs text-muted-foreground">Drive Voltage</Label>
                  <span className="text-sm font-bold text-primary">{driveVoltage}V</span>
                </div>
                <Slider
                  value={[driveVoltage]}
                  onValueChange={([value]) => setDriveVoltage(value)}
                  min={Math.round(nominalVoltage * 0.5)}
                  max={nominalVoltage}
                  step={5}
                  className="w-full"
                />
                <div className="flex justify-between text-xs text-muted-foreground mt-1">
                  <span>{Math.round(nominalVoltage * 0.5)}V</span>
                  <span>{Math.round(nominalVoltage * 0.75)}V</span>
                  <span>{nominalVoltage}V</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  value={driveVoltage}
                  onChange={(e) => {
                    const val = parseInt(e.target.value);
                    const minV = Math.round(nominalVoltage * 0.5);
                    if (!isNaN(val) && val >= minV && val <= nominalVoltage) {
                      setDriveVoltage(val);
                    }
                  }}
                  min={Math.round(nominalVoltage * 0.5)}
                  max={nominalVoltage}
                  className="w-20 text-center"
                />
                <span className="text-sm text-muted-foreground">V</span>
              </div>
            </div>
            <div className="grid grid-cols-4 gap-4 mt-4 text-sm">
              <div className="bg-background/50 rounded-lg p-3 text-center">
                <div className="text-xs text-muted-foreground">Nominal Voltage</div>
                <div className="font-bold">{nominalVoltage}V</div>
              </div>
              <div className="bg-background/50 rounded-lg p-3 text-center">
                <div className="text-xs text-muted-foreground">Drive Voltage</div>
                <div className="font-bold text-primary">{driveVoltage}V</div>
              </div>
              <div className="bg-background/50 rounded-lg p-3 text-center">
                <div className="text-xs text-muted-foreground">Voltage Ratio</div>
                <div className="font-bold">{(driveVoltage / nominalVoltage * 100).toFixed(0)}%</div>
              </div>
              <div className="bg-background/50 rounded-lg p-3 text-center">
                <div className="text-xs text-muted-foreground">Est. RPM</div>
                <div className="font-bold text-primary">{fanRPM}</div>
              </div>
            </div>
            
            {/* Comparison Table: Base Voltage vs Drive Voltage */}
            {driveVoltage !== nominalVoltage && (
              <div className="mt-4 pt-4 border-t border-primary/10">
                <h4 className="text-xs font-medium text-muted-foreground mb-3">Performance Comparison</h4>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-left py-2 px-2 font-medium text-muted-foreground">Parameter</th>
                        <th className="text-center py-2 px-2 font-medium text-muted-foreground">{nominalVoltage}V (Base)</th>
                        <th className="text-center py-2 px-2 font-medium text-primary">{driveVoltage}V (Drive)</th>
                        <th className="text-center py-2 px-2 font-medium text-muted-foreground">Change</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-b border-border/50">
                        <td className="py-2 px-2 text-muted-foreground">Airflow</td>
                        <td className="py-2 px-2 text-center">{Math.round(selection.operatingPoint.airflow * AIRFLOW_UNITS[airflowUnit].factor).toLocaleString()} {airflowUnit}</td>
                        <td className="py-2 px-2 text-center font-medium text-primary">{Math.round(currentOperatingPoint.airflow * AIRFLOW_UNITS[airflowUnit].factor).toLocaleString()} {airflowUnit}</td>
                        <td className="py-2 px-2 text-center text-xs">{((currentOperatingPoint.airflow / selection.operatingPoint.airflow - 1) * 100).toFixed(0)}%</td>
                      </tr>
                      <tr className="border-b border-border/50">
                        <td className="py-2 px-2 text-muted-foreground">Static Pressure</td>
                        <td className="py-2 px-2 text-center">{(selection.operatingPoint.staticPressure * PRESSURE_UNITS[pressureUnit].factor).toFixed(1)} {pressureUnit}</td>
                        <td className="py-2 px-2 text-center font-medium text-primary">{(currentOperatingPoint.staticPressure * PRESSURE_UNITS[pressureUnit].factor).toFixed(1)} {pressureUnit}</td>
                        <td className="py-2 px-2 text-center text-xs">{((currentOperatingPoint.staticPressure / selection.operatingPoint.staticPressure - 1) * 100).toFixed(0)}%</td>
                      </tr>
                      <tr className="border-b border-border/50">
                        <td className="py-2 px-2 text-muted-foreground">Shaft Power</td>
                        <td className="py-2 px-2 text-center">{formatPower(selection.operatingPoint.shaftPower)}</td>
                        <td className="py-2 px-2 text-center font-medium text-primary">{formatPower(currentOperatingPoint.shaftPower)}</td>
                        <td className="py-2 px-2 text-center text-xs">{((currentOperatingPoint.shaftPower / selection.operatingPoint.shaftPower - 1) * 100).toFixed(0)}%</td>
                      </tr>
                      <tr>
                        <td className="py-2 px-2 text-muted-foreground">RPM</td>
                        <td className="py-2 px-2 text-center">{baseMotorRPM}</td>
                        <td className="py-2 px-2 text-center font-medium text-primary">{fanRPM}</td>
                        <td className="py-2 px-2 text-center text-xs">{((driveVoltage / nominalVoltage - 1) * 100).toFixed(0)}%</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
        
        {/* 3-Phase VFD Controls */}
        {motorPhase === 3 && vfdEnabled && (
          <div className="mt-4 pt-4 border-t border-primary/20">
            <div className="flex items-center gap-6">
              <div className="flex-1">
                <div className="flex items-center justify-between mb-2">
                  <Label className="text-xs text-muted-foreground">VFD Frequency</Label>
                  <span className="text-sm font-bold text-primary">{vfdFrequency} Hz</span>
                </div>
                <Slider
                  value={[vfdFrequency]}
                  onValueChange={([value]) => setVfdFrequency(value)}
                  min={20}
                  max={60}
                  step={1}
                  className="w-full"
                />
                <div className="flex justify-between text-xs text-muted-foreground mt-1">
                  <span>20 Hz</span>
                  <span>40 Hz</span>
                  <span>60 Hz</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  value={vfdFrequency}
                  onChange={(e) => {
                    const val = parseInt(e.target.value);
                    if (!isNaN(val) && val >= 20 && val <= 60) {
                      setVfdFrequency(val);
                    }
                  }}
                  min={20}
                  max={60}
                  className="w-20 text-center"
                />
                <span className="text-sm text-muted-foreground">Hz</span>
              </div>
            </div>
            <div className="grid grid-cols-4 gap-4 mt-4 text-sm">
              <div className="bg-background/50 rounded-lg p-3 text-center">
                <div className="text-xs text-muted-foreground">Base Frequency</div>
                <div className="font-bold">{baseFrequency} Hz</div>
              </div>
              <div className="bg-background/50 rounded-lg p-3 text-center">
                <div className="text-xs text-muted-foreground">VFD Frequency</div>
                <div className="font-bold text-primary">{vfdFrequency} Hz</div>
              </div>
              <div className="bg-background/50 rounded-lg p-3 text-center">
                <div className="text-xs text-muted-foreground">Speed Ratio</div>
                <div className="font-bold">{(vfdFrequency / baseFrequency * 100).toFixed(0)}%</div>
              </div>
              <div className="bg-background/50 rounded-lg p-3 text-center">
                <div className="text-xs text-muted-foreground">VFD RPM</div>
                <div className="font-bold text-primary">{fanRPM}</div>
              </div>
            </div>
            
            {/* Comparison Table: Base vs VFD */}
            {vfdFrequency !== baseFrequency && (
              <div className="mt-4 pt-4 border-t border-primary/10">
                <h4 className="text-xs font-medium text-muted-foreground mb-3">Performance Comparison</h4>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-left py-2 px-2 font-medium text-muted-foreground">Parameter</th>
                        <th className="text-center py-2 px-2 font-medium text-muted-foreground">{baseFrequency}Hz (Base)</th>
                        <th className="text-center py-2 px-2 font-medium text-primary">{vfdFrequency}Hz (VFD)</th>
                        <th className="text-center py-2 px-2 font-medium text-muted-foreground">Change</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-b border-border/50">
                        <td className="py-2 px-2 text-muted-foreground">Airflow</td>
                        <td className="py-2 px-2 text-center">{Math.round(selection.operatingPoint.airflow * AIRFLOW_UNITS[airflowUnit].factor).toLocaleString()} {airflowUnit}</td>
                        <td className="py-2 px-2 text-center font-medium text-primary">{Math.round(currentOperatingPoint.airflow * AIRFLOW_UNITS[airflowUnit].factor).toLocaleString()} {airflowUnit}</td>
                        <td className="py-2 px-2 text-center text-xs">{((currentOperatingPoint.airflow / selection.operatingPoint.airflow - 1) * 100).toFixed(0)}%</td>
                      </tr>
                      <tr className="border-b border-border/50">
                        <td className="py-2 px-2 text-muted-foreground">Static Pressure</td>
                        <td className="py-2 px-2 text-center">{(selection.operatingPoint.staticPressure * PRESSURE_UNITS[pressureUnit].factor).toFixed(1)} {pressureUnit}</td>
                        <td className="py-2 px-2 text-center font-medium text-primary">{(currentOperatingPoint.staticPressure * PRESSURE_UNITS[pressureUnit].factor).toFixed(1)} {pressureUnit}</td>
                        <td className="py-2 px-2 text-center text-xs">{((currentOperatingPoint.staticPressure / selection.operatingPoint.staticPressure - 1) * 100).toFixed(0)}%</td>
                      </tr>
                      <tr className="border-b border-border/50">
                        <td className="py-2 px-2 text-muted-foreground">Shaft Power</td>
                        <td className="py-2 px-2 text-center">{formatPower(selection.operatingPoint.shaftPower)}</td>
                        <td className="py-2 px-2 text-center font-medium text-primary">{formatPower(currentOperatingPoint.shaftPower)}</td>
                        <td className="py-2 px-2 text-center text-xs">{((currentOperatingPoint.shaftPower / selection.operatingPoint.shaftPower - 1) * 100).toFixed(0)}%</td>
                      </tr>
                      <tr>
                        <td className="py-2 px-2 text-muted-foreground">RPM</td>
                        <td className="py-2 px-2 text-center">{calculateRPM(selection.motorPole, baseFrequency)}</td>
                        <td className="py-2 px-2 text-center font-medium text-primary">{fanRPM}</td>
                        <td className="py-2 px-2 text-center text-xs">{((vfdFrequency / baseFrequency - 1) * 100).toFixed(0)}%</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-3 sm:grid-cols-5 mb-4">
          <TabsTrigger value="curves">Curves</TabsTrigger>
          <TabsTrigger value="power">Power</TabsTrigger>
          <TabsTrigger value="efficiency">Efficiency</TabsTrigger>
          <TabsTrigger value="noise">Noise</TabsTrigger>
          <TabsTrigger value="drawing">Drawing</TabsTrigger>
        </TabsList>

        {/* Force mount the curves tab so chart ref is always available for PDF capture */}
        {/* Use invisible + absolute positioning instead of hidden to maintain chart dimensions for capture */}
        <TabsContent value="curves" className="mt-4 data-[state=inactive]:invisible data-[state=inactive]:absolute data-[state=inactive]:pointer-events-none" forceMount>
          <div className="bg-muted/30 rounded-lg p-4 border border-border/50">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium text-foreground flex items-center gap-2">
                <Settings2 className="w-4 h-4 text-primary" />
                Airflow vs Static Pressure
                {vfdEnabled && vfdFrequency !== baseFrequency && (
                  <span className="ml-2 px-2 py-0.5 bg-primary/20 text-primary text-xs rounded-full">
                    VFD @ {vfdFrequency}Hz
                  </span>
                )}
              </h3>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <Switch
                    id="family-curve"
                    checked={showFamilyCurve}
                    onCheckedChange={setShowFamilyCurve}
                  />
                  <Label htmlFor="family-curve" className="text-xs flex items-center gap-1">
                    <Layers className="w-3 h-3" />
                    Family Curves
                  </Label>
                </div>
                {showFamilyCurve && allFamilyCurveData && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm" className="h-7 px-2 text-xs">
                        <Eye className="w-3 h-3 mr-1" />
                        Angles
                        <ChevronDown className="w-3 h-3 ml-1" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {allFamilyCurveData.map(curve => (
                        <DropdownMenuCheckboxItem
                          key={curve.angle}
                          checked={!hiddenAngles.has(curve.angle)}
                          onSelect={event => event.preventDefault()}
                          onCheckedChange={checked => {
                            setHiddenAngles(previous => {
                              const next = new Set(previous);
                              if (checked) next.delete(curve.angle);
                              else next.add(curve.angle);
                              return next;
                            });
                          }}
                        >
                          {curve.angle}° blade angle
                        </DropdownMenuCheckboxItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
                <div className="flex items-center gap-2">
                  <Switch
                    id="system-curve"
                    checked={showSystemCurve}
                    onCheckedChange={setShowSystemCurve}
                  />
                  <Label htmlFor="system-curve" className="text-xs">System Curve</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    id="stall-zone"
                    checked={showStallZone}
                    onCheckedChange={setShowStallZone}
                  />
                  <Label htmlFor="stall-zone" className="text-xs text-destructive">Stall Zone</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    id="interactive-mode"
                    checked={interactiveMode}
                    onCheckedChange={setInteractiveMode}
                  />
                  <Label htmlFor="interactive-mode" className="text-xs flex items-center gap-1">
                    <MousePointer className="w-3 h-3" />
                    Interactive
                  </Label>
                </div>
                {(customDutyPoint || selectedAngle !== selection.bladeAngle || (vfdEnabled && vfdFrequency !== baseFrequency)) && (
                  <Button variant="ghost" size="sm" onClick={resetDutyPoint} className="text-xs h-7">
                    <RotateCcw className="w-3 h-3 mr-1" />
                    Reset
                  </Button>
                )}
              </div>
            </div>
            {showFamilyCurve && selectedAngle !== selection.bladeAngle && selection.bladeCount > 0 && (
              <div className="mb-2 text-xs text-muted-foreground bg-muted/50 px-2 py-1 rounded">
                Viewing: <span className="font-medium text-foreground">{selectedAngle}°</span> blade angle 
                (original: {selection.bladeAngle}°)
              </div>
            )}
            {showFamilyCurve && selection.bladeCount > 0 && (
              <div className="mb-2 text-xs text-muted-foreground">
                Click on blade angle labels to switch curves
              </div>
            )}
            <InteractivePerformanceChart
              performanceData={performanceData}
              operatingPoint={currentOperatingPoint}
              requiredDutyPoint={{
                airflow: selection.requiredAirflow,
                pressure: selection.requiredPressure,
              }}
              airflowUnit={airflowUnit}
              pressureUnit={pressureUnit}
              chartType="pressure"
              fanDiameter={selection.diameter}
              airDensity={airDensity}
              interactive={interactiveMode}
              showSystemCurve={showSystemCurve}
              onDutyPointChange={handleDutyPointChange}
              onAngleSelect={showFamilyCurve ? handleAngleSelect : undefined}
              familyCurveData={familyCurveData}
              selectedAngle={selectedAngle}
              showStallZone={showStallZone}
              chartContainerRef={pressureChartRef}
              baseCurveData={baseCurveData}
              adjustedCurveData={adjustedCurveData}
              externalDutyPoint={customDutyPoint ? { airflow: customDutyPoint.airflow, pressure: customDutyPoint.staticPressure } : null}
            />
          </div>
        </TabsContent>

        {/* Force mount the power tab - use invisible + absolute to maintain chart dimensions for capture */}
        <TabsContent value="power" className="mt-4 data-[state=inactive]:invisible data-[state=inactive]:absolute data-[state=inactive]:pointer-events-none" forceMount>
          <div className="bg-muted/30 rounded-lg p-4 border border-border/50">
            <h3 className="text-sm font-medium text-foreground mb-2 flex items-center gap-2">
              <Settings2 className="w-4 h-4 text-kinair-orange" />
              Airflow vs Shaft Power
              {vfdEnabled && vfdFrequency !== baseFrequency && (
                <span className="ml-2 px-2 py-0.5 bg-primary/20 text-primary text-xs rounded-full">
                  VFD @ {vfdFrequency}Hz
                </span>
              )}
            </h3>
            <InteractivePerformanceChart
              performanceData={performanceData}
              operatingPoint={currentOperatingPoint}
              requiredDutyPoint={{
                airflow: selection.requiredAirflow,
                pressure: selection.requiredPressure,
              }}
              airflowUnit={airflowUnit}
              pressureUnit={pressureUnit}
              chartType="power"
              fanDiameter={selection.diameter}
              airDensity={airDensity}
              showSystemCurve={showSystemCurve}
              familyCurveData={familyCurveData}
              selectedAngle={selectedAngle}
              chartContainerRef={powerChartRef}
              externalDutyPoint={customDutyPoint ? { airflow: customDutyPoint.airflow, pressure: customDutyPoint.staticPressure } : null}
            />
          </div>
        </TabsContent>

        {/* Force mount the efficiency tab - use invisible + absolute to maintain chart dimensions for capture */}
        <TabsContent value="efficiency" className="mt-4 data-[state=inactive]:invisible data-[state=inactive]:absolute data-[state=inactive]:pointer-events-none" forceMount>
          <div className="bg-muted/30 rounded-lg p-4 border border-border/50">
            <h3 className="text-sm font-medium text-foreground mb-2 flex items-center gap-2">
              <Settings2 className="w-4 h-4 text-primary" />
              Airflow vs Total Efficiency
              {vfdEnabled && vfdFrequency !== baseFrequency && (
                <span className="ml-2 px-2 py-0.5 bg-primary/20 text-primary text-xs rounded-full">
                  VFD @ {vfdFrequency}Hz
                </span>
              )}
            </h3>
            <InteractivePerformanceChart
              performanceData={performanceData}
              operatingPoint={currentOperatingPoint}
              requiredDutyPoint={{
                airflow: selection.requiredAirflow,
                pressure: selection.requiredPressure,
              }}
              airflowUnit={airflowUnit}
              pressureUnit={pressureUnit}
              chartType="efficiency"
              fanDiameter={selection.diameter}
              airDensity={airDensity}
              showSystemCurve={showSystemCurve}
              familyCurveData={familyCurveData}
              selectedAngle={selectedAngle}
              chartContainerRef={efficiencyChartRef}
              externalDutyPoint={customDutyPoint ? { airflow: customDutyPoint.airflow, pressure: customDutyPoint.staticPressure } : null}
            />
          </div>
        </TabsContent>

        <TabsContent value="noise" className="mt-4">
          {vfdEnabled && vfdFrequency !== baseFrequency && (
            <div className="mb-3 px-3 py-2 bg-primary/10 border border-primary/20 rounded-lg text-sm">
              <span className="text-primary font-medium">VFD Mode:</span>
              <span className="text-muted-foreground ml-2">
                Noise levels adjusted from {baseFrequency}Hz to {vfdFrequency}Hz using acoustic fan law (ΔLw = 50 × log₁₀(N₂/N₁))
              </span>
            </div>
          )}
          {voltageDriveEnabled && driveVoltage !== nominalVoltage && (
            <div className="mb-3 px-3 py-2 bg-primary/10 border border-primary/20 rounded-lg text-sm">
              <span className="text-primary font-medium">Voltage Drive Mode:</span>
              <span className="text-muted-foreground ml-2">
                Noise levels adjusted from {nominalVoltage}V to {driveVoltage}V using acoustic fan law
              </span>
            </div>
          )}
          {adjustedNoiseData ? (
            <NoiseDataTable 
              noiseData={adjustedNoiseData} 
              distance={noiseDistance}
              onDistanceChange={setNoiseDistance}
              directivityQ={directivityQ}
              onDirectivityChange={setDirectivityQ}
            />
          ) : (
            <div className="bg-muted/30 rounded-lg p-8 border border-border/50 text-center">
              <p className="text-muted-foreground">No noise data available for this configuration</p>
            </div>
          )}
        </TabsContent>

        <TabsContent value="drawing" className="mt-4">
          <div className="bg-muted/30 rounded-lg p-4 border border-border/50">
            <h3 className="text-sm font-medium text-foreground mb-4 flex items-center gap-2">
              <Ruler className="w-4 h-4 text-primary" />
              Fan Dimensions - Ø{selection.diameter}mm
            </h3>
            <FanDrawing diameter={selection.diameter} series={selection.series} />
          </div>
        </TabsContent>
      </Tabs>

      {/* Add to Project Dialog */}
      <AddToProjectDialog
        open={showAddToProject}
        onOpenChange={(open) => {
          setShowAddToProject(open);
          if (!open) setPendingPdfDoc(null);
        }}
        fanSelection={exportSelection}
        searchCriteria={{
          airflow: selection.requiredAirflow,
          pressure: selection.requiredPressure,
          altitude,
          temperature,
          airDensity,
          frequency: selection.frequency,
          airflowUnit,
          pressureUnit,
        }}
        calculatedValues={{
          fanRPM,
          outletVelocity,
          dynamicPressure,
          totalPressure,
          casingWeight,
          impellerWeight,
          motorWeight,
          totalWeight,
          noiseDistance,
          noiseDirectivityQ: directivityQ,
          soundOutletReduction: (seriesInfo as any)?.soundOutletReduction ?? 0,
          stallMinPercent: (seriesInfo as any)?.stallAirflowMinPercent ?? 0,
          stallMaxPercent: (seriesInfo as any)?.stallAirflowMaxPercent ?? 100,
          vfdEnabled,
          vfdFrequency: vfdEnabled ? vfdFrequency : undefined,
          voltageDriveEnabled,
          driveVoltage: voltageDriveEnabled ? driveVoltage : undefined,
          nominalVoltage,
          motorBrandName: motorBrand?.name,
          motorRatedCurrent: motorSpec?.ratedCurrent || undefined,
          motorFullLoadCurrent: motorSpec?.fullLoadCurrent || undefined,
          motorStartingCurrent: motorSpec?.startingCurrent || undefined,
          motorVoltage: motorSpec?.voltage || undefined,
          motorIpRating: motorSpec?.ipRating || undefined,
          motorInsulationClass: motorSpec?.insulationClass || undefined,
          motorEfficiencyClass: motorSpec?.efficiencyClass || undefined,
          motorFireRating: motorSpec?.fireRating || undefined,
          motorPhase,
          seriesId: selection.seriesId,
          fanModelId: selection.fanId,
          selectedAccessories: selection.accessory ? [selection.accessory] : [],
          flexibleDimensionValues: flexDimensionValue ? flexDimensionValue.values : undefined,
        }}
        pdfDocument={pendingPdfDoc}
        pdfGenerator={generatePdfForProject}
      />
    </div>
  );
}
