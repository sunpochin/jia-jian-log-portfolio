/*
檔案用途：把「只有最新一次非同步查詢可以改寫畫面」這個競態防護寫成一個具名、可測試的共用模式。
所在層：src/hooks；供所有依 patient 切換而重新查詢的資料 hook 使用。
主要關聯：useBpRecords、useLatestBpRecord、useTemperatureRecords 等以 patient_id 為邊界的讀取層。
*/
import { useEffect, useMemo } from 'react'

/**
 * 繁體中文註解：這是健康資料的安全機制，不只是體驗優化。
 * 切換照護對象時前一位的查詢可能比較晚回來；若照單全收，畫面會把「上一位的血壓」
 * 標成目前對象的數值，直接違反「生理數值必須綁定 patient_id」的不變量。
 * 每次查詢先領一個 token，回寫前確認 token 仍是最新的，過期結果就整批丟棄。
 */
export interface RequestTracker {
  /** 開始一次查詢，回傳「這次結果是否仍可採用」的判定函式。 */
  begin: () => () => boolean
  /** 讓所有進行中的查詢立即失效（卸載或手動改寫狀態時使用）。 */
  invalidate: () => void
}

export function createRequestTracker(): RequestTracker {
  let latest = 0
  return {
    begin: () => {
      const token = ++latest
      return () => token === latest
    },
    invalidate: () => {
      latest += 1
    },
  }
}

export function useLatestRequest(): RequestTracker {
  // 繁體中文註解：回傳值必須在整個元件生命週期保持同一個 identity。
  // 呼叫端會把它放進 useCallback 的依賴陣列；若每次 render 都產生新物件，
  // fetch 會跟著重建、useEffect 反覆觸發，變成無限重新查詢。
  const tracker = useMemo(() => createRequestTracker(), [])

  // 元件卸載後仍在飛的查詢不得再寫入狀態，否則會對已消失的畫面做多餘的工作。
  useEffect(() => () => tracker.invalidate(), [tracker])

  return tracker
}
