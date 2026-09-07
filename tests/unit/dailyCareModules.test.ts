/*
檔案用途：驗證每日照護 registry 的預設、最後一項保護與能力過濾規則。
所在層：tests/unit；保護 DailyCarePage 與設定卡共用的單一規則來源。
主要關聯：src/lib/dailyCareModules.ts。
*/
import { describe, expect, test } from 'bun:test'
import { DAILY_CARE_MODULES, DEFAULT_DAILY_CARE_VISIBILITY, isModuleApplicableToSpecies, normalizeDailyCareVisibility, updateDailyCareVisibility, visibleDailyCareModules } from '../../src/lib/dailyCareModules'

describe('daily care modules', () => {
  test('keeps every module visible by default except dementia care and fluid balance, and repairs an all-off legacy value', () => {
    // dementiaCare 與 fluidBalance 刻意排除在外：跟其他模組不同，它們不是「符合物種就自動出現」，
    // 而是照護者確認病人真的有相關照護需求後才手動開啟（issue #421；術後體液平衡同理）。
    const { dementiaCare, fluidBalance, ...defaultOnModules } = DEFAULT_DAILY_CARE_VISIBILITY
    expect(dementiaCare).toBe(false)
    expect(fluidBalance).toBe(false)
    expect(defaultOnModules.careReminders).toBe(true)
    expect(Object.values(defaultOnModules).every(Boolean)).toBe(true)
    expect(normalizeDailyCareVisibility({ bloodPressure: false, temperature: false, medication: false, nutrition: false, weight: false, petLiquidIntake: false, petDigestion: false, petAppetite: false, petFluidTherapy: false, petEndocrine: false, dementiaCare: false, fluidBalance: false, careReminders: false }).bloodPressure).toBe(true)
  })

  test('provides compact bilingual labels for the narrow-screen tab row', () => {
    // 體重與服藥現在也對寵物開放，所以「人類看得到的模組」不能再用「沒有 applicableToSpecies」判斷，
    // 要改成「沒有限制物種，或限制清單裡包含 human」。
    // 液體管理、消化健康、食慾與內分泌監測（胰島素／血糖）同樣是長者照護常見指標，不是寵物專屬，因此人類也看得到。
    const humanLabels = DAILY_CARE_MODULES.filter(m => !m.applicableToSpecies || m.applicableToSpecies.includes('human')).map(module => module.compactLabel)
    expect(humanLabels).toEqual([
      { id: 'Tensi', zh: '血壓' ,en: "BP" },
      { id: 'Suhu', zh: '體溫' ,en: "Temp." },
      { id: 'Obat', zh: '服藥' ,en: "Medication" },
      { id: 'Nutrisi', zh: '飲食' ,en: "Nutrition" },
      { id: 'Berat', zh: '體重' ,en: "Weight" },
      { id: 'Cairan', zh: '液體' ,en: "Fluid" },
      { id: 'Pencernaan', zh: '消化' ,en: "Digestion" },
      { id: 'Nafsu', zh: '食慾' ,en: "Appetite" },
      { id: 'Endokrin', zh: '內分泌' ,en: "Endocrine" },
      { id: 'Demensia', zh: '失智照護' ,en: "Dementia" },
      { id: 'Cairan I/O', zh: '進出量' ,en: "Fluid I/O" },
      { id: 'Pengingat', zh: '提醒', en: 'Reminders' },
    ])
  })

  test('dementia care only applies to human patients and stays off unless explicitly enabled', () => {
    const dementiaModule = DAILY_CARE_MODULES.find(module => module.id === 'dementiaCare')!
    expect(isModuleApplicableToSpecies(dementiaModule, 'human')).toBe(true)
    expect(isModuleApplicableToSpecies(dementiaModule, 'dog')).toBe(false)

    const humanModules = visibleDailyCareModules(DEFAULT_DAILY_CARE_VISIBILITY, { canUseMedication: true, careRecipientType: 'human' }).map(module => module.id)
    expect(humanModules).not.toContain('dementiaCare')

    const enabledModules = visibleDailyCareModules({ ...DEFAULT_DAILY_CARE_VISIBILITY, dementiaCare: true }, { canUseMedication: true, careRecipientType: 'human' }).map(module => module.id)
    expect(enabledModules).toContain('dementiaCare')
  })

  test('does not allow the last visible module to be disabled', () => {
    const preference = { ...DEFAULT_DAILY_CARE_VISIBILITY, temperature: false, medication: false, nutrition: false, weight: false, petLiquidIntake: false, petDigestion: false, petAppetite: false, petFluidTherapy: false, petEndocrine: false, careReminders: false }
    expect(updateDailyCareVisibility(preference, 'bloodPressure', false)).toEqual({ preference, rejected: true })
  })

  test('allows disabling a module while another stays visible', () => {
    const preference = { ...DEFAULT_DAILY_CARE_VISIBILITY }
    const result = updateDailyCareVisibility(preference, 'nutrition', false)
    expect(result).toEqual({ preference: { ...preference, nutrition: false }, rejected: false })
  })

  test('always allows turning a module back on', () => {
    const preference = { ...DEFAULT_DAILY_CARE_VISIBILITY, temperature: false, medication: false, nutrition: false, weight: false }
    expect(updateDailyCareVisibility(preference, 'temperature', true)).toEqual({ preference: { ...preference, temperature: true }, rejected: false })
  })

  test('filters unavailable medication', () => {
    const preference = { ...DEFAULT_DAILY_CARE_VISIBILITY, bloodPressure: false, temperature: true, medication: true, nutrition: false, weight: false, petLiquidIntake: false, petDigestion: false, petAppetite: false, petFluidTherapy: false, petEndocrine: false, careReminders: false }
    expect(visibleDailyCareModules(preference, { canUseMedication: false, careRecipientType: 'human' }).map(module => module.id)).toEqual(['temperature'])
  })

  test('falls back to blood pressure when a malformed preference hides every module and species is unknown', () => {
    const preference = { bloodPressure: false, temperature: false, medication: false, nutrition: false, weight: false }
    expect(visibleDailyCareModules(preference, { canUseMedication: true }).map(module => module.id)).toEqual(['bloodPressure'])
  })

  test('falls back to a species-applicable module, not blood pressure, when only a human-only module was picked and custom mode turns off', () => {
    // 重現情境：貓在自訂範本下只勾了「血壓」，關掉自訂範本回到依物種篩選——物種篩選會把血壓濾掉，
    // 保底邏輯若無條件回血壓，畫面就會出現貓咪看得到、但實際上物種篩選明明還在生效的血壓分頁。
    const preference = { ...DEFAULT_DAILY_CARE_VISIBILITY, bloodPressure: true, temperature: false, medication: false, nutrition: false, weight: false, petLiquidIntake: false, petDigestion: false, petAppetite: false, petFluidTherapy: false, petEndocrine: false, careReminders: false }
    // canUseMedication:false 讓保底邏輯跳過服藥，落到體重——證明它真的會挑「這隻貓能用」的項目，不是隨便挑清單第一個。
    const modules = visibleDailyCareModules(preference, { canUseMedication: false, careRecipientType: 'cat', useCustomTemplate: false }).map(module => module.id)
    expect(modules).not.toContain('bloodPressure')
    expect(modules).toEqual(['weight'])
  })

  test('shows weight and medication for pets, not just blood pressure/temperature/nutrition', () => {
    // household-and-patients.md 明確把體重、服藥、事件列為寵物優先項目；慢性病寵物（如糖尿病貓）
    // 需要體重佐證胰島素劑量，這裡鎖住行為避免日後又漏掉 applicableToSpecies 而讓寵物看不到體重。
    const modules = visibleDailyCareModules(DEFAULT_DAILY_CARE_VISIBILITY, { canUseMedication: true, careRecipientType: 'cat' }).map(module => module.id)
    expect(modules).toContain('weight')
    expect(modules).toContain('medication')
    expect(modules).not.toContain('bloodPressure')
    expect(modules).not.toContain('temperature')
    expect(modules).not.toContain('nutrition')
  })

  test('scopes pet chronic-care modules to their applicable species', () => {
    const dogModules = visibleDailyCareModules(DEFAULT_DAILY_CARE_VISIBILITY, { canUseMedication: true, careRecipientType: 'dog' }).map(module => module.id)
    expect(dogModules).toContain('petEndocrine')
    expect(dogModules).not.toContain('petFluidTherapy')

    const rabbitModules = visibleDailyCareModules(DEFAULT_DAILY_CARE_VISIBILITY, { canUseMedication: true, careRecipientType: 'rabbit' }).map(module => module.id)
    expect(rabbitModules).toContain('petFluidTherapy')
    expect(rabbitModules).not.toContain('petEndocrine')

    const birdModules = visibleDailyCareModules(DEFAULT_DAILY_CARE_VISIBILITY, { canUseMedication: true, careRecipientType: 'bird' }).map(module => module.id)
    expect(birdModules).not.toContain('petLiquidIntake')
    expect(birdModules).toContain('petDigestion')
    expect(birdModules).toContain('petAppetite')
    expect(birdModules).not.toContain('petFluidTherapy')
    expect(birdModules).not.toContain('petEndocrine')
  })

  test('custom template ignores the species filter entirely', () => {
    // 自訂範本讓貓也能記錄血壓（例如高血壓貓）、狗也能用只給貓兔設計的皮下點滴模組。
    // dementiaCare 與 fluidBalance 預設關閉（見上方測試），這裡明確開啟才能驗證「自訂範本會忽略物種篩選」，而不是被預設關閉的偏好擋掉。
    const preference = { ...DEFAULT_DAILY_CARE_VISIBILITY, dementiaCare: true, fluidBalance: true }
    const modules = visibleDailyCareModules(preference, { canUseMedication: true, careRecipientType: 'cat', useCustomTemplate: true }).map(module => module.id)
    expect(modules).toContain('bloodPressure')
    expect(modules).toContain('temperature')
    expect(modules).toContain('nutrition')
    expect(modules).toEqual(DAILY_CARE_MODULES.map(module => module.id))
  })

  test('custom template still respects the preference toggle and medication capability', () => {
    const preference = { ...DEFAULT_DAILY_CARE_VISIBILITY, bloodPressure: false, medication: true }
    const modules = visibleDailyCareModules(preference, { canUseMedication: false, careRecipientType: 'cat', useCustomTemplate: true }).map(module => module.id)
    expect(modules).not.toContain('bloodPressure')
    expect(modules).not.toContain('medication')
  })

  test('isModuleApplicableToSpecies matches the species list used by visibleDailyCareModules', () => {
    const bloodPressureModule = DAILY_CARE_MODULES.find(module => module.id === 'bloodPressure')!
    expect(isModuleApplicableToSpecies(bloodPressureModule, 'human')).toBe(true)
    expect(isModuleApplicableToSpecies(bloodPressureModule, 'cat')).toBe(false)
    expect(isModuleApplicableToSpecies(bloodPressureModule, undefined)).toBe(true)

    const petEndocrineModule = DAILY_CARE_MODULES.find(module => module.id === 'petEndocrine')!
    expect(isModuleApplicableToSpecies(petEndocrineModule, 'dog')).toBe(true)
    expect(isModuleApplicableToSpecies(petEndocrineModule, 'rabbit')).toBe(false)
  })
})
