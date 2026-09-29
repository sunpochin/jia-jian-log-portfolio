/*
檔案用途：/demo 展示模式的頓服藥（PRN）本機存取——用藥事件的新增與作廢、效果回報，以及每日整體評估。
所在層：src/lib/demoStorage；頓服藥領域，與 ./medication 的例行藥單／服藥紀錄分開，狀態仍共用 ./store。
主要關聯：由 lib/medication/prnMedication.ts 經 demoStorage/index.ts 呼叫。
*/
import type { PrnMedicationDailyAssessment, PrnMedicationEvent } from '../../types/database'
import { DEMO_VISITOR_EMAIL, loadState, localId, saveState } from './store'

type DemoPrnEventInsert = Pick<PrnMedicationEvent, 'id' | 'patient_id' | 'plan_id' | 'medication_id' | 'taken_at' | 'care_date' | 'dose_amount' | 'dose_unit' | 'reason' | 'effect_status' | 'notes'> & {
  recorded_by_email: string
}

export function readDemoPrnMedicationDay(patientId: string, date: string, planIds: string[]) {
  const state = loadState()
  const selectedPlanIds = new Set(planIds)
  return {
    // 展示模式仍保留 voided 歷史，讓畫面可驗證「次數只算 active、作廢仍可追溯」的資料語意。
    events: (state.prnMedicationEvents ?? []).filter(event => event.patient_id === patientId && event.care_date === date && selectedPlanIds.has(event.plan_id)),
    assessments: (state.prnMedicationAssessments ?? []).filter(assessment => assessment.patient_id === patientId && assessment.care_date === date && selectedPlanIds.has(assessment.plan_id)),
  }
}

export function saveDemoPrnMedicationEvent(payload: DemoPrnEventInsert): PrnMedicationEvent {
  const state = loadState()
  const existing = (state.prnMedicationEvents ?? []).find(event => event.id === payload.id && event.patient_id === payload.patient_id)
  if (existing) return existing
  const now = new Date().toISOString()
  const event: PrnMedicationEvent = {
    ...payload,
    recorded_by_user_id: null,
    recorded_by_email: payload.recorded_by_email,
    status: 'active',
    voided_at: null,
    voided_by_user_id: null,
    voided_by_email: null,
    void_reason: null,
    created_at: now,
  }
  saveState({ ...state, prnMedicationEvents: [...(state.prnMedicationEvents ?? []), event] })
  return event
}

export function voidDemoPrnMedicationEvent(eventId: string, patientId: string, reason: string): PrnMedicationEvent {
  const state = loadState()
  const existing = (state.prnMedicationEvents ?? []).find(event => event.id === eventId && event.patient_id === patientId)
  if (!existing) throw new Error('Demo PRN event not found')
  if (existing.status === 'voided') return existing
  const now = new Date().toISOString()
  const voided = { ...existing, status: 'voided' as const, voided_at: now, voided_by_email: DEMO_VISITOR_EMAIL, void_reason: reason }
  saveState({ ...state, prnMedicationEvents: (state.prnMedicationEvents ?? []).map(event => event.id === eventId ? voided : event) })
  return voided
}

export function updateDemoPrnMedicationEffectStatus(eventId: string, patientId: string, effectStatus: PrnMedicationEvent['effect_status']): PrnMedicationEvent {
  const state = loadState()
  const existing = (state.prnMedicationEvents ?? []).find(event => event.id === eventId && event.patient_id === patientId)
  if (!existing) throw new Error('Demo PRN event not found')
  if (existing.status === 'voided') throw new Error('Voided PRN event cannot be assessed')
  const updated = { ...existing, effect_status: effectStatus }
  // Demo 也只改效果欄位；保留原始使用時間與劑量，讓展示流程和正式 append-only 邊界一致。
  saveState({ ...state, prnMedicationEvents: (state.prnMedicationEvents ?? []).map(event => event.id === eventId ? updated : event) })
  return updated
}

export function saveDemoPrnDailyAssessment(payload: Pick<PrnMedicationDailyAssessment, 'patient_id' | 'plan_id' | 'care_date' | 'status' | 'notes'>): PrnMedicationDailyAssessment {
  const state = loadState()
  const now = new Date().toISOString()
  const existing = (state.prnMedicationAssessments ?? []).find(assessment => assessment.patient_id === payload.patient_id && assessment.plan_id === payload.plan_id && assessment.care_date === payload.care_date)
  const assessment: PrnMedicationDailyAssessment = existing
    ? { ...existing, ...payload, assessed_at: now, assessed_by_email: DEMO_VISITOR_EMAIL, updated_at: now }
    : { id: localId('prn-assessment'), ...payload, assessed_at: now, assessed_by_user_id: null, assessed_by_email: DEMO_VISITOR_EMAIL, created_at: now, updated_at: now }
  const assessments = existing
    ? (state.prnMedicationAssessments ?? []).map(item => item.id === existing.id ? assessment : item)
    : [...(state.prnMedicationAssessments ?? []), assessment]
  saveState({ ...state, prnMedicationAssessments: assessments })
  return assessment
}
