import { useEffect, useRef, useState } from 'react';
import { Box, Pause, Play, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Fan3DViewProps {
  series?: string;
  model?: string;
  diameter: number;
}

export function Fan3DView({ series = '', model = '', diameter }: Fan3DViewProps) {
  const supported = /KVF(?:[-\s]?P|[-\s]?\d+P)/i.test(`${series} ${model}`);
  const [rotation, setRotation] = useState({ x: -12, y: -28 });
  const [autoRotate, setAutoRotate] = useState(true);
  const dragRef = useRef<{ x: number; y: number; rx: number; ry: number } | null>(null);

  useEffect(() => {
    if (!autoRotate || !supported) return;
    const timer = window.setInterval(() => {
      setRotation(current => ({ ...current, y: (current.y + 0.6) % 360 }));
    }, 32);
    return () => window.clearInterval(timer);
  }, [autoRotate, supported]);

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { x: event.clientX, y: event.clientY, rx: rotation.x, ry: rotation.y };
    setAutoRotate(false);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    const nextX = Math.max(-55, Math.min(35, dragRef.current.rx - (event.clientY - dragRef.current.y) * 0.35));
    const nextY = dragRef.current.ry + (event.clientX - dragRef.current.x) * 0.45;
    setRotation({ x: nextX, y: nextY });
  };

  const stopDragging = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    dragRef.current = null;
  };

  if (!supported) {
    return (
      <div className="flex min-h-[320px] flex-col items-center justify-center rounded-lg border border-dashed bg-background p-8 text-center">
        <Box className="mb-3 h-10 w-10 text-muted-foreground" />
        <p className="font-medium">3D model not available for {model || series || 'this fan'}</p>
        <p className="mt-1 text-sm text-muted-foreground">KVF-P series is currently supported.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div
        className="relative min-h-[360px] touch-none select-none overflow-hidden rounded-xl border bg-gradient-to-b from-slate-50 to-slate-200 cursor-grab active:cursor-grabbing"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={stopDragging}
        onPointerCancel={stopDragging}
        role="img"
        aria-label={`Interactive 3D view of ${model || series} fan`}
      >
        <div className="absolute inset-x-0 bottom-8 mx-auto h-14 w-3/5 rounded-[50%] bg-slate-900/15 blur-xl" />
        <div className="absolute inset-0 flex items-center justify-center [perspective:1000px]">
          <div
            className="w-[82%] max-w-[620px] transition-transform duration-75 ease-linear [transform-style:preserve-3d]"
            style={{ transform: `rotateX(${rotation.x}deg) rotateY(${rotation.y}deg)` }}
          >
            <svg viewBox="0 0 720 390" className="h-auto w-full drop-shadow-2xl" aria-hidden="true">
              <defs>
                <linearGradient id="kvfBody" x1="0" x2="1" y1="0" y2="1">
                  <stop offset="0" stopColor="#f8fafc" />
                  <stop offset=".48" stopColor="#dbe4ee" />
                  <stop offset="1" stopColor="#8ea0b4" />
                </linearGradient>
                <linearGradient id="kvfBlue" x1="0" x2="1">
                  <stop offset="0" stopColor="#075985" />
                  <stop offset=".52" stopColor="#0284c7" />
                  <stop offset="1" stopColor="#0c4a6e" />
                </linearGradient>
                <radialGradient id="kvfOpening">
                  <stop offset="0" stopColor="#334155" />
                  <stop offset=".7" stopColor="#0f172a" />
                  <stop offset="1" stopColor="#020617" />
                </radialGradient>
              </defs>

              <path d="M178 119 L528 87 L621 139 L270 171 Z" fill="#eef3f8" stroke="#64748b" strokeWidth="4" />
              <path d="M178 119 L270 171 L270 298 L178 246 Z" fill="#b8c6d5" stroke="#64748b" strokeWidth="4" />
              <path d="M270 171 L621 139 L621 266 L270 298 Z" fill="url(#kvfBody)" stroke="#64748b" strokeWidth="4" />

              <path d="M135 143 L214 154 L214 251 L135 238 Z" fill="url(#kvfBlue)" stroke="#075985" strokeWidth="4" />
              <ellipse cx="135" cy="190" rx="50" ry="48" fill="#075985" stroke="#0c4a6e" strokeWidth="5" />
              <ellipse cx="135" cy="190" rx="38" ry="36" fill="url(#kvfOpening)" stroke="#94a3b8" strokeWidth="3" />

              <path d="M574 128 L646 143 L646 260 L574 266 Z" fill="url(#kvfBlue)" stroke="#075985" strokeWidth="4" />
              <ellipse cx="646" cy="201" rx="57" ry="59" fill="#0369a1" stroke="#0c4a6e" strokeWidth="5" />
              <ellipse cx="646" cy="201" rx="44" ry="46" fill="url(#kvfOpening)" stroke="#cbd5e1" strokeWidth="3" />
              <g transform="translate(646 201)" fill="#94a3b8" stroke="#475569" strokeWidth="1.5">
                <path d="M0 0 C8 -31 24 -34 31 -28 C21 -12 16 -4 0 0Z" />
                <path d="M0 0 C31 8 34 24 28 31 C12 21 4 16 0 0Z" />
                <path d="M0 0 C-8 31 -24 34 -31 28 C-21 12 -16 4 0 0Z" />
                <path d="M0 0 C-31 -8 -34 -24 -28 -31 C-12 -21 -4 -16 0 0Z" />
                <circle r="9" fill="#dbe4ee" />
              </g>

              <path d="M323 148 L481 134 L511 161 L351 176 Z" fill="#0c4a6e" stroke="#082f49" strokeWidth="3" />
              <rect x="356" y="157" width="108" height="25" rx="6" fill="#0369a1" transform="skewY(-5)" />
              <circle cx="374" cy="164" r="4" fill="#bae6fd" />
              <circle cx="464" cy="156" r="4" fill="#bae6fd" />

              <path d="M264 297 L333 291 L324 326 L251 332 Z" fill="#64748b" stroke="#334155" strokeWidth="3" />
              <path d="M532 273 L596 268 L611 306 L543 313 Z" fill="#64748b" stroke="#334155" strokeWidth="3" />
              <path d="M244 332 L328 326 L328 342 L244 348 Z" fill="#334155" />
              <path d="M539 313 L615 306 L619 322 L543 329 Z" fill="#334155" />

              <path d="M238 167 L238 281 M300 159 L300 289 M530 139 L530 274" stroke="#94a3b8" strokeWidth="2" opacity=".7" />
              <path d="M208 131 L555 101" stroke="white" strokeWidth="8" opacity=".6" />
              <text x="370" y="235" textAnchor="middle" fill="#075985" fontSize="32" fontWeight="700" transform="skewY(-5)">KINAIR</text>
              <text x="370" y="262" textAnchor="middle" fill="#475569" fontSize="16" transform="skewY(-5)">{model || `KVF-${diameter}P`}</text>
            </svg>
          </div>
        </div>
        <div className="absolute bottom-3 left-0 right-0 text-center text-xs text-slate-600">
          Drag to rotate • Interactive product view
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">Conceptual 3D view; refer to the Drawing tab for certified dimensions.</p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setAutoRotate(value => !value)}>
            {autoRotate ? <Pause className="mr-1 h-4 w-4" /> : <Play className="mr-1 h-4 w-4" />}
            {autoRotate ? 'Pause' : 'Auto rotate'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setRotation({ x: -12, y: -28 });
              setAutoRotate(false);
            }}
          >
            <RotateCcw className="mr-1 h-4 w-4" />
            Reset
          </Button>
        </div>
      </div>
    </div>
  );
}
