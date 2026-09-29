/*
檔案用途：讀寫「主動異常示警」（issue #415）門檻設定之 Supabase 介面，隔離 RLS 細節。
所在層：src/lib 資料轉接層。
主要關聯：patient_anomaly_alert_settings migration、CareAnomalyAlertSettingsPanel、
        src/features/today/hooks/useCareAnomalySignals.ts。
*/
import { supabase } from './supabase'

export interface CareAnomalyAlertSettings {
  enabled: boolean
  weightDropWindowDays: number
  weightDropThresholdPercent: number
  missedMedicationThresholdDays: number
  bpHighStreakThresholdDays: number
  nightLowBpWindowDays: number
  nightLowBpThresholdCount: number
}

// 產品北極星「警報分級、寧缺勿濫」：預設值先偏保守（門檻較高、範圍較寬），
// 避免新家庭一開始就被過度敏感的觀察訊息打擾；家屬可自行調整，見 migration 的 CHECK 範圍。
export const DEFAULT_CARE_ANOMALY_ALERT_SETTINGS: CareAnomalyAlertSettings = {
  enabled: true,
  weightDropWindowDays: 30,
  weightDropThresholdPercent: 5,
  missedMedicationThresholdDays: 3,
  bpHighStreakThresholdDays: 3,
  nightLowBpWindowDays: 7,
  nightLowBpThresholdCount: 3,
}

// 對應 migration 的 CHECK 範圍；UI 與這裡共用同一組邊界，避免畫面能送出資料庫一定會拒絕的值。
export const CARE_ANOMALY_ALERT_SETTINGS_BOUNDS = {
  weightDropWindowDays: { min: 7, max: 180 },
  weightDropThresholdPercent: { min: 1, max: 50 },
  missedMedicationThresholdDays: { min: 1, max: 14 },
  bpHighStreakThresholdDays: { min: 1, max: 14 },
  nightLowBpWindowDays: { min: 3, max: 30 },
  nightLowBpThresholdCount: { min: 1, max: 20 },
} as const

type SettingsRow = {
  enabled: boolean
  weight_drop_window_days: number
  weight_drop_threshold_percent: number
  missed_medication_threshold_days: number
  bp_high_streak_threshold_days: number
  night_low_bp_window_days: number
  night_low_bp_threshold_count: number
}

function fromRow(row: SettingsRow): CareAnomalyAlertSettings {
  return {
    enabled: row.enabled,
    weightDropWindowDays: row.weight_drop_window_days,
    weightDropThresholdPercent: Number(row.weight_drop_threshold_percent),
    missedMedicationThresholdDays: row.missed_medication_threshold_days,
    bpHighStreakThresholdDays: row.bp_high_streak_threshold_days,
    nightLowBpWindowDays: row.night_low_bp_window_days,
    nightLowBpThresholdCount: row.night_low_bp_threshold_count,
  }
}

export async function readCareAnomalyAlertSettings(patientId: string): Promise<CareAnomalyAlertSettings> {
  const { data, error } = await supabase
    .from('patient_anomaly_alert_settings')
    .select('enabled, weight_drop_window_days, weight_drop_threshold_percent, missed_medication_threshold_days, bp_high_streak_threshold_days, night_low_bp_window_days, night_low_bp_threshold_count')
    .eq('patient_id', patientId)
    .maybeSingle()
  if (error) throw error
  // 家庭還沒存過設定時用預設值，而不是視為錯誤——這是「還沒調整過」，不是讀取失敗。
  return data ? fromRow(data as SettingsRow) : DEFAULT_CARE_ANOMALY_ALERT_SETTINGS
}

export async function saveCareAnomalyAlertSettings(patientId: string, settings: CareAnomalyAlertSettings): Promise<void> {
  const { error } = await supabase
    .from('patient_anomaly_alert_settings')
    .upsert({
      patient_id: patientId,
      enabled: settings.enabled,
      weight_drop_window_days: settings.weightDropWindowDays,
      weight_drop_threshold_percent: settings.weightDropThresholdPercent,
      missed_medication_threshold_days: settings.missedMedicationThresholdDays,
      bp_high_streak_threshold_days: settings.bpHighStreakThresholdDays,
      night_low_bp_window_days: settings.nightLowBpWindowDays,
      night_low_bp_threshold_count: settings.nightLowBpThresholdCount,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'patient_id' })
  if (error) throw error
}
