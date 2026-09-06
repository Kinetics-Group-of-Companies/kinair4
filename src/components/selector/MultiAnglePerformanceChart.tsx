import { useMemo, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceDot, ComposedChart, Area } from 'recharts';
import { FanPerformancePoint, AIRFLOW_UNITS, PRESSURE_UNITS, convertAirflow, convertPressure, BLADE_ANGLES } from '@/lib/fanData';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useSupabaseFanDatabase } from '@/hooks/useSupabaseFanDatabase';

interface MultiAnglePerformanceChartProps {
  diameter: number;
  bladeCount: number;
  airflowUnit: keyof typeof AIRFLOW_UNITS;
  pressureUnit: keyof typeof PRESSURE_UNITS;
  chartType: 'pressure' | 'power' | 'efficiency';
  selectedAngle?: number;
  operatingPoint?: FanPerformancePoint;
}

const ANGLE_COLORS = {
  20: 'hsl(0, 70%, 50%)',
  25: 'hsl(30, 70%, 50%)',
  30: 'hsl(60, 70%, 45%)',
  35: 'hsl(120, 70%, 40%)',
  40: 'hsl(180, 70%, 40%)',
  45: 'hsl(213, 94%, 50%)',
  50: 'hsl(270, 70%, 50%)',
};

