import { useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceDot, Area, ComposedChart } from 'recharts';
import { FanPerformancePoint, AIRFLOW_UNITS, PRESSURE_UNITS, convertAirflow, convertPressure } from '@/lib/fanData';

interface PerformanceChartProps {
  performanceData: FanPerformancePoint[];
  operatingPoint?: FanPerformancePoint;
  airflowUnit: keyof typeof AIRFLOW_UNITS;
  pressureUnit: keyof typeof PRESSURE_UNITS;
  chartType: 'pressure' | 'power' | 'efficiency';
}

export function PerformanceChart({ 
  performanceData, 
  operatingPoint,
  airflowUnit, 
  pressureUnit,
  chartType 
}: PerformanceChartProps) {
  const chartData = useMemo(() => {
    // Sort by airflow ascending and convert units
    return [...performanceData]
      .sort((a, b) => a.airflow - b.airflow)
      .map(point => ({
        airflow: convertAirflow(point.airflow, 'CMH', airflowUnit),
        staticPressure: convertPressure(point.staticPressure, 'Pa', pressureUnit),
        shaftPower: point.shaftPower,
        efficiency: point.efficiency,
      }));
  }, [performanceData, airflowUnit, pressureUnit]);

  const operatingPointData = operatingPoint ? {
    airflow: convertAirflow(operatingPoint.airflow, 'CMH', airflowUnit),
    staticPressure: convertPressure(operatingPoint.staticPressure, 'Pa', pressureUnit),
    shaftPower: operatingPoint.shaftPower,
    efficiency: operatingPoint.efficiency,
  } : null;

  const getChartConfig = () => {
    switch (chartType) {
      case 'pressure':
        return {
          dataKey: 'staticPressure',
          stroke: 'hsl(213, 94%, 50%)',
          fill: 'hsl(213, 94%, 50%)',
          name: `Static Pressure (${PRESSURE_UNITS[pressureUnit].label})`,
          yAxisLabel: PRESSURE_UNITS[pressureUnit].label,
        };
      case 'power':
        return {
          dataKey: 'shaftPower',
          stroke: 'hsl(24, 95%, 53%)',
          fill: 'hsl(24, 95%, 53%)',
          name: 'Shaft Power (kW)',
          yAxisLabel: 'kW',
        };
      case 'efficiency':
        return {
          dataKey: 'efficiency',
          stroke: 'hsl(142, 70%, 45%)',
          fill: 'hsl(142, 70%, 45%)',
          name: 'Total Efficiency (%)',
          yAxisLabel: '%',
        };
    }
  };

  const config = getChartConfig();

  // Calculate Y-axis domain based on data with 15% padding
  const yAxisDomain = useMemo(() => {
    if (chartData.length === 0) return [0, 100];
    const values = chartData.map(d => d[config.dataKey as keyof typeof d] as number).filter(v => v > 0);
    if (values.length === 0) return [0, 100];
    const maxValue = Math.max(...values);
    const paddedMax = maxValue * 1.15; // 15% padding
    return [0, Math.ceil(paddedMax)];
  }, [chartData, config.dataKey]);

  return (
    <div className="h-[280px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={chartData} margin={{ top: 10, right: 30, left: 10, bottom: 10 }}>
          <defs>
            <linearGradient id={`gradient-${chartType}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={config.stroke} stopOpacity={0.3} />
              <stop offset="100%" stopColor={config.stroke} stopOpacity={0.05} />
            </linearGradient>
          </defs>
          <CartesianGrid 
            strokeDasharray="3 3" 
            stroke="hsl(210, 15%, 85%)" 
            vertical={false}
          />
          <XAxis 
            dataKey="airflow" 
            stroke="hsl(215, 15%, 45%)"
            fontSize={11}
            tickFormatter={(value) => {
              if (value >= 1000) return Math.round(value).toLocaleString();
              if (value >= 100) return Math.round(value).toString();
              if (value >= 10) return value.toFixed(1);
              if (value >= 1) return value.toFixed(2);
              return value.toFixed(3);
            }}
            label={{ 
              value: `Airflow (${AIRFLOW_UNITS[airflowUnit].label})`, 
              position: 'insideBottom', 
              offset: -5,
              fontSize: 11,
              fill: 'hsl(215, 15%, 45%)'
            }}
          />
          <YAxis 
            domain={yAxisDomain}
            stroke="hsl(215, 15%, 45%)"
            fontSize={11}
            label={{ 
              value: config.yAxisLabel, 
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
            formatter={(value: number) => [
              typeof value === 'number' ? value.toFixed(2) : value,
              config.name
            ]}
            labelFormatter={(value) => `Airflow: ${value.toLocaleString()} ${AIRFLOW_UNITS[airflowUnit].label}`}
          />
          <Area
            type="monotone"
            dataKey={config.dataKey}
            stroke="none"
            fill={`url(#gradient-${chartType})`}
          />
          <Line
            type="monotone"
            dataKey={config.dataKey}
            stroke={config.stroke}
            strokeWidth={2.5}
            dot={false}
            activeDot={{ r: 6, fill: config.stroke, strokeWidth: 2, stroke: '#fff' }}
          />
          {operatingPointData && (
            <ReferenceDot
              x={operatingPointData.airflow}
              y={operatingPointData[config.dataKey as keyof typeof operatingPointData] as number}
              r={8}
              fill="hsl(24, 95%, 53%)"
              stroke="#fff"
              strokeWidth={3}
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
