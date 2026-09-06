CREATE EXTENSION IF NOT EXISTS "pg_graphql";
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";
CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";
CREATE EXTENSION IF NOT EXISTS "plpgsql";
CREATE EXTENSION IF NOT EXISTS "supabase_vault";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";
BEGIN;

--
-- PostgreSQL database dump
--


-- Dumped from database version 17.6
-- Dumped by pg_dump version 18.1

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--



--
-- Name: app_role; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.app_role AS ENUM (
    'admin',
    'user'
);


--
-- Name: get_user_tenant_id(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_user_tenant_id(_user_id uuid) RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT tenant_id FROM public.profiles WHERE user_id = _user_id
$$;


--
-- Name: handle_new_user(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_new_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  new_tenant_id UUID;
  is_super_admin BOOLEAN;
BEGIN
  -- Check if this is a super admin email
  is_super_admin := NEW.email IN ('chndeepak7@gmail.com', 'deepak@kineticsgroup.ae');
  
  -- Create a new tenant for this user
  INSERT INTO public.tenants (name, email, subscription_end, is_active)
  VALUES (
    CASE WHEN is_super_admin THEN 'Kinetics Group' ELSE 'My Company' END,
    NEW.email,
    CASE WHEN is_super_admin THEN NULL ELSE (now() + interval '30 days') END, -- NULL means unlimited for super admins
    true
  )
  RETURNING id INTO new_tenant_id;
  
  -- Create profile linked to tenant (auto-approved for super admins)
  INSERT INTO public.profiles (user_id, tenant_id, display_name, is_approved, approved_at)
  VALUES (
    NEW.id, 
    new_tenant_id, 
    NEW.raw_user_meta_data ->> 'display_name',
    is_super_admin,
    CASE WHEN is_super_admin THEN now() ELSE NULL END
  );
  
  -- Assign admin role
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'admin');
  
  RETURN NEW;
END;
$$;


--
-- Name: has_role(uuid, public.app_role); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.has_role(_user_id uuid, _role public.app_role) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;


--
-- Name: is_super_admin(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_super_admin(_user_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM auth.users
    WHERE id = _user_id 
    AND email IN ('chndeepak7@gmail.com', 'deepak@kineticsgroup.ae')
  )
$$;


--
-- Name: is_user_active(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_user_active(_user_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 
    FROM public.profiles p
    JOIN public.tenants t ON t.id = p.tenant_id
    WHERE p.user_id = _user_id 
    AND p.is_approved = true
    AND t.is_active = true
    AND (t.subscription_end IS NULL OR t.subscription_end > now())
  )
$$;


--
-- Name: prevent_approval_field_modification(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.prevent_approval_field_modification() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  -- Allow super admins to modify anything
  IF is_super_admin(auth.uid()) THEN
    RETURN NEW;
  END IF;
  
  -- For regular users updating their own profile, prevent changes to approval fields
  IF OLD.user_id = auth.uid() THEN
    -- Reset approval fields to their original values if user tries to change them
    NEW.is_approved := OLD.is_approved;
    NEW.approved_at := OLD.approved_at;
    NEW.approved_by := OLD.approved_by;
    NEW.approval_requested_at := OLD.approval_requested_at;
    NEW.tenant_id := OLD.tenant_id; -- Also prevent tenant_id changes
  END IF;
  
  RETURN NEW;
END;
$$;


--
-- Name: update_updated_at_column(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


SET default_table_access_method = heap;

--
-- Name: blade_configurations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.blade_configurations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    fan_model_id uuid NOT NULL,
    blade_count integer NOT NULL,
    blade_angles integer[] DEFAULT '{}'::integer[],
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: casing_weights; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.casing_weights (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    diameter integer NOT NULL,
    weight numeric NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: documentation_sections; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.documentation_sections (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    section_key text NOT NULL,
    title text NOT NULL,
    content text,
    display_order integer DEFAULT 0,
    is_visible boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: fan_dimensions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fan_dimensions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    series_id uuid NOT NULL,
    size integer NOT NULL,
    phi_d2 numeric,
    phi_d1 numeric,
    phi_d numeric,
    h numeric,
    e numeric,
    f numeric,
    l numeric,
    k numeric,
    n_phi_d text,
    z_phi_d1 text,
    motor_max text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: fan_models; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fan_models (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    series_id uuid,
    diameter integer NOT NULL,
    motor_poles integer[] DEFAULT '{2,4,6,8,12}'::integer[],
    drawing_url text,
    weight numeric,
    ip_rating text,
    insulation_class text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    reference_poles integer DEFAULT 4
);


--
-- Name: fan_series; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fan_series (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    name text NOT NULL,
    description text,
    image_url text,
    drawing_url text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    datasheet_description text,
    show_octave_bands boolean DEFAULT true NOT NULL,
    amca_certified boolean DEFAULT false,
    fire_rating character varying(50) DEFAULT NULL::character varying,
    amca_logo_url text,
    fire_rating_logo_url text
);


--
-- Name: impeller_weights; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.impeller_weights (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    diameter integer NOT NULL,
    blade_count integer NOT NULL,
    weight numeric NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: motor_brands; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.motor_brands (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    name text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: motor_specifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.motor_specifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    brand_id uuid,
    motor_poles integer NOT NULL,
    rating_kw numeric NOT NULL,
    motor_frame text,
    motor_weight numeric,
    full_load_current numeric,
    rated_current numeric,
    voltage numeric DEFAULT 415,
    frequency integer DEFAULT 50,
    ip_rating text DEFAULT 'IP55'::text,
    insulation_class text DEFAULT 'F'::text,
    efficiency_class text DEFAULT 'IE3'::text,
    rpm integer,
    fire_rating text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    starting_current numeric
);


--
-- Name: noise_data; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.noise_data (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    blade_config_id uuid NOT NULL,
    blade_angle integer NOT NULL,
    hz63 numeric,
    hz125 numeric,
    hz250 numeric,
    hz500 numeric,
    hz1k numeric,
    hz2k numeric,
    hz4k numeric,
    hz8k numeric,
    overall numeric,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    motor_poles integer
);


--
-- Name: performance_data; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.performance_data (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    blade_config_id uuid NOT NULL,
    blade_angle integer NOT NULL,
    point_index integer NOT NULL,
    airflow numeric NOT NULL,
    static_pressure numeric NOT NULL,
    shaft_power numeric NOT NULL,
    efficiency numeric NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    motor_poles integer
);


--
-- Name: profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profiles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    tenant_id uuid,
    display_name text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    is_approved boolean DEFAULT false,
    approval_requested_at timestamp with time zone DEFAULT now(),
    approved_by uuid,
    approved_at timestamp with time zone
);


--
-- Name: project_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.project_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    series_name text NOT NULL,
    diameter integer NOT NULL,
    blade_count integer NOT NULL,
    blade_angle integer NOT NULL,
    motor_poles integer NOT NULL,
    required_airflow numeric NOT NULL,
    required_pressure numeric NOT NULL,
    operating_airflow numeric,
    operating_pressure numeric,
    shaft_power numeric,
    efficiency numeric,
    motor_rating_kw numeric,
    motor_frame text,
    altitude numeric DEFAULT 0,
    temperature numeric DEFAULT 20,
    air_density numeric DEFAULT 1.2,
    frequency integer DEFAULT 50,
    quantity integer DEFAULT 1 NOT NULL,
    unit_price numeric,
    notes text,
    nomenclature text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: projects; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.projects (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    user_id uuid NOT NULL,
    name text NOT NULL,
    description text,
    client_name text,
    client_email text,
    client_phone text,
    client_address text,
    project_reference text,
    status text DEFAULT 'draft'::text NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT projects_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'pending'::text, 'approved'::text, 'rejected'::text, 'completed'::text])))
);


--
-- Name: tenants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tenants (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text DEFAULT 'KINAIR'::text NOT NULL,
    logo_url text,
    email text,
    phone text,
    address text,
    subscription_start timestamp with time zone DEFAULT now(),
    subscription_end timestamp with time zone,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    favicon_url text
);


--
-- Name: unit_preferences; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.unit_preferences (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    airflow_unit text DEFAULT 'CMH'::text,
    pressure_unit text DEFAULT 'Pa'::text,
    power_unit text DEFAULT 'kW'::text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: user_roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_roles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    role public.app_role DEFAULT 'user'::public.app_role NOT NULL
);


--
-- Name: blade_configurations blade_configurations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blade_configurations
    ADD CONSTRAINT blade_configurations_pkey PRIMARY KEY (id);


--
-- Name: casing_weights casing_weights_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.casing_weights
    ADD CONSTRAINT casing_weights_pkey PRIMARY KEY (id);


--
-- Name: casing_weights casing_weights_tenant_id_diameter_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.casing_weights
    ADD CONSTRAINT casing_weights_tenant_id_diameter_key UNIQUE (tenant_id, diameter);


--
-- Name: documentation_sections documentation_sections_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documentation_sections
    ADD CONSTRAINT documentation_sections_pkey PRIMARY KEY (id);


--
-- Name: documentation_sections documentation_sections_tenant_id_section_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documentation_sections
    ADD CONSTRAINT documentation_sections_tenant_id_section_key_key UNIQUE (tenant_id, section_key);


--
-- Name: fan_dimensions fan_dimensions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fan_dimensions
    ADD CONSTRAINT fan_dimensions_pkey PRIMARY KEY (id);


--
-- Name: fan_dimensions fan_dimensions_series_id_size_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fan_dimensions
    ADD CONSTRAINT fan_dimensions_series_id_size_key UNIQUE (series_id, size);


--
-- Name: fan_models fan_models_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fan_models
    ADD CONSTRAINT fan_models_pkey PRIMARY KEY (id);


--
-- Name: fan_series fan_series_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fan_series
    ADD CONSTRAINT fan_series_pkey PRIMARY KEY (id);


--
-- Name: impeller_weights impeller_weights_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.impeller_weights
    ADD CONSTRAINT impeller_weights_pkey PRIMARY KEY (id);


--
-- Name: impeller_weights impeller_weights_tenant_id_diameter_blade_count_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.impeller_weights
    ADD CONSTRAINT impeller_weights_tenant_id_diameter_blade_count_key UNIQUE (tenant_id, diameter, blade_count);


--
-- Name: motor_brands motor_brands_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.motor_brands
    ADD CONSTRAINT motor_brands_pkey PRIMARY KEY (id);


--
-- Name: motor_specifications motor_specifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.motor_specifications
    ADD CONSTRAINT motor_specifications_pkey PRIMARY KEY (id);


--
-- Name: noise_data noise_data_blade_config_angle_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.noise_data
    ADD CONSTRAINT noise_data_blade_config_angle_unique UNIQUE (blade_config_id, blade_angle);


--
-- Name: noise_data noise_data_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.noise_data
    ADD CONSTRAINT noise_data_pkey PRIMARY KEY (id);


--
-- Name: performance_data performance_data_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.performance_data
    ADD CONSTRAINT performance_data_pkey PRIMARY KEY (id);


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);


--
-- Name: profiles profiles_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_user_id_key UNIQUE (user_id);


--
-- Name: project_items project_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_items
    ADD CONSTRAINT project_items_pkey PRIMARY KEY (id);


--
-- Name: projects projects_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT projects_pkey PRIMARY KEY (id);


--
-- Name: tenants tenants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenants
    ADD CONSTRAINT tenants_pkey PRIMARY KEY (id);


--
-- Name: unit_preferences unit_preferences_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.unit_preferences
    ADD CONSTRAINT unit_preferences_pkey PRIMARY KEY (id);


--
-- Name: unit_preferences unit_preferences_tenant_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.unit_preferences
    ADD CONSTRAINT unit_preferences_tenant_id_key UNIQUE (tenant_id);


--
-- Name: user_roles user_roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_pkey PRIMARY KEY (id);


--
-- Name: user_roles user_roles_user_id_role_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_user_id_role_key UNIQUE (user_id, role);


--
-- Name: idx_noise_data_motor_poles; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_noise_data_motor_poles ON public.noise_data USING btree (motor_poles);


--
-- Name: idx_performance_data_motor_poles; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_performance_data_motor_poles ON public.performance_data USING btree (motor_poles);


--
-- Name: profiles protect_approval_fields; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER protect_approval_fields BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.prevent_approval_field_modification();


--
-- Name: documentation_sections update_documentation_sections_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_documentation_sections_updated_at BEFORE UPDATE ON public.documentation_sections FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: fan_dimensions update_fan_dimensions_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_fan_dimensions_updated_at BEFORE UPDATE ON public.fan_dimensions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: fan_models update_fan_models_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_fan_models_updated_at BEFORE UPDATE ON public.fan_models FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: fan_series update_fan_series_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_fan_series_updated_at BEFORE UPDATE ON public.fan_series FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: motor_specifications update_motor_specs_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_motor_specs_updated_at BEFORE UPDATE ON public.motor_specifications FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: profiles update_profiles_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: project_items update_project_items_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_project_items_updated_at BEFORE UPDATE ON public.project_items FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: projects update_projects_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_projects_updated_at BEFORE UPDATE ON public.projects FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: tenants update_tenants_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_tenants_updated_at BEFORE UPDATE ON public.tenants FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: unit_preferences update_unit_prefs_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_unit_prefs_updated_at BEFORE UPDATE ON public.unit_preferences FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: blade_configurations blade_configurations_fan_model_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blade_configurations
    ADD CONSTRAINT blade_configurations_fan_model_id_fkey FOREIGN KEY (fan_model_id) REFERENCES public.fan_models(id) ON DELETE CASCADE;


--
-- Name: casing_weights casing_weights_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.casing_weights
    ADD CONSTRAINT casing_weights_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: documentation_sections documentation_sections_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documentation_sections
    ADD CONSTRAINT documentation_sections_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: fan_dimensions fan_dimensions_series_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fan_dimensions
    ADD CONSTRAINT fan_dimensions_series_id_fkey FOREIGN KEY (series_id) REFERENCES public.fan_series(id) ON DELETE CASCADE;


--
-- Name: fan_models fan_models_series_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fan_models
    ADD CONSTRAINT fan_models_series_id_fkey FOREIGN KEY (series_id) REFERENCES public.fan_series(id) ON DELETE SET NULL;


--
-- Name: fan_models fan_models_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fan_models
    ADD CONSTRAINT fan_models_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: fan_series fan_series_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fan_series
    ADD CONSTRAINT fan_series_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: impeller_weights impeller_weights_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.impeller_weights
    ADD CONSTRAINT impeller_weights_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: motor_brands motor_brands_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.motor_brands
    ADD CONSTRAINT motor_brands_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: motor_specifications motor_specifications_brand_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.motor_specifications
    ADD CONSTRAINT motor_specifications_brand_id_fkey FOREIGN KEY (brand_id) REFERENCES public.motor_brands(id) ON DELETE SET NULL;


--
-- Name: motor_specifications motor_specifications_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.motor_specifications
    ADD CONSTRAINT motor_specifications_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: noise_data noise_data_blade_config_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.noise_data
    ADD CONSTRAINT noise_data_blade_config_id_fkey FOREIGN KEY (blade_config_id) REFERENCES public.blade_configurations(id) ON DELETE CASCADE;


--
-- Name: performance_data performance_data_blade_config_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.performance_data
    ADD CONSTRAINT performance_data_blade_config_id_fkey FOREIGN KEY (blade_config_id) REFERENCES public.blade_configurations(id) ON DELETE CASCADE;


--
-- Name: profiles profiles_approved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES auth.users(id);


--
-- Name: profiles profiles_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE SET NULL;


--
-- Name: profiles profiles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: project_items project_items_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_items
    ADD CONSTRAINT project_items_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: project_items project_items_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_items
    ADD CONSTRAINT project_items_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: projects projects_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT projects_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: unit_preferences unit_preferences_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.unit_preferences
    ADD CONSTRAINT unit_preferences_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: user_roles user_roles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: blade_configurations Admins can delete blade configs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can delete blade configs" ON public.blade_configurations FOR DELETE TO authenticated USING (((EXISTS ( SELECT 1
   FROM public.fan_models fm
  WHERE ((fm.id = blade_configurations.fan_model_id) AND (fm.tenant_id = public.get_user_tenant_id(auth.uid()))))) AND public.has_role(auth.uid(), 'admin'::public.app_role)));


