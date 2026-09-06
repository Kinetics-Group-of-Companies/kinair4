import { useState } from 'react';
import { Send, CheckCircle, Building2, User, Mail, Phone, FileText, Package, Loader2 } from 'lucide-react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useTenantData } from '@/hooks/useFanDatabase';
import { usePageContent } from '@/hooks/usePageContent';
import { toast } from 'sonner';

export default function QuotePage() {
  const { data: tenant } = useTenantData();
  const { data: pageContent = [], isLoading: loadingContent } = usePageContent('quote');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);

  // Helper to get content by section key
  const getSection = (key: string) => pageContent.find(s => s.section_key === key);
  const getSectionContent = (key: string, fallback: string = '') => 
    getSection(key)?.content || fallback;
  const isSectionVisible = (key: string) => getSection(key)?.is_visible !== false;
  
  const [formData, setFormData] = useState({
    companyName: '',
    contactName: '',
    email: '',
    phone: '',
    projectName: '',
    fanRequirements: '',
    quantity: '',
    additionalNotes: '',
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.email || !formData.contactName || !formData.fanRequirements) {
      toast.error('Please fill in all required fields');
      return;
    }

    setIsSubmitting(true);
    
    // Simulate submission - in production, this would send to an API/email
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    setIsSubmitting(false);
    setIsSubmitted(true);
    toast.success('Quote request submitted successfully!');
  };

  if (isSubmitted) {
    return (
      <MainLayout>
        <section className="container mx-auto px-4 py-16">
          <Card className="max-w-lg mx-auto text-center">
            <CardContent className="py-12">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
                <CheckCircle className="w-8 h-8 text-green-600" />
              </div>
              <h2 className="text-2xl font-bold mb-2">Quote Request Received!</h2>
              <p className="text-muted-foreground mb-6">
                Thank you for your interest. Our team will review your requirements and 
                get back to you within 24-48 business hours.
              </p>
              <div className="flex gap-3 justify-center">
                <Button onClick={() => setIsSubmitted(false)}>Submit Another Request</Button>
                <Button variant="outline" asChild>
                  <a href="/">Back to Fan Selector</a>
                </Button>
              </div>
            </CardContent>
          </Card>
        </section>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      {/* Hero Section */}
      <section className="bg-gradient-primary text-primary-foreground py-10">
        <div className="container mx-auto px-4">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 bg-primary-foreground/20 rounded-2xl flex items-center justify-center">
              <FileText className="w-8 h-8" />
            </div>
            <div>
              <h1 className="text-3xl font-bold">
                {getSectionContent('hero_title', 'Request a Quote') || 'Request a Quote'}
              </h1>
              <h2 className="sr-only">Quote request form and contact details</h2>
              <p className="text-primary-foreground/80 mt-1">
                {getSectionContent('hero_description', 'Get a customized quote for your ventilation needs')}
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="container mx-auto px-4 py-8">
        <div className="grid lg:grid-cols-3 gap-8">
          {/* Form */}
          <div className="lg:col-span-2">
            <Card>
              <CardHeader>
                <CardTitle>Quote Request Form</CardTitle>
                <CardDescription>
                  {getSectionContent('form_intro', 'Fill in your details and requirements. Fields marked with * are required.')}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSubmit} className="space-y-6">
                  {/* Company Info */}
                  <div className="space-y-4">
                    <h3 className="font-semibold flex items-center gap-2 text-sm">
                      <Building2 className="w-4 h-4 text-primary" />
                      Company Information
                    </h3>
                    <div className="grid sm:grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="companyName">Company Name</Label>
                        <Input
                          id="companyName"
                          name="companyName"
                          value={formData.companyName}
                          onChange={handleChange}
                          placeholder="Your company name"
                          className="mt-1"
                        />
                      </div>
                      <div>
                        <Label htmlFor="projectName">Project Name</Label>
                        <Input
                          id="projectName"
                          name="projectName"
                          value={formData.projectName}
                          onChange={handleChange}
                          placeholder="Project reference"
                          className="mt-1"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Contact Info */}
                  <div className="space-y-4">
                    <h3 className="font-semibold flex items-center gap-2 text-sm">
                      <User className="w-4 h-4 text-primary" />
                      Contact Details
                    </h3>
                    <div className="grid sm:grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="contactName">Contact Name *</Label>
                        <Input
                          id="contactName"
                          name="contactName"
                          value={formData.contactName}
                          onChange={handleChange}
                          placeholder="Your name"
                          required
                          className="mt-1"
                        />
                      </div>
                      <div>
                        <Label htmlFor="email">Email Address *</Label>
                        <Input
                          id="email"
                          name="email"
                          type="email"
                          value={formData.email}
                          onChange={handleChange}
                          placeholder="you@company.com"
                          required
                          className="mt-1"
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <Label htmlFor="phone">Phone Number</Label>
                        <Input
                          id="phone"
                          name="phone"
                          type="tel"
                          value={formData.phone}
                          onChange={handleChange}
                          placeholder="+1 234 567 8900"
                          className="mt-1"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Requirements */}
                  <div className="space-y-4">
                    <h3 className="font-semibold flex items-center gap-2 text-sm">
                      <Package className="w-4 h-4 text-primary" />
                      Fan Requirements
                    </h3>
                    <div>
                      <Label htmlFor="fanRequirements">Describe Your Requirements *</Label>
                      <Textarea
                        id="fanRequirements"
                        name="fanRequirements"
                        value={formData.fanRequirements}
                        onChange={handleChange}
                        placeholder="Please describe the fans you need: series, diameter, airflow, pressure, fire rating, quantity, etc."
                        rows={4}
                        required
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label htmlFor="quantity">Estimated Quantity</Label>
                      <Input
                        id="quantity"
                        name="quantity"
                        value={formData.quantity}
                        onChange={handleChange}
                        placeholder="e.g., 10 units"
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label htmlFor="additionalNotes">Additional Notes</Label>
                      <Textarea
                        id="additionalNotes"
                        name="additionalNotes"
                        value={formData.additionalNotes}
                        onChange={handleChange}
                        placeholder="Any other information or special requirements"
                        rows={3}
                        className="mt-1"
                      />
                    </div>
                  </div>

                  <Button type="submit" size="lg" className="w-full" disabled={isSubmitting}>
                    {isSubmitting ? (
                      <>Processing...</>
                    ) : (
                      <>
                        <Send className="w-4 h-4 mr-2" />
                        Submit Quote Request
                      </>
                    )}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </div>

          {/* Sidebar */}
          <div className="space-y-4">
            {isSectionVisible('why_choose_us_title') && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">
                    {getSectionContent('why_choose_us_title', 'Why Choose Us?') || 'Why Choose Us?'}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm text-muted-foreground">
                  {getSectionContent('why_choose_us_content', '✓ Fast response within 24-48 hours\n✓ Competitive pricing\n✓ Custom engineering support\n✓ AMCA certified products\n✓ Fire-rated options available')
                    .split('\n')
                    .filter(line => line.trim())
                    .map((line, idx) => (
                      <p key={idx}>{line}</p>
                    ))}
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Contact Us Directly</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                {tenant?.email && (
                  <a href={`mailto:${tenant.email}`} className="flex items-center gap-2 text-primary hover:underline">
                    <Mail className="w-4 h-4" />
                    {tenant.email}
                  </a>
                )}
                {tenant?.phone && (
                  <a href={`tel:${tenant.phone}`} className="flex items-center gap-2 text-primary hover:underline">
                    <Phone className="w-4 h-4" />
                    {tenant.phone}
                  </a>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </section>
    </MainLayout>
  );
}