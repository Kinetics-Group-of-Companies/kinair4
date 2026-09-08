import { useState } from 'react';
import { Clock3, LogIn, Sparkles, UserPlus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useGuestTrial } from '@/lib/guestTrialContext';

export function GuestAccessPrompt({ productName }: { productName: string }) {
  const navigate = useNavigate();
  const { startTrial, trialLoading } = useGuestTrial();
  const [failure, setFailure] = useState<string | null>(() =>
    sessionStorage.getItem('kinair_guest_trial_expired')
      ? 'Your five-minute guest trial is complete. Sign up to continue using KINAIR.'
      : null,
  );

  const start = async () => {
    setFailure(null);
    const result = await startTrial();
    if (!result.ok) setFailure(result.reason);
  };

  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4">
      <div className="text-center max-w-lg mx-auto p-8 rounded-2xl border bg-card shadow-sm">
        <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-6">
          {failure ? <UserPlus className="w-10 h-10 text-primary" /> : <Sparkles className="w-10 h-10 text-primary" />}
        </div>
        <h2 className="text-2xl font-bold mb-3">
          {failure ? 'Continue with a free account' : 'Try KINAIR for 5 minutes'}
        </h2>
        <p className="text-muted-foreground mb-6">
          {failure || `Use the ${productName} and AI Selection Assistant without logging in. One trial is available per network.`}
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          {failure ? (
            <Button onClick={() => navigate('/login?tab=signup&reason=trial-ended')} size="lg">
              <UserPlus className="w-4 h-4 mr-2" /> Sign Up Free
            </Button>
          ) : (
            <Button onClick={start} size="lg" disabled={trialLoading}>
              <Clock3 className="w-4 h-4 mr-2" />
              {trialLoading ? 'Starting…' : 'Start 5-Minute Trial'}
            </Button>
          )}
          <Button onClick={() => navigate('/login')} size="lg" variant="outline">
            <LogIn className="w-4 h-4 mr-2" /> Login
          </Button>
        </div>
        {!failure && (
          <p className="text-xs text-muted-foreground mt-4">
            Selection and AI assistance only. Projects, admin tools and LPO tracking require an approved account.
          </p>
        )}
      </div>
    </div>
  );
}