--
-- Name: fan_models Admins can delete fan models; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can delete fan models" ON public.fan_models FOR DELETE TO authenticated USING (((tenant_id = public.get_user_tenant_id(auth.uid())) AND public.has_role(auth.uid(), 'admin'::public.app_role)));


--
-- Name: fan_series Admins can delete fan series; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can delete fan series" ON public.fan_series FOR DELETE TO authenticated USING (((tenant_id = public.get_user_tenant_id(auth.uid())) AND public.has_role(auth.uid(), 'admin'::public.app_role)));


--
-- Name: blade_configurations Admins can insert blade configs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can insert blade configs" ON public.blade_configurations FOR INSERT TO authenticated WITH CHECK (((EXISTS ( SELECT 1
   FROM public.fan_models fm
  WHERE ((fm.id = blade_configurations.fan_model_id) AND (fm.tenant_id = public.get_user_tenant_id(auth.uid()))))) AND public.has_role(auth.uid(), 'admin'::public.app_role)));


--
-- Name: fan_models Admins can insert fan models; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can insert fan models" ON public.fan_models FOR INSERT TO authenticated WITH CHECK (((tenant_id = public.get_user_tenant_id(auth.uid())) AND public.has_role(auth.uid(), 'admin'::public.app_role)));


--
-- Name: fan_series Admins can insert fan series; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can insert fan series" ON public.fan_series FOR INSERT TO authenticated WITH CHECK (((tenant_id = public.get_user_tenant_id(auth.uid())) AND public.has_role(auth.uid(), 'admin'::public.app_role)));


