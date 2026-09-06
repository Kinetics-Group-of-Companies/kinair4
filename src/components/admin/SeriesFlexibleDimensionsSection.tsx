import { useState } from 'react';
import { Loader2, Plus, Check, X, Trash2, RefreshCw, Settings2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { ChevronDown, ChevronUp, Ruler } from 'lucide-react';
import { toast } from 'sonner';
import {
  useDimensionSchema,
  useDimensionValues,
  useUpsertDimensionValue,
  useDeleteDimensionValue,
  useSyncSizesFromModels,
  useInitializeDefaultSchema,
  DimensionParam,
} from '@/hooks/useFlexibleDimensions';

interface SeriesFlexibleDimensionsSectionProps {
  seriesId: string;
  seriesName: string;
}

export function SeriesFlexibleDimensionsSection({ seriesId, seriesName }: SeriesFlexibleDimensionsSectionProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [showAddSize, setShowAddSize] = useState(false);
  const [newSize, setNewSize] = useState<number>(0);
  const [editingCell, setEditingCell] = useState<{ size: number; key: string } | null>(null);
  const [editValue, setEditValue] = useState<string>('');

  const { data: schema = [], isLoading: loadingSchema } = useDimensionSchema(seriesId);
  const { data: values = [], isLoading: loadingValues } = useDimensionValues(seriesId);
  const upsertValueMutation = useUpsertDimensionValue();
  const deleteValueMutation = useDeleteDimensionValue();
  const syncSizesMutation = useSyncSizesFromModels();
  const initSchemaMutation = useInitializeDefaultSchema();

  const handleAddSize = async () => {
    if (newSize <= 0) {
      toast.error('Enter a valid size');
      return;
    }
    if (values.some((v) => v.size === newSize)) {
      toast.error('Size already exists');
      return;
    }
    await upsertValueMutation.mutateAsync({ seriesId, size: newSize, values: {} });
    setShowAddSize(false);
    setNewSize(0);
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

    const param = schema.find((p) => p.param_key === editingCell.key);
    const newVal = param?.param_type === 'number' ? parseFloat(editValue) || 0 : editValue;
    const updated = { ...row.values, [editingCell.key]: newVal };

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

  const isLoading = loadingSchema || loadingValues;

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger asChild>
        <Button variant="ghost" className="w-full justify-between p-2 h-auto">
          <div className="flex items-center gap-2 text-sm">
            <Ruler className="w-4 h-4" />
            <span>Dimensions ({values.length} sizes)</span>
          </div>
          {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </Button>
      </CollapsibleTrigger>

      <CollapsibleContent className="space-y-3 pt-3">
        {isLoading ? (
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
            <div className="flex items-center justify-between gap-2">
              <div className="flex gap-1">
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setShowAddSize(true)}>
                  <Plus className="w-3 h-3 mr-1" /> Add Size
                </Button>
                <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={handleSyncSizes} disabled={syncSizesMutation.isPending}>
                  {syncSizesMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                </Button>
              </div>
              <Badge variant="secondary" className="text-xs">{sortedSchema.length} params</Badge>
            </div>

            {showAddSize && (
              <div className="flex gap-2 items-end p-2 bg-muted/30 rounded border">
                <div className="flex-1">
                  <Label className="text-xs">New Size (mm)</Label>
                  <Input
                    type="number"
                    value={newSize || ''}
                    onChange={(e) => setNewSize(Number(e.target.value))}
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
                No dimensions. Click "Add Size" or sync from fan models.
              </p>
            ) : (
              <div className="overflow-x-auto rounded border max-h-[300px]">
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
                                    type={p.param_type === 'number' ? 'number' : 'text'}
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
      </CollapsibleContent>
    </Collapsible>
  );
}
