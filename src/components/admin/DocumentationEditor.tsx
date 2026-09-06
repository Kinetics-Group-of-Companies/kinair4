import { useState, useEffect } from 'react';
import { Save, Loader2, Eye, EyeOff, GripVertical, Trash2, Plus, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { useDocumentation, useUpsertDocumentation, useDeleteDocumentationSection } from '@/hooks/useFanDatabase';
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

interface DocumentationSection {
  id?: string;
  section_key: string;
  title: string;
  content: string;
  display_order: number;
  is_visible: boolean;
}

const DEFAULT_SECTIONS: Omit<DocumentationSection, 'id'>[] = [
  {
    section_key: 'getting-started',
    title: 'Getting Started',
    content: `The Fan Selector helps you find the optimal fan for your ventilation requirements. Simply enter your airflow and static pressure requirements, and the system will calculate the best fan options based on efficiency, motor size, and performance match.

Steps:
1. Enter required airflow and select unit (CMH, LPS, CFM, CMS)
2. Enter required static pressure and select unit (Pa, in.wg, mm.wg)
3. Select motor pole configuration and frequency (50/60 Hz)
4. Choose fire class if required (F300, F400)
5. Set motor safety factor
6. Click "Find Fans" to see optimal selections`,
    display_order: 0,
    is_visible: true,
  },
  {
    section_key: 'nomenclature',
    title: 'Model Nomenclature',
    content: `Understanding model naming:

KTAF/2-315-4/20°-0.37kW-F400

2 = Motor Poles (2P, 4P, 6P)
315 = Fan Casing Diameter (mm)
4 = Number of Blades
20° = Blade Angle
0.37kW = Motor Rating
F400 = Fire Class (optional)`,
    display_order: 1,
    is_visible: true,
  },
  {
    section_key: 'fan-laws',
    title: 'Fan Laws',
    content: `Fan laws describe the relationship between fan performance variables when speed changes:

Q₂/Q₁ = N₂/N₁
Airflow varies directly with speed

P₂/P₁ = (N₂/N₁)²
Pressure varies with speed squared

W₂/W₁ = (N₂/N₁)³
Power varies with speed cubed`,
    display_order: 2,
    is_visible: true,
  },
  {
    section_key: 'fire-class',
    title: 'Fire Classification',
    content: `Class F (Standard): Standard insulation class for normal operating conditions. Suitable for general ventilation applications.

F300 - 300°C/2h: Smoke extract fan certified for operation at 300°C for 2 hours. Used in smoke ventilation systems for car parks and commercial buildings.

F400 - 400°C/2h: High-temperature smoke extract fan certified for operation at 400°C for 2 hours. Required for industrial applications and high-risk areas.`,
    display_order: 3,
    is_visible: true,
  },
  {
    section_key: 'noise-data',
    title: 'Noise Data',
    content: `Sound power levels are provided in octave bands from 63 Hz to 8 kHz, plus overall A-weighted levels.

63 Hz - Low frequency rumble
125-250 Hz - Low-mid frequencies
500-1000 Hz - Mid frequencies (most audible)
2k-8k Hz - High frequencies
Overall dB(A) - A-weighted total sound level`,
    display_order: 4,
    is_visible: true,
  },
];

export function DocumentationEditor() {
  const { data: savedSections = [], isLoading } = useDocumentation();
  const upsertMutation = useUpsertDocumentation();
  const deleteMutation = useDeleteDocumentationSection();
  const [sections, setSections] = useState<DocumentationSection[]>([]);
  const [hasChanges, setHasChanges] = useState(false);
  const [newSectionKey, setNewSectionKey] = useState('');
  const [newSectionTitle, setNewSectionTitle] = useState('');

  // Initialize sections from saved data or defaults
  useEffect(() => {
    if (!isLoading) {
      if (savedSections.length > 0) {
        setSections(savedSections.map(s => ({
          id: s.id,
          section_key: s.section_key,
          title: s.title,
          content: s.content || '',
          display_order: s.display_order ?? 0,
          is_visible: s.is_visible ?? true,
        })));
      } else {
        setSections(DEFAULT_SECTIONS);
      }
    }
  }, [savedSections, isLoading]);

  const handleSectionChange = (index: number, field: keyof DocumentationSection, value: string | boolean | number) => {
    setSections(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
    setHasChanges(true);
  };

  const handleSaveAll = async () => {
    try {
      await upsertMutation.mutateAsync(sections);
      setHasChanges(false);
      toast.success('Documentation saved successfully');
    } catch (error) {
      toast.error('Failed to save documentation');
    }
  };

  const handleInitializeDefaults = async () => {
    try {
      await upsertMutation.mutateAsync(DEFAULT_SECTIONS);
      toast.success('Default documentation created');
    } catch (error) {
      toast.error('Failed to initialize documentation');
    }
  };

  const handleDeleteSection = async (sectionKey: string) => {
    try {
      await deleteMutation.mutateAsync(sectionKey);
      setSections(prev => prev.filter(s => s.section_key !== sectionKey));
      toast.success('Section deleted');
    } catch (error) {
      toast.error('Failed to delete section');
    }
  };

  const handleAddSection = () => {
    if (!newSectionKey.trim() || !newSectionTitle.trim()) {
      toast.error('Please enter both a key and title');
      return;
    }
    const key = newSectionKey.toLowerCase().replace(/\s+/g, '-');
    if (sections.some(s => s.section_key === key)) {
      toast.error('Section key already exists');
      return;
    }
    setSections(prev => [...prev, {
      section_key: key,
      title: newSectionTitle,
      content: '',
      display_order: prev.length,
      is_visible: true,
    }]);
    setNewSectionKey('');
    setNewSectionTitle('');
    setHasChanges(true);
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-xl font-semibold">Documentation Sections</h2>
          <p className="text-sm text-muted-foreground">Edit the content displayed on the Documentation page. All changes are visible to all users.</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" onClick={handleInitializeDefaults} disabled={upsertMutation.isPending}>
            <RotateCcw className="w-4 h-4" />
            Reset to Defaults
          </Button>
          <Button onClick={handleSaveAll} disabled={!hasChanges || upsertMutation.isPending}>
            {upsertMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save All Changes
          </Button>
        </div>
      </div>

      {sections.length === 0 ? (
        <Card>
          <CardContent className="text-center py-12">
            <p className="text-muted-foreground mb-4">No documentation sections configured yet.</p>
            <Button onClick={handleInitializeDefaults} disabled={upsertMutation.isPending}>
              {upsertMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Initialize Default Sections
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="space-y-4">
            {sections.map((section, index) => (
              <Card key={section.section_key}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 flex-1">
                      <GripVertical className="w-4 h-4 text-muted-foreground cursor-move" />
                      <div className="flex-1">
                        <Input
                          value={section.title}
                          onChange={e => handleSectionChange(index, 'title', e.target.value)}
                          className="font-semibold text-lg border-none p-0 h-auto focus-visible:ring-0"
                          placeholder="Section Title"
                        />
                        <p className="text-xs text-muted-foreground mt-1">Key: {section.section_key}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-2">
                        <Label htmlFor={`visible-${section.section_key}`} className="text-sm text-muted-foreground">
                          {section.is_visible ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                        </Label>
                        <Switch
                          id={`visible-${section.section_key}`}
                          checked={section.is_visible}
                          onCheckedChange={checked => handleSectionChange(index, 'is_visible', checked)}
                        />
                      </div>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive hover:bg-destructive/10">
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete Section?</AlertDialogTitle>
                            <AlertDialogDescription>
                              This will permanently delete the "{section.title}" section. This action cannot be undone.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction 
                              onClick={() => handleDeleteSection(section.section_key)}
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            >
                              Delete
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <Textarea
                    value={section.content}
                    onChange={e => handleSectionChange(index, 'content', e.target.value)}
                    placeholder="Section content..."
                    className="min-h-[150px] resize-y"
                  />
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Add New Section */}
          <Card className="border-dashed">
            <CardContent className="py-4">
              <div className="flex items-end gap-3">
                <div className="flex-1">
                  <Label className="text-xs">Section Key</Label>
                  <Input 
                    value={newSectionKey} 
                    onChange={e => setNewSectionKey(e.target.value)} 
                    placeholder="e.g., installation-guide"
                    className="mt-1"
                  />
                </div>
                <div className="flex-1">
                  <Label className="text-xs">Section Title</Label>
                  <Input 
                    value={newSectionTitle} 
                    onChange={e => setNewSectionTitle(e.target.value)} 
                    placeholder="e.g., Installation Guide"
                    className="mt-1"
                  />
                </div>
                <Button onClick={handleAddSection} size="sm">
                  <Plus className="w-4 h-4" />
                  Add Section
                </Button>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {hasChanges && (
        <div className="sticky bottom-4 flex justify-end">
          <Button onClick={handleSaveAll} disabled={upsertMutation.isPending} size="lg" className="shadow-lg">
            {upsertMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save All Changes
          </Button>
        </div>
      )}
    </div>
  );
}
