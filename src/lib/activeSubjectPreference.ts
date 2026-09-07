/*
檔案用途：保存與讀取使用者上一次選擇的活躍照護對象偏好。
所在層：src/lib；為偏好設定持久層。
主要關聯：由 App.tsx 登入與切換對象時載入及寫入。
*/
import { supabase } from './supabase'

export function resolveActivePatientPreference(savedPatientId: string | null, accessiblePatientIds: string[], fallbackPatientId: string, _ownPatientId?: string | null): string {
  // 偏好只能恢復仍在授權清單內的 UUID；不可因舊快取或前端竄改回到未授權病人。
  return savedPatientId && accessiblePatientIds.includes(savedPatientId) ? savedPatientId : fallbackPatientId
}

export async function readActivePatientPreference(profileEmail: string): Promise<string | null> {
  const { data, error } = await supabase.from('active_patient_preferences').select('patient_id').eq('profile_email', profileEmail.toLowerCase()).maybeSingle()
  if (error) throw error
  return data?.patient_id ?? null
}

export async function saveActivePatientPreference(profileEmail: string, patientId: string) {
  const { error } = await supabase.from('active_patient_preferences').upsert({ profile_email: profileEmail.toLowerCase(), patient_id: patientId, updated_at: new Date().toISOString() }, { onConflict: 'profile_email' })
  if (error) throw error
}
