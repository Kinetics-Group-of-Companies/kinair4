import { useState, useRef } from 'react';
import { Upload, Image as ImageIcon, X, Link as LinkIcon, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { FanModel } from '@/lib/fanData';
import { useUpdateFanModel } from '@/hooks/useFanDatabase';
import { supabase } from '@/integrations/backend/client';
import { toast } from 'sonner';

interface FanDrawingUploadProps {
  fan: FanModel;
}

export function FanDrawingUpload({ fan }: FanDrawingUploadProps) {
  const updateFanMutation = useUpdateFanModel();
  const [urlInput, setUrlInput] = useState(fan.drawingUrl || '');
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUrlSave = async () => {
    try {
      await updateFanMutation.mutateAsync({
        id: fan.id,
        updates: { drawing_url: urlInput || null }
      });
    } catch (error) {
      // Error already handled by mutation
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast.error('Please upload an image file');
      return;
    }

    // Validate file size (max 5MB for storage)
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image must be less than 5MB');
      return;
    }

    setIsUploading(true);

    try {
      // Upload to Supabase Storage
      const fileExt = file.name.split('.').pop();
      const fileName = `fan-drawings/${fan.id}-${Date.now()}.${fileExt}`;
      
      const { error: uploadError } = await supabase.storage
        .from('brand-assets')
        .upload(fileName, file, { upsert: true });
      
      if (uploadError) throw uploadError;
      
      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('brand-assets')
        .getPublicUrl(fileName);
      
      // Update fan with new drawing URL
      await updateFanMutation.mutateAsync({
        id: fan.id,
        updates: { drawing_url: publicUrl }
      });
      
      setUrlInput(publicUrl);
      toast.success('Drawing uploaded successfully');
    } catch (error) {
      console.error('Upload error:', error);
      toast.error('Failed to upload drawing');
    } finally {
      setIsUploading(false);
    }
  };

  const handleRemoveDrawing = async () => {
    try {
      await updateFanMutation.mutateAsync({
        id: fan.id,
        updates: { drawing_url: null }
      });
      setUrlInput('');
      toast.success('Drawing removed');
    } catch (error) {
      // Error already handled by mutation
    }
  };

  return (
    <div className="space-y-4">
      <Label className="text-sm font-medium">Fan Drawing</Label>
      
      {/* Current Drawing Preview */}
      {fan.drawingUrl && (
        <div className="relative border rounded-lg p-4 bg-muted/30">
          <div className="flex items-start gap-4">
            <div className="w-32 h-32 bg-background rounded-lg border flex items-center justify-center overflow-hidden">
              <img 
                src={fan.drawingUrl} 
                alt={`${fan.id} drawing`}
                className="max-w-full max-h-full object-contain"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none';
                }}
              />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground mb-1">Current Drawing</p>
              <p className="text-xs text-muted-foreground truncate max-w-[200px]">
                {fan.drawingUrl.startsWith('data:') ? 'Uploaded image' : fan.drawingUrl}
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleRemoveDrawing}
              className="text-destructive hover:text-destructive"
              disabled={updateFanMutation.isPending}
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Upload Options */}
      <Tabs defaultValue="upload" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="upload" className="gap-2">
            <Upload className="w-4 h-4" />
            Upload File
          </TabsTrigger>
          <TabsTrigger value="url" className="gap-2">
            <LinkIcon className="w-4 h-4" />
            URL
          </TabsTrigger>
        </TabsList>

        <TabsContent value="upload" className="space-y-3">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileUpload}
            className="hidden"
          />
          <div 
            onClick={() => !isUploading && fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
              isUploading ? 'cursor-not-allowed opacity-50' : 'cursor-pointer hover:border-primary/50'
            }`}
          >
            {isUploading ? (
              <Loader2 className="w-8 h-8 mx-auto mb-2 text-primary animate-spin" />
            ) : (
              <ImageIcon className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
            )}
            <p className="text-sm text-muted-foreground">
              {isUploading ? 'Uploading...' : 'Click to upload an image'}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              PNG, JPG, SVG up to 5MB
            </p>
          </div>
        </TabsContent>

        <TabsContent value="url" className="space-y-3">
          <div className="flex gap-2">
            <Input
              placeholder="https://example.com/drawing.png"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              className="flex-1"
            />
            <Button onClick={handleUrlSave} disabled={!urlInput || updateFanMutation.isPending}>
              {updateFanMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save'}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Enter a direct URL to an image file
          </p>
        </TabsContent>
      </Tabs>
    </div>
  );
}
