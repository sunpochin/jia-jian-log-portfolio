/*
檔案用途：讀取軌跡頁需要的三個來源（照護時間線、藥單異動歷史、到期提醒），合併成單一時間軸事件清單，
並另外彙整血壓週摘要列；只負責「讀」，新增／編輯／刪除事件的狀態集中在 useTrajectoryEntryForm。
所在層：src/features/care-family/hooks；依 AGENTS Rule A（狀態容器 hook）與 Rule C（讀/寫狀態分離）拆出。
主要關聯：src/lib/medicalTrajectory.ts 的 buildCareTrajectoryFeed、src/lib/bpWeeklySummary.ts、
src/hooks/useBpRecords.ts、由 src/features/care-family/pages/TrajectoryPage.tsx 呼叫（issue #735，#659 D 期）。
*/
import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../../../lib/supabase'
import { buildCareTrajectoryFeed, type TrajectoryEvent } from '../../../lib/medicalTrajectory'
import { summarizeWeeklyBpRecords, type WeeklyBpSummary } from '../../../lib/bpWeeklySummary'
import { readMedicationHistory } from '../../../lib/medication/medications'
import { listCareDueReminders, type CareDueReminder } from '../../../lib/careDueReminders'
import { isDemoPatientId, getFallbackDemoCareTimeline } from '../../../lib/demoData'
import { isDemoMode, readDemoCareTimeline } from '../../../lib/demoStorage'
import { normalizeCareEventPhotoPaths, signCareEventPhotoPathsBestEffort } from '../../../lib/careEventPhotos'
import { useBpRecords } from '../../../hooks/useBpRecords'
import { useLatestRequest } from '../../../hooks/useLatestRequest'
import { useI18n, type LocalizedText } from '../../../lib/i18n'
import type { CareTimelineEntry } from '../../../lib/careTimeline'

// 藥單異動沿用 preVisitSources.ts 選的上限（長照病人的異動筆數可觀，20 筆的預設值容易漏掉較舊紀錄）；
// 時間線改用同一個量級，讓「軌跡」真的能取代原本各自獨立的事件 tab 與變更藥物子頁，不因合併反而看得更少。
const TRAJECTORY_HISTORY_LIMIT = 200
// 週摘要至少要能看到半年的血壓走勢，同時也是 ContextReading／EventReview 用的「附近讀值」資料來源。
const TRAJECTORY_BP_WINDOW_DAYS = 182

const LOAD_ERROR_TEXT: LocalizedText = {
  id: 'Riwayat perawatan belum dapat dibaca. Periksa jaringan lalu coba lagi.',
  zh: '照護軌跡暫時無法讀取，請確認網路後重試。',
  en: 'The care trajectory could not be read right now, please check your network and try again.',
}

async function readTimelineEntries(patientId: string): Promise<CareTimelineEntry[]> {
  if (isDemoMode() && isDemoPatientId(patientId)) return readDemoCareTimeline(patientId)
  const { data, error } = await supabase.from('care_timeline_entries')
    .select('id, patient_id, event_type, title, details, occurred_at, reassess_on, created_by, created_at, medication_plan_id, medication_plan_change_log_id, photo_paths')
    .eq('patient_id', patientId).order('occurred_at', { ascending: false }).limit(TRAJECTORY_HISTORY_LIMIT)
  if (error) {
    // 正式查詢對展示病人一律會被 RLS 擋下（demo 已對 anon 撤銷 SELECT）；退回固定種子故事，
    // 才不會讓展示模式訪客因為連線方式不同而看到「無法讀取」（沿用 preVisitSources.ts 同一套判斷）。
    if (isDemoPatientId(patientId)) return getFallbackDemoCareTimeline()
    throw error
  }
  const rawEntries = (data ?? []) as CareTimelineEntry[]
  // 列表只簽縮圖，原圖等使用者點擊才簽，避免每次打開軌跡頁都觸發不必要的流量（沿用 CareTimeline 既有作法）。
  const thumbnailPaths = rawEntries.flatMap(entry => normalizeCareEventPhotoPaths(entry.photo_paths).map(photo => photo.thumbnail_path))
  try {
    const thumbnailUrls = await signCareEventPhotoPathsBestEffort(thumbnailPaths)
    return rawEntries.map(entry => ({
      ...entry,
      photo_paths: normalizeCareEventPhotoPaths(entry.photo_paths).map(photo => ({ ...photo, thumbnailUrl: thumbnailUrls[photo.thumbnail_path] })),
    }))
  } catch (photoError) {
    // 照片簽署失敗不應讓照護者連文字事件也看不到；點擊照片時仍可再次嘗試取得原圖。
    console.error('[care trajectory photo URL error]', photoError)
    return rawEntries
  }
}

async function readDueReminders(patientId: string): Promise<CareDueReminder[]> {
  // care_due_reminders 沒有展示模式的種子資料或本機 fallback；硬打查詢只會被 anon RLS 擋下，
  // 還會產生一次注定失敗的網路請求，違反「/demo 零網路請求」的驗收條件（沿用 preVisitSources.ts 判斷）。
  if (isDemoMode() && isDemoPatientId(patientId)) return []
  return listCareDueReminders(patientId)
}

export function useCareTrajectoryFeed(patientId: string) {
  const { text } = useI18n()
  const [events, setEvents] = useState<TrajectoryEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const { records: bpRecords, loading: bpLoading, error: bpError } = useBpRecords(TRAJECTORY_BP_WINDOW_DAYS, patientId)
  const request = useLatestRequest()

  const refresh = useCallback(async () => {
    // 切換照護對象時前一位的查詢可能較晚回來；過期結果一律不得回寫，避免把上一位病人的軌跡
    // 短暫顯示在目前選定的對象底下（沿用 useBpRecords／useLatestRequest 既有的競態防護模式）。
    const isCurrent = request.begin()
    setLoading(true)
    setLoadError(null)
    try {
      const [timelineEntries, changeLogs, dueReminders] = await Promise.all([
        readTimelineEntries(patientId),
        readMedicationHistory(patientId, TRAJECTORY_HISTORY_LIMIT),
        readDueReminders(patientId),
      ])
      if (!isCurrent()) return
      setEvents(buildCareTrajectoryFeed({ changeLogs, timelineEntries, dueReminders }))
    } catch (error) {
      if (!isCurrent()) return
      console.error('[care trajectory feed read error]', error)
      setEvents([])
      setLoadError(text(LOAD_ERROR_TEXT))
    } finally {
      if (isCurrent()) setLoading(false)
    }
  }, [patientId, request, text])

  useEffect(() => { void refresh() }, [refresh])

  const weeklyBp: WeeklyBpSummary[] = useMemo(() => summarizeWeeklyBpRecords(bpRecords), [bpRecords])
  // useBpRecords 只在「連快取都沒有」時才回報 error；有快取時它會改標記 isOfflineData 並照樣回傳資料，
  // 因此這裡的 bpUnavailable 只代表「血壓真的完全讀不到」，不是「這段期間沒有量測」——兩者必須讓
  // TrajectoryEventList 分開呈現，避免把「無法讀取」誤植成「確認沒有異動」。
  const bpUnavailable = Boolean(bpError)

  return { events, weeklyBp, bpRecords, bpUnavailable, loading: loading || bpLoading, loadError, refresh }
}
