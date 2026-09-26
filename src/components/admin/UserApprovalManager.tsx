import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/backend/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { Check, X, Calendar, Loader2, RefreshCw, UserCheck, UserX, Clock, Shield, User, Trash2, CalendarDays, Mail, Truck } from 'lucide-react';
import { format } from 'date-fns';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";

const SUPER_ADMIN_EMAILS = ['chndeepak7@gmail.com', 'deepak@kineticsgroup.ae'];

// SECURITY: No unlimited option - all access must have expiry date
const SUBSCRIPTION_OPTIONS = [
  { value: '30', label: '30 Days' },
  { value: '90', label: '3 Months' },
  { value: '180', label: '6 Months' },
  { value: '365', label: '12 Months' },
  { value: 'custom', label: 'Custom' },
];

interface UserProfile {
  id: string;
  user_id: string;
  display_name: string | null;
  is_approved: boolean;
  approval_requested_at: string;
  approved_at: string | null;
  tenant_id: string | null;
  role?: 'admin' | 'user';
  tenant?: {
    id: string;
    name: string;
    email: string | null;
    subscription_start: string | null;
    subscription_end: string | null;
    is_active: boolean;
  };
  user_email?: string;
  can_access_lpo?: boolean;
  receive_lpo_emails?: boolean;
  notification_email?: string | null;
}

