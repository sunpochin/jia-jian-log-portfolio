/*
檔案用途：讀寫「被照護者」共用的每日照護顯示偏好，以及是否採用自訂範本（跳過物種篩選）。
所在層：src/lib 資料轉接層；隔離 Supabase RLS 與 Demo localStorage 細節。
主要關聯：patient_daily_care_preferences、App.tsx、DailyCareDisplaySettings 與 dailyCareModules。
*/
import { supabase } from './supabase'
import { DEFAULT_DAILY_CARE_VISIBILITY, normalizeDailyCareVisibility, type DailyCareVisibilityPreference } from './dailyCareModules'

const STORAGE_KEY = 'jiajianlog.daily-care-visibility'

export interface DailyCareDisplayState {
  preference: DailyCareVisibilityPreference
  useCustomTemplate: boolean
}

export const DEFAULT_DAILY_CARE_DISPLAY_STATE: DailyCareDisplayState = {
  preference: DEFAULT_DAILY_CARE_VISIBILITY,
  useCustomTemplate: false,
}

interface StoredPreferenceEntry extends Partial<DailyCareVisibilityPreference> {
  useCustomTemplate?: boolean
}
type StoredPreferences = Record<string, StoredPreferenceEntry>

export function readDailyCarePreference(patientId: string): DailyCareDisplayState {
  try {
    const raw = globalThis.localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_DAILY_CARE_DISPLAY_STATE
    const stored = JSON.parse(raw) as StoredPreferences
    const entry = stored[patientId]
    const { useCustomTemplate, ...moduleFlags } = entry ?? {}
    return { preference: normalizeDailyCareVisibility(moduleFlags), useCustomTemplate: useCustomTemplate ?? false }
  } catch {
    // Demo 儲存失敗只影響下次顯示密度，仍保留完整照護入口讓流程可繼續。
    return DEFAULT_DAILY_CARE_DISPLAY_STATE
  }
}

export function saveDailyCarePreference(patientId: string, state: DailyCareDisplayState): void {
  try {
    const raw = globalThis.localStorage.getItem(STORAGE_KEY)
    const stored = raw ? JSON.parse(raw) as StoredPreferences : {}
    globalThis.localStorage.setItem(STORAGE_KEY, JSON.stringify({
      ...stored,
      [patientId]: { ...normalizeDailyCareVisibility(state.preference), useCustomTemplate: state.useCustomTemplate },
    }))
  } catch {
    // 本機展示設定不是健康資料；localStorage 被封鎖時不能阻斷每日照護輸入。
  }
}

// hasStoredPreference 用來區分「這位病人真的還沒設定過」與「設定過但剛好等於預設值」。
// 引導精靈只能靠這個旗標判斷是不是首次使用；localStorage 做不到——換手機或換照護者的裝置就會失憶，
// 精靈會對已經設定好的病人再跳一次，完成時把家屬原本開好的模組覆蓋掉。
export async function readDailyCarePreferenceForPatient(patientId: string): Promise<DailyCareDisplayState & { hasStoredPreference: boolean }> {
  const { data, error } = await supabase
    .from('patient_daily_care_preferences')
    .select('show_blood_pressure, show_temperature, show_medication, show_nutrition, show_weight, show_pet_liquid_intake, show_pet_digestion, show_pet_appetite, show_pet_fluid_therapy, show_pet_endocrine, show_dementia_care, show_fluid_balance, show_care_reminders, use_custom_template')
    .eq('patient_id', patientId)
    .maybeSingle()

  if (error) throw error
  return {
    preference: normalizeDailyCareVisibility(data ? {
      bloodPressure: data.show_blood_pressure,
      temperature: data.show_temperature,
      medication: data.show_medication,
      nutrition: data.show_nutrition,
      weight: data.show_weight,
      petLiquidIntake: data.show_pet_liquid_intake,
      petDigestion: data.show_pet_digestion,
      petAppetite: data.show_pet_appetite,
      petFluidTherapy: data.show_pet_fluid_therapy,
      petEndocrine: data.show_pet_endocrine,
      dementiaCare: data.show_dementia_care,
      fluidBalance: data.show_fluid_balance,
      careReminders: data.show_care_reminders,
    } : undefined),
    useCustomTemplate: data?.use_custom_template ?? false,
    hasStoredPreference: Boolean(data),
  }
}

export async function saveDailyCarePreferenceForPatient(patientId: string, state: DailyCareDisplayState): Promise<void> {
  const normalized = normalizeDailyCareVisibility(state.preference)
  const { error } = await supabase
    .from('patient_daily_care_preferences')
    .upsert({
      patient_id: patientId,
      show_blood_pressure: normalized.bloodPressure,
      show_temperature: normalized.temperature,
      show_medication: normalized.medication,
      show_nutrition: normalized.nutrition,
      show_weight: normalized.weight,
      show_pet_liquid_intake: normalized.petLiquidIntake,
      show_pet_digestion: normalized.petDigestion,
      show_pet_appetite: normalized.petAppetite,
      show_pet_fluid_therapy: normalized.petFluidTherapy,
      show_pet_endocrine: normalized.petEndocrine,
      show_dementia_care: normalized.dementiaCare,
      show_fluid_balance: normalized.fluidBalance,
      show_care_reminders: normalized.careReminders,
      use_custom_template: state.useCustomTemplate,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'patient_id' })

  if (error) throw error
}
