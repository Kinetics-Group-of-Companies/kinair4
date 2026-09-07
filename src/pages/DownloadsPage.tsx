import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download, Monitor, Smartphone, HardDrive, CheckCircle2, Loader2 } from 'lucide-react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface SoftwareRelease {
  id: string;
  version: string;
  platform: string;
  title: string;
  notes: string | null;
  storage_path: string;
  file_size_bytes: number | null;
  is_latest: boolean;
  published_at: string;
  available?: boolean;
}

function formatSize(bytes: number | null) {
  if (!bytes) return '—';
  const mb = bytes / (1024 * 1024);
  if (mb >= 1024) return `${(mb / 1024).toFixed(2)} GB`;
  return `${mb.toFixed(0)} MB`;
}

const isAndroid = (r: SoftwareRelease) => /android|apk/i.test(r.platform);

export default function DownloadsPage() {
  const [busy, setBusy] = useState<string | null>(null);

  const { data: releases = [], isLoading } = useQuery({
    queryKey: ['software-releases'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('software_releases')
        .select('*')
        .order('published_at', { ascending: false });
      if (error) throw error;

      // Validate each Storage object before presenting an active download.
      // This updates automatically as soon as a missing installer is uploaded.
      return Promise.all(
        ((data || []) as SoftwareRelease[]).map(async (release) => {
          const { data: signed, error: signedError } = await supabase.storage
            .from('software-releases')
            .createSignedUrl(release.storage_path, 60);
          return { ...release, available: !signedError && Boolean(signed?.signedUrl) };
        }),
      );
    },
  });

  const handleDownload = async (release: SoftwareRelease) => {
    setBusy(release.id);
    try {
      const { data, error } = await supabase.storage
        .from('software-releases')
        .createSignedUrl(release.storage_path, 60 * 30, { download: release.storage_path });
      if (error || !data?.signedUrl) throw error || new Error('Download link unavailable');
      window.location.href = data.signedUrl;
    } catch (e) {
      console.error(e);
      toast.error('Could not start the download. Please try again.');
    } finally {
      setBusy(null);
    }
  };

  const windowsReleases = releases.filter((r) => !isAndroid(r));
  const androidReleases = releases.filter(isAndroid);
  const latestWindows = windowsReleases.find((r) => r.is_latest) || windowsReleases[0];
  const latestAndroid = androidReleases.find((r) => r.is_latest) || androidReleases[0];
  const latestIds = [latestWindows?.id, latestAndroid?.id].filter(Boolean);
  const older = releases.filter((r) => !latestIds.includes(r.id));

  const LatestCard = ({
    release,
    icon,
    hint,
  }: {
    release: SoftwareRelease;
    icon: React.ReactNode;
    hint: string;
  }) => (
    <Card className="border-primary/40">
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2 md:gap-3">
          <CardTitle className="text-lg md:text-xl">{release.title}</CardTitle>
          <Badge>{release.version}</Badge>
          <Badge variant="outline">Latest</Badge>
          {release.available === false && <Badge variant="destructive">Temporarily unavailable</Badge>}
        </div>
        <CardDescription>{release.notes}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 md:space-y-5">
        <div className="flex flex-wrap gap-3 md:gap-6 text-sm text-muted-foreground">
          <span className="flex items-center gap-2">{icon}{release.platform}</span>
          <span className="flex items-center gap-2">
            <HardDrive className="w-4 h-4" />{formatSize(release.file_size_bytes)}
          </span>
          <span className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4" />
            Released {new Date(release.published_at).toLocaleDateString()}
          </span>
        </div>
        <Button
          size="lg"
          className="w-full sm:w-auto"
          onClick={() => handleDownload(release)}
          disabled={busy === release.id || release.available === false}
        >
          {busy === release.id ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Download className="w-4 h-4" />
          )}
          Download {release.version}
        </Button>
        <p className="text-xs text-muted-foreground">
          {release.available === false
            ? 'The installer file is being restored. Please check again shortly.'
            : hint}
        </p>
      </CardContent>
    </Card>
  );

  return (
    <MainLayout>
      <div className="container mx-auto px-4 py-8 md:py-12 max-w-5xl">
        <header className="mb-8 md:mb-10">
          <Badge variant="secondary" className="mb-3">Software Downloads</Badge>
          <h1 className="text-2xl md:text-4xl font-bold mb-3">Download Fan Selector Software</h1>
          <p className="text-muted-foreground max-w-2xl text-sm md:text-base">
            Install the offline desktop edition on Windows, or the mobile app on Android. The fan
            catalogue works without an internet connection and syncs with the cloud when online.
          </p>
        </header>

        {isLoading ? (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading releases…
          </div>
        ) : releases.length === 0 ? (
          <p className="text-muted-foreground">No releases published yet.</p>
        ) : (
          <div className="space-y-8">
            <div className="grid gap-5 md:grid-cols-2">
              {latestWindows && (
                <LatestCard
                  release={latestWindows}
                  icon={<Monitor className="w-4 h-4" />}
                  hint="Unzip the folder and run the KINAIR Fan Selector application. Sign in once while online — after that the software works fully offline."
                />
              )}
              {latestAndroid && (
                <LatestCard
                  release={latestAndroid}
                  icon={<Smartphone className="w-4 h-4" />}
                  hint="Open the .apk on your Android phone and allow installs from unknown sources when prompted."
                />
              )}
            </div>

            {older.length > 0 && (
              <section>
                <h2 className="text-lg font-semibold mb-4">Previous versions</h2>
                <div className="space-y-3">
                  {older.map((r) => (
                    <Card key={r.id}>
                      <CardContent className="flex flex-wrap items-center justify-between gap-4 py-4">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{r.title}</span>
                            <Badge variant="outline">{r.version}</Badge>
                          </div>
                          <p className="text-sm text-muted-foreground mt-1">
                            {r.platform} · {formatSize(r.file_size_bytes)} ·{' '}
                            {new Date(r.published_at).toLocaleDateString()}
                          </p>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDownload(r)}
                          disabled={busy === r.id || r.available === false}
                        >
                          {busy === r.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Download className="w-4 h-4" />
                          )}
                          {r.available === false ? 'Unavailable' : 'Download'}
                        </Button>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </div>
    </MainLayout>
  );
}
