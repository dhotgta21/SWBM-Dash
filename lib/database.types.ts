export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          email: string
          full_name: string | null
          role: 'admin' | 'staff' | 'client' | 'picker' | 'driver'
          phone: string | null
          is_active: boolean
          account_number: string | null
          client_id: string | null
          permissions: Json | null
          permissions_updated_at: string | null
          permissions_updated_by: string | null
          employee_number: string | null
          date_of_birth: string | null
          id_security_number: string | null
          job_title: string | null
          department: string | null
          last_sign_in_at: string | null
          last_active_at: string | null
          created_at: string
          created_by: string | null
        }
        Insert: {
          id: string
          email: string
          full_name?: string | null
          role?: 'admin' | 'staff' | 'client' | 'picker' | 'driver'
          phone?: string | null
          is_active?: boolean
          account_number?: string | null
          client_id?: string | null
          permissions?: Json | null
          permissions_updated_at?: string | null
          permissions_updated_by?: string | null
          employee_number?: string | null
          date_of_birth?: string | null
          id_security_number?: string | null
          job_title?: string | null
          department?: string | null
          last_sign_in_at?: string | null
          last_active_at?: string | null
          created_at?: string
          created_by?: string | null
        }
        Update: {
          id?: string
          email?: string
          full_name?: string | null
          role?: 'admin' | 'staff' | 'client' | 'picker' | 'driver'
          phone?: string | null
          is_active?: boolean
          account_number?: string | null
          client_id?: string | null
          permissions?: Json | null
          permissions_updated_at?: string | null
          permissions_updated_by?: string | null
          employee_number?: string | null
          date_of_birth?: string | null
          id_security_number?: string | null
          job_title?: string | null
          department?: string | null
          last_sign_in_at?: string | null
          last_active_at?: string | null
          created_at?: string
          created_by?: string | null
        }
      }
      company_settings: {
        Row: {
          id: number
          company_name: string
          address_line_1: string | null
          address_line_2: string | null
          town: string | null
          county: string | null
          postcode: string | null
          phone: string | null
          email: string | null
          vat_number: string | null
          default_vat_rate: number
          company_registration_number: string | null
          logo_url: string | null
          logo_text_enabled: boolean | null
          logo_text_primary: string | null
          logo_text_secondary: string | null
          logo_text_layout: string | null
          primary_font_url: string | null
          primary_font_family: string | null
          secondary_font_url: string | null
          secondary_font_family: string | null
          theme_primary_color: string | null
          theme_primary_foreground_color: string | null
          theme_secondary_color: string | null
          theme_secondary_foreground_color: string | null
          theme_background_color: string | null
          theme_foreground_color: string | null
          theme_card_color: string | null
          theme_muted_color: string | null
          theme_border_color: string | null
          theme_success_color: string | null
          theme_warning_color: string | null
          theme_destructive_color: string | null
          invoice_prefix: string
          quotation_prefix: string
          email_from_name: string | null
          email_reply_to: string | null
          webmail_url: string | null
          seo_home_title: string | null
          seo_home_description: string | null
          seo_home_keywords: string | null
          seo_og_title: string | null
          seo_og_description: string | null
          seo_shop_title: string | null
          seo_shop_description: string | null
          seo_cart_title: string | null
          seo_cart_description: string | null
          seo_geo_latitude: number | null
          seo_geo_longitude: number | null
          seo_same_as: string | null
          seo_catalog_title: string | null
          seo_catalog_description: string | null
          seo_category_title_template: string | null
          seo_category_description_template: string | null
          seo_product_title_template: string | null
          seo_product_description_template: string | null
          seo_price_range: string | null
          founded_year: number | null
          fleet_size: number | null
          yard_description: string | null
          yard_sections: Json
          opening_hours_text: string | null
          opening_hours: Json
          enable_stock_routing: boolean
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          id?: number
          company_name?: string
          address_line_1?: string | null
          address_line_2?: string | null
          town?: string | null
          county?: string | null
          postcode?: string | null
          phone?: string | null
          email?: string | null
          vat_number?: string | null
          default_vat_rate?: number
          company_registration_number?: string | null
          logo_url?: string | null
          logo_text_enabled?: boolean | null
          logo_text_primary?: string | null
          logo_text_secondary?: string | null
          logo_text_layout?: string | null
          primary_font_url?: string | null
          primary_font_family?: string | null
          secondary_font_url?: string | null
          secondary_font_family?: string | null
          theme_primary_color?: string | null
          theme_primary_foreground_color?: string | null
          theme_secondary_color?: string | null
          theme_secondary_foreground_color?: string | null
          theme_background_color?: string | null
          theme_foreground_color?: string | null
          theme_card_color?: string | null
          theme_muted_color?: string | null
          theme_border_color?: string | null
          theme_success_color?: string | null
          theme_warning_color?: string | null
          theme_destructive_color?: string | null
          invoice_prefix?: string
          quotation_prefix?: string
          email_from_name?: string | null
          email_reply_to?: string | null
          webmail_url?: string | null
          seo_home_title?: string | null
          seo_home_description?: string | null
          seo_home_keywords?: string | null
          seo_og_title?: string | null
          seo_og_description?: string | null
          seo_shop_title?: string | null
          seo_shop_description?: string | null
          seo_cart_title?: string | null
          seo_cart_description?: string | null
          seo_geo_latitude?: number | null
          seo_geo_longitude?: number | null
          seo_same_as?: string | null
          seo_catalog_title?: string | null
          seo_catalog_description?: string | null
          seo_category_title_template?: string | null
          seo_category_description_template?: string | null
          seo_product_title_template?: string | null
          seo_product_description_template?: string | null
          seo_price_range?: string | null
          founded_year?: number | null
          fleet_size?: number | null
          yard_description?: string | null
          yard_sections?: Json
          opening_hours_text?: string | null
          opening_hours?: Json
          enable_stock_routing?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          id?: number
          company_name?: string
          address_line_1?: string | null
          address_line_2?: string | null
          town?: string | null
          county?: string | null
          postcode?: string | null
          phone?: string | null
          email?: string | null
          vat_number?: string | null
          default_vat_rate?: number
          company_registration_number?: string | null
          logo_url?: string | null
          logo_text_enabled?: boolean | null
          logo_text_primary?: string | null
          logo_text_secondary?: string | null
          logo_text_layout?: string | null
          primary_font_url?: string | null
          primary_font_family?: string | null
          secondary_font_url?: string | null
          secondary_font_family?: string | null
          theme_primary_color?: string | null
          theme_primary_foreground_color?: string | null
          theme_secondary_color?: string | null
          theme_secondary_foreground_color?: string | null
          theme_background_color?: string | null
          theme_foreground_color?: string | null
          theme_card_color?: string | null
          theme_muted_color?: string | null
          theme_border_color?: string | null
          theme_success_color?: string | null
          theme_warning_color?: string | null
          theme_destructive_color?: string | null
          invoice_prefix?: string
          quotation_prefix?: string
          email_from_name?: string | null
          email_reply_to?: string | null
          webmail_url?: string | null
          seo_home_title?: string | null
          seo_home_description?: string | null
          seo_home_keywords?: string | null
          seo_og_title?: string | null
          seo_og_description?: string | null
          seo_shop_title?: string | null
          seo_shop_description?: string | null
          seo_cart_title?: string | null
          seo_cart_description?: string | null
          seo_geo_latitude?: number | null
          seo_geo_longitude?: number | null
          seo_same_as?: string | null
          seo_catalog_title?: string | null
          seo_catalog_description?: string | null
          seo_category_title_template?: string | null
          seo_category_description_template?: string | null
          seo_product_title_template?: string | null
          seo_product_description_template?: string | null
          seo_price_range?: string | null
          founded_year?: number | null
          fleet_size?: number | null
          yard_description?: string | null
          yard_sections?: Json
          opening_hours_text?: string | null
          opening_hours?: Json
          enable_stock_routing?: boolean
          updated_at?: string
          updated_by?: string | null
        }
      }
      company_bank_details: {
        Row: {
          id: number
          bank_name: string | null
          bank_account_name: string | null
          sort_code: string | null
          account_number: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          id?: number
          bank_name?: string | null
          bank_account_name?: string | null
          sort_code?: string | null
          account_number?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          id?: number
          bank_name?: string | null
          bank_account_name?: string | null
          sort_code?: string | null
          account_number?: string | null
          updated_at?: string
          updated_by?: string | null
        }
      }
      company_phones: {
        Row: {
          id: string
          settings_id: number
          value: string
          label: string | null
          is_primary: boolean
          show_header: boolean
          show_homepage: boolean
          show_contact_page: boolean
          show_footer: boolean
          show_invoice: boolean
          show_email: boolean
          show_auth: boolean
          sort_order: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          settings_id?: number
          value: string
          label?: string | null
          is_primary?: boolean
          show_header?: boolean
          show_homepage?: boolean
          show_contact_page?: boolean
          show_footer?: boolean
          show_invoice?: boolean
          show_email?: boolean
          show_auth?: boolean
          sort_order?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          settings_id?: number
          value?: string
          label?: string | null
          is_primary?: boolean
          show_header?: boolean
          show_homepage?: boolean
          show_contact_page?: boolean
          show_footer?: boolean
          show_invoice?: boolean
          show_email?: boolean
          show_auth?: boolean
          sort_order?: number
          created_at?: string
          updated_at?: string
        }
      }
      company_emails: {
        Row: {
          id: string
          settings_id: number
          value: string
          label: string | null
          is_primary: boolean
          show_header: boolean
          show_homepage: boolean
          show_contact_page: boolean
          show_footer: boolean
          show_invoice: boolean
          show_email: boolean
          show_auth: boolean
          sort_order: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          settings_id?: number
          value: string
          label?: string | null
          is_primary?: boolean
          show_header?: boolean
          show_homepage?: boolean
          show_contact_page?: boolean
          show_footer?: boolean
          show_invoice?: boolean
          show_email?: boolean
          show_auth?: boolean
          sort_order?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          settings_id?: number
          value?: string
          label?: string | null
          is_primary?: boolean
          show_header?: boolean
          show_homepage?: boolean
          show_contact_page?: boolean
          show_footer?: boolean
          show_invoice?: boolean
          show_email?: boolean
          show_auth?: boolean
          sort_order?: number
          created_at?: string
          updated_at?: string
        }
      }
      company_integration_secrets: {
        Row: {
          id: number
          resend_api_key_encrypted: string | null
          resend_from_address: string | null
          turnstile_secret_key_encrypted: string | null
          turnstile_site_key: string | null
          goaddress_token_encrypted: string | null
          resend_api_key_updated_at: string | null
          turnstile_secret_key_updated_at: string | null
          goaddress_token_updated_at: string | null
          rotation_warning_days: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          id?: number
          resend_api_key_encrypted?: string | null
          resend_from_address?: string | null
          turnstile_secret_key_encrypted?: string | null
          turnstile_site_key?: string | null
          goaddress_token_encrypted?: string | null
          resend_api_key_updated_at?: string | null
          turnstile_secret_key_updated_at?: string | null
          goaddress_token_updated_at?: string | null
          rotation_warning_days?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          id?: number
          resend_api_key_encrypted?: string | null
          resend_from_address?: string | null
          turnstile_secret_key_encrypted?: string | null
          turnstile_site_key?: string | null
          goaddress_token_encrypted?: string | null
          resend_api_key_updated_at?: string | null
          turnstile_secret_key_updated_at?: string | null
          goaddress_token_updated_at?: string | null
          rotation_warning_days?: number
          updated_at?: string
          updated_by?: string | null
        }
      }
      clients: {
        Row: {
          id: string
          first_name: string
          last_name: string
          email: string | null
          phone: string | null
          company_name: string | null
          account_number: string | null
          address_line_1: string | null
          address_line_2: string | null
          town: string | null
          county: string | null
          postcode: string | null
          notes: string | null
          ai_created: boolean
          reviewed: boolean
          is_temporary: boolean
          promoted_at: string | null
          account_balance: number
          payment_terms_days: number | null
          credit_limit: number | null
          created_by: string
          created_at: string
          updated_at: string
          deleted_at: string | null
        }
        Insert: {
          id?: string
          first_name: string
          last_name: string
          email?: string | null
          phone?: string | null
          company_name?: string | null
          account_number?: string | null
          address_line_1?: string | null
          address_line_2?: string | null
          town?: string | null
          county?: string | null
          postcode?: string | null
          notes?: string | null
          ai_created?: boolean | null
          reviewed?: boolean | null
          is_temporary?: boolean | null
          promoted_at?: string | null
          account_balance?: number
          payment_terms_days?: number | null
          credit_limit?: number | null
          created_by: string
          created_at?: string
          updated_at?: string
          deleted_at?: string | null
        }
        Update: {
          id?: string
          first_name?: string
          last_name?: string
          email?: string | null
          phone?: string | null
          company_name?: string | null
          account_number?: string | null
          address_line_1?: string | null
          address_line_2?: string | null
          town?: string | null
          county?: string | null
          postcode?: string | null
          notes?: string | null
          ai_created?: boolean | null
          reviewed?: boolean | null
          is_temporary?: boolean | null
          promoted_at?: string | null
          account_balance?: number
          payment_terms_days?: number | null
          credit_limit?: number | null
          created_by?: string
          created_at?: string
          updated_at?: string
          deleted_at?: string | null
        }
      }
      products: {
        Row: {
          id: string
          code: string
          name: string
          description: string | null
          unit: string
          category: string | null
          default_price: number
          price_from: number | null
          image_url: string | null
          is_active: boolean
          created_by: string | null
          created_at: string
          updated_at: string
          seo_title: string | null
          seo_description: string | null
          short_description: string | null
          key_features: Json | null
          brand: string | null
          mpn: string | null
          applications: Json | null
          length_mm: number | null
          width_mm: number | null
          height_mm: number | null
          thickness_mm: number | null
          coverage_m2_per_unit: number | null
          coverage_linear_m_per_unit: number | null
          unit_weight_kg: number | null
          pack_size: number | null
          wastage_pct: number | null
          calculator_type: string | null
          sale_price: number | null
          sale_starts_at: string | null
          sale_ends_at: string | null
          sale_label: string | null
          materials: Json | null
          variant_options: Json | null
          family_slug: string | null
          source_url: string | null
          is_temporary: boolean
          promoted_at: string | null
          temp_placeholder_code: boolean
          deleted_at: string | null
          track_stock: boolean
          stock_quantity: number
          reorder_level: number
          stock_updated_at: string | null
          stock_updated_by: string | null
        }
        Insert: {
          id?: string
          code: string
          name: string
          description?: string | null
          unit?: string
          category?: string | null
          default_price?: number
          price_from?: number | null
          image_url?: string | null
          is_active?: boolean
          created_by?: string | null
          created_at?: string
          updated_at?: string
          seo_title?: string | null
          seo_description?: string | null
          short_description?: string | null
          key_features?: Json | null
          brand?: string | null
          mpn?: string | null
          applications?: Json | null
          length_mm?: number | null
          width_mm?: number | null
          height_mm?: number | null
          thickness_mm?: number | null
          coverage_m2_per_unit?: number | null
          coverage_linear_m_per_unit?: number | null
          unit_weight_kg?: number | null
          pack_size?: number | null
          wastage_pct?: number | null
          calculator_type?: string | null
          sale_price?: number | null
          sale_starts_at?: string | null
          sale_ends_at?: string | null
          sale_label?: string | null
          materials?: Json | null
          variant_options?: Json | null
          family_slug?: string | null
          source_url?: string | null
          is_temporary?: boolean | null
          promoted_at?: string | null
          temp_placeholder_code?: boolean | null
          deleted_at?: string | null
          track_stock?: boolean
          stock_quantity?: number
          reorder_level?: number
          stock_updated_at?: string | null
          stock_updated_by?: string | null
        }
        Update: {
          id?: string
          code?: string
          name?: string
          description?: string | null
          unit?: string
          category?: string | null
          default_price?: number
          price_from?: number | null
          image_url?: string | null
          is_active?: boolean
          created_by?: string | null
          created_at?: string
          updated_at?: string
          seo_title?: string | null
          seo_description?: string | null
          short_description?: string | null
          key_features?: Json | null
          brand?: string | null
          mpn?: string | null
          applications?: Json | null
          length_mm?: number | null
          width_mm?: number | null
          height_mm?: number | null
          thickness_mm?: number | null
          coverage_m2_per_unit?: number | null
          coverage_linear_m_per_unit?: number | null
          unit_weight_kg?: number | null
          pack_size?: number | null
          wastage_pct?: number | null
          calculator_type?: string | null
          sale_price?: number | null
          sale_starts_at?: string | null
          sale_ends_at?: string | null
          sale_label?: string | null
          materials?: Json | null
          variant_options?: Json | null
          family_slug?: string | null
          source_url?: string | null
          is_temporary?: boolean | null
          promoted_at?: string | null
          temp_placeholder_code?: boolean | null
          deleted_at?: string | null
          track_stock?: boolean
          stock_quantity?: number
          reorder_level?: number
          stock_updated_at?: string | null
          stock_updated_by?: string | null
        }
      }
      campaigns: {
        Row: {
          id: string
          name: string
          discount_percent: number
          starts_at: string | null
          ends_at: string | null
          label: string | null
          is_paused: boolean
          deleted_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          discount_percent: number
          starts_at?: string | null
          ends_at?: string | null
          label?: string | null
          is_paused?: boolean
          deleted_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          discount_percent?: number
          starts_at?: string | null
          ends_at?: string | null
          label?: string | null
          is_paused?: boolean
          deleted_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      campaign_products: {
        Row: {
          campaign_id: string
          product_id: string
          created_at: string
        }
        Insert: {
          campaign_id: string
          product_id: string
          created_at?: string
        }
        Update: {
          campaign_id?: string
          product_id?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'campaign_products_campaign_id_fkey'
            columns: ['campaign_id']
            isOneToOne: false
            referencedRelation: 'campaigns'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'campaign_products_product_id_fkey'
            columns: ['product_id']
            isOneToOne: false
            referencedRelation: 'products'
            referencedColumns: ['id']
          },
        ]
      }
      quote_requests: {
        Row: {
          id: string
          request_number: string
          client_name: string
          client_email: string
          client_phone: string | null
          client_company: string | null
          delivery_address_line_1: string | null
          delivery_address_line_2: string | null
          delivery_town: string | null
          delivery_county: string | null
          delivery_postcode: string | null
          notes: string | null
          status: string
          ip_address: string
          user_agent: string | null
          processed_by: string | null
          processed_at: string | null
          created_invoice_id: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          request_number: string
          client_name: string
          client_email: string
          client_phone?: string | null
          client_company?: string | null
          delivery_address_line_1?: string | null
          delivery_address_line_2?: string | null
          delivery_town?: string | null
          delivery_county?: string | null
          delivery_postcode?: string | null
          notes?: string | null
          status?: string
          ip_address: string
          user_agent?: string | null
          processed_by?: string | null
          processed_at?: string | null
          created_invoice_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          request_number?: string
          client_name?: string
          client_email?: string
          client_phone?: string | null
          client_company?: string | null
          delivery_address_line_1?: string | null
          delivery_address_line_2?: string | null
          delivery_town?: string | null
          delivery_county?: string | null
          delivery_postcode?: string | null
          notes?: string | null
          status?: string
          ip_address?: string
          user_agent?: string | null
          processed_by?: string | null
          processed_at?: string | null
          created_invoice_id?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      quote_request_items: {
        Row: {
          id: string
          quote_request_id: string
          product_id: string | null
          product_code: string
          product_name: string
          quantity: number
          unit: string
          suggested_price: number | null
          notes: string | null
          created_at: string
        }
        Insert: {
          id?: string
          quote_request_id: string
          product_id?: string | null
          product_code: string
          product_name: string
          quantity?: number
          unit?: string
          suggested_price?: number | null
          notes?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          quote_request_id?: string
          product_id?: string | null
          product_code?: string
          product_name?: string
          quantity?: number
          unit?: string
          suggested_price?: number | null
          notes?: string | null
          created_at?: string
        }
      }
      ip_bans: {
        Row: {
          id: string
          ip_address: string
          reason: string
          banned_at: string
          expires_at: string | null
          banned_by: string | null
          created_at: string
        }
        Insert: {
          id?: string
          ip_address: string
          reason: string
          banned_at?: string
          expires_at?: string | null
          banned_by?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          ip_address?: string
          reason?: string
          banned_at?: string
          expires_at?: string | null
          banned_by?: string | null
          created_at?: string
        }
      }
      ip_email_log: {
        Row: {
          id: string
          ip_address: string
          email: string
          submission_hour: string
          created_at: string
        }
        Insert: {
          id?: string
          ip_address: string
          email: string
          submission_hour?: string
          created_at?: string
        }
        Update: {
          id?: string
          ip_address?: string
          email?: string
          submission_hour?: string
          created_at?: string
        }
      }
      order_number_sequence: {
        Row: {
          id: number
          next_value: number
        }
        Insert: {
          id?: number
          next_value?: number
        }
        Update: {
          id?: number
          next_value?: number
        }
      }
      document_sequences: {
        Row: {
          id: string
          prefix: string
          current_number: number
          year: number
        }
        Insert: {
          id?: string
          prefix: string
          current_number?: number
          year: number
        }
        Update: {
          id?: string
          prefix?: string
          current_number?: number
          year?: number
        }
      }
      invoices: {
        Row: {
          id: string
          type: 'invoice' | 'quotation'
          document_number: string
          order_number: string | null
          account_number: string | null
          client_id: string
          status: string
          issue_date: string
          issue_time: string | null
          due_date: string | null
          expiry_date: string | null
          operator_name: string
          your_reference: string | null
          notes: string | null
          show_payment_terms: boolean
          show_watermark: boolean
          show_paid_watermark: boolean
          show_partially_paid_watermark: boolean
          show_overdue_watermark: boolean
          paid_by: string | null
          paid_at: string | null
          overdue_at: string | null
          status_stamps_enabled: boolean
          status_stamps_mode: string
          delivery_method: string
          delivery_address_line_1: string | null
          delivery_address_line_2: string | null
          delivery_town: string | null
          delivery_county: string | null
          delivery_postcode: string | null
          subtotal: number
          vat_total: number
          total: number
          amount_paid: number
          balance_due: number
          converted_from_id: string | null
          share_token: string
          public_share_enabled: boolean
          share_token_expires_at: string | null
          share_token_created_at: string
          public_share_key: string | null
          public_share_requires_password: boolean
          public_share_password_hash: string | null
          delivery_note_share_enabled: boolean
          delivery_note_share_requires_password: boolean
          delivery_note_share_password_hash: string | null
          created_by: string
          created_at: string
          updated_at: string
          document_number_suffix: number | null
          deleted_at: string | null
          picking_status: string
          picking_started_at: string | null
          picking_loaded_at: string | null
          picking_completed_at: string | null
          picking_delivered_at: string | null
        }
        Insert: {
          id?: string
          type: 'invoice' | 'quotation'
          document_number: string
          order_number?: string | null
          account_number?: string | null
          client_id: string
          status?: string
          issue_date: string
          issue_time?: string | null
          due_date?: string | null
          expiry_date?: string | null
          operator_name?: string
          your_reference?: string | null
          notes?: string | null
          show_payment_terms?: boolean
          show_watermark?: boolean
          show_paid_watermark?: boolean
          show_partially_paid_watermark?: boolean
          show_overdue_watermark?: boolean
          paid_by?: string | null
          paid_at?: string | null
          overdue_at?: string | null
          status_stamps_enabled?: boolean
          status_stamps_mode?: string
          delivery_method?: string
          delivery_address_line_1?: string | null
          delivery_address_line_2?: string | null
          delivery_town?: string | null
          delivery_county?: string | null
          delivery_postcode?: string | null
          subtotal?: number
          vat_total?: number
          total?: number
          amount_paid?: number
          converted_from_id?: string | null
          share_token?: string
          public_share_enabled?: boolean
          share_token_expires_at?: string | null
          share_token_created_at?: string
          public_share_key?: string | null
          public_share_requires_password?: boolean
          public_share_password_hash?: string | null
          delivery_note_share_enabled?: boolean
          delivery_note_share_requires_password?: boolean
          delivery_note_share_password_hash?: string | null
          created_by: string
          created_at?: string
          updated_at?: string
          document_number_suffix?: never
          deleted_at?: string | null
          picking_status?: string
          picking_started_at?: string | null
          picking_loaded_at?: string | null
          picking_completed_at?: string | null
          picking_delivered_at?: string | null
        }
        Update: {
          id?: string
          type?: 'invoice' | 'quotation'
          document_number?: string
          order_number?: string | null
          account_number?: string | null
          client_id?: string
          status?: string
          issue_date?: string
          issue_time?: string | null
          due_date?: string | null
          expiry_date?: string | null
          operator_name?: string
          your_reference?: string | null
          notes?: string | null
          show_payment_terms?: boolean
          show_watermark?: boolean
          show_paid_watermark?: boolean
          show_partially_paid_watermark?: boolean
          show_overdue_watermark?: boolean
          paid_by?: string | null
          paid_at?: string | null
          overdue_at?: string | null
          status_stamps_enabled?: boolean
          status_stamps_mode?: string
          delivery_method?: string
          subtotal?: number
          vat_total?: number
          total?: number
          amount_paid?: number
          converted_from_id?: string | null
          share_token?: string
          public_share_enabled?: boolean
          share_token_expires_at?: string | null
          share_token_created_at?: string
          public_share_key?: string | null
          public_share_requires_password?: boolean
          public_share_password_hash?: string | null
          delivery_note_share_enabled?: boolean
          delivery_note_share_requires_password?: boolean
          delivery_note_share_password_hash?: string | null
          created_by?: string
          created_at?: string
          updated_at?: string
          document_number_suffix?: never
          deleted_at?: string | null
          picking_status?: string
          picking_started_at?: string | null
          picking_loaded_at?: string | null
          picking_completed_at?: string | null
          picking_delivered_at?: string | null
        }
      }
      invoice_items: {
        Row: {
          id: string
          invoice_id: string
          product_id: string | null
          product_name: string
          product_code: string | null
          unit: string | null
          quantity: number
          price: number
          vat_rate: number
          vat_amount: number
          line_total: number
          sort_order: number
          deleted_at: string | null
          stock_deducted: number
        }
        Insert: {
          id?: string
          invoice_id: string
          product_id?: string | null
          product_name: string
          product_code?: string | null
          unit?: string | null
          quantity: number
          price: number
          vat_rate?: number
          vat_amount: number
          line_total: number
          sort_order?: number
          deleted_at?: string | null
          stock_deducted?: number
        }
        Update: {
          id?: string
          invoice_id?: string
          product_id?: string | null
          product_name?: string
          product_code?: string | null
          unit?: string | null
          quantity?: number
          price?: number
          vat_rate?: number
          vat_amount?: number
          line_total?: number
          sort_order?: number
          deleted_at?: string | null
          stock_deducted?: number
        }
      }
      delivery_loads: {
        Row: {
          id: string
          invoice_id: string
          load_number: number
          status: string
          picked_by: string
          printed_at: string | null
          completed_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          invoice_id: string
          load_number: number
          status?: string
          picked_by: string
          printed_at?: string | null
          completed_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          invoice_id?: string
          load_number?: number
          status?: string
          picked_by?: string
          printed_at?: string | null
          completed_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      delivery_load_items: {
        Row: {
          id: string
          load_id: string
          invoice_item_id: string
          quantity: number
          status: string
          stock_alert_type: string | null
          created_at: string
        }
        Insert: {
          id?: string
          load_id: string
          invoice_item_id: string
          quantity: number
          status: string
          stock_alert_type?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          load_id?: string
          invoice_item_id?: string
          quantity?: number
          status?: string
          stock_alert_type?: string | null
          created_at?: string
        }
        Relationships: []
      }
      stock_audit_alerts: {
        Row: {
          id: string
          product_id: string | null
          invoice_item_id: string | null
          invoice_id: string
          alert_type: string
          source: string
          quantity_needed: number | null
          quantity_ordered: number | null
          expected_delivery_date: string | null
          quantity_received: number | null
          received_at: string | null
          raised_by: string
          raised_at: string
          resolved_at: string | null
          resolved_by: string | null
          notes: string | null
          status: string
        }
        Insert: {
          id?: string
          product_id?: string | null
          invoice_item_id?: string | null
          invoice_id: string
          alert_type: string
          source?: string
          quantity_needed?: number | null
          quantity_ordered?: number | null
          expected_delivery_date?: string | null
          quantity_received?: number | null
          received_at?: string | null
          raised_by: string
          raised_at?: string
          resolved_at?: string | null
          resolved_by?: string | null
          notes?: string | null
          status?: string
        }
        Update: {
          id?: string
          product_id?: string | null
          invoice_item_id?: string | null
          invoice_id?: string
          alert_type?: string
          source?: string
          quantity_needed?: number | null
          quantity_ordered?: number | null
          expected_delivery_date?: string | null
          quantity_received?: number | null
          received_at?: string | null
          raised_by?: string
          raised_at?: string
          resolved_at?: string | null
          resolved_by?: string | null
          notes?: string | null
          status?: string
        }
        Relationships: []
      }
      stock_take_logs: {
        Row: {
          id: string
          product_id: string
          previous_quantity: number
          new_quantity: number
          changed_by: string | null
          changed_at: string
          source: string
        }
        Insert: {
          id?: string
          product_id: string
          previous_quantity: number
          new_quantity: number
          changed_by?: string | null
          changed_at?: string
          source?: string
        }
        Update: {
          id?: string
          product_id?: string
          previous_quantity?: number
          new_quantity?: number
          changed_by?: string | null
          changed_at?: string
          source?: string
        }
        Relationships: []
      }
      payments: {
        Row: {
          id: string
          invoice_id: string
          amount: number
          payment_date: string
          method: 'cash' | 'bank_transfer' | 'card' | 'cheque' | 'other' | 'ecod'
          reference: string | null
          notes: string | null
          source: string
          verified_name: string | null
          created_by: string
          created_at: string
          deleted_at: string | null
        }
        Insert: {
          id?: string
          invoice_id: string
          amount: number
          payment_date: string
          method: 'cash' | 'bank_transfer' | 'card' | 'cheque' | 'other' | 'ecod'
          reference?: string | null
          notes?: string | null
          source?: string
          verified_name?: string | null
          created_by: string
          created_at?: string
          deleted_at?: string | null
        }
        Update: {
          id?: string
          invoice_id?: string
          amount?: number
          payment_date?: string
          method?: 'cash' | 'bank_transfer' | 'card' | 'cheque' | 'other' | 'ecod'
          reference?: string | null
          notes?: string | null
          source?: string
          verified_name?: string | null
          created_by?: string
          created_at?: string
          deleted_at?: string | null
        }
      }
      client_account_transactions: {
        Row: {
          id: string
          client_id: string
          type: 'deposit' | 'allocation' | 'withdrawal' | 'adjustment' | 'reversal'
          amount: number
          transaction_date: string
          running_balance: number
          invoice_id: string | null
          payment_id: string | null
          method: string | null
          reference: string | null
          notes: string | null
          verified_name: string | null
          verified_by: string | null
          verified_at: string | null
          created_by: string
          created_at: string
        }
        Insert: {
          id?: string
          client_id: string
          type: 'deposit' | 'allocation' | 'withdrawal' | 'adjustment' | 'reversal'
          amount: number
          transaction_date: string
          running_balance: number
          invoice_id?: string | null
          payment_id?: string | null
          method?: string | null
          reference?: string | null
          notes?: string | null
          verified_name?: string | null
          verified_by?: string | null
          verified_at?: string | null
          created_by: string
          created_at?: string
        }
        Update: {
          id?: string
          client_id?: string
          type?: 'deposit' | 'allocation' | 'withdrawal' | 'adjustment' | 'reversal'
          amount?: number
          running_balance?: number
          invoice_id?: string | null
          payment_id?: string | null
          method?: string | null
          reference?: string | null
          notes?: string | null
          verified_name?: string | null
          verified_by?: string | null
          verified_at?: string | null
          created_by?: string
          created_at?: string
        }
      }
      client_account_audit_log: {
        Row: {
          id: string
          action: 'deposit' | 'apply_balance' | 'reversal' | 'failed_verification' | 'rate_limited'
          client_id: string | null
          invoice_ids: string[] | null
          amount: number | null
          verified_name: string | null
          performed_by: string | null
          ip_address: string | null
          user_agent: string | null
          metadata: Json | null
          created_at: string
        }
        Insert: {
          id?: string
          action: string
          client_id?: string | null
          invoice_ids?: string[] | null
          amount?: number | null
          verified_name?: string | null
          performed_by?: string | null
          ip_address?: string | null
          user_agent?: string | null
          metadata?: Json | null
          created_at?: string
        }
        Update: {
          id?: string
          action?: string
          client_id?: string | null
          invoice_ids?: string[] | null
          amount?: number | null
          verified_name?: string | null
          performed_by?: string | null
          ip_address?: string | null
          user_agent?: string | null
          metadata?: Json | null
          created_at?: string
        }
      }
      app_secrets: {
        Row: {
          id: number
          deletion_password_hash: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: number
          deletion_password_hash?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: number
          deletion_password_hash?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      deletion_audit_log: {
        Row: {
          id: string
          action: 'soft_delete' | 'restore' | 'password_change' | 'failed_attempt' | 'rate_limited'
          target_table: string | null
          target_id: string | null
          performed_by: string | null
          performed_at: string
          ip_address: string | null
          user_agent: string | null
          success: boolean
          details: Json | null
        }
        Insert: {
          id?: string
          action: string
          target_table?: string | null
          target_id?: string | null
          performed_by?: string | null
          performed_at?: string
          ip_address?: string | null
          user_agent?: string | null
          success?: boolean
          details?: Json | null
        }
        Update: {
          id?: string
          action?: string
          target_table?: string | null
          target_id?: string | null
          performed_by?: string | null
          performed_at?: string
          ip_address?: string | null
          user_agent?: string | null
          success?: boolean
          details?: Json | null
        }
      }
      audit_logs: {
        Row: {
          id: string
          table_name: string
          record_id: string | null
          action: 'insert' | 'update' | 'delete'
          old_data: Json | null
          new_data: Json | null
          performed_by: string | null
          performed_at: string
        }
        Insert: {
          id?: string
          table_name: string
          record_id?: string | null
          action: 'insert' | 'update' | 'delete'
          old_data?: Json | null
          new_data?: Json | null
          performed_by?: string | null
          performed_at?: string
        }
        Update: {
          id?: string
          table_name?: string
          record_id?: string | null
          action?: 'insert' | 'update' | 'delete'
          old_data?: Json | null
          new_data?: Json | null
          performed_by?: string | null
          performed_at?: string
        }
      }
      client_invitations: {
        Row: {
          id: string
          client_id: string
          email: string
          token: string
          status: 'pending' | 'accepted' | 'revoked' | 'expired'
          invited_by: string
          profile_id: string | null
          created_at: string
          expires_at: string
          accepted_at: string | null
          revoked_at: string | null
          last_sent_at: string | null
        }
        Insert: {
          id?: string
          client_id: string
          email: string
          token: string
          status?: 'pending' | 'accepted' | 'revoked' | 'expired'
          invited_by: string
          profile_id?: string | null
          created_at?: string
          expires_at: string
          accepted_at?: string | null
          revoked_at?: string | null
          last_sent_at?: string | null
        }
        Update: {
          id?: string
          client_id?: string
          email?: string
          token?: string
          status?: 'pending' | 'accepted' | 'revoked' | 'expired'
          invited_by?: string
          profile_id?: string | null
          created_at?: string
          expires_at?: string
          accepted_at?: string | null
          revoked_at?: string | null
          last_sent_at?: string | null
        }
      }
      team_members: {
        Row: {
          id: string
          name: string
          role: string
          bio: string | null
          photo_url: string | null
          sort_order: number
          is_active: boolean
          created_at: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          id?: string
          name: string
          role: string
          bio?: string | null
          photo_url?: string | null
          sort_order?: number
          is_active?: boolean
          created_at?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          id?: string
          name?: string
          role?: string
          bio?: string | null
          photo_url?: string | null
          sort_order?: number
          is_active?: boolean
          created_at?: string
          updated_at?: string
          updated_by?: string | null
        }
      }
      history_milestones: {
        Row: {
          id: string
          year: number
          title: string
          body: string
          image_url: string | null
          sort_order: number
          is_active: boolean
          created_at: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          id?: string
          year: number
          title: string
          body: string
          image_url?: string | null
          sort_order?: number
          is_active?: boolean
          created_at?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          id?: string
          year?: number
          title?: string
          body?: string
          image_url?: string | null
          sort_order?: number
          is_active?: boolean
          created_at?: string
          updated_at?: string
          updated_by?: string | null
        }
      }
    }
    Views: Record<string, never>
    Functions: {
      generate_document_number: {
        Args: { doc_prefix: string }
        Returns: string
      }
      generate_unique_account_number: {
        Args: Record<string, never>
        Returns: string
      }
      handle_new_user: {
        Args: Record<string, never>
        Returns: unknown
      }
      is_admin: {
        Args: Record<string, never>
        Returns: boolean
      }
      is_client_of_invoice: {
        Args: { p_invoice_id: string }
        Returns: boolean
      }
      generate_unique_order_number: {
        Args: Record<string, never>
        Returns: string
      }
      accept_invitation: {
        Args: { p_token: string }
        Returns: { user_id: string; client_id: string; invitation_id: string; email: string }[]
      }
      convert_quote_to_invoice: {
        Args: { p_quote_id: string; p_user_id: string; p_is_admin?: boolean }
        Returns: string
      }
      is_ip_banned: {
        Args: { p_ip: string }
        Returns: boolean
      }
      record_ip_email: {
        Args: { p_ip: string; p_email: string }
        Returns: number
      }
      unban_ip: {
        Args: { p_ip: string }
        Returns: boolean
      }
      count_quote_requests_in_window: {
        Args: { p_email: string; p_window_days?: number }
        Returns: number
      }
      check_rate_limit: {
        Args: { p_key: string; p_max: number; p_window_seconds: number }
        Returns: number
      }
      replace_company_contact_channels: {
        Args: { p_settings_id: number; p_phones: Json; p_emails: Json }
        Returns: undefined
      }
      convert_quote_request_to_invoice: {
        Args: {
          p_request_id: string
          p_client_id: string
          p_document_number: string
          p_issue_date: string
          p_notes: string
          p_delivery_address_line_1: string
          p_delivery_address_line_2: string
          p_delivery_town: string
          p_delivery_county: string
          p_delivery_postcode: string
          p_subtotal: number
          p_vat_total: number
          p_total: number
          p_items: Json
          p_user_id: string
        }
        Returns: string
      }
      update_invoice_with_items: {
        Args: { p_invoice_id: string; p_user_id: string; p_payload: Json }
        Returns: Database['public']['Tables']['invoices']['Row']
      }
      soft_delete_client: {
        Args: {
          p_client_id: string
          p_password: string
          p_ip_address?: string
          p_user_agent?: string
          p_operator_id?: string
        }
        Returns: { success: boolean; error_code: string | null; message: string }
      }
      soft_delete_product: {
        Args: {
          p_product_id: string
          p_password: string
          p_ip_address?: string
          p_user_agent?: string
          p_operator_id?: string
        }
        Returns: { success: boolean; error_code: string | null; message: string }
      }
      soft_delete_invoice: {
        Args: {
          p_invoice_id: string
          p_password: string
          p_ip_address?: string
          p_user_agent?: string
          p_operator_id?: string
        }
        Returns: { success: boolean; error_code: string | null; message: string }
      }
      soft_delete_payment: {
        Args: {
          p_payment_id: string
          p_password: string
          p_ip_address?: string
          p_user_agent?: string
          p_operator_id?: string
        }
        Returns: { success: boolean; error_code: string | null; message: string }
      }
      restore_client: {
        Args: {
          p_client_id: string
          p_password: string
          p_ip_address?: string
          p_user_agent?: string
          p_operator_id?: string
        }
        Returns: { success: boolean; error_code: string | null; message: string }
      }
      restore_product: {
        Args: {
          p_product_id: string
          p_password: string
          p_ip_address?: string
          p_user_agent?: string
          p_operator_id?: string
        }
        Returns: { success: boolean; error_code: string | null; message: string }
      }
      restore_invoice: {
        Args: {
          p_invoice_id: string
          p_password: string
          p_ip_address?: string
          p_user_agent?: string
          p_operator_id?: string
        }
        Returns: { success: boolean; error_code: string | null; message: string }
      }
      hard_delete_draft_invoice: {
        Args: { p_invoice_id: string }
        Returns: boolean
      }
      set_deletion_password: {
        Args: { p_new_password: string }
        Returns: { success: boolean; error_code: string | null; message: string }
      }
      change_deletion_password: {
        Args: { p_current_password: string; p_new_password: string }
        Returns: { success: boolean; error_code: string | null; message: string }
      }
      verify_deletion_password: {
        Args: { p_password: string }
        Returns: boolean
      }
      has_payment_password: {
        Args: Record<string, never>
        Returns: boolean
      }
      set_payment_password: {
        Args: { p_new_password: string }
        Returns: { success: boolean; error_code: string | null; message: string }
      }
      change_payment_password: {
        Args: { p_current_password: string; p_new_password: string }
        Returns: { success: boolean; error_code: string | null; message: string }
      }
      verify_payment_password: {
        Args: { p_password: string }
        Returns: boolean
      }
      admin_reset_payment_password: {
        Args: { p_user_id: string; p_new_password: string }
        Returns: { success: boolean; error_code: string | null; message: string }
      }
      deposit_to_client_account: {
        Args: {
          p_client_id: string
          p_amount: number
          p_method: string
          p_reference?: string
          p_notes?: string
          p_verified_name?: string
          p_transaction_date?: string
        }
        Returns: string
      }
      apply_client_account_balance: {
        Args: {
          p_client_id: string
          p_invoice_ids: string[]
          p_amounts: number[]
          p_notes?: string
          p_verified_name?: string
        }
        Returns: string[]
      }
      log_client_account_action: {
        Args: {
          p_action: string
          p_client_id?: string
          p_invoice_ids?: string[]
          p_amount?: number
          p_verified_name?: string
          p_ip_address?: string
          p_user_agent?: string
          p_metadata?: Json
        }
        Returns: void
      }
      set_product_stock: {
        Args: { p_product_id: string; p_quantity: number }
        Returns: number
      }
    }
    Enums: Record<string, never>
  }
}
