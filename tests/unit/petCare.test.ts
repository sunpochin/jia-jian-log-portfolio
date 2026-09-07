/*
檔案用途：驗證寵物血糖分級規則的邊界值，避免 80／120 兩個端點被誤判成低血糖或高血糖。
所在層：tests/unit；對應 src/lib/petCare.ts。
主要關聯：PetEndocrinePage 的血糖狀態提示。
*/
import { describe, expect, test } from 'bun:test'
import { petBloodGlucoseStatus } from '../../src/lib/petCare'

const DEFAULT_TARGET_RANGE = { lowMgDl: 80, highMgDl: 120 }

describe('petBloodGlucoseStatus', () => {
  test('classifies below 80 as low', () => {
    expect(petBloodGlucoseStatus(79, DEFAULT_TARGET_RANGE)).toBe('low')
    expect(petBloodGlucoseStatus(1, DEFAULT_TARGET_RANGE)).toBe('low')
  })

  test('treats the 80 and 120 boundaries themselves as normal', () => {
    expect(petBloodGlucoseStatus(80, DEFAULT_TARGET_RANGE)).toBe('normal')
    expect(petBloodGlucoseStatus(120, DEFAULT_TARGET_RANGE)).toBe('normal')
    expect(petBloodGlucoseStatus(100, DEFAULT_TARGET_RANGE)).toBe('normal')
  })

  test('classifies above 120 as high', () => {
    expect(petBloodGlucoseStatus(121, DEFAULT_TARGET_RANGE)).toBe('high')
    expect(petBloodGlucoseStatus(600, DEFAULT_TARGET_RANGE)).toBe('high')
  })

  test('uses the patient-specific target range instead of a global 80-120 range', () => {
    const targetRange = { lowMgDl: 90, highMgDl: 150 }
    expect(petBloodGlucoseStatus(89, targetRange)).toBe('low')
    expect(petBloodGlucoseStatus(150, targetRange)).toBe('normal')
    expect(petBloodGlucoseStatus(151, targetRange)).toBe('high')
  })
})
