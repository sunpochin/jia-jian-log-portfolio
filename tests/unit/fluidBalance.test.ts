/*
檔案用途：驗證術後體液平衡記錄的輸入驗證與便當攝取公克數計算規則。
所在層：tests/unit；保護 FluidBalancePage 依賴的純函式規則來源。
主要關聯：src/lib/fluidBalance.ts。
*/
import { describe, expect, test } from 'bun:test'
import {
  computeMealConsumedGrams,
  fluidBalanceAmountUnit,
  fluidBalanceRecordNeedsAmount,
  fluidBalanceRecordUsesWeighing,
  isValidFluidBalanceAmount,
  isValidFluidBalanceDraft,
} from '../../src/lib/fluidBalance'

describe('fluid balance', () => {
  test('computes consumed grams as before minus after weight', () => {
    expect(computeMealConsumedGrams(450, 120)).toBe(330)
    expect(computeMealConsumedGrams(450, 450)).toBe(0)
  })

  test('rejects an after-meal weight heavier than the before-meal weight', () => {
    // 吃後比吃前重代表秤錯或輸入顛倒，不能存出一個負數公克數誤導照護判讀。
    expect(computeMealConsumedGrams(120, 450)).toBeNull()
  })

  test('rejects out-of-range or non-finite weights', () => {
    expect(computeMealConsumedGrams(-1, 0)).toBeNull()
    expect(computeMealConsumedGrams(0, Number.NaN)).toBeNull()
    expect(computeMealConsumedGrams(0, 5001)).toBeNull()
  })

  test('only bowel movement records skip the amount field', () => {
    expect(fluidBalanceRecordNeedsAmount('bowel_movement')).toBe(false)
    expect(fluidBalanceRecordNeedsAmount('meal_intake')).toBe(true)
    expect(fluidBalanceRecordNeedsAmount('water_intake')).toBe(true)
    expect(fluidBalanceRecordNeedsAmount('urination')).toBe(true)
  })

  test('only meal intake uses the before/after weighing flow', () => {
    expect(fluidBalanceRecordUsesWeighing('meal_intake')).toBe(true)
    expect(fluidBalanceRecordUsesWeighing('water_intake')).toBe(false)
    expect(fluidBalanceRecordUsesWeighing('urination')).toBe(false)
    expect(fluidBalanceRecordUsesWeighing('bowel_movement')).toBe(false)
  })

  test('reports the correct unit per record type', () => {
    expect(fluidBalanceAmountUnit('meal_intake')).toBe('g')
    expect(fluidBalanceAmountUnit('water_intake')).toBe('ml')
    expect(fluidBalanceAmountUnit('urination')).toBe('ml')
    expect(fluidBalanceAmountUnit('bowel_movement')).toBeNull()
  })

  test('validates amount bounds', () => {
    expect(isValidFluidBalanceAmount(0)).toBe(true)
    expect(isValidFluidBalanceAmount(5000)).toBe(true)
    expect(isValidFluidBalanceAmount(5001)).toBe(false)
    expect(isValidFluidBalanceAmount(-1)).toBe(false)
    expect(isValidFluidBalanceAmount(Number.NaN)).toBe(false)
  })

  test('draft validation requires the right fields per record type', () => {
    expect(isValidFluidBalanceDraft({ recordType: 'bowel_movement', amountValue: null, weightBeforeG: null, weightAfterG: null })).toBe(true)
    expect(isValidFluidBalanceDraft({ recordType: 'water_intake', amountValue: 200, weightBeforeG: null, weightAfterG: null })).toBe(true)
    expect(isValidFluidBalanceDraft({ recordType: 'water_intake', amountValue: null, weightBeforeG: null, weightAfterG: null })).toBe(false)
    expect(isValidFluidBalanceDraft({ recordType: 'meal_intake', amountValue: null, weightBeforeG: 450, weightAfterG: 120 })).toBe(true)
    expect(isValidFluidBalanceDraft({ recordType: 'meal_intake', amountValue: null, weightBeforeG: 120, weightAfterG: 450 })).toBe(false)
    expect(isValidFluidBalanceDraft({ recordType: 'meal_intake', amountValue: null, weightBeforeG: null, weightAfterG: 120 })).toBe(false)
  })
})
