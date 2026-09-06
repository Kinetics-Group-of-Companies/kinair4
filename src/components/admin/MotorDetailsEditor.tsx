import { useState, useMemo } from 'react';
import { Plus, Trash2, Edit2, Save, X, Zap, Loader2, Lock, Unlock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DecimalInput } from '@/components/ui/decimal-input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { 
  useMotorBrands, 
  useAddMotorBrand, 
  useDeleteMotorBrand,
  useMotorSpecifications,
  useAddMotorSpecification,
  useUpdateMotorSpecification,
  useDeleteMotorSpecification,
  useFanSeries,
  useFanModels
} from '@/hooks/useFanDatabase';
import { MotorSpecification, MotorClass, MotorEfficiencyClass, MotorFireRating, MotorAtexRating, MOTOR_POLES, DUAL_SPEED_POLE_OPTIONS, ATEX_RATINGS } from '@/lib/fanData';
import { toast } from 'sonner';
import { MotorExcelImportExport } from './MotorExcelImportExport';

// These are default options, but users can add custom values
const DEFAULT_IP_RATINGS = ['None', 'IP44', 'IP54', 'IP55', 'IP56', 'IP65', 'IP66'];
const DEFAULT_INSULATION_CLASSES: MotorClass[] = ['None', 'B', 'F', 'H'];
const DEFAULT_EFFICIENCY_CLASSES: MotorEfficiencyClass[] = ['None', 'IE1', 'IE2', 'IE3', 'IE4'];
const FIRE_RATINGS: MotorFireRating[] = ['', 'F300', 'F400'];
const FREQUENCIES = [50, 60];
const DEFAULT_VOLTAGES = [220, 380, 400, 415, 440, 480, 690];
const MOTOR_PHASES = [1, 3]; // 1-phase, 3-phase

