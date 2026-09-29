/*
檔案用途：測試單次劑量下限與步距驗證（validDoseAmount）。
所在層：tests/unit 單元測試層。
主要關聯：驗證 src/lib/medication/medicationAdminFormHelpers.ts 邏輯。
*/
import { describe, expect, test } from 'bun:test'
import { validDoseAmount } from '../../src/lib/medication/medicationAdminFormHelpers'

describe('validDoseAmount', () => {
  test('accepts quarter-tablet steps so a taper plan can go down to 1/4', () => {
    // 媽媽正在降低藥量，最小單次劑量要能選到 1/4 顆，不能卡在原本的半顆下限。
    expect(validDoseAmount('0.25')).toBe(true)
    expect(validDoseAmount('0.75')).toBe(true)
    expect(validDoseAmount('1.25')).toBe(true)
  })

  test('still rejects amounts that do not align to the quarter-tablet step', () => {
    expect(validDoseAmount('0.1')).toBe(false)
    expect(validDoseAmount('0')).toBe(false)
    expect(validDoseAmount('-0.25')).toBe(false)
  })
})
