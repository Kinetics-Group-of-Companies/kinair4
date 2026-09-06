import { useMemo } from 'react';
import {
  useTenantData,
  useFanSeries,
  useFanModels,
  useUnitPreferences,
  useMotorBrands,
  useMotorSpecifications,
  useCasingWeights,
  useImpellerWeights,
} from './useFanDatabase';
import type { FanDatabase, SeriesDrawingData, DEFAULT_UNIT_PREFERENCES, DEFAULT_MOTOR_DATABASE, DEFAULT_WEIGHT_DATABASE } from '@/lib/fanData';

/**
 * Hook that builds a FanDatabase object from Supabase data.
 * This replaces the localStorage-based useFanDatabase context for the Fan Selector.
 */
export function useSupabaseFanDatabase() {
  const { data: tenant, isLoading: loadingTenant } = useTenantData();
  const { data: series = [], isLoading: loadingSeries } = useFanSeries();
  const { data: fanModels = [], isLoading: loadingFans } = useFanModels();
  const { data: unitPrefs, isLoading: loadingUnits } = useUnitPreferences();
  const { data: motorBrands = [], isLoading: loadingBrands } = useMotorBrands();
  const { data: motorSpecs = [], isLoading: loadingSpecs } = useMotorSpecifications();
  const { data: casingWeights = [], isLoading: loadingCasing } = useCasingWeights();
  const { data: impellerWeights = [], isLoading: loadingImpeller } = useImpellerWeights();

  const isLoading = loadingTenant || loadingSeries || loadingFans || loadingUnits || 
                    loadingBrands || loadingSpecs || loadingCasing || loadingImpeller;

  const database: FanDatabase = useMemo(() => {
    return {
      logoUrl: tenant?.logo_url || '',
      companyName: tenant?.name || '',
      contactInfo: {
        email: tenant?.email || '',
        phone: tenant?.phone || '',
        address: tenant?.address || '',
      },
      fans: fanModels,
      series: series.map(s => ({
        id: s.id,
        name: s.name,
        description: s.description || '',
        imageUrl: s.imageUrl,
        drawingUrl: s.drawingUrl,
        datasheetDescription: s.datasheetDescription,
        showOctaveBands: s.showOctaveBands,
        amcaCertified: s.amcaCertified,
        fireRating: s.fireRating,
        amcaLogoUrl: s.amcaLogoUrl,
        fireRatingLogoUrl: s.fireRatingLogoUrl,
        catalogueUrl: s.catalogueUrl,
        iomUrl: s.iomUrl,
        nomenclatureTemplate: s.nomenclatureTemplate,
        ceCertified: s.ceCertified,
        ceLogoUrl: s.ceLogoUrl,
        isoCertified: s.isoCertified,
        isoLogoUrl: s.isoLogoUrl,
        ulCertified: s.ulCertified,
        ulLogoUrl: s.ulLogoUrl,
        atexCertified: s.atexCertified,
        atexLogoUrl: s.atexLogoUrl,
        customCertName: s.customCertName,
        customCertLogoUrl: s.customCertLogoUrl,
        defaultSafetyFactor: s.defaultSafetyFactor,
        // New datasheet features
        soundOutletReduction: s.soundOutletReduction,
        stallAirflowMinPercent: s.stallAirflowMinPercent,
        stallAirflowMaxPercent: s.stallAirflowMaxPercent,
        compatibleAccessories: s.compatibleAccessories,
        // Default noise settings
        defaultDirectivityQ: s.defaultDirectivityQ,
        defaultNoiseDistance: s.defaultNoiseDistance,
      })),
      seriesDrawings: series.map(s => ({
        seriesId: s.id,
        drawingUrl: s.drawingUrl || '',
        dimensions: [],
      })) as SeriesDrawingData[],
      unitPreferences: unitPrefs || {
        airflowUnit: 'CMH' as const,
        pressureUnit: 'Pa' as const,
        powerUnit: 'kW' as const,
        defaultToleranceMin: 95,
        defaultToleranceMax: 105,
      },
      motorDatabase: {
        brands: motorBrands.map(b => ({ id: b.id, name: b.name })),
        specifications: motorSpecs,
      },
      weightDatabase: {
        casingWeights,
        impellerWeights,
      },
    };
  }, [tenant, series, fanModels, unitPrefs, motorBrands, motorSpecs, casingWeights, impellerWeights]);

  return { database, isLoading };
}
