import { createElement, createRef } from 'react';
import { createRoot } from 'react-dom/client';
import { InteractivePerformanceChart } from '@/components/selector/InteractivePerformanceChart';
import { captureChartAsImage } from './chartExporter';
import type { FanPerformancePoint, FanSelection } from './fanData';

export interface SelectionChartImages {
  chartImage?: string;
  powerChartImage?: string;
  efficiencyChartImage?: string;
}

/**
 * Render the same InteractivePerformanceChart used by the manual selector into
 * an off-screen, fixed-size browser container, then capture its SVGs for PDF.
 * This prevents AI datasheets from maintaining a second approximation of the
 * fan curve.
 */
export async function captureSelectionCharts(
  selection: FanSelection,
  performanceData: FanPerformancePoint[],
  airflowUnit: string,
  pressureUnit: string,
  airDensity: number,
): Promise<SelectionChartImages> {
  if (typeof document === 'undefined' || !performanceData.length) return {};

  const host = document.createElement('div');
  host.style.cssText =
    'position:fixed;left:-10000px;top:0;width:820px;height:900px;opacity:0;pointer-events:none;';
  document.body.appendChild(host);

  const refs = [createRef<HTMLDivElement>(), createRef<HTMLDivElement>(), createRef<HTMLDivElement>()];
  const chartTypes = ['pressure', 'power', 'efficiency'] as const;
  const root = createRoot(host);
  const common = {
    performanceData,
    operatingPoint: selection.operatingPoint,
    requiredDutyPoint: {
      airflow: selection.requiredAirflow,
      pressure: selection.requiredPressure,
    },
    airflowUnit: airflowUnit as any,
    pressureUnit: pressureUnit as any,
    fanDiameter: selection.diameter,
    airDensity,
    showSystemCurve: true,
  };

  try {
    root.render(
      createElement(
        'div',
        { style: { width: '800px' } },
        ...chartTypes.map((chartType, index) =>
          createElement(
            'div',
            { key: chartType, style: { width: '800px', height: '290px' } },
            createElement(InteractivePerformanceChart, {
              ...common,
              chartType,
              chartContainerRef: refs[index],
            }),
          ),
        ),
      ),
    );

    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(resolve, 150))),
    );

    const [chartImage, powerChartImage, efficiencyChartImage] = await Promise.all(
      refs.map((ref) => captureChartAsImage(ref.current)),
    );
    return { chartImage, powerChartImage, efficiencyChartImage };
  } finally {
    root.unmount();
    host.remove();
  }
}
