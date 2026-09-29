/*
檔案用途：藥量倒數與回診／抽血／打針／疫苗到期提醒的資料轉接層與純邏輯函式；照護閉環 T2（issue #946）起
回診／複驗提醒可連回同一位病人的時間線事件或檢驗值並記科別（Appointment 不另開表，ADR-005 決策一）。
所在層：src/lib 共用資料層；隔離 Supabase RLS 細節，供 CareDueRemindersPage、門診頁與相關單元測試使用。
主要關聯：care_due_reminders migration（20260906020000、20260925190000）、supabase/functions/care-due-reminders
（Edge Function 端另有自己的純函式副本，因為 Deno Edge Function 不引入瀏覽器端 src 模組，兩邊的到期日／倒數
天數計算規則必須保持一致）、docs/product/care-loop-domain-model.md §3 Q2／Q5。
*/
import dayjs from 'dayjs'
import { supabase } from './supabase'
import { calendarDateKey, CARE_DAY_TIMEZONE } from './careDay'
import type { LocalizedText } from './i18n'

export type CareRecipientType = 'human' | 'dog' | 'cat' | 'bird' | 'rabbit' | 'other'

export type ReminderType =
  | 'medication_refill'
  | 'follow_up_visit'
  | 'blood_draw'
  | 'injection'
  | 'vaccination'
  | 'heartworm_prevention'
  | 'deworming'

export type ReminderStatus = 'active' | 'completed' | 'dismissed'
// 「overdue」已過到期日；「due_soon」在門檻天數內；「ok」門檻天數之外都算還不用提醒。
export type ReminderDueLevel = 'overdue' | 'due_soon' | 'ok'

export interface CareDueReminder {
  id: string
  patient_id: string
  reminder_type: ReminderType
  medication_plan_id: string | null
  days_supply: number | null
  start_date: string
  due_date: string
  threshold_days: number
  status: ReminderStatus
  completed_at: string | null
  created_by_user_id: string | null
  created_at: string
  updated_at: string
  // 照護閉環 T2：連回觸發這筆提醒的時間線事件（手術、醫囑）或檢驗值列，兩者互斥、皆可為 null；
  // 複合外鍵綁同一位病人，來源列被刪時資料庫只清空關聯欄位。medication_refill 一律 null。
  related_entry_id: string | null
  related_lab_result_id: string | null
  // 科別自由文字（≤ 40 字），沿用 care_timeline_entries.visit_department 的慣例，不建第二套科別列舉。
  visit_department: string | null
}

export interface CreateCareDueReminderInput {
  patientId: string
  reminderType: ReminderType
  startDate: string
  thresholdDays: number
  // 只有 medication_refill 需要；其餘型別直接帶入已知的到期日（例如上次疫苗貼紙、獸醫排定的回診日）。
  daysSupply?: number
  dueDate?: string
  medicationPlanId?: string | null
  // 照護閉環 T2：只有非 medication_refill 型別會送出；兩個關聯至多擇一（資料庫 CHECK 也會擋），科別最長 40 字。
  // 三欄都是 patch 語意：undefined＝不送、保留資料庫既有值；null＝清除；字串＝設定（Codex review PR #952 P2）。
  relatedEntryId?: string | null
  relatedLabResultId?: string | null
  visitDepartment?: string | null
}

