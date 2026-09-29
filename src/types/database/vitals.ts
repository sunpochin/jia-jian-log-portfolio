/*
檔案用途：定義體溫與體重相關資料表型別。
所在層：src/types/database 領域型別層；由 src/types/database.ts 統一 re-export。
主要關聯：components、hooks 與 lib 讀寫體溫、體重紀錄與體重顯示設定時使用。
*/
export type TemperatureSite = 'ear' | 'forehead' | 'oral' | 'axillary'
export type TemperatureContext = 'symptoms' | 'after_medication' | 'routine'

export interface TemperatureRecord {
  id: string
  temperature_c: number
  measurement_site: TemperatureSite
  context: TemperatureContext
  notes: string | null
  measured_at: string
  source: string
  recorded_by: string | null
  patient_id: string
  created_at: string
}

export type TemperatureInsert = Omit<TemperatureRecord, 'id' | 'created_at'>

export interface WeightRecord {
  id: string
  patient_id: string
  profile_email: string
  weight_kg: number
  measured_on: string
  measured_at: string
  recorded_by: string
  created_at: string
}

export interface PatientWeightMeasurementRecord extends WeightRecord {
  measurement_number: 1 | 2 | 3 | 4
}

export interface WeightSetting {
  patient_id: string
  profile_email: string
  enabled: boolean
  updated_at: string
}
