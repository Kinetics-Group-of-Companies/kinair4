import { Mail, Phone, MapPin, ExternalLink } from 'lucide-react';
import { Link } from 'react-router-dom';
import { BrandLogo } from '@/components/BrandLogo';
import { useTenantData } from '@/hooks/useFanDatabase';

export function Footer() {
  const { data: tenant } = useTenantData();
  
  const contactEmail = tenant?.email || '';
  const contactPhone = tenant?.phone || '';
  const companyName = tenant?.name || 'Fan Selector';
  const address = tenant?.address || '';
  const googleMapsUrl = (tenant as any)?.google_maps_url || '';

  return (
    <footer className="bg-card border-t border-border mt-auto">
      <div className="container mx-auto px-4 py-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          {/* Brand */}
          <div className="md:col-span-2">
            <BrandLogo size="lg" />
            <p className="mt-4 text-sm text-muted-foreground max-w-md">
              Professional fan and air curtain selection tool. Optimize your ventilation systems with precision engineering and advanced performance calculations.
            </p>
          </div>

          {/* Quick Links */}
          <div>
            <h3 className="font-semibold text-foreground mb-4">Quick Links</h3>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li><Link to="/" className="hover:text-primary transition-colors">Home</Link></li>
              <li><Link to="/selector" className="hover:text-primary transition-colors">Fan Selector</Link></li>
              <li><Link to="/compare" className="hover:text-primary transition-colors">Compare</Link></li>
              <li><Link to="/calculator" className="hover:text-primary transition-colors">Calculator</Link></li>
              <li><Link to="/documentation" className="hover:text-primary transition-colors">Documentation</Link></li>
              <li><Link to="/downloads" className="hover:text-primary transition-colors">Download Software</Link></li>
              <li><Link to="/quote" className="hover:text-primary transition-colors">Request Quote</Link></li>
              <li><Link to="/about" className="hover:text-primary transition-colors">About Us</Link></li>
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h3 className="font-semibold text-foreground mb-4">Contact</h3>
            <ul className="space-y-2 text-sm text-muted-foreground">
              {address && (
                <li className="flex items-start gap-2">
                  <MapPin className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  <span className="whitespace-pre-line">{address}</span>
                </li>
              )}
              {contactEmail && (
                <li className="flex items-center gap-2">
                  <Mail className="w-4 h-4 flex-shrink-0" />
                  <a href={`mailto:${contactEmail}`} className="hover:text-primary transition-colors">
                    {contactEmail}
                  </a>
                </li>
              )}
              {contactPhone && (
                <li className="flex items-center gap-2">
                  <Phone className="w-4 h-4 flex-shrink-0" />
                  <a href={`tel:${contactPhone}`} className="hover:text-primary transition-colors">
                    {contactPhone}
                  </a>
                </li>
              )}
              {googleMapsUrl && (
                <li className="mt-3">
                  <a 
                    href={googleMapsUrl} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-primary hover:underline"
                  >
                    <ExternalLink className="w-3 h-3" />
                    View on Google Maps
                  </a>
                </li>
              )}
              {!contactEmail && !contactPhone && !address && (
                <li className="text-muted-foreground">Contact info not set</li>
              )}
            </ul>
          </div>
        </div>

        {/* Google Maps Embed */}
        {googleMapsUrl && googleMapsUrl.includes('embed') && (
          <div className="mt-8 rounded-lg overflow-hidden border border-border">
            <iframe
              src={googleMapsUrl}
              width="100%"
              height="250"
              style={{ border: 0 }}
              allowFullScreen
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              title="Company Location"
            />
          </div>
        )}

        <div className="border-t border-border mt-8 pt-6 text-center text-sm text-muted-foreground">
          <p>© {new Date().getFullYear()} {companyName}. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}