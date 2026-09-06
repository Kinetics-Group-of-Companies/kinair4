import { useEffect, useMemo, useRef, useState } from 'react';
import { DoorOpen, Search, Loader2, LogIn, Gauge, Wind, FileDown } from 'lucide-react';
import { AssistantLauncher } from '@/components/ai/AssistantLauncher';
import { AIR_CURTAIN_SUGGESTIONS } from '@/components/ai/AssistantChat';
import { MainLayout } from '@/components/layout/MainLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAuth } from '@/lib/authContext';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  useAirCurtainModels,
  useAirCurtainBrands,
  useAirCurtainSeries,
  useAirCurtainDimensions,
} from '@/hooks/useAirCurtains';
import { useTenantData } from '@/hooks/useFanDatabase';
import { downloadAirCurtainDatasheet } from '@/lib/airCurtainDatasheet';
import { StreamRangeChart, type StreamSpeed } from '@/components/aircurtain/StreamRangeChart';


import {
  selectAirCurtains,
  CATEGORY_LABELS,
  
  effectiveThrow,
  jetVelocityAt,
  slotWidthOf,

  type AirCurtainSelection,
  type AirCurtainCategory,
  type AirCurtainSpeed,
  type AirCurtainMotorType,
} from '@/lib/airCurtainData';
import { toast } from 'sonner';

type LengthUnit = 'mm' | 'cm' | 'm' | 'in';
type AirflowUnit = 'cmh' | 'cfm' | 'ls';

const LENGTH_TO_MM: Record<LengthUnit, number> = { mm: 1, cm: 10, m: 1000, in: 25.4 };
const toMm = (value: number, unit: LengthUnit): number => value * LENGTH_TO_MM[unit];
const toCmh = (value: number, unit: AirflowUnit): number =>
  unit === 'cfm' ? value * 1.6990107955 : unit === 'ls' ? value * 3.6 : value;
const LENGTH_UNIT_LABELS: Record<LengthUnit, string> = { mm: 'mm', cm: 'cm', m: 'm', in: 'inch' };
const AIRFLOW_UNIT_LABELS: Record<AirflowUnit, string> = { cmh: 'm³/h', cfm: 'CFM', ls: 'l/s' };
const fromCmh = (cmh: number, unit: AirflowUnit): number =>
  unit === 'cfm' ? cmh / 1.6990107955 : unit === 'ls' ? cmh / 3.6 : cmh;
const formatAirflow = (cmh: number, unit: AirflowUnit): string => {
  const v = fromCmh(cmh, unit);
  return `${v >= 100 ? Math.round(v) : Math.round(v * 10) / 10} ${AIRFLOW_UNIT_LABELS[unit]}`;
};
const fromMm = (mm: number, unit: LengthUnit): number => mm / LENGTH_TO_MM[unit];
const roundSmart = (v: number): number =>
  Math.abs(v) >= 100 ? Math.round(v) : Math.round(v * 100) / 100;
/** Format a millimetre value in the unit picked in the selector. */
const formatLengthMm = (mm: number, unit: LengthUnit): string =>
  `${roundSmart(fromMm(mm, unit))} ${LENGTH_UNIT_LABELS[unit]}`;
/** Format a metre value in the unit picked for the door height. */
const formatLengthM = (m: number, unit: LengthUnit): string =>
  `${roundSmart(fromMm(m * 1000, unit))} ${LENGTH_UNIT_LABELS[unit]}`;

