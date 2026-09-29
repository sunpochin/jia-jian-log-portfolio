/*
檔案用途：判定「是不是原生殼」與「是不是已安裝的 standalone PWA」的單一來源。
所在層：src/lib 共用平台層；不承載 auth、session 或任何照護資料。
主要關聯：由 nativeAuth.ts、auth.ts、pwaInstall.ts 及其呼叫端共用，避免同語意的判定分散成多份實作。
*/
import { Capacitor } from '@capacitor/core'

// 只判定「是不是原生殼」，不分 iOS／Android：兩個平台都用同一套系統瀏覽器 OAuth 與提示守門邏輯，
// 避免未來新增平台時要在每個呼叫點重複加條件。
export function isNativeApp(): boolean {
  return Capacitor.isNativePlatform()
}

export function getNativePlatform(): 'ios' | 'android' | 'web' {
  return Capacitor.getPlatform() as 'ios' | 'android' | 'web'
}

// 純函式版本：呼叫端已經自己讀出 display-mode 與 navigator.standalone，方便在 effect 外重複判斷與測試。
export function isStandalonePwa(displayModeMatches: boolean, navigatorStandalone = false): boolean {
  return displayModeMatches || navigatorStandalone
}

// 薄 wrapper：直接讀 window，給不想自己組合兩個訊號的呼叫端使用。
export function readIsStandalonePwa(): boolean {
  if (typeof window === 'undefined') return false
  // iOS Safari「加入主畫面」沒有 display-mode media query 支援前就已存在 navigator.standalone；
  // 其他平台（含新版 iOS）改用 matchMedia，兩者需並存才能涵蓋所有加到主畫面的裝置。
  const standaloneNavigator = window.navigator as Navigator & { standalone?: boolean }
  return standaloneNavigator.standalone === true || window.matchMedia?.('(display-mode: standalone)').matches === true
}
