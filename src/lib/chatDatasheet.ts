import {
  FanDatabase,
  FanSelection,
  FanPerformancePoint,
  FanDimension,
  applyFanLawsForPoles,
  applyFrequencyChange,
  calculateAirDensity,
} from './fanData';
import { generateEnhancedDatasheet } from './pdfDatasheetGenerator';
import { supabase } from '@/integrations/backend/client';
import type jsPDF from 'jspdf';
import { captureSelectionCharts } from './selectionChartExporter';

/**
 * Generate and download the standard KINAIR datasheet PDF for a selection
 * produced by the normal selection engine.
 *
 * This mirrors exactly what the Fan Selector's details panel passes to the
 * shared datasheet generator (weights, motor specification, fan speed,
 * dimensions and series settings all read from the same in-memory database),
 * so an AI-produced datasheet is identical to a manual one.
 */

function calculateRPM(motorPoles: number, frequency = 50): number {
  return Math.round(((120 * frequency) / motorPoles) * 0.97);
}

function outletVelocityOf(airflowCMH: number, diameterMM: number): number {
  const areaM2 = Math.PI * Math.pow(diameterMM / 1000 / 2, 2);
  return areaM2 > 0 ? airflowCMH / 3600 / areaM2 : 0;
}

export async function generateDatasheetForSelection(
  selection: FanSelection,
  database: FanDatabase,
  units?: { airflowUnit?: string; pressureUnit?: string },
  dimensionsMap?: Map<string, FanDimension>,
  documentOptions?: { existingDoc?: jsPDF; skipSave?: boolean; pageLabel?: string },
): Promise<jsPDF> {
  const seriesInfo: any =
    database.series.find((s) => s.id === selection.seriesId) ||
    database.series.find((s) => s.name === selection.series);

  // ---- Performance data (same derivation as the Fan Selector details panel)
  const fan: any = database.fans.find((f) => f.id === selection.fanId);
  const bladeConfig = fan?.bladeConfigurations?.find((bc: any) => bc.bladeCount === selection.bladeCount);
  const rawPerformanceData: FanPerformancePoint[] = bladeConfig?.performanceData?.[selection.bladeAngle] || [];
  const referencePoles = fan?.referencePoles || 4;
  const frequency = selection.frequency || 50;

  let performanceData = rawPerformanceData;
  if (performanceData.length && selection.motorPole !== referencePoles) {
    performanceData = applyFanLawsForPoles(performanceData, referencePoles, selection.motorPole, 50);
  }
  if (performanceData.length && frequency !== 50) {
    performanceData = applyFrequencyChange(performanceData, selection.motorPole, 50, frequency);
  }

  // ---- Weights
  const casingWeight =
    database.weightDatabase.casingWeights.find((w) => w.diameter === selection.diameter)?.weight || 0;
  const impellerWeight =
    database.weightDatabase.impellerWeights.find(
      (w) => w.diameter === selection.diameter && w.bladeCount === selection.bladeCount,
    )?.weight || 0;

  // ---- Motor specification (same matching rules as the manual datasheet)
  const requiredFireRating =
    selection.fireClass === 'F300' ? 'F300' : selection.fireClass === 'F400' ? 'F400' : '';
  const motorSpec: any = database.motorDatabase.specifications.find((m: any) => {
    const matchesPoleAndRating = m.motorPoles === selection.motorPole && m.ratingKW >= selection.motorRating;
    const matchesFireRating = (m.fireRating || '') === requiredFireRating;
    if (selection.motorBrandId) {
      return matchesPoleAndRating && matchesFireRating && m.brandId === selection.motorBrandId;
    }
    return matchesPoleAndRating && matchesFireRating;
  });
  const motorWeight = motorSpec?.motorWeight || 0;
  const motorBrand = database.motorDatabase.brands.find((b) => b.id === motorSpec?.brandId);
  const motorPhase = motorSpec?.phase || 3;
  const nominalVoltage = motorSpec?.voltage || (motorPhase === 1 ? 220 : 415);

  // ---- Derived duty values
  const airDensity = calculateAirDensity(0, 20);
  const operating = selection.operatingPoint;
  const outletVelocity = outletVelocityOf(operating.airflow, selection.diameter);
  const dynamicPressure = 0.5 * airDensity * Math.pow(outletVelocity, 2);
  const totalPressure = operating.staticPressure + dynamicPressure;
  const fanRPM = motorSpec?.rpm || calculateRPM(selection.motorPole, frequency);

  // ---- Dimensions
  const fanDimensions = dimensionsMap?.get(`${selection.seriesId}-${selection.diameter}`);

  // ---- Flexible dimensions (schema + values for this series/size)
  let flexibleDimensionSchema:
    | { param_key: string; param_label: string; param_type: 'number' | 'text'; display_order: number }[]
    | undefined;
  let flexibleDimensionValue: { size: number; values: Record<string, any> } | undefined;
  if (selection.seriesId) {
    try {
      const [{ data: schemaRows }, { data: valueRow }] = await Promise.all([
        supabase
          .from('series_dimension_schema')
          .select('param_key, param_label, param_type, display_order')
          .eq('series_id', selection.seriesId)
          .order('display_order'),
        supabase
          .from('series_dimension_values')
          .select('size, values')
          .eq('series_id', selection.seriesId)
          .eq('size', selection.diameter)
          .maybeSingle(),
      ]);
      if (schemaRows?.length) {
        flexibleDimensionSchema = schemaRows.map((s: any) => ({
          param_key: s.param_key,
          param_label: s.param_label,
          param_type: s.param_type,
          display_order: s.display_order,
        }));
      }
      if (valueRow) {
        flexibleDimensionValue = { size: (valueRow as any).size, values: (valueRow as any).values || {} };
      }
    } catch {
      // Dimensions are optional — the datasheet still generates without them.
    }
  }

  // Capture the exact same Recharts output used by the manual selector.
  const chartImages = await captureSelectionCharts(
    selection,
    performanceData,
    units?.airflowUnit || 'CMH',
    units?.pressureUnit || 'Pa',
    airDensity,
  );

  return generateEnhancedDatasheet({
    selection,
    database,
    ...chartImages,
    airflowUnit: (units?.airflowUnit || 'CMH') as any,
    pressureUnit: (units?.pressureUnit || 'Pa') as any,
    performanceData,
    fanRPM,
    outletVelocity,
    dynamicPressure,
    totalPressure,
    casingWeight,
    impellerWeight,
    motorWeight,
    fanDimensions,
    flexibleDimensionSchema,
    flexibleDimensionValue,
    airDensity,
    temperature: 20,
    altitude: 0,
    noiseDistance: seriesInfo?.defaultNoiseDistance ?? 0,
    noiseDirectivityQ: seriesInfo?.defaultDirectivityQ ?? 2,
    seriesImageUrl: seriesInfo?.imageUrl,
    seriesDrawingUrl: seriesInfo?.drawingUrl,
    datasheetDescription: seriesInfo?.datasheetDescription,
    showOctaveBands: seriesInfo?.showOctaveBands ?? true,
    amcaCertified: seriesInfo?.amcaCertified ?? false,
    fireRating: seriesInfo?.fireRating,
    amcaLogoUrl: seriesInfo?.amcaLogoUrl,
    fireRatingLogoUrl: seriesInfo?.fireRatingLogoUrl,
    iomUrl: seriesInfo?.iomUrl,
    soundOutletReduction: seriesInfo?.soundOutletReduction ?? 0,
    stallAirflowMinPercent: seriesInfo?.stallAirflowMinPercent ?? 15,
    stallAirflowMaxPercent: seriesInfo?.stallAirflowMaxPercent ?? 95,
    compatibleAccessories: seriesInfo?.compatibleAccessories || [],
    motorSpec: motorSpec
      ? {
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
        }
      : undefined,
    motorPhase,
    nominalVoltage,
    existingDoc: documentOptions?.existingDoc,
    skipSave: documentOptions?.skipSave,
    pageLabel: documentOptions?.pageLabel,
  } as any);
}
