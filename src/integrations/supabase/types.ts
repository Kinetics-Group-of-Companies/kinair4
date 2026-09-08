export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      accessory_descriptions: {
        Row: {
          accessory_code: string
          created_at: string
          description: string
          id: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          accessory_code: string
          created_at?: string
          description: string
          id?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          accessory_code?: string
          created_at?: string
          description?: string
          id?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "accessory_descriptions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accessory_descriptions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants_public_branding"
            referencedColumns: ["id"]
          },
        ]
      }
      air_curtain_brands: {
        Row: {
          created_at: string
          display_order: number
          id: string
          logo_url: string | null
          name: string
          notes: string | null
          tenant_id: string
          updated_at: string
          website: string | null
        }
        Insert: {
          created_at?: string
          display_order?: number
          id?: string
          logo_url?: string | null
          name: string
          notes?: string | null
          tenant_id: string
          updated_at?: string
          website?: string | null
        }
        Update: {
          created_at?: string
          display_order?: number
          id?: string
          logo_url?: string | null
          name?: string
          notes?: string | null
          tenant_id?: string
          updated_at?: string
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "air_curtain_brands_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "air_curtain_brands_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants_public_branding"
            referencedColumns: ["id"]
          },
        ]
      }
      air_curtain_dimensions: {
        Row: {
          created_at: string
          display_order: number
          id: string
          label: string
          model_id: string | null
          series_id: string
          tenant_id: string
          updated_at: string
          values: Json
        }
        Insert: {
          created_at?: string
          display_order?: number
          id?: string
          label: string
          model_id?: string | null
          series_id: string
          tenant_id: string
          updated_at?: string
          values?: Json
        }
        Update: {
          created_at?: string
          display_order?: number
          id?: string
          label?: string
          model_id?: string | null
          series_id?: string
          tenant_id?: string
          updated_at?: string
          values?: Json
        }
        Relationships: [
          {
            foreignKeyName: "air_curtain_dimensions_model_id_fkey"
            columns: ["model_id"]
            isOneToOne: false
            referencedRelation: "air_curtain_models"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "air_curtain_dimensions_series_id_fkey"
            columns: ["series_id"]
            isOneToOne: false
            referencedRelation: "air_curtain_series"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "air_curtain_dimensions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "air_curtain_dimensions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants_public_branding"
            referencedColumns: ["id"]
          },
        ]
      }
      air_curtain_models: {
        Row: {
          air_velocity_low_ms: number | null
          air_velocity_ms: number | null
          air_volume_cfm: number | null
          air_volume_cmh: number | null
          air_volume_low_cfm: number | null
          air_volume_low_cmh: number | null
          brand: string
          brand_id: string | null
          carton_size: string | null
          category: string
          created_at: string
          display_order: number
          drawing_url: string | null
          frequency_hz: number | null
          gross_weight_kg: number | null
          id: string
          impeller_diameter: number | null
          input_power_low_w: number | null
          input_power_w: number | null
          length_mm: number
          model: string
          motor_type: string
          mounting_height_max: number | null
          mounting_height_min: number | null
          net_weight_kg: number | null
          noise_125: number | null
          noise_1k: number | null
          noise_250: number | null
          noise_2k: number | null
          noise_4k: number | null
          noise_500: number | null
          noise_63: number | null
          noise_8k: number | null
          noise_db: number | null
          noise_low_db: number | null
          remarks: string | null
          series_id: string | null
          slot_width_mm: number | null
          tenant_id: string
          unit_size: string | null
          updated_at: string
          voltage: string | null
        }
        Insert: {
          air_velocity_low_ms?: number | null
          air_velocity_ms?: number | null
          air_volume_cfm?: number | null
          air_volume_cmh?: number | null
          air_volume_low_cfm?: number | null
          air_volume_low_cmh?: number | null
          brand?: string
          brand_id?: string | null
          carton_size?: string | null
          category?: string
          created_at?: string
          display_order?: number
          drawing_url?: string | null
          frequency_hz?: number | null
          gross_weight_kg?: number | null
          id?: string
          impeller_diameter?: number | null
          input_power_low_w?: number | null
          input_power_w?: number | null
          length_mm: number
          model: string
          motor_type?: string
          mounting_height_max?: number | null
          mounting_height_min?: number | null
          net_weight_kg?: number | null
          noise_125?: number | null
          noise_1k?: number | null
          noise_250?: number | null
          noise_2k?: number | null
          noise_4k?: number | null
          noise_500?: number | null
          noise_63?: number | null
          noise_8k?: number | null
          noise_db?: number | null
          noise_low_db?: number | null
          remarks?: string | null
          series_id?: string | null
          slot_width_mm?: number | null
          tenant_id: string
          unit_size?: string | null
          updated_at?: string
          voltage?: string | null
        }
        Update: {
          air_velocity_low_ms?: number | null
          air_velocity_ms?: number | null
          air_volume_cfm?: number | null
          air_volume_cmh?: number | null
          air_volume_low_cfm?: number | null
          air_volume_low_cmh?: number | null
          brand?: string
          brand_id?: string | null
          carton_size?: string | null
          category?: string
          created_at?: string
          display_order?: number
          drawing_url?: string | null
          frequency_hz?: number | null
          gross_weight_kg?: number | null
          id?: string
          impeller_diameter?: number | null
          input_power_low_w?: number | null
          input_power_w?: number | null
          length_mm?: number
          model?: string
          motor_type?: string
          mounting_height_max?: number | null
          mounting_height_min?: number | null
          net_weight_kg?: number | null
          noise_125?: number | null
          noise_1k?: number | null
          noise_250?: number | null
          noise_2k?: number | null
          noise_4k?: number | null
          noise_500?: number | null
          noise_63?: number | null
          noise_8k?: number | null
          noise_db?: number | null
          noise_low_db?: number | null
          remarks?: string | null
          series_id?: string | null
          slot_width_mm?: number | null
          tenant_id?: string
          unit_size?: string | null
          updated_at?: string
          voltage?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "air_curtain_models_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "air_curtain_brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "air_curtain_models_series_id_fkey"
            columns: ["series_id"]
            isOneToOne: false
            referencedRelation: "air_curtain_series"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "air_curtain_models_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "air_curtain_models_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants_public_branding"
            referencedColumns: ["id"]
          },
        ]
      }
      air_curtain_series: {
        Row: {
          brand_id: string
          catalogue_url: string | null
          category: string
          created_at: string
          datasheet_description: string | null
          description: string | null
          display_order: number
          drawing_url: string | null
          frequency_hz: number | null
          id: string
          image_url: string | null
          motor_type: string
          name: string
          tenant_id: string
          updated_at: string
          voltage: string | null
        }
        Insert: {
          brand_id: string
          catalogue_url?: string | null
          category?: string
          created_at?: string
          datasheet_description?: string | null
          description?: string | null
          display_order?: number
          drawing_url?: string | null
          frequency_hz?: number | null
          id?: string
          image_url?: string | null
          motor_type?: string
          name: string
          tenant_id: string
          updated_at?: string
          voltage?: string | null
        }
        Update: {
          brand_id?: string
          catalogue_url?: string | null
          category?: string
          created_at?: string
          datasheet_description?: string | null
          description?: string | null
          display_order?: number
          drawing_url?: string | null
          frequency_hz?: number | null
          id?: string
          image_url?: string | null
          motor_type?: string
          name?: string
          tenant_id?: string
          updated_at?: string
          voltage?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "air_curtain_series_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "air_curtain_brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "air_curtain_series_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "air_curtain_series_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants_public_branding"
            referencedColumns: ["id"]
          },
        ]
      }
      atex_rating_descriptions: {
        Row: {
          atex_code: string
          created_at: string
          description: string
          id: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          atex_code: string
          created_at?: string
          description: string
          id?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          atex_code?: string
          created_at?: string
          description?: string
          id?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "atex_rating_descriptions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "atex_rating_descriptions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants_public_branding"
            referencedColumns: ["id"]
          },
        ]
      }
      blade_configurations: {
        Row: {
          blade_angles: number[] | null
          blade_count: number
          created_at: string
          fan_model_id: string
          id: string
        }
        Insert: {
          blade_angles?: number[] | null
          blade_count: number
          created_at?: string
          fan_model_id: string
          id?: string
        }
        Update: {
          blade_angles?: number[] | null
          blade_count?: number
          created_at?: string
          fan_model_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "blade_configurations_fan_model_id_fkey"
            columns: ["fan_model_id"]
            isOneToOne: false
            referencedRelation: "fan_models"
            referencedColumns: ["id"]
          },
        ]
      }
      casing_weights: {
        Row: {
          created_at: string
          diameter: number
          id: string
          model_name: string | null
          series_id: string | null
          tenant_id: string
          weight: number
        }
        Insert: {
          created_at?: string
          diameter: number
          id?: string
          model_name?: string | null
          series_id?: string | null
          tenant_id: string
          weight: number
        }
        Update: {
          created_at?: string
          diameter?: number
          id?: string
          model_name?: string | null
          series_id?: string | null
          tenant_id?: string
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "casing_weights_series_id_fkey"
            columns: ["series_id"]
            isOneToOne: false
            referencedRelation: "fan_series"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "casing_weights_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "casing_weights_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants_public_branding"
            referencedColumns: ["id"]
          },
        ]
      }
      datasheet_config: {
        Row: {
          certification_order: Json | null
          construction_labels: Json | null
          created_at: string
          custom_certifications: Json | null
          custom_description: string | null
          custom_notes: string | null
          custom_sections: Json | null
          duty_point_labels: Json | null
          header_title: string | null
          id: string
          motor_labels: Json | null
          noise_directive_text: string | null
          noise_reference_text: string | null
          operating_point_labels: Json | null
          section_title_certifications: string | null
          section_title_construction: string | null
          section_title_dimensions: string | null
          section_title_duty_point: string | null
          section_title_motor: string | null
          section_title_noise: string | null
          section_title_operating_point: string | null
          series_id: string
          show_blade_angle: boolean | null
          show_blade_count: boolean | null
          show_brand_logo: boolean | null
          show_catalogue_qr: boolean | null
          show_cert_amca: boolean | null
          show_cert_ce: boolean | null
          show_cert_fire_rating: boolean | null
          show_cert_ul: boolean | null
          show_certifications: boolean
          show_construction: boolean
          show_description: boolean
          show_dimensions_table: boolean
          show_duty_point: boolean
          show_efficiency: boolean | null
          show_efficiency_curve: boolean | null
          show_family_curve: boolean
          show_fan_curve: boolean | null
          show_iom_qr: boolean | null
          show_motor_brand: boolean | null
          show_motor_characteristics: boolean
          show_motor_efficiency_class: boolean | null
          show_noise_section: boolean
          show_octave_bands: boolean
          show_operating_point: boolean
          show_performance_curves: boolean
          show_power_curve: boolean | null
          show_series_photo: boolean | null
          show_standard_notes: boolean
          show_technical_drawing: boolean
          show_vfd_features: boolean
          standard_notes_text: string | null
          updated_at: string
          vfd_features_content: string | null
        }
        Insert: {
          certification_order?: Json | null
          construction_labels?: Json | null
          created_at?: string
          custom_certifications?: Json | null
          custom_description?: string | null
          custom_notes?: string | null
          custom_sections?: Json | null
          duty_point_labels?: Json | null
          header_title?: string | null
          id?: string
          motor_labels?: Json | null
          noise_directive_text?: string | null
          noise_reference_text?: string | null
          operating_point_labels?: Json | null
          section_title_certifications?: string | null
          section_title_construction?: string | null
          section_title_dimensions?: string | null
          section_title_duty_point?: string | null
          section_title_motor?: string | null
          section_title_noise?: string | null
          section_title_operating_point?: string | null
          series_id: string
          show_blade_angle?: boolean | null
          show_blade_count?: boolean | null
          show_brand_logo?: boolean | null
          show_catalogue_qr?: boolean | null
          show_cert_amca?: boolean | null
          show_cert_ce?: boolean | null
          show_cert_fire_rating?: boolean | null
          show_cert_ul?: boolean | null
          show_certifications?: boolean
          show_construction?: boolean
          show_description?: boolean
          show_dimensions_table?: boolean
          show_duty_point?: boolean
          show_efficiency?: boolean | null
          show_efficiency_curve?: boolean | null
          show_family_curve?: boolean
          show_fan_curve?: boolean | null
          show_iom_qr?: boolean | null
          show_motor_brand?: boolean | null
          show_motor_characteristics?: boolean
          show_motor_efficiency_class?: boolean | null
          show_noise_section?: boolean
          show_octave_bands?: boolean
          show_operating_point?: boolean
          show_performance_curves?: boolean
          show_power_curve?: boolean | null
          show_series_photo?: boolean | null
          show_standard_notes?: boolean
          show_technical_drawing?: boolean
          show_vfd_features?: boolean
          standard_notes_text?: string | null
          updated_at?: string
          vfd_features_content?: string | null
        }
        Update: {
          certification_order?: Json | null
          construction_labels?: Json | null
          created_at?: string
          custom_certifications?: Json | null
          custom_description?: string | null
          custom_notes?: string | null
          custom_sections?: Json | null
          duty_point_labels?: Json | null
          header_title?: string | null
          id?: string
          motor_labels?: Json | null
          noise_directive_text?: string | null
          noise_reference_text?: string | null
          operating_point_labels?: Json | null
          section_title_certifications?: string | null
          section_title_construction?: string | null
          section_title_dimensions?: string | null
          section_title_duty_point?: string | null
          section_title_motor?: string | null
          section_title_noise?: string | null
          section_title_operating_point?: string | null
          series_id?: string
          show_blade_angle?: boolean | null
          show_blade_count?: boolean | null
          show_brand_logo?: boolean | null
          show_catalogue_qr?: boolean | null
          show_cert_amca?: boolean | null
          show_cert_ce?: boolean | null
          show_cert_fire_rating?: boolean | null
          show_cert_ul?: boolean | null
          show_certifications?: boolean
          show_construction?: boolean
          show_description?: boolean
          show_dimensions_table?: boolean
          show_duty_point?: boolean
          show_efficiency?: boolean | null
          show_efficiency_curve?: boolean | null
          show_family_curve?: boolean
          show_fan_curve?: boolean | null
          show_iom_qr?: boolean | null
          show_motor_brand?: boolean | null
          show_motor_characteristics?: boolean
          show_motor_efficiency_class?: boolean | null
          show_noise_section?: boolean
          show_octave_bands?: boolean
          show_operating_point?: boolean
          show_performance_curves?: boolean
          show_power_curve?: boolean | null
          show_series_photo?: boolean | null
          show_standard_notes?: boolean
          show_technical_drawing?: boolean
          show_vfd_features?: boolean
          standard_notes_text?: string | null
          updated_at?: string
          vfd_features_content?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "datasheet_config_series_id_fkey"
            columns: ["series_id"]
            isOneToOne: true
            referencedRelation: "fan_series"
            referencedColumns: ["id"]
          },
        ]
      }
      documentation_sections: {
        Row: {
          content: string | null
          created_at: string
          display_order: number | null
          id: string
          is_visible: boolean | null
          section_key: string
          tenant_id: string
          title: string
          updated_at: string
        }
        Insert: {
          content?: string | null
          created_at?: string
          display_order?: number | null
          id?: string
          is_visible?: boolean | null
          section_key: string
          tenant_id: string
          title: string
          updated_at?: string
        }
        Update: {
          content?: string | null
          created_at?: string
          display_order?: number | null
          id?: string
          is_visible?: boolean | null
          section_key?: string
          tenant_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "documentation_sections_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documentation_sections_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants_public_branding"
            referencedColumns: ["id"]
          },
        ]
      }
      fan_dimensions: {
        Row: {
          created_at: string
          e: number | null
          f: number | null
          h: number | null
          id: string
          k: number | null
          l: number | null
          model_name: string | null
          motor_max: string | null
          n_phi_d: string | null
          phi_d: number | null
          phi_d1: number | null
          phi_d2: number | null
          series_id: string
          size: number | null
          updated_at: string
          z_phi_d1: string | null
        }
        Insert: {
          created_at?: string
          e?: number | null
          f?: number | null
          h?: number | null
          id?: string
          k?: number | null
          l?: number | null
          model_name?: string | null
          motor_max?: string | null
          n_phi_d?: string | null
          phi_d?: number | null
          phi_d1?: number | null
          phi_d2?: number | null
          series_id: string
          size?: number | null
          updated_at?: string
          z_phi_d1?: string | null
        }
        Update: {
          created_at?: string
          e?: number | null
          f?: number | null
          h?: number | null
          id?: string
          k?: number | null
          l?: number | null
          model_name?: string | null
          motor_max?: string | null
          n_phi_d?: string | null
          phi_d?: number | null
          phi_d1?: number | null
          phi_d2?: number | null
          series_id?: string
          size?: number | null
          updated_at?: string
          z_phi_d1?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fan_dimensions_series_id_fkey"
            columns: ["series_id"]
            isOneToOne: false
            referencedRelation: "fan_series"
            referencedColumns: ["id"]
          },
        ]
      }
      fan_models: {
        Row: {
          created_at: string
          diameter: number
          drawing_url: string | null
          id: string
          insulation_class: string | null
          ip_rating: string | null
          model_name: string | null
          motor_poles: number[] | null
          product_code: string | null
          reference_poles: number | null
          series_id: string | null
          tenant_id: string
          updated_at: string
          weight: number | null
        }
        Insert: {
          created_at?: string
          diameter: number
          drawing_url?: string | null
          id?: string
          insulation_class?: string | null
          ip_rating?: string | null
          model_name?: string | null
          motor_poles?: number[] | null
          product_code?: string | null
          reference_poles?: number | null
          series_id?: string | null
          tenant_id: string
          updated_at?: string
          weight?: number | null
        }
        Update: {
          created_at?: string
          diameter?: number
          drawing_url?: string | null
          id?: string
          insulation_class?: string | null
          ip_rating?: string | null
          model_name?: string | null
          motor_poles?: number[] | null
          product_code?: string | null
          reference_poles?: number | null
          series_id?: string | null
          tenant_id?: string
          updated_at?: string
          weight?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "fan_models_series_id_fkey"
            columns: ["series_id"]
            isOneToOne: false
            referencedRelation: "fan_series"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fan_models_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fan_models_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants_public_branding"
            referencedColumns: ["id"]
          },
        ]
      }
      fan_series: {
        Row: {
          amca_certified: boolean | null
          amca_logo_url: string | null
          atex_certified: boolean | null
          atex_logo_url: string | null
          catalogue_url: string | null
          ce_certified: boolean | null
          ce_logo_url: string | null
          compatible_accessories: string[] | null
          created_at: string
          custom_cert_logo_url: string | null
          custom_cert_name: string | null
          datasheet_description: string | null
          default_directivity_q: number | null
          default_noise_distance: number | null
          default_safety_factor: number | null
          description: string | null
          drawing_url: string | null
          fan_type: string | null
          fire_rating: string | null
          fire_rating_logo_url: string | null
          id: string
          image_url: string | null
          iom_url: string | null
          iso_certified: boolean | null
          iso_logo_url: string | null
          name: string
          nomenclature_template: string | null
          show_octave_bands: boolean
          sound_outlet_reduction: number | null
          stall_airflow_max_percent: number | null
          stall_airflow_min_percent: number | null
          tenant_id: string
          ul_certified: boolean | null
          ul_logo_url: string | null
          updated_at: string
        }
        Insert: {
          amca_certified?: boolean | null
          amca_logo_url?: string | null
          atex_certified?: boolean | null
          atex_logo_url?: string | null
          catalogue_url?: string | null
          ce_certified?: boolean | null
          ce_logo_url?: string | null
          compatible_accessories?: string[] | null
          created_at?: string
          custom_cert_logo_url?: string | null
          custom_cert_name?: string | null
          datasheet_description?: string | null
          default_directivity_q?: number | null
          default_noise_distance?: number | null
          default_safety_factor?: number | null
          description?: string | null
          drawing_url?: string | null
          fan_type?: string | null
          fire_rating?: string | null
          fire_rating_logo_url?: string | null
          id?: string
          image_url?: string | null
          iom_url?: string | null
          iso_certified?: boolean | null
          iso_logo_url?: string | null
          name: string
          nomenclature_template?: string | null
          show_octave_bands?: boolean
          sound_outlet_reduction?: number | null
          stall_airflow_max_percent?: number | null
          stall_airflow_min_percent?: number | null
          tenant_id: string
          ul_certified?: boolean | null
          ul_logo_url?: string | null
          updated_at?: string
        }
        Update: {
          amca_certified?: boolean | null
          amca_logo_url?: string | null
          atex_certified?: boolean | null
          atex_logo_url?: string | null
          catalogue_url?: string | null
          ce_certified?: boolean | null
          ce_logo_url?: string | null
          compatible_accessories?: string[] | null
          created_at?: string
          custom_cert_logo_url?: string | null
          custom_cert_name?: string | null
          datasheet_description?: string | null
          default_directivity_q?: number | null
          default_noise_distance?: number | null
          default_safety_factor?: number | null
          description?: string | null
          drawing_url?: string | null
          fan_type?: string | null
          fire_rating?: string | null
          fire_rating_logo_url?: string | null
          id?: string
          image_url?: string | null
          iom_url?: string | null
          iso_certified?: boolean | null
          iso_logo_url?: string | null
          name?: string
          nomenclature_template?: string | null
          show_octave_bands?: boolean
          sound_outlet_reduction?: number | null
          stall_airflow_max_percent?: number | null
          stall_airflow_min_percent?: number | null
          tenant_id?: string
          ul_certified?: boolean | null
          ul_logo_url?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fan_series_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fan_series_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants_public_branding"
            referencedColumns: ["id"]
          },
        ]
      }
      fire_rating_descriptions: {
        Row: {
          created_at: string
          description: string
          fire_class: string
          id: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description: string
          fire_class: string
          id?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string
          fire_class?: string
          id?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fire_rating_descriptions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fire_rating_descriptions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants_public_branding"
            referencedColumns: ["id"]
          },
        ]
      }
      impeller_weights: {
        Row: {
          blade_count: number
          created_at: string
          diameter: number
          id: string
          model_name: string | null
          series_id: string | null
          tenant_id: string
          weight: number
        }
        Insert: {
          blade_count: number
          created_at?: string
          diameter: number
          id?: string
          model_name?: string | null
          series_id?: string | null
          tenant_id: string
          weight: number
        }
        Update: {
          blade_count?: number
          created_at?: string
          diameter?: number
          id?: string
          model_name?: string | null
          series_id?: string | null
          tenant_id?: string
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "impeller_weights_series_id_fkey"
            columns: ["series_id"]
            isOneToOne: false
            referencedRelation: "fan_series"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "impeller_weights_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "impeller_weights_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants_public_branding"
            referencedColumns: ["id"]
          },
        ]
      }
      lpo_alert_log: {
        Row: {
          alert_key: string
          alert_type: string
          created_at: string
          id: string
          order_id: string | null
          recipient_email: string
          tenant_id: string | null
        }
        Insert: {
          alert_key: string
          alert_type: string
          created_at?: string
          id?: string
          order_id?: string | null
          recipient_email: string
          tenant_id?: string | null
        }
        Update: {
          alert_key?: string
          alert_type?: string
          created_at?: string
          id?: string
          order_id?: string | null
          recipient_email?: string
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lpo_alert_log_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "lpo_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      lpo_contacts: {
        Row: {
          address: string | null
          contact_person: string | null
          contact_type: string
          created_at: string
          created_by: string | null
          email: string | null
          id: string
          name: string
          notes: string | null
          payment_terms: string | null
          phone: string | null
          tenant_id: string
          trn: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          contact_person?: string | null
          contact_type: string
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          name: string
          notes?: string | null
          payment_terms?: string | null
          phone?: string | null
          tenant_id: string
          trn?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          contact_person?: string | null
          contact_type?: string
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          name?: string
          notes?: string | null
          payment_terms?: string | null
          phone?: string | null
          tenant_id?: string
          trn?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lpo_contacts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lpo_contacts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants_public_branding"
            referencedColumns: ["id"]
          },
        ]
      }
      lpo_documents: {
        Row: {
          created_at: string
          doc_type: string
          file_name: string
          file_size_bytes: number | null
          id: string
          mime_type: string | null
          order_id: string
          storage_path: string
          tenant_id: string
          title: string | null
          uploaded_by_name: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          doc_type?: string
          file_name: string
          file_size_bytes?: number | null
          id?: string
          mime_type?: string | null
          order_id: string
          storage_path: string
          tenant_id: string
          title?: string | null
          uploaded_by_name?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          doc_type?: string
          file_name?: string
          file_size_bytes?: number | null
          id?: string
          mime_type?: string | null
          order_id?: string
          storage_path?: string
          tenant_id?: string
          title?: string | null
          uploaded_by_name?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lpo_documents_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "lpo_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lpo_documents_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lpo_documents_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants_public_branding"
            referencedColumns: ["id"]
          },
        ]
      }
      lpo_order_updates: {
        Row: {
          author_name: string | null
          created_at: string
          id: string
          note: string
          order_id: string
          status_at_time: string | null
          tenant_id: string
          user_id: string | null
        }
        Insert: {
          author_name?: string | null
          created_at?: string
          id?: string
          note: string
          order_id: string
          status_at_time?: string | null
          tenant_id: string
          user_id?: string | null
        }
        Update: {
          author_name?: string | null
          created_at?: string
          id?: string
          note?: string
          order_id?: string
          status_at_time?: string | null
          tenant_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lpo_order_updates_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "lpo_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lpo_order_updates_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lpo_order_updates_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants_public_branding"
            referencedColumns: ["id"]
          },
        ]
      }
      lpo_orders: {
        Row: {
          actual_delivery_date: string | null
          advance_amount: number | null
          advance_payment_date: string | null
          advance_payment_status: string
          advance_percent: number | null
          advance_received_amount: number | null
          balance_amount: number | null
          balance_payment_date: string | null
          balance_received_amount: number | null
          baseline_committed_date: string | null
          client_contact: string | null
          client_email: string | null
          client_name: string
          commitment_matches_supplier: boolean
          committed_delivery_date: string | null
          committed_delivery_date_min: string | null
          cost_value: number | null
          created_at: string
          currency: string
          customs_clearance_date: string | null
          delay_owner: string | null
          delay_reason: string | null
          delivery_location: string | null
          delivery_terms: string | null
          description: string | null
          dispatch_date: string | null
          expected_delivery_date: string | null
          factory_lead_time_days: number | null
          id: string
          inspection_date: string | null
          installation_date: string | null
          invoice_date: string | null
          invoice_number: string | null
          is_draft: boolean
          last_followup_date: string | null
          last_updated_by_name: string | null
          lead_time_weeks_max: number | null
          lead_time_weeks_min: number | null
          lpo_date: string | null
          lpo_received_date: string | null
          lpo_ref: string
          manufacturing_clearance_date: string | null
          material_type: string
          material_types: string[]
          next_followup_date: string | null
          notes: string | null
          notify_email: string | null
          order_ack_sent_date: string | null
          order_ack_status: string
          order_owner: string | null
          order_value: number | null
          payment_terms: string | null
          pi_number: string | null
          pi_sent_date: string | null
          pi_status: string
          port_eta_date: string | null
          priority: string
          production_start_date: string | null
          project_name: string | null
          quantity: number
          quotation_date: string | null
          quotation_ref: string | null
          quoted_lead_time_days: number | null
          ready_date: string | null
          retention_percent: number | null
          retention_release_date: string | null
          revised_lead_time_weeks_max: number | null
          revised_lead_time_weeks_min: number | null
          revised_lpo_date: string | null
          revised_lpo_received_date: string | null
          revised_lpo_ref: string | null
          revised_order_value: number | null
          revision_no: number
          revision_notes: string | null
          shipment_ref: string | null
          site_delivery_date: string | null
          status: string
          supplier_advance_amount: number | null
          supplier_advance_payment_date: string | null
          supplier_advance_percent: number | null
          supplier_balance_amount: number | null
          supplier_balance_payment_date: string | null
          supplier_name: string | null
          supplier_order_value: number | null
          supplier_payment_terms: string | null
          supplier_po_date: string | null
          suppliers: Json
          tenant_id: string
          transport_mode: string | null
          updated_at: string
          user_id: string
          vat_amount: number | null
          vat_percent: number | null
          warranty_end_date: string | null
          warranty_months: number | null
          warranty_start_date: string | null
          warranty_terms: string | null
        }
        Insert: {
          actual_delivery_date?: string | null
          advance_amount?: number | null
          advance_payment_date?: string | null
          advance_payment_status?: string
          advance_percent?: number | null
          advance_received_amount?: number | null
          balance_amount?: number | null
          balance_payment_date?: string | null
          balance_received_amount?: number | null
          baseline_committed_date?: string | null
          client_contact?: string | null
          client_email?: string | null
          client_name: string
          commitment_matches_supplier?: boolean
          committed_delivery_date?: string | null
          committed_delivery_date_min?: string | null
          cost_value?: number | null
          created_at?: string
          currency?: string
          customs_clearance_date?: string | null
          delay_owner?: string | null
          delay_reason?: string | null
          delivery_location?: string | null
          delivery_terms?: string | null
          description?: string | null
          dispatch_date?: string | null
          expected_delivery_date?: string | null
          factory_lead_time_days?: number | null
          id?: string
          inspection_date?: string | null
          installation_date?: string | null
          invoice_date?: string | null
          invoice_number?: string | null
          is_draft?: boolean
          last_followup_date?: string | null
          last_updated_by_name?: string | null
          lead_time_weeks_max?: number | null
          lead_time_weeks_min?: number | null
          lpo_date?: string | null
          lpo_received_date?: string | null
          lpo_ref: string
          manufacturing_clearance_date?: string | null
          material_type?: string
          material_types?: string[]
          next_followup_date?: string | null
          notes?: string | null
          notify_email?: string | null
          order_ack_sent_date?: string | null
          order_ack_status?: string
          order_owner?: string | null
          order_value?: number | null
          payment_terms?: string | null
          pi_number?: string | null
          pi_sent_date?: string | null
          pi_status?: string
          port_eta_date?: string | null
          priority?: string
          production_start_date?: string | null
          project_name?: string | null
          quantity?: number
          quotation_date?: string | null
          quotation_ref?: string | null
          quoted_lead_time_days?: number | null
          ready_date?: string | null
          retention_percent?: number | null
          retention_release_date?: string | null
          revised_lead_time_weeks_max?: number | null
          revised_lead_time_weeks_min?: number | null
          revised_lpo_date?: string | null
          revised_lpo_received_date?: string | null
          revised_lpo_ref?: string | null
          revised_order_value?: number | null
          revision_no?: number
          revision_notes?: string | null
          shipment_ref?: string | null
          site_delivery_date?: string | null
          status?: string
          supplier_advance_amount?: number | null
          supplier_advance_payment_date?: string | null
          supplier_advance_percent?: number | null
          supplier_balance_amount?: number | null
          supplier_balance_payment_date?: string | null
          supplier_name?: string | null
          supplier_order_value?: number | null
          supplier_payment_terms?: string | null
          supplier_po_date?: string | null
          suppliers?: Json
          tenant_id: string
          transport_mode?: string | null
          updated_at?: string
          user_id: string
          vat_amount?: number | null
          vat_percent?: number | null
          warranty_end_date?: string | null
          warranty_months?: number | null
          warranty_start_date?: string | null
          warranty_terms?: string | null
        }
        Update: {
          actual_delivery_date?: string | null
          advance_amount?: number | null
          advance_payment_date?: string | null
          advance_payment_status?: string
          advance_percent?: number | null
          advance_received_amount?: number | null
          balance_amount?: number | null
          balance_payment_date?: string | null
          balance_received_amount?: number | null
          baseline_committed_date?: string | null
          client_contact?: string | null
          client_email?: string | null
          client_name?: string
          commitment_matches_supplier?: boolean
          committed_delivery_date?: string | null
          committed_delivery_date_min?: string | null
          cost_value?: number | null
          created_at?: string
          currency?: string
          customs_clearance_date?: string | null
          delay_owner?: string | null
          delay_reason?: string | null
          delivery_location?: string | null
          delivery_terms?: string | null
          description?: string | null
          dispatch_date?: string | null
          expected_delivery_date?: string | null
          factory_lead_time_days?: number | null
          id?: string
          inspection_date?: string | null
          installation_date?: string | null
          invoice_date?: string | null
          invoice_number?: string | null
          is_draft?: boolean
          last_followup_date?: string | null
          last_updated_by_name?: string | null
          lead_time_weeks_max?: number | null
          lead_time_weeks_min?: number | null
          lpo_date?: string | null
          lpo_received_date?: string | null
          lpo_ref?: string
          manufacturing_clearance_date?: string | null
          material_type?: string
          material_types?: string[]
          next_followup_date?: string | null
          notes?: string | null
          notify_email?: string | null
          order_ack_sent_date?: string | null
          order_ack_status?: string
          order_owner?: string | null
          order_value?: number | null
          payment_terms?: string | null
          pi_number?: string | null
          pi_sent_date?: string | null
          pi_status?: string
          port_eta_date?: string | null
          priority?: string
          production_start_date?: string | null
          project_name?: string | null
          quantity?: number
          quotation_date?: string | null
          quotation_ref?: string | null
          quoted_lead_time_days?: number | null
          ready_date?: string | null
          retention_percent?: number | null
          retention_release_date?: string | null
          revised_lead_time_weeks_max?: number | null
          revised_lead_time_weeks_min?: number | null
          revised_lpo_date?: string | null
          revised_lpo_received_date?: string | null
          revised_lpo_ref?: string | null
          revised_order_value?: number | null
          revision_no?: number
          revision_notes?: string | null
          shipment_ref?: string | null
          site_delivery_date?: string | null
          status?: string
          supplier_advance_amount?: number | null
          supplier_advance_payment_date?: string | null
          supplier_advance_percent?: number | null
          supplier_balance_amount?: number | null
          supplier_balance_payment_date?: string | null
          supplier_name?: string | null
          supplier_order_value?: number | null
          supplier_payment_terms?: string | null
          supplier_po_date?: string | null
          suppliers?: Json
          tenant_id?: string
          transport_mode?: string | null
          updated_at?: string
          user_id?: string
          vat_amount?: number | null
          vat_percent?: number | null
          warranty_end_date?: string | null
          warranty_months?: number | null
          warranty_start_date?: string | null
          warranty_terms?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lpo_orders_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lpo_orders_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants_public_branding"
            referencedColumns: ["id"]
          },
        ]
      }
      lpo_revisions: {
        Row: {
          author_name: string | null
          created_at: string
          id: string
          order_id: string
          previous_committed_date: string | null
          reason: string | null
          revised_committed_date: string | null
          revised_lead_time_weeks_max: number | null
          revised_lead_time_weeks_min: number | null
          revised_lpo_date: string | null
          revised_lpo_received_date: string | null
          revised_lpo_ref: string | null
          revised_order_value: number | null
          revision_no: number
          tenant_id: string
          user_id: string | null
        }
        Insert: {
          author_name?: string | null
          created_at?: string
          id?: string
          order_id: string
          previous_committed_date?: string | null
          reason?: string | null
          revised_committed_date?: string | null
          revised_lead_time_weeks_max?: number | null
          revised_lead_time_weeks_min?: number | null
          revised_lpo_date?: string | null
          revised_lpo_received_date?: string | null
          revised_lpo_ref?: string | null
          revised_order_value?: number | null
          revision_no?: number
          tenant_id: string
          user_id?: string | null
        }
        Update: {
          author_name?: string | null
          created_at?: string
          id?: string
          order_id?: string
          previous_committed_date?: string | null
          reason?: string | null
          revised_committed_date?: string | null
          revised_lead_time_weeks_max?: number | null
          revised_lead_time_weeks_min?: number | null
          revised_lpo_date?: string | null
          revised_lpo_received_date?: string | null
          revised_lpo_ref?: string | null
          revised_order_value?: number | null
          revision_no?: number
          tenant_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lpo_revisions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "lpo_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lpo_revisions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lpo_revisions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants_public_branding"
            referencedColumns: ["id"]
          },
        ]
      }
      motor_brands: {
        Row: {
          created_at: string
          id: string
          name: string
          tenant_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          tenant_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "motor_brands_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "motor_brands_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants_public_branding"
            referencedColumns: ["id"]
          },
        ]
      }
      motor_specifications: {
        Row: {
          atex_rating: string | null
          brand_id: string | null
          created_at: string
          efficiency_class: string | null
          fire_rating: string | null
          frequency: number | null
          full_load_current: number | null
          id: string
          insulation_class: string | null
          ip_rating: string | null
          is_dual_speed: boolean | null
          model_id: string | null
          model_ids: string[]
          motor_frame: string | null
          motor_poles: number
          motor_weight: number | null
          phase: number | null
          rated_current: number | null
          rating_kw: number
          rpm: number | null
          secondary_poles: number | null
          secondary_rating_kw: number | null
          secondary_rpm: number | null
          series_id: string | null
          series_ids: string[]
          starting_current: number | null
          tenant_id: string
          updated_at: string
          voltage: number | null
        }
        Insert: {
          atex_rating?: string | null
          brand_id?: string | null
          created_at?: string
          efficiency_class?: string | null
          fire_rating?: string | null
          frequency?: number | null
          full_load_current?: number | null
          id?: string
          insulation_class?: string | null
          ip_rating?: string | null
          is_dual_speed?: boolean | null
          model_id?: string | null
          model_ids?: string[]
          motor_frame?: string | null
          motor_poles: number
          motor_weight?: number | null
          phase?: number | null
          rated_current?: number | null
          rating_kw: number
          rpm?: number | null
          secondary_poles?: number | null
          secondary_rating_kw?: number | null
          secondary_rpm?: number | null
          series_id?: string | null
          series_ids?: string[]
          starting_current?: number | null
          tenant_id: string
          updated_at?: string
          voltage?: number | null
        }
        Update: {
          atex_rating?: string | null
          brand_id?: string | null
          created_at?: string
          efficiency_class?: string | null
          fire_rating?: string | null
          frequency?: number | null
          full_load_current?: number | null
          id?: string
          insulation_class?: string | null
          ip_rating?: string | null
          is_dual_speed?: boolean | null
          model_id?: string | null
          model_ids?: string[]
          motor_frame?: string | null
          motor_poles?: number
          motor_weight?: number | null
          phase?: number | null
          rated_current?: number | null
          rating_kw?: number
          rpm?: number | null
          secondary_poles?: number | null
          secondary_rating_kw?: number | null
          secondary_rpm?: number | null
          series_id?: string | null
          series_ids?: string[]
          starting_current?: number | null
          tenant_id?: string
          updated_at?: string
          voltage?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "motor_specifications_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "motor_brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "motor_specifications_model_id_fkey"
            columns: ["model_id"]
            isOneToOne: false
            referencedRelation: "fan_models"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "motor_specifications_series_id_fkey"
            columns: ["series_id"]
            isOneToOne: false
            referencedRelation: "fan_series"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "motor_specifications_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "motor_specifications_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants_public_branding"
            referencedColumns: ["id"]
          },
        ]
      }
      noise_data: {
        Row: {
          blade_angle: number
          blade_config_id: string
          created_at: string
          hz125: number | null
          hz1k: number | null
          hz250: number | null
          hz2k: number | null
          hz4k: number | null
          hz500: number | null
          hz63: number | null
          hz8k: number | null
          id: string
          motor_poles: number | null
          overall: number | null
        }
        Insert: {
          blade_angle: number
          blade_config_id: string
          created_at?: string
          hz125?: number | null
          hz1k?: number | null
          hz250?: number | null
          hz2k?: number | null
          hz4k?: number | null
          hz500?: number | null
          hz63?: number | null
          hz8k?: number | null
          id?: string
          motor_poles?: number | null
          overall?: number | null
        }
        Update: {
          blade_angle?: number
          blade_config_id?: string
          created_at?: string
          hz125?: number | null
          hz1k?: number | null
          hz250?: number | null
          hz2k?: number | null
          hz4k?: number | null
          hz500?: number | null
          hz63?: number | null
          hz8k?: number | null
          id?: string
          motor_poles?: number | null
          overall?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "noise_data_blade_config_id_fkey"
            columns: ["blade_config_id"]
            isOneToOne: false
            referencedRelation: "blade_configurations"
            referencedColumns: ["id"]
          },
        ]
      }
      page_content: {
        Row: {
          content: string | null
          created_at: string
          display_order: number | null
          id: string
          is_visible: boolean | null
          page_key: string
          section_key: string
          tenant_id: string
          title: string | null
          updated_at: string
        }
        Insert: {
          content?: string | null
          created_at?: string
          display_order?: number | null
          id?: string
          is_visible?: boolean | null
          page_key: string
          section_key: string
          tenant_id: string
          title?: string | null
          updated_at?: string
        }
        Update: {
          content?: string | null
          created_at?: string
          display_order?: number | null
          id?: string
          is_visible?: boolean | null
          page_key?: string
          section_key?: string
          tenant_id?: string
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "page_content_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "page_content_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants_public_branding"
            referencedColumns: ["id"]
          },
        ]
      }
      performance_data: {
        Row: {
          airflow: number
          blade_angle: number
          blade_config_id: string
          created_at: string
          efficiency: number
          id: string
          motor_poles: number | null
          point_index: number
          shaft_power: number
          static_pressure: number
          total_efficiency: number | null
        }
        Insert: {
          airflow: number
          blade_angle: number
          blade_config_id: string
          created_at?: string
          efficiency: number
          id?: string
          motor_poles?: number | null
          point_index: number
          shaft_power: number
          static_pressure: number
          total_efficiency?: number | null
        }
        Update: {
          airflow?: number
          blade_angle?: number
          blade_config_id?: string
          created_at?: string
          efficiency?: number
          id?: string
          motor_poles?: number | null
          point_index?: number
          shaft_power?: number
          static_pressure?: number
          total_efficiency?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "performance_data_blade_config_id_fkey"
            columns: ["blade_config_id"]
            isOneToOne: false
            referencedRelation: "blade_configurations"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          approval_requested_at: string | null
          approved_at: string | null
          approved_by: string | null
          created_at: string
          display_name: string | null
          email: string | null
          id: string
          is_approved: boolean | null
          tenant_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          approval_requested_at?: string | null
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          is_approved?: boolean | null
          tenant_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          approval_requested_at?: string | null
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          is_approved?: boolean | null
          tenant_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants_public_branding"
            referencedColumns: ["id"]
          },
        ]
      }
      project_items: {
        Row: {
          air_density: number | null
          airflow_unit: string | null
          altitude: number | null
          atex_rating: string | null
          blade_angle: number
          blade_count: number
          casing_weight: number | null
          created_at: string
          datasheet_url: string | null
          diameter: number
          drive_voltage: number | null
          dynamic_pressure: number | null
          efficiency: number | null
          fan_model_id: string | null
          fan_rpm: number | null
          fire_class: string | null
          flexible_dimension_values: Json | null
          frequency: number | null
          id: string
          impeller_weight: number | null
          motor_brand_name: string | null
          motor_efficiency_class: string | null
          motor_fire_rating: string | null
          motor_frame: string | null
          motor_full_load_current: number | null
          motor_insulation_class: string | null
          motor_ip_rating: string | null
          motor_phase: number | null
          motor_poles: number
          motor_rated_current: number | null
          motor_rating_kw: number | null
          motor_starting_current: number | null
          motor_voltage: number | null
          motor_weight: number | null
          noise_directivity_q: number | null
          noise_distance: number | null
          nomenclature: string | null
          nominal_voltage: number | null
          notes: string | null
          operating_airflow: number | null
          operating_pressure: number | null
          outlet_velocity: number | null
          pressure_unit: string | null
          project_id: string
          quantity: number
          required_airflow: number
          required_pressure: number
          selected_accessories: string[] | null
          series_id: string | null
          series_name: string
          shaft_power: number | null
          sound_outlet_reduction: number | null
          stall_max_percent: number | null
          stall_min_percent: number | null
          temperature: number | null
          tenant_id: string
          total_pressure: number | null
          total_weight: number | null
          unit_price: number | null
          updated_at: string
          vfd_enabled: boolean | null
          vfd_frequency: number | null
          voltage_drive_enabled: boolean | null
        }
        Insert: {
          air_density?: number | null
          airflow_unit?: string | null
          altitude?: number | null
          atex_rating?: string | null
          blade_angle: number
          blade_count: number
          casing_weight?: number | null
          created_at?: string
          datasheet_url?: string | null
          diameter: number
          drive_voltage?: number | null
          dynamic_pressure?: number | null
          efficiency?: number | null
          fan_model_id?: string | null
          fan_rpm?: number | null
          fire_class?: string | null
          flexible_dimension_values?: Json | null
          frequency?: number | null
          id?: string
          impeller_weight?: number | null
          motor_brand_name?: string | null
          motor_efficiency_class?: string | null
          motor_fire_rating?: string | null
          motor_frame?: string | null
          motor_full_load_current?: number | null
          motor_insulation_class?: string | null
          motor_ip_rating?: string | null
          motor_phase?: number | null
          motor_poles: number
          motor_rated_current?: number | null
          motor_rating_kw?: number | null
          motor_starting_current?: number | null
          motor_voltage?: number | null
          motor_weight?: number | null
          noise_directivity_q?: number | null
          noise_distance?: number | null
          nomenclature?: string | null
          nominal_voltage?: number | null
          notes?: string | null
          operating_airflow?: number | null
          operating_pressure?: number | null
          outlet_velocity?: number | null
          pressure_unit?: string | null
          project_id: string
          quantity?: number
          required_airflow: number
          required_pressure: number
          selected_accessories?: string[] | null
          series_id?: string | null
          series_name: string
          shaft_power?: number | null
          sound_outlet_reduction?: number | null
          stall_max_percent?: number | null
          stall_min_percent?: number | null
          temperature?: number | null
          tenant_id: string
          total_pressure?: number | null
          total_weight?: number | null
          unit_price?: number | null
          updated_at?: string
          vfd_enabled?: boolean | null
          vfd_frequency?: number | null
          voltage_drive_enabled?: boolean | null
        }
        Update: {
          air_density?: number | null
          airflow_unit?: string | null
          altitude?: number | null
          atex_rating?: string | null
          blade_angle?: number
          blade_count?: number
          casing_weight?: number | null
          created_at?: string
          datasheet_url?: string | null
          diameter?: number
          drive_voltage?: number | null
          dynamic_pressure?: number | null
          efficiency?: number | null
          fan_model_id?: string | null
          fan_rpm?: number | null
          fire_class?: string | null
          flexible_dimension_values?: Json | null
          frequency?: number | null
          id?: string
          impeller_weight?: number | null
          motor_brand_name?: string | null
          motor_efficiency_class?: string | null
          motor_fire_rating?: string | null
          motor_frame?: string | null
          motor_full_load_current?: number | null
          motor_insulation_class?: string | null
          motor_ip_rating?: string | null
          motor_phase?: number | null
          motor_poles?: number
          motor_rated_current?: number | null
          motor_rating_kw?: number | null
          motor_starting_current?: number | null
          motor_voltage?: number | null
          motor_weight?: number | null
          noise_directivity_q?: number | null
          noise_distance?: number | null
          nomenclature?: string | null
          nominal_voltage?: number | null
          notes?: string | null
          operating_airflow?: number | null
          operating_pressure?: number | null
          outlet_velocity?: number | null
          pressure_unit?: string | null
          project_id?: string
          quantity?: number
          required_airflow?: number
          required_pressure?: number
          selected_accessories?: string[] | null
          series_id?: string | null
          series_name?: string
          shaft_power?: number | null
          sound_outlet_reduction?: number | null
          stall_max_percent?: number | null
          stall_min_percent?: number | null
          temperature?: number | null
          tenant_id?: string
          total_pressure?: number | null
          total_weight?: number | null
          unit_price?: number | null
          updated_at?: string
          vfd_enabled?: boolean | null
          vfd_frequency?: number | null
          voltage_drive_enabled?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "project_items_fan_model_id_fkey"
            columns: ["fan_model_id"]
            isOneToOne: false
            referencedRelation: "fan_models"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_items_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_items_series_id_fkey"
            columns: ["series_id"]
            isOneToOne: false
            referencedRelation: "fan_series"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants_public_branding"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          client_address: string | null
          client_email: string | null
          client_name: string | null
          client_phone: string | null
          created_at: string
          description: string | null
          id: string
          name: string
          notes: string | null
          project_reference: string | null
          status: string
          tenant_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          client_address?: string | null
          client_email?: string | null
          client_name?: string | null
          client_phone?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name: string
          notes?: string | null
          project_reference?: string | null
          status?: string
          tenant_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          client_address?: string | null
          client_email?: string | null
          client_name?: string | null
          client_phone?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          notes?: string | null
          project_reference?: string | null
          status?: string
          tenant_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants_public_branding"
            referencedColumns: ["id"]
          },
        ]
      }
      series_dimension_schema: {
        Row: {
          created_at: string
          display_order: number
          id: string
          param_key: string
          param_label: string
          param_type: string
          series_id: string
        }
        Insert: {
          created_at?: string
          display_order?: number
          id?: string
          param_key: string
          param_label: string
          param_type?: string
          series_id: string
        }
        Update: {
          created_at?: string
          display_order?: number
          id?: string
          param_key?: string
          param_label?: string
          param_type?: string
          series_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "series_dimension_schema_series_id_fkey"
            columns: ["series_id"]
            isOneToOne: false
            referencedRelation: "fan_series"
            referencedColumns: ["id"]
          },
        ]
      }
      series_dimension_values: {
        Row: {
          created_at: string
          id: string
          is_from_model: boolean | null
          series_id: string
          size: number
          updated_at: string
          values: Json
        }
        Insert: {
          created_at?: string
          id?: string
          is_from_model?: boolean | null
          series_id: string
          size: number
          updated_at?: string
          values?: Json
        }
        Update: {
          created_at?: string
          id?: string
          is_from_model?: boolean | null
          series_id?: string
          size?: number
          updated_at?: string
          values?: Json
        }
        Relationships: [
          {
            foreignKeyName: "series_dimension_values_series_id_fkey"
            columns: ["series_id"]
            isOneToOne: false
            referencedRelation: "fan_series"
            referencedColumns: ["id"]
          },
        ]
      }
      software_releases: {
        Row: {
          created_at: string
          file_size_bytes: number | null
          id: string
          is_latest: boolean
          notes: string | null
          platform: string
          published_at: string
          storage_path: string
          title: string
          version: string
        }
        Insert: {
          created_at?: string
          file_size_bytes?: number | null
          id?: string
          is_latest?: boolean
          notes?: string | null
          platform?: string
          published_at?: string
          storage_path: string
          title: string
          version: string
        }
        Update: {
          created_at?: string
          file_size_bytes?: number | null
          id?: string
          is_latest?: boolean
          notes?: string | null
          platform?: string
          published_at?: string
          storage_path?: string
          title?: string
          version?: string
        }
        Relationships: []
      }
      tenants: {
        Row: {
          address: string | null
          created_at: string
          email: string | null
          factory_address: string | null
          favicon_url: string | null
          google_maps_url: string | null
          id: string
          is_active: boolean | null
          logo_url: string | null
          name: string
          phone: string | null
          subscription_end: string | null
          subscription_start: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          email?: string | null
          factory_address?: string | null
          favicon_url?: string | null
          google_maps_url?: string | null
          id?: string
          is_active?: boolean | null
          logo_url?: string | null
          name?: string
          phone?: string | null
          subscription_end?: string | null
          subscription_start?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          created_at?: string
          email?: string | null
          factory_address?: string | null
          favicon_url?: string | null
          google_maps_url?: string | null
          id?: string
          is_active?: boolean | null
          logo_url?: string | null
          name?: string
          phone?: string | null
          subscription_end?: string | null
          subscription_start?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      unit_preferences: {
        Row: {
          airflow_unit: string | null
          created_at: string
          default_tolerance_max: number | null
          default_tolerance_min: number | null
          id: string
          power_unit: string | null
          pressure_unit: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          airflow_unit?: string | null
          created_at?: string
          default_tolerance_max?: number | null
          default_tolerance_min?: number | null
          id?: string
          power_unit?: string | null
          pressure_unit?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          airflow_unit?: string | null
          created_at?: string
          default_tolerance_max?: number | null
          default_tolerance_min?: number | null
          id?: string
          power_unit?: string | null
          pressure_unit?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "unit_preferences_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "unit_preferences_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants_public_branding"
            referencedColumns: ["id"]
          },
        ]
      }
      guest_trials: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          ip_hash: string
          started_at: string
          trial_day: string
          user_id: string
        }
        Insert: {
          created_at?: string
          expires_at: string
          id?: string
          ip_hash: string
          started_at?: string
          trial_day?: string
          user_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          ip_hash?: string
          started_at?: string
          trial_day?: string
          user_id?: string
        }
        Relationships: []
      }
      lpo_email_recipients: {
        Row: {
          all_tenants: boolean
          created_at: string
          created_by: string | null
          display_name: string | null
          email: string
          id: string
          is_enabled: boolean
          tenant_id: string | null
          updated_at: string
        }
        Insert: {
          all_tenants?: boolean
          created_at?: string
          created_by?: string | null
          display_name?: string | null
          email: string
          id?: string
          is_enabled?: boolean
          tenant_id?: string | null
          updated_at?: string
        }
        Update: {
          all_tenants?: boolean
          created_at?: string
          created_by?: string | null
          display_name?: string | null
          email?: string
          id?: string
          is_enabled?: boolean
          tenant_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lpo_email_recipients_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      lpo_email_schedule: {
        Row: {
          cron_expression: string
          enabled: boolean
          frequency: string
          id: number
          send_time: string
          timezone: string
          updated_at: string
          updated_by: string | null
          weekday: number
        }
        Insert: {
          cron_expression?: string
          enabled?: boolean
          frequency?: string
          id?: number
          send_time?: string
          timezone?: string
          updated_at?: string
          updated_by?: string | null
          weekday?: number
        }
        Update: {
          cron_expression?: string
          enabled?: boolean
          frequency?: string
          id?: number
          send_time?: string
          timezone?: string
          updated_at?: string
          updated_by?: string | null
          weekday?: number
        }
        Relationships: []
      }
      user_lpo_permissions: {
        Row: {
          can_access_lpo: boolean
          notification_email: string | null
          receive_lpo_emails: boolean
          updated_at: string
          updated_by: string | null
          user_id: string
        }
        Insert: {
          can_access_lpo?: boolean
          notification_email?: string | null
          receive_lpo_emails?: boolean
          updated_at?: string
          updated_by?: string | null
          user_id: string
        }
        Update: {
          can_access_lpo?: boolean
          notification_email?: string | null
          receive_lpo_emails?: boolean
          updated_at?: string
          updated_by?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      tenants_public_branding: {
        Row: {
          favicon_url: string | null
          id: string | null
          logo_url: string | null
          name: string | null
        }
        Insert: {
          favicon_url?: string | null
          id?: string | null
          logo_url?: string | null
          name?: string | null
        }
        Update: {
          favicon_url?: string | null
          id?: string | null
          logo_url?: string | null
          name?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      can_access_lpo: {
        Args: { _user_id: string }
        Returns: boolean
      }
      update_lpo_email_schedule: {
        Args: {
          p_enabled: boolean
          p_frequency: string
          p_send_time: string
          p_timezone: string
          p_weekday: number
        }
        Returns: {
          cron_expression: string
          enabled: boolean
          frequency: string
          id: number
          send_time: string
          timezone: string
          updated_at: string
          updated_by: string | null
          weekday: number
        }
      }
      get_user_tenant_id: { Args: { _user_id: string }; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_super_admin: { Args: { _user_id: string }; Returns: boolean }
      is_user_active: { Args: { _user_id: string }; Returns: boolean }
    }
    Enums: {
      app_role: "admin" | "user"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "user"],
    },
  },
} as const
