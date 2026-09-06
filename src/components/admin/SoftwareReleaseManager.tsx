import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Upload, Trash2, Star, Package } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
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
}

function formatSize(bytes: number | null) {
  if (!bytes) return '—';
  const mb = bytes / (1024 * 1024);
  return mb >= 1024 ? `${(mb / 1024).toFixed(2)} GB` : `${mb.toFixed(0)} MB`;
}

export function SoftwareReleaseManager() {
  const queryClient = useQueryClient();
  const [version, setVersion] = useState('');
  const [platform, setPlatform] = useState<'Windows x64' | 'Android APK'>('Windows x64');
  const [title, setTitle] = useState('KINAIR Fan Selector — Desktop');
  const [notes, setNotes] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState<string | null>(null);

  const { data: releases = [], isLoading } = useQuery({
    queryKey: ['software-releases'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('software_releases')
        .select('*')
        .order('published_at', { ascending: false });
      if (error) throw error;
      return (data || []) as SoftwareRelease[];
    },
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['software-releases'] });

  const publish = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error('Choose the installer file first');
      if (!version.trim()) throw new Error('Enter a version number');

      const safeVersion = version.trim().replace(/[^\w.\-]/g, '');
      const isAndroid = platform === 'Android APK';
      const folder = isAndroid ? 'android' : 'windows';
      const ext = isAndroid ? 'apk' : 'zip';
      const storagePath = `${folder}/KINAIR-Fan-Selector-${safeVersion}.${ext}`;

      setProgress('Uploading installer…');
      const { error: uploadError } = await supabase.storage
        .from('software-releases')
        .upload(storagePath, file, {
          upsert: true,
          contentType:
            file.type || (isAndroid ? 'application/vnd.android.package-archive' : 'application/zip'),
        });
      if (uploadError) throw uploadError;

      setProgress('Publishing release…');
      // Any previously latest release for this platform becomes an older version
      const { error: demoteError } = await supabase
        .from('software_releases')
        .update({ is_latest: false })
        .eq('is_latest', true)
        .eq('platform', platform);
      if (demoteError) throw demoteError;

      const { error: insertError } = await supabase.from('software_releases').insert({
        version: version.trim(),
        platform,
        title:
          title.trim() ||
          (isAndroid ? 'KINAIR Fan Selector — Android' : 'KINAIR Fan Selector — Desktop'),
        notes: notes.trim() || null,
        storage_path: storagePath,
        file_size_bytes: file.size,
        is_latest: true,
        published_at: new Date().toISOString(),
      });
      if (insertError) throw insertError;
    },
    onSuccess: () => {
      toast.success('New version published to the Downloads page');
      setFile(null);
      setVersion('');
      setNotes('');
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message || 'Could not publish the release'),
    onSettled: () => setProgress(null),
  });

  const makeLatest = useMutation({
    mutationFn: async (id: string) => {
      await supabase.from('software_releases').update({ is_latest: false }).eq('is_latest', true);
      const { error } = await supabase.from('software_releases').update({ is_latest: true }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Marked as the latest version');
      invalidate();
    },
    onError: () => toast.error('Could not update the release'),
  });

  const removeRelease = useMutation({
    mutationFn: async (release: SoftwareRelease) => {
      await supabase.storage.from('software-releases').remove([release.storage_path]);
      const { error } = await supabase.from('software_releases').delete().eq('id', release.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Release removed');
      invalidate();
    },
    onError: () => toast.error('Could not remove the release'),
  });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="w-5 h-5 text-primary" />
            Publish New Software Version
          </CardTitle>
          <CardDescription>
            Upload a packaged desktop build. It appears on the Downloads page immediately as the
            latest version, and installed copies show an update notice.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="release-version">Version</Label>
              <Input
                id="release-version"
                placeholder="v12"
                value={version}
                onChange={(e) => setVersion(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="release-title">Title</Label>
              <Input id="release-title" value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Platform</Label>
            <div className="flex flex-wrap gap-2">
              {(['Windows x64', 'Android APK'] as const).map((p) => (
                <Button
                  key={p}
                  type="button"
                  variant={platform === p ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => {
                    setPlatform(p);
                    setTitle(
                      p === 'Android APK'
                        ? 'KINAIR Fan Selector — Android'
                        : 'KINAIR Fan Selector — Desktop',
                    );
                    setFile(null);
                  }}
                >
                  {p === 'Android APK' ? 'Android (.apk)' : 'Windows (.zip)'}
                </Button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="release-notes">Release notes</Label>
            <Textarea
              id="release-notes"
              rows={3}
              placeholder="What changed in this version"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="release-file">
              {platform === 'Android APK' ? 'Android app file (.apk)' : 'Installer file (.zip)'}
            </Label>
            <Input
              id="release-file"
              key={platform}
              type="file"
              accept={platform === 'Android APK' ? '.apk' : '.zip,.exe,application/zip'}
              onChange={(e) => setFile(e.target.files?.[0] || null)}
            />
            {file && (
              <p className="text-xs text-muted-foreground">
                {file.name} · {formatSize(file.size)}
              </p>
            )}
          </div>

          <Button onClick={() => publish.mutate()} disabled={publish.isPending}>
            {publish.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Upload className="w-4 h-4" />
            )}
            {progress || 'Publish version'}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Published Releases</CardTitle>
          <CardDescription>Shown on the public Downloads page.</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading…
            </div>
          ) : releases.length === 0 ? (
            <p className="text-muted-foreground text-sm">No releases published yet.</p>
          ) : (
            <div className="space-y-3">
              {releases.map((r) => (
                <div
                  key={r.id}
                  className="flex flex-wrap items-center justify-between gap-3 border border-border rounded-lg p-3"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{r.title}</span>
                      <Badge variant="outline">{r.version}</Badge>
                      {r.is_latest && <Badge>Latest</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {r.platform} · {formatSize(r.file_size_bytes)} ·{' '}
                      {new Date(r.published_at).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {!r.is_latest && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => makeLatest.mutate(r.id)}
                        disabled={makeLatest.isPending}
                      >
                        <Star className="w-4 h-4" />
                        Mark latest
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeRelease.mutate(r)}
                      disabled={removeRelease.isPending}
                    >
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
