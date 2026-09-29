/*
檔案用途：定義帳號在特定病人畫面上的顯示偏好型別（非健康資料，不能取代 care_access 授權）。
所在層：src/types/database 領域型別層；由 src/types/database.ts 統一 re-export。
主要關聯：components 與 hooks 讀寫「目前選定病人」與各照護模組顯示開關時使用。
*/
export interface ActivePatientPreference {
  profile_email: string
  patient_id: string
  updated_at: string
}

// 這是帳號在特定病人畫面上的顯示偏好，不是健康資料，也不能取代 care_access。
export interface UserPatientCarePreference {
  user_id: string
  patient_id: string
  show_blood_pressure: boolean
  show_temperature: boolean
  show_medication: boolean
  show_nutrition: boolean
  show_weight: boolean
  created_at: string
  updated_at: string
}

// 這是被照顧者共用的每日照護入口偏好；它不是健康資料，也不能取代 care_access。
export interface PatientDailyCarePreference {
  patient_id: string
  show_blood_pressure: boolean
  show_temperature: boolean
  show_medication: boolean
  show_nutrition: boolean
  show_weight: boolean
  created_at: string
  updated_at: string
}
