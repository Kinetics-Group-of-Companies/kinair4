import { ArrowRight, Gauge, Wind } from 'lucide-react';
import {
  AIRFLOW_UNITS,
  type FanPerformancePoint,
  type FanSelection,
  type FanType,
} from '@/lib/fanData';

interface FanAirflowTwinProps {
  selection: FanSelection;
  operatingPoint: FanPerformancePoint;
  airflowUnit: keyof typeof AIRFLOW_UNITS;
  outletVelocity: number;
  dynamicPressure: number;
  totalPressure: number;
  fanRPM: number;
  imageUrl?: string | null;
  fanType?: FanType;
}

export function FanAirflowTwin({
  selection,
  operatingPoint,
  airflowUnit,
  outletVelocity,
  dynamicPressure,
  totalPressure,
  fanRPM,
  imageUrl,
  fanType,
}: FanAirflowTwinProps) {
  const diameterM = selection.diameter / 1000;
  const ductArea = Math.PI * Math.pow(diameterM / 2, 2);
  const flowM3s = operatingPoint.airflow / 3600;
  const tipSpeed = Math.PI * diameterM * fanRPM / 60;
  const specificFanPower = flowM3s > 0 ? operatingPoint.shaftPower * 1000 / flowM3s : 0;
  const airPower = totalPressure * flowM3s / 1000;
  const displayAirflow = operatingPoint.airflow * AIRFLOW_UNITS[airflowUnit].factor;
  const dutyPass = selection.dutyPointMatch >= 95;
  const particleDuration = Math.max(0.65, Math.min(2.2, 4 / Math.max(outletVelocity, 1)));

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
            {selection.nomenclature} · {fanType || 'fan'} · Ø{selection.diameter} mm
          </p>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${dutyPass ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-800'}`}>
          {dutyPass ? 'OPERATING POINT PASS' : 'CHECK OPERATING POINT'}
        </span>
      </div>

      <div className="grid gap-4 p-4 lg:grid-cols-[1fr_220px_1fr]">
        <div className="relative min-h-48 overflow-hidden rounded-xl border border-cyan-200 bg-gradient-to-r from-cyan-50 to-cyan-200/70">
          <div className="absolute inset-x-0 top-3 flex items-center justify-center gap-2 text-xs font-bold tracking-wide text-cyan-800">
            INLET AIR <ArrowRight className="h-4 w-4" />
          </div>
          {[18, 35, 52, 69, 84].map((top, index) => (
            <span
              key={top}
              className="fan-twin-particle absolute left-0 h-1.5 w-12 rounded-full bg-cyan-500/70 shadow-[0_0_10px_rgba(6,182,212,.65)]"
              style={{
                top: `${top}%`,
                animation: `fanTwinInlet ${particleDuration * 1.25}s linear infinite`,
                animationDelay: `${-index * particleDuration * .22}s`,
              }}
            />
          ))}
          <div className="fan-twin-pulse absolute bottom-3 left-3 right-3 rounded-md bg-white/80 px-3 py-2 text-center text-sm font-semibold text-cyan-900"
            style={{ animation: 'fanTwinPulse 2.3s ease-in-out infinite' }}>
            Air enters uniformly across the inlet
          </div>
        </div>

        <div className="flex min-h-48 flex-col items-center justify-center rounded-xl border bg-white p-3 shadow-sm">
          <div className="text-xs font-medium text-muted-foreground">Selected product</div>
          {imageUrl ? (
            <img
              src={imageUrl}
              alt={`${selection.nomenclature} selected fan`}
              className="mt-2 h-32 w-full object-contain"
            />
          ) : (
            <div className="mt-2 flex h-32 w-full items-center justify-center rounded-lg bg-slate-100 text-center text-sm font-semibold text-slate-600">
              {selection.nomenclature}
            </div>
          )}
          <div className="mt-1 text-center text-xs text-slate-600">
            Inlet <ArrowRight className="inline h-3.5 w-3.5" /> Outlet
          </div>
        </div>

        <div className="relative min-h-48 overflow-hidden rounded-xl border border-blue-200 bg-gradient-to-r from-blue-200/80 to-blue-50">
          <div className="absolute inset-x-0 top-3 flex items-center justify-center gap-2 text-xs font-bold tracking-wide text-blue-800">
            OUTLET AIR <ArrowRight className="h-4 w-4" />
          </div>
          {[16, 31, 47, 63, 79, 90].map((top, index) => (
            <span
              key={top}
              className="fan-twin-particle absolute left-0 h-1.5 w-16 rounded-full bg-blue-500/75 shadow-[0_0_12px_rgba(59,130,246,.7)]"
              style={{
                top: `${top}%`,
                animation: `fanTwinOutlet ${particleDuration}s linear infinite`,
                animationDelay: `${-index * particleDuration * .16}s`,
              }}
            />
          ))}
          <div className="fan-twin-pulse absolute bottom-3 left-3 right-3 rounded-md bg-white/85 px-3 py-2 text-center text-sm font-semibold text-blue-900"
            style={{ animation: 'fanTwinPulse 1.8s ease-in-out infinite' }}>
            {outletVelocity.toFixed(1)} m/s uniform discharge
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 border-t bg-slate-50 p-4 sm:grid-cols-4 xl:grid-cols-8">
        <div className="rounded-lg border bg-white p-3"><Wind className="mb-1 h-4 w-4 text-cyan-600" /><span className="block text-xs text-muted-foreground">Airflow</span><b>{displayAirflow < 100 ? displayAirflow.toFixed(1) : Math.round(displayAirflow).toLocaleString()} {AIRFLOW_UNITS[airflowUnit].label}</b></div>
        <div className="rounded-lg border bg-white p-3"><span className="block text-xs text-muted-foreground">Outlet velocity</span><b>{outletVelocity.toFixed(2)} m/s</b></div>
        <div className="rounded-lg border bg-white p-3"><span className="block text-xs text-muted-foreground">Duct area</span><b>{ductArea.toFixed(3)} m²</b></div>
        <div className="rounded-lg border bg-white p-3"><Gauge className="mb-1 h-4 w-4 text-blue-600" /><span className="block text-xs text-muted-foreground">Velocity pressure</span><b>{dynamicPressure.toFixed(1)} Pa</b></div>
        <div className="rounded-lg border bg-white p-3"><span className="block text-xs text-muted-foreground">Total pressure</span><b>{totalPressure.toFixed(1)} Pa</b></div>
        <div className="rounded-lg border bg-white p-3"><span className="block text-xs text-muted-foreground">Tip speed</span><b>{tipSpeed.toFixed(1)} m/s</b></div>
        <div className="rounded-lg border bg-white p-3"><span className="block text-xs text-muted-foreground">Specific fan power</span><b>{specificFanPower.toFixed(0)} W/(m³/s)</b></div>
        <div className="rounded-lg border bg-white p-3"><span className="block text-xs text-muted-foreground">Air power</span><b>{airPower.toFixed(2)} kW</b></div>
      </div>
    </section>
  );
}
