/*
檔案用途：讀寫原生殼「生物辨識 App 鎖」的本機設定（是否開啟、背景逾時分鐘數），以及判斷「從背景回來是否要上鎖」的純函式（issue #821）。
所在層：src/lib/preferences；純資料／判斷層，不呼叫原生 plugin、不碰 Supabase session，也不含任何健康資料。
主要關聯：src/components/system/AppLockGate.tsx（回前景時判斷要不要上鎖）、src/components/settings/AppLockSettings.tsx（開關與逾時）、
  src/lib/nativeAppLock.ts（原生 LocalAuthentication 橋接）。
*/
import { readLocalValue, writeLocalValue } from './localPreferenceStorage'

// 綁「這台裝置」而不是登入帳號或病人：這個功能只在「共用裝置」情境才有意義，換人登入同一支手機時鎖仍要在；
// 它也不改變任何健康判讀，屬於 AGENTS.md 生理數值對象綁定不變量中的「純介面偏好」例外，不需要 patient_id 分區。
const PREFERENCE_KEY = 'jiajianlog.app-lock'
const LAST_BACKGROUND_AT_KEY = 'jiajianlog.app-lock.last-background-at'

export const APP_LOCK_TIMEOUT_OPTIONS = [1, 5, 15, 30] as const
export type AppLockTimeoutMinutes = typeof APP_LOCK_TIMEOUT_OPTIONS[number]

// 5 分鐘是 issue #821 的建議值：短暫切去看 LINE 或接電話回來不會被打擾（15 秒原則），
// 但手機放下離開一段時間後，別人拿起來就看不到健康資料。
export const DEFAULT_APP_LOCK_TIMEOUT_MINUTES: AppLockTimeoutMinutes = 5

export interface AppLockPreference {
  enabled: boolean
  timeoutMinutes: AppLockTimeoutMinutes
}

// 預設關閉：App 鎖每次開 App 都多一步，違反 15 秒原則；只有使用者在共用裝置上自己打開才啟用。
export const DEFAULT_APP_LOCK_PREFERENCE: AppLockPreference = {
  enabled: false,
  timeoutMinutes: DEFAULT_APP_LOCK_TIMEOUT_MINUTES,
}

function isTimeoutOption(value: unknown): value is AppLockTimeoutMinutes {
  return typeof value === 'number' && (APP_LOCK_TIMEOUT_OPTIONS as readonly number[]).includes(value)
}

export function parseAppLockPreference(raw: string): AppLockPreference | undefined {
  try {
    const parsed = JSON.parse(raw) as Partial<AppLockPreference> | null
    if (!parsed || typeof parsed !== 'object') return undefined
    return {
      // 只有明確的 true 才算開啟：壞掉或被竄改的值一律回到「關閉」，不能讓一筆亂碼把使用者鎖在 App 外面。
      enabled: parsed.enabled === true,
      timeoutMinutes: isTimeoutOption(parsed.timeoutMinutes) ? parsed.timeoutMinutes : DEFAULT_APP_LOCK_TIMEOUT_MINUTES,
    }
  } catch {
    return undefined
  }
}

export function readAppLockPreference(): AppLockPreference {
  return readLocalValue(PREFERENCE_KEY, parseAppLockPreference, DEFAULT_APP_LOCK_PREFERENCE)
}

// 同一個 WebView 裡的設定卡與鎖定畫面各自持有 React state；鎖定畫面因「裝置已沒有密碼」關掉功能時，
// 設定卡要立刻跟著變成關閉，否則畫面說「已開啟」、實際上背景回來不會上鎖。storage 事件只通知其他分頁，所以自己廣播。
const listeners = new Set<() => void>()

export function subscribeAppLockPreference(listener: () => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

/**
 * 寫入後讀回確認，回傳「實際生效」的設定。writeLocalValue 會吞掉 storage 滿或被封鎖的錯誤；
 * 若只相信要寫的值，設定頁會顯示「已開啟」但 useAppLock 讀到的仍是預設的關閉——看起來有保護、實際沒有。
 */
export function saveAppLockPreference(preference: AppLockPreference): AppLockPreference {
  writeLocalValue(PREFERENCE_KEY, JSON.stringify(preference))
  const stored = readAppLockPreference()
  for (const listener of listeners) listener()
  return stored
}

export function readLastBackgroundAt(): number | null {
  return readLocalValue<number | null>(LAST_BACKGROUND_AT_KEY, raw => {
    const value = Number(raw)
    return Number.isFinite(value) ? value : undefined
  }, null)
}

// 存在 localStorage 而不是只放記憶體：iOS 常在背景直接結束 App，使用者也可能從多工畫面把 App 滑掉再重開；
// 只放記憶體的話「殺掉重開」就能繞過鎖，變成看起來像安全機制、實際沒保護。
export function saveLastBackgroundAt(timestamp: number): void {
  writeLocalValue(LAST_BACKGROUND_AT_KEY, String(timestamp))
}

/**
 * 判斷 App 從背景回到前景（或冷啟動）時要不要上鎖。
 * backgroundedAt 為 null 代表找不到進背景的時間（冷啟動前沒記到、儲存失敗）；
 * now 早於 backgroundedAt 代表裝置時鐘被往回調。兩者都無法證明「還在逾時內」，一律上鎖（fail closed）。
 */
export function shouldLockOnResume({ preference, backgroundedAt, now }: {
  preference: AppLockPreference
  backgroundedAt: number | null
  now: number
}): boolean {
  if (!preference.enabled) return false
  if (backgroundedAt === null) return true
  const elapsed = now - backgroundedAt
  if (elapsed < 0) return true
  return elapsed >= preference.timeoutMinutes * 60_000
}
