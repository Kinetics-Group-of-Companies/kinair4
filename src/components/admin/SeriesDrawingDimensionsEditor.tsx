import { useState, useRef, useEffect } from 'react';
import { Upload, Save, X, Loader2, Plus, Check, Trash2, RefreshCw, Settings2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { useUpdateSeries } from '@/hooks/useFanDatabase';
import { supabase } from '@/integrations/backend/client';
import fanDrawingImg from '@/assets/fan-technical-drawing.png';
import { toast } from 'sonner';
import { ChevronDown, ChevronUp, Image as ImageIcon, Ruler } from 'lucide-react';
import {
  useDimensionSchema,
  useDimensionValues,
  useUpsertDimensionValue,
  useDeleteDimensionValue,
  useSyncSizesFromModels,
  useInitializeDefaultSchema,
} from '@/hooks/useFlexibleDimensions';

interface SeriesDrawingDimensionsEditorProps {
  seriesId: string;
  seriesName: string;
  currentDrawingUrl?: string;
}

export function SeriesDrawingDimensionsEditor({ 
  seriesId, 
  seriesName,
  currentDrawingUrl 
}: SeriesDrawingDimensionsEditorProps) {
  const updateSeriesMutation = useUpdateSeries();
  
  const [drawingUrlInput, setDrawingUrlInput] = useState(currentDrawingUrl || '');
  const [uploading, setUploading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [showAddSize, setShowAddSize] = useState(false);
  const [newSize, setNewSize] = useState<string>('');
  const [editingCell, setEditingCell] = useState<{ size: number; key: string } | null>(null);
  const [editValue, setEditValue] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const currentDrawing = currentDrawingUrl || fanDrawingImg;

  // Flexible dimensions hooks
  const { data: schema = [], isLoading: loadingSchema } = useDimensionSchema(seriesId);
  const { data: values = [], isLoading: loadingValues } = useDimensionValues(seriesId);
  const upsertValueMutation = useUpsertDimensionValue();
  const deleteValueMutation = useDeleteDimensionValue();
  const syncSizesMutation = useSyncSizesFromModels();
  const initSchemaMutation = useInitializeDefaultSchema();

  useEffect(() => {
    setDrawingUrlInput(currentDrawingUrl || '');
  }, [currentDrawingUrl]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    if (!file.type.startsWith('image/')) {
      toast.error('Please upload an image file');
      return;
    }
    
    if (file.size > 5 * 1024 * 1024) {
      toast.error('File size must be less than 5MB');
      return;
    }

    setUploading(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `drawings/${seriesId}-${Date.now()}.${fileExt}`;
      
      const { error: uploadError } = await supabase.storage
        .from('brand-assets')
        .upload(fileName, file, { upsert: true });
      
      if (uploadError) throw uploadError;
      
      const { data: { publicUrl } } = supabase.storage
        .from('brand-assets')
        .getPublicUrl(fileName);
      
      await updateSeriesMutation.mutateAsync({
        id: seriesId,
        updates: { drawing_url: publicUrl }
      });
      
      setDrawingUrlInput(publicUrl);
      toast.success('Drawing uploaded successfully');
    } catch (error) {
      console.error('Upload error:', error);
      toast.error('Failed to upload drawing');
    } finally {
      setUploading(false);
    }
  };

  const handleSaveUrl = async () => {
    try {
      await updateSeriesMutation.mutateAsync({
        id: seriesId,
        updates: { drawing_url: drawingUrlInput || null }
      });
    } catch (error) {
      // Error already handled by mutation
    }
  };

  const handleRemoveDrawing = async () => {
    try {
      await updateSeriesMutation.mutateAsync({
        id: seriesId,
        updates: { drawing_url: null }
      });
      setDrawingUrlInput('');
      toast.success('Custom drawing removed');
    } catch (error) {
      // Error already handled by mutation
    }
  };

  // Dimension handlers
  const handleAddSize = async () => {
    const trimmedSize = newSize.trim();
    if (!trimmedSize) {
      toast.error('Enter a valid size');
      return;
    }
    // Try to parse as number for the database (size column is numeric)
    const numericSize = Number(trimmedSize);
    if (isNaN(numericSize) || numericSize <= 0) {
      toast.error('Size must be a valid positive number');
      return;
    }
    if (values.some((v) => v.size === numericSize)) {
      toast.error('Size already exists');
      return;
    }
    await upsertValueMutation.mutateAsync({ seriesId, size: numericSize, values: {} });
    setShowAddSize(false);
    setNewSize('');
  };

  const handleDeleteSize = async (size: number) => {
    await deleteValueMutation.mutateAsync({ seriesId, size });
  };

  const handleCellEdit = (size: number, key: string, currentValue: string | number | null) => {
    setEditingCell({ size, key });
    setEditValue(currentValue?.toString() ?? '');
  };

  const handleSaveCell = async () => {
    if (!editingCell) return;
    const row = values.find((v) => v.size === editingCell.size);
    if (!row) return;

    // Always save as text to allow values like "7/7" or "24/240"
    const updated = { ...row.values, [editingCell.key]: editValue };

    await upsertValueMutation.mutateAsync({ seriesId, size: row.size, values: updated });
    setEditingCell(null);
    setEditValue('');
  };

  const handleSyncSizes = async () => {
    await syncSizesMutation.mutateAsync({ seriesId });
  };

  const handleInitSchema = async () => {
    await initSchemaMutation.mutateAsync({ seriesId });
  };

  const sortedSchema = [...schema].sort((a, b) => a.display_order - b.display_order);
  const sortedValues = [...values].sort((a, b) => a.size - b.size);
  const isLoadingDims = loadingSchema || loadingValues;

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger asChild>
        <Button variant="ghost" className="w-full justify-between p-2 h-auto">
          <div className="flex items-center gap-2 text-sm">
            <Ruler className="w-4 h-4" />
            <span>Drawings & Dimensions</span>
          </div>
          {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </Button>
      </CollapsibleTrigger>
      
      <CollapsibleContent className="space-y-4 pt-4">
        {/* Drawing Upload Section */}
        <div className="space-y-3 p-3 bg-muted/30 rounded-lg">
          <Label className="text-sm font-medium flex items-center gap-2">
            <ImageIcon className="w-4 h-4" />
            Technical Drawing
          </Label>
          
          {currentDrawingUrl && (
            <div className="relative aspect-video bg-background rounded border overflow-hidden">
              <img 
                src={currentDrawing} 
                alt="Technical drawing"
                className="w-full h-full object-contain"
              />
              <Button
                variant="destructive"
                size="sm"
                className="absolute top-2 right-2 h-7 px-2"
                onClick={handleRemoveDrawing}
              >
                <X className="w-3 h-3" />
              </Button>
            </div>
          )}
          
          <Tabs defaultValue="upload" className="w-full">
            <TabsList className="grid w-full grid-cols-2 h-8">
              <TabsTrigger value="upload" className="text-xs">Upload</TabsTrigger>
              <TabsTrigger value="url" className="text-xs">URL</TabsTrigger>
            </TabsList>

            <TabsContent value="upload" className="mt-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileUpload}
                className="hidden"
              />
              <Button 
                variant="outline" 
                size="sm"
                className="w-full h-16 border-dashed"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
              >
                {uploading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <div className="text-center">
                    <Upload className="w-4 h-4 mx-auto mb-1" />
                    <span className="text-xs">Click to upload</span>
                  </div>
                )}
              </Button>
            </TabsContent>

            <TabsContent value="url" className="mt-2">
              <div className="flex gap-2">
                <Input
                  placeholder="https://..."
                  value={drawingUrlInput}
                  onChange={(e) => setDrawingUrlInput(e.target.value)}
                  className="h-8 text-xs"
                />
                <Button size="sm" onClick={handleSaveUrl} className="h-8">
                  <Save className="w-3 h-3" />
                </Button>
              </div>
            </TabsContent>
          </Tabs>
        </div>

        {/* Dimensions Section - Inline, no nested collapsible */}
        <div className="space-y-3 p-3 bg-muted/30 rounded-lg">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-medium flex items-center gap-2">
              <Ruler className="w-4 h-4" />
              Dimensions ({values.length} sizes)
            </Label>
            {schema.length > 0 && (
              <div className="flex gap-1">
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setShowAddSize(true)}>
                  <Plus className="w-3 h-3 mr-1" /> Add
                </Button>
                <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={handleSyncSizes} disabled={syncSizesMutation.isPending}>
                  {syncSizesMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                </Button>
              </div>
            )}
          </div>

          {isLoadingDims ? (
            <div className="flex justify-center py-4">
              <Loader2 className="w-4 h-4 animate-spin" />
            </div>
          ) : schema.length === 0 ? (
            <div className="text-center py-4 text-sm text-muted-foreground">
              <p className="mb-2">No dimension schema defined.</p>
              <Button size="sm" variant="outline" onClick={handleInitSchema} disabled={initSchemaMutation.isPending}>
                {initSchemaMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Settings2 className="w-3 h-3 mr-1" />}
                Initialize Schema
              </Button>
            </div>
          ) : (
            <>
              {showAddSize && (
                <div className="flex gap-2 items-end p-2 bg-background rounded border">
                  <div className="flex-1">
                    <Label className="text-xs">New Size (mm)</Label>
                    <Input
                      type="text"
                      value={newSize}
                      onChange={(e) => setNewSize(e.target.value)}
                      className="h-8 mt-1"
                      placeholder="e.g., 400"
                    />
                  </div>
                  <Button size="sm" className="h-8" onClick={handleAddSize}>
                    <Plus className="w-3 h-3" />
                  </Button>
                  <Button size="sm" variant="ghost" className="h-8" onClick={() => setShowAddSize(false)}>
                    <X className="w-3 h-3" />
                  </Button>
                </div>
              )}

              {sortedValues.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-4">
                  No dimensions. Click "Add" or sync from fan models.
                </p>
              ) : (
                <div className="overflow-x-auto rounded border max-h-[250px]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs py-2 sticky left-0 bg-background z-10">Size</TableHead>
                        {sortedSchema.map((p) => (
                          <TableHead key={p.id} className="text-xs py-2 whitespace-nowrap">{p.param_label}</TableHead>
                        ))}
                        <TableHead className="text-xs py-2 w-10"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sortedValues.map((row) => (
                        <TableRow key={row.size}>
                          <TableCell className="text-xs py-1 font-medium sticky left-0 bg-background z-10">{row.size}</TableCell>
                          {sortedSchema.map((p) => {
                            const cellVal = row.values[p.param_key] ?? '';
                            const isEditing = editingCell?.size === row.size && editingCell?.key === p.param_key;
                            return (
                              <TableCell key={p.id} className="p-1">
                                {isEditing ? (
                                  <div className="flex items-center gap-1">
                                    <Input
                                      type="text"
                                      value={editValue}
                                      onChange={(e) => setEditValue(e.target.value)}
                                      className="h-6 w-16 text-xs"
                                      autoFocus
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter') handleSaveCell();
                                        if (e.key === 'Escape') setEditingCell(null);
                                      }}
                                    />
                                    <Button size="icon" variant="ghost" className="h-5 w-5" onClick={handleSaveCell}>
                                      <Check className="w-3 h-3 text-green-600" />
                                    </Button>
                                    <Button size="icon" variant="ghost" className="h-5 w-5" onClick={() => setEditingCell(null)}>
                                      <X className="w-3 h-3" />
                                    </Button>
                                  </div>
                                ) : (
                                  <button
                                    onClick={() => handleCellEdit(row.size, p.param_key, cellVal)}
                                    className="text-xs w-full text-left px-1 py-0.5 rounded hover:bg-muted/50 transition-colors min-w-[40px]"
                                  >
                                    {cellVal !== '' ? String(cellVal) : <span className="text-muted-foreground">-</span>}
                                  </button>
                                )}
                              </TableCell>
                            );
                          })}
                          <TableCell className="p-1">
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button size="icon" variant="ghost" className="h-5 w-5 text-destructive">
                                  <Trash2 className="w-3 h-3" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Delete size {row.size}?</AlertDialogTitle>
                                  <AlertDialogDescription>This will remove all dimension values for this size.</AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction onClick={() => handleDeleteSize(row.size)}>Delete</AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