--
-- Name: project_items Admins can manage all tenant project items; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage all tenant project items" ON public.project_items USING (((tenant_id = public.get_user_tenant_id(auth.uid())) AND public.has_role(auth.uid(), 'admin'::public.app_role)));


--
-- Name: projects Admins can manage all tenant projects; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage all tenant projects" ON public.projects USING (((tenant_id = public.get_user_tenant_id(auth.uid())) AND public.has_role(auth.uid(), 'admin'::public.app_role)));


--
-- Name: casing_weights Admins can manage casing weights; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage casing weights" ON public.casing_weights TO authenticated USING (((tenant_id = public.get_user_tenant_id(auth.uid())) AND public.has_role(auth.uid(), 'admin'::public.app_role)));


--
-- Name: fan_dimensions Admins can manage fan dimensions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage fan dimensions" ON public.fan_dimensions TO authenticated USING (((EXISTS ( SELECT 1
   FROM public.fan_series fs
  WHERE ((fs.id = fan_dimensions.series_id) AND (fs.tenant_id = public.get_user_tenant_id(auth.uid()))))) AND public.has_role(auth.uid(), 'admin'::public.app_role)));


--
-- Name: impeller_weights Admins can manage impeller weights; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage impeller weights" ON public.impeller_weights TO authenticated USING (((tenant_id = public.get_user_tenant_id(auth.uid())) AND public.has_role(auth.uid(), 'admin'::public.app_role)));


