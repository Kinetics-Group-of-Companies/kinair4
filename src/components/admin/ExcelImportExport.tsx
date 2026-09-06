import { useRef, useState } from 'react';
import { Download, Upload, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useFanModels, useAddFanModel, useFanSeries, useUpdatePerformanceData, useUpdateNoiseData, useAddBladeConfiguration } from '@/hooks/useFanDatabase';
import { FanPerformancePoint, OctaveBandData, calculateOverallFromOctaveBands } from '@/lib/fanData';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';

interface ExcelImportExportProps {
  selectedSeries?: string;
}

export function ExcelImportExport({ selectedSeries }: ExcelImportExportProps) {
  const { data: fanModels = [] } = useFanModels();
  const { data: series = [] } = useFanSeries();
  const addFanMutation = useAddFanModel();
  const addBladeConfigMutation = useAddBladeConfiguration();
  const updatePerformanceMutation = useUpdatePerformanceData();
  const updateNoiseMutation = useUpdateNoiseData();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);

  // Export all fan data to Excel
  const handleExport = () => {
    // Filter fans by series if specified
    const fansToExport = selectedSeries 
      ? fanModels.filter(f => f.series === selectedSeries)
      : fanModels;

    const workbook = XLSX.utils.book_new();

    if (fansToExport.length === 0) {
      // Create template with example structure
      const templateData = createTemplateData(selectedSeries || 'KAF');
      const ws = XLSX.utils.json_to_sheet(templateData);
      XLSX.utils.book_append_sheet(workbook, ws, 'Fan Data Template');
      
      // Add instructions sheet
      const instructions = [
        { Instructions: 'How to use this template:' },
        { Instructions: '1. Fill in the data for each row (each row = one performance point)' },
        { Instructions: '2. Series, Diameter, BladeCount, BladeAngle identify the fan configuration' },
        { Instructions: '3. PointIndex (1-12) identifies the duty point' },
        { Instructions: '4. Performance: Airflow (CMH), StaticPressure (Pa), ShaftPower (kW), Efficiency (%)' },
        { Instructions: '5. Noise: Hz63, Hz125, Hz250, Hz500, Hz1k, Hz2k, Hz4k, Hz8k, Overall (dB) - only on PointIndex 1' },
        { Instructions: '6. MotorPoles: single value (2, 4, 6, etc.) or comma-separated (2,4,6)' },
        { Instructions: '7. Save and import back to update the database' },
      ];
      const wsInstructions = XLSX.utils.json_to_sheet(instructions);
      XLSX.utils.book_append_sheet(workbook, wsInstructions, 'Instructions');
    } else {
      // Export existing data
      const exportData: any[] = [];

      fansToExport.forEach(fan => {
        fan.bladeConfigurations.forEach(config => {
          const bladeAngles = config.bladeAngles || Object.keys(config.performanceData).map(Number);
          
          bladeAngles.forEach(angle => {
            const perfData = config.performanceData[angle] || [];
            const noiseData = config.noiseData[angle];

            const numPoints = Math.max(perfData.length, 12);
            for (let i = 0; i < numPoints; i++) {
              const point = perfData[i] || { airflow: 0, staticPressure: 0, shaftPower: 0, efficiency: 0 };
              exportData.push({
                Series: fan.series,
                Diameter: fan.diameter,
                MotorPoles: fan.motorPoles[0] || 2, // Export first motor pole for simplicity
                BladeCount: config.bladeCount,
                BladeAngle: angle,
                PointIndex: i + 1,
                Airflow: point.airflow,
                StaticPressure: point.staticPressure,
                ShaftPower: point.shaftPower,
                Efficiency: point.efficiency,
                Hz63: i === 0 && noiseData ? noiseData.hz63 : '',
                Hz125: i === 0 && noiseData ? noiseData.hz125 : '',
                Hz250: i === 0 && noiseData ? noiseData.hz250 : '',
                Hz500: i === 0 && noiseData ? noiseData.hz500 : '',
                Hz1k: i === 0 && noiseData ? noiseData.hz1k : '',
                Hz2k: i === 0 && noiseData ? noiseData.hz2k : '',
                Hz4k: i === 0 && noiseData ? noiseData.hz4k : '',
                Hz8k: i === 0 && noiseData ? noiseData.hz8k : '',
                Overall: i === 0 && noiseData ? noiseData.overall : '',
              });
            }
          });
        });
      });

      const ws = XLSX.utils.json_to_sheet(exportData);
      ws['!cols'] = [
        { wch: 12 }, { wch: 10 }, { wch: 12 }, { wch: 12 }, { wch: 12 },
        { wch: 12 }, { wch: 12 }, { wch: 14 }, { wch: 12 }, { wch: 12 },
        { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 8 },
        { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 10 },
      ];
      XLSX.utils.book_append_sheet(workbook, ws, 'Fan Data');
    }

    const filename = selectedSeries 
      ? `fan_data_${selectedSeries}_${new Date().toISOString().split('T')[0]}.xlsx`
      : `fan_data_all_${new Date().toISOString().split('T')[0]}.xlsx`;

    XLSX.writeFile(workbook, filename);
    toast.success(`Exported ${fansToExport.length} fans to Excel`);
  };

  const createTemplateData = (seriesName: string) => {
    const template: any[] = [];
    const sampleDiameters = [315];
    const sampleBlades = [4, 6];
    const sampleAngles = [20, 25, 30];

    sampleDiameters.forEach(diameter => {
      sampleBlades.forEach(bladeCount => {
        sampleAngles.forEach(angle => {
          for (let i = 0; i < 12; i++) {
            template.push({
              Series: seriesName,
              Diameter: diameter,
              MotorPoles: 2,
              BladeCount: bladeCount,
              BladeAngle: angle,
              PointIndex: i + 1,
              Airflow: 0,
              StaticPressure: 0,
              ShaftPower: 0,
              Efficiency: 0,
              Hz63: i === 0 ? 0 : '',
              Hz125: i === 0 ? 0 : '',
              Hz250: i === 0 ? 0 : '',
              Hz500: i === 0 ? 0 : '',
              Hz1k: i === 0 ? 0 : '',
              Hz2k: i === 0 ? 0 : '',
              Hz4k: i === 0 ? 0 : '',
              Hz8k: i === 0 ? 0 : '',
              Overall: i === 0 ? 0 : '',
            });
          }
        });
      });
    });

    return template;
  };

  // Import Excel file
  const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setImporting(true);
    const reader = new FileReader();
    
    reader.onload = async (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet);

        if (jsonData.length === 0) {
          toast.error('No data found in the Excel file');
          setImporting(false);
          return;
        }

        // Group data by fan (series + diameter + bladeCount + bladeAngle)
        interface ImportData {
          seriesName: string;
          diameter: number;
          motorPoles: number[];
          bladeConfigs: Map<number, {
            bladeAngles: Map<number, {
              performancePoints: FanPerformancePoint[];
              noiseData: OctaveBandData | null;
            }>;
          }>;
        }

        const fanDataMap = new Map<string, ImportData>();

        jsonData.forEach((row: any) => {
          const seriesName = row.Series?.toString()?.trim() || '';
          const diameter = parseInt(row.Diameter) || 0;
          const bladeCount = parseInt(row.BladeCount) || 0;
          const bladeAngle = parseInt(row.BladeAngle) || 0;
          const pointIndex = parseInt(row.PointIndex) || 1;
          
          // Handle MotorPoles - can be single number or comma-separated
          let motorPoles: number[] = [];
          const motorPolesVal = row.MotorPoles;
          if (typeof motorPolesVal === 'number') {
            motorPoles = [motorPolesVal];
          } else if (typeof motorPolesVal === 'string') {
            motorPoles = motorPolesVal.split(',').map((p: string) => parseInt(p.trim())).filter((p: number) => !isNaN(p) && p > 0);
          }
          if (motorPoles.length === 0) motorPoles = [2];

          if (!seriesName || !diameter || !bladeCount || !bladeAngle) return;

          const fanKey = `${seriesName}-${diameter}`;
          
          if (!fanDataMap.has(fanKey)) {
            fanDataMap.set(fanKey, {
              seriesName,
              diameter,
              motorPoles,
              bladeConfigs: new Map(),
            });
          }

          const fanData = fanDataMap.get(fanKey)!;
          
          // Merge motor poles
          motorPoles.forEach(mp => {
            if (!fanData.motorPoles.includes(mp)) {
              fanData.motorPoles.push(mp);
            }
          });
          
          if (!fanData.bladeConfigs.has(bladeCount)) {
            fanData.bladeConfigs.set(bladeCount, { bladeAngles: new Map() });
          }

          const bladeConfig = fanData.bladeConfigs.get(bladeCount)!;
          
          if (!bladeConfig.bladeAngles.has(bladeAngle)) {
            bladeConfig.bladeAngles.set(bladeAngle, {
              performancePoints: Array(12).fill(null).map(() => ({ airflow: 0, staticPressure: 0, shaftPower: 0, efficiency: 0 })),
              noiseData: null,
            });
          }

          const angleData = bladeConfig.bladeAngles.get(bladeAngle)!;

          // Set performance point
          if (pointIndex >= 1 && pointIndex <= 12) {
            angleData.performancePoints[pointIndex - 1] = {
              airflow: parseFloat(row.Airflow) || 0,
              staticPressure: parseFloat(row.StaticPressure) || 0,
              shaftPower: parseFloat(row.ShaftPower) || 0,
              efficiency: parseFloat(row.Efficiency) || 0,
            };
          }

          // Set noise data (only from first point - check if Hz63 has any value including 0)
          if (pointIndex === 1 && row.Hz63 !== undefined && row.Hz63 !== null && row.Hz63 !== '') {
            const octaveData = {
              hz63: parseFloat(row.Hz63) || 0,
              hz125: parseFloat(row.Hz125) || 0,
              hz250: parseFloat(row.Hz250) || 0,
              hz500: parseFloat(row.Hz500) || 0,
              hz1k: parseFloat(row.Hz1k) || 0,
              hz2k: parseFloat(row.Hz2k) || 0,
              hz4k: parseFloat(row.Hz4k) || 0,
              hz8k: parseFloat(row.Hz8k) || 0,
              overall: 0,
            };
            // Auto-calculate overall from octave bands
            octaveData.overall = calculateOverallFromOctaveBands(octaveData);
            angleData.noiseData = octaveData;
          }
        });

        let createdFans = 0;
        let updatedConfigs = 0;
        let errors: string[] = [];

        for (const [fanKey, fanData] of fanDataMap.entries()) {
          // Find series ID by name (case-insensitive, also try partial match)
          let matchingSeries = series.find(s => 
            s.name.toLowerCase() === fanData.seriesName.toLowerCase()
          );
          
          // Try partial match if exact match not found
          if (!matchingSeries) {
            matchingSeries = series.find(s => 
              s.name.toLowerCase().includes(fanData.seriesName.toLowerCase()) ||
              fanData.seriesName.toLowerCase().includes(s.name.toLowerCase())
            );
          }
          
          if (!matchingSeries) {
            errors.push(`Series "${fanData.seriesName}" not found. Available: ${series.map(s => s.name).join(', ')}`);
            continue;
          }

          // Check if fan exists
          const existingFan = fanModels.find(f => 
            (f as any).seriesId === matchingSeries.id && f.diameter === fanData.diameter
          );
          
          if (existingFan) {
            // Update existing fan's blade configurations and performance data
            for (const [bladeCount, bladeConfig] of fanData.bladeConfigs.entries()) {
              // Find existing blade configuration
              const existingBladeConfig = existingFan.bladeConfigurations.find(bc => bc.bladeCount === bladeCount);
              
              if (existingBladeConfig && (existingBladeConfig as any).id) {
                // Update performance and noise data for each angle
                for (const [bladeAngle, angleData] of bladeConfig.bladeAngles.entries()) {
                  try {
                    // Update performance data
                    await updatePerformanceMutation.mutateAsync({
                      bladeConfigId: (existingBladeConfig as any).id,
                      bladeAngle,
                      points: angleData.performancePoints,
                    });
                    
                    // Update noise data if present
                    if (angleData.noiseData) {
                      await updateNoiseMutation.mutateAsync({
                        bladeConfigId: (existingBladeConfig as any).id,
                        bladeAngle,
                        noiseData: angleData.noiseData,
                      });
                    }
                    updatedConfigs++;
                  } catch (err: any) {
                    console.error('Failed to update performance data:', err);
                    errors.push(`Failed to update ${fanData.diameter}mm blade ${bladeCount} angle ${bladeAngle}`);
                  }
                }
              } else {
                // Add new blade configuration
                try {
                  const bladeAngles = Array.from(bladeConfig.bladeAngles.keys());
                  await addBladeConfigMutation.mutateAsync({
                    fanModelId: existingFan.id,
                    bladeCount,
                    bladeAngles,
                  });
                  updatedConfigs++;
                } catch (err: any) {
                  console.error('Failed to add blade config:', err);
                  errors.push(`Failed to add blade config for ${fanData.diameter}mm`);
                }
              }
            }
          } else {
            // Create new fan
            try {
              const bladeConfigurations = Array.from(fanData.bladeConfigs.entries()).map(([bladeCount, config]) => ({
                blade_count: bladeCount,
                blade_angles: Array.from(config.bladeAngles.keys()).sort((a, b) => a - b),
              }));

              const newFan = await addFanMutation.mutateAsync({
                diameter: fanData.diameter,
                series_id: matchingSeries.id,
                motor_poles: fanData.motorPoles.sort((a, b) => a - b),
                blade_configurations: bladeConfigurations,
              });
              createdFans++;
              
              // After creating the fan, update performance data for each blade config
              if (newFan && newFan.bladeConfigurations) {
                for (const [bladeCount, bladeConfig] of fanData.bladeConfigs.entries()) {
                  const newBladeConfig = newFan.bladeConfigurations.find((bc: any) => bc.bladeCount === bladeCount);
                  
                  if (newBladeConfig && newBladeConfig.id) {
                    for (const [bladeAngle, angleData] of bladeConfig.bladeAngles.entries()) {
                      try {
                        // Update performance data
                        await updatePerformanceMutation.mutateAsync({
                          bladeConfigId: newBladeConfig.id,
                          bladeAngle,
                          points: angleData.performancePoints,
                        });
                        
                        // Update noise data if present
                        if (angleData.noiseData) {
                          await updateNoiseMutation.mutateAsync({
                            bladeConfigId: newBladeConfig.id,
                            bladeAngle,
                            noiseData: angleData.noiseData,
                          });
                        }
                        updatedConfigs++;
                      } catch (err: any) {
                        console.error('Failed to update new fan performance data:', err);
                        errors.push(`Failed to set data for new ${fanData.diameter}mm blade ${bladeCount} angle ${bladeAngle}`);
                      }
                    }
                  }
                }
              }
            } catch (err: any) {
              console.error('Failed to create fan:', err);
              errors.push(`Failed to create ${fanData.diameter}mm fan`);
            }
          }
        }

        // Show results
        if (createdFans > 0 || updatedConfigs > 0) {
          toast.success(`Import complete: ${createdFans} fan(s) created, ${updatedConfigs} configuration(s) updated`);
        }
        if (errors.length > 0) {
          toast.error(`${errors.length} error(s): ${errors.slice(0, 3).join(', ')}${errors.length > 3 ? '...' : ''}`);
        }
        
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      } catch (error) {
        console.error('Import error:', error);
        toast.error('Failed to import Excel file. Please check the format.');
      } finally {
        setImporting(false);
      }
    };

    reader.readAsArrayBuffer(file);
  };

  return (
    <div className="flex items-center gap-2">
      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        onChange={handleImport}
        className="hidden"
        disabled={importing}
      />
      
      <Button variant="outline" size="sm" onClick={handleExport} disabled={importing}>
        <Download className="w-4 h-4" />
        Export
      </Button>
      
      <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={importing}>
        {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
        {importing ? 'Importing...' : 'Import'}
      </Button>
    </div>
  );
}
