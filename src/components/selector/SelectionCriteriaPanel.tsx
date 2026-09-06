import { useState, useEffect, useRef } from 'react';
import { Wind, Gauge, Thermometer, RotateCcw, Search, Flame, Zap, Layers, Target, Plug, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { AIRFLOW_UNITS, PRESSURE_UNITS, calculateAirDensity, FireClass, MOTOR_SAFETY_FACTORS, Frequency, MOTOR_POLES, DUAL_SPEED_POLE_OPTIONS, FanSeries, AccessoryType, ACCESSORY_DESCRIPTIONS, AtexRating, ATEX_DESCRIPTIONS, MotorEfficiencyClass } from '@/lib/fanData';
import { useSupabaseFanDatabase } from '@/hooks/useSupabaseFanDatabase';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useMemo } from 'react';

interface SelectionCriteriaPanelProps {
  onSearch: (criteria: {
    airflow: number;
    airflowUnit: keyof typeof AIRFLOW_UNITS;
    pressure: number;
    pressureUnit: keyof typeof PRESSURE_UNITS;
    altitude: number;
    temperature: number;
    airDensity: number;
    fireClass: FireClass;
    accessory: AccessoryType;
    atexRating: AtexRating;
    efficiencyClass?: MotorEfficiencyClass;
    safetyFactor: number;
    frequency: Frequency;
    motorPole?: number | string;
    motorBrandId?: string;
    series?: FanSeries;
    seriesId?: string;
    toleranceMin: number;
    toleranceMax: number;
  }) => void;
  horizontal?: boolean;
  initialAirflow?: string;
  initialPressure?: string;
  autoSearch?: boolean;
}

