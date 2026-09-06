import { useState } from 'react';
import { Scale, Plus, X, Wind, Gauge, Zap, Volume2, Check, Minus, DoorOpen, Ruler, Weight } from 'lucide-react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useFanModels, useFanSeries } from '@/hooks/useFanDatabase';
import { useAirCurtainModels, useAirCurtainSeries } from '@/hooks/useAirCurtains';
import { applyFanLawsForPoles, applyNoiseFanLawsForPoles } from '@/lib/fanData';
import { formatPower } from '@/lib/utils';
import type { AirCurtainModel } from '@/lib/airCurtainData';

interface ComparisonAirCurtain {
  id: string;
  seriesName: string;
  model: AirCurtainModel;
}

interface ComparisonFan {
  id: string;
  seriesName: string;
  modelName: string;
  diameter: number;
  bladeCount: number | null;
  bladeAngle: number | null;
  motorPoles: number[];
  selectedPole: number; // The motor pole selected for comparison
}

export default function ComparePage() {
  const { data: fanModels = [] } = useFanModels();
  const { data: seriesList = [] } = useFanSeries();
  const { data: acModels = [] } = useAirCurtainModels();
  const { data: acSeriesList = [] } = useAirCurtainSeries();
  const [selectedFans, setSelectedFans] = useState<ComparisonFan[]>([]);
  const [selectedCurtains, setSelectedCurtains] = useState<ComparisonAirCurtain[]>([]);
  const [selectedAcSeries, setSelectedAcSeries] = useState<string>('');
  const [selectedAcModel, setSelectedAcModel] = useState<string>('');
  const [selectedSeries, setSelectedSeries] = useState<string>('');
  const [selectedModel, setSelectedModel] = useState<string>('');
  const [selectedBladeConfig, setSelectedBladeConfig] = useState<string>('');
  const [selectedMotorPole, setSelectedMotorPole] = useState<string>('');

  // Air curtain models for selected series
  const acSeriesModels = acModels.filter(m => m.seriesId === selectedAcSeries);

  const handleAddCurtain = () => {
    if (!selectedAcSeries || !selectedAcModel) return;
    const series = acSeriesList.find(s => s.id === selectedAcSeries);
    const model = acModels.find(m => m.id === selectedAcModel);
    if (!series || !model) return;
    if (selectedCurtains.length >= 3) return;

    const newCurtain: ComparisonAirCurtain = {
      id: `${selectedAcSeries}-${selectedAcModel}`,
      seriesName: series.name,
      model,
    };
    if (!selectedCurtains.find(c => c.id === newCurtain.id)) {
      setSelectedCurtains(prev => [...prev, newCurtain]);
    }
    setSelectedAcSeries('');
    setSelectedAcModel('');
  };

  const handleRemoveCurtain = (id: string) => {
    setSelectedCurtains(prev => prev.filter(c => c.id !== id));
  };

  const fmtVal = (v: number | null | undefined, unit: string) => v === null || v === undefined ? 'N/A' : `${v.toLocaleString()} ${unit}`;

  const acComparisonRows: { label: string; icon: typeof Wind; getValue: (c: ComparisonAirCurtain) => string }[] = [
    { label: 'Series', icon: Wind, getValue: c => c.seriesName },
    { label: 'Model', icon: Gauge, getValue: c => c.model.model },
    { label: 'Category', icon: DoorOpen, getValue: c => c.model.category.charAt(0).toUpperCase() + c.model.category.slice(1) },
    { label: 'Motor Type', icon: Zap, getValue: c => c.model.motorType },
    { label: 'Length', icon: Ruler, getValue: c => fmtVal(c.model.lengthMm, 'mm') },
    { label: 'Air Volume (High)', icon: Wind, getValue: c => fmtVal(c.model.airVolumeCmh, 'm³/h') },
    { label: 'Air Volume (Low)', icon: Wind, getValue: c => fmtVal(c.model.airVolumeLowCmh, 'm³/h') },
    { label: 'Air Velocity (High)', icon: Gauge, getValue: c => fmtVal(c.model.airVelocityMs, 'm/s') },
    { label: 'Air Velocity (Low)', icon: Gauge, getValue: c => fmtVal(c.model.airVelocityLowMs, 'm/s') },
    { label: 'Input Power (High)', icon: Zap, getValue: c => fmtVal(c.model.inputPowerW, 'W') },
    { label: 'Input Power (Low)', icon: Zap, getValue: c => fmtVal(c.model.inputPowerLowW, 'W') },
    { label: 'Noise (High)', icon: Volume2, getValue: c => fmtVal(c.model.noiseDb, 'dB(A)') },
    { label: 'Noise (Low)', icon: Volume2, getValue: c => fmtVal(c.model.noiseLowDb, 'dB(A)') },
    { label: 'Net Weight', icon: Weight, getValue: c => fmtVal(c.model.netWeightKg, 'kg') },
    { label: 'Mounting Height', icon: Ruler, getValue: c => {
        const { mountingHeightMin, mountingHeightMax } = c.model;
        if (mountingHeightMin == null && mountingHeightMax == null) return 'N/A';
        if (mountingHeightMin != null && mountingHeightMax != null) return `${mountingHeightMin} – ${mountingHeightMax} m`;
        return fmtVal(mountingHeightMax ?? mountingHeightMin, 'm');
      } },
    { label: 'Voltage', icon: Zap, getValue: c => c.model.voltage || 'N/A' },
  ];

  // Get fan models for selected series
  const seriesFans = fanModels.filter(f => (f as any).seriesId === selectedSeries);

  // Get blade configurations for selected model
  const selectedFanModel = seriesFans.find(f => f.id === selectedModel);
  const bladeConfigs = selectedFanModel?.bladeConfigurations || [];
  const hasBladeConfigs = bladeConfigs.length > 0 && bladeConfigs.some(bc => bc.bladeAngles && bc.bladeAngles.length > 0);
  const availableMotorPoles = selectedFanModel?.motorPoles || [];

  const handleAddFan = () => {
    // Blade config only required if fan has blade configurations
    const bladeConfigRequired = hasBladeConfigs;
    if (!selectedSeries || !selectedModel || !selectedMotorPole) return;
    if (bladeConfigRequired && !selectedBladeConfig) return;
    
    let bladeCount: number | null = null;
    let bladeAngle: number | null = null;
    
    if (selectedBladeConfig) {
      const [bc, ba] = selectedBladeConfig.split('-').map(Number);
      bladeCount = bc;
      bladeAngle = ba;
    }
    
    const series = seriesList.find(s => s.id === selectedSeries);
    const fan = seriesFans.find(f => f.id === selectedModel);
    
    if (!series || !fan) return;
    
    const motorPole = parseInt(selectedMotorPole);
    const modelDisplayName = fan.modelName || `${fan.diameter}mm`;
    const configId = selectedBladeConfig || 'no-blade';
    const newFan: ComparisonFan = {
      id: `${selectedSeries}-${selectedModel}-${configId}-${motorPole}P`,
      seriesName: series.name,
      modelName: modelDisplayName,
      diameter: fan.diameter,
      bladeCount,
      bladeAngle,
      motorPoles: fan.motorPoles || [],
      selectedPole: motorPole,
    };

    if (selectedFans.length >= 3) {
      return;
    }

    if (!selectedFans.find(f => f.id === newFan.id)) {
      setSelectedFans(prev => [...prev, newFan]);
    }

    // Reset selections
    setSelectedSeries('');
    setSelectedModel('');
    setSelectedBladeConfig('');
    setSelectedMotorPole('');
  };

  const handleRemoveFan = (id: string) => {
    setSelectedFans(prev => prev.filter(f => f.id !== id));
  };

  const getPerformanceData = (fan: ComparisonFan) => {
    const series = seriesList.find(s => s.name === fan.seriesName);
    const model = fanModels.find(m => 
      (m as any).seriesId === series?.id &&
      m.diameter === fan.diameter
    );
    
    const bladeConfig = model?.bladeConfigurations?.find(bc => 
      bc.bladeCount === fan.bladeCount
    );
    
    const referencePoles = (model as any)?.referencePoles || 4;
    
    // Get performance data for the specific angle
    const perfDataByAngle = bladeConfig?.performanceData;
    let maxAirflowPoint = null;
    let maxPressurePoint = null;
    let maxShaftPowerPoint = null;
    
    if (perfDataByAngle && typeof perfDataByAngle === 'object') {
      let angleData = (perfDataByAngle as any)[fan.bladeAngle];
      if (Array.isArray(angleData) && angleData.length > 0) {
        // Apply fan laws to scale data based on selected motor pole
        if (fan.selectedPole !== referencePoles) {
          angleData = applyFanLawsForPoles(angleData, referencePoles, fan.selectedPole, 50);
        }
        
        // Get the point with highest airflow
        maxAirflowPoint = angleData.reduce((max: any, curr: any) => 
          curr.airflow > max.airflow ? curr : max
        , angleData[0]);
        
        // Get the point with highest pressure
        maxPressurePoint = angleData.reduce((max: any, curr: any) => 
          curr.staticPressure > max.staticPressure ? curr : max
        , angleData[0]);
        
        // Get the point with highest shaft power
        maxShaftPowerPoint = angleData.reduce((max: any, curr: any) => 
          curr.shaftPower > max.shaftPower ? curr : max
        , angleData[0]);
      }
    }
    
    // Get noise data for the specific angle
    const noiseDataByAngle = bladeConfig?.noiseData;
    let noiseData = null;
    if (noiseDataByAngle && typeof noiseDataByAngle === 'object') {
      const rawNoiseData = (noiseDataByAngle as any)[fan.bladeAngle];
      if (rawNoiseData) {
        // Apply acoustic fan laws to scale noise based on selected motor pole
        if (fan.selectedPole !== referencePoles) {
          noiseData = applyNoiseFanLawsForPoles(rawNoiseData, referencePoles, fan.selectedPole, 50);
        } else {
          noiseData = rawNoiseData;
        }
      }
    }

    return { maxAirflowPoint, maxPressurePoint, maxShaftPowerPoint, noiseData };
  };

  const comparisonRows = [
    { 
      label: 'Series', 
      icon: Wind,
      getValue: (fan: ComparisonFan) => fan.seriesName 
    },
    { 
      label: 'Model', 
      icon: Gauge,
      getValue: (fan: ComparisonFan) => fan.modelName
    },
    { 
      label: 'Blade Count', 
      icon: Wind,
      getValue: (fan: ComparisonFan) => fan.bladeCount ? `${fan.bladeCount} blades` : 'N/A'
    },
    { 
      label: 'Blade Angle', 
      icon: Wind,
      getValue: (fan: ComparisonFan) => fan.bladeAngle ? `${fan.bladeAngle}°` : 'N/A'
    },
    {
      label: 'Motor Pole', 
      icon: Zap,
      getValue: (fan: ComparisonFan) => `${fan.selectedPole}P`
    },
    { 
      label: 'Max Airflow (est.)', 
      icon: Wind,
      getValue: (fan: ComparisonFan) => {
        const { maxAirflowPoint } = getPerformanceData(fan);
        return maxAirflowPoint ? `${maxAirflowPoint.airflow.toLocaleString()} m³/h` : 'N/A';
      }
    },
    { 
      label: 'Max Pressure (est.)', 
      icon: Gauge,
      getValue: (fan: ComparisonFan) => {
        const { maxPressurePoint } = getPerformanceData(fan);
        return maxPressurePoint ? `${maxPressurePoint.staticPressure} Pa` : 'N/A';
      }
    },
    { 
      label: 'Max Shaft Power (est.)', 
      icon: Zap,
      getValue: (fan: ComparisonFan) => {
        const { maxShaftPowerPoint } = getPerformanceData(fan);
        return maxShaftPowerPoint ? `${formatPower(maxShaftPowerPoint.shaftPower)} kW` : 'N/A';
      }
    },
    { 
      label: 'Sound Level (est.)', 
      icon: Volume2,
      getValue: (fan: ComparisonFan) => {
        const { noiseData } = getPerformanceData(fan);
        return noiseData?.overall ? `${noiseData.overall} dB(A)` : 'N/A';
      }
    },
  ];

  return (
    <MainLayout>
      {/* Hero Section */}
      <section className="bg-gradient-primary text-primary-foreground py-10">
        <div className="container mx-auto px-4">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 bg-primary-foreground/20 rounded-2xl flex items-center justify-center">
              <Scale className="w-8 h-8" />
            </div>
            <div>
              <h1 className="text-3xl font-bold">Product Comparison</h1>
              <h2 className="sr-only">Side-by-side fan and air curtain performance comparison</h2>
              <p className="text-primary-foreground/80 mt-1">
                Compare up to 3 fans or air curtains side by side
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="container mx-auto px-4 py-8">
        <Tabs defaultValue="fans" className="w-full">
          <TabsList className="mb-6">
            <TabsTrigger value="fans">
              <Wind className="w-4 h-4 mr-2" />
              Fans
            </TabsTrigger>
            <TabsTrigger value="air-curtains">
              <DoorOpen className="w-4 h-4 mr-2" />
              Air Curtains
            </TabsTrigger>
          </TabsList>

          <TabsContent value="fans">
        {/* Add Fan Card */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="text-lg">Add Fan to Compare</CardTitle>
            <CardDescription>Select a fan configuration to add to the comparison</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-4 items-end">
              <div className="w-48">
                <label className="text-sm font-medium mb-1 block">Series</label>
                <Select value={selectedSeries} onValueChange={(v) => { setSelectedSeries(v); setSelectedModel(''); setSelectedBladeConfig(''); setSelectedMotorPole(''); }}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select series" />
                  </SelectTrigger>
                  <SelectContent>
                    {seriesList.map(s => (
                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div className="w-48">
                <label className="text-sm font-medium mb-1 block">Fan Model</label>
                <Select value={selectedModel} onValueChange={(v) => { setSelectedModel(v); setSelectedBladeConfig(''); setSelectedMotorPole(''); }} disabled={!selectedSeries}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select model" />
                  </SelectTrigger>
                  <SelectContent>
                    {seriesFans.map(f => (
                      <SelectItem key={f.id} value={f.id}>
                        {f.modelName || `${f.diameter}mm`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              {hasBladeConfigs && (
                <div className="w-48">
                  <label className="text-sm font-medium mb-1 block">Blade Config</label>
                  <Select value={selectedBladeConfig} onValueChange={(v) => { setSelectedBladeConfig(v); }} disabled={!selectedModel}>
                    <SelectTrigger>
                      <SelectValue placeholder="Blades / Angle" />
                    </SelectTrigger>
                    <SelectContent>
                      {bladeConfigs.map(bc => 
                        bc.bladeAngles?.map(angle => (
                          <SelectItem key={`${bc.bladeCount}-${angle}`} value={`${bc.bladeCount}-${angle}`}>
                            {bc.bladeCount} blades @ {angle}°
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                </div>
              )}
              
              <div className="w-28">
                <label className="text-sm font-medium mb-1 block">Motor Pole</label>
                <Select value={selectedMotorPole} onValueChange={setSelectedMotorPole} disabled={hasBladeConfigs ? !selectedBladeConfig : !selectedModel}>
                  <SelectTrigger>
                    <SelectValue placeholder="Pole" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableMotorPoles.map(pole => (
                      <SelectItem key={pole} value={pole.toString()}>{pole}P</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <Button 
                onClick={handleAddFan} 
                disabled={!selectedMotorPole || selectedFans.length >= 3}
              >
                <Plus className="w-4 h-4 mr-1" />
                Add to Compare
              </Button>
            </div>
            
            {selectedFans.length >= 3 && (
              <p className="text-sm text-muted-foreground mt-2">
                Maximum of 3 fans can be compared. Remove a fan to add another.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Comparison Table */}
        {selectedFans.length > 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>Comparison Results</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-3 px-4 font-medium text-muted-foreground w-48">
                        Specification
                      </th>
                      {selectedFans.map(fan => (
                        <th key={fan.id} className="text-center py-3 px-4 min-w-[180px]">
                          <div className="flex items-center justify-between">
                            <Badge variant="secondary" className="text-xs">
                              {fan.seriesName}
                            </Badge>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 w-6 p-0"
                              onClick={() => handleRemoveFan(fan.id)}
                            >
                              <X className="w-4 h-4" />
                            </Button>
                          </div>
                          <div className="text-lg font-bold mt-1">
                            {fan.modelName}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {fan.bladeCount && fan.bladeAngle ? `${fan.bladeCount}B / ${fan.bladeAngle}° / ` : ''}{fan.selectedPole}P
                          </div>
                        </th>
                      ))}
                      {selectedFans.length < 3 && (
                        <th className="text-center py-3 px-4 min-w-[180px]">
                          <div className="h-full flex items-center justify-center text-muted-foreground/50 border-2 border-dashed rounded-lg py-6">
                            <Plus className="w-5 h-5 mr-1" />
                            Add Fan
                          </div>
                        </th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {comparisonRows.map((row, idx) => (
                      <tr key={row.label} className={idx % 2 === 0 ? 'bg-muted/30' : ''}>
                        <td className="py-3 px-4 font-medium flex items-center gap-2">
                          <row.icon className="w-4 h-4 text-primary" />
                          {row.label}
                        </td>
                        {selectedFans.map(fan => (
                          <td key={fan.id} className="text-center py-3 px-4">
                            {row.getValue(fan)}
                          </td>
                        ))}
                        {selectedFans.length < 3 && <td></td>}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card className="text-center py-16">
            <CardContent>
              <Scale className="w-16 h-16 text-muted-foreground/30 mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">No Fans Selected</h3>
              <p className="text-muted-foreground mb-4">
                Add fans using the selector above to start comparing
              </p>
            </CardContent>
          </Card>
        )}
          </TabsContent>

          <TabsContent value="air-curtains">
        {/* Add Air Curtain Card */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="text-lg">Add Air Curtain to Compare</CardTitle>
            <CardDescription>Select an air curtain to add to the comparison</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-4 items-end">
              <div className="w-48">
                <label className="text-sm font-medium mb-1 block">Series</label>
                <Select value={selectedAcSeries} onValueChange={(v) => { setSelectedAcSeries(v); setSelectedAcModel(''); }}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select series" />
                  </SelectTrigger>
                  <SelectContent>
                    {acSeriesList.map(s => (
                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="w-48">
                <label className="text-sm font-medium mb-1 block">Model</label>
                <Select value={selectedAcModel} onValueChange={setSelectedAcModel} disabled={!selectedAcSeries}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select model" />
                  </SelectTrigger>
                  <SelectContent>
                    {acSeriesModels.map(m => (
                      <SelectItem key={m.id} value={m.id}>{m.model}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <Button
                onClick={handleAddCurtain}
                disabled={!selectedAcModel || selectedCurtains.length >= 3}
              >
                <Plus className="w-4 h-4 mr-1" />
                Add to Compare
              </Button>
            </div>

            {selectedCurtains.length >= 3 && (
              <p className="text-sm text-muted-foreground mt-2">
                Maximum of 3 air curtains can be compared. Remove one to add another.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Air Curtain Comparison Table */}
        {selectedCurtains.length > 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>Comparison Results</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-3 px-4 font-medium text-muted-foreground w-48">
                        Specification
                      </th>
                      {selectedCurtains.map(c => (
                        <th key={c.id} className="text-center py-3 px-4 min-w-[180px]">
                          <div className="flex items-center justify-between">
                            <Badge variant="secondary" className="text-xs">
                              {c.seriesName}
                            </Badge>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 w-6 p-0"
                              onClick={() => handleRemoveCurtain(c.id)}
                            >
                              <X className="w-4 h-4" />
                            </Button>
                          </div>
                          <div className="text-lg font-bold mt-1">{c.model.model}</div>
                          <div className="text-xs text-muted-foreground">
                            {c.model.lengthMm}mm · {c.model.motorType}
                          </div>
                        </th>
                      ))}
                      {selectedCurtains.length < 3 && (
                        <th className="text-center py-3 px-4 min-w-[180px]">
                          <div className="h-full flex items-center justify-center text-muted-foreground/50 border-2 border-dashed rounded-lg py-6">
                            <Plus className="w-5 h-5 mr-1" />
                            Add Air Curtain
                          </div>
                        </th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {acComparisonRows.map((row, idx) => (
                      <tr key={row.label} className={idx % 2 === 0 ? 'bg-muted/30' : ''}>
                        <td className="py-3 px-4 font-medium flex items-center gap-2">
                          <row.icon className="w-4 h-4 text-primary" />
                          {row.label}
                        </td>
                        {selectedCurtains.map(c => (
                          <td key={c.id} className="text-center py-3 px-4">
                            {row.getValue(c)}
                          </td>
                        ))}
                        {selectedCurtains.length < 3 && <td></td>}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card className="text-center py-16">
            <CardContent>
              <DoorOpen className="w-16 h-16 text-muted-foreground/30 mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">No Air Curtains Selected</h3>
              <p className="text-muted-foreground mb-4">
                Add air curtains using the selector above to start comparing
              </p>
            </CardContent>
          </Card>
        )}
          </TabsContent>
        </Tabs>
      </section>
    </MainLayout>
  );
}