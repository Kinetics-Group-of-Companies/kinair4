import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface MigrationRequest {
  targetUrl: string;
  targetAnonKey: string;
  targetServiceKey: string;
  tenantId: string;
  dbPassword: string;
  projectRef: string;
  poolerHost: string;
}

const TABLES_TO_MIGRATE = [
  'tenants', 'profiles', 'user_roles', 'fan_series', 'fan_models',
  'blade_configurations', 'performance_data', 'noise_data', 'fan_dimensions',
  'motor_brands', 'motor_specifications', 'casing_weights', 'impeller_weights',
  'unit_preferences', 'datasheet_config', 'documentation_sections', 'page_content',
  'accessory_descriptions', 'fire_rating_descriptions', 'atex_rating_descriptions',
  'series_dimension_schema', 'series_dimension_values', 'projects', 'project_items',
];

// Generate individual CREATE TABLE statements (one per table for better error handling)
function getTableDDL(): { name: string; sql: string }[] {
  return [
    { name: 'enum_app_role', sql: `DO $$ BEGIN CREATE TYPE public.app_role AS ENUM ('admin', 'user'); EXCEPTION WHEN duplicate_object THEN null; END $$` },
    
    { name: 'tenants', sql: `CREATE TABLE IF NOT EXISTS public.tenants (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      name text NOT NULL DEFAULT '',
      email text, phone text, address text, factory_address text,
      logo_url text, favicon_url text, google_maps_url text,
      is_active boolean DEFAULT true,
      subscription_start timestamp with time zone,
      subscription_end timestamp with time zone,
      created_at timestamp with time zone NOT NULL DEFAULT now(),
      updated_at timestamp with time zone NOT NULL DEFAULT now()
    )` },
    
    { name: 'profiles', sql: `CREATE TABLE IF NOT EXISTS public.profiles (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid NOT NULL,
      tenant_id uuid REFERENCES public.tenants(id),
      display_name text, email text,
      is_approved boolean DEFAULT false,
      approval_requested_at timestamp with time zone DEFAULT now(),
      approved_at timestamp with time zone, approved_by uuid,
      created_at timestamp with time zone NOT NULL DEFAULT now(),
      updated_at timestamp with time zone NOT NULL DEFAULT now()
    )` },
    
    { name: 'user_roles', sql: `CREATE TABLE IF NOT EXISTS public.user_roles (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid NOT NULL,
      role public.app_role NOT NULL DEFAULT 'user',
      UNIQUE(user_id)
    )` },
    
    { name: 'fan_series', sql: `CREATE TABLE IF NOT EXISTS public.fan_series (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id uuid NOT NULL REFERENCES public.tenants(id),
      name text NOT NULL, description text, datasheet_description text,
      image_url text, drawing_url text, catalogue_url text, iom_url text,
      fan_type text DEFAULT 'axial', nomenclature_template text DEFAULT '{series}-{size}',
      fire_rating varchar, compatible_accessories text[] DEFAULT '{}',
      show_octave_bands boolean NOT NULL DEFAULT true,
      default_safety_factor numeric DEFAULT 1.15,
      default_directivity_q integer DEFAULT 2, default_noise_distance numeric DEFAULT 0,
      sound_outlet_reduction numeric DEFAULT 0,
      stall_airflow_min_percent numeric DEFAULT 15, stall_airflow_max_percent numeric DEFAULT 95,
      amca_certified boolean DEFAULT false, ce_certified boolean DEFAULT false,
      iso_certified boolean DEFAULT false, ul_certified boolean DEFAULT false, atex_certified boolean DEFAULT false,
      amca_logo_url text, ce_logo_url text, iso_logo_url text, ul_logo_url text, atex_logo_url text,
      fire_rating_logo_url text, custom_cert_name text, custom_cert_logo_url text,
      created_at timestamp with time zone NOT NULL DEFAULT now(),
      updated_at timestamp with time zone NOT NULL DEFAULT now()
    )` },
    
    { name: 'fan_models', sql: `CREATE TABLE IF NOT EXISTS public.fan_models (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id uuid NOT NULL REFERENCES public.tenants(id),
      series_id uuid REFERENCES public.fan_series(id),
      diameter integer NOT NULL, model_name text, product_code text, drawing_url text,
      motor_poles integer[] DEFAULT '{2,4,6,8,12}', reference_poles integer DEFAULT 4,
      insulation_class text, ip_rating text, weight numeric,
      created_at timestamp with time zone NOT NULL DEFAULT now(),
      updated_at timestamp with time zone NOT NULL DEFAULT now()
    )` },
    
    { name: 'blade_configurations', sql: `CREATE TABLE IF NOT EXISTS public.blade_configurations (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      fan_model_id uuid NOT NULL REFERENCES public.fan_models(id) ON DELETE CASCADE,
      blade_count integer NOT NULL, blade_angles integer[] DEFAULT '{}',
      created_at timestamp with time zone NOT NULL DEFAULT now()
    )` },
    
    { name: 'performance_data', sql: `CREATE TABLE IF NOT EXISTS public.performance_data (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      blade_config_id uuid NOT NULL REFERENCES public.blade_configurations(id) ON DELETE CASCADE,
      blade_angle integer NOT NULL, motor_poles integer, point_index integer NOT NULL,
      airflow numeric NOT NULL, static_pressure numeric NOT NULL,
      shaft_power numeric NOT NULL, efficiency numeric NOT NULL, total_efficiency numeric DEFAULT 0,
      created_at timestamp with time zone NOT NULL DEFAULT now()
    )` },
    
    { name: 'noise_data', sql: `CREATE TABLE IF NOT EXISTS public.noise_data (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      blade_config_id uuid NOT NULL REFERENCES public.blade_configurations(id) ON DELETE CASCADE,
      blade_angle integer NOT NULL, motor_poles integer,
      hz63 numeric, hz125 numeric, hz250 numeric, hz500 numeric,
      hz1k numeric, hz2k numeric, hz4k numeric, hz8k numeric, overall numeric,
      created_at timestamp with time zone NOT NULL DEFAULT now()
    )` },
    
    { name: 'fan_dimensions', sql: `CREATE TABLE IF NOT EXISTS public.fan_dimensions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      series_id uuid NOT NULL REFERENCES public.fan_series(id) ON DELETE CASCADE,
      size integer, model_name text,
      phi_d numeric, phi_d1 numeric, phi_d2 numeric, h numeric, e numeric, f numeric, k numeric, l numeric,
      n_phi_d text, z_phi_d1 text, motor_max text,
      created_at timestamp with time zone NOT NULL DEFAULT now(),
      updated_at timestamp with time zone NOT NULL DEFAULT now()
    )` },
    
    { name: 'motor_brands', sql: `CREATE TABLE IF NOT EXISTS public.motor_brands (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id uuid NOT NULL REFERENCES public.tenants(id),
      name text NOT NULL,
      created_at timestamp with time zone NOT NULL DEFAULT now()
    )` },
    
    { name: 'motor_specifications', sql: `CREATE TABLE IF NOT EXISTS public.motor_specifications (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id uuid NOT NULL REFERENCES public.tenants(id),
      brand_id uuid REFERENCES public.motor_brands(id),
      series_id uuid REFERENCES public.fan_series(id),
      model_id uuid REFERENCES public.fan_models(id),
      series_ids uuid[] NOT NULL DEFAULT '{}',
      model_ids uuid[] NOT NULL DEFAULT '{}',
      motor_poles integer NOT NULL, rating_kw numeric NOT NULL,
      motor_frame text, motor_weight numeric,
      ip_rating text DEFAULT 'IP55', insulation_class text DEFAULT 'F', efficiency_class text DEFAULT 'IE3',
      voltage numeric DEFAULT 415, frequency integer DEFAULT 50, phase integer DEFAULT 3, rpm integer,
      rated_current numeric, full_load_current numeric, starting_current numeric,
      fire_rating text, atex_rating text,
      is_dual_speed boolean DEFAULT false, secondary_poles integer, secondary_rating_kw numeric, secondary_rpm integer,
      created_at timestamp with time zone NOT NULL DEFAULT now(),
      updated_at timestamp with time zone NOT NULL DEFAULT now()
    )` },
    
    { name: 'casing_weights', sql: `CREATE TABLE IF NOT EXISTS public.casing_weights (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id uuid NOT NULL REFERENCES public.tenants(id),
      series_id uuid REFERENCES public.fan_series(id),
      diameter integer NOT NULL, model_name text, weight numeric NOT NULL,
      created_at timestamp with time zone NOT NULL DEFAULT now()
    )` },
    
    { name: 'impeller_weights', sql: `CREATE TABLE IF NOT EXISTS public.impeller_weights (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id uuid NOT NULL REFERENCES public.tenants(id),
      series_id uuid REFERENCES public.fan_series(id),
      diameter integer NOT NULL, blade_count integer NOT NULL, model_name text, weight numeric NOT NULL,
      created_at timestamp with time zone NOT NULL DEFAULT now()
    )` },
    
    { name: 'unit_preferences', sql: `CREATE TABLE IF NOT EXISTS public.unit_preferences (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id uuid NOT NULL REFERENCES public.tenants(id) UNIQUE,
      airflow_unit text DEFAULT 'CMH', pressure_unit text DEFAULT 'Pa', power_unit text DEFAULT 'kW',
      default_tolerance_min numeric, default_tolerance_max numeric,
      created_at timestamp with time zone NOT NULL DEFAULT now(),
      updated_at timestamp with time zone NOT NULL DEFAULT now()
    )` },
    
    { name: 'datasheet_config', sql: `CREATE TABLE IF NOT EXISTS public.datasheet_config (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      series_id uuid NOT NULL REFERENCES public.fan_series(id) UNIQUE,
      header_title text DEFAULT 'Technical Datasheet',
      show_description boolean NOT NULL DEFAULT true, show_duty_point boolean NOT NULL DEFAULT true,
      show_operating_point boolean NOT NULL DEFAULT true, show_construction boolean NOT NULL DEFAULT true,
      show_motor_characteristics boolean NOT NULL DEFAULT true, show_performance_curves boolean NOT NULL DEFAULT true,
      show_noise_section boolean NOT NULL DEFAULT true, show_octave_bands boolean NOT NULL DEFAULT true,
      show_technical_drawing boolean NOT NULL DEFAULT true, show_dimensions_table boolean NOT NULL DEFAULT true,
      show_certifications boolean NOT NULL DEFAULT true, show_standard_notes boolean NOT NULL DEFAULT true,
      show_vfd_features boolean NOT NULL DEFAULT false, show_family_curve boolean NOT NULL DEFAULT false,
      show_brand_logo boolean DEFAULT true, show_series_photo boolean DEFAULT true,
      show_fan_curve boolean DEFAULT true, show_power_curve boolean DEFAULT true, show_efficiency_curve boolean DEFAULT true,
      show_efficiency boolean DEFAULT true, show_blade_count boolean DEFAULT true, show_blade_angle boolean DEFAULT true,
      show_motor_brand boolean DEFAULT true, show_motor_efficiency_class boolean DEFAULT true,
      show_cert_amca boolean DEFAULT true, show_cert_ce boolean DEFAULT true, show_cert_ul boolean DEFAULT true,
      show_cert_fire_rating boolean DEFAULT true, show_catalogue_qr boolean DEFAULT true, show_iom_qr boolean DEFAULT true,
      section_title_duty_point text DEFAULT 'Duty Point', section_title_operating_point text DEFAULT 'Operating Point',
      section_title_construction text DEFAULT 'Construction', section_title_motor text DEFAULT 'Motor Characteristics',
      section_title_noise text DEFAULT 'Sound Data', section_title_certifications text DEFAULT 'Certifications',
      section_title_dimensions text DEFAULT 'Dimensions',
      duty_point_labels jsonb DEFAULT '{}', operating_point_labels jsonb DEFAULT '{}',
      construction_labels jsonb DEFAULT '{}', motor_labels jsonb DEFAULT '{}',
      certification_order jsonb DEFAULT '[]', custom_certifications jsonb DEFAULT '[]', custom_sections jsonb DEFAULT '[]',
      custom_description text, custom_notes text, vfd_features_content text,
      standard_notes_text text, noise_directive_text text, noise_reference_text text,
      created_at timestamp with time zone NOT NULL DEFAULT now(),
      updated_at timestamp with time zone NOT NULL DEFAULT now()
    )` },
    
    { name: 'documentation_sections', sql: `CREATE TABLE IF NOT EXISTS public.documentation_sections (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id uuid NOT NULL REFERENCES public.tenants(id),
      section_key text NOT NULL, title text NOT NULL, content text,
      display_order integer DEFAULT 0, is_visible boolean DEFAULT true,
      created_at timestamp with time zone NOT NULL DEFAULT now(),
      updated_at timestamp with time zone NOT NULL DEFAULT now()
    )` },
    
    { name: 'page_content', sql: `CREATE TABLE IF NOT EXISTS public.page_content (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id uuid NOT NULL REFERENCES public.tenants(id),
      page_key text NOT NULL, section_key text NOT NULL, title text, content text,
      display_order integer DEFAULT 0, is_visible boolean DEFAULT true,
      created_at timestamp with time zone NOT NULL DEFAULT now(),
      updated_at timestamp with time zone NOT NULL DEFAULT now()
    )` },
    
    { name: 'accessory_descriptions', sql: `CREATE TABLE IF NOT EXISTS public.accessory_descriptions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id uuid NOT NULL REFERENCES public.tenants(id),
      accessory_code text NOT NULL, description text NOT NULL,
      created_at timestamp with time zone NOT NULL DEFAULT now(),
      updated_at timestamp with time zone NOT NULL DEFAULT now()
    )` },
    
    { name: 'fire_rating_descriptions', sql: `CREATE TABLE IF NOT EXISTS public.fire_rating_descriptions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id uuid NOT NULL REFERENCES public.tenants(id),
      fire_class text NOT NULL, description text NOT NULL,
      created_at timestamp with time zone NOT NULL DEFAULT now(),
      updated_at timestamp with time zone NOT NULL DEFAULT now()
    )` },
    
    { name: 'atex_rating_descriptions', sql: `CREATE TABLE IF NOT EXISTS public.atex_rating_descriptions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id uuid NOT NULL REFERENCES public.tenants(id),
      atex_code text NOT NULL, description text NOT NULL,
      created_at timestamp with time zone NOT NULL DEFAULT now(),
      updated_at timestamp with time zone NOT NULL DEFAULT now()
    )` },
    
    { name: 'series_dimension_schema', sql: `CREATE TABLE IF NOT EXISTS public.series_dimension_schema (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      series_id uuid NOT NULL REFERENCES public.fan_series(id) ON DELETE CASCADE,
      param_key text NOT NULL, param_label text NOT NULL, param_type text NOT NULL DEFAULT 'number',
      display_order integer NOT NULL DEFAULT 0,
      created_at timestamp with time zone NOT NULL DEFAULT now()
    )` },
    
    { name: 'series_dimension_values', sql: `CREATE TABLE IF NOT EXISTS public.series_dimension_values (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      series_id uuid NOT NULL REFERENCES public.fan_series(id) ON DELETE CASCADE,
      size integer NOT NULL, values jsonb DEFAULT '{}', is_from_model boolean DEFAULT false,
      created_at timestamp with time zone NOT NULL DEFAULT now(),
      updated_at timestamp with time zone NOT NULL DEFAULT now()
    )` },
    
    { name: 'projects', sql: `CREATE TABLE IF NOT EXISTS public.projects (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id uuid NOT NULL REFERENCES public.tenants(id),
      user_id uuid NOT NULL, name text NOT NULL, description text, project_reference text,
      status text NOT NULL DEFAULT 'draft',
      client_name text, client_email text, client_phone text, client_address text, notes text,
      created_at timestamp with time zone NOT NULL DEFAULT now(),
      updated_at timestamp with time zone NOT NULL DEFAULT now()
    )` },
    
    { name: 'project_items', sql: `CREATE TABLE IF NOT EXISTS public.project_items (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id uuid NOT NULL REFERENCES public.tenants(id),
      project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
      series_id uuid REFERENCES public.fan_series(id),
      fan_model_id uuid REFERENCES public.fan_models(id),
      series_name text NOT NULL, diameter integer NOT NULL,
      blade_count integer NOT NULL, blade_angle integer NOT NULL, motor_poles integer NOT NULL,
      required_airflow numeric NOT NULL, required_pressure numeric NOT NULL,
      quantity integer NOT NULL DEFAULT 1, unit_price numeric, notes text, nomenclature text,
      airflow_unit text DEFAULT 'CMH', pressure_unit text DEFAULT 'Pa',
      altitude numeric DEFAULT 0, temperature numeric DEFAULT 20, air_density numeric DEFAULT 1.2, frequency integer DEFAULT 50,
      operating_airflow numeric, operating_pressure numeric, efficiency numeric, shaft_power numeric,
      dynamic_pressure numeric, total_pressure numeric, outlet_velocity numeric, fan_rpm integer,
      motor_rating_kw numeric, motor_frame text, motor_brand_name text,
      motor_insulation_class text, motor_efficiency_class text, motor_ip_rating text,
      motor_voltage numeric, motor_phase integer DEFAULT 3,
      motor_rated_current numeric, motor_full_load_current numeric, motor_starting_current numeric, motor_weight numeric,
      motor_fire_rating text, casing_weight numeric, impeller_weight numeric, total_weight numeric,
      fire_class text, atex_rating text, selected_accessories text[] DEFAULT '{}',
      flexible_dimension_values jsonb DEFAULT '{}',
      noise_distance numeric DEFAULT 0, noise_directivity_q integer DEFAULT 2, sound_outlet_reduction numeric DEFAULT 0,
      stall_min_percent numeric DEFAULT 15, stall_max_percent numeric DEFAULT 95,
      vfd_enabled boolean DEFAULT false, vfd_frequency numeric,
      voltage_drive_enabled boolean DEFAULT false, drive_voltage numeric, nominal_voltage numeric DEFAULT 415,
      datasheet_url text,
      created_at timestamp with time zone NOT NULL DEFAULT now(),
      updated_at timestamp with time zone NOT NULL DEFAULT now()
    )` },
  ];
}

