/*
檔案用途：記住每位被照護者在每日照護頁最後選擇的分頁（血壓／服藥…），切換 App 分頁或病人後回來可以停在原本的頁籤。
所在層：src/lib 本機偏好層；只影響單一裝置的 UI 體感，非跨裝置健康資料，因此不進資料庫。
主要關聯：DailyCarePage、dailyCareModules。
*/
import type { DailyCareModuleId } from './dailyCareModules'

const STORAGE_KEY = 'jiajianlog.daily-care-last-section'

type StoredSections = Record<string, DailyCareModuleId>

export function readLastDailyCareSection(patientId: string): DailyCareModuleId | null {
  try {
    const raw = globalThis.localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const stored = JSON.parse(raw) as StoredSections
    return stored[patientId] ?? null
  } catch {
    return null
  }
}

export function saveLastDailyCareSection(patientId: string, moduleId: DailyCareModuleId): void {
  try {
    const raw = globalThis.localStorage.getItem(STORAGE_KEY)
    const stored = raw ? JSON.parse(raw) as StoredSections : {}
    globalThis.localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...stored, [patientId]: moduleId }))
  } catch {
    // 記憶頁籤只是體感優化，localStorage 被封鎖時不能阻斷每日照護輸入。
  }
}
