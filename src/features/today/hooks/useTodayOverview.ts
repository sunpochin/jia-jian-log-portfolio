/*
檔案用途：整理「今天頁」需要的讀取狀態與衍生資料（最近血壓摘要、需要留意清單），純讀取不寫入。
所在層：src/features/today/hooks；依 AGENTS.md Rule A／C 把資料整理與離線判斷從頁面元件下放到這裡，
TodayPage 只需要拿這個 hook 回傳的結果去渲染，不自己組合查詢邏輯。
主要關聯：組合既有的 useBpRecords、summarizeBpRecords（dashboardStats.ts）、pendingReassessments（careTimeline.ts）
與到期提醒（careDueReminders.ts）；不新增資料表，也不重寫這些函式各自的邏輯。
*/
import { useEffect, useMemo, useState } from 'react'
import { useBpRecords } from '../../../hooks/useBpRecords'
import { summarizeBpRecords, type DashboardSummary } from '../../../lib/dashboardStats'
import { useBpEvaluator } from '../../vitals/hooks/useBpEvaluator'
import { calendarDateKey } from '../../../lib/careDay'
import { pendingReassessments, type CareTimelineEntry } from '../../../lib/careTimeline'
import {
  classifyReminderDueLevel,
  computeRemainingDays,
  listCareDueReminders,
  REMINDER_TYPE_META,
  type CareDueReminder,
  type ReminderDueLevel,
} from '../../../lib/careDueReminders'
import { isDemoPatientId } from '../../../lib/demoData'
import { readDemoCareTimeline } from '../../../lib/demoStorage'
import { supabase } from '../../../lib/supabase'
import { useI18n } from '../../../lib/i18n'
import type { BpRecord } from '../../../types/database'
import { useCareAnomalySignals } from './useCareAnomalySignals'

// 「無法讀取」離線文案：三語都要有，不能只靠英文 fallback（AGENTS.md 印尼文優先原則）。
const OFFLINE_MESSAGE = { id: 'Tidak dapat dimuat. Periksa koneksi lalu coba lagi.', zh: '無法讀取，請確認網路後再試。', en: 'Unable to load. Check your connection and try again.' }

export type TodayAttentionItem = {
  id: string
  tone: ReminderDueLevel
  title: string
  description: string
  // F 期看護密度模式用：true 代表「今天就要處理」（已逾期，或到期日就是今天）。
  // due_soon 的到期提醒可能還有好幾天緩衝，不算「今天要做」，只有逾期或到期日=今天才算。
  dueToday: boolean
}

export interface TodayOverview {
  loading: boolean
  offline: boolean
  errorMessage: string | null
  bpSummary: DashboardSummary
  latestBpRecord: BpRecord | null
  bpRecords: BpRecord[]
  attentionItems: TodayAttentionItem[]
  // F 期看護密度模式：只保留「今天要做」的項目（見 TodayAttentionItem.dueToday 的判斷邏輯），
  // 讓 TodayPage 在密度模式開啟時可以直接使用，不必自己重算一次到期邏輯。
  todayAttentionItems: TodayAttentionItem[]
  // 由呼叫端（TodayPage）依設定頁的看護密度模式開關決定，這裡不自己判斷角色或語系
  // （#716 第 2 項已排除語系／can_manage_medication 當依據）。
  density: 'family' | 'caregiver'
  // issue #887：useCareAnomalySignals 的體重／服藥／藥單查詢任一失敗時為 true，代表觀察級
  // 異常示警這一輪沒有真正檢查完成，attentionItems 可能因此少列了本來該出現的項目。
  // TodayPage 用這個旗標區分「清單真的是空的」與「有一項檢查沒做成」，不能只看 attentionItems.length。
  anomalyCheckFailed: boolean
}

// 只讀時間軸列出「待複評」所需的最少欄位；今天頁不需要照片或用藥變更快照等重量級欄位，
// 避免今天頁的初始載入被事件頁才需要的圖片簽署流程拖慢。
type TimelineEntryForReassessment = Pick<CareTimelineEntry, 'id' | 'patient_id' | 'event_type' | 'title' | 'details' | 'occurred_at' | 'reassess_on' | 'created_by' | 'created_at' | 'medication_plan_id'>