--
-- Name: motor_brands Admins can manage motor brands; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage motor brands" ON public.motor_brands TO authenticated USING (((tenant_id = public.get_user_tenant_id(auth.uid())) AND public.has_role(auth.uid(), 'admin'::public.app_role)));


--
-- Name: motor_specifications Admins can manage motor specs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage motor specs" ON public.motor_specifications TO authenticated USING (((tenant_id = public.get_user_tenant_id(auth.uid())) AND public.has_role(auth.uid(), 'admin'::public.app_role)));


--
-- Name: noise_data Admins can manage noise data; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage noise data" ON public.noise_data TO authenticated USING (((EXISTS ( SELECT 1
   FROM (public.blade_configurations bc
     JOIN public.fan_models fm ON ((fm.id = bc.fan_model_id)))
  WHERE ((bc.id = noise_data.blade_config_id) AND (fm.tenant_id = public.get_user_tenant_id(auth.uid()))))) AND public.has_role(auth.uid(), 'admin'::public.app_role)));


--
-- Name: performance_data Admins can manage performance data; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage performance data" ON public.performance_data TO authenticated USING (((EXISTS ( SELECT 1
   FROM (public.blade_configurations bc
     JOIN public.fan_models fm ON ((fm.id = bc.fan_model_id)))
  WHERE ((bc.id = performance_data.blade_config_id) AND (fm.tenant_id = public.get_user_tenant_id(auth.uid()))))) AND public.has_role(auth.uid(), 'admin'::public.app_role)));


