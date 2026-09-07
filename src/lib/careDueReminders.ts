/*
檔案用途：藥量倒數與回診／抽血／打針／疫苗到期提醒的資料轉接層與純邏輯函式。
所在層：src/lib 共用資料層；隔離 Supabase RLS 細節，供 CareDueRemindersPage 與相關單元測試使用。
主要關聯：care_due_reminders migration、supabase/functions/care-due-reminders（Edge Function 端另有自己的
純函式副本，因為 Deno Edge Function 不引入瀏覽器端 src 模組，兩邊的到期日／倒數天數計算規則必須保持一致）。
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

function toReminderFields(input: CreateCareDueReminderInput) {
  const isMedication = input.reminderType === 'medication_refill'
  if (isMedication && !input.daysSupply) throw new Error('days_supply is required for medication_refill reminders')
  if (!isMedication && !input.dueDate) throw new Error('dueDate is required for non-medication reminders')

  return {
    reminder_type: input.reminderType,
    medication_plan_id: isMedication ? (input.medicationPlanId ?? null) : null,
    days_supply: isMedication ? input.daysSupply : null,
    start_date: input.startDate,
    due_date: isMedication ? computeMedicationDueDate(input.startDate, input.daysSupply as number) : (input.dueDate as string),
    threshold_days: input.thresholdDays,
    status: 'active' as ReminderStatus,
  }
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
