/*
檔案用途：定義藥單、服藥／頓服紀錄與藥品主檔相關資料表型別。
所在層：src/types/database 領域型別層；由 src/types/database.ts 統一 re-export。
主要關聯：components 與 hooks 讀寫用藥紀錄、藥品主檔、藥單異動與病人專屬服用方式／外觀覆蓋時使用；
MedicationChangeSnapshot 亦被 src/types/database/careEvents.ts 的照護時間軸事件型別引用。
*/
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

export interface MedicationCatalog {
  id: string
  // 官方主檔與照護藥單分開保存，避免同步公開資料時改掉既有 plan 所依賴的文字 ID。
  drug_product_id: string | null
  brand_name: string
  brand_name_zh: string | null
  brand_name_id?: string | null
  generic_name: string
  // 營養品沒有可信的 mg 數字時為 NULL，必須改看 strength_label（單位 C，issue #758）。
  strength_mg: number | null
  strength_label?: string | null
  // 單位 A 補上的欄位；'supplement' 只有營養品會用到，drug 維持既有行為。
  product_kind?: 'drug' | 'supplement'
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
  // 由 refresh_official_medication_dosage_details() 從 TFDA 官方劑型與外觀刻痕公開資料回填；
  // 顯示時交給 lib/medicationSwallowGuidance.ts 轉成三語「服用方式」提示，不在這裡存翻譯文字。
  official_dosage_form_text?: string | null
  // 刻痕僅供外觀描述使用，不進服用方式提示（見 medicationSwallowGuidance.ts 檔頭說明）。
  official_score_text?: string | null
  // 支援多層藥品資料庫 (Layer 1 人類藥 / Layer 2 動物藥 / Layer 3 跨物種對應) 與適用/禁用物種標示
  medication_category?: 'human' | 'animal' | 'dual'
  applicable_species?: string[]
  contraindicated_species?: string[]
  animal_drug_license_number?: string | null
  indications?: string | null
  manufacturer?: string | null
  created_at: string
  // 不是資料庫欄位；由呼叫端合併 patient_medication_appearance_overrides 後標記外觀來源，
  // 讓畫面決定是否顯示「此人專屬外觀」徽章（issue #759）。未合併過覆蓋層的舊呼叫端仍可略過此欄位。
  appearance_source?: 'shared' | 'patient_override'
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

export type PatientMedicationInstructionSource = 'pharmacist' | 'doctor' | 'package_insert' | 'family'

// 服用方式 B 層（issue #625）：一個病人的一顆藥只有一種吃法，主鍵是 (patient_id, medication_id)；
// updated_by／updated_at 由資料庫 trigger 從 JWT 強制寫入，型別上仍保留欄位以便讀取顯示交代人與時間。
export interface PatientMedicationInstruction {
  patient_id: string
  medication_id: string
  instruction_codes: string[]
  instruction_note: string | null
  source: PatientMedicationInstructionSource
  confirmed_on: string
  updated_by: string
  updated_at: string
}

export type PatientMedicationInstructionInsert = Omit<PatientMedicationInstruction, 'updated_by' | 'updated_at'>

// 病人層外觀覆蓋（issue #759，共用藥品目錄單位 D）：一個病人對同一顆共用藥只有一種「他手上這顆長怎樣」，
// 主鍵是 (patient_id, medication_id)，完全不動 medications 那筆共用列；updated_by／updated_at 同樣由
// 資料庫 trigger 從 JWT 強制寫入，型別上保留欄位只為了讀取顯示。
export interface PatientMedicationAppearanceOverride {
  patient_id: string
  medication_id: string
  appearance_color: string | null
  appearance_shape: string | null
  appearance_photo_url: string | null
  appearance_note: string | null
  updated_by: string
  updated_at: string
}

export type PatientMedicationAppearanceOverrideInsert = Omit<PatientMedicationAppearanceOverride, 'updated_by' | 'updated_at'>