export function SelectionCriteriaPanel({ onSearch, horizontal = false, initialAirflow, initialPressure, autoSearch = false }: SelectionCriteriaPanelProps) {
  const { database } = useSupabaseFanDatabase();
  const [airflow, setAirflow] = useState<string>(initialAirflow ?? '');
  const [airflowUnit, setAirflowUnit] = useState<keyof typeof AIRFLOW_UNITS>(initialAirflow ? 'CMH' : database.unitPreferences.airflowUnit);
  const [pressure, setPressure] = useState<string>(initialPressure ?? '');
  const [pressureUnit, setPressureUnit] = useState<keyof typeof PRESSURE_UNITS>(initialPressure ? 'Pa' : database.unitPreferences.pressureUnit);
  const [altitude, setAltitude] = useState<string>('0');
  const [temperature, setTemperature] = useState<string>('20');
  const [densityMode, setDensityMode] = useState<'calculated' | 'direct'>('calculated');
  const [directDensity, setDirectDensity] = useState<string>('1.2');
  const [fireClass, setFireClass] = useState<FireClass>('');
  const [accessory, setAccessory] = useState<AccessoryType>('');
  const [atexRating, setAtexRating] = useState<AtexRating>('');
  const [efficiencyClass, setEfficiencyClass] = useState<MotorEfficiencyClass | 'all'>('all');
  const [safetyFactor, setSafetyFactor] = useState<number>(1.15);
  const [customSafetyFactor, setCustomSafetyFactor] = useState<string>('');
  const [frequency, setFrequency] = useState<Frequency>(50);
  const [motorPole, setMotorPole] = useState<number | string | 'all'>('all');
  const [selectedSeries, setSelectedSeries] = useState<FanSeries | 'all'>('all');
  const [selectedMotorBrand, setSelectedMotorBrand] = useState<string>('all');
  const [toleranceRange, setToleranceRange] = useState<[number, number]>([
    database.unitPreferences.defaultToleranceMin ?? 95,
    database.unitPreferences.defaultToleranceMax ?? 105
  ]);
  const [showCustomTolerance, setShowCustomTolerance] = useState(false);
  
  // Air density - either calculated or direct input
  const calculatedDensity = calculateAirDensity(Number(altitude) || 0, Number(temperature) || 20);
  const airDensity = densityMode === 'direct' ? (Number(directDensity) || 1.2) : calculatedDensity;

  // Get unique ATEX ratings from motor specifications
  const availableAtexRatings = useMemo(() => {
    const ratings = database.motorDatabase.specifications
      .map(spec => spec.atexRating)
      .filter((rating): rating is NonNullable<typeof rating> => !!rating);
    return [...new Set(ratings)].sort();
  }, [database.motorDatabase.specifications]);

  // Get unique efficiency classes from motor specifications
  const availableEfficiencyClasses = useMemo(() => {
    const classes = database.motorDatabase.specifications
      .map(spec => spec.efficiencyClass)
      .filter((ec): ec is MotorEfficiencyClass => !!ec && ec !== 'None');
    return [...new Set(classes)].sort();
  }, [database.motorDatabase.specifications]);

  // Auto-update safety factor when series changes
  useEffect(() => {
    if (selectedSeries !== 'all') {
      const seriesObj = database.series.find(s => s.id === selectedSeries);
      if (seriesObj && (seriesObj as any).defaultSafetyFactor !== undefined) {
        setSafetyFactor((seriesObj as any).defaultSafetyFactor);
        setCustomSafetyFactor('');
      }
    }
  }, [selectedSeries, database.series]);

  const effectiveSafetyFactor = customSafetyFactor ? parseFloat(customSafetyFactor) : safetyFactor;

  const handleSearch = () => {
    // Find the series name from the selected ID
    const selectedSeriesObj = database.series.find(s => s.id === selectedSeries);
    
    console.log('Selection Panel - fireClass value:', fireClass, 'type:', typeof fireClass);
    
    onSearch({
      airflow: Number(airflow) || 0,
      airflowUnit,
      pressure: Number(pressure) || 0,
      pressureUnit,
      altitude: Number(altitude) || 0,
      temperature: Number(temperature) || 20,
      airDensity,
      fireClass,
      accessory,
      atexRating,
      efficiencyClass: efficiencyClass === 'all' ? undefined : efficiencyClass,
      safetyFactor: effectiveSafetyFactor,
      frequency,
      motorPole: motorPole === 'all' ? undefined : motorPole,
      motorBrandId: selectedMotorBrand === 'all' ? undefined : selectedMotorBrand,
      series: selectedSeries === 'all' ? undefined : (selectedSeriesObj?.name as FanSeries),
      seriesId: selectedSeries === 'all' ? undefined : selectedSeries,
      toleranceMin: toleranceRange[0],
      toleranceMax: toleranceRange[1],
    });
  };

  // Auto-run the search once when arriving with a duty point (e.g. from the assistant)
  const autoRanRef = useRef(false);
  useEffect(() => {
    if (!autoSearch || autoRanRef.current) return;
    if (!airflow || !pressure) return;
    if (!database.series?.length) return;
    autoRanRef.current = true;
    handleSearch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoSearch, airflow, pressure, database.series]);



  const handleReset = () => {
    setAirflow('');
    setAirflowUnit(database.unitPreferences.airflowUnit);
    setPressure('');
    setPressureUnit(database.unitPreferences.pressureUnit);
    setAltitude('0');
    setTemperature('20');
    setDensityMode('calculated');
    setDirectDensity('1.2');
    setFireClass('');
    setAccessory('');
    setAtexRating('');
    setEfficiencyClass('all');
    setSafetyFactor(1.15);
    setCustomSafetyFactor('');
    setFrequency(50);
    setMotorPole('all');
    setSelectedSeries('all');
    setSelectedMotorBrand('all');
    setToleranceRange([95, 110]);
  };

  if (horizontal) {
    return (
      <div className="kinair-card p-4 md:p-5 animate-fade-in">
        <div className="flex flex-col gap-3">
          {/* Header Row */}
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
              <Gauge className="w-5 h-5 text-primary" />
              Selection Criteria
            </h2>
            <Button 
              variant="outline" 
              size="sm"
              onClick={handleReset}
            >
              <RotateCcw className="w-4 h-4" />
              Reset
            </Button>
          </div>
          
          {/* Main Grid: All inputs in one responsive grid */}
          {/* Row 1: Airflow, Pressure, Series */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 md:gap-3 items-end">
            {/* Airflow */}
            <div className="space-y-1">
              <Label className="text-xs font-medium flex items-center gap-1">
                <Wind className="w-3 h-3 text-primary" />
                Airflow
              </Label>
              <div className="flex gap-1">
                <Input
                  type="number"
                  value={airflow}
                  onChange={(e) => setAirflow(e.target.value)}
                  placeholder="0"
                  className="kinair-input text-sm flex-1 min-w-0 h-9"
                />
                <Select value={airflowUnit} onValueChange={(v) => setAirflowUnit(v as keyof typeof AIRFLOW_UNITS)}>
                  <SelectTrigger className="w-[104px] text-xs shrink-0 h-9 px-2">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-background border shadow-lg z-50">
                    {Object.entries(AIRFLOW_UNITS).map(([key, { label }]) => (
                      <SelectItem key={key} value={key}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Pressure */}
            <div className="space-y-1">
              <Label className="text-xs font-medium flex items-center gap-1">
                <Gauge className="w-3 h-3 text-primary" />
                Pressure
              </Label>
              <div className="flex gap-1">
                <Input
                  type="number"
                  value={pressure}
                  onChange={(e) => setPressure(e.target.value)}
                  placeholder="0"
                  className="kinair-input text-sm flex-1 min-w-0 h-9"
                />
                <Select value={pressureUnit} onValueChange={(v) => setPressureUnit(v as keyof typeof PRESSURE_UNITS)}>
                  <SelectTrigger className="w-[104px] text-xs shrink-0 h-9 px-2">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-background border shadow-lg z-50">
                    {Object.entries(PRESSURE_UNITS).map(([key, { label }]) => (
                      <SelectItem key={key} value={key}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Series */}
            <div className="space-y-1">
              <Label className="text-xs font-medium flex items-center gap-1">
                <Layers className="w-3 h-3 text-primary" />
                Series
              </Label>
              <Select value={selectedSeries} onValueChange={(v) => setSelectedSeries(v as FanSeries | 'all')}>
                <SelectTrigger className="text-sm h-9">
                  <SelectValue placeholder="All" />
                </SelectTrigger>
                <SelectContent className="bg-background border shadow-lg z-50">
                  <SelectItem value="all">All Series</SelectItem>
                  {database.series.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Row 2: Motor Brand, Efficiency Class, Motor Pole, Frequency, Fire Rating, Accessory */}
          <div className="grid grid-cols-2 sm:grid-cols-6 gap-2 md:gap-3 items-end">
            {/* Motor Brand */}
            <div className="space-y-1">
              <Label className="text-xs font-medium">Motor Brand</Label>
              <Select value={selectedMotorBrand} onValueChange={setSelectedMotorBrand}>
                <SelectTrigger className="text-sm h-9">
                  <SelectValue placeholder="All" />
                </SelectTrigger>
                <SelectContent className="bg-background border shadow-lg z-50">
                  <SelectItem value="all">All Brands</SelectItem>
                  {database.motorDatabase.brands.map((brand) => (
                    <SelectItem key={brand.id} value={brand.id}>{brand.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Motor Efficiency Class */}
            <div className="space-y-1">
              <Label className="text-xs font-medium">Efficiency</Label>
              <Select value={efficiencyClass} onValueChange={(v) => setEfficiencyClass(v as MotorEfficiencyClass | 'all')}>
                <SelectTrigger className="text-sm h-9">
                  <SelectValue placeholder="All" />
                </SelectTrigger>
                <SelectContent className="bg-background border shadow-lg z-50">
                  <SelectItem value="all">All Classes</SelectItem>
                  {availableEfficiencyClasses.map(ec => (
                    <SelectItem key={ec} value={ec}>{ec}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Motor Pole */}
            <div className="space-y-1">
              <Label className="text-xs font-medium flex items-center gap-1">
                <Zap className="w-3 h-3 text-primary" />
                Motor Pole
              </Label>
              <Select value={motorPole.toString()} onValueChange={(v) => setMotorPole(v === 'all' ? 'all' : (v.includes('-') ? v : parseInt(v)))}>
                <SelectTrigger className="text-sm h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-background border shadow-lg z-50">
                  <SelectItem value="all">All Poles</SelectItem>
                  {MOTOR_POLES.map(pole => (
                    <SelectItem key={pole} value={pole.toString()}>{pole}P</SelectItem>
                  ))}
                  <SelectItem value="dual-separator" disabled className="text-xs text-muted-foreground font-medium">— Dual Speed —</SelectItem>
                  {DUAL_SPEED_POLE_OPTIONS.map(option => (
                    <SelectItem key={option.id} value={option.id}>{option.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Frequency */}
            <div className="space-y-1">
              <Label className="text-xs font-medium">Frequency</Label>
              <Select value={frequency.toString()} onValueChange={(v) => setFrequency(parseInt(v) as Frequency)}>
                <SelectTrigger className="text-sm h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-background border shadow-lg z-50">
                  <SelectItem value="50">50 Hz</SelectItem>
                  <SelectItem value="60">60 Hz</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Fire Rating */}
            <div className="space-y-1">
              <Label className="text-xs font-medium flex items-center gap-1">
                <Flame className="w-3 h-3 text-primary" />
                Fire Rating
              </Label>
              <Select value={fireClass || 'none'} onValueChange={(v) => setFireClass(v === 'none' ? '' : v as FireClass)}>
                <SelectTrigger className="text-sm h-9">
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent className="bg-background border shadow-lg z-50">
                  <SelectItem value="none">None</SelectItem>
                  <SelectItem value="F250">F250</SelectItem>
                  <SelectItem value="F300">F300</SelectItem>
                  <SelectItem value="F400">F400</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Accessory */}
            <div className="space-y-1">
              <Label className="text-xs font-medium flex items-center gap-1">
                <Plug className="w-3 h-3 text-primary" />
                Accessory
              </Label>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div>
                      <Select value={accessory || 'none'} onValueChange={(v) => setAccessory(v === 'none' ? '' : v as AccessoryType)}>
                        <SelectTrigger className="text-sm h-9">
                          <SelectValue placeholder="None" />
                        </SelectTrigger>
                        <SelectContent className="bg-background border shadow-lg z-50">
                          <SelectItem value="none">None</SelectItem>
                          <SelectItem value="ET">ET</SelectItem>
                          <SelectItem value="ID">ID</SelectItem>
                          <SelectItem value="ETID">ETID</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="max-w-xs">
                    <p className="text-xs">{ACCESSORY_DESCRIPTIONS[accessory] || ACCESSORY_DESCRIPTIONS['']}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>

            {/* ATEX Rating */}
            <div className="space-y-1">
              <Label className="text-xs font-medium flex items-center gap-1">
                <AlertTriangle className="w-3 h-3 text-primary" />
                ATEX Rating
              </Label>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div>
                      <Select value={atexRating || 'none'} onValueChange={(v) => setAtexRating(v === 'none' ? '' : v as AtexRating)}>
                        <SelectTrigger className="text-sm h-9">
                          <SelectValue placeholder="None" />
                        </SelectTrigger>
                        <SelectContent className="bg-background border shadow-lg z-50">
                          <SelectItem value="none">None</SelectItem>
                          {availableAtexRatings.map(rating => (
                            <SelectItem key={rating} value={rating}>{rating}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="max-w-md">
                    <p className="text-xs">{ATEX_DESCRIPTIONS[atexRating] || ATEX_DESCRIPTIONS['']}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          </div>

          {/* Row 3: Safety Factor, Tolerance */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 md:gap-3 items-end">
            {/* Safety Factor */}
            <div className="space-y-1">
              <Label className="text-xs font-medium">Safety Factor</Label>
              <div className="flex gap-1">
                <Select 
                  value={customSafetyFactor ? 'custom' : safetyFactor.toString()} 
                  onValueChange={(v) => {
                    if (v === 'custom') {
                      setCustomSafetyFactor('1.15');
                    } else {
                      setCustomSafetyFactor('');
                      setSafetyFactor(parseFloat(v));
                    }
                  }}
                >
                  <SelectTrigger className={`text-sm h-9 ${customSafetyFactor ? 'w-[80px]' : 'w-full'}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-background border shadow-lg z-50">
                    {MOTOR_SAFETY_FACTORS.map(sf => (
                      <SelectItem key={sf} value={sf.toString()}>{sf}</SelectItem>
                    ))}
                    <SelectItem value="custom">Custom</SelectItem>
                  </SelectContent>
                </Select>
                {customSafetyFactor && (
                  <Input
                    type="number"
                    step="0.01"
                    min="1"
                    max="2"
                    value={customSafetyFactor}
                    onChange={(e) => setCustomSafetyFactor(e.target.value)}
                    placeholder="1.15"
                    className="kinair-input text-sm flex-1 h-9"
                  />
                )}
              </div>
            </div>

            {/* Duty Point Tolerance */}
            <div className="space-y-1 col-span-2 sm:col-span-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-medium flex items-center gap-1">
                  <Target className="w-3 h-3 text-primary" />
                  Tolerance
                </Label>
                <span className="text-xs text-muted-foreground font-mono bg-muted px-1.5 py-0.5 rounded">
                  {toleranceRange[0]}% - {toleranceRange[1]}%
                </span>
              </div>
              <div className="grid grid-cols-4 gap-1">
                {[
                  { label: '±5%', min: 95, max: 105 },
                  { label: '±10%', min: 90, max: 110 },
                  { label: '±20%', min: 80, max: 120 },
                ].map((preset) => (
                  <Button
                    key={preset.label}
                    variant={toleranceRange[0] === preset.min && toleranceRange[1] === preset.max ? "default" : "outline"}
                    size="sm"
                    className="h-9 px-2 text-xs flex-1"
                    onClick={() => {
                      setToleranceRange([preset.min, preset.max]);
                      setShowCustomTolerance(false);
                    }}
                  >
                    {preset.label}
                  </Button>
                ))}
                <Button
                  variant={showCustomTolerance ? "default" : "outline"}
                  size="sm"
                  className="h-9 px-2 text-xs"
                  onClick={() => setShowCustomTolerance(!showCustomTolerance)}
                >
                  Custom
                </Button>
              </div>
            </div>
          </div>

          {/* Custom tolerance inputs */}
          {showCustomTolerance && (
            <div className="flex items-center gap-2 pl-2">
              <span className="text-xs text-muted-foreground">Custom:</span>
              <Input
                type="number"
                min={0}
                max={200}
                value={toleranceRange[0]}
                onChange={(e) => setToleranceRange([parseInt(e.target.value) || 0, toleranceRange[1]])}
                className="w-16 h-8 text-xs text-center"
              />
              <span className="text-xs text-muted-foreground">-</span>
              <Input
                type="number"
                min={0}
                max={200}
                value={toleranceRange[1]}
                onChange={(e) => setToleranceRange([toleranceRange[0], parseInt(e.target.value) || 100])}
                className="w-16 h-8 text-xs text-center"
              />
              <span className="text-xs text-muted-foreground">%</span>
            </div>
          )}

          {/* Find Fans Button */}
          <Button 
            variant="kinair-accent" 
            onClick={handleSearch}
            className="w-full h-10 text-sm font-semibold"
          >
            <Search className="w-4 h-4" />
            Find Fans
          </Button>

          {/* Air Conditions - Collapsible section */}
          <div className="border-t pt-2">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 md:gap-3 items-end">
              {/* Density Mode Toggle */}
              <div className="space-y-1">
                <Label className="text-xs font-medium flex items-center gap-1">
                  <Thermometer className="w-3 h-3 text-primary" />
                  Air Condition
                </Label>
                <Button
                  variant={densityMode === 'direct' ? "default" : "outline"}
                  size="sm"
                  onClick={() => setDensityMode(densityMode === 'calculated' ? 'direct' : 'calculated')}
                  className="w-full h-9 text-xs"
                >
                  {densityMode === 'direct' ? "Direct ρ" : "Calculate ρ"}
                </Button>
              </div>

              {densityMode === 'calculated' ? (
                <>
                  {/* Temperature */}
                  <div className="space-y-1">
                    <Label className="text-xs font-medium">Temp (°C)</Label>
                    <Input
                      type="number"
                      value={temperature}
                      onChange={(e) => setTemperature(e.target.value)}
                      className="kinair-input text-sm h-9"
                    />
                  </div>

                  {/* Altitude */}
                  <div className="space-y-1">
                    <Label className="text-xs font-medium">Altitude (m)</Label>
                    <Input
                      type="number"
                      value={altitude}
                      onChange={(e) => setAltitude(e.target.value)}
                      className="kinair-input text-sm h-9"
                    />
                  </div>
                </>
              ) : (
                <>
                  {/* Direct Density Input */}
                  <div className="space-y-1">
                    <Label className="text-xs font-medium">ρ (kg/m³)</Label>
                    <Input
                      type="number"
                      step="0.001"
                      min="0.1"
                      max="2.0"
                      value={directDensity}
                      onChange={(e) => setDirectDensity(e.target.value)}
                      placeholder="1.2"
                      className="kinair-input text-sm h-9"
                    />
                  </div>

                  {/* Placeholder - hidden on mobile */}
                  <div className="space-y-1 hidden sm:block invisible">
                    <Label className="text-xs font-medium">Placeholder</Label>
                    <Input className="kinair-input text-sm h-9" />
                  </div>
                </>
              )}

              {/* Calculated Density Display */}
              <div className="space-y-1">
                <Label className="text-xs font-medium">ρ / DCF</Label>
                <div className="bg-muted/50 rounded-md px-2 py-1 text-xs font-mono text-center border h-9 flex items-center justify-center gap-1">
                  <span className="text-primary font-semibold">{airDensity.toFixed(3)}</span>
                  <span className="text-muted-foreground">/</span>
                  <span className="text-amber-600 font-semibold">{(airDensity / 1.2).toFixed(2)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Original vertical layout
  return (
    <div className="kinair-card p-6 animate-fade-in">
      <h2 className="kinair-section-title">
        <Gauge className="w-5 h-5 text-primary" />
        Selection Criteria
      </h2>
      
      <div className="space-y-5">
        {/* Airflow Section */}
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
            <Wind className="w-4 h-4 text-primary" />
            Airflow
          </div>
          <div className="flex gap-2">
            <div className="flex-1">
              <Input
                type="number"
                value={airflow}
                onChange={(e) => setAirflow(e.target.value)}
                placeholder="Enter airflow"
                className="kinair-input"
              />
            </div>
            <Select value={airflowUnit} onValueChange={(v) => setAirflowUnit(v as keyof typeof AIRFLOW_UNITS)}>
              <SelectTrigger className="w-[130px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(AIRFLOW_UNITS).map(([key, { label }]) => (
                  <SelectItem key={key} value={key}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Pressure Section */}
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
            <Gauge className="w-4 h-4 text-primary" />
            Static Pressure
          </div>
          <div className="flex gap-2">
            <div className="flex-1">
              <Input
                type="number"
                value={pressure}
                onChange={(e) => setPressure(e.target.value)}
                placeholder="Enter pressure"
                className="kinair-input"
              />
            </div>
            <Select value={pressureUnit} onValueChange={(v) => setPressureUnit(v as keyof typeof PRESSURE_UNITS)}>
              <SelectTrigger className="w-[110px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(PRESSURE_UNITS).map(([key, { label }]) => (
                  <SelectItem key={key} value={key}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Series */}
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
            <Layers className="w-4 h-4 text-primary" />
            Series
          </div>
          <Select value={selectedSeries} onValueChange={(v) => setSelectedSeries(v as FanSeries | 'all')}>
            <SelectTrigger>
              <SelectValue placeholder="All Series" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Series</SelectItem>
              {database.series.map((s) => (
                <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Motor Configuration */}
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
            <Zap className="w-4 h-4 text-primary" />
            Motor Configuration
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs text-muted-foreground">Motor Pole</Label>
              <Select value={motorPole.toString()} onValueChange={(v) => setMotorPole(v === 'all' ? 'all' : parseInt(v))}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Poles</SelectItem>
                  {MOTOR_POLES.map(pole => (
                    <SelectItem key={pole} value={pole.toString()}>{pole}P</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Frequency</Label>
              <Select value={frequency.toString()} onValueChange={(v) => setFrequency(parseInt(v) as Frequency)}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="50">50 Hz</SelectItem>
                  <SelectItem value="60">60 Hz</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs text-muted-foreground">Motor Brand</Label>
              <Select value={selectedMotorBrand} onValueChange={setSelectedMotorBrand}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="All Brands" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Brands</SelectItem>
                  {database.motorDatabase.brands.map((brand) => (
                    <SelectItem key={brand.id} value={brand.id}>{brand.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Efficiency Class</Label>
              <Select value={efficiencyClass} onValueChange={(v) => setEfficiencyClass(v as MotorEfficiencyClass | 'all')}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="All Classes" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Classes</SelectItem>
                  {availableEfficiencyClasses.map(ec => (
                    <SelectItem key={ec} value={ec}>{ec}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {/* Fire Rating & Safety Factor */}
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
            <Flame className="w-4 h-4 text-primary" />
            Fire Rating & Safety
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs text-muted-foreground">Fire Rating</Label>
              <Select value={fireClass || 'none'} onValueChange={(v) => setFireClass(v === 'none' ? '' : v as FireClass)}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  <SelectItem value="F250">F250</SelectItem>
                  <SelectItem value="F300">F300</SelectItem>
                  <SelectItem value="F400">F400</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Safety Factor</Label>
              <Select 
                value={customSafetyFactor ? 'custom' : safetyFactor.toString()} 
                onValueChange={(v) => {
                  if (v === 'custom') {
                    setCustomSafetyFactor('1.15');
                  } else {
                    setCustomSafetyFactor('');
                    setSafetyFactor(parseFloat(v));
                  }
                }}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MOTOR_SAFETY_FACTORS.map(sf => (
                    <SelectItem key={sf} value={sf.toString()}>{sf}</SelectItem>
                  ))}
                  <SelectItem value="custom">Custom...</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          {customSafetyFactor && (
            <div>
              <Label className="text-xs text-muted-foreground">Custom Safety Factor</Label>
              <Input
                type="number"
                step="0.01"
                value={customSafetyFactor}
                onChange={(e) => setCustomSafetyFactor(e.target.value)}
                placeholder="e.g., 1.25"
                className="mt-1"
              />
            </div>
          )}
        </div>

        {/* Duty Point Tolerance */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              <Target className="w-4 h-4 text-primary" />
              Duty Point Tolerance
            </div>
            <span className="text-xs text-muted-foreground font-mono bg-muted px-2 py-0.5 rounded">
              {toleranceRange[0]}% - {toleranceRange[1]}%
            </span>
          </div>
          
          {/* Preset buttons */}
          <div className="flex flex-wrap gap-1.5">
            {[
              { label: '±5%', min: 95, max: 105 },
              { label: '±10%', min: 90, max: 110 },
              { label: '±20%', min: 80, max: 120 },
            ].map((preset) => (
              <Button
                key={preset.label}
                variant={toleranceRange[0] === preset.min && toleranceRange[1] === preset.max ? "default" : "outline"}
                size="sm"
                className="h-8 px-3 text-xs"
                onClick={() => {
                  setToleranceRange([preset.min, preset.max]);
                  setShowCustomTolerance(false);
                }}
              >
                {preset.label}
              </Button>
            ))}
            <Button
              variant={showCustomTolerance ? "default" : "outline"}
              size="sm"
              className="h-8 px-3 text-xs"
              onClick={() => setShowCustomTolerance(!showCustomTolerance)}
            >
              Custom
            </Button>
          </div>
          
          {/* Custom inputs when enabled */}
          {showCustomTolerance && (
            <div className="flex items-center gap-2 pt-2">
              <div className="flex-1">
                <Label className="text-xs text-muted-foreground">Min %</Label>
                <Input
                  type="number"
                  min={0}
                  max={200}
                  value={toleranceRange[0]}
                  onChange={(e) => setToleranceRange([parseInt(e.target.value) || 0, toleranceRange[1]])}
                  className="mt-1 text-center"
                />
              </div>
              <span className="text-muted-foreground mt-5">-</span>
              <div className="flex-1">
                <Label className="text-xs text-muted-foreground">Max %</Label>
                <Input
                  type="number"
                  min={0}
                  max={500}
                  value={toleranceRange[1]}
                  onChange={(e) => setToleranceRange([toleranceRange[0], parseInt(e.target.value) || 100])}
                  className="mt-1 text-center"
                />
              </div>
            </div>
          )}
        </div>

        {/* Air Conditions */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              <Thermometer className="w-4 h-4 text-primary" />
              Air Conditions
            </div>
            <Button
              variant={densityMode === 'direct' ? "default" : "outline"}
              size="sm"
              onClick={() => setDensityMode(densityMode === 'calculated' ? 'direct' : 'calculated')}
              className="text-xs h-7"
            >
              {densityMode === 'direct' ? "Direct ρ" : "Calculate ρ"}
            </Button>
          </div>
          
          {densityMode === 'calculated' ? (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs text-muted-foreground">Temperature (°C)</Label>
                <Input
                  type="number"
                  value={temperature}
                  onChange={(e) => setTemperature(e.target.value)}
                  className="kinair-input mt-1"
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Altitude (m)</Label>
                <Input
                  type="number"
                  value={altitude}
                  onChange={(e) => setAltitude(e.target.value)}
                  className="kinair-input mt-1"
                />
              </div>
            </div>
          ) : (
            <div>
              <Label className="text-xs text-muted-foreground">Air Density (kg/m³)</Label>
              <Input
                type="number"
                step="0.001"
                min="0.1"
                max="2.0"
                value={directDensity}
                onChange={(e) => setDirectDensity(e.target.value)}
                placeholder="1.2"
                className="kinair-input mt-1"
              />
              <p className="text-xs text-muted-foreground mt-1">Standard: 1.2 kg/m³ at 20°C, sea level</p>
            </div>
          )}
          
          <div className="bg-muted/50 rounded-lg p-3 border border-border/50 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">
                {densityMode === 'calculated' ? 'Calculated Density' : 'Input Density'}
              </span>
              <span className="text-sm font-mono font-semibold text-primary">{airDensity} kg/m³</span>
            </div>
            <div className="flex items-center justify-between border-t border-border/30 pt-2">
              <span className="text-xs text-muted-foreground">DCF (ρ / 1.2)</span>
              <span className="text-sm font-mono font-semibold text-amber-600">
                {(airDensity / 1.2).toFixed(3)}
              </span>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3 pt-2">
          <Button 
            variant="kinair-accent" 
            className="flex-1"
            onClick={handleSearch}
          >
            <Search className="w-4 h-4" />
            Find Fans
          </Button>
          <Button 
            variant="outline" 
            onClick={handleReset}
          >
            <RotateCcw className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
