/**
 * Catalogue-style "STREAM RANGE" chart (vertical air stream range).
 * Each speed setting is drawn as a band of wavy vertical jet lines running
 * from the nozzle (top) down to the depth the stream reaches, over a plain
 * horizontal grid — matching the manufacturer catalogue layout.
 */

export interface StreamSpeed {
  /** e.g. "1 SPEED" */
  label: string;
  /** nozzle air stream speed (m/s) */
  nozzleVelocity: number;
  /** speed reached at the end of the stream (m/s) */
  endVelocity: number;
  /** depth reached by the stream (m) */
  reachM: number;
}

interface Props {
  speeds: StreamSpeed[];
  /** requested installation height (m) — duty point line */
  maxHeightM: number;
  /** air stream speed at the duty point (m/s), shown on the duty line */
  dutyVelocity?: number;
  className?: string;
}

const ORANGE = '#f2a33c';
const GRID = '#c9c9c9';
const TEXT = '#4b4b4b';

// Wide strand spacing with a strong, smooth waving motion. The sway is
// damped by `t` so strands leave the nozzle straight and grow downwards —
// identical waveform to the datasheet PDF.
function wavyPoints(cx: number, top: number, bottom: number, lane: number) {
  const steps = 72;
  const pts: Array<[number, number]> = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const y = top + (bottom - top) * t;
    const centreWave = Math.sin(t * Math.PI * 3.4) * 5.5 * t;
    const spread = 9 + t * 13;
    const strandRipple = Math.sin(t * Math.PI * 6.8 + lane * 0.9) * 0.6 * t;
    pts.push([cx + centreWave + lane * spread + strandRipple, y]);
  }
  return pts;
}

function wavyPath(cx: number, top: number, bottom: number, lane: number) {
  return wavyPoints(cx, top, bottom, lane)
    .map(([x, y], i) => `${i === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`)
    .join(' ');
}

/** Shaded column bounded exactly by the two outer wave strands (lane -1 and +1). */
function shadePolygon(cx: number, top: number, bottom: number) {
  const left = wavyPoints(cx, top, bottom, -1);
  const right = wavyPoints(cx, top, bottom, 1).reverse();
  return [...left, ...right].map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(' ');
}


