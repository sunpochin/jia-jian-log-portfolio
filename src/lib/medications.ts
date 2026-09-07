/*
檔案用途：處理個人與家庭藥單清單、藥物劑量與劑型之 CRUD 邏輯。
所在層：src/lib；為用藥資料庫操作共用模組。
主要關聯：由 MedicationPage、MedicationAdminSection 載入。
*/
import dayjs from 'dayjs'
import { supabase } from './supabase'
import { normalizeMedicationEmail } from './medicationToday'
import { calendarDateKey, careDateKey } from './careDay'
import type { MedicationCatalog, MedicationIntakeLog, MedicationPlan, MedicationPlanSnapshot } from '../types/database'
import type { Locale, LocalizedText } from './i18n'
import { isDemoPatientId, getFallbackDemoMedicationHistory } from './demoData'
import { clearDemoMedicationDose, isDemoMode, readDemoMedicationDay, readDemoMedicationHistory, saveDemoMedicationDose } from './demoStorage'
import { readPrnMedicationDay } from './prnMedication'

export interface MedicationPlanChangeLogView {
  id: string
  subject?: string
  patient_id: string
  action: 'create' | 'update' | 'deactivate'
  plan_id: string | null
  medication_id: string
  schedule_slot: string
  dose_amount: number | null
  dose_count: number | null
  as_needed: boolean | null
  reason: string | null
  actor_email: string
  actor_user_id?: string | null
  before_snapshot: Partial<MedicationPlanSnapshot>
  after_snapshot: Partial<MedicationPlanSnapshot>
  recorded_at: string
  effective_at: string
  created_at: string
  medication: MedicationCatalog
}

export interface MedicationPlanView extends MedicationPlan {
  medication: MedicationCatalog
}

export interface MedicationViewKey {
  patientId: string
  date: string
}

export function isCurrentMedicationView(active: MedicationViewKey, request: MedicationViewKey) {
  // 非同步存檔回來時，必須仍是同一位病人、同一天，否則舊畫面的結果會污染剛切換的新藥單。
  return active.patientId === request.patientId && active.date === request.date
}

export function formatMedicationLabel(brandName: string, strengthMg: number, strengthLabel?: string | null) {
  // 保健品常以 IU、微克或複方標示；優先用包裝已確認的文字，避免把 D3 的 800 IU 誤顯示為 0.02 mg。
  if (strengthLabel) return `${brandName} · ${strengthLabel}`
  // 複方商品名已含 5/160 等完整劑量時，只補一次 mg，避免看護把重複數字誤認為兩種劑量。
  const strengthPattern = new RegExp(`\\b${String(strengthMg).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`)
  if (!strengthPattern.test(brandName)) return `${brandName} ${strengthMg} mg`
  return /\bmg\b/i.test(brandName) ? brandName : `${brandName} mg`
}

export function formatMedicationDisplayName(medication: MedicationCatalog, locale: Locale) {
  // 印尼版優先讀取印尼文品名；既有藥品尚未有翻譯時回退原商品名，避免出現空白或要求看護辨識中文。
  return locale === 'id' ? medication.brand_name_id || medication.brand_name : medication.brand_name_zh || medication.brand_name
}

export interface MedicationNamePresentation {
  primary: string
  secondary: string | null
}

export function pairMedicationNames(englishName: string, localizedName: string, englishFirst: boolean): MedicationNamePresentation {
  // 外籍看護與家屬常用不同語言核對同一顆藥；英文商品名是雙方都認得出包裝的共同基準，
  // 因此「英文優先」時把它拉到最醒目的主要位置，本地化品名退到次要說明，而非直接省略。
  const primary = englishFirst ? englishName : localizedName
  const secondaryCandidate = englishFirst ? localizedName : englishName
  return { primary, secondary: secondaryCandidate === primary ? null : secondaryCandidate }
}

export function resolveMedicationNames(medication: MedicationCatalog, locale: Locale, englishFirst: boolean): MedicationNamePresentation {
  return pairMedicationNames(medication.brand_name, formatMedicationDisplayName(medication, locale), englishFirst)
}

export function completesRequiredMedicationSlot(slotPlans: MedicationPlanView[], logs: MedicationIntakeLog[], savedPlanId: string, savedDoseNumber: number) {
  const requiredPlans = slotPlans.filter(plan => !plan.as_needed)
  // 需要時才吃的藥不能阻擋「這餐已完成」；否則媽媽沒吃 PRN 反而永遠看不到完成提示。
  return requiredPlans.length > 0 && requiredPlans.every(plan =>
    Array.from({ length: plan.dose_count }, (_, index) => index + 1).every(doseNumber =>
      (plan.id === savedPlanId && doseNumber === savedDoseNumber)
      || logs.some(log => log.plan_id === plan.id && log.dose_number === doseNumber),
    ),
  )
}

