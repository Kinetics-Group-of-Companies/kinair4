import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { FanDatabase, emptyFanDatabase, FanModel, BladeConfiguration, ContactInfo, SeriesInfo, DEFAULT_SERIES, FanDimension, DEFAULT_FAN_DIMENSIONS, SeriesDrawingData, UnitPreferences, DEFAULT_UNIT_PREFERENCES, MotorBrand, MotorSpecification, DEFAULT_MOTOR_DATABASE, CasingWeight, ImpellerWeight, DEFAULT_WEIGHT_DATABASE } from './fanData';

interface FanDatabaseContextType {
  database: FanDatabase;
  updateLogo: (url: string) => void;
  updateCompanyName: (name: string) => void;
  updateContactInfo: (info: Partial<ContactInfo>) => void;
  updateFan: (fanId: string, updates: Partial<FanModel>) => void;
  addFan: (fan: FanModel) => void;
  deleteFan: (fanId: string) => void;
  updateBladeConfiguration: (fanId: string, bladeCount: number, config: Partial<BladeConfiguration>) => void;
  resetToDefaults: () => void;
  importFansFromCSV: (csvContent: string) => boolean;
  exportFansToCSV: () => string;
  addSeries: (series: SeriesInfo) => void;
  updateSeries: (seriesId: string, updates: Partial<SeriesInfo>) => void;
  deleteSeries: (seriesId: string) => void;
  // Series-specific drawing/dimensions
  getSeriesDrawingData: (seriesId: string) => SeriesDrawingData | undefined;
  updateSeriesDrawingUrl: (seriesId: string, url: string) => void;
  updateSeriesDimension: (seriesId: string, size: number, updates: Partial<FanDimension>) => void;
  initSeriesWithDefaultDimensions: (seriesId: string) => void;
  resetSeriesDimensionsToDefaults: (seriesId: string) => void;
  // Unit preferences
  updateUnitPreferences: (prefs: Partial<UnitPreferences>) => void;
  // Motor database
  addMotorBrand: (brand: MotorBrand) => void;
  updateMotorBrand: (brandId: string, updates: Partial<MotorBrand>) => void;
  deleteMotorBrand: (brandId: string) => void;
  addMotorSpecification: (spec: MotorSpecification) => void;
  updateMotorSpecification: (specId: string, updates: Partial<MotorSpecification>) => void;
  deleteMotorSpecification: (specId: string) => void;
  // Weight database
  updateCasingWeight: (diameter: number, weight: number) => void;
  addCasingWeight: (diameter: number, weight: number) => void;
  deleteCasingWeight: (diameter: number) => void;
  updateImpellerWeight: (diameter: number, bladeCount: number, weight: number) => void;
  addImpellerWeight: (diameter: number, bladeCount: number, weight: number) => void;
  deleteImpellerWeight: (diameter: number, bladeCount: number) => void;
}

const FanDatabaseContext = createContext<FanDatabaseContextType | undefined>(undefined);

const STORAGE_KEY = 'kinair_fan_database';

