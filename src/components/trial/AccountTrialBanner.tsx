import { CalendarClock } from 'lucide-react';
import { useAuth } from '@/lib/authContext';

export function AccountTrialBanner() {
  const { isAccountTrialActive, subscriptionEnd } = useAuth();
  if (!isAccountTrialActive || !subscriptionEnd) return null;

  const endDate = new Intl.DateTimeFormat('en-AE', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(subscriptionEnd);

  return (
    <div className="border-b border-blue-200 bg-blue-50 text-blue-950">
      <div className="container mx-auto flex items-center gap-2 px-4 py-2 text-sm font-medium" role="status">
        <CalendarClock className="h-4 w-4" />
        Account trial active until {endDate}. Your approval request remains pending.
      </div>
    </div>
  );
}
