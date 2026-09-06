import { useState, useRef, useEffect } from 'react';
import { Upload, Save, X, Edit2, RotateCcw, Plus, Loader2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useFanSeries, useUpdateSeries, useFanDimensions, useUpsertFanDimension, useDeleteFanDimension } from '@/hooks/useFanDatabase';
import { FanDimension, DEFAULT_FAN_DIMENSIONS } from '@/lib/fanData';
import { supabase } from '@/integrations/backend/client';
import fanDrawingImg from '@/assets/fan-technical-drawing.png';
import { toast } from 'sonner';

export function DrawingDimensionsEditor() {
  const { data: series = [], isLoading: loadingSeries } = useFanSeries();
  const updateSeriesMutation = useUpdateSeries();
  const upsertDimensionMutation = useUpsertFanDimension();
  const deleteDimensionMutation = useDeleteFanDimension();
  
  const [selectedSeries, setSelectedSeries] = useState<string>('');
  const [drawingUrlInput, setDrawingUrlInput] = useState('');
  const [editingDimension, setEditingDimension] = useState<number | null>(null);
  const [editedDimension, setEditedDimension] = useState<Partial<FanDimension>>({});
  const [uploading, setUploading] = useState(false);
  const [showAddSize, setShowAddSize] = useState(false);
  const [newSize, setNewSize] = useState<number>(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Set default selected series when data loads
  useEffect(() => {
    if (series.length > 0 && !selectedSeries) {
      setSelectedSeries(series[0].id);
    }
  }, [series, selectedSeries]);

  const selectedSeriesData = series.find(s => s.id === selectedSeries);
  const { data: dimensions = [], isLoading: loadingDimensions } = useFanDimensions(selectedSeries || null);

  const currentDrawing = selectedSeriesData?.drawingUrl || fanDrawingImg;

  useEffect(() => {
    setDrawingUrlInput(selectedSeriesData?.drawingUrl || '');
  }, [selectedSeriesData]);

  const handleSeriesChange = (seriesId: string) => {
    setSelectedSeries(seriesId);
    setEditingDimension(null);
    setEditedDimension({});
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedSeries) return;
    
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
      // Upload to Supabase Storage
      const fileExt = file.name.split('.').pop();
      const fileName = `drawings/${selectedSeries}-${Date.now()}.${fileExt}`;
      
      const { error: uploadError } = await supabase.storage
        .from('brand-assets')
        .upload(fileName, file, { upsert: true });
      
      if (uploadError) throw uploadError;
      
      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('brand-assets')
        .getPublicUrl(fileName);
      
      // Update series with new drawing URL
      await updateSeriesMutation.mutateAsync({
        id: selectedSeries,
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
    if (!selectedSeries) return;
    try {
      await updateSeriesMutation.mutateAsync({
        id: selectedSeries,
        updates: { drawing_url: drawingUrlInput || null }
      });
    } catch (error) {
      // Error already handled by mutation
    }
  };

  const handleRemoveDrawing = async () => {
    if (!selectedSeries) return;
    try {
      await updateSeriesMutation.mutateAsync({
        id: selectedSeries,
        updates: { drawing_url: null }
      });
      setDrawingUrlInput('');
      toast.success('Custom drawing removed, using default');
    } catch (error) {
      // Error already handled by mutation
    }
  };

  const handleEditDimension = (dim: FanDimension) => {
    setEditingDimension(dim.size);
    setEditedDimension({ ...dim });
  };

  const handleSaveDimension = async () => {
    if (editingDimension === null || !selectedSeries) return;
    
    const dimensionToSave: FanDimension = {
      size: editingDimension,
      phiD2: editedDimension.phiD2 ?? 0,
      phiD1: editedDimension.phiD1 ?? 0,
      phiD: editedDimension.phiD ?? 0,
      H: editedDimension.H ?? 0,
      E: editedDimension.E ?? 0,
      F: editedDimension.F ?? 0,
      L: editedDimension.L ?? 0,
      K: editedDimension.K ?? 0,
      nPhiD: editedDimension.nPhiD ?? '',
      zPhiD1: editedDimension.zPhiD1 ?? '',
      motorMax: editedDimension.motorMax ?? '',
    };

    try {
      await upsertDimensionMutation.mutateAsync({
        seriesId: selectedSeries,
        dimension: dimensionToSave,
      });
      setEditingDimension(null);
      setEditedDimension({});
    } catch (error) {
      // Error already handled by mutation
    }
  };

  const handleCancelEdit = () => {
    setEditingDimension(null);
    setEditedDimension({});
  };

  const handleInitializeWithDefaults = async () => {
    if (!selectedSeries) return;
    
    try {
      // Insert all default dimensions
      for (const dim of DEFAULT_FAN_DIMENSIONS) {
        await upsertDimensionMutation.mutateAsync({
          seriesId: selectedSeries,
          dimension: dim,
        });
      }
      toast.success('Series initialized with default dimensions');
    } catch (error) {
      console.error('Error initializing dimensions:', error);
      toast.error('Failed to initialize dimensions');
    }
  };

  const handleAddNewSize = async () => {
    if (!selectedSeries || newSize <= 0) {
      toast.error('Please enter a valid size');
      return;
    }
    if (dimensions.some(d => d.size === newSize)) {
      toast.error('This size already exists');
      return;
    }
    
    const newDimension: FanDimension = {
      size: newSize,
      phiD2: 0,
      phiD1: 0,
      phiD: 0,
      H: 0,
      E: 0,
      F: 0,
      L: 0,
      K: 0,
      nPhiD: '',
      zPhiD1: '',
      motorMax: '',
    };
    
    try {
      await upsertDimensionMutation.mutateAsync({
        seriesId: selectedSeries,
        dimension: newDimension,
      });
      setShowAddSize(false);
      setNewSize(0);
      // Start editing the new dimension
      setEditingDimension(newSize);
      setEditedDimension(newDimension);
    } catch (error) {
      console.error('Error adding dimension:', error);
    }
  };

  const handleDeleteDimension = async (size: number) => {
    if (!selectedSeries) return;
    if (!confirm(`Delete dimension for size ${size}?`)) return;
    
    try {
      await deleteDimensionMutation.mutateAsync({ seriesId: selectedSeries, size });
    } catch (error) {
      console.error('Error deleting dimension:', error);
    }
  };

  const handleResetDimensions = async () => {
    if (!selectedSeries) return;
    if (!confirm('Are you sure you want to reset all dimensions to defaults for this series?')) return;
    
    try {
      for (const dim of DEFAULT_FAN_DIMENSIONS) {
        await upsertDimensionMutation.mutateAsync({
          seriesId: selectedSeries,
          dimension: dim,
        });
      }
      toast.success('Dimensions reset to defaults');
    } catch (error) {
      console.error('Error resetting dimensions:', error);
      toast.error('Failed to reset dimensions');
    }
  };

  if (loadingSeries) {
    return (
      <div className="kinair-card p-6 flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  if (series.length === 0) {
    return (
      <div className="kinair-card p-6">
        <p className="text-muted-foreground text-center">
          No series available. Please add a series first in the Series tab.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Series Selector */}
      <div className="kinair-card p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-foreground">Select Series</h2>
        </div>
        <Select value={selectedSeries} onValueChange={handleSeriesChange}>
          <SelectTrigger className="w-64">
            <SelectValue placeholder="Select a series" />
          </SelectTrigger>
          <SelectContent>
            {series.map(s => (
              <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground mt-2">
          Each series has its own drawing and dimensions. New series start blank.
        </p>
      </div>

      {/* Drawing Section */}
      <div className="kinair-card p-6">
        <h2 className="text-lg font-semibold text-foreground mb-6">Fan Drawing - {selectedSeriesData?.name || ''}</h2>
        
        <div className="grid md:grid-cols-2 gap-6">
          {/* Current Drawing Preview */}
          <div>
            <Label className="mb-2 block">Current Drawing</Label>
            <div className="bg-white rounded-lg p-4 border">
              <img 
                src={currentDrawing} 
                alt="Fan Technical Drawing"
                className="w-full max-w-sm mx-auto"
              />
            </div>
            {selectedSeriesData?.drawingUrl && (
              <Button 
                variant="outline" 
                size="sm" 
                className="mt-3"
                onClick={handleRemoveDrawing}
                disabled={updateSeriesMutation.isPending}
              >
                <X className="w-4 h-4 mr-1" />
                Remove Custom Drawing
              </Button>
            )}
          </div>

          {/* Upload Options */}
          <div className="space-y-4">
            <Tabs defaultValue="upload">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="upload">Upload File</TabsTrigger>
                <TabsTrigger value="url">URL</TabsTrigger>
              </TabsList>
              
              <TabsContent value="upload" className="space-y-3">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleFileUpload}
                />
                <Button
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full"
                  disabled={uploading}
                >
                  {uploading ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Upload className="w-4 h-4 mr-2" />
                  )}
                  {uploading ? 'Uploading...' : 'Upload Drawing Image'}
                </Button>
                <p className="text-xs text-muted-foreground">
                  PNG or JPG, max 5MB. Recommended: transparent background.
                </p>
              </TabsContent>
              
              <TabsContent value="url" className="space-y-3">
                <div className="flex gap-2">
                  <Input
                    value={drawingUrlInput}
                    onChange={(e) => setDrawingUrlInput(e.target.value)}
                    placeholder="Enter image URL"
                  />
                  <Button onClick={handleSaveUrl} disabled={updateSeriesMutation.isPending}>
                    <Save className="w-4 h-4" />
                  </Button>
                </div>
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </div>

      {/* Dimensions Table */}
      <div className="kinair-card p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-foreground">Fan Dimensions - {selectedSeriesData?.name || ''}</h2>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setShowAddSize(true)} disabled={!selectedSeries}>
              <Plus className="w-4 h-4 mr-1" />
              Add Size
            </Button>
            {dimensions.length === 0 && (
              <Button onClick={handleInitializeWithDefaults} disabled={upsertDimensionMutation.isPending}>
                <Plus className="w-4 h-4 mr-2" />
                Initialize with Defaults
              </Button>
            )}
            {dimensions.length > 0 && (
              <Button variant="outline" onClick={handleResetDimensions} disabled={upsertDimensionMutation.isPending}>
                <RotateCcw className="w-4 h-4 mr-2" />
                Reset to Defaults
              </Button>
            )}
          </div>
        </div>

        {/* Add New Size Form */}
        {showAddSize && (
          <div className="flex items-end gap-3 p-4 bg-muted/30 rounded-lg mb-4">
            <div>
              <Label className="text-xs text-muted-foreground">New Size (mm)</Label>
              <Input
                type="number"
                min="100"
                max="3000"
                value={newSize || ''}
                onChange={(e) => setNewSize(parseInt(e.target.value) || 0)}
                placeholder="e.g., 500"
                className="mt-1 w-32"
              />
            </div>
            <Button onClick={handleAddNewSize} disabled={upsertDimensionMutation.isPending}>
              {upsertDimensionMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Add
            </Button>
            <Button variant="ghost" onClick={() => { setShowAddSize(false); setNewSize(0); }}>
              <X className="w-4 h-4" />
            </Button>
          </div>
        )}

        {loadingDimensions ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : dimensions.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <p>No dimensions configured for this series.</p>
            <p className="text-sm">Click "Initialize with Defaults" to add standard dimensions.</p>
          </div>
        ) : (
          <>
            <p className="text-sm text-muted-foreground mb-4">
              Edit dimensions for each fan diameter. Click the edit button to modify values.
            </p>

            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-center">Size (mm)</TableHead>
                    <TableHead className="text-center">ΦD2</TableHead>
                    <TableHead className="text-center">ΦD1</TableHead>
                    <TableHead className="text-center">ΦD</TableHead>
                    <TableHead className="text-center">H</TableHead>
                    <TableHead className="text-center">E</TableHead>
                    <TableHead className="text-center">F</TableHead>
                    <TableHead className="text-center">L</TableHead>
                    <TableHead className="text-center">K</TableHead>
                    <TableHead className="text-center">Bolt Pattern</TableHead>
                    <TableHead className="text-center">Mounting</TableHead>
                    <TableHead className="text-center">Motor Max</TableHead>
                    <TableHead className="text-center w-20">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dimensions.map(dim => (
                    <TableRow key={dim.size}>
                      {editingDimension === dim.size ? (
                        <>
                          <TableCell className="text-center font-bold text-primary">{dim.size}</TableCell>
                          <TableCell className="p-1">
                            <Input 
                              type="number" 
                              className="h-8 w-16 text-center"
                              value={editedDimension.phiD2 ?? dim.phiD2}
                              onChange={(e) => setEditedDimension(prev => ({ ...prev, phiD2: Number(e.target.value) }))}
                            />
                          </TableCell>
                          <TableCell className="p-1">
                            <Input 
                              type="number" 
                              className="h-8 w-16 text-center"
                              value={editedDimension.phiD1 ?? dim.phiD1}
                              onChange={(e) => setEditedDimension(prev => ({ ...prev, phiD1: Number(e.target.value) }))}
                            />
                          </TableCell>
                          <TableCell className="p-1">
                            <Input 
                              type="number" 
                              className="h-8 w-16 text-center"
                              value={editedDimension.phiD ?? dim.phiD}
                              onChange={(e) => setEditedDimension(prev => ({ ...prev, phiD: Number(e.target.value) }))}
                            />
                          </TableCell>
                          <TableCell className="p-1">
                            <Input 
                              type="number" 
                              className="h-8 w-16 text-center"
                              value={editedDimension.H ?? dim.H}
                              onChange={(e) => setEditedDimension(prev => ({ ...prev, H: Number(e.target.value) }))}
                            />
                          </TableCell>
                          <TableCell className="p-1">
                            <Input 
                              type="number" 
                              className="h-8 w-16 text-center"
                              value={editedDimension.E ?? dim.E}
                              onChange={(e) => setEditedDimension(prev => ({ ...prev, E: Number(e.target.value) }))}
                            />
                          </TableCell>
                          <TableCell className="p-1">
                            <Input 
                              type="number" 
                              className="h-8 w-16 text-center"
                              value={editedDimension.F ?? dim.F}
                              onChange={(e) => setEditedDimension(prev => ({ ...prev, F: Number(e.target.value) }))}
                            />
                          </TableCell>
                          <TableCell className="p-1">
                            <Input 
                              type="number" 
                              className="h-8 w-16 text-center"
                              value={editedDimension.L ?? dim.L}
                              onChange={(e) => setEditedDimension(prev => ({ ...prev, L: Number(e.target.value) }))}
                            />
                          </TableCell>
                          <TableCell className="p-1">
                            <Input 
                              type="number" 
                              className="h-8 w-16 text-center"
                              value={editedDimension.K ?? dim.K}
                              onChange={(e) => setEditedDimension(prev => ({ ...prev, K: Number(e.target.value) }))}
                            />
                          </TableCell>
                          <TableCell className="p-1">
                            <Input 
                              className="h-8 w-20 text-center"
                              value={editedDimension.nPhiD ?? dim.nPhiD}
                              onChange={(e) => setEditedDimension(prev => ({ ...prev, nPhiD: e.target.value }))}
                            />
                          </TableCell>
                          <TableCell className="p-1">
                            <Input 
                              className="h-8 w-20 text-center"
                              value={editedDimension.zPhiD1 ?? dim.zPhiD1}
                              onChange={(e) => setEditedDimension(prev => ({ ...prev, zPhiD1: e.target.value }))}
                            />
                          </TableCell>
                          <TableCell className="p-1">
                            <Input 
                              className="h-8 w-16 text-center"
                              value={editedDimension.motorMax ?? dim.motorMax}
                              onChange={(e) => setEditedDimension(prev => ({ ...prev, motorMax: e.target.value }))}
                            />
                          </TableCell>
                          <TableCell className="p-1">
                            <div className="flex gap-1">
                              <Button 
                                size="icon" 
                                variant="ghost" 
                                className="h-7 w-7" 
                                onClick={handleSaveDimension}
                                disabled={upsertDimensionMutation.isPending}
                              >
                                <Save className="w-4 h-4 text-emerald-600" />
                              </Button>
                              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={handleCancelEdit}>
                                <X className="w-4 h-4 text-destructive" />
                              </Button>
                            </div>
                          </TableCell>
                        </>
                      ) : (
                        <>
                          <TableCell className="text-center font-bold text-primary">{dim.size}</TableCell>
                          <TableCell className="text-center font-mono">{dim.phiD2}</TableCell>
                          <TableCell className="text-center font-mono">{dim.phiD1}</TableCell>
                          <TableCell className="text-center font-mono">{dim.phiD}</TableCell>
                          <TableCell className="text-center font-mono">{dim.H}</TableCell>
                          <TableCell className="text-center font-mono">{dim.E}</TableCell>
                          <TableCell className="text-center font-mono">{dim.F}</TableCell>
                          <TableCell className="text-center font-mono">{dim.L}</TableCell>
                          <TableCell className="text-center font-mono">{dim.K}</TableCell>
                          <TableCell className="text-center font-mono">{dim.nPhiD}</TableCell>
                          <TableCell className="text-center font-mono">{dim.zPhiD1}</TableCell>
                          <TableCell className="text-center font-mono">{dim.motorMax}</TableCell>
                          <TableCell className="text-center">
                            <div className="flex gap-1 justify-center">
                              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => handleEditDimension(dim)}>
                                <Edit2 className="w-4 h-4" />
                              </Button>
                              <Button 
                                size="icon" 
                                variant="ghost" 
                                className="h-7 w-7 text-destructive" 
                                onClick={() => handleDeleteDimension(dim.size)}
                                disabled={deleteDimensionMutation.isPending}
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
