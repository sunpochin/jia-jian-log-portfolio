/*
檔案用途：測試單次劑量下拉選單的分數標籤（doseOptionLabel）。
所在層：tests/unit 單元測試層。
主要關聯：驗證 src/features/medication/components/MedicationAdminFormFields.tsx 邏輯。
*/
import { describe, expect, test } from 'bun:test'
import { doseOptionLabel } from '../../src/features/medication/components/MedicationAdminFormFields'

describe('doseOptionLabel', () => {
  test('shows quarter and three-quarter tablets as fractions for tapering doses', () => {
    // 媽媽正在降低藥量，選單要能顯示 1/4、3/4 顆的分數標示，不能只到半顆。
    expect(doseOptionLabel(0.25)).toBe('¼')
    expect(doseOptionLabel(0.75)).toBe('¾')
    expect(doseOptionLabel(1.25)).toBe('1¼')
  })

  test('keeps existing half-tablet and whole-number labels unchanged', () => {
    expect(doseOptionLabel(0.5)).toBe('½')
    expect(doseOptionLabel(1.5)).toBe('1½')
    expect(doseOptionLabel(1)).toBe('1')
    expect(doseOptionLabel(2)).toBe('2')
  })
})
