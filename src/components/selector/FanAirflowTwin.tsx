import { Gauge, Minus, Plus, Wind } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AIRFLOW_UNITS, type FanPerformancePoint, type FanSelection, type FanType } from '@/lib/fanData';
import { InteractivePerformanceChart } from './InteractivePerformanceChart';

export type MultiFanArrangement = 'parallel' | 'series';

interface FanAirflowTwinProps {
  selection: FanSelection;
  operatingPoint: FanPerformancePoint;
  performanceData: FanPerformancePoint[];
  airflowUnit: keyof typeof AIRFLOW_UNITS;
  outletVelocity: number;
  dynamicPressure: number;
  totalPressure: number;
  fanRPM: number;
  imageUrl?: string | null;
  fanType?: FanType;
  quantity: number;
  arrangement: MultiFanArrangement;
  onQuantityChange: (quantity: number) => void;
  onArrangementChange: (arrangement: MultiFanArrangement) => void;
}

type CurvePoint = { airflow: number; staticPressure: number; shaftPower: number; efficiency?: number };

const formatNumber = (value: number) => value < 10 ? value.toFixed(2) : value < 100 ? value.toFixed(1) : Math.round(value).toLocaleString();

function findSystemIntersection(curve: CurvePoint[], k: number): CurvePoint | null {
  if (curve.length < 2 || !Number.isFinite(k) || k <= 0) return null;
  const sorted = [...curve].sort((a, b) => a.airflow - b.airflow);
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i];
    const b = sorted[i + 1];
    const ra = a.staticPressure - k * a.airflow * a.airflow;
    const rb = b.staticPressure - k * b.airflow * b.airflow;
    if (ra * rb <= 0) {
      let lo = a.airflow;
      let hi = b.airflow;
      const pressureAt = (q: number) => {
        const t = b.airflow === a.airflow ? 0 : (q - a.airflow) / (b.airflow - a.airflow);
        return a.staticPressure + t * (b.staticPressure - a.staticPressure);
      };
      for (let n = 0; n < 50; n++) {
        const mid = (lo + hi) / 2;
        const rmid = pressureAt(mid) - k * mid * mid;
        const rlo = pressureAt(lo) - k * lo * lo;
        if (rlo * rmid <= 0) hi = mid; else lo = mid;
      }
      const airflow = (lo + hi) / 2;
      const t = b.airflow === a.airflow ? 0 : (airflow - a.airflow) / (b.airflow - a.airflow);
      return {
        airflow,
        staticPressure: pressureAt(airflow),
        shaftPower: a.shaftPower + t * (b.shaftPower - a.shaftPower),
        efficiency: a.efficiency != null && b.efficiency != null ? a.efficiency + t * (b.efficiency - a.efficiency) : undefined,
      };
    }
  }
  return null;
}

