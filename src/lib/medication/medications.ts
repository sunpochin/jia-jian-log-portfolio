/*
檔案用途：處理個人與家庭藥單清單、藥物劑量與劑型之 CRUD 邏輯。
所在層：src/lib；為用藥資料庫操作共用模組。
主要關聯：由 MedicationPage、MedicationAdminSection 載入。
*/
import dayjs from 'dayjs'
import { supabase } from '../supabase'
import { normalizeMedicationEmail } from './medicationToday'
import { calendarDateKey, careDateKey } from '../careDay'
import type { MedicationCatalog, MedicationIntakeLog, MedicationPlan, MedicationPlanSnapshot, PatientMedicationInstruction } from '../../types/database'
import type { Locale, LocalizedText } from '../i18n'
import { isDemoPatientId, getFallbackDemoMedicationHistory } from '../demoData'
import { clearDemoMedicationDose, isDemoMode, readDemoMedicationDay, readDemoMedicationHistory, saveDemoMedicationDose } from '../demoStorage'
import { readPrnMedicationDay } from './prnMedication'
import { readPatientMedicationInstructions } from './medicationInstructions'
import { indexOverridesByMedicationId, mergeMedicationAppearanceOverride, readPatientMedicationAppearanceOverrides } from './medicationAppearanceOverrides'

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
  // B 層（人講過的服用方式）：這顆藥沒有紀錄時是 null，不是「還沒載入」，呼叫端不必另外判斷 undefined。
  instruction: PatientMedicationInstruction | null
}

export interface MedicationViewKey {
  patientId: string
  date: string
}

export function isCurrentMedicationView(active: MedicationViewKey, request: MedicationViewKey) {
  // 非同步存檔回來時，必須仍是同一位病人、同一天，否則舊畫面的結果會污染剛切換的新藥單。
  return active.patientId === request.patientId && active.date === request.date
}

export function formatMedicationLabel(brandName: string, strengthMg: number | null, strengthLabel?: string | null) {
  // 保健品常以 IU、微克或複方標示；優先用包裝已確認的文字，避免把 D3 的 800 IU 誤顯示為 0.02 mg。
  if (strengthLabel) return `${brandName} · ${strengthLabel}`
  // strength_mg 為 NULL 且沒有 strength_label 不該發生（migration 的 CHECK 已鎖住），
  // 這裡只是型別上的防呆，不讓沒有可信劑量的資料顯示出捏造的數字。
  if (strengthMg == null) return brandName
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
    const instructions = await readPatientMedicationInstructions(patientId)
    const instructionByMedicationId = new Map(instructions.map(instruction => [instruction.medication_id, instruction]))
    const plans = day.plans.map(plan => ({ ...plan, instruction: instructionByMedicationId.get(plan.medication_id) ?? null }))
    const prnDay = await readPrnMedicationDay(patientId, date, plans.filter(plan => plan.as_needed).map(plan => plan.id))
    return { ...day, plans, prnEvents: prnDay.events, prnAssessments: prnDay.assessments }
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
        .select('id, drug_product_id, brand_name, brand_name_zh, brand_name_id, generic_name, strength_mg, strength_label, dosage_form, specialties, verification_status, tfda_license_number, nhi_drug_code, appearance_note, appearance_color, appearance_shape, appearance_photo_url, atc_code, official_dosage_form_text, official_score_text, created_at')
        .in('id', medicationIds)
    : { data: [], error: null }

  if (medicationsError) throw medicationsError

  // 第三個查詢：B 層紀錄跟 plan／medication 完全獨立，直接呼叫已合併的 readPatientMedicationInstructions()，
  // 不重寫一次 supabase.from('patient_medication_instructions')。
  const instructions = await readPatientMedicationInstructions(patientId)
  const instructionByMedicationId = new Map(instructions.map(instruction => [instruction.medication_id, instruction]))

  // 病人層外觀覆蓋（issue #759）：這裡查的是共用目錄，覆蓋要另外合併，才能讓每日藥卡顯示這位病人
  // 手上這顆藥實際的顏色／形狀／照片，而不是全站共用的那一版。
  const overrides = await readPatientMedicationAppearanceOverrides(patientId)
  const overrideByMedicationId = indexOverridesByMedicationId(overrides)

  const { data: logs, error: logsError } = await supabase
    .from('medication_intake_logs')
    .select('id, account_email, patient_id, medication_id, medication_name, plan_id, dose_number, taken_on, care_date, taken_at, created_at')
    .eq('patient_id', patientId)
    .eq('care_date', date)
    .not('plan_id', 'is', null)

  if (logsError) throw logsError

  const catalog = new Map((medications ?? []).map(medication => [
    medication.id,
    mergeMedicationAppearanceOverride(medication, overrideByMedicationId.get(medication.id)),
  ]))
  // 藥品目錄若缺資料就不顯示該計畫，避免只剩 ID 時讓看護猜藥。
  const planViews = (plans ?? []).flatMap(plan => {
    const medication = catalog.get(plan.medication_id)
    if (!medication) return []
    const instruction = instructionByMedicationId.get(plan.medication_id) ?? null
    return [{ ...plan, medication, instruction } as MedicationPlanView]
  })
  const prnDay = await readPrnMedicationDay(patientId, date, planViews.filter(plan => plan.as_needed).map(plan => plan.id))

  return { plans: planViews, logs: (logs ?? []) as MedicationIntakeLog[], prnEvents: prnDay.events, prnAssessments: prnDay.assessments }
}

