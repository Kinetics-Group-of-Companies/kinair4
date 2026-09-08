import { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/backend/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { Eye, EyeOff, Loader2, User } from 'lucide-react';
import { z } from 'zod';
import { useTenantData } from '@/hooks/useFanDatabase';

const emailSchema = z.string().email('Please enter a valid email address');
const passwordSchema = z.string().min(6, 'Password must be at least 6 characters');

export default function UserAuthPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const defaultTab = searchParams.get('tab') === 'signup' ? 'signup' : 'login';
  const trialPrompt = searchParams.get('reason') === 'trial-ended' || searchParams.get('reason') === 'guest';
  const { data: tenant } = useTenantData();
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  
  const tenantData = tenant as any;
  const brandName = tenantData?.name || 'Fan Selector';
  const logoUrl = tenantData?.logo_url;

  useEffect(() => {
    const superAdminEmails = ['chndeepak7@gmail.com', 'deepak@kineticsgroup.ae'];
    
    const checkSessionAndApproval = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        // Check approval status
        const isSuperAdmin = superAdminEmails.includes(session.user.email?.toLowerCase() || '');
        
        if (isSuperAdmin) {
          navigate('/');
          return;
        }

        const { data: profile } = await supabase
          .from('profiles')
          .select('is_approved, tenant:tenants(subscription_end, is_active)')
          .eq('user_id', session.user.id)
          .maybeSingle();

        const tenant = profile
          ? (Array.isArray(profile.tenant) ? profile.tenant[0] : profile.tenant)
          : null;
        const trialActive = Boolean(
          !profile?.is_approved
          && tenant?.is_active
          && tenant.subscription_end
          && new Date(tenant.subscription_end) > new Date()
        );

        if (profile?.is_approved || trialActive) {
          navigate('/');
        } else {
          await supabase.auth.signOut();
        }
      }
    };
    
    checkSessionAndApproval();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' && session?.user) {
        // Defer the approval check to avoid deadlock
        setTimeout(async () => {
          const isSuperAdmin = superAdminEmails.includes(session.user.email?.toLowerCase() || '');
          
          if (isSuperAdmin) {
            navigate('/');
            return;
          }

          const { data: profile } = await supabase
            .from('profiles')
            .select('is_approved, tenant:tenants(subscription_end, is_active)')
            .eq('user_id', session.user.id)
            .maybeSingle();

          const tenant = profile
            ? (Array.isArray(profile.tenant) ? profile.tenant[0] : profile.tenant)
            : null;
          const trialActive = Boolean(
            !profile?.is_approved
            && tenant?.is_active
            && tenant.subscription_end
            && new Date(tenant.subscription_end) > new Date()
          );

          if (profile?.is_approved || trialActive) {
            navigate('/');
          }
          // Don't sign out here - let handleLogin handle it
        }, 0);
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  const validateForm = () => {
    const newErrors: { email?: string; password?: string } = {};
    
    try {
      emailSchema.parse(email);
    } catch (e) {
      if (e instanceof z.ZodError) {
        newErrors.email = e.errors[0].message;
      }
    }
    
    try {
      passwordSchema.parse(password);
    } catch (e) {
      if (e instanceof z.ZodError) {
        newErrors.password = e.errors[0].message;
      }
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const checkApprovalStatus = async (userId: string, userEmail: string): Promise<{ approved: boolean; hasProfile: boolean; trialActive: boolean }> => {
    // Super admins bypass approval check - use trimmed lowercase email
    const superAdminEmails = ['chndeepak7@gmail.com', 'deepak@kineticsgroup.ae'];
    const normalizedEmail = (userEmail || '').trim().toLowerCase();
    
    console.log('Checking approval status for email:', normalizedEmail);
    
    if (normalizedEmail && superAdminEmails.includes(normalizedEmail)) {
      console.log('Super admin detected, bypassing approval check');
      return { approved: true, hasProfile: true, trialActive: false };
    }

    try {
      const { data: profile, error } = await supabase
        .from('profiles')
        .select('is_approved, tenant:tenants(subscription_end, is_active)')
        .eq('user_id', userId)
        .maybeSingle();

      if (error) {
        console.error('Error fetching profile:', error);
        // For super admins, still allow even if profile query fails
        if (normalizedEmail && superAdminEmails.includes(normalizedEmail)) {
          return { approved: true, hasProfile: true, trialActive: false };
        }
        return { approved: false, hasProfile: false, trialActive: false };
      }

      // If no profile exists, check if super admin (in case profile wasn't created)
      if (!profile) {
        if (normalizedEmail && superAdminEmails.includes(normalizedEmail)) {
          return { approved: true, hasProfile: true, trialActive: false };
        }
        return { approved: false, hasProfile: false, trialActive: false };
      }

      const tenant = Array.isArray(profile.tenant) ? profile.tenant[0] : profile.tenant;
      const trialActive = Boolean(
        !profile.is_approved
        && tenant?.is_active
        && tenant.subscription_end
        && new Date(tenant.subscription_end) > new Date()
      );
      return { approved: profile.is_approved === true, hasProfile: true, trialActive };
    } catch (err) {
      console.error('Exception checking approval:', err);
      // Fallback for super admins
      if (normalizedEmail && superAdminEmails.includes(normalizedEmail)) {
        return { approved: true, hasProfile: true, trialActive: false };
      }
      return { approved: false, hasProfile: false, trialActive: false };
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;
    
    setIsLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        if (error.message.includes('Invalid login credentials')) {
          toast.error('Invalid email or password. Please try again.');
        } else {
          toast.error(error.message);
        }
        return;
      }

      // Check if user is approved - use form email as fallback since it's what user typed
      if (data.user) {
        const userEmail = data.user.email || email; // Fallback to form email
        console.log('Login successful, checking approval for:', userEmail);
        const { approved, hasProfile, trialActive } = await checkApprovalStatus(data.user.id, userEmail);
        
        if (!hasProfile) {
          // No profile means something went wrong - sign out and show generic error
          await supabase.auth.signOut();
          toast.error('Account setup incomplete. Please contact support.');
          return;
        }
        
        if (!approved && !trialActive) {
          await supabase.auth.signOut();
          toast.error('Your account trial has expired and approval is still pending. Please contact the administrator.');
          return;
        }

        toast.success(
          trialActive
            ? 'Logged in. Your account trial is active while approval is pending.'
            : 'Logged in successfully!'
        );
      }
    } catch (error) {
      toast.error('An unexpected error occurred. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;
    
    setIsLoading(true);
    try {
      const redirectUrl = `${window.location.origin}/`;
      
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: redirectUrl,
          data: {
            display_name: displayName || email.split('@')[0],
          },
        },
      });

      if (error) {
        if (error.message.includes('already registered')) {
          toast.error('This email is already registered. Please login instead.');
        } else {
          toast.error(error.message);
        }
        return;
      }

      toast.success('Account created! Trial access is available while your approval request is pending.');
    } catch (error) {
      toast.error('An unexpected error occurred. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          {logoUrl && (
            <div className="flex justify-center mb-4">
              <img src={logoUrl} alt={brandName} className="h-16 w-auto object-contain" />
            </div>
          )}
          <div className="flex items-center justify-center gap-2 mb-2">
            <User className="h-6 w-6 text-primary" />
            <CardTitle className="text-2xl font-bold">User Login</CardTitle>
          </div>
          <CardDescription>{brandName} - User Portal</CardDescription>
        </CardHeader>
        <CardContent>
          {trialPrompt ? (
            <div role="alert" className="mb-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
              Your guest trial is complete. Create a free account to continue selecting with KINAIR AI.
            </div>
          ) : null}
          <Tabs defaultValue={defaultTab} className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="login">Login</TabsTrigger>
              <TabsTrigger value="signup">Sign Up</TabsTrigger>
            </TabsList>
            
            <TabsContent value="login">
              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="login-email">Email</Label>
                  <Input
                    id="login-email"
                    type="email"
                    placeholder="your@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={isLoading}
                  />
                  {errors.email && (
                    <p className="text-sm text-destructive">{errors.email}</p>
                  )}
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="login-password">Password</Label>
                  <div className="relative">
                    <Input
                      id="login-password"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      disabled={isLoading}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                      onClick={() => setShowPassword(!showPassword)}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  </div>
                  {errors.password && (
                    <p className="text-sm text-destructive">{errors.password}</p>
                  )}
                </div>
                
                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Logging in...
                    </>
                  ) : (
                    'Login'
                  )}
                </Button>
                
                <div className="text-center">
                  <Link to="/forgot-password" className="text-sm text-primary hover:underline">
                    Forgot your password?
                  </Link>
                </div>
              </form>
            </TabsContent>
            
            <TabsContent value="signup">
              <form onSubmit={handleSignup} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="signup-name">Display Name (Optional)</Label>
                  <Input
                    id="signup-name"
                    type="text"
                    placeholder="Your Name"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    disabled={isLoading}
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="signup-email">Email</Label>
                  <Input
                    id="signup-email"
                    type="email"
                    placeholder="your@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={isLoading}
                  />
                  {errors.email && (
                    <p className="text-sm text-destructive">{errors.email}</p>
                  )}
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="signup-password">Password</Label>
                  <div className="relative">
                    <Input
                      id="signup-password"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      disabled={isLoading}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                      onClick={() => setShowPassword(!showPassword)}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  </div>
                  {errors.password && (
                    <p className="text-sm text-destructive">{errors.password}</p>
                  )}
                </div>
                
                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Creating account...
                    </>
                  ) : (
                    'Create Account'
                  )}
                </Button>
              </form>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
