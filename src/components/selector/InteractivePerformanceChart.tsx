import React, { useMemo, useCallback, useRef, useState, useEffect } from 'react';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, 
  ResponsiveContainer, ReferenceDot, Area, ComposedChart, ReferenceLine, ReferenceArea
} from 'recharts';
import { FanPerformancePoint, AIRFLOW_UNITS, PRESSURE_UNITS, convertAirflow, convertPressure, roundAirflowForDisplay, calculateTotalEfficiency } from '@/lib/fanData';
import { Button } from '@/components/ui/button';
import { ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';

interface FamilyCurveData {
  angle: number;
  data: FanPerformancePoint[];
}

interface BaseCurveData {
  label: string;
  data: FanPerformancePoint[];
  operatingPoint?: FanPerformancePoint;
}

interface AdjustedCurveData {
  label: string; // e.g., "45Hz" or "180V"
}

interface InteractivePerformanceChartProps {
  performanceData: FanPerformancePoint[];
  operatingPoint?: FanPerformancePoint;
  requiredDutyPoint?: { airflow: number; pressure: number }; // The actual requirement
  airflowUnit: keyof typeof AIRFLOW_UNITS;
  pressureUnit: keyof typeof PRESSURE_UNITS;
  chartType: 'pressure' | 'power' | 'efficiency';
  onDutyPointChange?: (point: { airflow: number; pressure: number }) => void;
  onAngleSelect?: (angle: number, clickedPoint?: { airflow: number; pressure: number }) => void;
  interactive?: boolean;
  showSystemCurve?: boolean;
  showStallZone?: boolean;
  familyCurveData?: FamilyCurveData[];
  selectedAngle?: number;
  chartContainerRef?: React.RefObject<HTMLDivElement>; // Ref for chart capture
  baseCurveData?: BaseCurveData; // Base frequency curve for comparison (50Hz when VFD active)
  adjustedCurveData?: AdjustedCurveData; // Label for the adjusted curve (VFD/voltage)
  // New: external control of duty point (sync with parent's customDutyPoint)
  externalDutyPoint?: { airflow: number; pressure: number } | null;
  // Used to derive TOTAL efficiency when the performance data has no efficiency values
  fanDiameter?: number;
  airDensity?: number;
}

export function InteractivePerformanceChart({ 
  performanceData, 
  operatingPoint,
  requiredDutyPoint,
  airflowUnit, 
  pressureUnit,
  chartType,
  onDutyPointChange,
  onAngleSelect, // Now accepts (angle: number, clickedPoint?: { airflow: number; pressure: number })
  interactive = false,
  showSystemCurve = true,
  showStallZone = false,
  familyCurveData,
  selectedAngle,
  chartContainerRef,
  baseCurveData,
  adjustedCurveData,
  externalDutyPoint,
  fanDiameter,
  airDensity = 1.2,
}: InteractivePerformanceChartProps) {
  // Total efficiency for a raw (CMH/Pa) performance point: use the stored value,
  // otherwise derive it from airflow, total pressure (static + dynamic) and shaft power.
  const effOf = useCallback((point: FanPerformancePoint): number | undefined => {
    if (point.efficiency && point.efficiency > 0) return point.efficiency;
    return calculateTotalEfficiency(point.airflow, point.staticPressure, point.shaftPower, fanDiameter || 0, airDensity);
  }, [fanDiameter, airDensity]);
  const chartRef = useRef<any>(null);
  const [hoverPoint, setHoverPoint] = useState<{ x: number; y: number } | null>(null);
  // Live axis maxima used to convert pointer pixels back to data values
  const xMaxRef = useRef(100);
  const yMaxRef = useRef(100);
  const isDraggingRef = useRef(false);
  const [interactiveDutyPoint, setInteractiveDutyPoint] = useState<{ airflow: number; pressure: number } | null>(null);
  
  // Sync with external duty point from parent (reset when parent resets)
  useEffect(() => {
    if (externalDutyPoint === null) {
      // Parent reset - clear local interactive duty point
      setInteractiveDutyPoint(null);
    } else if (externalDutyPoint) {
      // Parent set a new duty point - convert to display units and sync
      const displayAirflow = convertAirflow(externalDutyPoint.airflow, 'CMH', airflowUnit);
      const displayPressure = convertPressure(externalDutyPoint.pressure, 'Pa', pressureUnit);
      setInteractiveDutyPoint({ airflow: displayAirflow, pressure: displayPressure });
    }
  }, [externalDutyPoint, airflowUnit, pressureUnit]);
  
  // Zoom state: 1.0 = default, >1 = zoomed in, <1 = zoomed out
  const [zoomLevel, setZoomLevel] = useState<number>(1.0);
  const MIN_ZOOM = 0.5;
  const MAX_ZOOM = 3.0;
  const ZOOM_STEP = 0.25;
  
  const handleZoomIn = useCallback(() => {
    setZoomLevel(prev => Math.min(MAX_ZOOM, prev + ZOOM_STEP));
  }, []);
  
  const handleZoomOut = useCallback(() => {
    setZoomLevel(prev => Math.max(MIN_ZOOM, prev - ZOOM_STEP));
  }, []);
  
  const handleZoomReset = useCallback(() => {
    setZoomLevel(1.0);
  }, []);

  // Family curve colors
  const familyCurveColors = [
    'hsl(280, 70%, 50%)', // Purple
    'hsl(180, 70%, 45%)', // Teal
    'hsl(45, 90%, 50%)',  // Gold
    'hsl(330, 70%, 50%)', // Pink
    'hsl(120, 60%, 45%)', // Green
    'hsl(200, 70%, 50%)', // Sky blue
  ];

  // Sort by airflow ascending, convert units, and trim to stable region (right of peak pressure)
  // OEM standard: Only show the stable operating region to avoid overlapping curves
  const chartData = useMemo(() => {
    const data = [...performanceData]
      .sort((a, b) => a.airflow - b.airflow)
      .map(point => ({
        airflow: convertAirflow(point.airflow, 'CMH', airflowUnit),
        staticPressure: convertPressure(point.staticPressure, 'Pa', pressureUnit),
        shaftPower: point.shaftPower,
        efficiency: effOf(point),
      }));
    
    // Find peak pressure point (stall point)
    let peakIndex = 0;
    let peakPressure = -Infinity;
    for (let i = 0; i < data.length; i++) {
      if (data[i].staticPressure > peakPressure) {
        peakPressure = data[i].staticPressure;
        peakIndex = i;
      }
    }
    
    // Return only stable region (from peak to max airflow)
    const stableData = data.slice(peakIndex);
    
    // Log actual data points being used
    if (stableData.length > 0) {
      console.log('CHART DATA POINTS (stable region only):', {
        count: stableData.length,
        first: stableData[0],
        last: stableData[stableData.length - 1],
        peakPressure,
        trimmedPoints: peakIndex
      });
    }
    
    return stableData;
  }, [performanceData, airflowUnit, pressureUnit, effOf]);

  // Convert family curve data to display units.
  // Each curve is cleaned the same way as the main curve: sorted by airflow,
  // duplicate airflows removed and trimmed to the stable region (peak pressure
  // onwards) so the family of curves reads cleanly without stall-side crossings.
  const convertedFamilyData = useMemo(() => {
    if (!familyCurveData) return undefined;

    return familyCurveData
      .map(curve => {
        const seen = new Set<number>();
        const data = [...curve.data]
          .filter(p => p && Number.isFinite(p.airflow) && Number.isFinite(p.staticPressure))
          .sort((a, b) => a.airflow - b.airflow)
          .filter(p => {
            if (seen.has(p.airflow)) return false;
            seen.add(p.airflow);
            return true;
          })
          .map(point => ({
            airflow: convertAirflow(point.airflow, 'CMH', airflowUnit),
            staticPressure: convertPressure(point.staticPressure, 'Pa', pressureUnit),
            shaftPower: point.shaftPower,
            efficiency: effOf(point),
          }));

        // Trim to stable region (from peak pressure to max airflow)
        let peakIndex = 0;
        let peakPressure = -Infinity;
        for (let i = 0; i < data.length; i++) {
          if (data[i].staticPressure > peakPressure) {
            peakPressure = data[i].staticPressure;
            peakIndex = i;
          }
        }

        return { angle: curve.angle, data: data.slice(peakIndex) };
      })
      .filter(curve => curve.data.length > 1)
      .sort((a, b) => a.angle - b.angle);
  }, [familyCurveData, airflowUnit, pressureUnit, effOf]);

  // Convert base curve data (50Hz reference) to display units
  const convertedBaseCurveData = useMemo(() => {
    if (!baseCurveData || !baseCurveData.data || baseCurveData.data.length === 0) return undefined;
    
    const data = [...baseCurveData.data]
      .sort((a, b) => a.airflow - b.airflow)
      .map(point => ({
        airflow: convertAirflow(point.airflow, 'CMH', airflowUnit),
        staticPressure: convertPressure(point.staticPressure, 'Pa', pressureUnit),
        shaftPower: point.shaftPower,
        efficiency: effOf(point),
      }));
    
    // Find peak and trim to stable region
    let peakIndex = 0;
    let peakPressure = -Infinity;
    for (let i = 0; i < data.length; i++) {
      if (data[i].staticPressure > peakPressure) {
        peakPressure = data[i].staticPressure;
        peakIndex = i;
      }
    }
    
    return {
      label: baseCurveData.label,
      data: data.slice(peakIndex),
      operatingPoint: baseCurveData.operatingPoint ? {
        airflow: convertAirflow(baseCurveData.operatingPoint.airflow, 'CMH', airflowUnit),
        staticPressure: convertPressure(baseCurveData.operatingPoint.staticPressure, 'Pa', pressureUnit),
        shaftPower: baseCurveData.operatingPoint.shaftPower,
        efficiency: effOf(baseCurveData.operatingPoint),
      } : undefined,
    };
  }, [baseCurveData, airflowUnit, pressureUnit, effOf]);

  const operatingPointData = operatingPoint ? {
    airflow: convertAirflow(operatingPoint.airflow, 'CMH', airflowUnit),
    staticPressure: convertPressure(operatingPoint.staticPressure, 'Pa', pressureUnit),
    shaftPower: operatingPoint.shaftPower,
    efficiency: effOf(operatingPoint),
  } : null;

  // Convert required duty point to display units
  const requiredPointData = useMemo(() => {
    if (!requiredDutyPoint || requiredDutyPoint.airflow <= 0 || requiredDutyPoint.pressure <= 0) {
      return null;
    }
    return {
      airflow: convertAirflow(requiredDutyPoint.airflow, 'CMH', airflowUnit),
      pressure: convertPressure(requiredDutyPoint.pressure, 'Pa', pressureUnit),
    };
  }, [requiredDutyPoint, airflowUnit, pressureUnit]);

  // Calculate system curve constant k = P / Q^2
  // System curve represents the actual system resistance - it passes through the OPERATING point
  // NOT the requested point. The operating point is where the fan actually runs on the curve.
  const systemCurveK = useMemo(() => {
    // Priority: INTERACTIVE > OPERATING > fallback to required
    // System curve MUST go through the operating point (orange dot), not requested (red dot)
    let dutyPoint = null;
    let source = 'none';
    
    if (interactiveDutyPoint && interactiveDutyPoint.airflow > 0 && interactiveDutyPoint.pressure > 0) {
      dutyPoint = interactiveDutyPoint;
      source = 'INTERACTIVE';
    } else if (operatingPointData && operatingPointData.airflow > 0 && operatingPointData.staticPressure > 0) {
      // USE OPERATING POINT (orange dot) - this is where the fan actually operates
      dutyPoint = {
        airflow: operatingPointData.airflow,
        pressure: operatingPointData.staticPressure,
      };
      source = 'OPERATING';
    } else if (requiredPointData) {
      // Fallback only if no operating point available
      dutyPoint = requiredPointData;
      source = 'REQUIRED (fallback)';
    }
    
    console.log('=== SYSTEM CURVE K ===', { source, dutyPoint });
    
    if (!dutyPoint || dutyPoint.airflow <= 0) return null;
    return dutyPoint.pressure / (dutyPoint.airflow * dutyPoint.airflow);
  }, [interactiveDutyPoint, operatingPointData, requiredPointData]);

  // The active duty point for display (the point where system curve passes through fan curve)
  const activeDutyPoint = useMemo(() => {
    // Active duty point should also be the operating point (orange), not required (red)
    return interactiveDutyPoint || (operatingPointData ? {
      airflow: operatingPointData.airflow,
      pressure: operatingPointData.staticPressure,
    } : null) || requiredPointData;
  }, [interactiveDutyPoint, operatingPointData, requiredPointData]);

  // Removed redundant debug log - key debug info is now in systemCurveK useMemo

  // Calculate optimal axis bounds based on ACTUAL data points
  // Use exact min/max from data - no extrapolation or padding
  // IMPORTANT: Include requiredDutyPoint to prevent visual shifting when VFD changes scale
  const optimalAxisBounds = useMemo(() => {
    // Get ACTUAL airflow range from data (min to max)
    const fanAirflows = chartData.map(d => d.airflow).filter(v => v >= 0);
    const fanPressures = chartData.map(d => d.staticPressure).filter(v => v >= 0);
    
    let minFanAirflow = fanAirflows.length > 0 ? Math.min(...fanAirflows) : 0;
    let maxFanAirflow = fanAirflows.length > 0 ? Math.max(...fanAirflows) : 1000;
    let maxFanPressure = fanPressures.length > 0 ? Math.max(...fanPressures) : 200;
    
    // Also check family curves for their actual data range
    if (convertedFamilyData) {
      convertedFamilyData.forEach(curve => {
        const curveAirflows = curve.data.map(d => d.airflow).filter(v => v >= 0);
        const curvePressures = curve.data.map(d => d.staticPressure).filter(v => v >= 0);
        if (curveAirflows.length > 0) {
          minFanAirflow = Math.min(minFanAirflow, Math.min(...curveAirflows));
          maxFanAirflow = Math.max(maxFanAirflow, Math.max(...curveAirflows));
        }
        if (curvePressures.length > 0) {
          maxFanPressure = Math.max(maxFanPressure, Math.max(...curvePressures));
        }
      });
    }
    
    // Also check base curve data for proper scaling
    if (convertedBaseCurveData && convertedBaseCurveData.data.length > 0) {
      const baseAirflows = convertedBaseCurveData.data.map(d => d.airflow).filter(v => v >= 0);
      const basePressures = convertedBaseCurveData.data.map(d => d.staticPressure).filter(v => v >= 0);
      if (baseAirflows.length > 0) {
        maxFanAirflow = Math.max(maxFanAirflow, Math.max(...baseAirflows));
      }
      if (basePressures.length > 0) {
        maxFanPressure = Math.max(maxFanPressure, Math.max(...basePressures));
      }
    }
    
    // CRITICAL: Include required duty point in axis bounds to prevent visual shifting
    // When VFD is active, the curve scales down but the required point must stay at correct position
    if (requiredPointData) {
      maxFanAirflow = Math.max(maxFanAirflow, requiredPointData.airflow * 1.05); // 5% padding
      maxFanPressure = Math.max(maxFanPressure, requiredPointData.pressure * 1.1); // 10% padding
    }
    
    // Start X-axis from 0 for proper visualization
    // Use actual max airflow from data (no padding - curves should reach edge)
    return { 
      minAirflow: 0, 
      maxAirflow: maxFanAirflow, 
      maxPressure: maxFanPressure 
    };
  }, [chartData, convertedFamilyData, convertedBaseCurveData, requiredPointData]);

  // Apply zoom to axis bounds
  const zoomedAxisBounds = useMemo(() => {
    // Zoom works by reducing the visible range
    // At zoom 1.0, show full optimalAxisBounds
    // At zoom 2.0, show half the range (centered on operating point if available)
    const baseMaxAirflow = optimalAxisBounds.maxAirflow;
    const baseMaxPressure = optimalAxisBounds.maxPressure;
    
    const zoomedMaxAirflow = baseMaxAirflow / zoomLevel;
    const zoomedMaxPressure = baseMaxPressure / zoomLevel;
    
    return { maxAirflow: zoomedMaxAirflow, maxPressure: zoomedMaxPressure };
  }, [optimalAxisBounds, zoomLevel]);

  // Add origin point and system curve data
  // System curve must start from (0,0) to connect at axis intersection
  const combinedChartData = useMemo(() => {
    const maxPressure = optimalAxisBounds.maxPressure * 1.5;
    
    // For non-pressure charts, use raw chartData as-is
    if (chartType !== 'pressure' || chartData.length < 2) {
      return chartData;
    }
    
    // Start with origin point for system curve (0, 0)
    const result: any[] = [];
    
    // Add origin point - system curve starts at (0,0)
    if (showSystemCurve && systemCurveK !== null) {
      result.push({
        airflow: 0,
        staticPressure: null, // No fan curve data at 0
        shaftPower: null,
        efficiency: null,
        systemPressure: 0, // System curve starts at origin (P = k * 0^2 = 0)
      });
    }
    
    // Add all data points with system curve
    chartData.forEach(dataPoint => {
      const point: any = {
        airflow: dataPoint.airflow,
        staticPressure: dataPoint.staticPressure,
        shaftPower: dataPoint.shaftPower,
        efficiency: dataPoint.efficiency,
      };
      
      // Calculate system pressure (parabola: P = k * Q^2)
      if (showSystemCurve && systemCurveK !== null) {
        const sysPressure = systemCurveK * dataPoint.airflow * dataPoint.airflow;
        point.systemPressure = sysPressure <= maxPressure ? sysPressure : null;
      }
      
      result.push(point);
    });

    // Recharts interpolates between catalogue airflow samples. If the operating
    // airflow lies between two samples, the rendered system curve can visually
    // miss the marker even though k was calculated from that point. Insert the
    // exact anchor so the blue curve always passes through the dot centre.
    if (showSystemCurve && systemCurveK !== null && activeDutyPoint) {
      const anchorIndex = result.findIndex(point =>
        Math.abs(point.airflow - activeDutyPoint.airflow) < 0.000001
      );

      if (anchorIndex >= 0) {
        result[anchorIndex].systemPressure = activeDutyPoint.pressure;
      } else {
        result.push({
          airflow: activeDutyPoint.airflow,
          staticPressure: null,
          shaftPower: null,
          efficiency: null,
          systemPressure: activeDutyPoint.pressure,
        });
        result.sort((a, b) => a.airflow - b.airflow);
      }
    }
    
    console.log('Combined Chart Data:', {
      points: result.length,
      first: result[0],
      last: result[result.length - 1],
      maxPressureInData: Math.max(...result.map(r => r.staticPressure || 0))
    });
    
    return result;
  }, [chartData, systemCurveK, chartType, showSystemCurve, optimalAxisBounds, activeDutyPoint]);

  // Calculate stall zone boundary using ORIGINAL performance data (not trimmed chartData)
  // The stall zone is typically at LOW airflow (left side of curve) where:
  // - Pressure curve peaks and starts to become unstable
  // - Efficiency is very low
  // For axial fans, stall occurs when airflow drops below ~20-30% of max
  const stallZoneBoundary = useMemo(() => {
    if (!showStallZone || chartType !== 'pressure' || performanceData.length < 3) return null;
    
    // Use original performance data (before trimming) to find actual peak/stall point
    const fullData = [...performanceData]
      .sort((a, b) => a.airflow - b.airflow)
      .map(point => ({
        airflow: convertAirflow(point.airflow, 'CMH', airflowUnit),
        staticPressure: convertPressure(point.staticPressure, 'Pa', pressureUnit),
      }));
    
    if (fullData.length < 3) return null;
    
    const minAirflow = fullData[0]?.airflow || 0;
    const maxAirflow = fullData[fullData.length - 1]?.airflow || 100;
    
    // Find where the pressure curve peaks (highest pressure point)
    // Stall typically starts at or just after the peak pressure
    let peakPressureIdx = 0;
    let peakPressure = 0;
    fullData.forEach((point, idx) => {
      if (point.staticPressure > peakPressure) {
        peakPressure = point.staticPressure;
        peakPressureIdx = idx;
      }
    });
    
    // The stall boundary is at the peak pressure point's airflow
    const peakAirflow = fullData[peakPressureIdx]?.airflow || minAirflow;
    
    // The stall zone extends from 0 to the peak airflow
    // Add a small buffer (5%) past peak for safety margin
    const stallBoundaryAirflow = peakAirflow + (maxAirflow - minAirflow) * 0.05;
    
    console.log('STALL ZONE CALC:', {
      minAirflow,
      maxAirflow,
      peakAirflow,
      peakPressure,
      stallBoundaryAirflow,
      dataPoints: fullData.length
    });
    
    return {
      x1: 0,
      x2: stallBoundaryAirflow,
      boundaryAirflow: stallBoundaryAirflow,
    };
  }, [performanceData, showStallZone, chartType, airflowUnit, pressureUnit]);

  // Helper function to interpolate pressure at a given airflow
  // Extended to extrapolate to Y-axis (airflow=0) using proper fan curve behavior
  // Fan curves have max pressure at 0 airflow and 0 pressure at max airflow
  function interpolateAtAirflow(data: { airflow: number; staticPressure: number }[], airflow: number): number | undefined {
    if (data.length < 2) return undefined;
    
    const sorted = [...data].sort((a, b) => a.airflow - b.airflow);
    const minDataAirflow = sorted[0].airflow;
    const maxDataAirflow = sorted[sorted.length - 1].airflow;
    
    // If airflow is 0 or less than first data point, extrapolate toward Y-axis
    // Fan curves typically have maximum pressure at 0 airflow
    if (airflow < minDataAirflow) {
      if (minDataAirflow === 0) {
        return sorted[0].staticPressure;
      }
      // Use quadratic/parabolic extrapolation for more realistic fan curve behavior
      // Fan curve approximation: P = Pmax * (1 - (Q/Qmax)^2)
      // Estimate Pmax (pressure at Q=0) from the trend of first few points
      const p0 = sorted[0].staticPressure;
      const p1 = sorted[1].staticPressure;
      const q0 = sorted[0].airflow;
      const q1 = sorted[1].airflow;
      
      // Linear extrapolation slope from first segment
      const slope = (p1 - p0) / (q1 - q0);
      
      // For fan curves, pressure increases as airflow decreases (negative slope expected)
      // Extrapolate to airflow = 0
      const extrapolated = p0 - slope * q0 + slope * airflow;
      return Math.max(0, extrapolated);
    }
    
    // If airflow exceeds last point, extrapolate to X-axis (pressure = 0)
    if (airflow >= maxDataAirflow) {
      const lastPoint = sorted[sorted.length - 1];
      // If we're past max airflow, return 0 or interpolate to 0
      if (lastPoint.staticPressure === 0) {
        return 0;
      }
      // Linear extrapolation to find where pressure hits 0
      const secondLast = sorted[sorted.length - 2];
      const slope = (lastPoint.staticPressure - secondLast.staticPressure) / 
                    (lastPoint.airflow - secondLast.airflow);
      const extrapolated = lastPoint.staticPressure + slope * (airflow - lastPoint.airflow);
      return Math.max(0, extrapolated);
    }
    
    // Normal interpolation between data points
    for (let j = 0; j < sorted.length - 1; j++) {
      if (airflow >= sorted[j].airflow && airflow <= sorted[j + 1].airflow) {
        const t = (airflow - sorted[j].airflow) / (sorted[j + 1].airflow - sorted[j].airflow);
        return sorted[j].staticPressure + t * (sorted[j + 1].staticPressure - sorted[j].staticPressure);
      }
    }
    return undefined;
  }

  // Helper function to interpolate pressure ONLY within the actual data range
  // Returns undefined for airflow values outside the data range (no extrapolation)
  function interpolateWithinRange(data: { airflow: number; staticPressure: number }[], airflow: number): number | undefined {
    if (data.length < 2) return undefined;
    
    const sorted = [...data].sort((a, b) => a.airflow - b.airflow);
    const minDataAirflow = sorted[0].airflow;
    const maxDataAirflow = sorted[sorted.length - 1].airflow;
    
    // Outside data range - return undefined (no extrapolation)
    if (airflow < minDataAirflow || airflow > maxDataAirflow) {
      return undefined;
    }
    
    // Normal interpolation between data points
    for (let j = 0; j < sorted.length - 1; j++) {
      if (airflow >= sorted[j].airflow && airflow <= sorted[j + 1].airflow) {
        const t = (airflow - sorted[j].airflow) / (sorted[j + 1].airflow - sorted[j].airflow);
        return sorted[j].staticPressure + t * (sorted[j + 1].staticPressure - sorted[j].staticPressure);
      }
    }
    return undefined;
  }

  // Calculate intersection point where system curve meets fan curve
  const intersectionPoint = useMemo(() => {
    if (chartType !== 'pressure' || !showSystemCurve || systemCurveK === null || chartData.length < 2) {
      console.log('Intersection skipped:', { chartType, showSystemCurve, systemCurveK, chartDataLength: chartData.length });
      return null;
    }

    // Find intersection by checking where fan curve crosses system curve
    for (let i = 0; i < chartData.length - 1; i++) {
      const p1 = chartData[i];
      const p2 = chartData[i + 1];
      
      const sys1 = systemCurveK * p1.airflow * p1.airflow;
      const sys2 = systemCurveK * p2.airflow * p2.airflow;
      
      const diff1 = p1.staticPressure - sys1;
      const diff2 = p2.staticPressure - sys2;
      
      // Check if sign changes (intersection found)
      if (diff1 * diff2 <= 0) {
        // Linear interpolation to find intersection point
        const t = Math.abs(diff1) / (Math.abs(diff1) + Math.abs(diff2));
        const intersectAirflow = p1.airflow + t * (p2.airflow - p1.airflow);
        const intersectPressure = systemCurveK * intersectAirflow * intersectAirflow;
        
        const result = { airflow: intersectAirflow, pressure: intersectPressure };
        console.log('Intersection found:', result);
        return result;
      }
    }
    
    console.log('No intersection found - system curve may not cross fan curve');
    return null;
  }, [chartData, systemCurveK, chartType, showSystemCurve]);

  const getChartConfig = () => {
    // All curves use black stroke for consistent PDF export matching
    const blackStroke = 'hsl(0, 0%, 15%)'; // Dark black for all curves
    switch (chartType) {
      case 'pressure':
        return {
          dataKey: 'staticPressure',
          stroke: blackStroke,
          fill: 'hsl(213, 94%, 50%)', // Keep gradient fill for visual distinction
          name: `Static Pressure (${PRESSURE_UNITS[pressureUnit].label})`,
          yAxisLabel: PRESSURE_UNITS[pressureUnit].label,
        };
      case 'power':
        return {
          dataKey: 'shaftPower',
          stroke: blackStroke,
          fill: 'hsl(24, 95%, 53%)', // Keep gradient fill for visual distinction
          name: 'Shaft Power (kW)',
          yAxisLabel: 'kW',
        };
      case 'efficiency':
        return {
          dataKey: 'efficiency',
          stroke: blackStroke,
          fill: 'hsl(142, 70%, 45%)', // Keep gradient fill for visual distinction
          name: 'Total Efficiency (%)',
          yAxisLabel: '%',
        };
    }
  };

  const config = getChartConfig();

  // Helper to interpolate pressure on a specific curve at given airflow
  const interpolateOnCurve = useCallback((curveData: { airflow: number; staticPressure: number }[], airflow: number): number | null => {
    if (curveData.length < 2) return null;
    
    const sorted = [...curveData].sort((a, b) => a.airflow - b.airflow);
    const minAirflow = sorted[0].airflow;
    const maxAirflow = sorted[sorted.length - 1].airflow;
    
    // Outside range
    if (airflow < minAirflow || airflow > maxAirflow) return null;
    
    for (let i = 0; i < sorted.length - 1; i++) {
      if (airflow >= sorted[i].airflow && airflow <= sorted[i + 1].airflow) {
        const t = (airflow - sorted[i].airflow) / (sorted[i + 1].airflow - sorted[i].airflow);
        return sorted[i].staticPressure + t * (sorted[i + 1].staticPressure - sorted[i].staticPressure);
      }
    }
    return null;
  }, []);

  // Map a mouse event to exact chart coordinates using the plotted grid rectangle.
  // This gives continuous (pixel accurate) values instead of snapping to data points.
  const getPointerValues = useCallback((event: any): { airflow: number; pressure: number } | null => {
    const container = chartContainerRef.current;
    if (!container || !event) return null;
    const grid = container.querySelector('.recharts-cartesian-grid rect') as SVGGraphicsElement | null
      || container.querySelector('.recharts-cartesian-grid') as SVGGraphicsElement | null;
    if (!grid) return null;
    const rect = grid.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    const clientX = event.clientX ?? event.nativeEvent?.clientX;
    const clientY = event.clientY ?? event.nativeEvent?.clientY;
    if (clientX === undefined || clientY === undefined) return null;
    const fx = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    const fy = Math.min(1, Math.max(0, (clientY - rect.top) / rect.height));
    return {
      airflow: fx * xMaxRef.current,
      pressure: (1 - fy) * yMaxRef.current,
    };
  }, []);

  // Apply a duty point at the pointer position: land exactly ON the nearest curve
  const applyPointerDutyPoint = useCallback((data: any, event?: any) => {
    if (!interactive || chartType !== 'pressure') return;

    const pointer = getPointerValues(event);
    let clickedAirflow = pointer?.airflow ?? null;
    const pointerPressure = pointer?.pressure ?? null;

    if (clickedAirflow === null && data?.activeLabel !== undefined) {
      clickedAirflow = typeof data.activeLabel === 'number' ? data.activeLabel : parseFloat(data.activeLabel);
    }
    if (!clickedAirflow || clickedAirflow <= 0) return;

    let targetPressure: number | null = null;
    let bestAngle: number | null = null;

    if (convertedFamilyData && convertedFamilyData.length > 0) {
      let minDistance = Infinity;
      convertedFamilyData.forEach(curve => {
        const pressureOnCurve = interpolateOnCurve(curve.data, clickedAirflow!);
        if (pressureOnCurve === null) return;
        if (pointerPressure !== null) {
          const distance = Math.abs(pressureOnCurve - pointerPressure);
          if (distance < minDistance) {
            minDistance = distance;
            bestAngle = curve.angle;
            targetPressure = pressureOnCurve;
          }
        } else if (curve.angle === selectedAngle) {
          bestAngle = curve.angle;
          targetPressure = pressureOnCurve;
        }
      });

      if (targetPressure === null) {
        const selectedCurve = convertedFamilyData.find(c => c.angle === selectedAngle);
        if (selectedCurve) {
          targetPressure = interpolateOnCurve(selectedCurve.data, clickedAirflow);
          bestAngle = selectedAngle;
        }
      }

      if (bestAngle !== null && bestAngle !== selectedAngle && onAngleSelect && targetPressure !== null) {
        const newPoint = { airflow: clickedAirflow, pressure: targetPressure };
        setInteractiveDutyPoint(newPoint);
        onAngleSelect(bestAngle, newPoint);
        return;
      }
    } else {
      targetPressure = interpolateOnCurve(chartData, clickedAirflow);
    }

    if (clickedAirflow > 0 && targetPressure !== null && targetPressure > 0) {
      const newPoint = { airflow: clickedAirflow, pressure: targetPressure };
      setInteractiveDutyPoint(newPoint);

      if (onDutyPointChange) {
        const airflowCMH = convertAirflow(clickedAirflow, airflowUnit, 'CMH');
        const pressurePa = convertPressure(targetPressure, pressureUnit, 'Pa');
        onDutyPointChange({ airflow: airflowCMH, pressure: pressurePa });
      }
    }
  }, [interactive, onDutyPointChange, onAngleSelect, chartType, airflowUnit, pressureUnit, chartData, convertedFamilyData, interpolateOnCurve, selectedAngle, getPointerValues]);

  const handleChartClick = applyPointerDutyPoint;


  // Always use combinedChartData for pressure charts to ensure consistent data handling
  const displayData = chartType === 'pressure' ? combinedChartData : chartData;

  // Helper function to get nice tick step size based on data range
  // Dynamic intervals: smaller data = smaller intervals (50, 100), larger data = larger intervals (500, 1000)
  const getNiceStepSize = useCallback((maxVal: number, desiredTickCount: number = 10) => {
    if (maxVal <= 0) return 1;
    
    // Calculate approximate step size based on desired tick count
    const roughStep = maxVal / desiredTickCount;
    
    // Nice step values to choose from - including decimal values for small numbers like shaft power (kW)
    const niceSteps = [
      0.05, 0.1, 0.2, 0.25, 0.5, 
      1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 
      1000, 2000, 2500, 5000, 10000, 20000, 25000, 50000
    ];
    
    // Find the closest nice step that gives roughly the desired tick count
    let bestStep = niceSteps[0];
    for (const step of niceSteps) {
      if (step >= roughStep * 0.5) {
        bestStep = step;
        break;
      }
    }
    
    // For very small ranges (like shaft power in kW: 0.1-2kW), use fine decimal steps
    if (maxVal <= 1) return Math.max(0.1, Math.min(0.25, bestStep));
    if (maxVal <= 2) return Math.max(0.2, Math.min(0.5, bestStep));
    if (maxVal <= 5) return Math.max(0.5, Math.min(1, bestStep));
    if (maxVal <= 10) return Math.max(1, Math.min(2, bestStep));
    if (maxVal <= 20) return Math.max(2, Math.min(5, bestStep));
    if (maxVal <= 50) return Math.max(5, Math.min(10, bestStep));
    if (maxVal <= 100) return Math.max(10, Math.min(20, bestStep));
    if (maxVal <= 200) return Math.max(20, Math.min(50, bestStep));
    if (maxVal <= 500) return Math.max(50, Math.min(100, bestStep));
    if (maxVal <= 1000) return Math.max(100, Math.min(200, bestStep));
    if (maxVal <= 2000) return Math.max(200, Math.min(500, bestStep));
    if (maxVal <= 5000) return Math.max(500, Math.min(1000, bestStep));
    if (maxVal <= 10000) return Math.max(1000, Math.min(2000, bestStep));
    if (maxVal <= 20000) return Math.max(2000, Math.min(5000, bestStep));
    if (maxVal <= 50000) return Math.max(5000, Math.min(10000, bestStep));
    
    return bestStep;
  }, []);

  // Calculate axis ticks dynamically based on zoomed display bounds
  // Include 0 in ticks to properly show origin without gap
  const xAxisTicks = useMemo(() => {
    const maxVal = zoomedAxisBounds.maxAirflow;
    
    // Keep the visible limit exactly 10% above the maximum airflow data point.
    const paddedMax = maxVal * 1.10;
    
    // Use nice interior ticks without rounding the chart domain beyond the 10% limit.
    const stepSize = getNiceStepSize(paddedMax, 10);
    const ticks: number[] = [0];
    for (let v = stepSize; v < paddedMax; v += stepSize) {
      ticks.push(Math.round(v * 1000) / 1000);
    }
    ticks.push(Math.round(paddedMax * 1000) / 1000);
    
    return ticks;
  }, [zoomedAxisBounds, getNiceStepSize]);

  const yAxisTicks = useMemo(() => {
    const key = config.dataKey as string;
    let maxVal = 0;
    
    if (chartType === 'pressure') {
      maxVal = zoomedAxisBounds.maxPressure;
    } else if (chartType === 'efficiency') {
      // Use actual max efficiency from data, not hardcoded 100%
      // Also check the original performanceData in case chartData is trimmed
      const efficiencyValues = chartData.map(d => d.efficiency || 0).filter(v => v > 0);
      const originalEfficiencyValues = performanceData.map(d => d.efficiency || 0).filter(v => v > 0);
      
      // Use whichever has valid data - prefer original data since chartData might be trimmed
      const valuesToUse = originalEfficiencyValues.length > 0 ? originalEfficiencyValues : efficiencyValues;
      maxVal = valuesToUse.length > 0 ? Math.max(...valuesToUse) : 50;
      
      // Also check family curves for efficiency range
      if (convertedFamilyData) {
        convertedFamilyData.forEach(curve => {
          const curveEfficiency = curve.data.map(d => d.efficiency || 0).filter(v => v > 0);
          if (curveEfficiency.length > 0) {
            maxVal = Math.max(maxVal, Math.max(...curveEfficiency));
          }
        });
      }
      
      console.log('EFFICIENCY Y-AXIS DEBUG:', {
        chartType,
        chartDataLength: chartData.length,
        performanceDataLength: performanceData.length,
        efficiencyValuesFromChartData: efficiencyValues,
        efficiencyValuesFromOriginal: originalEfficiencyValues,
        maxVal,
        sampleChartData: chartData.slice(0, 3),
        sampleOriginalData: performanceData.slice(0, 3)
      });
    } else {
      // For power chart, also use original data to avoid trimming issues
      const valuesFromChart = chartData.map(d => (d as any)[key] || 0).filter(v => v > 0);
      const valuesFromOriginal = performanceData.map(d => (d as any)[key] || 0).filter(v => v > 0);
      const valuesToUse = valuesFromOriginal.length > 0 ? valuesFromOriginal : valuesFromChart;
      maxVal = valuesToUse.length > 0 ? Math.max(...valuesToUse) : 0;
      
      // Also check family curves for power range
      if (convertedFamilyData) {
        convertedFamilyData.forEach(curve => {
          const curvePower = curve.data.map(d => d.shaftPower || 0).filter(v => v > 0);
          if (curvePower.length > 0) {
            maxVal = Math.max(maxVal, Math.max(...curvePower));
          }
        });
      }
    }
    
    // Keep the visible limit exactly 10% above the maximum data point.
    const paddedMax = maxVal * 1.10;
    
    // Dynamic step size based on chart type and data range
    let stepSize: number;
    if (chartType === 'efficiency') {
      // Use dynamic step size for efficiency based on actual max value
      stepSize = getNiceStepSize(paddedMax, 6);
    } else {
      stepSize = getNiceStepSize(paddedMax, 8);
    }
    
    console.log('Y-AXIS TICKS DEBUG:', { chartType, key, maxVal, paddedMax, stepSize });
    
    // Use nice interior ticks without rounding the chart domain beyond the 10% limit.
    const ticks: number[] = [0];
    for (let v = stepSize; v < paddedMax; v += stepSize) {
      ticks.push(Math.round(v * 1000) / 1000);
    }
    ticks.push(Math.round(paddedMax * 1000) / 1000);
    
    return ticks;
  }, [chartData, performanceData, config.dataKey, chartType, zoomedAxisBounds, getNiceStepSize, convertedFamilyData]);

  // Calculate peak efficiency point
  const peakEfficiencyPoint = useMemo(() => {
    if (chartType !== 'efficiency' || chartData.length === 0) return null;
    
    const maxEff = Math.max(...chartData.map(d => d.efficiency));
    const peakPoint = chartData.find(d => d.efficiency === maxEff);
    return peakPoint ? { airflow: peakPoint.airflow, efficiency: peakPoint.efficiency } : null;
  }, [chartData, chartType]);

  // Get max values for domain
  const xMax = xAxisTicks.length > 0 ? xAxisTicks[xAxisTicks.length - 1] : 100;
  const yMax = yAxisTicks.length > 0 ? yAxisTicks[yAxisTicks.length - 1] : 100;
  xMaxRef.current = xMax;
  yMaxRef.current = yMax;

  return (
    <div className="w-full relative">
      {/* Zoom Controls - positioned above the chart */}
      <div className="flex items-center justify-end gap-1 mb-2">
        <div className="flex items-center gap-1 bg-muted/50 rounded-md p-1 border border-border">
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={handleZoomIn}
            disabled={zoomLevel >= MAX_ZOOM}
            title="Zoom In"
          >
            <ZoomIn className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={handleZoomOut}
            disabled={zoomLevel <= MIN_ZOOM}
            title="Zoom Out"
          >
            <ZoomOut className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={handleZoomReset}
            disabled={zoomLevel === 1.0}
            title="Reset Zoom"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </Button>
          <span className="text-xs text-muted-foreground px-1 min-w-[32px] text-center">
            {Math.round(zoomLevel * 100)}%
          </span>
        </div>
        {interactive && chartType === 'pressure' && (
          <span className="text-xs text-primary font-medium bg-primary/10 px-2 py-1 rounded animate-pulse">
            {convertedFamilyData && convertedFamilyData.length > 0 
              ? 'Click or drag on the curves to shift duty point' 
              : 'Click or drag on the curve to set duty point'}
          </span>
        )}
      </div>
      
      <div 
        className="h-[437px] w-full" 
        ref={chartContainerRef}
        onMouseUp={() => { isDraggingRef.current = false; }}
        onMouseLeave={() => { isDraggingRef.current = false; }}
      >
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart 
          data={displayData} 
          margin={{ top: 10, right: 30, left: 10, bottom: 10 }}
          onClick={(data: any, event: any) => {
            handleChartClick(data, event);
          }}
          onMouseDown={(data: any, event: any) => {
            if (interactive && chartType === 'pressure') {
              isDraggingRef.current = true;
              applyPointerDutyPoint(data, event);
            }
          }}
          onMouseUp={() => { isDraggingRef.current = false; }}
          onMouseMove={(data: any, event: any) => {
            if (interactive && data && data.activeLabel) {
              setHoverPoint({ x: data.activeLabel, y: 0 });
            }
            // Drag to move the duty point smoothly along the curves
            if (isDraggingRef.current && interactive && chartType === 'pressure') {
              applyPointerDutyPoint(data, event);
            }
          }}

          style={{ cursor: interactive && chartType === 'pressure' ? 'crosshair' : 'default' }}
        >
          <defs>
            <linearGradient id={`gradient-${chartType}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={config.stroke} stopOpacity={0.3} />
              <stop offset="100%" stopColor={config.stroke} stopOpacity={0.05} />
            </linearGradient>
            <pattern id="stall-pattern" patternUnits="userSpaceOnUse" width="8" height="8">
              <path d="M-2,2 l4,-4 M0,8 l8,-8 M6,10 l4,-4" stroke="hsl(0, 70%, 50%)" strokeWidth="1" opacity="0.4"/>
            </pattern>
          </defs>
          
          {/* Stall/Surge Zone - rendered first so it's behind other elements */}
          {chartType === 'pressure' && showStallZone && stallZoneBoundary && (
            <ReferenceArea
              x1={stallZoneBoundary.x1}
              x2={stallZoneBoundary.x2}
              y1={0}
              y2={yMax}
              fill="url(#stall-pattern)"
              fillOpacity={0.5}
              stroke="hsl(0, 70%, 50%)"
              strokeWidth={1}
              strokeDasharray="4 2"
              ifOverflow="visible"
            />
          )}
          <CartesianGrid 
            strokeDasharray="3 3" 
            stroke="hsl(210, 15%, 85%)" 
            vertical={true}
          />
          <XAxis 
            dataKey="airflow" 
            type="number"
            stroke="hsl(0, 0%, 0%)"
            fontSize={14}
            fontWeight={600}
            tick={{ fill: 'hsl(0, 0%, 0%)', fontWeight: 600 }}
            tickFormatter={(value) => {
              if (value >= 1000) return Math.round(value).toLocaleString();
              if (value >= 100) return Math.round(value).toString();
              if (value >= 10) return value.toFixed(1);
              if (value >= 1) return value.toFixed(2);
              return value.toFixed(3);
            }}
            domain={[0, xMax]}
            ticks={xAxisTicks}
            allowDataOverflow={true}
            label={{ 
              value: `Airflow (${AIRFLOW_UNITS[airflowUnit].label})`, 
              position: 'insideBottom', 
              offset: -5,
              fontSize: 15,
              fontWeight: 700,
              fill: 'hsl(0, 0%, 0%)'
            }}
          />
          <YAxis 
            stroke="hsl(0, 0%, 0%)"
            fontSize={14}
            fontWeight={600}
            tick={{ fill: 'hsl(0, 0%, 0%)', fontWeight: 600 }}
            tickFormatter={(value) => {
              if (typeof value !== 'number') return value;
              if (value >= 1000) return Math.round(value).toLocaleString();
              if (value >= 100) return Math.round(value).toString();
              if (value >= 10) return value.toFixed(1);
              if (value >= 1) return value.toFixed(2);
              return value.toFixed(3);
            }}
            domain={[0, yMax]}
            ticks={yAxisTicks}
            label={{ 
              value: config.yAxisLabel, 
              angle: -90, 
              position: 'insideLeft',
              fontSize: 15,
              fontWeight: 700,
              fill: 'hsl(0, 0%, 0%)'
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
            cursor={interactive ? { stroke: 'hsl(213, 94%, 50%)', strokeWidth: 2, strokeDasharray: '5 5' } : false}
            formatter={(value: number, name: string) => {
              if (name === 'systemPressure' || name === 'System Curve') {
                return [typeof value === 'number' ? value.toFixed(1) : value, 'System Curve'];
              }
              return [typeof value === 'number' ? value.toFixed(1) : value, config.name];
            }}
            labelFormatter={(value) => `Airflow: ${typeof value === 'number' ? roundAirflowForDisplay(value, airflowUnit).toLocaleString() : value} ${AIRFLOW_UNITS[airflowUnit].label}`}
          />
          
          {/* Fan performance curve area fill - use linear to match exact data points */}
          <Area
            type="linear"
            dataKey={config.dataKey}
            stroke="none"
            fill={`url(#gradient-${chartType})`}
            connectNulls={false}
          />
          
          {/* Fan performance curve - linear line to match exact data points */}
          {!convertedFamilyData && (
            <Line
              type="linear"
              dataKey={config.dataKey}
              stroke={config.stroke}
              strokeWidth={3}
              dot={false}
              activeDot={interactive && chartType === 'pressure' ? {
                r: 7,
                fill: config.stroke,
                strokeWidth: 3,
                stroke: '#fff',
                style: { cursor: 'pointer', filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.3))' }
              } : { r: 5, fill: config.stroke, strokeWidth: 2, stroke: '#fff' }}
              connectNulls={false}
              name={config.name}
            />
          )}
          
          {/* Adjusted curve label (VFD/voltage) - shown at the end of the main curve */}
          {chartType === 'pressure' && adjustedCurveData && chartData.length > 0 && (() => {
            const sortedData = [...chartData].sort((a, b) => a.airflow - b.airflow);
            const lastPoint = sortedData[sortedData.length - 1];
            return (
              <ReferenceDot
                x={lastPoint.airflow}
                y={lastPoint.staticPressure}
                r={0}
                fill="transparent"
                stroke="transparent"
                ifOverflow="visible"
              >
                <text
                  x={-5}
                  y={-8}
                  fill={config.stroke}
                  fontSize={10}
                  fontWeight="bold"
                  textAnchor="end"
                  style={{ 
                    textShadow: '1px 1px 2px white, -1px -1px 2px white, 1px -1px 2px white, -1px 1px 2px white'
                  }}
                >
                  {adjustedCurveData.label}
                </text>
              </ReferenceDot>
            );
          })()}
          
          {/* Family curves - OEM style: all curves shown for pressure, power, and efficiency */}
          {convertedFamilyData && convertedFamilyData.map((curve, idx) => {
            const isSelected = curve.angle === selectedAngle;
            // Determine the data key based on chart type
            const familyDataKey = chartType === 'pressure' 
              ? 'familyPressure' 
              : chartType === 'power' 
                ? 'familyPower' 
                : 'familyEfficiency';
            const familyData = curve.data.map(d => ({ 
              airflow: d.airflow, 
              familyPressure: d.staticPressure,
              familyPower: d.shaftPower,
              familyEfficiency: d.efficiency,
            }));
            return (
              <Line
                key={`family-${curve.angle}`}
                type="monotone"
                data={familyData}
                dataKey={familyDataKey}
                stroke={isSelected ? config.stroke : familyCurveColors[idx % familyCurveColors.length]}
                strokeWidth={isSelected ? 2.5 : 1.5}
                dot={false}
                activeDot={interactive && chartType === 'pressure' ? { 
                  r: 7, 
                  fill: isSelected ? config.stroke : familyCurveColors[idx % familyCurveColors.length], 
                  strokeWidth: 3, 
                  stroke: '#fff',
                  style: { cursor: 'pointer', filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.3))' }
                } : false}
                connectNulls={false}
                name={`${curve.angle}°`}
              />
            );
          })}
          
          {/* Blade angle labels at the right end of each curve (OEM style) - for all chart types */}
          {convertedFamilyData && convertedFamilyData.map((curve, idx) => {
            // Sort data by airflow to get rightmost point
            const sortedData = [...curve.data].sort((a, b) => a.airflow - b.airflow);
            if (sortedData.length === 0) return null;
            
            // Get the last (rightmost) point - where the curve ends
            const lastPoint = sortedData[sortedData.length - 1];
            const isSelected = curve.angle === selectedAngle;
            const labelColor = isSelected ? config.stroke : familyCurveColors[idx % familyCurveColors.length];
            
            // Get the Y value based on chart type
            const yValue = chartType === 'pressure' 
              ? lastPoint.staticPressure 
              : chartType === 'power' 
                ? lastPoint.shaftPower 
                : lastPoint.efficiency;
            
            // Position label just to the right of the curve endpoint
            return (
              <ReferenceDot
                key={`curve-label-${curve.angle}`}
                x={lastPoint.airflow}
                y={yValue}
                r={3}
                fill={labelColor}
                stroke="#fff"
                strokeWidth={1}
                ifOverflow="visible"
                style={{ cursor: onAngleSelect ? 'pointer' : 'default' }}
                onClick={() => onAngleSelect?.(curve.angle)}
              >
                <text
                  x={8}
                  y={4}
                  fill={labelColor}
                  fontSize={10}
                  fontWeight={isSelected ? 'bold' : 'normal'}
                  textAnchor="start"
                  style={{ 
                    cursor: onAngleSelect ? 'pointer' : 'default',
                    textShadow: '1px 1px 2px white, -1px -1px 2px white, 1px -1px 2px white, -1px 1px 2px white'
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    onAngleSelect?.(curve.angle);
                  }}
                >
                  {curve.angle}°
                </text>
              </ReferenceDot>
            );
          })}
          
          {/* Base curve (50Hz reference when VFD is active) - dashed line with label */}
          {chartType === 'pressure' && convertedBaseCurveData && convertedBaseCurveData.data.length > 0 && (
            <Line
              type="linear"
              data={convertedBaseCurveData.data.map(d => ({ airflow: d.airflow, basePressure: d.staticPressure }))}
              dataKey="basePressure"
              stroke="hsl(210, 15%, 55%)"
              strokeWidth={2}
              strokeDasharray="8 4"
              dot={false}
              connectNulls={false}
              name={convertedBaseCurveData.label}
            />
          )}
          
          {/* Base curve label at the right end */}
          {chartType === 'pressure' && convertedBaseCurveData && convertedBaseCurveData.data.length > 0 && (() => {
            const sortedData = [...convertedBaseCurveData.data].sort((a, b) => a.airflow - b.airflow);
            const lastPoint = sortedData[sortedData.length - 1];
            return (
              <ReferenceDot
                x={lastPoint.airflow}
                y={lastPoint.staticPressure}
                r={0}
                fill="transparent"
                stroke="transparent"
                ifOverflow="visible"
              >
                <text
                  x={-5}
                  y={-8}
                  fill="hsl(210, 15%, 45%)"
                  fontSize={10}
                  fontWeight="bold"
                  textAnchor="end"
                  style={{ 
                    textShadow: '1px 1px 2px white, -1px -1px 2px white, 1px -1px 2px white, -1px 1px 2px white'
                  }}
                >
                  {convertedBaseCurveData.label}
                </text>
              </ReferenceDot>
            );
          })()}
          
          {/* Base curve operating point (50Hz point) - Gray dot */}
          {chartType === 'pressure' && convertedBaseCurveData && convertedBaseCurveData.operatingPoint && (
            <ReferenceDot
              x={convertedBaseCurveData.operatingPoint.airflow}
              y={convertedBaseCurveData.operatingPoint.staticPressure}
              r={4}
              fill="hsl(210, 15%, 55%)"
              stroke="white"
              strokeWidth={2}
              ifOverflow="extendDomain"
            />
          )}
          
          {/* System curve (only for pressure chart) - smooth parabola with dotted line */}
          {chartType === 'pressure' && showSystemCurve && (
            <Line
              type="monotone"
              dataKey="systemPressure"
              stroke="hsl(213, 90%, 45%)"
              strokeWidth={2.5}
              strokeDasharray="6 4"
              dot={false}
              connectNulls
              name="System Curve"
            />
          )}
          
          {/* Required duty point - Red dot (always visible to show user's original request) */}
          {requiredPointData && chartType === 'pressure' && (
            <ReferenceDot
              x={requiredPointData.airflow}
              y={requiredPointData.pressure}
              r={5}
              fill="hsl(0, 70%, 50%)"
              stroke="white"
              strokeWidth={2}
              ifOverflow="extendDomain"
            />
          )}
          
          {/* Interactive duty point (show when user clicks on chart) - slightly larger, brighter */}
          {interactiveDutyPoint && chartType === 'pressure' && (
            <ReferenceDot
              x={interactiveDutyPoint.airflow}
              y={interactiveDutyPoint.pressure}
              r={6}
              fill="hsl(280, 70%, 50%)"
              stroke="white"
              strokeWidth={2}
              ifOverflow="extendDomain"
            />
          )}
          
          {/* Horizontal and vertical guide lines from axes TO operating point (not crossing) */}
          {/* Use operatingPointData for all chart types for consistency */}
          {operatingPointData && (
            <>
              {/* Horizontal guide line from Y-axis to operating point */}
              <ReferenceLine
                segment={[
                  { x: 0, y: chartType === 'pressure' 
                    ? operatingPointData.staticPressure 
                    : operatingPointData[config.dataKey as keyof typeof operatingPointData] as number },
                  { x: operatingPointData.airflow, y: chartType === 'pressure' 
                    ? operatingPointData.staticPressure 
                    : operatingPointData[config.dataKey as keyof typeof operatingPointData] as number }
                ]}
                stroke="hsl(24, 95%, 53%)"
                strokeWidth={1.5}
                strokeDasharray="4 3"
              />
              {/* Vertical guide line from X-axis to operating point */}
              <ReferenceLine
                segment={[
                  { x: operatingPointData.airflow, y: 0 },
                  { x: operatingPointData.airflow, y: chartType === 'pressure' 
                    ? operatingPointData.staticPressure 
                    : operatingPointData[config.dataKey as keyof typeof operatingPointData] as number }
                ]}
                stroke="hsl(24, 95%, 53%)"
                strokeWidth={1.5}
                strokeDasharray="4 3"
              />
            </>
          )}
          
          {/* Operating point marker - Orange dot at the actual operating point */}
          {/* For pressure chart: show at operatingPointData position (actual fan operating point) */}
          {/* For power/efficiency: show at the corresponding Y value */}
          {operatingPointData && (
            <ReferenceDot
              x={operatingPointData.airflow}
              y={chartType === 'pressure' 
                ? operatingPointData.staticPressure 
                : operatingPointData[config.dataKey as keyof typeof operatingPointData] as number}
              r={8}
              fill="hsl(24, 95%, 53%)"
              stroke="#fff"
              strokeWidth={2}
              ifOverflow="extendDomain"
            />
          )}
          
          {/* Peak efficiency indicator */}
          {chartType === 'efficiency' && peakEfficiencyPoint && (
            <>
              <ReferenceDot
                x={peakEfficiencyPoint.airflow}
                y={peakEfficiencyPoint.efficiency}
                r={6}
                fill="hsl(142, 70%, 45%)"
                stroke="#fff"
                strokeWidth={2}
              />
              <ReferenceLine
                y={peakEfficiencyPoint.efficiency}
                stroke="hsl(142, 70%, 45%)"
                strokeDasharray="3 3"
                strokeWidth={1}
                label={{ 
                  value: `Peak: ${peakEfficiencyPoint.efficiency}%`, 
                  position: 'right',
                  fill: 'hsl(142, 70%, 45%)',
                  fontSize: 11,
                  fontWeight: 'bold'
                }}
              />
            </>
          )}
        </ComposedChart>
      </ResponsiveContainer>
      </div>
      
      {/* Legend - show for all chart types when family curves are present */}
      {(chartType === 'pressure' || convertedFamilyData) && (
        <div className="flex flex-wrap items-center justify-center gap-4 mt-2 text-xs">
          {!convertedFamilyData && (
            <div className="flex items-center gap-2">
              <div className="w-6 h-[2px] bg-[hsl(213,94%,50%)]" />
              <span className="text-muted-foreground">Fan Curve ({selectedAngle}°)</span>
            </div>
          )}
          {convertedFamilyData && convertedFamilyData.map((curve, idx) => (
            <div key={curve.angle} className="flex items-center gap-2">
              <div 
                className="w-6 h-[2px]" 
                style={{ 
                  backgroundColor: curve.angle === selectedAngle ? 'hsl(213, 94%, 50%)' : familyCurveColors[idx % familyCurveColors.length],
                }}
              />
              <span className={`${curve.angle === selectedAngle ? 'text-foreground font-medium' : 'text-muted-foreground'}`}>
                {curve.angle}°{curve.angle === selectedAngle ? ' (selected)' : ''}
              </span>
            </div>
          ))}
          {chartType === 'pressure' && showSystemCurve && (
            <div className="flex items-center gap-2">
              <div className="w-6 h-[2px] border-t-2 border-dashed border-[hsl(213,90%,45%)]" />
              <span className="text-muted-foreground">System Curve</span>
            </div>
          )}
          {chartType === 'pressure' && activeDutyPoint && (
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-[hsl(0,70%,50%)] border-2 border-white shadow" />
              <span className="text-muted-foreground">
                {interactiveDutyPoint ? 'Selected Point' : 'Required Point'}
              </span>
            </div>
          )}
          {operatingPointData && (
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-[hsl(24,95%,53%)] border-2 border-white shadow" />
              <span className="text-muted-foreground">Operating Point</span>
            </div>
          )}
          {chartType === 'pressure' && interactive && (
            <span className="text-primary font-medium ml-2">
              (Click on curve to move)
            </span>
          )}
        </div>
      )}
    </div>
  );
}
