import { useCallback, useEffect, useState } from 'react';
import { Clock3, Loader2, Save } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/backend/client';
import { useAuth } from '@/lib/authContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const MIN_TRIAL_MINUTES = 1;
const MAX_TRIAL_MINUTES = 60;

export function GuestTrialSettingsEditor() {
  const { user } = useAuth();
  const [minutes, setMinutes] = useState(5);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const loadSetting = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('guest_trial_settings')
      .select('duration_minutes')
      .eq('id', true)
      .single();

    if (error) {
      toast.error('Could not load guest trial settings');
    } else {
      setMinutes(data.duration_minutes);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadSetting();
  }, [loadSetting]);

  const save = async () => {
    if (!Number.isInteger(minutes) || minutes < MIN_TRIAL_MINUTES || minutes > MAX_TRIAL_MINUTES) {
      toast.error('Trial time must be a whole number from 1 to 60 minutes');
      return;
    }

    setSaving(true);
    const { data, error } = await supabase
      .from('guest_trial_settings')
      .update({
        duration_minutes: minutes,
        updated_at: new Date().toISOString(),
        updated_by: user?.id ?? null,
      })
      .eq('id', true)
      .select('duration_minutes')
      .single();

    if (error) {
      toast.error(error.message || 'Could not save guest trial time');
    } else {
      setMinutes(data.duration_minutes);
      toast.success(`Guest trial changed to ${data.duration_minutes} minute${data.duration_minutes === 1 ? '' : 's'}`);
    }
    setSaving(false);
  };

  return (
    <Card className="max-w-xl">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Clock3 className="h-5 w-5 text-primary" />
          <CardTitle>Guest Trial Access</CardTitle>
        </div>
        <CardDescription>
          Set the daily guest access time for the Fan Selector, Air Curtain Selector, and AI Assistant.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="guest-trial-minutes">Trial time (minutes)</Label>
          <Input
            id="guest-trial-minutes"
            type="number"
            inputMode="numeric"
            min={MIN_TRIAL_MINUTES}
            max={MAX_TRIAL_MINUTES}
            step={1}
            value={minutes}
            disabled={loading || saving}
            onChange={(event) => setMinutes(Number(event.target.value))}
          />
          <p className="text-xs text-muted-foreground">
            Allowed range: 1–60 minutes. Changes apply to new trials; active trials keep their current expiry.
          </p>
        </div>
        <Button onClick={save} disabled={loading || saving}>
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          Save Trial Time
        </Button>
      </CardContent>
    </Card>
  );
}
