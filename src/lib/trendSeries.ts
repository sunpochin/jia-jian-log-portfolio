/*
檔案用途：把體重、飲食與服藥的原始紀錄彙整成「每天一個點」的趨勢序列。
所在層：src/lib 純規則層；只做彙整，不查資料庫、不決定畫面。
主要關聯：WeightTrendPanel、NutritionTrendPanel、MedicationHistoryPanel 與各自的 Supabase／Demo 讀取層。

為什麼抽出來：這三個模組的趨勢都要處理「空白的日子也要出現在序列上」與「一天多筆如何收斂成一點」，
這兩件事寫錯不會報錯、只會讓照護者看到誤導的曲線，因此必須能單獨測試。
*/
import dayjs from 'dayjs'
import timezone from 'dayjs/plugin/timezone'
import utc from 'dayjs/plugin/utc'
import { TZ } from './timezone'

dayjs.extend(utc)
dayjs.extend(timezone)

export interface TrendPoint {
  date: string
  value: number | null
}

/**
 * 產生連續的台北日期字串（含頭尾），最舊的在前。
 *
 * 為什麼要補齊沒有紀錄的日子：若只畫有資料的點，中間三天沒量體重會被折線連成一條直線，
 * 看起來像那三天有平穩變化。空值必須留白，讓「沒有量」和「量了沒變」在圖上可以分辨。
 */
export function trendDateKeys(days: number, now = dayjs().tz(TZ)): string[] {
  const total = Math.max(1, Math.floor(days))
  const end = now.tz(TZ).startOf('day')
  return Array.from({ length: total }, (_, index) => end.subtract(total - 1 - index, 'day').format('YYYY-MM-DD'))
}

/**
 * 體重：一天多次量測收斂成當日平均。
 * 取平均而不是取第一筆，是因為體重在一天內會因進食與排泄浮動，
 * 單看某一次容易把日常波動誤讀成趨勢變化。
 */
export function dailyWeightAverages(
  records: { measured_on: string; weight_kg: number }[],
  days: number,
  now?: dayjs.Dayjs,
): TrendPoint[] {
  const totals = new Map<string, { sum: number; count: number }>()
  records.forEach(record => {
    const weight = Number(record.weight_kg)
    if (!Number.isFinite(weight)) return
    const current = totals.get(record.measured_on) ?? { sum: 0, count: 0 }
    totals.set(record.measured_on, { sum: current.sum + weight, count: current.count + 1 })
  })

  return trendDateKeys(days, now).map(date => {
    const bucket = totals.get(date)
    return { date, value: bucket && bucket.count > 0 ? Number((bucket.sum / bucket.count).toFixed(2)) : null }
  })
}

/**
 * 飲食：一天所有餐點的熱量加總。
 *
 * 未填熱量的餐點以 null 計，不併入總和；沒有任何紀錄的日子維持 null 而不是 0，
 * 因為「那天沒記錄」與「那天吃了 0 大卡」在照護判讀上完全不同。
 */
export function dailyCalorieTotals(
  items: { occurredAt: string; calories: number | null }[],
  days: number,
  now?: dayjs.Dayjs,
): TrendPoint[] {
  const totals = new Map<string, number | null>()
  items.forEach(item => {
    const date = dayjs(item.occurredAt).tz(TZ).format('YYYY-MM-DD')
    const calories = item.calories
    const current = totals.get(date)
    if (calories == null) {
      // 這一天有紀錄但這筆沒有熱量；先確保該日出現在序列上，數值仍由其他筆決定。
      if (current === undefined) totals.set(date, null)
      return
    }
    totals.set(date, (current ?? 0) + calories)
  })

  return trendDateKeys(days, now).map(date => {
    const total = totals.get(date)
    return { date, value: total ?? null }
  })
}

/**
 * 服藥：每個照護日實際完成的劑次數。
 *
 * 為什麼只回報「實際服用次數」而不是遵從率百分比：
 * 藥單會隨醫囑調整，要算某一天的「應服次數」必須重建那天當下的藥單版本。
 * 目前沒有保存足以正確重建的歷史快照，硬算出來的分母會產生看起來精確、實際錯誤的遵從率——
 * 在用藥情境下，誤導比缺少更危險。所以這裡只呈現可驗證的事實次數。
 */
export function dailyDoseCounts(
  logs: { care_date?: string | null; taken_on: string }[],
  days: number,
  now?: dayjs.Dayjs,
): TrendPoint[] {
  const counts = new Map<string, number>()
  logs.forEach(log => {
    // care_date 是每日待辦的分組鍵；離線快取可能缺欄位，退回實際台北日曆日。
    const date = log.care_date || log.taken_on
    if (!date) return
    counts.set(date, (counts.get(date) ?? 0) + 1)
  })

  return trendDateKeys(days, now).map(date => ({ date, value: counts.get(date) ?? 0 }))
}
