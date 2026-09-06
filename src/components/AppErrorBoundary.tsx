import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { recoverFromStartupFailure } from '@/lib/appRecovery';

interface State {
  hasError: boolean;
}

export class AppErrorBoundary extends React.Component<React.PropsWithChildren, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('Application render failed:', error, info);
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <main className="min-h-screen bg-background text-foreground flex items-center justify-center p-6">
        <section className="w-full max-w-md text-center space-y-5" aria-live="assertive">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
            <AlertTriangle aria-hidden="true" />
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold">The page needs a quick refresh</h1>
            <p className="text-muted-foreground">
              Your saved online records are safe. Reload to open the latest version.
            </p>
          </div>
          <Button onClick={recoverFromStartupFailure} className="gap-2">
            <RefreshCw aria-hidden="true" />
            Reload latest version
          </Button>
        </section>
      </main>
    );
  }
}
