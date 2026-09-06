import { useState } from 'react';
import { Plus, Trash2, PipetteIcon, Circle, Square, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface DuctFitting {
  id: string;
  type: 'straight' | 'straightRect' | 'elbow90' | 'elbow45' | 'elbow90Rect' | 'elbow45Rect' | 'reducer' | 'expansion' | 'damper' | 'tee' | 'wye' | 'grille' | 'filter' | 'coil' | 'silencer' | 'flexDuct';
  diameter?: number; // mm (for circular)
  width?: number; // mm (for rectangular)
  height?: number; // mm (for rectangular)
  length?: number; // m (for straight duct)
  quantity: number;
  pressureLoss: number;
}

const FITTING_TYPES = {
  straight: { label: 'Straight Duct (Circular)', unit: 'm', hasLength: true, shape: 'circular' },
  straightRect: { label: 'Straight Duct (Rectangular)', unit: 'm', hasLength: true, shape: 'rectangular' },
  elbow90: { label: '90° Elbow (Circular)', coefficient: 0.25, unit: 'pcs', shape: 'circular' },
  elbow45: { label: '45° Elbow (Circular)', coefficient: 0.12, unit: 'pcs', shape: 'circular' },
  elbow90Rect: { label: '90° Elbow (Rectangular)', coefficient: 0.35, unit: 'pcs', shape: 'rectangular' },
  elbow45Rect: { label: '45° Elbow (Rectangular)', coefficient: 0.15, unit: 'pcs', shape: 'rectangular' },
  reducer: { label: 'Reducer/Transition', coefficient: 0.15, unit: 'pcs', shape: 'both' },
  expansion: { label: 'Expansion', coefficient: 0.35, unit: 'pcs', shape: 'both' },
  tee: { label: 'Tee (Branch)', coefficient: 0.9, unit: 'pcs', shape: 'both' },
  wye: { label: 'Wye (45° Branch)', coefficient: 0.5, unit: 'pcs', shape: 'both' },
  damper: { label: 'Volume Damper', coefficient: 0.5, unit: 'pcs', shape: 'both' },
  grille: { label: 'Grille/Diffuser', fixedLoss: 25, unit: 'pcs', shape: 'both' },
  filter: { label: 'Filter (Clean)', fixedLoss: 50, unit: 'pcs', shape: 'both' },
  coil: { label: 'Cooling/Heating Coil', fixedLoss: 100, unit: 'pcs', shape: 'both' },
  silencer: { label: 'Silencer/Attenuator', fixedLoss: 50, unit: 'pcs', shape: 'both' },
  flexDuct: { label: 'Flexible Duct (per m)', coefficient: 0.6, unit: 'm', hasLength: true, shape: 'circular' },
};

// Fitting reference data with SVG diagrams
const FITTING_REFERENCE = {
  straight: {
    description: 'Straight circular duct section',
    diagram: (
      <svg viewBox="0 0 100 40" className="w-full h-12">
        <rect x="10" y="10" width="80" height="20" fill="none" stroke="currentColor" strokeWidth="2" rx="10" />
        <line x1="0" y1="20" x2="10" y2="20" stroke="currentColor" strokeWidth="2" />
        <line x1="90" y1="20" x2="100" y2="20" stroke="currentColor" strokeWidth="2" />
      </svg>
    )
  },
  straightRect: {
    description: 'Straight rectangular duct section',
    diagram: (
      <svg viewBox="0 0 100 40" className="w-full h-12">
        <rect x="10" y="8" width="80" height="24" fill="none" stroke="currentColor" strokeWidth="2" />
        <line x1="0" y1="20" x2="10" y2="20" stroke="currentColor" strokeWidth="2" />
        <line x1="90" y1="20" x2="100" y2="20" stroke="currentColor" strokeWidth="2" />
      </svg>
    )
  },
  elbow90: {
    description: '90° circular elbow (long radius)',
    diagram: (
      <svg viewBox="0 0 60 60" className="w-full h-12">
        <path d="M10,50 L10,30 Q10,10 30,10 L50,10" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
      </svg>
    )
  },
  elbow45: {
    description: '45° circular elbow',
    diagram: (
      <svg viewBox="0 0 60 60" className="w-full h-12">
        <path d="M10,50 L10,35 Q10,20 25,15 L50,5" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
      </svg>
    )
  },
  elbow90Rect: {
    description: '90° rectangular elbow with turning vanes',
    diagram: (
      <svg viewBox="0 0 60 60" className="w-full h-12">
        {/* Outer elbow shape */}
        <path d="M5,55 L5,5 L55,5" fill="none" stroke="currentColor" strokeWidth="4" strokeLinejoin="miter" />
        {/* Inner elbow shape to show duct thickness */}
        <path d="M15,55 L15,15 L55,15" fill="none" stroke="currentColor" strokeWidth="1" strokeLinejoin="miter" />
        {/* Turning vanes */}
        <line x1="18" y1="18" x2="8" y2="8" stroke="currentColor" strokeWidth="1" />
        <line x1="25" y1="18" x2="10" y2="3" stroke="currentColor" strokeWidth="1" />
      </svg>
    )
  },
  elbow45Rect: {
    description: '45° rectangular elbow',
    diagram: (
      <svg viewBox="0 0 60 60" className="w-full h-12">
        {/* Outer 45° elbow shape */}
        <path d="M5,55 L5,30 L30,5 L55,5" fill="none" stroke="currentColor" strokeWidth="4" strokeLinejoin="miter" />
        {/* Inner shape to show duct thickness */}
        <path d="M15,55 L15,35 L40,10 L55,10" fill="none" stroke="currentColor" strokeWidth="1" strokeLinejoin="miter" />
      </svg>
    )
  },
  reducer: {
    description: 'Concentric reducer/transition',
    diagram: (
      <svg viewBox="0 0 80 40" className="w-full h-12">
        {/* Trapezoid shape showing reduction */}
        <polygon points="0,5 30,5 50,12 80,12 80,28 50,28 30,35 0,35" fill="none" stroke="currentColor" strokeWidth="2" />
        {/* Arrow showing flow direction */}
        <line x1="35" y1="20" x2="45" y2="20" stroke="currentColor" strokeWidth="1" markerEnd="url(#arrow)" />
      </svg>
    )
  },
  expansion: {
    description: 'Sudden expansion',
    diagram: (
      <svg viewBox="0 0 80 40" className="w-full h-12">
        <path d="M0,12 L25,12 L25,5 L80,5 L80,35 L25,35 L25,28 L0,28 Z" fill="none" stroke="currentColor" strokeWidth="2" />
      </svg>
    )
  },
  tee: {
    description: 'Tee junction (90° branch)',
    diagram: (
      <svg viewBox="0 0 60 60" className="w-full h-12">
        <line x1="0" y1="30" x2="60" y2="30" stroke="currentColor" strokeWidth="4" />
        <line x1="30" y1="30" x2="30" y2="60" stroke="currentColor" strokeWidth="4" />
      </svg>
    )
  },
  wye: {
    description: 'Wye junction (45° branch)',
    diagram: (
      <svg viewBox="0 0 60 60" className="w-full h-12">
        <line x1="0" y1="20" x2="35" y2="20" stroke="currentColor" strokeWidth="4" />
        <line x1="35" y1="20" x2="60" y2="20" stroke="currentColor" strokeWidth="4" />
        <line x1="35" y1="20" x2="55" y2="50" stroke="currentColor" strokeWidth="4" />
      </svg>
    )
  },
  damper: {
    description: 'Volume control damper',
    diagram: (
      <svg viewBox="0 0 60 40" className="w-full h-12">
        <rect x="5" y="5" width="50" height="30" fill="none" stroke="currentColor" strokeWidth="2" />
        <line x1="10" y1="35" x2="50" y2="5" stroke="currentColor" strokeWidth="2" />
        <circle cx="30" cy="20" r="3" fill="currentColor" />
      </svg>
    )
  },
  grille: {
    description: 'Supply grille or return diffuser',
    diagram: (
      <svg viewBox="0 0 60 40" className="w-full h-12">
        <rect x="5" y="5" width="50" height="30" fill="none" stroke="currentColor" strokeWidth="2" />
        <line x1="15" y1="5" x2="15" y2="35" stroke="currentColor" strokeWidth="1" />
        <line x1="25" y1="5" x2="25" y2="35" stroke="currentColor" strokeWidth="1" />
        <line x1="35" y1="5" x2="35" y2="35" stroke="currentColor" strokeWidth="1" />
        <line x1="45" y1="5" x2="45" y2="35" stroke="currentColor" strokeWidth="1" />
      </svg>
    )
  },
  filter: {
    description: 'Air filter (clean condition)',
    diagram: (
      <svg viewBox="0 0 60 40" className="w-full h-12">
        <rect x="5" y="5" width="50" height="30" fill="none" stroke="currentColor" strokeWidth="2" />
        <path d="M10,10 L15,30 L20,10 L25,30 L30,10 L35,30 L40,10 L45,30 L50,10" fill="none" stroke="currentColor" strokeWidth="1" />
      </svg>
    )
  },
  coil: {
    description: 'Heating or cooling coil',
    diagram: (
      <svg viewBox="0 0 60 40" className="w-full h-12">
        <rect x="5" y="5" width="50" height="30" fill="none" stroke="currentColor" strokeWidth="2" />
        <path d="M10,10 Q15,20 10,30 M20,10 Q25,20 20,30 M30,10 Q35,20 30,30 M40,10 Q45,20 40,30 M50,10 Q55,20 50,30" fill="none" stroke="currentColor" strokeWidth="1" />
      </svg>
    )
  },
  silencer: {
    description: 'Acoustic silencer/attenuator',
    diagram: (
      <svg viewBox="0 0 80 40" className="w-full h-12">
        <rect x="15" y="5" width="50" height="30" fill="none" stroke="currentColor" strokeWidth="2" />
        <line x1="0" y1="20" x2="15" y2="20" stroke="currentColor" strokeWidth="3" />
        <line x1="65" y1="20" x2="80" y2="20" stroke="currentColor" strokeWidth="3" />
        <rect x="20" y="12" width="40" height="4" fill="currentColor" opacity="0.3" />
        <rect x="20" y="24" width="40" height="4" fill="currentColor" opacity="0.3" />
      </svg>
    )
  },
  flexDuct: {
    description: 'Flexible duct (higher friction)',
    diagram: (
      <svg viewBox="0 0 100 40" className="w-full h-12">
        <path d="M5,20 Q15,10 25,20 Q35,30 45,20 Q55,10 65,20 Q75,30 85,20 Q95,10 100,20" fill="none" stroke="currentColor" strokeWidth="3" />
      </svg>
    )
  },
};

// Calculate equivalent diameter for rectangular duct
const calculateEquivalentDiameter = (width: number, height: number): number => {
  // Using hydraulic diameter formula: De = 1.3 * (a*b)^0.625 / (a+b)^0.25
  return 1.3 * Math.pow(width * height, 0.625) / Math.pow(width + height, 0.25);
};

// Friction factor calculation using Colebrook equation (simplified)
const calculateFrictionFactor = (velocity: number, diameter: number, roughness: number = 0.00015): number => {
  const Re = (velocity * diameter / 1000) / 0.0000151; // Reynolds number
  if (Re < 2300) return 64 / Re; // Laminar
  
  // Simplified Colebrook-White approximation
  const a = roughness / (3.7 * diameter / 1000);
  const b = 2.51 / Re;
  let f = 0.02; // Initial guess
  
  for (let i = 0; i < 10; i++) {
    f = Math.pow(1 / (-2 * Math.log10(a + b / Math.sqrt(f))), 2);
  }
  
  return f;
};

// Calculate pressure loss for straight duct (Pa)
const calculateStraightDuctLoss = (airflow: number, diameter: number, length: number): number => {
  const area = Math.PI * Math.pow(diameter / 1000 / 2, 2); // m²
  const velocity = airflow / 3600 / area; // m/s
  const velocityPressure = 0.5 * 1.2 * Math.pow(velocity, 2); // Pa
  const frictionFactor = calculateFrictionFactor(velocity, diameter);
  
  return frictionFactor * (length / (diameter / 1000)) * velocityPressure;
};

// Calculate pressure loss for rectangular duct (Pa)
const calculateRectDuctLoss = (airflow: number, width: number, height: number, length: number): number => {
  const area = (width / 1000) * (height / 1000); // m²
  const velocity = airflow / 3600 / area; // m/s
  const velocityPressure = 0.5 * 1.2 * Math.pow(velocity, 2); // Pa
  const De = calculateEquivalentDiameter(width, height);
  const frictionFactor = calculateFrictionFactor(velocity, De);
  
  return frictionFactor * (length / (De / 1000)) * velocityPressure;
};

// Calculate pressure loss for fittings (Pa)
const calculateFittingLoss = (airflow: number, diameter: number, coefficient: number): number => {
  const area = Math.PI * Math.pow(diameter / 1000 / 2, 2); // m²
  const velocity = airflow / 3600 / area; // m/s
  const velocityPressure = 0.5 * 1.2 * Math.pow(velocity, 2); // Pa
  
  return coefficient * velocityPressure;
};

// Calculate fitting loss for rectangular duct
const calculateRectFittingLoss = (airflow: number, width: number, height: number, coefficient: number): number => {
  const area = (width / 1000) * (height / 1000); // m²
  const velocity = airflow / 3600 / area; // m/s
  const velocityPressure = 0.5 * 1.2 * Math.pow(velocity, 2); // Pa
  
  return coefficient * velocityPressure;
};

const CIRCULAR_DIAMETERS = [100, 125, 150, 160, 200, 250, 300, 315, 355, 400, 450, 500, 560, 630, 710, 800, 900, 1000];
const RECT_SIZES = [100, 150, 200, 250, 300, 400, 500, 600, 800, 1000, 1200];

export function ESPCalculator() {
  const [airflow, setAirflow] = useState('1000'); // m³/h
  const [ductShape, setDuctShape] = useState<'circular' | 'rectangular'>('circular');
  const [defaultDiameter, setDefaultDiameter] = useState('200'); // mm
  const [defaultWidth, setDefaultWidth] = useState('300'); // mm
  const [defaultHeight, setDefaultHeight] = useState('200'); // mm
  const [fittings, setFittings] = useState<DuctFitting[]>([]);
  const [newFittingType, setNewFittingType] = useState<keyof typeof FITTING_TYPES>('straight');
  const [showReference, setShowReference] = useState(false);

  const addFitting = () => {
    const fittingConfig = FITTING_TYPES[newFittingType];
    const isRect = fittingConfig.shape === 'rectangular' || (fittingConfig.shape === 'both' && ductShape === 'rectangular');
    
    const fitting: DuctFitting = {
      id: Date.now().toString(),
      type: newFittingType,
      diameter: isRect ? undefined : Number(defaultDiameter),
      width: isRect ? Number(defaultWidth) : undefined,
      height: isRect ? Number(defaultHeight) : undefined,
      length: 'hasLength' in fittingConfig ? 1 : undefined,
      quantity: 1,
      pressureLoss: 0,
    };
    setFittings([...fittings, fitting]);
  };

  const removeFitting = (id: string) => {
    setFittings(fittings.filter(f => f.id !== id));
  };

  const updateFitting = (id: string, updates: Partial<DuctFitting>) => {
    setFittings(fittings.map(f => f.id === id ? { ...f, ...updates } : f));
  };

  // Get available fittings based on duct shape
  const getAvailableFittings = () => {
    return Object.entries(FITTING_TYPES).filter(([_, config]) => {
      if (config.shape === 'both') return true;
      return config.shape === ductShape;
    });
  };

  // Calculate pressure losses for all fittings
  const calculateAllLosses = (): DuctFitting[] => {
    return fittings.map(fitting => {
      const q = Number(airflow) || 0;
      const fittingConfig = FITTING_TYPES[fitting.type];
      const isRect = fitting.width !== undefined && fitting.height !== undefined;
      
      let pressureLoss = 0;
      
      if ('hasLength' in fittingConfig && fitting.length) {
        // Straight duct
        if (isRect && fitting.width && fitting.height) {
          pressureLoss = calculateRectDuctLoss(q, fitting.width, fitting.height, fitting.length);
        } else {
          const d = fitting.diameter || Number(defaultDiameter);
          pressureLoss = calculateStraightDuctLoss(q, d, fitting.length);
          // Flex duct has additional multiplier
          if (fitting.type === 'flexDuct') {
            pressureLoss *= 2.5; // Flex duct has ~2.5x friction
          }
        }
        pressureLoss *= fitting.quantity;
      } else if ('coefficient' in fittingConfig) {
        // Fitting with coefficient
        if (isRect && fitting.width && fitting.height) {
          pressureLoss = calculateRectFittingLoss(q, fitting.width, fitting.height, fittingConfig.coefficient) * fitting.quantity;
        } else {
          const d = fitting.diameter || Number(defaultDiameter);
          pressureLoss = calculateFittingLoss(q, d, fittingConfig.coefficient) * fitting.quantity;
        }
      } else if ('fixedLoss' in fittingConfig) {
        // Fixed pressure loss items
        pressureLoss = fittingConfig.fixedLoss * fitting.quantity;
      }
      
      return { ...fitting, pressureLoss };
    });
  };

  const calculatedFittings = calculateAllLosses();
  const totalPressureLoss = calculatedFittings.reduce((sum, f) => sum + f.pressureLoss, 0);

  // Calculate velocity for display
  const getVelocity = () => {
    const q = Number(airflow) / 3600;
    if (ductShape === 'circular') {
      const area = Math.PI * Math.pow(Number(defaultDiameter) / 1000 / 2, 2);
      return q / area;
    } else {
      const area = (Number(defaultWidth) / 1000) * (Number(defaultHeight) / 1000);
      return q / area;
    }
  };
  
  const velocity = getVelocity();

  // Get equivalent diameter for rectangular
  const equivDiameter = ductShape === 'rectangular' 
    ? calculateEquivalentDiameter(Number(defaultWidth), Number(defaultHeight)).toFixed(0)
    : null;

  return (
    <div className="space-y-6">
      {/* Input Parameters */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <PipetteIcon className="w-5 h-5 text-primary" />
            ESP Calculator
          </CardTitle>
          <CardDescription>Calculate duct system pressure losses for circular and rectangular ducts</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Duct Shape Toggle */}
          <div className="flex gap-2 mb-4">
            <Button
              variant={ductShape === 'circular' ? 'default' : 'outline'}
              onClick={() => {
                setDuctShape('circular');
                setNewFittingType('straight');
              }}
              className="gap-2"
            >
              <Circle className="w-4 h-4" />
              Circular Duct
            </Button>
            <Button
              variant={ductShape === 'rectangular' ? 'default' : 'outline'}
              onClick={() => {
                setDuctShape('rectangular');
                setNewFittingType('straightRect');
              }}
              className="gap-2"
            >
              <Square className="w-4 h-4" />
              Rectangular Duct
            </Button>
          </div>

          <div className="grid md:grid-cols-4 gap-4">
            <div>
              <Label className="text-xs text-muted-foreground">Airflow (m³/h)</Label>
              <Input
                type="number"
                value={airflow}
                onChange={(e) => setAirflow(e.target.value)}
                className="mt-1"
              />
            </div>
            
            {ductShape === 'circular' ? (
              <div>
                <Label className="text-xs text-muted-foreground">Default Duct Diameter (mm)</Label>
                <Select value={defaultDiameter} onValueChange={setDefaultDiameter}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CIRCULAR_DIAMETERS.map(d => (
                      <SelectItem key={d} value={d.toString()}>Ø{d} mm</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <>
                <div>
                  <Label className="text-xs text-muted-foreground">Width (mm)</Label>
                  <Select value={defaultWidth} onValueChange={setDefaultWidth}>
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {RECT_SIZES.map(d => (
                        <SelectItem key={d} value={d.toString()}>{d} mm</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Height (mm)</Label>
                  <Select value={defaultHeight} onValueChange={setDefaultHeight}>
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {RECT_SIZES.map(d => (
                        <SelectItem key={d} value={d.toString()}>{d} mm</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}
            
            <div>
              <Label className="text-xs text-muted-foreground">Duct Velocity</Label>
              <div className="mt-1 bg-muted/50 rounded-md border px-3 py-2 font-mono text-sm">
                {velocity.toFixed(1)} m/s
                {equivDiameter && (
                  <span className="text-xs text-muted-foreground ml-2">(De: {equivDiameter}mm)</span>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Fitting Reference Guide */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Fitting Reference Guide</CardTitle>
            <Button variant="ghost" size="sm" onClick={() => setShowReference(!showReference)}>
              {showReference ? 'Hide' : 'Show'} Diagrams
            </Button>
          </div>
        </CardHeader>
        {showReference && (
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
              {Object.entries(FITTING_REFERENCE).map(([key, { description, diagram }]) => (
                <TooltipProvider key={key}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="p-3 border rounded-lg hover:bg-muted/50 cursor-help transition-colors">
                        <div className="text-muted-foreground mb-2">
                          {diagram}
                        </div>
                        <p className="text-xs font-medium text-center truncate">
                          {FITTING_TYPES[key as keyof typeof FITTING_TYPES]?.label || key}
                        </p>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>{description}</p>
                      {'coefficient' in (FITTING_TYPES[key as keyof typeof FITTING_TYPES] || {}) && (
                        <p className="text-xs text-muted-foreground mt-1">
                          K = {(FITTING_TYPES[key as keyof typeof FITTING_TYPES] as any).coefficient}
                        </p>
                      )}
                      {'fixedLoss' in (FITTING_TYPES[key as keyof typeof FITTING_TYPES] || {}) && (
                        <p className="text-xs text-muted-foreground mt-1">
                          Fixed: {(FITTING_TYPES[key as keyof typeof FITTING_TYPES] as any).fixedLoss} Pa
                        </p>
                      )}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              ))}
            </div>
          </CardContent>
        )}
      </Card>

      {/* Add Fittings */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Duct Components</CardTitle>
          <CardDescription>Add duct sections and fittings to calculate total pressure loss</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2 flex-wrap">
            <Select value={newFittingType} onValueChange={(v) => setNewFittingType(v as keyof typeof FITTING_TYPES)}>
              <SelectTrigger className="w-[240px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {getAvailableFittings().map(([key, { label }]) => (
                  <SelectItem key={key} value={key}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button onClick={addFitting} variant="outline" className="gap-2">
              <Plus className="w-4 h-4" /> Add Component
            </Button>
          </div>

          {calculatedFittings.length > 0 ? (
            <div className="rounded-md border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead>Component</TableHead>
                    <TableHead className="w-[140px]">Size</TableHead>
                    <TableHead className="w-[100px]">Length/Qty</TableHead>
                    <TableHead className="w-[100px] text-right">Δp (Pa)</TableHead>
                    <TableHead className="w-[60px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {calculatedFittings.map((fitting) => {
                    const fittingConfig = FITTING_TYPES[fitting.type];
                    const isRect = fitting.width !== undefined && fitting.height !== undefined;
                    
                    return (
                      <TableRow key={fitting.id}>
                        <TableCell>
                          <Badge variant="outline" className="font-normal">
                            {fittingConfig.label}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {isRect ? (
                            <div className="flex gap-1 items-center">
                              <Input
                                type="number"
                                value={fitting.width || ''}
                                onChange={(e) => updateFitting(fitting.id, { width: Number(e.target.value) })}
                                className="h-8 text-xs w-16"
                                placeholder="W"
                              />
                              <span className="text-xs">×</span>
                              <Input
                                type="number"
                                value={fitting.height || ''}
                                onChange={(e) => updateFitting(fitting.id, { height: Number(e.target.value) })}
                                className="h-8 text-xs w-16"
                                placeholder="H"
                              />
                            </div>
                          ) : (
                            <Select 
                              value={(fitting.diameter || defaultDiameter).toString()} 
                              onValueChange={(v) => updateFitting(fitting.id, { diameter: Number(v) })}
                            >
                              <SelectTrigger className="h-8 text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {CIRCULAR_DIAMETERS.map(d => (
                                  <SelectItem key={d} value={d.toString()}>Ø{d} mm</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )}
                        </TableCell>
                        <TableCell>
                          {'hasLength' in fittingConfig ? (
                            <Input
                              type="number"
                              value={fitting.length || ''}
                              onChange={(e) => updateFitting(fitting.id, { length: Number(e.target.value) })}
                              className="h-8 text-xs w-20"
                              placeholder="m"
                              step="0.5"
                              min="0.1"
                            />
                          ) : (
                            <Input
                              type="number"
                              value={fitting.quantity}
                              onChange={(e) => updateFitting(fitting.id, { quantity: Number(e.target.value) || 1 })}
                              className="h-8 text-xs w-20"
                              min="1"
                            />
                          )}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {fitting.pressureLoss.toFixed(1)}
                        </TableCell>
                        <TableCell>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-8 w-8"
                            onClick={() => removeFitting(fitting.id)}
                          >
                            <Trash2 className="w-4 h-4 text-destructive" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground border rounded-lg border-dashed">
              <Info className="w-8 h-8 mx-auto mb-2 opacity-50" />
              Add duct components to calculate total pressure loss
            </div>
          )}
        </CardContent>
      </Card>

      {/* Total ESP */}
      <Card className="bg-primary/5 border-primary/20">
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm text-muted-foreground">Total External Static Pressure</Label>
              <p className="text-xs text-muted-foreground mt-1">
                Add 10-20% safety factor for actual system design
              </p>
            </div>
            <div className="text-right">
              <div className="text-4xl font-mono font-bold text-primary">
                {totalPressureLoss.toFixed(1)} Pa
              </div>
              <div className="text-sm text-muted-foreground mt-1">
                ({(totalPressureLoss / 249.09).toFixed(3)} inWG) | ({(totalPressureLoss / 9.81).toFixed(2)} mmWG)
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Reference Guide */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Quick Reference</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-3 gap-4 text-sm">
            <div>
              <h4 className="font-medium mb-2">Recommended Duct Velocities</h4>
              <ul className="space-y-1 text-muted-foreground text-xs">
                <li>• Main ducts: 5-8 m/s</li>
                <li>• Branch ducts: 3-5 m/s</li>
                <li>• Supply diffusers: 2-3 m/s</li>
                <li>• Return grilles: 1.5-2.5 m/s</li>
              </ul>
            </div>
            <div>
              <h4 className="font-medium mb-2">Typical Component Losses</h4>
              <ul className="space-y-1 text-muted-foreground text-xs">
                <li>• Clean filter: 50-100 Pa</li>
                <li>• Dirty filter: 150-250 Pa</li>
                <li>• Cooling coil: 75-150 Pa</li>
                <li>• Silencer: 25-75 Pa</li>
              </ul>
            </div>
            <div>
              <h4 className="font-medium mb-2">Rectangular Duct Notes</h4>
              <ul className="space-y-1 text-muted-foreground text-xs">
                <li>• Aspect ratio ≤ 4:1 preferred</li>
                <li>• Higher friction than circular</li>
                <li>• Use turning vanes in elbows</li>
                <li>• De = equivalent diameter shown</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
