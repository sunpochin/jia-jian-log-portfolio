/*
檔案用途：定義前端讀寫 Supabase 資料表的 TypeScript 型別與生命徵象規則型別。
所在層：src/types 共用資料契約層；不包含資料庫連線或畫面邏輯。
主要關聯：components、hooks 與 lib 以此維持血壓、體溫、體重、藥單及照護事件資料一致。
*/
export interface BpRecord {
  id: string
  systolic: number
  diastolic: number
  pulse: number | null
  measured_at: string
  source: string
  recorded_by: string | null
  // 血壓資料的 canonical 對象識別；舊離線快取可能沒有此欄位，所以讀取型別仍保留可空。
  patient_id: string | null
  recorded_by_user_id?: string | null
  created_at: string
}

export type BpInsert = Omit<BpRecord, 'id' | 'created_at'>

export type TemperatureSite = 'ear' | 'forehead' | 'oral' | 'axillary'
export type TemperatureContext = 'symptoms' | 'after_medication' | 'routine'

export interface TemperatureRecord {
  id: string
  temperature_c: number
  measurement_site: TemperatureSite
  context: TemperatureContext
  notes: string | null
  measured_at: string
  source: string
  recorded_by: string | null
  patient_id: string
  created_at: string
}

export type TemperatureInsert = Omit<TemperatureRecord, 'id' | 'created_at'>

export interface MedicationIntakeLog {
  id: string
  account_email: string
  patient_id: string
  medication_id: string
  medication_name: string
  plan_id: string | null
  dose_number: number
  // 照護日是每日待辦的分組鍵；保留可空以讀取尚未完成資料庫 migration 的離線快取。
  care_date?: string | null
  taken_on: string
  taken_at: string
  created_at: string
}

export type MedicationIntakeInsert = Omit<MedicationIntakeLog, 'id' | 'created_at'>

export type PrnMedicationEventStatus = 'active' | 'voided'
export type PrnMedicationEffectStatus = 'pending' | 'helped' | 'not_helped' | 'unknown'

export interface PrnMedicationEvent {
  id: string
  patient_id: string
  plan_id: string
  medication_id: string
  taken_at: string
  care_date: string
  dose_amount: number
  dose_unit: string
  reason: string
  effect_status: PrnMedicationEffectStatus
  notes: string | null
  recorded_by_user_id: string | null
  recorded_by_email: string
  status: PrnMedicationEventStatus
  voided_at: string | null
  voided_by_user_id: string | null
  voided_by_email: string | null
  void_reason: string | null
  created_at: string
}

export type PrnMedicationEventInsert = Omit<PrnMedicationEvent, 'created_at' | 'recorded_by_user_id' | 'recorded_by_email' | 'status' | 'voided_at' | 'voided_by_user_id' | 'voided_by_email' | 'void_reason'> & {
  recorded_by_user_id?: string | null
  recorded_by_email?: string
  status?: PrnMedicationEventStatus
}

export type PrnMedicationAssessmentStatus = 'not_assessed' | 'not_needed'

export interface PrnMedicationDailyAssessment {
  id: string
  patient_id: string
  plan_id: string
  care_date: string
  status: PrnMedicationAssessmentStatus
  notes: string | null
  assessed_at: string | null
  assessed_by_user_id: string | null
  assessed_by_email: string | null
  created_at: string
  updated_at: string
}

export type PrnMedicationDailyAssessmentInsert = Omit<PrnMedicationDailyAssessment, 'id' | 'created_at' | 'updated_at' | 'assessed_at' | 'assessed_by_user_id' | 'assessed_by_email'>

export interface WeightRecord {
  id: string
  patient_id: string
  profile_email: string
  weight_kg: number
  measured_on: string
  measured_at: string
  recorded_by: string
  created_at: string
}

export interface PatientWeightMeasurementRecord extends WeightRecord {
  measurement_number: 1 | 2 | 3 | 4
}

export interface CareEventPhotoAttachment {
  path: string
  thumbnail_path: string
  // signed URL 只存在當次畫面，不是資料庫欄位；避免把會過期的網址寫回 JSONB。
  thumbnailUrl?: string
}

export type StoredCareEventPhoto = Omit<CareEventPhotoAttachment, 'thumbnailUrl'>

export type CareTimelineEventType =
  | 'doctor_instruction'
  | 'medication_change'
  | 'family_observation'
  | 'reassessment'
  | 'health_visit'
  | 'incident'
  | 'milestone'
  | 'care_note'
  | 'vaccination'
  | 'symptom_observation'
  | 'diet_change'

