/*
檔案用途：集中處理血壓紀錄的冪等 INSERT，讓線上寫入與離線佇列重試共用同一條資料邊界。
所在層：src/lib；是血壓頁面與 pending queue 之間的 Supabase 薄轉接層。
主要關聯：InputPage、bloodPressurePendingQueue 與 blood_pressure_records 的 RLS／每日配額 trigger。
*/
import { supabase } from './supabase'

export interface BloodPressureInsertPayload {
  id: string
  systolic: number
  diastolic: number
  pulse: number | null
  measured_at: string
  source: string
  patient_id: string
  recorded_by: string | null
}

/**
 * 使用 client UUID 寫入血壓，讓「伺服器已收到但瀏覽器沒拿到回應」的情況可以安全重試。
 * 如果不固定 id，離線佇列重送會產生第二筆健康紀錄，這比單純顯示一次錯誤更危險。
 */
export async function insertBloodPressureRecord(payload: BloodPressureInsertPayload): Promise<'inserted' | 'already-existed'> {
  const { error, status } = await supabase.from('blood_pressure_records').insert(payload)
  if (!error) return 'inserted'
  // PostgrestError 本身沒有 HTTP status；408/429/5xx 只出現在頂層回應，要一併附上才能讓
  // isRetryableWriteError() 正確辨識該重試的暫時性失敗，否則會被誤判成一般儲存失敗。
  if (error.code !== '23505') throw Object.assign(error, { status })

  // 23505 只在同一筆 id 已存在時視為成功；先回讀確認，避免把其他唯一約束錯誤吞掉。
  const { data, error: readError } = await supabase
    .from('blood_pressure_records')
    .select('id')
    .eq('id', payload.id)
    .maybeSingle()
  if (readError) throw readError
  if (data?.id === payload.id) return 'already-existed'
  throw Object.assign(error, { status })
}
