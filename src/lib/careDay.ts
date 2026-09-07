/*
檔案用途：定義照護日的時區與 04:00 日界線，供每日照護流程共用。
所在層：src/lib 共用時間資料轉接層；不負責任何畫面或資料庫寫入。
主要關聯：服藥、血壓 Dashboard、量測流程與相關單元測試都依賴這份時間規則。
*/
import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import timezone from 'dayjs/plugin/timezone'
import { TZ } from './timezone'

dayjs.extend(utc)
dayjs.extend(timezone)

export const CARE_DAY_TIMEZONE = TZ
export const CARE_DAY_START_HOUR = 4

/**
 * 回傳一般台北日曆日；原始事件與匯出仍要使用它，避免把實際發生日期藏在照護日後面。
 */
export function calendarDateKey(at = dayjs()): string {
  return at.tz(CARE_DAY_TIMEZONE).format('YYYY-MM-DD')
}

/**
 * 回傳照護日。凌晨 00:00–03:59 先扣回四小時，才會和前一晚的睡前照護放在同一頁。
 */
export function careDateKey(at = dayjs()): string {
  return at.tz(CARE_DAY_TIMEZONE).subtract(CARE_DAY_START_HOUR, 'hour').format('YYYY-MM-DD')
}

export interface CareDayBounds {
  start: dayjs.Dayjs
  end: dayjs.Dayjs
}

/**
 * 回傳半開區間 [04:00, 隔日 04:00)，讓資料庫查詢不必依賴 03:59:59.999 的浮點邊界。
 */
export function careDayBounds(careDate: string): CareDayBounds {
  const start = dayjs.tz(`${careDate} ${String(CARE_DAY_START_HOUR).padStart(2, '0')}:00:00`, CARE_DAY_TIMEZONE)
  return { start, end: start.add(1, 'day') }
}

export function careDayWindow(days: number, at = dayjs()): CareDayBounds {
  const current = careDayBounds(careDateKey(at))
  const safeDays = Number.isFinite(days) ? Math.max(1, Math.trunc(days)) : 1
  return { start: current.start.subtract(safeDays - 1, 'day'), end: current.end }
}
