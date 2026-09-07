/*
檔案用途：驗證 04:00 照護日的邊界、時區與查詢區間。
所在層：tests/unit；保護所有每日照護功能共用的時間資料轉接層。
主要關聯：src/lib/careDay.ts、服藥日卡與血壓 Dashboard 的日期查詢。
*/
import { describe, expect, test } from 'bun:test'
import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import timezone from 'dayjs/plugin/timezone'
import { careDateKey, careDayBounds, careDayWindow, calendarDateKey } from '../../src/lib/careDay'

dayjs.extend(utc)
dayjs.extend(timezone)

describe('care day', () => {
  test('keeps the late-night medication on the previous care day', () => {
    expect(careDateKey(dayjs('2026-08-09T19:30:00.000Z'))).toBe('2026-08-09') // Taipei 03:30
    expect(calendarDateKey(dayjs('2026-08-09T19:30:00.000Z'))).toBe('2026-08-10')
  })

  test('switches exactly at 04:00 Taipei time', () => {
    expect(careDateKey(dayjs('2026-08-09T19:59:59.999Z'))).toBe('2026-08-09') // Taipei 03:59:59.999
    expect(careDateKey(dayjs('2026-08-09T20:00:00.000Z'))).toBe('2026-08-10') // Taipei 04:00
    expect(careDateKey(dayjs('2026-08-09T21:00:00.000Z'))).toBe('2026-08-10') // Taipei 05:00
  })

  test('returns a half-open Taipei interval for a care date', () => {
    const { start, end } = careDayBounds('2026-08-10')
    expect(start.toISOString()).toBe('2026-08-09T20:00:00.000Z')
    expect(end.toISOString()).toBe('2026-08-10T20:00:00.000Z')
  })

  test('counts seven care days without extending the end past the next boundary', () => {
    const { start, end } = careDayWindow(7, dayjs('2026-08-09T20:30:00.000Z'))
    expect(start.toISOString()).toBe('2026-08-03T20:00:00.000Z')
    expect(end.toISOString()).toBe('2026-08-10T20:00:00.000Z')
  })
})
