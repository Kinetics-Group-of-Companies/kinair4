import { useState, useCallback, useRef, useMemo } from 'react';
import { Volume2, Play, Square, AlertCircle, Ruler, BarChart3 } from 'lucide-react';
import { OctaveBandData } from '@/lib/fanData';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, ReferenceLine, LabelList
} from 'recharts';

interface NoiseDataTableProps {
  noiseData: OctaveBandData;
  distance?: number;
  onDistanceChange?: (distance: number) => void;
  directivityQ?: number;
  onDirectivityChange?: (q: number) => void;
}

// Sound directivity Q factor descriptions
const DIRECTIVITY_OPTIONS = [
  { q: 1, label: 'Q=1', description: 'Free field (spherical radiation)' },
  { q: 2, label: 'Q=2', description: 'Half-sphere (floor or wall)' },
  { q: 4, label: 'Q=4', description: 'Quarter-sphere (floor + wall)' },
  { q: 8, label: 'Q=8', description: 'Corner (3 surfaces)' },
];

// NC (Noise Criteria) curves data - standard values extended to NC-85
const NC_CURVES: { [key: number]: number[] } = {
  // NC level: [63Hz, 125Hz, 250Hz, 500Hz, 1kHz, 2kHz, 4kHz, 8kHz]
  15: [47, 36, 29, 22, 17, 14, 12, 11],
  20: [51, 40, 33, 26, 22, 19, 17, 16],
  25: [54, 44, 37, 31, 27, 24, 22, 21],
  30: [57, 48, 41, 35, 31, 29, 28, 27],
  35: [60, 52, 45, 40, 36, 34, 33, 32],
  40: [64, 56, 50, 45, 41, 39, 38, 37],
  45: [67, 60, 54, 49, 46, 44, 43, 42],
  50: [71, 64, 58, 54, 51, 49, 48, 47],
  55: [74, 67, 62, 58, 56, 54, 53, 52],
  60: [77, 71, 67, 63, 61, 59, 58, 57],
  65: [80, 75, 71, 68, 66, 64, 63, 62],
  70: [83, 79, 75, 72, 71, 70, 69, 68],
  75: [86, 83, 79, 77, 76, 75, 74, 73],
  80: [89, 87, 83, 82, 81, 80, 79, 78],
  85: [92, 91, 87, 87, 86, 85, 84, 83],
};

