/*
檔案用途：白名單檢驗值（K／NA／CR／EGFR／HBA1C／GLU／HB）的中繼資料與範圍判讀（純函式，不 import supabase）。
所在層：src/lib 共用資料層；從 labResults.ts 拆出，讓不能碰 Supabase 的純 adapter
        （src/lib/adapters/nhi/labs.ts，issue #688）能單獨依賴這個檔案取得白名單設定，
        不會透過 labResults.ts 連帶引入資料庫用戶端。
主要關聯：labResults.ts（re-export 全部符號，既有呼叫端 import 路徑不受影響）、
          src/lib/adapters/nhi/labs.ts（用 LAB_ITEM_META[code].nhiNameAliases 判斷 r7 匯入的
          檢驗項目名稱是否落在白名單）、src/lib/preVisitBrief.ts（R5）、LabResultsPage.tsx。
*/
import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import timezone from 'dayjs/plugin/timezone'
import type { LocalizedText } from './i18n'
import { CARE_DAY_TIMEZONE } from './careDay'
import type { LabItemCode, PatientLabResult } from '../types/database'
import type { TrajectoryMedicationGroup } from './medicalTrajectory'

dayjs.extend(utc)
dayjs.extend(timezone)

export type { LabItemCode } from '../types/database'

export type LabRangeStatus = 'below' | 'within' | 'above' | 'unknown'

// 採檢日一律以台北日曆日解讀，不用瀏覽器時區：報告上印的是「日期」不是時刻。
// 若用 new Date('YYYY-MM-DDT00:00:00') 寫入，會依裝置時區漂移；讀回時再用 slice(0, 10) 取 UTC 日期，
// 台北使用者會少一天，而且每次編輯再存一次就再往前推一天——這是獨立複審抓到的資料漂移，
// 兩個方向都必須走同一個時區（比照 prnMedication.ts 與 preVisitBrief.ts 的 dayjs.tz 作法）。
export function sampledAtFromDateKey(dateKey: string): string {
  return dayjs.tz(dateKey, CARE_DAY_TIMEZONE).toISOString()
}

export function sampledDateKey(sampledAt: string): string {
  return dayjs(sampledAt).tz(CARE_DAY_TIMEZONE).format('YYYY-MM-DD')
}

// relatedMedicationGroups 只服務 R5 第一版的「同義配對」證據並列（issue #687：A12B↔K、A10↔GLU／HbA1c），
// 不是完整的臨床關聯表；NA／CR／EGFR／HB 目前沒有對應的慢性病用藥分類，維持空陣列。
// nhiNameAliases：issue #688 已用它比對 r7 匯入的「檢驗項目名稱」——經
// src/lib/adapters/nhi/labs.ts 移植的 HealthWorkbench labs 知識庫 aliasMap 正規化後，
// 只有正規化名稱落在這個陣列裡才算白名單命中。HealthWorkbench 上游目前只收錄了
// Hemoglobin／Creatinine／eGFR（三種公式變體）對應到我們的白名單；K／NA／HBA1C／GLU
// 上游尚未收錄對應別名，維持空陣列——之後上游補上才能匯入，不得由本專案自行臆測別名。
// EGFR 刻意合併上游三個獨立公式（eGFR (CKD-EPI)／eGFR (MDRD)／eGFR Male，上游本身
// 特意不合併以免混用趨勢線）：因為我們的 schema 只有單一 EGFR 代碼、不分公式，
// 這是本專案 schema 限制下的刻意簡化，不是移植上游行為（見 labs.ts 檔頭說明）。
export const LAB_ITEM_META: Record<LabItemCode, {
  label: LocalizedText
  unit: string
  decimals: number
  relatedMedicationGroups: TrajectoryMedicationGroup[]
  nhiNameAliases: string[]
}> = {
  K: { label: { id: 'Kalium (K)', zh: '鉀（K）', en: 'Potassium (K)' }, unit: 'mmol/L', decimals: 1, relatedMedicationGroups: ['potassium'], nhiNameAliases: [] },
  NA: { label: { id: 'Natrium (Na)', zh: '鈉（Na）', en: 'Sodium (Na)' }, unit: 'mmol/L', decimals: 1, relatedMedicationGroups: [], nhiNameAliases: [] },
  CR: { label: { id: 'Kreatinin (Cr)', zh: '肌酸酐（Cr）', en: 'Creatinine (Cr)' }, unit: 'mg/dL', decimals: 2, relatedMedicationGroups: [], nhiNameAliases: ['Creatinine'] },
  EGFR: { label: { id: 'Laju filtrasi glomerulus (eGFR)', zh: '腎絲球過濾率（eGFR）', en: 'Estimated glomerular filtration rate (eGFR)' }, unit: 'mL/min/1.73m2', decimals: 1, relatedMedicationGroups: [], nhiNameAliases: ['eGFR (CKD-EPI)', 'eGFR (MDRD)', 'eGFR Male'] },
  HBA1C: { label: { id: 'HbA1c', zh: '糖化血色素（HbA1c）', en: 'HbA1c' }, unit: '%', decimals: 1, relatedMedicationGroups: ['diabetes'], nhiNameAliases: [] },
  GLU: { label: { id: 'Gula darah', zh: '血糖（GLU）', en: 'Blood glucose (GLU)' }, unit: 'mg/dL', decimals: 0, relatedMedicationGroups: ['diabetes'], nhiNameAliases: [] },
  HB: { label: { id: 'Hemoglobin (Hb)', zh: '血色素（Hb）', en: 'Hemoglobin (Hb)' }, unit: 'g/dL', decimals: 1, relatedMedicationGroups: [], nhiNameAliases: ['Hemoglobin'] },
}

export const LAB_ITEM_CODES = Object.keys(LAB_ITEM_META) as LabItemCode[]

// 缺參考值只顯示不分類：這筆報告本身沒帶 reference_low/high 時，不能用全域門檻硬猜，直接回傳 unknown。
export function labRangeStatus(result: Pick<PatientLabResult, 'value' | 'reference_low' | 'reference_high'>): LabRangeStatus {
  if (result.reference_low == null || result.reference_high == null) return 'unknown'
  if (result.value < result.reference_low) return 'below'
  if (result.value > result.reference_high) return 'above'
  return 'within'
}
