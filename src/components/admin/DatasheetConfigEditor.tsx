import { useState, useEffect } from 'react';
import { FileText, Save, Loader2, Eye, EyeOff, ChevronDown, ChevronUp, Settings, Plus, Trash2, Award, GripVertical, ArrowUp, ArrowDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { useFanSeries } from '@/hooks/useFanDatabase';
import { supabase } from '@/integrations/backend/client';
import { toast } from 'sonner';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

// Certification order type
type CertificationType = 'amca' | 'fire_rating' | 'ce' | 'ul' | 'iso' | 'atex' | 'custom';

const CERTIFICATION_LABELS: Record<CertificationType, string> = {
  amca: 'AMCA',
  fire_rating: 'Fire Rating',
  ce: 'CE Mark',
  ul: 'UL',
  iso: 'ISO',
  atex: 'ATEX',
  custom: 'Custom Certifications',
};

const DEFAULT_CERTIFICATION_ORDER: CertificationType[] = ['amca', 'fire_rating', 'ce', 'ul', 'iso', 'atex', 'custom'];

interface DatasheetLabels {
  [key: string]: string | undefined;
}

interface CustomCertification {
  name: string;
  logo_url?: string;
}

interface DatasheetConfig {
  id?: string;
  series_id: string;
  show_description: boolean;
  show_duty_point: boolean;
  show_operating_point: boolean;
  show_construction: boolean;
  show_motor_characteristics: boolean;
  show_performance_curves: boolean;
  show_noise_section: boolean;
  show_octave_bands: boolean;
  show_technical_drawing: boolean;
  show_dimensions_table: boolean;
  show_certifications: boolean;
  show_standard_notes: boolean;
  custom_description: string | null;
  custom_notes: string | null;
  show_vfd_features: boolean;
  vfd_features_content: string | null;
  show_family_curve: boolean;
  custom_sections: { title: string; content: string }[];
  custom_certifications: CustomCertification[];
  // New visibility options
  show_brand_logo: boolean;
  show_series_photo: boolean;
  show_fan_curve: boolean;
  show_power_curve: boolean;
  show_efficiency_curve: boolean;
  // Individual certification toggles
  show_cert_amca: boolean;
  show_cert_fire_rating: boolean;
  show_cert_ul: boolean;
  show_cert_ce: boolean;
  // Construction & operating point detail toggles
  show_blade_count: boolean;
  show_blade_angle: boolean;
  show_efficiency: boolean;
  // Motor detail toggles
  show_motor_brand: boolean;
  show_motor_efficiency_class: boolean;
  // Certification order
  certification_order: CertificationType[];
  // Editable text fields
  header_title: string | null;
  section_title_duty_point: string | null;
  section_title_operating_point: string | null;
  section_title_construction: string | null;
  section_title_motor: string | null;
  section_title_noise: string | null;
  section_title_dimensions: string | null;
  section_title_certifications: string | null;
  standard_notes_text: string | null;
  noise_reference_text: string | null;
  noise_directive_text: string | null;
  construction_labels: DatasheetLabels | null;
  duty_point_labels: DatasheetLabels | null;
  operating_point_labels: DatasheetLabels | null;
  motor_labels: DatasheetLabels | null;
  // QR Code visibility
  show_catalogue_qr: boolean;
  show_iom_qr: boolean;
}

const defaultConfig: Omit<DatasheetConfig, 'series_id'> = {
  show_description: true,
  show_duty_point: true,
  show_operating_point: true,
  show_construction: true,
  show_motor_characteristics: true,
  show_performance_curves: true,
  show_noise_section: true,
  show_octave_bands: true,
  show_technical_drawing: true,
  show_dimensions_table: true,
  show_certifications: true,
  show_standard_notes: true,
  custom_description: null,
  custom_notes: null,
  show_vfd_features: false,
  vfd_features_content: null,
  show_family_curve: false,
  custom_sections: [],
  custom_certifications: [],
  // New visibility options
  show_brand_logo: true,
  show_series_photo: true,
  show_fan_curve: true,
  show_power_curve: true,
  show_efficiency_curve: true,
  // Individual certification toggles
  show_cert_amca: true,
  show_cert_fire_rating: true,
  show_cert_ul: true,
  show_cert_ce: true,
  // Construction & operating point detail toggles
  show_blade_count: true,
  show_blade_angle: true,
  show_efficiency: true,
  // Motor detail toggles
  show_motor_brand: true,
  show_motor_efficiency_class: true,
  // Certification order
  certification_order: DEFAULT_CERTIFICATION_ORDER,
  header_title: 'Technical Datasheet',
  section_title_duty_point: 'Duty Point',
  section_title_operating_point: 'Operating Point',
  section_title_construction: 'Construction',
  section_title_motor: 'Motor Characteristics',
  section_title_noise: 'Sound Data',
  section_title_dimensions: 'Dimensions',
  section_title_certifications: 'Certifications',
  standard_notes_text: 'Selections are based on standard air density of 1.2 kg/m³. Performance tested per ISO 5801 / AMCA 210.',
  noise_reference_text: 'Sound power levels measured per ISO 13347 / AMCA 300. Values shown at specified distance from fan inlet.',
  noise_directive_text: 'In accordance with EU Directive 2006/42/EC and EN ISO 3744. Sound power level measured at free-field conditions.',
  construction_labels: null,
  duty_point_labels: null,
  operating_point_labels: null,
  motor_labels: null,
  // QR Code visibility
  show_catalogue_qr: true,
  show_iom_qr: true,
};

export function DatasheetConfigEditor() {
  const queryClient = useQueryClient();
  const { data: series = [], isLoading: loadingSeries } = useFanSeries();
  const [selectedSeries, setSelectedSeries] = useState<string>('');
  const [config, setConfig] = useState<DatasheetConfig | null>(null);
  const [sectionsOpen, setSectionsOpen] = useState(true);
  const [customOpen, setCustomOpen] = useState(false);
  const [textsOpen, setTextsOpen] = useState(false);
  const [certificationsOpen, setCertificationsOpen] = useState(false);

  // Set default selected series
  useEffect(() => {
    if (series.length > 0 && !selectedSeries) {
      setSelectedSeries(series[0].id);
    }
  }, [series, selectedSeries]);

  // Fetch config for selected series
  const { data: fetchedConfig, isLoading: loadingConfig } = useQuery({
    queryKey: ['datasheetConfig', selectedSeries],
    queryFn: async () => {
      if (!selectedSeries) return null;
      const { data, error } = await supabase
        .from('datasheet_config')
        .select('*')
        .eq('series_id', selectedSeries)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!selectedSeries,
  });

  // Update local state when fetched config changes
  useEffect(() => {
    if (fetchedConfig) {
      // Parse certification_order from JSON
      const certOrder = (fetchedConfig.certification_order as unknown as CertificationType[]) || DEFAULT_CERTIFICATION_ORDER;
      setConfig({
        ...fetchedConfig,
        custom_sections: (fetchedConfig.custom_sections as unknown as { title: string; content: string }[]) || [],
        custom_certifications: (fetchedConfig.custom_certifications as unknown as CustomCertification[]) || [],
        construction_labels: (fetchedConfig.construction_labels as DatasheetLabels) || null,
        duty_point_labels: (fetchedConfig.duty_point_labels as DatasheetLabels) || null,
        operating_point_labels: (fetchedConfig.operating_point_labels as DatasheetLabels) || null,
        motor_labels: (fetchedConfig.motor_labels as DatasheetLabels) || null,
        certification_order: certOrder,
      });
    } else if (selectedSeries) {
      setConfig({ ...defaultConfig, series_id: selectedSeries });
    }
  }, [fetchedConfig, selectedSeries]);
  const saveMutation = useMutation({
    mutationFn: async (configToSave: DatasheetConfig) => {
      const { id, ...data } = configToSave;
      // Cast to any to handle JSON types for Supabase
      const dataToSave = data as any;
      if (id) {
        const { error } = await supabase
          .from('datasheet_config')
          .update(dataToSave)
          .eq('id', id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('datasheet_config')
          .insert(dataToSave);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['datasheetConfig', selectedSeries] });
      toast.success('Datasheet configuration saved');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const handleToggle = (key: keyof DatasheetConfig, value: boolean) => {
    if (!config) return;
    setConfig({ ...config, [key]: value });
  };

  const handleTextChange = (key: keyof DatasheetConfig, value: string) => {
    if (!config) return;
    setConfig({ ...config, [key]: value || null });
  };

  const handleAddCustomSection = () => {
    if (!config) return;
    setConfig({
      ...config,
      custom_sections: [...config.custom_sections, { title: '', content: '' }],
    });
  };

  const handleUpdateCustomSection = (index: number, field: 'title' | 'content', value: string) => {
    if (!config) return;
    const updated = [...config.custom_sections];
    updated[index] = { ...updated[index], [field]: value };
    setConfig({ ...config, custom_sections: updated });
  };

  const handleRemoveCustomSection = (index: number) => {
    if (!config) return;
    const updated = config.custom_sections.filter((_, i) => i !== index);
    setConfig({ ...config, custom_sections: updated });
  };

  const handleAddCustomCertification = () => {
    if (!config) return;
    setConfig({
      ...config,
      custom_certifications: [...config.custom_certifications, { name: '', logo_url: '' }],
    });
  };

  const handleUpdateCustomCertification = (index: number, field: 'name' | 'logo_url', value: string) => {
    if (!config) return;
    const updated = [...config.custom_certifications];
    updated[index] = { ...updated[index], [field]: value };
    setConfig({ ...config, custom_certifications: updated });
  };

  const handleRemoveCustomCertification = (index: number) => {
    if (!config) return;
    const updated = config.custom_certifications.filter((_, i) => i !== index);
    setConfig({ ...config, custom_certifications: updated });
  };

  // Certification order handlers
  const handleMoveCertification = (index: number, direction: 'up' | 'down') => {
    if (!config) return;
    const order = [...config.certification_order];
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= order.length) return;
    [order[index], order[newIndex]] = [order[newIndex], order[index]];
    setConfig({ ...config, certification_order: order });
  };

  const handleSave = () => {
    if (!config) return;
    saveMutation.mutate(config);
  };

  const selectedSeriesName = series.find(s => s.id === selectedSeries)?.name || 'Series';

  if (loadingSeries) {
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

  const visibleCount = config ? Object.entries(config)
    .filter(([key]) => key.startsWith('show_'))
    .filter(([, value]) => value === true).length : 0;
  const totalSections = config ? Object.entries(config)
    .filter(([key]) => key.startsWith('show_')).length : 26;

  return (
    <div className="space-y-6">
      {/* Series Selector */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-primary" />
            <CardTitle className="text-lg">Datasheet Configuration</CardTitle>
          </div>
          <CardDescription>
            Control which sections appear in PDF datasheets and customize content per series.
          </CardDescription>
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
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="pt-5">
              <Badge variant="outline">
                {visibleCount}/{totalSections} sections visible
              </Badge>
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-3">
            <strong>Note:</strong> Technical description, certifications (AMCA, Fire Rating logos), and octave band settings 
            are configured in <span className="font-medium text-primary">Manage Series</span> tab. 
            Use this editor to control section visibility and add custom content.
          </p>
        </CardContent>
      </Card>

      {loadingConfig ? (
        <div className="flex justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
      ) : config ? (
        <>
          {/* Section Visibility */}
          <Card>
            <Collapsible open={sectionsOpen} onOpenChange={setSectionsOpen}>
              <CollapsibleTrigger asChild>
                <CardHeader className="cursor-pointer hover:bg-muted/30 transition-colors">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Settings className="w-4 h-4" />
                      <CardTitle className="text-base">Section Visibility</CardTitle>
                    </div>
                    {sectionsOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </div>
                </CardHeader>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <CardContent className="space-y-6 pt-0">
                  {/* Header & Branding */}
                  <div>
                    <h4 className="text-sm font-medium mb-3 text-muted-foreground">Header & Branding</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      <SectionToggle
                        label="Brand Logo"
                        description="Company logo in header"
                        checked={config.show_brand_logo}
                        onChange={(v) => handleToggle('show_brand_logo', v)}
                      />
                      <SectionToggle
                        label="Series Photo"
                        description="Product image in header"
                        checked={config.show_series_photo}
                        onChange={(v) => handleToggle('show_series_photo', v)}
                      />
                    </div>
                  </div>
                  
                  <Separator />
                  
                  {/* Specifications */}
                  <div>
                    <h4 className="text-sm font-medium mb-3 text-muted-foreground">Specifications</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      <SectionToggle
                        label="Technical Description"
                        description="Product description text at top"
                        checked={config.show_description}
                        onChange={(v) => handleToggle('show_description', v)}
                      />
                      <SectionToggle
                        label="Duty Point"
                        description="Required airflow, pressure, etc."
                        checked={config.show_duty_point}
                        onChange={(v) => handleToggle('show_duty_point', v)}
                      />
                      <SectionToggle
                        label="Operating Point"
                        description="Actual operating parameters"
                        checked={config.show_operating_point}
                        onChange={(v) => handleToggle('show_operating_point', v)}
                      />
                      <SectionToggle
                        label="Construction Details"
                        description="Diameter, blade count, weight"
                        checked={config.show_construction}
                        onChange={(v) => handleToggle('show_construction', v)}
                      />
                      <SectionToggle
                        label="Motor Characteristics"
                        description="Motor specs and ratings"
                        checked={config.show_motor_characteristics}
                        onChange={(v) => handleToggle('show_motor_characteristics', v)}
                      />
                      <SectionToggle
                        label="Blade Count"
                        description="Show blade count in specs"
                        checked={config.show_blade_count}
                        onChange={(v) => handleToggle('show_blade_count', v)}
                        disabled={!config.show_construction}
                      />
                      <SectionToggle
                        label="Blade Angle"
                        description="Show blade angle in specs"
                        checked={config.show_blade_angle}
                        onChange={(v) => handleToggle('show_blade_angle', v)}
                        disabled={!config.show_construction}
                      />
                      <SectionToggle
                        label="Efficiency"
                        description="Show efficiency in operating point"
                        checked={config.show_efficiency}
                        onChange={(v) => handleToggle('show_efficiency', v)}
                        disabled={!config.show_operating_point}
                      />
                      <SectionToggle
                        label="Motor Brand"
                        description="Show motor brand in specs"
                        checked={config.show_motor_brand}
                        onChange={(v) => handleToggle('show_motor_brand', v)}
                        disabled={!config.show_motor_characteristics}
                      />
                      <SectionToggle
                        label="Motor Efficiency Class"
                        description="Show IE efficiency class (IE3, IE4)"
                        checked={config.show_motor_efficiency_class}
                        onChange={(v) => handleToggle('show_motor_efficiency_class', v)}
                        disabled={!config.show_motor_characteristics}
                      />
                    </div>
                  </div>
                  
                  <Separator />
                  
                  {/* Performance Curves */}
                  <div>
                    <h4 className="text-sm font-medium mb-3 text-muted-foreground">Performance Curves</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      <SectionToggle
                        label="Performance Curves Section"
                        description="Enable/disable entire curves section"
                        checked={config.show_performance_curves}
                        onChange={(v) => handleToggle('show_performance_curves', v)}
                      />
                      <SectionToggle
                        label="Fan Curve (Pressure)"
                        description="Static pressure vs airflow"
                        checked={config.show_fan_curve}
                        onChange={(v) => handleToggle('show_fan_curve', v)}
                        disabled={!config.show_performance_curves}
                      />
                      <SectionToggle
                        label="Power Curve"
                        description="Shaft power vs airflow"
                        checked={config.show_power_curve}
                        onChange={(v) => handleToggle('show_power_curve', v)}
                        disabled={!config.show_performance_curves}
                      />
                      <SectionToggle
                        label="Efficiency Curve"
                        description="Efficiency vs airflow"
                        checked={config.show_efficiency_curve}
                        onChange={(v) => handleToggle('show_efficiency_curve', v)}
                        disabled={!config.show_performance_curves}
                      />
                      <SectionToggle
                        label="Family Curve"
                        description="Show all blade angles"
                        checked={config.show_family_curve}
                        onChange={(v) => handleToggle('show_family_curve', v)}
                        disabled={!config.show_performance_curves}
                      />
                    </div>
                  </div>
                  
                  <Separator />
                  
                  {/* Noise & Dimensions */}
                  <div>
                    <h4 className="text-sm font-medium mb-3 text-muted-foreground">Noise & Dimensions</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      <SectionToggle
                        label="Noise Section"
                        description="Sound power and NC rating"
                        checked={config.show_noise_section}
                        onChange={(v) => handleToggle('show_noise_section', v)}
                      />
                      <SectionToggle
                        label="Octave Bands"
                        description="Detailed frequency data"
                        checked={config.show_octave_bands}
                        onChange={(v) => handleToggle('show_octave_bands', v)}
                        disabled={!config.show_noise_section}
                      />
                      <SectionToggle
                        label="Technical Drawing"
                        description="Dimensional drawing image"
                        checked={config.show_technical_drawing}
                        onChange={(v) => handleToggle('show_technical_drawing', v)}
                      />
                      <SectionToggle
                        label="Dimensions Table"
                        description="Size dimensions table"
                        checked={config.show_dimensions_table}
                        onChange={(v) => handleToggle('show_dimensions_table', v)}
                      />
                    </div>
                  </div>
                  
                  <Separator />
                  
                  {/* QR Codes */}
                  <div>
                    <h4 className="text-sm font-medium mb-3 text-muted-foreground">QR Codes (Page 2)</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      <SectionToggle
                        label="Catalogue QR Code"
                        description="QR code linking to catalogue PDF"
                        checked={config.show_catalogue_qr ?? true}
                        onChange={(v) => handleToggle('show_catalogue_qr', v)}
                      />
                      <SectionToggle
                        label="IOM Manual QR Code"
                        description="QR code linking to IOM manual"
                        checked={config.show_iom_qr ?? true}
                        onChange={(v) => handleToggle('show_iom_qr', v)}
                      />
                    </div>
                  </div>
                  
                  <Separator />
                  
                  {/* Footer & Additional */}
                  <div>
                    <h4 className="text-sm font-medium mb-3 text-muted-foreground">Footer & Additional</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      <SectionToggle
                        label="Certifications Section"
                        description="Enable/disable certification logos"
                        checked={config.show_certifications}
                        onChange={(v) => handleToggle('show_certifications', v)}
                      />
                      <SectionToggle
                        label="AMCA Certification"
                        description="AMCA certified logo"
                        checked={config.show_cert_amca}
                        onChange={(v) => handleToggle('show_cert_amca', v)}
                        disabled={!config.show_certifications}
                      />
                      <SectionToggle
                        label="Fire Rating"
                        description="Fire rating certification"
                        checked={config.show_cert_fire_rating}
                        onChange={(v) => handleToggle('show_cert_fire_rating', v)}
                        disabled={!config.show_certifications}
                      />
                      <SectionToggle
                        label="UL Certification"
                        description="UL certified logo"
                        checked={config.show_cert_ul}
                        onChange={(v) => handleToggle('show_cert_ul', v)}
                        disabled={!config.show_certifications}
                      />
                      <SectionToggle
                        label="CE Certification"
                        description="CE certified logo"
                        checked={config.show_cert_ce}
                        onChange={(v) => handleToggle('show_cert_ce', v)}
                        disabled={!config.show_certifications}
                      />
                      <SectionToggle
                        label="Standard Notes"
                        description="Test standard references"
                        checked={config.show_standard_notes}
                        onChange={(v) => handleToggle('show_standard_notes', v)}
                      />
                      <SectionToggle
                        label="VFD Features"
                        description="Variable frequency drive info"
                        checked={config.show_vfd_features}
                        onChange={(v) => handleToggle('show_vfd_features', v)}
                      />
                    </div>
                    
                    {/* Certification Display Order */}
                    {config.show_certifications && (
                      <div className="mt-4 p-4 border rounded-lg bg-muted/30">
                        <div className="flex items-center gap-2 mb-3">
                          <GripVertical className="w-4 h-4 text-muted-foreground" />
                          <Label className="text-sm font-medium">Certification Display Order</Label>
                        </div>
                        <p className="text-xs text-muted-foreground mb-3">
                          Drag or use arrows to reorder how certifications appear in the PDF datasheet
                        </p>
                        <div className="space-y-2">
                          {config.certification_order.map((certType, index) => (
                            <div 
                              key={certType}
                              className="flex items-center gap-2 p-2 bg-background border rounded-md"
                            >
                              <span className="w-6 h-6 flex items-center justify-center text-xs font-medium text-muted-foreground bg-muted rounded">
                                {index + 1}
                              </span>
                              <span className="flex-1 text-sm font-medium">
                                {CERTIFICATION_LABELS[certType]}
                              </span>
                              <div className="flex gap-1">
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-7 w-7"
                                  onClick={() => handleMoveCertification(index, 'up')}
                                  disabled={index === 0}
                                >
                                  <ArrowUp className="w-4 h-4" />
                                </Button>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-7 w-7"
                                  onClick={() => handleMoveCertification(index, 'down')}
                                  disabled={index === config.certification_order.length - 1}
                                >
                                  <ArrowDown className="w-4 h-4" />
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </CardContent>
              </CollapsibleContent>
            </Collapsible>
          </Card>

          {/* Custom Content */}
          <Card>
            <Collapsible open={customOpen} onOpenChange={setCustomOpen}>
              <CollapsibleTrigger asChild>
                <CardHeader className="cursor-pointer hover:bg-muted/30 transition-colors">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <FileText className="w-4 h-4" />
                      <CardTitle className="text-base">Custom Content</CardTitle>
                    </div>
                    {customOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </div>
                </CardHeader>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <CardContent className="space-y-4 pt-0">
                  <div>
                    <Label className="text-sm">Custom Description</Label>
                    <p className="text-xs text-muted-foreground mb-2">
                      Override the default technical description for this series
                    </p>
                    <Textarea
                      value={config.custom_description || ''}
                      onChange={(e) => handleTextChange('custom_description', e.target.value)}
                      placeholder="Leave empty to use default description..."
                      rows={3}
                    />
                  </div>

                  <Separator />

                  <div>
                    <Label className="text-sm">Custom Notes</Label>
                    <p className="text-xs text-muted-foreground mb-2">
                      Additional notes to show at bottom of datasheet
                    </p>
                    <Textarea
                      value={config.custom_notes || ''}
                      onChange={(e) => handleTextChange('custom_notes', e.target.value)}
                      placeholder="Enter custom notes..."
                      rows={2}
                    />
                  </div>

                  {config.show_vfd_features && (
                    <>
                      <Separator />
                      <div>
                        <Label className="text-sm">VFD Features Content</Label>
                        <p className="text-xs text-muted-foreground mb-2">
                          Variable frequency drive features and specifications
                        </p>
                        <Textarea
                          value={config.vfd_features_content || ''}
                          onChange={(e) => handleTextChange('vfd_features_content', e.target.value)}
                          placeholder="Enter VFD features..."
                          rows={3}
                        />
                      </div>
                    </>
                  )}

                  <Separator />

                  {/* Custom Sections */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <Label className="text-sm">Custom Sections</Label>
                      <Button size="sm" variant="outline" onClick={handleAddCustomSection}>
                        <Plus className="w-3 h-3 mr-1" /> Add Section
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground mb-3">
                      Add additional custom sections to the datasheet
                    </p>
                    
                    {config.custom_sections.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-4">
                        No custom sections. Click "Add Section" to create one.
                      </p>
                    ) : (
                      <div className="space-y-3">
                        {config.custom_sections.map((section, index) => (
                          <div key={index} className="p-3 border rounded-lg bg-muted/30">
                            <div className="flex items-center gap-2 mb-2">
                              <Input
                                value={section.title}
                                onChange={(e) => handleUpdateCustomSection(index, 'title', e.target.value)}
                                placeholder="Section Title"
                                className="h-8"
                              />
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-8 w-8 text-destructive"
                                onClick={() => handleRemoveCustomSection(index)}
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                            <Textarea
                              value={section.content}
                              onChange={(e) => handleUpdateCustomSection(index, 'content', e.target.value)}
                              placeholder="Section content..."
                              rows={2}
                            />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </CardContent>
              </CollapsibleContent>
            </Collapsible>
          </Card>

          {/* Editable Texts */}
          <Card>
            <Collapsible open={textsOpen} onOpenChange={setTextsOpen}>
              <CollapsibleTrigger asChild>
                <CardHeader className="cursor-pointer hover:bg-muted/30 transition-colors">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <FileText className="w-4 h-4" />
                      <CardTitle className="text-base">Editable Texts & Labels</CardTitle>
                    </div>
                    {textsOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </div>
                </CardHeader>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <CardContent className="space-y-4 pt-0">
                  {/* Header Title */}
                  <div>
                    <Label className="text-sm font-medium">Header Title</Label>
                    <Input
                      value={config.header_title || ''}
                      onChange={(e) => handleTextChange('header_title', e.target.value)}
                      placeholder="Technical Datasheet"
                      className="mt-1"
                    />
                  </div>

                  <Separator />

                  {/* Section Titles */}
                  <div>
                    <Label className="text-sm font-medium mb-3 block">Section Titles</Label>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <Label className="text-xs text-muted-foreground">Duty Point Section</Label>
                        <Input
                          value={config.section_title_duty_point || ''}
                          onChange={(e) => handleTextChange('section_title_duty_point', e.target.value)}
                          placeholder="Duty Point"
                          className="mt-1"
                        />
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground">Operating Point Section</Label>
                        <Input
                          value={config.section_title_operating_point || ''}
                          onChange={(e) => handleTextChange('section_title_operating_point', e.target.value)}
                          placeholder="Operating Point"
                          className="mt-1"
                        />
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground">Construction Section</Label>
                        <Input
                          value={config.section_title_construction || ''}
                          onChange={(e) => handleTextChange('section_title_construction', e.target.value)}
                          placeholder="Construction"
                          className="mt-1"
                        />
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground">Motor Section</Label>
                        <Input
                          value={config.section_title_motor || ''}
                          onChange={(e) => handleTextChange('section_title_motor', e.target.value)}
                          placeholder="Motor Characteristics"
                          className="mt-1"
                        />
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground">Noise Section</Label>
                        <Input
                          value={config.section_title_noise || ''}
                          onChange={(e) => handleTextChange('section_title_noise', e.target.value)}
                          placeholder="Sound Data"
                          className="mt-1"
                        />
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground">Dimensions Section</Label>
                        <Input
                          value={config.section_title_dimensions || ''}
                          onChange={(e) => handleTextChange('section_title_dimensions', e.target.value)}
                          placeholder="Dimensions"
                          className="mt-1"
                        />
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground">Certifications Section</Label>
                        <Input
                          value={config.section_title_certifications || ''}
                          onChange={(e) => handleTextChange('section_title_certifications', e.target.value)}
                          placeholder="Certifications"
                          className="mt-1"
                        />
                      </div>
                    </div>
                  </div>

                  <Separator />

                  {/* Standard Notes */}
                  <div>
                    <Label className="text-sm font-medium">Standard Notes Text</Label>
                    <p className="text-xs text-muted-foreground mb-2">
                      Reference text shown at bottom of datasheet
                    </p>
                    <Textarea
                      value={config.standard_notes_text || ''}
                      onChange={(e) => handleTextChange('standard_notes_text', e.target.value)}
                      placeholder="Selections are based on standard air density..."
                      rows={2}
                    />
                  </div>

                  <div>
                    <Label className="text-sm font-medium">Noise Reference Text</Label>
                    <p className="text-xs text-muted-foreground mb-2">
                      Reference text for sound measurement standards
                    </p>
                    <Textarea
                      value={config.noise_reference_text || ''}
                      onChange={(e) => handleTextChange('noise_reference_text', e.target.value)}
                      placeholder="Sound power levels measured per ISO 13347..."
                      rows={2}
                    />
                  </div>

                  <div>
                    <Label className="text-sm font-medium">EU Noise Directive Text</Label>
                    <p className="text-xs text-muted-foreground mb-2">
                      EU Machinery Directive compliance statement shown on datasheet
                    </p>
                    <Textarea
                      value={config.noise_directive_text || ''}
                      onChange={(e) => handleTextChange('noise_directive_text', e.target.value)}
                      placeholder="In accordance with EU Directive 2006/42/EC and EN ISO 3744..."
                      rows={2}
                    />
                  </div>
                </CardContent>
              </CollapsibleContent>
            </Collapsible>
          </Card>

          {/* Save Button */}
          <div className="flex justify-end">
            <Button onClick={handleSave} disabled={saveMutation.isPending}>
              {saveMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <Save className="w-4 h-4 mr-2" />
              )}
              Save Configuration
            </Button>
          </div>
        </>
      ) : null}
    </div>
  );
}

// Helper component for section toggles
function SectionToggle({
  label,
  description,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className={`flex items-center justify-between p-3 rounded-lg border ${disabled ? 'opacity-50' : 'hover:bg-muted/30'} transition-colors`}>
      <div className="flex-1">
        <div className="flex items-center gap-2">
          {checked ? (
            <Eye className="w-3 h-3 text-green-600" />
          ) : (
            <EyeOff className="w-3 h-3 text-muted-foreground" />
          )}
          <Label className="text-sm font-medium cursor-pointer">{label}</Label>
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} disabled={disabled} />
    </div>
  );
}
