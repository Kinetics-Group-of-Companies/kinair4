import { useRef, useState } from 'react';
import { Download, Upload, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import * as XLSX from 'xlsx';
import { toast } from 'sonner';
import {
  useDimensionSchema,
  useDimensionValues,
  useUpsertDimensionValue,
  DimensionParam,
} from '@/hooks/useFlexibleDimensions';

interface DimensionExcelImportExportProps {
  seriesId: string;
  seriesName: string;
}

export function DimensionExcelImportExport({ seriesId, seriesName }: DimensionExcelImportExportProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isImporting, setIsImporting] = useState(false);

  const { data: schema = [] } = useDimensionSchema(seriesId);
  const { data: values = [] } = useDimensionValues(seriesId);
  const upsertValue = useUpsertDimensionValue();

  const handleExport = () => {
    if (!seriesId) {
      toast.error('Please select a series first');
      return;
    }

    const wb = XLSX.utils.book_new();

    // Build header row: Size + all dimension parameters
    const headers = ['Size', ...schema.map(p => p.param_label)];
    
    // Build data rows
    const dataRows = values.length > 0
      ? values.map(v => {
          const row: Record<string, string | number> = { 'Size': v.size };
          schema.forEach(p => {
            row[p.param_label] = v.values[p.param_key] ?? '';
          });
          return row;
        })
      : [{ 'Size': 315, ...Object.fromEntries(schema.map(p => [p.param_label, ''])) }]; // Template row

    const ws = XLSX.utils.json_to_sheet(dataRows, { header: headers });
    
    // Set column widths
    ws['!cols'] = headers.map(() => ({ wch: 15 }));
    XLSX.utils.book_append_sheet(wb, ws, 'Dimensions');

    // Schema reference sheet
    const schemaData = schema.map(p => ({
      'Parameter Key': p.param_key,
      'Label': p.param_label,
      'Type': p.param_type,
      'Order': p.display_order,
    }));
    if (schemaData.length > 0) {
      const schemaWs = XLSX.utils.json_to_sheet(schemaData);
      schemaWs['!cols'] = [{ wch: 15 }, { wch: 15 }, { wch: 10 }, { wch: 8 }];
      XLSX.utils.book_append_sheet(wb, schemaWs, 'Schema Reference');
    }

    // Instructions sheet
    const instructionsData = [
      { 'Instructions': `Dimension Data Import/Export Guide for ${seriesName}` },
      { 'Instructions': '' },
      { 'Instructions': 'DIMENSIONS SHEET:' },
      { 'Instructions': '- Size: The fan diameter/size in mm (e.g., 315, 400, 500)' },
      ...schema.map(p => ({ 'Instructions': `- ${p.param_label}: ${p.param_key} dimension value` })),
      { 'Instructions': '' },
      { 'Instructions': 'NOTES:' },
      { 'Instructions': '- Existing data with same Size will be updated' },
      { 'Instructions': '- New sizes will be added' },
      { 'Instructions': '- Use the Schema Reference sheet to understand column mapping' },
      { 'Instructions': '- Column headers must match the parameter labels exactly' },
    ];
    const instructionsWs = XLSX.utils.json_to_sheet(instructionsData);
    instructionsWs['!cols'] = [{ wch: 80 }];
    XLSX.utils.book_append_sheet(wb, instructionsWs, 'Instructions');

    // Generate filename with date and series name
    const date = new Date().toISOString().split('T')[0];
    const safeName = seriesName.replace(/[^a-zA-Z0-9]/g, '_');
    const filename = `dimensions_${safeName}_${date}.xlsx`;
    
    XLSX.writeFile(wb, filename);
    toast.success('Dimension data exported successfully');
  };

  const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!seriesId) {
      toast.error('Please select a series first');
      return;
    }

    setIsImporting(true);

    try {
      const data = await file.arrayBuffer();
      const wb = XLSX.read(data);

      let importCount = 0;

      // Process Dimensions sheet
      const dimensionsSheet = wb.Sheets['Dimensions'];
      if (dimensionsSheet) {
        const rows = XLSX.utils.sheet_to_json<Record<string, string | number>>(dimensionsSheet);

        // Create a map from label to key for lookup
        const labelToKey: Record<string, string> = {};
        schema.forEach(p => {
          labelToKey[p.param_label] = p.param_key;
        });

        for (const row of rows) {
          const size = Number(row['Size']);
          if (!size || size <= 0) continue;

          // Build values object from row data
          const dimensionValues: Record<string, string | number> = {};
          Object.keys(row).forEach(header => {
            if (header === 'Size') return;
            const paramKey = labelToKey[header];
            if (paramKey) {
              dimensionValues[paramKey] = row[header];
            }
          });

          await upsertValue.mutateAsync({
            seriesId,
            size,
            values: dimensionValues,
            is_from_model: false,
          });
          importCount++;
        }
      }

      toast.success(`Imported ${importCount} dimension rows`);
    } catch (error) {
      console.error('Import error:', error);
      toast.error('Failed to import dimension data');
    } finally {
      setIsImporting(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  return (
    <div className="flex items-center gap-2">
      <Button
        variant="outline"
        size="sm"
        onClick={handleExport}
        disabled={!seriesId}
      >
        <Download className="w-4 h-4" />
        Export
      </Button>
      
      <Button
        variant="outline"
        size="sm"
        onClick={() => fileInputRef.current?.click()}
        disabled={isImporting || !seriesId}
      >
        {isImporting ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <Upload className="w-4 h-4" />
        )}
        Import
      </Button>
      
      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx,.xls"
        onChange={handleImport}
        className="hidden"
      />
    </div>
  );
}