--
-- Name: documentation_sections Admins can manage their documentation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage their documentation" ON public.documentation_sections USING ((tenant_id = public.get_user_tenant_id(auth.uid()))) WITH CHECK ((tenant_id = public.get_user_tenant_id(auth.uid())));


--
-- Name: unit_preferences Admins can manage unit preferences; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage unit preferences" ON public.unit_preferences TO authenticated USING (((tenant_id = public.get_user_tenant_id(auth.uid())) AND public.has_role(auth.uid(), 'admin'::public.app_role)));


--
-- Name: blade_configurations Admins can update blade configs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can update blade configs" ON public.blade_configurations FOR UPDATE TO authenticated USING (((EXISTS ( SELECT 1
   FROM public.fan_models fm
  WHERE ((fm.id = blade_configurations.fan_model_id) AND (fm.tenant_id = public.get_user_tenant_id(auth.uid()))))) AND public.has_role(auth.uid(), 'admin'::public.app_role)));


--
-- Name: fan_models Admins can update fan models; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can update fan models" ON public.fan_models FOR UPDATE TO authenticated USING (((tenant_id = public.get_user_tenant_id(auth.uid())) AND public.has_role(auth.uid(), 'admin'::public.app_role)));


--
-- Name: fan_series Admins can update fan series; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can update fan series" ON public.fan_series FOR UPDATE TO authenticated USING (((tenant_id = public.get_user_tenant_id(auth.uid())) AND public.has_role(auth.uid(), 'admin'::public.app_role)));


