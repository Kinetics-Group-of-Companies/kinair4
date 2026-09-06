import { useState, useRef } from 'react';
import { Edit2, Save, X, Trash2, Upload, Image as ImageIcon, Loader2, Award, Flame, FileText, Book, Fan, Wind, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SeriesInfo, FanType } from '@/lib/fanData';
import { SeriesDrawingDimensionsEditor } from './SeriesDrawingDimensionsEditor';
import { supabase } from '@/integrations/backend/client';
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

// Default deletion password - can be changed by admin
const DELETION_PASSWORD = 'dpkchn786';

interface SeriesCardProps {
  series: SeriesInfo & { 
    drawingUrl?: string; 
    datasheetDescription?: string; 
    showOctaveBands?: boolean;
    amcaCertified?: boolean;
    fireRating?: string;
    amcaLogoUrl?: string;
    fireRatingLogoUrl?: string;
    catalogueUrl?: string;
    iomUrl?: string;
    fanType?: FanType;
    nomenclatureTemplate?: string;
    ceCertified?: boolean;
    ceLogoUrl?: string;
    isoCertified?: boolean;
    isoLogoUrl?: string;
    ulCertified?: boolean;
    ulLogoUrl?: string;
    atexCertified?: boolean;
    atexLogoUrl?: string;
    customCertName?: string;
    customCertLogoUrl?: string;
    defaultSafetyFactor?: number;
    // New datasheet features
    stallAirflowMinPercent?: number;
    stallAirflowMaxPercent?: number;
    compatibleAccessories?: string[];
    // Default noise settings
    defaultDirectivityQ?: number;
    defaultNoiseDistance?: number;
  };
  fanCount: number;
  onUpdate: (updates: { 
    name?: string; 
    description?: string; 
    image_url?: string; 
    drawing_url?: string; 
    datasheet_description?: string; 
    show_octave_bands?: boolean;
    amca_certified?: boolean;
    fire_rating?: string;
    amca_logo_url?: string;
    fire_rating_logo_url?: string;
    catalogue_url?: string;
    iom_url?: string;
    fan_type?: string;
    nomenclature_template?: string;
    ce_certified?: boolean;
    ce_logo_url?: string;
    iso_certified?: boolean;
    iso_logo_url?: string;
    ul_certified?: boolean;
    ul_logo_url?: string;
    atex_certified?: boolean;
    atex_logo_url?: string;
    custom_cert_name?: string;
    custom_cert_logo_url?: string;
    default_safety_factor?: number;
    // New datasheet features
    stall_airflow_min_percent?: number;
    stall_airflow_max_percent?: number;
    compatible_accessories?: string[];
    // Default noise settings
    default_directivity_q?: number;
    default_noise_distance?: number;
  }) => void;
  onDelete: () => void;
  isUpdating?: boolean;
}

