/*
檔案用途：組合「近期醫療軌跡」與「就診前摘要」（S2）報告段落需要的資料——時間線區間、藥單異動、
到期提醒與擴寬血壓基線——並依 AGENTS.md Rule C 把讀取狀態獨立於報告本身既有的送出／匯出狀態。
所在層：src/features/vitals/hooks；由 BloodPressureReportPanel 呼叫，結果交給 TrajectorySection 與
buildPreVisitBrief（PreVisitBriefSection）呈現。
主要關聯：src/lib/preVisitSources.ts（資料轉接）、src/lib/medicalTrajectory.ts（純函式合併，S1）、
src/lib/preVisitBrief.ts（規則引擎，S2）、src/hooks/useBpRecords.ts（擴寬視窗照抄它的
careDayWindow／patientScopedCacheKey 用法，見下方常數說明）。
*/
import { useEffect, useState } from 'react'
import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import timezone from 'dayjs/plugin/timezone'
import { useBpRecords } from '../../../hooks/useBpRecords'
import { useLatestRequest } from '../../../hooks/useLatestRequest'
import { readPreVisitSources, type PreVisitSourceStatuses } from '../../../lib/preVisitSources'
import { buildMedicalTrajectory, type TrajectoryEvent } from '../../../lib/medicalTrajectory'
import { reportWindow, REPORT_TIMEZONE } from '../../../lib/recordReport'
import type { BpRecord } from '../../../types/database'
import type { CareDueReminder } from '../../../lib/careDueReminders'
import type { PreVisitBriefWindow } from '../../../lib/preVisitBrief'
import type { PatientLabResult } from '../../../types/database'

dayjs.extend(utc)
dayjs.extend(timezone)

// S2 的 R1 規則需要每筆調藥「前後 7 天」的血壓基線做比對，而調藥本身也可能落在報告視窗起點前 7 天
// （見 medicalTrajectory.ts 的視窗判斷），兩段 7 天疊加才是這裡要多抓的份量。
const BASELINE_LOOKBACK_EXTRA_DAYS = 14

export type { PreVisitSourceStatuses } from '../../../lib/preVisitSources'

const INITIAL_SOURCE_STATUS: PreVisitSourceStatuses = { medicationChanges: 'ok', timelineEntries: 'ok', dueReminders: 'ok', labResults: 'ok' }

export interface UsePreVisitSourcesResult {
  events: TrajectoryEvent[]
  sourceStatus: PreVisitSourceStatuses
  // 只給 S2 的規則引擎使用；報告畫面與 CSV 一律只顯示 selectedDays，不得直接呈現這份陣列。
  baselineRecords: BpRecord[]
  // 刻意保留未過濾的原始清單（不是 buildMedicalTrajectory 已篩過 status === 'active' 與視窗的
  // due_reminder events）：S2 的 R2／R3 需要自己判斷「現在仍逾期未續開」，不能只看落在報告視窗內、
  // 且已經被篩過的到期提醒，否則會漏掉到期日在視窗之外但現在仍逾期的提醒。
  dueReminders: CareDueReminder[]
  // 落在報告視窗內的檢驗值，供 S4 的 R5 規則判讀是否超出該筆報告自己的參考值。
  labResults: PatientLabResult[]
  // 報告視窗本身（ISO 字串），供 buildPreVisitBrief 的 R6（量測涵蓋率）計算區間總天數用，
  // 呼叫端不必自己重算一次 reportWindow。
  window: PreVisitBriefWindow
  loading: boolean
}

const INITIAL_WINDOW: PreVisitBriefWindow = { start: '', end: '' }

export function usePreVisitSources(patientId: string, selectedDays: number): UsePreVisitSourcesResult {
  const [events, setEvents] = useState<TrajectoryEvent[]>([])
  const [sourceStatus, setSourceStatus] = useState<PreVisitSourceStatuses>(INITIAL_SOURCE_STATUS)
  const [dueReminders, setDueReminders] = useState<CareDueReminder[]>([])
  const [labResults, setLabResults] = useState<PatientLabResult[]>([])
  const [window, setWindow] = useState<PreVisitBriefWindow>(INITIAL_WINDOW)
  const [loading, setLoading] = useState(true)
  const request = useLatestRequest()

  // 直接呼叫 useBpRecords(selectedDays + 14, ...)：它內部的 patientScopedCacheKey 把 days 編進 key，
  // 天數不同就是不同的快取鍵，天生跟 BloodPressureReportPanel 自己那份 useBpRecords(selectedDays, ...)
  // 分開儲存，不會互相覆蓋，也不需要另外重寫一份查詢與離線快取邏輯。
  const { records: baselineRecords } = useBpRecords(selectedDays + BASELINE_LOOKBACK_EXTRA_DAYS, patientId)

  useEffect(() => {
    const isCurrent = request.begin()
    setLoading(true)
    const reportWindowValue = reportWindow(selectedDays, dayjs().tz(REPORT_TIMEZONE))
    const sinceIso = reportWindowValue.start.toISOString()
    const untilIso = reportWindowValue.end.toISOString()
    readPreVisitSources(patientId, sinceIso, untilIso).then(sources => {
      if (!isCurrent()) return
      setSourceStatus({
        medicationChanges: sources.medicationChanges.status,
        timelineEntries: sources.timelineEntries.status,
        dueReminders: sources.dueReminders.status,
        labResults: sources.labResults.status,
      })
      setDueReminders(sources.dueReminders.data)
      setLabResults(sources.labResults.data)
      setWindow({ start: sinceIso, end: untilIso })
      setEvents(buildMedicalTrajectory({
        changeLogs: sources.medicationChanges.data,
        timelineEntries: sources.timelineEntries.data,
        dueReminders: sources.dueReminders.data,
        windowStart: sinceIso,
        windowEnd: untilIso,
      }))
      setLoading(false)
    })
  }, [patientId, selectedDays, request])

  return { events, sourceStatus, baselineRecords, dueReminders, labResults, window, loading }
}
