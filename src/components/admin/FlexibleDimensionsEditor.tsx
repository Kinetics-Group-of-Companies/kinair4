import { useState, useEffect, useMemo } from 'react';
import { Plus, Save, Trash2, Edit2, X, Check, RefreshCw, Loader2, Settings, ChevronDown, ChevronUp, GripVertical } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Badge } from '@/components/ui/badge';
import { useFanSeries, useFanModels } from '@/hooks/useFanDatabase';
import { DimensionExcelImportExport } from './DimensionExcelImportExport';
import {
  useDimensionSchema,
  useDimensionValues,
  useAddDimensionParam,
  useUpdateDimensionParam,
  useDeleteDimensionParam,
  useUpsertDimensionValue,
  useDeleteDimensionValue,
  useInitializeDefaultSchema,
  DimensionParam,
  DimensionValue,
} from '@/hooks/useFlexibleDimensions';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export function FlexibleDimensionsEditor() {
  const { data: series = [], isLoading: loadingSeries } = useFanSeries();
  const { data: allFanModels = [], isLoading: loadingModels } = useFanModels();
  const [selectedSeries, setSelectedSeries] = useState<string>('');
  const [schemaOpen, setSchemaOpen] = useState(false);
  const [newParamKey, setNewParamKey] = useState('');
  const [newParamLabel, setNewParamLabel] = useState('');
  const [newParamType, setNewParamType] = useState<'number' | 'text'>('text');
  const [editingCell, setEditingCell] = useState<{ size: number; key: string } | null>(null);
  const [editValue, setEditValue] = useState<string>('');
  const [editingParam, setEditingParam] = useState<string | null>(null);
  const [editParamLabel, setEditParamLabel] = useState<string>('');

  // Set default selected series when data loads
  useEffect(() => {
    if (series.length > 0 && !selectedSeries) {
      setSelectedSeries(series[0].id);
    }
  }, [series, selectedSeries]);

  const { data: schema = [], isLoading: loadingSchema } = useDimensionSchema(selectedSeries);
  const { data: values = [], isLoading: loadingValues } = useDimensionValues(selectedSeries);
  
  const addParamMutation = useAddDimensionParam();
  const updateParamMutation = useUpdateDimensionParam();
  const deleteParamMutation = useDeleteDimensionParam();
  const upsertValueMutation = useUpsertDimensionValue();
  const deleteValueMutation = useDeleteDimensionValue();
  const initSchemaMutation = useInitializeDefaultSchema();

  const selectedSeriesData = series.find(s => s.id === selectedSeries);

  // Get fan models for selected series
  const seriesModels = useMemo(() => {
    if (!selectedSeries) return [];
    return allFanModels.filter(m => (m as any).seriesId === selectedSeries);
  }, [allFanModels, selectedSeries]);

  // Get unique sizes from series models
  const modelSizes = useMemo(() => {
    const sizes = new Set<number>();
    seriesModels.forEach(m => {
      if (m.diameter) {
        sizes.add(m.diameter);
      }
    });
    return Array.from(sizes).sort((a, b) => a - b);
  }, [seriesModels]);

  // Merge model sizes with existing dimension values
  const mergedDimensionData = useMemo(() => {
    const valueMap = new Map(values.map(v => [v.size, v]));
    
    // Start with model sizes
    const allSizes = new Set(modelSizes);
    // Also include any existing values that might not be from models
    values.forEach(v => allSizes.add(v.size));
    
    // Get schema keys for accurate comparison
    const schemaKeys = new Set(schema.map(s => s.param_key));
    
    return Array.from(allSizes).sort((a, b) => a - b).map(size => {
      const existing = valueMap.get(size);
      const isFromModel = modelSizes.includes(size);
      
      // Check how many schema-defined dimension values are filled
      // Only count values that match schema keys, not extra keys
      const filledCount = existing && schema.length > 0
        ? schema.filter(s => {
            const val = existing.values[s.param_key];
            return val !== '' && val !== undefined && val !== null;
          }).length
        : 0;
      const hasAllValues = schema.length > 0 && filledCount === schema.length;
      const hasSomeValues = filledCount > 0;
      
      return {
        size,
        id: existing?.id,
        values: existing?.values || {},
        isFromModel,
        hasData: !!existing,
        filledCount,
        hasAllValues,
        hasSomeValues,
      };
    });
  }, [modelSizes, values, schema]);

  // Count missing dimensions
  const missingSizes = mergedDimensionData.filter(d => !d.hasAllValues).length;

  const handleAddParam = async () => {
    if (!newParamKey.trim() || !newParamLabel.trim()) {
      toast.error('Please enter key and label');
      return;
    }
    const key = newParamKey.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
    if (schema.some(p => p.param_key === key)) {
      toast.error('Parameter key already exists');
      return;
    }
    await addParamMutation.mutateAsync({
      seriesId: selectedSeries,
      param_key: key,
      param_label: newParamLabel,
      param_type: newParamType,
      display_order: schema.length,
    });
    setNewParamKey('');
    setNewParamLabel('');
  };

  const handleDeleteParam = async (param: DimensionParam) => {
    await deleteParamMutation.mutateAsync({ id: param.id, seriesId: selectedSeries });
  };

  const handleEditParam = (param: DimensionParam) => {
    setEditingParam(param.id);
    setEditParamLabel(param.param_label);
  };

  const handleSaveParam = async (param: DimensionParam) => {
    if (!editParamLabel.trim()) {
      toast.error('Label cannot be empty');
      return;
    }
    await updateParamMutation.mutateAsync({
      id: param.id,
      seriesId: selectedSeries,
      updates: { param_label: editParamLabel },
    });
    setEditingParam(null);
    setEditParamLabel('');
  };

  const handleCancelEditParam = () => {
    setEditingParam(null);
    setEditParamLabel('');
  };

  const handleDeleteSize = async (size: number) => {
    await deleteValueMutation.mutateAsync({ seriesId: selectedSeries, size });
  };

  const handleCellClick = (size: number, key: string, currentValue: string | number) => {
    setEditingCell({ size, key });
    setEditValue(String(currentValue || ''));
  };

  const handleCellSave = async () => {
    if (!editingCell) return;
    const row = mergedDimensionData.find(v => v.size === editingCell.size);
    if (!row) return;
    
    // Always save as text to allow values like "7/7" or "24/240"
    const updatedValues = { ...row.values, [editingCell.key]: editValue };
    await upsertValueMutation.mutateAsync({
      seriesId: selectedSeries,
      size: editingCell.size,
      values: updatedValues,
      is_from_model: row.isFromModel,
    });
    setEditingCell(null);
    setEditValue('');
  };

  const handleCellCancel = () => {
    setEditingCell(null);
    setEditValue('');
  };

  const handleInitDefaults = async () => {
    await initSchemaMutation.mutateAsync({ seriesId: selectedSeries });
  };

  if (loadingSeries || loadingModels) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );
  }

  if (series.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          No series available. Add a series first.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Series Selector */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Flexible Dimensions</CardTitle>
          <CardDescription>Define custom dimension parameters per series. Models are auto-populated from your fan database.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <div className="flex-1 max-w-xs">
              <Label className="text-xs text-muted-foreground">Select Series</Label>
              <Select value={selectedSeries} onValueChange={setSelectedSeries}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Select series" />
                </SelectTrigger>
                <SelectContent>
                  {series.map(s => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name} ({allFanModels.filter(m => (m as any).seriesId === s.id).length} models)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2 pt-5">
              {selectedSeries && selectedSeriesData && (
                <DimensionExcelImportExport 
                  seriesId={selectedSeries} 
                  seriesName={selectedSeriesData.name} 
                />
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Status Summary */}
      {selectedSeries && seriesModels.length > 0 && schema.length > 0 && (
        <div className="flex items-center justify-between px-1">
          <div>
            <h3 className="text-sm font-medium flex items-center gap-2">
              Dimensions for <Badge variant="secondary">{selectedSeriesData?.name}</Badge>
            </h3>
            <p className="text-xs text-muted-foreground">
              {missingSizes > 0 ? (
                <span className="text-amber-600">
                  {missingSizes} of {mergedDimensionData.length} sizes have incomplete dimensions
                </span>
              ) : (
                <span className="text-green-600">All dimensions configured ✓</span>
              )}
            </p>
          </div>
        </div>
      )}

      {/* Schema Editor (Collapsible) */}
      <Card>
        <Collapsible open={schemaOpen} onOpenChange={setSchemaOpen}>
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer hover:bg-muted/30 transition-colors">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Settings className="w-4 h-4" />
                  <CardTitle className="text-base">Dimension Parameters</CardTitle>
                  <Badge variant="secondary">{schema.length} columns</Badge>
                </div>
                {schemaOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </div>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="pt-0 space-y-4">
              {loadingSchema ? (
                <div className="flex justify-center py-4">
                  <Loader2 className="w-4 h-4 animate-spin" />
                </div>
              ) : schema.length === 0 ? (
                <div className="text-center py-6 text-muted-foreground">
                  <p className="mb-3">No parameters defined for this series.</p>
                  <Button onClick={handleInitDefaults} disabled={initSchemaMutation.isPending}>
                    {initSchemaMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                    Initialize with Common Defaults
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  {schema.map((param, idx) => (
                    <div key={param.id} className="flex items-center gap-2 p-2 bg-muted/30 rounded">
                      <GripVertical className="w-4 h-4 text-muted-foreground" />
                      <Badge variant="outline" className="font-mono text-xs">{param.param_key}</Badge>
                      {editingParam === param.id ? (
                        <div className="flex-1 flex items-center gap-2">
                          <Input
                            value={editParamLabel}
                            onChange={(e) => setEditParamLabel(e.target.value)}
                            className="h-7 text-sm flex-1"
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleSaveParam(param);
                              if (e.key === 'Escape') handleCancelEditParam();
                            }}
                          />
                          <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => handleSaveParam(param)}>
                            <Check className="w-3 h-3 text-green-600" />
                          </Button>
                          <Button size="icon" variant="ghost" className="h-6 w-6" onClick={handleCancelEditParam}>
                            <X className="w-3 h-3 text-muted-foreground" />
                          </Button>
                        </div>
                      ) : (
                        <button
                          onClick={() => handleEditParam(param)}
                          className="flex-1 text-left font-medium hover:bg-muted/50 px-2 py-1 rounded transition-colors"
                        >
                          {param.param_label}
                        </button>
                      )}
                      <Badge variant="secondary" className="text-xs">{param.param_type}</Badge>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive">
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete Parameter?</AlertDialogTitle>
                            <AlertDialogDescription>
                              This will remove "{param.param_label}" from all dimensions. This cannot be undone.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction 
                              onClick={() => handleDeleteParam(param)}
                              className="bg-destructive text-destructive-foreground"
                            >
                              Delete
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  ))}
                </div>
              )}

              {/* Add New Parameter */}
              <div className="flex items-end gap-2 pt-4 border-t">
                <div className="flex-1">
                  <Label className="text-xs">Key</Label>
                  <Input
                    value={newParamKey}
                    onChange={(e) => setNewParamKey(e.target.value)}
                    placeholder="e.g., flange_width"
                    className="mt-1 h-8 text-sm"
                  />
                </div>
                <div className="flex-1">
                  <Label className="text-xs">Label</Label>
                  <Input
                    value={newParamLabel}
                    onChange={(e) => setNewParamLabel(e.target.value)}
                    placeholder="e.g., Flange Width"
                    className="mt-1 h-8 text-sm"
                  />
                </div>
                <div className="w-28">
                  <Label className="text-xs">Type</Label>
                  <Select value={newParamType} onValueChange={(v) => setNewParamType(v as 'number' | 'text')}>
                    <SelectTrigger className="mt-1 h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="number">Number</SelectItem>
                      <SelectItem value="text">Text</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button onClick={handleAddParam} size="sm" className="h-8" disabled={addParamMutation.isPending}>
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
            </CardContent>
          </CollapsibleContent>
        </Collapsible>
      </Card>

      {/* Dimension Values Table */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Dimension Values - {selectedSeriesData?.name}</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          {loadingValues ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin" />
            </div>
          ) : schema.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <p>Define parameters first in the section above.</p>
            </div>
          ) : seriesModels.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <p className="mb-2">No fan models found for {selectedSeriesData?.name}</p>
              <p className="text-sm">Add fan models in the Fan Models tab first</p>
            </div>
          ) : mergedDimensionData.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <p className="mb-2">No sizes defined.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="sticky left-0 bg-background z-10 w-24">Size (mm)</TableHead>
                    {schema.map(param => (
                      <TableHead key={param.param_key} className="text-center min-w-20">
                        {param.param_label}
                      </TableHead>
                    ))}
                    <TableHead className="w-16">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {mergedDimensionData.map(row => (
                    <TableRow 
                      key={row.size} 
                      className={!row.hasAllValues ? 'bg-amber-50/50 dark:bg-amber-950/20' : ''}
                    >
                      <TableCell className="sticky left-0 bg-background z-10 font-bold">
                        {row.size}mm
                        {row.isFromModel && (
                          <Badge variant="outline" className="ml-2 text-[10px]">auto</Badge>
                        )}
                        {!row.hasAllValues && row.hasSomeValues && (
                          <Badge variant="outline" className="ml-1 text-[10px] text-amber-600 border-amber-600">
                            {row.filledCount}/{schema.length}
                          </Badge>
                        )}
                      </TableCell>
                      {schema.map(param => {
                        const isEditing = editingCell?.size === row.size && editingCell?.key === param.param_key;
                        const cellValue = row.values[param.param_key] ?? '';
                        const isEmpty = cellValue === '' || cellValue === undefined;
                        
                        return (
                          <TableCell key={param.param_key} className="p-1 text-center">
                            {isEditing ? (
                              <div className="flex items-center gap-1">
                                <Input
                                  type="text"
                                  value={editValue}
                                  onChange={(e) => setEditValue(e.target.value)}
                                  className="h-7 w-full text-center text-sm"
                                  autoFocus
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') handleCellSave();
                                    if (e.key === 'Escape') handleCellCancel();
                                  }}
                                />
                                <Button size="icon" variant="ghost" className="h-6 w-6" onClick={handleCellSave}>
                                  <Check className="w-3 h-3 text-green-600" />
                                </Button>
                                <Button size="icon" variant="ghost" className="h-6 w-6" onClick={handleCellCancel}>
                                  <X className="w-3 h-3 text-muted-foreground" />
                                </Button>
                              </div>
                            ) : (
                              <button
                                onClick={() => handleCellClick(row.size, param.param_key, cellValue)}
                                className={`w-full h-7 px-2 text-sm hover:bg-muted/50 rounded transition-colors text-center ${isEmpty ? 'text-muted-foreground italic' : ''}`}
                              >
                                {isEmpty ? 'Set' : cellValue}
                              </button>
                            )}
                          </TableCell>
                        );
                      })}
                      <TableCell className="p-1">
                        {row.hasData && (
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive">
                                <Trash2 className="w-3 h-3" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete Size {row.size}?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  This will remove all dimension data for size {row.size}mm. This cannot be undone.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction 
                                  onClick={() => handleDeleteSize(row.size)}
                                  className="bg-destructive text-destructive-foreground"
                                >
                                  Delete
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Summary Card */}
      {selectedSeries && schema.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Dimension Summary for {selectedSeriesData?.name}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div className="p-3 bg-muted/50 rounded-lg text-center">
                <div className="text-2xl font-bold text-primary">{seriesModels.length}</div>
                <div className="text-muted-foreground text-xs">Fan Models</div>
              </div>
              <div className="p-3 bg-muted/50 rounded-lg text-center">
                <div className="text-2xl font-bold text-primary">{schema.length}</div>
                <div className="text-muted-foreground text-xs">Dimension Params</div>
              </div>
              <div className="p-3 bg-muted/50 rounded-lg text-center">
                <div className="text-2xl font-bold text-primary">
                  {mergedDimensionData.filter(d => d.hasAllValues).length}/{mergedDimensionData.length}
                </div>
                <div className="text-muted-foreground text-xs">Sizes Complete</div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