// 減藥期常見的零頭劑量（1/4、半顆、3/4）都要明確寫出分數，不能只顯示小數，
// 否則照護者容易誤讀成「0.25 顆」這種看不出來要怎麼分藥的數字。
// 1/4、3/4 除了單獨出現，也會跟整數合併（例如 1又1/4 顆）；只比對整數的寫法會漏掉這些組合，
// 讓劑量摘要退回顯示成 1.25 這種小數。半顆維持既有規則：只有單獨半顆（0.5）顯示分數，
// 超過一顆的半顆（例如 1.5）維持小數——這是既有測試鎖定的行為，這裡不擴大範圍。
export function formatDoseCountLabel(amount: number): string {
  if (amount === 0.5) return '½'
  const whole = Math.floor(amount)
  const quarterFraction = Math.round((amount - whole) * 100) / 100
  if (quarterFraction === 0.25) return `${whole || ''}¼`
  if (quarterFraction === 0.75) return `${whole || ''}¾`
  return String(amount)
}

// 英文單位詞只在這裡定義一次：formatDoseAmount 與 dosageFormUnitLabel(…, 'en') 共用，避免兩套英文詞彙。
function englishDosageUnit(dosageForm: string, amount: number) {
  // 沖泡粉包不是「一顆」；沿用錠劑單位會讓照護者拿著一整包卻以為只要倒一小口。
  const singular = dosageForm === 'capsule' ? 'capsule' : dosageForm === 'liquid' ? 'dose' : dosageForm === 'powder' ? 'sachet' : 'tablet'
  // 不足一整顆的劑量在英文仍是單數（例如 "half tablet"）；其餘超過一粒的劑量才用複數，避免照護者誤讀指示。
  return amount <= 1 ? singular : `${singular}s`
}

export function formatDoseAmount(amount: number, dosageForm: string) {
  // 藥袋的零頭劑量必須明確寫出；只顯示「第 1 顆」會讓照護者誤以為要吞整粒。
  return `${formatDoseCountLabel(amount)} ${englishDosageUnit(dosageForm, amount)}`
}

// 劑型單位詞獨立匯出，讓需要「按劑型分組加總」的呼叫端（例如服藥時段的顆數摘要）能各自套用正確單位，
// 不必重新複製一份錠／膠囊／包／份的對照表，否則新增劑型時容易漏改其中一處。
// amount 只影響英文單複數：中文與印尼文單位詞不變形；英文 ≤ 1（含 ½、¼ 等零頭）用單數，> 1 用複數。
export function dosageFormUnitLabel(dosageForm: string, locale: Locale, amount = 1) {
  if (locale === 'zh') return dosageForm === 'capsule' ? '膠囊' : dosageForm === 'liquid' ? '份' : dosageForm === 'powder' ? '包' : '錠'
  // 英文過去沒有自己的分支，會落到印尼文單位（kapsul、dosis），英文介面因此混入印尼文（issue #920）。
  if (locale === 'en') return englishDosageUnit(dosageForm, amount)
  return dosageForm === 'capsule' ? 'kapsul' : dosageForm === 'liquid' ? 'dosis' : dosageForm === 'powder' ? 'sachet' : 'tablet'
}

export function formatDoseAmountLocalized(amount: number, dosageForm: string, locale: Locale) {
  // 劑量數字不能翻譯，但藥品單位必須跟著介面語系，否則切到中文仍會留下英文指示。
  const count = formatDoseCountLabel(amount)
  return `${count} ${dosageFormUnitLabel(dosageForm, locale, amount)}`
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
        .select('id, drug_product_id, brand_name, brand_name_zh, brand_name_id, generic_name, strength_mg, strength_label, dosage_form, specialties, verification_status, tfda_license_number, nhi_drug_code, appearance_note, appearance_color, appearance_shape, appearance_photo_url, atc_code, official_dosage_form_text, official_score_text, created_at')
        .in('id', medicationIds)
    : { data: [], error: null }

  if (medicationsError) throw medicationsError

  const catalog = new Map((medications ?? []).map(medication => [medication.id, medication]))
  return (logs ?? []).flatMap(log => {
    const medication = catalog.get(log.medication_id)
    return medication ? [{ ...log, medication } as MedicationPlanChangeLogView] : []
  })
}
