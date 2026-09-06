import { useEffect, useState } from 'react';
import { Cloud, CloudOff, RefreshCw, CheckCircle2, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { isOfflineMode } from '@/lib/offline/mode';
import { getCloudClient } from '@/lib/offline/cloudLink';
import {
  clearSyncCredentials,
  getSyncStatus,
  hasSyncCredentials,
  onSyncStatus,
  saveSyncCredentials,
  syncNow,
  type SyncStatus,
} from '@/lib/offline/sync';
import { clearOutbox, onOutboxChange } from '@/lib/offline/outbox';

function formatTime(value: string | null) {
  if (!value) return 'never';
  return new Date(value).toLocaleString();
}

export function OfflineSyncBar() {
  const [status, setStatus] = useState<SyncStatus>(getSyncStatus());
  const [pending, setPending] = useState(0);
  const [hasCreds, setHasCreds] = useState(false);
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  useEffect(() => {
    if (!isOfflineMode) return;
    const offStatus = onSyncStatus(setStatus);
    const offOutbox = onOutboxChange(setPending);
    void hasSyncCredentials().then(setHasCreds);
    return () => {
      offStatus();
      offOutbox();
    };
  }, []);

  if (!isOfflineMode) return null;

  const syncing = status.state === 'syncing';
  const offline = status.state === 'offline';

  const handleSaveCredentials = async () => {
    if (!email || !password) {
      toast.error('Enter the email and password you use online');
      return;
    }
    // Sign in once to establish a cloud session (kept as a refresh token by the
    // Supabase client). The password itself is never persisted.
    const client = getCloudClient();
    if (!client) {
      toast.error('Cloud connection is not configured');
      return;
    }
    const { error } = await client.auth.signInWithPassword({ email, password });
    if (error) {
      toast.error(error.message || 'Sign-in failed');
      return;
    }
    await saveSyncCredentials(email);
    setHasCreds(true);
    setOpen(false);
    setPassword('');
    toast.success('Cloud sync account connected');
    void syncNow();
  };

  const handleDisconnect = async () => {
    await clearSyncCredentials();
    setHasCreds(false);
    setOpen(false);
    toast.success('Cloud sync disconnected — the app stays fully offline');
  };

  return (
    <div className="w-full border-b bg-muted/40">
      <div className="container mx-auto flex flex-wrap items-center gap-3 px-4 py-1.5 text-xs">
        <span className="flex items-center gap-1.5 font-medium">
          {offline ? (
            <CloudOff className="h-3.5 w-3.5 text-muted-foreground" />
          ) : status.state === 'error' ? (
            <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
          ) : (
            <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
          )}
          Offline desktop mode
        </span>

        <span className="text-muted-foreground">Last sync: {formatTime(status.lastSyncedAt)}</span>

        {pending > 0 && (
          <span className="flex items-center gap-1.5">
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-primary">
              {pending} change{pending === 1 ? '' : 's'} waiting to upload
            </span>
            <Button
              size="sm"
              variant="ghost"
              className="h-6 px-1.5 text-muted-foreground"
              onClick={async () => {
                await clearOutbox();
                toast.success('Queued changes discarded');
              }}
            >
              Discard
            </Button>
          </span>
        )}

        {status.message && <span className="text-muted-foreground">{status.message}</span>}

        <div className="ml-auto flex items-center gap-2">
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2"
            disabled={syncing}
            onClick={() => void syncNow()}
          >
            <RefreshCw className={`mr-1 h-3.5 w-3.5 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? 'Syncing…' : 'Sync now'}
          </Button>

          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm" variant="ghost" className="h-7 px-2">
                <Cloud className="mr-1 h-3.5 w-3.5" />
                {hasCreds ? 'Sync account' : 'Connect sync'}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Cloud sync account</DialogTitle>
                <DialogDescription>
                  Optional. Sign in with your online account so this computer can upload its changes and
                  download the latest fan data whenever it has internet. The app keeps working without it.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="sync-email">Email</Label>
                  <Input
                    id="sync-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="username"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="sync-password">Password</Label>
                  <Input
                    id="sync-password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                  />
                </div>
              </div>
              <DialogFooter className="gap-2 sm:gap-2">
                {hasCreds && (
                  <Button variant="outline" onClick={handleDisconnect}>
                    Disconnect
                  </Button>
                )}
                <Button onClick={handleSaveCredentials}>Save &amp; sync</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>
    </div>
  );
}
