/*
檔案用途：集中寵物慢性病照護的純邏輯規則（目前為血糖分級），與 Supabase／Demo 存取邏輯分開，方便單元測試。
所在層：src/lib 共用業務邏輯層；不直接讀寫 Supabase 或呈現畫面。
主要關聯：PetEndocrinePage。
*/
export type PetBloodGlucoseStatus = 'low' | 'normal' | 'high'
export type PetBloodGlucoseTargetRange = { lowMgDl: number; highMgDl: number }

// Demo 只用虛構資料；正式資料沒有 target row 時不顯示判讀，避免把全域預設誤套到別的病人。
export const DEMO_PET_BLOOD_GLUCOSE_TARGET_RANGE: PetBloodGlucoseTargetRange = { lowMgDl: 80, highMgDl: 120 }

// 邊界值刻意用 >= / <= 明確涵蓋 target 的兩個端點；target 由呼叫端先以 patient_id 取得。
export function petBloodGlucoseStatus(glucoseMgDl: number, targetRange: PetBloodGlucoseTargetRange): PetBloodGlucoseStatus {
  if (glucoseMgDl < targetRange.lowMgDl) return 'low'
  if (glucoseMgDl > targetRange.highMgDl) return 'high'
  return 'normal'
}
