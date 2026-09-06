import { useState, useMemo, useEffect } from 'react';
import { Plus, Trash2, Save, Weight, Scale, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  useCasingWeights, 
  useUpsertCasingWeight, 
  useDeleteCasingWeight,
  useImpellerWeights,
  useUpsertImpellerWeight,
  useDeleteImpellerWeight,
  useMotorSpecifications,
  useFanSeries,
  useFanModels
} from '@/hooks/useFanDatabase';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { WeightExcelImportExport } from './WeightExcelImportExport';
import { Badge } from '@/components/ui/badge';

export function WeightDataEditor() {
  const { data: series = [], isLoading: loadingSeries } = useFanSeries();
  const { data: allFanModels = [], isLoading: loadingModels } = useFanModels();
  const [selectedSeriesId, setSelectedSeriesId] = useState<string | null>(null);
  
  const { data: casingWeights = [], isLoading: loadingCasing } = useCasingWeights(selectedSeriesId);
  const { data: impellerWeights = [], isLoading: loadingImpeller } = useImpellerWeights(selectedSeriesId);
  const { data: motorSpecs = [] } = useMotorSpecifications();
  
  const upsertCasing = useUpsertCasingWeight();
  const deleteCasing = useDeleteCasingWeight();
  const upsertImpeller = useUpsertImpellerWeight();
  const deleteImpeller = useDeleteImpellerWeight();

  // Get fan models for selected series
  const seriesModels = useMemo(() => {
    if (!selectedSeriesId) return [];
    return allFanModels.filter(m => (m as any).seriesId === selectedSeriesId);
  }, [allFanModels, selectedSeriesId]);

  // Get unique sizes from series models
  const modelSizes = useMemo(() => {
    const sizes = new Set<string>();
    seriesModels.forEach(m => {
      if (m.modelName) {
        sizes.add(m.modelName);
      } else if (m.diameter) {
        sizes.add(String(m.diameter));
      }
    });
    return Array.from(sizes).sort((a, b) => {
      const numA = parseInt(a);
      const numB = parseInt(b);
      if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
      return a.localeCompare(b);
    });
  }, [seriesModels]);

  // Get unique blade counts from series models
  const modelBladeConfigs = useMemo(() => {
    const configs: { size: string; diameter: number; bladeCount: number }[] = [];
    seriesModels.forEach(m => {
      const size = m.modelName || String(m.diameter);
      m.bladeConfigurations.forEach(bc => {
        if (bc.bladeCount > 0) { // Exclude 0 blade count (non-axial)
          configs.push({
            size,
            diameter: m.diameter,
            bladeCount: bc.bladeCount
          });
        }
      });
    });
    return configs;
  }, [seriesModels]);

  // Merge model sizes with existing weights
  const mergedCasingData = useMemo(() => {
    const weightMap = new Map(casingWeights.map(cw => [cw.modelName || String(cw.diameter), cw]));
    
    return modelSizes.map(size => {
      const existing = weightMap.get(size);
      const isNumeric = /^\d+$/.test(size);
      return {
        size,
        diameter: isNumeric ? parseInt(size) : 0,
        modelName: isNumeric ? undefined : size,
        weight: existing?.weight ?? null,
        id: existing?.id,
        hasWeight: existing?.weight !== undefined && existing?.weight !== null
      };
    });
  }, [modelSizes, casingWeights]);

  // Merge blade configs with existing impeller weights
  const mergedImpellerData = useMemo(() => {
    const weightMap = new Map(
      impellerWeights.map(iw => [`${iw.modelName || iw.diameter}-${iw.bladeCount}`, iw])
    );
    
    return modelBladeConfigs.map(config => {
      const key = `${config.size}-${config.bladeCount}`;
      const existing = weightMap.get(key);
      const isNumeric = /^\d+$/.test(config.size);
      return {
        size: config.size,
        diameter: config.diameter,
        modelName: isNumeric ? undefined : config.size,
        bladeCount: config.bladeCount,
        weight: existing?.weight ?? null,
        id: existing?.id,
        hasWeight: existing?.weight !== undefined && existing?.weight !== null
      };
    });
  }, [modelBladeConfigs, impellerWeights]);

  // Edit state for inline editing
  const [editingCasing, setEditingCasing] = useState<string | null>(null);
  const [editCasingWeight, setEditCasingWeight] = useState<string>('');
  const [editingImpeller, setEditingImpeller] = useState<string | null>(null);
  const [editImpellerWeight, setEditImpellerWeight] = useState<string>('');

  const handleSaveCasingWeight = (item: { size: string; diameter: number; modelName?: string }) => {
    if (!selectedSeriesId) return;
    const weight = parseFloat(editCasingWeight);
    if (isNaN(weight) || weight < 0) {
      toast.error('Please enter a valid weight');
      return;
    }
    upsertCasing.mutate({ 
      diameter: item.diameter, 
      modelName: item.modelName, 
      weight, 
      seriesId: selectedSeriesId 
    });
    setEditingCasing(null);
    setEditCasingWeight('');
  };

  const handleDeleteCasingWeight = (item: { id?: string; size: string }) => {
    if (!item.id) return;
    if (confirm(`Delete casing weight for ${item.size}?`)) {
      deleteCasing.mutate(item.id);
    }
  };

  const handleSaveImpellerWeight = (item: { size: string; diameter: number; modelName?: string; bladeCount: number }) => {
    if (!selectedSeriesId) return;
    const weight = parseFloat(editImpellerWeight);
    if (isNaN(weight) || weight < 0) {
      toast.error('Please enter a valid weight');
      return;
    }
    upsertImpeller.mutate({ 
      diameter: item.diameter, 
      modelName: item.modelName, 
      bladeCount: item.bladeCount,
      weight,
      seriesId: selectedSeriesId 
    });
    setEditingImpeller(null);
    setEditImpellerWeight('');
  };

  const handleDeleteImpellerWeight = (item: { id?: string; size: string; bladeCount: number }) => {
    if (!item.id) return;
    if (confirm(`Delete impeller weight for ${item.size} / ${item.bladeCount} blades?`)) {
      deleteImpeller.mutate(item.id);
    }
  };

  const startEditCasing = (item: { size: string; weight: number | null }) => {
    setEditingCasing(item.size);
    setEditCasingWeight(item.weight?.toString() || '');
  };

  const startEditImpeller = (item: { size: string; bladeCount: number; weight: number | null }) => {
    setEditingImpeller(`${item.size}-${item.bladeCount}`);
    setEditImpellerWeight(item.weight?.toString() || '');
  };

  if (loadingSeries || loadingModels || loadingCasing || loadingImpeller) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const selectedSeries = series.find(s => s.id === selectedSeriesId);
  const missingCasingWeights = mergedCasingData.filter(c => !c.hasWeight).length;
  const missingImpellerWeights = mergedImpellerData.filter(i => !i.hasWeight).length;

  return (
    <div className="space-y-6">
      {/* Series Selector */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Select Series</CardTitle>
          <CardDescription>
            Weight data is managed per series. Models are auto-populated from your fan database.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Select value={selectedSeriesId || ''} onValueChange={(val) => setSelectedSeriesId(val || null)}>
            <SelectTrigger className="w-64">
              <SelectValue placeholder="Select a series..." />
            </SelectTrigger>
            <SelectContent>
              {series.map(s => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name} ({allFanModels.filter(m => (m as any).seriesId === s.id).length} models)
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {!selectedSeriesId ? (
        <Card>
          <CardContent className="py-12">
            <div className="text-center text-muted-foreground">
              <Weight className="w-12 h-12 mx-auto mb-4 opacity-30" />
              <p>Please select a series to manage weight data</p>
            </div>
          </CardContent>
        </Card>
      ) : seriesModels.length === 0 ? (
        <Card>
          <CardContent className="py-12">
            <div className="text-center text-muted-foreground">
              <Weight className="w-12 h-12 mx-auto mb-4 opacity-30" />
              <p>No fan models found for {selectedSeries?.name}</p>
              <p className="text-xs mt-2">Add fan models in the Fan Models tab first</p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Summary */}
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-medium flex items-center gap-2">
                Weight Data for <Badge variant="secondary">{selectedSeries?.name}</Badge>
              </h3>
              <p className="text-xs text-muted-foreground">
                {missingCasingWeights > 0 || missingImpellerWeights > 0 ? (
                  <span className="text-amber-600">
                    {missingCasingWeights} casing and {missingImpellerWeights} impeller weights missing
                  </span>
                ) : (
                  <span className="text-green-600">All weights configured ✓</span>
                )}
              </p>
            </div>
            <WeightExcelImportExport />
          </div>

          <Tabs defaultValue="casing" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="casing" className="gap-2">
                <Weight className="w-4 h-4" />
                Casing Weights
                {missingCasingWeights > 0 && (
                  <Badge variant="outline" className="ml-1 text-amber-600 border-amber-600">
                    {missingCasingWeights}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="impeller" className="gap-2">
                <Scale className="w-4 h-4" />
                Impeller Weights
                {missingImpellerWeights > 0 && (
                  <Badge variant="outline" className="ml-1 text-amber-600 border-amber-600">
                    {missingImpellerWeights}
                  </Badge>
                )}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="casing" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Casing Weights</CardTitle>
                  <CardDescription>
                    Enter weight (kg) for each model size in {selectedSeries?.name} series
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="border rounded-lg overflow-hidden">
                    <div className="max-h-[500px] overflow-auto">
                      <Table>
                        <TableHeader className="sticky top-0 bg-card z-10">
                          <TableRow>
                            <TableHead>Model/Size</TableHead>
                            <TableHead>Weight (kg)</TableHead>
                            <TableHead className="w-[140px]">Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {mergedCasingData.length === 0 ? (
                            <TableRow>
                              <TableCell colSpan={3} className="text-center py-8 text-muted-foreground">
                                <Weight className="w-8 h-8 mx-auto mb-2 opacity-30" />
                                <p>No model sizes found</p>
                              </TableCell>
                            </TableRow>
                          ) : (
                            mergedCasingData.map(item => (
                              <TableRow key={item.size} className={!item.hasWeight ? 'bg-amber-50/50 dark:bg-amber-950/20' : ''}>
                                <TableCell className="font-medium">
                                  {item.modelName || `${item.diameter}mm`}
                                </TableCell>
                                <TableCell>
                                  {editingCasing === item.size ? (
                                    <Input
                                      type="number"
                                      min="0"
                                      step="any"
                                      value={editCasingWeight}
                                      onChange={(e) => setEditCasingWeight(e.target.value)}
                                      className="w-24"
                                      autoFocus
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter') handleSaveCasingWeight(item);
                                        if (e.key === 'Escape') setEditingCasing(null);
                                      }}
                                    />
                                  ) : item.hasWeight ? (
                                    `${item.weight}kg`
                                  ) : (
                                    <span className="text-muted-foreground italic">Not set</span>
                                  )}
                                </TableCell>
                                <TableCell>
                                  <div className="flex items-center gap-1">
                                    {editingCasing === item.size ? (
                                      <>
                                        <Button variant="ghost" size="sm" onClick={() => handleSaveCasingWeight(item)}>
                                          <Save className="w-3 h-3" />
                                        </Button>
                                        <Button variant="ghost" size="sm" onClick={() => setEditingCasing(null)}>
                                          Cancel
                                        </Button>
                                      </>
                                    ) : (
                                      <>
                                        <Button variant="ghost" size="sm" onClick={() => startEditCasing(item)}>
                                          {item.hasWeight ? 'Edit' : 'Set'}
                                        </Button>
                                        {item.hasWeight && (
                                          <Button variant="ghost" size="sm" className="text-destructive" onClick={() => handleDeleteCasingWeight(item)}>
                                            <Trash2 className="w-3 h-3" />
                                          </Button>
                                        )}
                                      </>
                                    )}
                                  </div>
                                </TableCell>
                              </TableRow>
                            ))
                          )}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="impeller" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Impeller Weights</CardTitle>
                  <CardDescription>
                    Enter weight (kg) for each model size and blade configuration in {selectedSeries?.name} series
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {mergedImpellerData.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground border rounded-lg">
                      <Scale className="w-8 h-8 mx-auto mb-2 opacity-30" />
                      <p>No blade configurations found</p>
                      <p className="text-xs mt-1">This may be a non-axial series without blade configurations</p>
                    </div>
                  ) : (
                    <div className="border rounded-lg overflow-hidden">
                      <div className="max-h-[500px] overflow-auto">
                        <Table>
                          <TableHeader className="sticky top-0 bg-card z-10">
                            <TableRow>
                              <TableHead>Model/Size</TableHead>
                              <TableHead>Blade Count</TableHead>
                              <TableHead>Weight (kg)</TableHead>
                              <TableHead className="w-[140px]">Actions</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {mergedImpellerData.map(item => {
                              const key = `${item.size}-${item.bladeCount}`;
                              return (
                                <TableRow key={key} className={!item.hasWeight ? 'bg-amber-50/50 dark:bg-amber-950/20' : ''}>
                                  <TableCell className="font-medium">
                                    {item.modelName || `${item.diameter}mm`}
                                  </TableCell>
                                  <TableCell>{item.bladeCount} blades</TableCell>
                                  <TableCell>
                                    {editingImpeller === key ? (
                                      <Input
                                        type="number"
                                        min="0"
                                        step="any"
                                        value={editImpellerWeight}
                                        onChange={(e) => setEditImpellerWeight(e.target.value)}
                                        className="w-24"
                                        autoFocus
                                        onKeyDown={(e) => {
                                          if (e.key === 'Enter') handleSaveImpellerWeight(item);
                                          if (e.key === 'Escape') setEditingImpeller(null);
                                        }}
                                      />
                                    ) : item.hasWeight ? (
                                      `${item.weight}kg`
                                    ) : (
                                      <span className="text-muted-foreground italic">Not set</span>
                                    )}
                                  </TableCell>
                                  <TableCell>
                                    <div className="flex items-center gap-1">
                                      {editingImpeller === key ? (
                                        <>
                                          <Button variant="ghost" size="sm" onClick={() => handleSaveImpellerWeight(item)}>
                                            <Save className="w-3 h-3" />
                                          </Button>
                                          <Button variant="ghost" size="sm" onClick={() => setEditingImpeller(null)}>
                                            Cancel
                                          </Button>
                                        </>
                                      ) : (
                                        <>
                                          <Button variant="ghost" size="sm" onClick={() => startEditImpeller(item)}>
                                            {item.hasWeight ? 'Edit' : 'Set'}
                                          </Button>
                                          {item.hasWeight && (
                                            <Button variant="ghost" size="sm" className="text-destructive" onClick={() => handleDeleteImpellerWeight(item)}>
                                              <Trash2 className="w-3 h-3" />
                                            </Button>
                                          )}
                                        </>
                                      )}
                                    </div>
                                  </TableCell>
                                </TableRow>
                              );
                            })}
                          </TableBody>
                        </Table>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>

          {/* Weight Summary */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Weight Data Summary for {selectedSeries?.name}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div className="p-3 bg-muted/50 rounded-lg text-center">
                  <div className="text-2xl font-bold text-primary">{seriesModels.length}</div>
                  <div className="text-muted-foreground text-xs">Fan Models</div>
                </div>
                <div className="p-3 bg-muted/50 rounded-lg text-center">
                  <div className="text-2xl font-bold text-primary">
                    {mergedCasingData.filter(c => c.hasWeight).length}/{mergedCasingData.length}
                  </div>
                  <div className="text-muted-foreground text-xs">Casing Weights Set</div>
                </div>
                <div className="p-3 bg-muted/50 rounded-lg text-center">
                  <div className="text-2xl font-bold text-primary">
                    {mergedImpellerData.filter(i => i.hasWeight).length}/{mergedImpellerData.length}
                  </div>
                  <div className="text-muted-foreground text-xs">Impeller Weights Set</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
