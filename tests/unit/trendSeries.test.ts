/*
檔案用途：驗證體重、飲食與服藥趨勢的每日彙整規則，特別是「沒有紀錄」不得被畫成 0 或直線。
所在層：tests/unit；守住趨勢圖不會對照護者傳達不存在的變化。
主要關聯：src/lib/trendSeries.ts 與各模組的趨勢面板。
*/
import dayjs from 'dayjs'
import timezone from 'dayjs/plugin/timezone'
import utc from 'dayjs/plugin/utc'
import { describe, expect, test } from 'bun:test'
import { dailyCalorieTotals, dailyDoseCounts, dailyWeightAverages, trendDateKeys } from '../../src/lib/trendSeries'
import { TZ } from '../../src/lib/timezone'

dayjs.extend(utc)
dayjs.extend(timezone)

const NOW = dayjs.tz('2026-08-17T10:00:00', TZ)

describe('trendDateKeys', () => {
  test('產生含頭尾的連續台北日期，最舊在前', () => {
    expect(trendDateKeys(3, NOW)).toEqual(['2026-08-15', '2026-08-16', '2026-08-17'])
  })

  test('至少回傳一天，避免 0 或負數讓序列變空', () => {
    expect(trendDateKeys(0, NOW)).toEqual(['2026-08-17'])
    expect(trendDateKeys(-5, NOW)).toEqual(['2026-08-17'])
  })
})

describe('dailyWeightAverages', () => {
  test('同一天多次量測收斂為平均值', () => {
    const series = dailyWeightAverages([
      { measured_on: '2026-08-17', weight_kg: 50 },
      { measured_on: '2026-08-17', weight_kg: 51 },
    ], 1, NOW)
    expect(series).toEqual([{ date: '2026-08-17', value: 50.5 }])
  })

  test('沒有量測的日子留 null，不能被連成平穩曲線', () => {
    const series = dailyWeightAverages([
      { measured_on: '2026-08-15', weight_kg: 50 },
      { measured_on: '2026-08-17', weight_kg: 52 },
    ], 3, NOW)
    expect(series).toEqual([
      { date: '2026-08-15', value: 50 },
      { date: '2026-08-16', value: null },
      { date: '2026-08-17', value: 52 },
    ])
  })

  test('忽略無法解析的數值，不讓 NaN 汙染平均', () => {
    const series = dailyWeightAverages([
      { measured_on: '2026-08-17', weight_kg: 50 },
      { measured_on: '2026-08-17', weight_kg: Number.NaN },
    ], 1, NOW)
    expect(series).toEqual([{ date: '2026-08-17', value: 50 }])
  })
})

describe('dailyCalorieTotals', () => {
  test('同一天的餐點熱量加總', () => {
    const series = dailyCalorieTotals([
      { occurredAt: dayjs.tz('2026-08-17T08:00:00', TZ).toISOString(), calories: 300 },
      { occurredAt: dayjs.tz('2026-08-17T12:00:00', TZ).toISOString(), calories: 450 },
    ], 1, NOW)
    expect(series).toEqual([{ date: '2026-08-17', value: 750 }])
  })

  test('完全沒有紀錄的日子是 null，不是 0 大卡', () => {
    const series = dailyCalorieTotals([
      { occurredAt: dayjs.tz('2026-08-17T08:00:00', TZ).toISOString(), calories: 300 },
    ], 2, NOW)
    expect(series).toEqual([
      { date: '2026-08-16', value: null },
      { date: '2026-08-17', value: 300 },
    ])
  })

  test('未填熱量的餐點不併入總和，但仍讓當天出現在序列上', () => {
    const series = dailyCalorieTotals([
      { occurredAt: dayjs.tz('2026-08-17T08:00:00', TZ).toISOString(), calories: null },
    ], 1, NOW)
    expect(series).toEqual([{ date: '2026-08-17', value: null }])
  })

  test('已填與未填混合時只加總已填的數字', () => {
    const series = dailyCalorieTotals([
      { occurredAt: dayjs.tz('2026-08-17T08:00:00', TZ).toISOString(), calories: null },
      { occurredAt: dayjs.tz('2026-08-17T12:00:00', TZ).toISOString(), calories: 400 },
    ], 1, NOW)
    expect(series).toEqual([{ date: '2026-08-17', value: 400 }])
  })
})

describe('dailyDoseCounts', () => {
  test('依照護日計算實際服用劑次', () => {
    const series = dailyDoseCounts([
      { care_date: '2026-08-17', taken_on: '2026-08-17' },
      { care_date: '2026-08-17', taken_on: '2026-08-17' },
      { care_date: '2026-08-16', taken_on: '2026-08-16' },
    ], 2, NOW)
    expect(series).toEqual([
      { date: '2026-08-16', value: 1 },
      { date: '2026-08-17', value: 2 },
    ])
  })

  test('沒有服藥的日子是 0，與體重／飲食的 null 語意不同', () => {
    // 服藥的 0 是可驗證的事實（那天沒有記錄任何一劑）；
    // 體重的空白則代表「沒量」，不能宣稱體重是 0。
    expect(dailyDoseCounts([], 2, NOW)).toEqual([
      { date: '2026-08-16', value: 0 },
      { date: '2026-08-17', value: 0 },
    ])
  })

  test('缺少 care_date 的離線快取退回實際台北日曆日', () => {
    const series = dailyDoseCounts([
      { care_date: null, taken_on: '2026-08-17' },
    ], 1, NOW)
    expect(series).toEqual([{ date: '2026-08-17', value: 1 }])
  })
})