// 為什麼提醒文案只放事實：驗收條件明訂不得推論病因或建議調藥，這裡的中印文案只描述「還剩幾天」與「到期日」。
export const REMINDER_TYPE_META: Record<ReminderType, {
  label: LocalizedText
  defaultThresholdDays: number
  applicableSpecies: CareRecipientType[]
}> = {
  medication_refill: { label: { id: 'Sisa obat', zh: '藥量倒數', en: 'Medication supply' }, defaultThresholdDays: 14, applicableSpecies: ['human', 'dog', 'cat', 'bird', 'rabbit', 'other'] },
  follow_up_visit: { label: { id: 'Kontrol dokter', zh: '回診', en: 'Follow-up visit' }, defaultThresholdDays: 7, applicableSpecies: ['human'] },
  blood_draw: { label: { id: 'Ambil darah', zh: '抽血', en: 'Blood draw' }, defaultThresholdDays: 7, applicableSpecies: ['human'] },
  injection: { label: { id: 'Suntikan', zh: '打針', en: 'Injection' }, defaultThresholdDays: 3, applicableSpecies: ['human'] },
  vaccination: { label: { id: 'Vaksin', zh: '疫苗', en: 'Vaccination' }, defaultThresholdDays: 14, applicableSpecies: ['dog', 'cat', 'bird', 'rabbit', 'other'] },
  heartworm_prevention: { label: { id: 'Obat cacing jantung', zh: '心絲蟲預防', en: 'Heartworm prevention' }, defaultThresholdDays: 7, applicableSpecies: ['dog', 'cat'] },
  deworming: { label: { id: 'Obat cacing', zh: '驅蟲', en: 'Deworming' }, defaultThresholdDays: 7, applicableSpecies: ['dog', 'cat', 'bird', 'rabbit', 'other'] },
}

export function reminderTypesForSpecies(careRecipientType: CareRecipientType | undefined): ReminderType[] {
  return (Object.keys(REMINDER_TYPE_META) as ReminderType[])
    .filter(type => !careRecipientType || REMINDER_TYPE_META[type].applicableSpecies.includes(careRecipientType))
}

/** 藥量倒數的到期日＝領藥日＋天數；其餘型別的到期日由照護者直接輸入，不做任何推算。 */
export function computeMedicationDueDate(startDate: string, daysSupply: number): string {
  return dayjs.tz(startDate, CARE_DAY_TIMEZONE).add(daysSupply, 'day').format('YYYY-MM-DD')
}

/** 以日曆日（非照護日 04:00 界線）計算剩餘天數；今天到期回傳 0，已過期回傳負數。 */
export function computeRemainingDays(dueDate: string, today: string = calendarDateKey()): number {
  return dayjs.tz(dueDate, CARE_DAY_TIMEZONE).diff(dayjs.tz(today, CARE_DAY_TIMEZONE), 'day')
}

export function classifyReminderDueLevel(remainingDays: number, thresholdDays: number): ReminderDueLevel {
  if (remainingDays < 0) return 'overdue'
  if (remainingDays <= thresholdDays) return 'due_soon'
  return 'ok'
}

export const REMINDER_VISIT_DEPARTMENT_MAX_LENGTH = 40

function toReminderFields(input: CreateCareDueReminderInput) {
  const isMedication = input.reminderType === 'medication_refill'
  if (isMedication && !input.daysSupply) throw new Error('days_supply is required for medication_refill reminders')
  if (!isMedication && !input.dueDate) throw new Error('dueDate is required for non-medication reminders')
  // 先在 adapter 擋下資料庫一定會拒絕的組合，讓表單拿到可讀的錯誤，而不是 23514 的 constraint 名稱。
  if (!isMedication && input.relatedEntryId && input.relatedLabResultId) throw new Error('relatedEntryId and relatedLabResultId are mutually exclusive')
  // 只驗證非藥量倒數：藥量倒數的科別一律被 toClinicalLinkFields 丟成 null，表單從回診切成藥量倒數時殘留的長字串
  // 不該擋下整筆寫入（2026-09-26 獨立複審）。
  const visitDepartment = input.visitDepartment?.trim() ?? ''
  if (!isMedication && visitDepartment.length > REMINDER_VISIT_DEPARTMENT_MAX_LENGTH) throw new Error(`visitDepartment must be at most ${REMINDER_VISIT_DEPARTMENT_MAX_LENGTH} characters`)

  return {
    reminder_type: input.reminderType,
    medication_plan_id: isMedication ? (input.medicationPlanId ?? null) : null,
    days_supply: isMedication ? input.daysSupply : null,
    start_date: input.startDate,
    due_date: isMedication ? computeMedicationDueDate(input.startDate, input.daysSupply as number) : (input.dueDate as string),
    threshold_days: input.thresholdDays,
    status: 'active' as ReminderStatus,
    ...toClinicalLinkFields(input, isMedication),
  }
}

