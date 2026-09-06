import { useState, useMemo, useEffect } from 'react';
import { Save, X, ChevronDown, ChevronUp, Loader2, Calculator, AlertCircle, Plus, Link2, Minus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent } from '@/components/ui/card';
import { FanModel, FanPerformancePoint, OctaveBandData, getMotorRPM, calculateOverallFromOctaveBands, applyFanLaws, applyNoiseFanLawsForRPM } from '@/lib/fanData';
import { useUpdatePerformanceData, useUpdateNoiseData, useAddBladeConfiguration, useUpdateFanModel, useMotorSpecifications } from '@/hooks/useFanDatabase';
import { toast } from 'sonner';

interface PerformanceDataEditorProps {
  fan: FanModel;
  fanType?: 'axial' | 'centrifugal';
}

export function PerformanceDataEditor({ fan, fanType = 'axial' }: PerformanceDataEditorProps) {
  const updatePerformanceMutation = useUpdatePerformanceData();
  const updateNoiseMutation = useUpdateNoiseData();
  const addBladeConfigMutation = useAddBladeConfiguration();
  const updateFanModelMutation = useUpdateFanModel();
  
  const [isCreatingConfig, setIsCreatingConfig] = useState(false);
  const [isUpdatingBasePole, setIsUpdatingBasePole] = useState(false);
  
  // Guard against empty blade configurations
  const hasBladeConfigs = fan.bladeConfigurations && fan.bladeConfigurations.length > 0;
  const defaultBladeCount = hasBladeConfigs ? fan.bladeConfigurations[0].bladeCount : 4;
  
  // Get blade angles from the fan's configuration
  const currentBladeAngles = hasBladeConfigs ? fan.bladeConfigurations[0]?.bladeAngles || [] : [];
  
  // Available motor poles for this fan - use what's configured, don't add defaults
  const availableMotorPoles = fan.motorPoles && fan.motorPoles.length > 0 
    ? fan.motorPoles 
    : [4]; // Only use default if no poles configured at all
  
  // Reference poles (base data is stored at this pole count)
  const referencePoles = (fan as any).referencePoles || availableMotorPoles[0];
  
  const [selectedBladeConfig, setSelectedBladeConfig] = useState<number>(defaultBladeCount);
  const [selectedAngle, setSelectedAngle] = useState<number>(currentBladeAngles[0] || 0);
  const [selectedMotorPoles, setSelectedMotorPoles] = useState<number>(availableMotorPoles[0]);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editedPerformanceData, setEditedPerformanceData] = useState<FanPerformancePoint[]>([]);
  const [editedNoiseData, setEditedNoiseData] = useState<OctaveBandData | null>(null);
  const [noiseOpen, setNoiseOpen] = useState(false);
  
  // Unified mode: single power for all points (like simplified) vs individual power
  const [useSinglePower, setUseSinglePower] = useState(false);
  const [singlePowerValue, setSinglePowerValue] = useState(0);
  const [singlePowerInput, setSinglePowerInput] = useState('');
  const [singleNoiseValue, setSingleNoiseValue] = useState(0);

  // Calculate Total Efficiency using formula
  const calculateTotalEfficiency = (airflowCMH: number, staticPressurePa: number, shaftPowerKW: number, diameterMM: number): number => {
    if (shaftPowerKW <= 0 || airflowCMH <= 0 || diameterMM <= 0) return 0;
    
    const airflowM3s = airflowCMH / 3600;
    const diameterM = diameterMM / 1000;
    const areaM2 = Math.PI * Math.pow(diameterM / 2, 2);
    const velocity = airflowM3s / areaM2;
    const airDensity = 1.2;
    const velocityPressure = 0.5 * airDensity * Math.pow(velocity, 2);
    const totalPressure = staticPressurePa + velocityPressure;
    
    const totalEfficiency = (airflowM3s * totalPressure) / (shaftPowerKW * 1000) * 100;
    return Math.min(100, Math.max(0, Math.round(totalEfficiency * 10) / 10));
  };

  // Calculate efficiency for display
  const getPointEfficiency = (point: FanPerformancePoint, idx: number): number => {
    const power = useSinglePower ? singlePowerValue : point.shaftPower;
    if (power <= 0 || point.airflow <= 0) return 0;
    return calculateTotalEfficiency(point.airflow, point.staticPressure, power, fan.diameter);
  };

  const currentConfig = hasBladeConfigs
    ? fan.bladeConfigurations.find(bc => bc.bladeCount === selectedBladeConfig) 
    : undefined;
  
  const configBladeAngles = currentConfig?.bladeAngles || [];
  const basePerformanceData = currentConfig?.performanceData?.[selectedAngle] || [];
  const baseNoiseData = currentConfig?.noiseData?.[selectedAngle];
  const bladeConfigId = (currentConfig as any)?.id;

  const isReferencePoles = selectedMotorPoles === referencePoles;
  
  // Detect if existing data has uniform power across all points
  const existingDataHasUniformPower = useMemo(() => {
    if (basePerformanceData.length <= 1) return true;
    const powers = basePerformanceData.map(p => p.shaftPower).filter(p => p > 0);
    if (powers.length === 0) return true;
    return powers.every(p => Math.abs(p - powers[0]) < 0.0001);
  }, [basePerformanceData]);

  // Detect if existing data has octave bands
  const existingDataHasOctaveBands = useMemo(() => {
    return baseNoiseData && (
      baseNoiseData.hz63 || baseNoiseData.hz125 || baseNoiseData.hz250 || 
      baseNoiseData.hz500 || baseNoiseData.hz1k || baseNoiseData.hz2k || 
      baseNoiseData.hz4k || baseNoiseData.hz8k
    );
  }, [baseNoiseData]);
  
  // RPM per pole taken from the motor database (selected motor rpm), falling back to standard values
  const { data: motorSpecs = [] } = useMotorSpecifications();
  const rpmForPoles = useMemo(() => {
    return (poles: number): number => {
      const rpms = motorSpecs
        .filter(s => s.motorPoles === poles && Number(s.rpm) > 0)
        .map(s => Number(s.rpm));
      if (rpms.length === 0) return getMotorRPM(poles, 50);
      // most common rated rpm for this pole count
      const counts = new Map<number, number>();
      rpms.forEach(r => counts.set(r, (counts.get(r) || 0) + 1));
      return [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0][0];
    };
  }, [motorSpecs]);

  const currentRPM = rpmForPoles(selectedMotorPoles);
  const referenceRPM = rpmForPoles(referencePoles);

  // Calculate display data using fan laws
  const displayPerformanceData = useMemo(() => {
    if (isReferencePoles || basePerformanceData.length === 0) {
      return basePerformanceData;
    }
    return applyFanLaws(basePerformanceData, referenceRPM, currentRPM);
  }, [basePerformanceData, referenceRPM, currentRPM, isReferencePoles]);
  
  const displayNoiseData = useMemo(() => {
    if (isReferencePoles || !baseNoiseData) {
      return baseNoiseData;
    }
    return applyNoiseFanLawsForRPM(baseNoiseData, referenceRPM, currentRPM);
  }, [baseNoiseData, referenceRPM, currentRPM, isReferencePoles]);


  // Calculate max efficiency for display - must be before early return
  const maxEfficiency = useMemo(() => {
    return Math.max(...editedPerformanceData.map((p, idx) => getPointEfficiency(p, idx)), 0);
  }, [editedPerformanceData, useSinglePower, singlePowerValue, fan.diameter]);

  const maxEfficiencyPointIndex = useMemo(() => {
    const efficiencies = editedPerformanceData.map((p, idx) => getPointEfficiency(p, idx));
    const max = Math.max(...efficiencies);
    return efficiencies.findIndex(e => e === max);
  }, [editedPerformanceData, useSinglePower, singlePowerValue, fan.diameter]);

  // Handle creating a default blade configuration
  const handleCreateDefaultConfig = async () => {
    setIsCreatingConfig(true);
    try {
      const isCentrifugal = fanType === 'centrifugal';
      await addBladeConfigMutation.mutateAsync({
        fanModelId: fan.id,
        bladeCount: isCentrifugal ? 0 : 4,
        bladeAngles: isCentrifugal ? [0] : [20, 25, 30, 35, 40],
      });
      toast.success('Configuration created! You can now add performance data.');
    } catch (error) {
      console.error('Error creating config:', error);
      toast.error('Failed to create configuration');
    } finally {
      setIsCreatingConfig(false);
    }
  };

  if (!hasBladeConfigs) {
    return (
      <div className="p-4 text-center border rounded-lg bg-muted/20">
        <p className="font-medium text-muted-foreground">No configuration available for data entry.</p>
        <p className="text-sm text-muted-foreground mt-1 mb-3">
          Create a default configuration to start entering performance data.
        </p>
        <Button onClick={handleCreateDefaultConfig} disabled={isCreatingConfig} size="sm">
          {isCreatingConfig ? (
            <Loader2 className="w-4 h-4 mr-1 animate-spin" />
          ) : (
            <Plus className="w-4 h-4 mr-1" />
          )}
          Create Configuration
        </Button>
      </div>
    );
  }

  const isCentrifugalConfig = hasBladeConfigs && fan.bladeConfigurations.every(bc => bc.bladeCount === 0);

  const handleStartEdit = () => {
    // Initialize with existing data - filter out completely empty points (both airflow AND pressure are 0)
    const validPoints = displayPerformanceData.filter(p => 
      !(p.airflow === 0 && p.staticPressure === 0)
    );
    
    // Start with valid points, or at least 1 empty point if no data
    const dataToEdit = validPoints.length > 0 
      ? [...validPoints]
      : [{ airflow: 0, staticPressure: 0, shaftPower: 0, efficiency: 0, totalEfficiency: 0 }];
    
    setEditedPerformanceData(dataToEdit);
    
    // Set up single power mode based on existing data
    setUseSinglePower(existingDataHasUniformPower);
    const firstPower = displayPerformanceData.find(p => p.shaftPower > 0)?.shaftPower || 0;
    setSinglePowerValue(firstPower);
    setSinglePowerInput(firstPower > 0 ? firstPower.toString() : '');
    
    // Set up noise data
    setEditedNoiseData(displayNoiseData ? { ...displayNoiseData } : {
      hz63: 0, hz125: 0, hz250: 0, hz500: 0, hz1k: 0, hz2k: 0, hz4k: 0, hz8k: 0, overall: 0
    });
    setSingleNoiseValue(displayNoiseData?.overall || 0);
    setNoiseOpen(!!existingDataHasOctaveBands);
    
    setIsEditing(true);
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditedPerformanceData([]);
    setEditedNoiseData(null);
    setUseSinglePower(false);
  };

  const handleSave = async () => {
    if (!bladeConfigId) {
      toast.error('Blade configuration not found');
      return;
    }

    setIsSaving(true);
    try {
      // Filter out completely empty points (both airflow AND staticPressure are 0)
      // Keep shut-off points (airflow=0, pressure>0) for centrifugal/mixed flow fans
      const validPoints = editedPerformanceData.filter(p => 
        p.airflow > 0 || p.staticPressure > 0
      );
      
      if (validPoints.length === 0) {
        toast.error('Please enter at least one valid data point');
        setIsSaving(false);
        return;
      }
      
      // Build points with appropriate power values and calculated efficiency
      const points: FanPerformancePoint[] = validPoints.map((p, idx) => {
        const power = useSinglePower ? singlePowerValue : p.shaftPower;
        return {
          airflow: p.airflow,
          staticPressure: p.staticPressure,
          shaftPower: power,
          efficiency: 0,
          totalEfficiency: calculateTotalEfficiency(p.airflow, p.staticPressure, power, fan.diameter),
        };
      });
      
      await updatePerformanceMutation.mutateAsync({
        bladeConfigId,
        bladeAngle: selectedAngle,
        points,
        motorPoles: isReferencePoles ? null : selectedMotorPoles,
      });

      // Save noise data
      const noiseData: OctaveBandData = useSinglePower && !noiseOpen
        ? { hz63: 0, hz125: 0, hz250: 0, hz500: 0, hz1k: 0, hz2k: 0, hz4k: 0, hz8k: 0, overall: singleNoiseValue }
        : editedNoiseData || { hz63: 0, hz125: 0, hz250: 0, hz500: 0, hz1k: 0, hz2k: 0, hz4k: 0, hz8k: 0, overall: 0 };
      
      await updateNoiseMutation.mutateAsync({
        bladeConfigId,
        bladeAngle: selectedAngle,
        noiseData,
        motorPoles: isReferencePoles ? null : selectedMotorPoles,
      });

      setIsEditing(false);
      toast.success(`${isReferencePoles ? 'Base' : `${selectedMotorPoles}P`} data updated successfully`);
    } catch (error) {
      console.error('Error saving performance data:', error);
      toast.error('Failed to save performance data');
    } finally {
      setIsSaving(false);
    }
  };

  const updatePerformancePoint = (index: number, field: keyof FanPerformancePoint, value: string) => {
    const numValue = parseFloat(value) || 0;
    setEditedPerformanceData(prev => 
      prev.map((point, i) => i === index ? { ...point, [field]: numValue } : point)
    );
  };

  const updateNoiseValue = (field: keyof OctaveBandData, value: string) => {
    const numValue = parseFloat(value) || 0;
    setEditedNoiseData(prev => {
      if (!prev) return null;
      const updated = { ...prev, [field]: numValue };
      updated.overall = calculateOverallFromOctaveBands(updated);
      return updated;
    });
  };

  // Apply single power to all points when toggling or changing value
  const handleSinglePowerChange = (value: string) => {
    if (value === '' || /^[0-9]*\.?[0-9]*$/.test(value)) {
      setSinglePowerInput(value);
      const numVal = parseFloat(value) || 0;
      setSinglePowerValue(numVal);
    }
  };

  // Add a new data point
  const handleAddPoint = () => {
    setEditedPerformanceData(prev => [
      ...prev,
      { airflow: 0, staticPressure: 0, shaftPower: 0, efficiency: 0, totalEfficiency: 0 }
    ]);
  };

  // Remove a data point
  const handleRemovePoint = (index: number) => {
    if (editedPerformanceData.length <= 1) {
      toast.error('At least one data point is required');
      return;
    }
    setEditedPerformanceData(prev => prev.filter((_, i) => i !== index));
  };

  // Check if a point has valid data (not completely empty)
  const isValidPoint = (point: FanPerformancePoint) => {
    // A point is valid if it has airflow OR pressure (shut-off points have airflow=0 but pressure>0)
    return point.airflow > 0 || point.staticPressure > 0;
  };

  return (
    <div className="space-y-4">
      {/* Selection Controls */}
      <div className="flex flex-wrap gap-4 items-end">
        {!isCentrifugalConfig && (
          <div className="space-y-1.5">
            <Label className="text-xs">Blade Count</Label>
            <Select 
              value={selectedBladeConfig.toString()} 
              onValueChange={(v) => {
                setSelectedBladeConfig(parseInt(v));
                setIsEditing(false);
              }}
            >
              <SelectTrigger className="w-[120px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-popover">
                {fan.bladeConfigurations.map(bc => (
                  <SelectItem key={bc.bladeCount} value={bc.bladeCount.toString()}>
                    {bc.bladeCount} Blades
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {!isCentrifugalConfig && (
          <div className="space-y-1.5">
            <Label className="text-xs">Blade Angle</Label>
            <Select 
              value={selectedAngle.toString()} 
              onValueChange={(v) => {
                setSelectedAngle(parseInt(v));
                setIsEditing(false);
              }}
            >
              <SelectTrigger className="w-[100px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-popover">
                {configBladeAngles.length > 0 ? (
                  configBladeAngles.map(angle => (
                    <SelectItem key={angle} value={angle.toString()}>
                      {angle}°
                    </SelectItem>
                  ))
                ) : (
                  <SelectItem value="0" disabled>No angles configured</SelectItem>
                )}
              </SelectContent>
            </Select>
          </div>
        )}

        <div className="space-y-1.5">
          <Label className="text-xs">Motor Poles</Label>
          <Select 
            value={selectedMotorPoles.toString()} 
            onValueChange={(v) => {
              setSelectedMotorPoles(parseInt(v));
              setIsEditing(false);
            }}
          >
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-popover">
              {availableMotorPoles.map(poles => (
                <SelectItem key={poles} value={poles.toString()}>
                  {poles}P ({rpmForPoles(poles)} RPM)
                  {poles === referencePoles && ' ✓'}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">Base Data Pole</Label>
          <Select 
            value={referencePoles.toString()} 
            onValueChange={async (v) => {
              const newReferencePoles = parseInt(v);
              setIsUpdatingBasePole(true);
              try {
                await updateFanModelMutation.mutateAsync({
                  id: fan.id,
                  updates: { reference_poles: newReferencePoles }
                });
                toast.success(`Base data pole updated to ${newReferencePoles}P`);
              } catch (error) {
                console.error('Error updating base pole:', error);
                toast.error('Failed to update base data pole');
              } finally {
                setIsUpdatingBasePole(false);
              }
            }}
            disabled={isUpdatingBasePole}
          >
            <SelectTrigger className="w-[130px]">
              {isUpdatingBasePole ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <SelectValue />
              )}
            </SelectTrigger>
            <SelectContent className="bg-popover">
              {availableMotorPoles.map(poles => (
                <SelectItem key={poles} value={poles.toString()}>
                  {poles}P @ {rpmForPoles(poles)} RPM (Base)
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex gap-2 ml-auto">
          {isEditing ? (
            <>
              <Button onClick={handleSave} size="sm" disabled={isSaving}>
                {isSaving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Save className="w-4 h-4 mr-1" />}
                {isSaving ? 'Saving...' : 'Save'}
              </Button>
              <Button onClick={handleCancelEdit} variant="outline" size="sm" disabled={isSaving}>
                <X className="w-4 h-4 mr-1" />
                Cancel
              </Button>
            </>
          ) : (
            <Button onClick={handleStartEdit} size="sm">
              Edit Data
            </Button>
          )}
        </div>
      </div>

      {/* Status Banner */}
      <div className="flex items-center gap-2 flex-wrap">
        <Badge variant={isReferencePoles ? "default" : "secondary"} className="gap-1">
          {isReferencePoles ? (
            <>Base Data ({referencePoles}P @ {referenceRPM} RPM)</>
          ) : (
            <>
              <Calculator className="w-3 h-3" />
              Calculated from {referencePoles}P → {selectedMotorPoles}P ({currentRPM} RPM)
            </>
          )}
        </Badge>
        {!isReferencePoles && (
          <span className="text-xs text-muted-foreground">
            Edit to override calculated values with actual test data
          </span>
        )}
      </div>

      {/* Info Alert for non-reference poles */}
      {!isReferencePoles && !isEditing && (
        <Alert className="bg-muted/50">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription className="text-xs">
            Values shown are calculated using fan laws. Click "Edit Data" to override with actual measured data for {selectedMotorPoles}P.
          </AlertDescription>
        </Alert>
      )}

      {/* Performance Data Summary Display (when not editing) */}
      {!isEditing && displayPerformanceData.length > 0 && (
        <Card>
          <CardContent className="p-4">
            {displayPerformanceData.length > 1 && (
              <div className="text-sm font-medium text-muted-foreground mb-3">
                {displayPerformanceData.length} Curve Points
              </div>
            )}
            <div className="grid grid-cols-3 gap-4">
              <div className="kinair-stat">
                <div className="kinair-stat-label">Max Power</div>
                <div className="kinair-stat-value">{Math.max(...displayPerformanceData.map(p => p.shaftPower || 0)).toFixed(3)} kW</div>
              </div>
              <div className="kinair-stat">
                <div className="kinair-stat-label">Max Efficiency</div>
                <div className="kinair-stat-value">{Math.max(...displayPerformanceData.map(p => p.totalEfficiency || 0)).toFixed(1)}%</div>
              </div>
              <div className="kinair-stat">
                <div className="kinair-stat-label">Overall Noise</div>
                <div className="kinair-stat-value">{displayNoiseData?.overall || 0} dB</div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Unified Editor - 12 Point Performance Table */}
      {isEditing && (
        <Card>
          <CardContent className="p-4 space-y-4">
            {/* Power Mode Toggle */}
            <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
              <div className="flex items-center gap-3">
                <Checkbox 
                  id="singlePower" 
                  checked={useSinglePower}
                  onCheckedChange={(checked) => setUseSinglePower(!!checked)}
                />
                <div>
                  <Label htmlFor="singlePower" className="text-sm font-medium cursor-pointer flex items-center gap-2">
                    <Link2 className="w-4 h-4" />
                    Use single power value for all points
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    {useSinglePower 
                      ? "Power column locked - change single value below" 
                      : "Enter individual power values per point"}
                  </p>
                </div>
              </div>
              
              {useSinglePower && (
                <div className="flex items-center gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Power (kW)</Label>
                    <Input
                      type="text"
                      inputMode="decimal"
                      value={singlePowerInput}
                      onChange={(e) => handleSinglePowerChange(e.target.value)}
                      className="h-8 w-24"
                      placeholder="0.75"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Noise (dB)</Label>
                    <Input
                      type="number"
                      step="any"
                      value={singleNoiseValue || ''}
                      onChange={(e) => setSingleNoiseValue(parseFloat(e.target.value) || 0)}
                      className="h-8 w-20"
                      placeholder="72"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs flex items-center gap-1">
                      Max Eff.
                      <Calculator className="w-3 h-3 text-muted-foreground" />
                    </Label>
                    <div className="h-8 px-2 py-1 border rounded-md bg-muted/50 font-mono text-sm flex items-center">
                      {maxEfficiency.toFixed(1)}%
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Flexible Performance Table */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-muted-foreground">
                  {editedPerformanceData.length} Data Points
                </span>
                <Button 
                  onClick={handleAddPoint} 
                  variant="outline" 
                  size="sm"
                  className="gap-1"
                >
                  <Plus className="w-4 h-4" />
                  Add Point
                </Button>
              </div>
              
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="w-12 text-center">Pt</TableHead>
                      <TableHead className="text-center">Airflow (CMH)</TableHead>
                      <TableHead className="text-center">Static Pressure (Pa)</TableHead>
                      <TableHead className="text-center">Shaft Power (kW)</TableHead>
                      <TableHead className="w-20 text-center">Eff. (%)</TableHead>
                      <TableHead className="w-12"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {editedPerformanceData.map((point, idx) => {
                      const efficiency = getPointEfficiency(point, idx);
                      const isMaxEffPoint = efficiency === maxEfficiency && maxEfficiency > 0;
                      // A point is "empty" only if BOTH airflow AND pressure are 0 (not a shut-off point)
                      const isCompletelyEmpty = point.airflow === 0 && point.staticPressure === 0;
                      // Show actual values - don't hide 0 airflow if pressure exists (shut-off point)
                      const showAirflowValue = point.airflow !== 0 || point.staticPressure !== 0;
                      const showPressureValue = point.staticPressure !== 0 || point.airflow !== 0;
                      return (
                        <TableRow key={idx} className={isMaxEffPoint ? 'bg-primary/5' : isCompletelyEmpty ? 'bg-destructive/5' : ''}>
                          <TableCell className="text-center font-medium">{idx + 1}</TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              value={showAirflowValue ? point.airflow : ''}
                              onChange={(e) => updatePerformancePoint(idx, 'airflow', e.target.value)}
                              className="h-8 text-center"
                              placeholder="0"
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              value={showPressureValue ? point.staticPressure : ''}
                              onChange={(e) => updatePerformancePoint(idx, 'staticPressure', e.target.value)}
                              className="h-8 text-center"
                              placeholder="0"
                            />
                          </TableCell>
                          <TableCell>
                            {useSinglePower ? (
                              <div className="text-center font-mono text-sm text-muted-foreground">
                                {singlePowerValue > 0 ? singlePowerValue.toFixed(3) : '-'}
                              </div>
                            ) : (
                              <Input
                                type="number"
                                step="0.001"
                                value={point.shaftPower !== 0 ? point.shaftPower : ''}
                                onChange={(e) => updatePerformancePoint(idx, 'shaftPower', e.target.value)}
                                className="h-8 text-center"
                                placeholder="0"
                              />
                            )}
                          </TableCell>
                          <TableCell className="text-center font-mono text-sm">
                            {(useSinglePower ? singlePowerValue : point.shaftPower) > 0 
                              ? efficiency.toFixed(1) 
                              : '-'}
                          </TableCell>
                          <TableCell className="text-center">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleRemovePoint(idx)}
                              className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                              disabled={editedPerformanceData.length <= 1}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
              
              {editedPerformanceData.some(p => p.airflow === 0 && p.staticPressure === 0) && (
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" />
                  Empty points (both values = 0) will be removed on save
                </p>
              )}
            </div>

            {/* Octave Band Noise (Collapsible) */}
            <Collapsible open={noiseOpen} onOpenChange={setNoiseOpen}>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" className="w-full justify-between p-3 h-auto bg-muted/30 hover:bg-muted/50">
                  <span className="text-sm font-medium">Octave Band Noise Data</span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">
                      {noiseOpen ? 'Click to collapse' : 'Optional - Click to expand'}
                    </span>
                    {noiseOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </div>
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="pt-2">
                {editedNoiseData && (
                  <div className="border rounded-lg overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/50">
                          <TableHead className="text-center">63 Hz</TableHead>
                          <TableHead className="text-center">125 Hz</TableHead>
                          <TableHead className="text-center">250 Hz</TableHead>
                          <TableHead className="text-center">500 Hz</TableHead>
                          <TableHead className="text-center">1 kHz</TableHead>
                          <TableHead className="text-center">2 kHz</TableHead>
                          <TableHead className="text-center">4 kHz</TableHead>
                          <TableHead className="text-center">8 kHz</TableHead>
                          <TableHead className="text-center bg-primary/10">Overall</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        <TableRow>
                          <TableCell><Input type="number" step="any" value={editedNoiseData.hz63 || ''} onChange={(e) => updateNoiseValue('hz63', e.target.value)} className="h-8 w-16 text-center" /></TableCell>
                          <TableCell><Input type="number" step="any" value={editedNoiseData.hz125 || ''} onChange={(e) => updateNoiseValue('hz125', e.target.value)} className="h-8 w-16 text-center" /></TableCell>
                          <TableCell><Input type="number" step="any" value={editedNoiseData.hz250 || ''} onChange={(e) => updateNoiseValue('hz250', e.target.value)} className="h-8 w-16 text-center" /></TableCell>
                          <TableCell><Input type="number" step="any" value={editedNoiseData.hz500 || ''} onChange={(e) => updateNoiseValue('hz500', e.target.value)} className="h-8 w-16 text-center" /></TableCell>
                          <TableCell><Input type="number" step="any" value={editedNoiseData.hz1k || ''} onChange={(e) => updateNoiseValue('hz1k', e.target.value)} className="h-8 w-16 text-center" /></TableCell>
                          <TableCell><Input type="number" step="any" value={editedNoiseData.hz2k || ''} onChange={(e) => updateNoiseValue('hz2k', e.target.value)} className="h-8 w-16 text-center" /></TableCell>
                          <TableCell><Input type="number" step="any" value={editedNoiseData.hz4k || ''} onChange={(e) => updateNoiseValue('hz4k', e.target.value)} className="h-8 w-16 text-center" /></TableCell>
                          <TableCell><Input type="number" step="any" value={editedNoiseData.hz8k || ''} onChange={(e) => updateNoiseValue('hz8k', e.target.value)} className="h-8 w-16 text-center" /></TableCell>
                          <TableCell className="bg-primary/5">
                            <span className="font-mono font-semibold">{editedNoiseData.overall?.toFixed(1) || 0}</span>
                            <span className="text-xs text-muted-foreground ml-1">(auto)</span>
                          </TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CollapsibleContent>
            </Collapsible>
          </CardContent>
        </Card>
      )}

      {/* Read-only Performance/Noise Tables when not editing */}
      {!isEditing && displayPerformanceData.length > 0 && (
        <Collapsible defaultOpen={false}>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" className="w-full justify-between p-3 h-auto bg-muted/50">
              <span className="font-medium">Performance Curve ({displayPerformanceData.length} points)</span>
              <ChevronDown className="w-4 h-4" />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-2">
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="w-12">#</TableHead>
                    <TableHead>Airflow (CMH)</TableHead>
                    <TableHead>Static Pressure (Pa)</TableHead>
                    <TableHead>Shaft Power (kW)</TableHead>
                    <TableHead>Total Eff. (%)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {displayPerformanceData.map((point, idx) => (
                    <TableRow key={idx}>
                      <TableCell className="font-mono text-muted-foreground">{idx + 1}</TableCell>
                      <TableCell className="font-mono">{(point.airflow ?? 0).toLocaleString()}</TableCell>
                      <TableCell className="font-mono">{point.staticPressure ?? 0}</TableCell>
                      <TableCell className="font-mono">{(point.shaftPower ?? 0).toFixed(3)}</TableCell>
                      <TableCell className="font-mono">{(point.totalEfficiency ?? 0).toFixed(1)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}

      {!isEditing && displayNoiseData && (displayNoiseData.hz63 || displayNoiseData.hz125 || displayNoiseData.hz250 || displayNoiseData.hz500 || displayNoiseData.hz1k || displayNoiseData.hz2k || displayNoiseData.hz4k || displayNoiseData.hz8k) && (
        <Collapsible defaultOpen={false}>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" className="w-full justify-between p-3 h-auto bg-muted/50">
              <span className="font-medium">Noise Data (Octave Bands)</span>
              <ChevronDown className="w-4 h-4" />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-2">
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead>63 Hz</TableHead>
                    <TableHead>125 Hz</TableHead>
                    <TableHead>250 Hz</TableHead>
                    <TableHead>500 Hz</TableHead>
                    <TableHead>1 kHz</TableHead>
                    <TableHead>2 kHz</TableHead>
                    <TableHead>4 kHz</TableHead>
                    <TableHead>8 kHz</TableHead>
                    <TableHead className="bg-primary/10">Overall</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow>
                    <TableCell className="font-mono">{displayNoiseData.hz63}</TableCell>
                    <TableCell className="font-mono">{displayNoiseData.hz125}</TableCell>
                    <TableCell className="font-mono">{displayNoiseData.hz250}</TableCell>
                    <TableCell className="font-mono">{displayNoiseData.hz500}</TableCell>
                    <TableCell className="font-mono">{displayNoiseData.hz1k}</TableCell>
                    <TableCell className="font-mono">{displayNoiseData.hz2k}</TableCell>
                    <TableCell className="font-mono">{displayNoiseData.hz4k}</TableCell>
                    <TableCell className="font-mono">{displayNoiseData.hz8k}</TableCell>
                    <TableCell className="font-mono bg-primary/5 font-semibold">{displayNoiseData.overall}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  );
}
