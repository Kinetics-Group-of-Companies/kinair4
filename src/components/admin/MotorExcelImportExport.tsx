import { useRef, useState } from 'react';
import { FileSpreadsheet, Download, Upload, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import * as XLSX from 'xlsx';
import { toast } from 'sonner';
import {
  useMotorBrands,
  useMotorSpecifications,
  useAddMotorBrand,
  useAddMotorSpecification,
  useUpdateMotorSpecification,
} from '@/hooks/useFanDatabase';

export function MotorExcelImportExport() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  
  const { data: motorBrands = [] } = useMotorBrands();
  const { data: motorSpecs = [] } = useMotorSpecifications();
  const addBrand = useAddMotorBrand();
  const addSpec = useAddMotorSpecification();
  const updateSpec = useUpdateMotorSpecification();

  const handleExport = () => {
    const workbook = XLSX.utils.book_new();
    
    if (motorSpecs.length === 0) {
      // Create template with sample data
      const templateData = [
        {
          'Brand': 'ABB',
          'Phase': 3,
          'Motor Poles': 4,
          'Rating (kW)': 1.5,
          'Motor Frame': '90L',
          'Motor Weight (kg)': 15,
          'Full Load Current (A)': 3.5,
          'Rated Current (A)': 3.2,
          'Starting Current (A)': 21,
          'Voltage (V)': 415,
          'Frequency (Hz)': 50,
          'IP Rating': 'IP55',
          'Insulation Class': 'F',
          'Efficiency Class': 'IE3',
          'RPM': 1440,
          'Fire Rating': '',
        },
        {
          'Brand': 'Siemens',
          'Phase': 1,
          'Motor Poles': 2,
          'Rating (kW)': 2.2,
          'Motor Frame': '100L',
          'Motor Weight (kg)': 22,
          'Full Load Current (A)': 4.8,
          'Rated Current (A)': 4.5,
          'Starting Current (A)': 28,
          'Voltage (V)': 220,
          'Frequency (Hz)': 50,
          'IP Rating': 'IP55',
          'Insulation Class': 'F',
          'Efficiency Class': 'IE3',
          'RPM': 2880,
          'Fire Rating': 'F300',
        },
      ];
      
      const worksheet = XLSX.utils.json_to_sheet(templateData);
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Motor Specifications');
      
      // Add instructions sheet
      const instructions = [
        { Instructions: 'Motor Specifications Template' },
        { Instructions: '' },
        { Instructions: 'Fill in motor specifications data in the "Motor Specifications" sheet.' },
        { Instructions: '' },
        { Instructions: 'Columns:' },
        { Instructions: '- Brand: Motor brand name (e.g., ABB, Siemens, WEG)' },
        { Instructions: '- Phase: Number of phases (1 or 3, default is 3)' },
        { Instructions: '- Motor Poles: Number of poles (2, 4, 6, 8, etc.)' },
        { Instructions: '- Rating (kW): Motor power rating in kilowatts' },
        { Instructions: '- Motor Frame: Frame size (e.g., 90L, 100L, 112M)' },
        { Instructions: '- Motor Weight (kg): Weight in kilograms' },
        { Instructions: '- Full Load Current (A): Full load current in amperes' },
        { Instructions: '- Rated Current (A): Rated current in amperes' },
        { Instructions: '- Starting Current (A): Starting/inrush current in amperes' },
        { Instructions: '- Voltage (V): Voltage rating (220, 380, 400, 415, 440, 480, 690)' },
        { Instructions: '- Frequency (Hz): Frequency (50 or 60)' },
        { Instructions: '- IP Rating: IP rating (IP44, IP54, IP55, IP56, IP65, IP66)' },
        { Instructions: '- Insulation Class: Insulation class (F or H)' },
        { Instructions: '- Efficiency Class: Efficiency class (IE1, IE2, IE3, IE4)' },
        { Instructions: '- RPM: Rotations per minute' },
        { Instructions: '- Fire Rating: Fire rating (leave empty, F300, or F400)' },
      ];
      const instructionSheet = XLSX.utils.json_to_sheet(instructions);
      XLSX.utils.book_append_sheet(workbook, instructionSheet, 'Instructions');
    } else {
      // Export existing data
      const exportData = motorSpecs.map(spec => ({
        'Brand': (spec as any).brandName || motorBrands.find(b => b.id === spec.brandId)?.name || '',
        'Phase': spec.phase || 3,
        'Motor Poles': spec.motorPoles,
        'Rating (kW)': spec.ratingKW,
        'Motor Frame': spec.motorFrame || '',
        'Motor Weight (kg)': spec.motorWeight || 0,
        'Full Load Current (A)': spec.fullLoadCurrent || 0,
        'Rated Current (A)': spec.ratedCurrent || 0,
        'Starting Current (A)': spec.startingCurrent || 0,
        'Voltage (V)': spec.voltage || 415,
        'Frequency (Hz)': spec.frequency || 50,
        'IP Rating': spec.ipRating || 'IP55',
        'Insulation Class': spec.insulationClass || 'F',
        'Efficiency Class': spec.efficiencyClass || 'IE3',
        'RPM': spec.rpm || 0,
        'Fire Rating': spec.fireRating || '',
      }));
      
      const worksheet = XLSX.utils.json_to_sheet(exportData);
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Motor Specifications');
    }
    
    XLSX.writeFile(workbook, `motor_specifications_${new Date().toISOString().split('T')[0]}.xlsx`);
    toast.success('Motor specifications exported successfully');
  };

  const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    
    setImporting(true);
    
    try {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const data = new Uint8Array(e.target?.result as ArrayBuffer);
          const workbook = XLSX.read(data, { type: 'array' });
          
          const sheetName = workbook.SheetNames.find(s => s.toLowerCase().includes('motor') || s.toLowerCase().includes('spec')) || workbook.SheetNames[0];
          const worksheet = workbook.Sheets[sheetName];
          const jsonData = XLSX.utils.sheet_to_json(worksheet);
          
          if (jsonData.length === 0) {
            toast.error('No data found in the Excel file');
            return;
          }
          
          let addedCount = 0;
          let updatedCount = 0;
          let errorCount = 0;
          
          // Create a map of brand names to IDs
          const brandMap = new Map(motorBrands.map(b => [b.name.toLowerCase(), b.id]));
          const newBrandsToAdd = new Set<string>();
          
          // First pass: identify new brands
          for (const row of jsonData as any[]) {
            const brandName = row['Brand']?.toString().trim();
            if (brandName && !brandMap.has(brandName.toLowerCase())) {
              newBrandsToAdd.add(brandName);
            }
          }
          
          // Add new brands
          for (const brandName of newBrandsToAdd) {
            try {
              await addBrand.mutateAsync(brandName);
              // Note: we'll refetch brands after import
            } catch (error) {
              console.error('Error adding brand:', brandName, error);
            }
          }
          
          // Wait a bit for the brand additions to settle
          await new Promise(resolve => setTimeout(resolve, 500));
          
          // Get updated brand list
          const updatedBrands = [...motorBrands];
          for (const brandName of newBrandsToAdd) {
            const existing = updatedBrands.find(b => b.name.toLowerCase() === brandName.toLowerCase());
            if (!existing) {
              // We'll need to match by name later
              brandMap.set(brandName.toLowerCase(), brandName); // temporary placeholder
            }
          }
          
          // Second pass: add/update motor specifications
          for (const row of jsonData as any[]) {
            try {
              const brandName = row['Brand']?.toString().trim();
              const motorPoles = parseInt(row['Motor Poles']) || 4;
              const ratingKW = parseFloat(row['Rating (kW)']) || 0;
              
              if (!brandName || ratingKW <= 0) {
                errorCount++;
                continue;
              }
              
              let brandId = brandMap.get(brandName.toLowerCase());
              
              // If brandId is the name (placeholder), we need to find the actual ID
              if (brandId === brandName) {
                // Refetch needed, but for now skip
                errorCount++;
                continue;
              }
              
              if (!brandId) {
                errorCount++;
                continue;
              }
              
              const specData = {
                brandId,
                motorPoles,
                ratingKW,
                phase: parseInt(row['Phase']) || 3,
                motorFrame: row['Motor Frame']?.toString() || '',
                motorWeight: parseFloat(row['Motor Weight (kg)']) || 0,
                fullLoadCurrent: parseFloat(row['Full Load Current (A)']) || 0,
                ratedCurrent: parseFloat(row['Rated Current (A)']) || 0,
                startingCurrent: parseFloat(row['Starting Current (A)']) || 0,
                voltage: parseInt(row['Voltage (V)']) || 415,
                frequency: parseInt(row['Frequency (Hz)']) || 50,
                ipRating: row['IP Rating']?.toString() || 'IP55',
                insulationClass: row['Insulation Class']?.toString() || 'F',
                efficiencyClass: row['Efficiency Class']?.toString() || 'IE3',
                rpm: parseInt(row['RPM']) || 0,
                fireRating: row['Fire Rating']?.toString() || '',
              };
              
              // Check if a spec with same brand, poles, and rating exists
              const existingSpec = motorSpecs.find(
                s => s.brandId === brandId && 
                     s.motorPoles === motorPoles && 
                     s.ratingKW === ratingKW
              );
              
              if (existingSpec) {
                await updateSpec.mutateAsync({ id: existingSpec.id, updates: specData });
                updatedCount++;
              } else {
                await addSpec.mutateAsync(specData as any);
                addedCount++;
              }
            } catch (error) {
              console.error('Error processing row:', row, error);
              errorCount++;
            }
          }
          
          if (addedCount > 0 || updatedCount > 0) {
            toast.success(`Import complete: ${addedCount} added, ${updatedCount} updated${errorCount > 0 ? `, ${errorCount} errors` : ''}`);
          } else if (errorCount > 0) {
            toast.error(`Import failed with ${errorCount} errors. Check the file format.`);
          } else {
            toast.info('No changes were made');
          }
        } catch (parseError) {
          console.error('Parse error:', parseError);
          toast.error('Failed to parse Excel file');
        } finally {
          setImporting(false);
        }
      };
      
      reader.readAsArrayBuffer(file);
    } catch (error) {
      console.error('Import error:', error);
      toast.error('Failed to import file');
      setImporting(false);
    }
    
    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="flex items-center gap-2">
      <Button variant="outline" size="sm" onClick={handleExport}>
        <Download className="w-4 h-4 mr-1" />
        Export
      </Button>
      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx,.xls"
        className="hidden"
        onChange={handleImport}
      />
      <Button 
        variant="outline" 
        size="sm" 
        onClick={() => fileInputRef.current?.click()}
        disabled={importing}
      >
        {importing ? (
          <Loader2 className="w-4 h-4 mr-1 animate-spin" />
        ) : (
          <Upload className="w-4 h-4 mr-1" />
        )}
        Import
      </Button>
    </div>
  );
}
