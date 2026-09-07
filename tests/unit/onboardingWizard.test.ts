/*
檔案用途：驗證首次使用引導精靈的推薦模組計算、開關換算與完成記錄邏輯。
所在層：tests/unit；保護 App.tsx 觸發精靈與 OnboardingWizard 呈現共用的規則來源。
主要關聯：src/lib/onboardingWizard.ts。
*/
import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { DEFAULT_DAILY_CARE_VISIBILITY, isModuleApplicableToSpecies, DAILY_CARE_MODULES } from '../../src/lib/dailyCareModules'
// DEFAULT_DAILY_CARE_VISIBILITY 同時被拿來當「哪些模組預設開啟」的來源，見 recommendedOnboardingModuleIds。
import { buildOnboardingDailyCarePreference, hasCompletedOnboardingWizard, markOnboardingWizardCompleted, recommendedOnboardingModuleIds } from '../../src/lib/onboardingWizard'

const originalLocalStorage = globalThis.localStorage
const values = new Map<string, string>()

beforeEach(() => {
  values.clear()
  ;(globalThis as typeof globalThis & { localStorage: Storage }).localStorage = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value) },
  } as Storage
})

afterEach(() => {
  ;(globalThis as typeof globalThis & { localStorage: Storage }).localStorage = originalLocalStorage
})

describe('onboarding wizard recommendations', () => {
  test('recommends every species-applicable module that is on by default when the family records itself', () => {
    const recommended = recommendedOnboardingModuleIds('cat', 'self')
    const applicable = DAILY_CARE_MODULES
      .filter(module => isModuleApplicableToSpecies(module, 'cat') && DEFAULT_DAILY_CARE_VISIBILITY[module.id])
      .map(m => m.id)
    expect(recommended.sort()).toEqual(applicable.sort())
  })

  test('never pre-checks an opt-in module even for the species it applies to', () => {
    // dementiaCare 對人類適用但 DEFAULT_DAILY_CARE_VISIBILITY 預設關閉（issue #421 的 opt-in 規則）：
    // 精靈不能代替照護者判斷長輩有沒有失智照護需求，因此兩種記錄者身分都不該預先勾選。
    expect(recommendedOnboardingModuleIds('human', 'self')).not.toContain('dementiaCare')
    expect(recommendedOnboardingModuleIds('human', 'delegatedCaregiver')).not.toContain('dementiaCare')
  })

  test('narrows to essential items when care is delegated to a hired caregiver', () => {
    const recommended = recommendedOnboardingModuleIds('human', 'delegatedCaregiver')
    expect(recommended.sort()).toEqual(['bloodPressure', 'medication', 'nutrition', 'weight'].sort())
    // dementiaCare 對人類適用，但不是委託看護的基本款，精靈不應該預設幫忙勾選。
    expect(recommended).not.toContain('dementiaCare')
  })

  test('never recommends a module the chosen species cannot even see', () => {
    const recommended = recommendedOnboardingModuleIds('bird', 'self')
    expect(recommended).not.toContain('dementiaCare')
    expect(recommended).not.toContain('petFluidTherapy')
  })
})

describe('buildOnboardingDailyCarePreference', () => {
  test('turns on only the selected species-applicable modules and leaves the rest untouched', () => {
    const next = buildOnboardingDailyCarePreference(DEFAULT_DAILY_CARE_VISIBILITY, 'human', ['bloodPressure', 'medication'])
    expect(next.bloodPressure).toBe(true)
    expect(next.medication).toBe(true)
    expect(next.temperature).toBe(false)
    // dementiaCare 對人類適用，屬於這次精靈可調整的範圍，沒被選就要關閉。
    expect(next.dementiaCare).toBe(false)
  })

  test('does not touch modules the chosen species cannot use', () => {
    // petFluidTherapy 不適用 dog；即使目前是 true，精靈選人類物種時也不該把它動到 false。
    const current = { ...DEFAULT_DAILY_CARE_VISIBILITY, petFluidTherapy: true }
    const next = buildOnboardingDailyCarePreference(current, 'human', ['bloodPressure'])
    expect(next.petFluidTherapy).toBe(true)
  })
})

describe('onboarding wizard completion flag', () => {
  test('is false until marked complete, then true for that patient only', () => {
    expect(hasCompletedOnboardingWizard('patient-a')).toBe(false)
    markOnboardingWizardCompleted('patient-a')
    expect(hasCompletedOnboardingWizard('patient-a')).toBe(true)
    expect(hasCompletedOnboardingWizard('patient-b')).toBe(false)
  })
})
