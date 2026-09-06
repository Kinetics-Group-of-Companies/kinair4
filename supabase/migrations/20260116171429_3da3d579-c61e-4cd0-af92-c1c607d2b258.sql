-- Create page_content table for customizable About and Quote page sections
CREATE TABLE public.page_content (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  page_key TEXT NOT NULL, -- 'about' or 'quote'
  section_key TEXT NOT NULL, -- 'hero_title', 'hero_description', 'mission', etc.
  title TEXT,
  content TEXT,
  is_visible BOOLEAN DEFAULT true,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, page_key, section_key)
);

-- Enable RLS
ALTER TABLE public.page_content ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Anyone can view page content" 
  ON public.page_content 
  FOR SELECT 
  USING (true);

CREATE POLICY "Admins can manage page content" 
  ON public.page_content 
  FOR ALL 
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p 
      WHERE p.user_id = auth.uid() 
      AND p.tenant_id = page_content.tenant_id
    )
    AND public.has_role(auth.uid(), 'admin')
  );

-- Create trigger for updated_at
CREATE TRIGGER update_page_content_updated_at
  BEFORE UPDATE ON public.page_content
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Create index for faster lookups
CREATE INDEX idx_page_content_lookup ON public.page_content(tenant_id, page_key);

-- Add comment
COMMENT ON TABLE public.page_content IS 'Stores customizable content for About and Quote pages';