export interface CareTimelineEntry {
  id: string
  patient_id: string
  event_type: CareTimelineEventType
  title: string
  details: string
  occurred_at: string
  reassess_on: string | null
  created_by: string
  created_at: string
  medication_plan_id: string | null
  medication_plan_change_log_id?: string | null
  medication_change_snapshot?: MedicationChangeSnapshot | null
  photo_paths?: CareEventPhotoAttachment[]
}

export interface MedicationPlanSnapshot {
  plan_id: string
  medication_id: string
  schedule_slot: string
  dose_amount: number | null
  dose_count: number | null
  as_needed: boolean | null
  active: boolean
  brand_name?: string | null
  brand_name_zh?: string | null
  generic_name?: string | null
  strength_mg?: number | null
  strength_label?: string | null
  dosage_form?: string | null
}

export interface MedicationChangeSnapshot {
  action: 'create' | 'update' | 'deactivate'
  before: Partial<MedicationPlanSnapshot>
  after: Partial<MedicationPlanSnapshot>
  reason?: string | null
  recorded_at?: string
  effective_at?: string
}

export interface WeightSetting {
  patient_id: string
  profile_email: string
  enabled: boolean
  updated_at: string
}

export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack'
export type CalorieBasis = 'user_entered' | 'label' | 'estimate' | 'unknown'

export interface MealFoodCatalogItem {
  id: string
  patient_id: string
  display_name: string
  brand_name: string | null
  normalized_search_text: string
  default_serving_label: string
  default_calories_kcal: number | null
  source: 'manual' | 'photo_label' | 'photo_estimate'
  last_used_at: string
  use_count: number
  created_by: string
  created_at: string
  updated_at: string
}

export interface MealRecord {
  id: string
  patient_id: string
  meal_type: MealType
  occurred_at: string
  notes: string | null
  source: 'manual' | 'photo_assisted'
  recorded_by: string
  created_at: string
  updated_at: string
}

export interface MealRecordItem {
  id: string
  meal_record_id: string
  patient_id: string
  food_catalog_item_id: string | null
  food_name_snapshot: string
  serving_label_snapshot: string
  quantity: number
  calories_kcal: number | null
  calorie_basis: CalorieBasis
  created_at: string
}

export interface ActivePatientPreference {
  profile_email: string
  patient_id: string
  updated_at: string
}

// 這是帳號在特定病人畫面上的顯示偏好，不是健康資料，也不能取代 care_access。
export interface UserPatientCarePreference {
  user_id: string
  patient_id: string
  show_blood_pressure: boolean
  show_temperature: boolean
  show_medication: boolean
  show_nutrition: boolean
  show_weight: boolean
  created_at: string
  updated_at: string
}

// 這是被照顧者共用的每日照護入口偏好；它不是健康資料，也不能取代 care_access。
export interface PatientDailyCarePreference {
  patient_id: string
  show_blood_pressure: boolean
  show_temperature: boolean
  show_medication: boolean
  show_nutrition: boolean
  show_weight: boolean
  created_at: string
  updated_at: string
}

// 以下寵物慢性病型別對應 supabase/migrations 的實際資料表欄位；
// 液體管理與消化健康是「一天一筆」（UNIQUE patient_id+recorded_date），食慾、點滴、胰島素、血糖是可一天多筆的時間戳紀錄。
export interface PetLiquidIntakeRecord {
  id: string
  patient_id: string
  recorded_date: string
  water_intake_ml: number | null
  urination_count: number | null
  litter_box_urine_clumps: number | null
  notes: string | null
  recorded_by: string
  created_at: string
  updated_at: string
}

export interface PetDigestionRecord {
  id: string
  patient_id: string
  recorded_date: string
  vomiting_count: number | null
  defecation_count: number | null
  stool_score: 1 | 2 | 3 | 4 | 5 | null
  notes: string | null
  recorded_by: string
  created_at: string
  updated_at: string
}

export interface PetAppetiteRecord {
  id: string
  patient_id: string
  recorded_at: string
  appetite_percent: number
  meal_type: MealType
  notes: string | null
  recorded_by: string
  created_at: string
}

export interface PetSubcutaneousFluidRecord {
  id: string
  patient_id: string
  administered_at: string
  fluid_volume_ml: number
  infusion_rate: string | null
  injection_site: string | null
  notes: string | null
  administered_by: string
  created_at: string
  updated_at: string
}

export interface PetInsulinRecord {
  id: string
  patient_id: string
  administered_at: string
  insulin_units: number
  insulin_type: string | null
  injection_site: string | null
  notes: string | null
  administered_by: string
  created_at: string
  updated_at: string
}

