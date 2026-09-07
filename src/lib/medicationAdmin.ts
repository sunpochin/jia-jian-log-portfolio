/*
檔案用途：用藥管理管理員介面資料層，處理 TFDA 官方藥品連結與自訂藥單。
所在層：src/lib；為藥單設定資料維護層。
主要關聯：由 MedicationAdminSection 載入調用。
*/
import { supabase } from './supabase'
import { compareMedicationSlots } from './medicationSchedule'
import type { Locale } from './i18n'
import { isDemoPatientId } from './demoData'
import { addExistingDemoMedicationPlan, createDemoMedicationPlan, deactivateDemoMedicationPlan, isDemoMode, readDemoMedicationAdminData } from './demoStorage'

export interface NewMedicationPlanInput {
  brandName: string
  brandNameZh: string
  genericName: string
  strengthMg: number
  dosageForm: string
  scheduleSlot: string
  doseAmount: number
  doseCount: number
  asNeeded: boolean
  appearanceColor: string
  appearanceShape: string
  appearancePhotoUrl: string
  catalogSource?: 'tfda' | 'nhi_tcm' | 'moa_animal'
  catalogSourceId?: string
}

// 修正既有藥品的劑型／外觀登錄錯誤（例如把粉劑誤登成藥錠、顏色記錯）；
// 這顆藥是共用藥品目錄，一次修正會套用到這顆藥在所有時段、所有病人的資料，不是只改這一筆醫囑。
export interface MedicationCorrectionInput {
  brandName: string
  brandNameZh: string
  genericName: string
  strengthMg: number
  dosageForm: string
  appearanceColor: string
  appearanceShape: string
  appearancePhotoUrl: string
}

export interface AdminMedicationPlan {
  id: string
  account_email: string
  patient_id: string
  medication_id: string
  schedule_slot: string
  dose_amount: number
  dose_count: number
  as_needed: boolean
  display_order: number
  active: boolean
}

export interface MedicationOption {
  id: string
  // 候選項目保留官方產品關聯，後續核對不能再只靠 Aspirin 這類成分名稱。
  drug_product_id: string | null
  brand_name: string
  brand_name_zh: string | null
  generic_name: string
  strength_mg: number
  // 複方藥與保健品的實際包裝劑量不能用單一 mg 數字取代，管理畫面也要保留原始標示。
  strength_label?: string | null
  dosage_form: string
  specialties: string[]
  verification_status: 'official' | 'manually_verified' | 'unverified'
  tfda_license_number: string | null
  nhi_drug_code: string | null
  // 日常服藥頁可隱藏刻印碼，但調藥核對仍要讀到它，不能因前端顯示策略而遺失官方資料。
  appearance_note: string | null
  appearance_color: string | null
  appearance_shape: string | null
  appearance_photo_url: string | null
  catalog_source: 'tfda' | 'nhi_tcm' | 'moa_animal' | null
  catalog_source_id: string | null
  // 支援多層藥品資料庫 (Layer 1 人類藥 / Layer 2 動物藥 / Layer 3 跨物種對應) 與適用/禁用物種標示
  medication_category?: 'human' | 'animal' | 'dual'
  applicable_species?: string[]
  contraindicated_species?: string[]
  animal_drug_license_number?: string | null
  indications?: string | null
  manufacturer?: string | null
}

export interface MedicationAccount {
  email: string
}

export interface MedicationPlanChangeLog {
  id: string
  action: 'create' | 'update' | 'deactivate'
  plan_id: string | null
  medication_id: string
  schedule_slot: string
  dose_amount: number | null
  dose_count: number
  as_needed: boolean | null
  reason: string | null
  actor_email: string
  created_at: string
}

interface MedicationPlanChangeInput {
  action: MedicationPlanChangeLog['action']
  patientId: string
  planId?: string
  medicationId?: string
  brandName?: string
  brandNameZh?: string
  genericName?: string
  strengthMg?: number
  dosageForm?: string
  scheduleSlot?: string
  asNeeded?: boolean
  doseAmount?: number
  doseCount?: number
  appearanceColor?: string
  appearanceShape?: string
  appearancePhotoUrl?: string
  catalogSource?: 'tfda' | 'nhi_tcm' | 'moa_animal'
  catalogSourceId?: string
  reason: string
}