export function MultiAnglePerformanceChart({ 
  diameter,
  bladeCount,
  airflowUnit, 
  pressureUnit,
  chartType,
  selectedAngle,
  operatingPoint
}: MultiAnglePerformanceChartProps) {
  const { database } = useSupabaseFanDatabase();
  const [showAllAngles, setShowAllAngles] = useState(true);
  const [singleAngle, setSingleAngle] = useState<number>(selectedAngle || 35);

  // Get performance data for the fan
  const fanData = useMemo(() => {
    const fan = database.fans.find(f => f.diameter === diameter);
    if (!fan) return null;
    const config = fan.bladeConfigurations.find(c => c.bladeCount === bladeCount);
    return config;
  }, [database, diameter, bladeCount]);

  // Build chart data for all angles or single angle
  const chartData = useMemo(() => {
    if (!fanData) return [];

    const anglesToShow = showAllAngles ? BLADE_ANGLES : [singleAngle];
    
    // Use first angle's airflow values as x-axis reference
    const referenceAngle = anglesToShow[0];
    const referenceData = fanData.performanceData[referenceAngle];
    
    if (!referenceData) return [];

    // Sort reference data by airflow ascending
    const sortedIndices = referenceData
      .map((point, index) => ({ airflow: point.airflow, index }))
      .sort((a, b) => a.airflow - b.airflow)
      .map(item => item.index);

    // Create combined data points in sorted order
    const dataPoints: any[] = sortedIndices.map(index => {
      const point = referenceData[index];
      const dataPoint: any = {
        airflow: convertAirflow(point.airflow, 'CMH', airflowUnit),
      };
      
      anglesToShow.forEach(angle => {
        const angleData = fanData.performanceData[angle];
        if (angleData && angleData[index]) {
          const key = chartType === 'pressure' 
            ? 'staticPressure' 
            : chartType === 'power' 
              ? 'shaftPower' 
              : 'efficiency';
          
          dataPoint[`angle_${angle}`] = chartType === 'pressure'
            ? convertPressure(angleData[index].staticPressure, 'Pa', pressureUnit)
            : angleData[index][key];
        }
      });
      
      return dataPoint;
    });

    return dataPoints;
  }, [fanData, showAllAngles, singleAngle, airflowUnit, pressureUnit, chartType]);

  const operatingPointData = operatingPoint && selectedAngle ? {
    airflow: convertAirflow(operatingPoint.airflow, 'CMH', airflowUnit),
    value: chartType === 'pressure'
      ? convertPressure(operatingPoint.staticPressure, 'Pa', pressureUnit)
      : chartType === 'power'
        ? operatingPoint.shaftPower
        : operatingPoint.efficiency,
  } : null;

  const getYAxisLabel = () => {
    switch (chartType) {
      case 'pressure': return PRESSURE_UNITS[pressureUnit].label;
      case 'power': return 'kW';
      case 'efficiency': return '%';
    }
  };

  const anglesToShow = showAllAngles ? BLADE_ANGLES : [singleAngle];

  if (!fanData) {
    return (
      <div className="h-[300px] flex items-center justify-center text-muted-foreground">
        No data available for this configuration
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Controls */}
      <div className="flex items-center gap-3">
        <Button
          variant={showAllAngles ? "kinair" : "outline"}
          size="sm"
          onClick={() => setShowAllAngles(true)}
        >
          All Angles (20°-50°)
        </Button>
        <Button
          variant={!showAllAngles ? "kinair" : "outline"}
          size="sm"
          onClick={() => setShowAllAngles(false)}
        >
          Single Curve
        </Button>
        {!showAllAngles && (
          <Select value={singleAngle.toString()} onValueChange={(v) => setSingleAngle(parseInt(v))}>
            <SelectTrigger className="w-[100px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {BLADE_ANGLES.map(angle => (
                <SelectItem key={angle} value={angle.toString()}>{angle}°</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Chart */}
      <div className="h-[300px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 10, right: 30, left: 10, bottom: 30 }}>
            <CartesianGrid 
              strokeDasharray="3 3" 
              stroke="hsl(210, 15%, 85%)" 
              vertical={false}
            />
            <XAxis 
              dataKey="airflow" 
              stroke="hsl(215, 15%, 45%)"
              fontSize={11}
              tickFormatter={(value) => value.toLocaleString()}
              label={{ 
                value: `Airflow (${AIRFLOW_UNITS[airflowUnit].label})`, 
                position: 'insideBottom', 
                offset: -15,
                fontSize: 11,
                fill: 'hsl(215, 15%, 45%)'
              }}
            />
            <YAxis 
              stroke="hsl(215, 15%, 45%)"
              fontSize={11}
              label={{ 
                value: getYAxisLabel(), 
                angle: -90, 
                position: 'insideLeft',
                fontSize: 11,
                fill: 'hsl(215, 15%, 45%)'
              }}
            />
            <Tooltip 
              contentStyle={{
                backgroundColor: 'hsl(0, 0%, 100%)',
                border: '1px solid hsl(214, 20%, 88%)',
                borderRadius: '8px',
                boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                fontSize: '12px',
              }}
              labelFormatter={(value) => `Airflow: ${value.toLocaleString()} ${AIRFLOW_UNITS[airflowUnit].label}`}
            />
            {showAllAngles && (
              <Legend 
                wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }}
                formatter={(value) => value.replace('angle_', '') + '°'}
              />
            )}
            {anglesToShow.map(angle => (
              <Line
                key={angle}
                type="monotone"
                dataKey={`angle_${angle}`}
                stroke={ANGLE_COLORS[angle as keyof typeof ANGLE_COLORS]}
                strokeWidth={selectedAngle === angle ? 3 : 1.5}
                dot={false}
                activeDot={{ r: 5, strokeWidth: 2, stroke: '#fff' }}
                name={`angle_${angle}`}
              />
            ))}
            {operatingPointData && selectedAngle && (
              <ReferenceDot
                x={operatingPointData.airflow}
                y={operatingPointData.value}
                r={10}
                fill="hsl(24, 95%, 53%)"
                stroke="#fff"
                strokeWidth={3}
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Legend for all angles mode */}
      {showAllAngles && (
        <div className="flex flex-wrap gap-2 justify-center">
          {BLADE_ANGLES.map(angle => (
            <div 
              key={angle} 
              className={`flex items-center gap-1 px-2 py-1 rounded text-xs ${
                selectedAngle === angle ? 'bg-primary/10 font-medium' : 'bg-muted/50'
              }`}
            >
              <div 
                className="w-3 h-[2px]" 
                style={{ backgroundColor: ANGLE_COLORS[angle as keyof typeof ANGLE_COLORS] }}
              />
              <span>{angle}°</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