export interface PetBloodGlucoseRecord {
  id: string
  patient_id: string
  measured_at: string
  glucose_mg_dl: number
  measurement_context: 'fasting' | 'before_meal' | 'after_meal' | 'random' | null
  notes: string | null
  recorded_by: string
  created_at: string
}

// 血糖判讀門檻與紀錄同樣以 patient_id 分區；不能把登入者或目前頁籤當成被照護者。
export interface PetBloodGlucoseTargetRange {
  patient_id: string
  low_mg_dl: number
  high_mg_dl: number
  updated_by: string
  created_at: string
  updated_at: string
}

export interface DementiaCareRecord {
  id: string
  patient_id: string
  record_type: 'agitation' | 'day_night_reversal' | 'wandering_risk'
  time_period: 'morning' | 'afternoon' | 'evening' | 'night' | null
  notes: string | null
  occurred_at: string
  recorded_by: string
  created_at: string
}

export type FluidBalanceRecordType = 'meal_intake' | 'water_intake' | 'urination' | 'bowel_movement'

export interface FluidBalanceRecord {
  id: string
  patient_id: string
  record_type: FluidBalanceRecordType
  // 便當攝取量只有這種型態會用到前後秤重；其餘型態一律是 null。
  weight_before_g: number | null
  weight_after_g: number | null
  // 便當攝取量＝公克、喝水量／尿量＝毫升；大便沒有數量，一律是 null。
  amount_value: number | null
  notes: string | null
  occurred_at: string
  recorded_by: string
  created_at: string
}

export interface MedicationCatalog {
  id: string
  // 官方主檔與照護藥單分開保存，避免同步公開資料時改掉既有 plan 所依賴的文字 ID。
  drug_product_id: string | null
  brand_name: string
  brand_name_zh: string | null
  brand_name_id?: string | null
  generic_name: string
  strength_mg: number
  strength_label?: string | null
  dosage_form: string
  specialties: string[]
  verification_status: 'official' | 'manually_verified' | 'unverified'
  tfda_license_number: string | null
  nhi_drug_code: string | null
  appearance_note: string | null
  appearance_color: string | null
  appearance_shape: string | null
  appearance_photo_url: string | null
  // 由 refresh_official_medication_atc() 從 TFDA ATC 分類公開資料回填；只有官方連結藥品才有值。
  // 顯示時交給 lib/medicationAtcCategories.ts 轉成雙語「主要功能」標籤，不在這裡存翻譯文字。
  atc_code?: string | null
  // 支援多層藥品資料庫 (Layer 1 人類藥 / Layer 2 動物藥 / Layer 3 跨物種對應) 與適用/禁用物種標示
  medication_category?: 'human' | 'animal' | 'dual'
  applicable_species?: string[]
  contraindicated_species?: string[]
  animal_drug_license_number?: string | null
  indications?: string | null
  manufacturer?: string | null
  created_at: string
}

export interface MedicationPlan {
  id: string
  account_email: string
  patient_id: string
  medication_id: string
  schedule_slot: string
  as_needed: boolean
  dose_amount: number
  dose_count: number
  display_order: number
  active: boolean
  created_at: string
}

export interface MedicationPlanChangeLog {
  id: string
  patient_id: string
  action: 'create' | 'update' | 'deactivate'
  plan_id: string | null
  medication_id: string
  schedule_slot: string
  dose_amount: number | null
  dose_count: number
  as_needed: boolean | null
  reason: string | null
  actor_email: string
  actor_user_id?: string | null
  before_snapshot: Partial<MedicationPlanSnapshot>
  after_snapshot: Partial<MedicationPlanSnapshot>
  recorded_at: string
  effective_at: string
  created_at: string
}

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

import spec from '../config/blood-pressure-spec.json'
import type { LocalizedText } from '../lib/i18n'

export type AlertLevel = 'normal' | 'warning' | 'danger' | 'warning-low' | 'danger-low'

interface BpCondition {
  gte?: number
  lt?: number
  // 將 range 的型別改為 number[]，是為了相容 TypeScript 自動解析 JSON 規格檔時推導出的陣列型別，避免編譯錯誤。
  range?: number[]
}

// 匯出此介面是為了讓前端 UI（如 InputPage 與 Dashboard）可以直接讀取匹配規則的雙語狀態名稱及臨床建議動作。
export interface BpRule {
  key: string
  // 將 conditions 與 operator 設為可選，因為預設規則（defaultRule）中沒有這些欄位，如果不設為可選，
  // 或是直接轉型為 BpRule，TypeScript 會因為兩者屬性不重合而拋出編譯錯誤。
  conditions?: {
    systolic?: BpCondition
    diastolic?: BpCondition
  }
  operator?: string
  labels: LocalizedText
  recommendations: LocalizedText
  webAlertLevel: string
}

