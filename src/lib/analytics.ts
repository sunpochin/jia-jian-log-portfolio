/*
檔案用途：集中管理家健錄的匿名成長事件與 Vercel Analytics 邊界。
所在層：src/lib 共用資料轉接層；所有埋點呼叫都必須先經過這個白名單 adapter。
主要關聯：App、登入／Demo、血壓寫入流程與 main.tsx 的 Vercel Analytics 注入入口。
*/
import { track, type BeforeSendEvent } from '@vercel/analytics'
import type { Locale } from './i18n'

export const ANALYTICS_EVENT_NAMES = [
  'landing_view',
  'demo_start',
  'tutorial_complete',
  'login_success',
  'first_record_saved',
  'week1_return',
] as const

export type AnalyticsEventName = typeof ANALYTICS_EVENT_NAMES[number]
export type AnalyticsLoginEntry = 'landing' | 'caregiver_invite' | 'patient_invite'

export type AnalyticsEventProperties = {
  landing_view: { locale: Locale }
  demo_start: { locale: Locale }
  tutorial_complete: { locale: Locale }
  login_success: { locale: Locale; entry: AnalyticsLoginEntry }
  first_record_saved: { locale: Locale; record_type: 'blood_pressure' }
  week1_return: { locale: Locale }
}

export type FirstRecordEventEligibility = {
  hasExistingRecord: boolean
  historyLoading: boolean
  historyError: boolean
}

type AnalyticsState = {
  firstRecordSavedAt?: number
  week1ReturnTrackedAt?: number
}

const ANALYTICS_STATE_KEY = 'jia-jian-log.analytics.v1'
const DAY_MS = 24 * 60 * 60 * 1000

function isLocale(value: unknown): value is Locale {
  return value === 'id' || value === 'zh' || value === 'en'
}

function isLoginEntry(value: unknown): value is AnalyticsLoginEntry {
  return value === 'landing' || value === 'caregiver_invite' || value === 'patient_invite'
}

function isTimestamp(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
}

function readAnalyticsState(): AnalyticsState {
  try {
    const raw = globalThis.localStorage?.getItem(ANALYTICS_STATE_KEY)
    if (!raw) return {}
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return {}
    const candidate = parsed as Record<string, unknown>
    return {
      ...(isTimestamp(candidate.firstRecordSavedAt) ? { firstRecordSavedAt: candidate.firstRecordSavedAt } : {}),
      ...(isTimestamp(candidate.week1ReturnTrackedAt) ? { week1ReturnTrackedAt: candidate.week1ReturnTrackedAt } : {}),
    }
  } catch {
    // 隱私模式或瀏覽器封鎖 storage 時，埋點不能讓照護畫面壞掉；沒有 marker 只代表可能重複計數。
    return {}
  }
}

function writeAnalyticsState(state: AnalyticsState): void {
  try {
    globalThis.localStorage?.setItem(ANALYTICS_STATE_KEY, JSON.stringify(state))
  } catch {
    // 分析 marker 不是照護資料；寫不進去時放棄去重，不阻擋任何主流程。
  }
}

function safeProperties(event: AnalyticsEventName, properties: Record<string, unknown>): Record<string, string> | null {
  const locale = properties.locale
  if (!isLocale(locale)) return null

  switch (event) {
    case 'login_success': {
      const entry = properties.entry
      return isLoginEntry(entry) ? { locale, entry } : null
    }
    case 'first_record_saved':
      // 事件只描述「紀錄類型」，不把實際讀值或 patient_id 帶出瀏覽器。
      return properties.record_type === 'blood_pressure' ? { locale, record_type: 'blood_pressure' } : null
    case 'landing_view':
    case 'demo_start':
    case 'tutorial_complete':
    case 'week1_return':
      return { locale }
  }

  return null
}

/**
 * 為什麼：即使 TypeScript 已限制呼叫端，瀏覽器仍可能載入 JavaScript bundle；因此執行期白名單
 * 必須留在這裡，確保只有六個核准事件能離開照護流程。
 */
export function trackEvent<EventName extends AnalyticsEventName>(
  event: EventName,
  properties: AnalyticsEventProperties[EventName],
): boolean {
  if (!isAnalyticsEventName(event) || typeof window === 'undefined' || typeof window.va !== 'function') return false
  const safe = safeProperties(event, properties as Record<string, unknown>)
  if (!safe) return false

  try {
    track(event, safe)
    return true
  } catch {
    // 埋點是旁路遙測；第三方分析失敗絕不能讓照護寫入流程失敗。
    return false
  }
}

export function isAnalyticsEventName(value: unknown): value is AnalyticsEventName {
  return typeof value === 'string' && (ANALYTICS_EVENT_NAMES as readonly string[]).includes(value)
}

export function analyticsLoginEntry(pathname = typeof window !== 'undefined' ? window.location.pathname : '/'): AnalyticsLoginEntry {
  if (pathname === '/join') return 'caregiver_invite'
  if (pathname === '/patient-invite') return 'patient_invite'
  return 'landing'
}

export function isFirstRecordEventEligible({ hasExistingRecord, historyLoading, historyError }: FirstRecordEventEligibility): boolean {
  // 為什麼：新埋點上線後不能把既有帳號的下一筆紀錄當成「第一筆」；只有資料庫歷史已確認為空時才放行。
  return !hasExistingRecord && !historyLoading && !historyError
}

/**
 * Vercel 的 pageview/custom event 可能帶目前網址；移除 query/hash 可避免邀請 token 或其他參數進第三方。
 */
export function sanitizeAnalyticsUrl(event: BeforeSendEvent): BeforeSendEvent | null {
  if (typeof window === 'undefined') return null
  try {
    const url = new URL(event.url, window.location.origin)
    return { ...event, url: `${url.origin}${url.pathname}` }
  } catch {
    return null
  }
}

// ponytail: 只用一個瀏覽器 marker 做匿名去重；需要跨裝置精準統計時，再升級成不含健康欄位的彙總服務。
export function trackFirstRecordSaved(
  properties: AnalyticsEventProperties['first_record_saved'],
  savedAt = Date.now(),
): void {
  const state = readAnalyticsState()
  if (state.firstRecordSavedAt !== undefined || !isTimestamp(savedAt)) return
  if (!trackEvent('first_record_saved', properties)) return
  writeAnalyticsState({ ...state, firstRecordSavedAt: savedAt })
}

export function trackWeek1Return(
  properties: AnalyticsEventProperties['week1_return'],
  now = Date.now(),
): void {
  const state = readAnalyticsState()
  if (state.firstRecordSavedAt === undefined || state.week1ReturnTrackedAt !== undefined || !isTimestamp(now)) return
  const elapsed = now - state.firstRecordSavedAt
  if (elapsed < DAY_MS || elapsed > DAY_MS * 7) return
  if (!trackEvent('week1_return', properties)) return
  writeAnalyticsState({ ...state, week1ReturnTrackedAt: now })
}
