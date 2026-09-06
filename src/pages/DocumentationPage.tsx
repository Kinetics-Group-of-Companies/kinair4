import { Book, Wind, Gauge, Zap, Volume2, Shield, FileText, Loader2, Download, BookOpen } from 'lucide-react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useDocumentation, useFanSeries } from '@/hooks/useFanDatabase';
import { useTenantData } from '@/hooks/useFanDatabase';
import { downloadFileWithName, getDocumentFilename } from '@/lib/downloadUtils';

const SECTION_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  'getting-started': FileText,
  'nomenclature': Wind,
  'fan-laws': Gauge,
  'fire-class': Shield,
  'noise-data': Volume2,
};

export default function DocumentationPage() {
  const { data: tenant } = useTenantData();
  const { data: sections = [], isLoading } = useDocumentation();
  const { data: seriesList = [], isLoading: loadingSeries } = useFanSeries();
  const companyName = tenant?.name || 'Fan Selector';
  
  // Filter only visible sections
  const visibleSections = sections.filter(s => s.is_visible);
  
  // Get series with catalogues or IOMs
  const seriesWithDocs = seriesList.filter(s => (s as any).catalogueUrl || (s as any).iomUrl);
  
  // Default sections if none configured
  const defaultSections = [
    {
      section_key: 'getting-started',
      title: 'Getting Started',
      content: `The ${companyName} Fan Selector helps you find the optimal fan for your ventilation requirements. Simply enter your airflow and static pressure requirements, and the system will calculate the best fan options based on efficiency, motor size, and performance match.

Steps:
1. Enter required airflow and select unit (CMH, LPS, CFM, CMS)
2. Enter required static pressure and select unit (Pa, in.wg, mm.wg)
3. Select motor pole configuration and frequency (50/60 Hz)
4. Choose fire class if required (F300, F400)
5. Set motor safety factor
6. Click "Find Fans" to see optimal selections`,
    },
    {
      section_key: 'nomenclature',
      title: 'Model Nomenclature',
      content: `Understanding ${companyName} model naming:

KTAF/2-315-4/20°-0.37kW-F400

2 = Motor Poles (2P, 4P, 6P)
315 = Fan Casing Diameter (mm)
4 = Number of Blades
20° = Blade Angle
0.37kW = Motor Rating
F400 = Fire Class (optional)`,
    },
    {
      section_key: 'fan-laws',
      title: 'Fan Laws',
      content: `Fan laws describe the relationship between fan performance variables when speed changes:

Q₂/Q₁ = N₂/N₁
Airflow varies directly with speed

P₂/P₁ = (N₂/N₁)²
Pressure varies with speed squared

W₂/W₁ = (N₂/N₁)³
Power varies with speed cubed`,
    },
    {
      section_key: 'fire-class',
      title: 'Fire Classification',
      content: `Class F (Standard): Standard insulation class for normal operating conditions. Suitable for general ventilation applications.

F300 - 300°C/2h: Smoke extract fan certified for operation at 300°C for 2 hours. Used in smoke ventilation systems for car parks and commercial buildings.

F400 - 400°C/2h: High-temperature smoke extract fan certified for operation at 400°C for 2 hours. Required for industrial applications and high-risk areas.`,
    },
    {
      section_key: 'noise-data',
      title: 'Noise Data',
      content: `Sound power levels are provided in octave bands from 63 Hz to 8 kHz, plus overall A-weighted levels.

63 Hz - Low frequency rumble
125-250 Hz - Low-mid frequencies
500-1000 Hz - Mid frequencies (most audible)
2k-8k Hz - High frequencies
Overall dB(A) - A-weighted total sound level`,
    },
  ];

  const displaySections = visibleSections.length > 0 ? visibleSections : defaultSections;

  // Parse content to render nicely
  const renderContent = (content: string) => {
    const lines = content.split('\n');
    return lines.map((line, idx) => {
      if (line.trim() === '') return <br key={idx} />;
      // Check if it's a numbered step
      if (/^\d+\.\s/.test(line.trim())) {
        return <li key={idx} className="ml-4">{line.trim()}</li>;
      }
      // Check if it's a key-value pair (like "2 = Motor Poles")
      if (line.includes(' = ')) {
        const [key, value] = line.split(' = ');
        return (
          <div key={idx} className="flex items-start gap-2 py-1">
            <span className="font-mono text-primary font-bold">{key.trim()}</span>
            <span className="text-muted-foreground">{value.trim()}</span>
          </div>
        );
      }
      // Check if it's a formula line
      if (line.includes('₂') || line.includes('₁')) {
        return (
          <div key={idx} className="bg-muted/50 rounded-lg p-3 border my-2">
            <div className="font-mono text-primary">{line}</div>
          </div>
        );
      }
      // Check if it's a definition with colon
      if (line.includes(':') && !line.startsWith('Steps')) {
        const colonIndex = line.indexOf(':');
        const title = line.substring(0, colonIndex + 1);
        const desc = line.substring(colonIndex + 1);
        if (title.length < 30) {
          return (
            <p key={idx} className="text-muted-foreground py-1">
              <strong className="text-foreground">{title}</strong>{desc}
            </p>
          );
        }
      }
      return <p key={idx} className="text-muted-foreground py-1">{line}</p>;
    });
  };

  return (
    <MainLayout>
      {/* Hero Section */}
      <section className="bg-gradient-primary text-primary-foreground py-10">
        <div className="container mx-auto px-4">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 bg-primary-foreground/20 rounded-2xl flex items-center justify-center">
              <Book className="w-8 h-8" />
            </div>
            <div>
              <h1 className="text-3xl font-bold">Documentation</h1>
              <h2 className="sr-only">Technical guides, specifications and downloadable resources</h2>
              <p className="text-primary-foreground/80 mt-1">
                Technical specifications, user guides, and downloadable resources
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Documentation Content */}
      <section className="container mx-auto px-4 py-8">
        {isLoading || loadingSeries ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin" />
          </div>
        ) : (
          <div className="grid lg:grid-cols-3 gap-6">
            {/* Sidebar Navigation */}
            <div className="lg:col-span-1">
              <div className="space-y-4 sticky top-24">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Quick Links</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {seriesWithDocs.length > 0 && (
                      <a 
                        href="#downloads" 
                        className="block text-sm text-primary font-medium hover:underline transition-colors py-1"
                      >
                        📥 Downloads & Manuals
                      </a>
                    )}
                    {displaySections.map(section => (
                      <a 
                        key={section.section_key}
                        href={`#${section.section_key}`} 
                        className="block text-sm text-muted-foreground hover:text-primary transition-colors py-1"
                      >
                        {section.title}
                      </a>
                    ))}
                  </CardContent>
                </Card>
                
                {/* Downloads Card in Sidebar */}
                {seriesWithDocs.length > 0 && (
                  <Card className="border-primary/20 bg-primary/5">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base flex items-center gap-2">
                        <Download className="w-4 h-4 text-primary" />
                        Quick Downloads
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {seriesWithDocs.slice(0, 3).map(s => (
                        <div key={s.id} className="text-sm">
                          <span className="font-medium">{s.name}</span>
                          <div className="flex gap-2 mt-1">
                            {(s as any).catalogueUrl && (
                              <button 
                                onClick={() => downloadFileWithName((s as any).catalogueUrl, getDocumentFilename(s.name, 'Catalogue'))}
                                className="text-xs text-primary hover:underline"
                              >
                                Catalogue
                              </button>
                            )}
                            {(s as any).iomUrl && (
                              <button 
                                onClick={() => downloadFileWithName((s as any).iomUrl, getDocumentFilename(s.name, 'IOM'))}
                                className="text-xs text-primary hover:underline"
                              >
                                IOM
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                )}
              </div>
            </div>

            {/* Main Content */}
            <div className="lg:col-span-2 space-y-8">
              {/* Downloads Section */}
              {seriesWithDocs.length > 0 && (
                <Card id="downloads" className="border-primary/30">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Download className="w-5 h-5 text-primary" />
                      Downloads & Manuals
                    </CardTitle>
                    <CardDescription>
                      Product catalogues and installation & operation manuals for each fan series
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="grid sm:grid-cols-2 gap-4">
                      {seriesWithDocs.map(series => (
                        <div 
                          key={series.id} 
                          className="p-4 border rounded-lg bg-card hover:bg-muted/50 transition-colors"
                        >
                          <h4 className="font-semibold mb-3">{series.name}</h4>
                          <div className="flex flex-wrap gap-2">
                            {(series as any).catalogueUrl && (
                              <Button 
                                variant="outline" 
                                size="sm" 
                                className="gap-1"
                                onClick={() => downloadFileWithName((series as any).catalogueUrl, getDocumentFilename(series.name, 'Catalogue'))}
                              >
                                <FileText className="w-4 h-4" />
                                Catalogue
                              </Button>
                            )}
                            {(series as any).iomUrl && (
                              <Button 
                                variant="outline" 
                                size="sm" 
                                className="gap-1"
                                onClick={() => downloadFileWithName((series as any).iomUrl, getDocumentFilename(series.name, 'IOM'))}
                              >
                                <BookOpen className="w-4 h-4" />
                                IOM Manual
                              </Button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Documentation Sections */}
              {displaySections.map(section => {
                const IconComponent = SECTION_ICONS[section.section_key] || FileText;
                return (
                  <Card key={section.section_key} id={section.section_key}>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <IconComponent className="w-5 h-5 text-primary" />
                        {section.title}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="prose prose-sm max-w-none">
                      {renderContent(section.content || '')}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        )}
      </section>
    </MainLayout>
  );
}