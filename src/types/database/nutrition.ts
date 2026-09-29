/*
檔案用途：定義飲食紀錄相關資料表型別（食物主檔、餐次紀錄與餐次品項）。
所在層：src/types/database 領域型別層；由 src/types/database.ts 統一 re-export。
主要關聯：components、hooks 與 lib 讀寫飲食紀錄時使用；MealType 亦被 src/types/database/pet.ts 的寵物進食紀錄型別引用。
*/
export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack'
export type CalorieBasis = 'user_entered' | 'label' | 'estimate' | 'unknown'

export interface MealFoodCatalogItem {
  id: string
  patient_id: string
  display_name: string
  brand_name: string | null
  normalized_search_text: string
  default_serving_label: string
  default_calories_kcal: number | null
  source: 'manual' | 'photo_label' | 'photo_estimate'
  last_used_at: string
  use_count: number
  created_by: string
  created_at: string
  updated_at: string
}

export interface MealRecord {
  id: string
  patient_id: string
  meal_type: MealType
  occurred_at: string
  notes: string | null
  source: 'manual' | 'photo_assisted'
  recorded_by: string
  created_at: string
  updated_at: string
}

export interface MealRecordItem {
  id: string
  meal_record_id: string
  patient_id: string
  food_catalog_item_id: string | null
  food_name_snapshot: string
  serving_label_snapshot: string
  quantity: number
  calories_kcal: number | null
  calorie_basis: CalorieBasis
  created_at: string
}
