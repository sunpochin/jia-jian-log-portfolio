/*
檔案用途：提供離線快取的安全讀寫封裝——不會因為 JSON 壞掉、儲存被停用或容量滿而讓畫面整個掛掉。
所在層：src/lib 共用核心層；任何要把健康資料存進 localStorage 的地方都應該走這裡。
主要關聯：hooks/useBpRecords 的離線血壓快取，以及後續要加入離線能力的其他生理數值讀取層。
*/

/**
 * 繁體中文註解：快取一律連同寫入時間保存。
 * 看護在離線時可能把畫面拿給醫師看，沒有同步時間就無法判斷數值是不是舊的；
 * 舊版只存裸陣列，因此 readLocalCache 允許呼叫端自行相容舊格式（savedAt 回傳 null＝時間未知，不可自行猜測）。
 */
export interface CacheEnvelope<T> {
  value: T
  savedAt: string | null
}

/**
 * 快取 key 一律由病人 id 組成，讓「數值必須綁定 patient_id」的不變量在 key 層就成立。
 * 沒有 patient id 時故意寫成 missing-patient 而不是省略，避免不同對象共用同一個 key 互相覆蓋。
 */
export function patientScopedCacheKey(namespace: string, patientId: string | undefined, ...parts: (string | number)[]): string {
  const scope = patientId ? `patient-${patientId}` : 'missing-patient'
  return [namespace, scope, ...parts].join('-')
}

function readRaw(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    // Safari 無痕模式或使用者停用儲存時 getItem 會直接 throw；沒有快取不是錯誤，照樣走線上查詢。
    return null
  }
}

/**
 * 讀取快取並交給呼叫端的 revive 函式驗證。
 * revive 回傳 null 代表資料形狀不再受信任（例如欄位改版），此時視同沒有快取，
 * 而不是把來路不明的物件當成健康紀錄顯示給看護。
 */
export function readLocalCache<T>(key: string, revive: (parsed: unknown) => CacheEnvelope<T> | null): CacheEnvelope<T> | null {
  const raw = readRaw(key)
  if (!raw) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (error) {
    console.warn('[local cache parse error]', key, error)
    return null
  }
  try {
    return revive(parsed)
  } catch (error) {
    console.warn('[local cache revive error]', key, error)
    return null
  }
}

/**
 * 寫入快取並回傳這次的同步時間；寫入失敗只降級成「這次沒有離線備份」，不能讓儲存流程失敗。
 * 手機瀏覽器容量滿時 setItem 會丟 QuotaExceededError，那不應該影響剛剛成功的線上讀取。
 */
export function writeLocalCache<T>(key: string, value: T, savedAt: string = new Date().toISOString()): string | null {
  try {
    localStorage.setItem(key, JSON.stringify({ value, savedAt } satisfies CacheEnvelope<T>))
    return savedAt
  } catch (error) {
    console.warn('[local cache write error]', key, error)
    return null
  }
}

export function clearLocalCache(key: string): void {
  try {
    localStorage.removeItem(key)
  } catch (error) {
    console.warn('[local cache clear error]', key, error)
  }
}

/**
 * 相容舊版「只存裸陣列」與新版 envelope 的共用 revive。
 * 逐筆用 isItem 驗證，避免舊快取殘留的欄位缺漏在圖表端才炸開。
 */
export function reviveCachedList<T>(parsed: unknown, isItem: (item: unknown) => item is T): CacheEnvelope<T[]> | null {
  if (Array.isArray(parsed)) return { value: parsed.filter(isItem), savedAt: null }
  if (typeof parsed !== 'object' || parsed === null) return null
  const record = parsed as Record<string, unknown>
  // 舊版 useBpRecords 的 envelope 欄位叫 records，新版統一叫 value；兩者都要能讀回來。
  const list = Array.isArray(record.value) ? record.value : Array.isArray(record.records) ? record.records : null
  if (!list) return null
  const savedAt = typeof record.savedAt === 'string' ? record.savedAt : null
  return { value: list.filter(isItem), savedAt }
}