--
-- Name: tenants Admins can update their tenant; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can update their tenant" ON public.tenants AS RESTRICTIVE FOR UPDATE TO authenticated USING (((id = public.get_user_tenant_id(auth.uid())) AND public.has_role(auth.uid(), 'admin'::public.app_role)));


--
-- Name: tenants Admins can view their tenant; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view their tenant" ON public.tenants AS RESTRICTIVE FOR SELECT TO authenticated USING ((id = public.get_user_tenant_id(auth.uid())));


--
-- Name: documentation_sections Documentation is readable by all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Documentation is readable by all" ON public.documentation_sections FOR SELECT USING (true);


--
-- Name: tenants Only authenticated users can access tenants; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Only authenticated users can access tenants" ON public.tenants FOR SELECT TO authenticated USING (true);


--
-- Name: profiles Super admins can update all profiles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Super admins can update all profiles" ON public.profiles FOR UPDATE USING (public.is_super_admin(auth.uid()));


--
-- Name: tenants Super admins can update all tenants; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Super admins can update all tenants" ON public.tenants AS RESTRICTIVE FOR UPDATE TO authenticated USING (public.is_super_admin(auth.uid()));


--
-- Name: profiles Super admins can view all profiles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Super admins can view all profiles" ON public.profiles FOR SELECT USING (public.is_super_admin(auth.uid()));


--
-- Name: tenants Super admins can view all tenants; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Super admins can view all tenants" ON public.tenants AS RESTRICTIVE FOR SELECT TO authenticated USING (public.is_super_admin(auth.uid()));


--
-- Name: projects Users can delete their own projects; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete their own projects" ON public.projects FOR DELETE USING (((tenant_id = public.get_user_tenant_id(auth.uid())) AND (user_id = auth.uid())));


--
-- Name: project_items Users can delete their project items; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete their project items" ON public.project_items FOR DELETE USING (((tenant_id = public.get_user_tenant_id(auth.uid())) AND (EXISTS ( SELECT 1
   FROM public.projects p
  WHERE ((p.id = project_items.project_id) AND (p.user_id = auth.uid()))))));


--
-- Name: profiles Users can insert own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK ((user_id = auth.uid()));


--
-- Name: project_items Users can insert project items; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert project items" ON public.project_items FOR INSERT WITH CHECK (((tenant_id = public.get_user_tenant_id(auth.uid())) AND (EXISTS ( SELECT 1
   FROM public.projects p
  WHERE ((p.id = project_items.project_id) AND (p.user_id = auth.uid()))))));


--
-- Name: projects Users can insert projects for their tenant; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert projects for their tenant" ON public.projects FOR INSERT WITH CHECK (((tenant_id = public.get_user_tenant_id(auth.uid())) AND (user_id = auth.uid())));


--
-- Name: profiles Users can update own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE TO authenticated USING ((user_id = auth.uid()));


--
-- Name: projects Users can update their own projects; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their own projects" ON public.projects FOR UPDATE USING (((tenant_id = public.get_user_tenant_id(auth.uid())) AND (user_id = auth.uid())));


--
-- Name: project_items Users can update their project items; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their project items" ON public.project_items FOR UPDATE USING (((tenant_id = public.get_user_tenant_id(auth.uid())) AND (EXISTS ( SELECT 1
   FROM public.projects p
  WHERE ((p.id = project_items.project_id) AND (p.user_id = auth.uid()))))));


--
-- Name: blade_configurations Users can view blade configs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view blade configs" ON public.blade_configurations FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.fan_models fm
  WHERE ((fm.id = blade_configurations.fan_model_id) AND (fm.tenant_id = public.get_user_tenant_id(auth.uid()))))));


--
-- Name: casing_weights Users can view casing weights; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view casing weights" ON public.casing_weights FOR SELECT TO authenticated USING ((tenant_id = public.get_user_tenant_id(auth.uid())));


