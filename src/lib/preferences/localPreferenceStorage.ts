/*
檔案用途：抽出本機偏好設定共用的 localStorage 讀寫 boilerplate（try/catch、單一鍵值與 patientId/moduleId 分區鍵值兩種形狀）。
所在層：src/lib/preferences；純 I/O 層，不含任何業務規則——各檔案的預設值、驗證與資料轉換仍留在各自檔案。
主要關聯：medicationDisplayPreference、caregiverDensityPreference、dailyCareSectionPreference、trendPreference、dailyCarePreferences。
*/

export function readLocalValue<T>(key: string, parse: (raw: string) => T | undefined, fallback: T): T {
  try {
    const raw = globalThis.localStorage.getItem(key)
    if (raw === null) return fallback
    const parsed = parse(raw)
    return parsed === undefined ? fallback : parsed
  } catch {
    // 無痕模式或儲存被封鎖時回到呼叫端指定的預設值；儲存失敗不能中斷照護流程。
    return fallback
  }
}

export function writeLocalValue(key: string, raw: string): void {
  try {
    globalThis.localStorage.setItem(key, raw)
  } catch {
    // 只影響下次開啟時的顯示狀態；儲存失敗不能中斷當下的照護操作。
  }
}

export function readLocalKeyedEntry<T>(key: string, entryKey: string): T | undefined {
  try {
    const raw = globalThis.localStorage.getItem(key)
    if (!raw) return undefined
    const stored = JSON.parse(raw) as Record<string, T>
    return stored[entryKey]
  } catch {
    return undefined
  }
}

export function writeLocalKeyedEntry<T>(key: string, entryKey: string, value: T): void {
  try {
    const raw = globalThis.localStorage.getItem(key)
    const stored = raw ? (JSON.parse(raw) as Record<string, T>) : {}
    globalThis.localStorage.setItem(key, JSON.stringify({ ...stored, [entryKey]: value }))
  } catch {
    // 同上：分區偏好寫入失敗只會回到預設值，不影響任何照護資料。
  }
}
