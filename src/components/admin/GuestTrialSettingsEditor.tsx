import { useCallback, useEffect, useState } from 'react';
import { Clock3, Loader2, Save } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/backend/client';
import { useAuth } from '@/lib/authContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const MIN_GUEST_MINUTES = 1;
const MAX_GUEST_MINUTES = 60;
const MIN_ACCOUNT_DAYS = 1;
const MAX_ACCOUNT_DAYS = 30;

export function GuestTrialSettingsEditor() {
  const { user } = useAuth();
  const [guestMinutes, setGuestMinutes] = useState(5);
  const [accountDays, setAccountDays] = useState(7);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const loadSetting = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('guest_trial_settings')
      .select('duration_minutes, account_trial_days')
      .eq('id', true)
      .single();

    if (error) {
      toast.error('Could not load trial settings');
    } else {
      setGuestMinutes(data.duration_minutes);
      setAccountDays(data.account_trial_days);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadSetting();
  }, [loadSetting]);

  const save = async () => {
    if (
      !Number.isInteger(guestMinutes)
      || guestMinutes < MIN_GUEST_MINUTES
      || guestMinutes > MAX_GUEST_MINUTES
    ) {
      toast.error('Guest trial must be a whole number from 1 to 60 minutes');
      return;
    }
    if (
      !Number.isInteger(accountDays)
      || accountDays < MIN_ACCOUNT_DAYS
      || accountDays > MAX_ACCOUNT_DAYS
    ) {
      toast.error('Account trial must be a whole number from 1 to 30 days');
      return;
    }

    setSaving(true);
    const { data, error } = await supabase
      .from('guest_trial_settings')
      .update({
        duration_minutes: guestMinutes,
        account_trial_days: accountDays,
        updated_at: new Date().toISOString(),
        updated_by: user?.id ?? null,
      })
      .eq('id', true)
      .select('duration_minutes, account_trial_days')
      .single();

    if (error) {
      toast.error(error.message || 'Could not save trial settings');
    } else {
      setGuestMinutes(data.duration_minutes);
      setAccountDays(data.account_trial_days);
      toast.success(
        `Trial settings saved: ${data.duration_minutes} minute guest access and ${data.account_trial_days} day account trial`,
      );
    }
    setSaving(false);
  };

  return (
    <Card className="max-w-xl">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Clock3 className="h-5 w-5 text-primary" />
          <CardTitle>Trial Access</CardTitle>
        </div>
        <CardDescription>
          Control anonymous daily access and the signed-up account trial period.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
          <Label htmlFor="guest-trial-minutes">Daily guest trial (minutes)</Label>
          <Input
            id="guest-trial-minutes"
            type="number"
            inputMode="numeric"
            min={MIN_GUEST_MINUTES}
            max={MAX_GUEST_MINUTES}
            step={1}
            value={guestMinutes}
            disabled={loading || saving}
            onChange={(event) => setGuestMinutes(Number(event.target.value))}
          />
          <p className="text-xs text-muted-foreground">
            One anonymous trial per public IP each UAE day. Allowed range: 1–60 minutes.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="account-trial-days">Signed-up account trial (days)</Label>
          <Input
            id="account-trial-days"
            type="number"
            inputMode="numeric"
            min={MIN_ACCOUNT_DAYS}
            max={MAX_ACCOUNT_DAYS}
            step={1}
            value={accountDays}
            disabled={loading || saving}
            onChange={(event) => setAccountDays(Number(event.target.value))}
          />
          <p className="text-xs text-muted-foreground">
            Applies to new accounts awaiting approval. Allowed range: 1–30 days. Active account trials keep their current expiry.
          </p>
        </div>

        <Button onClick={save} disabled={loading || saving}>
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          Save Trial Settings
        </Button>
      </CardContent>
    </Card>
  );
}
