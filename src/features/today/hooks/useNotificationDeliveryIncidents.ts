/*
檔案用途：「今天」頁讀取 sweeper 告警（notification_delivery_incidents）的狀態 hook——某位病人的 open incident、讀取失敗旗標、
  結案動作；切換病人時立刻清空並讓進行中的舊請求失效，不得殘留上一位病人的 incident（AGENTS.md § 3.5）。
  頁面停留期間每 INCIDENT_POLL_INTERVAL_MS 背景補查一次、回到前景（分頁重新可見／視窗取得焦點）也補查：sweeper 每 5 分鐘
  才跑，「指名的消費者」若只在掛載時讀一次，看護把今天頁開著就永遠看不到之後新開或重開的告警（PR #993 Codex P1）。
所在層：src/features/today/hooks；依 AGENTS.md Rule C 把「讀取狀態」與「結案（寫入）狀態」分開管理，TodayPage 只拿結果渲染。
主要關聯：src/lib/notificationDeliveryIncidents.ts（資料轉接）、src/features/today/components/NotificationIncidentBanner.tsx、
  docs/adr/007-notification-delivery-semantics.md（D7「告警必須有指名的消費者」、驗收第 26 項）。
*/
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  acknowledgeNotificationDeliveryIncident,
  fetchOpenNotificationDeliveryIncidents,
  type NotificationDeliveryIncident,
} from '../../../lib/notificationDeliveryIncidents'

export interface NotificationDeliveryIncidentsState {
  incidents: NotificationDeliveryIncident[]
  loading: boolean
  // Fail loudly：查詢失敗時為 true，畫面顯示「無法確認通知狀態」，不得顯示成沒有告警。
  checkFailed: boolean
  acknowledgingId: string | null
  acknowledgeFailed: boolean
  acknowledge: (incidentId: string) => Promise<void>
  refresh: () => void
}

type Loader = typeof fetchOpenNotificationDeliveryIncidents
type Acknowledger = typeof acknowledgeNotificationDeliveryIncident
// 排程與前景訂閱可注入：測試裡直接觸發 tick／回前景，不必等真的計時器。回傳值是取消函式。
type Scheduler = (tick: () => void, intervalMs: number) => () => void
type ForegroundSubscriber = (onForeground: () => void) => () => void

export interface NotificationDeliveryIncidentsDeps {
  load?: Loader
  acknowledge?: Acknowledger
  schedule?: Scheduler
  subscribeForeground?: ForegroundSubscriber
  pollIntervalMs?: number
}

type LoadedIncidents = { patientId: string; rows: NotificationDeliveryIncident[]; checkFailed: boolean; loading: boolean }
// 結案進行中／結案失敗的項目都帶著病人與 incident：切病人後的畫面不得把上一位病人還沒回來的結案當成自己的（按鈕會一直
// 「儲存中」）；失敗也只屬於那一筆 incident，它被別人結掉或 sweeper 關掉之後，同一位病人新開的告警不得再頂著「失敗」（PR #993 Codex P2）。
type AcknowledgementRef = { patientId: string; incidentId: string }
// 失敗記號還要綁世代（PR #993 Codex P2）：sweeper 重開 incident 是就地更新、id 不變，兩次補查之間可能「別人結掉 → 重開」，
// 下一次補查仍回同一個 id；只比 id 會把舊失敗黏到新一代告警上。
type AcknowledgementFailure = AcknowledgementRef & { generation: number }

// 為什麼是 60 秒：sweeper 每 5 分鐘掃一輪，告警最遲在下一輪補查出現（≤ 1 分鐘的延遲遠小於 sweeper 本身的節奏）；
// 查詢只是一張 RLS 分區的小表 SELECT，每分鐘一次對 Supabase 免費額度沒有感覺。分頁隱藏時不查，回前景時立刻補查。
export const INCIDENT_POLL_INTERVAL_MS = 60_000

const defaultSchedule: Scheduler = (tick, intervalMs) => {
  const handle = setInterval(tick, intervalMs)
  return () => clearInterval(handle)
}