function getRLSStatements(): string[] {
  const tables = ['tenants', 'profiles', 'user_roles', 'fan_series', 'fan_models', 
    'blade_configurations', 'performance_data', 'noise_data', 'fan_dimensions',
    'motor_brands', 'motor_specifications', 'casing_weights', 'impeller_weights',
    'unit_preferences', 'datasheet_config', 'documentation_sections', 'page_content',
    'accessory_descriptions', 'fire_rating_descriptions', 'atex_rating_descriptions',
    'series_dimension_schema', 'series_dimension_values', 'projects', 'project_items'];
  
  const statements: string[] = [];

  for (const table of tables) {
    // Data migration below uses the service role key, which already bypasses RLS,
    // so no policy is needed here. Enabling RLS with zero policies is a safe
    // default-deny starting point — do not add a permissive "allow all" policy,
    // since it would keep granting anon/authenticated access after this runs.
    statements.push(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY`);
    statements.push(`DROP POLICY IF EXISTS "Allow all for migration" ON public.${table}`);
  }

  return statements;
}

function getCompatibilityStatements(): string[] {
  return [
    `ALTER TABLE public.motor_specifications
      ADD COLUMN IF NOT EXISTS series_ids uuid[] NOT NULL DEFAULT '{}',
      ADD COLUMN IF NOT EXISTS model_ids uuid[] NOT NULL DEFAULT '{}'`,
    `UPDATE public.motor_specifications
      SET series_ids = CASE
            WHEN cardinality(series_ids) = 0 AND series_id IS NOT NULL THEN ARRAY[series_id]
            ELSE series_ids
          END,
          model_ids = CASE
            WHEN cardinality(model_ids) = 0 AND model_id IS NOT NULL THEN ARRAY[model_id]
            ELSE model_ids
          END`,
  ];
}

function getHelperFunctions(): string[] {
  return [
    `CREATE OR REPLACE FUNCTION public.get_user_tenant_id(_user_id uuid)
    RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
    AS $$ SELECT tenant_id FROM public.profiles WHERE user_id = _user_id $$`,
    
    `CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
    RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
    AS $$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role) $$`,
    
    `CREATE OR REPLACE FUNCTION public.is_super_admin(_user_id uuid)
    RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
    AS $$ SELECT EXISTS (SELECT 1 FROM public.profiles WHERE user_id = _user_id AND email IN ('chndeepak7@gmail.com', 'deepak@kineticsgroup.ae')) $$`,
    
    `CREATE OR REPLACE FUNCTION public.is_user_active(_user_id uuid)
    RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
    AS $$ SELECT EXISTS (SELECT 1 FROM public.profiles p JOIN public.tenants t ON t.id = p.tenant_id WHERE p.user_id = _user_id AND p.is_approved = true AND t.is_active = true AND (t.subscription_end IS NULL OR t.subscription_end > now())) $$`,
    
    `CREATE OR REPLACE FUNCTION public.update_updated_at_column()
    RETURNS trigger LANGUAGE plpgsql SET search_path = public
    AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$`,
  ];
}

async function executeSchemaSQL(projectRef: string, dbPassword: string, poolerHost: string): Promise<{ success: boolean; error?: string; tablesCreated: number; errors: string[] }> {
  console.log('=== Executing Schema SQL (Session Mode) ===');
  
  // Use SESSION mode pooler (port 5432) instead of transaction mode for DDL
  // Format: postgresql://postgres.[project-ref]:[password]@[pooler-host]:5432/postgres
  const connectionString = `postgresql://postgres.${projectRef}:${encodeURIComponent(dbPassword)}@${poolerHost}:5432/postgres`;
  
  console.log(`Connecting with session mode to: ${poolerHost}:5432`);
  
  const errors: string[] = [];
  let tablesCreated = 0;
  
  try {
    const { default: postgres } = await import("https://deno.land/x/postgresjs@v3.4.4/mod.js");
    
    const sql = postgres(connectionString, {
      max: 1,
      idle_timeout: 30,
      connect_timeout: 60,
    });

    // Test connection first
    try {
      const result = await sql`SELECT 1 as test`;
      console.log('✓ Database connection successful');
    } catch (connErr) {
      console.error('✗ Connection test failed:', connErr);
      await sql.end();
      return { success: false, error: `Connection failed: ${(connErr as Error).message}`, tablesCreated: 0, errors: [(connErr as Error).message] };
    }

    // Execute table DDL statements one by one
    const tableDDL = getTableDDL();
    console.log(`Executing ${tableDDL.length} table creation statements...`);
    
    for (const { name, sql: ddlSql } of tableDDL) {
      try {
        await sql.unsafe(ddlSql);
        console.log(`✓ Created: ${name}`);
        tablesCreated++;
      } catch (err) {
        const errMsg = (err as Error).message || '';
        if (errMsg.includes('already exists')) {
          console.log(`~ Exists: ${name}`);
          tablesCreated++;
        } else {
          console.error(`✗ Failed: ${name} - ${errMsg}`);
          errors.push(`${name}: ${errMsg}`);
        }
      }
    }

    // Upgrade databases created by older migration-tool versions. CREATE TABLE IF
    // NOT EXISTS does not add newly introduced multi-lock columns to an existing table.
    console.log('Applying schema compatibility upgrades...');
    const compatibilityStatements = getCompatibilityStatements();
    for (let i = 0; i < compatibilityStatements.length; i++) {
      try {
        await sql.unsafe(compatibilityStatements[i]);
        console.log(`✓ Compatibility upgrade ${i + 1}/${compatibilityStatements.length} applied`);
      } catch (err) {
        const errMsg = (err as Error).message || '';
        console.error(`✗ Compatibility upgrade ${i + 1} failed: ${errMsg}`);
        errors.push(`compatibility upgrade ${i + 1}: ${errMsg}`);
      }
    }

    // Execute helper functions
    console.log('Creating helper functions...');
    const functions = getHelperFunctions();
    for (let i = 0; i < functions.length; i++) {
      try {
        await sql.unsafe(functions[i]);
        console.log(`✓ Function ${i + 1}/${functions.length} created`);
      } catch (err) {
        const errMsg = (err as Error).message || '';
        if (!errMsg.includes('already exists')) {
          console.warn(`Function ${i + 1} warning: ${errMsg.substring(0, 80)}`);
        }
      }
    }

    // Execute RLS statements
    console.log('Enabling RLS and creating policies...');
    const rlsStatements = getRLSStatements();
    for (const stmt of rlsStatements) {
      try {
        await sql.unsafe(stmt);
      } catch (err) {
        // Ignore RLS errors - not critical for data migration
      }
    }

    // Create view
    try {
      await sql.unsafe(`CREATE OR REPLACE VIEW public.tenants_public_branding WITH (security_invoker = true) AS SELECT id, name, logo_url, favicon_url FROM public.tenants`);
      console.log('✓ Created tenants_public_branding view');
    } catch (err) {
      console.warn('View creation warning:', (err as Error).message?.substring(0, 50));
    }

    await sql.end();
    console.log(`Schema execution complete: ${tablesCreated} tables, ${errors.length} errors`);
    
    return { 
      success: errors.length === 0, 
      tablesCreated,
      errors,
      error: errors.length > 0 ? errors.join('; ') : undefined
    };
  } catch (error) {
    console.error('Schema execution error:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error',
      tablesCreated,
      errors: [...errors, error instanceof Error ? error.message : 'Unknown error']
    };
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // --- Authorization: only an authenticated super-admin or tenant admin may run migrations ---
    const authHeader = req.headers.get('Authorization') ?? '';
    const jwt = authHeader.replace(/^Bearer\s+/i, '');
    if (!jwt) {
      return new Response(JSON.stringify({ error: 'Authentication required', success: false }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false } }
    );

    const { data: userData, error: userError } = await adminClient.auth.getUser(jwt);
    const caller = userData?.user;
    if (userError || !caller) {
      return new Response(JSON.stringify({ error: 'Invalid or expired session', success: false }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: isSuperAdmin } = await adminClient.rpc('is_super_admin', { _user_id: caller.id });
    const { data: isAdmin } = await adminClient.rpc('has_role', { _user_id: caller.id, _role: 'admin' });
    if (!isSuperAdmin && !isAdmin) {
      return new Response(JSON.stringify({ error: 'Admin privileges required', success: false }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { targetUrl, targetServiceKey, tenantId, dbPassword, projectRef, poolerHost } = await req.json() as MigrationRequest;

    if (!targetUrl || !targetServiceKey || !tenantId || !dbPassword || !projectRef || !poolerHost) {
      return new Response(JSON.stringify({ 
        error: 'Missing required parameters',
        success: false 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('=== Starting Migration (Session Mode DDL) ===');
    console.log(`Target: ${targetUrl}`);
    console.log(`Project: ${projectRef}`);
    console.log(`Pooler: ${poolerHost} (using port 5432 for DDL)`);

    // STEP 1: Create schema using SESSION mode (port 5432)
    console.log('=== STEP 1: Creating database schema ===');
    const schemaResult = await executeSchemaSQL(projectRef, dbPassword, poolerHost);
    
    console.log(`Schema result: ${schemaResult.tablesCreated} tables created, ${schemaResult.errors.length} errors`);
    
    if (schemaResult.tablesCreated === 0) {
      return new Response(JSON.stringify({ 
        error: `Schema creation failed completely. Errors: ${schemaResult.errors.join('; ')}`,
        success: false,
        schemaCreated: false,
        schemaErrors: schemaResult.errors
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Source and target clients
    const sourceClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false } }
    );

    const targetClient = createClient(targetUrl, targetServiceKey, {
      auth: { persistSession: false }
    });

    const migrationResults: Record<string, { success: boolean; count: number; error?: string }> = {};
    let totalRecords = 0;

    console.log('=== STEP 2: Creating storage buckets ===');
    const buckets = ['brand-assets', 'project-datasheets'];
    const storageResults: Record<string, { success: boolean; count: number; error?: string }> = {};

    for (const bucket of buckets) {
      try {
        const { error: createError } = await targetClient.storage.createBucket(bucket, {
          public: true,
          allowedMimeTypes: ['image/*', 'application/pdf'],
        });
        
        if (createError && !createError.message.includes('already exists')) {
          storageResults[`bucket_${bucket}`] = { success: false, count: 0, error: createError.message };
        } else {
          console.log(`✓ Bucket: ${bucket}`);
          storageResults[`bucket_${bucket}`] = { success: true, count: 1 };
        }
      } catch (bucketError) {
        storageResults[`bucket_${bucket}`] = { 
          success: false, count: 0, 
          error: bucketError instanceof Error ? bucketError.message : 'Unknown error' 
        };
      }
    }

    console.log('=== STEP 3: Migrating data ===');

    for (const table of TABLES_TO_MIGRATE) {
      try {
        console.log(`Migrating: ${table}`);
        const { data: sourceData, error: fetchError } = await sourceClient.from(table).select('*');

        if (fetchError) {
          migrationResults[table] = { success: false, count: 0, error: fetchError.message };
          continue;
        }

        if (!sourceData || sourceData.length === 0) {
          migrationResults[table] = { success: true, count: 0 };
          continue;
        }

        const batchSize = 50;
        let insertedCount = 0;
        let lastError: string | undefined;

        for (let i = 0; i < sourceData.length; i += batchSize) {
          const batch = sourceData.slice(i, i + batchSize);
          const { error: insertError } = await targetClient
            .from(table)
            .upsert(batch, { onConflict: 'id', ignoreDuplicates: true });

          if (insertError) {
            lastError = insertError.message;
          } else {
            insertedCount += batch.length;
          }
        }

        if (insertedCount > 0) {
          console.log(`✓ ${table}: ${insertedCount} rows`);
          migrationResults[table] = { success: true, count: insertedCount };
          totalRecords += insertedCount;
        } else if (lastError) {
          migrationResults[table] = { success: false, count: 0, error: lastError };
        } else {
          migrationResults[table] = { success: true, count: 0 };
        }
      } catch (tableError) {
        migrationResults[table] = { 
          success: false, count: 0, 
          error: tableError instanceof Error ? tableError.message : 'Unknown error' 
        };
      }
    }

    console.log('=== STEP 4: Migrating storage files ===');
    for (const bucket of buckets) {
      try {
        const { data: files } = await sourceClient.storage.from(bucket).list('', { limit: 1000 });
        if (!files || files.length === 0) {
          storageResults[`files_${bucket}`] = { success: true, count: 0 };
          continue;
        }

        let migratedCount = 0;
        for (const file of files) {
          if (file.name && !file.name.startsWith('.')) {
            try {
              const { data: fileData } = await sourceClient.storage.from(bucket).download(file.name);
              if (fileData) {
                const { error: uploadError } = await targetClient.storage.from(bucket).upload(file.name, fileData, { upsert: true });
                if (!uploadError) migratedCount++;
              }
            } catch {}
          }
        }
        storageResults[`files_${bucket}`] = { success: true, count: migratedCount };
      } catch {
        storageResults[`files_${bucket}`] = { success: false, count: 0 };
      }
    }

    const successCount = Object.values(migrationResults).filter(r => r.success).length;
    const failCount = Object.values(migrationResults).filter(r => !r.success).length;

    console.log('=== Migration Complete ===');
    console.log(`Tables: ${successCount} succeeded, ${failCount} failed`);
    console.log(`Records: ${totalRecords}`);

    return new Response(JSON.stringify({
      success: failCount === 0 && schemaResult.tablesCreated > 0,
      message: `Migration completed. ${schemaResult.tablesCreated} tables created, ${totalRecords} records copied.`,
      totalRecords,
      tables: migrationResults,
      storage: storageResults,
      schemaCreated: schemaResult.success,
      schemaTablesCreated: schemaResult.tablesCreated,
      schemaErrors: schemaResult.errors,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Migration error:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Migration failed',
      success: false 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
