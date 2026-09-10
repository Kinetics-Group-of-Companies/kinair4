import { Gauge, Minus, Plus, Wind } from 'lucide-react';
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

      <div className="flex flex-wrap items-start justify-between gap-3 border-b bg-slate-50 px-4 py-3">
        <div>
          <h3 className="font-bold text-foreground">Multi-fan System Effect</h3>
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

      {singleCurve.length > 1 && (
        <div className="grid gap-6 border-t p-4 lg:grid-cols-[320px_1fr]">
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
          <div className="rounded-xl border border-slate-300 bg-white p-4 shadow-sm">
            <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground"><span>Pressure</span><span>Airflow →</span></div>
            <svg viewBox="0 0 100 100" className="h-[320px] w-full" role="img" aria-label={`Single fan and ${quantity}-fan ${arrangement} airflow versus static pressure curves`}>
              {[10, 30, 50, 70, 90].map((tick) => (
                <line key={`h-${tick}`} x1="10" y1={tick} x2="96" y2={tick} stroke="#dbe3ec" strokeWidth=".45" />
              ))}
              {[10, 31.5, 53, 74.5, 96].map((tick) => (
                <line key={`v-${tick}`} x1={tick} y1="8" x2={tick} y2="90" stroke="#dbe3ec" strokeWidth=".45" />
              ))}
              <line x1="10" y1="8" x2="10" y2="90" stroke="#475569" strokeWidth="1.1" />
              <line x1="10" y1="90" x2="96" y2="90" stroke="#475569" strokeWidth="1.1" />
              <text x="3" y="51" transform="rotate(-90 3 51)" fontSize="4" fill="#475569" textAnchor="middle">Static pressure (Pa)</text>
              <text x="53" y="98" fontSize="4" fill="#475569" textAnchor="middle">Airflow ({AIRFLOW_UNITS[airflowUnit].label})</text>
              <text x="9" y="94" fontSize="3.5" fill="#64748b" textAnchor="end">0</text>
              <text x="95" y="94" fontSize="3.5" fill="#64748b" textAnchor="end">{formatNumber(maxFlow * AIRFLOW_UNITS[airflowUnit].factor)}</text>
              <text x="8" y="10" fontSize="3.5" fill="#64748b" textAnchor="end">{formatNumber(maxPressure)}</text>
              <polyline points={curvePoints(singleCurve.map((point) => ({ airflow: point.airflow, pressure: point.staticPressure })))} fill="none" stroke="#64748b" strokeWidth="1.7" strokeDasharray="4 3" strokeLinejoin="round" />
              <polyline points={curvePoints(combinedCurve)} fill="none" stroke="#2563eb" strokeWidth="2.7" strokeLinejoin="round" />
              <circle cx={10 + operatingPoint.airflow / maxFlow * 82} cy={90 - operatingPoint.staticPressure / maxPressure * 76} r="2.2" fill="#64748b" stroke="white" strokeWidth=".8" />
              <circle cx={10 + systemAirflowCmh / maxFlow * 82} cy={90 - systemStaticPressure / maxPressure * 76} r="2.7" fill="#f97316" stroke="white" strokeWidth=".9" />
              <text x={Math.min(92, 13 + systemAirflowCmh / maxFlow * 82)} y={Math.max(10, 86 - systemStaticPressure / maxPressure * 76)} fontSize="3.6" fontWeight="700" fill="#c2410c">System duty</text>
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
