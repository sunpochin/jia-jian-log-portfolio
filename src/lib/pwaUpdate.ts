/*
檔案用途：與 Service Worker 通訊及註冊 PWA 自動更新策略之輔助函式。
所在層：src/lib；為 PWA 核心控制模組。
主要關聯：由 PwaUpdatePrompt 與 pwaUpdateGuard 呼叫。
*/
export const PWA_UPDATE_CHECK_INTERVAL_MS = 15 * 60 * 1000

interface PwaUpdateCheckState {
  online: boolean
  visibilityState: DocumentVisibilityState
}

export function canCheckForPwaUpdate({ online, visibilityState }: PwaUpdateCheckState) {
  // 離線或背景狀態不反覆喚醒網路；回到前景與恢復連線時會另外立即檢查。
  return online && visibilityState === 'visible'
}

export function canApplyPwaUpdate(hasUnsavedInput: boolean) {
  // 使用者已量好但尚未送出的數字只存在記憶體；重載前必須先阻擋，不能只靠提示文字。
  return !hasUnsavedInput
}
