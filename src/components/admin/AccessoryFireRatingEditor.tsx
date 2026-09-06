import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Save, Plus, Trash2, Loader2, Package, Flame, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/backend/client';
import { useAuth } from '@/lib/authContext';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

interface AccessoryDescription {
  id: string;
  tenant_id: string;
  accessory_code: string;
  description: string;
}

interface FireRatingDescription {
  id: string;
  tenant_id: string;
  fire_class: string;
  description: string;
}

interface AtexRatingDescription {
  id: string;
  tenant_id: string;
  atex_code: string;
  description: string;
}

export function AccessoryFireRatingEditor() {
  const { tenantId } = useAuth();
  const queryClient = useQueryClient();
  
  // Local state for editing
  const [accessoryEdits, setAccessoryEdits] = useState<Record<string, { code: string; description: string }>>({});
  const [fireRatingEdits, setFireRatingEdits] = useState<Record<string, { code: string; description: string }>>({});
  const [atexEdits, setAtexEdits] = useState<Record<string, { code: string; description: string }>>({});
  const [newAccessory, setNewAccessory] = useState({ code: '', description: '' });
  const [newFireRating, setNewFireRating] = useState({ code: '', description: '' });
  const [newAtex, setNewAtex] = useState({ code: '', description: '' });
  
  // Fetch accessory descriptions
  const { data: accessoryDescriptions = [], isLoading: loadingAccessories } = useQuery({
    queryKey: ['accessory_descriptions', tenantId],
    queryFn: async () => {
      if (!tenantId) return [];
      const { data, error } = await supabase
        .from('accessory_descriptions')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('accessory_code');
      if (error) throw error;
      return data as AccessoryDescription[];
    },
    enabled: !!tenantId,
  });
  
  // Fetch fire rating descriptions
  const { data: fireRatingDescriptions = [], isLoading: loadingFireRatings } = useQuery({
    queryKey: ['fire_rating_descriptions', tenantId],
    queryFn: async () => {
      if (!tenantId) return [];
      const { data, error } = await supabase
        .from('fire_rating_descriptions')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('fire_class');
      if (error) throw error;
      return data as FireRatingDescription[];
    },
    enabled: !!tenantId,
  });
  
  // Fetch ATEX rating descriptions
  const { data: atexDescriptions = [], isLoading: loadingAtex } = useQuery({
    queryKey: ['atex_rating_descriptions', tenantId],
    queryFn: async () => {
      if (!tenantId) return [];
      const { data, error } = await supabase
        .from('atex_rating_descriptions')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('atex_code');
      if (error) throw error;
      return data as AtexRatingDescription[];
    },
    enabled: !!tenantId,
  });
  
  // Initialize edits when data loads
  useEffect(() => {
    const edits: Record<string, { code: string; description: string }> = {};
    accessoryDescriptions.forEach(acc => {
      edits[acc.id] = { code: acc.accessory_code, description: acc.description };
    });
    setAccessoryEdits(edits);
  }, [accessoryDescriptions]);
  
  useEffect(() => {
    const edits: Record<string, { code: string; description: string }> = {};
    fireRatingDescriptions.forEach(fr => {
      edits[fr.id] = { code: fr.fire_class, description: fr.description };
    });
    setFireRatingEdits(edits);
  }, [fireRatingDescriptions]);
  
  useEffect(() => {
    const edits: Record<string, { code: string; description: string }> = {};
    atexDescriptions.forEach(atex => {
      edits[atex.id] = { code: atex.atex_code, description: atex.description };
    });
    setAtexEdits(edits);
  }, [atexDescriptions]);
  
  // Update accessory mutation
  const updateAccessoryMutation = useMutation({
    mutationFn: async ({ id, code, description }: { id: string; code: string; description: string }) => {
      const { error } = await supabase
        .from('accessory_descriptions')
        .update({ accessory_code: code, description, updated_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accessory_descriptions'] });
      toast.success('Accessory description updated');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to update');
    },
  });
  
  // Add accessory mutation
  const addAccessoryMutation = useMutation({
    mutationFn: async ({ code, description }: { code: string; description: string }) => {
      if (!tenantId) throw new Error('No tenant');
      const { error } = await supabase
        .from('accessory_descriptions')
        .insert({ tenant_id: tenantId, accessory_code: code, description });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accessory_descriptions'] });
      setNewAccessory({ code: '', description: '' });
      toast.success('Accessory added');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to add');
    },
  });
  
  // Delete accessory mutation
  const deleteAccessoryMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('accessory_descriptions')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accessory_descriptions'] });
      toast.success('Accessory deleted');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to delete');
    },
  });
  
  // Update fire rating mutation
  const updateFireRatingMutation = useMutation({
    mutationFn: async ({ id, code, description }: { id: string; code: string; description: string }) => {
      const { error } = await supabase
        .from('fire_rating_descriptions')
        .update({ fire_class: code, description, updated_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fire_rating_descriptions'] });
      toast.success('Fire rating description updated');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to update');
    },
  });
  
  // Add fire rating mutation
  const addFireRatingMutation = useMutation({
    mutationFn: async ({ code, description }: { code: string; description: string }) => {
      if (!tenantId) throw new Error('No tenant');
      const { error } = await supabase
        .from('fire_rating_descriptions')
        .insert({ tenant_id: tenantId, fire_class: code, description });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fire_rating_descriptions'] });
      setNewFireRating({ code: '', description: '' });
      toast.success('Fire rating added');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to add');
    },
  });
  
  // Delete fire rating mutation
  const deleteFireRatingMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('fire_rating_descriptions')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fire_rating_descriptions'] });
      toast.success('Fire rating deleted');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to delete');
    },
  });
  
  // ATEX mutations
  const updateAtexMutation = useMutation({
    mutationFn: async ({ id, code, description }: { id: string; code: string; description: string }) => {
      const { error } = await supabase
        .from('atex_rating_descriptions')
        .update({ atex_code: code, description, updated_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['atex_rating_descriptions'] });
      toast.success('ATEX rating description updated');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to update');
    },
  });
  
  const addAtexMutation = useMutation({
    mutationFn: async ({ code, description }: { code: string; description: string }) => {
      if (!tenantId) throw new Error('No tenant');
      const { error } = await supabase
        .from('atex_rating_descriptions')
        .insert({ tenant_id: tenantId, atex_code: code, description });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['atex_rating_descriptions'] });
      setNewAtex({ code: '', description: '' });
      toast.success('ATEX rating added');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to add');
    },
  });
  
  const deleteAtexMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('atex_rating_descriptions')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['atex_rating_descriptions'] });
      toast.success('ATEX rating deleted');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to delete');
    },
  });
  
  const handleSaveAccessory = (id: string) => {
    const edit = accessoryEdits[id];
    if (!edit?.code?.trim() || !edit?.description?.trim()) {
      toast.error('Code and description are required');
      return;
    }
    updateAccessoryMutation.mutate({ id, code: edit.code.trim(), description: edit.description.trim() });
  };
  
  const handleAddAccessory = () => {
    if (!newAccessory.code.trim() || !newAccessory.description.trim()) {
      toast.error('Code and description are required');
      return;
    }
    addAccessoryMutation.mutate({ code: newAccessory.code.trim(), description: newAccessory.description.trim() });
  };
  
  const handleSaveFireRating = (id: string) => {
    const edit = fireRatingEdits[id];
    if (!edit?.code?.trim() || !edit?.description?.trim()) {
      toast.error('Code and description are required');
      return;
    }
    updateFireRatingMutation.mutate({ id, code: edit.code.trim(), description: edit.description.trim() });
  };
  
  const handleAddFireRating = () => {
    if (!newFireRating.code.trim() || !newFireRating.description.trim()) {
      toast.error('Code and description are required');
      return;
    }
    addFireRatingMutation.mutate({ code: newFireRating.code.trim(), description: newFireRating.description.trim() });
  };
  
  const handleSaveAtex = (id: string) => {
    const edit = atexEdits[id];
    if (!edit?.code?.trim() || !edit?.description?.trim()) {
      toast.error('Code and description are required');
      return;
    }
    updateAtexMutation.mutate({ id, code: edit.code.trim(), description: edit.description.trim() });
  };
  
  const handleAddAtex = () => {
    if (!newAtex.code.trim() || !newAtex.description.trim()) {
      toast.error('Code and description are required');
      return;
    }
    addAtexMutation.mutate({ code: newAtex.code.trim(), description: newAtex.description.trim() });
  };
  
  if (loadingAccessories || loadingFireRatings || loadingAtex) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }
  
  return (
    <div className="space-y-6 animate-fade-in">
      {/* Accessory Descriptions */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="w-5 h-5" />
            Accessory Descriptions
          </CardTitle>
          <CardDescription>
            Customize descriptions for accessories (ET, ID, ETID, etc.) that appear on datasheets when selected.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {accessoryDescriptions.map(acc => (
            <div key={acc.id} className="p-4 border rounded-lg space-y-3 bg-muted/30">
              <div className="flex items-center gap-3">
                <div className="w-24">
                  <Label>Code</Label>
                  <Input 
                    value={accessoryEdits[acc.id]?.code || ''}
                    onChange={e => setAccessoryEdits(prev => ({
                      ...prev,
                      [acc.id]: { ...prev[acc.id], code: e.target.value.toUpperCase() }
                    }))}
                    placeholder="e.g., ET"
                    className="mt-1"
                  />
                </div>
                <div className="flex-1">
                  <Label>Description</Label>
                  <Textarea 
                    value={accessoryEdits[acc.id]?.description || ''}
                    onChange={e => setAccessoryEdits(prev => ({
                      ...prev,
                      [acc.id]: { ...prev[acc.id], description: e.target.value }
                    }))}
                    placeholder="Description that appears on datasheet..."
                    className="mt-1"
                    rows={2}
                  />
                </div>
              </div>
              <div className="flex gap-2 justify-end">
                <Button 
                  size="sm" 
                  variant="outline"
                  onClick={() => deleteAccessoryMutation.mutate(acc.id)}
                  disabled={deleteAccessoryMutation.isPending}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
                <Button 
                  size="sm" 
                  onClick={() => handleSaveAccessory(acc.id)}
                  disabled={updateAccessoryMutation.isPending}
                >
                  {updateAccessoryMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  Save
                </Button>
              </div>
            </div>
          ))}
          
          {/* Add new accessory */}
          <div className="p-4 border-2 border-dashed rounded-lg space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-24">
                <Label>New Code</Label>
                <Input 
                  value={newAccessory.code}
                  onChange={e => setNewAccessory(prev => ({ ...prev, code: e.target.value.toUpperCase() }))}
                  placeholder="e.g., VD"
                  className="mt-1"
                />
              </div>
              <div className="flex-1">
                <Label>Description</Label>
                <Textarea 
                  value={newAccessory.description}
                  onChange={e => setNewAccessory(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Description for the new accessory..."
                  className="mt-1"
                  rows={2}
                />
              </div>
            </div>
            <div className="flex justify-end">
              <Button 
                onClick={handleAddAccessory}
                disabled={addAccessoryMutation.isPending}
              >
                {addAccessoryMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                Add Accessory
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
      
      {/* Fire Rating Descriptions */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Flame className="w-5 h-5" />
            Fire Rating Descriptions
          </CardTitle>
          <CardDescription>
            Customize descriptions for fire ratings (F300, F400, etc.) that appear on datasheets when selected.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {fireRatingDescriptions.map(fr => (
            <div key={fr.id} className="p-4 border rounded-lg space-y-3 bg-muted/30">
              <div className="flex items-center gap-3">
                <div className="w-24">
                  <Label>Code</Label>
                  <Input 
                    value={fireRatingEdits[fr.id]?.code || ''}
                    onChange={e => setFireRatingEdits(prev => ({
                      ...prev,
                      [fr.id]: { ...prev[fr.id], code: e.target.value.toUpperCase() }
                    }))}
                    placeholder="e.g., F300"
                    className="mt-1"
                  />
                </div>
                <div className="flex-1">
                  <Label>Description</Label>
                  <Textarea 
                    value={fireRatingEdits[fr.id]?.description || ''}
                    onChange={e => setFireRatingEdits(prev => ({
                      ...prev,
                      [fr.id]: { ...prev[fr.id], description: e.target.value }
                    }))}
                    placeholder="Description that appears on datasheet..."
                    className="mt-1"
                    rows={2}
                  />
                </div>
              </div>
              <div className="flex gap-2 justify-end">
                <Button 
                  size="sm" 
                  variant="outline"
                  onClick={() => deleteFireRatingMutation.mutate(fr.id)}
                  disabled={deleteFireRatingMutation.isPending}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
                <Button 
                  size="sm" 
                  onClick={() => handleSaveFireRating(fr.id)}
                  disabled={updateFireRatingMutation.isPending}
                >
                  {updateFireRatingMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  Save
                </Button>
              </div>
            </div>
          ))}
          
          {/* Add new fire rating */}
          <div className="p-4 border-2 border-dashed rounded-lg space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-24">
                <Label>New Code</Label>
                <Input 
                  value={newFireRating.code}
                  onChange={e => setNewFireRating(prev => ({ ...prev, code: e.target.value.toUpperCase() }))}
                  placeholder="e.g., F200"
                  className="mt-1"
                />
              </div>
              <div className="flex-1">
                <Label>Description</Label>
                <Textarea 
                  value={newFireRating.description}
                  onChange={e => setNewFireRating(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Description for the new fire rating..."
                  className="mt-1"
                  rows={2}
                />
              </div>
            </div>
            <div className="flex justify-end">
              <Button 
                onClick={handleAddFireRating}
                disabled={addFireRatingMutation.isPending}
              >
                {addFireRatingMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                Add Fire Rating
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
      
      {/* ATEX Rating Descriptions */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5" />
            ATEX Rating Descriptions
          </CardTitle>
          <CardDescription>
            Customize descriptions for ATEX zone ratings (Zone1, Zone2, Zone21, Zone22) for explosive atmosphere applications.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {atexDescriptions.map(atex => (
            <div key={atex.id} className="p-4 border rounded-lg space-y-3 bg-muted/30">
              <div className="flex items-center gap-3">
                <div className="w-24">
                  <Label>Code</Label>
                  <Input 
                    value={atexEdits[atex.id]?.code || ''}
                    onChange={e => setAtexEdits(prev => ({
                      ...prev,
                      [atex.id]: { ...prev[atex.id], code: e.target.value }
                    }))}
                    placeholder="e.g., Zone1"
                    className="mt-1"
                  />
                </div>
                <div className="flex-1">
                  <Label>Description</Label>
                  <Textarea 
                    value={atexEdits[atex.id]?.description || ''}
                    onChange={e => setAtexEdits(prev => ({
                      ...prev,
                      [atex.id]: { ...prev[atex.id], description: e.target.value }
                    }))}
                    placeholder="Description that appears on datasheet..."
                    className="mt-1"
                    rows={2}
                  />
                </div>
              </div>
              <div className="flex gap-2 justify-end">
                <Button 
                  size="sm" 
                  variant="outline"
                  onClick={() => deleteAtexMutation.mutate(atex.id)}
                  disabled={deleteAtexMutation.isPending}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
                <Button 
                  size="sm" 
                  onClick={() => handleSaveAtex(atex.id)}
                  disabled={updateAtexMutation.isPending}
                >
                  {updateAtexMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  Save
                </Button>
              </div>
            </div>
          ))}
          
          {/* Add new ATEX rating */}
          <div className="p-4 border-2 border-dashed rounded-lg space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-24">
                <Label>New Code</Label>
                <Input 
                  value={newAtex.code}
                  onChange={e => setNewAtex(prev => ({ ...prev, code: e.target.value }))}
                  placeholder="e.g., Zone0"
                  className="mt-1"
                />
              </div>
              <div className="flex-1">
                <Label>Description</Label>
                <Textarea 
                  value={newAtex.description}
                  onChange={e => setNewAtex(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Description for the new ATEX rating..."
                  className="mt-1"
                  rows={2}
                />
              </div>
            </div>
            <div className="flex justify-end">
              <Button 
                onClick={handleAddAtex}
                disabled={addAtexMutation.isPending}
              >
                {addAtexMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                Add ATEX Rating
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
