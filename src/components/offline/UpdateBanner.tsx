import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Download, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { isOfflineMode, isOnline } from '@/lib/offline/mode';
import { APP_VERSION, compareVersions } from '@/lib/appVersion';
import { toast } from 'sonner';

/**
 * Desktop software update notice: checks the published releases and tells the
 * user when a newer version than the installed one is available.
 */
export function UpdateBanner() {
  const [dismissed, setDismissed] = useState(false);
  const enabled = isOfflineMode && isOnline();

  const { data: latest } = useQuery({
    queryKey: ['latest-software-release'],
    enabled,
    staleTime: 1000 * 60 * 30,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('software_releases')
        .select('version, title, storage_path')
        .eq('is_latest', true)
        .eq('platform', 'Windows x64')
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  if (!enabled || dismissed || !latest) return null;
  if (compareVersions(latest.version, APP_VERSION) <= 0) return null;

  const download = async () => {
    const { data, error } = await supabase.storage
      .from('software-releases')
      .createSignedUrl(latest.storage_path, 60 * 30, { download: latest.storage_path });
    if (error || !data?.signedUrl) {
      toast.error('Could not start the download. Please try again.');
      return;
    }
    window.open(data.signedUrl, '_blank');
  };

  return (
    <div className="bg-primary text-primary-foreground px-4 py-2 flex flex-wrap items-center justify-center gap-3 text-sm">
      <span>
        Version {latest.version} is available — you are running {APP_VERSION}.
      </span>
      <Button size="sm" variant="secondary" onClick={download}>
        <Download className="w-4 h-4" />
        Download update
      </Button>
      <button aria-label="Dismiss update notice" onClick={() => setDismissed(true)}>
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
