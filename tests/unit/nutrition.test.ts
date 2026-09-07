/*
檔案用途：驗證每餐熱量的輸入邊界、品名搜尋正規化與未知熱量總計規則。
所在層：tests/unit；保護 NutritionPage 與資料庫 adapter 共用的純邏輯。
主要關聯：src/lib/nutrition.ts、meal_records 與 meal_record_items。
*/
import { describe, expect, test } from 'bun:test'
import { hasUnknownCalories, isValidCalories, isValidQuantity, mealCaloriesTotal, normalizeFoodQuery } from '../../src/lib/nutrition'

describe('nutrition input rules', () => {
  test('keeps numbers while normalizing product searches', () => {
    expect(normalizeFoodQuery('  Ｍｉｌｋ　２５０ml ')).toBe('milk 250ml')
  })

  test('accepts realistic kcal and portion values only', () => {
    expect(isValidCalories(320)).toBe(true)
    expect(isValidCalories(-1)).toBe(false)
    expect(isValidCalories(10_001)).toBe(false)
    expect(isValidQuantity(1)).toBe(true)
    expect(isValidQuantity(0)).toBe(false)
  })

  test('does not silently treat unknown calories as confirmed zero', () => {
    const items = [{ calories_kcal: 120 }, { calories_kcal: null }]
    expect(mealCaloriesTotal(items)).toBe(120)
    expect(hasUnknownCalories(items)).toBe(true)
  })
})
