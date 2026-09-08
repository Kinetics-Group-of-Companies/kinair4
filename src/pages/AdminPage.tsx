import { useState, useEffect, useRef } from 'react';
import { Navigate, Link } from 'react-router-dom';
import { 
  Wind, Settings, Database, Image, Users, LogOut, Home,
  ChevronRight, Plus, Trash2, Edit2, Save, X, RotateCcw,
  Upload, FileSpreadsheet, FileText, Phone, Ruler, Gauge, Zap, Weight,
  Clock, AlertCircle, Shield, Loader2, Lock, Package, DoorOpen, Menu
} from 'lucide-react';
import { PerformanceDataEditor } from '@/components/admin/PerformanceDataEditor';
import { FanDrawingUpload } from '@/components/admin/FanDrawingUpload';
import { FanModelEditor } from '@/components/admin/FanModelEditor';
import { ExcelImportExport } from '@/components/admin/ExcelImportExport';
import { SeriesCard } from '@/components/admin/SeriesCard';
import { MotorDetailsEditor } from '@/components/admin/MotorDetailsEditor';
import { WeightDataEditor } from '@/components/admin/WeightDataEditor';
import { DocumentationEditor } from '@/components/admin/DocumentationEditor';
import { PageContentEditor } from '@/components/admin/PageContentEditor';
import { UserApprovalManager } from '@/components/admin/UserApprovalManager';
import { ChangePassword } from '@/components/admin/ChangePassword';
import { FlexibleDimensionsEditor } from '@/components/admin/FlexibleDimensionsEditor';
import { DatasheetConfigEditor } from '@/components/admin/DatasheetConfigEditor';
import { AccessoryFireRatingEditor } from '@/components/admin/AccessoryFireRatingEditor';
import { BackendSettingsEditor } from '@/components/admin/BackendSettingsEditor';
import { GuestTrialSettingsEditor } from '@/components/admin/GuestTrialSettingsEditor';
import { SoftwareReleaseManager } from '@/components/admin/SoftwareReleaseManager';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useAuth } from '@/lib/authContext';
import { KinairLogo } from '@/components/KinairLogo';
import { AirCurtainManager } from '@/components/admin/aircurtain/AirCurtainManager';
import { FAN_DIAMETERS, ALL_MOTOR_POLE_OPTIONS, AIRFLOW_UNITS, PRESSURE_UNITS, POWER_UNITS } from '@/lib/fanData';
import { toast } from 'sonner';
import {
  useTenantData,
  useUpdateTenant,
  useFanSeries,
  useAddSeries,
  useUpdateSeries,
  useDeleteSeries,
  useFanModels,
  useAddFanModel,
  useDeleteFanModel,
  useUnitPreferences,
  useUpdateUnitPreferences,
} from '@/hooks/useFanDatabase';
// Default deletion password
const DELETION_PASSWORD = 'dpkchn786';