export function UserApprovalManager() {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [lpoUsers, setLpoUsers] = useState<UserProfile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [subscriptionDays, setSubscriptionDays] = useState<{ [key: string]: number }>({});
  const [subscriptionType, setSubscriptionType] = useState<{ [key: string]: string }>({});
  const [deleteConfirm, setDeleteConfirm] = useState<UserProfile | null>(null);
  const [approveConfirm, setApproveConfirm] = useState<{ user: UserProfile; days: number; asAdmin: boolean } | null>(null);

  const fetchUsers = async () => {
    setIsLoading(true);
    try {
      // Fetch profiles with tenant info and email
      const { data: profiles, error } = await supabase
        .from('profiles')
        .select(`
          id,
          user_id,
          display_name,
          email,
          is_approved,
          approval_requested_at,
          approved_at,
          tenant_id,
          tenant:tenants(id, name, email, subscription_start, subscription_end, is_active)
        `)
        .order('approval_requested_at', { ascending: false });

      if (error) throw error;

      // Fetch user roles
      const { data: roles } = await supabase
        .from('user_roles')
        .select('user_id, role');

      const roleMap = new Map(roles?.map(r => [r.user_id, r.role]) || []);

      const { data: lpoPermissions, error: permissionsError } = await supabase
        .from('user_lpo_permissions')
        .select('user_id, can_access_lpo, receive_lpo_emails, notification_email');

      if (permissionsError) throw permissionsError;

      const permissionMap = new Map((lpoPermissions || []).map(permission => [
        permission.user_id,
        permission,
      ]));

      // Transform to flatten tenant and use email from profile (synced from auth.users).
      // Keep the LPO permission list identical to the approved-user list shown
      // in Admin Portal. The database RPC resolves stale/re-created auth UUIDs
      // by email, so every approved row remains manageable here.
      const transformedProfiles = (profiles || []).map(p => {
        const permission = permissionMap.get(p.user_id);
        return {
          ...p,
          tenant: Array.isArray(p.tenant) ? p.tenant[0] : p.tenant,
          user_email: (p as any).email || (Array.isArray(p.tenant) ? p.tenant[0]?.email : (p.tenant as any)?.email),
          role: roleMap.get(p.user_id) as 'admin' | 'user' | undefined,
          can_access_lpo: permission?.can_access_lpo ?? false,
          receive_lpo_emails: permission?.receive_lpo_emails ?? false,
          notification_email: permission?.notification_email ?? null,
        };
      });

      // Every approved portal user appears here. Tracker access and email alerts
      // are controlled independently by the two switches below.
      setLpoUsers(transformedProfiles.filter(profile => profile.is_approved));
      setUsers(transformedProfiles.filter(
        profile => !SUPER_ADMIN_EMAILS.includes((profile.user_email || '').toLowerCase()),
      ));
    } catch (error) {
      console.error('Error fetching users:', error);
      toast.error('Failed to load users');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleApprove = async (profile: UserProfile, days: number) => {
    // SECURITY: Force minimum 30 days, never allow unlimited (0)
    const safeDays = days > 0 ? days : 30;
    console.log('handleApprove called with days:', days, 'safeDays:', safeDays, 'for user:', profile.user_email);
    
    if (!profile.tenant_id) {
      toast.error('User has no tenant assigned');
      return;
    }

    setActionLoading(profile.id);
    try {
      // Update profile approval status
      const { error: profileError } = await supabase
        .from('profiles')
        .update({
          is_approved: true,
          approved_at: new Date().toISOString()
        })
        .eq('id', profile.id);

      if (profileError) throw profileError;

      // Update tenant subscription - ALWAYS set expiry date, never null
      const subscriptionEnd = new Date(Date.now() + safeDays * 24 * 60 * 60 * 1000).toISOString();
      
      console.log('Setting subscription_end to:', subscriptionEnd, 'for tenant:', profile.tenant_id);
      
      const { error: tenantError } = await supabase
        .from('tenants')
        .update({
          subscription_end: subscriptionEnd,
          is_active: true
        })
        .eq('id', profile.tenant_id);

      if (tenantError) {
        console.error('Tenant update error:', tenantError);
        throw tenantError;
      }

      // Verify the update by fetching the tenant
      const { data: verifyData, error: verifyError } = await supabase
        .from('tenants')
        .select('subscription_end, is_active')
        .eq('id', profile.tenant_id)
        .single();

      if (verifyError) {
        console.error('Verification error:', verifyError);
      } else {
        console.log('Verified tenant update:', verifyData);
        const actualEnd = new Date(verifyData.subscription_end).toISOString();
        const expectedEnd = subscriptionEnd;
        if (actualEnd !== expectedEnd) {
          console.warn('Update may not have persisted! Expected:', expectedEnd, 'Got:', actualEnd);
        }
      }

      console.log('Tenant updated successfully');
      toast.success(`User approved with ${safeDays} days subscription (ends: ${new Date(subscriptionEnd).toLocaleDateString()})`);
      await new Promise(resolve => setTimeout(resolve, 200));
      await fetchUsers();
    } catch (error) {
      console.error('Error approving user:', error);
      toast.error('Failed to approve user');
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async (profile: UserProfile) => {
    if (!profile.tenant_id) return;

    setActionLoading(profile.id);
    try {
      // Deactivate tenant
      const { error } = await supabase
        .from('tenants')
        .update({ is_active: false })
        .eq('id', profile.tenant_id);

      if (error) throw error;

      // Update profile
      const { error: profileError } = await supabase
        .from('profiles')
        .update({ is_approved: false })
        .eq('id', profile.id);

      if (profileError) throw profileError;

      toast.success('User access revoked');
      // Small delay to ensure database is fully synced before refetching
      await new Promise(resolve => setTimeout(resolve, 100));
      fetchUsers();
    } catch (error) {
      console.error('Error rejecting user:', error);
      toast.error('Failed to revoke access');
    } finally {
      setActionLoading(null);
    }
  };

  const handleDelete = async (profile: UserProfile) => {
    setActionLoading(profile.id);
    try {
      // Delete user role first (if exists)
      await supabase
        .from('user_roles')
        .delete()
        .eq('user_id', profile.user_id);

      // Delete profile
      const { error: profileError } = await supabase
        .from('profiles')
        .delete()
        .eq('id', profile.id);

      if (profileError) throw profileError;

      // Delete tenant if it exists
      if (profile.tenant_id) {
        await supabase
          .from('tenants')
          .delete()
          .eq('id', profile.tenant_id);
      }

      toast.success('User deleted successfully');
      setDeleteConfirm(null);
      // Small delay to ensure database is fully synced before refetching
      await new Promise(resolve => setTimeout(resolve, 100));
      await fetchUsers();
    } catch (error) {
      console.error('Error deleting user:', error);
      toast.error('Failed to delete user');
    } finally {
      setActionLoading(null);
    }
  };

  const confirmApprove = () => {
    if (!approveConfirm) return;
    
    if (approveConfirm.asAdmin) {
      handlePromoteToAdmin(approveConfirm.user, approveConfirm.days);
    } else {
      handleApprove(approveConfirm.user, approveConfirm.days);
    }
    setApproveConfirm(null);
  };

  const getSelectedDays = (userId: string): number => {
    const type = subscriptionType[userId] || '30';
    if (type === 'custom') {
      const customDays = subscriptionDays[userId];
      // Minimum 1 day, default 30 days
      return customDays && customDays > 0 ? customDays : 30;
    }
    const parsedDays = parseInt(type);
    // SECURITY: Never allow 0 (unlimited) - minimum 30 days
    return parsedDays > 0 ? parsedDays : 30;
  };

  const handleExtendSubscription = async (profile: UserProfile, days: number) => {
    if (!profile.tenant_id) return;
    
    // SECURITY: Force minimum 30 days for extension
    const safeDays = days > 0 ? days : 30;

    setActionLoading(profile.id);
    try {
      const currentEnd = profile.tenant?.subscription_end 
        ? new Date(profile.tenant.subscription_end)
        : new Date();
      
      // Always extend with actual days, never set to null
      const newEnd = new Date(Math.max(currentEnd.getTime(), Date.now()) + safeDays * 24 * 60 * 60 * 1000).toISOString();

      console.log('handleExtendSubscription - safeDays:', safeDays, 'newEnd:', newEnd);

      const { error } = await supabase
        .from('tenants')
        .update({
          subscription_end: newEnd,
          is_active: true
        })
        .eq('id', profile.tenant_id);

      if (error) throw error;

      toast.success(`Subscription extended by ${safeDays} days`);
      await new Promise(resolve => setTimeout(resolve, 100));
      await fetchUsers();
    } catch (error) {
      console.error('Error extending subscription:', error);
      toast.error('Failed to extend subscription');
    } finally {
      setActionLoading(null);
    }
  };

  // Set subscription to a specific date - SECURITY: only super admins can set unlimited via this
  const handleSetSubscriptionDate = async (profile: UserProfile, date: Date | null) => {
    if (!profile.tenant_id) return;

    // SECURITY: If null (unlimited) is requested, set to 30 days instead
    const safeDate = date || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    setActionLoading(profile.id);
    try {
      const subscriptionEnd = safeDate.toISOString();
      
      console.log('handleSetSubscriptionDate - safeDate:', safeDate, 'subscriptionEnd:', subscriptionEnd);

      const { error } = await supabase
        .from('tenants')
        .update({
          subscription_end: subscriptionEnd,
          is_active: true
        })
        .eq('id', profile.tenant_id);

      if (error) throw error;

      toast.success(`Subscription set to expire on ${format(safeDate, 'MMM dd, yyyy')}`);
      await new Promise(resolve => setTimeout(resolve, 100));
      await fetchUsers();
    } catch (error) {
      console.error('Error setting subscription date:', error);
      toast.error('Failed to set subscription date');
    } finally {
      setActionLoading(null);
    }
  };

  const handlePromoteToAdmin = async (profile: UserProfile, days: number = 30) => {
    // SECURITY: Force minimum 30 days, never allow unlimited (0)
    const safeDays = days > 0 ? days : 30;
    
    setActionLoading(profile.id);
    try {
      // Update or insert role
      const { error } = await supabase
        .from('user_roles')
        .upsert({
          user_id: profile.user_id,
          role: 'admin'
        }, { onConflict: 'user_id' });

      if (error) throw error;

      // Also approve the user if not already approved
      if (!profile.is_approved) {
        await supabase
          .from('profiles')
          .update({ is_approved: true, approved_at: new Date().toISOString() })
          .eq('id', profile.id);
      }
      
      // Set subscription - NEVER allow unlimited
      if (profile.tenant_id) {
        const subscriptionEnd = new Date(Date.now() + safeDays * 24 * 60 * 60 * 1000).toISOString();
        console.log('handlePromoteToAdmin - safeDays:', safeDays, 'subscriptionEnd:', subscriptionEnd);
        await supabase
          .from('tenants')
          .update({ subscription_end: subscriptionEnd, is_active: true })
          .eq('id', profile.tenant_id);
      }

      toast.success(`User promoted to admin with ${safeDays} days subscription`);
      await new Promise(resolve => setTimeout(resolve, 100));
      await fetchUsers();
    } catch (error) {
      console.error('Error promoting user:', error);
      toast.error('Failed to promote user');
    } finally {
      setActionLoading(null);
    }
  };

  const handleDemoteToUser = async (profile: UserProfile) => {
    // Prevent demoting super admins
    if (SUPER_ADMIN_EMAILS.includes(profile.user_email?.toLowerCase() || '')) {
      toast.error('Cannot demote super admin');
      return;
    }

    setActionLoading(profile.id);
    try {
      const { error } = await supabase
        .from('user_roles')
        .update({ role: 'user' })
        .eq('user_id', profile.user_id);

      if (error) throw error;

      toast.success('Admin demoted to user');
      // Small delay to ensure database is fully synced before refetching
      await new Promise(resolve => setTimeout(resolve, 100));
      await fetchUsers();
    } catch (error) {
      console.error('Error demoting admin:', error);
      toast.error('Failed to demote admin');
    } finally {
      setActionLoading(null);
    }
  };

  const handleLpoPermissionChange = async (
    profile: UserProfile,
    changes: Partial<Pick<UserProfile, 'can_access_lpo' | 'receive_lpo_emails' | 'notification_email'>>,
  ) => {
    setActionLoading(`lpo-${profile.user_id}`);
    try {
      const { data, error } = await supabase.rpc('admin_set_lpo_permission', {
        _target_user_id: profile.user_id,
        _can_access_lpo: changes.can_access_lpo ?? null,
        _receive_lpo_emails: changes.receive_lpo_emails ?? null,
        _notification_email: changes.notification_email ?? null,
      });

      if (error) throw error;
      if (!data) throw new Error('Permission update returned no result');

      toast.success('LPO permissions updated');
      await fetchUsers();
    } catch (error) {
      console.error('Error updating LPO permissions:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to update LPO permissions');
    } finally {
      setActionLoading(null);
    }
  };

  const getSubscriptionStatus = (tenant?: UserProfile['tenant']) => {
    if (!tenant) return { status: 'unknown', label: 'Unknown', variant: 'secondary' as const };
    
    if (!tenant.is_active) {
      return { status: 'inactive', label: 'Inactive', variant: 'destructive' as const };
    }
    
    if (!tenant.subscription_end) {
      return { status: 'unlimited', label: 'Unlimited', variant: 'default' as const };
    }
    
    const endDate = new Date(tenant.subscription_end);
    const now = new Date();
    
    if (endDate < now) {
      return { status: 'expired', label: 'Expired', variant: 'destructive' as const };
    }
    
    const daysLeft = Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    
    if (daysLeft <= 7) {
      return { status: 'expiring', label: `${daysLeft}d left`, variant: 'secondary' as const };
    }
    
    return { status: 'active', label: `${daysLeft}d left`, variant: 'outline' as const };
  };

  const isSuperAdmin = (email?: string | null) => {
    return email ? SUPER_ADMIN_EMAILS.includes(email.toLowerCase()) : false;
  };

  const isExpired = (tenant?: UserProfile['tenant']) => {
    if (!tenant?.subscription_end) return false; // Unlimited = not expired
    return new Date(tenant.subscription_end) < new Date();
  };

  // Expired users go back to pending approval (except admins with unlimited)
  const pendingUsers = users.filter(u => !u.is_approved || (u.is_approved && u.role !== 'admin' && isExpired(u.tenant)));
  const adminUsers = users.filter(u => u.is_approved && u.role === 'admin');
  const regularUsers = users.filter(u => u.is_approved && u.role !== 'admin' && !isExpired(u.tenant));

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">User Management</h2>
          <p className="text-sm text-muted-foreground">Manage admins, users, and subscriptions</p>
        </div>
        <Button variant="outline" onClick={fetchUsers} disabled={isLoading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Truck className="h-5 w-5 text-primary" />
            LPO Tracker &amp; Email Permissions
          </CardTitle>
          <CardDescription>
            Select LPO Tracker access and email notifications independently for each approved user. Users granted Tracker access share the same company LPO register.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {lpoUsers.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No authenticated users found</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Alert email</TableHead>
                  <TableHead className="text-center">LPO Tracker</TableHead>
                  <TableHead className="text-center">User alerts</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lpoUsers.map((profile) => {
                  const superAdmin = isSuperAdmin(profile.user_email);
                  const loading = actionLoading === `lpo-${profile.user_id}`;
                  return (
                    <TableRow key={profile.user_id}>
                      <TableCell>
                        <div className="font-medium">{profile.display_name || profile.user_email || 'User'}</div>
                        <div className="text-xs text-muted-foreground">{profile.user_email}</div>
                      </TableCell>
                      <TableCell className="min-w-56">
                        <Input
                          type="email"
                          aria-label={`LPO delivery email for ${profile.user_email}`}
                          defaultValue={profile.notification_email || profile.user_email || ''}
                          disabled={loading}
                          onBlur={(event) => {
                            const value = event.currentTarget.value.trim();
                            const current = profile.notification_email || profile.user_email || '';
                            if (value && value !== current) {
                              void handleLpoPermissionChange(profile, { notification_email: value });
                            }
                          }}
                        />
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="inline-flex items-center gap-2">
                          <Switch
                            checked={superAdmin || Boolean(profile.can_access_lpo)}
                            disabled={superAdmin || loading}
                            aria-label={`Allow LPO Tracker access for ${profile.user_email}`}
                            onCheckedChange={(checked) => void handleLpoPermissionChange(profile, { can_access_lpo: checked })}
                          />
                          {superAdmin && <Badge variant="secondary">Always on</Badge>}
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="inline-flex items-center gap-2">
                          <Mail className="h-4 w-4 text-muted-foreground" />
                          <Switch
                            checked={Boolean(profile.receive_lpo_emails)}
                            disabled={loading}
                            aria-label={`Send LPO email to ${profile.user_email}`}
                            onCheckedChange={(checked) => void handleLpoPermissionChange(profile, { receive_lpo_emails: checked })}
                          />
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Pending Approvals */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-amber-500" />
            Pending Approvals ({pendingUsers.length})
          </CardTitle>
          <CardDescription>Users waiting for approval to access the portal</CardDescription>
        </CardHeader>
        <CardContent>
          {pendingUsers.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No pending approvals</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Requested</TableHead>
                  <TableHead>Subscription Period</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pendingUsers.map((user) => {
                  const selectedType = subscriptionType[user.id] || '30';
                  const selectedDays = getSelectedDays(user.id);
                  return (
                    <TableRow key={user.id}>
                      <TableCell className="font-medium">{user.user_email || user.tenant?.email}</TableCell>
                      <TableCell>{user.display_name || '-'}</TableCell>
                      <TableCell>
                        {user.approval_requested_at 
                          ? format(new Date(user.approval_requested_at), 'MMM dd, yyyy')
                          : '-'}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Select
                            value={selectedType}
                            onValueChange={(value) => setSubscriptionType(prev => ({
                              ...prev,
                              [user.id]: value
                            }))}
                          >
                            <SelectTrigger className="w-32">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {SUBSCRIPTION_OPTIONS.map(opt => (
                                <SelectItem key={opt.value} value={opt.value}>
                                  {opt.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {selectedType === 'custom' && (
                            <Input
                              type="number"
                              min="1"
                              placeholder="Days"
                              className="w-20"
                              value={subscriptionDays[user.id] || ''}
                              onChange={(e) => setSubscriptionDays(prev => ({
                                ...prev,
                                [user.id]: parseInt(e.target.value) || 0
                              }))}
                            />
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            size="sm"
                            className="bg-green-600 hover:bg-green-700 text-white"
                            onClick={() => {
                              const days = getSelectedDays(user.id);
                              console.log('Approve clicked - user:', user.user_email, 'days:', days, 'subscriptionType:', subscriptionType[user.id]);
                              setApproveConfirm({ user, days, asAdmin: false });
                            }}
                            disabled={actionLoading === user.id}
                            title={`Approve as user with ${selectedDays === 0 ? 'unlimited' : selectedDays + ' days'} subscription`}
                          >
                            <Check className="h-4 w-4 mr-1" />
                            Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="border-blue-600 text-blue-600 hover:bg-blue-50"
                            onClick={() => {
                              const days = getSelectedDays(user.id);
                              console.log('Admin approve clicked - user:', user.user_email, 'days:', days, 'subscriptionType:', subscriptionType[user.id]);
                              setApproveConfirm({ user, days, asAdmin: true });
                            }}
                            disabled={actionLoading === user.id}
                            title={`Approve as admin with ${selectedDays === 0 ? 'unlimited' : selectedDays + ' days'} subscription`}
                          >
                            <Shield className="h-4 w-4 mr-1" />
                            Admin
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => setDeleteConfirm(user)}
                            disabled={actionLoading === user.id}
                            title="Delete user"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Admins */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-blue-500" />
            Administrators ({adminUsers.length})
          </CardTitle>
          <CardDescription>Users with admin access to manage fan data</CardDescription>
        </CardHeader>
        <CardContent>
          {adminUsers.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No administrators</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Subscription</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {adminUsers.map((user) => {
                  const subStatus = getSubscriptionStatus(user.tenant);
                  const isSuper = isSuperAdmin(user.user_email);
                  return (
                    <TableRow key={user.id}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          {user.user_email || user.tenant?.email}
                          {isSuper && (
                            <Badge variant="default" className="bg-purple-600">Super</Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>{user.display_name || '-'}</TableCell>
                      <TableCell>
                        <Badge variant={subStatus.variant}>{subStatus.label}</Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {user.tenant?.subscription_end 
                            ? format(new Date(user.tenant.subscription_end), 'MMM dd, yyyy')
                            : 'Unlimited'}
                          <Popover>
                            <PopoverTrigger asChild>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-6 w-6 p-0"
                                disabled={actionLoading === user.id}
                                title="Change expiry date"
                              >
                                <CalendarDays className="h-4 w-4" />
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="start">
                              <CalendarComponent
                                mode="single"
                                selected={user.tenant?.subscription_end ? new Date(user.tenant.subscription_end) : undefined}
                                onSelect={(date) => date && handleSetSubscriptionDate(user, date)}
                                disabled={(date) => date < new Date()}
                                initialFocus
                              />
                            </PopoverContent>
                          </Popover>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          {!isSuper && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleDemoteToUser(user)}
                              disabled={actionLoading === user.id}
                              title="Demote to user"
                            >
                              <User className="h-4 w-4 mr-1" />
                              Demote
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Regular Users */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserCheck className="h-5 w-5 text-green-500" />
            Users ({regularUsers.length})
          </CardTitle>
          <CardDescription>Approved users with fan selector access only</CardDescription>
        </CardHeader>
        <CardContent>
          {regularUsers.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No regular users</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Subscription</TableHead>
                  <TableHead>Extend</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {regularUsers.map((user) => {
                  const subStatus = getSubscriptionStatus(user.tenant);
                  return (
                    <TableRow key={user.id}>
                      <TableCell className="font-medium">{user.user_email || user.tenant?.email}</TableCell>
                      <TableCell>{user.display_name || '-'}</TableCell>
                      <TableCell>
                        <Badge variant={subStatus.variant}>{subStatus.label}</Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {user.tenant?.subscription_end 
                            ? format(new Date(user.tenant.subscription_end), 'MMM dd, yyyy')
                            : 'Unlimited'}
                          <Popover>
                            <PopoverTrigger asChild>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-6 w-6 p-0"
                                disabled={actionLoading === user.id}
                                title="Change expiry date"
                              >
                                <CalendarDays className="h-4 w-4" />
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="start">
                              <CalendarComponent
                                mode="single"
                                selected={user.tenant?.subscription_end ? new Date(user.tenant.subscription_end) : undefined}
                                onSelect={(date) => date && handleSetSubscriptionDate(user, date)}
                                disabled={(date) => date < new Date()}
                                initialFocus
                              />
                            </PopoverContent>
                          </Popover>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Input
                            type="number"
                            min="1"
                            placeholder="Days"
                            className="w-16"
                            value={subscriptionDays[user.id] || ''}
                            onChange={(e) => setSubscriptionDays(prev => ({
                              ...prev,
                              [user.id]: parseInt(e.target.value) || 0
                            }))}
                          />
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleExtendSubscription(user, subscriptionDays[user.id] || 30)}
                            disabled={actionLoading === user.id}
                            title="Add days to current expiry"
                          >
                            +Days
                          </Button>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            size="sm"
                            className="bg-blue-600 hover:bg-blue-700"
                            onClick={() => {
                              const days = subscriptionDays[user.id] || 30;
                              setApproveConfirm({ user, days, asAdmin: true });
                            }}
                            disabled={actionLoading === user.id}
                            title="Promote to admin"
                          >
                            <Shield className="h-4 w-4 mr-1" />
                            Admin
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-destructive hover:text-destructive"
                            onClick={() => handleReject(user)}
                            disabled={actionLoading === user.id}
                          >
                            <UserX className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete User</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <strong>{deleteConfirm?.user_email || deleteConfirm?.display_name}</strong>? 
              This action cannot be undone and will permanently remove the user and all their data.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteConfirm && handleDelete(deleteConfirm)}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Approve Confirmation Dialog */}
      <AlertDialog open={!!approveConfirm} onOpenChange={() => setApproveConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Approval</AlertDialogTitle>
            <AlertDialogDescription>
              {approveConfirm?.asAdmin ? (
                <>
                  Approve <strong>{approveConfirm?.user.user_email || approveConfirm?.user.display_name}</strong> as <strong>Administrator</strong> with{' '}
                  <strong>{approveConfirm?.days === 0 ? 'unlimited' : `${approveConfirm?.days} days`}</strong> subscription?
                </>
              ) : (
                <>
                  Approve <strong>{approveConfirm?.user.user_email || approveConfirm?.user.display_name}</strong> as <strong>User</strong> with{' '}
                  <strong>{approveConfirm?.days === 0 ? 'unlimited' : `${approveConfirm?.days} days`}</strong> subscription?
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmApprove}>
              Confirm Approval
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
