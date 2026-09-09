import { downloadAirCurtainDatasheet } from '@/lib/airCurtainDatasheet';
import type {
  AirCurtainSelection,
  AirCurtainBrand,
  AirCurtainSeries,
  AirCurtainDimensionRow,
} from '@/lib/airCurtainData';

export interface ChatAirCurtainContext {
  brands: AirCurtainBrand[];
  series: AirCurtainSeries[];
  dimensions: AirCurtainDimensionRow[];
  tenant?: { name?: string | null; logo_url?: string | null; phone?: string | null; email?: string | null } | null;
}

/**
 * Chat-side wrapper around the existing air curtain datasheet generator.
 * Add-on layer only — the selection engine and PDF generator are untouched.
 */
export async function generateAirCurtainDatasheetForSelection(
  selection: AirCurtainSelection,
  opts: {
    doorWidthMm: number;
    doorHeightM: number;
    minFloorVelocity: number;
    noiseMode?: 'dba' | 'octave';
    airflowUnit?: 'cmh' | 'cfm' | 'ls';
    widthUnit?: 'mm' | 'cm' | 'm' | 'in' | 'ft';
    heightUnit?: 'mm' | 'cm' | 'm' | 'in' | 'ft';
  },
  ctx: ChatAirCurtainContext,
) {
  const seriesInfo = ctx.series.find((s) => s.id === selection.model.seriesId) ?? null;
  const brandInfo =
    ctx.brands.find((b) => b.id === (selection.model.brandId ?? seriesInfo?.brandId)) ??
    ctx.brands.find((b) => b.name === selection.model.brand) ??
    null;

  const airflowUnits = {
    cmh: { label: 'm³/h', factor: 1 },
    cfm: { label: 'CFM', factor: 1.6990107955 },
    ls: { label: 'l/s', factor: 3.6 },
  } as const;
  const lengthFactors = { mm: 1, cm: 10, m: 1000, in: 25.4, ft: 304.8 } as const;
  const lengthLabels = { mm: 'mm', cm: 'cm', m: 'm', in: 'in', ft: 'ft' } as const;
  const airflowUnit = opts.airflowUnit ?? 'cfm';
  const widthUnit = opts.widthUnit ?? 'mm';
  const heightUnit = opts.heightUnit ?? 'm';

  await downloadAirCurtainDatasheet({
    selection,
    doorWidthMm: opts.doorWidthMm,
    doorHeightM: opts.doorHeightM,
    minFloorVelocity: opts.minFloorVelocity,
    brandInfo,
    seriesInfo,
    dimensions: ctx.dimensions.filter(
      (d) =>
        (seriesInfo && d.seriesId === seriesInfo.id) ||
        selection.units.some((u) => u.model.id === d.modelId || u.model.seriesId === d.seriesId),
    ),
    companyLogoUrl: ctx.tenant?.logo_url ?? null,
    companyName: ctx.tenant?.name ?? undefined,
    contactInfo: { phone: ctx.tenant?.phone ?? undefined, email: ctx.tenant?.email ?? undefined },
    noiseMode: opts.noiseMode ?? 'dba',
    airflowUnit,
    airflowUnitLabel: airflowUnits[airflowUnit].label,
    lengthUnitFactorMm: lengthFactors[widthUnit],
    lengthUnitLabel: lengthLabels[widthUnit],
    heightUnitFactorMm: lengthFactors[heightUnit],
    heightUnitLabel: lengthLabels[heightUnit],
  });
}
