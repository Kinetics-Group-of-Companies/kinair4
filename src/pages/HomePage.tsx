import { Link } from 'react-router-dom';
import { ArrowRight, Download, FileText, BookOpen, Wind, Zap, Shield, Award, Loader2, DoorOpen, Check } from 'lucide-react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useFanSeries, useTenantData } from '@/hooks/useFanDatabase';
import { useAirCurtainSeries } from '@/hooks/useAirCurtains';
import { usePageContent } from '@/hooks/usePageContent';
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious } from '@/components/ui/carousel';
import { Badge } from '@/components/ui/badge';
import { downloadFileWithName, getDocumentFilename } from '@/lib/downloadUtils';
import { AssistantLauncher } from '@/components/ai/AssistantLauncher';

const FEATURE_ICONS = [Wind, Zap, Shield, Award];

export default function HomePage() {
  const { data: tenant } = useTenantData();
  const { data: series = [], isLoading: seriesLoading } = useFanSeries();
  const { data: acSeries = [] } = useAirCurtainSeries();
  const { data: pageContent = [], isLoading: contentLoading } = usePageContent('home');

  const companyName = tenant?.name || 'KINAIR';

  const getSection = (key: string) => pageContent.find(s => s.section_key === key);
  const getSectionContent = (key: string, fallback: string = '') => getSection(key)?.content || fallback;
  const isSectionVisible = (key: string) => getSection(key)?.is_visible !== false;
  const getLines = (key: string, fallback: string) =>
    getSectionContent(key, fallback)
      .split('\n')
      .map(l => l.trim())
      .filter(Boolean);

  const seriesWithImages = series.filter(s => s.imageUrl);

  const features = FEATURE_ICONS.map((icon, i) => ({
    icon,
    title: getSectionContent(`feature_${i + 1}_title`, [
      'Axial & Centrifugal Fans',
      'Air Curtains',
      'Engineered Selection',
      'Complete Documentation',
    ][i]),
    description: getSectionContent(`feature_${i + 1}_description`, [
      'Wide range of impeller diameters, blade angles and motor poles for every duty point.',
      'AC and EC motor air curtains for shop fronts, cold rooms, loading bays and entrances.',
      'Software-driven selection with airflow, pressure, power, efficiency and noise data.',
      'Datasheets, technical drawings, noise data, catalogues and installation manuals.',
    ][i]),
  }));

  const isLoading = seriesLoading || contentLoading;

  return (
    <MainLayout>
      {/* Hero */}
      <section className="relative bg-gradient-primary text-primary-foreground py-20 md:py-28 overflow-hidden">
        <div className="absolute inset-0 bg-[url('/placeholder.svg')] opacity-5" />
        <div className="container mx-auto px-4 relative">
          <div className="max-w-3xl">
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold mb-6 leading-tight">
              {getSectionContent('hero_title', `${companyName} Ventilation Fans & Air Curtains`)}
            </h1>
            <p className="text-xl md:text-2xl text-primary-foreground/80 mb-8 leading-relaxed">
              {getSectionContent(
                'hero_description',
                'High-performance ventilation fans and air curtains for residential, commercial and industrial applications — with instant selection, datasheets and technical drawings.'
              )}
            </p>
            <div className="flex flex-wrap gap-4">
              <Button size="lg" variant="secondary" asChild className="group">
                <Link to="/selector">
                  Fan Selector
                  <ArrowRight className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </Link>
              </Button>
              <Button size="lg" variant="secondary" asChild className="group">
                <Link to="/air-curtain">
                  Air Curtain Selector
                  <ArrowRight className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Two product families */}
      {isSectionVisible('families') && (
        <section className="py-16">
          <div className="container mx-auto px-4">
            <div className="text-center mb-12">
              <h2 className="text-3xl font-bold mb-4">{getSectionContent('families_title', 'What We Do')}</h2>
              <p className="text-muted-foreground max-w-2xl mx-auto">
                {getSectionContent(
                  'families_description',
                  'Two product families, one selection platform — ventilation fans and air curtains for residential, commercial and industrial projects.'
                )}
              </p>
            </div>

            <div className="grid md:grid-cols-2 gap-6 max-w-5xl mx-auto">
              <Card className="h-full">
                <CardHeader>
                  <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-3">
                    <Wind className="w-6 h-6 text-primary" />
                  </div>
                  <CardTitle className="text-2xl">{getSectionContent('fans_title', 'Ventilation Fans')}</CardTitle>
                  <CardDescription>
                    {getSectionContent(
                      'fans_description',
                      'Axial and centrifugal fans for residential, commercial and industrial ventilation — HVAC, exhaust, smoke extract, car parks and process plants.'
                    )}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2 mb-6">
                    {getLines(
                      'fans_points',
                      'Duty point selection by airflow and static pressure\nBlade angle, motor pole and speed optimisation\nSound power, octave bands and NC levels\nPerformance, power and efficiency curves\nTechnical drawings and dimension tables'
                    ).map((line, i) => (
                      <li key={i} className="flex gap-2 text-sm text-muted-foreground">
                        <Check className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                        <span>{line}</span>
                      </li>
                    ))}
                  </ul>
                  <Button asChild>
                    <Link to="/selector">
                      Select a fan
                      <ArrowRight className="ml-2 w-4 h-4" />
                    </Link>
                  </Button>
                </CardContent>
              </Card>

              <Card className="h-full">
                <CardHeader>
                  <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-3">
                    <DoorOpen className="w-6 h-6 text-primary" />
                  </div>
                  <CardTitle className="text-2xl">{getSectionContent('curtains_title', 'Air Curtains')}</CardTitle>
                  <CardDescription>
                    {getSectionContent(
                      'curtains_description',
                      'AC and EC motor air curtains that hold indoor conditions at open doorways, entrances and cold rooms.'
                    )}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2 mb-6">
                    {getLines(
                      'curtains_points',
                      'Door width and mounting height based selection\nAir velocity, air volume and power comparison\nQuiet AC and low-consumption EC motor options\nUnit dimensions, weights and drawings\nInstant datasheet for the selected model'
                    ).map((line, i) => (
                      <li key={i} className="flex gap-2 text-sm text-muted-foreground">
                        <Check className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                        <span>{line}</span>
                      </li>
                    ))}
                  </ul>
                  <Button asChild>
                    <Link to="/air-curtain">
                      Select an air curtain
                      <ArrowRight className="ml-2 w-4 h-4" />
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>
      )}

      {/* Features */}
      {isSectionVisible('features') && (
        <section className="py-16 bg-muted/30">
          <div className="container mx-auto px-4">
            <div className="text-center mb-12">
              <h2 className="text-3xl font-bold mb-4">{getSectionContent('features_title', 'Why Choose Us')}</h2>
              <p className="text-muted-foreground max-w-2xl mx-auto">
                {getSectionContent(
                  'features_description',
                  'Fans and air curtains supported by real performance data, fast selection and complete technical documents.'
                )}
              </p>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {features.map((feature, idx) => (
                <Card key={idx} className="text-center hover:shadow-lg transition-shadow">
                  <CardHeader>
                    <div className="w-14 h-14 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-3">
                      <feature.icon className="w-7 h-7 text-primary" />
                    </div>
                    <CardTitle className="text-lg">{feature.title}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <CardDescription>{feature.description}</CardDescription>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Applications */}
      {isSectionVisible('applications') && (
        <section className="py-16">
          <div className="container mx-auto px-4">
            <div className="text-center mb-10">
              <h2 className="text-3xl font-bold mb-4">{getSectionContent('applications_title', 'Where Our Products Work')}</h2>
              <p className="text-muted-foreground max-w-2xl mx-auto">
                {getSectionContent(
                  'applications_description',
                  'From car park ventilation to shop front entrances, our fans and air curtains are selected for real project duties every day.'
                )}
              </p>
            </div>
            <div className="flex flex-wrap justify-center gap-3 max-w-4xl mx-auto">
              {getLines(
                'applications_list',
                'Car park ventilation\nStaircase pressurization\nLift pressurization\nSmoke and make-up air fans\nKitchen extract and make-up fans\nPump room fans\nWarehouse fans\nWarehouse air curtains\nResidential, commercial and industrial air curtains\nVilla and residential toilet and kitchen fans'
              ).map((item, i) => (
                <Badge key={i} variant="secondary" className="px-4 py-2 text-sm">
                  {item}
                </Badge>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Fan series */}
      <section className="py-16 bg-muted/30">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold mb-4">{getSectionContent('products_title', 'Our Fan Range')}</h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              {getSectionContent(
                'products_description',
                'Explore our fan series — every series is fully modelled in the selector with performance, noise and dimension data.'
              )}
            </p>
          </div>

          {isLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : seriesWithImages.length > 0 ? (
            <Carousel opts={{ align: 'start', loop: true }} className="w-full max-w-6xl mx-auto">
              <CarouselContent className="-ml-2 md:-ml-4">
                {seriesWithImages.map((s) => (
                  <CarouselItem key={s.id} className="pl-2 md:pl-4 basis-full sm:basis-1/2 lg:basis-1/3">
                    <Card className="h-full overflow-hidden group hover:shadow-xl transition-all duration-300">
                      <div className="relative aspect-[4/3] overflow-hidden bg-muted">
                        <img
                          src={s.imageUrl!}
                          alt={`${s.name} ventilation fan series`}
                          loading="lazy"
                          className="absolute inset-0 w-full h-full object-contain bg-white p-2 group-hover:scale-105 transition-transform duration-500"
                        />
                      </div>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-xl">{s.name}</CardTitle>
                        {s.fanType && <Badge variant="outline" className="w-fit">{s.fanType}</Badge>}
                      </CardHeader>
                      <CardContent>
                        <p className="text-sm text-muted-foreground mb-4 line-clamp-2">
                          {s.description || s.datasheetDescription || 'High-performance ventilation fan'}
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {s.catalogueUrl && (
                            <Button variant="outline" size="sm" asChild className="gap-1.5">
                              <a href={s.catalogueUrl} target="_blank" rel="noopener noreferrer">
                                <FileText className="w-4 h-4" />
                                Catalogue
                              </a>
                            </Button>
                          )}
                          {s.iomUrl && (
                            <Button variant="outline" size="sm" asChild className="gap-1.5">
                              <a href={s.iomUrl} target="_blank" rel="noopener noreferrer">
                                <BookOpen className="w-4 h-4" />
                                IOM
                              </a>
                            </Button>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  </CarouselItem>
                ))}
              </CarouselContent>
              <CarouselPrevious className="-left-4 md:-left-12" />
              <CarouselNext className="-right-4 md:-right-12" />
            </Carousel>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {series.map((s) => (
                <Card key={s.id} className="hover:shadow-lg transition-shadow">
                  <CardHeader>
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle>{s.name}</CardTitle>
                      {s.fanType && <Badge variant="outline">{s.fanType}</Badge>}
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground mb-4">
                      {s.description || 'High-performance ventilation fan'}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {s.catalogueUrl && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-1.5"
                          onClick={() => downloadFileWithName(s.catalogueUrl!, getDocumentFilename(s.name, 'Catalogue'))}
                        >
                          <FileText className="w-4 h-4" />
                          Catalogue
                        </Button>
                      )}
                      {s.iomUrl && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-1.5"
                          onClick={() => downloadFileWithName(s.iomUrl!, getDocumentFilename(s.name, 'IOM'))}
                        >
                          <BookOpen className="w-4 h-4" />
                          IOM
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Air curtain range */}
      {acSeries.length > 0 && isSectionVisible('ac_range') && (
        <section className="py-16">
          <div className="container mx-auto px-4">
            <div className="text-center mb-12">
              <h2 className="text-3xl font-bold mb-4">{getSectionContent('ac_range_title', 'Our Air Curtain Range')}</h2>
              <p className="text-muted-foreground max-w-2xl mx-auto">
                {getSectionContent(
                  'ac_range_description',
                  'Air curtain series for residential, commercial and industrial doorways — from shop fronts to high-traffic entrances and cold rooms.'
                )}
              </p>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl mx-auto">
              {acSeries.slice(0, 6).map((s) => (
                <Card key={s.id} className="h-full hover:shadow-lg transition-shadow overflow-hidden">
                  {s.imageUrl && (
                    <div className="relative aspect-[4/3] bg-muted">
                      <img
                        src={s.imageUrl}
                        alt={`${s.name} air curtain series`}
                        loading="lazy"
                        className="absolute inset-0 w-full h-full object-contain bg-white p-2"
                      />
                    </div>
                  )}
                  <CardHeader className="pb-2">
                    <CardTitle className="text-xl">{s.name}</CardTitle>
                    <div className="flex flex-wrap gap-2">
                      {s.motorType && <Badge variant="outline">{s.motorType} motor</Badge>}
                      {s.category && <Badge variant="secondary">{s.category}</Badge>}
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground line-clamp-3">
                      {s.description || s.datasheetDescription || 'Air curtain series'}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
            <div className="text-center mt-8">
              <Button variant="outline" asChild>
                <Link to="/air-curtain">
                  Open air curtain selector
                  <ArrowRight className="ml-2 w-4 h-4" />
                </Link>
              </Button>
            </div>
          </div>
        </section>
      )}

      {/* Documentation */}
      {series.some(s => s.catalogueUrl || s.iomUrl) && isSectionVisible('docs') && (
        <section className="py-16 bg-muted/30">
          <div className="container mx-auto px-4">
            <div className="text-center mb-12">
              <h2 className="text-3xl font-bold mb-4">{getSectionContent('docs_title', 'Technical Documentation')}</h2>
              <p className="text-muted-foreground max-w-2xl mx-auto">
                {getSectionContent('docs_description', 'Download catalogues and installation manuals for all our product series')}
              </p>
            </div>

            <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 max-w-6xl mx-auto">
              {series.filter(s => s.catalogueUrl || s.iomUrl).map((s) => (
                <Card key={s.id} className="hover:border-primary/50 transition-colors">
                  <CardContent className="pt-6">
                    <h3 className="font-semibold mb-3">{s.name}</h3>
                    <div className="flex flex-col gap-2">
                      {s.catalogueUrl && (
                        <button
                          onClick={() => downloadFileWithName(s.catalogueUrl!, getDocumentFilename(s.name, 'Catalogue'))}
                          className="flex items-center gap-2 text-sm text-primary hover:underline"
                        >
                          <FileText className="w-4 h-4" />
                          Download Catalogue
                          <Download className="w-3 h-3 ml-auto opacity-50" />
                        </button>
                      )}
                      {s.iomUrl && (
                        <button
                          onClick={() => downloadFileWithName(s.iomUrl!, getDocumentFilename(s.name, 'IOM'))}
                          className="flex items-center gap-2 text-sm text-primary hover:underline"
                        >
                          <BookOpen className="w-4 h-4" />
                          Installation Manual
                          <Download className="w-3 h-3 ml-auto opacity-50" />
                        </button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* About */}
      {isSectionVisible('about') && (
        <section className="py-16">
          <div className="container mx-auto px-4">
            <div className="max-w-4xl mx-auto">
              <div className="grid md:grid-cols-2 gap-10 items-center">
                <div>
                  <h2 className="text-3xl font-bold mb-6">
                    {getSectionContent('about_title', `About ${companyName}`)}
                  </h2>
                  <div className="space-y-4 text-muted-foreground">
                    <p>
                      {getSectionContent(
                        'about_content',
                        'We supply ventilation fans and air curtains for residential, commercial and industrial buildings — axial and centrifugal fans plus air curtains for HVAC, exhaust, smoke extract and entrance applications.'
                      )}
                    </p>
                    <p>
                      {getSectionContent(
                        'about_content_2',
                        'Every product is backed by tested performance data, so you get the right fan or air curtain with the documents you need for submission.'
                      )}
                    </p>
                  </div>
                  <div className="mt-8">
                    <Button variant="outline" asChild>
                      <Link to="/about">
                        Learn More About Us
                        <ArrowRight className="ml-2 w-4 h-4" />
                      </Link>
                    </Button>
                  </div>
                </div>
                <div className="relative">
                  {tenant?.logo_url ? (
                    <div className="aspect-square bg-muted/50 rounded-2xl flex items-center justify-center p-8">
                      <img src={tenant.logo_url} alt={companyName} className="max-w-full max-h-full object-contain" />
                    </div>
                  ) : (
                    <div className="aspect-square bg-gradient-primary rounded-2xl flex items-center justify-center">
                      <Wind className="w-24 h-24 text-primary-foreground/50" />
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* CTA */}
      <section className="py-16 bg-gradient-primary text-primary-foreground">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-3xl md:text-4xl font-bold mb-6">
            {getSectionContent('cta_title', 'Ready to Select Your Fan or Air Curtain?')}
          </h2>
          <p className="text-xl text-primary-foreground/80 mb-8 max-w-2xl mx-auto">
            {getSectionContent(
              'cta_description',
              'Use our selection tools to find the ideal fan or air curtain, and download the datasheet in seconds.'
            )}
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <Button size="lg" variant="secondary" asChild>
              <Link to="/selector">Fan Selection</Link>
            </Button>
            <Button size="lg" variant="secondary" asChild>
              <Link to="/air-curtain">Air Curtain Selection</Link>
            </Button>
            <Button size="lg" asChild className="bg-white/20 text-white border border-white/40 hover:bg-white/30">
              <Link to="/quote">Request Quote</Link>
            </Button>
          </div>
        </div>
      </section>

      <AssistantLauncher context="general" title="Ask KINAIR" />
    </MainLayout>
  );
}
