/*
檔案用途：讀寫服藥頁的帳號顯示偏好——包含各餐藥卡是否預設展開，以及藥名是否優先顯示英文商品名。
所在層：src/lib；是設定資料轉接層，登入帳號走 Supabase 的 user_settings，展示模式才走本機儲存。
主要關聯：由 App.tsx 管理狀態，交給 Settings 與 MedicationPage 使用。
*/

import { supabase } from './supabase'

const STORAGE_KEY = 'jiajianlog.medication-slots-expanded'
export const DEFAULT_MEDICATION_SLOTS_EXPANDED = true

const NAME_ENGLISH_FIRST_STORAGE_KEY = 'jiajianlog.medication-name-english-first'
// 外籍看護與家屬溝通時最先認得包裝上的英文商品名；預設英文優先，符合大多數家庭實際核藥的習慣。
export const DEFAULT_MEDICATION_NAME_ENGLISH_FIRST = true

export function readMedicationSlotsExpandedPreference(): boolean {
  try {
    // 首次使用維持所有餐次直接可見；這是照護操作的安全預設，而非醫囑或健康資料。
    return globalThis.localStorage.getItem(STORAGE_KEY) !== 'false'
  } catch {
    // 無痕模式若封鎖儲存，仍讓藥卡展開，避免照護者因瀏覽器限制多一次點擊。
    return DEFAULT_MEDICATION_SLOTS_EXPANDED
  }
}

export function saveMedicationSlotsExpandedPreference(expanded: boolean) {
  try {
    globalThis.localStorage.setItem(STORAGE_KEY, String(expanded))
  } catch {
    // 這只影響下次開啟時的閱讀密度；儲存失敗不能中斷當下的服藥流程。
  }
}

export async function readMedicationSlotsExpandedPreferenceForUser(userId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('user_settings')
    .select('medication_slots_expanded')
    .eq('user_id', userId)
    .maybeSingle()

  if (error) throw error
  // 沒有資料列代表尚未改過設定；資料庫與前端都以展開作為照護安全預設。
  return data?.medication_slots_expanded ?? DEFAULT_MEDICATION_SLOTS_EXPANDED
}

export async function saveMedicationSlotsExpandedPreferenceForUser(userId: string, expanded: boolean): Promise<void> {
  const { error } = await supabase
    .from('user_settings')
    .upsert({
      user_id: userId,
      medication_slots_expanded: expanded,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' })

  if (error) throw error
}

export function readMedicationNameEnglishFirstPreference(): boolean {
  try {
    return globalThis.localStorage.getItem(NAME_ENGLISH_FIRST_STORAGE_KEY) !== 'false'
  } catch {
    // 無痕模式若封鎖儲存，仍維持英文優先的預設，跟登入帳號初次使用時的行為一致。
    return DEFAULT_MEDICATION_NAME_ENGLISH_FIRST
  }
}

export function saveMedicationNameEnglishFirstPreference(englishFirst: boolean) {
  try {
    globalThis.localStorage.setItem(NAME_ENGLISH_FIRST_STORAGE_KEY, String(englishFirst))
  } catch {
    // 只影響下次開啟時的名稱排序；儲存失敗不能中斷當下的服藥流程。
  }
}

export async function readMedicationNameEnglishFirstPreferenceForUser(userId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('user_settings')
    .select('medication_name_english_first')
    .eq('user_id', userId)
    .maybeSingle()

  if (error) throw error
  return data?.medication_name_english_first ?? DEFAULT_MEDICATION_NAME_ENGLISH_FIRST
}

export async function saveMedicationNameEnglishFirstPreferenceForUser(userId: string, englishFirst: boolean): Promise<void> {
  const { error } = await supabase
    .from('user_settings')
    .upsert({
      user_id: userId,
      medication_name_english_first: englishFirst,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' })

  if (error) throw error
}