const defaultSubscribeForeground: ForegroundSubscriber = onForeground => {
  if (typeof document === 'undefined' || typeof window === 'undefined') return () => {}
  const onVisibilityChange = () => { if (document.visibilityState === 'visible') onForeground() }
  document.addEventListener('visibilitychange', onVisibilityChange)
  window.addEventListener('focus', onForeground)
  return () => {
    document.removeEventListener('visibilitychange', onVisibilityChange)
    window.removeEventListener('focus', onForeground)
  }
}

function isDocumentHidden(): boolean {
  return typeof document !== 'undefined' && document.visibilityState === 'hidden'
}

// 為什麼要同步遮罩（PR #993 Codex P1）：useEffect 是被動的，切換病人後的**第一次 render** effect 還沒跑，
// hook 若直接回傳 state 就會把上一位病人的 incident 交給已經換成新病人的畫面——那一瞬間可以看到、甚至按掉
// 別人病人的漏送告警（AGENTS.md § 3.5）。所以已載入的列要帶著它們的 patient_id，與目前的 patientId 不符就在
// render 路徑同步回空（與 useUpcomingSchedule 的 selectScopedScheduleState 同一個做法）。
export function selectScopedIncidents(patientId: string, loaded: LoadedIncidents): Pick<LoadedIncidents, 'rows' | 'checkFailed' | 'loading'> {
  if (loaded.patientId === patientId) return loaded
  return { rows: [], checkFailed: false, loading: true }
}

// 同一個原則套在結案狀態上：只有「這位病人」進行中的結案才算進行中；上一位病人的結案回來與否都與這個畫面無關。
export function selectScopedAcknowledgingId(patientId: string, pending: AcknowledgementRef[]): string | null {
  return pending.find(entry => entry.patientId === patientId)?.incidentId ?? null
}

// 結案失敗只在「那一筆 incident 的同一世代仍在畫面上」時顯示：它已不在 open 清單（被別人結掉、sweeper 關掉），
// 或同一個 id 已是新一代（重開），就不再是這個橫幅的失敗。
export function selectScopedAcknowledgeFailed(patientId: string, rows: NotificationDeliveryIncident[], failures: AcknowledgementFailure[]): boolean {
  return failures.some(failure => failure.patientId === patientId && rows.some(incident => incident.id === failure.incidentId && incident.generation === failure.generation))
}

