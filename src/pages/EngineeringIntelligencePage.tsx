import { useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Calculator,
  CheckCircle2,
  DoorOpen,
  Fan,
  Gauge,
  Leaf,
  Printer,
  Wind,
  Zap,
} from 'lucide-react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

type AirCurtainSeries = 'FM35' | 'FM45' | 'FM55';
type EnergyMode = 'fan' | 'air-curtain';

const CURTAIN_PROFILES: Record<AirCurtainSeries, {
  maxHeight: number;
  outletVelocity: number;
  widths: number[];
  label: string;
}> = {
  FM35: { maxHeight: 3.5, outletVelocity: 11, widths: [0.9, 1, 1.2, 1.5], label: 'FM35 Standard Velocity' },
  FM45: { maxHeight: 4.5, outletVelocity: 13, widths: [0.9, 1, 1.2, 1.5], label: 'FM45 Medium-High Velocity' },
  FM55: { maxHeight: 5.5, outletVelocity: 15, widths: [0.9, 1, 1.2, 1.5], label: 'FM55 High Velocity' },
};

const SYSTEM_EFFECTS = [
  { id: 'inlet-elbow', label: 'Elbow close to fan inlet', k: 0.45, side: 'inlet' as const },
  { id: 'outlet-elbow', label: 'Elbow close to fan outlet', k: 0.75, side: 'outlet' as const },
  { id: 'abrupt-inlet', label: 'Abrupt or obstructed inlet', k: 0.5, side: 'inlet' as const },
  { id: 'damper', label: 'Damper close to discharge', k: 0.4, side: 'outlet' as const },
  { id: 'grille', label: 'Grille / louvre at discharge', k: 0.25, side: 'outlet' as const },
  { id: 'flexible', label: 'Flexible duct connection', k: 0.2, side: 'inlet' as const },
  { id: 'transition', label: 'Abrupt transition / reducer', k: 0.35, side: 'outlet' as const },
];

function bestWidthCombination(requiredWidth: number, widths: number[], maxUnits = 8) {
  let best: number[] = [];

  const score = (items: number[]) => {
    const total = items.reduce((sum, item) => sum + item, 0);
    const shortfall = Math.max(0, requiredWidth - total);
    const overhang = Math.max(0, total - requiredWidth);
    return shortfall * 10000 + overhang * 100 + items.length;
  };

  const visit = (items: number[], startIndex: number) => {
    if (items.length > 0 && (best.length === 0 || score(items) < score(best))) best = [...items];
    if (items.length === maxUnits) return;
    for (let index = startIndex; index < widths.length; index += 1) {
      visit([...items, widths[index]], index);
    }
  };

  visit([], 0);
  return best;
}

function NumberField({
  label,
  value,
  onChange,
  unit,
  min = 0,
  step = 'any',
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  unit?: string;
  min?: number;
  step?: string | number;
}) {
  return (
    <div>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <div className="relative mt-1">
        <Input
          type="number"
          min={min}
          step={step}
          value={value}
          onChange={(event) => onChange(Number(event.target.value) || 0)}
          className={unit ? 'pr-16' : ''}
        />
        {unit && <span className="absolute right-3 top-2.5 text-xs text-muted-foreground">{unit}</span>}
      </div>
    </div>
  );
}

function Metric({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  value: string;
  tone?: 'default' | 'good' | 'warning';
}) {
  const toneClass = tone === 'good'
    ? 'text-emerald-600'
    : tone === 'warning'
      ? 'text-amber-600'
      : 'text-primary';

  return (
    <div className="rounded-lg border bg-background p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`mt-1 text-xl font-bold font-mono ${toneClass}`}>{value}</div>
    </div>
  );
}