export default function AirCurtainSelectorPage() {
  const { isAuthenticated, isApproved, isSuperAdmin, isLoading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { data: models = [], isLoading } = useAirCurtainModels();
  const { data: brandRecords = [] } = useAirCurtainBrands();
  const { data: seriesRecords = [] } = useAirCurtainSeries();
  const { data: dimensionRecords = [] } = useAirCurtainDimensions();
  const { data: tenant } = useTenantData();


  const [doorWidth, setDoorWidth] = useState('1200');
  const [doorHeight, setDoorHeight] = useState('3');
  const [category, setCategory] = useState<AirCurtainCategory | 'any'>('any');
  const [speed, setSpeed] = useState<AirCurtainSpeed>('high');
  const [minNozzleVelocity, setMinNozzleVelocity] = useState('0');
  const [minAirflow, setMinAirflow] = useState('0');
  const [motorType, setMotorType] = useState<AirCurtainMotorType | 'any'>('any');
  const [brand, setBrand] = useState<string>('any');
  const [minFloorVelocity, setMinFloorVelocity] = useState('2');
  const [noiseMode, setNoiseMode] = useState<'dba' | 'octave'>('dba');
  const [seriesId, setSeriesId] = useState<string>('any');
  const [allowCombinations, setAllowCombinations] = useState(true);
  const [supplyFrequency, setSupplyFrequency] = useState('50');
  const [downloading, setDownloading] = useState(false);
  const [minMatch, setMinMatch] = useState(95);
  const [maxMatch, setMaxMatch] = useState(110);
  const [widthUnit, setWidthUnit] = useState<LengthUnit>('mm');
  const [heightUnit, setHeightUnit] = useState<LengthUnit>('m');
  const [airflowUnit, setAirflowUnit] = useState<AirflowUnit>('cmh');
  const [selectionBasis, setSelectionBasis] = useState<'door' | 'airflow'>('door');

  const doorWidthMm = toMm(parseFloat(doorWidth) || 0, widthUnit);
  const doorHeightM = toMm(parseFloat(doorHeight) || 0, heightUnit) / 1000;
  const requiredAirflowCmh = toCmh(parseFloat(minAirflow) || 0, airflowUnit);

  const [results, setResults] = useState<AirCurtainSelection[]>([]);
  const [selected, setSelected] = useState<AirCurtainSelection | null>(null);
  const [hasSearched, setHasSearched] = useState(false);

  const handleSearch = () => {
    const width = doorWidthMm;
    const height = doorHeightM;
    if (selectionBasis === 'door' && (!width || width <= 0)) return toast.error('Enter a valid door width');
    if (!height || height <= 0) return toast.error('Enter a valid door height');
    if (selectionBasis === 'airflow' && requiredAirflowCmh <= 0)
      return toast.error('Enter the required airflow to select by airflow');

    const found = selectAirCurtains(models, {
      doorWidthMm: width,
      doorHeightM: height,
      category,
      speed,
      minNozzleVelocity: Math.max(0, parseFloat(minNozzleVelocity) || 0),
      minAirflowCmh: Math.max(0, requiredAirflowCmh),
      motorType,
      brand,
      seriesId,
      allowCombinations,
      minFloorVelocity: Math.max(0, parseFloat(minFloorVelocity) || 0),
      supplyFrequencyHz: Math.max(0, parseFloat(supplyFrequency) || 0),
      minMatchPercent: minMatch,
      maxMatchPercent: maxMatch,
      selectionBasis,
    });

    setResults(found);
    setSelected(found[0] || null);
    setHasSearched(true);
    if (found.length === 0) {
      toast.info('No air curtain matches. Try a lower floor velocity or a different mounting type.');
    } else {
      toast.success(`Found ${found.length} suitable air curtain${found.length > 1 ? 's' : ''}`);
    }
  };

  // Deep-link from the AI assistant: /air-curtain?model=<model name> auto-selects that model.
  const [searchParams] = useSearchParams();
  const deepLinkRanRef = useRef(false);
  useEffect(() => {
    if (deepLinkRanRef.current || isLoading || models.length === 0) return;
    const modelParam = searchParams.get('model');
    if (!modelParam) return;
    deepLinkRanRef.current = true;
    const target = models.find(
      (m) => m.model.toLowerCase() === modelParam.toLowerCase(),
    ) ?? models.find((m) => m.model.toLowerCase().includes(modelParam.toLowerCase()));
    if (!target) return;
    const heightM =
      target.mountingHeightMax != null && target.mountingHeightMax > 0
        ? target.mountingHeightMax
        : 3;
    const widthMm = target.lengthMm && target.lengthMm > 0 ? target.lengthMm : 1200;
    setDoorWidth(String(widthMm));
    setDoorHeight(String(heightM));
    const found = selectAirCurtains(models, {
      doorWidthMm: widthMm,
      doorHeightM: heightM,
      category: 'any',
      speed: 'high',
      minNozzleVelocity: 0,
      minAirflowCmh: 0,
      motorType: 'any',
      brand: 'any',
      seriesId: 'any',
      allowCombinations: true,
      minFloorVelocity: 2,
      supplyFrequencyHz: 50,
      minMatchPercent: 0,
      maxMatchPercent: 400,
      selectionBasis: 'door',
    });
    const match =
      found.find((r) => r.model.model.toLowerCase() === target.model.toLowerCase()) ??
      found.find((r) => r.units.some((u) => u.model.model.toLowerCase() === target.model.toLowerCase()));
    setResults(match ? [match] : found.slice(0, 6));
    setSelected(match ?? found[0] ?? null);
    setHasSearched(true);
    if (match) {
      toast.success(`${target.model} loaded — adjust the door size to check coverage.`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, models, searchParams]);

  const brands = useMemo(() => {
    const set = new Set<string>();
    brandRecords.forEach((b) => set.add(b.name));
    models.forEach((m) => m.brand && set.add(m.brand));
    return Array.from(set).sort();
  }, [models, brandRecords]);

  const seriesOptions = useMemo(
    () =>
      seriesRecords.filter((s) => {
        if (brand !== 'any') {
          const b = brandRecords.find((x) => x.id === s.brandId);
          if (b && b.name !== brand) return false;
        }
        if (category !== 'any' && s.category !== category) return false;
        return true;
      }),
    [seriesRecords, brandRecords, brand, category],
  );

  const handleDatasheet = async () => {
    if (!selected) return;
    setDownloading(true);
    try {
      const seriesInfo = seriesRecords.find((s) => s.id === selected.model.seriesId) ?? null;
      const brandInfo =
        brandRecords.find((b) => b.id === (selected.model.brandId ?? seriesInfo?.brandId)) ??
        brandRecords.find((b) => b.name === selected.model.brand) ??
        null;
      await downloadAirCurtainDatasheet({
        selection: selected,
        doorWidthMm,
        doorHeightM,
        minFloorVelocity: parseFloat(minFloorVelocity) || 0,
        brandInfo,
        seriesInfo,
        dimensions: dimensionRecords.filter(
          (d) =>
            (seriesInfo && d.seriesId === seriesInfo.id) ||
            selected.units.some((u) => u.model.id === d.modelId || u.model.seriesId === d.seriesId),
        ),
        companyLogoUrl: tenant?.logo_url ?? null,
        companyName: tenant?.name ?? undefined,
        contactInfo: { phone: tenant?.phone ?? undefined, email: tenant?.email ?? undefined },
        noiseMode,
        airflowUnit,
        airflowUnitLabel: AIRFLOW_UNIT_LABELS[airflowUnit],
        lengthUnitFactorMm: LENGTH_TO_MM[widthUnit],
        lengthUnitLabel: LENGTH_UNIT_LABELS[widthUnit],
        heightUnitFactorMm: LENGTH_TO_MM[heightUnit],
        heightUnitLabel: LENGTH_UNIT_LABELS[heightUnit],
      });

      toast.success('Datasheet downloaded');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to generate datasheet');
    } finally {
      setDownloading(false);
    }
  };

  const streamSpeeds = useMemo<StreamSpeed[]>(() => {
    if (!selected) return [];
    const height = doorHeightM || 3;
    const target = parseFloat(minFloorVelocity) || 0;
    const slotM = slotWidthOf(selected.model);
    const lowV = selected.model.airVelocityLowMs;
    const nozzles: { label: string; v: number }[] = [];
    if (lowV && lowV > 0 && lowV !== selected.outletVelocity) nozzles.push({ label: '1 SPEED', v: lowV });
    nozzles.push({ label: nozzles.length ? '2 SPEED' : '1 SPEED', v: selected.outletVelocity });

    const seriesMax = selected.model.mountingHeightMax;
    return nozzles.map(({ label, v }) => {
      const throwM = effectiveThrow(v, slotM, target);
      let reachM = Math.max(0.5, throwM || height);
      if (seriesMax && seriesMax > 0) reachM = Math.min(reachM, seriesMax);
      return {
        label,
        nozzleVelocity: v,
        endVelocity: jetVelocityAt(v, slotM, reachM),
        reachM,
      };
    });
  }, [selected, doorHeightM, minFloorVelocity]);


  if (authLoading || isLoading) {
    return (
      <MainLayout>
        <div className="min-h-[60vh] flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </MainLayout>
    );
  }

  if (!isAuthenticated) {
    return (
      <MainLayout>
        <div className="min-h-[60vh] flex items-center justify-center">
          <div className="text-center max-w-md mx-auto p-8">
            <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-6">
              <LogIn className="w-10 h-10 text-primary" />
            </div>
            <h2 className="text-2xl font-bold mb-3">Login Required</h2>
            <p className="text-muted-foreground mb-6">Please log in to access the air curtain selector.</p>
            <Button onClick={() => navigate('/login')} size="lg">Login to Continue</Button>
          </div>
        </div>
      </MainLayout>
    );
  }

  if (!isApproved && !isSuperAdmin) {
    return (
      <MainLayout>
        <div className="min-h-[60vh] flex items-center justify-center text-center max-w-md mx-auto p-8">
          <div>
            <h2 className="text-2xl font-bold mb-3">Approval Pending</h2>
            <p className="text-muted-foreground">Your account is awaiting admin approval.</p>
          </div>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <section className="bg-gradient-primary text-primary-foreground py-8">
        <div className="container mx-auto px-4">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 bg-primary-foreground/20 rounded-2xl flex items-center justify-center">
              <DoorOpen className="w-7 h-7" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Air Curtain Selector</h1>
              <p className="text-primary-foreground/80 text-sm mt-1">
                Select by door length, mounting height, airflow and velocity projection
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="container mx-auto px-4 py-6 flex-1">
        <div className="flex flex-col gap-4">
          {/* Criteria */}
          <div className="kinair-card p-4 md:p-6">
            <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
              <Gauge className="w-5 h-5 text-primary" /> Opening Requirements
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="space-y-1.5">
                <Label>Selection Basis</Label>
                <Select value={selectionBasis} onValueChange={(v) => setSelectionBasis(v as 'door' | 'airflow')}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="door">Door opening (length match)</SelectItem>
                    <SelectItem value="airflow">Airflow only</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Door Width / Length{selectionBasis === 'airflow' ? ' (not used)' : ''}</Label>
                <div className="flex gap-1.5">
                  <Input type="number" step="any" value={doorWidth} disabled={selectionBasis === 'airflow'} onChange={(e) => setDoorWidth(e.target.value)} />
                  <Select value={widthUnit} onValueChange={(v) => setWidthUnit(v as LengthUnit)}>
                    <SelectTrigger className="w-[84px] shrink-0"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {(Object.keys(LENGTH_UNIT_LABELS) as LengthUnit[]).map((u) => (
                        <SelectItem key={u} value={u}>{LENGTH_UNIT_LABELS[u]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Door / Mounting Height</Label>
                <div className="flex gap-1.5">
                  <Input type="number" step="any" value={doorHeight} onChange={(e) => setDoorHeight(e.target.value)} />
                  <Select value={heightUnit} onValueChange={(v) => setHeightUnit(v as LengthUnit)}>
                    <SelectTrigger className="w-[84px] shrink-0"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {(Object.keys(LENGTH_UNIT_LABELS) as LengthUnit[]).map((u) => (
                        <SelectItem key={u} value={u}>{LENGTH_UNIT_LABELS[u]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Mounting Type</Label>
                <Select value={category} onValueChange={(v) => setCategory(v as AirCurtainCategory | 'any')}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="any">Any</SelectItem>
                    <SelectItem value="surface">{CATEGORY_LABELS.surface}</SelectItem>
                    <SelectItem value="recessed">{CATEGORY_LABELS.recessed}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Fan Speed</Label>
                <Select value={speed} onValueChange={(v) => setSpeed(v as AirCurtainSpeed)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="low">Low</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Min. Nozzle Velocity (m/s)</Label>
                <Input type="number" step="any" value={minNozzleVelocity} onChange={(e) => setMinNozzleVelocity(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Required Airflow{selectionBasis === 'airflow' ? ' *' : ''}</Label>
                <div className="flex gap-1.5">
                  <Input type="number" step="any" value={minAirflow} onChange={(e) => setMinAirflow(e.target.value)} />
                  <Select value={airflowUnit} onValueChange={(v) => setAirflowUnit(v as AirflowUnit)}>
                    <SelectTrigger className="w-[84px] shrink-0"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {(Object.keys(AIRFLOW_UNIT_LABELS) as AirflowUnit[]).map((u) => (
                        <SelectItem key={u} value={u}>{AIRFLOW_UNIT_LABELS[u]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Motor Type</Label>
                <Select value={motorType} onValueChange={(v) => setMotorType(v as AirCurtainMotorType | 'any')}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="any">Any</SelectItem>
                    <SelectItem value="AC">AC</SelectItem>
                    <SelectItem value="EC">EC</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Brand</Label>
                <Select value={brand} onValueChange={setBrand}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="any">Any</SelectItem>
                    {brands.map((b) => (
                      <SelectItem key={b} value={b}>{b}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Series</Label>
                <Select value={seriesId} onValueChange={setSeriesId}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="any">Any</SelectItem>
                    {seriesOptions.map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Model Combinations</Label>
                <Select value={allowCombinations ? 'yes' : 'no'} onValueChange={(v) => setAllowCombinations(v === 'yes')}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="yes">Allow mixed lengths</SelectItem>
                    <SelectItem value="no">Single model only</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Supply Frequency (Hz)</Label>
                <Select value={supplyFrequency} onValueChange={setSupplyFrequency}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="50">50 Hz (catalogue)</SelectItem>
                    <SelectItem value="60">60 Hz (fan law)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Min. Floor Velocity (m/s)</Label>
                <Input type="number" step="any" value={minFloorVelocity} onChange={(e) => setMinFloorVelocity(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Min. Length Match — {minMatch}%</Label>
                <Slider
                  value={[minMatch]}
                  disabled={selectionBasis === 'airflow'}
                  onValueChange={([v]) => setMinMatch(v)}
                  min={50}
                  max={100}
                  step={5}
                  className="mt-3"
                />
                <p className="text-[11px] text-muted-foreground">
                  Below 100% also lists shorter combinations (shown last).
                </p>
              </div>
              <div className="space-y-1.5">
                <Label>Max. Length Match — {maxMatch}%</Label>
                <Slider
                  value={[maxMatch]}
                  disabled={selectionBasis === 'airflow'}
                  onValueChange={([v]) => setMaxMatch(v)}
                  min={100}
                  max={200}
                  step={5}
                  className="mt-3"
                />
                <p className="text-[11px] text-muted-foreground">
                  Combinations longer than this % of the opening are excluded.
                </p>
              </div>
              <div className="flex items-end">
                <Button variant="kinair" className="w-full" onClick={handleSearch}>
                  <Search className="w-4 h-4" /> Find Air Curtains
                </Button>
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-3">
              Data limited to the KINAIR air curtain catalogue. Velocity projection uses the plane-jet decay law
              V(x) = V₀ · 2.4 · √(b₀ / x). At a supply frequency other than the rated one, catalogue data is
              corrected by the fan laws: airflow &amp; velocity × (f₂/f₁), power × (f₂/f₁)³, sound + 50·log₁₀(f₂/f₁).
            </p>
          </div>

          {/* Results */}
          <div className="kinair-card p-4 md:p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold flex items-center gap-2">
                <Wind className="w-5 h-5 text-primary" /> Air Curtain Selections
              </h2>
              {results.length > 0 && (
                <span className="kinair-badge kinair-badge-primary text-xs px-2 py-1">{results.length} matches</span>
              )}
            </div>

            {!hasSearched ? (
              <div className="text-center py-10 text-muted-foreground text-sm">
                Enter the opening details and click "Find Air Curtains".
              </div>
            ) : results.length === 0 ? (
              <div className="text-center py-10 text-muted-foreground text-sm">
                No air curtain matches these requirements.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-muted-foreground">
                      <th className="py-2 pr-3 font-medium">Match</th>
                      <th className="py-2 pr-3 font-medium">Arrangement</th>
                      <th className="py-2 pr-3 font-medium">Brand</th>

                      <th className="py-2 pr-3 font-medium">Motor</th>
                      <th className="py-2 pr-3 font-medium">Type</th>
                      <th className="py-2 pr-3 font-medium">Total Length</th>
                      <th className="py-2 pr-3 font-medium">Units</th>
                      <th className="py-2 pr-3 font-medium">Mounting Ht.</th>
                      <th className="py-2 pr-3 font-medium">Nozzle Vel.</th>
                      <th className="py-2 pr-3 font-medium">Floor Vel.</th>
                      <th className="py-2 pr-3 font-medium">Air Volume</th>
                      <th className="py-2 pr-3 font-medium">Power</th>
                      <th className="py-2 pr-3 font-medium">Noise @ 3m</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.map((r) => (
                      <tr
                        key={r.arrangement}
                        onClick={() => setSelected(r)}
                        className={`border-b border-border/50 cursor-pointer hover:bg-muted/50 ${
                          selected?.arrangement === r.arrangement ? 'bg-primary/5' : ''
                        }`}
                      >
                        <td className="py-2 pr-3">
                          <span
                            className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${
                              r.matchPercent >= 90
                                ? 'bg-primary/15 text-primary'
                                : r.matchPercent >= 75
                                  ? 'bg-muted text-foreground'
                                  : 'bg-muted text-muted-foreground'
                            }`}
                          >
                            {r.matchPercent}%
                          </span>
                        </td>
                        <td className="py-2 pr-3 font-semibold">{r.arrangement}</td>

                        <td className="py-2 pr-3">{r.model.brand}</td>
                        <td className="py-2 pr-3">{r.model.motorType}</td>
                        <td className="py-2 pr-3">{CATEGORY_LABELS[r.model.category]}</td>
                        <td className="py-2 pr-3">
                          {formatLengthMm(r.totalLengthMm, widthUnit)}
                          {widthUnit !== 'mm' && (
                            <span className="text-muted-foreground"> / {r.totalLengthMm} mm</span>
                          )}
                        </td>
                        <td className="py-2 pr-3">{r.unitsRequired}</td>
                        <td className="py-2 pr-3">
                          {roundSmart(fromMm((r.model.mountingHeightMin ?? 0) * 1000, heightUnit))}–
                          {formatLengthM(r.model.mountingHeightMax ?? 0, heightUnit)}
                        </td>
                        <td className="py-2 pr-3">{r.outletVelocity} m/s</td>
                        <td className="py-2 pr-3 font-medium">{r.floorVelocity.toFixed(2)} m/s</td>
                        <td className="py-2 pr-3">
                          {formatAirflow(r.totalAirVolumeCmh, airflowUnit)}
                          {airflowUnit !== 'cmh' && (
                            <span className="text-muted-foreground"> / {r.totalAirVolumeCmh} m³/h</span>
                          )}
                        </td>
                        <td className="py-2 pr-3">{r.totalPowerW} W</td>
                        <td className="py-2 pr-3">{r.noiseDb ? `${r.noiseDb} dB` : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Detail + velocity projection */}
          {selected && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="kinair-card p-4 md:p-6">
                <div className="flex items-center justify-between gap-3 mb-3">
                  <h3 className="text-base font-bold">{selected.model.model}</h3>
                  <div className="flex items-center gap-2">
                    <div className="flex rounded-md border border-border overflow-hidden text-xs">
                      <button
                        type="button"
                        onClick={() => setNoiseMode('dba')}
                        className={`px-2 py-1 ${noiseMode === 'dba' ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground'}`}
                      >
                        Single dB(A)
                      </button>
                      <button
                        type="button"
                        onClick={() => setNoiseMode('octave')}
                        className={`px-2 py-1 border-l border-border ${noiseMode === 'octave' ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground'}`}
                      >
                        Octave band
                      </button>
                    </div>
                  <Button size="sm" variant="outline" onClick={handleDatasheet} disabled={downloading}>
                    {downloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />}
                    Datasheet PDF
                  </Button>
                  </div>
                </div>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                  <dt className="text-muted-foreground">Brand</dt>
                  <dd>{selected.model.brand}</dd>
                  <dt className="text-muted-foreground">Motor type</dt>
                  <dd>{selected.model.motorType}</dd>
                  <dt className="text-muted-foreground">Voltage / Frequency</dt>
                  <dd>
                    {(selected.voltage ?? '220-240V')} / {selected.supplyFrequencyHz} Hz
                    {selected.frequencyRatio !== 1 && (
                      <span className="text-muted-foreground"> (fan-law from {selected.ratedFrequencyHz} Hz)</span>
                    )}
                  </dd>
                  <dt className="text-muted-foreground">Mounting</dt>
                  <dd>{CATEGORY_LABELS[selected.model.category]}</dd>
                  <dt className="text-muted-foreground">Arrangement</dt>
                  <dd>{selected.arrangement}</dd>
                  <dt className="text-muted-foreground">Units required</dt>
                  <dd>
                    {selected.unitsRequired} unit(s) = {formatLengthMm(selected.totalLengthMm, widthUnit)}
                    {widthUnit !== 'mm' && ` / ${selected.totalLengthMm} mm`}
                  </dd>
                  <dt className="text-muted-foreground">Impeller diameter</dt>
                  <dd>{selected.model.impellerDiameter ?? '—'} mm</dd>
                  <dt className="text-muted-foreground">Air volume (total)</dt>
                  <dd>
                    {formatAirflow(selected.totalAirVolumeCmh, airflowUnit)}
                    {airflowUnit !== 'cmh' && ` / ${selected.totalAirVolumeCmh} m³/h`}
                  </dd>
                  <dt className="text-muted-foreground">Input power (total)</dt>
                  <dd>{selected.totalPowerW} W</dd>
                  <dt className="text-muted-foreground">Nozzle velocity</dt>
                  <dd>{selected.outletVelocity} m/s</dd>
                  <dt className="text-muted-foreground">Velocity at floor</dt>
                  <dd>{selected.floorVelocity.toFixed(2)} m/s</dd>
                  <dt className="text-muted-foreground">Effective throw</dt>
                  <dd>{formatLengthM(selected.effectiveThrowM, heightUnit)}</dd>
                  <dt className="text-muted-foreground">Noise @ 3m</dt>
                  <dd>{selected.noiseDb ? `${selected.noiseDb} dB` : '—'}</dd>
                  <dt className="text-muted-foreground">Net weight (total)</dt>
                  <dd>{selected.totalWeightKg} kg</dd>
                  <dt className="text-muted-foreground">Unit size (L x W x H)</dt>
                  <dd>{selected.model.unitSize ?? '—'}</dd>
                  <dt className="text-muted-foreground">Carton size</dt>
                  <dd>{selected.model.cartonSize ?? '—'}</dd>
                  {selected.model.remarks && (
                    <>
                      <dt className="text-muted-foreground">Remarks</dt>
                      <dd>{selected.model.remarks}</dd>
                    </>
                  )}
                </dl>

                {noiseMode === 'octave' && selected.octaveBands && (
                  <div className="mt-4">
                    <h4 className="text-sm font-semibold mb-2">
                      Octave band sound levels @ 3 m (dB)
                      {selected.octaveBandsEstimated && (
                        <span className="ml-2 text-xs font-normal text-muted-foreground">(estimated from overall dB(A))</span>
                      )}
                    </h4>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs border border-border">
                        <thead>
                          <tr className="bg-muted">
                            <th className="p-1.5 text-left border border-border">Hz</th>
                            {selected.octaveBands.map((b) => (
                              <th key={b.label} className="p-1.5 border border-border">{b.label}</th>
                            ))}
                            <th className="p-1.5 border border-border">Overall</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr>
                            <td className="p-1.5 text-left border border-border">dB</td>
                            {selected.octaveBands.map((b) => (
                              <td key={b.label} className="p-1.5 text-center border border-border">{b.value.toFixed(1)}</td>
                            ))}
                            <td className="p-1.5 text-center border border-border">{selected.noiseDb ?? '—'}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>


              <div className="kinair-card p-4 md:p-6">
                <h3 className="text-base font-bold mb-1">Stream Range</h3>
                <p className="text-xs text-muted-foreground mb-3">Vertical air stream range (maximum installation height)</p>
                <div className="h-[340px]">
                  <StreamRangeChart
                    speeds={streamSpeeds}
                    maxHeightM={doorHeightM || 3}
                    dutyVelocity={
                      selected
                        ? jetVelocityAt(selected.outletVelocity, slotWidthOf(selected.model), doorHeightM || 3)
                        : undefined
                    }
                  />
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  Jet velocity decay from the discharge slot down to floor level ({doorHeight} {LENGTH_UNIT_LABELS[heightUnit]}).
                </p>
              </div>

            </div>
          )}
        </div>
      </section>
    
      <AssistantLauncher context="air_curtain" title="Ask KINAIR" suggestions={AIR_CURTAIN_SUGGESTIONS} />
</MainLayout>
  );
}
