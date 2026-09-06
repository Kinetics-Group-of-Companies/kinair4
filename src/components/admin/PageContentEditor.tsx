import { useState, useEffect } from 'react';
import { Save, Loader2, Eye, EyeOff, GripVertical, Info, Trash2, Plus, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { usePageContent, useUpsertPageContent, useDeletePageSection } from '@/hooks/usePageContent';
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

interface PageSection {
  section_key: string;
  title: string;
  content: string;
  is_visible: boolean;
  display_order: number;
}

const DEFAULT_HOME_SECTIONS: PageSection[] = [
  { section_key: 'hero_title', title: 'Hero Title', content: 'KINAIR Ventilation Fans & Air Curtains', is_visible: true, display_order: 0 },
  { section_key: 'hero_description', title: 'Hero Description', content: 'High-performance ventilation fans and air curtains for residential, commercial and industrial applications — with instant selection, datasheets and technical drawings.', is_visible: true, display_order: 1 },

  { section_key: 'families', title: 'What We Do Section (show/hide)', content: '', is_visible: true, display_order: 2 },
  { section_key: 'families_title', title: 'What We Do Title', content: 'What We Do', is_visible: true, display_order: 3 },
  { section_key: 'families_description', title: 'What We Do Description', content: 'Two product families, one selection platform — ventilation fans and air curtains for residential, commercial and industrial projects.', is_visible: true, display_order: 4 },
  { section_key: 'fans_title', title: 'Fans Card Title', content: 'Ventilation Fans', is_visible: true, display_order: 5 },
  { section_key: 'fans_description', title: 'Fans Card Description', content: 'Axial and centrifugal fans for residential, commercial and industrial ventilation — HVAC, exhaust, smoke extract, car parks and process plants.', is_visible: true, display_order: 6 },
  { section_key: 'fans_points', title: 'Fans Bullet Points (one per line)', content: 'Duty point selection by airflow and static pressure\nBlade angle, motor pole and speed optimisation\nSound power, octave bands and NC levels\nPerformance, power and efficiency curves\nTechnical drawings and dimension tables', is_visible: true, display_order: 7 },
  { section_key: 'curtains_title', title: 'Air Curtains Card Title', content: 'Air Curtains', is_visible: true, display_order: 8 },
  { section_key: 'curtains_description', title: 'Air Curtains Card Description', content: 'AC and EC motor air curtains that hold indoor conditions at open doorways, entrances and cold rooms.', is_visible: true, display_order: 9 },
  { section_key: 'curtains_points', title: 'Air Curtains Bullet Points (one per line)', content: 'Door width and mounting height based selection\nAir velocity, air volume and power comparison\nQuiet AC and low-consumption EC motor options\nUnit dimensions, weights and drawings\nInstant datasheet for the selected model', is_visible: true, display_order: 10 },

  { section_key: 'features', title: 'Why Choose Us Section (show/hide)', content: '', is_visible: true, display_order: 11 },
  { section_key: 'features_title', title: 'Why Choose Us Title', content: 'Why Choose Us', is_visible: true, display_order: 12 },
  { section_key: 'features_description', title: 'Why Choose Us Description', content: 'Fans and air curtains supported by real performance data, fast selection and complete technical documents.', is_visible: true, display_order: 13 },
  { section_key: 'feature_1_title', title: 'Feature 1 Title', content: 'Axial & Centrifugal Fans', is_visible: true, display_order: 14 },
  { section_key: 'feature_1_description', title: 'Feature 1 Description', content: 'Wide range of impeller diameters, blade angles and motor poles for every duty point.', is_visible: true, display_order: 15 },
  { section_key: 'feature_2_title', title: 'Feature 2 Title', content: 'Air Curtains', is_visible: true, display_order: 16 },
  { section_key: 'feature_2_description', title: 'Feature 2 Description', content: 'AC and EC motor air curtains for shop fronts, cold rooms, loading bays and entrances.', is_visible: true, display_order: 17 },
  { section_key: 'feature_3_title', title: 'Feature 3 Title', content: 'Engineered Selection', is_visible: true, display_order: 18 },
  { section_key: 'feature_3_description', title: 'Feature 3 Description', content: 'Software-driven selection with airflow, pressure, power, efficiency and noise data.', is_visible: true, display_order: 19 },
  { section_key: 'feature_4_title', title: 'Feature 4 Title', content: 'Complete Documentation', is_visible: true, display_order: 20 },
  { section_key: 'feature_4_description', title: 'Feature 4 Description', content: 'Datasheets, technical drawings, noise data, catalogues and installation manuals.', is_visible: true, display_order: 21 },

  { section_key: 'applications', title: 'Applications Section (show/hide)', content: '', is_visible: true, display_order: 22 },
  { section_key: 'applications_title', title: 'Applications Title', content: 'Where Our Products Work', is_visible: true, display_order: 23 },
  { section_key: 'applications_description', title: 'Applications Description', content: 'From apartments and villas to commercial buildings and industrial process plants, our fans and air curtains are selected for real project duties every day.', is_visible: true, display_order: 24 },
  { section_key: 'applications_list', title: 'Applications List (one per line)', content: 'Car park ventilation\nStaircase pressurization\nLift pressurization\nSmoke and make-up air fans\nKitchen extract and make-up fans\nPump room fans\nWarehouse fans\nWarehouse air curtains\nResidential, commercial and industrial air curtains\nVilla and residential toilet and kitchen fans', is_visible: true, display_order: 25 },

  { section_key: 'products_title', title: 'Fan Range Title', content: 'Our Fan Range', is_visible: true, display_order: 26 },
  { section_key: 'products_description', title: 'Fan Range Description', content: 'Explore our fan series — every series is fully modelled in the selector with performance, noise and dimension data.', is_visible: true, display_order: 27 },

  { section_key: 'ac_range', title: 'Air Curtain Range Section (show/hide)', content: '', is_visible: true, display_order: 28 },
  { section_key: 'ac_range_title', title: 'Air Curtain Range Title', content: 'Our Air Curtain Range', is_visible: true, display_order: 29 },
  { section_key: 'ac_range_description', title: 'Air Curtain Range Description', content: 'Air curtain series for residential, commercial and industrial doorways — from shop fronts to high-traffic entrances and cold rooms.', is_visible: true, display_order: 30 },

  { section_key: 'docs', title: 'Documentation Section (show/hide)', content: '', is_visible: true, display_order: 31 },
  { section_key: 'docs_title', title: 'Documentation Title', content: 'Technical Documentation', is_visible: true, display_order: 32 },
  { section_key: 'docs_description', title: 'Documentation Description', content: 'Download catalogues and installation manuals for all our product series', is_visible: true, display_order: 33 },

  { section_key: 'about', title: 'About Section (show/hide)', content: '', is_visible: true, display_order: 34 },
  { section_key: 'about_title', title: 'About Title', content: 'About KINAIR', is_visible: true, display_order: 35 },
  { section_key: 'about_content', title: 'About Content', content: 'We supply ventilation fans and air curtains for residential, commercial and industrial buildings — axial and centrifugal fans plus air curtains for HVAC, exhaust, smoke extract and entrance applications.', is_visible: true, display_order: 36 },
  { section_key: 'about_content_2', title: 'About Content 2', content: 'Every product is backed by tested performance data, so you get the right fan or air curtain with the documents you need for submission.', is_visible: true, display_order: 37 },

  { section_key: 'cta_title', title: 'CTA Title', content: 'Ready to Select Your Fan or Air Curtain?', is_visible: true, display_order: 38 },
  { section_key: 'cta_description', title: 'CTA Description', content: 'Use our selection tools to find the ideal fan or air curtain, and download the datasheet in seconds.', is_visible: true, display_order: 39 },
];

const DEFAULT_ABOUT_SECTIONS: PageSection[] = [
  { section_key: 'hero_title', title: 'About Us', content: '', is_visible: true, display_order: 0 },
  { section_key: 'hero_description', title: 'Hero Description', content: 'Ventilation fans and air curtains for residential, commercial and industrial buildings — from selection and performance data to datasheets and drawings.', is_visible: true, display_order: 1 },
  { section_key: 'mission_title', title: 'Our Mission', content: 'Our Mission', is_visible: true, display_order: 2 },
  { section_key: 'mission_content', title: 'Mission Content', content: 'To provide innovative, energy-efficient ventilation solutions that meet the highest standards of quality and performance.', is_visible: true, display_order: 3 },
  { section_key: 'who_we_are_title', title: 'Who We Are Title', content: 'Who We Are', is_visible: true, display_order: 4 },
  { section_key: 'who_we_are_content', title: 'Who We Are Content', content: 'With years of experience in the ventilation industry, we specialize in designing and manufacturing axial fans and air curtains for residential, commercial and industrial applications. Our team of engineers and technicians work together to deliver products that exceed customer expectations.', is_visible: true, display_order: 5 },
  { section_key: 'capabilities', title: 'Our Capabilities', content: 'Custom fan design and engineering\nHigh-temperature smoke extract fans\nPerformance-tested fan selection\nFire-rated fan solutions\nEnergy-efficient motor selection\nComplete ventilation system design', is_visible: true, display_order: 6 },
  { section_key: 'certifications', title: 'Certifications', content: 'Performance-tested fan solutions\nQuality-driven engineering process\nApplication-ready documentation', is_visible: true, display_order: 7 },
  { section_key: 'team_title', title: 'Our Team Title', content: 'Our Team', is_visible: true, display_order: 8 },
  { section_key: 'team_content', title: 'Our Team Content', content: 'Our dedicated team of engineers, designers, and support staff are committed to providing exceptional products and services. With expertise in aerodynamics, motor technology, and residential, commercial and industrial applications, we deliver solutions tailored to your specific needs.', is_visible: true, display_order: 9 },
  { section_key: 'cta_title', title: 'CTA Title', content: 'Ready to Get Started?', is_visible: true, display_order: 10 },
  { section_key: 'cta_content', title: 'CTA Content', content: 'Contact us for a quote or use our fan selector tool to find the perfect solution.', is_visible: true, display_order: 11 },
];

const DEFAULT_QUOTE_SECTIONS: PageSection[] = [
  { section_key: 'hero_title', title: 'Request a Quote', content: 'Request a Quote', is_visible: true, display_order: 0 },
  { section_key: 'hero_description', title: 'Hero Description', content: 'Get a customized quote for your ventilation requirements', is_visible: true, display_order: 1 },
  { section_key: 'form_intro', title: 'Form Introduction', content: 'Fill in your details and requirements. Fields marked with * are required.', is_visible: true, display_order: 2 },
  { section_key: 'why_choose_us_title', title: 'Why Choose Us Title', content: 'Why Choose Us?', is_visible: true, display_order: 3 },
  { section_key: 'why_choose_us_content', title: 'Why Choose Us Content', content: '✓ Fast response within 24-48 hours\n✓ Competitive pricing\n✓ Custom engineering support\n✓ AMCA certified products\n✓ Fire-rated options available', is_visible: true, display_order: 4 },
  { section_key: 'contact_note', title: 'Contact Note', content: 'For urgent inquiries, please contact us directly.', is_visible: true, display_order: 5 },
];

export function PageContentEditor() {
  const { data: homeContent = [], isLoading: loadingHome } = usePageContent('home');
  const { data: aboutContent = [], isLoading: loadingAbout } = usePageContent('about');
  const { data: quoteContent = [], isLoading: loadingQuote } = usePageContent('quote');
  const upsertMutation = useUpsertPageContent();
  const deleteMutation = useDeletePageSection();
  
  const [homeSections, setHomeSections] = useState<PageSection[]>([]);
  const [aboutSections, setAboutSections] = useState<PageSection[]>([]);
  const [quoteSections, setQuoteSections] = useState<PageSection[]>([]);
  const [hasHomeChanges, setHasHomeChanges] = useState(false);
  const [hasAboutChanges, setHasAboutChanges] = useState(false);
  const [hasQuoteChanges, setHasQuoteChanges] = useState(false);
  const [newSectionKey, setNewSectionKey] = useState('');
  const [newSectionTitle, setNewSectionTitle] = useState('');

  // Initialize home sections
  useEffect(() => {
    if (!loadingHome) {
      const existingMap = new Map(homeContent.map(s => [s.section_key, s]));
      const merged = DEFAULT_HOME_SECTIONS.map(defaultSection => {
        const existing = existingMap.get(defaultSection.section_key);
        if (existing) {
          return {
            section_key: existing.section_key,
            title: existing.title || defaultSection.title,
            content: existing.content || defaultSection.content,
            is_visible: existing.is_visible ?? true,
            display_order: existing.display_order ?? defaultSection.display_order,
          };
        }
        return defaultSection;
      });
      homeContent.forEach(s => {
        if (!DEFAULT_HOME_SECTIONS.find(d => d.section_key === s.section_key)) {
          merged.push({
            section_key: s.section_key,
            title: s.title || '',
            content: s.content || '',
            is_visible: s.is_visible ?? true,
            display_order: s.display_order ?? merged.length,
          });
        }
      });
      setHomeSections(merged);
    }
  }, [homeContent, loadingHome]);

  // Initialize about sections
  useEffect(() => {
    if (!loadingAbout) {
      const existingMap = new Map(aboutContent.map(s => [s.section_key, s]));
      const merged = DEFAULT_ABOUT_SECTIONS.map(defaultSection => {
        const existing = existingMap.get(defaultSection.section_key);
        if (existing) {
          return {
            section_key: existing.section_key,
            title: existing.title || defaultSection.title,
            content: existing.content || defaultSection.content,
            is_visible: existing.is_visible ?? true,
            display_order: existing.display_order ?? defaultSection.display_order,
          };
        }
        return defaultSection;
      });
      aboutContent.forEach(s => {
        if (!DEFAULT_ABOUT_SECTIONS.find(d => d.section_key === s.section_key)) {
          merged.push({
            section_key: s.section_key,
            title: s.title || '',
            content: s.content || '',
            is_visible: s.is_visible ?? true,
            display_order: s.display_order ?? merged.length,
          });
        }
      });
      setAboutSections(merged);
    }
  }, [aboutContent, loadingAbout]);

  // Initialize quote sections
  useEffect(() => {
    if (!loadingQuote) {
      const existingMap = new Map(quoteContent.map(s => [s.section_key, s]));
      const merged = DEFAULT_QUOTE_SECTIONS.map(defaultSection => {
        const existing = existingMap.get(defaultSection.section_key);
        if (existing) {
          return {
            section_key: existing.section_key,
            title: existing.title || defaultSection.title,
            content: existing.content || defaultSection.content,
            is_visible: existing.is_visible ?? true,
            display_order: existing.display_order ?? defaultSection.display_order,
          };
        }
        return defaultSection;
      });
      quoteContent.forEach(s => {
        if (!DEFAULT_QUOTE_SECTIONS.find(d => d.section_key === s.section_key)) {
          merged.push({
            section_key: s.section_key,
            title: s.title || '',
            content: s.content || '',
            is_visible: s.is_visible ?? true,
            display_order: s.display_order ?? merged.length,
          });
        }
      });
      setQuoteSections(merged);
    }
  }, [quoteContent, loadingQuote]);

  const handleHomeChange = (index: number, field: keyof PageSection, value: string | boolean | number) => {
    setHomeSections(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
    setHasHomeChanges(true);
  };

  const handleAboutChange = (index: number, field: keyof PageSection, value: string | boolean | number) => {
    setAboutSections(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
    setHasAboutChanges(true);
  };

  const handleQuoteChange = (index: number, field: keyof PageSection, value: string | boolean | number) => {
    setQuoteSections(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
    setHasQuoteChanges(true);
  };

  const handleSaveHome = async () => {
    try {
      await upsertMutation.mutateAsync({ pageKey: 'home', sections: homeSections });
      setHasHomeChanges(false);
      toast.success('Home page content saved');
    } catch (error) {
      toast.error('Failed to save Home page content');
    }
  };

  const handleSaveAbout = async () => {
    try {
      await upsertMutation.mutateAsync({ pageKey: 'about', sections: aboutSections });
      setHasAboutChanges(false);
      toast.success('About page content saved');
    } catch (error) {
      toast.error('Failed to save About page content');
    }
  };

  const handleSaveQuote = async () => {
    try {
      await upsertMutation.mutateAsync({ pageKey: 'quote', sections: quoteSections });
      setHasQuoteChanges(false);
      toast.success('Quote page content saved');
    } catch (error) {
      toast.error('Failed to save Quote page content');
    }
  };

  const handleInitializeHome = async () => {
    try {
      await upsertMutation.mutateAsync({ pageKey: 'home', sections: DEFAULT_HOME_SECTIONS });
      toast.success('Home page initialized with defaults');
    } catch (error) {
      toast.error('Failed to initialize Home page');
    }
  };

  const handleInitializeAbout = async () => {
    try {
      await upsertMutation.mutateAsync({ pageKey: 'about', sections: DEFAULT_ABOUT_SECTIONS });
      toast.success('About page initialized with defaults');
    } catch (error) {
      toast.error('Failed to initialize About page');
    }
  };

  const handleInitializeQuote = async () => {
    try {
      await upsertMutation.mutateAsync({ pageKey: 'quote', sections: DEFAULT_QUOTE_SECTIONS });
      toast.success('Quote page initialized with defaults');
    } catch (error) {
      toast.error('Failed to initialize Quote page');
    }
  };

  const handleDeleteHomeSection = async (sectionKey: string) => {
    try {
      await deleteMutation.mutateAsync({ pageKey: 'home', sectionKey });
      setHomeSections(prev => prev.filter(s => s.section_key !== sectionKey));
      toast.success('Section deleted');
    } catch (error) {
      toast.error('Failed to delete section');
    }
  };

  const handleDeleteAboutSection = async (sectionKey: string) => {
    try {
      await deleteMutation.mutateAsync({ pageKey: 'about', sectionKey });
      setAboutSections(prev => prev.filter(s => s.section_key !== sectionKey));
      toast.success('Section deleted');
    } catch (error) {
      toast.error('Failed to delete section');
    }
  };

  const handleDeleteQuoteSection = async (sectionKey: string) => {
    try {
      await deleteMutation.mutateAsync({ pageKey: 'quote', sectionKey });
      setQuoteSections(prev => prev.filter(s => s.section_key !== sectionKey));
      toast.success('Section deleted');
    } catch (error) {
      toast.error('Failed to delete section');
    }
  };

  const handleAddSection = (pageType: 'home' | 'about' | 'quote') => {
    if (!newSectionKey.trim() || !newSectionTitle.trim()) {
      toast.error('Please enter both a key and title');
      return;
    }
    const key = newSectionKey.toLowerCase().replace(/\s+/g, '_');
    const sections = pageType === 'home' ? homeSections : pageType === 'about' ? aboutSections : quoteSections;
    if (sections.some(s => s.section_key === key)) {
      toast.error('Section key already exists');
      return;
    }
    const newSection = {
      section_key: key,
      title: newSectionTitle,
      content: '',
      is_visible: true,
      display_order: sections.length,
    };
    if (pageType === 'home') {
      setHomeSections(prev => [...prev, newSection]);
      setHasHomeChanges(true);
    } else if (pageType === 'about') {
      setAboutSections(prev => [...prev, newSection]);
      setHasAboutChanges(true);
    } else {
      setQuoteSections(prev => [...prev, newSection]);
      setHasQuoteChanges(true);
    }
    setNewSectionKey('');
    setNewSectionTitle('');
  };

  if (loadingHome || loadingAbout || loadingQuote) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );
  }

  const renderSectionEditor = (
    sections: PageSection[],
    handleChange: (index: number, field: keyof PageSection, value: string | boolean | number) => void,
    handleDelete: (sectionKey: string) => void,
    pageType: 'home' | 'about' | 'quote'
  ) => (
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
                    onChange={e => handleChange(index, 'title', e.target.value)}
                    className="font-semibold text-lg border-none p-0 h-auto focus-visible:ring-0"
                    placeholder="Section Title"
                  />
                  <p className="text-xs text-muted-foreground mt-1">Key: {section.section_key}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <Label htmlFor={`visible-${pageType}-${section.section_key}`} className="text-sm text-muted-foreground">
                    {section.is_visible ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                  </Label>
                  <Switch
                    id={`visible-${pageType}-${section.section_key}`}
                    checked={section.is_visible}
                    onCheckedChange={checked => handleChange(index, 'is_visible', checked)}
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
                        onClick={() => handleDelete(section.section_key)}
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
              onChange={e => handleChange(index, 'content', e.target.value)}
              placeholder="Enter content... (use new lines to separate list items)"
              className="min-h-[100px] resize-y"
            />
            {section.section_key === 'capabilities' && (
              <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
                <Info className="w-3 h-3" />
                Enter each capability on a new line
              </p>
            )}
            {section.section_key === 'certifications' && (
              <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
                <Info className="w-3 h-3" />
                Format: Name - Description (one per line)
              </p>
            )}
            {(section.section_key === 'features' || section.section_key === 'about') && (
              <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
                <Info className="w-3 h-3" />
                Toggle visibility to show/hide this section on the page
              </p>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );

  const renderAddSection = (pageType: 'home' | 'about' | 'quote') => (
    <Card className="border-dashed">
      <CardContent className="py-4">
        <div className="flex items-end gap-3 flex-wrap">
          <div className="flex-1 min-w-[150px]">
            <Label className="text-xs">Section Key</Label>
            <Input 
              value={newSectionKey} 
              onChange={e => setNewSectionKey(e.target.value)} 
              placeholder="e.g., new_section"
              className="mt-1"
            />
          </div>
          <div className="flex-1 min-w-[150px]">
            <Label className="text-xs">Section Title</Label>
            <Input 
              value={newSectionTitle} 
              onChange={e => setNewSectionTitle(e.target.value)} 
              placeholder="e.g., New Section"
              className="mt-1"
            />
          </div>
          <Button onClick={() => handleAddSection(pageType)} size="sm">
            <Plus className="w-4 h-4" />
            Add Section
          </Button>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h2 className="text-xl font-semibold">Page Content Editor</h2>
        <p className="text-sm text-muted-foreground">Customize the Home, About Us, and Quote Request pages. All changes are visible to all users.</p>
      </div>

      <Tabs defaultValue="home" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="home">Home Page</TabsTrigger>
          <TabsTrigger value="about">About Page</TabsTrigger>
          <TabsTrigger value="quote">Quote Page</TabsTrigger>
        </TabsList>

        <TabsContent value="home" className="space-y-4 mt-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardDescription>Edit the content displayed on the Home page (Hero, Features, About section, CTA)</CardDescription>
            <div className="flex gap-2 flex-wrap">
              <Button variant="outline" onClick={handleInitializeHome} disabled={upsertMutation.isPending}>
                <RotateCcw className="w-4 h-4" />
                Reset to Defaults
              </Button>
              <Button onClick={handleSaveHome} disabled={!hasHomeChanges || upsertMutation.isPending}>
                {upsertMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Save Changes
              </Button>
            </div>
          </div>
          
          {homeSections.length === 0 ? (
            <Card>
              <CardContent className="text-center py-12">
                <p className="text-muted-foreground mb-4">No Home page content configured yet.</p>
                <Button onClick={handleInitializeHome} disabled={upsertMutation.isPending}>
                  Initialize Default Content
                </Button>
              </CardContent>
            </Card>
          ) : (
            <>
              {renderSectionEditor(homeSections, handleHomeChange, handleDeleteHomeSection, 'home')}
              {renderAddSection('home')}
            </>
          )}
        </TabsContent>

        <TabsContent value="about" className="space-y-4 mt-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardDescription>Edit the content displayed on the About Us page</CardDescription>
            <div className="flex gap-2 flex-wrap">
              <Button variant="outline" onClick={handleInitializeAbout} disabled={upsertMutation.isPending}>
                <RotateCcw className="w-4 h-4" />
                Reset to Defaults
              </Button>
              <Button onClick={handleSaveAbout} disabled={!hasAboutChanges || upsertMutation.isPending}>
                {upsertMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Save Changes
              </Button>
            </div>
          </div>
          
          {aboutSections.length === 0 ? (
            <Card>
              <CardContent className="text-center py-12">
                <p className="text-muted-foreground mb-4">No About page content configured yet.</p>
                <Button onClick={handleInitializeAbout} disabled={upsertMutation.isPending}>
                  Initialize Default Content
                </Button>
              </CardContent>
            </Card>
          ) : (
            <>
              {renderSectionEditor(aboutSections, handleAboutChange, handleDeleteAboutSection, 'about')}
              {renderAddSection('about')}
            </>
          )}
        </TabsContent>

        <TabsContent value="quote" className="space-y-4 mt-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardDescription>Edit the content displayed on the Quote Request page</CardDescription>
            <div className="flex gap-2 flex-wrap">
              <Button variant="outline" onClick={handleInitializeQuote} disabled={upsertMutation.isPending}>
                <RotateCcw className="w-4 h-4" />
                Reset to Defaults
              </Button>
              <Button onClick={handleSaveQuote} disabled={!hasQuoteChanges || upsertMutation.isPending}>
                {upsertMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Save Changes
              </Button>
            </div>
          </div>
          
          {quoteSections.length === 0 ? (
            <Card>
              <CardContent className="text-center py-12">
                <p className="text-muted-foreground mb-4">No Quote page content configured yet.</p>
                <Button onClick={handleInitializeQuote} disabled={upsertMutation.isPending}>
                  Initialize Default Content
                </Button>
              </CardContent>
            </Card>
          ) : (
            <>
              {renderSectionEditor(quoteSections, handleQuoteChange, handleDeleteQuoteSection, 'quote')}
              {renderAddSection('quote')}
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
