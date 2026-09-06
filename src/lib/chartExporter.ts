/**
 * Chart Exporter Utility
 * Exports Recharts SVG charts to base64 images for PDF embedding
 */

/**
 * Converts an SVG element to a base64 PNG image
 * @param svgElement - The SVG element to convert
 * @param width - Desired width of the output image
 * @param height - Desired height of the output image
 * @returns Promise<string> - Base64 data URL of the PNG image
 */
export async function svgToBase64Image(
  svgElement: SVGSVGElement,
  width: number = 800,
  height: number = 400
): Promise<string> {
  return new Promise((resolve, reject) => {
    try {
      // Clone the SVG to avoid modifying the original
      const clonedSvg = svgElement.cloneNode(true) as SVGSVGElement;
      
      // Set explicit dimensions
      clonedSvg.setAttribute('width', String(width));
      clonedSvg.setAttribute('height', String(height));
      
      // Add white background
      const bgRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      bgRect.setAttribute('width', '100%');
      bgRect.setAttribute('height', '100%');
      bgRect.setAttribute('fill', 'white');
      clonedSvg.insertBefore(bgRect, clonedSvg.firstChild);
      
      // Serialize SVG to string
      const serializer = new XMLSerializer();
      let svgString = serializer.serializeToString(clonedSvg);
      
      // Fix potential issues with SVG string
      if (!svgString.match(/^<svg[^>]+xmlns="http:\/\/www\.w3\.org\/2000\/svg"/)) {
        svgString = svgString.replace(/^<svg/, '<svg xmlns="http://www.w3.org/2000/svg"');
      }
      svgString = svgString.replace(/href/g, 'xlink:href');
      
      // Convert to base64 data URL
      const svgBase64 = btoa(unescape(encodeURIComponent(svgString)));
      const dataUrl = `data:image/svg+xml;base64,${svgBase64}`;
      
      // Create canvas and draw image at 3x resolution for crisp PDF output
      const canvas = document.createElement('canvas');
      const scaleFactor = 3; // Higher resolution for better PDF quality
      canvas.width = width * scaleFactor;
      canvas.height = height * scaleFactor;
      const ctx = canvas.getContext('2d');
      
      if (!ctx) {
        reject(new Error('Failed to get canvas context'));
        return;
      }
      
      const img = new Image();
      img.onload = () => {
        // Fill white background
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        // Draw the SVG
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        
        // Convert to PNG base64
        const pngDataUrl = canvas.toDataURL('image/png', 1.0);
        resolve(pngDataUrl);
      };
      
      img.onerror = () => {
        reject(new Error('Failed to load SVG image'));
      };
      
      img.src = dataUrl;
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Captures a chart container element as a base64 PNG image
 * Finds the SVG inside the container and converts it
 * @param containerElement - The container element containing the Recharts SVG
 * @returns Promise<string | undefined> - Base64 data URL or undefined if failed
 */
export async function captureChartAsImage(
  containerElement: HTMLElement | null
): Promise<string | undefined> {
  if (!containerElement) {
    console.warn('Chart container element is null');
    return undefined;
  }
  
  try {
    // Find the SVG element inside the container
    const svgElement = containerElement.querySelector('svg');
    
    if (!svgElement) {
      console.warn('No SVG element found in chart container');
      return undefined;
    }
    
    // Get the actual dimensions
    const rect = svgElement.getBoundingClientRect();
    const width = rect.width || 800;
    const height = rect.height || 400;
    
    // Convert SVG to image
    const imageDataUrl = await svgToBase64Image(svgElement as SVGSVGElement, width, height);
    return imageDataUrl;
  } catch (error) {
    console.error('Failed to capture chart as image:', error);
    return undefined;
  }
}

/**
 * Gets the chart container ref from InteractivePerformanceChart
 * This should be called with a ref passed to the chart component
 */
export function getChartContainerFromRef(ref: React.RefObject<HTMLDivElement>): HTMLElement | null {
  return ref.current;
}
