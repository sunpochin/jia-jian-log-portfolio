/*
檔案用途：集中處理血壓 Telegram 通知的前端呼叫邊界，並把 Function 回應整理成畫面要用的結果——包含 ADR-007 D9-b
  的明確 delivery 結果（delivered／in_progress／unknown／failed／deferred／not_subscribed），以及 in_progress 時對
  delivery 帳本的回看（持續重查到終局或門檻 M 到期，不得因為「查過一次」就降級成功或靜默消失）。
所在層：src/lib；供血壓輸入頁使用，只把紀錄與病人 UUID 交給登入者 session。
主要關聯：InputPage、useBloodPressureInputForm、Supabase `blood-pressure-notifier` Edge Function、
  blood_pressure_notification_deliveries 的 SELECT policy（有 care_access 的照護者可讀）與資料庫 RLS。
*/
import { supabase } from './supabase'

export type TelegramNotificationRequest = {
  recordId: string
  patientId: string
}

// Function 回傳的 sharedTelegram 欄位（ADR-007 D9-b）。unrecognized 代表回應形狀認不得（例如部署窗口內的舊版 Function）。
export type SharedDeliveryResult = 'delivered' | 'in_progress' | 'unknown' | 'deferred' | 'failed' | 'not_subscribed' | 'unrecognized'

// familyAlertSkipped：這筆紀錄沒有任何家屬通知送出（病人沒訂閱共用群組，也沒有排入個人化通知）。
// 這不是錯誤——血壓已存、Function 也正常——但看護必須知道家人不會自動收到（Fail loudly）。
// sharedDelivery：共用群組那一則的送達結果。只有 delivered 是成功；in_progress／unknown／failed 都必須讓看護看到，
// 不得以「Function 沒有回 error」推定已送達（ADR-007 D9-b）。
export type TelegramNotificationResult = {
  familyAlertSkipped: boolean
  sharedDelivery: SharedDeliveryResult
  // in_progress 時伺服器算好的「門檻 M 還剩多少毫秒」；回看以它當相對期限，只跟前端自己的時鐘比（PR #988 Codex P2）。
  sharedRemainingMs: number | null
  // 個人化通知是否已排入 outbox（有自己的重試者）。共用群組沒送／不明時若這是 true，文案只能說「群組那一則」沒送，
  // 不能說「家人通知沒送出、不會重試」——個人那一則還在佇列裡會自動送（PR #988 Codex P2）。
  personalQueued: boolean
  // 至少有一則個人化通知已落 delivery_unknown（可能已送達、不會重送）：文案要保守說「個人通知無法確認是否送達」。
  // 可與 personalQueued 同時為 true（PR #988 Codex P2）；畫面以不明為準，不承諾「會自動送出」。
  personalUnknown: boolean
  // 至少有一則個人化通知已 sent（已送達）：不能對它說「已排入、會自動送出」（PR #988 Codex P2）。
  personalDelivered: boolean
}

// 回應契約版本：鏡射 supabase/functions/blood-pressure-notifier/bloodPressureNotifier.ts 的兩個常數（測試釘住相等）。
// 帶了它，Function 才會對 failed／unknown／in_progress 回 200＋完整結果；沒帶（舊版快取 PWA）Function 退回「非 2xx＝失敗」的舊契約，
// 舊畫面才不會對沒送出的通知毫無警告（PR #988 Codex P1）。走 header 而不是 body 欄位：新版 bundle 可能先於新 Function 上線
// （PR preview 不部署 Function），已部署的舊 Function 只認兩個 body key、會忽略不認得的 header，所以 body 形狀一個字都不能多。
export const DELIVERY_RESULT_CONTRACT = 2
export const DELIVERY_RESULT_CONTRACT_HEADER = 'x-delivery-contract'

type InvokeLike = (
  functionName: string,
  options: { body: TelegramNotificationRequest; headers: Record<string, string> },
) => Promise<{ data?: unknown; error: unknown }>

