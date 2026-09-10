import { ArrowRight, Gauge, Minus, Plus, Wind } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  AIRFLOW_UNITS,
  type FanPerformancePoint,
  type FanSelection,
  type FanType,
} from '@/lib/fanData';

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

const formatNumber = (value: number) =>
  value < 10 ? value.toFixed(2) : value < 100 ? value.toFixed(1) : Math.round(value).toLocaleString();

export function FanAirflowTwin({
  selection,
  operatingPoint,
  performanceData,
  airflowUnit,
  outletVelocity,
  dynamicPressure,
  totalPressure,
  fanRPM,
  imageUrl,
  fanType,
  quantity,
  arrangement,
  onQuantityChange,
  onArrangementChange,
}: FanAirflowTwinProps) {
  const diameterM = selection.diameter / 1000;
  const singleArea = Math.PI * Math.pow(diameterM / 2, 2);
  const isParallel = arrangement === 'parallel';
  const systemAirflowCmh = operatingPoint.airflow * (isParallel ? quantity : 1);
  const systemStaticPressure = operatingPoint.staticPressure * (isParallel ? 1 : quantity);
  const systemTotalPressure = totalPressure * (isParallel ? 1 : quantity);
  const systemArea = singleArea * (isParallel ? quantity : 1);
  const systemFlowM3s = systemAirflowCmh / 3600;
  const systemPower = operatingPoint.shaftPower * quantity;
  const singleNoise = selection.noiseData?.overall || 0;
  const systemNoise = singleNoise > 0 ? singleNoise + 10 * Math.log10(quantity) : 0;
  const tipSpeed = Math.PI * diameterM * fanRPM / 60;
  const specificFanPower = systemFlowM3s > 0 ? systemPower * 1000 / systemFlowM3s : 0;
  const airPower = systemTotalPressure * systemFlowM3s / 1000;
  const displayAirflow = systemAirflowCmh * AIRFLOW_UNITS[airflowUnit].factor;
  const dutyPass = selection.dutyPointMatch >= 95;
  const particleDuration = Math.max(0.65, Math.min(2.2, 4 / Math.max(outletVelocity, 1)));

  const singleCurve = performanceData.filter((point) => point.airflow >= 0 && point.staticPressure >= 0);
  const combinedCurve = singleCurve.map((point) => ({
    airflow: point.airflow * (isParallel ? quantity : 1),
    pressure: point.staticPressure * (isParallel ? 1 : quantity),
  }));
  const maxFlow = Math.max(1, ...singleCurve.map((point) => point.airflow), ...combinedCurve.map((point) => point.airflow));
  const maxPressure = Math.max(1, ...singleCurve.map((point) => point.staticPressure), ...combinedCurve.map((point) => point.pressure));
  const curvePoints = (points: { airflow: number; pressure: number }[]) =>
    points.map((point) => `${10 + point.airflow / maxFlow * 82},${90 - point.pressure / maxPressure * 76}`).join(' ');
  const systemLabel = quantity === 1 ? 'Single fan' : `${quantity} fans in ${arrangement}`;

  return (
    <section className="mb-6 overflow-hidden rounded-xl border border-border/60 bg-white">
      <style>{`
        @keyframes fanTwinInlet {
          from { transform: translateX(-42px); opacity: 0; }
          18% { opacity: .85; }
          to { transform: translateX(150px); opacity: 0; }
        }
        @keyframes fanTwinOutlet {
          from { transform: translateX(-18px); opacity: 0; }
          15% { opacity: .95; }
          to { transform: translateX(210px); opacity: 0; }
        }
        @keyframes fanTwinPulse {
          0%,100% { opacity: .36; transform: scaleY(.94); }
          50% { opacity: .7; transform: scaleY(1.04); }
        }
        @media (prefers-reduced-motion:reduce) {
          .fan-twin-particle,.fan-twin-pulse { animation:none!important; }
        }
      `}</style>

      <div className="flex flex-wrap items-start justify-between gap-3 border-b bg-slate-50 px-4 py-3">
        <div>
          <h3 className="font-bold text-foreground">Actual-model Fan Airflow Twin</h3>
          <p className="text-sm text-muted-foreground">
            {selection.nomenclature} · {fanType || 'fan'} · Ø{selection.diameter} mm · {systemLabel}
          </p>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${dutyPass ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-800'}`}>
          {dutyPass ? 'OPERATING POINT PASS' : 'CHECK OPERATING POINT'}
        </span>
      </div>

      <div className="grid gap-4 border-b bg-white p-4 md:grid-cols-[auto_1fr]">
        <div>
          <div className="mb-2 text-sm font-medium">Fans in system</div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" aria-label="Remove one fan" onClick={() => onQuantityChange(Math.max(1, quantity - 1))} disabled={quantity <= 1}>
              <Minus className="h-4 w-4" />
            </Button>
            <span className="min-w-10 text-center text-lg font-bold">{quantity}</span>
            <Button variant="outline" size="sm" aria-label="Add one fan" onClick={() => onQuantityChange(Math.min(6, quantity + 1))} disabled={quantity >= 6}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <div>
          <div className="mb-2 text-sm font-medium">System arrangement</div>
          <div className="flex flex-wrap gap-2">
            <Button variant={isParallel ? 'default' : 'outline'} size="sm" onClick={() => onArrangementChange('parallel')}>
              Parallel - airflow adds
            </Button>
            <Button variant={!isParallel ? 'default' : 'outline'} size="sm" onClick={() => onArrangementChange('series')}>
              Series - pressure adds
            </Button>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            {isParallel
              ? `Ideal identical-fan law: Qtotal = ${quantity} × Qfan; pressure remains at one-fan pressure.`
              : `Ideal identical-fan law: pressure total = ${quantity} × fan pressure; airflow remains at one-fan airflow.`}
          </p>
        </div>
      </div>

      <div className="grid gap-4 p-4 lg:grid-cols-[1fr_240px_1fr]">
        <div className="relative min-h-52 overflow-hidden rounded-xl border border-cyan-200 bg-gradient-to-r from-cyan-50 to-cyan-200/70">
          <div className="absolute inset-x-0 top-3 flex items-center justify-center gap-2 text-xs font-bold tracking-wide text-cyan-800">
            INLET AIR <ArrowRight className="h-4 w-4" />
          </div>
          {[18, 35, 52, 69, 84].map((top, index) => (
            <span key={top} className="fan-twin-particle absolute left-0 h-1.5 w-12 rounded-full bg-cyan-500/70 shadow-[0_0_10px_rgba(6,182,212,.65)]"
              style={{ top: `${top}%`, animation: `fanTwinInlet ${particleDuration * 1.25}s linear infinite`, animationDelay: `${-index * particleDuration * .22}s` }} />
          ))}
          <div className="fan-twin-pulse absolute bottom-3 left-3 right-3 rounded-md bg-white/80 px-3 py-2 text-center text-sm font-semibold text-cyan-900" style={{ animation: 'fanTwinPulse 2.3s ease-in-out infinite' }}>
            {isParallel && quantity > 1 ? 'Flow divides equally into fan branches' : 'Uniform inlet flow'}
          </div>
        </div>

        <div className="flex min-h-52 flex-col rounded-xl border bg-white p-3 shadow-sm">
          <div className="text-center text-xs font-medium text-muted-foreground">{systemLabel}</div>
          <div className={`mt-2 grid flex-1 place-content-center gap-1 ${quantity > 3 ? 'grid-cols-3' : quantity > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
            {Array.from({ length: quantity }, (_, index) => (
              <div key={index} className="relative flex min-h-14 items-center justify-center rounded-md border bg-slate-50 p-1">
                {imageUrl ? (
                  <img src={imageUrl} alt={`${selection.nomenclature} fan ${index + 1}`} className={`w-full object-contain ${quantity === 1 ? 'h-28' : 'h-14'}`} />
                ) : (
                  <span className="text-center text-xs font-semibold text-slate-600">{selection.nomenclature}</span>
                )}
                {quantity > 1 && <span className="absolute right-1 top-0.5 text-[10px] font-bold text-primary">F{index + 1}</span>}
              </div>
            ))}
          </div>
          <div className="mt-1 text-center text-xs text-slate-600">Inlet <ArrowRight className="inline h-3.5 w-3.5" /> Outlet</div>
        </div>

        <div className="relative min-h-52 overflow-hidden rounded-xl border border-blue-200 bg-gradient-to-r from-blue-200/80 to-blue-50">
          <div className="absolute inset-x-0 top-3 flex items-center justify-center gap-2 text-xs font-bold tracking-wide text-blue-800">
            COMBINED OUTLET <ArrowRight className="h-4 w-4" />
          </div>
          {[16, 31, 47, 63, 79, 90].map((top, index) => (
            <span key={top} className="fan-twin-particle absolute left-0 h-1.5 w-16 rounded-full bg-blue-500/75 shadow-[0_0_12px_rgba(59,130,246,.7)]"
              style={{ top: `${top}%`, animation: `fanTwinOutlet ${particleDuration}s linear infinite`, animationDelay: `${-index * particleDuration * .16}s` }} />
          ))}
          <div className="fan-twin-pulse absolute bottom-3 left-3 right-3 rounded-md bg-white/85 px-3 py-2 text-center text-sm font-semibold text-blue-900" style={{ animation: 'fanTwinPulse 1.8s ease-in-out infinite' }}>
            {formatNumber(displayAirflow)} {AIRFLOW_UNITS[airflowUnit].label} combined
          </div>
        </div>
      </div>

      {singleCurve.length > 1 && (
        <div className="grid gap-4 border-t p-4 lg:grid-cols-[1fr_280px]">
          <div>
            <h4 className="font-semibold">System effect on performance</h4>
            <p className="mt-1 text-sm text-muted-foreground">
              Dashed line is one fan. Blue line is the calculated {quantity}-fan {arrangement} curve.
            </p>
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-lg border p-3"><span className="block text-xs text-muted-foreground">Combined airflow</span><b>{formatNumber(displayAirflow)} {AIRFLOW_UNITS[airflowUnit].label}</b></div>
              <div className="rounded-lg border p-3"><span className="block text-xs text-muted-foreground">Combined static pressure</span><b>{systemStaticPressure.toFixed(1)} Pa</b></div>
              <div className="rounded-lg border p-3"><span className="block text-xs text-muted-foreground">Total input power</span><b>{systemPower.toFixed(2)} kW</b></div>
              <div className="rounded-lg border p-3"><span className="block text-xs text-muted-foreground">Combined noise</span><b>{systemNoise > 0 ? `${systemNoise.toFixed(1)} dB(A)` : '-'}</b></div>
            </div>
          </div>
          <div className="rounded-xl border bg-slate-50 p-3">
            <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground"><span>Pressure</span><span>Airflow →</span></div>
            <svg viewBox="0 0 100 100" className="h-44 w-full" role="img" aria-label={`Single fan and ${quantity}-fan ${arrangement} performance curves`}>
              <line x1="10" y1="8" x2="10" y2="90" stroke="#94a3b8" strokeWidth="1" />
              <line x1="10" y1="90" x2="96" y2="90" stroke="#94a3b8" strokeWidth="1" />
              <polyline points={curvePoints(singleCurve.map((point) => ({ airflow: point.airflow, pressure: point.staticPressure })))} fill="none" stroke="#64748b" strokeWidth="2" strokeDasharray="4 3" />
              <polyline points={curvePoints(combinedCurve)} fill="none" stroke="#2563eb" strokeWidth="3" />
            </svg>
            <div className="flex justify-center gap-4 text-xs"><span className="text-slate-600">- - Single fan</span><span className="font-semibold text-blue-700">— Combined system</span></div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 border-t bg-slate-50 p-4 sm:grid-cols-4 xl:grid-cols-8">
        <div className="rounded-lg border bg-white p-3"><Wind className="mb-1 h-4 w-4 text-cyan-600" /><span className="block text-xs text-muted-foreground">System airflow</span><b>{formatNumber(displayAirflow)} {AIRFLOW_UNITS[airflowUnit].label}</b></div>
        <div className="rounded-lg border bg-white p-3"><span className="block text-xs text-muted-foreground">Velocity per fan</span><b>{outletVelocity.toFixed(2)} m/s</b></div>
        <div className="rounded-lg border bg-white p-3"><span className="block text-xs text-muted-foreground">Combined outlet area</span><b>{systemArea.toFixed(3)} m²</b></div>
        <div className="rounded-lg border bg-white p-3"><Gauge className="mb-1 h-4 w-4 text-blue-600" /><span className="block text-xs text-muted-foreground">Velocity pressure</span><b>{dynamicPressure.toFixed(1)} Pa</b></div>
        <div className="rounded-lg border bg-white p-3"><span className="block text-xs text-muted-foreground">System total pressure</span><b>{systemTotalPressure.toFixed(1)} Pa</b></div>
        <div className="rounded-lg border bg-white p-3"><span className="block text-xs text-muted-foreground">Tip speed</span><b>{tipSpeed.toFixed(1)} m/s</b></div>
        <div className="rounded-lg border bg-white p-3"><span className="block text-xs text-muted-foreground">Specific fan power</span><b>{specificFanPower.toFixed(0)} W/(m³/s)</b></div>
        <div className="rounded-lg border bg-white p-3"><span className="block text-xs text-muted-foreground">Air power</span><b>{airPower.toFixed(2)} kW</b></div>
      </div>
      <p className="border-t bg-amber-50 px-4 py-2 text-xs text-amber-900">
        Ideal identical-fan calculation. Final duty must be checked against the combined fan curve and actual system resistance, branch losses and non-return dampers.
      </p>
    </section>
  );
}
