import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useProjects, useProjectItems, CreateProjectItemData } from '@/hooks/useProjects';
import { FanSelection, generateDynamicDescription } from '@/lib/fanData';
import { Plus } from 'lucide-react';
import { ProjectDialog } from './ProjectDialog';
import { supabase } from '@/integrations/backend/client';
import { toast } from 'sonner';
import jsPDF from 'jspdf';

interface AddToProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fanSelection: FanSelection;
  searchCriteria?: {
    airflow: number;
    pressure: number;
    altitude?: number;
    temperature?: number;
    airDensity?: number;
    frequency?: number;
    airflowUnit?: string;
    pressureUnit?: string;
  };
  /** All calculated/derived values to store for datasheet parity */
  calculatedValues?: {
    fanRPM?: number;
    outletVelocity?: number;
    dynamicPressure?: number;
    totalPressure?: number;
    casingWeight?: number;
    impellerWeight?: number;
    motorWeight?: number;
    totalWeight?: number;
    noiseDistance?: number;
    noiseDirectivityQ?: number;
    soundOutletReduction?: number;
    stallMinPercent?: number;
    stallMaxPercent?: number;
    vfdEnabled?: boolean;
    vfdFrequency?: number;
    voltageDriveEnabled?: boolean;
    driveVoltage?: number;
    nominalVoltage?: number;
    motorBrandName?: string;
    motorRatedCurrent?: number;
    motorFullLoadCurrent?: number;
    motorStartingCurrent?: number;
    motorVoltage?: number;
    motorIpRating?: string;
    motorInsulationClass?: string;
    motorEfficiencyClass?: string;
    motorFireRating?: string;
    motorPhase?: number;
    seriesId?: string;
    fanModelId?: string;
    selectedAccessories?: string[];
    flexibleDimensionValues?: Record<string, any>;
  };
  /** Pre-generated PDF document (optional - if not provided, will skip PDF storage) */
  pdfDocument?: jsPDF | null;
  /** PDF generator function for lazy generation */
  pdfGenerator?: () => Promise<jsPDF | null>;
}

