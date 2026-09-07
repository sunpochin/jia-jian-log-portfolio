/*
檔案用途：保存 Supabase 公開 schema 的前端 TypeScript 型別快照。
所在層：src/lib；供資料庫轉接層與型別檢查使用，不承載畫面邏輯。
主要關聯：supabase/migrations、src/lib/supabase.ts 與 src/types/database.ts。
*/
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
      account_usage_limits: {
        Row: {
          blood_pressure_daily_limit: number
          care_timeline_daily_limit: number
          created_at: string
          photo_retention_tier: string
          plan_code: string
          profile_email: string
          temperature_daily_limit: number
          updated_at: string
        }
        Insert: {
          blood_pressure_daily_limit?: number
          care_timeline_daily_limit?: number
          created_at?: string
          photo_retention_tier?: string
          plan_code?: string
          profile_email: string
          temperature_daily_limit?: number
          updated_at?: string
        }
        Update: {
          blood_pressure_daily_limit?: number
          care_timeline_daily_limit?: number
          created_at?: string
          photo_retention_tier?: string
          plan_code?: string
          profile_email?: string
          temperature_daily_limit?: number
          updated_at?: string
        }
        Relationships: []
      }
      active_patient_preferences: {
        Row: {
          default_mode: string
          patient_id: string
          profile_email: string
          updated_at: string
        }
        Insert: {
          default_mode?: string
          patient_id: string
          profile_email: string
          updated_at?: string
        }
        Update: {
          default_mode?: string
          patient_id?: string
          profile_email?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "active_subject_preferences_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "active_subject_preferences_profile_email_fkey"
            columns: ["profile_email"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["email"]
          },
        ]
      }
      app_profiles: {
        Row: {
          created_at: string
          display_name: string | null
          email: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          email: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          email?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      blood_pressure_records: {
        Row: {
          created_at: string
          diastolic: number
          id: string
          measured_at: string
          patient_id: string | null
          pulse: number | null
          recorded_by: string | null
          recorded_by_user_id: string | null
          source: string
          systolic: number
        }
        Insert: {
          created_at?: string
          diastolic: number
          id?: string
          measured_at?: string
          patient_id?: string | null
          pulse?: number | null
          recorded_by?: string | null
          recorded_by_user_id?: string | null
          source?: string
          systolic: number
        }
        Update: {
          created_at?: string
          diastolic?: number
          id?: string
          measured_at?: string
          patient_id?: string | null
          pulse?: number | null
          recorded_by?: string | null
          recorded_by_user_id?: string | null
          source?: string
          systolic?: number
        }
        Relationships: [
          {
            foreignKeyName: "blood_pressure_records_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      body_temperature_records: {
        Row: {
          context: string
          created_at: string
          id: string
          measurement_site: string
          measured_at: string
          notes: string | null
          patient_id: string
          recorded_by: string
          source: string
          temperature_c: number
        }
        Insert: {
          context?: string
          created_at?: string
          id?: string
          measurement_site: string
          measured_at?: string
          notes?: string | null
          patient_id: string
          recorded_by: string
          source?: string
          temperature_c: number
        }
        Update: {
          context?: string
          created_at?: string
          id?: string
          measurement_site?: string
          measured_at?: string
          notes?: string | null
          patient_id?: string
          recorded_by?: string
          source?: string
          temperature_c?: number
        }
        Relationships: [
          {
            foreignKeyName: "body_temperature_records_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      caregiver_invitations: {
        Row: {
          accepted_at: string | null
          can_manage_medication: boolean
          can_record: boolean
          created_at: string
          expires_at: string
          household_id: string
          id: string
          invited_email: string | null
          patient_id: string
          requested_at: string | null
          requested_by_user_id: string | null
          requested_email: string | null
          revoked_at: string | null
          status: string
          token_hash: string
          invited_by_user_id: string
        }
        Insert: {
          accepted_at?: string | null
          can_manage_medication?: boolean
          can_record?: boolean
          created_at?: string
          expires_at?: string
          household_id: string
          id?: string
          invited_email?: string | null
          patient_id: string
          requested_at?: string | null
          requested_by_user_id?: string | null
          requested_email?: string | null
          revoked_at?: string | null
          status?: string
          token_hash: string
          invited_by_user_id: string
        }
        Update: {
          accepted_at?: string | null
          can_manage_medication?: boolean
          can_record?: boolean
          created_at?: string
          expires_at?: string
          household_id?: string
          id?: string
          invited_email?: string | null
          patient_id?: string
          requested_at?: string | null
          requested_by_user_id?: string | null
          requested_email?: string | null
          revoked_at?: string | null
          status?: string
          token_hash?: string
          invited_by_user_id?: string
        }
        Relationships: []
      }
      care_access: {
        Row: {
          can_manage_medication: boolean
          can_record: boolean
          patient_id: string
          profile_email: string
        }
        Insert: {
          can_manage_medication?: boolean
          can_record?: boolean
          patient_id: string
          profile_email: string
        }
        Update: {
          can_manage_medication?: boolean
          can_record?: boolean
          patient_id?: string
          profile_email?: string
        }
        Relationships: [
          {
            foreignKeyName: "care_access_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "care_access_profile_email_fkey"
            columns: ["profile_email"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["email"]
          },
        ]
      }
      care_timeline_entries: {
        Row: {
          created_at: string
          created_by: string
          details: string
          event_type: string
          id: string
          medication_plan_id: string | null
          medication_plan_change_log_id: string | null
          medication_change_snapshot: Json | null
          occurred_at: string
          patient_id: string
          photo_paths: Json
          reassess_on: string | null
          title: string
        }
        Insert: {
          created_at?: string
          created_by: string
          details?: string
          event_type: string
          id?: string
          medication_plan_id?: string | null
          medication_plan_change_log_id?: string | null
          medication_change_snapshot?: Json | null
          occurred_at?: string
          patient_id: string
          photo_paths?: Json
          reassess_on?: string | null
          title: string
        }
        Update: {
          created_at?: string
          created_by?: string
          details?: string
          event_type?: string
          id?: string
          medication_plan_id?: string | null
          medication_plan_change_log_id?: string | null
          medication_change_snapshot?: Json | null
          occurred_at?: string
          patient_id?: string
          photo_paths?: Json
          reassess_on?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "care_timeline_entries_medication_plan_id_fkey"
            columns: ["medication_plan_id"]
            isOneToOne: false
            referencedRelation: "medication_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "care_timeline_entries_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "care_timeline_entries_medication_plan_change_log_id_fkey"
            columns: ["medication_plan_change_log_id"]
            isOneToOne: true
            referencedRelation: "medication_plan_change_logs"
            referencedColumns: ["id"]
          },
        ]
      }
      drug_product_aliases: {
        Row: {
          alias: string
          alias_type: string
          drug_product_id: string
          id: string
          is_verified: boolean
          normalized_alias: string
          source: string | null
        }
        Insert: {
          alias: string
          alias_type: string
          drug_product_id: string
          id?: string
          is_verified?: boolean
          normalized_alias: string
          source?: string | null
        }
        Update: {
          alias?: string
          alias_type?: string
          drug_product_id?: string
          id?: string
          is_verified?: boolean
          normalized_alias?: string
          source?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "drug_product_aliases_drug_product_id_fkey"
            columns: ["drug_product_id"]
            isOneToOne: false
            referencedRelation: "drug_products"
            referencedColumns: ["id"]
          },
        ]
      }
      drug_products: {
        Row: {
          chinese_name: string
          dosage_form: string | null
          english_name: string
          id: string
          ingredient_name: string
          manufacturer_name: string | null
          normalized_search_text: string
          source_updated_on: string | null
          synced_at: string
          tfda_license_number: string
          valid_until: string | null
        }
        Insert: {
          chinese_name: string
          dosage_form?: string | null
          english_name: string
          id?: string
          ingredient_name: string
          manufacturer_name?: string | null
          normalized_search_text: string
          source_updated_on?: string | null
          synced_at?: string
          tfda_license_number: string
          valid_until?: string | null
        }
        Update: {
          chinese_name?: string
          dosage_form?: string | null
          english_name?: string
          id?: string
          ingredient_name?: string
          manufacturer_name?: string | null
          normalized_search_text?: string
          source_updated_on?: string | null
          synced_at?: string
          tfda_license_number?: string
          valid_until?: string | null
        }
        Relationships: []
      }
      household_members: {
        Row: {
          created_at: string
          household_id: string
          role: string
          user_id: string
        }
        Insert: {
          created_at?: string
          household_id: string
          role: string
          user_id: string
        }
        Update: {
          created_at?: string
          household_id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "household_members_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      households: {
        Row: {
          created_at: string
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      legal_consents: {
        Row: {
          authorization_basis: string | null
          consent_type: string | null
          created_at: string
          health_consent_version: string | null
          health_consented_at: string | null
          oauth_provider: string
          privacy_acknowledged_at: string
          privacy_policy_version: string
          terms_accepted_at: string
          terms_version: string
          updated_at: string
          user_id: string
        }
        Insert: {
          authorization_basis?: string | null
          consent_type?: string | null
          created_at?: string
          health_consent_version?: string | null
          health_consented_at?: string | null
          oauth_provider?: string
          privacy_acknowledged_at: string
          privacy_policy_version: string
          terms_accepted_at: string
          terms_version: string
          updated_at?: string
          user_id: string
        }
        Update: {
          authorization_basis?: string | null
          consent_type?: string | null
          created_at?: string
          health_consent_version?: string | null
          health_consented_at?: string | null
          oauth_provider?: string
          privacy_acknowledged_at?: string
          privacy_policy_version?: string
          terms_accepted_at?: string
          terms_version?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      medication_intake_logs: {
        Row: {
          account_email: string
          care_date: string
          created_at: string
          dose_number: number
          id: string
          medication_id: string
          medication_name: string
          patient_id: string
          plan_id: string | null
          taken_at: string
          taken_on: string
        }
        Insert: {
          account_email: string
          care_date?: string
          created_at?: string
          dose_number?: number
          id?: string
          medication_id: string
          medication_name: string
          patient_id: string
          plan_id?: string | null
          taken_at?: string
          taken_on: string
        }
        Update: {
          account_email?: string
          care_date?: string
          created_at?: string
          dose_number?: number
          id?: string
          medication_id?: string
          medication_name?: string
          patient_id?: string
          plan_id?: string | null
          taken_at?: string
          taken_on?: string
        }
        Relationships: [
          {
            foreignKeyName: "medication_intake_logs_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "medication_intake_logs_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "medication_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      prn_medication_events: {
        Row: {
          care_date: string
          created_at: string
          dose_amount: number
          dose_unit: string
          effect_status: string
          id: string
          medication_id: string
          notes: string | null
          patient_id: string
          plan_id: string
          reason: string
          recorded_by_email: string
          recorded_by_user_id: string | null
          status: string
          taken_at: string
          void_reason: string | null
          voided_at: string | null
          voided_by_email: string | null
          voided_by_user_id: string | null
        }
        Insert: {
          care_date?: string
          created_at?: string
          dose_amount: number
          dose_unit: string
          effect_status?: string
          id?: string
          medication_id: string
          notes?: string | null
          patient_id: string
          plan_id: string
          reason: string
          recorded_by_email?: string
          recorded_by_user_id?: string | null
          status?: string
          taken_at?: string
          void_reason?: string | null
          voided_at?: string | null
          voided_by_email?: string | null
          voided_by_user_id?: string | null
        }
        Update: {
          care_date?: string
          created_at?: string
          dose_amount?: number
          dose_unit?: string
          effect_status?: string
          id?: string
          medication_id?: string
          notes?: string | null
          patient_id?: string
          plan_id?: string
          reason?: string
          recorded_by_email?: string
          recorded_by_user_id?: string | null
          status?: string
          taken_at?: string
          void_reason?: string | null
          voided_at?: string | null
          voided_by_email?: string | null
          voided_by_user_id?: string | null
        }
        Relationships: []
      }
      prn_medication_daily_assessments: {
        Row: {
          assessed_at: string | null
          assessed_by_email: string | null
          assessed_by_user_id: string | null
          care_date: string
          created_at: string
          id: string
          notes: string | null
          patient_id: string
          plan_id: string
          status: string
          updated_at: string
        }
        Insert: {
          assessed_at?: string | null
          assessed_by_email?: string | null
          assessed_by_user_id?: string | null
          care_date: string
          created_at?: string
          id?: string
          notes?: string | null
          patient_id: string
          plan_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          assessed_at?: string | null
          assessed_by_email?: string | null
          assessed_by_user_id?: string | null
          care_date?: string
          created_at?: string
          id?: string
          notes?: string | null
          patient_id?: string
          plan_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      medication_plan_change_logs: {
        Row: {
          action: string
          actor_email: string
          as_needed: boolean | null
          created_at: string
          dose_amount: number | null
          dose_count: number
          id: string
          medication_id: string
          patient_id: string
          plan_id: string | null
          reason: string | null
          actor_user_id: string | null
          before_snapshot: Json
          after_snapshot: Json
          recorded_at: string
          effective_at: string
          schedule_slot: string
        }
        Insert: {
          action: string
          actor_email: string
          as_needed?: boolean | null
          created_at?: string
          dose_amount?: number | null
          dose_count?: number
          id?: string
          medication_id: string
          patient_id: string
          plan_id?: string | null
          reason?: string | null
          actor_user_id?: string | null
          before_snapshot?: Json
          after_snapshot?: Json
          recorded_at?: string
          effective_at?: string
          schedule_slot: string
        }
        Update: {
          action?: string
          actor_email?: string
          as_needed?: boolean | null
          created_at?: string
          dose_amount?: number | null
          dose_count?: number
          id?: string
          medication_id?: string
          patient_id?: string
          plan_id?: string | null
          reason?: string | null
          actor_user_id?: string | null
          before_snapshot?: Json
          after_snapshot?: Json
          recorded_at?: string
          effective_at?: string
          schedule_slot?: string
        }
        Relationships: [
          {
            foreignKeyName: "medication_plan_change_logs_medication_id_fkey"
            columns: ["medication_id"]
            isOneToOne: false
            referencedRelation: "medications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "medication_plan_change_logs_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "medication_plan_change_logs_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "medication_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      medication_plans: {
        Row: {
          account_email: string
          active: boolean
          as_needed: boolean
          created_at: string
          display_order: number
          dose_amount: number
          dose_count: number
          id: string
          medication_id: string
          patient_id: string
          schedule_slot: string
        }
        Insert: {
          account_email: string
          active?: boolean
          as_needed?: boolean
          created_at?: string
          display_order?: number
          dose_amount?: number
          dose_count?: number
          id?: string
          medication_id: string
          patient_id: string
          schedule_slot: string
        }
        Update: {
          account_email?: string
          active?: boolean
          as_needed?: boolean
          created_at?: string
          display_order?: number
          dose_amount?: number
          dose_count?: number
          id?: string
          medication_id?: string
          patient_id?: string
          schedule_slot?: string
        }
        Relationships: [
          {
            foreignKeyName: "medication_plans_medication_id_fkey"
            columns: ["medication_id"]
            isOneToOne: false
            referencedRelation: "medications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "medication_plans_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      medications: {
        Row: {
          appearance_color: string | null
          appearance_note: string | null
          appearance_photo_url: string | null
          appearance_shape: string | null
          atc_code: string | null
          brand_name: string
          brand_name_id: string | null
          brand_name_zh: string | null
          catalog_source: string | null
          catalog_source_id: string | null
          created_at: string
          dosage_form: string
          drug_product_id: string | null
          generic_name: string
          id: string
          nhi_drug_code: string | null
          specialties: string[]
          strength_label: string | null
          strength_mg: number
          tfda_license_number: string | null
          verification_status: string
        }
        Insert: {
          appearance_color?: string | null
          appearance_note?: string | null
          appearance_photo_url?: string | null
          appearance_shape?: string | null
          atc_code?: string | null
          brand_name: string
          brand_name_id?: string | null
          brand_name_zh?: string | null
          catalog_source?: string | null
          catalog_source_id?: string | null
          created_at?: string
          dosage_form?: string
          drug_product_id?: string | null
          generic_name: string
          id: string
          nhi_drug_code?: string | null
          specialties?: string[]
          strength_label?: string | null
          strength_mg: number
          tfda_license_number?: string | null
          verification_status?: string
        }
        Update: {
          appearance_color?: string | null
          appearance_note?: string | null
          appearance_photo_url?: string | null
          appearance_shape?: string | null
          atc_code?: string | null
          brand_name?: string
          brand_name_id?: string | null
          brand_name_zh?: string | null
          catalog_source?: string | null
          catalog_source_id?: string | null
          created_at?: string
          dosage_form?: string
          drug_product_id?: string | null
          generic_name?: string
          id?: string
          nhi_drug_code?: string | null
          specialties?: string[]
          strength_label?: string | null
          strength_mg?: number
          tfda_license_number?: string | null
          verification_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "medications_drug_product_id_fkey"
            columns: ["drug_product_id"]
            isOneToOne: false
            referencedRelation: "drug_products"
            referencedColumns: ["id"]
          },
        ]
      }
      moa_animal_drugs: {
        Row: {
          dosage_form: string | null
          id: string
          indications: string | null
          ingredients: string | null
          license_number: string
          manufacturer_name: string | null
          name_en: string | null
          name_zh: string
          normalized_search_text: string
          synced_at: string
        }
        Insert: {
          dosage_form?: string | null
          id?: string
          indications?: string | null
          ingredients?: string | null
          license_number: string
          manufacturer_name?: string | null
          name_en?: string | null
          name_zh: string
          normalized_search_text: string
          synced_at?: string
        }
        Update: {
          dosage_form?: string | null
          id?: string
          indications?: string | null
          ingredients?: string | null
          license_number?: string
          manufacturer_name?: string | null
          name_en?: string | null
          name_zh?: string
          normalized_search_text?: string
          synced_at?: string
        }
        Relationships: []
      }
      nhi_tcm_products: {
        Row: {
          dosage_form: string | null
          id: string
          manufacturer_name: string | null
          name_zh: string
          nhi_code: string
          normalized_search_text: string
          specification: string | null
          synced_at: string
          type: string
        }
        Insert: {
          dosage_form?: string | null
          id?: string
          manufacturer_name?: string | null
          name_zh: string
          nhi_code: string
          normalized_search_text: string
          specification?: string | null
          synced_at?: string
          type: string
        }
        Update: {
          dosage_form?: string | null
          id?: string
          manufacturer_name?: string | null
          name_zh?: string
          nhi_code?: string
          normalized_search_text?: string
          specification?: string | null
          synced_at?: string
          type?: string
        }
        Relationships: []
      }
      patients: {
        Row: {
          archived_at: string | null
          care_recipient_type: string
          created_at: string
          display_name: string
          household_id: string
          id: string
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          care_recipient_type?: string
          created_at?: string
          display_name: string
          household_id: string
          id?: string
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          care_recipient_type?: string
          created_at?: string
          display_name?: string
          household_id?: string
          id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "patients_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          display_name: string | null
          email: string
          patient_id: string
        }
        Insert: {
          display_name?: string | null
          email: string
          patient_id: string
        }
        Update: {
          display_name?: string | null
          email?: string
          patient_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      tfda_drug_appearances: {
        Row: {
          appearance_image_url: string | null
          appearance_size: string | null
          chinese_name: string | null
          color: string | null
          english_name: string | null
          marking_1: string | null
          marking_2: string | null
          score: string | null
          shape: string | null
          special_dosage_form: string | null
          special_odor: string | null
          synced_at: string
          tfda_license_number: string
        }
        Insert: {
          appearance_image_url?: string | null
          appearance_size?: string | null
          chinese_name?: string | null
          color?: string | null
          english_name?: string | null
          marking_1?: string | null
          marking_2?: string | null
          score?: string | null
          shape?: string | null
          special_dosage_form?: string | null
          special_odor?: string | null
          synced_at?: string
          tfda_license_number: string
        }
        Update: {
          appearance_image_url?: string | null
          appearance_size?: string | null
          chinese_name?: string | null
          color?: string | null
          english_name?: string | null
          marking_1?: string | null
          marking_2?: string | null
          score?: string | null
          shape?: string | null
          special_dosage_form?: string | null
          special_odor?: string | null
          synced_at?: string
          tfda_license_number?: string
        }
        Relationships: []
      }
      user_settings: {
        Row: {
          created_at: string
          medication_name_english_first: boolean
          medication_slots_expanded: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          medication_name_english_first?: boolean
          medication_slots_expanded?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          medication_name_english_first?: boolean
          medication_slots_expanded?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_patient_care_preferences: {
        Row: {
          created_at: string
          patient_id: string
          show_blood_pressure: boolean
          show_medication: boolean
          show_nutrition: boolean
          show_temperature: boolean
          show_weight: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          patient_id: string
          show_blood_pressure?: boolean
          show_medication?: boolean
          show_nutrition?: boolean
          show_temperature?: boolean
          show_weight?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          patient_id?: string
          show_blood_pressure?: boolean
          show_medication?: boolean
          show_nutrition?: boolean
          show_temperature?: boolean
          show_weight?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      patient_daily_care_preferences: {
        Row: {
          created_at: string
          patient_id: string
          show_blood_pressure: boolean
          show_medication: boolean
          show_nutrition: boolean
          show_temperature: boolean
          show_weight: boolean
          updated_at: string
        }
        Insert: {
          created_at?: string
          patient_id: string
          show_blood_pressure?: boolean
          show_medication?: boolean
          show_nutrition?: boolean
          show_temperature?: boolean
          show_weight?: boolean
          updated_at?: string
        }
        Update: {
          created_at?: string
          patient_id?: string
          show_blood_pressure?: boolean
          show_medication?: boolean
          show_nutrition?: boolean
          show_temperature?: boolean
          show_weight?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      weight_records: {
        Row: {
          created_at: string
          id: string
          measured_at: string
          measured_on: string
          patient_id: string
          profile_email: string
          recorded_by: string
          weight_kg: number
        }
        Insert: {
          created_at?: string
          id?: string
          measured_at?: string
          measured_on: string
          patient_id: string
          profile_email: string
          recorded_by: string
          weight_kg: number
        }
        Update: {
          created_at?: string
          id?: string
          measured_at?: string
          measured_on?: string
          patient_id?: string
          profile_email?: string
          recorded_by?: string
          weight_kg?: number
        }
        Relationships: []
      }
      patient_weight_measurement_records: {
        Row: {
          created_at: string
          id: string
          measured_at: string
          measured_on: string
          measurement_number: number
          patient_id: string
          profile_email: string
          recorded_by: string
          weight_kg: number
        }
        Insert: {
          created_at?: string
          id?: string
          measured_at?: string
          measured_on: string
          measurement_number?: number
          patient_id: string
          profile_email: string
          recorded_by: string
          weight_kg: number
        }
        Update: {
          created_at?: string
          id?: string
          measured_at?: string
          measured_on?: string
          measurement_number?: number
          patient_id?: string
          profile_email?: string
          recorded_by?: string
          weight_kg?: number
        }
        Relationships: []
      }
      weight_settings: {
        Row: {
          enabled: boolean
          patient_id: string
          profile_email: string
          updated_at: string
        }
        Insert: {
          enabled?: boolean
          patient_id: string
          profile_email: string
          updated_at?: string
        }
        Update: {
          enabled?: boolean
          patient_id?: string
          profile_email?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      approve_caregiver_invitation: {
        Args: { p_invitation_id: string }
        Returns: boolean
      }
      add_household_care_recipient: {
        Args: { p_care_recipient_type: string; p_display_name: string }
        Returns: string
      }
      accept_patient_care_invitation: {
        Args: { p_invitation_id: string }
        Returns: string
      }
      create_household_patient_invitation: {
        Args: { p_authorization_basis: string; p_display_name: string; p_invited_email: string }
        Returns: Json
      }
      claim_patient_care_invitation_share: {
        Args: { p_token_hash: string }
        Returns: boolean
      }
      create_caregiver_invitation: {
        Args: { p_can_manage_medication: boolean; p_can_record: boolean; p_invited_email: string; p_patient_id: string }
        Returns: Json
      }
      decline_patient_care_invitation: {
        Args: { p_invitation_id: string }
        Returns: boolean
      }
      fetch_household_patient_invitations: {
        Args: never
        Returns: {
          created_at: string
          display_name: string
          expires_at: string
          invitation_id: string
          invited_email: string
          patient_id: string
          revoked_at: string | null
          status: string
        }[]
      }
      revoke_household_patient_invitation: {
        Args: { p_invitation_id: string }
        Returns: boolean
      }
      add_household_member: {
        Args: { p_email: string; p_role?: string }
        Returns: Json
      }
      add_household_patient: {
        Args: { p_display_name: string }
        Returns: string
      }
      apply_medication_plan_change:
        | {
            Args: {
              p_action: string
              p_appearance_color: string
              p_appearance_photo_url: string
              p_appearance_shape: string
              p_as_needed: boolean
              p_brand_name: string
              p_brand_name_zh: string
              p_catalog_source?: string
              p_catalog_source_id?: string
              p_dosage_form: string
              p_dose_amount: number
              p_dose_count: number
              p_effective_at?: string
              p_generic_name: string
              p_medication_id: string
              p_patient_id: string
              p_plan_id: string
              p_reason: string
              p_schedule_slot: string
              p_strength_mg: number
            }
            Returns: undefined
          }
        | {
            Args: {
              p_account_email: string
              p_action: string
              p_as_needed: boolean
              p_brand_name: string
              p_dosage_form: string
              p_dose_amount: number
              p_dose_count: number
              p_generic_name: string
              p_medication_id: string
              p_plan_id: string
              p_reason: string
              p_schedule_slot: string
              p_strength_mg: number
              p_subject: string
            }
            Returns: undefined
          }
      archive_household_pet: {
        Args: { p_patient_id: string }
        Returns: undefined
      }
      auto_provision_profile: { Args: never; Returns: Json }
      begin_household_onboarding: {
        Args: { p_household_name: string; p_patient_name: string }
        Returns: {
          household_id: string
          patient_id: string
        }[]
      }
      begin_household_onboarding_v2: {
        Args: { p_payload: Json }
        Returns: Json
      }
      create_medication_plan:
        | {
            Args: {
              p_account_email: string
              p_as_needed: boolean
              p_brand_name: string
              p_display_order: number
              p_dosage_form: string
              p_dose_amount: number
              p_dose_count: number
              p_generic_name: string
              p_medication_id: string
              p_schedule_slot: string
              p_strength_mg: number
            }
            Returns: undefined
          }
        | {
            Args: {
              p_account_email: string
              p_as_needed: boolean
              p_brand_name: string
              p_display_order: number
              p_dosage_form: string
              p_dose_amount: number
              p_dose_count: number
              p_generic_name: string
              p_medication_id: string
              p_schedule_slot: string
              p_strength_mg: number
              p_subject: string
            }
            Returns: undefined
          }
      current_account_daily_limit: {
        Args: { p_actor_email?: string; p_fallback: number; p_metric: string }
        Returns: number
      }
      record_meal_item: {
        Args: { p_patient_id: string; p_meal_type: string; p_occurred_at: string; p_food_name: string; p_serving_label: string; p_quantity: number; p_calories_kcal: number; p_calorie_basis?: string }
        Returns: string
      }
      search_patient_food_catalog: {
        Args: { p_patient_id: string; p_query: string; p_limit?: number }
        Returns: { id: string; display_name: string; brand_name: string | null; default_serving_label: string; default_calories_kcal: number | null; source: string; score: number; is_possible_match: boolean }[]
      }
      delete_user_account: { Args: never; Returns: boolean }
      fetch_current_household_role: { Args: never; Returns: string }
      fetch_caregiver_invitations: {
        Args: never
        Returns: {
          accepted_at: string | null
          can_manage_medication: boolean
          can_record: boolean
          created_at: string
          access_active: boolean
          expires_at: string
          invitation_id: string
          invited_email: string | null
          patient_display_name: string
          patient_id: string
          requested_email: string | null
          revoked_at: string | null
          status: string
        }[]
      }
      fetch_pending_caregiver_invitations: {
        Args: never
        Returns: {
          can_manage_medication: boolean
          can_record: boolean
          created_at: string
          expires_at: string
          invitation_id: string
          invited_email: string
          patient_display_name: string
          status: string
        }[]
      }
      request_caregiver_invitation_by_id: {
        Args: { p_invitation_id: string }
        Returns: boolean
      }
      fetch_pending_patient_care_invitations: {
        Args: never
        Returns: {
          authorization_basis: string
          created_at: string
          display_name: string
          invitation_id: string
          inviter_display_name: string | null
          inviter_email: string
          patient_id: string
        }[]
      }
      fetch_household_archived_pets: {
        Args: never
        Returns: {
          care_recipient_type: string
          display_name: string
          patient_id: string
        }[]
      }
      fetch_household_management_patients: {
        Args: never
        Returns: {
          display_name: string
          patient_id: string
        }[]
      }
      fetch_household_members: {
        Args: never
        Returns: {
          created_at: string
          display_name: string
          email: string
          role: string
          user_id: string
        }[]
      }
      fetch_household_patient_access: {
        Args: never
        Returns: {
          can_manage_medication: boolean
          can_record: boolean
          patient_id: string
          profile_email: string
        }[]
      }
      fetch_household_pets: {
        Args: never
        Returns: {
          care_recipient_type: string
          display_name: string
          patient_id: string
        }[]
      }
      request_caregiver_invitation: {
        Args: { p_token_hash: string }
        Returns: Json
      }
      revoke_caregiver_access: {
        Args: { p_patient_id: string; p_profile_email: string }
        Returns: boolean
      }
      revoke_caregiver_invitation: {
        Args: { p_invitation_id: string }
        Returns: boolean
      }
      is_household_member: {
        Args: { p_household_id: string }
        Returns: boolean
      }
      normalize_drug_product_query: { Args: { value: string }; Returns: string }
      record_account_legal_acceptance: {
        Args: never
        Returns: {
          authorization_basis: string | null
          consent_type: string | null
          created_at: string
          health_consent_version: string | null
          health_consented_at: string | null
          oauth_provider: string
          privacy_acknowledged_at: string
          privacy_policy_version: string
          terms_accepted_at: string
          terms_version: string
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "legal_consents"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      record_health_data_consent: {
        Args: { p_authorization_basis?: string; p_consent_type: string }
        Returns: {
          authorization_basis: string | null
          consent_type: string | null
          created_at: string
          health_consent_version: string | null
          health_consented_at: string | null
          oauth_provider: string
          privacy_acknowledged_at: string
          privacy_policy_version: string
          terms_accepted_at: string
          terms_version: string
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "legal_consents"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      refresh_official_medication_appearances: { Args: never; Returns: number }
      remove_household_member: { Args: { p_user_id: string }; Returns: boolean }
      search_drug_products: {
        Args: { p_limit?: number; p_query: string }
        Returns: {
          chinese_name: string
          dosage_form: string
          english_name: string
          id: string
          ingredient_name: string
          is_possible_match: boolean
          manufacturer_name: string
          score: number
          tfda_license_number: string
        }[]
      }
      search_moa_animal_drugs: {
        Args: { p_limit?: number; p_query: string }
        Returns: {
          dosage_form: string
          id: string
          indications: string
          ingredients: string
          is_possible_match: boolean
          license_number: string
          manufacturer_name: string
          name_en: string
          name_zh: string
          score: number
        }[]
      }
      search_nhi_tcm_products: {
        Args: { p_limit?: number; p_query: string }
        Returns: {
          dosage_form: string
          id: string
          is_possible_match: boolean
          manufacturer_name: string
          name_zh: string
          nhi_code: string
          score: number
          specification: string
          type: string
        }[]
      }
      set_household_patient_access: {
        Args: {
          p_can_manage_medication: boolean
          p_can_record: boolean
          p_patient_id: string
          p_profile_email: string
        }
        Returns: undefined
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
    }
    Enums: {
      [_ in never]: never
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