const SHARED_DELIVERY_RESULTS: ReadonlySet<string> = new Set(['delivered', 'in_progress', 'unknown', 'deferred', 'failed', 'not_subscribed'])

// 只有「明確回報 not_subscribed 且沒有個人化通知」才算略過。認不得的形狀（例如部署窗口內舊版
// Function 仍回 `{ ok: true }` 或 `sharedTelegram: 'sent'`）一律當成未略過、結果 unrecognized：
// 寧可維持舊畫面，也不要對每一筆都跳出錯誤的提示；但也不把它講成 delivered。
export function parseTelegramNotificationResult(data: unknown): TelegramNotificationResult {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return { familyAlertSkipped: false, sharedDelivery: 'unrecognized', sharedRemainingMs: null, personalQueued: false, personalUnknown: false, personalDelivered: false }
  const body = data as Record<string, unknown>
  if (body.ok !== true || typeof body.sharedTelegram !== 'string' || !SHARED_DELIVERY_RESULTS.has(body.sharedTelegram)) {
    return { familyAlertSkipped: false, sharedDelivery: 'unrecognized', sharedRemainingMs: null, personalQueued: false, personalUnknown: false, personalDelivered: false }
  }
  const sharedDelivery = body.sharedTelegram as Exclude<SharedDeliveryResult, 'unrecognized'>
  const remaining = typeof body.sharedRemainingMs === 'number' && Number.isFinite(body.sharedRemainingMs) && body.sharedRemainingMs >= 0 ? body.sharedRemainingMs : null
  const personalQueued = body.personalQueued === true
  const personalUnknown = body.personalUnknown === true
  const personalDelivered = body.personalDelivered === true
  // 「沒有任何家屬通知」只有在共用群組未訂閱、個人化也既沒排入也沒有不明那則時才成立。
  return { familyAlertSkipped: sharedDelivery === 'not_subscribed' && !personalQueued && !personalUnknown && !personalDelivered, sharedDelivery, sharedRemainingMs: remaining, personalQueued, personalUnknown, personalDelivered }
}

export async function sendTelegramNotification(
  request: TelegramNotificationRequest,
  invoke: InvokeLike = (functionName, options) => supabase.functions.invoke(functionName, options),
): Promise<TelegramNotificationResult> {
  // Server 會從這兩個 UUID 重新讀取資料並套用 RLS；瀏覽器不再依賴某個 build 是否帶到公開 Worker key。
  const { data, error } = await invoke('blood-pressure-notifier', { body: request, headers: { [DELIVERY_RESULT_CONTRACT_HEADER]: String(DELIVERY_RESULT_CONTRACT) } })
  if (error) throw new Error('Blood pressure notification failed')
  return parseTelegramNotificationResult(data)
}

// D9-b／驗收第 11 項：呼叫端 B 看到 A 的 fresh sending 時，A 還沒產生任何結果；B 沒有訂閱或推播能知道 A 的結局，
// 所以在門檻 M 內重查該列狀態。直送帳本對有 care_access 的照護者已有 SELECT policy，不需要新的推播機制。
export type DirectDeliveryStatus = 'pending' | 'sending' | 'sent' | 'delivery_unknown' | 'failed_terminal'
export type DirectDeliveryPollOutcome = 'delivered' | 'unknown' | 'failed'

type DeliveryStatusFetcher = (request: TelegramNotificationRequest) => Promise<DirectDeliveryStatus | null>
type SleepFn = (ms: number) => Promise<void>

// 與 Function／sweeper 的門檻 M 同一個值（supabase/functions/_shared/deliveryPolicy.ts 的 SENDING_STALE_AFTER_MS）：
// 前端無法 import Deno 模組，這裡以常數鏡射並由測試釘住兩邊相等。
export const SENDING_STALE_AFTER_MS = 10 * 60 * 1000
export const DIRECT_DELIVERY_POLL_INTERVAL_MS = 5_000

