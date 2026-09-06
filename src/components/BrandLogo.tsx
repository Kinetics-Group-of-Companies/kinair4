import { useTenantData } from '@/hooks/useFanDatabase';

interface BrandLogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

export function BrandLogo({ size = 'md' }: BrandLogoProps) {
  const { data: tenant, isLoading } = useTenantData();
  
  const sizeConfig = {
    sm: { height: 36, maxWidth: 140 },
    md: { height: 48, maxWidth: 200 },
    lg: { height: 56, maxWidth: 260 },
    xl: { height: 88, maxWidth: 340 },
  };

  const config = sizeConfig[size];
  
  // Reserve the space silently while branding loads (no spinner flicker)
  if (isLoading) {
    return (
      <div
        style={{ height: config.height, width: config.maxWidth }}
        aria-hidden="true"
      />
    );
  }


  // If no logo URL, show company name as text
  if (!tenant?.logo_url) {
    return (
      <div 
        style={{ 
          height: config.height, 
          maxWidth: config.maxWidth,
          display: 'flex',
          alignItems: 'center'
        }}
        className="font-bold text-primary"
      >
        {tenant?.name || 'Fan Selector'}
      </div>
    );
  }

  return (
    <img 
      src={tenant.logo_url} 
      alt={tenant?.name || "Brand Logo"} 
      style={{ 
        height: config.height, 
        maxWidth: config.maxWidth,
        width: 'auto',
        objectFit: 'contain'
      }}
    />
  );
}

// Keep backward compatibility with old name
export { BrandLogo as KinairLogo };
