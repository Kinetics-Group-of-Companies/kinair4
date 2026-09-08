import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { supabase } from '@/integrations/backend/client';
import { useAuth } from '@/lib/authContext';

type StartResult = { ok: true } | { ok: false; reason: string };

interface GuestTrialContextValue {
  isGuest: boolean;
  trialActive: boolean;
  trialLoading: boolean;
  secondsRemaining: number;
  expiresAt: string | null;
  startTrial: () => Promise<StartResult>;
  endTrialForSignup: () => Promise<void>;
}

const GuestTrialContext = createContext<GuestTrialContextValue | undefined>(undefined);
const EXPIRED_FLAG = 'kinair_guest_trial_expired';

async function functionErrorMessage(error: unknown): Promise<string> {
  const fallback = error instanceof Error ? error.message : 'Unable to start guest trial';
  const context = (error as { context?: Response } | null)?.context;
  if (!context) return fallback;
  try {
    const payload = await context.clone().json();
    return typeof payload?.error === 'string' ? payload.error : fallback;
  } catch {
    return fallback;
  }
}

export function GuestTrialProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const isGuest = Boolean(user?.is_anonymous);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [secondsRemaining, setSecondsRemaining] = useState(0);
  const [trialLoading, setTrialLoading] = useState(false);
  const endingRef = useRef(false);
  const startingRef = useRef(false);

  const clearTrial = useCallback(() => {
    setExpiresAt(null);
    setSecondsRemaining(0);
  }, []);

  const finishExpiredTrial = useCallback(async () => {
    if (endingRef.current) return;
    endingRef.current = true;
    sessionStorage.setItem(EXPIRED_FLAG, '1');
    clearTrial();
    await supabase.auth.signOut({ scope: 'local' }).catch(() => undefined);
    endingRef.current = false;
  }, [clearTrial]);

  const refreshStatus = useCallback(async () => {
    if (startingRef.current) return;
    if (!user?.is_anonymous) {
      clearTrial();
      return;
    }
    setTrialLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('guest-trial', {
        body: { action: 'status' },
      });
      if (error) throw error;
      if (data?.active && data?.expires_at) {
        setExpiresAt(data.expires_at);
        setSecondsRemaining(Math.max(0, Number(data.seconds_remaining) || 0));
      } else {
        await finishExpiredTrial();
      }
    } catch {
      await finishExpiredTrial();
    } finally {
      setTrialLoading(false);
    }
  }, [clearTrial, finishExpiredTrial, user?.id, user?.is_anonymous]);

  useEffect(() => {
    if (!isGuest) {
      clearTrial();
      return;
    }
    void refreshStatus();
  }, [clearTrial, isGuest, refreshStatus]);

  useEffect(() => {
    if (!expiresAt || !isGuest) return;
    const tick = () => {
      const remaining = Math.max(0, Math.ceil((Date.parse(expiresAt) - Date.now()) / 1000));
      setSecondsRemaining(remaining);
      if (remaining === 0) void finishExpiredTrial();
    };
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [expiresAt, finishExpiredTrial, isGuest]);

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

      const { data, error } = await supabase.functions.invoke('guest-trial', {
        body: { action: 'start' },
      });
      if (error) return { ok: false, reason: await functionErrorMessage(error) };
      if (!data?.active || !data?.expires_at) {
        return { ok: false, reason: data?.error || 'Guest access is unavailable. Please sign up.' };
      }

      sessionStorage.removeItem(EXPIRED_FLAG);
      setExpiresAt(data.expires_at);
      setSecondsRemaining(Math.max(0, Number(data.seconds_remaining) || 300));
      return { ok: true };
    } catch (error) {
      return { ok: false, reason: error instanceof Error ? error.message : 'Guest access is unavailable.' };
    } finally {
      startingRef.current = false;
      setTrialLoading(false);
    }
  }, [user]);

  const endTrialForSignup = useCallback(async () => {
    clearTrial();
    await supabase.auth.signOut({ scope: 'local' }).catch(() => undefined);
  }, [clearTrial]);

  const value = useMemo<GuestTrialContextValue>(() => ({
    isGuest,
    trialActive: isGuest && secondsRemaining > 0,
    trialLoading,
    secondsRemaining,
    expiresAt,
    startTrial,
    endTrialForSignup,
  }), [endTrialForSignup, expiresAt, isGuest, secondsRemaining, startTrial, trialLoading]);

  return <GuestTrialContext.Provider value={value}>{children}</GuestTrialContext.Provider>;
}

export function useGuestTrial() {
  const context = useContext(GuestTrialContext);
  if (!context) throw new Error('useGuestTrial must be used within GuestTrialProvider');
  return context;
}
