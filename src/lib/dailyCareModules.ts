/*
檔案用途：集中定義每日照護可顯示的功能項目、雙語名稱與能力過濾規則。
所在層：src/lib 共用規則層；由每日照護頁與設定卡共同使用。
主要關聯：DailyCarePage、DailyCareDisplaySettings、dailyCarePreferences 與 App shell。
*/
import type { LocalizedText } from './i18n'

// 每日照護頁的「自訂顯示」捷徑用這個錨點把使用者帶到設定頁的顯示設定卡並捲動就位；
// 放在這個純資料層而非元件檔，App.tsx 才能引用它而不必連帶把 DailyCareDisplaySettings 拉進主 bundle。
export const DAILY_CARE_DISPLAY_SETTINGS_ANCHOR = 'daily-care-display-settings'

export type DailyCareModuleId = 'bloodPressure' | 'temperature' | 'medication' | 'nutrition' | 'weight' | 'petLiquidIntake' | 'petDigestion' | 'petAppetite' | 'petFluidTherapy' | 'petEndocrine' | 'dementiaCare' | 'fluidBalance' | 'careReminders'

export type DailyCareModule = {
  id: DailyCareModuleId
  label: LocalizedText
  compactLabel: LocalizedText
  applicableToSpecies?: ('human' | 'dog' | 'cat' | 'bird' | 'rabbit' | 'other')[]
}

// 頁籤與設定共用這份順序，避免使用者在兩個畫面看到不同的功能排列。
export const DAILY_CARE_MODULES: readonly DailyCareModule[] = [
  { id: 'bloodPressure', label: { id: 'Tekanan darah', zh: '血壓' ,en: 'Blood pressure' }, compactLabel: { id: 'Tensi', zh: '血壓' ,en: 'BP' } },
  { id: 'temperature', label: { id: 'Suhu tubuh', zh: '體溫' ,en: 'Body temperature' }, compactLabel: { id: 'Suhu', zh: '體溫' ,en: 'Temp.' } },
  // 服藥與體重刻意列出全部物種：household-and-patients.md 明確把體重、服藥、事件列為寵物 Dashboard 優先項目，
  // 慢性病寵物（如糖尿病貓）更需要體重佐證胰島素劑量是否合適；沒有這個清單就會落入預設「沒有 applicableToSpecies 只給人類看」而整組消失。
  { id: 'medication', label: { id: 'Obat', zh: '服藥' ,en: 'Medication' }, compactLabel: { id: 'Obat', zh: '服藥' ,en: 'Medication' }, applicableToSpecies: ['human', 'dog', 'cat', 'bird', 'rabbit', 'other'] },
  { id: 'nutrition', label: { id: 'Nutrisi', zh: '飲食' ,en: 'Nutrition' }, compactLabel: { id: 'Nutrisi', zh: '飲食' ,en: 'Nutrition' } },
  // bird 跟其他寵物一樣需要體重、服藥與日常觀察；較專門的點滴／內分泌模組仍不擅自套用。
  { id: 'weight', label: { id: 'Berat badan', zh: '體重' ,en: 'Weight' }, compactLabel: { id: 'Berat', zh: '體重' ,en: 'Weight' }, applicableToSpecies: ['human', 'dog', 'cat', 'bird', 'rabbit', 'other'] },
  // 鳥類不套用這個頁面：目前表單與趨勢含排尿／貓砂盆尿塊欄位，硬套用會讓自動範本出現不適用的健康指標。
  // 飲水量與排尿次數也是長者脫水／泌尿問題的常見觀察指標，因此人類同樣適用；貓砂盆欄位保持「可不填」即可。
  { id: 'petLiquidIntake', label: { id: 'Asupan cairan', zh: '液體管理' ,en: 'Fluid intake' }, compactLabel: { id: 'Cairan', zh: '液體' ,en: 'Fluid' }, applicableToSpecies: ['human', 'dog', 'cat', 'rabbit', 'other'] },
  // 嘔吐、排便與糞便型態同樣是長者腸胃狀況的常見照護觀察，不是寵物專屬指標，因此人類也適用。
  { id: 'petDigestion', label: { id: 'Kesehatan pencernaan', zh: '消化健康' ,en: 'Digestive health' }, compactLabel: { id: 'Pencernaan', zh: '消化' ,en: 'Digestion' }, applicableToSpecies: ['human', 'dog', 'cat', 'bird', 'rabbit', 'other'] },
  { id: 'petAppetite', label: { id: 'Nafsu makan', zh: '食慾' ,en: 'Appetite' }, compactLabel: { id: 'Nafsu', zh: '食慾' ,en: 'Appetite' }, applicableToSpecies: ['human', 'dog', 'cat', 'bird', 'rabbit', 'other'] },
  { id: 'petFluidTherapy', label: { id: 'Terapi cairan subkutan', zh: '皮下液體療法' ,en: 'Subcutaneous fluid therapy' }, compactLabel: { id: 'Cairan S.C.', zh: '點滴' ,en: 'Fluids' }, applicableToSpecies: ['cat', 'rabbit', 'other'] },
  // 胰島素單位與血糖值是人類糖尿病照護最核心的每日紀錄，跟寵物慢性病共用同一組欄位定義，因此人類也適用。
  { id: 'petEndocrine', label: { id: 'Kesehatan endokrin', zh: '內分泌監測' ,en: 'Endocrine health' }, compactLabel: { id: 'Endokrin', zh: '內分泌' ,en: 'Endocrine' }, applicableToSpecies: ['human', 'cat', 'dog'] },
  // 失智照護是人類專屬觀察項目，不套用物種清單以外的病人。且此模組刻意不放進「每人預設開啟」，
  // 見 DEFAULT_DAILY_CARE_VISIBILITY：只有照護者在設定頁主動開啟過的病人才會看到，避免沒有失智症狀的長者
  // 也被迫看到這三個分頁（issue #421 驗收條件：只在啟用此模組的病人身上出現）。
  { id: 'dementiaCare', label: { id: 'Perawatan demensia', zh: '失智照護' ,en: 'Dementia care' }, compactLabel: { id: 'Demensia', zh: '失智照護' ,en: 'Dementia' }, applicableToSpecies: ['human'] },
  // 術後體液平衡是特定照護需求（例如腦動脈瘤術後血鉀過低，護理師要求量化記錄），不是每位人類病人都需要，
  // 因此跟失智照護一樣預設關閉，只在照護者主動開啟後才出現；目前只服務人類病人。
  { id: 'fluidBalance', label: { id: 'Asupan & keluaran cairan', zh: '體液平衡記錄' ,en: 'Fluid balance' }, compactLabel: { id: 'Cairan I/O', zh: '進出量' ,en: 'Fluid I/O' }, applicableToSpecies: ['human'] },
  // 到期提醒同時服務人與寵物；表單再依物種限制回診、疫苗與驅蟲類型，避免把提醒入口拆成兩套來源。
  { id: 'careReminders', label: { id: 'Pengingat jatuh tempo', zh: '到期提醒', en: 'Due reminders' }, compactLabel: { id: 'Pengingat', zh: '提醒', en: 'Reminders' }, applicableToSpecies: ['human', 'dog', 'cat', 'bird', 'rabbit', 'other'] },
] as const

