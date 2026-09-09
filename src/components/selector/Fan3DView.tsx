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
  const [angle, setAngle] = useState(-8);
  const [tilt, setTilt] = useState(-3);
  const [autoRotate, setAutoRotate] = useState(true);
  const dragRef = useRef<{ x: number; y: number; angle: number; tilt: number } | null>(null);

  useEffect(() => {
    if (!autoRotate || !supported) return;
    const timer = window.setInterval(() => {
      setAngle(current => {
        const next = current + 0.28;
        return next > 12 ? -12 : next;
      });
    }, 40);
    return () => window.clearInterval(timer);
  }, [autoRotate, supported]);

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { x: event.clientX, y: event.clientY, angle, tilt };
    setAutoRotate(false);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    setAngle(Math.max(-28, Math.min(28, dragRef.current.angle + (event.clientX - dragRef.current.x) * 0.12)));
    setTilt(Math.max(-12, Math.min(12, dragRef.current.tilt - (event.clientY - dragRef.current.y) * 0.08)));
  };

  const stopDragging = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
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

  const shownModel = model || `KVF-${diameter}P`;

  return (
    <div className="space-y-3">
      <div
        className="relative min-h-[370px] touch-none select-none overflow-hidden rounded-xl border bg-gradient-to-b from-white via-slate-50 to-slate-200 cursor-grab active:cursor-grabbing"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={stopDragging}
        onPointerCancel={stopDragging}
        role="img"
        aria-label={`Interactive product view of ${shownModel}`}
      >
        <div className="absolute inset-x-0 bottom-12 mx-auto h-10 w-1/2 rounded-[50%] bg-slate-900/15 blur-xl" />
        <div className="absolute inset-0 flex items-center justify-center [perspective:1100px]">
          <div
            className="w-[88%] max-w-[650px] transition-transform duration-75 ease-linear"
            style={{ transform: `rotateX(${tilt}deg) rotateY(${angle}deg)` }}
          >
            <svg viewBox="0 0 760 470" className="h-auto w-full drop-shadow-2xl" aria-hidden="true">
              <defs>
                <linearGradient id="plasticBody" x1="0" x2="1" y1="0" y2="1">
                  <stop offset="0" stopColor="#ffffff" />
                  <stop offset=".45" stopColor="#f4f4f2" />
                  <stop offset=".78" stopColor="#d9dcda" />
                  <stop offset="1" stopColor="#b7bcb9" />
                </linearGradient>
                <linearGradient id="plasticSide" x1="0" x2="1">
                  <stop offset="0" stopColor="#bfc4c1" />
                  <stop offset=".38" stopColor="#f7f7f5" />
                  <stop offset=".76" stopColor="#dadeda" />
                  <stop offset="1" stopColor="#aeb4b0" />
                </linearGradient>
                <radialGradient id="inletShade">
                  <stop offset="0" stopColor="#eef0ed" />
                  <stop offset=".64" stopColor="#d4d8d4" />
                  <stop offset="1" stopColor="#8f9692" />
                </radialGradient>
                <linearGradient id="bladeShade" x1="0" x2="1" y1="0" y2="1">
                  <stop offset="0" stopColor="#ffffff" />
                  <stop offset="1" stopColor="#aeb4b0" />
                </linearGradient>
              </defs>

              {/* rear round duct collar */}
              <path d="M485 153 C558 157 604 193 606 249 C608 306 559 342 485 345 L485 153Z" fill="url(#plasticSide)" stroke="#9aa19d" strokeWidth="4" />
              <ellipse cx="500" cy="249" rx="83" ry="98" fill="#d4d8d5" stroke="#929995" strokeWidth="4" />
              <ellipse cx="500" cy="249" rx="61" ry="74" fill="#f4f5f3" stroke="#a4aaa6" strokeWidth="3" />

              {/* cylindrical motor/fan casing */}
              <path d="M298 131 C354 111 444 117 493 153 L493 345 C438 377 349 381 298 359 C269 335 252 297 252 248 C252 198 269 157 298 131Z" fill="url(#plasticBody)" stroke="#979e9a" strokeWidth="4" />
              <path d="M312 139 C357 126 433 130 472 153" fill="none" stroke="white" strokeWidth="10" opacity=".8" />
              <path d="M304 353 C356 369 432 361 481 338" fill="none" stroke="#aeb4b0" strokeWidth="4" opacity=".7" />

              {/* casing split clips and seam */}
              <path d="M292 137 C270 173 262 208 262 249 C262 294 274 327 298 357" fill="none" stroke="#a1a7a3" strokeWidth="3" />
              <rect x="276" y="157" width="17" height="35" rx="5" fill="#e7e9e6" stroke="#929995" strokeWidth="2" />
              <rect x="279" y="305" width="17" height="35" rx="5" fill="#e7e9e6" stroke="#929995" strokeWidth="2" />
              <rect x="464" y="166" width="13" height="32" rx="4" fill="#c9cdca" stroke="#929995" strokeWidth="2" />
              <rect x="464" y="299" width="13" height="32" rx="4" fill="#c9cdca" stroke="#929995" strokeWidth="2" />

              {/* front tapered housing and inlet collar */}
              <path d="M155 161 C195 123 260 116 309 140 C281 165 266 202 266 248 C266 295 281 332 309 356 C258 381 194 372 155 335 C132 310 120 281 120 248 C120 215 132 185 155 161Z" fill="url(#plasticBody)" stroke="#969d99" strokeWidth="4" />
              <ellipse cx="159" cy="248" rx="92" ry="111" fill="#f4f5f3" stroke="#929995" strokeWidth="4" />
              <ellipse cx="159" cy="248" rx="69" ry="84" fill="url(#inletShade)" stroke="#a2a8a4" strokeWidth="3" />
              <ellipse cx="159" cy="248" rx="57" ry="70" fill="#d9ddda" stroke="#b3b8b5" strokeWidth="2" />

              {/* five-blade mixed-flow impeller */}
              <g transform="translate(159 248)" fill="url(#bladeShade)" stroke="#9da39f" strokeWidth="2">
                <path d="M-3 -8 C-40 -22 -48 -50 -35 -64 C-14 -53 4 -35 8 -10Z" />
                <path d="M5 -6 C38 -29 62 -20 68 -2 C47 12 26 14 8 7Z" />
                <path d="M8 4 C37 30 31 56 14 66 C-5 48 -13 26 -5 8Z" />
                <path d="M-2 9 C-20 45 -48 48 -62 34 C-51 10 -31 -3 -8 -5Z" />
                <path d="M-9 -1 C-47 2 -62 -21 -56 -39 C-30 -42 -10 -28 -4 -8Z" />
                <circle r="17" fill="#eef0ed" stroke="#9ca39f" strokeWidth="3" />
                <circle r="5" fill="#b5bbb7" />
              </g>

              {/* top electrical terminal box, matching product photo/drawing */}
              <path d="M310 102 L421 96 L454 119 L340 128 Z" fill="#f7f7f5" stroke="#9ba29e" strokeWidth="4" />
              <path d="M310 102 L340 128 L340 159 L310 139 Z" fill="#c9cdca" stroke="#9ba29e" strokeWidth="4" />
              <path d="M340 128 L454 119 L454 150 L340 159 Z" fill="#e7e9e6" stroke="#9ba29e" strokeWidth="4" />
              <rect x="292" y="112" width="22" height="14" rx="5" fill="#343a38" />

              {/* correct moulded mounting base */}
              <path d="M283 349 L414 350 L439 386 L259 386 Z" fill="#d7dad7" stroke="#969d99" strokeWidth="4" />
              <path d="M273 386 L424 386 L415 407 L281 407 Z" fill="#b5bbb7" stroke="#858c88" strokeWidth="3" />
              <rect x="287" y="384" width="35" height="11" rx="3" fill="#f5f6f4" stroke="#969d99" strokeWidth="2" />
              <rect x="377" y="384" width="35" height="11" rx="3" fill="#f5f6f4" stroke="#969d99" strokeWidth="2" />

              <text x="357" y="241" textAnchor="middle" fill="#0b5e8e" fontSize="26" fontWeight="700">KINAIR</text>
              <text x="357" y="267" textAnchor="middle" fill="#6b7280" fontSize="15">{shownModel}</text>
            </svg>
          </div>
        </div>
        <div className="absolute bottom-3 left-0 right-0 text-center text-xs text-slate-600">
          Drag gently to tilt • KVF-P circular inline fan
        </div>
      </div>

      <div className="grid grid-cols-4 gap-2 text-center text-xs">
        <div className="rounded-md bg-muted p-2"><span className="block text-muted-foreground">A</span><b>{diameter === 100 ? 215 : 'Series'}</b></div>
        <div className="rounded-md bg-muted p-2"><span className="block text-muted-foreground">B</span><b>{diameter === 100 ? 257 : 'Series'}</b></div>
        <div className="rounded-md bg-muted p-2"><span className="block text-muted-foreground">ØC</span><b>{diameter}</b></div>
        <div className="rounded-md bg-muted p-2"><span className="block text-muted-foreground">ØD</span><b>{diameter === 100 ? 177 : 'Series'}</b></div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">Product visualization based on the KVF-P photo and dimensional drawing. Dimensions in mm.</p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setAutoRotate(value => !value)}>
            {autoRotate ? <Pause className="mr-1 h-4 w-4" /> : <Play className="mr-1 h-4 w-4" />}
            {autoRotate ? 'Pause' : 'Auto tilt'}
          </Button>
          <Button variant="outline" size="sm" onClick={() => { setAngle(-8); setTilt(-3); setAutoRotate(false); }}>
            <RotateCcw className="mr-1 h-4 w-4" />
            Reset
          </Button>
        </div>
      </div>
    </div>
  );
}
