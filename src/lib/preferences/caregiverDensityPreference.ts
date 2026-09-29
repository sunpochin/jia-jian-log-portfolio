/*
檔案用途：讀寫「看護密度模式」帳號設定——今天頁是否只顯示 Now 與『今天要做』的 Attention 項目、
Trend 收合成一行連結。這是帳號層顯示偏好，不是健康資料，也不是角色或權限系統。
所在層：src/lib；資料轉接層，登入帳號走 Supabase 的 user_settings，展示模式才走本機 localStorage。
主要關聯：由 App.tsx 管理狀態，交給 SettingsPage（開關）與 TodayPage／useTodayOverview（依此切換渲染）使用；
帳號尚未手動選擇時的預設值改讀 lib/tenant.ts 的 fetch_current_household_role()（issue #737）。
*/

import { supabase } from '../supabase'
import { fetchCurrentHouseholdRole, type HouseholdRole } from '../tenant'
import { readLocalValue, writeLocalValue } from './localPreferenceStorage'

const STORAGE_KEY = 'jiajianlog.caregiver-density-mode'

// 展示模式與尚未登入時沒有家庭角色可查，維持最保守的預設（不自動收窄畫面）。
export const DEFAULT_CAREGIVER_DENSITY_MODE = false

// #716 第 2 項已明確排除用語系或 can_manage_medication 當判斷依據，改用 household_members.role
// （唯一定案依據）：看護角色預設開啟精簡顯示，其餘角色（owner／viewer）維持完整顯示。
export function resolveCaregiverDensityModeDefaultByRole(role: HouseholdRole): boolean {
  return role === 'caregiver'
}

export function readCaregiverDensityModePreference(): boolean {
  // 無痕模式若封鎖儲存，仍維持完整顯示的預設，不因儲存失敗而意外收窄看護能看到的資訊。
  return readLocalValue(STORAGE_KEY, raw => raw === 'true', DEFAULT_CAREGIVER_DENSITY_MODE)
}

export function saveCaregiverDensityModePreference(enabled: boolean) {
  writeLocalValue(STORAGE_KEY, String(enabled))
}

export async function readCaregiverDensityModePreferenceForUser(userId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('user_settings')
    .select('caregiver_density_mode, caregiver_density_mode_saved_at')
    .eq('user_id', userId)
    .maybeSingle()

  if (error) throw error
  // 判斷「使用者是否已做過選擇」不能只看 caregiver_density_mode 是否為 NULL：
  // 同一列的 medication_slots_expanded／medication_name_english_first 各自的 upsert
  // 不會動到這個欄位的值，但也不會保證它維持 NULL（見 saved_at 的專屬時間戳設計）。
  // caregiver_density_mode_saved_at 只在 saveCaregiverDensityModePreferenceForUser() 寫入時
  // 更新，是唯一不受其他帳號設定寫入影響的訊號：非 NULL 就代表使用者自己選過，
  // 即使剛好等於角色預設也不能再被角色蓋掉。
  if (data?.caregiver_density_mode_saved_at != null) {
    return data.caregiver_density_mode ?? DEFAULT_CAREGIVER_DENSITY_MODE
  }

  try {
    return resolveCaregiverDensityModeDefaultByRole(await fetchCurrentHouseholdRole())
  } catch (cause) {
    // 尚未加入任何家庭（例如完成設定精靈前）時 RPC 會丟出 'Household membership required'；
    // 這是預期中的過渡狀態而非真正的讀取失敗，維持最保守預設即可，不必讓呼叫端顯示錯誤訊息。
    const message = cause instanceof Error ? cause.message : ''
    if (message.includes('Household membership required')) return DEFAULT_CAREGIVER_DENSITY_MODE
    throw cause
  }
}

export async function saveCaregiverDensityModePreferenceForUser(userId: string, enabled: boolean): Promise<void> {
  const now = new Date().toISOString()
  const { error } = await supabase
    .from('user_settings')
    .upsert({
      user_id: userId,
      caregiver_density_mode: enabled,
      // 密度模式專屬時間戳，讓「是否已做過選擇」不受同一列其他設定寫入影響（見上方讀取端註解）。
      caregiver_density_mode_saved_at: now,
      updated_at: now,
    }, { onConflict: 'user_id' })

  if (error) throw error
}
