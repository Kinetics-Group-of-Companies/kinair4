import { useState } from 'react';
import { Calculator, Wind, Gauge, Thermometer, RefreshCw, PipetteIcon } from 'lucide-react';
import { ESPCalculator } from '@/components/calculator/ESPCalculator';
import { MainLayout } from '@/components/layout/MainLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  AIRFLOW_UNITS, 
  PRESSURE_UNITS, 
  convertAirflow, 
  convertPressure, 
  calculateAirDensity,
  getMotorRPM,
  MOTOR_POLES,
  Frequency
} from '@/lib/fanData';

export default function CalculatorPage() {
  // Unit Converter State
  const [airflowValue, setAirflowValue] = useState('1000');
  const [airflowFrom, setAirflowFrom] = useState<keyof typeof AIRFLOW_UNITS>('CMH');
  const [airflowTo, setAirflowTo] = useState<keyof typeof AIRFLOW_UNITS>('CFM');
  
  const [pressureValue, setPressureValue] = useState('100');
  const [pressureFrom, setPressureFrom] = useState<keyof typeof PRESSURE_UNITS>('Pa');
  const [pressureTo, setPressureTo] = useState<keyof typeof PRESSURE_UNITS>('inwg');

  // Air Density State
  const [densityTemp, setDensityTemp] = useState('20');
  const [densityAlt, setDensityAlt] = useState('0');

  // RPM Calculator State
  const [rpmPole, setRpmPole] = useState<number>(4);
  const [rpmFreq, setRpmFreq] = useState<Frequency>(50);

  const convertedAirflow = convertAirflow(Number(airflowValue) || 0, airflowFrom, airflowTo);
  const convertedPressure = convertPressure(Number(pressureValue) || 0, pressureFrom, pressureTo);
  const calculatedDensity = calculateAirDensity(Number(densityAlt) || 0, Number(densityTemp) || 20);
  const calculatedRPM = getMotorRPM(rpmPole, rpmFreq);

  return (
    <MainLayout>
      {/* Hero Section */}
      <section className="bg-gradient-primary text-primary-foreground py-10">
        <div className="container mx-auto px-4">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 bg-primary-foreground/20 rounded-2xl flex items-center justify-center">
              <Calculator className="w-8 h-8" />
            </div>
            <div>
              <h1 className="text-3xl font-bold">Engineering Calculator</h1>
              <h2 className="sr-only">Ventilation unit conversion and calculation tools</h2>
              <p className="text-primary-foreground/80 mt-1">
                Unit conversions and ventilation calculations
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Calculator Content */}
      <section className="container mx-auto px-4 py-8">
        <Tabs defaultValue="units" className="space-y-6">
          <TabsList className="grid w-full max-w-lg grid-cols-2 sm:grid-cols-4">
            <TabsTrigger value="units">Unit Converter</TabsTrigger>
            <TabsTrigger value="density">Air Density</TabsTrigger>
            <TabsTrigger value="rpm">Motor RPM</TabsTrigger>
            <TabsTrigger value="esp" className="gap-1">
              <PipetteIcon className="w-3 h-3" />
              ESP
            </TabsTrigger>
          </TabsList>

          {/* Unit Converter */}
          <TabsContent value="units">
            <div className="grid md:grid-cols-2 gap-6">
              {/* Airflow Converter */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Wind className="w-5 h-5 text-primary" />
                    Airflow Converter
                  </CardTitle>
                  <CardDescription>Convert between airflow units</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <Label className="text-xs text-muted-foreground">Value</Label>
                      <Input
                        type="number"
                        value={airflowValue}
                        onChange={(e) => setAirflowValue(e.target.value)}
                        className="mt-1"
                      />
                    </div>
                    <div className="w-[120px]">
                      <Label className="text-xs text-muted-foreground">From</Label>
                      <Select value={airflowFrom} onValueChange={(v) => setAirflowFrom(v as keyof typeof AIRFLOW_UNITS)}>
                        <SelectTrigger className="mt-1">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(AIRFLOW_UNITS).map(([key, { label }]) => (
                            <SelectItem key={key} value={key}>{label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  
                  <div className="flex items-center justify-center">
                    <RefreshCw className="w-5 h-5 text-muted-foreground" />
                  </div>
                  
                  <div className="flex gap-2">
                    <div className="flex-1 bg-muted/50 rounded-lg p-3 border">
                      <Label className="text-xs text-muted-foreground">Result</Label>
                      <div className="text-2xl font-mono font-bold text-primary mt-1">
                        {convertedAirflow.toLocaleString()}
                      </div>
                    </div>
                    <div className="w-[120px]">
                      <Label className="text-xs text-muted-foreground">To</Label>
                      <Select value={airflowTo} onValueChange={(v) => setAirflowTo(v as keyof typeof AIRFLOW_UNITS)}>
                        <SelectTrigger className="mt-1">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(AIRFLOW_UNITS).map(([key, { label }]) => (
                            <SelectItem key={key} value={key}>{label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Pressure Converter */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Gauge className="w-5 h-5 text-primary" />
                    Pressure Converter
                  </CardTitle>
                  <CardDescription>Convert between pressure units</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <Label className="text-xs text-muted-foreground">Value</Label>
                      <Input
                        type="number"
                        value={pressureValue}
                        onChange={(e) => setPressureValue(e.target.value)}
                        className="mt-1"
                      />
                    </div>
                    <div className="w-[120px]">
                      <Label className="text-xs text-muted-foreground">From</Label>
                      <Select value={pressureFrom} onValueChange={(v) => setPressureFrom(v as keyof typeof PRESSURE_UNITS)}>
                        <SelectTrigger className="mt-1">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(PRESSURE_UNITS).map(([key, { label }]) => (
                            <SelectItem key={key} value={key}>{label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  
                  <div className="flex items-center justify-center">
                    <RefreshCw className="w-5 h-5 text-muted-foreground" />
                  </div>
                  
                  <div className="flex gap-2">
                    <div className="flex-1 bg-muted/50 rounded-lg p-3 border">
                      <Label className="text-xs text-muted-foreground">Result</Label>
                      <div className="text-2xl font-mono font-bold text-primary mt-1">
                        {convertedPressure.toLocaleString()}
                      </div>
                    </div>
                    <div className="w-[120px]">
                      <Label className="text-xs text-muted-foreground">To</Label>
                      <Select value={pressureTo} onValueChange={(v) => setPressureTo(v as keyof typeof PRESSURE_UNITS)}>
                        <SelectTrigger className="mt-1">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(PRESSURE_UNITS).map(([key, { label }]) => (
                            <SelectItem key={key} value={key}>{label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Air Density Calculator */}
          <TabsContent value="density">
            <Card className="max-w-md">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Thermometer className="w-5 h-5 text-primary" />
                  Air Density Calculator
                </CardTitle>
                <CardDescription>Calculate air density based on conditions</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-xs text-muted-foreground">Temperature (°C)</Label>
                    <Input
                      type="number"
                      value={densityTemp}
                      onChange={(e) => setDensityTemp(e.target.value)}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Altitude (m)</Label>
                    <Input
                      type="number"
                      value={densityAlt}
                      onChange={(e) => setDensityAlt(e.target.value)}
                      className="mt-1"
                    />
                  </div>
                </div>
                
                <div className="bg-muted/50 rounded-lg p-4 border text-center">
                  <Label className="text-xs text-muted-foreground">Air Density</Label>
                  <div className="text-3xl font-mono font-bold text-primary mt-2">
                    {calculatedDensity} kg/m³
                  </div>
                </div>
                
                <p className="text-xs text-muted-foreground">
                  Standard conditions: 20°C at sea level = 1.2 kg/m³
                </p>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Motor RPM Calculator */}
          <TabsContent value="rpm">
            <Card className="max-w-md">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <RefreshCw className="w-5 h-5 text-primary" />
                  Motor RPM Calculator
                </CardTitle>
                <CardDescription>Calculate motor speed based on poles and frequency</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-xs text-muted-foreground">Motor Poles</Label>
                    <Select value={rpmPole.toString()} onValueChange={(v) => setRpmPole(parseInt(v))}>
                      <SelectTrigger className="mt-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {MOTOR_POLES.map(pole => (
                          <SelectItem key={pole} value={pole.toString()}>{pole}P</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Frequency</Label>
                    <Select value={rpmFreq.toString()} onValueChange={(v) => setRpmFreq(parseInt(v) as Frequency)}>
                      <SelectTrigger className="mt-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="50">50 Hz</SelectItem>
                        <SelectItem value="60">60 Hz</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                
                <div className="bg-muted/50 rounded-lg p-4 border text-center">
                  <Label className="text-xs text-muted-foreground">Motor Speed</Label>
                  <div className="text-3xl font-mono font-bold text-primary mt-2">
                    {calculatedRPM} RPM
                  </div>
                </div>
                
                <p className="text-xs text-muted-foreground">
                  Calculated with ~4% slip factor from synchronous speed
                </p>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ESP Calculator */}
          <TabsContent value="esp">
            <ESPCalculator />
          </TabsContent>
        </Tabs>
      </section>
    </MainLayout>
  );
}
