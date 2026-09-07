/*
檔案用途：定義首次使用引導精靈（照顧誰／誰記錄／要記什麼）的選項、依回答換算每日照護模組開關的規則，
         以及「是否已完成過精靈」的本機記錄。
所在層：src/lib 共用規則層；不直接操作畫面，只提供 OnboardingWizard 元件與 App.tsx 共用的純函式。
主要關聯：dailyCareModules（模組定義與物種篩選）、dailyCarePreferences（實際寫入 Supabase／Demo 的儲存邏輯）、
         components/onboarding/OnboardingWizard 與 App.tsx。
*/
import { DAILY_CARE_MODULES, DEFAULT_DAILY_CARE_VISIBILITY, isModuleApplicableToSpecies, type DailyCareModuleId, type DailyCareVisibilityPreference } from './dailyCareModules'
import type { LocalizedText } from './i18n'

const COMPLETED_STORAGE_KEY = 'jiajianlog.onboarding-wizard-completed'

export type OnboardingCareTarget = 'human' | 'dog' | 'cat' | 'bird' | 'rabbit' | 'other'
export type OnboardingRecorder = 'self' | 'delegatedCaregiver'

export const ONBOARDING_CARE_TARGET_OPTIONS: { value: OnboardingCareTarget; label: LocalizedText }[] = [
  { value: 'human', label: { id: 'Keluarga / lansia', zh: '家人／長輩' ,en: "Family / elderly" } },
  { value: 'dog', label: { id: 'Anjing', zh: '狗' ,en: "Dog" } },
  { value: 'cat', label: { id: 'Kucing', zh: '貓' ,en: "Cat" } },
  { value: 'bird', label: { id: 'Burung', zh: '鳥' ,en: "Bird" } },
  { value: 'rabbit', label: { id: 'Kelinci', zh: '兔子' ,en: "Rabbit" } },
  { value: 'other', label: { id: 'Hewan peliharaan lain', zh: '其他寵物' ,en: "Other pet" } },
]

export const ONBOARDING_RECORDER_OPTIONS: { value: OnboardingRecorder; label: LocalizedText; description: LocalizedText }[] = [
  { value: 'self', label: { id: 'Keluarga mencatat sendiri', zh: '家屬自己記錄' ,en: "Family records it themselves" }, description: { id: 'Cocok jika Anda ingin mencatat semua detail perawatan.', zh: '適合想記錄完整照護細節的家屬。' ,en: "Suitable if you want to record every care detail." } },
  { value: 'delegatedCaregiver', label: { id: 'Dipercayakan kepada pengasuh', zh: '委託看護記錄' ,en: "Entrusted to caregiver" }, description: { id: 'Awali dengan item paling penting agar pengasuh mudah mengikuti.', zh: '先從最重要的項目開始，讓看護容易上手。' ,en: "Start with the most important items so the caregiver can follow along easily." } },
]

// 委託看護時，先只開最基本、跨物種都看得懂的項目，避免一次给看護太多欄位；
// 家屬自記錄則傾向想要完整細節，因此以「這個物種能用的全部項目」為起點。
const DELEGATED_CAREGIVER_ESSENTIAL_MODULE_IDS: DailyCareModuleId[] = ['bloodPressure', 'medication', 'weight', 'nutrition']

// 精靈第三題預設勾選哪些項目：先依物種篩掉不適用的模組，委託看護再進一步縮到基本款。
// 刻意排除 DEFAULT_DAILY_CARE_VISIBILITY 裡預設關閉的模組（目前是 dementiaCare 與 fluidBalance）：那些模組的規則是
// 「照護者確認病人真的有這個照護需求才手動開啟」（issue #421；術後體液平衡同理），精靈不能代替照護者做這個判斷、
// 幫每個長輩都預先勾好失智照護或術後體液平衡。它們仍然會列在第三題裡，只是預設不打勾。
export function recommendedOnboardingModuleIds(careTarget: OnboardingCareTarget, recorder: OnboardingRecorder): DailyCareModuleId[] {
  const applicable = DAILY_CARE_MODULES
    .filter(module => isModuleApplicableToSpecies(module, careTarget) && DEFAULT_DAILY_CARE_VISIBILITY[module.id])
    .map(module => module.id)
  if (recorder === 'self') return applicable
  const essential = applicable.filter(id => DELEGATED_CAREGIVER_ESSENTIAL_MODULE_IDS.includes(id))
  // 委託看護但這個物種完全沒有基本款項目時（理論上不會發生），仍退回完整清單，避免精靈算出空清單。
  return essential.length > 0 ? essential : applicable
}

// 依精靈第三題最終勾選結果算出要寫入的開關：只調整「這個物種顯示得到」的項目，
// 其餘模組（例如人類不會看到的貓砂盆項目）維持原值，避免精靈意外覆蓋使用者看不到、也沒機會確認的設定。
export function buildOnboardingDailyCarePreference(current: DailyCareVisibilityPreference, careTarget: OnboardingCareTarget, selectedModuleIds: readonly DailyCareModuleId[]): DailyCareVisibilityPreference {
  const selected = new Set(selectedModuleIds)
  const next = { ...current }
  for (const module of DAILY_CARE_MODULES) {
    if (!isModuleApplicableToSpecies(module, careTarget)) continue
    next[module.id] = selected.has(module.id)
  }
  return next
}

function readCompletedPatientIds(): string[] {
  try {
    const raw = globalThis.localStorage.getItem(COMPLETED_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : []
  } catch {
    return []
  }
}

export function hasCompletedOnboardingWizard(patientId: string): boolean {
  return readCompletedPatientIds().includes(patientId)
}

export function markOnboardingWizardCompleted(patientId: string): void {
  try {
    const completed = readCompletedPatientIds()
    if (completed.includes(patientId)) return
    globalThis.localStorage.setItem(COMPLETED_STORAGE_KEY, JSON.stringify([...completed, patientId]))
  } catch {
    // 精靈完成記錄只是避免重複打擾；localStorage 被封鎖時最多是精靈再跳一次，不影響設定頁手動調整。
  }
}