export function MotorDetailsEditor() {
  const { data: motorBrands = [], isLoading: loadingBrands } = useMotorBrands();
  const { data: motorSpecs = [], isLoading: loadingSpecs } = useMotorSpecifications();
  const { data: fanSeries = [] } = useFanSeries();
  const { data: fanModels = [] } = useFanModels();
  
  const addBrand = useAddMotorBrand();
  const deleteBrand = useDeleteMotorBrand();
  const addSpec = useAddMotorSpecification();
  const updateSpec = useUpdateMotorSpecification();
  const deleteSpec = useDeleteMotorSpecification();

  // Brand management state
  const [newBrandName, setNewBrandName] = useState('');
  const [editingBrandId, setEditingBrandId] = useState<string | null>(null);
  const [editBrandName, setEditBrandName] = useState('');

  // Specification management state
  const [showAddSpec, setShowAddSpec] = useState(false);
  const [editingSpecId, setEditingSpecId] = useState<string | null>(null);
  const [specForm, setSpecForm] = useState<Partial<MotorSpecification> & { isDualSpeed?: boolean; secondaryPoles?: number; secondaryRatingKW?: number; secondaryRPM?: number; seriesIds?: string[]; modelIds?: string[]; phase?: number }>({
    brandId: '',
    motorPoles: 4,
    ratingKW: 0.37,
    motorFrame: '',
    motorWeight: 0,
    fullLoadCurrent: 0,
    ratedCurrent: 0,
    startingCurrent: 0,
    voltage: 415,
    frequency: 50,
    ipRating: 'IP55',
    insulationClass: 'F',
    efficiencyClass: 'IE2',
    rpm: 1440,
    fireRating: '',
    atexRating: '',
    isDualSpeed: false,
    secondaryPoles: undefined,
    secondaryRatingKW: undefined,
    secondaryRPM: undefined,
    seriesIds: [],
    modelIds: [],
    phase: 3, // Default to 3-phase
  });

  // Get models filtered by selected series (supports multiple series)
  const filteredModelsForForm = useMemo(() => {
    const seriesIds = specForm.seriesIds || [];
    if (seriesIds.length === 0) return [];
    return fanModels.filter(m => seriesIds.includes(m.seriesId));
  }, [fanModels, specForm.seriesIds]);

  const toggleSeriesLock = (seriesId: string) => {
    setSpecForm(prev => {
      const current = prev.seriesIds || [];
      const next = current.includes(seriesId)
        ? current.filter(id => id !== seriesId)
        : [...current, seriesId];
      // Drop models that no longer belong to a selected series
      const allowedModelIds = fanModels.filter(m => next.includes(m.seriesId)).map(m => m.id);
      return {
        ...prev,
        seriesIds: next,
        modelIds: (prev.modelIds || []).filter(id => allowedModelIds.includes(id)),
      };
    });
  };

  const toggleModelLock = (modelId: string) => {
    setSpecForm(prev => {
      const current = prev.modelIds || [];
      return {
        ...prev,
        modelIds: current.includes(modelId) ? current.filter(id => id !== modelId) : [...current, modelId],
      };
    });
  };


  // Filter state
  const [filterBrand, setFilterBrand] = useState<string>('all');
  const [filterPoles, setFilterPoles] = useState<string>('all');
  
  // Custom options state (for adding new options dynamically)
  const [customIpRating, setCustomIpRating] = useState('');
  const [customInsulationClass, setCustomInsulationClass] = useState('');
  const [customEfficiencyClass, setCustomEfficiencyClass] = useState('');
  const [customVoltage, setCustomVoltage] = useState('');
  
  // String input states for decimal number handling
  const [ratingKWInput, setRatingKWInput] = useState('0.37');
  const [secondaryRatingKWInput, setSecondaryRatingKWInput] = useState('');
  
  // Build options lists including values from existing specs
  const existingIpRatings = [...new Set(motorSpecs.map(s => s.ipRating).filter(Boolean))];
  const existingInsulationClasses = [...new Set(motorSpecs.map(s => s.insulationClass).filter(Boolean))];
  const existingEfficiencyClasses = [...new Set(motorSpecs.map(s => s.efficiencyClass).filter(Boolean))];
  const existingVoltages = [...new Set(motorSpecs.map(s => s.voltage).filter(Boolean))];
  
  const IP_RATINGS = [...new Set([...DEFAULT_IP_RATINGS, ...existingIpRatings])].sort();
  const INSULATION_CLASSES = [...new Set([...DEFAULT_INSULATION_CLASSES, ...existingInsulationClasses as MotorClass[]])];
  const EFFICIENCY_CLASSES = [...new Set([...DEFAULT_EFFICIENCY_CLASSES, ...existingEfficiencyClasses as MotorEfficiencyClass[]])];
  const VOLTAGES = [...new Set([...DEFAULT_VOLTAGES, ...existingVoltages as number[]])].sort((a, b) => a - b);

  const handleAddBrand = () => {
    if (!newBrandName.trim()) {
      toast.error('Brand name is required');
      return;
    }
    addBrand.mutate(newBrandName.trim());
    setNewBrandName('');
  };

  const handleDeleteBrand = (brandId: string) => {
    const specsWithBrand = motorSpecs.filter(s => s.brandId === brandId);
    if (specsWithBrand.length > 0) {
      toast.error(`Cannot delete brand with ${specsWithBrand.length} motor specifications`);
      return;
    }
    if (confirm('Are you sure you want to delete this brand?')) {
      deleteBrand.mutate(brandId);
    }
  };

  const handleAddSpecification = () => {
    if (!specForm.brandId) {
      toast.error('Please select a brand');
      return;
    }
    if (!specForm.ratingKW || specForm.ratingKW <= 0) {
      toast.error('Please enter a valid motor rating');
      return;
    }
    
    addSpec.mutate(specForm as Omit<MotorSpecification, 'id'>);
    setShowAddSpec(false);
    resetSpecForm();
  };

  const handleUpdateSpecification = () => {
    if (!editingSpecId) return;
    updateSpec.mutate({ id: editingSpecId, updates: specForm });
    setEditingSpecId(null);
    resetSpecForm();
  };

  const handleDeleteSpecification = (specId: string) => {
    if (confirm('Are you sure you want to delete this motor specification?')) {
      deleteSpec.mutate(specId);
    }
  };

  const resetSpecForm = () => {
    setSpecForm({
      brandId: '',
      motorPoles: 4,
      ratingKW: 0.37,
      motorFrame: '',
      motorWeight: 0,
      fullLoadCurrent: 0,
      ratedCurrent: 0,
      startingCurrent: 0,
      voltage: 415,
      frequency: 50,
      ipRating: 'IP55',
      insulationClass: 'F',
      efficiencyClass: 'IE2',
      rpm: 1440,
      fireRating: '',
      atexRating: '',
      isDualSpeed: false,
      secondaryPoles: undefined,
      secondaryRatingKW: undefined,
      secondaryRPM: undefined,
      seriesIds: [],
      modelIds: [],
    });
    setRatingKWInput('0.37');
    setSecondaryRatingKWInput('');
  };

  const startEditSpec = (spec: MotorSpecification & { brandName?: string; is_dual_speed?: boolean; secondary_poles?: number; secondary_rating_kw?: number; secondary_rpm?: number; series_id?: string | null; model_id?: string | null; series_ids?: string[]; model_ids?: string[]; phase?: number }) => {
    setEditingSpecId(spec.id);
    setSpecForm({ 
      ...spec,
      isDualSpeed: spec.is_dual_speed || false,
      secondaryPoles: spec.secondary_poles || undefined,
      secondaryRatingKW: spec.secondary_rating_kw || undefined,
      secondaryRPM: spec.secondary_rpm || undefined,
      seriesIds: spec.series_ids?.length ? spec.series_ids : (spec.series_id ? [spec.series_id] : []),
      modelIds: spec.model_ids?.length ? spec.model_ids : (spec.model_id ? [spec.model_id] : []),
      phase: spec.phase || 3,
    });
    setRatingKWInput(spec.ratingKW?.toString() || '');
    setSecondaryRatingKWInput(spec.secondary_rating_kw?.toString() || '');
    setShowAddSpec(false);
  };

  const filteredSpecs = motorSpecs.filter(spec => {
    if (filterBrand !== 'all' && spec.brandId !== filterBrand) return false;
    if (filterPoles !== 'all' && spec.motorPoles !== parseInt(filterPoles)) return false;
    return true;
  });

  const getBrandName = (brandId: string) => {
    return motorBrands.find(b => b.id === brandId)?.name || brandId;
  };

  if (loadingBrands || loadingSpecs) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Tabs defaultValue="specifications" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="specifications">Motor Specifications</TabsTrigger>
          <TabsTrigger value="brands">Motor Brands</TabsTrigger>
        </TabsList>

        <TabsContent value="specifications" className="space-y-4">
          {/* Filters */}
          <div className="flex flex-wrap items-center gap-3 md:gap-4 p-4 bg-muted/30 rounded-lg">
            <div className="flex items-center gap-2">
              <Label className="text-sm text-muted-foreground">Brand:</Label>
              <Select value={filterBrand} onValueChange={setFilterBrand}>
                <SelectTrigger className="w-[130px] sm:w-[150px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Brands</SelectItem>
                  {motorBrands.map(b => (
                    <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Label className="text-sm text-muted-foreground">Poles:</Label>
              <Select value={filterPoles} onValueChange={setFilterPoles}>
                <SelectTrigger className="w-[120px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Poles</SelectItem>
                  {MOTOR_POLES.map(p => (
                    <SelectItem key={p} value={p.toString()}>{p} Pole</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="hidden md:block flex-1" />
            <MotorExcelImportExport />
            <Button onClick={() => { setShowAddSpec(true); setEditingSpecId(null); resetSpecForm(); }}>
              <Plus className="w-4 h-4" />
              Add Motor
            </Button>
          </div>

          {/* Add/Edit Form */}
          {(showAddSpec || editingSpecId) && (
            <div className="p-6 bg-muted/50 rounded-lg border animate-fade-in space-y-6">
              <h3 className="font-semibold text-lg text-foreground">
                {editingSpecId ? 'Edit Motor Specification' : 'Add New Motor Specification'}
              </h3>
              
              {/* Section 1: Basic Info */}
              <div className="space-y-3">
                <h4 className="text-sm font-medium text-muted-foreground border-b pb-2">Basic Information</h4>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <Label className="text-xs text-muted-foreground">Brand *</Label>
                    <Select 
                      value={specForm.brandId} 
                      onValueChange={(v) => setSpecForm(prev => ({ ...prev, brandId: v }))}
                    >
                      <SelectTrigger className="mt-1">
                        <SelectValue placeholder="Select Brand" />
                      </SelectTrigger>
                      <SelectContent>
                        {motorBrands.map(b => (
                          <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Motor Poles *</Label>
                    <Select 
                      value={specForm.isDualSpeed ? `${specForm.motorPoles}/${specForm.secondaryPoles}` : specForm.motorPoles?.toString()} 
                      onValueChange={(v) => {
                        // Check if it's a dual-speed option
                        const dualOption = DUAL_SPEED_POLE_OPTIONS.find(opt => opt.id === v);
                        if (dualOption) {
                          setSpecForm(prev => ({ 
                            ...prev, 
                            motorPoles: dualOption.poles[0],
                            isDualSpeed: true,
                            secondaryPoles: dualOption.poles[1]
                          }));
                        } else {
                          setSpecForm(prev => ({ 
                            ...prev, 
                            motorPoles: parseInt(v),
                            isDualSpeed: false,
                            secondaryPoles: undefined
                          }));
                        }
                      }}
                    >
                      <SelectTrigger className="mt-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {MOTOR_POLES.map(p => (
                          <SelectItem key={p} value={p.toString()}>{p} Pole</SelectItem>
                        ))}
                        <SelectItem value="dual-sep" disabled className="text-xs text-muted-foreground font-medium">— Dual Speed —</SelectItem>
                        {DUAL_SPEED_POLE_OPTIONS.map(opt => (
                          <SelectItem key={opt.id} value={opt.id}>{opt.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">
                      {specForm.isDualSpeed ? 'High Speed kW *' : 'Rating (kW) *'}
                    </Label>
                    <Input
                      type="text"
                      inputMode="decimal"
                      value={ratingKWInput}
                      onChange={(e) => {
                        const val = e.target.value;
                        // Allow empty, numbers, and decimal point
                        if (val === '' || /^[0-9]*\.?[0-9]*$/.test(val)) {
                          setRatingKWInput(val);
                          const num = parseFloat(val);
                          if (!isNaN(num)) {
                            setSpecForm(prev => ({ ...prev, ratingKW: num }));
                          }
                        }
                      }}
                      onBlur={() => {
                        const num = parseFloat(ratingKWInput);
                        if (!isNaN(num) && num > 0) {
                          setRatingKWInput(num.toString());
                        }
                      }}
                      className="mt-1"
                      placeholder={specForm.isDualSpeed ? 'e.g., 9' : 'e.g., 0.37'}
                    />
                  </div>
                  {specForm.isDualSpeed && (
                    <div>
                      <Label className="text-xs text-muted-foreground">Low Speed kW *</Label>
                      <Input
                        type="text"
                        inputMode="decimal"
                        value={secondaryRatingKWInput}
                        onChange={(e) => {
                          const val = e.target.value;
                          if (val === '' || /^[0-9]*\.?[0-9]*$/.test(val)) {
                            setSecondaryRatingKWInput(val);
                            const num = parseFloat(val);
                            if (!isNaN(num)) {
                              setSpecForm(prev => ({ ...prev, secondaryRatingKW: num }));
                            }
                          }
                        }}
                        onBlur={() => {
                          const num = parseFloat(secondaryRatingKWInput);
                          if (!isNaN(num) && num > 0) {
                            setSecondaryRatingKWInput(num.toString());
                          }
                        }}
                        className="mt-1"
                        placeholder="e.g., 2.2"
                      />
                    </div>
                  )}
                  <div>
                    <Label className="text-xs text-muted-foreground">Motor Frame</Label>
                    <Input
                      value={specForm.motorFrame || ''}
                      onChange={(e) => setSpecForm(prev => ({ ...prev, motorFrame: e.target.value }))}
                      placeholder="e.g., 90L, 112M"
                      className="mt-1"
                    />
                  </div>
                </div>
              </div>

              {/* Section 2: Electrical Characteristics */}
              <div className="space-y-3">
                <h4 className="text-sm font-medium text-muted-foreground border-b pb-2">Electrical Characteristics</h4>
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
                  <div>
                    <Label className="text-xs text-muted-foreground">Voltage (V)</Label>
                    <div className="flex gap-1 mt-1">
                      <Select 
                        value={specForm.voltage?.toString()} 
                        onValueChange={(v) => {
                          if (v === '__custom__') return;
                          setSpecForm(prev => ({ ...prev, voltage: parseInt(v) }));
                        }}
                      >
                        <SelectTrigger className="flex-1">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {VOLTAGES.map(v => (
                            <SelectItem key={v} value={v.toString()}>{v}V</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Input
                        type="number"
                        placeholder="Custom"
                        value={customVoltage}
                        onChange={(e) => setCustomVoltage(e.target.value)}
                        onBlur={() => {
                          const v = parseInt(customVoltage);
                          if (v > 0) {
                            setSpecForm(prev => ({ ...prev, voltage: v }));
                            setCustomVoltage('');
                          }
                        }}
                        className="w-16"
                      />
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Phase</Label>
                    <Select 
                      value={specForm.phase?.toString() || '3'} 
                      onValueChange={(v) => {
                        const phase = parseInt(v);
                        setSpecForm(prev => ({ 
                          ...prev, 
                          phase,
                          // Auto-adjust voltage based on phase
                          voltage: phase === 1 ? 220 : (prev.voltage || 415)
                        }));
                      }}
                    >
                      <SelectTrigger className="mt-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {MOTOR_PHASES.map(p => (
                          <SelectItem key={p} value={p.toString()}>{p}-Phase</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Frequency (Hz)</Label>
                    <Select 
                      value={specForm.frequency?.toString()} 
                      onValueChange={(v) => setSpecForm(prev => ({ ...prev, frequency: parseInt(v) }))}
                    >
                      <SelectTrigger className="mt-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {FREQUENCIES.map(f => (
                          <SelectItem key={f} value={f.toString()}>{f}Hz</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">
                      {specForm.isDualSpeed ? 'High Speed RPM' : 'RPM'}
                    </Label>
                    <Input
                      type="number"
                      min="100"
                      max="10000"
                      value={specForm.rpm || ''}
                      onChange={(e) => setSpecForm(prev => ({ ...prev, rpm: parseInt(e.target.value) || 0 }))}
                      className="mt-1"
                      placeholder={specForm.isDualSpeed ? 'e.g., 1440' : ''}
                    />
                  </div>
                  {specForm.isDualSpeed && (
                    <div>
                      <Label className="text-xs text-muted-foreground">Low Speed RPM</Label>
                      <Input
                        type="number"
                        min="100"
                        max="10000"
                        value={specForm.secondaryRPM || ''}
                        onChange={(e) => setSpecForm(prev => ({ ...prev, secondaryRPM: parseInt(e.target.value) || 0 }))}
                        className="mt-1"
                        placeholder="e.g., 960"
                      />
                    </div>
                  )}
                  <div>
                    <Label className="text-xs text-muted-foreground">Full Load Current (A)</Label>
                    <DecimalInput
                      value={specForm.fullLoadCurrent}
                      onValueChange={(num) => setSpecForm(prev => ({ ...prev, fullLoadCurrent: num }))}
                      className="mt-1"
                      placeholder="e.g., 0.05"
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Rated Current (A)</Label>
                    <DecimalInput
                      value={specForm.ratedCurrent}
                      onValueChange={(num) => setSpecForm(prev => ({ ...prev, ratedCurrent: num }))}
                      className="mt-1"
                      placeholder="e.g., 0.05"
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Starting Current (A)</Label>
                    <DecimalInput
                      value={specForm.startingCurrent}
                      onValueChange={(num) => setSpecForm(prev => ({ ...prev, startingCurrent: num }))}
                      className="mt-1"
                      placeholder="e.g., 0.35"
                    />
                  </div>

                </div>
              </div>

              {/* Section 3: Classification & Ratings */}
              <div className="space-y-3">
                <h4 className="text-sm font-medium text-muted-foreground border-b pb-2">Classification & Ratings</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                  <div>
                    <Label className="text-xs text-muted-foreground">IP Rating</Label>
                    <Select 
                      value={specForm.ipRating} 
                      onValueChange={(v) => setSpecForm(prev => ({ ...prev, ipRating: v }))}
                    >
                      <SelectTrigger className="mt-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {IP_RATINGS.map(ip => (
                          <SelectItem key={ip} value={ip}>{ip}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Insulation Class</Label>
                    <Select 
                      value={specForm.insulationClass} 
                      onValueChange={(v) => setSpecForm(prev => ({ ...prev, insulationClass: v as MotorClass }))}
                    >
                      <SelectTrigger className="mt-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {INSULATION_CLASSES.map(ic => (
                          <SelectItem key={ic} value={ic}>Class {ic}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Efficiency Class</Label>
                    <Select 
                      value={specForm.efficiencyClass} 
                      onValueChange={(v) => setSpecForm(prev => ({ ...prev, efficiencyClass: v as MotorEfficiencyClass }))}
                    >
                      <SelectTrigger className="mt-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {EFFICIENCY_CLASSES.map(ec => (
                          <SelectItem key={ec} value={ec}>{ec}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Motor Weight (kg)</Label>
                    <DecimalInput
                      value={specForm.motorWeight}
                      onValueChange={(num) => setSpecForm(prev => ({ ...prev, motorWeight: num }))}
                      className="mt-1"
                      placeholder="e.g., 0.5"
                    />

                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <Label className="text-xs text-muted-foreground">Fire Rating</Label>
                    <Select 
                      value={specForm.fireRating || 'none'} 
                      onValueChange={(v) => setSpecForm(prev => ({ ...prev, fireRating: (v === 'none' ? '' : v) as MotorFireRating }))}
                    >
                      <SelectTrigger className="mt-1">
                        <SelectValue placeholder="None" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        <SelectItem value="F250">F250</SelectItem>
                        <SelectItem value="F300">F300</SelectItem>
                        <SelectItem value="F400">F400</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">ATEX Rating</Label>
                    <Select 
                      value={specForm.atexRating || 'none'} 
                      onValueChange={(v) => setSpecForm(prev => ({ ...prev, atexRating: (v === 'none' ? '' : v) as MotorAtexRating }))}
                    >
                      <SelectTrigger className="mt-1">
                        <SelectValue placeholder="None" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        {ATEX_RATINGS.filter(r => r !== '').map(rating => (
                          <SelectItem key={rating} value={rating}>{rating}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              {/* Section 4: Model Locking (Optional) */}
              <div className="space-y-3">
                <h4 className="text-sm font-medium text-muted-foreground border-b pb-2 flex items-center gap-2">
                  {(specForm.seriesIds?.length || specForm.modelIds?.length) ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4" />}
                  Model Locking (Optional)
                </h4>
                <p className="text-xs text-muted-foreground mb-2">
                  Select one or more series and models to lock this motor to. Leave empty for universal availability.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <Label className="text-xs text-muted-foreground">Lock to Series (multi-select)</Label>
                    <div className="mt-1 border rounded-md p-2 max-h-48 overflow-auto space-y-1 bg-background">
                      {fanSeries.length === 0 && (
                        <p className="text-xs text-muted-foreground p-1">No series available</p>
                      )}
                      {fanSeries.map(s => (
                        <label key={s.id} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-muted/50 rounded px-1 py-0.5">
                          <Checkbox
                            checked={(specForm.seriesIds || []).includes(s.id)}
                            onCheckedChange={() => toggleSeriesLock(s.id)}
                          />
                          <span>{s.name}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Lock to Models (multi-select)</Label>
                    <div className="mt-1 border rounded-md p-2 max-h-48 overflow-auto space-y-1 bg-background">
                      {!specForm.seriesIds?.length ? (
                        <p className="text-xs text-muted-foreground p-1">Select series first</p>
                      ) : filteredModelsForForm.length === 0 ? (
                        <p className="text-xs text-muted-foreground p-1">No models in selected series</p>
                      ) : (
                        filteredModelsForForm.map(m => (
                          <label key={m.id} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-muted/50 rounded px-1 py-0.5">
                            <Checkbox
                              checked={(specForm.modelIds || []).includes(m.id)}
                              onCheckedChange={() => toggleModelLock(m.id)}
                            />
                            <span>{m.modelName || `${m.diameter}mm`}</span>
                          </label>
                        ))
                      )}
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-1">Leave models unchecked to allow all models in the selected series.</p>
                  </div>
                </div>
                {(specForm.seriesIds?.length || specForm.modelIds?.length) ? (
                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    {(specForm.seriesIds || []).map(id => (
                      <Badge key={id} variant="secondary" className="flex items-center gap-1">
                        <Lock className="w-3 h-3" />
                        {fanSeries.find(s => s.id === id)?.name || id}
                      </Badge>
                    ))}
                    {(specForm.modelIds || []).map(id => {
                      const m = fanModels.find(fm => fm.id === id);
                      return (
                        <Badge key={id} variant="outline" className="flex items-center gap-1">
                          {m?.modelName || `${m?.diameter || ''}mm`}
                        </Badge>
                      );
                    })}
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      onClick={() => setSpecForm(prev => ({ ...prev, seriesIds: [], modelIds: [] }))}
                    >
                      <Unlock className="w-3 h-3 mr-1" />
                      Clear Lock
                    </Button>
                  </div>
                ) : null}
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2 mt-4">
                {editingSpecId ? (
                  <Button onClick={handleUpdateSpecification} disabled={updateSpec.isPending}>
                    {updateSpec.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    Save Changes
                  </Button>
                ) : (
                  <Button onClick={handleAddSpecification} disabled={addSpec.isPending}>
                    {addSpec.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                    Add Motor
                  </Button>
                )}
                <Button variant="ghost" onClick={() => { setShowAddSpec(false); setEditingSpecId(null); resetSpecForm(); }}>
                  <X className="w-4 h-4" />
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {/* Specifications Table */}
          <div className="border rounded-lg overflow-hidden">
            <div className="max-h-[500px] overflow-auto">
              <Table>
                <TableHeader className="sticky top-0 bg-card z-10">
                  <TableRow>
                    <TableHead>Brand</TableHead>
                    <TableHead>Poles</TableHead>
                    <TableHead>Rating</TableHead>
                    <TableHead>Frame</TableHead>
                    <TableHead>RPM</TableHead>
                    <TableHead>FLC (A)</TableHead>
                    <TableHead>Efficiency</TableHead>
                    <TableHead>Fire</TableHead>
                    <TableHead>Lock</TableHead>
                    <TableHead className="w-[100px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredSpecs.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={10} className="text-center py-8 text-muted-foreground">
                        <Zap className="w-8 h-8 mx-auto mb-2 opacity-30" />
                        <p>No motor specifications found</p>
                        <p className="text-xs mt-1">Add motor brands first, then add motor specifications</p>
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredSpecs.map(spec => (
                      <TableRow key={spec.id}>
                        <TableCell className="font-medium">{(spec as any).brandName || getBrandName(spec.brandId)}</TableCell>
                        <TableCell>
                          {(spec as any).is_dual_speed 
                            ? `${spec.motorPoles}/${(spec as any).secondary_poles}P` 
                            : `${spec.motorPoles}P`
                          }
                        </TableCell>
                        <TableCell>
                          {(spec as any).is_dual_speed 
                            ? `${spec.ratingKW}/${(spec as any).secondary_rating_kw}kW` 
                            : `${spec.ratingKW}kW`
                          }
                        </TableCell>
                        <TableCell>{spec.motorFrame || '-'}</TableCell>
                        <TableCell>
                          {(spec as any).is_dual_speed && (spec as any).secondary_rpm
                            ? `${spec.rpm}/${(spec as any).secondary_rpm}` 
                            : spec.rpm
                          }
                        </TableCell>
                        <TableCell>{spec.fullLoadCurrent}A</TableCell>
                        <TableCell>{spec.efficiencyClass}</TableCell>
                        <TableCell>{spec.fireRating || '-'}</TableCell>
                        <TableCell>
                          {(() => {
                            const sIds: string[] = (spec as any).series_ids?.length
                              ? (spec as any).series_ids
                              : ((spec as any).series_id ? [(spec as any).series_id] : []);
                            const mIds: string[] = (spec as any).model_ids?.length
                              ? (spec as any).model_ids
                              : ((spec as any).model_id ? [(spec as any).model_id] : []);
                            if (!sIds.length && !mIds.length) {
                              return <span className="text-muted-foreground text-xs">Universal</span>;
                            }
                            return (
                              <div className="flex flex-wrap gap-1 max-w-[220px]">
                                {sIds.map(id => (
                                  <Badge key={id} variant="secondary" className="text-xs flex items-center gap-1 w-fit">
                                    <Lock className="w-3 h-3" />
                                    {fanSeries.find(s => s.id === id)?.name || ''}
                                  </Badge>
                                ))}
                                {mIds.map(id => {
                                  const m = fanModels.find(fm => fm.id === id);
                                  return (
                                    <Badge key={id} variant="outline" className="text-xs w-fit">
                                      {m?.modelName || `${m?.diameter || ''}mm`}
                                    </Badge>
                                  );
                                })}
                              </div>
                            );
                          })()}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Button variant="ghost" size="sm" onClick={() => startEditSpec(spec)}>
                              <Edit2 className="w-3 h-3" />
                            </Button>
                            <Button variant="ghost" size="sm" className="text-destructive" onClick={() => handleDeleteSpecification(spec.id)}>
                              <Trash2 className="w-3 h-3" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="brands" className="space-y-4">
          {/* Add new brand */}
          <div className="flex items-end gap-3 p-4 bg-muted/30 rounded-lg">
            <div className="flex-1">
              <Label className="text-sm text-muted-foreground">Brand Name</Label>
              <Input
                value={newBrandName}
                onChange={(e) => setNewBrandName(e.target.value)}
                placeholder="e.g., Siemens, ABB, WEG"
                className="mt-1"
              />
            </div>
            <Button onClick={handleAddBrand} disabled={addBrand.isPending}>
              {addBrand.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Add Brand
            </Button>
          </div>

          {/* Brands List */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {motorBrands.length === 0 ? (
              <div className="col-span-full text-center py-8 text-muted-foreground">
                <Zap className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p>No motor brands defined</p>
                <p className="text-xs mt-1">Add brands to organize your motor specifications</p>
              </div>
            ) : (
              motorBrands.map(brand => {
                const specCount = motorSpecs.filter(s => s.brandId === brand.id).length;
                return (
                  <div key={brand.id} className="p-4 bg-card border rounded-lg flex items-center justify-between">
                    <div>
                      <p className="font-medium text-foreground">{brand.name}</p>
                      <p className="text-xs text-muted-foreground">{specCount} motors</p>
                    </div>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="text-destructive"
                      onClick={() => handleDeleteBrand(brand.id)}
                      disabled={specCount > 0}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                );
              })
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