export function AddToProjectDialog({ 
  open, 
  onOpenChange, 
  fanSelection,
  searchCriteria,
  calculatedValues,
  pdfDocument,
  pdfGenerator
}: AddToProjectDialogProps) {
  const { projects, createProject, isLoading: projectsLoading } = useProjects();
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [quantity, setQuantity] = useState(1);
  const [notes, setNotes] = useState('');
  const [showNewProjectDialog, setShowNewProjectDialog] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const { addItem } = useProjectItems(selectedProjectId || null);

  const handleAddToProject = async () => {
    if (!selectedProjectId) return;

    setIsSaving(true);

    try {
      // First, add the item to the project immediately (fast)
      const itemData: CreateProjectItemData = {
        project_id: selectedProjectId,
        series_name: fanSelection.series,
        diameter: fanSelection.diameter,
        blade_count: fanSelection.bladeCount,
        blade_angle: fanSelection.bladeAngle,
        motor_poles: fanSelection.motorPole,
        required_airflow: searchCriteria?.airflow || fanSelection.operatingPoint.airflow,
        required_pressure: searchCriteria?.pressure || fanSelection.operatingPoint.staticPressure,
        operating_airflow: fanSelection.operatingPoint.airflow,
        operating_pressure: fanSelection.operatingPoint.staticPressure,
        shaft_power: fanSelection.operatingPoint.shaftPower,
        efficiency: fanSelection.operatingPoint.efficiency,
        motor_rating_kw: fanSelection.motorRating,
        motor_frame: calculatedValues?.motorIpRating ? undefined : undefined,
        altitude: searchCriteria?.altitude || 0,
        temperature: searchCriteria?.temperature || 20,
        air_density: searchCriteria?.airDensity || 1.2,
        frequency: searchCriteria?.frequency || 50,
        quantity,
        nomenclature: fanSelection.nomenclature,
        notes: notes || undefined,
        datasheet_url: undefined, // Will be updated in background
        airflow_unit: searchCriteria?.airflowUnit || 'CMH',
        pressure_unit: searchCriteria?.pressureUnit || 'Pa',
        // New fields for complete datasheet parity
        noise_distance: calculatedValues?.noiseDistance,
        noise_directivity_q: calculatedValues?.noiseDirectivityQ,
        sound_outlet_reduction: calculatedValues?.soundOutletReduction,
        stall_min_percent: calculatedValues?.stallMinPercent,
        stall_max_percent: calculatedValues?.stallMaxPercent,
        vfd_enabled: calculatedValues?.vfdEnabled,
        vfd_frequency: calculatedValues?.vfdFrequency,
        voltage_drive_enabled: calculatedValues?.voltageDriveEnabled,
        drive_voltage: calculatedValues?.driveVoltage,
        nominal_voltage: calculatedValues?.nominalVoltage,
        motor_brand_name: calculatedValues?.motorBrandName,
        motor_rated_current: calculatedValues?.motorRatedCurrent,
        motor_full_load_current: calculatedValues?.motorFullLoadCurrent,
        motor_starting_current: calculatedValues?.motorStartingCurrent,
        motor_voltage: calculatedValues?.motorVoltage,
        motor_ip_rating: calculatedValues?.motorIpRating,
        motor_insulation_class: calculatedValues?.motorInsulationClass,
        motor_efficiency_class: calculatedValues?.motorEfficiencyClass,
        motor_weight: calculatedValues?.motorWeight,
        motor_fire_rating: calculatedValues?.motorFireRating,
        motor_phase: calculatedValues?.motorPhase,
        casing_weight: calculatedValues?.casingWeight,
        impeller_weight: calculatedValues?.impellerWeight,
        total_weight: calculatedValues?.totalWeight,
        fan_rpm: calculatedValues?.fanRPM,
        outlet_velocity: calculatedValues?.outletVelocity,
        dynamic_pressure: calculatedValues?.dynamicPressure,
        total_pressure: calculatedValues?.totalPressure,
        fire_class: fanSelection.fireClass,
        atex_rating: fanSelection.atexRating,
        selected_accessories: calculatedValues?.selectedAccessories,
        flexible_dimension_values: calculatedValues?.flexibleDimensionValues,
        series_id: calculatedValues?.seriesId,
        fan_model_id: calculatedValues?.fanModelId,
      };

      const newItem = await addItem.mutateAsync(itemData);
      
      // Close dialog immediately - PDF upload happens in background
      onOpenChange(false);
      resetForm();
      toast.success('Fan added to project');
      
      // Generate and upload PDF in background (non-blocking)
      if (pdfGenerator || pdfDocument) {
        uploadPdfInBackground(newItem.id, selectedProjectId);
      }
    } catch (error) {
      console.error('Error adding to project:', error);
      toast.error('Failed to add fan to project');
    } finally {
      setIsSaving(false);
    }
  };

  // Background PDF upload - doesn't block UI
  const uploadPdfInBackground = async (itemId: string, projectId: string) => {
    try {
      // Generate PDF (either use pre-generated or call generator)
      const pdfDoc = pdfDocument || (pdfGenerator ? await pdfGenerator() : null);
      
      if (!pdfDoc) {
        console.log('No PDF to upload');
        return;
      }

      const pdfBlob = pdfDoc.output('blob');
      const fileName = `${fanSelection.nomenclature.replace(/[^a-zA-Z0-9-_]/g, '_')}_${Date.now()}.pdf`;
      const filePath = `datasheets/${projectId}/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('project-datasheets')
        .upload(filePath, pdfBlob, {
          contentType: 'application/pdf',
          upsert: false,
        });

      if (uploadError) {
        console.error('PDF upload error:', uploadError);
        return;
      }

      // Bucket is private: store the storage path, generate signed URLs on demand
      await supabase
        .from('project_items')
        .update({ datasheet_url: filePath })
        .eq('id', itemId);

      console.log('PDF uploaded and item updated:', filePath);

    } catch (error) {
      console.error('Background PDF upload failed:', error);
      // Non-critical - item is already saved
    }
  };

  const resetForm = () => {
    setSelectedProjectId('');
    setQuantity(1);
    setNotes('');
  };

  const handleCreateProject = async (data: { name: string; description?: string }) => {
    const newProject = await createProject.mutateAsync(data);
    setSelectedProjectId(newProject.id);
    setShowNewProjectDialog(false);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Add Fan to Project</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* Fan Summary */}
            <div className="p-3 bg-muted rounded-lg space-y-1">
              <p className="font-medium">{fanSelection.nomenclature}</p>
              <p className="text-sm text-muted-foreground">
                {fanSelection.series} • {generateDynamicDescription(fanSelection.nomenclatureTemplate, {
                  diameter: fanSelection.diameter,
                  bladeCount: fanSelection.bladeCount,
                  bladeAngle: fanSelection.bladeAngle,
                  motorPole: fanSelection.motorPole,
                  motorRating: fanSelection.motorRating,
                  series: fanSelection.series,
                  fireClass: fanSelection.fireClass,
                }) || `Ø${fanSelection.diameter}mm`}
              </p>
              <p className="text-sm text-muted-foreground">
                {fanSelection.operatingPoint.airflow.toFixed(0)} m³/h @ {fanSelection.operatingPoint.staticPressure.toFixed(0)} Pa
              </p>
            </div>

            {/* Project Selection */}
            <div className="space-y-2">
              <Label>Select Project</Label>
              <div className="flex gap-2">
                <Select value={selectedProjectId} onValueChange={setSelectedProjectId}>
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder={projectsLoading ? 'Loading...' : 'Select a project'} />
                  </SelectTrigger>
                  <SelectContent>
                    {projects.map((project) => (
                      <SelectItem key={project.id} value={project.id}>
                        {project.name}
                        {project.project_reference && ` (${project.project_reference})`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button 
                  type="button" 
                  variant="outline" 
                  size="icon"
                  onClick={() => setShowNewProjectDialog(true)}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Quantity */}
            <div className="space-y-2">
              <Label htmlFor="quantity">Quantity</Label>
              <Input
                id="quantity"
                type="number"
                min={1}
                value={quantity}
                onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
              />
            </div>

            {/* Notes */}
            <div className="space-y-2">
              <Label htmlFor="notes">Notes (optional)</Label>
              <Textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Application notes, location, etc."
                rows={2}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleAddToProject}
              disabled={!selectedProjectId || addItem.isPending || isSaving}
            >
              {isSaving ? 'Adding...' : 'Add to Project'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ProjectDialog
        open={showNewProjectDialog}
        onOpenChange={setShowNewProjectDialog}
        onSave={handleCreateProject}
        isLoading={createProject.isPending}
      />
    </>
  );
}