export type DailyCareVisibilityPreference = Record<DailyCareModuleId, boolean>

export const DEFAULT_DAILY_CARE_VISIBILITY: DailyCareVisibilityPreference = {
  bloodPressure: true,
  temperature: true,
  medication: true,
  nutrition: true,
  weight: true,
  petLiquidIntake: true,
  petDigestion: true,
  petAppetite: true,
  petFluidTherapy: true,
  petEndocrine: true,
  // 預設關閉：跟其他模組不同，失智照護不是「符合物種就自動出現」，而是照護者確認病人有相關照護需求後才手動開啟。
  dementiaCare: false,
  // 同樣預設關閉：術後體液平衡是特定照護需求，不是每位病人都要記錄。
  fluidBalance: false,
  // 新功能預設開啟，讓家屬不必先找到設定頁才能看到 issue #414 的入口；仍可依病人關閉。
  careReminders: true,
}

export function normalizeDailyCareVisibility(value: Partial<DailyCareVisibilityPreference> | null | undefined): DailyCareVisibilityPreference {
  const normalized: DailyCareVisibilityPreference = {
    ...DEFAULT_DAILY_CARE_VISIBILITY,
    ...value,
  }

  // 資料庫 CHECK 會阻擋全關，但 localStorage 舊資料或讀取異常仍要有可操作入口。
  if (!Object.values(normalized).some(Boolean)) normalized.bloodPressure = true
  return normalized
}

export function updateDailyCareVisibility(preference: DailyCareVisibilityPreference, moduleId: DailyCareModuleId, enabled: boolean): { preference: DailyCareVisibilityPreference; rejected: boolean } {
  if (!enabled && preference[moduleId] && Object.values(preference).filter(Boolean).length === 1) {
    // 至少保留一個照護入口，避免關閉最後一項後畫面只剩空白頁。
    return { preference, rejected: true }
  }
  return {
    preference: { ...preference, [moduleId]: enabled },
    rejected: false,
  }
}

// 「這個病人的物種能不能用這個模組」單獨拆出來，讓 visibleDailyCareModules 與設定頁的手動勾選
// 共用同一份判斷；兩處各自重寫過去曾經在寵物病人的設定頁看到勾了也沒用的血壓選項。
export function isModuleApplicableToSpecies(module: Pick<DailyCareModule, 'applicableToSpecies'>, careRecipientType: string | undefined): boolean {
  if (!careRecipientType) return true // 未指定物種時顯示所有，向後相容舊資料。
  if (module.applicableToSpecies) return module.applicableToSpecies.includes(careRecipientType as any)
  return careRecipientType === 'human'
}

export function visibleDailyCareModules(preference: DailyCareVisibilityPreference, capabilities: { canUseMedication: boolean; careRecipientType?: string; useCustomTemplate?: boolean }): DailyCareModule[] {
  const visible = DAILY_CARE_MODULES.filter(module => {
    if (!preference[module.id]) return false
    if (module.id === 'medication' && !capabilities.canUseMedication) return false
    // 自訂範本：照護者已經自己決定要追蹤哪些項目，不再由物種硬性擋掉（例如高血壓老犬仍要記血壓）。
    if (capabilities.useCustomTemplate) return true
    return isModuleApplicableToSpecies(module, capabilities.careRecipientType)
  })

  if (visible.length > 0) return visible

  // 權限或舊設定意外讓所有項目消失時的保底：不能無條件回血壓，否則貓狗會在關掉自訂範本、
  // 只剩人類專屬模組被勾選時看到血壓分頁——物種篩選明明還在生效，畫面卻出現不該出現的項目。
  // 已知物種時挑第一個牠適用、且不需要額外權限的模組；體重／服藥對所有物種開放，一定挑得到。
  if (capabilities.careRecipientType) {
    const speciesFallback = DAILY_CARE_MODULES.find(module =>
      isModuleApplicableToSpecies(module, capabilities.careRecipientType)
      && (module.id !== 'medication' || capabilities.canUseMedication))
    if (speciesFallback) return [speciesFallback]
  }
  return DAILY_CARE_MODULES.filter(module => module.id === 'bloodPressure')
}
