/*
檔案用途：定義白名單檢驗值（issue #687）相關型別。
所在層：src/types/database 領域型別層；由 src/types/database.ts 統一 re-export。
主要關聯：components 與 hooks 讀寫檢驗報告數值時使用。
*/
// 白名單檢驗值（issue #687，S4）：item_code／unit 綁定與 CHECK 見對應 migration；
// reference_low/high 是「這筆報告自己的參考值」，不是全域醫療門檻，缺值時代表無法分類，不代表正常。
export type LabItemCode = 'K' | 'NA' | 'CR' | 'EGFR' | 'HBA1C' | 'GLU' | 'HB'
export type LabResultSource = 'manual' | 'nhi_import'

export interface PatientLabResult {
  id: string
  patient_id: string
  item_code: LabItemCode
  value: number
  unit: string
  reference_low: number | null
  reference_high: number | null
  sampled_at: string
  institution: string | null
  notes: string | null
  source: LabResultSource
  source_fingerprint: string | null
  recorded_by: string
  created_at: string
}
