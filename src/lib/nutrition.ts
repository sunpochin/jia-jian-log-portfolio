/*
檔案用途：集中每餐熱量的輸入邊界、名稱正規化與每日總計規則。
所在層：src/lib 共用業務邏輯層；不直接讀寫 Supabase 或呈現畫面。
主要關聯：NutritionPage、demoStorage、meal food catalog 與單元測試。
*/
import type { LocalizedText } from './i18n'
import type { MealRecordItem, MealType } from '../types/database'

export const MEAL_TYPES: readonly MealType[] = ['breakfast', 'lunch', 'dinner', 'snack']

export const MEAL_TYPE_LABELS: Record<MealType, LocalizedText> = {
  breakfast: { id: 'Sarapan', zh: '早餐', en: 'Breakfast' },
  lunch: { id: 'Makan siang', zh: '午餐', en: 'Lunch' },
  dinner: { id: 'Makan malam', zh: '晚餐', en: 'Dinner' },
  snack: { id: 'Camilan', zh: '點心', en: 'Camilan' },
}

export function normalizeFoodQuery(value: string): string {
  // 品名只統一全半形與空白，刻意不移除數字，才能區分不同容量或份量的包裝。
  return value.normalize('NFKC').toLowerCase().trim().replace(/\s+/g, ' ')
}

export function isValidCalories(value: number | ''): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 10_000
}

export function isValidQuantity(value: number | ''): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= 1_000
}

export function mealCaloriesTotal(items: Pick<MealRecordItem, 'calories_kcal'>[]): number {
  // 未知熱量不能偷偷當成 0 kcal；總計只加可確認的數字，畫面另顯示「尚未完整」。
  return items.reduce((total, item) => total + (item.calories_kcal ?? 0), 0)
}

export function hasUnknownCalories(items: Pick<MealRecordItem, 'calories_kcal'>[]): boolean {
  return items.some(item => item.calories_kcal == null)
}
