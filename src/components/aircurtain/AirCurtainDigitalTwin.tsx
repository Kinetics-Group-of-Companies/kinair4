import type { AirCurtainSelection } from '@/lib/airCurtainData';

interface AirCurtainDigitalTwinProps {
  selection: AirCurtainSelection;
  doorWidthMm: number;
  doorHeightM: number;
  seriesName?: string;
  productImageUrl?: string | null;
}

const JET_GRADIENTS = [
  'linear-gradient(to bottom, rgba(34,211,238,.78), rgba(103,232,249,.40), rgba(207,250,254,.12))',
  'linear-gradient(to bottom, rgba(59,130,246,.72), rgba(96,165,250,.36), rgba(219,234,254,.11))',
  'linear-gradient(to bottom, rgba(139,92,246,.64), rgba(167,139,250,.32), rgba(237,233,254,.10))',
  'linear-gradient(to bottom, rgba(16,185,129,.64), rgba(52,211,153,.32), rgba(209,250,229,.10))',
];

export function AirCurtainDigitalTwin({
  selection,
  doorWidthMm,
  doorHeightM,
  seriesName,
  productImageUrl,
}: AirCurtainDigitalTwinProps) {
  const installedUnits = selection.units.flatMap(({ model, qty }) =>
    Array.from({ length: qty }, (_, index) => ({ model, index })),
  );
  const isRecessed = selection.model.category === 'recessed';
  const pass = selection.heightSuitable && selection.coverage >= 1;
  const coveragePercent = doorWidthMm > 0 ? selection.totalLengthMm / doorWidthMm * 100 : 0;
  const mountingMinimums = installedUnits
    .map(({ model }) => model.mountingHeightMin)
    .filter((value): value is number => typeof value === 'number' && value > 0);
  const mountingMaximums = installedUnits
    .map(({ model }) => model.mountingHeightMax)
    .filter((value): value is number => typeof value === 'number' && value > 0);
  const suitableHeightMin = mountingMinimums.length ? Math.max(...mountingMinimums) : null;
  const suitableHeightMax = mountingMaximums.length ? Math.min(...mountingMaximums) : null;
  const suitableHeight = suitableHeightMin !== null && suitableHeightMax !== null
    ? `${suitableHeightMin.toFixed(1)}-${suitableHeightMax.toFixed(1)} m`
    : suitableHeightMax !== null
      ? `Up to ${suitableHeightMax.toFixed(1)} m`
      : 'Refer to model data';

  return (
    <div className="kinair-card overflow-hidden p-4 md:p-6">
      <style>{`
        @keyframes actualCurtainFall {
          0% { transform: translate3d(-2px,-24px,0) rotate(-2deg); opacity: 0; }
          12% { opacity: .9; }
          32% { transform: translate3d(4px,62px,0) rotate(2deg); }
          62% { transform: translate3d(-4px,132px,0) rotate(-2deg); opacity: .65; }
          100% { transform: translate3d(2px,235px,0) rotate(2deg); opacity: 0; }
        }
        @keyframes actualCurtainWave {
          0%,100% { transform: translateX(-6px) skewX(-3deg) scaleX(.94); opacity: .16; }
          50% { transform: translateX(7px) skewX(4deg) scaleX(1.08); opacity: .36; }
        }
        @keyframes actualCurtainMix {
          0%,100% { transform: translateX(-3px) scaleX(.75); opacity: .35; }
          50% { transform: translateX(3px) scaleX(1.25); opacity: .75; }
        }
        @media (prefers-reduced-motion:reduce) {
          .actual-curtain-particle,.actual-curtain-wave,.actual-curtain-mix { animation:none!important; }
        }
      `}</style>

      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-bold">Actual-model Door Digital Twin</h3>
          <p className="text-sm text-muted-foreground">
            {seriesName || selection.model.brand} • {isRecessed ? 'Ceiling recessed' : 'Wall mounted'} • {selection.arrangement}
          </p>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${pass ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-800'}`}>
          {pass ? 'PASS' : 'CHECK INSTALLATION'}
        </span>
      </div>

      <div className={`grid gap-5 ${productImageUrl ? 'lg:grid-cols-[180px_1fr]' : ''}`}>
        {productImageUrl && (
          <div className="rounded-xl border bg-white p-3">
            <div className="mb-2 text-xs font-medium text-muted-foreground">Selected product</div>
            <img
              src={productImageUrl}
              alt={`${seriesName || selection.model.model} air curtain`}
              className="h-36 w-full object-contain"
            />
          </div>
        )}

        <div className="relative h-[340px] overflow-hidden rounded-xl border bg-gradient-to-b from-sky-100 via-slate-50 to-slate-200">
          {isRecessed ? (
            <>
              <div className="absolute left-[4%] right-[4%] top-0 z-10 h-14 border-b-4 border-slate-300 bg-white shadow-sm">
                <div className="pt-1 text-center text-[10px] font-medium text-slate-500">CEILING — ACTUAL UNITS CONCEALED ABOVE</div>
              </div>
              <div className="absolute left-[8%] right-[8%] top-11 z-20 flex">
                {installedUnits.map(({ model, index }, unitIndex) => (
                  <div
                    key={`${model.id}-grille-${index}`}
                    className="relative h-3 border-y border-r border-slate-500 bg-gradient-to-b from-slate-300 via-white to-slate-400 first:border-l"
                    style={{ flexGrow: model.lengthMm, flexBasis: 0 }}
                    title={model.model}
                  >
                    <span className="absolute inset-x-1 top-1 h-[2px] bg-slate-700" />
                    {unitIndex < installedUnits.length - 1 && <span className="absolute -right-px top-0 h-full w-px bg-slate-800" />}
                  </div>
                ))}
              </div>
              <div className="absolute left-[8%] right-[8%] top-[59px] z-20 flex text-[8px] font-medium text-slate-600">
                {installedUnits.map(({ model, index }) => (
                  <span key={`${model.id}-label-${index}`} className="truncate px-1 text-center" style={{ flexGrow: model.lengthMm, flexBasis: 0 }}>
                    {model.model} • {model.lengthMm} mm
                  </span>
                ))}
              </div>
            </>
          ) : (
            <div className="absolute left-[8%] right-[8%] top-5 z-20 flex">
              {installedUnits.map(({ model, index }) => (
                <div
                  key={`${model.id}-body-${index}`}
                  className="relative h-14 border-y border-r border-slate-300 bg-gradient-to-b from-white to-slate-100 shadow-md first:rounded-l-lg first:border-l last:rounded-r-lg"
                  style={{ flexGrow: model.lengthMm, flexBasis: 0 }}
                >
                  <span className="absolute left-2 right-2 top-2 h-2 rounded-sm bg-slate-200" />
                  <span className="absolute left-1 right-1 top-[22px] truncate text-center text-[8px] font-bold leading-none text-sky-700">{model.model}</span>
                  <span className="absolute bottom-1 left-0 right-0 text-center text-[9px] font-semibold leading-none">{model.lengthMm} mm</span>
                  <span className="absolute -bottom-1 left-0 right-0 h-1 bg-slate-700" />
                </div>
              ))}
            </div>
          )}

          <div className={`absolute bottom-8 left-[10%] right-[10%] overflow-hidden rounded-b-lg border-x-4 border-slate-500 bg-white/55 ${isRecessed ? 'top-[76px]' : 'top-[76px]'}`}>
            <div className="relative flex h-full">
              {installedUnits.map(({ model, index }, unitIndex) => (
                <div
                  key={`${model.id}-jet-${index}`}
                  className="relative h-full overflow-visible border-r border-white/40 last:border-0"
                  style={{
                    flexGrow: model.lengthMm,
                    flexBasis: 0,
                    background: JET_GRADIENTS[unitIndex % JET_GRADIENTS.length],
                  }}
                >
                  {Array.from({ length: 3 }, (_, waveIndex) => (
                    <span
                      key={waveIndex}
                      className="actual-curtain-wave pointer-events-none absolute -top-[8%] h-[116%] rounded-[48%] bg-gradient-to-b from-white/5 via-white/35 to-transparent blur-xl"
                      style={{
                        left: `${5 + waveIndex * 31}%`,
                        width: '34%',
                        animation: `actualCurtainWave ${2.4 + waveIndex * .55}s ease-in-out infinite`,
                        animationDelay: `${-waveIndex * .7}s`,
                      }}
                    />
                  ))}
                  {Array.from({ length: 5 }, (_, particleIndex) => (
                    <span
                      key={particleIndex}
                      className="actual-curtain-particle absolute top-0 h-7 w-1 rounded-full bg-white/85 shadow-[0_0_8px_rgba(255,255,255,.9)]"
                      style={{
                        left: `${14 + particleIndex * 18}%`,
                        animation: `actualCurtainFall ${1.2 + ((unitIndex + particleIndex) % 4) * .16}s linear infinite`,
                        animationDelay: `${-((unitIndex * 2 + particleIndex) % 7) * .2}s`,
                      }}
                    />
                  ))}
                  {unitIndex < installedUnits.length - 1 && (
                    <span
                      className="actual-curtain-mix absolute -right-2 top-0 z-10 h-full w-4 bg-gradient-to-r from-transparent via-white/55 to-transparent blur-[3px]"
                      style={{ animation: 'actualCurtainMix 2.2s ease-in-out infinite' }}
                    />
                  )}
                </div>
              ))}
              {installedUnits.length > 1 && (
                <span className="absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-white/80 px-2 py-1 text-[9px] font-medium text-slate-600 shadow-sm">
                  Combined air barrier
                </span>
              )}
            </div>
          </div>

          <div className="absolute bottom-1 left-0 right-0 text-center text-xs text-slate-600">
            Door {(doorWidthMm / 1000).toFixed(2)} m W × {doorHeightM.toFixed(2)} m H • actual models shown proportionally
          </div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-7">
        <div className="rounded-lg border p-3"><span className="block text-xs text-muted-foreground">Installed</span><b>{selection.totalLengthMm} mm</b></div>
        <div className="rounded-lg border p-3"><span className="block text-xs text-muted-foreground">Door coverage</span><b>{coveragePercent.toFixed(0)}%</b></div>
        <div className="rounded-lg border p-3"><span className="block text-xs text-muted-foreground">Selected door height</span><b>{doorHeightM.toFixed(2)} m</b></div>
        <div className="rounded-lg border p-3"><span className="block text-xs text-muted-foreground">Suitable height</span><b>{suitableHeight}</b></div>
        <div className="rounded-lg border p-3"><span className="block text-xs text-muted-foreground">Outlet velocity</span><b>{selection.outletVelocity.toFixed(1)} m/s</b></div>
        <div className="rounded-lg border p-3"><span className="block text-xs text-muted-foreground">Floor velocity</span><b>{selection.floorVelocity.toFixed(2)} m/s</b></div>
        <div className="rounded-lg border p-3"><span className="block text-xs text-muted-foreground">Height status</span><b className={selection.heightSuitable ? 'text-emerald-600' : 'text-amber-600'}>{selection.heightSuitable ? 'Suitable' : 'Check'}</b></div>
      </div>
    </div>
  );
}