export function buildMedicationDoseInsert(plan: MedicationPlanView, _date: string, doseNumber: number, recordedByEmail: string, takenAtValue = dayjs().toISOString()) {
  const takenAt = dayjs(takenAtValue)
  return {
    // 藥單建立者可與代為勾藥的照護者不同；服藥紀錄必須保存目前 JWT 帳號，才能通過 RLS 並留下真實稽核來源。
    account_email: normalizeMedicationEmail(recordedByEmail),
    patient_id: plan.patient_id,
    medication_id: plan.medication_id,
    medication_name: plan.medication.brand_name,
    plan_id: plan.id,
    dose_number: doseNumber,
    // 繁體中文註解：taken_on 留下實際台北日曆日；date/care_date 才是每日待辦的照護日。
    taken_on: calendarDateKey(takenAt),
    // 伺服器 trigger 也會重算；客戶端先用同一個時間點產生，避免剛好跨 04:00 時畫面與回傳資料不同步。
    care_date: careDateKey(takenAt),
    taken_at: takenAt.toISOString(),
  }
}

export async function readMedicationDay(patientId: string, date: string) {
  if (isDemoMode() && isDemoPatientId(patientId)) {
    // 免登入 Demo 不應把匿名請求送到只允許 SELECT 的公開 RLS；本機 state 同時支援勾藥後立即重讀。
    const day = readDemoMedicationDay(patientId, date)
    const prnDay = await readPrnMedicationDay(patientId, date, day.plans.filter(plan => plan.as_needed).map(plan => plan.id))
    return { ...day, prnEvents: prnDay.events, prnAssessments: prnDay.assessments }
  }
  const { data: plans, error: plansError } = await supabase
    .from('medication_plans')
    .select('id, account_email, patient_id, medication_id, schedule_slot, as_needed, dose_amount, dose_count, display_order, active, created_at')
    .eq('patient_id', patientId)
    .eq('active', true)
    .order('display_order')

  if (plansError) throw plansError

  const medicationIds = [...new Set((plans ?? []).map(plan => plan.medication_id))]
  const { data: medications, error: medicationsError } = medicationIds.length
    ? await supabase
        .from('medications')
        // 官方 UUID 必須跟著每日藥單一起讀回，不能再把商品只縮成名稱與成分的鬆散組合。
        .select('id, drug_product_id, brand_name, brand_name_zh, brand_name_id, generic_name, strength_mg, strength_label, dosage_form, specialties, verification_status, tfda_license_number, nhi_drug_code, appearance_note, appearance_color, appearance_shape, appearance_photo_url, atc_code, created_at')
        .in('id', medicationIds)
    : { data: [], error: null }

  if (medicationsError) throw medicationsError

  const { data: logs, error: logsError } = await supabase
    .from('medication_intake_logs')
    .select('id, account_email, patient_id, medication_id, medication_name, plan_id, dose_number, taken_on, care_date, taken_at, created_at')
    .eq('patient_id', patientId)
    .eq('care_date', date)
    .not('plan_id', 'is', null)

  if (logsError) throw logsError

  const catalog = new Map((medications ?? []).map(medication => [medication.id, medication]))
  // 藥品目錄若缺資料就不顯示該計畫，避免只剩 ID 時讓看護猜藥。
  const planViews = (plans ?? []).flatMap(plan => {
    const medication = catalog.get(plan.medication_id)
    return medication ? [{ ...plan, medication } as MedicationPlanView] : []
  })
  const prnDay = await readPrnMedicationDay(patientId, date, planViews.filter(plan => plan.as_needed).map(plan => plan.id))

  return { plans: planViews, logs: (logs ?? []) as MedicationIntakeLog[], prnEvents: prnDay.events, prnAssessments: prnDay.assessments }
}

export function formatDoseAmount(amount: number, dosageForm: string) {
  // 藥袋的半粒必須明確寫出；只顯示「第 1 顆」會讓照護者誤以為要吞整粒。
  const count = amount === 0.5 ? '½' : String(amount)
  // 沖泡粉包不是「一顆」；沿用錠劑單位會讓照護者拿著一整包卻以為只要倒一小口。
  const singular = dosageForm === 'capsule' ? 'capsule' : dosageForm === 'liquid' ? 'dose' : dosageForm === 'powder' ? 'sachet' : 'tablet'
  // 半粒在英文仍是 "half tablet"；其餘超過一粒的劑量才用複數，避免照護者誤讀指示。
  const form = amount === 0.5 || amount === 1 ? singular : `${singular}s`
  return `${count} ${form}`
}

// 劑型單位詞獨立匯出，讓需要「按劑型分組加總」的呼叫端（例如服藥時段的顆數摘要）能各自套用正確單位，
// 不必重新複製一份錠／膠囊／包／份的對照表，否則新增劑型時容易漏改其中一處。
export function dosageFormUnitLabel(dosageForm: string, locale: Locale) {
  if (locale === 'zh') return dosageForm === 'capsule' ? '膠囊' : dosageForm === 'liquid' ? '份' : dosageForm === 'powder' ? '包' : '錠'
  return dosageForm === 'capsule' ? 'kapsul' : dosageForm === 'liquid' ? 'dosis' : dosageForm === 'powder' ? 'sachet' : 'tablet'
}

