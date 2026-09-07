/*
檔案用途：提供 PRN 需要時服用事件、每日狀態推導與 Supabase／Demo 資料轉接。
所在層：src/lib；隔離 PRN 語意，避免 routine medication_intake_logs 的 dose_number 被誤用。
主要關聯：由 MedicationPage／PrnMedicationSection 載入，依賴 careDay、medication plan 與 care_access RLS。
*/
import dayjs from 'dayjs'
import timezone from 'dayjs/plugin/timezone'
import utc from 'dayjs/plugin/utc'
import { supabase } from './supabase'
import { calendarDateKey, CARE_DAY_TIMEZONE, careDateKey } from './careDay'
import { isDemoMode, readDemoPrnMedicationDay, saveDemoPrnDailyAssessment, saveDemoPrnMedicationEvent, updateDemoPrnMedicationEffectStatus, voidDemoPrnMedicationEvent } from './demoStorage'
import { isDemoPatientId } from './demoData'
import type { MedicationPlanView } from './medications'
import type { PrnMedicationAssessmentStatus, PrnMedicationDailyAssessment, PrnMedicationEffectStatus, PrnMedicationEvent } from '../types/database'
import type { LocalizedText } from './i18n'

dayjs.extend(utc)
dayjs.extend(timezone)

export type PrnDailyStatus = 'not_assessed' | 'not_needed' | 'used'

export interface PrnMedicationDay {
  events: PrnMedicationEvent[]
  assessments: PrnMedicationDailyAssessment[]
}

export interface SavePrnMedicationEventInput {
  plan: MedicationPlanView
  careDate: string
  doseAmount: number
  doseUnit: string
  reason: string
  effectStatus: PrnMedicationEffectStatus
  notes: string
  takenAt: string
  recordedByEmail: string
  idempotencyKey?: string
}

const PRN_EVENT_SELECT = 'id, patient_id, plan_id, medication_id, taken_at, care_date, dose_amount, dose_unit, reason, effect_status, notes, recorded_by_user_id, recorded_by_email, status, voided_at, voided_by_user_id, voided_by_email, void_reason, created_at'
const PRN_ASSESSMENT_SELECT = 'id, patient_id, plan_id, care_date, status, notes, assessed_at, assessed_by_user_id, assessed_by_email, created_at, updated_at'

function isPrnMigrationMissing(error: unknown) {
  const candidate = error && typeof error === 'object' ? error as { code?: string; message?: string } : {}
  const message = candidate.message?.toLowerCase() ?? ''
  return candidate.code === '42P01' || candidate.code === 'PGRST205' || message.includes('prn_medication_') && message.includes('schema cache')
}

export function createPrnEventId() {
  // 事件 ID 同時是重試的冪等鍵；不能用時間或劑量組合，因為同日合法使用可能剛好相同。
  return globalThis.crypto.randomUUID()
}

export function prnDoseUnitForDosageForm(dosageForm: string) {
  if (dosageForm === 'capsule') return 'capsule'
  if (dosageForm === 'liquid') return 'dose'
  // 粉包的 PRN 使用量單位是「包」，不能沿用錠劑，否則紀錄會寫成吃了半顆粉。
  if (dosageForm === 'powder') return 'sachet'
  return 'tablet'
}

export function formatPrnEffectStatus(status: PrnMedicationEffectStatus): LocalizedText {
  return {
    id: status === 'pending' ? 'Menunggu penilaian' : status === 'helped' ? 'Membaik' : status === 'not_helped' ? 'Belum membaik' : 'Tidak yakin',
    zh: status === 'pending' ? '待評估' : status === 'helped' ? '有改善' : status === 'not_helped' ? '尚未改善' : '不確定',
   en: status === 'pending' ? 'Awaiting evaluation' : status === 'helped' ? 'Improved' : status === 'not_helped' ? 'Not improved' : 'Uncertain',
  }
}

export function getPrnDailyStatus(planId: string, events: PrnMedicationEvent[], assessments: PrnMedicationDailyAssessment[]): PrnDailyStatus {
  // used 是 active events 的投影，不保存第二個布林真相；作廢事件不應再增加今日次數。
  if (events.some(event => event.plan_id === planId && event.status === 'active')) return 'used'
  return assessments.some(assessment => assessment.plan_id === planId && assessment.status === 'not_needed')
    ? 'not_needed'
    : 'not_assessed'
}

export function getActivePrnEvents(planId: string, events: PrnMedicationEvent[]) {
  return events
    .filter(event => event.plan_id === planId && event.status === 'active')
    .sort((left, right) => Date.parse(right.taken_at) - Date.parse(left.taken_at))
}

export function buildPrnMedicationEventInsert(input: SavePrnMedicationEventInput, eventId = input.idempotencyKey ?? createPrnEventId()) {
  // datetime-local 沒有時區；只有無 offset 的牆上時間才強制按台北解析，避免外籍看護在雅加達輸入後跨錯 04:00 照護日；帶 offset 的 API／測試值則尊重其明確時區。
  const takenAt = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(input.takenAt) ? dayjs(input.takenAt) : dayjs.tz(input.takenAt, CARE_DAY_TIMEZONE)
  if (!takenAt.isValid()) throw new Error('Invalid PRN event time')
  if (careDateKey(takenAt) !== input.careDate) {
    // 實際時間與畫面照護日不一致時要停下來，避免一筆紀錄被寫進另一日卻仍顯示在今天。
    throw new Error('PRN event time is outside the selected care day')
  }
  if (!Number.isFinite(input.doseAmount) || input.doseAmount <= 0) throw new Error('PRN dose amount must be greater than zero')
  if (!input.reason.trim()) throw new Error('PRN reason is required')
  return {
    id: eventId,
    patient_id: input.plan.patient_id,
    plan_id: input.plan.id,
    medication_id: input.plan.medication_id,
    taken_at: takenAt.toISOString(),
    // DB trigger 會重新計算 care_date；client 先送同一結果只是讓 optimistic flow 與查詢一致。
    care_date: input.careDate,
    dose_amount: input.doseAmount,
    dose_unit: input.doseUnit.trim(),
    reason: input.reason.trim(),
    effect_status: input.effectStatus,
    notes: input.notes.trim() || null,
    recorded_by_email: input.recordedByEmail.trim().toLowerCase(),
  }
}

