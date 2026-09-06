import { Navigate, Link } from 'react-router-dom';
import { Home, LogOut, Settings, Lock, Gauge } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/lib/authContext';
import { ChangePassword } from '@/components/admin/ChangePassword';
import { AIRFLOW_UNITS, PRESSURE_UNITS, POWER_UNITS } from '@/lib/fanData';
import { useUnitPreferences, useUpdateUnitPreferences } from '@/hooks/useFanDatabase';
import { MainLayout } from '@/components/layout/MainLayout';

export default function UserSettingsPage() {
  const { user, isAuthenticated, signOut, isLoading, isAdmin, isApproved } = useAuth();
  const { data: unitPrefs } = useUnitPreferences();
  const updateUnitPrefs = useUpdateUnitPreferences();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  // If user is admin, redirect to admin portal
  if (isAdmin) {
    return <Navigate to="/admin" replace />;
  }

  // Check if user is approved
  if (!isApproved) {
    return (
      <MainLayout>
        <div className="min-h-screen flex items-center justify-center bg-background">
          <Card className="max-w-md w-full mx-4">
            <CardHeader className="text-center">
              <div className="w-16 h-16 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Lock className="w-8 h-8 text-yellow-600" />
              </div>
              <CardTitle>Account Pending Approval</CardTitle>
              <CardDescription>
                Your account is awaiting approval from an administrator. You'll have access to settings once approved.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground text-center">
                Logged in as: {user?.email}
              </p>
              <div className="flex flex-col gap-2">
                <Button asChild className="w-full">
                  <Link to="/">
                    <Home className="w-4 h-4 mr-2" />
                    Go to Fan Selector
                  </Link>
                </Button>
                <Button variant="outline" className="w-full" onClick={signOut}>
                  <LogOut className="w-4 h-4 mr-2" />
                  Sign Out
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </MainLayout>
    );
  }

  const airflowUnitKeys = Object.keys(AIRFLOW_UNITS) as (keyof typeof AIRFLOW_UNITS)[];
  const pressureUnitKeys = Object.keys(PRESSURE_UNITS) as (keyof typeof PRESSURE_UNITS)[];
  const powerUnitKeys = Object.keys(POWER_UNITS) as (keyof typeof POWER_UNITS)[];

  return (
    <MainLayout>
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground flex items-center gap-3">
            <Settings className="w-8 h-8 text-primary" />
            User Settings
          </h1>
          <p className="text-muted-foreground mt-2">
            Manage your preferences and account settings
          </p>
        </div>

        <div className="grid gap-6">
          {/* Default Units */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Gauge className="w-5 h-5 text-primary" />
                Default Units
              </CardTitle>
              <CardDescription>
                Set your preferred units for airflow, pressure, and power measurements
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="space-y-2">
                  <Label htmlFor="airflow-unit" className="text-sm font-medium">
                    Airflow Unit
                  </Label>
                  <Select
                    value={unitPrefs?.airflowUnit || 'CMH'}
                    onValueChange={(value) => updateUnitPrefs.mutate({ airflowUnit: value as keyof typeof AIRFLOW_UNITS })}
                  >
                    <SelectTrigger id="airflow-unit">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {airflowUnitKeys.map((unit) => (
                        <SelectItem key={unit} value={unit}>
                          {AIRFLOW_UNITS[unit].label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="pressure-unit" className="text-sm font-medium">
                    Pressure Unit
                  </Label>
                  <Select
                    value={unitPrefs?.pressureUnit || 'Pa'}
                    onValueChange={(value) => updateUnitPrefs.mutate({ pressureUnit: value as keyof typeof PRESSURE_UNITS })}
                  >
                    <SelectTrigger id="pressure-unit">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {pressureUnitKeys.map((unit) => (
                        <SelectItem key={unit} value={unit}>
                          {PRESSURE_UNITS[unit].label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="power-unit" className="text-sm font-medium">
                    Power Unit
                  </Label>
                  <Select
                    value={unitPrefs?.powerUnit || 'kW'}
                    onValueChange={(value) => updateUnitPrefs.mutate({ powerUnit: value as 'kW' | 'HP' })}
                  >
                    <SelectTrigger id="power-unit">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {powerUnitKeys.map((unit) => (
                        <SelectItem key={unit} value={unit}>
                          {POWER_UNITS[unit].label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Change Password */}
          <ChangePassword />
        </div>
      </div>
    </MainLayout>
  );
}
