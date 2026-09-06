import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { isOfflineMode } from '@/lib/offline/mode';
import { getSyncStatus, onSyncStatus, syncNow, type SyncStatus } from '@/lib/offline/sync';

interface SyncNowButtonProps {
  variant?: 'kinair-outline' | 'ghost' | 'outline';
  size?: 'sm' | 'default';
  className?: string;
  showLabel?: boolean;
}

/**
 * Manual "sync offline data with the cloud" control for the desktop build.
 * Renders nothing on the web app.
 */
export function SyncNowButton({
  variant = 'kinair-outline',
  size = 'sm',
  className,
  showLabel = true,
}: SyncNowButtonProps) {
  const [status, setStatus] = useState<SyncStatus>(getSyncStatus());
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!isOfflineMode) return;
    return onSyncStatus(setStatus);
  }, []);

  if (!isOfflineMode) return null;

  const syncing = status.state === 'syncing';

  const handleSync = async () => {
    const toastId = toast.loading('Syncing with cloud…');
    const result = await syncNow();
    if (result.state === 'error') {
      toast.error(result.message || 'Sync failed', { id: toastId });
    } else if (result.state === 'offline') {
      toast.error(result.message || 'No internet connection', { id: toastId });
    } else {
      await queryClient.invalidateQueries();
      toast.success('Offline data is up to date with the cloud', { id: toastId });
    }
  };

  return (
    <Button
      variant={variant}
      size={size}
      className={className}
      disabled={syncing}
      onClick={() => void handleSync()}
      title={status.lastSyncedAt ? `Last sync: ${new Date(status.lastSyncedAt).toLocaleString()}` : 'Never synced'}
    >
      <RefreshCw className={`w-4 h-4 ${showLabel ? 'mr-1.5' : ''} ${syncing ? 'animate-spin' : ''}`} />
      {showLabel && (syncing ? 'Syncing…' : 'Sync')}
    </Button>
  );
}
