/*
檔案用途：彙整各領域 Row/Insert/Update 型別為 Supabase 風格的 Database 介面。
所在層：src/types/database 領域型別層；由 src/types/database.ts 統一 re-export。
主要關聯：手寫的資料契約 Database 型別，供需要 table-shape 型別的呼叫端使用；
不是 src/lib/database.types.ts（Supabase CLI 產生的型別快照，是另一份獨立檔案）。
*/
import type { BpRecord, BpInsert } from './bloodPressure'
import type { TemperatureRecord, TemperatureInsert, WeightRecord, PatientWeightMeasurementRecord, WeightSetting } from './vitals'
import type {
  MedicationIntakeLog,
  MedicationIntakeInsert,
  PrnMedicationEvent,
  PrnMedicationEventInsert,
  PrnMedicationDailyAssessment,
  PrnMedicationDailyAssessmentInsert,
  MedicationCatalog,
  MedicationPlan,
  MedicationPlanChangeLog,
  PatientMedicationInstruction,
  PatientMedicationInstructionInsert,
  PatientMedicationAppearanceOverride,
  PatientMedicationAppearanceOverrideInsert,
} from './medication'
import type { CareTimelineEntry } from './careEvents'
import type { MealFoodCatalogItem, MealRecord, MealRecordItem } from './nutrition'
import type { UserPatientCarePreference, ActivePatientPreference } from './preferences'

export interface Database {
  public: {
    Tables: {
      blood_pressure_records: {
        Row: BpRecord
        Insert: BpInsert
        Update: Partial<BpInsert>
        Relationships: []
      }
      body_temperature_records: {
        Row: TemperatureRecord
        Insert: TemperatureInsert
        Update: Partial<Omit<TemperatureInsert, 'patient_id' | 'recorded_by'>>
        Relationships: []
      }
      medication_intake_logs: {
        Row: MedicationIntakeLog
        Insert: MedicationIntakeInsert
        Update: Partial<MedicationIntakeInsert>
        Relationships: []
      }
      prn_medication_events: {
        Row: PrnMedicationEvent
        Insert: PrnMedicationEventInsert
        Update: Partial<Pick<PrnMedicationEvent, 'status' | 'void_reason'>>
        Relationships: []
      }
      prn_medication_daily_assessments: {
        Row: PrnMedicationDailyAssessment
        Insert: PrnMedicationDailyAssessmentInsert
        Update: Partial<Pick<PrnMedicationDailyAssessment, 'status' | 'notes'>>
        Relationships: []
      }
      medications: {
        Row: MedicationCatalog
        Insert: Omit<MedicationCatalog, 'created_at'>
        Update: Partial<Omit<MedicationCatalog, 'created_at'>>
        Relationships: []
      }
      medication_plans: {
        Row: MedicationPlan
        Insert: Omit<MedicationPlan, 'created_at'>
        Update: Partial<Omit<MedicationPlan, 'created_at'>>
        Relationships: []
      }
      medication_plan_change_logs: {
        Row: MedicationPlanChangeLog
        Insert: Omit<MedicationPlanChangeLog, 'id' | 'created_at'>
        Update: never
        Relationships: []
      }
      patient_medication_instructions: {
        Row: PatientMedicationInstruction
        Insert: PatientMedicationInstructionInsert
        // updated_by／updated_at 由 trigger 強制覆寫，前端更新時只能改代碼、備註、來源與確認日期。
        Update: Partial<Omit<PatientMedicationInstructionInsert, 'patient_id' | 'medication_id'>>
        Relationships: []
      }
      patient_medication_appearance_overrides: {
        Row: PatientMedicationAppearanceOverride
        Insert: PatientMedicationAppearanceOverrideInsert
        // updated_by／updated_at 由 trigger 強制覆寫，前端更新時只能改外觀四欄。
        Update: Partial<Omit<PatientMedicationAppearanceOverrideInsert, 'patient_id' | 'medication_id'>>
        Relationships: []
      }
      care_timeline_entries: {
        Row: CareTimelineEntry
        Insert: Omit<CareTimelineEntry, 'id' | 'created_at'>
        // 事件可更正內容，但資料庫 trigger 會鎖住病人、建立者與建立時間等稽核欄位。
        Update: Partial<Omit<CareTimelineEntry, 'id' | 'patient_id' | 'created_by' | 'created_at'>>
        Relationships: []
      }
      meal_food_catalog_items: {
        Row: MealFoodCatalogItem
        Insert: Omit<MealFoodCatalogItem, 'id' | 'created_at' | 'updated_at' | 'last_used_at' | 'use_count'>
        Update: Partial<Omit<MealFoodCatalogItem, 'id' | 'patient_id' | 'created_by' | 'created_at'>>
        Relationships: []
      }
      meal_records: {
        Row: MealRecord
        Insert: Omit<MealRecord, 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Omit<MealRecord, 'id' | 'patient_id' | 'recorded_by' | 'created_at'>>
        Relationships: []
      }
      meal_record_items: {
        Row: MealRecordItem
        Insert: Omit<MealRecordItem, 'id' | 'created_at'>
        Update: Partial<Omit<MealRecordItem, 'id' | 'patient_id' | 'meal_record_id'>>
        Relationships: []
      }
      weight_records: {
        Row: WeightRecord
        Insert: Omit<WeightRecord, 'id' | 'created_at'>
        Update: Partial<Omit<WeightRecord, 'id' | 'created_at'>>
        Relationships: []
      }
      patient_weight_measurement_records: {
        Row: PatientWeightMeasurementRecord
        Insert: Omit<PatientWeightMeasurementRecord, 'id' | 'created_at'>
        Update: Partial<Omit<PatientWeightMeasurementRecord, 'id' | 'created_at'>>
        Relationships: []
      }
      weight_settings: {
        Row: WeightSetting
        Insert: Omit<WeightSetting, 'updated_at'> & { updated_at?: string }
        Update: Partial<Omit<WeightSetting, 'profile_email'>>
        Relationships: []
      }
      user_patient_care_preferences: {
        Row: UserPatientCarePreference
        Insert: Omit<UserPatientCarePreference, 'created_at' | 'updated_at'> & { created_at?: string; updated_at?: string }
        Update: Partial<Omit<UserPatientCarePreference, 'user_id' | 'patient_id' | 'created_at'>>
        Relationships: []
      }
      active_patient_preferences: {
        Row: ActivePatientPreference
        Insert: Omit<ActivePatientPreference, 'updated_at'> & { updated_at?: string }
        Update: Partial<Omit<ActivePatientPreference, 'profile_email'>>
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}
