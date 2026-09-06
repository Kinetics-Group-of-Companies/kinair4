import { useMemo, useState } from 'react';
import { Plus, Trash2, Save, Upload, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import {
  useAirCurtainBrands,
  useAirCurtainSeries,
  useAirCurtainModels,
  useAirCurtainDimensions,
  useAirCurtainMutations,
  uploadAirCurtainAsset,
} from '@/hooks/useAirCurtains';
import { CATEGORY_LABELS } from '@/lib/airCurtainData';
import { AirCurtainExcelImportExport } from './AirCurtainExcelImportExport';

type Draft = Record<string, unknown>;

function AssetUpload({
  label,
  value,
  folder,
  onChange,
}: {
  label: string;
  value: string | null;
  folder: string;
  onChange: (url: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <div className="flex gap-2">
        <Input value={value ?? ''} onChange={(e) => onChange(e.target.value)} placeholder="https://…" />
        <Button
          type="button"
          variant="outline"
          size="icon"
          disabled={busy}
          onClick={() => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = 'image/*,application/pdf';
            input.onchange = async () => {
              const file = input.files?.[0];
              if (!file) return;
              setBusy(true);
              try {
                const url = await uploadAirCurtainAsset(file, folder);
                onChange(url);
                toast.success('Uploaded');
              } catch (e) {
                toast.error(e instanceof Error ? e.message : 'Upload failed');
              } finally {
                setBusy(false);
              }
            };
            input.click();
          }}
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
        </Button>
      </div>
    </div>
  );
}

function BrandsTab() {
  const { data: brands = [] } = useAirCurtainBrands();
  const { create, update, remove } = useAirCurtainMutations('air_curtain_brands');
  const [draft, setDraft] = useState<Draft>({ name: '', logo_url: '', website: '', notes: '' });

  return (
    <div className="space-y-6">
      <div className="kinair-card p-4 space-y-3">
        <h3 className="font-semibold">Add Brand</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <Label>Brand name</Label>
            <Input
              value={String(draft.name ?? '')}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              placeholder="KINAIR / SONNIGER / WING"
            />
          </div>
          <AssetUpload
            label="Brand logo"
            folder="brand-logos"
            value={String(draft.logo_url ?? '')}
            onChange={(url) => setDraft({ ...draft, logo_url: url })}
          />
          <div className="space-y-1.5">
            <Label>Website</Label>
            <Input
              value={String(draft.website ?? '')}
              onChange={(e) => setDraft({ ...draft, website: e.target.value })}
            />
          </div>
        </div>
        <Button
          onClick={async () => {
            if (!draft.name) return toast.error('Brand name is required');
            try {
              await create.mutateAsync(draft);
              setDraft({ name: '', logo_url: '', website: '', notes: '' });
              toast.success('Brand added');
            } catch (e) {
              toast.error(e instanceof Error ? e.message : 'Failed');
            }
          }}
        >
          <Plus className="w-4 h-4" /> Add Brand
        </Button>
      </div>

      <div className="space-y-3">
        {brands.map((b) => (
          <div key={b.id} className="kinair-card p-4 grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input
                defaultValue={b.name}
                onBlur={(e) =>
                  e.target.value !== b.name &&
                  update.mutate({ id: b.id, values: { name: e.target.value } })
                }
              />
            </div>
            <AssetUpload
              label="Logo"
              folder="brand-logos"
              value={b.logoUrl}
              onChange={(url) => update.mutate({ id: b.id, values: { logo_url: url } })}
            />
            <div className="space-y-1.5">
              <Label>Website</Label>
              <Input
                defaultValue={b.website ?? ''}
                onBlur={(e) => update.mutate({ id: b.id, values: { website: e.target.value } })}
              />
            </div>
            <div className="flex items-center gap-2">
              {b.logoUrl && <img src={b.logoUrl} alt={`${b.name} logo`} className="h-8 object-contain" />}
              <Button
                variant="destructive"
                size="icon"
                onClick={() => confirm(`Delete ${b.name}?`) && remove.mutate(b.id)}
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SeriesTab() {
  const { data: brands = [] } = useAirCurtainBrands();
  const { data: series = [] } = useAirCurtainSeries();
  const { create, update, remove } = useAirCurtainMutations('air_curtain_series');
  const [draft, setDraft] = useState<Draft>({ name: '', category: 'surface', motor_type: 'AC' });

  return (
    <div className="space-y-6">
      <div className="kinair-card p-4 space-y-3">
        <h3 className="font-semibold">Add Series</h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="space-y-1.5">
            <Label>Brand</Label>
            <Select
              value={String(draft.brand_id ?? '')}
              onValueChange={(v) => setDraft({ ...draft, brand_id: v })}
            >
              <SelectTrigger><SelectValue placeholder="Select brand" /></SelectTrigger>
              <SelectContent>
                {brands.map((b) => (
                  <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Series name</Label>
            <Input value={String(draft.name ?? '')} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>Mounting type</Label>
            <Select value={String(draft.category)} onValueChange={(v) => setDraft({ ...draft, category: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="surface">{CATEGORY_LABELS.surface}</SelectItem>
                <SelectItem value="recessed">{CATEGORY_LABELS.recessed}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Motor type</Label>
            <Select value={String(draft.motor_type)} onValueChange={(v) => setDraft({ ...draft, motor_type: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="AC">AC</SelectItem>
                <SelectItem value="EC">EC</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <Button
          onClick={async () => {
            if (!draft.brand_id || !draft.name) return toast.error('Brand and series name are required');
            try {
              await create.mutateAsync(draft);
              setDraft({ name: '', category: 'surface', motor_type: 'AC' });
              toast.success('Series added');
            } catch (e) {
              toast.error(e instanceof Error ? e.message : 'Failed');
            }
          }}
        >
          <Plus className="w-4 h-4" /> Add Series
        </Button>
      </div>

      <div className="space-y-3">
        {series.map((s) => (
          <SeriesCard key={s.id} s={s} brands={brands} update={update} remove={remove} />
        ))}
      </div>
    </div>
  );
}

function SeriesCard({
  s,
  brands,
  update,
  remove,
}: {
  s: NonNullable<ReturnType<typeof useAirCurtainSeries>['data']>[number];
  brands: NonNullable<ReturnType<typeof useAirCurtainBrands>['data']>;
  update: ReturnType<typeof useAirCurtainMutations>['update'];
  remove: ReturnType<typeof useAirCurtainMutations>['remove'];
}) {
  const [form, setForm] = useState({
    name: s.name,
    brand_id: s.brandId ?? '',
    category: s.category,
    motor_type: s.motorType,
    datasheet_description: s.datasheetDescription ?? '',
  });

  const save = async () => {
    if (!form.name.trim()) return toast.error('Series name is required');
    try {
      await update.mutateAsync({ id: s.id, values: form });
      toast.success(`Series ${form.name} saved`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to save');
    }
  };

  return (
    <div className="kinair-card p-4 space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <div className="space-y-1.5">
          <Label>Name</Label>
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>
        <div className="space-y-1.5">
          <Label>Brand</Label>
          <Select value={form.brand_id} onValueChange={(v) => setForm({ ...form, brand_id: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {brands.map((b) => (
                <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Mounting type</Label>
          <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v as typeof form.category })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="surface">{CATEGORY_LABELS.surface}</SelectItem>
              <SelectItem value="recessed">{CATEGORY_LABELS.recessed}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Motor type</Label>
          <Select value={form.motor_type} onValueChange={(v) => setForm({ ...form, motor_type: v as typeof form.motor_type })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="AC">AC</SelectItem>
              <SelectItem value="EC">EC</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <AssetUpload
          label="Series photo"
          folder="series-photos"
          value={s.imageUrl}
          onChange={(url) => update.mutate({ id: s.id, values: { image_url: url } })}
        />
        <AssetUpload
          label="Technical drawing"
          folder="series-drawings"
          value={s.drawingUrl}
          onChange={(url) => update.mutate({ id: s.id, values: { drawing_url: url } })}
        />
        <AssetUpload
          label="Catalogue (PDF)"
          folder="catalogues"
          value={s.catalogueUrl}
          onChange={(url) => update.mutate({ id: s.id, values: { catalogue_url: url } })}
        />
      </div>
      <div className="space-y-1.5">
        <Label>Datasheet description</Label>
        <Textarea
          value={form.datasheet_description}
          onChange={(e) => setForm({ ...form, datasheet_description: e.target.value })}
        />
      </div>
      <div className="flex items-center gap-2">
        <Button onClick={save} disabled={update.isPending}>
          <Save className="w-4 h-4" /> {update.isPending ? 'Saving…' : 'Save Series'}
        </Button>
        <Button
          variant="destructive"
          size="sm"
          onClick={() => confirm(`Delete series ${s.name}?`) && remove.mutate(s.id)}
        >
          <Trash2 className="w-4 h-4" /> Delete Series
        </Button>
      </div>
    </div>
  );
}

const MODEL_FIELDS: { key: string; label: string; type?: 'text' }[] = [
  { key: 'length_mm', label: 'Length (mm)' },
  { key: 'impeller_diameter', label: 'Impeller Ø (mm)' },
  { key: 'input_power_w', label: 'Power high (W)' },
  { key: 'input_power_low_w', label: 'Power low (W)' },
  { key: 'air_velocity_ms', label: 'Nozzle vel. high (m/s)' },
  { key: 'air_velocity_low_ms', label: 'Nozzle vel. low (m/s)' },
  { key: 'air_volume_cmh', label: 'Air volume high (m³/h)' },
  { key: 'air_volume_cfm', label: 'Air volume high (CFM)' },
  { key: 'air_volume_low_cmh', label: 'Air volume low (m³/h)' },
  { key: 'air_volume_low_cfm', label: 'Air volume low (CFM)' },
  { key: 'noise_db', label: 'Noise high dB(A) @ 3 m' },
  { key: 'noise_low_db', label: 'Noise low dB(A) @ 3 m' },
  { key: 'noise_63', label: 'Octave 63 Hz dB' },
  { key: 'noise_125', label: 'Octave 125 Hz dB' },
  { key: 'noise_250', label: 'Octave 250 Hz dB' },
  { key: 'noise_500', label: 'Octave 500 Hz dB' },
  { key: 'noise_1k', label: 'Octave 1 kHz dB' },
  { key: 'noise_2k', label: 'Octave 2 kHz dB' },
  { key: 'noise_4k', label: 'Octave 4 kHz dB' },
  { key: 'noise_8k', label: 'Octave 8 kHz dB' },
  { key: 'net_weight_kg', label: 'Net weight (kg)' },
  { key: 'gross_weight_kg', label: 'Gross weight (kg)' },
  { key: 'mounting_height_min', label: 'Mounting ht. min (m)' },
  { key: 'mounting_height_max', label: 'Mounting ht. max (m)' },
  { key: 'slot_width_mm', label: 'Slot width (mm)' },
  { key: 'voltage', label: 'Voltage (e.g. 220-240V)', type: 'text' },
  { key: 'frequency_hz', label: 'Rated frequency (Hz)' },
  { key: 'unit_size', label: 'Unit size (L x W x H)', type: 'text' },
  { key: 'carton_size', label: 'Carton size', type: 'text' },
  { key: 'remarks', label: 'Remarks', type: 'text' },
];

function ModelsTab() {
  const { data: brands = [] } = useAirCurtainBrands();
  const { data: series = [] } = useAirCurtainSeries();
  const { data: models = [] } = useAirCurtainModels();
  const { create, update, remove } = useAirCurtainMutations('air_curtain_models');
  const [seriesFilter, setSeriesFilter] = useState<string>('all');
  const [draft, setDraft] = useState<Draft>({ model: '', length_mm: 1000 });

  const filtered = useMemo(
    () => (seriesFilter === 'all' ? models : models.filter((m) => m.seriesId === seriesFilter)),
    [models, seriesFilter],
  );

  const seriesById = useMemo(() => Object.fromEntries(series.map((s) => [s.id, s])), [series]);

  return (
    <div className="space-y-6">
      <div className="kinair-card p-4 space-y-3">
        <h3 className="font-semibold">Add Model</h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="space-y-1.5">
            <Label>Series</Label>
            <Select value={String(draft.series_id ?? '')} onValueChange={(v) => setDraft({ ...draft, series_id: v })}>
              <SelectTrigger><SelectValue placeholder="Select series" /></SelectTrigger>
              <SelectContent>
                {series.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {brands.find((b) => b.id === s.brandId)?.name} — {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Model name</Label>
            <Input value={String(draft.model ?? '')} onChange={(e) => setDraft({ ...draft, model: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>Length (mm)</Label>
            <Input
              type="number"
              step="any"
              value={String(draft.length_mm ?? '')}
              onChange={(e) => setDraft({ ...draft, length_mm: e.target.value })}
            />
          </div>
          <div className="flex items-end">
            <Button
              className="w-full"
              onClick={async () => {
                const s = draft.series_id ? seriesById[String(draft.series_id)] : null;
                if (!s || !draft.model) return toast.error('Series and model name are required');
                try {
                  await create.mutateAsync({
                    ...draft,
                    length_mm: Number(draft.length_mm) || 0,
                    brand_id: s.brandId,
                    brand: brands.find((b) => b.id === s.brandId)?.name ?? 'KINAIR',
                    category: s.category,
                    motor_type: s.motorType,
                  });
                  setDraft({ model: '', length_mm: 1000 });
                  toast.success('Model added');
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : 'Failed');
                }
              }}
            >
              <Plus className="w-4 h-4" /> Add Model
            </Button>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Label className="whitespace-nowrap">Filter by series</Label>
        <Select value={seriesFilter} onValueChange={setSeriesFilter}>
          <SelectTrigger className="w-72"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All series</SelectItem>
            {series.map((s) => (
              <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-sm text-muted-foreground">{filtered.length} models</span>
      </div>

      <div className="space-y-3">
        {filtered.map((m) => (
          <ModelRow key={m.id} model={m} series={series} onSave={(values) => update.mutate({ id: m.id, values })} onDelete={() => remove.mutate(m.id)} />
        ))}
      </div>
    </div>
  );
}

function ModelRow({
  model,
  series,
  onSave,
  onDelete,
}: {
  model: ReturnType<typeof useAirCurtainModels>['data'] extends (infer T)[] | undefined ? T : never;
  series: ReturnType<typeof useAirCurtainSeries>['data'];
  onSave: (values: Record<string, unknown>) => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});

  const initial: Record<string, string> = {
    length_mm: String(model.lengthMm ?? ''),
    impeller_diameter: String(model.impellerDiameter ?? ''),
    input_power_w: String(model.inputPowerW ?? ''),
    input_power_low_w: String(model.inputPowerLowW ?? ''),
    air_velocity_ms: String(model.airVelocityMs ?? ''),
    air_velocity_low_ms: String(model.airVelocityLowMs ?? ''),
    air_volume_cmh: String(model.airVolumeCmh ?? ''),
    air_volume_cfm: String(model.airVolumeCfm ?? ''),
    air_volume_low_cmh: String(model.airVolumeLowCmh ?? ''),
    air_volume_low_cfm: String(model.airVolumeLowCfm ?? ''),
    noise_db: String(model.noiseDb ?? ''),
    noise_low_db: String(model.noiseLowDb ?? ''),
    noise_63: String(model.noise63 ?? ''),
    noise_125: String(model.noise125 ?? ''),
    noise_250: String(model.noise250 ?? ''),
    noise_500: String(model.noise500 ?? ''),
    noise_1k: String(model.noise1k ?? ''),
    noise_2k: String(model.noise2k ?? ''),
    noise_4k: String(model.noise4k ?? ''),
    noise_8k: String(model.noise8k ?? ''),
    net_weight_kg: String(model.netWeightKg ?? ''),
    gross_weight_kg: String(model.grossWeightKg ?? ''),
    mounting_height_min: String(model.mountingHeightMin ?? ''),
    mounting_height_max: String(model.mountingHeightMax ?? ''),
    slot_width_mm: String(model.slotWidthMm ?? ''),
    voltage: model.voltage ?? '',
    frequency_hz: String(model.frequencyHz ?? ''),
    unit_size: model.unitSize ?? '',
    carton_size: model.cartonSize ?? '',
    remarks: model.remarks ?? '',
  };
  const current = { ...initial, ...values };

  return (
    <div className="kinair-card p-4">
      <div className="flex items-center justify-between gap-3">
        <button className="text-left flex-1" onClick={() => setOpen(!open)}>
          <span className="font-semibold">{model.model}</span>
          <span className="text-muted-foreground text-sm">
            {' '}— {model.brand} • {model.lengthMm} mm • {model.motorType} • {CATEGORY_LABELS[model.category]}
          </span>
        </button>
        <Button variant="outline" size="sm" onClick={() => setOpen(!open)}>{open ? 'Close' : 'Edit'}</Button>
        <Button variant="destructive" size="icon" onClick={() => confirm(`Delete ${model.model}?`) && onDelete()}>
          <Trash2 className="w-4 h-4" />
        </Button>
      </div>

      {open && (
        <div className="mt-4 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label>Series</Label>
              <Select
                value={model.seriesId ?? ''}
                onValueChange={(v) => {
                  const s = series?.find((x) => x.id === v);
                  onSave({ series_id: v, category: s?.category, motor_type: s?.motorType, brand_id: s?.brandId });
                }}
              >
                <SelectTrigger><SelectValue placeholder="Select series" /></SelectTrigger>
                <SelectContent>
                  {(series ?? []).map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <AssetUpload
              label="Model drawing"
              folder="model-drawings"
              value={model.drawingUrl}
              onChange={(url) => onSave({ drawing_url: url })}
            />
            <div className="space-y-1.5">
              <Label>Motor type</Label>
              <Select value={model.motorType} onValueChange={(v) => onSave({ motor_type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="AC">AC</SelectItem>
                  <SelectItem value="EC">EC</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {MODEL_FIELDS.map((f) => (
              <div key={f.key} className="space-y-1.5">
                <Label className="text-xs">{f.label}</Label>
                <Input
                  type={f.type === 'text' ? 'text' : 'number'}
                  step="any"
                  value={current[f.key] ?? ''}
                  onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}
                />
              </div>
            ))}
          </div>

          <Button
            onClick={() => {
              const payload: Record<string, unknown> = {};
              Object.entries(values).forEach(([k, v]) => {
                const field = MODEL_FIELDS.find((f) => f.key === k);
                payload[k] = field?.type === 'text' ? v : v === '' ? null : Number(v);
              });
              onSave(payload);
              setValues({});
              toast.success('Model saved');
            }}
          >
            <Save className="w-4 h-4" /> Save Changes
          </Button>
        </div>
      )}
    </div>
  );
}

const DEFAULT_COLUMNS = ['L', 'W', 'H'];

function DimensionsTab() {
  const { data: series = [] } = useAirCurtainSeries();
  const { data: models = [] } = useAirCurtainModels();
  const { data: dimensions = [] } = useAirCurtainDimensions();
  const { create, update, remove } = useAirCurtainMutations('air_curtain_dimensions');
  const seriesMutations = useAirCurtainMutations('air_curtain_series');
  const [seriesId, setSeriesId] = useState<string>('');
  const [newColumn, setNewColumn] = useState('');
  const [dirty, setDirty] = useState<Record<string, Record<string, string>>>({});
  const [saving, setSaving] = useState(false);

  const activeSeries = series.find((s) => s.id === seriesId) || null;
  const seriesModels = useMemo(
    () => models.filter((m) => m.seriesId === seriesId).sort((a, b) => a.lengthMm - b.lengthMm),
    [models, seriesId],
  );
  const rows = useMemo(() => dimensions.filter((d) => d.seriesId === seriesId), [dimensions, seriesId]);

  const columns = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((r) => Object.keys(r.values || {}).forEach((k) => set.add(k)));
    Object.values(dirty).forEach((v) => Object.keys(v).forEach((k) => set.add(k)));
    const found = Array.from(set);
    return found.length ? found : DEFAULT_COLUMNS;
  }, [rows, dirty]);

  // If legacy duplicate rows exist for a model, prefer the one with the most values
  const rowFor = (modelId: string) => {
    const matches = rows.filter((r) => r.modelId === modelId);
    if (!matches.length) return null;
    return [...matches].sort(
      (a, b) => Object.keys(b.values || {}).length - Object.keys(a.values || {}).length,
    )[0];
  };

  const cellValue = (modelId: string, col: string) => {
    const d = dirty[modelId]?.[col];
    if (d !== undefined) return d;
    const v = rowFor(modelId)?.values?.[col];
    return v === undefined || v === null ? '' : String(v);
  };

  const setCell = (modelId: string, col: string, value: string) =>
    setDirty((prev) => ({ ...prev, [modelId]: { ...(prev[modelId] || {}), [col]: value } }));

  const saveAll = async () => {
    if (!seriesId) return;
    setSaving(true);
    try {
      for (const model of seriesModels) {
        const changes = dirty[model.id];
        if (!changes) continue;
        const existing = rowFor(model.id);
        const merged: Record<string, string> = { ...(existing?.values as Record<string, string>) };
        Object.entries(changes).forEach(([k, v]) => {
          if (v === '') delete merged[k];
          else merged[k] = v;
        });
        if (existing) {
          await update.mutateAsync({ id: existing.id, values: { values: merged, label: model.model } });
        } else {
          await create.mutateAsync({
            series_id: seriesId,
            model_id: model.id,
            label: model.model,
            values: merged,
            display_order: model.displayOrder,
          });
        }
      }
      setDirty({});
      toast.success('Dimensions saved');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const removeColumn = async (col: string) => {
    setDirty((prev) => {
      const next = { ...prev };
      Object.keys(next).forEach((k) => {
        const copy = { ...next[k] };
        delete copy[col];
        next[k] = copy;
      });
      return next;
    });
    for (const r of rows) {
      if (r.values && col in r.values) {
        const copy = { ...r.values } as Record<string, unknown>;
        delete copy[col];
        await update.mutateAsync({ id: r.id, values: { values: copy } });
      }
    }
    toast.success(`Removed column ${col}`);
  };

  return (
    <div className="space-y-6">
      <div className="kinair-card p-4 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <Label>Series</Label>
            <Select value={seriesId} onValueChange={(v) => { setSeriesId(v); setDirty({}); }}>
              <SelectTrigger><SelectValue placeholder="Select series" /></SelectTrigger>
              <SelectContent>
                {series.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {activeSeries && (
            <AssetUpload
              label="Series dimension drawing"
              folder="drawings"
              value={activeSeries.drawingUrl}
              onChange={(url) =>
                seriesMutations.update.mutate({ id: activeSeries.id, values: { drawing_url: url } })
              }
            />
          )}
          <div className="space-y-1.5">
            <Label>Add dimension parameter</Label>
            <div className="flex gap-2">
              <Input
                value={newColumn}
                placeholder="e.g. L / W / H / A"
                onChange={(e) => setNewColumn(e.target.value)}
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  const col = newColumn.trim();
                  if (!col) return;
                  if (columns.includes(col)) return toast.error('Parameter already exists');
                  if (!seriesModels.length) return toast.error('This series has no models yet');
                  setDirty((prev) => {
                    const next = { ...prev };
                    seriesModels.forEach((m) => {
                      next[m.id] = { ...(next[m.id] || {}), [col]: cellValue(m.id, col) };
                    });
                    return next;
                  });
                  setNewColumn('');
                }}
              >
                <Plus className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>

      {activeSeries?.drawingUrl && (
        <div className="kinair-card p-4 space-y-2">
          <h3 className="font-semibold">Drawing</h3>
          <img
            src={activeSeries.drawingUrl}
            alt={`${activeSeries.name} dimension drawing`}
            className="max-h-80 w-auto mx-auto object-contain bg-white rounded border"
          />
        </div>
      )}

      {seriesId && (
        <div className="kinair-card p-4 space-y-3 overflow-x-auto">
          <div className="flex items-center justify-between gap-3">
            <h3 className="font-semibold">Dimensions by model (mm)</h3>
            <Button onClick={saveAll} disabled={saving || !Object.keys(dirty).length}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save
            </Button>
          </div>
          {seriesModels.length === 0 ? (
            <p className="text-sm text-muted-foreground">Add models to this series first.</p>
          ) : (
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b">
                  <th className="text-left p-2 font-medium">Model</th>
                  {columns.map((c) => (
                    <th key={c} className="text-left p-2 font-medium whitespace-nowrap">
                      <span className="inline-flex items-center gap-1">
                        {c}
                        <button
                          type="button"
                          className="text-muted-foreground hover:text-destructive"
                          onClick={() => removeColumn(c)}
                          aria-label={`Remove ${c}`}
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </span>
                    </th>
                  ))}
                  <th className="p-2" />
                </tr>
              </thead>
              <tbody>
                {seriesModels.map((m) => (
                  <tr key={m.id} className="border-b">
                    <td className="p-2 whitespace-nowrap font-medium">{m.model}</td>
                    {columns.map((c) => (
                      <td key={c} className="p-1">
                        <Input
                          className="h-8 w-24"
                          value={cellValue(m.id, c)}
                          onChange={(e) => setCell(m.id, c, e.target.value)}
                        />
                      </td>
                    ))}
                    <td className="p-1">
                      {rowFor(m.id) && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => remove.mutate(rowFor(m.id)!.id)}
                          aria-label="Clear row"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {!seriesId && <p className="text-sm text-muted-foreground">Select a series to edit its dimensions.</p>}
    </div>
  );
}


export function AirCurtainManager() {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold">Air Curtain Data</h2>
        <p className="text-sm text-muted-foreground">
          Manage brands, series, models, drawings and dimensions used by the air curtain selector.
        </p>
      </div>
      <Tabs defaultValue="brands">
        <TabsList className="w-full flex-wrap h-auto justify-start">
          <TabsTrigger value="brands">Brands</TabsTrigger>
          <TabsTrigger value="series">Series</TabsTrigger>
          <TabsTrigger value="models">Models & Data</TabsTrigger>
          <TabsTrigger value="dimensions">Dimensions</TabsTrigger>
          <TabsTrigger value="importexport">Import / Export</TabsTrigger>
        </TabsList>
        <TabsContent value="brands" className="mt-4"><BrandsTab /></TabsContent>
        <TabsContent value="series" className="mt-4"><SeriesTab /></TabsContent>
        <TabsContent value="models" className="mt-4"><ModelsTab /></TabsContent>
        <TabsContent value="dimensions" className="mt-4"><DimensionsTab /></TabsContent>
        <TabsContent value="importexport" className="mt-4"><AirCurtainExcelImportExport /></TabsContent>
      </Tabs>
    </div>
  );
}

export default AirCurtainManager;
