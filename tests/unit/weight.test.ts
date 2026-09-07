/*
檔案用途：驗證體重日期、數值與每日量測槽位規則。
所在層：tests/unit；保護體重輸入資料層不因 UI 或資料庫變更而放寬邊界。
主要關聯：src/lib/weight.ts、WeightPage 與 weight migration。
*/
import { describe, expect, test } from 'bun:test'
import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import timezone from 'dayjs/plugin/timezone'
import { firstEmptyWeightMeasurement, formatWeightKg, isValidWeightInput, isWeightMeasurementNumber, roundWeightKg, taipeiWeightDate, WEIGHT_INPUT_STEP } from '../../src/lib/weight'

dayjs.extend(utc)
dayjs.extend(timezone)

describe('weight helpers', () => {
  test('uses Taipei date so late-night UTC writes belong to the local next day', () => {
    expect(taipeiWeightDate(dayjs('2026-07-23T16:30:00.000Z'))).toBe('2026-07-24')
  })

  test('accepts any positive weight up to the column limit, since patients are not always human adults', () => {
    // 被照護者不限成人；寵物可能是河馬也可能是新生兒，10～500 公斤的人類假設不成立。
    expect(isValidWeightInput(55.4)).toBe(true)
    expect(isValidWeightInput(0.5)).toBe(true)
    expect(isValidWeightInput(3000)).toBe(true)
    expect(isValidWeightInput(99999)).toBe(true)
    expect(isValidWeightInput(0)).toBe(false)
    expect(isValidWeightInput(-1)).toBe(false)
    expect(isValidWeightInput(100000)).toBe(false)
    expect(isValidWeightInput('')).toBe(false)
  })

  test('shows two decimals so the caregiver sees the number they measured', () => {
    // 之前顯示只有一位小數，58.25 會被畫成 58.3，看起來像系統改了讀值。
    expect(formatWeightKg(58.25)).toBe('58.25')
    expect(formatWeightKg(58)).toBe('58.00')
    // Supabase 的 NUMERIC 可能以字串回傳，顯示層必須自己轉數字。
    expect(formatWeightKg('58.2')).toBe('58.20')
    // 壞資料顯示破折號，不要讓照護者在畫面上看到 NaN。
    expect(formatWeightKg('')).toBe('—')
    expect(formatWeightKg(Number.NaN)).toBe('—')
  })

  test('rounds writes to the NUMERIC(7, 2) precision the column actually stores', () => {
    expect(roundWeightKg(58.256)).toBe(58.26)
    expect(roundWeightKg(58.2)).toBe(58.2)
  })

  test('keeps the input step aligned with the stored precision', () => {
    // step 若停在 0.01 以外的值，瀏覽器會把兩位小數判成無效輸入。
    expect(WEIGHT_INPUT_STEP).toBe('0.01')
  })

  test('limits the daily measurement slot to twelve records', () => {
    expect(isWeightMeasurementNumber(1)).toBe(true)
    expect(isWeightMeasurementNumber(12)).toBe(true)
    expect(isWeightMeasurementNumber(0)).toBe(false)
    expect(isWeightMeasurementNumber(13)).toBe(false)
    expect(isWeightMeasurementNumber(2.5)).toBe(false)
  })

  test('prefers the first empty slot while preserving the twelve-slot boundary', () => {
    expect(firstEmptyWeightMeasurement({})).toBe(1)
    expect(firstEmptyWeightMeasurement({ 1: { weight_kg: 55 } })).toBe(2)
    expect(firstEmptyWeightMeasurement({ 1: {}, 2: {}, 3: {} })).toBe(4)
    expect(firstEmptyWeightMeasurement({ 1: {}, 2: {}, 3: {}, 4: {}, 5: {}, 6: {}, 7: {}, 8: {}, 9: {}, 10: {}, 11: {}, 12: {} })).toBe(1)
  })
})