export function prnEventLocalDateTime(value = dayjs()) {
  return value.tz(CARE_DAY_TIMEZONE).format('YYYY-MM-DDTHH:mm')
}

export async function readPrnMedicationDay(patientId: string, careDate: string, planIds: string[]): Promise<PrnMedicationDay> {
  if (isDemoMode() && isDemoPatientId(patientId)) return readDemoPrnMedicationDay(patientId, careDate, planIds)
  if (planIds.length === 0) return { events: [], assessments: [] }

  const { data: events, error: eventsError } = await supabase
    .from('prn_medication_events')
    .select(PRN_EVENT_SELECT)
    .eq('patient_id', patientId)
    .eq('care_date', careDate)
    .in('plan_id', planIds)
    .order('taken_at', { ascending: false })
  if (eventsError) {
    // migration 尚未進入某個預覽環境時，routine 仍可照常使用；真正送出 PRN 時再由錯誤提示要求套 migration。
    if (isPrnMigrationMissing(eventsError)) return { events: [], assessments: [] }
    throw eventsError
  }

  const { data: assessments, error: assessmentsError } = await supabase
    .from('prn_medication_daily_assessments')
    .select(PRN_ASSESSMENT_SELECT)
    .eq('patient_id', patientId)
    .eq('care_date', careDate)
    .in('plan_id', planIds)
  if (assessmentsError) {
    if (isPrnMigrationMissing(assessmentsError)) return { events: events as PrnMedicationEvent[] ?? [], assessments: [] }
    throw assessmentsError
  }
  return { events: (events ?? []) as PrnMedicationEvent[], assessments: (assessments ?? []) as PrnMedicationDailyAssessment[] }
}

export async function savePrnMedicationEvent(input: SavePrnMedicationEventInput) {
  const eventId = input.idempotencyKey ?? createPrnEventId()
  const payload = buildPrnMedicationEventInsert(input, eventId)
  if (isDemoMode() && isDemoPatientId(input.plan.patient_id)) return saveDemoPrnMedicationEvent(payload)

  const { data, error } = await supabase
    .from('prn_medication_events')
    .insert(payload)
    .select(PRN_EVENT_SELECT)
    .single()
  if (error?.code === '23505') {
    // 網路重試可能已成功寫入；同一 id 只回讀原事件，絕不再增加一次 PRN 使用。
    const { data: existing, error: readError } = await supabase
      .from('prn_medication_events')
      .select(PRN_EVENT_SELECT)
      .eq('id', eventId)
      .eq('patient_id', input.plan.patient_id)
      .single()
    if (readError) throw readError
    return existing as PrnMedicationEvent
  }
  if (error) throw error
  return data as PrnMedicationEvent
}

export async function voidPrnMedicationEvent(event: PrnMedicationEvent, patientId: string, reason: string) {
  const cleanReason = reason.trim()
  if (!cleanReason) throw new Error('A reason is required to void a PRN event')
  if (isDemoMode() && isDemoPatientId(patientId)) return voidDemoPrnMedicationEvent(event.id, patientId, cleanReason)
  const { data, error } = await supabase
    .from('prn_medication_events')
    .update({ status: 'voided', void_reason: cleanReason })
    .eq('id', event.id)
    .eq('patient_id', patientId)
    .select(PRN_EVENT_SELECT)
    .single()
  if (error) throw error
  return data as PrnMedicationEvent
}

export async function updatePrnMedicationEffectStatus(event: PrnMedicationEvent, patientId: string, effectStatus: PrnMedicationEffectStatus) {
  if (isDemoMode() && isDemoPatientId(patientId)) return updateDemoPrnMedicationEffectStatus(event.id, patientId, effectStatus)
  const { data, error } = await supabase
    .from('prn_medication_events')
    .update({ effect_status: effectStatus })
    .eq('id', event.id)
    .eq('patient_id', patientId)
    .select(PRN_EVENT_SELECT)
    .single()
  if (error) throw error
  return data as PrnMedicationEvent
}

export async function savePrnDailyAssessment(patientId: string, planId: string, careDate: string, status: PrnMedicationAssessmentStatus, notes = '') {
  const payload = { patient_id: patientId, plan_id: planId, care_date: careDate, status, notes: notes.trim() || null }
  if (isDemoMode() && isDemoPatientId(patientId)) return saveDemoPrnDailyAssessment(payload)
  const { data, error } = await supabase
    .from('prn_medication_daily_assessments')
    .upsert(payload, { onConflict: 'patient_id,plan_id,care_date' })
    .select(PRN_ASSESSMENT_SELECT)
    .single()
  if (error) throw error
  return data as PrnMedicationDailyAssessment
}

export function prnEffectStatusLabel(status: PrnMedicationEffectStatus) {
  return formatPrnEffectStatus(status)
}

export function prnCalendarDateLabel(value: string) {
  return calendarDateKey(dayjs(value))
}
