/*
檔案用途：驗證血壓三個輸入格使用同一條自動跳欄規則，且不會在打字中途搶走焦點。
所在層：tests/unit；守住照護者抄血壓計時的輸入手感一致。
主要關聯：src/features/vitals/pages/InputPage.utils.ts 的 bpAutoAdvance 與 InputPage 的三個 PickerCard。
*/
import { describe, expect, test } from 'bun:test'
import { bpAutoAdvance } from '../../src/features/vitals/pages/InputPage.utils'

describe('bpAutoAdvance', () => {
  test('三位數立刻跳到下一格', () => {
    expect(bpAutoAdvance('systolic', 120)).toBe('immediate')
    expect(bpAutoAdvance('diastolic', 105)).toBe('immediate')
    expect(bpAutoAdvance('pulse', 100)).toBe('immediate')
  })

  test('兩位數延遲跳轉，留時間補完可能的第三位數', () => {
    // 修正前收縮壓 98 完全不會跳（要求滿三位數），舒張壓 85 卻立刻跳，
    // 外觀相同的三個框行為不同，照護者無法建立穩定預期。
    expect(bpAutoAdvance('systolic', 98)).toBe('delayed')
    expect(bpAutoAdvance('diastolic', 85)).toBe('delayed')
    expect(bpAutoAdvance('pulse', 72)).toBe('delayed')
  })

  test('三位數打到一半不跳，避免焦點在輸入中途被搶走', () => {
    // 打 105 會先經過 10；10 未達舒張壓下限，必須繼續等待。
    expect(bpAutoAdvance('diastolic', 10)).toBe('none')
    expect(bpAutoAdvance('systolic', 12)).toBe('none')
    expect(bpAutoAdvance('pulse', 15)).toBe('none')
  })

  test('單一位數與空值都不跳', () => {
    expect(bpAutoAdvance('systolic', 1)).toBe('none')
    expect(bpAutoAdvance('systolic', '')).toBe('none')
    expect(bpAutoAdvance('systolic', 0)).toBe('none')
  })

  test('三個欄位共用同一條規則，只有下限不同', () => {
    // 收縮壓下限 60、舒張壓 30、心跳 20；同一個兩位數在不同欄位可能有不同結果，
    // 但判斷方式（位數 + 是否已達該欄位下限）三格完全相同。
    expect(bpAutoAdvance('systolic', 25)).toBe('none')
    expect(bpAutoAdvance('diastolic', 25)).toBe('none')
    expect(bpAutoAdvance('pulse', 25)).toBe('delayed')
  })
})