export function useTodayOverview(patientId: string, options?: { densityMode?: boolean }): TodayOverview {
  const densityMode = options?.densityMode ?? false
  const { text } = useI18n()
  const evaluator = useBpEvaluator()
  const { records: bpRecords, loading: bpLoading, error: bpError, isOfflineData } = useBpRecords(7, patientId)
  const { items: anomalyItems, loading: anomalyLoading, checkFailed: anomalyCheckFailed } = useCareAnomalySignals(patientId)
  const [timelineEntries, setTimelineEntries] = useState<TimelineEntryForReassessment[]>([])
  const [timelineLoading, setTimelineLoading] = useState(true)
  const [timelineError, setTimelineError] = useState(false)
  const [reminders, setReminders] = useState<CareDueReminder[]>([])
  const [remindersLoading, setRemindersLoading] = useState(true)
  const [remindersError, setRemindersError] = useState(false)

  useEffect(() => {
    let cancelled = false
    setTimelineLoading(true)
    setTimelineError(false)
    // 展示模式的照護紀錄表對 anon 已撤銷 SELECT（見 CareTimeline.tsx 的相同判斷），直接讀本機種子＋本機新增合併結果。
    if (isDemoPatientId(patientId)) {
      setTimelineEntries(readDemoCareTimeline(patientId))
      setTimelineLoading(false)
      return
    }
    // 繁體中文註解：supabase-js 的查詢建構器只是 PromiseLike，沒有 .finally()；
    // 包成一般 Promise 再串接，才能跟其他讀取一樣統一收尾 loading 狀態。
    void Promise.resolve(
      supabase.from('care_timeline_entries')
        .select('id, patient_id, event_type, title, details, occurred_at, reassess_on, created_by, created_at, medication_plan_id')
        .eq('patient_id', patientId).order('occurred_at', { ascending: false }).limit(20),
    )
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) {
          console.error('[today overview timeline read error]', error)
          setTimelineEntries([])
          setTimelineError(true)
        } else {
          setTimelineEntries((data ?? []) as TimelineEntryForReassessment[])
        }
      })
      .finally(() => { if (!cancelled) setTimelineLoading(false) })
    return () => { cancelled = true }
  }, [patientId])

  useEffect(() => {
    let cancelled = false
    setRemindersLoading(true)
    setRemindersError(false)
    // 到期提醒目前不支援展示模式（同 CareDueRemindersPage 的既有限制），今天頁沿用同一條界線，不另外造假資料。
    if (isDemoPatientId(patientId)) {
      setReminders([])
      setRemindersLoading(false)
      return
    }
    listCareDueReminders(patientId)
      .then(rows => { if (!cancelled) setReminders(rows) })
      .catch(error => {
        console.error('[today overview reminders read error]', error)
        if (!cancelled) { setReminders([]); setRemindersError(true) }
      })
      .finally(() => { if (!cancelled) setRemindersLoading(false) })
    return () => { cancelled = true }
  }, [patientId])

  const today = calendarDateKey()
  const reassessments = useMemo(
    () => pendingReassessments(timelineEntries as CareTimelineEntry[], today),
    [timelineEntries, today],
  )

  const attentionItems = useMemo<TodayAttentionItem[]>(() => {
    const reminderItems = reminders
      .filter(reminder => reminder.status === 'active')
      .map(reminder => {
        const remainingDays = computeRemainingDays(reminder.due_date, today)
        return { reminder, remainingDays, tone: classifyReminderDueLevel(remainingDays, reminder.threshold_days) }
      })
      // 「今天要留意什麼」只列出真正需要行動的項目；門檻天數之外的提醒留給「到期提醒」頁的完整清單。
      .filter(({ tone }) => tone !== 'ok')
      .map(({ reminder, remainingDays, tone }): TodayAttentionItem => ({
        id: `reminder:${reminder.id}`,
        tone,
        title: text(REMINDER_TYPE_META[reminder.reminder_type].label),
        description: remainingDays < 0
          ? text({ id: `Terlambat ${Math.abs(remainingDays)} hari (jatuh tempo ${reminder.due_date})`, zh: `已逾期 ${Math.abs(remainingDays)} 天（到期日 ${reminder.due_date}）`, en: `${Math.abs(remainingDays)} days overdue (due ${reminder.due_date})` })
          : text({ id: `${remainingDays} hari lagi (jatuh tempo ${reminder.due_date})`, zh: `還剩 ${remainingDays} 天（到期日 ${reminder.due_date}）`, en: `${remainingDays} days left (due ${reminder.due_date})` }),
        // 逾期或到期日就是今天才算「今天要做」；still-due_soon 但還有好幾天緩衝的，留給「到期提醒」完整清單。
        dueToday: remainingDays <= 0,
      }))

    const reassessmentItems = reassessments.map((entry): TodayAttentionItem => {
      const isTodayOrOverdue = Boolean(entry.reassess_on && entry.reassess_on <= today)
      return {
        id: `reassessment:${entry.id}`,
        tone: isTodayOrOverdue ? 'overdue' : 'due_soon',
        // 事件標題是照護者自己輸入的文字，不是雙語資料，這裡直接沿用不重譯。
        title: entry.title,
        description: text({ id: `Perlu dinilai ulang pada ${entry.reassess_on}`, zh: `待複評日期：${entry.reassess_on}`, en: `Reassess by ${entry.reassess_on}` }),
        dueToday: isTodayOrOverdue,
      }
    })

    // 逾期永遠排最前面，讓半夜單手操作的看護第一眼就看到最急的項目；觀察級信號（tone='ok'，
    // 見 useCareAnomalySignals）永遠排最後——它們只記錄不催促，不該搶在真正待辦事項前面。
    // 用明確的優先序而非兩兩比較，是因為三種 tone 混在一起時，原本的兩兩比較不構成一致的排序規則。
    const TONE_RANK: Record<ReminderDueLevel, number> = { overdue: 0, due_soon: 1, ok: 2 }
    return [...reminderItems, ...reassessmentItems, ...anomalyItems].sort((a, b) => TONE_RANK[a.tone] - TONE_RANK[b.tone])
  }, [reminders, reassessments, anomalyItems, today, text])

  const todayAttentionItems = useMemo(
    () => attentionItems.filter(item => item.dueToday),
    [attentionItems],
  )

  const offline = isOfflineData || Boolean(bpError) || timelineError || remindersError

  return {
    loading: bpLoading || timelineLoading || remindersLoading || anomalyLoading,
    offline,
    errorMessage: offline ? text(OFFLINE_MESSAGE) : null,
    bpSummary: summarizeBpRecords(bpRecords, evaluator.resolver),
    latestBpRecord: bpRecords[0] ?? null,
    bpRecords,
    attentionItems,
    todayAttentionItems,
    density: densityMode ? 'caregiver' : 'family',
    anomalyCheckFailed,
  }
}
