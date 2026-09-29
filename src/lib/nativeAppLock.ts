/*
檔案用途：橋接 iOS 原生殼內建的 AppLock plugin（Apple LocalAuthentication），提供「能不能用」「要求解鎖」「多工畫面遮蔽」三個動作（issue #821）。
所在層：src/lib 平台轉接層；不保存任何生物辨識資料、不碰 Supabase session，也不把結果送到任何伺服器。
主要關聯：ios/App/App/AppLockPlugin.swift（原生實作）、src/components/system/AppLockGate.tsx、src/components/settings/AppLockSettings.tsx。
*/
import { registerPlugin } from '@capacitor/core'

// 為什麼不用第三方 npm plugin：Capacitor 官方沒有生物辨識 plugin，社群套件要整包引入別人的原生碼與 npm install 供應鏈；
// ADR-004 與 docs/agents/skill-security.md 要求最小外部依賴。這裡只需要 Apple 自己的 LAContext 一個 API，
// 所以原生碼直接寫在 ios/App 裡（約百行、可逐行審），不新增任何 npm 依賴，也不影響 #815 的 cap sync 漂移守門。
export type AppLockAuthResult = 'success' | 'cancelled' | 'failed' | 'unavailable'

interface AppLockPlugin {
  checkAvailability(): Promise<{ available: boolean }>
  authenticate(options: { reason: string }): Promise<{ result: AppLockAuthResult }>
  setPrivacyCover(options: { enabled: boolean }): Promise<void>
}

const AppLock = registerPlugin<AppLockPlugin>('AppLock')

const AUTH_RESULTS: readonly AppLockAuthResult[] = ['success', 'cancelled', 'failed', 'unavailable']

/** 裝置有設定密碼（Face ID／Touch ID 可有可無）且原生 plugin 存在時才回傳 true；Web、Android（尚未實作）與任何錯誤都回 false。 */
export async function checkAppLockAvailability(): Promise<boolean> {
  try {
    const { available } = await AppLock.checkAvailability()
    return available === true
  } catch {
    // Android 殼尚未註冊這個 plugin、Web 沒有實作：都會丟 "not implemented"，視為不支援而不是當機。
    return false
  }
}

/**
 * 請 OS 驗證裝置擁有者：先試 Face ID／Touch ID，失敗或使用者選擇時可退回裝置密碼（LAPolicy.deviceOwnerAuthentication）。
 * 原生端把所有錯誤轉成固定的結果字串，這裡不接觸錯誤訊息或次數，避免任何生物辨識細節被記錄或外送。
 */
export async function authenticateAppLock(reason: string): Promise<AppLockAuthResult> {
  try {
    const { result } = await AppLock.authenticate({ reason })
    return AUTH_RESULTS.includes(result) ? result : 'failed'
  } catch {
    // 橋接層丟錯一律當「失敗」而不是「不支援」：AppLockGate 收到 'unavailable' 會解鎖並關閉 App 鎖，
    // 那條路只保留給原生端明確回報「裝置已沒有密碼」的情況，不能讓一次未知錯誤變成繞過鎖的後門。
    return 'failed'
  }
}

/** 開啟時，App 進背景前由原生端蓋上一層空白畫面，讓 iOS 多工畫面的截圖看不到任何健康數值。 */
export async function setAppLockPrivacyCover(enabled: boolean): Promise<void> {
  try {
    await AppLock.setPrivacyCover({ enabled })
  } catch {
    // 不支援的平台本來就不會開啟 App 鎖；這裡失敗只代表沒有原生遮蔽，JS 遮罩仍會照常上鎖。
  }
}
