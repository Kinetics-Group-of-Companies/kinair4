import { useEffect, useState } from 'react';
import { CalendarClock, MailPlus, Trash2 } from 'lucide-react';
import { supabase } from '@/integrations/backend/client';
import { useAuth } from '@/lib/authContext';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

type Recipient = {
  id: string;
  email: string;
  display_name: string | null;
  tenant_id: string | null;
  all_tenants: boolean;
  is_enabled: boolean;
};

type EmailSchedule = {
  enabled: boolean;
  frequency: 'daily' | 'weekly';
  weekday: number;
  send_time: string;
  timezone: string;
  cron_expression: string;
};

const WEEKDAYS = [
  { value: '1', label: 'Monday' },
  { value: '2', label: 'Tuesday' },
  { value: '3', label: 'Wednesday' },
  { value: '4', label: 'Thursday' },
  { value: '5', label: 'Friday' },
  { value: '6', label: 'Saturday' },
  { value: '0', label: 'Sunday' },
];

const TIMEZONES = [
  'Asia/Dubai',
  'Asia/Kolkata',
  'Europe/London',
  'UTC',
];

export function LpoEmailRecipientScheduleManager() {
  const { isSuperAdmin, tenantId } = useAuth();
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [schedule, setSchedule] = useState<EmailSchedule | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [scope, setScope] = useState<'tenant' | 'all'>('tenant');
  const [loading, setLoading] = useState(true);
  const [savingRecipient, setSavingRecipient] = useState(false);
  const [savingSchedule, setSavingSchedule] = useState(false);

  const fetchSettings = async () => {
    setLoading(true);
    try {
      const [recipientResult, scheduleResult] = await Promise.all([
        supabase
          .from('lpo_email_recipients')
          .select('id,email,display_name,tenant_id,all_tenants,is_enabled')
          .order('email'),
        supabase
          .from('lpo_email_schedule')
          .select('enabled,frequency,weekday,send_time,timezone,cron_expression')
          .eq('id', 1)
          .maybeSingle(),
      ]);

      if (recipientResult.error) throw recipientResult.error;
      if (scheduleResult.error) throw scheduleResult.error;

      setRecipients((recipientResult.data ?? []) as Recipient[]);
      if (scheduleResult.data) {
        setSchedule({
          ...scheduleResult.data,
          frequency: scheduleResult.data.frequency as 'daily' | 'weekly',
          send_time: scheduleResult.data.send_time.slice(0, 5),
        });
      }
    } catch (error) {
      console.error('Unable to load LPO email settings:', error);
      toast.error('Unable to load LPO email settings');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchSettings();
  }, []);

  const addRecipient = async () => {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail || !normalizedEmail.includes('@')) {
      toast.error('Enter a valid delivery email');
      return;
    }
    const allTenants = isSuperAdmin && scope === 'all';
    if (!allTenants && !tenantId) {
      toast.error('Your account has no tenant assigned');
      return;
    }

    setSavingRecipient(true);
    try {
      const { error } = await supabase.from('lpo_email_recipients').insert({
        email: normalizedEmail,
        display_name: name.trim() || null,
        all_tenants: allTenants,
        tenant_id: allTenants ? null : tenantId,
        is_enabled: true,
      });
      if (error) throw error;

      setName('');
      setEmail('');
      toast.success('Delivery email added');
      await fetchSettings();
    } catch (error) {
      console.error('Unable to add delivery email:', error);
      toast.error('Unable to add email. It may already exist.');
    } finally {
      setSavingRecipient(false);
    }
  };

  const updateRecipient = async (recipient: Recipient, changes: Partial<Recipient>) => {
    try {
      const { error } = await supabase
        .from('lpo_email_recipients')
        .update({ ...changes, updated_at: new Date().toISOString() })
        .eq('id', recipient.id);
      if (error) throw error;
      setRecipients(current => current.map(item => (
        item.id === recipient.id ? { ...item, ...changes } : item
      )));
      toast.success('Recipient updated');
    } catch (error) {
      console.error('Unable to update recipient:', error);
      toast.error('Unable to update recipient');
      await fetchSettings();
    }
  };

  const deleteRecipient = async (recipient: Recipient) => {
    try {
      const { error } = await supabase
        .from('lpo_email_recipients')
        .delete()
        .eq('id', recipient.id);
      if (error) throw error;
      setRecipients(current => current.filter(item => item.id !== recipient.id));
      toast.success('Delivery email removed');
    } catch (error) {
      console.error('Unable to remove recipient:', error);
      toast.error('Unable to remove recipient');
    }
  };

  const saveSchedule = async () => {
    if (!schedule) return;
    setSavingSchedule(true);
    try {
      const { data, error } = await supabase.rpc('update_lpo_email_schedule', {
        p_enabled: schedule.enabled,
        p_frequency: schedule.frequency,
        p_weekday: schedule.weekday,
        p_send_time: schedule.send_time,
        p_timezone: schedule.timezone,
      });
      if (error) throw error;
      if (data) {
        const saved = data as EmailSchedule;
        setSchedule({ ...saved, send_time: saved.send_time.slice(0, 5) });
      }
      toast.success('Email schedule updated');
    } catch (error) {
      console.error('Unable to save email schedule:', error);
      toast.error('Unable to save email schedule');
    } finally {
      setSavingSchedule(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          Loading LPO email settings…
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MailPlus className="h-5 w-5 text-primary" />
            Delivery Email Recipients
          </CardTitle>
          <CardDescription>
            Add email addresses that should receive the scheduled LPO summary. These recipients do not need a portal login.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-3 md:grid-cols-[1fr_1.4fr_180px_auto] md:items-end">
            <div className="space-y-1.5">
              <Label htmlFor="lpo-recipient-name">Name</Label>
              <Input
                id="lpo-recipient-name"
                value={name}
                onChange={event => setName(event.target.value)}
                placeholder="Recipient name"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lpo-recipient-email">Email</Label>
              <Input
                id="lpo-recipient-email"
                type="email"
                value={email}
                onChange={event => setEmail(event.target.value)}
                placeholder="name@company.com"
              />
            </div>
            {isSuperAdmin ? (
              <div className="space-y-1.5">
                <Label>Report scope</Label>
                <Select value={scope} onValueChange={(value: 'tenant' | 'all') => setScope(value)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="tenant">My tenant only</SelectItem>
                    <SelectItem value="all">All tenants</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            ) : <div />}
            <Button onClick={() => void addRecipient()} disabled={savingRecipient}>
              <MailPlus className="h-4 w-4" />
              Add email
            </Button>
          </div>

          {recipients.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">No delivery emails configured</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Recipient</TableHead>
                  <TableHead>Scope</TableHead>
                  <TableHead className="text-center">Enabled</TableHead>
                  <TableHead className="text-right">Remove</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recipients.map(recipient => (
                  <TableRow key={recipient.id}>
                    <TableCell>
                      <div className="font-medium">{recipient.display_name || recipient.email}</div>
                      <div className="text-xs text-muted-foreground">{recipient.email}</div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{recipient.all_tenants ? 'All tenants' : 'Own tenant'}</Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      <Switch
                        checked={recipient.is_enabled}
                        aria-label={`Enable scheduled email for ${recipient.email}`}
                        onCheckedChange={checked => void updateRecipient(recipient, { is_enabled: checked })}
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={`Remove ${recipient.email}`}
                        onClick={() => void deleteRecipient(recipient)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarClock className="h-5 w-5 text-primary" />
            Scheduled LPO Email
          </CardTitle>
          <CardDescription>
            Choose when the LPO summary is sent. Times are converted to UTC automatically for Supabase Cron.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {schedule ? (
            <div className="grid gap-4 md:grid-cols-[130px_150px_160px_150px_180px_auto] md:items-end">
              <div className="space-y-1.5">
                <Label>Enabled</Label>
                <div className="flex h-10 items-center">
                  <Switch
                    checked={schedule.enabled}
                    aria-label="Enable scheduled LPO email"
                    onCheckedChange={enabled => setSchedule(current => current ? { ...current, enabled } : current)}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Frequency</Label>
                <Select
                  value={schedule.frequency}
                  onValueChange={(frequency: 'daily' | 'weekly') => setSchedule(current => current ? { ...current, frequency } : current)}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="daily">Daily</SelectItem>
                    <SelectItem value="weekly">Weekly</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {schedule.frequency === 'weekly' ? (
                <div className="space-y-1.5">
                  <Label>Day</Label>
                  <Select
                    value={String(schedule.weekday)}
                    onValueChange={weekday => setSchedule(current => current ? { ...current, weekday: Number(weekday) } : current)}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {WEEKDAYS.map(day => <SelectItem key={day.value} value={day.value}>{day.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              ) : <div />}
              <div className="space-y-1.5">
                <Label htmlFor="lpo-send-time">Time</Label>
                <Input
                  id="lpo-send-time"
                  type="time"
                  value={schedule.send_time}
                  onChange={event => setSchedule(current => current ? { ...current, send_time: event.target.value } : current)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Timezone</Label>
                <Select
                  value={schedule.timezone}
                  onValueChange={timezone => setSchedule(current => current ? { ...current, timezone } : current)}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TIMEZONES.map(timezone => <SelectItem key={timezone} value={timezone}>{timezone}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={() => void saveSchedule()} disabled={savingSchedule}>
                Save schedule
              </Button>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Schedule configuration is unavailable.</p>
          )}
        </CardContent>
      </Card>
    </>
  );
}
