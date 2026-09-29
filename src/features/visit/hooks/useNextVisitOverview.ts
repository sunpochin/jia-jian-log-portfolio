/*
檔案用途：門診頁的讀取狀態容器（照護閉環 T5，issue #949）——一次讀齊到期提醒、回診問題清單與最近的看診紀錄
（health_visit），各自標記讀不到，供「下次」卡與「醫師說了什麼」使用；純讀取不寫入。
所在層：src/features/visit/hooks；依 AGENTS.md Rule A／C 把三個來源的讀取與展示模式邊界從頁面元件下放到這裡，
NextVisitPage 只拿回傳結果去渲染。
主要關聯：src/lib/careDueReminders.ts、src/lib/visitQuestions.ts、care_timeline_entries（只讀 health_visit 的摘要欄位）、
src/lib/visitOutcomes.ts（配對純函式）、demoStorage（展示模式的本機時間線）。
*/
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../../lib/supabase'
import { isDemoPatientId } from '../../../lib/demoData'
import { readDemoCareTimeline } from '../../../lib/demoStorage'
import { listCareDueReminders, type CareDueReminder } from '../../../lib/careDueReminders'
import { listVisitQuestions, type VisitQuestion } from '../../../lib/visitQuestions'
import type { HealthVisitSummary } from '../../../lib/visitOutcomes'

export interface NextVisitOverview {
  loading: boolean
  reminders: CareDueReminder[]
  questions: VisitQuestion[]
  visits: HealthVisitSummary[]
  // 三個來源各自的讀取失敗旗標：門診頁要能說「哪一段讀不到」，不能把三段混成一個 error（Rule C）。
  unavailable: { reminders: boolean; questions: boolean; visits: boolean }
  // 展示模式：提醒與問題清單沒有種子資料也對 anon 撤銷了讀取，直接標記而不是打注定失敗的請求；
  // 看診紀錄則走本機展示時間線，讓 /demo 的「醫師說了什麼」至少有看診可看。
  demo: boolean
  refresh: () => void
}

// 「醫師說了什麼」只需要最近幾次看診就夠配對；答案最多回溯 14 天，30 筆看診遠超過任何家庭的回診密度。
const HEALTH_VISIT_LIMIT = 30

type LoadedState = {
  patientId: string
  reminders: CareDueReminder[]
  questions: VisitQuestion[]
  visits: HealthVisitSummary[]
  unavailable: NextVisitOverview['unavailable']
}

function byOccurredDesc(left: HealthVisitSummary, right: HealthVisitSummary) {
  return right.occurred_at.localeCompare(left.occurred_at)
}

async function readHealthVisits(patientId: string): Promise<HealthVisitSummary[]> {
  const { data, error } = await supabase
    .from('care_timeline_entries')
    .select('id, patient_id, title, occurred_at, visit_kind, visit_department, visit_institution')
    .eq('patient_id', patientId)
    .eq('event_type', 'health_visit')
    .order('occurred_at', { ascending: false })
    .limit(HEALTH_VISIT_LIMIT)
  if (error) throw error
  return (data ?? []) as HealthVisitSummary[]
}

async function guarded<T>(source: 'reminders' | 'questions' | 'visits', read: () => Promise<T>, empty: T): Promise<{ data: T; failed: boolean }> {
  try {
    return { data: await read(), failed: false }
  } catch (error) {
    // 訊息字串保持常數、來源名稱當獨立參數：Semgrep unsafe-formatstring 規則（security-ci）會擋
    // console.* 第一個參數含變數的樣板字串，且常數前綴也比較好在 log 裡 grep。
    console.error('[next visit read error]', source, error)
    return { data: empty, failed: true }
  }
}

export function useNextVisitOverview(patientId: string): NextVisitOverview {
  // 為什麼把 patientId 存進狀態：切換病人後、新資料還沒回來的那一瞬間，不能拿上一位病人的提醒或答案渲染
  // （AGENTS.md § 3.5：切換照護對象後不得殘留另一人的資料）。
  const [state, setState] = useState<LoadedState | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const demo = isDemoPatientId(patientId)

  useEffect(() => {
    let cancelled = false
    setState(null)
    if (demo) {
      const visits = readDemoCareTimeline(patientId)
        .filter(entry => entry.event_type === 'health_visit')
        .map(entry => ({ id: entry.id, patient_id: entry.patient_id, title: entry.title, occurred_at: entry.occurred_at, visit_kind: entry.visit_kind ?? null, visit_department: entry.visit_department ?? null, visit_institution: entry.visit_institution ?? null }))
        .sort(byOccurredDesc)
      setState({ patientId, reminders: [], questions: [], visits, unavailable: { reminders: false, questions: false, visits: false } })
      return
    }
    void Promise.all([
      guarded('reminders', () => listCareDueReminders(patientId), [] as CareDueReminder[]),
      guarded('questions', () => listVisitQuestions(patientId), [] as VisitQuestion[]),
      guarded('visits', () => readHealthVisits(patientId), [] as HealthVisitSummary[]),
    ]).then(([reminders, questions, visits]) => {
      if (cancelled) return
      setState({
        patientId,
        reminders: reminders.data,
        questions: questions.data,
        visits: visits.data,
        unavailable: { reminders: reminders.failed, questions: questions.failed, visits: visits.failed },
      })
    })
    return () => { cancelled = true }
  }, [patientId, demo, reloadKey])

  const refresh = useCallback(() => setReloadKey(key => key + 1), [])
  const current = state?.patientId === patientId ? state : null

  return {
    loading: current === null,
    reminders: current?.reminders ?? [],
    questions: current?.questions ?? [],
    visits: current?.visits ?? [],
    unavailable: current?.unavailable ?? { reminders: false, questions: false, visits: false },
    demo,
    refresh,
  }
}