export function SeriesCard({ series, fanCount, onUpdate, onDelete, isUpdating }: SeriesCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(series.name);
  const [editDescription, setEditDescription] = useState(series.description);
  const [editDatasheetDesc, setEditDatasheetDesc] = useState(series.datasheetDescription || '');
  const [amcaCertified, setAmcaCertified] = useState(series.amcaCertified ?? false);
  const [fireRating, setFireRating] = useState(series.fireRating || '');
  const [amcaLogoUrl, setAmcaLogoUrl] = useState(series.amcaLogoUrl || '');
  const [fireRatingLogoUrl, setFireRatingLogoUrl] = useState(series.fireRatingLogoUrl || '');
  const [catalogueUrl, setCatalogueUrl] = useState(series.catalogueUrl || '');
  const [iomUrl, setIomUrl] = useState(series.iomUrl || '');
  const [fanType, setFanType] = useState<FanType>(series.fanType || 'axial');
  const [nomenclatureTemplate, setNomenclatureTemplate] = useState(series.nomenclatureTemplate || '{series}-{size}');
  const [uploadingCatalogue, setUploadingCatalogue] = useState(false);
  const [uploadingIom, setUploadingIom] = useState(false);
  
  // Delete confirmation state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteError, setDeleteError] = useState('');
  
  // Additional certifications
  const [ceCertified, setCeCertified] = useState(series.ceCertified ?? false);
  const [ceLogoUrl, setCeLogoUrl] = useState(series.ceLogoUrl || '');
  const [isoCertified, setIsoCertified] = useState(series.isoCertified ?? false);
  const [isoLogoUrl, setIsoLogoUrl] = useState(series.isoLogoUrl || '');
  const [ulCertified, setUlCertified] = useState(series.ulCertified ?? false);
  const [ulLogoUrl, setUlLogoUrl] = useState(series.ulLogoUrl || '');
  const [atexCertified, setAtexCertified] = useState(series.atexCertified ?? false);
  const [atexLogoUrl, setAtexLogoUrl] = useState(series.atexLogoUrl || '');
  const [customCertName, setCustomCertName] = useState(series.customCertName || '');
  const [customCertLogoUrl, setCustomCertLogoUrl] = useState(series.customCertLogoUrl || '');
  const [defaultSafetyFactor, setDefaultSafetyFactor] = useState<string>((series.defaultSafetyFactor ?? 1.15).toString());
  
  // New datasheet features
  const [stallAirflowMinPercent, setStallAirflowMinPercent] = useState<string>((series.stallAirflowMinPercent ?? 15).toString());
  const [stallAirflowMaxPercent, setStallAirflowMaxPercent] = useState<string>((series.stallAirflowMaxPercent ?? 95).toString());
  const [compatibleAccessories, setCompatibleAccessories] = useState<string>((series.compatibleAccessories || []).join(', '));
  
  // Default noise settings
  const [defaultDirectivityQ, setDefaultDirectivityQ] = useState<string>((series.defaultDirectivityQ ?? 2).toString());
  const [defaultNoiseDistance, setDefaultNoiseDistance] = useState<string>((series.defaultNoiseDistance ?? 0).toString());
  
  const catalogueInputRef = useRef<HTMLInputElement>(null);
  const iomInputRef = useRef<HTMLInputElement>(null);

  const handleSave = () => {
    onUpdate({ 
      name: editName, 
      description: editDescription,
      datasheet_description: editDatasheetDesc || undefined,
      amca_certified: amcaCertified,
      fire_rating: fireRating || undefined,
      amca_logo_url: amcaLogoUrl || undefined,
      fire_rating_logo_url: fireRatingLogoUrl || undefined,
      catalogue_url: catalogueUrl || undefined,
      iom_url: iomUrl || undefined,
      fan_type: fanType,
      nomenclature_template: nomenclatureTemplate || undefined,
      ce_certified: ceCertified,
      ce_logo_url: ceLogoUrl || undefined,
      iso_certified: isoCertified,
      iso_logo_url: isoLogoUrl || undefined,
      ul_certified: ulCertified,
      ul_logo_url: ulLogoUrl || undefined,
      atex_certified: atexCertified,
      atex_logo_url: atexLogoUrl || undefined,
      custom_cert_name: customCertName || undefined,
      custom_cert_logo_url: customCertLogoUrl || undefined,
      default_safety_factor: parseFloat(defaultSafetyFactor) || 1.15,
      // New datasheet features
      stall_airflow_min_percent: !isNaN(parseFloat(stallAirflowMinPercent)) ? parseFloat(stallAirflowMinPercent) : 15,
      stall_airflow_max_percent: !isNaN(parseFloat(stallAirflowMaxPercent)) ? parseFloat(stallAirflowMaxPercent) : 95,
      compatible_accessories: compatibleAccessories ? compatibleAccessories.split(',').map(s => s.trim()).filter(Boolean) : [],
      // Default noise settings
      default_directivity_q: parseInt(defaultDirectivityQ) || 2,
      default_noise_distance: !isNaN(parseFloat(defaultNoiseDistance)) ? parseFloat(defaultNoiseDistance) : 0,
    });
    setIsEditing(false);
  };

  const handleCancel = () => {
    setEditName(series.name);
    setEditDescription(series.description);
    setEditDatasheetDesc(series.datasheetDescription || '');
    setAmcaCertified(series.amcaCertified ?? false);
    setFireRating(series.fireRating || '');
    setAmcaLogoUrl(series.amcaLogoUrl || '');
    setFireRatingLogoUrl(series.fireRatingLogoUrl || '');
    setCatalogueUrl(series.catalogueUrl || '');
    setIomUrl(series.iomUrl || '');
    setFanType(series.fanType || 'axial');
    setNomenclatureTemplate(series.nomenclatureTemplate || '{series}-{size}');
    setCeCertified(series.ceCertified ?? false);
    setCeLogoUrl(series.ceLogoUrl || '');
    setIsoCertified(series.isoCertified ?? false);
    setIsoLogoUrl(series.isoLogoUrl || '');
    setUlCertified(series.ulCertified ?? false);
    setUlLogoUrl(series.ulLogoUrl || '');
    setAtexCertified(series.atexCertified ?? false);
    setAtexLogoUrl(series.atexLogoUrl || '');
    setCustomCertName(series.customCertName || '');
    setCustomCertLogoUrl(series.customCertLogoUrl || '');
    setDefaultSafetyFactor((series.defaultSafetyFactor ?? 1.15).toString());
    // New datasheet features
    setStallAirflowMinPercent((series.stallAirflowMinPercent ?? 15).toString());
    setStallAirflowMaxPercent((series.stallAirflowMaxPercent ?? 95).toString());
    setCompatibleAccessories((series.compatibleAccessories || []).join(', '));
    // Default noise settings
    setDefaultDirectivityQ((series.defaultDirectivityQ ?? 2).toString());
    setDefaultNoiseDistance((series.defaultNoiseDistance ?? 0).toString());
    setIsEditing(false);
  };

  const handlePdfUpload = async (type: 'catalogue' | 'iom', file: File) => {
    const setUploading = type === 'catalogue' ? setUploadingCatalogue : setUploadingIom;
    const setUrl = type === 'catalogue' ? setCatalogueUrl : setIomUrl;
    
    if (!file.type.includes('pdf')) {
      toast.error('Please upload a PDF file');
      return;
    }
    
    if (file.size > 10 * 1024 * 1024) {
      toast.error('File size must be less than 10MB');
      return;
    }

    setUploading(true);
    try {
      const fileExt = 'pdf';
      const fileName = `${type}-${series.id}-${Date.now()}.${fileExt}`;
      const filePath = `documents/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('brand-assets')
        .upload(filePath, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('brand-assets')
        .getPublicUrl(filePath);

      setUrl(publicUrl);
      toast.success(`${type === 'catalogue' ? 'Catalogue' : 'IOM'} uploaded successfully`);
    } catch (error: any) {
      console.error('Upload error:', error);
      toast.error(error.message || 'Failed to upload file');
    } finally {
      setUploading(false);
    }
  };

  const handleLogoUpload = (type: 'amca' | 'fire' | 'ce' | 'iso' | 'ul' | 'atex' | 'custom', e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const dataUrl = event.target?.result as string;
        switch (type) {
          case 'amca': setAmcaLogoUrl(dataUrl); break;
          case 'fire': setFireRatingLogoUrl(dataUrl); break;
          case 'ce': setCeLogoUrl(dataUrl); break;
          case 'iso': setIsoLogoUrl(dataUrl); break;
          case 'ul': setUlLogoUrl(dataUrl); break;
          case 'atex': setAtexLogoUrl(dataUrl); break;
          case 'custom': setCustomCertLogoUrl(dataUrl); break;
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const dataUrl = event.target?.result as string;
        onUpdate({ image_url: dataUrl });
      };
      reader.readAsDataURL(file);
    }
  };

  const handleRemoveImage = () => {
    onUpdate({ image_url: undefined });
  };

  return (
    <div className="kinair-card p-4 flex gap-4">
      {/* Series Image - Smaller */}
      <div className="relative w-32 h-24 flex-shrink-0 bg-muted rounded-lg overflow-hidden">
        {series.imageUrl ? (
          <>
            <img 
              src={series.imageUrl} 
              alt={series.name}
              className="w-full h-full object-cover"
            />
            <div className="absolute top-1 right-1 flex gap-1">
              <input
                type="file"
                accept="image/*"
                id={`series-image-${series.id}`}
                className="hidden"
                onChange={handleImageUpload}
              />
              <Button
                variant="secondary"
                size="sm"
                className="h-6 w-6 p-0"
                onClick={() => document.getElementById(`series-image-${series.id}`)?.click()}
                disabled={isUpdating}
              >
                {isUpdating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Edit2 className="w-3 h-3" />}
              </Button>
              <Button
                variant="destructive"
                size="sm"
                className="h-6 w-6 p-0"
                onClick={handleRemoveImage}
                disabled={isUpdating}
              >
                <X className="w-3 h-3" />
              </Button>
            </div>
          </>
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center">
            <input
              type="file"
              accept="image/*"
              id={`series-image-upload-${series.id}`}
              className="hidden"
              onChange={handleImageUpload}
            />
            <Button
              variant="ghost"
              size="sm"
              className="h-full w-full flex flex-col gap-1"
              onClick={() => document.getElementById(`series-image-upload-${series.id}`)?.click()}
              disabled={isUpdating}
            >
              {isUpdating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              <span className="text-xs">Upload</span>
            </Button>
          </div>
        )}
      </div>

      {/* Series Content */}
      <div className="flex-1 min-w-0">
      {isEditing ? (
        <div className="space-y-3 flex-1">
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label className="text-xs">Series Name</Label>
              <Input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-xs">Fan Type</Label>
              <Select value={fanType} onValueChange={(val: FanType) => setFanType(val)}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="axial">Axial</SelectItem>
                  <SelectItem value="centrifugal">Centrifugal</SelectItem>
                  <SelectItem value="mixed">Mixed Flow</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Default Safety Factor</Label>
              <Input
                type="number"
                step="0.01"
                min="1"
                max="2"
                value={defaultSafetyFactor}
                onChange={(e) => setDefaultSafetyFactor(e.target.value)}
                placeholder="1.15"
                className="mt-1"
              />
              <p className="text-xs text-muted-foreground mt-0.5">Motor sizing SF (1.0-2.0)</p>
            </div>
          </div>
          <div>
            <Label className="text-xs">Series Description (Admin Reference)</Label>
            <Textarea
              value={editDescription}
              onChange={(e) => setEditDescription(e.target.value)}
              className="mt-1 resize-none"
              rows={2}
              placeholder="Internal description for admin reference"
            />
          </div>
          <div>
            <Label className="text-xs font-semibold text-primary">Datasheet Technical Description</Label>
            <Textarea
              value={editDatasheetDesc}
              onChange={(e) => setEditDatasheetDesc(e.target.value)}
              className="mt-1 resize-none border-primary/30"
              rows={4}
              placeholder="This text appears on the PDF datasheet. E.g.: Tube casings crafted from durable rolled Mild sheet steel..."
            />
          </div>
          {/* Nomenclature Template */}
          <div className="border-t border-border pt-3 mt-2">
            <Label className="text-xs font-semibold text-primary">Model Nomenclature Template</Label>
            <p className="text-xs text-muted-foreground mb-2">
              Use placeholders: {'{series}'}, {'{size}'}, {'{diameter}'}, {'{poles}'}, {'{blades}'}, {'{angle}'}, {'{power}'}, {'{fire}'}, {'{accessory}'}, {'{atex}'}
            </p>
            <Input
              value={nomenclatureTemplate}
              onChange={(e) => setNomenclatureTemplate(e.target.value)}
              className="mt-1 font-mono text-sm"
              placeholder="e.g., KVF-{size}M or KTAF/{poles}-{diameter}-{blades}/{angle}°-{power}kW-{fire}-{accessory}-{atex}"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Preview: {nomenclatureTemplate
                .replace('{series}', editName)
                .replace('{size}', '315')
                .replace('{diameter}', '315')
                .replace('{poles}', '4')
                .replace('{blades}', '6')
                .replace('{angle}', '30')
                .replace('{power}', '1.5')
                .replace('{fire}', 'F400')
                .replace('{accessory}', 'ETID')
                .replace('{atex}', 'Zone2')}
            </p>
            <p className="text-xs text-muted-foreground mt-1 italic">
              Note: {'{series}'} auto-updates when series name changes. {'{accessory}'} = ET/ID/ETID. {'{atex}'} = Zone1/Zone2/Zone21/Zone22
            </p>
          </div>
          {/* Certification Logos Section */}
          <div className="border-t border-border pt-3 mt-2">
            <Label className="text-xs font-semibold text-primary mb-2 block">Certification Logos (shown at bottom of page 1)</Label>
            
            {/* AMCA Logo */}
            <div className="flex items-center gap-3 mb-2">
              <Switch
                id={`amca-${series.id}`}
                checked={amcaCertified}
                onCheckedChange={setAmcaCertified}
              />
              <Label htmlFor={`amca-${series.id}`} className="text-xs cursor-pointer flex items-center gap-1">
                <Award className="w-3 h-3" />
                AMCA Certified
              </Label>
            </div>
            {amcaCertified && (
              <div className="flex items-center gap-2 mb-3 ml-8">
                <input
                  type="file"
                  accept="image/*"
                  id={`amca-logo-${series.id}`}
                  className="hidden"
                  onChange={(e) => handleLogoUpload('amca', e)}
                />
                {amcaLogoUrl ? (
                  <div className="flex items-center gap-2">
                    <img src={amcaLogoUrl} alt="AMCA Logo" className="h-8 object-contain" />
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 text-xs"
                      onClick={() => document.getElementById(`amca-logo-${series.id}`)?.click()}
                    >
                      Change
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 text-xs text-destructive"
                      onClick={() => setAmcaLogoUrl('')}
                    >
                      Remove
                    </Button>
                  </div>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => document.getElementById(`amca-logo-${series.id}`)?.click()}
                  >
                    <Upload className="w-3 h-3 mr-1" />
                    Upload AMCA Logo
                  </Button>
                )}
              </div>
            )}
            
            {/* Fire Rating */}
            <div className="space-y-1 mb-2">
              <Label className="text-xs flex items-center gap-1">
                <Flame className="w-3 h-3" />
                Fire Rating (e.g., F400, F300)
              </Label>
              <Input
                value={fireRating}
                onChange={(e) => setFireRating(e.target.value)}
                placeholder="F400"
                className="h-8"
              />
            </div>
            {fireRating && (
              <div className="flex items-center gap-2 mb-2 ml-4">
                <input
                  type="file"
                  accept="image/*"
                  id={`fire-logo-${series.id}`}
                  className="hidden"
                  onChange={(e) => handleLogoUpload('fire', e)}
                />
                {fireRatingLogoUrl ? (
                  <div className="flex items-center gap-2">
                    <img src={fireRatingLogoUrl} alt="Fire Rating Logo" className="h-8 object-contain" />
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 text-xs"
                      onClick={() => document.getElementById(`fire-logo-${series.id}`)?.click()}
                    >
                      Change
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 text-xs text-destructive"
                      onClick={() => setFireRatingLogoUrl('')}
                    >
                      Remove
                    </Button>
                  </div>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => document.getElementById(`fire-logo-${series.id}`)?.click()}
                  >
                    <Upload className="w-3 h-3 mr-1" />
                    Upload Fire Rating Logo
                  </Button>
                )}
              </div>
            )}
            
            {/* CE Certification */}
            <div className="flex items-center gap-3 mb-2 mt-3">
              <Switch
                id={`ce-${series.id}`}
                checked={ceCertified}
                onCheckedChange={setCeCertified}
              />
              <Label htmlFor={`ce-${series.id}`} className="text-xs cursor-pointer">
                CE Marked
              </Label>
            </div>
            {ceCertified && (
              <div className="flex items-center gap-2 mb-2 ml-8">
                <input
                  type="file"
                  accept="image/*"
                  id={`ce-logo-${series.id}`}
                  className="hidden"
                  onChange={(e) => handleLogoUpload('ce', e)}
                />
                {ceLogoUrl ? (
                  <div className="flex items-center gap-2">
                    <img src={ceLogoUrl} alt="CE Logo" className="h-8 object-contain" />
                    <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => document.getElementById(`ce-logo-${series.id}`)?.click()}>Change</Button>
                    <Button variant="ghost" size="sm" className="h-6 text-xs text-destructive" onClick={() => setCeLogoUrl('')}>Remove</Button>
                  </div>
                ) : (
                  <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => document.getElementById(`ce-logo-${series.id}`)?.click()}>
                    <Upload className="w-3 h-3 mr-1" />Upload CE Logo
                  </Button>
                )}
              </div>
            )}
            
            {/* ISO Certification */}
            <div className="flex items-center gap-3 mb-2">
              <Switch
                id={`iso-${series.id}`}
                checked={isoCertified}
                onCheckedChange={setIsoCertified}
              />
              <Label htmlFor={`iso-${series.id}`} className="text-xs cursor-pointer">
                ISO Certified
              </Label>
            </div>
            {isoCertified && (
              <div className="flex items-center gap-2 mb-2 ml-8">
                <input
                  type="file"
                  accept="image/*"
                  id={`iso-logo-${series.id}`}
                  className="hidden"
                  onChange={(e) => handleLogoUpload('iso', e)}
                />
                {isoLogoUrl ? (
                  <div className="flex items-center gap-2">
                    <img src={isoLogoUrl} alt="ISO Logo" className="h-8 object-contain" />
                    <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => document.getElementById(`iso-logo-${series.id}`)?.click()}>Change</Button>
                    <Button variant="ghost" size="sm" className="h-6 text-xs text-destructive" onClick={() => setIsoLogoUrl('')}>Remove</Button>
                  </div>
                ) : (
                  <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => document.getElementById(`iso-logo-${series.id}`)?.click()}>
                    <Upload className="w-3 h-3 mr-1" />Upload ISO Logo
                  </Button>
                )}
              </div>
            )}
            
            {/* UL Certification */}
            <div className="flex items-center gap-3 mb-2">
              <Switch
                id={`ul-${series.id}`}
                checked={ulCertified}
                onCheckedChange={setUlCertified}
              />
              <Label htmlFor={`ul-${series.id}`} className="text-xs cursor-pointer">
                UL Listed
              </Label>
            </div>
            {ulCertified && (
              <div className="flex items-center gap-2 mb-2 ml-8">
                <input
                  type="file"
                  accept="image/*"
                  id={`ul-logo-${series.id}`}
                  className="hidden"
                  onChange={(e) => handleLogoUpload('ul', e)}
                />
                {ulLogoUrl ? (
                  <div className="flex items-center gap-2">
                    <img src={ulLogoUrl} alt="UL Logo" className="h-8 object-contain" />
                    <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => document.getElementById(`ul-logo-${series.id}`)?.click()}>Change</Button>
                    <Button variant="ghost" size="sm" className="h-6 text-xs text-destructive" onClick={() => setUlLogoUrl('')}>Remove</Button>
                  </div>
                ) : (
                  <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => document.getElementById(`ul-logo-${series.id}`)?.click()}>
                    <Upload className="w-3 h-3 mr-1" />Upload UL Logo
                  </Button>
                )}
              </div>
            )}
            
            {/* ATEX Certification */}
            <div className="flex items-center gap-3 mb-2">
              <Switch
                id={`atex-${series.id}`}
                checked={atexCertified}
                onCheckedChange={setAtexCertified}
              />
              <Label htmlFor={`atex-${series.id}`} className="text-xs cursor-pointer">
                ATEX Certified
              </Label>
            </div>
            {atexCertified && (
              <div className="flex items-center gap-2 mb-2 ml-8">
                <input
                  type="file"
                  accept="image/*"
                  id={`atex-logo-${series.id}`}
                  className="hidden"
                  onChange={(e) => handleLogoUpload('atex', e)}
                />
                {atexLogoUrl ? (
                  <div className="flex items-center gap-2">
                    <img src={atexLogoUrl} alt="ATEX Logo" className="h-8 object-contain" />
                    <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => document.getElementById(`atex-logo-${series.id}`)?.click()}>Change</Button>
                    <Button variant="ghost" size="sm" className="h-6 text-xs text-destructive" onClick={() => setAtexLogoUrl('')}>Remove</Button>
                  </div>
                ) : (
                  <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => document.getElementById(`atex-logo-${series.id}`)?.click()}>
                    <Upload className="w-3 h-3 mr-1" />Upload ATEX Logo
                  </Button>
                )}
              </div>
            )}
            
            {/* Custom Certification */}
            <div className="space-y-1 mb-2 mt-3">
              <Label className="text-xs">Custom Certification Name</Label>
              <Input
                value={customCertName}
                onChange={(e) => setCustomCertName(e.target.value)}
                placeholder="e.g., TUV, CSA, etc."
                className="h-8"
              />
            </div>
            {customCertName && (
              <div className="flex items-center gap-2 mb-2 ml-4">
                <input
                  type="file"
                  accept="image/*"
                  id={`custom-cert-logo-${series.id}`}
                  className="hidden"
                  onChange={(e) => handleLogoUpload('custom', e)}
                />
                {customCertLogoUrl ? (
                  <div className="flex items-center gap-2">
                    <img src={customCertLogoUrl} alt="Custom Cert Logo" className="h-8 object-contain" />
                    <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => document.getElementById(`custom-cert-logo-${series.id}`)?.click()}>Change</Button>
                    <Button variant="ghost" size="sm" className="h-6 text-xs text-destructive" onClick={() => setCustomCertLogoUrl('')}>Remove</Button>
                  </div>
                ) : (
                  <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => document.getElementById(`custom-cert-logo-${series.id}`)?.click()}>
                    <Upload className="w-3 h-3 mr-1" />Upload {customCertName} Logo
                  </Button>
                )}
              </div>
            )}
          </div>
          
          {/* Documents Section */}
          <div className="border-t border-border pt-3 mt-2">
            <Label className="text-xs font-semibold text-primary mb-2 block">Downloadable Documents</Label>
            
            {/* Catalogue Upload */}
            <div className="space-y-1 mb-3">
              <Label className="text-xs flex items-center gap-1">
                <FileText className="w-3 h-3" />
                Product Catalogue (PDF)
              </Label>
              <input
                ref={catalogueInputRef}
                type="file"
                accept=".pdf"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && handlePdfUpload('catalogue', e.target.files[0])}
              />
              {catalogueUrl ? (
                <div className="flex items-center gap-2">
                  <a href={catalogueUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-primary underline truncate max-w-[200px]">
                    View Catalogue
                  </a>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 text-xs"
                    onClick={() => catalogueInputRef.current?.click()}
                    disabled={uploadingCatalogue}
                  >
                    {uploadingCatalogue ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Change'}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 text-xs text-destructive"
                    onClick={() => setCatalogueUrl('')}
                  >
                    Remove
                  </Button>
                </div>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => catalogueInputRef.current?.click()}
                  disabled={uploadingCatalogue}
                >
                  {uploadingCatalogue ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Upload className="w-3 h-3 mr-1" />}
                  Upload Catalogue PDF
                </Button>
              )}
            </div>
            
            {/* IOM Upload */}
            <div className="space-y-1">
              <Label className="text-xs flex items-center gap-1">
                <Book className="w-3 h-3" />
                Installation & Operation Manual (PDF)
              </Label>
              <input
                ref={iomInputRef}
                type="file"
                accept=".pdf"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && handlePdfUpload('iom', e.target.files[0])}
              />
              {iomUrl ? (
                <div className="flex items-center gap-2">
                  <a href={iomUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-primary underline truncate max-w-[200px]">
                    View IOM
                  </a>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 text-xs"
                    onClick={() => iomInputRef.current?.click()}
                    disabled={uploadingIom}
                  >
                    {uploadingIom ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Change'}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 text-xs text-destructive"
                    onClick={() => setIomUrl('')}
                  >
                    Remove
                  </Button>
                </div>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => iomInputRef.current?.click()}
                  disabled={uploadingIom}
                >
                  {uploadingIom ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Upload className="w-3 h-3 mr-1" />}
                  Upload IOM PDF
                </Button>
              )}
            </div>
          </div>
          
          {/* Advanced Datasheet Features Section */}
          <div className="border-t border-border pt-3 mt-2">
            <Label className="text-xs font-semibold text-primary mb-2 block">Advanced Datasheet Features</Label>
            
            {/* Stall Zone Settings */}
            <div className="grid grid-cols-2 gap-2 mb-3">
              <div className="space-y-1">
                <Label className="text-xs">Stall Zone Min (%)</Label>
                <Input
                  value={stallAirflowMinPercent}
                  onChange={(e) => setStallAirflowMinPercent(e.target.value)}
                  placeholder="15"
                  type="number"
                  min="0"
                  max="100"
                  className="h-7 text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Stall Zone Max (%)</Label>
                <Input
                  value={stallAirflowMaxPercent}
                  onChange={(e) => setStallAirflowMaxPercent(e.target.value)}
                  placeholder="95"
                  type="number"
                  min="0"
                  max="100"
                  className="h-7 text-xs"
                />
              </div>
            </div>
            <p className="text-[10px] text-muted-foreground mb-3">Operating range as % of max airflow. Shows warning zone in PDF curves.</p>
            
            {/* Compatible Accessories */}
            <div className="space-y-1 mb-3">
              <Label className="text-xs">Compatible Accessories</Label>
              <Input
                value={compatibleAccessories}
                onChange={(e) => setCompatibleAccessories(e.target.value)}
                placeholder="ACC-01, ACC-02, ACC-03"
                className="h-7 text-xs"
              />
              <p className="text-[10px] text-muted-foreground">Comma-separated accessory codes (shown in PDF datasheet)</p>
            </div>
            
            {/* Default Noise Settings */}
            <div className="border-t border-border/50 pt-3 mt-3">
              <Label className="text-xs font-semibold text-primary mb-2 block">Default Noise Settings</Label>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">Default Distance (m)</Label>
                  <Input
                    value={defaultNoiseDistance}
                    onChange={(e) => setDefaultNoiseDistance(e.target.value)}
                    placeholder="0"
                    type="number"
                    min="0"
                    step="0.5"
                    className="h-7 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Default Directivity Q</Label>
                  <Select value={defaultDirectivityQ} onValueChange={setDefaultDirectivityQ}>
                    <SelectTrigger className="h-7 text-xs">
                      <SelectValue placeholder="Q Factor" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">Q=1 (Free field)</SelectItem>
                      <SelectItem value="2">Q=2 (Half-sphere)</SelectItem>
                      <SelectItem value="4">Q=4 (Quarter-sphere)</SelectItem>
                      <SelectItem value="8">Q=8 (Corner)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">Default values for noise calculations in fan selector</p>
            </div>
          </div>
          
          <div className="flex gap-2 pt-2">
            <Button size="sm" onClick={handleSave} className="flex-1" disabled={isUpdating}>
              {isUpdating ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Save className="w-3 h-3 mr-1" />}
              Save
            </Button>
            <Button size="sm" variant="ghost" onClick={handleCancel}>
              <X className="w-3 h-3" />
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex-1">
          <div className="flex items-start justify-between mb-2">
            <h3 className="font-semibold text-foreground">{series.name}</h3>
            <span className="kinair-badge kinair-badge-primary text-xs">
              {fanCount} fans
            </span>
          </div>
          <p className="text-sm text-muted-foreground mb-4 line-clamp-3">
            {series.description || 'No description'}
          </p>
          
          {/* Drawing Editor */}
          <div className="border-t border-border pt-3 mt-3">
            <SeriesDrawingDimensionsEditor 
              seriesId={series.id}
              seriesName={series.name}
              currentDrawingUrl={series.drawingUrl}
            />
          </div>
          
          
          <div className="flex gap-2 mt-4">
            <Button size="sm" variant="outline" onClick={() => setIsEditing(true)} className="flex-1">
              <Edit2 className="w-3 h-3 mr-1" />
              Edit Info
            </Button>
            <AlertDialog open={deleteDialogOpen} onOpenChange={(open) => {
              setDeleteDialogOpen(open);
              if (!open) {
                setDeletePassword('');
                setDeleteError('');
              }
            }}>
              <AlertDialogTrigger asChild>
                <Button 
                  size="sm" 
                  variant="ghost" 
                  className="text-destructive hover:text-destructive"
                >
                  <Trash2 className="w-3 h-3" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle className="flex items-center gap-2">
                    <Lock className="w-4 h-4" />
                    Delete Series: {series.name}
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    This action cannot be undone. This will permanently delete the series 
                    and all associated fan models, performance data, and configurations.
                    <br /><br />
                    <strong>Enter the deletion password to confirm:</strong>
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <div className="py-4">
                  <Input
                    type="password"
                    placeholder="Enter deletion password"
                    value={deletePassword}
                    onChange={(e) => {
                      setDeletePassword(e.target.value);
                      setDeleteError('');
                    }}
                    className={deleteError ? 'border-destructive' : ''}
                  />
                  {deleteError && (
                    <p className="text-sm text-destructive mt-2">{deleteError}</p>
                  )}
                </div>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <Button
                    variant="destructive"
                    onClick={() => {
                      if (deletePassword === DELETION_PASSWORD) {
                        onDelete();
                        setDeleteDialogOpen(false);
                        setDeletePassword('');
                        setDeleteError('');
                      } else {
                        setDeleteError('Incorrect password. Please try again.');
                      }
                    }}
                  >
                    Delete Series
                  </Button>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}