export function FanAirflowTwin({ selection, operatingPoint, performanceData, airflowUnit, outletVelocity, dynamicPressure, fanRPM, fanType, quantity, arrangement, onQuantityChange, onArrangementChange }: FanAirflowTwinProps) {
  const isParallel = arrangement === 'parallel';
  const diameterM = selection.diameter / 1000;
  const singleArea = Math.PI * Math.pow(diameterM / 2, 2);

  // IMPORTANT: feed the exact core-engine performanceData into the same chart component.
  // Do not pre-trim or smooth here; InteractivePerformanceChart owns the stable-region,
  // units, axis, interpolation and system-curve presentation exactly as in core selection.
  const combinedPerformanceData: FanPerformancePoint[] = performanceData.map(point => ({
    ...point,
    airflow: point.airflow * (isParallel ? quantity : 1),
    staticPressure: point.staticPressure * (isParallel ? 1 : quantity),
    shaftPower: (point.shaftPower || 0) * quantity,
  }));

  const systemK = operatingPoint.airflow > 0
    ? operatingPoint.staticPressure / (operatingPoint.airflow * operatingPoint.airflow)
    : 0;
  const intersection = quantity === 1
    ? { ...operatingPoint }
    : findSystemIntersection(combinedPerformanceData as CurvePoint[], systemK);

  const systemDuty: FanPerformancePoint = intersection || {
    ...operatingPoint,
    airflow: operatingPoint.airflow * (isParallel ? quantity : 1),
    staticPressure: operatingPoint.staticPressure * (isParallel ? 1 : quantity),
    shaftPower: (operatingPoint.shaftPower || 0) * quantity,
  };

  const systemAirflowCmh = systemDuty.airflow;
  const systemStaticPressure = systemDuty.staticPressure;
  const systemFlowM3s = systemAirflowCmh / 3600;
  const systemPower = systemDuty.shaftPower || 0;
  const systemArea = singleArea * (isParallel ? quantity : 1);
  const singleNoise = selection.noiseData?.overall || 0;
  const systemNoise = singleNoise > 0 ? singleNoise + 10 * Math.log10(quantity) : 0;
  const tipSpeed = Math.PI * diameterM * fanRPM / 60;
  const specificFanPower = systemFlowM3s > 0 ? systemPower * 1000 / systemFlowM3s : 0;
  const velocityPressureAtDuty = dynamicPressure * Math.pow(systemAirflowCmh / Math.max(operatingPoint.airflow * (isParallel ? quantity : 1), 1), 2);
  const systemTotalPressure = systemStaticPressure + velocityPressureAtDuty;
  const airPower = systemTotalPressure * systemFlowM3s / 1000;
  const displayAirflow = systemAirflowCmh * AIRFLOW_UNITS[airflowUnit].factor;
  const systemLabel = quantity === 1 ? 'Single fan' : `${quantity} fans in ${arrangement}`;

  return (
    <section className="mb-6 overflow-hidden rounded-xl border border-border/60 bg-white">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b bg-slate-50 px-4 py-3">
        <div>
          <h3 className="font-bold text-foreground">Multi-fan System Effect</h3>
          <p className="text-sm text-muted-foreground">{selection.nomenclature} · {fanType || 'fan'} · Ø{selection.diameter} mm · {systemLabel}</p>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${intersection ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-800'}`}>
          {intersection ? 'CURVE INTERSECTION FOUND' : 'CHECK OPERATING RANGE'}
        </span>
      </div>

      <div className="grid gap-4 border-b bg-white p-4 md:grid-cols-[auto_1fr]">
        <div>
          <div className="mb-2 text-sm font-medium">Fans in system</div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => onQuantityChange(Math.max(1, quantity - 1))} disabled={quantity <= 1}><Minus className="h-4 w-4" /></Button>
            <span className="min-w-10 text-center text-lg font-bold">{quantity}</span>
            <Button variant="outline" size="sm" onClick={() => onQuantityChange(Math.min(6, quantity + 1))} disabled={quantity >= 6}><Plus className="h-4 w-4" /></Button>
          </div>
        </div>
        <div>
          <div className="mb-2 text-sm font-medium">System arrangement</div>
          <div className="flex flex-wrap gap-2">
            <Button variant={isParallel ? 'default' : 'outline'} size="sm" onClick={() => onArrangementChange('parallel')}>Parallel - airflow adds</Button>
            <Button variant={!isParallel ? 'default' : 'outline'} size="sm" onClick={() => onArrangementChange('series')}>Series - pressure adds</Button>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">Same KINAIR core curve engine. Parallel multiplies airflow only; series multiplies pressure only. Operating point is recalculated against the same system resistance.</p>
        </div>
      </div>

      <div className="grid gap-6 border-t p-4 lg:grid-cols-[320px_1fr]">
        <div>
          <h4 className="font-semibold">Core engine — combined performance</h4>
          <p className="mt-1 text-sm text-muted-foreground">This graph now uses InteractivePerformanceChart, the same component used by the main fan selector. No separate SVG/curve renderer remains here.</p>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div className="rounded-lg border p-3"><span className="block text-xs text-muted-foreground">Operating airflow</span><b>{formatNumber(displayAirflow)} {AIRFLOW_UNITS[airflowUnit].label}</b></div>
            <div className="rounded-lg border p-3"><span className="block text-xs text-muted-foreground">Operating static pressure</span><b>{systemStaticPressure.toFixed(1)} Pa</b></div>
            <div className="rounded-lg border p-3"><span className="block text-xs text-muted-foreground">Total shaft power</span><b>{systemPower.toFixed(2)} kW</b></div>
            <div className="rounded-lg border p-3"><span className="block text-xs text-muted-foreground">Combined noise</span><b>{systemNoise > 0 ? `${systemNoise.toFixed(1)} dB(A)` : '-'}</b></div>
          </div>
        </div>
        <div className="min-h-[420px] rounded-xl border border-slate-300 bg-white p-2 shadow-sm">
          <InteractivePerformanceChart
            performanceData={combinedPerformanceData}
            operatingPoint={systemDuty}
            requiredDutyPoint={{ airflow: systemDuty.airflow, pressure: systemDuty.staticPressure }}
            airflowUnit={airflowUnit}
            pressureUnit="Pa"
            chartType="pressure"
            interactive={false}
            showSystemCurve={true}
            showStallZone={false}
            fanDiameter={selection.diameter}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 border-t bg-slate-50 p-4 sm:grid-cols-4 xl:grid-cols-8">
        <div className="rounded-lg border bg-white p-3"><Wind className="mb-1 h-4 w-4 text-cyan-600"/><span className="block text-xs text-muted-foreground">System airflow</span><b>{formatNumber(displayAirflow)} {AIRFLOW_UNITS[airflowUnit].label}</b></div>
        <div className="rounded-lg border bg-white p-3"><span className="block text-xs text-muted-foreground">Velocity per fan</span><b>{outletVelocity.toFixed(2)} m/s</b></div>
        <div className="rounded-lg border bg-white p-3"><span className="block text-xs text-muted-foreground">Combined outlet area</span><b>{systemArea.toFixed(3)} m²</b></div>
        <div className="rounded-lg border bg-white p-3"><Gauge className="mb-1 h-4 w-4 text-blue-600"/><span className="block text-xs text-muted-foreground">Velocity pressure</span><b>{velocityPressureAtDuty.toFixed(1)} Pa</b></div>
        <div className="rounded-lg border bg-white p-3"><span className="block text-xs text-muted-foreground">System total pressure</span><b>{systemTotalPressure.toFixed(1)} Pa</b></div>
        <div className="rounded-lg border bg-white p-3"><span className="block text-xs text-muted-foreground">Tip speed</span><b>{tipSpeed.toFixed(1)} m/s</b></div>
        <div className="rounded-lg border bg-white p-3"><span className="block text-xs text-muted-foreground">Specific fan power</span><b>{specificFanPower.toFixed(0)} W/(m³/s)</b></div>
        <div className="rounded-lg border bg-white p-3"><span className="block text-xs text-muted-foreground">Air power</span><b>{airPower.toFixed(2)} kW</b></div>
      </div>
    </section>
  );
}