export default function AdminPage() {
  const { user, isAuthenticated, signOut, isLoading, isSuperAdmin, isAdmin, isApproved, tenantId } = useAuth();
  
  // Supabase hooks
  const { data: tenant, isLoading: loadingTenant } = useTenantData();
  const updateTenant = useUpdateTenant();
  const { data: series = [], isLoading: loadingSeries } = useFanSeries();
  const addSeriesMutation = useAddSeries();
  const updateSeriesMutation = useUpdateSeries();
  const deleteSeriesMutation = useDeleteSeries();
  const { data: fanModels = [], isLoading: loadingFans } = useFanModels();
  const addFanMutation = useAddFanModel();
  const deleteFanMutation = useDeleteFanModel();
  const { data: unitPrefs } = useUnitPreferences();
  const updateUnitPrefs = useUpdateUnitPreferences();
  
  // Tab state - defaults to 'units', will be updated by useEffect based on admin status
  const [activeTab, setActiveTab] = useState('units');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [editingCompanyName, setEditingCompanyName] = useState(false);
  const [tempCompanyName, setTempCompanyName] = useState('');
  const [logoInput, setLogoInput] = useState('');
  const [selectedSeriesFilter, setSelectedSeriesFilter] = useState<string>('');
  const [selectedFanId, setSelectedFanId] = useState<string | null>(null);
  const [newSeriesName, setNewSeriesName] = useState('');
  const [newSeriesDesc, setNewSeriesDesc] = useState('');
  
  // Contact info state
  const [editingContact, setEditingContact] = useState(false);
  const [tempEmail, setTempEmail] = useState('');
  const [tempPhone, setTempPhone] = useState('');
  const [tempAddress, setTempAddress] = useState('');
  const [tempFactoryAddress, setTempFactoryAddress] = useState('');
  const [tempGoogleMapsUrl, setTempGoogleMapsUrl] = useState('');
  
  // New fan model state
  const [showAddFan, setShowAddFan] = useState(false);
  const [newFanDiameter, setNewFanDiameter] = useState<string>('');
  const [customDiameterInput, setCustomDiameterInput] = useState<string>('');
  const [customModelName, setCustomModelName] = useState<string>('');
  const [useCustomDiameter, setUseCustomDiameter] = useState(false);
  const [newFanBladeConfigs, setNewFanBladeConfigs] = useState<number[]>([]);
  const [newBladeInput, setNewBladeInput] = useState<string>('');
  const [newFanMotorPoles, setNewFanMotorPoles] = useState<(number | string)[]>([]);
  const [newFanBladeAngles, setNewFanBladeAngles] = useState<number[]>([]);
  const [newBladeAngleInput, setNewBladeAngleInput] = useState<string>('');

  // Logo upload state
  const logoFileInputRef = useRef<HTMLInputElement>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);

  // Favicon state
  const faviconFileInputRef = useRef<HTMLInputElement>(null);
  const [uploadingFavicon, setUploadingFavicon] = useState(false);
  const [faviconInput, setFaviconInput] = useState('');
  const [faviconPreview, setFaviconPreview] = useState<string | null>(null);

  // Fan deletion state
  const [deleteFanDialogOpen, setDeleteFanDialogOpen] = useState(false);
  const [deleteFanId, setDeleteFanId] = useState<string | null>(null);
  const [deleteFanPassword, setDeleteFanPassword] = useState('');
  const [deleteFanError, setDeleteFanError] = useState('');

  // Set default tab based on admin status
  useEffect(() => {
    if (!isLoading) {
      setActiveTab(isAdmin ? 'overview' : 'units');
    }
  }, [isAdmin, isLoading]);

  // Set initial values when tenant data loads
  useEffect(() => {
    if (tenant) {
      setTempCompanyName(tenant.name || '');
      setLogoInput(tenant.logo_url || '');
      setTempEmail(tenant.email || '');
      setTempPhone(tenant.phone || '');
      setTempAddress(tenant.address || '');
      setTempFactoryAddress((tenant as any).factory_address || '');
      setTempGoogleMapsUrl((tenant as any).google_maps_url || '');
      setFaviconInput((tenant as any).favicon_url || '');
      setFaviconPreview((tenant as any).favicon_url || null);
    }
  }, [tenant]);

  // Set initial series filter when series loads
  if (series.length > 0 && !selectedSeriesFilter) {
    setSelectedSeriesFilter(series[0].id);
  }

  // Filter fans by selected series
  const filteredFans = fanModels.filter(f => (f as any).seriesId === selectedSeriesFilter);
  
  // Get available diameters (not already in this series)
  const usedDiameters = filteredFans.map(f => f.diameter);
  const availableDiameters = FAN_DIAMETERS.filter(d => !usedDiameters.includes(d));

  if (isLoading || loadingTenant) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  // Only admins can access admin portal
  if (!isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Card className="max-w-md w-full mx-4">
          <CardHeader className="text-center">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Shield className="w-8 h-8 text-red-600" />
            </div>
            <CardTitle>Access Denied</CardTitle>
            <CardDescription>
              You do not have permission to access the admin portal. This area is restricted to administrators only.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground text-center">
              Logged in as: {user?.email}
            </p>
            <div className="flex flex-col gap-2">
              <Button asChild className="w-full">
                <Link to="/">
                  <Home className="w-4 h-4 mr-2" />
                  Go to Fan Selector
                </Link>
              </Button>
              <Button variant="outline" className="w-full" onClick={signOut}>
                <LogOut className="w-4 h-4 mr-2" />
                Sign Out
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Regular approved users (non-admin) only get limited access

  const handleSaveCompanyName = () => {
    updateTenant.mutate({ name: tempCompanyName });
    setEditingCompanyName(false);
  };

  const handleSaveContactInfo = () => {
    updateTenant.mutate({ 
      email: tempEmail, 
      phone: tempPhone,
      address: tempAddress,
      factory_address: tempFactoryAddress,
      google_maps_url: tempGoogleMapsUrl 
    } as any);
    setEditingContact(false);
  };

  const handleSaveLogo = () => {
    updateTenant.mutate({ logo_url: logoInput });
  };

  const handleLogoFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    const validTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/svg+xml', 'image/webp'];
    if (!validTypes.includes(file.type)) {
      toast.error('Please upload a PNG, JPG, SVG, or WebP image');
      return;
    }

    // Validate file size (max 2MB)
    if (file.size > 2 * 1024 * 1024) {
      toast.error('File size must be less than 2MB');
      return;
    }

    setUploadingLogo(true);
    try {
      const { supabase } = await import('@/integrations/backend/client');
      
      // Create unique filename
      const fileExt = file.name.split('.').pop();
      const fileName = `logo-${tenantId}-${Date.now()}.${fileExt}`;
      const filePath = `logos/${fileName}`;

      // Upload to Supabase Storage
      const { error: uploadError } = await supabase.storage
        .from('brand-assets')
        .upload(filePath, file, { upsert: true });

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('brand-assets')
        .getPublicUrl(filePath);

      // Update tenant with new logo URL
      updateTenant.mutate({ logo_url: publicUrl });
      setLogoInput(publicUrl);
      toast.success('Logo uploaded successfully');
    } catch (error: any) {
      console.error('Upload error:', error);
      toast.error(error.message || 'Failed to upload logo');
    } finally {
      setUploadingLogo(false);
      if (logoFileInputRef.current) {
        logoFileInputRef.current.value = '';
      }
    }
  };

  const handleSaveFavicon = () => {
    updateTenant.mutate({ favicon_url: faviconInput } as any);
    setFaviconPreview(faviconInput);
    // Update the browser favicon dynamically
    updateBrowserFavicon(faviconInput);
    toast.success('Favicon updated successfully');
  };

  const updateBrowserFavicon = (url: string) => {
    const link = document.querySelector("link[rel*='icon']") as HTMLLinkElement || document.createElement('link');
    link.type = 'image/png';
    link.rel = 'icon';
    link.href = url;
    document.getElementsByTagName('head')[0].appendChild(link);
  };

  const handleFaviconFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    const validTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/x-icon', 'image/ico', 'image/webp'];
    if (!validTypes.includes(file.type)) {
      toast.error('Please upload a PNG, JPG, ICO, or WebP image');
      return;
    }

    // Validate file size (max 500KB for favicon)
    if (file.size > 500 * 1024) {
      toast.error('Favicon file size must be less than 500KB');
      return;
    }

    // Show preview immediately
    const reader = new FileReader();
    reader.onload = (e) => {
      setFaviconPreview(e.target?.result as string);
    };
    reader.readAsDataURL(file);

    setUploadingFavicon(true);
    try {
      const { supabase } = await import('@/integrations/backend/client');
      
      // Create unique filename
      const fileExt = file.name.split('.').pop();
      const fileName = `favicon-${tenantId}-${Date.now()}.${fileExt}`;
      const filePath = `favicons/${fileName}`;

      // Upload to Supabase Storage
      const { error: uploadError } = await supabase.storage
        .from('brand-assets')
        .upload(filePath, file, { upsert: true });

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('brand-assets')
        .getPublicUrl(filePath);

      // Update tenant with new favicon URL
      updateTenant.mutate({ favicon_url: publicUrl } as any);
      setFaviconInput(publicUrl);
      setFaviconPreview(publicUrl);
      updateBrowserFavicon(publicUrl);
      toast.success('Favicon uploaded successfully');
    } catch (error: any) {
      console.error('Upload error:', error);
      toast.error(error.message || 'Failed to upload favicon');
    } finally {
      setUploadingFavicon(false);
      if (faviconFileInputRef.current) {
        faviconFileInputRef.current.value = '';
      }
    }
  };

  const handleAddSeries = () => {
    if (!newSeriesName.trim()) {
      toast.error('Series name is required');
      return;
    }
    addSeriesMutation.mutate({ name: newSeriesName, description: newSeriesDesc });
    setNewSeriesName('');
    setNewSeriesDesc('');
  };

  const handleDeleteSeries = (seriesId: string) => {
    // Password protection is handled in SeriesCard component
    deleteSeriesMutation.mutate(seriesId);
  };

  const handleAddBladeConfig = () => {
    const bladeCount = parseInt(newBladeInput);
    if (isNaN(bladeCount) || bladeCount < 2 || bladeCount > 24) {
      toast.error('Blade count must be between 2 and 24');
      return;
    }
    if (newFanBladeConfigs.includes(bladeCount)) {
      toast.error('Blade count already added');
      return;
    }
    setNewFanBladeConfigs(prev => [...prev, bladeCount].sort((a, b) => a - b));
    setNewBladeInput('');
  };

  const handleRemoveBladeConfig = (bladeCount: number) => {
    setNewFanBladeConfigs(prev => prev.filter(b => b !== bladeCount));
  };

  const handleAddBladeAngle = () => {
    const angle = parseInt(newBladeAngleInput);
    if (isNaN(angle) || angle < 5 || angle > 90) {
      toast.error('Blade angle must be between 5 and 90 degrees');
      return;
    }
    if (newFanBladeAngles.includes(angle)) {
      toast.error('Blade angle already added');
      return;
    }
    setNewFanBladeAngles(prev => [...prev, angle].sort((a, b) => a - b));
    setNewBladeAngleInput('');
  };

  const handleRemoveBladeAngle = (angle: number) => {
    setNewFanBladeAngles(prev => prev.filter(a => a !== angle));
  };

  const toggleMotorPoleOption = (value: number | string) => {
    setNewFanMotorPoles(prev => 
      prev.includes(value) 
        ? prev.filter(p => p !== value)
        : [...prev, value]
    );
  };

  const handleAddFan = () => {
    // Get selected series to check fan type
    const selectedSeries = series.find(s => s.id === selectedSeriesFilter);
    const isNonAxial = selectedSeries?.fanType && selectedSeries.fanType !== 'axial';
    
    let diameter: number;
    let modelName: string | undefined;
    
    if (isNonAxial) {
      // For centrifugal/mixed fans, use custom model name (e.g., "7/7", "240/240")
      if (!customModelName.trim()) {
        toast.error('Please enter a model name (e.g., 7/7, 10/10, 240/240)');
        return;
      }
      modelName = customModelName.trim();
      
      // Check if model name already exists in this series
      const usedModels = fanModels
        .filter(f => f.seriesId === selectedSeriesFilter)
        .map(f => f.modelName || String(f.diameter));
      if (usedModels.includes(modelName)) {
        toast.error('This model name already exists in this series');
        return;
      }
      
      // Extract numeric part for diameter (e.g., "7/7" -> 178mm, "240/240" -> 240mm)
      const numMatch = modelName.match(/^(\d+)/);
      if (numMatch) {
        const firstNum = parseInt(numMatch[1]);
        // If it looks like inches (< 50), convert to mm; otherwise use as mm
        diameter = firstNum < 50 ? Math.round(firstNum * 25.4) : firstNum;
      } else {
        diameter = 100; // Default fallback
      }
    } else {
      // For axial fans, use numeric diameter
      const diameterValue = useCustomDiameter ? customDiameterInput : newFanDiameter;
      if (!diameterValue) {
        toast.error('Please select or enter a diameter');
        return;
      }
      diameter = parseInt(diameterValue);
      if (isNaN(diameter) || diameter < 100 || diameter > 5000) {
        toast.error('Diameter must be between 100mm and 5000mm');
        return;
      }
      if (usedDiameters.includes(diameter)) {
        toast.error('This diameter already exists in this series');
        return;
      }
    }
    
    if (!selectedSeriesFilter) {
      toast.error('Please select a series first');
      return;
    }
    
    // For non-axial fans, blade configs and angles are optional
    if (!isNonAxial && newFanBladeConfigs.length === 0) {
      toast.error('Please add at least one blade configuration');
      return;
    }
    if (newFanMotorPoles.length === 0) {
      toast.error('Please select at least one motor pole option');
      return;
    }
    if (!isNonAxial && newFanBladeAngles.length === 0) {
      toast.error('Please add at least one blade angle');
      return;
    }
    
    // Extract actual pole numbers
    const motorPoles: number[] = [];
    newFanMotorPoles.forEach(pole => {
      if (typeof pole === 'number') {
        if (!motorPoles.includes(pole)) motorPoles.push(pole);
      } else {
        const dualOption = ALL_MOTOR_POLE_OPTIONS.find(opt => opt.value === pole);
        if (dualOption?.poles) {
          dualOption.poles.forEach(p => {
            if (!motorPoles.includes(p)) motorPoles.push(p);
          });
        }
      }
    });

    // For non-axial (centrifugal) fans, create a default config with blade_count: 0, blade_angles: [0]
    // For axial fans, use the user-specified blade configurations
    const bladeConfigurations = isNonAxial
      ? [{ blade_count: 0, blade_angles: [0] }] // Default centrifugal config
      : newFanBladeConfigs.map(bc => ({
          blade_count: bc,
          blade_angles: newFanBladeAngles.length > 0 ? newFanBladeAngles : [0],
        }));
    
    addFanMutation.mutate({
      diameter,
      model_name: modelName,
      series_id: selectedSeriesFilter,
      motor_poles: motorPoles.sort((a, b) => a - b),
      blade_configurations: bladeConfigurations,
    });
    
    setShowAddFan(false);
    setNewFanDiameter('');
    setCustomModelName('');
    setNewFanBladeConfigs([]);
    setNewFanMotorPoles([]);
    setNewFanBladeAngles([]);
  };

  const handleDeleteFan = (fanId: string) => {
    setDeleteFanId(fanId);
    setDeleteFanDialogOpen(true);
  };

  const confirmDeleteFan = () => {
    if (deleteFanPassword === DELETION_PASSWORD && deleteFanId) {
      deleteFanMutation.mutate(deleteFanId);
      if (selectedFanId === deleteFanId) {
        setSelectedFanId(null);
      }
      setDeleteFanDialogOpen(false);
      setDeleteFanId(null);
      setDeleteFanPassword('');
      setDeleteFanError('');
    } else {
      setDeleteFanError('Incorrect password. Please try again.');
    }
  };

  const selectedFan = selectedFanId ? fanModels.find(f => f.id === selectedFanId) : null;

  const sidebarInner = (
      <>
        <div className="p-4 border-b border-border">
          <KinairLogo size="md" />
        </div>

        
        <nav className="flex-1 p-4 space-y-2">
          {/* Admin-only navigation items */}
          {isAdmin && (
            <>
              {[
              { id: 'overview', icon: Settings, label: 'Overview' },
                { id: 'fans', icon: Wind, label: 'Fan Data' },
                { id: 'series', icon: Database, label: 'Series & Drawings' },
                { id: 'dimensions', icon: Ruler, label: 'Dimensions' },
                { id: 'datasheet', icon: FileText, label: 'Datasheet Config' },
                { id: 'accessories', icon: Package, label: 'Accessories & Fire' },
                { id: 'branding', icon: Image, label: 'Branding' },
                { id: 'aircurtains', icon: DoorOpen, label: 'Air Curtain Data' },
                { id: 'motors', icon: Zap, label: 'Motor Details' },
                { id: 'weights', icon: Weight, label: 'Weight Data' },
                { id: 'documentation', icon: FileText, label: 'Documentation' },
                { id: 'pages', icon: FileText, label: 'About/Quote Pages' },
                { id: 'backend', icon: Database, label: 'Backend Settings' },
                { id: 'guest-trial', icon: Clock, label: 'Guest Trial' },
              ].map(item => (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    activeTab === item.id ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'
                  }`}
                >
                  <item.icon className="w-4 h-4" />
                  {item.label}
                </button>
              ))}
            </>
          )}
          
          {/* Available to all approved users */}
          <button
            onClick={() => setActiveTab('units')}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === 'units' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'
            }`}
          >
            <Gauge className="w-4 h-4" />
            Default Units
          </button>
          
          <button
            onClick={() => setActiveTab('password')}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === 'password' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'
            }`}
          >
            <Lock className="w-4 h-4" />
            Change Password
          </button>
          
          {isSuperAdmin && (
            <>
              <div className="border-t border-border my-2" />
              <button
                onClick={() => setActiveTab('users')}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  activeTab === 'users' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'
                }`}
              >
                <Users className="w-4 h-4" />
                User Management
              </button>
              <button
                onClick={() => setActiveTab('releases')}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  activeTab === 'releases' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'
                }`}
              >
                <Package className="w-4 h-4" />
                Software Releases
              </button>
            </>
          )}

        </nav>

        <div className="p-4 border-t border-border space-y-2">
          <Link to="/">
            <Button variant="outline" className="w-full justify-start">
              <Home className="w-4 h-4" />
              Back to Selector
            </Button>
          </Link>
          <Button variant="ghost" className="w-full justify-start text-muted-foreground" onClick={signOut}>
            <LogOut className="w-4 h-4" />
            Logout
          </Button>
        </div>
      </>
  );

  return (
    <div className="min-h-screen bg-background flex">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex w-64 shrink-0 bg-card border-r border-border flex-col">
        {sidebarInner}
      </aside>

      {/* Mobile Sidebar */}
      <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
        <SheetContent side="left" className="p-0 w-[85vw] max-w-xs overflow-y-auto">
          <div className="flex flex-col min-h-full" onClick={() => setMobileNavOpen(false)}>
            {sidebarInner}
          </div>
        </SheetContent>
      </Sheet>

      {/* Main Content */}
      <main className="flex-1 min-w-0 overflow-x-hidden">
        <header className="bg-card border-b border-border px-4 md:px-8 py-3 md:py-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden shrink-0"
              onClick={() => setMobileNavOpen(true)}
              aria-label="Open menu"
            >
              <Menu className="w-5 h-5" />
            </Button>
            <div className="min-w-0">
              <h1 className="text-lg md:text-2xl font-bold text-foreground truncate">
                {isAdmin ? 'Admin Portal' : 'User Settings'}
              </h1>
              <p className="hidden sm:block text-sm text-muted-foreground truncate">
                {isAdmin ? 'Manage fan data and settings' : 'Manage your preferences'}
              </p>
            </div>
          </div>
          <div className="hidden sm:flex items-center gap-2 text-sm text-muted-foreground min-w-0">
            <Users className="w-4 h-4 shrink-0" />
            <span className="truncate max-w-[180px]">{user?.email}</span>
          </div>
        </header>


        <div className="p-4 md:p-8">
          {activeTab === 'overview' && (
            <div className="space-y-6 animate-fade-in">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card>
                  <CardContent className="p-6">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center">
                        <Wind className="w-6 h-6 text-primary" />
                      </div>
                      <div>
                        <div className="text-2xl font-bold text-foreground">{fanModels.length}</div>
                        <div className="text-sm text-muted-foreground">Fan Models</div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                
                <Card>
                  <CardContent className="p-6">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-accent/10 rounded-xl flex items-center justify-center">
                        <Database className="w-6 h-6 text-accent" />
                      </div>
                      <div>
                        <div className="text-2xl font-bold text-foreground">{series.length}</div>
                        <div className="text-sm text-muted-foreground">Series</div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-6">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-emerald-500/10 rounded-xl flex items-center justify-center">
                        <FileSpreadsheet className="w-6 h-6 text-emerald-500" />
                      </div>
                      <div>
                        <div className="text-2xl font-bold text-foreground">{tenant?.name || 'Company Name'}</div>
                        <div className="text-sm text-muted-foreground">Company</div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle>Quick Actions</CardTitle>
                </CardHeader>
                <CardContent className="flex gap-4">
                  <Button onClick={() => setActiveTab('fans')}>
                    <Plus className="w-4 h-4" />
                    Add Fan Model
                  </Button>
                  <Button variant="outline" onClick={() => setActiveTab('series')}>
                    <Database className="w-4 h-4" />
                    Manage Series
                  </Button>
                </CardContent>
              </Card>
            </div>
          )}

          {activeTab === 'series' && (
            <div className="space-y-6 animate-fade-in">
              <div className="flex items-end gap-4 p-4 bg-muted/30 rounded-lg">
                <div className="flex-1">
                  <Label>Series Name</Label>
                  <Input value={newSeriesName} onChange={e => setNewSeriesName(e.target.value)} placeholder="e.g., KAF-PRO" className="mt-1" />
                </div>
                <div className="flex-1">
                  <Label>Description</Label>
                  <Input value={newSeriesDesc} onChange={e => setNewSeriesDesc(e.target.value)} placeholder="Technical description" className="mt-1" />
                </div>
                <Button onClick={handleAddSeries} disabled={addSeriesMutation.isPending}>
                  {addSeriesMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                  Add Series
                </Button>
              </div>

              {loadingSeries ? (
                <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin" /></div>
              ) : series.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">No series defined yet</div>
              ) : (
                <div className="grid grid-cols-1 gap-6 max-w-4xl">
                  {series.map(s => (
                    <SeriesCard
                      key={s.id}
                      series={s}
                      fanCount={fanModels.filter(f => (f as any).seriesId === s.id).length}
                      onUpdate={(updates) => updateSeriesMutation.mutate({ id: s.id, updates })}
                      onDelete={() => handleDeleteSeries(s.id)}
                      isUpdating={updateSeriesMutation.isPending}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Dimensions Tab - Flexible per-series dimensions */}
          {activeTab === 'dimensions' && (
            <FlexibleDimensionsEditor />
          )}

          {/* Datasheet Configuration Tab */}
          {activeTab === 'datasheet' && (
            <DatasheetConfigEditor />
          )}

          {activeTab === 'branding' && (
            <div className="space-y-6 animate-fade-in max-w-2xl">
              <Card>
                <CardHeader><CardTitle>Brand Name</CardTitle></CardHeader>
                <CardContent>
                  {editingCompanyName ? (
                    <div className="flex gap-2">
                      <Input value={tempCompanyName} onChange={e => setTempCompanyName(e.target.value)} placeholder="Enter brand name" />
                      <Button onClick={handleSaveCompanyName} disabled={updateTenant.isPending}>
                        {updateTenant.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                        <span className="ml-2">Save</span>
                      </Button>
                      <Button variant="ghost" onClick={() => setEditingCompanyName(false)}><X className="w-4 h-4" /><span className="ml-2">Cancel</span></Button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-4">
                      <span className="text-xl font-bold">{tenant?.name || 'Company Name'}</span>
                      <Button variant="outline" size="sm" onClick={() => { setTempCompanyName(tenant?.name || ''); setEditingCompanyName(true); }}><Edit2 className="w-4 h-4" /></Button>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Brand Logo</CardTitle>
                  <CardDescription>Upload your brand logo (PNG, JPG, or SVG)</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {tenant?.logo_url && (
                    <div className="p-4 bg-muted/30 rounded-lg flex items-center justify-center">
                      <img src={tenant.logo_url} alt="Current logo" className="max-h-24 max-w-full object-contain" />
                    </div>
                  )}
                  <div className="space-y-3">
                    <div>
                      <Label>Logo URL</Label>
                      <div className="flex gap-2 mt-1">
                        <Input 
                          value={logoInput} 
                          onChange={e => setLogoInput(e.target.value)} 
                          placeholder="https://example.com/logo.png"
                        />
                        <Button onClick={handleSaveLogo} disabled={updateTenant.isPending}>
                          {updateTenant.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                          <span className="ml-2">Save</span>
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">Enter a URL to your logo image</p>
                    </div>
                    <div className="relative">
                      <div className="absolute inset-0 flex items-center">
                        <span className="w-full border-t" />
                      </div>
                      <div className="relative flex justify-center text-xs uppercase">
                        <span className="bg-card px-2 text-muted-foreground">Or upload a file</span>
                      </div>
                    </div>
                    <div>
<input
                        ref={logoFileInputRef}
                        type="file"
                        accept="image/png,image/jpeg,image/jpg,image/svg+xml,image/webp"
                        onChange={handleLogoFileUpload}
                        className="hidden"
                      />
                      <Button 
                        variant="outline" 
                        className="w-full h-24 border-2 border-dashed hover:border-primary/50"
                        onClick={() => logoFileInputRef.current?.click()}
                        disabled={uploadingLogo}
                      >
                        {uploadingLogo ? (
                          <div className="flex flex-col items-center">
                            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground mb-2" />
                            <span className="text-sm text-muted-foreground">Uploading...</span>
                          </div>
                        ) : (
                          <div className="flex flex-col items-center">
                            <Upload className="w-8 h-8 text-muted-foreground mb-2" />
                            <span className="text-sm text-muted-foreground">Click to upload logo</span>
                            <span className="text-xs text-muted-foreground mt-1">PNG, JPG, SVG, WebP (max 2MB)</span>
                          </div>
                        )}
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Favicon</CardTitle>
                  <CardDescription>Upload a favicon (browser tab icon) - recommended 32x32 or 64x64 pixels</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Favicon Preview */}
                  <div className="flex items-center gap-6">
                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">Preview</Label>
                      <div className="flex items-center gap-4">
                        {/* Browser tab mockup */}
                        <div className="bg-muted rounded-t-lg px-3 py-2 flex items-center gap-2 border border-b-0">
                          {faviconPreview ? (
                            <img src={faviconPreview} alt="Favicon preview" className="w-4 h-4 object-contain" />
                          ) : (
                            <div className="w-4 h-4 bg-muted-foreground/20 rounded" />
                          )}
                          <span className="text-xs text-muted-foreground truncate max-w-[100px]">
                            {tenant?.name || 'Company'}
                          </span>
                        </div>
                        {/* Large preview */}
                        <div className="p-3 bg-muted/30 rounded-lg border-2 border-dashed">
                          {faviconPreview ? (
                            <img src={faviconPreview} alt="Favicon preview large" className="w-12 h-12 object-contain" />
                          ) : (
                            <div className="w-12 h-12 bg-muted-foreground/10 rounded flex items-center justify-center">
                              <Image className="w-6 h-6 text-muted-foreground/40" />
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div>
                      <Label>Favicon URL</Label>
                      <div className="flex gap-2 mt-1">
                        <Input 
                          value={faviconInput} 
                          onChange={e => {
                            setFaviconInput(e.target.value);
                            setFaviconPreview(e.target.value);
                          }} 
                          placeholder="https://example.com/favicon.png"
                        />
                        <Button onClick={handleSaveFavicon} disabled={updateTenant.isPending || !faviconInput}>
                          {updateTenant.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                          <span className="ml-2">Save</span>
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">Enter a URL to your favicon image</p>
                    </div>
                    <div className="relative">
                      <div className="absolute inset-0 flex items-center">
                        <span className="w-full border-t" />
                      </div>
                      <div className="relative flex justify-center text-xs uppercase">
                        <span className="bg-card px-2 text-muted-foreground">Or upload a file</span>
                      </div>
                    </div>
                    <div>
                      <input
                        ref={faviconFileInputRef}
                        type="file"
                        accept="image/png,image/jpeg,image/jpg,image/x-icon,image/webp"
                        onChange={handleFaviconFileUpload}
                        className="hidden"
                      />
                      <Button 
                        variant="outline" 
                        className="w-full h-20 border-2 border-dashed hover:border-primary/50"
                        onClick={() => faviconFileInputRef.current?.click()}
                        disabled={uploadingFavicon}
                      >
                        {uploadingFavicon ? (
                          <div className="flex flex-col items-center">
                            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground mb-1" />
                            <span className="text-sm text-muted-foreground">Uploading...</span>
                          </div>
                        ) : (
                          <div className="flex flex-col items-center">
                            <Upload className="w-6 h-6 text-muted-foreground mb-1" />
                            <span className="text-sm text-muted-foreground">Click to upload favicon</span>
                            <span className="text-xs text-muted-foreground mt-1">PNG, JPG, ICO, WebP (max 500KB)</span>
                          </div>
                        )}
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle>Contact Info</CardTitle></CardHeader>
                <CardContent>
                  {editingContact ? (
                    <div className="space-y-3">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                          <Label>Email</Label>
                          <Input value={tempEmail} onChange={e => setTempEmail(e.target.value)} className="mt-1" placeholder="contact@company.com" />
                        </div>
                        <div>
                          <Label>Phone</Label>
                          <Input value={tempPhone} onChange={e => setTempPhone(e.target.value)} className="mt-1" placeholder="+1 234 567 8900" />
                        </div>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                          <Label>Office Address</Label>
                          <Textarea 
                            value={tempAddress} 
                            onChange={e => setTempAddress(e.target.value)} 
                            className="mt-1 resize-none" 
                            rows={3}
                            placeholder="123 Business Center&#10;Dubai, UAE" 
                          />
                        </div>
                        <div>
                          <Label>Factory Address</Label>
                          <Textarea 
                            value={tempFactoryAddress} 
                            onChange={e => setTempFactoryAddress(e.target.value)} 
                            className="mt-1 resize-none" 
                            rows={3}
                            placeholder="456 Industrial Area&#10;Dubai, UAE" 
                          />
                        </div>
                      </div>
                      <div>
                        <Label>Google Maps URL</Label>
                        <Input 
                          value={tempGoogleMapsUrl} 
                          onChange={e => setTempGoogleMapsUrl(e.target.value)} 
                          className="mt-1" 
                          placeholder="https://www.google.com/maps/embed?..." 
                        />
                        <p className="text-xs text-muted-foreground mt-1">
                          Use Google Maps embed URL for embedded map, or regular Google Maps link for "View on Maps" button
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <Button onClick={handleSaveContactInfo}><Save className="w-4 h-4" />Save</Button>
                        <Button variant="ghost" onClick={() => setEditingContact(false)}><X className="w-4 h-4" /></Button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <p><strong>Email:</strong> {tenant?.email || 'Not set'}</p>
                      <p><strong>Phone:</strong> {tenant?.phone || 'Not set'}</p>
                      <p><strong>Office Address:</strong> {tenant?.address || 'Not set'}</p>
                      <p><strong>Factory Address:</strong> {(tenant as any)?.factory_address || 'Not set'}</p>
                      <p><strong>Google Maps:</strong> {(tenant as any)?.google_maps_url ? 'Configured' : 'Not set'}</p>
                      <Button variant="outline" size="sm" onClick={() => { 
                        setTempEmail(tenant?.email || ''); 
                        setTempPhone(tenant?.phone || ''); 
                        setTempAddress(tenant?.address || '');
                        setTempFactoryAddress((tenant as any)?.factory_address || '');
                        setTempGoogleMapsUrl((tenant as any)?.google_maps_url || '');
                        setEditingContact(true); 
                      }}><Edit2 className="w-4 h-4" />Edit</Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}

          {activeTab === 'motors' && <MotorDetailsEditor />}
          {activeTab === 'weights' && <WeightDataEditor />}
          {activeTab === 'users' && isSuperAdmin && <UserApprovalManager />}

          {activeTab === 'units' && (
            <Card className="max-w-xl">
              <CardHeader><CardTitle>Default Units & Settings</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label>Airflow Unit</Label>
                  <Select value={unitPrefs?.airflowUnit || 'CMH'} onValueChange={v => updateUnitPrefs.mutate({ airflowUnit: v as any })}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(AIRFLOW_UNITS).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Pressure Unit</Label>
                  <Select value={unitPrefs?.pressureUnit || 'Pa'} onValueChange={v => updateUnitPrefs.mutate({ pressureUnit: v as any })}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(PRESSURE_UNITS).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Power Unit</Label>
                  <Select value={unitPrefs?.powerUnit || 'kW'} onValueChange={v => updateUnitPrefs.mutate({ powerUnit: v as any })}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(POWER_UNITS).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="pt-4 border-t">
                  <Label className="flex items-center gap-2 mb-3">
                    <Gauge className="w-4 h-4" />
                    Default Duty Point Tolerance
                  </Label>
                  <p className="text-sm text-muted-foreground mb-3">
                    Set the default tolerance range for fan selection. Users can still customize this during selection.
                  </p>
                  <div className="flex items-center gap-3">
                    <div className="flex-1">
                      <Label className="text-xs text-muted-foreground">Min %</Label>
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        value={unitPrefs?.defaultToleranceMin ?? 95}
                        onChange={(e) => updateUnitPrefs.mutate({ defaultToleranceMin: parseInt(e.target.value) || 95 })}
                        className="mt-1"
                      />
                    </div>
                    <div className="flex-1">
                      <Label className="text-xs text-muted-foreground">Max %</Label>
                      <Input
                        type="number"
                        min={100}
                        max={200}
                        value={unitPrefs?.defaultToleranceMax ?? 105}
                        onChange={(e) => updateUnitPrefs.mutate({ defaultToleranceMax: parseInt(e.target.value) || 105 })}
                        className="mt-1"
                      />
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    Current default: {unitPrefs?.defaultToleranceMin ?? 95}% - {unitPrefs?.defaultToleranceMax ?? 105}%
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          {activeTab === 'fans' && (
            <div className="space-y-6 animate-fade-in">
              {/* Series Filter, Add Fan, and Import/Export */}
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <Label>Series:</Label>
                  <Select value={selectedSeriesFilter} onValueChange={setSelectedSeriesFilter}>
                    <SelectTrigger className="w-48">
                      <SelectValue placeholder="Select series" />
                    </SelectTrigger>
                    <SelectContent>
                      {series.map(s => (
                        <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-2">
                  <ExcelImportExport selectedSeries={series.find(s => s.id === selectedSeriesFilter)?.name} />
                  <Button onClick={() => setShowAddFan(true)} disabled={!selectedSeriesFilter || series.length === 0}>
                    <Plus className="w-4 h-4" />
                    Add Fan Model
                  </Button>
                </div>
              </div>

              {series.length === 0 ? (
                <Card>
                  <CardContent className="text-center py-12 text-muted-foreground">
                    <Database className="w-12 h-12 mx-auto mb-4 opacity-30" />
                    <p>No series defined yet. Add a series first to create fan models.</p>
                    <Button className="mt-4" onClick={() => setActiveTab('series')}>Go to Series</Button>
                  </CardContent>
                </Card>
              ) : (
                <>
                  {/* Add Fan Form */}
                  {showAddFan && (
                    <Card>
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          <Plus className="w-5 h-5" />
                          Add New Fan Model
                        </CardTitle>
                        <CardDescription>Add a new fan model to {series.find(s => s.id === selectedSeriesFilter)?.name}</CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            {(() => {
                              const selectedSeries = series.find(s => s.id === selectedSeriesFilter);
                              const isNonAxial = selectedSeries?.fanType && selectedSeries.fanType !== 'axial';
                              
                              if (isNonAxial) {
                                return (
                                  <>
                                    <Label>Model Name</Label>
                                    <Input
                                      type="text"
                                      value={customModelName}
                                      onChange={e => setCustomModelName(e.target.value)}
                                      placeholder="Enter model name"
                                      className="mt-2"
                                    />
                                  </>
                                );
                              }
                              
                              return (
                                <>
                                  <Label>Fan Model Size (mm)</Label>
                                  <div className="flex items-center gap-2 mt-1">
                                    <div className="flex items-center gap-2">
                                      <Button
                                        type="button"
                                        variant={!useCustomDiameter ? "default" : "outline"}
                                        size="sm"
                                        onClick={() => setUseCustomDiameter(false)}
                                      >
                                        Standard
                                      </Button>
                                      <Button
                                        type="button"
                                        variant={useCustomDiameter ? "default" : "outline"}
                                        size="sm"
                                        onClick={() => setUseCustomDiameter(true)}
                                      >
                                        Custom
                                      </Button>
                                    </div>
                                  </div>
                                  {useCustomDiameter ? (
                                    <Input
                                      type="number"
                                      value={customDiameterInput}
                                      onChange={e => setCustomDiameterInput(e.target.value)}
                                      placeholder="Enter diameter (100-5000mm)"
                                      min={100}
                                      max={5000}
                                      className="mt-2"
                                    />
                                  ) : (
                                    <Select value={newFanDiameter} onValueChange={setNewFanDiameter}>
                                      <SelectTrigger className="mt-2">
                                        <SelectValue placeholder="Select size" />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {availableDiameters.map(d => (
                                          <SelectItem key={d} value={d.toString()}>{d}mm</SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  )}
                                </>
                              );
                            })()}
                          </div>
                          <div>
                            <Label>Motor Poles</Label>
                            <div className="flex flex-wrap gap-2 mt-1">
                              {ALL_MOTOR_POLE_OPTIONS.map(opt => (
                                <Button
                                  key={opt.value}
                                  variant={newFanMotorPoles.includes(opt.value) ? "default" : "outline"}
                                  size="sm"
                                  onClick={() => toggleMotorPoleOption(opt.value)}
                                >
                                  {opt.label}
                                </Button>
                              ))}
                            </div>
                          </div>
                        </div>

                        {/* Blade Configurations - Only show for axial fans */}
                        {(() => {
                          const selectedSeries = series.find(s => s.id === selectedSeriesFilter);
                          const isAxial = !selectedSeries?.fanType || selectedSeries.fanType === 'axial';
                          
                          if (!isAxial) {
                            return (
                              <div className="p-3 bg-muted/30 rounded-lg text-sm text-muted-foreground">
                                <p>Blade count and blade angle are not applicable for this fan type.</p>
                                <p className="text-xs mt-1">A default configuration will be created automatically.</p>
                              </div>
                            );
                          }
                          
                          return (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <div>
                                <Label>Blade Configurations</Label>
                                <div className="flex gap-2 mt-1">
                                  <Input 
                                    type="number" 
                                    value={newBladeInput} 
                                    onChange={e => setNewBladeInput(e.target.value)}
                                    placeholder="Blade count (2-24)"
                                    min={2}
                                    max={24}
                                  />
                                  <Button onClick={handleAddBladeConfig} size="sm"><Plus className="w-4 h-4" /></Button>
                                </div>
                                <div className="flex flex-wrap gap-2 mt-2">
                                  {newFanBladeConfigs.map(bc => (
                                    <span key={bc} className="px-2 py-1 bg-primary/10 rounded text-sm flex items-center gap-1">
                                      {bc} blades
                                      <button onClick={() => handleRemoveBladeConfig(bc)} className="text-destructive hover:text-destructive/80">
                                        <X className="w-3 h-3" />
                                      </button>
                                    </span>
                                  ))}
                                </div>
                              </div>
                              <div>
                                <Label>Blade Angles (°)</Label>
                                <div className="flex gap-2 mt-1">
                                  <Input 
                                    type="number" 
                                    value={newBladeAngleInput} 
                                    onChange={e => setNewBladeAngleInput(e.target.value)}
                                    placeholder="Angle (5-90°)"
                                    min={5}
                                    max={90}
                                  />
                                  <Button onClick={handleAddBladeAngle} size="sm"><Plus className="w-4 h-4" /></Button>
                                </div>
                                <div className="flex flex-wrap gap-2 mt-2">
                                  {newFanBladeAngles.map(angle => (
                                    <span key={angle} className="px-2 py-1 bg-primary/10 rounded text-sm flex items-center gap-1">
                                      {angle}°
                                      <button onClick={() => handleRemoveBladeAngle(angle)} className="text-destructive hover:text-destructive/80">
                                        <X className="w-3 h-3" />
                                      </button>
                                    </span>
                                  ))}
                                </div>
                              </div>
                            </div>
                          );
                        })()}

                        <div className="flex gap-2 pt-4">
                          <Button onClick={handleAddFan} disabled={addFanMutation.isPending}>
                            {addFanMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                            Save Fan Model
                          </Button>
                          <Button variant="ghost" onClick={() => {
                            setShowAddFan(false);
                            setNewFanDiameter('');
                            setCustomDiameterInput('');
                            setCustomModelName('');
                            setUseCustomDiameter(false);
                            setNewFanBladeConfigs([]);
                            setNewFanMotorPoles([]);
                            setNewFanBladeAngles([]);
                          }}>
                            <X className="w-4 h-4" />
                            Cancel
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* Existing Fans Table */}
                  {loadingFans ? (
                    <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin" /></div>
                  ) : filteredFans.length === 0 ? (
                    <Card>
                      <CardContent className="text-center py-12 text-muted-foreground">
                        <Wind className="w-12 h-12 mx-auto mb-4 opacity-30" />
                        <p>No fans in this series yet.</p>
                        <p className="text-sm mt-2">Click "Add Fan Model" to create one.</p>
                      </CardContent>
                    </Card>
                  ) : (
                    <Card>
                      <CardHeader>
                        <CardTitle>Fan Models in {series.find(s => s.id === selectedSeriesFilter)?.name}</CardTitle>
                        <CardDescription>{filteredFans.length} model(s)</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Fan Model Size</TableHead>
                              <TableHead>Motor Poles</TableHead>
                              <TableHead>Actions</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {filteredFans.map(fan => (
                              <TableRow key={fan.id}>
                                <TableCell className="font-medium">{fan.modelName || `${fan.diameter}mm`}</TableCell>
                                <TableCell>{fan.motorPoles?.join(', ') || 'N/A'}P</TableCell>
                                <TableCell>
                                  <div className="flex gap-2">
                                    <Button 
                                      variant="outline" 
                                      size="sm"
                                      onClick={() => setSelectedFanId(fan.id)}
                                    >
                                      <Edit2 className="w-4 h-4" />
                                      Edit
                                    </Button>
                                    <Button 
                                      variant="destructive" 
                                      size="sm"
                                      onClick={() => handleDeleteFan(fan.id)}
                                      disabled={deleteFanMutation.isPending}
                                    >
                                      {deleteFanMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                                    </Button>
                                  </div>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </CardContent>
                    </Card>
                  )}

                  {/* Selected Fan Editor */}
                  {selectedFan && (
                    <div className="space-y-6">
                      <Card>
                        <CardHeader>
                          <CardTitle className="flex items-center justify-between">
                            <span>Editing: {selectedFan.diameter}mm Fan</span>
                            <Button variant="ghost" size="sm" onClick={() => setSelectedFanId(null)}>
                              <X className="w-4 h-4" />
                            </Button>
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <FanModelEditor fan={selectedFan} fanType={(selectedFan as any).fanType || 'axial'} />
                        </CardContent>
                      </Card>
                      <PerformanceDataEditor fan={selectedFan} fanType={(selectedFan as any).fanType || 'axial'} />
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {activeTab === 'documentation' && isAdmin && (
            <DocumentationEditor />
          )}

          {activeTab === 'pages' && isAdmin && (
            <PageContentEditor />
          )}
          
          {activeTab === 'accessories' && isAdmin && (
            <AccessoryFireRatingEditor />
          )}
          
          {activeTab === 'password' && (
            <ChangePassword />
          )}

          {activeTab === 'backend' && isAdmin && (
            <BackendSettingsEditor tenantId={tenantId} />
          )}

          {activeTab === 'guest-trial' && isAdmin && (
            <GuestTrialSettingsEditor />
          )}

          {activeTab === 'aircurtains' && isAdmin && <AirCurtainManager />}

          {activeTab === 'releases' && isSuperAdmin && <SoftwareReleaseManager />}

        </div>
      </main>

      {/* Fan Model Delete Confirmation Dialog */}
      <AlertDialog open={deleteFanDialogOpen} onOpenChange={(open) => {
        setDeleteFanDialogOpen(open);
        if (!open) {
          setDeleteFanPassword('');
          setDeleteFanError('');
          setDeleteFanId(null);
        }
      }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Lock className="w-4 h-4" />
              Delete Fan Model
            </AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the fan model
              and all associated performance data, noise data, and configurations.
              <br /><br />
              <strong>Enter the deletion password to confirm:</strong>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-4">
            <Input
              type="password"
              placeholder="Enter deletion password"
              value={deleteFanPassword}
              onChange={(e) => {
                setDeleteFanPassword(e.target.value);
                setDeleteFanError('');
              }}
              className={deleteFanError ? 'border-destructive' : ''}
            />
            {deleteFanError && (
              <p className="text-sm text-destructive mt-2">{deleteFanError}</p>
            )}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <Button
              variant="destructive"
              onClick={confirmDeleteFan}
            >
              Delete Fan Model
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
