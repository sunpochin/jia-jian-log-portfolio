/*
檔案用途：驗證寵物慢性病歷史趨勢的每日日期、總量、平均與空白日規則。
所在層：tests/unit；守住圖表彙整不會把未記錄誤算成 0 或跨時區分錯日期。
主要關聯：src/lib/petTrendSeries.ts、PetTrendPanel 與六張寵物紀錄表的讀取結果。
*/
import dayjs from 'dayjs'
import timezone from 'dayjs/plugin/timezone'
import utc from 'dayjs/plugin/utc'
import { describe, expect, test } from 'bun:test'
import { dailyPetAverages, dailyPetDateValues, dailyPetTotals } from '../../src/lib/petTrendSeries'
import { TZ } from '../../src/lib/timezone'

dayjs.extend(utc)
dayjs.extend(timezone)

const now = dayjs.tz('2026-08-22 12:00', TZ)

describe('pet trend series', () => {
  test('keeps an empty day as null for one-row-per-day records', () => {
    expect(dailyPetDateValues([
      { date: '2026-08-20', value: 200 },
      { date: '2026-08-22', value: 0 },
    ], 3, now)).toEqual([
      { date: '2026-08-20', value: 200 },
      { date: '2026-08-21', value: null },
      { date: '2026-08-22', value: 0 },
    ])
  })

  test('sums multiple treatment records by Taipei date and ignores invalid values', () => {
    expect(dailyPetTotals([
      { at: '2026-08-21T10:00:00.000Z', value: 100 },
      { at: '2026-08-21T12:00:00.000Z', value: '50' },
      { at: '2026-08-22T03:00:00.000Z', value: null },
      { at: '2026-08-22T10:00:00.000Z', value: 'not-a-number' },
    ], 3, now)).toEqual([
      { date: '2026-08-20', value: null },
      { date: '2026-08-21', value: 150 },
      { date: '2026-08-22', value: null },
    ])
  })

  test('averages repeated measurements without treating missing days as zero', () => {
    expect(dailyPetAverages([
      { at: '2026-08-21T01:00:00.000Z', value: 80 },
      { at: '2026-08-21T10:00:00.000Z', value: 40 },
      { at: '2026-08-22T01:00:00.000Z', value: null },
    ], 2, now)).toEqual([
      { date: '2026-08-21', value: 60 },
      { date: '2026-08-22', value: null },
    ])
  })
})
