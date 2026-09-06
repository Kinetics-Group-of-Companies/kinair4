import { useState } from 'react';
import { Edit2, Save, X, Plus, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useUpdateFanModel, useUpdateBladeConfiguration, useAddBladeConfiguration, useDeleteBladeConfiguration, useFanModels } from '@/hooks/useFanDatabase';
import { FanModel, getFanModelDisplayName } from '@/lib/fanData';
import { toast } from 'sonner';

interface FanModelEditorProps {
  fan: FanModel & { seriesId?: string; referencePoles?: number; productCode?: string };
  fanType?: 'axial' | 'centrifugal';
}

export function FanModelEditor({ fan, fanType = 'axial' }: FanModelEditorProps) {
  const { data: allFans = [] } = useFanModels();
  const updateFanMutation = useUpdateFanModel();
  const updateBladeConfigMutation = useUpdateBladeConfiguration();
  const addBladeConfigMutation = useAddBladeConfiguration();
  const deleteBladeConfigMutation = useDeleteBladeConfiguration();
  
  const isCentrifugal = fanType === 'centrifugal';
  
  // For centrifugal fans, blade count/angle are not applicable - use defaults (0/0)
  const hasBladeData = !isCentrifugal;
  
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editedDiameter, setEditedDiameter] = useState(fan.diameter);
  const [editedModelName, setEditedModelName] = useState(fan.modelName || '');
  const [editedProductCode, setEditedProductCode] = useState(fan.productCode || '');
  const [editedMotorPoles, setEditedMotorPoles] = useState<number[]>(fan.motorPoles);
  const [editedReferencePoles, setEditedReferencePoles] = useState<number>(fan.referencePoles || fan.motorPoles[0] || 4);
  const [editedBladeConfigs, setEditedBladeConfigs] = useState<number[]>(
    hasBladeData ? fan.bladeConfigurations.map(bc => bc.bladeCount) : [0]
  );
  const [editedBladeAngles, setEditedBladeAngles] = useState<number[]>(
    hasBladeData ? (fan.bladeConfigurations[0]?.bladeAngles || []) : [0]
  );
  const [newAngleInput, setNewAngleInput] = useState('');
  const [newBladeCountInput, setNewBladeCountInput] = useState('');
  const [newMotorPoleInput, setNewMotorPoleInput] = useState('');
  const [newModelInput, setNewModelInput] = useState('');

  // Get model names/diameters used by other fans in the same series (for validation)
  const usedModels = allFans
    .filter(f => f.series === fan.series && f.id !== fan.id)
    .map(f => f.modelName || String(f.diameter));

  const handleStartEdit = () => {
    setEditedDiameter(fan.diameter);
    setEditedModelName(fan.modelName || '');
    setEditedProductCode(fan.productCode || '');
    setEditedMotorPoles([...fan.motorPoles]);
    setEditedReferencePoles(fan.referencePoles || fan.motorPoles[0] || 4);
    setEditedBladeConfigs(hasBladeData ? fan.bladeConfigurations.map(bc => bc.bladeCount) : [0]);
    setEditedBladeAngles(hasBladeData ? (fan.bladeConfigurations[0]?.bladeAngles || []) : [0]);
    setIsEditing(true);
  };

  const handleCancel = () => {
    setEditedDiameter(fan.diameter);
    setEditedModelName(fan.modelName || '');
    setEditedProductCode(fan.productCode || '');
    setEditedMotorPoles([...fan.motorPoles]);
    setEditedReferencePoles(fan.referencePoles || fan.motorPoles[0] || 4);
    setEditedBladeConfigs(hasBladeData ? fan.bladeConfigurations.map(bc => bc.bladeCount) : [0]);
    setEditedBladeAngles(hasBladeData ? (fan.bladeConfigurations[0]?.bladeAngles || []) : [0]);
    setNewAngleInput('');
    setNewBladeCountInput('');
    setNewMotorPoleInput('');
    setNewModelInput('');
    setIsEditing(false);
  };

  const handleAddMotorPole = () => {
    const pole = parseInt(newMotorPoleInput);
    if (isNaN(pole) || pole < 2 || pole > 24 || pole % 2 !== 0) {
      toast.error('Motor pole must be an even number between 2 and 24');
      return;
    }
    if (editedMotorPoles.includes(pole)) {
      toast.error('Motor pole already exists');
      return;
    }
    setEditedMotorPoles(prev => [...prev, pole].sort((a, b) => a - b));
    setNewMotorPoleInput('');
  };

  const handleRemoveMotorPole = (pole: number) => {
    setEditedMotorPoles(prev => prev.filter(p => p !== pole));
  };

  const handleChangeModel = () => {
    const modelValue = newModelInput.trim();
    if (!modelValue) {
      toast.error('Please enter a model name or size');
      return;
    }
    // Check if model is already used by another fan in this series
    if (usedModels.includes(modelValue)) {
      toast.error('This model is already used by another fan in this series');
      return;
    }
    
    // For centrifugal fans, use model name; for axial, parse as diameter
    if (isCentrifugal) {
      setEditedModelName(modelValue);
      // Extract numeric part if possible for diameter (e.g., "7/7" -> 7)
      const numMatch = modelValue.match(/^(\d+)/);
      if (numMatch) {
        setEditedDiameter(parseInt(numMatch[1]) * 25.4); // Convert inches to mm approximately
      }
    } else {
      const diameter = parseInt(modelValue);
      if (isNaN(diameter) || diameter < 100 || diameter > 3000) {
        toast.error('Diameter must be between 100 and 3000mm');
        return;
      }
      setEditedDiameter(diameter);
      setEditedModelName('');
    }
    setNewModelInput('');
    toast.success(`Model set to ${modelValue}`);
  };

  const handleAddBladeCount = () => {
    const count = parseInt(newBladeCountInput);
    if (isNaN(count) || count < 2 || count > 24) {
      toast.error('Blade count must be between 2 and 24');
      return;
    }
    if (editedBladeConfigs.includes(count)) {
      toast.error('Blade count already exists');
      return;
    }
    setEditedBladeConfigs(prev => [...prev, count].sort((a, b) => a - b));
    setNewBladeCountInput('');
  };

  const handleRemoveBladeCount = (count: number) => {
    setEditedBladeConfigs(prev => prev.filter(c => c !== count));
  };

  const handleAddBladeAngle = () => {
    const angle = parseInt(newAngleInput);
    if (isNaN(angle) || angle < 5 || angle > 90) {
      toast.error('Blade angle must be between 5 and 90 degrees');
      return;
    }
    if (editedBladeAngles.includes(angle)) {
      toast.error('Blade angle already exists');
      return;
    }
    setEditedBladeAngles(prev => [...prev, angle].sort((a, b) => a - b));
    setNewAngleInput('');
  };

  const handleRemoveBladeAngle = (angle: number) => {
    setEditedBladeAngles(prev => prev.filter(a => a !== angle));
  };

  const handleSave = async () => {
    if (editedMotorPoles.length === 0) {
      toast.error('At least one motor pole is required');
      return;
    }
    
    // For axial fans, require blade configs and angles
    if (hasBladeData) {
      if (editedBladeConfigs.length === 0) {
        toast.error('At least one blade configuration is required');
        return;
      }
      if (editedBladeAngles.length === 0) {
        toast.error('At least one blade angle is required');
        return;
      }
    }
    
    // Ensure reference poles is in the motor poles list
    const validReferencePoles = editedMotorPoles.includes(editedReferencePoles) 
      ? editedReferencePoles 
      : editedMotorPoles[0];

    setIsSaving(true);
    try {
      // Check if product code is unique (excluding current fan)
      if (editedProductCode) {
        const existingFan = allFans.find(f => f.productCode === editedProductCode && f.id !== fan.id);
        if (existingFan) {
          toast.error(`Product code "${editedProductCode}" is already used by another fan model`);
          setIsSaving(false);
          return;
        }
      }

      // Update fan model (diameter/model_name, motor poles, reference poles, and product code)
      await updateFanMutation.mutateAsync({
        id: fan.id,
        updates: {
          diameter: editedDiameter,
          model_name: editedModelName || undefined,
          motor_poles: editedMotorPoles.sort((a, b) => a - b),
          reference_poles: validReferencePoles,
          product_code: editedProductCode || null,
        }
      });

      // Handle blade configurations
      const existingBladeCounts = fan.bladeConfigurations.map(bc => bc.bladeCount);
      
      // For centrifugal fans without any blade config, create default config (bladeCount=0, angle=0)
      if (isCentrifugal && fan.bladeConfigurations.length === 0) {
        await addBladeConfigMutation.mutateAsync({
          fanModelId: fan.id,
          bladeCount: 0,
          bladeAngles: [0],
        });
      } else {
        // Add new blade configs
        for (const bladeCount of editedBladeConfigs) {
          if (!existingBladeCounts.includes(bladeCount)) {
            await addBladeConfigMutation.mutateAsync({
              fanModelId: fan.id,
              bladeCount,
              bladeAngles: editedBladeAngles,
            });
          }
        }

        // Remove deleted blade configs (only for axial fans)
        if (!isCentrifugal) {
          for (const bc of fan.bladeConfigurations) {
            if (!editedBladeConfigs.includes(bc.bladeCount)) {
              const configId = (bc as any).id;
              if (configId) {
                await deleteBladeConfigMutation.mutateAsync(configId);
              }
            }
          }
        }

        // Update existing blade configs with new angles
        for (const bc of fan.bladeConfigurations) {
          if (editedBladeConfigs.includes(bc.bladeCount)) {
            const configId = (bc as any).id;
            if (configId) {
              await updateBladeConfigMutation.mutateAsync({
                bladeConfigId: configId,
                updates: {
                  blade_count: bc.bladeCount,
                  blade_angles: editedBladeAngles,
                }
              });
            }
          }
        }
      }

      setIsEditing(false);
      toast.success('Fan model updated. Changes are now available in the Fan Selector.');
    } catch (error) {
      console.error('Error saving fan model:', error);
      toast.error('Failed to save fan model');
    } finally {
      setIsSaving(false);
    }
  };


  if (!isEditing) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h4 className="font-medium text-foreground">Fan Model Properties</h4>
          <Button variant="outline" size="sm" onClick={handleStartEdit}>
            <Edit2 className="w-4 h-4" />
            Edit
          </Button>
        </div>
        
        <div className={`grid grid-cols-2 ${hasBladeData ? 'md:grid-cols-6' : 'md:grid-cols-4'} gap-4`}>
          <div className="kinair-stat">
            <div className="kinair-stat-label">{isCentrifugal ? 'Model' : 'Diameter'}</div>
            <div className="kinair-stat-value">{fan.modelName || `Ø${fan.diameter}mm`}</div>
          </div>
          <div className="kinair-stat">
            <div className="kinair-stat-label">Product Code</div>
            <div className="kinair-stat-value">{fan.productCode || <span className="text-muted-foreground text-sm">Not set</span>}</div>
          </div>
          <div className="kinair-stat">
            <div className="kinair-stat-label">Motor Poles</div>
            <div className="kinair-stat-value">{fan.motorPoles.map(p => `${p}P`).join(', ')}</div>
          </div>
          <div className="kinair-stat">
            <div className="kinair-stat-label">Reference Poles</div>
            <div className="kinair-stat-value">{fan.referencePoles || fan.motorPoles[0] || 4}P (base data)</div>
          </div>
          {hasBladeData && (
            <>
              <div className="kinair-stat">
                <div className="kinair-stat-label">Blade Configurations</div>
                <div className="kinair-stat-value">
                  {fan.bladeConfigurations.filter(bc => bc.bladeCount > 0).map(bc => `${bc.bladeCount} blades`).join(', ') || 'N/A'}
                </div>
              </div>
              <div className="kinair-stat">
                <div className="kinair-stat-label">Blade Angles</div>
                <div className="kinair-stat-value text-sm">
                  {fan.bladeConfigurations[0]?.bladeAngles?.filter(a => a > 0).length > 0
                    ? fan.bladeConfigurations[0].bladeAngles.filter(a => a > 0).map(a => `${a}°`).join(', ')
                    : <span className="text-muted-foreground">None - Click Edit to add</span>}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4 bg-muted/50 rounded-lg border animate-fade-in">
      <div className="flex items-center justify-between">
        <h4 className="font-medium text-foreground">Edit Fan Model Properties</h4>
        <div className="flex gap-2">
          <Button size="sm" onClick={handleSave} disabled={isSaving}>
            {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {isSaving ? 'Saving...' : 'Save'}
          </Button>
          <Button variant="ghost" size="sm" onClick={handleCancel} disabled={isSaving}>
            <X className="w-4 h-4" />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Model Name / Diameter */}
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">
            {isCentrifugal ? 'Model (e.g., 7/7, 10/10)' : 'Diameter (mm)'}
          </Label>
          <div className="flex flex-wrap gap-2 mt-1">
            <span className="flex items-center gap-1 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-sm font-medium">
              {editedModelName || `Ø${editedDiameter}mm`}
            </span>
            <div className="flex items-center gap-1">
              <Input
                type={isCentrifugal ? "text" : "number"}
                value={newModelInput}
                onChange={(e) => setNewModelInput(e.target.value)}
                placeholder={isCentrifugal ? "e.g., 7/7" : "e.g., 315"}
                className="w-24 h-8 text-sm"
                onKeyDown={(e) => e.key === 'Enter' && handleChangeModel()}
              />
              <Button 
                size="sm" 
                variant="outline" 
                className="h-8"
                onClick={handleChangeModel}
              >
                Change
              </Button>
            </div>
          </div>
        </div>

        {/* Product Code */}
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Product Code (unique identifier)</Label>
          <Input
            type="text"
            value={editedProductCode}
            onChange={(e) => setEditedProductCode(e.target.value.toUpperCase())}
            placeholder="e.g., AXF-315-4B"
            className="h-8 text-sm"
          />
          <p className="text-xs text-muted-foreground">Unique code for this fan model</p>
        </div>

        {/* Motor Poles */}
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Motor Poles</Label>
          <div className="flex flex-wrap gap-2 mt-1">
            {editedMotorPoles.map(pole => (
              <span
                key={pole}
                className={`flex items-center gap-1 px-2.5 py-1.5 rounded-md text-sm font-medium ${
                  pole === editedReferencePoles 
                    ? 'bg-primary text-primary-foreground ring-2 ring-offset-1 ring-primary' 
                    : 'bg-primary text-primary-foreground'
                }`}
              >
                {pole}P
                {pole === editedReferencePoles && <span className="text-xs opacity-75">(ref)</span>}
                <button 
                  onClick={() => handleRemoveMotorPole(pole)}
                  className="ml-1 hover:bg-primary-foreground/20 rounded-full p-0.5"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
            <div className="flex items-center gap-1">
              <Input
                type="number"
                value={newMotorPoleInput}
                onChange={(e) => setNewMotorPoleInput(e.target.value)}
                placeholder="Add"
                className="w-16 h-8 text-sm"
                min={2}
                max={24}
                step={2}
                onKeyDown={(e) => e.key === 'Enter' && handleAddMotorPole()}
              />
              <Button 
                size="icon" 
                variant="outline" 
                className="h-8 w-8"
                onClick={handleAddMotorPole}
              >
                <Plus className="w-4 h-4" />
              </Button>
            </div>
          </div>
          {/* Reference poles selector */}
          <div className="flex items-center gap-2 mt-2">
            <Label className="text-xs text-muted-foreground">Base Data Pole:</Label>
            <select 
              value={editedReferencePoles}
              onChange={(e) => setEditedReferencePoles(parseInt(e.target.value))}
              className="h-7 text-xs px-2 rounded border bg-background"
            >
              {editedMotorPoles.map(pole => (
                <option key={pole} value={pole}>{pole}P</option>
              ))}
            </select>
            <span className="text-xs text-muted-foreground">(Performance data stored at this pole)</span>
          </div>
        </div>

        {/* Blade Configurations (Number of Blades) - Only for axial fans */}
        {hasBladeData && <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Number of Blades</Label>
          <div className="flex flex-wrap gap-2 mt-1">
            {editedBladeConfigs.map(bladeCount => (
              <span
                key={bladeCount}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-primary text-primary-foreground text-sm font-medium"
              >
                {bladeCount} blades
                <button 
                  onClick={() => handleRemoveBladeCount(bladeCount)}
                  className="ml-1 hover:bg-primary-foreground/20 rounded-full p-0.5"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
            <div className="flex items-center gap-1">
              <Input
                type="number"
                value={newBladeCountInput}
                onChange={(e) => setNewBladeCountInput(e.target.value)}
                placeholder="Add"
                className="w-16 h-8 text-sm"
                min={2}
                max={24}
                onKeyDown={(e) => e.key === 'Enter' && handleAddBladeCount()}
              />
              <Button 
                size="icon" 
                variant="outline" 
                className="h-8 w-8"
                onClick={handleAddBladeCount}
              >
                <Plus className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>}

        {/* Blade Angles - Only for axial fans */}
        {hasBladeData && <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Blade Angles (degrees)</Label>
          <div className="flex flex-wrap gap-2 mt-1">
            {editedBladeAngles.map(angle => (
              <span
                key={angle}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-primary text-primary-foreground text-sm font-medium"
              >
                {angle}°
                <button 
                  onClick={() => handleRemoveBladeAngle(angle)}
                  className="ml-1 hover:bg-primary-foreground/20 rounded-full p-0.5"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
            <div className="flex items-center gap-1">
              <Input
                type="number"
                value={newAngleInput}
                onChange={(e) => setNewAngleInput(e.target.value)}
                placeholder="Add"
                className="w-16 h-8 text-sm"
                min={5}
                max={90}
                onKeyDown={(e) => e.key === 'Enter' && handleAddBladeAngle()}
              />
              <Button 
                size="icon" 
                variant="outline" 
                className="h-8 w-8"
                onClick={handleAddBladeAngle}
              >
                <Plus className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>}
      </div>

      <p className="text-xs text-muted-foreground">
        {hasBladeData 
          ? 'Note: Adding new blade angles will create empty performance data entries. Removing angles will delete their associated data.'
          : 'Note: This is a centrifugal fan - blade count and angle settings are not applicable.'
        }
      </p>
    </div>
  );
}