export function NoiseDataTable({ noiseData, distance: externalDistance, onDistanceChange, directivityQ: externalQ, onDirectivityChange }: NoiseDataTableProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [internalDistance, setInternalDistance] = useState(externalDistance ?? 0); // Default 0m (at source)
  const [internalQ, setInternalQ] = useState(externalQ ?? 2); // Default Q=2 (half-sphere)
  const [customDistance, setCustomDistance] = useState<string>('');
  const audioContextRef = useRef<AudioContext | null>(null);
  const oscillatorsRef = useRef<OscillatorNode[]>([]);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Use external values if provided, otherwise internal
  const distance = externalDistance ?? internalDistance;
  const directivityQ = externalQ ?? internalQ;
  
  // Update distance with callback
  const setDistance = useCallback((newDistance: number) => {
    setInternalDistance(newDistance);
    onDistanceChange?.(newDistance);
  }, [onDistanceChange]);

  // Update Q factor with callback
  const setQ = useCallback((newQ: number) => {
    setInternalQ(newQ);
    onDirectivityChange?.(newQ);
  }, [onDirectivityChange]);

  const octaveBands = [
    { label: '63 Hz', freq: 63, value: noiseData.hz63, key: 'hz63' },
    { label: '125 Hz', freq: 125, value: noiseData.hz125, key: 'hz125' },
    { label: '250 Hz', freq: 250, value: noiseData.hz250, key: 'hz250' },
    { label: '500 Hz', freq: 500, value: noiseData.hz500, key: 'hz500' },
    { label: '1 kHz', freq: 1000, value: noiseData.hz1k, key: 'hz1k' },
    { label: '2 kHz', freq: 2000, value: noiseData.hz2k, key: 'hz2k' },
    { label: '4 kHz', freq: 4000, value: noiseData.hz4k, key: 'hz4k' },
    { label: '8 kHz', freq: 8000, value: noiseData.hz8k, key: 'hz8k' },
  ];

  // Helper to check if octave band data is available (meaningful data, not just placeholders)
  const hasOctaveBands = useMemo(() => {
    const bands = [noiseData.hz63, noiseData.hz125, noiseData.hz250, noiseData.hz500,
                   noiseData.hz1k, noiseData.hz2k, noiseData.hz4k, noiseData.hz8k];
    // Consider data available only if at least one band has a meaningful value (>= 10 dB)
    return bands.some(v => v >= 10);
  }, [noiseData]);

  // Helper to estimate NC from overall dB(A) value
  // Standard thumb rule: NC ≈ overall dB(A) - 5
  const estimateNCFromOverall = (overallDb: number): number => {
    const estimatedNC = overallDb - 5;
    // Round to nearest 5 (NC levels are 15, 20, 25, 30, etc.)
    return Math.round(estimatedNC / 5) * 5;
  };

  // Calculate NC level - find the lowest NC curve where ALL bands are at or below the curve
  const ncLevel = useMemo(() => {
    // Debug: log the noise data to understand what's being passed
    console.log('NC Calculation Debug:', {
      hasOctaveBands,
      overall: noiseData.overall,
      hz63: noiseData.hz63,
      hz125: noiseData.hz125,
      hz250: noiseData.hz250,
      hz500: noiseData.hz500,
      hz1k: noiseData.hz1k,
      hz2k: noiseData.hz2k,
      hz4k: noiseData.hz4k,
      hz8k: noiseData.hz8k,
    });
    
    // If no octave band data, estimate from overall
    // IMPORTANT: Check if overall exists and is valid, regardless of octave bands
    if (!hasOctaveBands && noiseData.overall > 0) {
      const estimated = estimateNCFromOverall(noiseData.overall);
      console.log('NC Fallback used:', { overall: noiseData.overall, estimatedNC: estimated });
      return estimated;
    }
    
    // If we have octave bands but they're all very low (likely placeholder 0s with real overall)
    // and we have a valid overall value, prefer the estimation
    const fanValues = [
      noiseData.hz63, noiseData.hz125, noiseData.hz250, noiseData.hz500,
      noiseData.hz1k, noiseData.hz2k, noiseData.hz4k, noiseData.hz8k
    ];
    
    // Check if octave bands seem like placeholders (all zeros or very low)
    const allBandsLow = fanValues.every(v => v < 10);
    if (allBandsLow && noiseData.overall > 0) {
      const estimated = estimateNCFromOverall(noiseData.overall);
      console.log('NC Fallback used (low bands detected):', { overall: noiseData.overall, fanValues, estimatedNC: estimated });
      return estimated;
    }
    
    // NC rating is the lowest NC curve that the fan meets (all bands at or below curve)
    const ncLevels = [15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85];
    
    for (const ncNum of ncLevels) {
      const curveValues = NC_CURVES[ncNum];
      let meetsThisCurve = true;
      for (let i = 0; i < 8; i++) {
        if (fanValues[i] > curveValues[i]) {
          meetsThisCurve = false;
          break;
        }
      }
      if (meetsThisCurve) {
        console.log('NC Curve matched:', ncNum);
        return ncNum;
      }
    }
    // If exceeds all curves including NC-85, return 85+
    return 85;
  }, [noiseData, hasOctaveBands]);

  // Calculate noise level at distance for each octave band with directivity Q
  // Formula: Lp = Lw - 20*log10(r) - 11 + 10*log10(Q)
  const octaveBandsAtDistance = useMemo(() => {
    if (distance === 0) return octaveBands.map(b => b.value); // At source
    // For any distance > 0, apply the full formula with Q factor
    const reduction = 20 * Math.log10(Math.max(distance, 0.1)) + 11 - 10 * Math.log10(directivityQ);
    return octaveBands.map(b => Math.round((b.value - reduction) * 10) / 10);
  }, [octaveBands, distance, directivityQ]);

  // Calculate noise level at distance (overall) with directivity Q
  const noiseAtDistance = useMemo(() => {
    if (distance === 0) return noiseData.overall; // At source
    // For any distance > 0, apply the full formula with Q factor
    const reduction = 20 * Math.log10(Math.max(distance, 0.1)) + 11 - 10 * Math.log10(directivityQ);
    return Math.round((noiseData.overall - reduction) * 10) / 10;
  }, [noiseData.overall, distance, directivityQ]);

  // Calculate NC level at distance - find the lowest NC curve where ALL bands are at or below
  const ncLevelAtDistance = useMemo(() => {
    // If no octave band data, estimate from overall at distance
    if (!hasOctaveBands && noiseAtDistance > 0) {
      const estimated = estimateNCFromOverall(noiseAtDistance);
      return estimated;
    }
    
    // Check if octave bands seem like placeholders (all zeros or very low)
    const allBandsLow = octaveBandsAtDistance.every(v => v < 10);
    if (allBandsLow && noiseAtDistance > 0) {
      const estimated = estimateNCFromOverall(noiseAtDistance);
      return estimated;
    }
    
    // NC rating is the lowest NC curve that the fan meets at distance
    const ncLevels = [15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85];
    
    for (const ncNum of ncLevels) {
      const curveValues = NC_CURVES[ncNum];
      let meetsThisCurve = true;
      for (let i = 0; i < 8; i++) {
        if (octaveBandsAtDistance[i] > curveValues[i]) {
          meetsThisCurve = false;
          break;
        }
      }
      if (meetsThisCurve) {
        return ncNum;
      }
    }
    return 85;
  }, [octaveBandsAtDistance, hasOctaveBands, noiseAtDistance]);

  // Prepare chart data - use distance-adjusted values when distance > 0
  const chartData = useMemo(() => {
    return octaveBands.map((band, idx) => ({
      name: band.label,
      value: distance === 0 ? band.value : octaveBandsAtDistance[idx],
      sourceValue: band.value,
      nc: NC_CURVES[distance === 0 ? ncLevel : ncLevelAtDistance]?.[idx] || 50,
    }));
  }, [octaveBands, octaveBandsAtDistance, distance, ncLevel, ncLevelAtDistance, directivityQ]);

  const displayedValues = useMemo(() => 
    distance === 0 ? octaveBands.map(b => b.value) : octaveBandsAtDistance,
    [distance, octaveBands, octaveBandsAtDistance]
  );
  const maxValue = Math.max(...displayedValues, 80);
  const minValue = Math.min(...displayedValues, 30);

  // Convert dB to linear gain
  const dbToGain = useCallback((db: number, distanceMeters: number) => {
    const referenceDb = 60;
    const distanceReduction = distanceMeters > 1 ? 20 * Math.log10(distanceMeters) : 0;
    const adjustedDb = db - distanceReduction;
    const normalizedDb = Math.min(adjustedDb - referenceDb, 20);
    return Math.pow(10, normalizedDb / 20) * 0.02;
  }, []);

  const stopNoiseSimulation = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    
    oscillatorsRef.current.forEach(osc => {
      try {
        osc.stop();
        osc.disconnect();
      } catch (e) {}
    });
    oscillatorsRef.current = [];
    
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    
    setIsPlaying(false);
  }, []);

  const playNoiseSimulation = useCallback(() => {
    stopNoiseSimulation();
    
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      audioContextRef.current = ctx;
      
      const oscs: OscillatorNode[] = [];
      
      octaveBands.forEach((band) => {
        const osc = ctx.createOscillator();
        const gainNode = ctx.createGain();
        
        osc.type = 'sine';
        osc.frequency.value = band.freq;
        gainNode.gain.value = dbToGain(band.value, distance);
        
        osc.connect(gainNode);
        gainNode.connect(ctx.destination);
        
        osc.start();
        oscs.push(osc);
      });
      
      oscillatorsRef.current = oscs;
      setIsPlaying(true);
      
      toast.info(`Playing ${noiseAtDistance} dB(A) at ${distance}m`, {
        description: 'Click Stop to end playback',
        duration: 3000,
      });
      
      timeoutRef.current = setTimeout(() => {
        stopNoiseSimulation();
      }, 5000);
    } catch (error) {
      toast.error('Unable to play audio');
    }
  }, [octaveBands, dbToGain, distance, noiseAtDistance, stopNoiseSimulation]);

  const handleSoundButtonClick = useCallback(() => {
    if (isPlaying) {
      stopNoiseSimulation();
    } else {
      playNoiseSimulation();
    }
  }, [isPlaying, stopNoiseSimulation, playNoiseSimulation]);

  // Color based on dB level - matches PDF color coding
  const getBarColor = (value: number) => {
    if (value < 50) return 'hsl(142, 70%, 45%)';  // Green (safe)
    if (value < 65) return 'hsl(45, 90%, 50%)';   // Yellow (caution)
    if (value < 80) return 'hsl(30, 90%, 50%)';   // Orange (warning)
    return 'hsl(0, 70%, 50%)';                     // Red (danger)
  };

  const distancePresets = [0, 1.5, 3];

  // If no octave band data, show simplified view with overall and distance calculator
  if (!hasOctaveBands) {
    return (
      <div className="space-y-4">
        <div className="kinair-card p-5">
          <div className="flex items-center gap-2 mb-4">
            <Volume2 className="w-5 h-5 text-primary" />
            <span className="font-semibold text-foreground">Sound Data</span>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="p-4 bg-muted/50 rounded-lg">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs text-muted-foreground mb-1">
                    Overall Sound Level {distance === 0 ? '(Source)' : `at ${distance}m`}
                  </div>
                  <div className={`text-2xl font-mono font-bold ${noiseAtDistance >= 85 ? 'text-destructive' : 'text-primary'}`}>
                    {noiseAtDistance} dB(A)
                  </div>
                </div>
                {noiseAtDistance >= 85 && (
                  <div className="flex items-center gap-1 text-xs text-destructive bg-destructive/10 px-2 py-1 rounded">
                    <AlertCircle className="w-3 h-3" />
                    <span>PPE Required</span>
                  </div>
                )}
              </div>
            </div>
            <div className="p-4 bg-muted/50 rounded-lg">
              <div className="text-xs text-muted-foreground mb-1">
                Estimated NC Rating {distance === 0 ? '(Source)' : `at ${distance}m`}
              </div>
              <div className="text-2xl font-mono font-bold text-primary">NC-{ncLevelAtDistance}</div>
              <div className="text-xs text-muted-foreground mt-1">
                {ncLevelAtDistance <= 30 ? 'Quiet office' : ncLevelAtDistance <= 40 ? 'Private office' : ncLevelAtDistance <= 50 ? 'Open office' : 'Industrial'}
              </div>
            </div>
          </div>

          <div className="mt-4 p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-800">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
              <div className="text-xs text-amber-700 dark:text-amber-300">
                <span className="font-medium">Note:</span> Octave band data not available. NC rating is estimated from overall sound level.
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-border/50 mt-4 text-xs text-muted-foreground">
            <div className="font-medium mb-2">NC Level Reference:</div>
            <div className="grid grid-cols-2 gap-1">
              <span>NC-25 to NC-30: Private offices</span>
              <span>NC-35 to NC-40: Open offices</span>
              <span>NC-40 to NC-45: Lobbies</span>
              <span>NC-50+: Industrial areas</span>
            </div>
          </div>
        </div>

        {/* Distance Calculator for simplified view */}
        <div className="kinair-card p-5">
          <div className="flex items-center gap-2 mb-4">
            <Ruler className="w-5 h-5 text-primary" />
            <span className="font-semibold text-foreground">Noise at Distance</span>
          </div>

          {/* Sound Directivity Q Factor Selector */}
          <div className="mb-4 p-3 bg-muted/30 rounded-lg border border-border/50">
            <div className="flex items-center justify-between mb-2">
              <Label className="text-sm font-medium">Sound Directivity (Q Factor)</Label>
              <span className="text-sm font-mono font-bold text-primary">Q = {directivityQ}</span>
            </div>
            <div className="grid grid-cols-4 gap-2">
              {DIRECTIVITY_OPTIONS.map(opt => (
                <Button
                  key={opt.q}
                  variant={directivityQ === opt.q ? "default" : "outline"}
                  size="sm"
                  onClick={() => setQ(opt.q)}
                  className="flex flex-col h-auto py-2"
                >
                  <span className="font-bold">{opt.label}</span>
                  <span className="text-[10px] font-normal opacity-80 leading-tight">{opt.description.split('(')[0].trim()}</span>
                </Button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Q factor accounts for sound reflections from nearby surfaces
            </p>
          </div>

          <div className="space-y-4">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-sm text-muted-foreground">Distance from fan</Label>
                <span className="text-lg font-mono font-bold text-primary">
                  {distance === 0 ? 'At Source (0m)' : `${distance} m`}
                </span>
              </div>
              
              {/* Distance preset buttons + Custom input */}
              <div className="flex gap-2 items-center">
                {distancePresets.map(d => (
                  <Button
                    key={d}
                    variant={distance === d && customDistance === '' ? "default" : "outline"}
                    size="sm"
                    onClick={() => {
                      setDistance(d);
                      setCustomDistance('');
                    }}
                    className="min-w-[60px]"
                  >
                    {d === 0 ? '0m' : `${d}m`}
                  </Button>
                ))}
                <div className="flex items-center gap-2 ml-2">
                  <Label className="text-xs text-muted-foreground whitespace-nowrap">Custom:</Label>
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    step={0.5}
                    placeholder="m"
                    value={customDistance}
                    onChange={(e) => {
                      const val = e.target.value;
                      setCustomDistance(val);
                      const num = parseFloat(val);
                      if (!isNaN(num) && num >= 0 && num <= 100) {
                        setDistance(num);
                      }
                    }}
                    className="w-20 h-8 text-sm"
                  />
                </div>
              </div>

              <Slider
                min={0}
                max={20}
                step={0.5}
                value={[distance]}
                onValueChange={(vals) => {
                  setDistance(vals[0]);
                  setCustomDistance(vals[0] > 0 ? vals[0].toString() : '');
                }}
                className="mt-2"
              />
            </div>

            {/* Results at distance */}
            <div className="grid grid-cols-2 gap-4 mt-4">
              <div className="p-4 bg-muted/50 rounded-lg">
                <div className="text-xs text-muted-foreground mb-1">
                  Sound Level {distance === 0 ? '(Source)' : `at ${distance}m`}
                </div>
                <div className={`text-2xl font-mono font-bold ${noiseAtDistance >= 85 ? 'text-destructive' : 'text-primary'}`}>
                  {noiseAtDistance} dB(A)
                </div>
                {distance > 0 && noiseData.overall > 0 && (
                  <div className="text-xs text-muted-foreground mt-1">
                    -{Math.round((noiseData.overall - noiseAtDistance) * 10) / 10} dB from source
                  </div>
                )}
              </div>
              <div className="p-4 bg-muted/50 rounded-lg">
                <div className="text-xs text-muted-foreground mb-1">
                  NC Rating {distance === 0 ? '(Source)' : `at ${distance}m`}
                </div>
                <div className="text-2xl font-mono font-bold text-primary">NC-{ncLevelAtDistance}</div>
                <div className="text-xs text-muted-foreground mt-1">
                  {ncLevelAtDistance <= 30 ? 'Quiet office' : ncLevelAtDistance <= 40 ? 'Private office' : ncLevelAtDistance <= 50 ? 'Open office' : 'Industrial'}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Dual Octave Band Charts - SWL (Source) and SPL (at Distance) */}
      <div className="kinair-card p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-primary" />
            <span className="font-semibold text-foreground">Octave Band Spectrum</span>
          </div>
          <div className="flex items-center gap-3">
            <Button 
              variant={isPlaying ? "destructive" : "default"} 
              size="sm"
              onClick={handleSoundButtonClick}
              className="gap-2"
            >
              {isPlaying ? <Square className="w-4 h-4" /> : <Play className="w-4 h-4" />}
              {isPlaying ? 'Stop' : 'Play Sound'}
            </Button>
          </div>
        </div>
        
        {/* Two Charts Side by Side */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Chart 1: Sound Power Level (SWL) - At Source */}
          <div className="border border-border rounded-lg p-4">
            <div className="text-center mb-3">
              <span className="font-semibold text-primary">Sound Power Level (LwA)</span>
              <div className="text-xs text-muted-foreground">At Source (0m)</div>
            </div>
            <div className="h-56 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={octaveBands.map((band, idx) => ({
                  name: band.label,
                  value: band.value,
                  nc: NC_CURVES[ncLevel]?.[idx] || 50,
                }))} margin={{ top: 10, right: 10, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(210, 15%, 85%)" />
                  <XAxis 
                    dataKey="name" 
                    tick={{ fill: 'hsl(0, 0%, 0%)', fontSize: 10, fontWeight: 600 }}
                    axisLine={{ stroke: 'hsl(0, 0%, 0%)' }}
                    tickLine={{ stroke: 'hsl(0, 0%, 0%)' }}
                  />
                  <YAxis 
                    domain={[Math.floor(minValue / 10) * 10, Math.ceil(maxValue / 10) * 10 + 10]}
                    tick={{ fill: 'hsl(0, 0%, 0%)', fontSize: 10, fontWeight: 600 }}
                    axisLine={{ stroke: 'hsl(0, 0%, 0%)' }}
                    tickLine={{ stroke: 'hsl(0, 0%, 0%)' }}
                    label={{ value: 'dB', angle: -90, position: 'insideLeft', fill: 'hsl(0, 0%, 0%)', fontWeight: 600, fontSize: 10 }}
                  />
                  <Tooltip 
                    contentStyle={{
                      backgroundColor: 'hsl(0, 0%, 100%)',
                      border: '1px solid hsl(214, 20%, 88%)',
                      borderRadius: '8px',
                      boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                    }}
                    formatter={(value: number) => [`${value} dB`, 'Sound Power Level']}
                  />
                  <ReferenceLine y={NC_CURVES[ncLevel]?.[3] || 50} stroke="hsl(142, 70%, 45%)" strokeDasharray="5 5" />
                  <Bar dataKey="value" radius={[4, 4, 0, 0]} name="SWL">
                    {octaveBands.map((band, index) => (
                      <Cell key={`cell-swl-${index}`} fill={getBarColor(band.value)} />
                    ))}
                    <LabelList dataKey="value" position="top" fill="hsl(0, 0%, 20%)" fontSize={9} fontWeight={600} formatter={(v: number) => Math.round(v)} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <div className="p-2 bg-muted/50 rounded text-center">
                <div className="text-[10px] text-muted-foreground">Overall</div>
                <div className={`text-lg font-mono font-bold ${noiseData.overall >= 85 ? 'text-destructive' : 'text-primary'}`}>
                  {noiseData.overall} dB(A)
                </div>
              </div>
              <div className="p-2 bg-muted/50 rounded text-center">
                <div className="text-[10px] text-muted-foreground">NC Rating</div>
                <div className="text-lg font-mono font-bold text-primary">NC-{ncLevel}</div>
              </div>
            </div>
          </div>

          {/* Chart 2: Sound Pressure Level (SPL) - At Distance */}
          <div className="border border-border rounded-lg p-4">
            <div className="text-center mb-3">
              <span className="font-semibold text-secondary-foreground">Sound Pressure Level (LpA)</span>
              <div className="text-xs text-muted-foreground">
                {distance === 0 ? 'At Source (0m)' : `At ${distance}m, Q=${directivityQ}`}
              </div>
            </div>
            <div className="h-56 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(210, 15%, 85%)" />
                  <XAxis 
                    dataKey="name" 
                    tick={{ fill: 'hsl(0, 0%, 0%)', fontSize: 10, fontWeight: 600 }}
                    axisLine={{ stroke: 'hsl(0, 0%, 0%)' }}
                    tickLine={{ stroke: 'hsl(0, 0%, 0%)' }}
                  />
                  <YAxis 
                    domain={[Math.floor(Math.min(...octaveBandsAtDistance, 30) / 10) * 10, Math.ceil(maxValue / 10) * 10 + 10]}
                    tick={{ fill: 'hsl(0, 0%, 0%)', fontSize: 10, fontWeight: 600 }}
                    axisLine={{ stroke: 'hsl(0, 0%, 0%)' }}
                    tickLine={{ stroke: 'hsl(0, 0%, 0%)' }}
                    label={{ value: 'dB', angle: -90, position: 'insideLeft', fill: 'hsl(0, 0%, 0%)', fontWeight: 600, fontSize: 10 }}
                  />
                  <Tooltip 
                    contentStyle={{
                      backgroundColor: 'hsl(0, 0%, 100%)',
                      border: '1px solid hsl(214, 20%, 88%)',
                      borderRadius: '8px',
                      boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                    }}
                    formatter={(value: number, name: string) => {
                      if (name === 'nc') return [`NC-${ncLevelAtDistance}: ${value} dB`, 'NC Curve'];
                      return [`${value} dB`, 'Sound Pressure Level'];
                    }}
                  />
                  <ReferenceLine y={NC_CURVES[ncLevelAtDistance]?.[3] || 50} stroke="hsl(142, 70%, 45%)" strokeDasharray="5 5" />
                  <Bar dataKey="value" radius={[4, 4, 0, 0]} name="SPL">
                    {chartData.map((entry, index) => (
                      <Cell key={`cell-spl-${index}`} fill={getBarColor(entry.value)} />
                    ))}
                    <LabelList dataKey="value" position="top" fill="hsl(0, 0%, 20%)" fontSize={9} fontWeight={600} formatter={(v: number) => Math.round(v)} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <div className="p-2 bg-muted/50 rounded text-center">
                <div className="text-[10px] text-muted-foreground">Overall at {distance === 0 ? 'Source' : `${distance}m`}</div>
                <div className={`text-lg font-mono font-bold ${noiseAtDistance >= 85 ? 'text-destructive' : 'text-primary'}`}>
                  {noiseAtDistance} dB(A)
                </div>
              </div>
              <div className="p-2 bg-muted/50 rounded text-center">
                <div className="text-[10px] text-muted-foreground">NC Rating</div>
                <div className="text-lg font-mono font-bold text-primary">NC-{ncLevelAtDistance}</div>
              </div>
            </div>
          </div>
        </div>

        {/* Legend - matches PDF color thresholds */}
        <div className="flex items-center justify-center gap-6 mt-4 text-xs">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded" style={{ backgroundColor: 'hsl(142, 70%, 45%)' }} />
            <span className="text-muted-foreground">&lt;50 dB (Safe)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded" style={{ backgroundColor: 'hsl(45, 90%, 50%)' }} />
            <span className="text-muted-foreground">50-65 dB</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded" style={{ backgroundColor: 'hsl(30, 90%, 50%)' }} />
            <span className="text-muted-foreground">65-80 dB</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded" style={{ backgroundColor: 'hsl(0, 70%, 50%)' }} />
            <span className="text-muted-foreground">&gt;80 dB (PPE)</span>
          </div>
        </div>
      </div>

      {/* Distance Calculator */}
      <div className="kinair-card p-5">
        <div className="flex items-center gap-2 mb-4">
          <Ruler className="w-5 h-5 text-primary" />
          <span className="font-semibold text-foreground">Noise at Distance</span>
        </div>

        {/* Sound Directivity Q Factor Selector */}
        <div className="mb-4 p-3 bg-muted/30 rounded-lg border border-border/50">
          <div className="flex items-center justify-between mb-2">
            <Label className="text-sm font-medium">Sound Directivity (Q Factor)</Label>
            <span className="text-sm font-mono font-bold text-primary">Q = {directivityQ}</span>
          </div>
          <div className="grid grid-cols-4 gap-2">
            {DIRECTIVITY_OPTIONS.map(opt => (
              <Button
                key={opt.q}
                variant={directivityQ === opt.q ? "default" : "outline"}
                size="sm"
                onClick={() => setQ(opt.q)}
                className="flex flex-col h-auto py-2"
              >
                <span className="font-bold">{opt.label}</span>
                <span className="text-[10px] font-normal opacity-80 leading-tight">{opt.description.split('(')[0].trim()}</span>
              </Button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Q factor accounts for sound reflections from nearby surfaces
          </p>
        </div>

        <div className="space-y-4">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-sm text-muted-foreground">Distance from fan</Label>
              <span className="text-lg font-mono font-bold text-primary">
                {distance === 0 ? 'At Source (0m)' : `${distance} m`}
              </span>
            </div>
            
            {/* Distance preset buttons + Custom input */}
            <div className="flex gap-2 items-center">
              {distancePresets.map(d => (
                <Button
                  key={d}
                  variant={distance === d && customDistance === '' ? "default" : "outline"}
                  size="sm"
                  onClick={() => {
                    setDistance(d);
                    setCustomDistance('');
                  }}
                  className="flex-1"
                >
                  {d === 0 ? '0m (Source)' : `${d}m`}
                </Button>
              ))}
              <div className="flex items-center gap-1 flex-1">
                <Input
                  type="number"
                  placeholder="Custom"
                  value={customDistance}
                  onChange={(e) => {
                    const val = e.target.value;
                    setCustomDistance(val);
                    const num = parseFloat(val);
                    if (!isNaN(num) && num >= 0 && num <= 100) {
                      setDistance(num);
                    }
                  }}
                  className="h-8 w-20 text-center"
                  min={0}
                  max={100}
                  step={0.5}
                />
                <span className="text-sm text-muted-foreground">m</span>
              </div>
            </div>

            {/* Slider for fine control */}
            <Slider
              value={[distance]}
              onValueChange={(value) => {
                setDistance(value[0]);
                setCustomDistance('');
              }}
              min={0}
              max={20}
              step={0.5}
              className="w-full"
            />
          </div>

          {/* Noise levels at distance */}
          <div className="grid grid-cols-3 gap-3">
            <div className="p-4 bg-muted/50 rounded-lg text-center">
              <div className="text-xs text-muted-foreground mb-1">
                Inlet {distance === 0 ? '(Source)' : `(${distance}m)`}
              </div>
              <div className={`text-xl font-mono font-bold ${noiseAtDistance >= 85 ? 'text-destructive' : 'text-primary'}`}>
                {noiseAtDistance} dB(A)
              </div>
            </div>
            <div className="p-4 bg-muted/50 rounded-lg text-center">
              <div className="text-xs text-muted-foreground mb-1">
                Outlet {distance === 0 ? '(Source)' : `(${distance}m)`}
              </div>
              <div className={`text-xl font-mono font-bold ${noiseAtDistance >= 85 ? 'text-destructive' : 'text-primary'}`}>
                {noiseAtDistance} dB(A)
              </div>
            </div>
            <div className="p-4 bg-primary/10 rounded-lg text-center border border-primary/20">
              <div className="text-xs text-muted-foreground mb-1">
                NC {distance === 0 ? '(Source)' : `at ${distance}m`}
              </div>
              <div className="text-xl font-mono font-bold text-primary">
                NC-{ncLevelAtDistance}
              </div>
              <div className="text-[10px] text-muted-foreground mt-1">
                {ncLevelAtDistance <= 25 ? 'Concert hall' : 
                 ncLevelAtDistance <= 30 ? 'Library' : 
                 ncLevelAtDistance <= 35 ? 'Private office' : 
                 ncLevelAtDistance <= 40 ? 'Open office' : 
                 ncLevelAtDistance <= 50 ? 'Restaurant' : 'Industrial'}
              </div>
            </div>
          </div>

          <Button
            variant={isPlaying ? "destructive" : "secondary"}
            size="sm"
            onClick={handleSoundButtonClick}
            className="w-full gap-2"
          >
            {isPlaying ? (
              <>
                <Square className="w-4 h-4" />
                Stop Sound
              </>
            ) : (
              <>
                <Play className="w-4 h-4" />
                Experience at {distance}m ({noiseAtDistance} dB)
              </>
            )}
          </Button>

          <div className="pt-3 border-t border-border/50 text-xs text-muted-foreground">
            <div className="font-medium mb-2">NC Level Reference:</div>
            <div className="grid grid-cols-2 gap-1">
              <span>NC-25 to NC-30: Private offices</span>
              <span>NC-35 to NC-40: Open offices</span>
              <span>NC-40 to NC-45: Lobbies</span>
              <span>NC-50+: Industrial areas</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}