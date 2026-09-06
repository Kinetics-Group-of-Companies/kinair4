import { useRef, useState } from 'react';
import { Download, Upload, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  useAirCurtainBrands,
  useAirCurtainSeries,
  useAirCurtainModels,
  useAirCurtainMutations,
} from '@/hooks/useAirCurtains';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';

const COLUMNS = [
  'Brand', 'Series', 'Category', 'MotorType', 'Model', 'LengthMm',
  'MountingHeightMin', 'MountingHeightMax', 'SlotWidthMm', 'Voltage', 'FrequencyHz', 'ImpellerDiameter',
  'InputPowerW', 'InputPowerLowW', 'AirVelocityMs', 'AirVelocityLowMs',
  'AirVolumeCmh', 'AirVolumeCfm', 'AirVolumeLowCmh', 'AirVolumeLowCfm',
  'NoiseDb', 'NoiseLowDb', 'NetWeightKg', 'GrossWeightKg',
  'UnitSize', 'CartonSize', 'Remarks', 'DisplayOrder',
] as const;

function numOrNull(v: unknown): number | null {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
}

export function AirCurtainExcelImportExport() {
  const { data: brands = [] } = useAirCurtainBrands();
  const { data: series = [] } = useAirCurtainSeries();
  const { data: models = [] } = useAirCurtainModels();
  const brandMut = useAirCurtainMutations('air_curtain_brands');
  const seriesMut = useAirCurtainMutations('air_curtain_series');
  const modelMut = useAirCurtainMutations('air_curtain_models');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);

  const handleExport = () => {
    const workbook = XLSX.utils.book_new();

    const rows = models.map((m) => {
      const s = series.find((x) => x.id === m.seriesId);
      return {
        Brand: s ? (brands.find((b) => b.id === s.brandId)?.name ?? m.brand) : m.brand,
        Series: s?.name ?? '',
        Category: m.category,
        MotorType: m.motorType,
        Model: m.model,
        LengthMm: m.lengthMm,
        MountingHeightMin: m.mountingHeightMin ?? '',
        MountingHeightMax: m.mountingHeightMax ?? '',
        SlotWidthMm: m.slotWidthMm ?? '',
        Voltage: m.voltage ?? '',
        FrequencyHz: m.frequencyHz ?? '',
        ImpellerDiameter: m.impellerDiameter ?? '',
        InputPowerW: m.inputPowerW ?? '',
        InputPowerLowW: m.inputPowerLowW ?? '',
        AirVelocityMs: m.airVelocityMs ?? '',
        AirVelocityLowMs: m.airVelocityLowMs ?? '',
        AirVolumeCmh: m.airVolumeCmh ?? '',
        AirVolumeCfm: m.airVolumeCfm ?? '',
        AirVolumeLowCmh: m.airVolumeLowCmh ?? '',
        AirVolumeLowCfm: m.airVolumeLowCfm ?? '',
        NoiseDb: m.noiseDb ?? '',
        NoiseLowDb: m.noiseLowDb ?? '',
        Noise63: m.noise63 ?? '',
        Noise125: m.noise125 ?? '',
        Noise250: m.noise250 ?? '',
        Noise500: m.noise500 ?? '',
        Noise1k: m.noise1k ?? '',
        Noise2k: m.noise2k ?? '',
        Noise4k: m.noise4k ?? '',
        Noise8k: m.noise8k ?? '',
        NetWeightKg: m.netWeightKg ?? '',
        GrossWeightKg: m.grossWeightKg ?? '',
        UnitSize: m.unitSize ?? '',
        CartonSize: m.cartonSize ?? '',
        Remarks: m.remarks ?? '',
        DisplayOrder: m.displayOrder,
      };
    });

    const ws = XLSX.utils.json_to_sheet(rows.length > 0 ? rows : [
      {
        Brand: 'KINAIR', Series: 'EXAMPLE', Category: 'surface', MotorType: 'AC',
        Model: 'EX-100', LengthMm: 1000, MountingHeightMin: 2, MountingHeightMax: 3,
        SlotWidthMm: 50, Voltage: '220-240V', FrequencyHz: 50, ImpellerDiameter: '', InputPowerW: 300, InputPowerLowW: '',
        AirVelocityMs: 10, AirVelocityLowMs: '', AirVolumeCmh: 1500, AirVolumeCfm: '',
        AirVolumeLowCmh: '', AirVolumeLowCfm: '', NoiseDb: 55, NoiseLowDb: '',
        NetWeightKg: '', GrossWeightKg: '', UnitSize: '', CartonSize: '', Remarks: '', DisplayOrder: 0,
      },
    ]);
    ws['!cols'] = COLUMNS.map(() => ({ wch: 14 }));
    XLSX.utils.book_append_sheet(workbook, ws, 'Air Curtain Data');

    const instructions = [
      { Instructions: 'How to use this template:' },
      { Instructions: '1. Each row = one air curtain model' },
      { Instructions: '2. Brand + Series must match existing names, or they are created automatically' },
      { Instructions: '3. Category: surface | recessed. MotorType: AC | EC' },
      { Instructions: '4. LengthMm is the unit length (mm). Mounting heights in metres, slot width in mm' },
      { Instructions: '5. Low-speed columns (InputPowerLowW, AirVelocityLowMs, AirVolumeLow*, NoiseLowDb) are optional' },
      { Instructions: '6. Import matches existing models by Brand + Series + Model and updates them; others are created' },
    ];
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(instructions), 'Instructions');

    XLSX.writeFile(workbook, `air_curtain_data_${new Date().toISOString().split('T')[0]}.xlsx`);
    toast.success(`Exported ${models.length} air curtain models to Excel`);
  };

  const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setImporting(true);
    const reader = new FileReader();

    reader.onload = async (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const jsonData = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]) as any[];

        if (jsonData.length === 0) {
          toast.error('No data found in the Excel file');
          return;
        }

        let createdBrands = 0, createdSeries = 0, createdModels = 0, updatedModels = 0;
        const errors: string[] = [];
        const brandCache = new Map(brands.map((b) => [b.name.toLowerCase(), b]));
        const seriesCache = new Map(series.map((s) => [`${s.brandId}:${s.name.toLowerCase()}`, s]));

        for (const row of jsonData) {
          const brandName = String(row.Brand ?? '').trim();
          const seriesName = String(row.Series ?? '').trim();
          const modelName = String(row.Model ?? '').trim();
          const lengthMm = numOrNull(row.LengthMm);
          if (!brandName || !seriesName || !modelName || !lengthMm) {
            errors.push(`Skipped row with missing Brand/Series/Model/Length (${modelName || 'unnamed'})`);
            continue;
          }

          try {
            // Brand
            let brand = brandCache.get(brandName.toLowerCase());
            if (!brand) {
              const created = await brandMut.create.mutateAsync({ name: brandName, display_order: brandCache.size });
              brand = { id: String((created as any).id), name: brandName } as any;
              brandCache.set(brandName.toLowerCase(), brand);
              createdBrands++;
            }

            // Series
            const category = String(row.Category ?? 'surface').toLowerCase() === 'recessed' ? 'recessed' : 'surface';
            const motorType = String(row.MotorType ?? 'AC').toUpperCase() === 'EC' ? 'EC' : 'AC';
            const sKey = `${brand.id}:${seriesName.toLowerCase()}`;
            let ser = seriesCache.get(sKey);
            if (!ser) {
              const created = await seriesMut.create.mutateAsync({
                brand_id: brand.id, name: seriesName, category, motor_type: motorType,
                display_order: seriesCache.size,
              });
              ser = { id: String((created as any).id), brandId: brand.id, name: seriesName } as any;
              seriesCache.set(sKey, ser);
              createdSeries++;
            }

            const values: Record<string, unknown> = {
              model: modelName,
              category,
              motor_type: motorType,
              brand: brandName,
              brand_id: brand.id,
              series_id: ser.id,
              length_mm: lengthMm,
              impeller_diameter: numOrNull(row.ImpellerDiameter),
              input_power_w: numOrNull(row.InputPowerW),
              input_power_low_w: numOrNull(row.InputPowerLowW),
              air_velocity_ms: numOrNull(row.AirVelocityMs),
              air_velocity_low_ms: numOrNull(row.AirVelocityLowMs),
              air_volume_cmh: numOrNull(row.AirVolumeCmh),
              air_volume_cfm: numOrNull(row.AirVolumeCfm),
              air_volume_low_cmh: numOrNull(row.AirVolumeLowCmh),
              air_volume_low_cfm: numOrNull(row.AirVolumeLowCfm),
              noise_db: numOrNull(row.NoiseDb),
              noise_low_db: numOrNull(row.NoiseLowDb),
              noise_63: numOrNull(row.Noise63),
              noise_125: numOrNull(row.Noise125),
              noise_250: numOrNull(row.Noise250),
              noise_500: numOrNull(row.Noise500),
              noise_1k: numOrNull(row.Noise1k),
              noise_2k: numOrNull(row.Noise2k),
              noise_4k: numOrNull(row.Noise4k),
              noise_8k: numOrNull(row.Noise8k),
              net_weight_kg: numOrNull(row.NetWeightKg),
              gross_weight_kg: numOrNull(row.GrossWeightKg),
              unit_size: row.UnitSize ? String(row.UnitSize) : null,
              carton_size: row.CartonSize ? String(row.CartonSize) : null,
              mounting_height_min: numOrNull(row.MountingHeightMin),
              mounting_height_max: numOrNull(row.MountingHeightMax),
              slot_width_mm: numOrNull(row.SlotWidthMm),
              voltage: row.Voltage ? String(row.Voltage) : null,
              frequency_hz: numOrNull(row.FrequencyHz),
              remarks: row.Remarks ? String(row.Remarks) : null,
              display_order: numOrNull(row.DisplayOrder) ?? 0,
            };

            const existing = models.find(
              (m) => m.model.toLowerCase() === modelName.toLowerCase() && m.seriesId === ser!.id
            );
            if (existing) {
              await modelMut.update.mutateAsync({ id: existing.id, values });
              updatedModels++;
            } else {
              await modelMut.create.mutateAsync(values);
              createdModels++;
            }
          } catch (err) {
            errors.push(`Failed: ${modelName} — ${err instanceof Error ? err.message : 'error'}`);
          }
        }

        toast.success(
          `Import complete: ${createdBrands} brand(s), ${createdSeries} series, ${createdModels} model(s) created, ${updatedModels} updated`
        );
        if (errors.length > 0) {
          toast.error(`${errors.length} error(s): ${errors.slice(0, 3).join(', ')}${errors.length > 3 ? '…' : ''}`);
        }
      } catch (err) {
        console.error('Import error:', err);
        toast.error('Failed to import Excel file. Please check the format.');
      } finally {
        setImporting(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };

    reader.readAsArrayBuffer(file);
  };

  return (
    <div className="kinair-card p-4 space-y-4">
      <div>
        <h3 className="font-semibold">Excel Import / Export</h3>
        <p className="text-sm text-muted-foreground">
          Export the full air curtain catalogue (brands, series, models, technical data) to Excel,
          edit it, and import it back. Missing brands and series are created automatically;
          existing models are matched by Brand + Series + Model and updated.
        </p>
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        onChange={handleImport}
        className="hidden"
        disabled={importing}
      />
      <div className="flex items-center gap-2">
        <Button variant="outline" onClick={handleExport}>
          <Download className="w-4 h-4 mr-2" />
          Export to Excel
        </Button>
        <Button onClick={() => fileInputRef.current?.click()} disabled={importing}>
          {importing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
          {importing ? 'Importing…' : 'Import from Excel'}
        </Button>
      </div>
    </div>
  );
}