async function applyMedicationPlanChange(input: MedicationPlanChangeInput) {
  const { error } = await supabase.rpc('apply_medication_plan_change', {
    p_action: input.action,
    p_patient_id: input.patientId,
    p_plan_id: input.planId ?? null,
    p_medication_id: input.medicationId ?? null,
    p_brand_name: input.brandName?.trim() || null,
    p_brand_name_zh: input.brandNameZh?.trim() || null,
    p_generic_name: input.genericName?.trim() || input.brandName?.trim() || input.brandNameZh?.trim() || 'Unspecified',
    p_strength_mg: input.strengthMg ?? null,
    p_dosage_form: input.dosageForm ?? null,
    p_schedule_slot: input.scheduleSlot ?? null,
    p_as_needed: input.asNeeded ?? null,
    p_dose_amount: input.doseAmount ?? null,
    p_dose_count: input.doseCount ?? null,
    p_reason: input.reason.trim() || null,
    p_appearance_color: input.appearanceColor || null,
    p_appearance_shape: input.appearanceShape || null,
    p_appearance_photo_url: input.appearancePhotoUrl?.trim() || null,
    p_catalog_source: input.catalogSource || null,
    p_catalog_source_id: input.catalogSourceId || null,
  })
  if (error) throw error
}

export function groupActiveMedicationPlans(plans: AdminMedicationPlan[], medicationById: Map<string, MedicationOption>, locale: Locale) {
  const groups = new Map<string, AdminMedicationPlan[]>()
  // 病人已在查詢時由 patient_id 限定；不能再以舊 subject 把另一位個人帳號的藥單排除。
  plans.filter(plan => plan.active).forEach(plan => groups.set(plan.schedule_slot, [...(groups.get(plan.schedule_slot) ?? []), plan]))
  // 先依實際服藥時段分區，再依藥名排序；照護者核對或調整時不必在不同餐次的藥之間來回找。
  return [...groups.entries()]
    .sort(([left], [right]) => compareMedicationSlots(left, right))
    .map(([slot, slotPlans]) => [slot, slotPlans.sort((left, right) => {
      const leftName = medicationById.get(left.medication_id)?.brand_name ?? left.medication_id
      const rightName = medicationById.get(right.medication_id)?.brand_name ?? right.medication_id
      return leftName.localeCompare(rightName, locale === 'zh' ? 'zh-Hant-TW' : 'id-ID', { sensitivity: 'base' }) || left.display_order - right.display_order
    })] as const)
}

export function resolveMedicationSelection(currentMedicationId: string, medications: MedicationOption[]) {
  // 藥品不能由首次載入或背景更新代選；使用者必須親手點選，才不會把預設第一項誤當成醫囑。
  if (currentMedicationId && medications.some(medication => medication.id === currentMedicationId)) return currentMedicationId
  return ''
}

export function listActiveMedicationPlansForMedication(plans: AdminMedicationPlan[], medicationId: string, excludePlanId?: string | null) {
  // 同一顆藥出現在多個時段（例如早、晚各一次）是合法醫囑，所以這裡回傳整串而不是單筆；
  // 畫面要先讓照護者看見「這個人已經有哪幾筆」，才能決定是新增另一個時段還是調整既有那筆。
  if (!medicationId) return []
  return plans.filter(plan => plan.active && plan.medication_id === medicationId && plan.id !== excludePlanId)
}

export function findMedicationPlanConflict(plans: AdminMedicationPlan[], medicationId: string, scheduleSlot: string, excludePlanId?: string | null) {
  // apply_medication_plan_change 對 (patient, medication, slot) 是 idempotent 的：以 create 送出會直接改寫既有那筆。
  // 前端必須先找出這筆，才能把「覆蓋原本醫囑」講清楚，而不是讓照護者以為只是又加了一顆藥。
  return listActiveMedicationPlansForMedication(plans, medicationId, excludePlanId).find(plan => plan.schedule_slot === scheduleSlot) ?? null
}

export function requiresDoubleMedicationConfirmation(isOwnPatient: boolean) { return !isOwnPatient }

export function medicationIdFor(brandName: string, genericName: string, strengthMg: number, dosageForm: string) {
  // 重試同一張新藥表單時必須指向同一筆目錄，否則網路逾時後可能留下兩個看似相同的藥品。
  const idBase = [brandName, genericName, strengthMg, dosageForm].join('-').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  return idBase || 'medicine'
}

