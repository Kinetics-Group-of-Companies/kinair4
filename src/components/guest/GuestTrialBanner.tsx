import { Clock3, UserPlus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useGuestTrial } from '@/lib/guestTrialContext';

export function GuestTrialBanner() {
  const navigate = useNavigate();
  const { isGuest, trialActive, secondsRemaining, endTrialForSignup } = useGuestTrial();
  if (!isGuest || !trialActive) return null;

  const minutes = Math.floor(secondsRemaining / 60);
  const seconds = String(secondsRemaining % 60).padStart(2, '0');

  const signUp = async () => {
    await endTrialForSignup();
    navigate('/login?tab=signup&reason=guest');
  };

  return (
    <div className="sticky top-0 z-30 border-b border-amber-300 bg-amber-50 text-amber-950">
      <div className="container mx-auto px-4 py-2 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-medium" role="status" aria-live="polite">
          <Clock3 className="w-4 h-4" />
          Guest trial: {minutes}:{seconds} remaining
        </div>
        <Button size="sm" onClick={signUp}>
          <UserPlus className="w-4 h-4 mr-2" /> Sign Up
        </Button>
      </div>
    </div>
  );
}
