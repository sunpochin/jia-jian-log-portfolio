/*
檔案用途：彙整血壓報告「近期醫療軌跡」需要的三個讀取來源——照護時間線區間查詢、到期提醒、藥單異動
歷史——並各自標記讀取狀態（ok／unavailable／not_applicable），供 usePreVisitSources 合併成軌跡清單。
所在層：src/lib 資料轉接層；隔離 Supabase 查詢、demo fallback 與錯誤處理，只回傳純資料給呼叫端。
主要關聯：由 src/features/vitals/hooks/usePreVisitSources.ts 呼叫，合併結果交給 src/lib/medicalTrajectory.ts。
*/
import { supabase } from './supabase'
import { isDemoMode } from './demoStorage'
import { readDemoCareTimeline } from './demoStorage'
import { isDemoPatientId, getFallbackDemoCareTimeline } from './demoData'
import { entriesInReportPeriod, type CareTimelineEntry } from './careTimeline'
import { readMedicationHistory, type MedicationPlanChangeLogView } from './medication/medications'
import { listCareDueReminders, type CareDueReminder } from './careDueReminders'
import { listLabResultsInRange } from './labResults'
import type { PatientLabResult } from '../types/database'

export type PreVisitSourceStatus = 'ok' | 'unavailable' | 'not_applicable'

export interface PreVisitSourceResult<T> {
  status: PreVisitSourceStatus
  data: T
}

// 集中定義在這裡（而不是呼叫端的 hook）：buildGptReportText（src/lib/recordReport.ts）也要能標示
// 「哪個來源目前讀不到」，兩邊都是 src/lib，不必讓純資料層去依賴 UI hook 才能共用同一個型別。
// labResults 選填：既有呼叫端（buildPreVisitBrief 的既有測試 fixture）不必補上這個欄位也能通過型別檢查。
export interface PreVisitSourceStatuses {
  medicationChanges: PreVisitSourceStatus
  timelineEntries: PreVisitSourceStatus
  dueReminders: PreVisitSourceStatus
  labResults?: PreVisitSourceStatus
}

// 調藥的正典來源沒有內建的區間查詢；報告視窗最長可達數月，20 筆的預設上限容易漏掉較舊的異動，
// 這裡直接放寬到一個對長照病人也夠用的上限，避免報告漏印「這段期間到底改過幾次藥」。
const MEDICATION_HISTORY_LIMIT = 200

async function readTimelineEntriesInRange(patientId: string, sinceIso: string, untilIso: string): Promise<PreVisitSourceResult<CareTimelineEntry[]>> {
  if (isDemoMode() && isDemoPatientId(patientId)) {
    return { status: 'ok', data: entriesInReportPeriod(readDemoCareTimeline(patientId), sinceIso, untilIso) }
  }
  const { data, error } = await supabase
    .from('care_timeline_entries')
    .select('id, patient_id, event_type, title, details, occurred_at, reassess_on, created_by, created_at, medication_plan_id, medication_plan_change_log_id')
    .eq('patient_id', patientId)
    .gte('occurred_at', sinceIso)
    .lte('occurred_at', untilIso)
    .order('occurred_at', { ascending: true })
  if (error) {
    // 正式查詢對展示病人一律會被 RLS 擋下（demo 已對 anon 撤銷 SELECT）；退回固定種子故事，
    // 才不會讓展示模式訪客因為連線方式不同而看到「無法讀取」。
    if (isDemoPatientId(patientId)) return { status: 'ok', data: entriesInReportPeriod(getFallbackDemoCareTimeline(), sinceIso, untilIso) }
    console.error('[pre-visit timeline read error]', error)
    return { status: 'unavailable', data: [] }
  }
  return { status: 'ok', data: (data ?? []) as CareTimelineEntry[] }
}

async function readDueReminders(patientId: string): Promise<PreVisitSourceResult<CareDueReminder[]>> {
  // care_due_reminders 沒有展示模式的種子資料或本機 fallback；硬打真正的查詢只會被 anon RLS 擋下，
  // 還會產生一次注定失敗的網路請求，違反「/demo 零網路請求」的驗收條件，因此直接回報不適用。
  if (isDemoMode() && isDemoPatientId(patientId)) return { status: 'not_applicable', data: [] }
  try {
    const data = await listCareDueReminders(patientId)
    return { status: 'ok', data }
  } catch (error) {
    console.error('[pre-visit due reminder read error]', error)
    return { status: 'unavailable', data: [] }
  }
}

async function readMedicationChangeHistory(patientId: string): Promise<PreVisitSourceResult<MedicationPlanChangeLogView[]>> {
  try {
    const data = await readMedicationHistory(patientId, MEDICATION_HISTORY_LIMIT)
    return { status: 'ok', data }
  } catch (error) {
    console.error('[pre-visit medication history read error]', error)
    return { status: 'unavailable', data: [] }
  }
}

async function readLabResults(patientId: string, sinceIso: string, untilIso: string): Promise<PreVisitSourceResult<PatientLabResult[]>> {
  // patient_lab_results 沒有展示模式的種子資料，比照到期提醒直接回報不適用，避免 /demo 產生注定失敗的查詢。
  if (isDemoMode() && isDemoPatientId(patientId)) return { status: 'not_applicable', data: [] }
  try {
    const data = await listLabResultsInRange(patientId, sinceIso, untilIso)
    return { status: 'ok', data }
  } catch (error) {
    console.error('[pre-visit lab result read error]', error)
    return { status: 'unavailable', data: [] }
  }
}

export interface PreVisitSources {
  medicationChanges: PreVisitSourceResult<MedicationPlanChangeLogView[]>
  timelineEntries: PreVisitSourceResult<CareTimelineEntry[]>
  dueReminders: PreVisitSourceResult<CareDueReminder[]>
  labResults: PreVisitSourceResult<PatientLabResult[]>
}

export async function readPreVisitSources(patientId: string, sinceIso: string, untilIso: string): Promise<PreVisitSources> {
  const [medicationChanges, timelineEntries, dueReminders, labResults] = await Promise.all([
    readMedicationChangeHistory(patientId),
    readTimelineEntriesInRange(patientId, sinceIso, untilIso),
    readDueReminders(patientId),
    readLabResults(patientId, sinceIso, untilIso),
  ])
  return { medicationChanges, timelineEntries, dueReminders, labResults }
}