export async function fetchDirectDeliveryStatus(request: TelegramNotificationRequest): Promise<DirectDeliveryStatus | null> {
  const { data, error } = await supabase
    .from('blood_pressure_notification_deliveries')
    .select('status')
    .eq('record_id', request.recordId)
    .eq('patient_id', request.patientId)
    .eq('channel', 'telegram')
    .maybeSingle()
  if (error) throw new Error('Unable to read blood pressure delivery status')
  const status = (data as { status?: unknown } | null)?.status
  return typeof status === 'string' ? (status as DirectDeliveryStatus) : null
}

// 回看可能長達 M：等待期間 drain 可能已把個人那一則從 pending／sending 改成 failed_terminal 或 delivery_unknown（PR #988 Codex P2）。
// 最終共用結果不是 delivered 時，用這支重新讀個人狀態，不拿回看前的快照承諾「會自動送出」。同一支 enqueue RPC 是冪等的
// （ON CONFLICT DO NOTHING），回傳的是現在的 (queued_count, unknown_count, delivered_count)；只有記錄者本人能呼叫。
export type PersonalDeliveryState = { personalQueued: boolean; personalUnknown: boolean; personalDelivered: boolean }
type PersonalStateRpc = (name: 'enqueue_blood_pressure_personal_notifications', args: { p_record_id: string; p_patient_id: string }) => PromiseLike<{ data: unknown; error: unknown }>

export async function readPersonalDeliveryState(
  request: TelegramNotificationRequest,
  rpc: PersonalStateRpc = (name, args) => supabase.rpc(name, args),
): Promise<PersonalDeliveryState> {
  const { data, error } = await rpc('enqueue_blood_pressure_personal_notifications', { p_record_id: request.recordId, p_patient_id: request.patientId })
  if (error) throw new Error('Unable to read the personal notification state')
  const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | null | undefined
  const count = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0)
  const queued = count(row?.queued_count)
  const unknown = count(row?.unknown_count)
  const delivered = count(row?.delivered_count)
  return { personalQueued: queued > 0, personalUnknown: unknown > 0, personalDelivered: delivered > 0 }
}

// 持續重查到出現終局結果或 M 到期為止；仍是 sending 就繼續等（不得把「查過一次了」當成成功）。
// 讀不到列（null）或查詢失敗一律回 unknown：Fail loudly——不知道有沒有送到，就不能說送到了。
// deadlineMs 要傳伺服器算好的剩餘時長（sharedRemainingMs）：期限 M 是「那次送出開始」起算，不是「前端收到 in_progress」起算；
// 剩 0 就第一次查到仍 sending 立刻回 unknown。相對時長只跟前端自己的時鐘比，不把伺服器時間戳拿來和手機時鐘相減。
export async function pollDirectDeliveryStatus(
  request: TelegramNotificationRequest,
  options: {
    fetchStatus?: DeliveryStatusFetcher
    sleep?: SleepFn
    now?: () => number
    intervalMs?: number
    deadlineMs?: number
  } = {},
): Promise<DirectDeliveryPollOutcome> {
  const fetchStatus = options.fetchStatus ?? fetchDirectDeliveryStatus
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms)))
  const now = options.now ?? (() => Date.now())
  const intervalMs = options.intervalMs ?? DIRECT_DELIVERY_POLL_INTERVAL_MS
  const deadlineMs = options.deadlineMs ?? SENDING_STALE_AFTER_MS
  const startedAt = now()
  for (;;) {
    let status: DirectDeliveryStatus | null
    try {
      status = await fetchStatus(request)
    } catch {
      return 'unknown'
    }
    if (status === 'sent') return 'delivered'
    if (status === 'failed_terminal') return 'failed'
    if (status === 'delivery_unknown' || status === null) return 'unknown'
    // pending／sending：另一個呼叫還在處理（或依 D4 延後）；到期前繼續等。
    if (now() - startedAt >= deadlineMs) return 'unknown'
    await sleep(intervalMs)
  }
}