--
-- Name: fan_dimensions Users can view fan dimensions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view fan dimensions" ON public.fan_dimensions FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.fan_series fs
  WHERE ((fs.id = fan_dimensions.series_id) AND (fs.tenant_id = public.get_user_tenant_id(auth.uid()))))));


--
-- Name: impeller_weights Users can view impeller weights; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view impeller weights" ON public.impeller_weights FOR SELECT TO authenticated USING ((tenant_id = public.get_user_tenant_id(auth.uid())));


--
-- Name: motor_brands Users can view motor brands; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view motor brands" ON public.motor_brands FOR SELECT TO authenticated USING ((tenant_id = public.get_user_tenant_id(auth.uid())));


--
-- Name: motor_specifications Users can view motor specs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view motor specs" ON public.motor_specifications FOR SELECT TO authenticated USING ((tenant_id = public.get_user_tenant_id(auth.uid())));


--
-- Name: noise_data Users can view noise data; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view noise data" ON public.noise_data FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM (public.blade_configurations bc
     JOIN public.fan_models fm ON ((fm.id = bc.fan_model_id)))
  WHERE ((bc.id = noise_data.blade_config_id) AND (fm.tenant_id = public.get_user_tenant_id(auth.uid()))))));


--
-- Name: profiles Users can view own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT TO authenticated USING ((user_id = auth.uid()));


--
-- Name: user_roles Users can view own roles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own roles" ON public.user_roles FOR SELECT TO authenticated USING ((user_id = auth.uid()));


--
-- Name: performance_data Users can view performance data; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view performance data" ON public.performance_data FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM (public.blade_configurations bc
     JOIN public.fan_models fm ON ((fm.id = bc.fan_model_id)))
  WHERE ((bc.id = performance_data.blade_config_id) AND (fm.tenant_id = public.get_user_tenant_id(auth.uid()))))));


--
-- Name: project_items Users can view project items for their tenant; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view project items for their tenant" ON public.project_items FOR SELECT USING ((tenant_id = public.get_user_tenant_id(auth.uid())));


--
-- Name: fan_models Users can view tenant fan models; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view tenant fan models" ON public.fan_models FOR SELECT TO authenticated USING ((tenant_id = public.get_user_tenant_id(auth.uid())));


--
-- Name: fan_series Users can view tenant fan series; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view tenant fan series" ON public.fan_series FOR SELECT TO authenticated USING ((tenant_id = public.get_user_tenant_id(auth.uid())));


--
-- Name: projects Users can view their tenant projects; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their tenant projects" ON public.projects FOR SELECT USING ((tenant_id = public.get_user_tenant_id(auth.uid())));


--
-- Name: unit_preferences Users can view unit preferences; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view unit preferences" ON public.unit_preferences FOR SELECT TO authenticated USING ((tenant_id = public.get_user_tenant_id(auth.uid())));


--
-- Name: blade_configurations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.blade_configurations ENABLE ROW LEVEL SECURITY;

--
-- Name: casing_weights; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.casing_weights ENABLE ROW LEVEL SECURITY;

--
-- Name: documentation_sections; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.documentation_sections ENABLE ROW LEVEL SECURITY;

--
-- Name: fan_dimensions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.fan_dimensions ENABLE ROW LEVEL SECURITY;

--
-- Name: fan_models; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.fan_models ENABLE ROW LEVEL SECURITY;

--
-- Name: fan_series; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.fan_series ENABLE ROW LEVEL SECURITY;

--
-- Name: impeller_weights; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.impeller_weights ENABLE ROW LEVEL SECURITY;

--
-- Name: motor_brands; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.motor_brands ENABLE ROW LEVEL SECURITY;

--
-- Name: motor_specifications; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.motor_specifications ENABLE ROW LEVEL SECURITY;

--
-- Name: noise_data; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.noise_data ENABLE ROW LEVEL SECURITY;

--
-- Name: performance_data; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.performance_data ENABLE ROW LEVEL SECURITY;

--
-- Name: profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: project_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.project_items ENABLE ROW LEVEL SECURITY;

--
-- Name: projects; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

--
-- Name: tenants; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;

--
-- Name: unit_preferences; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.unit_preferences ENABLE ROW LEVEL SECURITY;

--
-- Name: user_roles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

--
-- PostgreSQL database dump complete
--




COMMIT;