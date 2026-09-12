// ============= Full file contents =============
import { useEffect, useState } from 'react';
import { Sparkles, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { AssistantChat, type AssistantContext, FAN_SUGGESTIONS, AIR_CURTAIN_SUGGESTIONS } from '@/components/ai/AssistantChat';
import { useAuth } from '@/lib/authContext';
import { cn } from '@/lib/utils';
import { useGuestTrial } from '@/lib/guestTrialContext';

const GENERAL_TEASERS = [
  'Select a fan from a room size…',
  'Upload a schedule — get all selections',
  'Datasheet by chat in seconds',
];

/**
 * Floating "Ask KINAIR" button that opens the selection assistant in a side panel,
 * so users never have to leave the Fan / Air Curtain Selector.
 * The button is animated and cycles teaser prompts to invite users in.
 */
export function AssistantLauncher({
  suggestions,
  context = 'general',
  title = 'Ask KINAIR',
}: {
  suggestions?: string[];
  context?: AssistantContext;
  title?: string;
}) {
  const { isAuthenticated, isApproved, isSuperAdmin, isAccountTrialActive } = useAuth();
  const { isGuest, trialActive } = useGuestTrial();
  const assistantAllowed = isAuthenticated && (
    isGuest ? trialActive : (isApproved || isSuperAdmin || (isAccountTrialActive && trialActive))
  );
  const [open, setOpen] = useState(false);
  const [teaserIndex, setTeaserIndex] = useState(0);
  const [teaserDismissed, setTeaserDismissed] = useState(false);
  const [teaserVisible, setTeaserVisible] = useState(false);

  const teasers =
    suggestions && suggestions.length > 0
      ? suggestions
      : context === 'fan'
        ? FAN_SUGGESTIONS
        : context === 'air_curtain'
          ? AIR_CURTAIN_SUGGESTIONS
          : GENERAL_TEASERS;

  // Show the teaser bubble shortly after load, then cycle messages
  useEffect(() => {
    if (!assistantAllowed || open || teaserDismissed) return;
    const show = setTimeout(() => setTeaserVisible(true), 1200);
    return () => clearTimeout(show);
  }, [assistantAllowed, open, teaserDismissed]);

  useEffect(() => {
    if (!teaserVisible || open || teaserDismissed) return;
    const cycle = setInterval(() => setTeaserIndex((i) => (i + 1) % teasers.length), 3500);
    return () => clearInterval(cycle);
  }, [teaserVisible, open, teaserDismissed, teasers.length]);

  if (!assistantAllowed) return null;

  const showTeaser = teaserVisible && !open && !teaserDismissed;

  return (
    <>
      <div className="fixed bottom-4 right-4 sm:bottom-5 sm:right-5 z-40 flex items-end gap-2 sm:gap-3 max-w-[calc(100vw-2rem)]">
        {/* Cycling teaser bubble */}
        {showTeaser && (
          <div
            className="relative max-w-[240px] rounded-2xl rounded-br-sm border border-border bg-background px-3.5 py-2.5 shadow-lg animate-in fade-in slide-in-from-bottom-2 duration-500 cursor-pointer"
            onClick={() => setOpen(true)}
            role="button"
            aria-label="Open the selection assistant"
          >
            <button
              className="absolute -top-2 -left-2 rounded-full bg-muted border border-border p-0.5 text-muted-foreground hover:text-foreground"
              onClick={(e) => {
                e.stopPropagation();
                setTeaserDismissed(true);
              }}
              aria-label="Dismiss hint"
            >
              <X className="w-3 h-3" />
            </button>
            <p className="text-[11px] font-semibold text-primary mb-0.5">Ask KINAIR AI</p>
            <p key={teaserIndex} className="text-xs text-foreground animate-in fade-in duration-500">
              “{teasers[teaserIndex]}”
            </p>
          </div>
        )}

        {/* Animated floating button */}
        <div className="relative">
          {/* Pulsing glow ring */}
          <span
            className="absolute inset-0 rounded-full bg-primary/40 animate-ping [animation-duration:2.5s]"
            aria-hidden
          />
          <Button
            onClick={() => setOpen(true)}
            className={cn(
              'relative rounded-full shadow-xl h-11 px-4 sm:h-12 sm:px-5 text-sm',
              'bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70',
              'transition-transform duration-300 hover:scale-105 active:scale-95',
              'animate-[assistantFloat_3s_ease-in-out_infinite]',
            )}
            aria-label="Open the selection assistant"
          >
            <Sparkles className="w-4 h-4 mr-2 animate-[assistantSpin_4s_linear_infinite]" />
            {title}
          </Button>
        </div>
      </div>

      <style>{`
        @keyframes assistantFloat {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-4px); }
        }
        @keyframes assistantSpin {
          0%, 100% { transform: rotate(0deg) scale(1); }
          25% { transform: rotate(-12deg) scale(1.15); }
          75% { transform: rotate(12deg) scale(1.15); }
        }
      `}</style>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="w-full sm:max-w-xl p-0 flex flex-col gap-0 h-[100dvh]">
          <SheetHeader className="px-4 py-3 border-b border-border">
            <SheetTitle className="flex items-center gap-2 text-base">
              <Sparkles className="w-4 h-4 text-primary" />
              Selection Assistant
            </SheetTitle>
          </SheetHeader>
          <div className="flex-1 min-h-0 p-2 sm:p-3">
            <AssistantChat suggestions={suggestions} context={context} heightClass="h-full border-0 shadow-none" />
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
