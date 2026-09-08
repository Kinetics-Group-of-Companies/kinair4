import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/backend/client';
import { useQueryClient } from '@tanstack/react-query';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  isLoading: boolean;
  isAdmin: boolean;
  isAuthenticated: boolean;
  isSuperAdmin: boolean;
  isApproved: boolean;
  subscriptionEnd: Date | null;
  isSubscriptionValid: boolean;
  tenantId: string | null;
  canAccessLpo: boolean;
  receivesLpoEmails: boolean;
  signOut: () => Promise<void>;
  refreshUserStatus: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const SUPER_ADMIN_EMAILS = ['chndeepak7@gmail.com', 'deepak@kineticsgroup.ae'];
const AUTH_BOOT_TIMEOUT_MS = 12_000;

function withAuthTimeout<T>(promise: PromiseLike<T>, fallback: T): Promise<T> {
  return Promise.race([
    Promise.resolve(promise),
    new Promise<T>((resolve) => window.setTimeout(() => resolve(fallback), AUTH_BOOT_TIMEOUT_MS)),
  ]);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [isApproved, setIsApproved] = useState(false);
  const [subscriptionEnd, setSubscriptionEnd] = useState<Date | null>(null);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [canAccessLpo, setCanAccessLpo] = useState(false);
  const [receivesLpoEmails, setReceivesLpoEmails] = useState(false);

  const checkSuperAdmin = (email: string | undefined) => {
    return email ? SUPER_ADMIN_EMAILS.includes(email.toLowerCase()) : false;
  };

  const isSubscriptionValid = React.useMemo(() => {
    if (!subscriptionEnd) return true; // null means unlimited
    return new Date(subscriptionEnd) > new Date();
  }, [subscriptionEnd]);

  const fetchUserStatus = async (userId: string, email?: string) => {
    try {
      // Check super admin status
      const superAdmin = checkSuperAdmin(email);
      setIsSuperAdmin(superAdmin);

      // Fetch user role
      const { data: roleData } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', userId)
        .maybeSingle();

      setIsAdmin(roleData?.role === 'admin' || superAdmin);

      const { data: lpoPermission, error: lpoPermissionError } = await supabase
        .from('user_lpo_permissions')
        .select('can_access_lpo, receive_lpo_emails')
        .eq('user_id', userId)
        .maybeSingle();

      if (lpoPermissionError) throw lpoPermissionError;
      setCanAccessLpo(superAdmin || Boolean(lpoPermission?.can_access_lpo));
      setReceivesLpoEmails(Boolean(lpoPermission?.receive_lpo_emails));

      // Fetch profile with tenant info
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select(`
          tenant_id,
          is_approved,
          tenant:tenants(subscription_end, is_active)
        `)
        .eq('user_id', userId)
        .maybeSingle();

      if (profileError) throw profileError;

      let resolvedTenantId = profileData?.tenant_id ?? null;
      let tenant = profileData
        ? (Array.isArray(profileData.tenant) ? profileData.tenant[0] : profileData.tenant)
        : null;

      // Recognized super admins belong to the KINAIR workspace. This keeps the
      // UI and database authorization aligned even if profile provisioning is
      // briefly delayed after an account is created.
      if (!resolvedTenantId && superAdmin) {
        const { data: kinairTenant, error: tenantError } = await supabase
          .from('tenants')
          .select('id, subscription_end, is_active')
          .eq('name', 'KINAIR')
          .eq('is_active', true)
          .maybeSingle();

        if (tenantError) throw tenantError;
        resolvedTenantId = kinairTenant?.id ?? null;
        tenant = kinairTenant ?? null;
      }

      setTenantId(resolvedTenantId);
      setIsApproved(Boolean(profileData?.is_approved) || superAdmin);

      if (tenant?.subscription_end) {
        setSubscriptionEnd(new Date(tenant.subscription_end));
      } else {
        setSubscriptionEnd(null); // unlimited
      }
    } catch (error) {
      console.error('Error fetching user status:', error);
    }
  };

  const refreshUserStatus = async () => {
    if (user) {
      await fetchUserStatus(user.id, user.email);
    }
  };

  useEffect(() => {
    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        // Handle token refresh errors - clear invalid session
        if (event === 'TOKEN_REFRESHED' && !session) {
          console.log('Token refresh failed, clearing session');
          setSession(null);
          setUser(null);
          setIsAdmin(false);
          setIsSuperAdmin(false);
          setIsApproved(false);
          setTenantId(null);
          setCanAccessLpo(false);
          setReceivesLpoEmails(false);
          setSubscriptionEnd(null);
          setIsLoading(false);
          return;
        }

        // Handle sign out event
        if (event === 'SIGNED_OUT') {
          setSession(null);
          setUser(null);
          setIsAdmin(false);
          setIsSuperAdmin(false);
          setIsApproved(false);
          setTenantId(null);
          setCanAccessLpo(false);
          setReceivesLpoEmails(false);
          setSubscriptionEnd(null);
          queryClient.invalidateQueries();
          setIsLoading(false);
          return;
        }

        setSession(session);
        setUser(session?.user ?? null);
        
        // Invalidate all queries on auth state change to ensure fresh data
        queryClient.invalidateQueries();
        
        // Defer database reads until the auth callback has released its lock.
        if (session?.user) {
          window.setTimeout(() => {
            void withAuthTimeout(fetchUserStatus(session.user.id, session.user.email), undefined)
              .finally(() => setIsLoading(false));
          }, 0);
          return;
        } else {
          setIsAdmin(false);
          setIsSuperAdmin(false);
          setIsApproved(false);
          setTenantId(null);
          setCanAccessLpo(false);
          setReceivesLpoEmails(false);
          setSubscriptionEnd(null);
        }
        
        setIsLoading(false);
      }
    );

    // THEN check for existing session
    withAuthTimeout(
      supabase.auth.getSession(),
      { data: { session: null }, error: null }
    ).then(async ({ data: { session }, error }) => {
      // If there's an error getting session (expired token), clear everything
      if (error) {
        console.log('Session error, clearing state:', error.message);
        setSession(null);
        setUser(null);
        void supabase.auth.signOut({ scope: 'local' }).catch(() => undefined);
        setIsLoading(false);
        return;
      }

      setSession(session);
      setUser(session?.user ?? null);
      
      if (session?.user) await withAuthTimeout(fetchUserStatus(session.user.id, session.user.email), undefined);
      
      setIsLoading(false);
    }).catch((error) => {
      console.error('Unable to restore session:', error);
      void supabase.auth.signOut({ scope: 'local' }).catch(() => undefined);
      setSession(null);
      setUser(null);
      setIsLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setIsAdmin(false);
    setIsSuperAdmin(false);
    setIsApproved(false);
    setTenantId(null);
    setCanAccessLpo(false);
    setReceivesLpoEmails(false);
    setSubscriptionEnd(null);
  };

  return (
    <AuthContext.Provider value={{ 
      user, 
      session, 
      isLoading, 
      isAdmin,
      isSuperAdmin,
      isApproved,
      subscriptionEnd,
      isSubscriptionValid,
      isAuthenticated: !!user,
      tenantId,
      canAccessLpo,
      receivesLpoEmails,
      signOut,
      refreshUserStatus
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
