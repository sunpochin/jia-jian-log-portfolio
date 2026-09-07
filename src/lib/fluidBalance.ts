/*
檔案用途：集中術後體液平衡記錄（便當攝取公克數、喝水量、尿量、大便次數）的型態定義、雙語文案與輸入驗證規則。
所在層：src/lib 共用業務邏輯層；不直接讀寫 Supabase 或呈現畫面。
主要關聯：FluidBalancePage、demoStorage 與單元測試；資料庫對應 fluid_balance_records。
*/
import type { LocalizedText } from './i18n'
import type { FluidBalanceRecordType } from '../types/database'

export const FLUID_BALANCE_RECORD_TYPES: readonly FluidBalanceRecordType[] = [
  'meal_intake',
  'water_intake',
  'urination',
  'bowel_movement',
] as const

export const FLUID_BALANCE_TYPE_LABELS: Record<FluidBalanceRecordType, LocalizedText> = {
  meal_intake: { id: 'Asupan makanan (gram)', zh: '便當攝取量（公克）' ,en: "Asupan food (gram)" },
  water_intake: { id: 'Minum air (ml)', zh: '喝水量（毫升）' ,en: "Take water (ml)" },
  urination: { id: 'Buang air kecil (ml)', zh: '尿量（毫升）' ,en: "Buang water tocil (ml)" },
  bowel_movement: { id: 'Buang air besar', zh: '大便' ,en: "Buang water besar" },
}

// 每種型態能存的合理上限：便當公克數用來擋秤重誤觸整台磅秤重量，尿壺與量杯上限則對齊常見容量。
export const FLUID_BALANCE_AMOUNT_MAX = 5000

export function fluidBalanceRecordNeedsAmount(recordType: FluidBalanceRecordType): boolean {
  // 只有大便不記數量，其餘三種型態都必須留下實際量測到的公克或毫升數。
  return recordType !== 'bowel_movement'
}

export function fluidBalanceRecordUsesWeighing(recordType: FluidBalanceRecordType): boolean {
  // 便當攝取量是秤重前後相減得出，其餘型態直接讀取量杯或尿壺刻度即可。
  return recordType === 'meal_intake'
}

export function isValidFluidBalanceWeight(value: number): boolean {
  return Number.isFinite(value) && value >= 0 && value <= FLUID_BALANCE_AMOUNT_MAX
}

export function isValidFluidBalanceAmount(value: number): boolean {
  return Number.isFinite(value) && value >= 0 && value <= FLUID_BALANCE_AMOUNT_MAX
}

/**
 * 便當攝取公克數＝吃前秤重減去吃後秤重；吃後比吃前重（秤錯或輸入顛倒）回傳 null，
 * 讓呼叫端能明確擋下這筆資料，而不是存一個負數公克數誤導照護判讀。
 */
export function computeMealConsumedGrams(weightBeforeG: number, weightAfterG: number): number | null {
  if (!isValidFluidBalanceWeight(weightBeforeG) || !isValidFluidBalanceWeight(weightAfterG)) return null
  if (weightAfterG > weightBeforeG) return null
  return Number((weightBeforeG - weightAfterG).toFixed(1))
}

export function fluidBalanceAmountUnit(recordType: FluidBalanceRecordType): 'g' | 'ml' | null {
  if (recordType === 'meal_intake') return 'g'
  if (recordType === 'water_intake' || recordType === 'urination') return 'ml'
  return null
}

export interface FluidBalanceDraft {
  recordType: FluidBalanceRecordType
  amountValue: number | null
  weightBeforeG: number | null
  weightAfterG: number | null
}

/** 送出前的完整性檢查：依型態要求不同欄位，統一在這裡判斷，畫面只需要呼叫一次。 */
export function isValidFluidBalanceDraft(draft: FluidBalanceDraft): boolean {
  if (draft.recordType === 'bowel_movement') return true
  if (draft.recordType === 'meal_intake') {
    if (draft.weightBeforeG === null || draft.weightAfterG === null) return false
    return computeMealConsumedGrams(draft.weightBeforeG, draft.weightAfterG) !== null
  }
  return draft.amountValue !== null && isValidFluidBalanceAmount(draft.amountValue)
}
