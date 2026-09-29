/*
檔案用途：定義寵物慢性病照護相關資料表型別（液體管理、消化健康、食慾、皮下輸液、胰島素、血糖）。
所在層：src/types/database 領域型別層；由 src/types/database.ts 統一 re-export。
主要關聯：components 與 hooks 讀寫寵物慢性病照護紀錄時使用；對應 supabase/migrations 的實際資料表欄位。
*/
import type { MealType } from './nutrition'

// 以下寵物慢性病型別對應 supabase/migrations 的實際資料表欄位；
// 液體管理與消化健康是「一天一筆」（UNIQUE patient_id+recorded_date），食慾、點滴、胰島素、血糖是可一天多筆的時間戳紀錄。
export interface PetLiquidIntakeRecord {
  id: string
  patient_id: string
  recorded_date: string
  water_intake_ml: number | null
  urination_count: number | null
  litter_box_urine_clumps: number | null
  notes: string | null
  recorded_by: string
  created_at: string
  updated_at: string
}

export interface PetDigestionRecord {
  id: string
  patient_id: string
  recorded_date: string
  vomiting_count: number | null
  defecation_count: number | null
  stool_score: 1 | 2 | 3 | 4 | 5 | null
  notes: string | null
  recorded_by: string
  created_at: string
  updated_at: string
}

export interface PetAppetiteRecord {
  id: string
  patient_id: string
  recorded_at: string
  appetite_percent: number
  meal_type: MealType
  notes: string | null
  recorded_by: string
  created_at: string
}

export interface PetSubcutaneousFluidRecord {
  id: string
  patient_id: string
  administered_at: string
  fluid_volume_ml: number
  infusion_rate: string | null
  injection_site: string | null
  notes: string | null
  administered_by: string
  created_at: string
  updated_at: string
}

export interface PetInsulinRecord {
  id: string
  patient_id: string
  administered_at: string
  insulin_units: number
  insulin_type: string | null
  injection_site: string | null
  notes: string | null
  administered_by: string
  created_at: string
  updated_at: string
}

export interface PetBloodGlucoseRecord {
  id: string
  patient_id: string
  measured_at: string
  glucose_mg_dl: number
  measurement_context: 'fasting' | 'before_meal' | 'after_meal' | 'random' | null
  notes: string | null
  recorded_by: string
  created_at: string
}

// 血糖判讀門檻與紀錄同樣以 patient_id 分區；不能把登入者或目前頁籤當成被照護者。
export interface PetBloodGlucoseTargetRange {
  patient_id: string
  low_mg_dl: number
  high_mg_dl: number
  updated_by: string
  created_at: string
  updated_at: string
}
