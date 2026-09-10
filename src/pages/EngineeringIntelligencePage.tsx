import { useMemo, useState } from 'react';
import { Leaf, Printer, Zap } from 'lucide-react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

type EnergyMode = 'fan' | 'air-curtain';

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
  const [temperatureDifference, setTemperatureDifference] = useState(15);
  const [airDensity, setAirDensity] = useState(1.2);
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

  return (
    <MainLayout>
      <section className="bg-gradient-primary py-10 text-primary-foreground print:bg-white print:text-black">
        <div className="container mx-auto px-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary-foreground/20">
                <Leaf className="h-8 w-8" />
              </div>
              <div>
                <h1 className="text-3xl font-bold">Energy &amp; Payback Calculator</h1>
                <p className="mt-1 text-primary-foreground/80">Compare annual energy, operating cost, carbon savings and simple payback</p>
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
          Results are engineering estimates for comparison. Use measured site data and approved KINAIR product performance for investment decisions.
        </div>
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
      </section>
    </MainLayout>
  );
}
