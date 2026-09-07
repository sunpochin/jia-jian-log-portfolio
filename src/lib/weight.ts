/*
檔案用途：個人體重讀取、寫入與體重目標設定之 Supabase 介面。
所在層：src/lib；為體重追蹤資料層。
主要關聯：由 WeightPage 元件載入使用。
*/
import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import timezone from 'dayjs/plugin/timezone'

dayjs.extend(utc)
dayjs.extend(timezone)

export const WEIGHT_TZ = 'Asia/Taipei'
export const WEIGHT_MEASUREMENTS_PER_DAY = 12

export const WEIGHT_MEASUREMENT_NUMBERS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const
export type WeightMeasurementNumber = typeof WEIGHT_MEASUREMENT_NUMBERS[number]

export function taipeiWeightDate(now = dayjs()): string {
  return now.tz(WEIGHT_TZ).format('YYYY-MM-DD')
}

// 體重固定兩位小數：資料庫欄位是 NUMERIC(7, 2)，本來就存得下兩位，
// 但畫面之前只顯示一位——照護者輸入 58.25、看到的卻是 58.3，會誤以為系統擅自改了他量到的數字。
// 顯示與寫入共用同一個位數常數，避免哪天只改了其中一邊又造成同樣的落差。
export const WEIGHT_DECIMALS = 2
// 輸入框的 step 必須跟著位數走，否則瀏覽器的上下鍵與數值驗證仍以 0.1 為單位，兩位小數會被擋成無效輸入。
export const WEIGHT_INPUT_STEP = '0.01'

/** 寫入資料庫前先收斂到兩位小數，避免超出 NUMERIC(7, 2) 而由資料庫自行四捨五入。 */
export function roundWeightKg(value: number): number {
  return Number(value.toFixed(WEIGHT_DECIMALS))
}

/**
 * 畫面顯示用的體重字串（不含單位）。
 * 讀到的值可能是 Supabase 回傳的字串型 NUMERIC，所以一律先轉數字；
 * 真的不是數字時顯示破折號而不是 NaN，照護者看到 NaN 只會以為資料壞了。
 * 空字串要先擋掉：`Number('')` 會得到 0，直接顯示「0.00 kg」比顯示破折號更容易被誤讀成量到 0 公斤。
 */
export function formatWeightKg(value: number | string): string {
  if (typeof value === 'string' && value.trim() === '') return '—'
  const weight = Number(value)
  return Number.isFinite(weight) ? weight.toFixed(WEIGHT_DECIMALS) : '—'
}

export const WEIGHT_MIN_KG = 0.01
export const WEIGHT_MAX_KG = 99999

export function isValidWeightInput(value: number | ''): value is number {
  // 10～500 公斤的假設只適用人類；這裡照護的對象不限物種（例如寵物），體型差異可以極端到河馬或新生兒，
  // 所以只在畫面擋掉非正數或超出資料庫欄位可存範圍的輸入，不再假設「合理」體重區間。
  // 資料庫仍保留 CHECK 作為跨裝置與 API 的最後防線。
  return typeof value === 'number' && Number.isFinite(value) && value >= WEIGHT_MIN_KG && value <= WEIGHT_MAX_KG
}

export function isWeightMeasurementNumber(value: number): value is WeightMeasurementNumber {
  // 量測次數必須和資料庫 CHECK 共用同一個 1–12 邊界，避免前端送出無法重播的資料。
  return Number.isInteger(value) && value >= 1 && value <= WEIGHT_MEASUREMENTS_PER_DAY
}

export function firstEmptyWeightMeasurement(records: Partial<Record<WeightMeasurementNumber, unknown>>): WeightMeasurementNumber {
  // 預設導向下一個空槽位可降低每天十二次量測的選擇負擔；全滿時回到第 1 槽位，讓呼叫端仍可明確顯示已滿狀態。
  return WEIGHT_MEASUREMENT_NUMBERS.find(number => !records[number]) ?? 1
}
