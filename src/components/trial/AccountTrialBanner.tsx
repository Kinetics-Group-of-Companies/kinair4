import { CalendarClock, Clock3 } from 'lucide-react';
import { useAuth } from '@/lib/authContext';
import { useGuestTrial } from '@/lib/guestTrialContext';

export function AccountTrialBanner() {
  const { isAccountTrialActive, subscriptionEnd } = useAuth();
  const { dailyLimitApplies, secondsRemaining, trialMinutes } = useGuestTrial();
  if (!isAccountTrialActive || !subscriptionEnd || !dailyLimitApplies) return null;

  const total = Math.max(0, subscriptionEnd.getTime() - Date.now());
  const days = Math.ceil(total / 86400000);
  const minutes = Math.floor(secondsRemaining / 60);
  const seconds = String(secondsRemaining % 60).padStart(2, '0');

  return (
    <div className="border-b border-blue-200 bg-blue-50 text-blue-950">
      <div className="container mx-auto flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2 text-sm font-medium" role="status" aria-live="polite">
        <span className="flex items-center gap-2">
          <CalendarClock className="h-4 w-4" />
          Account trial: {days} day{days === 1 ? '' : 's'} remaining
        </span>
        <span className="flex items-center gap-2">
          <Clock3 className="h-4 w-4" />
          Daily use: {minutes}:{seconds} remaining ({trialMinutes} minutes/day)
        </span>
      </div>
    </div>
  );
}