export function StreamRangeChart({ speeds, maxHeightM, dutyVelocity, className }: Props) {
  const W = 440;
  const H = 400;
  const left = 78;
  const right = W - 24;
  const top = 54;
  const bottom = H - 56;
  const plotW = right - left;
  const plotH = bottom - top;
  const maxH = Math.max(maxHeightM, ...speeds.map((s) => s.reachM), 1);
  const yAt = (m: number) => top + (Math.min(m, maxH) / maxH) * plotH;

  const bandW = plotW / Math.max(speeds.length, 1);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={className} width="100%" height="100%" role="img" aria-label="Vertical air stream range">
      <defs>
        <linearGradient id="airShade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#7ec8e3" stopOpacity={0.45} />
          <stop offset="55%" stopColor="#a9dced" stopOpacity={0.26} />
          <stop offset="100%" stopColor="#d7eef7" stopOpacity={0.06} />
        </linearGradient>
      </defs>
      <style>{`
        @keyframes acFlowDash { to { stroke-dashoffset: -22; } }
        .ac-flow {
          stroke-dasharray: 3 8;
          animation: acFlowDash 1.1s linear infinite;
        }
@keyframes acBreath {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.82; }
        }
        .ac-shade { animation: acBreath 3.6s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) {
          .ac-flow, .ac-shade { animation: none; }
        }
      `}</style>
      <rect x={0} y={0} width={W} height={H} fill="#ffffff" />

      {/* plot border */}
      <rect x={left} y={top} width={plotW} height={plotH} fill="none" stroke={GRID} strokeWidth={1} />

      {/* left axis ticks: 0 → installation height */}
      {(() => {
        const step = maxH <= 4 ? 0.5 : maxH <= 8 ? 1 : 2;
        const ticks: number[] = [];
        for (let m = 0; m <= maxH + 1e-6; m += step) ticks.push(Math.round(m * 10) / 10);
        return ticks.map((m) => {
          const y = yAt(m);
          return (
            <g key={m}>
              <line x1={left - 5} y1={y} x2={left} y2={y} stroke={TEXT} strokeWidth={0.8} />
              <text x={left - 8} y={y + 3.5} fill={TEXT} fontSize={10} textAnchor="end">
                {m.toFixed(1)}
              </text>
            </g>
          );
        });
      })()}

{/* horizontal grid — same step as the y-axis ticks so lines align with the values */}
      {(() => {
        const step = maxH <= 4 ? 0.5 : maxH <= 8 ? 1 : 2;
        const lines: number[] = [];
        for (let m = step; m < maxH - 1e-6; m += step) lines.push(Math.round(m * 10) / 10);
        return lines.map((m) => (
          <line key={m} x1={left} y1={yAt(m)} x2={right} y2={yAt(m)} stroke={GRID} strokeWidth={0.8} />
        ));
      })()}

      {/* duty point: requested installation height */}
      {maxHeightM > 0 && maxHeightM < maxH && (
        <g>
          <line
            x1={left}
            y1={yAt(maxHeightM)}
            x2={right}
            y2={yAt(maxHeightM)}
            stroke="#d33"
            strokeWidth={1}
            strokeDasharray="5 3"
          />
          <text x={right - 4} y={yAt(maxHeightM) - 4} fill="#d33" fontSize={10} textAnchor="end">
            duty point {maxHeightM.toFixed(1)} m
            {dutyVelocity != null ? ` — ${dutyVelocity.toFixed(1)} m/s` : ''}
          </text>
        </g>
      )}

      {/* y axis caption */}
      <text
        x={22}
        y={top + plotH / 2}
        fill={TEXT}
        fontSize={11}
        textAnchor="middle"
        transform={`rotate(-90 22 ${top + plotH / 2})`}
      >
        installation height [m]
      </text>

      {speeds.map((s, idx) => {
        const cx = left + bandW * idx + bandW / 2;
        const endY = yAt(s.reachM);
        return (
          <g key={s.label}>
            {/* speed heading */}
            <text x={cx} y={top - 26} fill={TEXT} fontSize={11} textAnchor="middle" letterSpacing="0.5">
              {s.label}
            </text>
            {/* nozzle speed label */}
            <text x={cx} y={top + 18} fill={TEXT} fontSize={11} textAnchor="middle">
              {s.nozzleVelocity.toFixed(1)} m/s*
            </text>

{/* shaded air column */}
            <polygon
              className="ac-shade"
              points={shadePolygon(cx, top + 26, endY)}
              fill="url(#airShade)"
              stroke="none"
            />

            {/* stream band */}
            {[-1, 0, 1].map((k) => (
              <g key={k}>
                <path
                  d={wavyPath(cx, top + 26, endY, k)}
                  fill="none"
                  stroke={ORANGE}
                  strokeWidth={1.25}
                  strokeLinecap="round"
                />
{/* flowing air pulse along the strand */}
                <path
                  className="ac-flow"
                  d={wavyPath(cx, top + 26, endY, k)}
                  fill="none"
                  stroke="#ffffff"
                  strokeOpacity={0.6}
                  strokeWidth={0.8}
                  strokeLinecap="round"
                />
              </g>
            ))}

            {/* end-of-stream speed label */}
            <text x={cx + 20} y={endY - 6} fill={TEXT} fontSize={11} textAnchor="start">
              {s.endVelocity.toFixed(1)} m/s*
            </text>

            {/* reach marker: tick on axis, label inside plot to avoid overlapping axis ticks */}
            <line x1={left - 6} y1={endY} x2={left} y2={endY} stroke={TEXT} strokeWidth={1} />
            <text x={left + 5} y={endY - 4} fill={TEXT} fontSize={10} textAnchor="start">
              {s.reachM.toFixed(1)} m
            </text>
          </g>
        );
      })}

      <text x={left} y={bottom + 26} fill={TEXT} fontSize={10}>
        * - air stream speed [m/s]
      </text>
    </svg>
  );
}