// 照護閉環 T2（Codex review PR #952 P2）：關聯欄位走 patch 語意——表單沒提供的欄位就不送，讓只改到期日或門檻的
// 編輯（CareDueRemindersPage 目前沒有連結欄位）不會把既有的 related_entry_id／related_lab_result_id／
// visit_department 覆寫成 null；明確傳 null 才代表清除。藥量倒數例外：它跟臨床事件／檢驗值／科別無關，一律送
// null——型別從回診改成藥量倒數時也要一併清掉，否則 care_due_reminders_medication_fields_check 會擋。
function toClinicalLinkFields(input: CreateCareDueReminderInput, isMedication: boolean) {
  if (isMedication) return { related_entry_id: null, related_lab_result_id: null, visit_department: null }
  const fields: { related_entry_id?: string | null; related_lab_result_id?: string | null; visit_department?: string | null } = {}
  if (input.relatedEntryId !== undefined) fields.related_entry_id = input.relatedEntryId || null
  if (input.relatedLabResultId !== undefined) fields.related_lab_result_id = input.relatedLabResultId || null
  // 兩個關聯互斥，而 patch 語意下「沒提供」代表保留資料庫原值：只送其中一個新連結時，資料庫裡另一個舊連結會留著，
  // 更新後兩欄同時有值，被 care_due_reminders_related_source_check 以 23514 擋下，上面的 JS 互斥檢查也看不到
  // 資料庫原值。所以「設定其中一個」一律同時清掉另一個——換連結＝取代，不是疊加（2026-09-26 獨立複審）。
  if (fields.related_entry_id && input.relatedLabResultId === undefined) fields.related_lab_result_id = null
  if (fields.related_lab_result_id && input.relatedEntryId === undefined) fields.related_entry_id = null
  if (input.visitDepartment !== undefined) fields.visit_department = input.visitDepartment?.trim() || null
  return fields
}

function toRow(input: CreateCareDueReminderInput) {
  return { patient_id: input.patientId, ...toReminderFields(input) }
}

export async function listCareDueReminders(patientId: string): Promise<CareDueReminder[]> {
  const { data, error } = await supabase
    .from('care_due_reminders')
    .select('*')
    .eq('patient_id', patientId)
    .order('due_date', { ascending: true })
  if (error) throw error
  return (data ?? []) as CareDueReminder[]
}

export async function createCareDueReminder(input: CreateCareDueReminderInput): Promise<CareDueReminder> {
  const { data, error } = await supabase
    .from('care_due_reminders')
    .insert(toRow(input))
    .select('*')
    .single()
  if (error) throw error
  return data as CareDueReminder
}

export async function updateCareDueReminder(id: string, input: CreateCareDueReminderInput): Promise<CareDueReminder> {
  const { data, error } = await supabase
    .from('care_due_reminders')
    // 為什麼更新不帶 patient_id：提醒不能因畫面切換或重放請求被重新歸戶；同時用原病人做 WHERE，讓 adapter 與 RLS 都維持病人邊界。
    .update(toReminderFields(input))
    .eq('id', id)
    .eq('patient_id', input.patientId)
    .select('*')
    .single()
  if (error) throw error
  return data as CareDueReminder
}

export async function setCareDueReminderStatus(id: string, status: ReminderStatus): Promise<CareDueReminder> {
  const { data, error } = await supabase
    .from('care_due_reminders')
    .update({ status, completed_at: status === 'completed' ? new Date().toISOString() : null })
    .eq('id', id)
    .select('*')
    .single()
  if (error) throw error
  return data as CareDueReminder
}

export async function deleteCareDueReminder(id: string): Promise<void> {
  const { error } = await supabase.from('care_due_reminders').delete().eq('id', id)
  if (error) throw error
}