export function formatDoseAmountLocalized(amount: number, dosageForm: string, locale: Locale) {
  // 劑量數字不能翻譯，但藥品單位必須跟著介面語系，否則切到中文仍會留下英文指示。
  const count = amount === 0.5 ? '½' : String(amount)
  return `${count} ${dosageFormUnitLabel(dosageForm, locale)}`
}

export function doseAmountFieldLabel(dosageForm: string): LocalizedText {
  // 「每次幾顆」對粉包是錯的指示；欄位標題要跟著劑型走，照護者才不會拿著一包粉找顆數。
  if (dosageForm === 'powder') return { id: 'Dosis setiap kali minum (sachet)', zh: '每次幾包', en: 'Packets per dose' }
  if (dosageForm === 'liquid') return { id: 'Dosis setiap kali minum', zh: '每次幾份', en: 'Doses per use' }
  return { id: 'Dosis setiap kali minum', zh: '每次幾顆', en: dosageForm === 'capsule' ? 'Capsules per dose' : 'Tablets per dose' }
}

export async function saveMedicationDose(plan: MedicationPlanView, date: string, doseNumber: number, recordedByEmail: string) {
  if (isDemoMode() && isDemoPatientId(plan.patient_id)) {
    return saveDemoMedicationDose(plan, date, doseNumber, recordedByEmail)
  }
  const { data, error } = await supabase
    .from('medication_intake_logs')
    .insert(buildMedicationDoseInsert(plan, date, doseNumber, recordedByEmail))
    .select('id, account_email, patient_id, medication_id, medication_name, plan_id, dose_number, taken_on, care_date, taken_at, created_at')
    .single()

  if (error?.code === '23505') {
    // 另一台裝置已先記錄同一顆時，直接讀回該筆，避免使用者誤以為尚未服用而重複吃藥。
    const { data: existing, error: readError } = await supabase
      .from('medication_intake_logs')
      .select('id, account_email, patient_id, medication_id, medication_name, plan_id, dose_number, taken_on, care_date, taken_at, created_at')
      .eq('patient_id', plan.patient_id)
      .eq('plan_id', plan.id)
      .eq('care_date', date)
      .eq('dose_number', doseNumber)
      .single()
    if (readError) throw readError
    return existing as MedicationIntakeLog
  }
  if (error) throw error
  return data as MedicationIntakeLog
}

export async function clearMedicationDose(planId: string, patientId: string, date: string, doseNumber: number) {
  if (isDemoMode() && isDemoPatientId(patientId)) {
    if (!clearDemoMedicationDose(planId, patientId, date, doseNumber)) throw new Error('Demo medication dose not found')
    return
  }
  const { error } = await supabase
    .from('medication_intake_logs')
    .delete()
    .eq('patient_id', patientId)
    .eq('plan_id', planId)
    .eq('care_date', date)
    .eq('dose_number', doseNumber)

  if (error) throw error
}

export async function readMedicationHistory(patientId: string, limit: number = 20): Promise<MedicationPlanChangeLogView[]> {
  if (isDemoMode() && isDemoPatientId(patientId)) {
    return readDemoMedicationHistory(patientId, limit)
  }
  const { data: logs, error: logsError } = await supabase
    .from('medication_plan_change_logs')
    .select('id, patient_id, action, plan_id, medication_id, schedule_slot, dose_amount, dose_count, as_needed, reason, actor_email, actor_user_id, before_snapshot, after_snapshot, recorded_at, effective_at, created_at')
    .eq('patient_id', patientId)
    .order('recorded_at', { ascending: false })
    .limit(limit)

  if (logsError || !logs || logs.length === 0) {
    if (isDemoPatientId(patientId)) {
      return getFallbackDemoMedicationHistory()
    }
    if (logsError) throw logsError
    return []
  }

  const medicationIds = [...new Set((logs ?? []).map(log => log.medication_id))]
  const { data: medications, error: medicationsError } = medicationIds.length
    ? await supabase
        .from('medications')
        .select('id, drug_product_id, brand_name, brand_name_zh, brand_name_id, generic_name, strength_mg, strength_label, dosage_form, specialties, verification_status, tfda_license_number, nhi_drug_code, appearance_note, appearance_color, appearance_shape, appearance_photo_url, atc_code, created_at')
        .in('id', medicationIds)
    : { data: [], error: null }

  if (medicationsError) throw medicationsError

  const catalog = new Map((medications ?? []).map(medication => [medication.id, medication]))
  return (logs ?? []).flatMap(log => {
    const medication = catalog.get(log.medication_id)
    return medication ? [{ ...log, medication } as MedicationPlanChangeLogView] : []
  })
}
