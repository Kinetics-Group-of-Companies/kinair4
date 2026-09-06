import { useEffect } from 'react';
import { useTenantData } from '@/hooks/useFanDatabase';

export function FaviconLoader() {
  const { data: tenant } = useTenantData();

  useEffect(() => {
    const tenantData = tenant as any;
    
    // Page titles are managed per route via the Seo component (react-helmet-async).

    
    // Update favicon - use multiple sizes for better quality across browsers
    const faviconUrl = tenantData?.favicon_url;
    if (faviconUrl) {
      // Remove existing favicons
      const existingLinks = document.querySelectorAll("link[rel*='icon']");
      existingLinks.forEach(link => link.remove());
      
      // Create favicon with multiple sizes for better display
      // 48x48 for standard browser tabs (same size as Lovable favicon)
      const link48 = document.createElement('link');
      link48.rel = 'icon';
      link48.type = 'image/png';
      link48.sizes = '48x48';
      link48.href = faviconUrl;
      document.head.appendChild(link48);
      
      // 32x32 for fallback
      const link32 = document.createElement('link');
      link32.rel = 'icon';
      link32.type = 'image/png';
      link32.sizes = '32x32';
      link32.href = faviconUrl;
      document.head.appendChild(link32);
      
      // 16x16 for smaller displays
      const link16 = document.createElement('link');
      link16.rel = 'icon';
      link16.type = 'image/png';
      link16.sizes = '16x16';
      link16.href = faviconUrl;
      document.head.appendChild(link16);
      
      // Shortcut icon for older browsers
      const shortcutLink = document.createElement('link');
      shortcutLink.rel = 'shortcut icon';
      shortcutLink.href = faviconUrl;
      document.head.appendChild(shortcutLink);
      
      // Apple touch icon for iOS
      const appleLink = document.createElement('link');
      appleLink.rel = 'apple-touch-icon';
      appleLink.sizes = '180x180';
      appleLink.href = faviconUrl;
      document.head.appendChild(appleLink);
    }
  }, [tenant]);

  return null;
}