export function useNotificationDeliveryIncidents(
  patientId: string,
  deps: NotificationDeliveryIncidentsDeps = {},
): NotificationDeliveryIncidentsState {
  // 依賴放進 ref：呼叫端若每次 render 傳新的函式，不能因此重跑載入（那會在「清空 → 載入」之間形成無窮迴圈）。
  const loadRef = useRef(deps.load ?? fetchOpenNotificationDeliveryIncidents)
  loadRef.current = deps.load ?? fetchOpenNotificationDeliveryIncidents
  const acknowledgeRef = useRef(deps.acknowledge ?? acknowledgeNotificationDeliveryIncident)
  acknowledgeRef.current = deps.acknowledge ?? acknowledgeNotificationDeliveryIncident
  const scheduleRef = useRef(deps.schedule ?? defaultSchedule)
  scheduleRef.current = deps.schedule ?? defaultSchedule
  const subscribeForegroundRef = useRef(deps.subscribeForeground ?? defaultSubscribeForeground)
  subscribeForegroundRef.current = deps.subscribeForeground ?? defaultSubscribeForeground
  const pollIntervalMs = deps.pollIntervalMs ?? INCIDENT_POLL_INTERVAL_MS

  const [loaded, setLoaded] = useState<LoadedIncidents>({ patientId, rows: [], checkFailed: false, loading: true })
  // 最新已載入的列：結案的 catch 要判斷「這筆 incident 現在還在畫面上嗎」，不能用閉包裡按下按鈕當時的舊值。
  // 所有對 loaded 的寫入都走 commitLoaded：先同步更新 ref、再 setState（PR #993 Codex P2）。React 18 會把 Promise 回呼裡的
  // setState 批次處理，補查的結果與結案的失敗可能在同一個 tick 內先後到達、還沒 render；只在 render 時同步 ref 會讓
  // catch 看到上一個世代的列，替已被移除的 incident 記下失敗。
  const loadedRef = useRef(loaded)
  loadedRef.current = loaded
  const commitLoaded = useCallback((next: LoadedIncidents) => {
    loadedRef.current = next
    setLoaded(next)
  }, [])
  const [pendingAcknowledgements, setPendingAcknowledgements] = useState<AcknowledgementRef[]>([])
  const [acknowledgeFailures, setAcknowledgeFailures] = useState<AcknowledgementFailure[]>([])
  // 每次載入領一個序號；回來時序號已過期（病人已切換或已重新整理）就丟掉，避免慢的舊請求把新病人的畫面蓋掉。
  const requestSeqRef = useRef(0)
  const patientIdRef = useRef(patientId)
  patientIdRef.current = patientId

  // reset：切病人或首次載入，畫面先回「載入中、空清單」。background：頁面停留期間的補查，舊清單留在畫面上直到新結果回來
  // （不閃「載入中」）；補查失敗同樣標 checkFailed——讀不到 ≠ 沒有告警，也不能沿用舊清單裝作剛確認過。
  const runLoad = useCallback((targetPatientId: string, mode: 'reset' | 'background') => {
    const seq = ++requestSeqRef.current
    if (mode === 'reset') {
      // 已載入的列帶著 patient_id，render 路徑會先同步遮罩，這裡的重設只是讓 state 本身也對齊（同值就沿用同一個實例）。
      const current = loadedRef.current
      if (!(current.patientId === targetPatientId && current.loading && current.rows.length === 0 && !current.checkFailed)) {
        commitLoaded({ patientId: targetPatientId, rows: [], checkFailed: false, loading: true })
      }
    }
    loadRef.current(targetPatientId).then(rows => {
      if (requestSeqRef.current !== seq || patientIdRef.current !== targetPatientId) return
      commitLoaded({ patientId: targetPatientId, rows, checkFailed: false, loading: false })
      // 失敗記號跟著「incident＋世代」走：這一批已不含那筆同一世代的列（被別人結掉／sweeper 關掉／已重開成新一代）就丟掉。
      const stillListed = (failure: AcknowledgementFailure) => rows.some(incident => incident.id === failure.incidentId && incident.generation === failure.generation)
      setAcknowledgeFailures(current => (current.some(failure => failure.patientId === targetPatientId && !stillListed(failure))
        ? current.filter(failure => failure.patientId !== targetPatientId || stillListed(failure))
        : current))
    }).catch(() => {
      if (requestSeqRef.current !== seq || patientIdRef.current !== targetPatientId) return
      commitLoaded({ patientId: targetPatientId, rows: [], checkFailed: true, loading: false })
    })
  }, [commitLoaded])

  useEffect(() => {
    runLoad(patientId, 'reset')
    // 切病人：上一位病人進行中的結案與失敗記號不再屬於這個畫面（render 路徑已同步遮罩，這裡讓 state 也對齊）。
    const ownedByCurrentPatient = <T extends AcknowledgementRef>(entries: T[]): T[] => (entries.some(entry => entry.patientId !== patientId) ? entries.filter(entry => entry.patientId === patientId) : entries)
    setPendingAcknowledgements(ownedByCurrentPatient)
    setAcknowledgeFailures(ownedByCurrentPatient)
    // 卸載或切病人：讓還在路上的回應作廢。
    return () => { requestSeqRef.current += 1 }
  }, [patientId, runLoad])

  // 頁面停留期間的補查：每 pollIntervalMs 一次（分頁隱藏時跳過），回到前景立刻一次。切病人重新排程。
  useEffect(() => {
    const tick = () => { if (!isDocumentHidden()) runLoad(patientId, 'background') }
    const cancelTimer = scheduleRef.current(tick, pollIntervalMs)
    const unsubscribe = subscribeForegroundRef.current(() => runLoad(patientId, 'background'))
    return () => {
      cancelTimer()
      unsubscribe()
    }
  }, [patientId, pollIntervalMs, runLoad])

  const refresh = useCallback(() => runLoad(patientIdRef.current, 'background'), [runLoad])

  const acknowledge = useCallback(async (incidentId: string) => {
    const entry: AcknowledgementRef = { patientId: patientIdRef.current, incidentId }
    const sameIncident = (other: AcknowledgementRef) => other.patientId === entry.patientId && other.incidentId === entry.incidentId
    // 交出「畫面上看到的世代」（PR #993 Codex P1）：畫面上已經沒有這筆（補查剛移除）就不打 RPC，直接重讀。
    const displayed = loadedRef.current.patientId === entry.patientId ? loadedRef.current.rows.find(incident => incident.id === incidentId) : undefined
    if (!displayed) {
      runLoad(entry.patientId, 'background')
      return
    }
    setPendingAcknowledgements(current => [...current, entry])
    // 再按一次就清掉這一筆之前的失敗記號（只清這一筆）。
    setAcknowledgeFailures(current => (current.some(sameIncident) ? current.filter(failure => !sameIncident(failure)) : current))
    try {
      const outcome = await acknowledgeRef.current(incidentId, displayed.generation)
      if (outcome === 'stale') {
        // 世代已前進：這是一個照護者沒看過的新失敗，RPC 沒結案。不移除、改重讀，讓新一代的告警（與其按鈕）出現。
        if (patientIdRef.current === entry.patientId) runLoad(entry.patientId, 'background')
        return
      }
      // acknowledged／closed（已被別人結案或已關閉）都從畫面移除：它已經不是 open。只動同一位病人已載入的列（經 commitLoaded，ref 同步）。
      // 但只移除「還是結案那一代」的列（PR #993 Codex P1）：RPC 提交到回呼之間，sweeper 可能已把同一筆 id 重開成新一代、
      // 補查也已把它提交進畫面；照 id 移除會把看護沒看過的新告警一起抹掉。世代不同就保留並重讀。
      // 先讓「這位病人」還在路上的補查作廢（PR #993 Codex P2）：它在結案前就拍下了這一筆「仍 open」的快照，回來會把剛結掉的
      // 告警放回畫面、按鈕又亮起來。只限病人沒換的情況：病人已切換時，在途的是新病人的重設載入，作廢它會讓新病人卡在
      // 「載入中」直到下一次補查；舊病人的在途載入早已在切病人的 cleanup 裡作廢。必須在下面發出替代的重讀「之前」作廢，
      // 否則連這次重讀也一起被丟掉（PR #993 Codex P2）。
      if (patientIdRef.current === entry.patientId) requestSeqRef.current += 1
      const current = loadedRef.current
      const loadedRow = current.patientId === entry.patientId ? current.rows.find(incident => incident.id === incidentId) : undefined
      if (loadedRow && loadedRow.generation === displayed.generation) {
        commitLoaded({ ...current, rows: current.rows.filter(incident => incident.id !== incidentId) })
      } else if (loadedRow && patientIdRef.current === entry.patientId) {
        runLoad(entry.patientId, 'background')
      }
    } catch {
      // 只在這筆 incident 仍在目前已載入的列上時才記失敗（PR #993 Codex P2）：等待結案期間補查已把它移除（別人結掉／sweeper
      // 關掉）的話，這個失敗屬於上一個世代；記下來會讓同一個 id 之後因世代前進而重開時頂著舊失敗。
      // 記下的是「這一筆 id 的這一世代」：之後重開成新一代（id 不變）時，比對世代就不會再顯示這個失敗。
      const openRow = loadedRef.current.patientId === entry.patientId ? loadedRef.current.rows.find(incident => incident.id === incidentId) : undefined
      // 而且只在它仍是「結案那一代」時才記（PR #993 Codex P2）：RPC 失敗前補查若已提交新一代，失敗屬於舊的那一代，
      // 記到新一代上會讓看護以為「沒看過的新告警結案失敗」。
      if (openRow && openRow.generation === displayed.generation) {
        const failure: AcknowledgementFailure = { ...entry, generation: displayed.generation }
        setAcknowledgeFailures(current => (current.some(sameIncident) ? current : [...current, failure]))
      }
    } finally {
      // 只移除自己這一筆；不再以「病人沒換」當守衛——那個守衛正是讓舊病人的結案卡在「儲存中」的原因（PR #993 Codex P1）。
      setPendingAcknowledgements(current => current.filter(item => item !== entry))
    }
  }, [commitLoaded, runLoad])

  const scoped = selectScopedIncidents(patientId, loaded)
  return {
    incidents: scoped.rows,
    loading: scoped.loading,
    checkFailed: scoped.checkFailed,
    acknowledgingId: selectScopedAcknowledgingId(patientId, pendingAcknowledgements),
    acknowledgeFailed: selectScopedAcknowledgeFailed(patientId, scoped.rows, acknowledgeFailures),
    acknowledge,
    refresh,
  }
}