export async function createMedicationPlan(input: NewMedicationPlanInput, patientId: string, reason = '') {
  if (isDemoMode() && isDemoPatientId(patientId)) {
    createDemoMedicationPlan(input, medicationIdFor(input.brandName, input.genericName, input.strengthMg, input.dosageForm), patientId, reason)
    return
  }
  await applyMedicationPlanChange({
    action: 'create', patientId, medicationId: medicationIdFor(input.brandName, input.genericName, input.strengthMg, input.dosageForm),
    brandName: input.brandName, brandNameZh: input.brandNameZh, genericName: input.genericName, strengthMg: input.strengthMg, dosageForm: input.dosageForm,
    scheduleSlot: input.scheduleSlot, asNeeded: input.asNeeded, doseAmount: input.doseAmount, doseCount: input.doseCount, reason,
    appearanceColor: input.appearanceColor, appearanceShape: input.appearanceShape, appearancePhotoUrl: input.appearancePhotoUrl,
    catalogSource: input.catalogSource, catalogSourceId: input.catalogSourceId,
  })
}

export async function readMedicationAdminData(patientId: string) {
  if (isDemoMode() && isDemoPatientId(patientId)) {
    return readDemoMedicationAdminData(patientId)
  }
  const [plansResult, medicationsResult, changesResult] = await Promise.all([
    supabase.from('medication_plans').select('id, account_email, patient_id, medication_id, schedule_slot, dose_amount, dose_count, as_needed, display_order, active').eq('patient_id', patientId).order('display_order'),
    supabase.from('medications').select('id, drug_product_id, brand_name, brand_name_zh, generic_name, strength_mg, strength_label, dosage_form, specialties, verification_status, tfda_license_number, nhi_drug_code, appearance_note, appearance_color, appearance_shape, appearance_photo_url, atc_code, catalog_source, catalog_source_id').order('brand_name'),
    supabase.from('medication_plan_change_logs').select('id, patient_id, action, plan_id, medication_id, schedule_slot, dose_amount, dose_count, as_needed, reason, actor_email, actor_user_id, before_snapshot, after_snapshot, recorded_at, effective_at, created_at').eq('patient_id', patientId).order('recorded_at', { ascending: false }).limit(12),
  ])
  if (plansResult.error) throw plansResult.error
  if (medicationsResult.error) throw medicationsResult.error
  if (changesResult.error) throw changesResult.error
  return {
    plans: (plansResult.data ?? []) as AdminMedicationPlan[],
    medications: (medicationsResult.data ?? []) as MedicationOption[],
    changes: (changesResult.data ?? []) as MedicationPlanChangeLog[],
  }
}


export async function addExistingMedicationPlan(medicationId: string, patientId: string, scheduleSlot: string, doseAmount: number, asNeeded: boolean, reason = '', planId?: string, medicationCorrection?: MedicationCorrectionInput) {
  if (isDemoMode() && isDemoPatientId(patientId)) {
    // Demo 也走 plan-id 明確更新；不讓時段改動在本機試用模式留下兩筆 active plan。
    addExistingDemoMedicationPlan(medicationId, patientId, scheduleSlot, doseAmount, asNeeded, reason, undefined, planId, medicationCorrection)
    return
  }
  await applyMedicationPlanChange({
    action: planId ? 'update' : 'create', patientId, planId, medicationId, scheduleSlot, doseAmount, doseCount: 1, asNeeded, reason,
    // RPC 只有在收到 p_brand_name 時才會 upsert medications 那張表；沒有修正資料時完全不帶這些欄位，
    // 避免把原本沒打算改動的藥品資料意外覆寫成空值。
    ...(medicationCorrection ? {
      brandName: medicationCorrection.brandName, brandNameZh: medicationCorrection.brandNameZh, genericName: medicationCorrection.genericName,
      strengthMg: medicationCorrection.strengthMg, dosageForm: medicationCorrection.dosageForm,
      appearanceColor: medicationCorrection.appearanceColor, appearanceShape: medicationCorrection.appearanceShape, appearancePhotoUrl: medicationCorrection.appearancePhotoUrl,
    } : {}),
  })
}

export async function setMedicationPlanActive(planId: string, active: boolean, patientId: string, reason = '') {
  if (active) throw new Error('Reactivating a medication plan requires its prescription details')
  if (isDemoMode() && isDemoPatientId(patientId)) {
    deactivateDemoMedicationPlan(planId, patientId, reason)
    return
  }
  await applyMedicationPlanChange({ action: 'deactivate', patientId, planId, reason })
}