export interface ReadingEvaluation {
  level: AlertLevel
  labels: BpRule['labels']
  recommendations: BpRule['recommendations']
  pulseWarning: boolean
  bpRule: BpRule
}

function evaluateCondition(val: number, cond?: BpCondition): boolean {
  if (!cond) return false
  if (cond.gte !== undefined && val >= cond.gte) return true
  if (cond.lt !== undefined && val < cond.lt) return true
  // 雖然將 range 的型別改為 number[] 以符合編譯，但因為商業邏輯上 range 一定是長度為 2 的陣列（[最小值, 最大值]），
  // 所以在評估時我們仍預期讀取 index 0 與 1。
  if (cond.range !== undefined && val >= cond.range[0] && val <= cond.range[1]) return true
  return false
}

// 匯出 evaluateBp 函數，讓網頁版除了判斷警報級別 (AlertLevel) 之外，也能動態解析出對應的 9 級客製化規則與臨床處置建議。
export function evaluateBp(sys: number, dia: number): BpRule {
  // 走訪規格中的規則，找出匹配的血壓級別
  for (const rule of spec.rules) {
    // 由於從 JSON 檔案中解析出來的 rule 欄位型別較為寬鬆，故在傳入 evaluateCondition 時，
    // 需要手動轉型為 BpCondition | undefined 以配合 strict 型別檢查。
    const sysMatch = evaluateCondition(sys, rule.conditions.systolic as BpCondition | undefined)
    const diaMatch = evaluateCondition(dia, rule.conditions.diastolic as BpCondition | undefined)
    
    const isMatch = rule.operator === 'or' 
      ? (sysMatch || diaMatch) 
      : (sysMatch && diaMatch)
      
    if (isMatch) {
      return rule as unknown as BpRule
    }
  }
  return spec.defaultRule as unknown as BpRule
}

// Mother has a history of hypotension and osteoporosis: low diastolic risks
// myocardial infarction (coronary perfusion happens during diastole) and a
// low-BP dizzy spell risks a fall. This function used to only check the high
// side, so a reading like 85/48 silently showed "normal" — see ROADMAP.md P0.1.
// Low-side thresholds mirror the danger-low/warning-low bands in
// appscript/blood_pressure_bot_docs.md.
export function evaluateReading(systolic: number, diastolic: number, pulse?: number | null): ReadingEvaluation {
  const rule = evaluateBp(systolic, diastolic)
  const bpLevel = rule.webAlertLevel as AlertLevel
  const pulseWarning = pulse != null && pulse > 120
  // 危險血壓必須優先於心跳警示，否則「明顯偏低 + 心跳快」會被降成一般橘色提醒。
  const level = bpLevel === 'danger' || bpLevel === 'danger-low'
    ? bpLevel
    : pulseWarning
      ? 'warning'
      : bpLevel

  if (!pulseWarning) {
    return { level, labels: rule.labels, recommendations: rule.recommendations, pulseWarning, bpRule: rule }
  }

  const pulseLabels = { id: '⚠️ Denyut jantung >120', zh: '⚠️ 心跳 >120', en: '⚠️ Heartbeat > 120' }
  const pulseRecommendations = {
    id: 'Istirahat sebentar lalu ukur ulang; hubungi keluarga jika tetap tinggi.',
    zh: '請先休息再重測；若仍偏高，請通知家屬。',
   en: 'Rest briefly, measure again, and contact your family if it remains high.',
  }
  // 血壓本身也被標記時要同時保留兩個事實，避免報告只顯示其中一項而讓醫師誤讀。
  const hasBpFlag = bpLevel !== 'normal'
  return {
    level,
    labels: hasBpFlag
      ? { id: `${rule.labels.id}; ${pulseLabels.id}`, zh: `${rule.labels.zh}；${pulseLabels.zh}`, en: `${rule.labels.en}; ${pulseLabels.en}` }
      : pulseLabels,
    recommendations: hasBpFlag
      ? {
          id: [rule.recommendations.id, pulseRecommendations.id].filter(Boolean).join(' '),
          zh: [rule.recommendations.zh, pulseRecommendations.zh].filter(Boolean).join(' '),
         en: [rule.recommendations.en, pulseRecommendations.en].filter(Boolean).join(' '),
        }
      : pulseRecommendations,
    pulseWarning,
    bpRule: rule,
  }
}

export function getAlertLevel(systolic: number, diastolic: number, pulse?: number | null): AlertLevel {
  return evaluateReading(systolic, diastolic, pulse).level
}
