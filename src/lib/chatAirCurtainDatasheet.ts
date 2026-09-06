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
  },
  ctx: ChatAirCurtainContext,
) {
  const seriesInfo = ctx.series.find((s) => s.id === selection.model.seriesId) ?? null;
  const brandInfo =
    ctx.brands.find((b) => b.id === (selection.model.brandId ?? seriesInfo?.brandId)) ??
    ctx.brands.find((b) => b.name === selection.model.brand) ??
    null;

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
    noiseMode: 'dba',
    airflowUnit: 'cmh',
    airflowUnitLabel: 'm³/h',
    lengthUnitFactorMm: 1,
    lengthUnitLabel: 'mm',
    heightUnitFactorMm: 1000,
    heightUnitLabel: 'm',
  });
}