export default function EngineeringIntelligencePage() {
  const [doorWidth, setDoorWidth] = useState(2.5);
  const [doorHeight, setDoorHeight] = useState(3.6);
  const [windSpeed, setWindSpeed] = useState(2);
  const [pressureDifference, setPressureDifference] = useState(5);
  const [temperatureDifference, setTemperatureDifference] = useState(15);
  const [curtainSeries, setCurtainSeries] = useState<AirCurtainSeries>('FM55');
  const [mountingType, setMountingType] = useState('wall');

  const curtainResult = useMemo(() => {
    const profile = CURTAIN_PROFILES[curtainSeries];
    const combination = bestWidthCombination(doorWidth, profile.widths);
    const installedWidth = combination.reduce((sum, width) => sum + width, 0);
    const effectiveWidth = installedWidth;
    const coverage = doorWidth > 0 ? Math.min(120, (effectiveWidth / doorWidth) * 100) : 0;
    const disturbance = windSpeed * 0.18 + Math.abs(pressureDifference) * 0.015;
    const decayLength = curtainSeries === 'FM55' ? 3.4 : curtainSeries === 'FM45' ? 3.1 : 2.8;
    const floorVelocity = profile.outletVelocity * Math.exp(-(doorHeight + disturbance) / decayLength);
    const heightPass = doorHeight <= profile.maxHeight;
    const coveragePass = coverage >= 100;
    const velocityPass = floorVelocity >= 2;
    const pass = heightPass && coveragePass && velocityPass;
    const recommendedSeries: AirCurtainSeries = doorHeight <= 3.5 ? 'FM35' : doorHeight <= 4.5 ? 'FM45' : 'FM55';
    const risk = !heightPass
      ? `Door height exceeds the ${profile.maxHeight} m series limit`
      : !coveragePass
        ? 'Selected combination leaves part of the doorway uncovered'
        : !velocityPass
          ? 'Estimated floor velocity is below the 2.0 m/s design target'
          : 'Door coverage and estimated jet reach are acceptable';

    return { profile, combination, installedWidth, effectiveWidth, coverage, floorVelocity, pass, risk, recommendedSeries };
  }, [curtainSeries, doorHeight, doorWidth, pressureDifference, windSpeed]);

  const [fanAirflow, setFanAirflow] = useState(5000);
  const [fanPressure, setFanPressure] = useState(350);
  const [fanDiameter, setFanDiameter] = useState(400);
  const [fanEfficiency, setFanEfficiency] = useState(65);
  const [airDensity, setAirDensity] = useState(1.2);
  const [selectedEffects, setSelectedEffects] = useState<string[]>(['outlet-elbow']);

  const fanReality = useMemo(() => {
    const airflowM3s = fanAirflow / 3600;
    const area = Math.PI * Math.pow(fanDiameter / 1000, 2) / 4;
    const velocity = area > 0 ? airflowM3s / area : 0;
    const velocityPressure = 0.5 * airDensity * velocity * velocity;
    const totalK = SYSTEM_EFFECTS
      .filter((effect) => selectedEffects.includes(effect.id))
      .reduce((sum, effect) => sum + effect.k, 0);
    const addedPressure = totalK * velocityPressure;
    const correctedPressure = fanPressure + addedPressure;
    const inputPower = fanEfficiency > 0 ? airflowM3s * correctedPressure / (fanEfficiency / 100) / 1000 : 0;
    const increase = fanPressure > 0 ? addedPressure / fanPressure * 100 : 0;
    const severity = increase > 25 ? 'high' : increase > 10 ? 'medium' : 'low';

    return { velocity, velocityPressure, totalK, addedPressure, correctedPressure, inputPower, increase, severity };
  }, [airDensity, fanAirflow, fanDiameter, fanEfficiency, fanPressure, selectedEffects]);

  const [energyMode, setEnergyMode] = useState<EnergyMode>('fan');
  const [hoursPerYear, setHoursPerYear] = useState(4000);
  const [tariff, setTariff] = useState(0.38);
  const [carbonFactor, setCarbonFactor] = useState(0.4);
  const [baselinePower, setBaselinePower] = useState(5.5);
  const [proposedPower, setProposedPower] = useState(4);
  const [projectPremium, setProjectPremium] = useState(2500);
  const [doorOpenHours, setDoorOpenHours] = useState(1200);
  const [doorCrossflow, setDoorCrossflow] = useState(0.35);
  const [curtainEffectiveness, setCurtainEffectiveness] = useState(75);
  const [cop, setCop] = useState(3.2);
  const [curtainPower, setCurtainPower] = useState(0.8);

  const energyResult = useMemo(() => {
    if (energyMode === 'fan') {
      const baselineKwh = baselinePower * hoursPerYear;
      const proposedKwh = proposedPower * hoursPerYear;
      const savingsKwh = Math.max(0, baselineKwh - proposedKwh);
      const annualSavings = savingsKwh * tariff;
      return {
        baselineKwh,
        proposedKwh,
        savingsKwh,
        annualSavings,
        carbonSavings: savingsKwh * carbonFactor,
        payback: annualSavings > 0 ? projectPremium / annualSavings : 0,
      };
    }

    const doorArea = doorWidth * doorHeight;
    const massFlow = doorArea * doorCrossflow * airDensity;
    const infiltrationCoolingKw = massFlow * 1.006 * Math.abs(temperatureDifference) / Math.max(cop, 0.1);
    const baselineKwh = infiltrationCoolingKw * doorOpenHours;
    const proposedKwh = baselineKwh * (1 - curtainEffectiveness / 100) + curtainPower * doorOpenHours;
    const savingsKwh = Math.max(0, baselineKwh - proposedKwh);
    const annualSavings = savingsKwh * tariff;
    return {
      baselineKwh,
      proposedKwh,
      savingsKwh,
      annualSavings,
      carbonSavings: savingsKwh * carbonFactor,
      payback: annualSavings > 0 ? projectPremium / annualSavings : 0,
    };
  }, [
    airDensity,
    baselinePower,
    carbonFactor,
    cop,
    curtainEffectiveness,
    curtainPower,
    doorCrossflow,
    doorHeight,
    doorOpenHours,
    doorWidth,
    energyMode,
    hoursPerYear,
    projectPremium,
    proposedPower,
    tariff,
    temperatureDifference,
  ]);

  const toggleEffect = (id: string) => {
    setSelectedEffects((current) => current.includes(id)
      ? current.filter((effectId) => effectId !== id)
      : [...current, id]);
  };

  return (
    <MainLayout>
      <section className="bg-gradient-primary py-10 text-primary-foreground print:bg-white print:text-black">
        <div className="container mx-auto px-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary-foreground/20">
                <Activity className="h-8 w-8" />
              </div>
              <div>
                <h1 className="text-3xl font-bold">Engineering Intelligence</h1>
                <p className="mt-1 text-primary-foreground/80">Design validation, site-risk prediction and lifecycle analysis</p>
              </div>
            </div>
            <Button variant="secondary" onClick={() => window.print()} className="print:hidden">
              <Printer className="mr-2 h-4 w-4" />
              Print Report
            </Button>
          </div>
        </div>
      </section>

      <section className="container mx-auto px-4 py-8">
        <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          These tools provide engineering estimates for design comparison. Final selections must be checked against the approved KINAIR catalogue, project specification and site conditions.
        </div>

        <Tabs defaultValue="door-twin" className="space-y-6">
          <TabsList className="grid h-auto w-full grid-cols-1 sm:grid-cols-3">
            <TabsTrigger value="door-twin" className="gap-2 py-3"><DoorOpen className="h-4 w-4" />Door Digital Twin</TabsTrigger>
            <TabsTrigger value="fan-reality" className="gap-2 py-3"><Fan className="h-4 w-4" />Fan Reality Check</TabsTrigger>
            <TabsTrigger value="energy" className="gap-2 py-3"><Leaf className="h-4 w-4" />Energy &amp; Payback</TabsTrigger>
          </TabsList>

          <TabsContent value="door-twin">
            <div className="grid gap-6 lg:grid-cols-[1fr_1.25fr]">
              <Card>
                <CardHeader>
                  <CardTitle>Door and site conditions</CardTitle>
                  <CardDescription>Different lengths may be combined, but different product series are never mixed.</CardDescription>
                </CardHeader>
                <CardContent className="grid grid-cols-2 gap-4">
                  <NumberField label="Door width" value={doorWidth} onChange={setDoorWidth} unit="m" min={0.5} step={0.1} />
                  <NumberField label="Door height" value={doorHeight} onChange={setDoorHeight} unit="m" min={1} step={0.1} />
                  <NumberField label="External crosswind" value={windSpeed} onChange={setWindSpeed} unit="m/s" step={0.1} />
                  <NumberField label="Pressure difference" value={pressureDifference} onChange={setPressureDifference} unit="Pa" step={1} />
                  <NumberField label="Temperature difference" value={temperatureDifference} onChange={setTemperatureDifference} unit="°C" step={1} />
                  <div>
                    <Label className="text-xs text-muted-foreground">Mounting</Label>
                    <Select value={mountingType} onValueChange={setMountingType}>
                      <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="wall">White wall mounted</SelectItem>
                        <SelectItem value="recessed">White ceiling recessed</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-2">
                    <Label className="text-xs text-muted-foreground">Air curtain series</Label>
                    <Select value={curtainSeries} onValueChange={(value) => setCurtainSeries(value as AirCurtainSeries)}>
                      <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="FM35">FM35 — up to 3.5 m</SelectItem>
                        <SelectItem value="FM45">FM45 — 3.5 to 4.5 m</SelectItem>
                        <SelectItem value="FM55">FM55 — 4.5 to 5.5 m</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between gap-3">
                    <span>Coverage and jet prediction</span>
                    {curtainResult.pass
                      ? <span className="flex items-center gap-1 text-sm text-emerald-600"><CheckCircle2 className="h-4 w-4" />PASS</span>
                      : <span className="flex items-center gap-1 text-sm text-amber-600"><AlertTriangle className="h-4 w-4" />CHECK</span>}
                  </CardTitle>
                  <CardDescription>{curtainResult.profile.label} • {mountingType === 'wall' ? 'White wall mounted' : 'White ceiling recessed'}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                  <div className="relative h-72 overflow-hidden rounded-xl border bg-gradient-to-b from-sky-100 via-slate-50 to-slate-200">
                    {mountingType === 'wall' ? (
                      <div className="absolute left-[8%] right-[8%] top-5 z-10 flex">
                        {curtainResult.combination.map((width, index) => (
                          <div
                            key={`${width}-${index}`}
                            className={`relative flex h-12 items-center justify-center border-y border-r border-slate-300 bg-gradient-to-b from-white to-slate-100 text-[10px] font-semibold text-slate-700 shadow-md first:border-l first:rounded-l-lg last:rounded-r-lg`}
                            style={{ flexGrow: width, flexBasis: 0 }}
                          >
                            <span className="absolute left-2 right-2 top-2 h-2 rounded-sm bg-slate-200" />
                            <span className="absolute bottom-1 left-2 text-[8px] font-bold text-sky-700">KINAIR</span>
                            <span className="absolute bottom-1 right-2">{width.toFixed(1)} m</span>
                            <span className="absolute -bottom-1 left-1 right-1 h-1 bg-slate-700" />
                          </div>
                        ))}
                      </div>
                    ) : (
                      <>
                        <div className="absolute left-[4%] right-[4%] top-0 z-10 h-14 border-b-4 border-slate-300 bg-white shadow-sm">
                          <div className="pt-1 text-center text-[10px] font-medium text-slate-500">CEILING — UNITS CONCEALED ABOVE</div>
                        </div>
                        <div className="absolute left-[8%] right-[8%] top-11 z-20 flex">
                          {curtainResult.combination.map((width, index) => (
                            <div
                              key={`grille-${width}-${index}`}
                              className="relative h-3 border-y border-r border-slate-500 bg-gradient-to-b from-slate-300 via-white to-slate-400 first:border-l"
                              style={{ flexGrow: width, flexBasis: 0 }}
                            >
                              <span className="absolute inset-x-1 top-1 h-[2px] bg-slate-700" />
                            </div>
                          ))}
                        </div>
                        <div className="absolute left-[8%] right-[8%] top-[59px] z-20 flex text-[9px] font-medium text-slate-600">
                          {curtainResult.combination.map((width, index) => (
                            <span key={`label-${width}-${index}`} className="text-center" style={{ flexGrow: width, flexBasis: 0 }}>
                              {width.toFixed(1)} m grille
                            </span>
                          ))}
                        </div>
                      </>
                    )}
                    <div className={`absolute bottom-6 left-[10%] right-[10%] overflow-hidden rounded-b-lg border-x-4 border-slate-500 bg-white/55 ${mountingType === 'recessed' ? 'top-[72px]' : 'top-[68px]'}`}>
                      <div
                        className={`mx-auto h-full origin-top bg-gradient-to-b ${curtainResult.pass ? 'from-cyan-400/75 via-cyan-300/35 to-cyan-100/5' : 'from-amber-400/70 via-amber-300/30 to-transparent'}`}
                        style={{
                          width: `${Math.min(100, curtainResult.coverage)}%`,
                          clipPath: `polygon(${8 + Math.min(16, windSpeed * 2)}% 0, 92% 0, ${70 + Math.min(15, windSpeed * 2)}% 100%, ${30 + Math.min(15, windSpeed * 2)}% 100%)`,
                        }}
                      />
                    </div>
                    <div className="absolute bottom-1 left-0 right-0 text-center text-xs text-slate-600">
                      Door {doorWidth.toFixed(2)} m W × {doorHeight.toFixed(2)} m H • units installed edge-to-edge
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-slate-50 p-3 text-sm">
                    <span>Automatic height recommendation</span>
                    <span className={`font-semibold ${curtainSeries === curtainResult.recommendedSeries ? 'text-emerald-600' : 'text-amber-600'}`}>
                      {curtainResult.recommendedSeries} for {doorHeight.toFixed(1)} m door
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <Metric label="Combination" value={curtainResult.combination.length ? curtainResult.combination.map((v) => v.toFixed(1)).join(' + ') : '—'} />
                    <Metric label="Effective width" value={`${curtainResult.effectiveWidth.toFixed(2)} m`} tone={curtainResult.coverage >= 100 ? 'good' : 'warning'} />
                    <Metric label="Coverage" value={`${curtainResult.coverage.toFixed(0)}%`} tone={curtainResult.coverage >= 100 ? 'good' : 'warning'} />
                    <Metric label="Floor velocity" value={`${curtainResult.floorVelocity.toFixed(1)} m/s`} tone={curtainResult.floorVelocity >= 2 ? 'good' : 'warning'} />
                  </div>
                  <div className={`rounded-lg p-3 text-sm ${curtainResult.pass ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-900'}`}>
                    {curtainResult.risk}. Allow final side clearance and installation tolerances before ordering.
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="fan-reality">
            <div className="grid gap-6 lg:grid-cols-[1fr_1.25fr]">
              <Card>
                <CardHeader>
                  <CardTitle>Selected fan duty</CardTitle>
                  <CardDescription>Add the real components installed close to the fan.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                  <div className="grid grid-cols-2 gap-4">
                    <NumberField label="Airflow" value={fanAirflow} onChange={setFanAirflow} unit="m³/h" step={100} />
                    <NumberField label="Scheduled static pressure" value={fanPressure} onChange={setFanPressure} unit="Pa" step={10} />
                    <NumberField label="Fan / duct diameter" value={fanDiameter} onChange={setFanDiameter} unit="mm" step={10} />
                    <NumberField label="Total efficiency" value={fanEfficiency} onChange={setFanEfficiency} unit="%" min={1} step={1} />
                    <NumberField label="Air density" value={airDensity} onChange={setAirDensity} unit="kg/m³" min={0.5} step={0.01} />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Nearby installation conditions</Label>
                    <div className="mt-2 grid gap-2">
                      {SYSTEM_EFFECTS.map((effect) => (
                        <label key={effect.id} className="flex cursor-pointer items-center justify-between rounded-lg border p-3 text-sm hover:bg-muted/50">
                          <span>{effect.label}</span>
                          <input
                            type="checkbox"
                            checked={selectedEffects.includes(effect.id)}
                            onChange={() => toggleEffect(effect.id)}
                            className="h-4 w-4 accent-primary"
                          />
                        </label>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    Corrected site duty
                    <span className={`text-sm uppercase ${fanReality.severity === 'high' ? 'text-destructive' : fanReality.severity === 'medium' ? 'text-amber-600' : 'text-emerald-600'}`}>
                      {fanReality.severity} risk
                    </span>
                  </CardTitle>
                  <CardDescription>Estimated additional pressure caused by non-ideal installation.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                  <div className="overflow-hidden rounded-xl border bg-gradient-to-b from-slate-50 to-slate-200 p-4">
                    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                      <div className="text-center">
                        <div className="mb-2 text-xs font-bold text-sky-700">INLET / SUCTION</div>
                        <div className="flex items-center justify-end gap-1">
                          <Wind className="h-5 w-5 text-sky-500" />
                          <div className="h-8 w-20 rounded-l-full border-2 border-slate-400 bg-white" />
                          <span className="text-2xl text-sky-600">→</span>
                        </div>
                        <div className="mt-3 flex flex-wrap justify-center gap-1">
                          {SYSTEM_EFFECTS.filter((effect) => effect.side === 'inlet' && selectedEffects.includes(effect.id)).map((effect) => (
                            <span key={effect.id} className="rounded-full bg-amber-100 px-2 py-1 text-[10px] text-amber-900">{effect.label}</span>
                          ))}
                          {!SYSTEM_EFFECTS.some((effect) => effect.side === 'inlet' && selectedEffects.includes(effect.id)) && (
                            <span className="rounded-full bg-emerald-100 px-2 py-1 text-[10px] text-emerald-800">Clear inlet</span>
                          )}
                        </div>
                      </div>

                      <svg viewBox="0 0 180 170" className="h-36 w-36 drop-shadow-xl" aria-label="Inline fan showing correct inlet and outlet direction">
                        <defs>
                          <linearGradient id="fanBodyReality" x1="0" x2="1">
                            <stop offset="0" stopColor="#e2e8f0" />
                            <stop offset=".45" stopColor="#ffffff" />
                            <stop offset="1" stopColor="#94a3b8" />
                          </linearGradient>
                        </defs>
                        <path d="M38 42 L139 42 L158 61 L158 111 L139 130 L38 130 L20 111 L20 61 Z" fill="url(#fanBodyReality)" stroke="#475569" strokeWidth="4" />
                        <ellipse cx="31" cy="86" rx="25" ry="43" fill="#cbd5e1" stroke="#475569" strokeWidth="4" />
                        <ellipse cx="31" cy="86" rx="17" ry="31" fill="#334155" />
                        <ellipse cx="147" cy="86" rx="25" ry="43" fill="#e2e8f0" stroke="#475569" strokeWidth="4" />
                        <ellipse cx="147" cy="86" rx="17" ry="31" fill="#334155" />
                        <g transform="translate(147 86)" fill="#cbd5e1">
                          <path d="M0 0 C5 -21 15 -23 20 -17 C13 -7 8 -2 0 0Z" />
                          <path d="M0 0 C21 5 23 15 17 20 C7 13 2 8 0 0Z" />
                          <path d="M0 0 C-5 21 -15 23 -20 17 C-13 7 -8 2 0 0Z" />
                          <path d="M0 0 C-21 -5 -23 -15 -17 -20 C-7 -13 -2 -8 0 0Z" />
                          <circle r="6" fill="#f8fafc" />
                        </g>
                        <rect x="65" y="24" width="54" height="28" rx="6" fill="#e2e8f0" stroke="#475569" strokeWidth="3" />
                        <path d="M55 130 L122 130 L132 150 L45 150 Z" fill="#94a3b8" stroke="#475569" strokeWidth="3" />
                        <text x="89" y="93" textAnchor="middle" fill="#0369a1" fontSize="15" fontWeight="700">KINAIR</text>
                      </svg>

                      <div className="text-center">
                        <div className="mb-2 text-xs font-bold text-orange-700">OUTLET / DISCHARGE</div>
                        <div className="flex items-center justify-start gap-1">
                          <span className="text-2xl text-orange-600">→</span>
                          <div className="h-8 w-20 rounded-r-full border-2 border-slate-400 bg-white" />
                          <Wind className="h-5 w-5 text-orange-500" />
                        </div>
                        <div className="mt-3 flex flex-wrap justify-center gap-1">
                          {SYSTEM_EFFECTS.filter((effect) => effect.side === 'outlet' && selectedEffects.includes(effect.id)).map((effect) => (
                            <span key={effect.id} className="rounded-full bg-amber-100 px-2 py-1 text-[10px] text-amber-900">{effect.label}</span>
                          ))}
                          {!SYSTEM_EFFECTS.some((effect) => effect.side === 'outlet' && selectedEffects.includes(effect.id)) && (
                            <span className="rounded-full bg-emerald-100 px-2 py-1 text-[10px] text-emerald-800">Clear discharge</span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="mt-2 text-center text-xs text-slate-500">Airflow direction: inlet → fan → outlet</div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <Metric label="Duct velocity" value={`${fanReality.velocity.toFixed(1)} m/s`} />
                    <Metric label="Velocity pressure" value={`${fanReality.velocityPressure.toFixed(0)} Pa`} />
                    <Metric label="Added system effect" value={`+${fanReality.addedPressure.toFixed(0)} Pa`} tone={fanReality.severity === 'low' ? 'good' : 'warning'} />
                    <Metric label="Corrected selection pressure" value={`${fanReality.correctedPressure.toFixed(0)} Pa`} tone="warning" />
                    <Metric label="Estimated input power" value={`${fanReality.inputPower.toFixed(2)} kW`} />
                    <Metric label="Pressure increase" value={`${fanReality.increase.toFixed(0)}%`} tone={fanReality.severity === 'low' ? 'good' : 'warning'} />
                  </div>
                  <div className="rounded-lg border bg-muted/40 p-4">
                    <h3 className="flex items-center gap-2 font-semibold"><Gauge className="h-4 w-4 text-primary" />Installation guidance</h3>
                    <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
                      <li>• Select against approximately {fanReality.correctedPressure.toFixed(0)} Pa, then verify on the actual performance curve.</li>
                      <li>• Target at least 3 duct diameters of straight inlet and 5 diameters at discharge where practical.</li>
                      <li>• At {fanDiameter} mm diameter, that is approximately {(fanDiameter * 3 / 1000).toFixed(1)} m inlet and {(fanDiameter * 5 / 1000).toFixed(1)} m discharge.</li>
                      <li>• This screening estimate does not replace a project-specific AMCA system-effect assessment.</li>
                    </ul>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="energy">
            <div className="grid gap-6 lg:grid-cols-[1fr_1.25fr]">
              <Card>
                <CardHeader>
                  <CardTitle>Lifecycle inputs</CardTitle>
                  <CardDescription>Compare annual energy, cost, carbon and simple payback.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                  <div>
                    <Label className="text-xs text-muted-foreground">Application</Label>
                    <Select value={energyMode} onValueChange={(value) => setEnergyMode(value as EnergyMode)}>
                      <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="fan">Fan efficiency comparison</SelectItem>
                        <SelectItem value="air-curtain">Air curtain infiltration savings</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {energyMode === 'fan' ? (
                    <div className="grid grid-cols-2 gap-4">
                      <NumberField label="Existing / baseline power" value={baselinePower} onChange={setBaselinePower} unit="kW" step={0.1} />
                      <NumberField label="Proposed KINAIR power" value={proposedPower} onChange={setProposedPower} unit="kW" step={0.1} />
                      <NumberField label="Operating hours" value={hoursPerYear} onChange={setHoursPerYear} unit="h/year" step={100} />
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-4">
                      <NumberField label="Door open hours" value={doorOpenHours} onChange={setDoorOpenHours} unit="h/year" step={100} />
                      <NumberField label="Cross-door air speed" value={doorCrossflow} onChange={setDoorCrossflow} unit="m/s" step={0.05} />
                      <NumberField label="Air curtain effectiveness" value={curtainEffectiveness} onChange={setCurtainEffectiveness} unit="%" step={5} />
                      <NumberField label="HVAC COP" value={cop} onChange={setCop} step={0.1} />
                      <NumberField label="Air curtain input power" value={curtainPower} onChange={setCurtainPower} unit="kW" step={0.1} />
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-4">
                    <NumberField label="Electricity tariff" value={tariff} onChange={setTariff} unit="AED/kWh" step={0.01} />
                    <NumberField label="Grid carbon factor" value={carbonFactor} onChange={setCarbonFactor} unit="kg/kWh" step={0.01} />
                    <NumberField label="Additional investment" value={projectPremium} onChange={setProjectPremium} unit="AED" step={100} />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2"><Zap className="h-5 w-5 text-primary" />Annual impact</CardTitle>
                  <CardDescription>{energyMode === 'fan' ? 'Existing fan versus proposed KINAIR selection' : 'Open doorway without versus with an air curtain'}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    <Metric label="Baseline energy" value={`${Math.round(energyResult.baselineKwh).toLocaleString()} kWh`} />
                    <Metric label="Proposed energy" value={`${Math.round(energyResult.proposedKwh).toLocaleString()} kWh`} />
                    <Metric label="Energy saved" value={`${Math.round(energyResult.savingsKwh).toLocaleString()} kWh`} tone="good" />
                    <Metric label="Annual saving" value={`AED ${Math.round(energyResult.annualSavings).toLocaleString()}`} tone="good" />
                    <Metric label="CO₂ avoided" value={`${Math.round(energyResult.carbonSavings).toLocaleString()} kg`} tone="good" />
                    <Metric label="Simple payback" value={energyResult.payback > 0 ? `${energyResult.payback.toFixed(1)} years` : 'No saving'} tone={energyResult.payback > 0 && energyResult.payback <= 3 ? 'good' : 'warning'} />
                  </div>
                  <div className="rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 p-5 text-white">
                    <div className="text-sm text-white/80">Projected 10-year operating-cost saving</div>
                    <div className="mt-1 text-3xl font-bold">AED {Math.round(energyResult.annualSavings * 10).toLocaleString()}</div>
                    <div className="mt-2 text-xs text-white/75">Before maintenance, tariff escalation and financing effects.</div>
                  </div>
                  <div className="rounded-lg border p-4 text-sm text-muted-foreground">
                    Results depend on actual operating hours, control strategy, weather, door usage and electricity tariff. Use measured site data for investment decisions.
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </section>
    </MainLayout>
  );
}