export function FanDatabaseProvider({ children }: { children: ReactNode }) {
  const [database, setDatabase] = useState<FanDatabase>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        
        // Ensure contactInfo exists (migration for old data)
        if (!parsed.contactInfo) {
          parsed.contactInfo = {
            email: 'deepak@kineticsgroup.ae',
            phone: '+971544257970',
          };
        }
        
        // Ensure all fans have series (migration from applicationType to series)
        if (parsed.fans && Array.isArray(parsed.fans)) {
          const seriesTypes = ['KAF', 'KAF-W', 'KAF-R'] as const;
          parsed.fans = parsed.fans.map((fan: any, idx: number) => ({
            ...fan,
            series: fan.series || fan.applicationType?.replace('ducted', 'KAF').replace('wall_mounted', 'KAF-W').replace('roof_mounted', 'KAF-R') || seriesTypes[idx % 3],
          }));
        } else {
          // If fans array is missing or invalid, use defaults
          return emptyFanDatabase;
        }
        
        // Ensure series array exists
        if (!parsed.series || !Array.isArray(parsed.series)) {
          parsed.series = [...DEFAULT_SERIES];
        }
        
        // Migrate old global dimensions to series-specific format
        if (!parsed.seriesDrawings || !Array.isArray(parsed.seriesDrawings)) {
          parsed.seriesDrawings = [];
          // If there was old global data, migrate it to the first series if exists
          if (parsed.series.length > 0 && (parsed.dimensions || parsed.drawingUrl)) {
            parsed.seriesDrawings = [{
              seriesId: parsed.series[0].id,
              drawingUrl: parsed.drawingUrl || '',
              dimensions: parsed.dimensions || [...DEFAULT_FAN_DIMENSIONS],
            }];
          }
          // Remove old global fields
          delete parsed.drawingUrl;
          delete parsed.dimensions;
        }
        
        // Ensure unitPreferences exists (migration for old data)
        if (!parsed.unitPreferences) {
          parsed.unitPreferences = { ...DEFAULT_UNIT_PREFERENCES };
        }
        
        // Ensure motorDatabase exists (migration for old data)
        if (!parsed.motorDatabase) {
          parsed.motorDatabase = { ...DEFAULT_MOTOR_DATABASE };
        }
        
        // Ensure weightDatabase exists (migration for old data)
        if (!parsed.weightDatabase) {
          parsed.weightDatabase = { ...DEFAULT_WEIGHT_DATABASE };
        }
        
        return parsed as FanDatabase;
      }
    } catch (error) {
      console.error('Error loading fan database from localStorage:', error);
      // Clear corrupted data
      localStorage.removeItem(STORAGE_KEY);
    }
    return emptyFanDatabase;
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(database));
  }, [database]);

  const updateLogo = (url: string) => {
    setDatabase(prev => ({ ...prev, logoUrl: url }));
  };

  const updateCompanyName = (name: string) => {
    setDatabase(prev => ({ ...prev, companyName: name }));
  };

  const updateContactInfo = (info: Partial<ContactInfo>) => {
    setDatabase(prev => ({
      ...prev,
      contactInfo: { ...prev.contactInfo, ...info },
    }));
  };

  const updateFan = (fanId: string, updates: Partial<FanModel>) => {
    setDatabase(prev => ({
      ...prev,
      fans: prev.fans.map(fan => 
        fan.id === fanId ? { ...fan, ...updates } : fan
      ),
    }));
  };

  const addFan = (fan: FanModel) => {
    setDatabase(prev => ({
      ...prev,
      fans: [...prev.fans, fan],
    }));
  };

  const deleteFan = (fanId: string) => {
    setDatabase(prev => ({
      ...prev,
      fans: prev.fans.filter(fan => fan.id !== fanId),
    }));
  };

  const updateBladeConfiguration = (fanId: string, bladeCount: number, config: Partial<BladeConfiguration>) => {
    setDatabase(prev => ({
      ...prev,
      fans: prev.fans.map(fan => {
        if (fan.id !== fanId) return fan;
        return {
          ...fan,
          bladeConfigurations: fan.bladeConfigurations.map(bc => 
            bc.bladeCount === bladeCount ? { ...bc, ...config } : bc
          ),
        };
      }),
    }));
  };

  const resetToDefaults = () => {
    // Clear all stored data and start fresh with empty database
    localStorage.removeItem(STORAGE_KEY);
    setDatabase(emptyFanDatabase);
  };

  const importFansFromCSV = (csvContent: string): boolean => {
    try {
      const lines = csvContent.split('\n').filter(line => line.trim() && !line.startsWith('#'));
      if (lines.length < 2) return false;
      
      // For now, just validate structure - full implementation would parse and update
      const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
      const requiredHeaders = ['fan_id', 'diameter_mm', 'blade_count'];
      const hasRequired = requiredHeaders.every(h => 
        headers.some(header => header.includes(h.replace('_', '')))
      );
      
      return hasRequired;
    } catch {
      return false;
    }
  };

  const exportFansToCSV = (): string => {
    const headers = [
      'Fan_ID',
      'Diameter_mm',
      'Blade_Count',
      'Blade_Angle',
      'Series',
      'Point_Index',
      'Airflow_CMH',
      'Static_Pressure_Pa',
      'Shaft_Power_kW',
      'Efficiency_Percent',
      'Noise_63Hz',
      'Noise_125Hz',
      'Noise_250Hz',
      'Noise_500Hz',
      'Noise_1kHz',
      'Noise_2kHz',
      'Noise_4kHz',
      'Noise_8kHz',
      'Noise_Overall'
    ];

    const rows: string[] = [headers.join(',')];

    database.fans.forEach(fan => {
      fan.bladeConfigurations.forEach(config => {
        config.bladeAngles.forEach(angle => {
          const perfData = config.performanceData[angle];
          const noiseData = config.noiseData[angle];
          
          if (perfData) {
            perfData.forEach((point, idx) => {
              rows.push([
                fan.id,
                fan.diameter,
                config.bladeCount,
                angle,
                fan.series,
                idx + 1,
                point.airflow,
                point.staticPressure,
                point.shaftPower,
                point.efficiency,
                noiseData?.hz63 || '',
                noiseData?.hz125 || '',
                noiseData?.hz250 || '',
                noiseData?.hz500 || '',
                noiseData?.hz1k || '',
                noiseData?.hz2k || '',
                noiseData?.hz4k || '',
                noiseData?.hz8k || '',
                noiseData?.overall || ''
              ].join(','));
            });
          }
        });
      });
    });

    return rows.join('\n');
  };

  const addSeries = (series: SeriesInfo) => {
    setDatabase(prev => ({
      ...prev,
      series: [...prev.series, series],
    }));
  };

  const updateSeries = (seriesId: string, updates: Partial<SeriesInfo>) => {
    setDatabase(prev => ({
      ...prev,
      series: prev.series.map(s => 
        s.id === seriesId ? { ...s, ...updates } : s
      ),
    }));
  };

  const deleteSeries = (seriesId: string) => {
    setDatabase(prev => ({
      ...prev,
      series: prev.series.filter(s => s.id !== seriesId),
    }));
  };

  const getSeriesDrawingData = (seriesId: string): SeriesDrawingData | undefined => {
    return database.seriesDrawings.find(sd => sd.seriesId === seriesId);
  };

  const updateSeriesDrawingUrl = (seriesId: string, url: string) => {
    setDatabase(prev => {
      const existingIdx = prev.seriesDrawings.findIndex(sd => sd.seriesId === seriesId);
      if (existingIdx >= 0) {
        const updated = [...prev.seriesDrawings];
        updated[existingIdx] = { ...updated[existingIdx], drawingUrl: url };
        return { ...prev, seriesDrawings: updated };
      } else {
        return {
          ...prev,
          seriesDrawings: [...prev.seriesDrawings, { seriesId, drawingUrl: url, dimensions: [] }],
        };
      }
    });
  };

  const updateSeriesDimension = (seriesId: string, size: number, updates: Partial<FanDimension>) => {
    setDatabase(prev => {
      const existingIdx = prev.seriesDrawings.findIndex(sd => sd.seriesId === seriesId);
      if (existingIdx >= 0) {
        const updated = [...prev.seriesDrawings];
        updated[existingIdx] = {
          ...updated[existingIdx],
          dimensions: updated[existingIdx].dimensions.map(d =>
            d.size === size ? { ...d, ...updates } : d
          ),
        };
        return { ...prev, seriesDrawings: updated };
      }
      return prev;
    });
  };

  const initSeriesWithDefaultDimensions = (seriesId: string) => {
    setDatabase(prev => {
      const exists = prev.seriesDrawings.some(sd => sd.seriesId === seriesId);
      if (!exists) {
        return {
          ...prev,
          seriesDrawings: [...prev.seriesDrawings, {
            seriesId,
            drawingUrl: '',
            dimensions: [...DEFAULT_FAN_DIMENSIONS],
          }],
        };
      }
      return prev;
    });
  };

  const resetSeriesDimensionsToDefaults = (seriesId: string) => {
    setDatabase(prev => {
      const existingIdx = prev.seriesDrawings.findIndex(sd => sd.seriesId === seriesId);
      if (existingIdx >= 0) {
        const updated = [...prev.seriesDrawings];
        updated[existingIdx] = { ...updated[existingIdx], dimensions: [...DEFAULT_FAN_DIMENSIONS] };
        return { ...prev, seriesDrawings: updated };
      }
      return prev;
    });
  };

  const updateUnitPreferences = (prefs: Partial<UnitPreferences>) => {
    setDatabase(prev => ({
      ...prev,
      unitPreferences: { ...prev.unitPreferences, ...prefs },
    }));
  };

  // Motor database management
  const addMotorBrand = (brand: MotorBrand) => {
    setDatabase(prev => ({
      ...prev,
      motorDatabase: {
        ...prev.motorDatabase,
        brands: [...prev.motorDatabase.brands, brand],
      },
    }));
  };

  const updateMotorBrand = (brandId: string, updates: Partial<MotorBrand>) => {
    setDatabase(prev => ({
      ...prev,
      motorDatabase: {
        ...prev.motorDatabase,
        brands: prev.motorDatabase.brands.map(b =>
          b.id === brandId ? { ...b, ...updates } : b
        ),
      },
    }));
  };

  const deleteMotorBrand = (brandId: string) => {
    setDatabase(prev => ({
      ...prev,
      motorDatabase: {
        ...prev.motorDatabase,
        brands: prev.motorDatabase.brands.filter(b => b.id !== brandId),
      },
    }));
  };

  const addMotorSpecification = (spec: MotorSpecification) => {
    setDatabase(prev => ({
      ...prev,
      motorDatabase: {
        ...prev.motorDatabase,
        specifications: [...prev.motorDatabase.specifications, spec],
      },
    }));
  };

  const updateMotorSpecification = (specId: string, updates: Partial<MotorSpecification>) => {
    setDatabase(prev => ({
      ...prev,
      motorDatabase: {
        ...prev.motorDatabase,
        specifications: prev.motorDatabase.specifications.map(s =>
          s.id === specId ? { ...s, ...updates } : s
        ),
      },
    }));
  };

  const deleteMotorSpecification = (specId: string) => {
    setDatabase(prev => ({
      ...prev,
      motorDatabase: {
        ...prev.motorDatabase,
        specifications: prev.motorDatabase.specifications.filter(s => s.id !== specId),
      },
    }));
  };

  // Weight database management
  const updateCasingWeight = (diameter: number, weight: number) => {
    setDatabase(prev => ({
      ...prev,
      weightDatabase: {
        ...prev.weightDatabase,
        casingWeights: prev.weightDatabase.casingWeights.map(cw =>
          cw.diameter === diameter ? { ...cw, weight } : cw
        ),
      },
    }));
  };

  const addCasingWeight = (diameter: number, weight: number) => {
    setDatabase(prev => {
      if (prev.weightDatabase.casingWeights.some(cw => cw.diameter === diameter)) {
        return prev; // Already exists
      }
      return {
        ...prev,
        weightDatabase: {
          ...prev.weightDatabase,
          casingWeights: [...prev.weightDatabase.casingWeights, { diameter, weight }].sort((a, b) => a.diameter - b.diameter),
        },
      };
    });
  };

  const deleteCasingWeight = (diameter: number) => {
    setDatabase(prev => ({
      ...prev,
      weightDatabase: {
        ...prev.weightDatabase,
        casingWeights: prev.weightDatabase.casingWeights.filter(cw => cw.diameter !== diameter),
      },
    }));
  };

  const updateImpellerWeight = (diameter: number, bladeCount: number, weight: number) => {
    setDatabase(prev => ({
      ...prev,
      weightDatabase: {
        ...prev.weightDatabase,
        impellerWeights: prev.weightDatabase.impellerWeights.map(iw =>
          iw.diameter === diameter && iw.bladeCount === bladeCount ? { ...iw, weight } : iw
        ),
      },
    }));
  };

  const addImpellerWeight = (diameter: number, bladeCount: number, weight: number) => {
    setDatabase(prev => {
      if (prev.weightDatabase.impellerWeights.some(iw => iw.diameter === diameter && iw.bladeCount === bladeCount)) {
        return prev; // Already exists
      }
      return {
        ...prev,
        weightDatabase: {
          ...prev.weightDatabase,
          impellerWeights: [...prev.weightDatabase.impellerWeights, { diameter, bladeCount, weight }]
            .sort((a, b) => a.diameter - b.diameter || a.bladeCount - b.bladeCount),
        },
      };
    });
  };

  const deleteImpellerWeight = (diameter: number, bladeCount: number) => {
    setDatabase(prev => ({
      ...prev,
      weightDatabase: {
        ...prev.weightDatabase,
        impellerWeights: prev.weightDatabase.impellerWeights.filter(iw => 
          !(iw.diameter === diameter && iw.bladeCount === bladeCount)
        ),
      },
    }));
  };

  return (
    <FanDatabaseContext.Provider value={{
      database,
      updateLogo,
      updateCompanyName,
      updateContactInfo,
      updateFan,
      addFan,
      deleteFan,
      updateBladeConfiguration,
      resetToDefaults,
      importFansFromCSV,
      exportFansToCSV,
      addSeries,
      updateSeries,
      deleteSeries,
      getSeriesDrawingData,
      updateSeriesDrawingUrl,
      updateSeriesDimension,
      initSeriesWithDefaultDimensions,
      resetSeriesDimensionsToDefaults,
      updateUnitPreferences,
      addMotorBrand,
      updateMotorBrand,
      deleteMotorBrand,
      addMotorSpecification,
      updateMotorSpecification,
      deleteMotorSpecification,
      updateCasingWeight,
      addCasingWeight,
      deleteCasingWeight,
      updateImpellerWeight,
      addImpellerWeight,
      deleteImpellerWeight,
    }}>
      {children}
    </FanDatabaseContext.Provider>
  );
}

export function useFanDatabase() {
  const context = useContext(FanDatabaseContext);
  if (context === undefined) {
    throw new Error('useFanDatabase must be used within a FanDatabaseProvider');
  }
  return context;
}
