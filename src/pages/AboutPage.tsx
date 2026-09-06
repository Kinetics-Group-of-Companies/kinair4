import { Building2, Award, Users, Target, Mail, Phone, MapPin, CheckCircle2, Loader2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { MainLayout } from '@/components/layout/MainLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useTenantData } from '@/hooks/useFanDatabase';
import { usePageContent } from '@/hooks/usePageContent';

export default function AboutPage() {
  const { data: tenant } = useTenantData();
  const { data: pageContent = [], isLoading } = usePageContent('about');
  const companyName = tenant?.name || '';

  // Helper to get content by section key
  const getSection = (key: string) => pageContent.find(s => s.section_key === key);
  const getSectionContent = (key: string, fallback: string = '') => getSection(key)?.content || fallback;
  const isSectionVisible = (key: string) => getSection(key)?.is_visible !== false;

  // Parse capabilities from content (one per line)
  const capabilitiesContent = getSectionContent('capabilities', 
    'Custom fan design and engineering\nHigh-temperature smoke extract fans\nAMCA certified performance testing\nFire-rated fan solutions (F300/F400)\nEnergy-efficient motor selection\nComplete ventilation system design'
  );
  const capabilities = capabilitiesContent.split('\n').filter(c => c.trim());

  // Parse certifications from content (format: Name - Description)
  const certificationsContent = getSectionContent('certifications',
    'AMCA Certified - Air Movement and Control Association\nISO 9001 - Quality Management System\nCE Marking - European Conformity'
  );
  const certifications = certificationsContent.split('\n').filter(c => c.trim()).map(line => {
    const parts = line.split(' - ');
    return { name: parts[0]?.trim() || '', description: parts[1]?.trim() || '' };
  });

  if (isLoading) {
    return (
      <MainLayout>
        <div className="flex justify-center items-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      {/* Hero Section */}
      <section className="bg-gradient-primary text-primary-foreground py-16">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl">
            <h1 className="text-4xl font-bold mb-4">
              {getSectionContent('hero_title', `About ${companyName}`) || `About ${companyName}`}
            </h1>
            <p className="text-xl text-primary-foreground/80">
              {getSectionContent('hero_description', 'Ventilation fans and air curtains for residential, commercial and industrial buildings — from selection and performance data to datasheets and drawings.')}
            </p>
          </div>
        </div>
      </section>

      {/* Mission Section */}
      {(isSectionVisible('mission_title') || isSectionVisible('who_we_are_title')) && (
        <section className="container mx-auto px-4 py-12">
          <div className="grid md:grid-cols-2 gap-8">
            {isSectionVisible('mission_title') && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Target className="w-5 h-5 text-primary" />
                    {getSectionContent('mission_title', 'Our Mission') || 'Our Mission'}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground">
                    {getSectionContent('mission_content', 'To provide innovative, energy-efficient ventilation solutions that meet the highest standards of quality and performance. We are committed to helping our clients achieve optimal air movement while reducing energy consumption and environmental impact.')}
                  </p>
                </CardContent>
              </Card>
            )}

            {isSectionVisible('who_we_are_title') && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Building2 className="w-5 h-5 text-primary" />
                    {getSectionContent('who_we_are_title', 'Who We Are') || 'Who We Are'}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground">
                    {getSectionContent('who_we_are_content', 'With years of experience in the ventilation industry, we specialize in designing and manufacturing axial fans for diverse applications. Our team of engineers and technicians work together to deliver products that exceed customer expectations.')}
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        </section>
      )}

      {/* Capabilities Section */}
      {isSectionVisible('capabilities') && capabilities.length > 0 && (
        <section className="bg-muted/30 py-12">
          <div className="container mx-auto px-4">
            <h2 className="text-2xl font-bold mb-8 text-center">Our Capabilities</h2>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 max-w-4xl mx-auto">
              {capabilities.map((capability, idx) => (
                <div key={idx} className="flex items-start gap-3 p-4 bg-card rounded-lg border">
                  <CheckCircle2 className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                  <span className="text-sm">{capability}</span>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Certifications Section */}
      {isSectionVisible('certifications') && certifications.length > 0 && (
        <section className="container mx-auto px-4 py-12">
          <h2 className="text-2xl font-bold mb-8 text-center">Certifications & Standards</h2>
          <div className="grid sm:grid-cols-3 gap-6 max-w-3xl mx-auto">
            {certifications.map((cert, idx) => (
              <Card key={idx} className="text-center">
                <CardHeader>
                  <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-2">
                    <Award className="w-6 h-6 text-primary" />
                  </div>
                  <CardTitle className="text-lg">{cert.name}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">{cert.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      )}

      {/* Team Section */}
      {isSectionVisible('team_title') && (
        <section className="bg-muted/30 py-12">
          <div className="container mx-auto px-4">
            <div className="max-w-2xl mx-auto text-center">
              <Users className="w-12 h-12 text-primary mx-auto mb-4" />
              <h2 className="text-2xl font-bold mb-4">
                {getSectionContent('team_title', 'Our Team') || 'Our Team'}
              </h2>
              <p className="text-muted-foreground mb-6">
                {getSectionContent('team_content', 'Our dedicated team of engineers, designers, and support staff are committed to providing exceptional products and services. With expertise in aerodynamics, motor technology, and residential, commercial and industrial applications, we deliver solutions tailored to your specific needs.')}
              </p>
            </div>
          </div>
        </section>
      )}

      {/* CTA Section */}
      {isSectionVisible('cta_title') && (
        <section className="container mx-auto px-4 py-12">
          <Card className="bg-primary text-primary-foreground">
            <CardContent className="py-8">
              <div className="flex flex-col md:flex-row items-center justify-between gap-6">
                <div>
                  <h3 className="text-2xl font-bold mb-2">
                    {getSectionContent('cta_title', 'Ready to Get Started?') || 'Ready to Get Started?'}
                  </h3>
                  <p className="text-primary-foreground/80">
                    {getSectionContent('cta_content', 'Contact us for a quote or use our fan selector tool to find the perfect solution.')}
                  </p>
                </div>
                <div className="flex gap-3">
                  <Button variant="secondary" asChild>
                    <Link to="/quote">Request Quote</Link>
                  </Button>
                  <Button 
                    variant="outline" 
                    className="border-primary-foreground text-primary-foreground bg-primary-foreground/10 hover:bg-primary-foreground/20" 
                    asChild
                  >
                    <Link to="/">Fan Selector</Link>
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </section>
      )}

      {/* Contact Info */}
      <section className="container mx-auto px-4 py-8 border-t">
        <div className="flex flex-wrap justify-center gap-8 text-sm text-muted-foreground">
          {tenant?.email && (
            <a href={`mailto:${tenant.email}`} className="flex items-center gap-2 hover:text-primary">
              <Mail className="w-4 h-4" />
              {tenant.email}
            </a>
          )}
          {tenant?.phone && (
            <a href={`tel:${tenant.phone}`} className="flex items-center gap-2 hover:text-primary">
              <Phone className="w-4 h-4" />
              {tenant.phone}
            </a>
          )}
          {tenant?.address && (
            <span className="flex items-center gap-2">
              <MapPin className="w-4 h-4" />
              {tenant.address}
            </span>
          )}
        </div>
      </section>
    </MainLayout>
  );
}