import { useState, useEffect } from 'react';
import { Wind, Search, Filter, Loader2, Clock } from 'lucide-react';
import { AssistantLauncher } from '@/components/ai/AssistantLauncher';
import { FAN_SUGGESTIONS } from '@/components/ai/AssistantChat';
import { MainLayout } from '@/components/layout/MainLayout';
import { SelectionCriteriaPanel } from '@/components/selector/SelectionCriteriaPanel';
import { FanResultsTable } from '@/components/selector/FanResultsTable';
import { FanDetailsPanel } from '@/components/selector/FanDetailsPanel';
import { useSupabaseFanDatabase } from '@/hooks/useSupabaseFanDatabase';
import { useAllFanDimensions } from '@/hooks/useFanDatabase';
import { findOptimalSelections, FanSelection, AIRFLOW_UNITS, PRESSURE_UNITS, FireClass, AccessoryType, AtexRating, Frequency, FanSeries, MotorEfficiencyClass } from '@/lib/fanData';
import { toast } from 'sonner';
import { useAuth } from '@/lib/authContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useSearchParams } from 'react-router-dom';
import { GuestAccessPrompt } from '@/components/guest/GuestAccessPrompt';
import { GuestTrialBanner } from '@/components/guest/GuestTrialBanner';
import { AccountTrialBanner } from '@/components/trial/AccountTrialBanner';
import { useGuestTrial } from '@/lib/guestTrialContext';


