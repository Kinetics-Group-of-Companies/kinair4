import { useRef, useState } from 'react';
import { Download, Upload, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import * as XLSX from 'xlsx';
import { toast } from 'sonner';
import {
  useCasingWeights,
  useUpsertCasingWeight,
  useImpellerWeights,
  useUpsertImpellerWeight,
} from '@/hooks/useFanDatabase';

export function WeightExcelImportExport() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isImporting, setIsImporting] = useState(false);

  const { data: casingWeights = [] } = useCasingWeights();
  const { data: impellerWeights = [] } = useImpellerWeights();
  const upsertCasing = useUpsertCasingWeight();
  const upsertImpeller = useUpsertImpellerWeight();

  const handleExport = () => {
    const wb = XLSX.utils.book_new();

    // Casing Weights Sheet
    const casingData = casingWeights.length > 0
      ? casingWeights.map(cw => ({
          'Fan Model Size': cw.diameter,
          'Weight (kg)': cw.weight,
        }))
      : [{ 'Fan Model Size': 315, 'Weight (kg)': 22 }]; // Template row

    const casingWs = XLSX.utils.json_to_sheet(casingData);
    
    // Set column widths for casing sheet
    casingWs['!cols'] = [
      { wch: 15 },
      { wch: 12 },
    ];
    XLSX.utils.book_append_sheet(wb, casingWs, 'Casing Weights');

    // Impeller Weights Sheet
    const impellerData = impellerWeights.length > 0
      ? impellerWeights.map(iw => ({
          'Fan Model Size': iw.diameter,
          'Blade Count': iw.bladeCount,
          'Weight (kg)': iw.weight,
        }))
      : [{ 'Fan Model Size': 315, 'Blade Count': 4, 'Weight (kg)': 3 }]; // Template row

    const impellerWs = XLSX.utils.json_to_sheet(impellerData);
    
    // Set column widths for impeller sheet
    impellerWs['!cols'] = [
      { wch: 15 },
      { wch: 12 },
      { wch: 12 },
    ];
    XLSX.utils.book_append_sheet(wb, impellerWs, 'Impeller Weights');

    // Instructions Sheet
    const instructionsData = [
      { 'Instructions': 'Weight Data Import/Export Guide' },
      { 'Instructions': '' },
      { 'Instructions': 'CASING WEIGHTS SHEET:' },
      { 'Instructions': '- Fan Model Size: The fan diameter/size in mm (e.g., 315, 400, 500)' },
      { 'Instructions': '- Weight (kg): The weight of the casing in kilograms' },
      { 'Instructions': '' },
      { 'Instructions': 'IMPELLER WEIGHTS SHEET:' },
      { 'Instructions': '- Fan Model Size: The fan diameter/size in mm' },
      { 'Instructions': '- Blade Count: Number of blades on the impeller (e.g., 4, 6, 8)' },
      { 'Instructions': '- Weight (kg): The weight of the impeller in kilograms' },
      { 'Instructions': '' },
      { 'Instructions': 'NOTES:' },
      { 'Instructions': '- Existing data with same Fan Model Size (and Blade Count for impellers) will be updated' },
      { 'Instructions': '- New entries will be added' },
      { 'Instructions': '- Leave Weight as 0 if unknown' },
    ];
    const instructionsWs = XLSX.utils.json_to_sheet(instructionsData);
    instructionsWs['!cols'] = [{ wch: 80 }];
    XLSX.utils.book_append_sheet(wb, instructionsWs, 'Instructions');

    // Generate filename with date
    const date = new Date().toISOString().split('T')[0];
    const filename = `weight_data_${date}.xlsx`;
    
    XLSX.writeFile(wb, filename);
    toast.success('Weight data exported successfully');
  };

  const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsImporting(true);

    try {
      const data = await file.arrayBuffer();
      const wb = XLSX.read(data);

      let casingCount = 0;
      let impellerCount = 0;

      // Process Casing Weights
      const casingSheet = wb.Sheets['Casing Weights'];
      if (casingSheet) {
        const casingRows = XLSX.utils.sheet_to_json<{
          'Fan Model Size': number;
          'Weight (kg)': number;
        }>(casingSheet);

        for (const row of casingRows) {
          const diameter = row['Fan Model Size'];
          const weight = row['Weight (kg)'];

          if (diameter && diameter > 0) {
            await upsertCasing.mutateAsync({
              diameter: Number(diameter),
              weight: Number(weight) || 0,
            });
            casingCount++;
          }
        }
      }

      // Process Impeller Weights
      const impellerSheet = wb.Sheets['Impeller Weights'];
      if (impellerSheet) {
        const impellerRows = XLSX.utils.sheet_to_json<{
          'Fan Model Size': number;
          'Blade Count': number;
          'Weight (kg)': number;
        }>(impellerSheet);

        for (const row of impellerRows) {
          const diameter = row['Fan Model Size'];
          const bladeCount = row['Blade Count'];
          const weight = row['Weight (kg)'];

          if (diameter && diameter > 0 && bladeCount && bladeCount > 0) {
            await upsertImpeller.mutateAsync({
              diameter: Number(diameter),
              bladeCount: Number(bladeCount),
              weight: Number(weight) || 0,
            });
            impellerCount++;
          }
        }
      }

      toast.success(`Imported ${casingCount} casing weights and ${impellerCount} impeller weights`);
    } catch (error) {
      console.error('Import error:', error);
      toast.error('Failed to import weight data. Please check the file format.');
    } finally {
      setIsImporting(false);
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  return (
    <div className="flex items-center gap-2">
      <Button variant="outline" size="sm" onClick={handleExport}>
        <Download className="w-4 h-4 mr-1" />
        Export
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={() => fileInputRef.current?.click()}
        disabled={isImporting}
      >
        {isImporting ? (
          <Loader2 className="w-4 h-4 mr-1 animate-spin" />
        ) : (
          <Upload className="w-4 h-4 mr-1" />
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
