import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { supabase } from '@/integrations/backend/client';
import { useAuth } from '@/lib/authContext';

type StartResult = { ok: true } | { ok: false; reason: string };

interface GuestTrialContextValue {
  isGuest: boolean;
  trialActive: boolean;
  trialLoading: boolean;
  dailyLimitApplies: boolean;
  dailyLimitExpired: boolean;
  secondsRemaining: number;
  expiresAt: string | null;
  trialMinutes: number;
  startTrial: () => Promise<StartResult>;
  endTrialForSignup: () => Promise<void>;
}

const GuestTrialContext = createContext<GuestTrialContextValue | undefined>(undefined);
const EXPIRED_FLAG = 'kinair_guest_trial_expired';

export function currentGuestTrialDay(date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Dubai', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? '';
  return `${value('year')}-${value('month')}-${value('day')}`;
}

export function wasGuestTrialUsedToday(): boolean {
  return sessionStorage.getItem(EXPIRED_FLAG) === currentGuestTrialDay();
}

async function functionErrorMessage(error: unknown): Promise<string> {
  const fallback = error instanceof Error ? error.message : 'Unable to start trial';
  const response = (error as { context?: Response } | null)?.context;
  if (!response) return fallback;
  try {
    const payload = await response.clone().json();
    return typeof payload?.error === 'string' ? payload.error : fallback;
  } catch { return fallback; }
}

export function GuestTrialProvider({ children }: { children: ReactNode }) {
  const { user, isApproved, isSuperAdmin, isAccountTrialActive, subscriptionEnd } = useAuth();
  const isGuest = Boolean(user?.is_anonymous);
  const registeredDailyTrial = Boolean(
    user && !user.is_anonymous && !isApproved && !isSuperAdmin
    && isAccountTrialActive && subscriptionEnd && subscriptionEnd.getTime() > Date.now()
  );
  const dailyLimitApplies = isGuest || registeredDailyTrial;
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [secondsRemaining, setSecondsRemaining] = useState(0);
  const [trialLoading, setTrialLoading] = useState(false);
  const [trialMinutes, setTrialMinutes] = useState(5);
  const [checkedDay, setCheckedDay] = useState('');
  const endingRef = useRef(false);
  const startingRef = useRef(false);

  const clearTrial = useCallback(() => {
    setExpiresAt(null);
    setSecondsRemaining(0);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void supabase.from('guest_trial_settings').select('duration_minutes').eq('id', true).single()
      .then(({ data }) => {
        if (!cancelled && data?.duration_minutes) setTrialMinutes(data.duration_minutes);
      });
    return () => { cancelled = true; };
  }, []);

  const finishExpiredTrial = useCallback(async () => {
    if (endingRef.current) return;
    endingRef.current = true;
    clearTrial();
    if (user?.is_anonymous) {
      sessionStorage.setItem(EXPIRED_FLAG, currentGuestTrialDay());
      await supabase.auth.signOut({ scope: 'local' }).catch(() => undefined);
    }
    endingRef.current = false;
  }, [clearTrial, user?.is_anonymous]);

  const refreshStatus = useCallback(async () => {
    if (startingRef.current || !dailyLimitApplies) {
      if (!dailyLimitApplies) clearTrial();
      return;
    }
    setTrialLoading(true);
    setCheckedDay(currentGuestTrialDay());
    try {
      const { data, error } = await supabase.functions.invoke('guest-trial', {
        body: { action: isGuest ? 'status' : 'start' },
      });
      if (error) throw error;
      if (data?.active && data?.expires_at) {
        setExpiresAt(data.expires_at);
        setSecondsRemaining(Math.max(0, Number(data.seconds_remaining) || 0));
        if (data.duration_minutes) setTrialMinutes(Number(data.duration_minutes));
      } else {
        await finishExpiredTrial();
      }
    } catch {
      await finishExpiredTrial();
    } finally {
      setTrialLoading(false);
    }
  }, [clearTrial, dailyLimitApplies, finishExpiredTrial, isGuest]);

  useEffect(() => {
    if (!dailyLimitApplies) { clearTrial(); return; }
    void refreshStatus();
  }, [clearTrial, dailyLimitApplies, refreshStatus, user?.id]);

  useEffect(() => {
    if (!expiresAt || !dailyLimitApplies) return;
    const tick = () => {
      const remaining = Math.max(0, Math.ceil((Date.parse(expiresAt) - Date.now()) / 1000));
      setSecondsRemaining(remaining);
      if (remaining === 0) void finishExpiredTrial();
    };
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [dailyLimitApplies, expiresAt, finishExpiredTrial]);

  useEffect(() => {
    if (!dailyLimitApplies || secondsRemaining > 0) return;
    const timer = window.setInterval(() => {
      if (checkedDay && checkedDay !== currentGuestTrialDay()) void refreshStatus();
    }, 30000);
    return () => window.clearInterval(timer);
  }, [checkedDay, dailyLimitApplies, refreshStatus, secondsRemaining]);

  const startTrial = useCallback(async (): Promise<StartResult> => {
    startingRef.current = true;
    setTrialLoading(true);
    try {
      let activeUser = user;
      if (!activeUser?.is_anonymous) {
        if (activeUser) return { ok: false, reason: 'You are already signed in.' };
        const { data: signInData, error: signInError } = await supabase.auth.signInAnonymously();
        if (signInError || !signInData.user) {
          return { ok: false, reason: signInError?.message || 'Guest access is unavailable. Please sign up.' };
        }
        activeUser = signInData.user;
      }
      const { data, error } = await supabase.functions.invoke('guest-trial', { body: { action: 'start' } });
      if (error) return { ok: false, reason: await functionErrorMessage(error) };
      if (!data?.active || !data?.expires_at) {
        return { ok: false, reason: data?.error || 'Guest access is unavailable. Please sign up.' };
      }
      sessionStorage.removeItem(EXPIRED_FLAG);
      setExpiresAt(data.expires_at);
      setCheckedDay(currentGuestTrialDay());
      if (data.duration_minutes) setTrialMinutes(Number(data.duration_minutes));
      setSecondsRemaining(Math.max(0, Number(data.seconds_remaining) || trialMinutes * 60));
      return { ok: true };
    } catch (error) {
      return { ok: false, reason: error instanceof Error ? error.message : 'Guest access is unavailable.' };
    } finally {
      startingRef.current = false;
      setTrialLoading(false);
    }
  }, [trialMinutes, user]);

  const endTrialForSignup = useCallback(async () => {
    clearTrial();
    await supabase.auth.signOut({ scope: 'local' }).catch(() => undefined);
  }, [clearTrial]);

  const value = useMemo<GuestTrialContextValue>(() => ({
    isGuest,
    trialActive: dailyLimitApplies && secondsRemaining > 0,
    trialLoading,
    dailyLimitApplies,
    dailyLimitExpired: dailyLimitApplies && !trialLoading && secondsRemaining === 0,
    secondsRemaining,
    expiresAt,
    trialMinutes,
    startTrial,
    endTrialForSignup,
  }), [dailyLimitApplies, endTrialForSignup, expiresAt, isGuest, secondsRemaining, startTrial, trialLoading, trialMinutes]);

  return <GuestTrialContext.Provider value={value}>{children}</GuestTrialContext.Provider>;
}

export function useGuestTrial() {
  const context = useContext(GuestTrialContext);
  if (!context) throw new Error('useGuestTrial must be used within GuestTrialProvider');
  return context;
}
