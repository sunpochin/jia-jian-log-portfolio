/*
檔案用途：定義照護時間軸事件、失智照護觀察與液體出入相關資料表型別。
所在層：src/types/database 領域型別層；由 src/types/database.ts 統一 re-export。
主要關聯：components 與 hooks 讀寫照護時間軸、失智照護紀錄與液體出入量時使用；
CareTimelineEntry 的用藥異動快照型別（MedicationChangeSnapshot）定義於 src/types/database/medication.ts。
*/
import type { MedicationChangeSnapshot } from './medication'

export interface CareEventPhotoAttachment {
  path: string
  thumbnail_path: string
  // signed URL 只存在當次畫面，不是資料庫欄位；避免把會過期的網址寫回 JSONB。
  thumbnailUrl?: string
}

export type StoredCareEventPhoto = Omit<CareEventPhotoAttachment, 'thumbnailUrl'>

export type CareTimelineEventType =
  | 'doctor_instruction'
  | 'medication_change'
  | 'family_observation'
  | 'reassessment'
  | 'health_visit'
  | 'incident'
  | 'milestone'
  | 'care_note'
  | 'vaccination'
  | 'symptom_observation'
  | 'diet_change'

export interface CareTimelineEntry {
  id: string
  patient_id: string
  event_type: CareTimelineEventType
  title: string
  details: string
  occurred_at: string
  reassess_on: string | null
  created_by: string
  created_at: string
  medication_plan_id: string | null
  medication_plan_change_log_id?: string | null
  medication_change_snapshot?: MedicationChangeSnapshot | null
  // 只有 event_type === 'health_visit' 時才會有值（#659 S3，issue #685）；
  // 型別沿用 src/lib/careTimeline.ts 的 VisitKind 五種列舉值，與 migration CHECK 同步。
  visit_kind?: 'outpatient' | 'emergency' | 'admission' | 'discharge' | 'surgery' | null
  visit_department?: string | null
  visit_institution?: string | null
  photo_paths?: CareEventPhotoAttachment[]
}

export interface DementiaCareRecord {
  id: string
  patient_id: string
  record_type: 'agitation' | 'day_night_reversal' | 'wandering_risk'
  time_period: 'morning' | 'afternoon' | 'evening' | 'night' | null
  notes: string | null
  occurred_at: string
  recorded_by: string
  created_at: string
}

export type FluidBalanceRecordType = 'meal_intake' | 'water_intake' | 'urination' | 'bowel_movement'

export interface FluidBalanceRecord {
  id: string
  patient_id: string
  record_type: FluidBalanceRecordType
  // 便當攝取量只有這種型態會用到前後秤重；其餘型態一律是 null。
  weight_before_g: number | null
  weight_after_g: number | null
  // 便當攝取量＝公克、喝水量／尿量＝毫升；大便沒有數量，一律是 null。
  amount_value: number | null
  notes: string | null
  occurred_at: string
  recorded_by: string
  created_at: string
}
