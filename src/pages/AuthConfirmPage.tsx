import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import type { EmailOtpType } from '@supabase/supabase-js';
import { Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/backend/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const ALLOWED_TYPES = new Set<EmailOtpType>([
  'signup',
  'invite',
  'magiclink',
  'recovery',
  'email_change',
  'email',
]);

export default function AuthConfirmPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const tokenHash = searchParams.get('token_hash');
    const requestedType = searchParams.get('type') as EmailOtpType | null;
    const type = requestedType && ALLOWED_TYPES.has(requestedType) ? requestedType : null;

    if (!tokenHash || !type) {
      setError('This confirmation link is incomplete or invalid.');
      return;
    }

    let cancelled = false;
    void supabase.auth
      .verifyOtp({ token_hash: tokenHash, type })
      .then(({ error: verifyError }) => {
        if (cancelled) return;
        if (verifyError) {
          setError(verifyError.message || 'This confirmation link has expired or is invalid.');
          return;
        }
        navigate('/', { replace: true });
      })
      .catch(() => {
        if (!cancelled) setError('We could not confirm this email. Please request a new link.');
      });

    return () => {
      cancelled = true;
    };
  }, [navigate, searchParams]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted p-4">
      <Card className="w-full max-w-md text-center">
        <CardHeader>
          <CardTitle>{error ? 'Email confirmation failed' : 'Confirming your email'}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {error ? (
            <>
              <p className="text-sm text-destructive">{error}</p>
              <Button asChild>
                <Link to="/login">Return to login</Link>
              </Button>
            </>
          ) : (
            <div className="flex items-center justify-center gap-2 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span>Please wait…</span>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