export default function FanSelectorPage() {
  const { isAuthenticated, isApproved, isLoading: authLoading, isSuperAdmin, isAccountTrialActive } = useAuth();
  const { isGuest, trialActive, trialLoading } = useGuestTrial();
  const [searchParams] = useSearchParams();
  const { database, isLoading } = useSupabaseFanDatabase();
  const { data: dimensionsMap, isLoading: loadingDimensions } = useAllFanDimensions();
  const [selections, setSelections] = useState<FanSelection[]>([]);
  const [referenceNo, setReferenceNo] = useState('');
  const [selectedFan, setSelectedFan] = useState<FanSelection | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [airflowUnit, setAirflowUnit] = useState<keyof typeof AIRFLOW_UNITS>('CMH');
  const [pressureUnit, setPressureUnit] = useState<keyof typeof PRESSURE_UNITS>('Pa');
  const [searchCriteria, setSearchCriteria] = useState<{ airDensity: number; temperature: number; altitude: number }>({
    airDensity: 1.2,
    temperature: 20,
    altitude: 0,
  });
  
  // Update unit preferences when database loads
  useEffect(() => {
    if (database.unitPreferences) {
      setAirflowUnit(database.unitPreferences.airflowUnit);
      setPressureUnit(database.unitPreferences.pressureUnit);
    }
  }, [database.unitPreferences]);
  
  const handleSearch = (criteria: {
    airflow: number;
    airflowUnit: keyof typeof AIRFLOW_UNITS;
    pressure: number;
    pressureUnit: keyof typeof PRESSURE_UNITS;
    altitude: number;
    temperature: number;
    airDensity: number;
    fireClass: FireClass;
    accessory: AccessoryType;
    atexRating: AtexRating;
    efficiencyClass?: MotorEfficiencyClass;
    safetyFactor: number;
    frequency: Frequency;
    motorPole?: number | string;
    motorBrandId?: string;
    series?: FanSeries;
    seriesId?: string;
    toleranceMin: number;
    toleranceMax: number;
  }) => {
    // Validate input
    if (!criteria.airflow || criteria.airflow <= 0) {
      toast.error('Please enter a valid airflow value');
      return;
    }
    if (!criteria.pressure || criteria.pressure <= 0) {
      toast.error('Please enter a valid pressure value');
      return;
    }
    
    // Check if there are any fans in the database
    if (database.fans.length === 0) {
      toast.error('No fan models in database. Please add fans in the Admin Portal first.');
      setHasSearched(true);
      setSelections([]);
      return;
    }
    
    // Check if any fans have performance data - include zero airflow (shut-off) points for centrifugal/mixed flow
    const fansWithData = database.fans.filter(fan => 
      fan.bladeConfigurations.some(config => 
        Object.values(config.performanceData).some(perfArray => 
          perfArray.some(point => point.airflow >= 0 && point.staticPressure >= 0 && !(point.airflow === 0 && point.staticPressure === 0))
        )
      )
    );
    
    if (fansWithData.length === 0) {
      toast.error('Fan models exist but have no performance data. Please add performance data in the Admin Portal.');
      setHasSearched(true);
      setSelections([]);
      return;
    }
    
    setAirflowUnit(criteria.airflowUnit);
    setPressureUnit(criteria.pressureUnit);
    setSearchCriteria({
      airDensity: criteria.airDensity,
      temperature: criteria.temperature,
      altitude: criteria.altitude,
    });
    console.log('Search criteria:', criteria);
    console.log('Database fans:', database.fans.length, database.fans);
    
    const results = findOptimalSelections(database, {
      requiredAirflow: criteria.airflow,
      requiredPressure: criteria.pressure,
      airflowUnit: criteria.airflowUnit,
      pressureUnit: criteria.pressureUnit,
      fireClass: criteria.fireClass,
      accessory: criteria.accessory,
      atexRating: criteria.atexRating,
      efficiencyClass: criteria.efficiencyClass,
      safetyFactor: criteria.safetyFactor,
      frequency: criteria.frequency,
      motorPole: criteria.motorPole === undefined || criteria.motorPole === null || criteria.motorPole === '' ? undefined : Number(criteria.motorPole),
      motorBrandId: criteria.motorBrandId,
      series: criteria.series,
      seriesId: criteria.seriesId,
      toleranceMin: criteria.toleranceMin,
      toleranceMax: criteria.toleranceMax,
      airDensity: criteria.airDensity,
      temperature: criteria.temperature,
      dimensionsBySeriesAndSize: dimensionsMap, // Pass dimensions for motor frame filtering
    }, 50);
    
    console.log('Selection results:', results.length, results);
    setSelections(results);
    const wantedModel = (searchParams.get('model') || '').trim().toLowerCase();
    const preferred = wantedModel
      ? results.find((r) => `${r.nomenclature ?? ''} ${r.fanId ?? ''}`.toLowerCase().includes(wantedModel))
      : undefined;
    setSelectedFan(preferred || results[0] || null);
    setHasSearched(true);
    
    if (results.length === 0) {
      toast.info('No fans match your criteria. Try adjusting the tolerance range or requirements.');
    } else {
      toast.success(`Found ${results.length} matching fan${results.length > 1 ? 's' : ''}`);
    }
  };
  // Show loading state
  if (authLoading || isLoading || loadingDimensions || (isGuest && trialLoading)) {
    return (
      <MainLayout>
        <div className="min-h-[60vh] flex items-center justify-center">
          <div className="text-center">
            <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4 text-primary" />
            <p className="text-muted-foreground">Loading...</p>
          </div>
        </div>
      </MainLayout>
    );
  }

  // Visitors may start one IP-bound five-minute selection trial.
  if (!isAuthenticated) {
    return (
      <MainLayout>
        <GuestAccessPrompt productName="fan selector" />
      </MainLayout>
    );
  }

  // Show pending approval screen for unapproved users (except super admins)
  if (!isApproved && !isSuperAdmin && !isAccountTrialActive && !trialActive) {
    return (
      <MainLayout>
        <div className="min-h-[60vh] flex items-center justify-center">
          <div className="text-center max-w-md mx-auto p-8">
            <div className="w-20 h-20 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <Clock className="w-10 h-10 text-amber-600" />
            </div>
            <h2 className="text-2xl font-bold mb-3">Approval Pending</h2>
            <p className="text-muted-foreground mb-4">
              Your account is awaiting admin approval. You'll receive access once your request is reviewed.
            </p>
            <p className="text-sm text-muted-foreground">
              This usually takes 1-2 business days. Contact the administrator if you need urgent access.
            </p>
          </div>
        </div>
      </MainLayout>
    );
  }

  return <MainLayout>
      <GuestTrialBanner />
      <AccountTrialBanner />
      {/* Hero Section */}
      <section className="bg-gradient-primary text-primary-foreground py-8">
        <div className="container mx-auto px-4">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 bg-primary-foreground/20 rounded-2xl flex items-center justify-center">
              <Wind className="w-7 h-7" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">{database.companyName} Fan Selector</h1>
              <p className="text-primary-foreground/80 text-sm mt-1">
                Find the optimal fan for your ventilation requirements
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Main Content - Vertical Stacked Layout */}
      <section className="container mx-auto px-4 py-6 flex-1">
        <div className="flex flex-col gap-4">
          
          {/* Row 1 - Selection Criteria (horizontal content) */}
          <div className="kinair-card p-4 md:p-5">
            <div className="max-w-md space-y-1.5">
              <Label>Reference No. / Tag</Label>
              <Input value={referenceNo} onChange={(e) => setReferenceNo(e.target.value)} placeholder="e.g. EF-01 / FAN-01" />
              <p className="text-[11px] text-muted-foreground">Optional. Printed on the datasheet and carried into Selection Assistant/project documents.</p>
            </div>
          </div>
          <div className="w-full">
            <SelectionCriteriaPanel
              onSearch={handleSearch}
              horizontal
              initialAirflow={searchParams.get('airflow') ?? undefined}
              initialPressure={searchParams.get('pressure') ?? undefined}
              autoSearch={!!searchParams.get('airflow') && !!searchParams.get('pressure')}
            />
          </div>

          {/* Row 2 - Fan Results Table */}
          <div className="w-full">
            <div className="kinair-card p-4 md:p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg md:text-xl font-bold text-foreground flex items-center gap-2 md:gap-3">
                  <Search className="w-4 h-4 md:w-5 md:h-5 text-primary" />
                  Fan Selections
                </h2>
                {selections.length > 0 && (
                  <span className="kinair-badge kinair-badge-primary text-xs md:text-sm px-2 md:px-3 py-1">
                    {selections.length} matches
                  </span>
                )}
              </div>

              {!hasSearched ? (
                <div className="text-center py-8 md:py-12 text-muted-foreground">
                  <Wind className="w-12 h-12 md:w-16 md:h-16 mx-auto mb-4 opacity-30" />
                  <p className="text-sm md:text-base">Enter your requirements and click "Find Fans" to see optimal selections</p>
                </div>
              ) : selections.length === 0 ? (
                <div className="text-center py-8 md:py-12 text-muted-foreground">
                  <Filter className="w-12 h-12 md:w-16 md:h-16 mx-auto mb-4 opacity-30" />
                  <p className="text-sm md:text-base">No fans match your criteria. Try adjusting the requirements.</p>
                </div>
              ) : (
                <FanResultsTable 
                  selections={selections} 
                  airflowUnit={airflowUnit} 
                  pressureUnit={pressureUnit} 
                  onSelect={setSelectedFan} 
                  selectedFan={selectedFan} 
                />
              )}
            </div>
          </div>

          {/* Row 3 - Fan Details/Curve */}
          <div className="w-full">
            {selectedFan ? (
              <FanDetailsPanel 
                selection={selectedFan} 
                airflowUnit={airflowUnit} 
                pressureUnit={pressureUnit} 
                airDensity={searchCriteria.airDensity} 
                temperature={searchCriteria.temperature} 
                altitude={searchCriteria.altitude}
                referenceNo={referenceNo}
              />
            ) : (
              <div className="kinair-card p-6 md:p-8 text-center">
                <div className="flex flex-col md:flex-row items-center justify-center gap-4">
                  <div className="w-16 h-16 md:w-20 md:h-20 bg-muted rounded-2xl flex items-center justify-center">
                    <Wind className="w-8 h-8 md:w-10 md:h-10 text-muted-foreground" />
                  </div>
                  <div className="text-center md:text-left">
                    <h3 className="text-base md:text-lg font-semibold text-foreground mb-1">Fan Details</h3>
                    <p className="text-xs md:text-sm text-muted-foreground max-w-sm">
                      Select a fan from the results to view detailed performance curves, noise data, and specifications.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
          
        </div>
      </section>
    
      <AssistantLauncher context="fan" title="Ask KINAIR" suggestions={FAN_SUGGESTIONS} />
</MainLayout>;
}