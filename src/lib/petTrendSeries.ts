/*
檔案用途：把寵物慢性病紀錄依台北日期彙整成趨勢圖需要的每日數值。
所在層：src/lib 純規則層；不查資料庫、不決定畫面文案。
主要關聯：PetTrendPanel、trendSeries 與寵物 Supabase／Demo 讀取 adapter。
*/
import dayjs from 'dayjs'
import timezone from 'dayjs/plugin/timezone'
import utc from 'dayjs/plugin/utc'
import { TZ } from './timezone'
import { trendDateKeys, type TrendPoint } from './trendSeries'

dayjs.extend(utc)
dayjs.extend(timezone)

type NumericValue = number | string | null | undefined

export interface PetDatedValue {
  date: string
  value: NumericValue
}

export interface PetTimedValue {
  at: string
  value: NumericValue
}

function finiteNumber(value: NumericValue): number | null {
  if (value == null) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

/**
 * 一天一筆的寵物紀錄直接對應日期；沒有資料的日期維持 null，不能補成 0。
 * 這個空白是照護事實的一部分，避免「沒記」被誤讀成「完全沒有排尿／嘔吐」。
 */
export function dailyPetDateValues(records: PetDatedValue[], days: number, now?: dayjs.Dayjs): TrendPoint[] {
  const values = new Map<string, number | null>()
  records.forEach(record => values.set(record.date, finiteNumber(record.value)))
  return trendDateKeys(days, now).map(date => ({ date, value: values.get(date) ?? null }))
}

/**
 * 一天可多筆的治療量以每日總量呈現；null 不參與加總，但不會被當成 0 筆資料。
 * 這讓胰島素與皮下點滴能回答「今天總共給了多少」，也保留未完整記錄日的空白。
 */
export function dailyPetTotals(records: PetTimedValue[], days: number, now?: dayjs.Dayjs): TrendPoint[] {
  const totals = new Map<string, number>()
  records.forEach(record => {
    const at = dayjs(record.at)
    const value = finiteNumber(record.value)
    if (!at.isValid() || value == null) return
    const date = at.tz(TZ).format('YYYY-MM-DD')
    totals.set(date, (totals.get(date) ?? 0) + value)
  })
  return trendDateKeys(days, now).map(date => ({ date, value: totals.get(date) ?? null }))
}

/**
 * 一天可多筆的觀察值以每日平均呈現；目前用於每餐進食比例與血糖。
 * 不用最後一筆代表整天，因為量測／進食時間不同，最後一筆不一定最能代表當日狀態。
 */
export function dailyPetAverages(records: PetTimedValue[], days: number, now?: dayjs.Dayjs): TrendPoint[] {
  const buckets = new Map<string, { sum: number; count: number }>()
  records.forEach(record => {
    const at = dayjs(record.at)
    const value = finiteNumber(record.value)
    if (!at.isValid() || value == null) return
    const date = at.tz(TZ).format('YYYY-MM-DD')
    const current = buckets.get(date) ?? { sum: 0, count: 0 }
    buckets.set(date, { sum: current.sum + value, count: current.count + 1 })
  })
  return trendDateKeys(days, now).map(date => {
    const bucket = buckets.get(date)
    return { date, value: bucket ? Number((bucket.sum / bucket.count).toFixed(2)) : null }
  })
}
