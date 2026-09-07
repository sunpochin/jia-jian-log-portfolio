/*
檔案用途：集中管理 PWA 安裝提示的事件型別、顯示期限與平台判斷。
所在層：src/lib 共用平台層；不渲染 UI，也不讀取照護資料。
主要關聯：src/components/system/PwaInstallPrompt.tsx 與相關 unit tests。
*/

export const PWA_INSTALL_DISMISS_STORAGE_KEY = 'jia-jian-log.pwa-install-dismissed-at'
export const PWA_INSTALL_DISMISS_DURATION_MS = 30 * 24 * 60 * 60 * 1000

export type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

export function readPwaInstallDismissedAt(storage: Pick<Storage, 'getItem'> | null | undefined): number | null {
  try {
    const value = storage?.getItem(PWA_INSTALL_DISMISS_STORAGE_KEY)
    if (!value) return null
    const timestamp = Number(value)
    return Number.isFinite(timestamp) && timestamp > 0 ? timestamp : null
  } catch {
    // 儲存被瀏覽器封鎖時仍可顯示一次提示；安裝提示不能因此讓整個 App 失效。
    return null
  }
}

export function shouldShowPwaInstallPrompt(now = Date.now(), dismissedAt: number | null = null): boolean {
  return dismissedAt === null || now - dismissedAt >= PWA_INSTALL_DISMISS_DURATION_MS
}

export function persistPwaInstallDismissedAt(storage: Pick<Storage, 'setItem'> | null | undefined, now = Date.now()): void {
  try {
    storage?.setItem(PWA_INSTALL_DISMISS_STORAGE_KEY, String(now))
  } catch {
    // 私密瀏覽或儲存空間不足時，最多只會失去「稍後再提醒」的偏好，不阻斷照護流程。
  }
}

export function clearPwaInstallDismissedAt(storage: Pick<Storage, 'removeItem'> | null | undefined): void {
  try {
    storage?.removeItem(PWA_INSTALL_DISMISS_STORAGE_KEY)
  } catch {
    // appinstalled 事件只是清理偏好；清理失敗不應影響已完成的安裝。
  }
}

export function isIosDevice(userAgent: string, maxTouchPoints = 0): boolean {
  // iPadOS 的桌面模式會偽裝成 Mac；觸控點是辨識它仍是 iPad 的必要補充。
  return /iPad|iPhone|iPod/i.test(userAgent) || (/Macintosh/i.test(userAgent) && maxTouchPoints > 1)
}

export function isStandalonePwa(displayModeMatches: boolean, navigatorStandalone = false): boolean {
  return displayModeMatches || navigatorStandalone
}
