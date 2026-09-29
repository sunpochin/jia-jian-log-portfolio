/*
檔案用途：保存趨勢區塊的期間選擇與展開狀態，讓各照護模組與封存對象的唯讀歷史頁使用同一份偏好。
所在層：src/lib 本機偏好層；只影響單一裝置的畫面體感，不改變任何健康判讀。
主要關聯：各照護模組的 ModuleTrendSection、ArchivedPatientHistoryPage 與 dailyCareModules 的模組 id。

為什麼綁帳號而非病人：AGENTS.md〈生理數值對象綁定不變量〉把「圖表期間」與「版面展開狀態」
明列為純帳號層介面偏好——它們不會因人而異地改變健康判讀、警示或照護行為，
所以不需要 patient-scoped 分區。真正會改變判讀的目標值與門檻才必須綁 patient_id。
*/

import { readLocalValue, writeLocalValue, readLocalKeyedEntry, writeLocalKeyedEntry } from './localPreferenceStorage'

// 保留常用的週期倍數；56 天資訊密度低，且會讓窄螢幕的選項過多。
export const TREND_PERIOD_OPTIONS = [7, 14, 28, 42] as const

export type TrendPeriodDays = typeof TREND_PERIOD_OPTIONS[number]

export const DEFAULT_TREND_PERIOD: TrendPeriodDays = 7

const PERIOD_STORAGE_KEY = 'jiajianlog.trend-period'
const EXPANDED_STORAGE_KEY = 'jiajianlog.trend-expanded'

export function isTrendPeriodDays(value: unknown): value is TrendPeriodDays {
  return TREND_PERIOD_OPTIONS.includes(value as TrendPeriodDays)
}

export function readTrendPeriod(): TrendPeriodDays {
  return readLocalValue(
    PERIOD_STORAGE_KEY,
    raw => {
      const parsed = Number(raw)
      return isTrendPeriodDays(parsed) ? parsed : undefined
    },
    DEFAULT_TREND_PERIOD,
  )
}

export function saveTrendPeriod(days: TrendPeriodDays): void {
  // 記憶期間只是體感優化；localStorage 被封鎖時不能影響趨勢閱讀或照護輸入。
  writeLocalValue(PERIOD_STORAGE_KEY, String(days))
}

/**
 * 趨勢區塊預設收合。
 *
 * 為什麼不預設展開：照護分頁的首要工作是「記錄」，趨勢是記錄完的後續動作；
 * 預設展開會把輸入表單推到摺線以下，也會讓較重的圖表套件進入每次開 App 的載入路徑。
 * 收合狀態會被記住，所以習慣看趨勢的人只需要點開一次。
 */
export function readTrendExpanded(moduleId: string): boolean {
  return readLocalKeyedEntry<boolean>(EXPANDED_STORAGE_KEY, moduleId) === true
}

export function saveTrendExpanded(moduleId: string, expanded: boolean): void {
  // 同上：展開狀態失敗只會回到預設收合，不影響任何照護資料。
  writeLocalKeyedEntry(EXPANDED_STORAGE_KEY, moduleId, expanded)
}
