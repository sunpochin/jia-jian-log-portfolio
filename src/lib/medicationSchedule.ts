/*
檔案用途：解析與計算藥品服用時段、頻率與通知提醒時間。
所在層：src/lib；為用藥時程邏輯層。
主要關聯：由 MedicationPage 與用藥檢視卡片載入。
*/
import type { LocalizedText } from './i18n'
import { dosageFormUnitLabel, formatDoseAmountLocalized } from './medications'

const medicationSlotTexts = {
  anytime: { id: 'Kapan saja', zh: '不限時間', en: 'Any time' },
  before_breakfast: { id: 'Sebelum sarapan', zh: '早餐前', en: 'Before breakfast' },
  after_breakfast: { id: 'Setelah sarapan', zh: '早餐後', en: 'After breakfast' },
  before_lunch: { id: 'Sebelum makan siang', zh: '午餐前', en: 'Before lunch' },
  after_lunch: { id: 'Setelah makan siang', zh: '午餐後', en: 'After lunch' },
  before_dinner: { id: 'Sebelum makan malam', zh: '晚餐前', en: 'Before dinner' },
  after_dinner: { id: 'Setelah makan malam', zh: '晚餐後', en: 'After dinner' },
  before_bed: { id: 'Sebelum tidur', zh: '睡前', en: 'Before bedtime' },
  morning: { id: 'Pagi', zh: '早上', en: 'Morning' },
  after_meal: { id: 'Setelah makan', zh: '飯後', en: 'After meal' },
  after_bed: { id: 'Setelah tidur', zh: '睡後', en: 'After bedtime' },
} as const satisfies Record<string, LocalizedText>

const currentSlots = ['before_breakfast', 'after_breakfast', 'before_lunch', 'after_lunch', 'before_dinner', 'after_dinner', 'before_bed'] as const

export const MEDICATION_SLOTS = currentSlots.map(slot => [slot, medicationSlotTexts[slot]] as const)

export const medicationSlotText = (slot: string): LocalizedText =>
  medicationSlotTexts[slot as keyof typeof medicationSlotTexts] ?? { id: slot, zh: slot, en: slot }

export const medicationSlotCompletionText = (slot: string) => {
  const slotText = medicationSlotText(slot)
  const idSlotText = slotText.id.toLocaleLowerCase('id-ID')
  const enSlotText = slotText.en.toLocaleLowerCase('en-US')
  // App 只知道照護者已留下服藥紀錄，不能假裝親眼確認病人實際吞服；完成文案集中在時段字典旁才不會各頁說法不同。
  return {
    title: { id: `Obat ${idSlotText} sudah lengkap`, zh: `${slotText.zh}用藥已完成`, en: `Medication for ${enSlotText} is complete` },
    description: { id: `Semua obat ${idSlotText} sudah tercatat diminum.`, zh: `${slotText.zh}的所有藥物都已記錄為服用。`, en: `All ${enSlotText} medications have been recorded as taken.` },
  }
}

const medicationSlotOrder = [
  'anytime', 'before_breakfast', 'morning', 'after_breakfast',
  'before_lunch', 'after_lunch', 'before_dinner', 'after_dinner',
  'after_meal', 'before_bed', 'after_bed',
]
const slotOrder = new Map<string, number>(medicationSlotOrder.map((slot, index) => [slot, index]))

export const compareMedicationSlots = (left: string, right: string) => {
  // 「睡後」只能是歷史資料，固定排在最後，避免讓已廢止時段混入目前可執行的藥單順序。
  // 不猜測未知舊醫囑要改成哪一餐；只有已知的舊代碼才依原規則排序。
  return (slotOrder.get(left) ?? Number.MAX_SAFE_INTEGER) - (slotOrder.get(right) ?? Number.MAX_SAFE_INTEGER)
}

export function getMedicationSlotCollapseDefaults(slots: readonly string[], slotsExpandedByDefault: boolean): Set<string> {
  // 設定值代表「初始畫面」；只有精簡模式才收起後續時段，否則全開設定會被頁面初始化覆寫。
  return new Set(slotsExpandedByDefault ? [] : slots.slice(1))
}

// 劑型的「一份」不能直接加總：藥錠／膠囊論顆，粉劑論包，液劑論份，同一時段常見同時有藥錠與粉包
// （例如鈣加 D 是沖泡粉包），混算成同一個數字會讓照護者核對藥盒時對不上實際包裝數量。
// 這兩個排序／分組小工具讓「顆數摘要」與「服藥打卡顆數進度」共用同一套「按劑型分組」邏輯。
const dosageFormOrder = ['tablet', 'capsule', 'powder', 'liquid']
function sortDosageForms(forms: readonly string[]): string[] {
  return [...forms].sort((left, right) => {
    const leftIndex = dosageFormOrder.indexOf(left)
    const rightIndex = dosageFormOrder.indexOf(right)
    const diff = (leftIndex === -1 ? dosageFormOrder.length : leftIndex) - (rightIndex === -1 ? dosageFormOrder.length : rightIndex)
    return diff !== 0 ? diff : left.localeCompare(right)
  })
}

interface MedicationQuantity {
  dose_amount: number
  dose_count: number
  dosage_form: string
}

// 同一種藥可能拆成多次核對（dose_count）、每次不只一顆（dose_amount），例如鉀離子藥物常見「單次 2 顆、算一次」；
// 兩者相乘才是這個時段實際要吞的份量，讓每週藥單／排藥畫面能一眼看出總量，不必逐項心算。
// 按劑型分組加總後才各自套用正確單位；多種劑型時用「＋」接起來，不會把粉包／液劑誤標成「顆」。
export function medicationSlotQuantityText(plans: readonly MedicationQuantity[]): LocalizedText {
  const totalsByForm = new Map<string, number>()
  plans.forEach(plan => {
    const form = plan.dosage_form || 'tablet'
    totalsByForm.set(form, (totalsByForm.get(form) ?? 0) + plan.dose_amount * plan.dose_count)
  })
  const forms = sortDosageForms([...totalsByForm.keys()])
  return {
    id: forms.map(form => formatDoseAmountLocalized(totalsByForm.get(form) ?? 0, form, 'id')).join(' + '),
    zh: forms.map(form => formatDoseAmountLocalized(totalsByForm.get(form) ?? 0, form, 'zh')).join('＋'), en: forms.map(form => formatDoseAmountLocalized(totalsByForm.get(form) ?? 0, form, 'id')).join(' + '),
  }
}

interface MedicationDoseQuantity {
  dose_amount: number
  dosage_form: string
}

const formatDoseCount = (amount: number) => amount === 0.5 ? '½' : String(amount)

// 服藥打卡需要「已服用／應服用」的分數而非單一總數，一樣先按劑型分組再各自算分數與單位，
// 例如同一時段有藥錠與粉包時顯示「1/2 錠＋1/1 包」，不會把兩種劑型併成一個誤導的分母。
export function medicationSlotQuantityProgressText(takenDoses: readonly MedicationDoseQuantity[], allDoses: readonly MedicationDoseQuantity[]): LocalizedText {
  const totalByForm = new Map<string, number>()
  allDoses.forEach(dose => {
    const form = dose.dosage_form || 'tablet'
    totalByForm.set(form, (totalByForm.get(form) ?? 0) + dose.dose_amount)
  })
  const takenByForm = new Map<string, number>()
  takenDoses.forEach(dose => {
    const form = dose.dosage_form || 'tablet'
    takenByForm.set(form, (takenByForm.get(form) ?? 0) + dose.dose_amount)
  })
  const forms = sortDosageForms([...totalByForm.keys()])
  const format = (locale: 'id' | 'zh', joiner: string) => forms.map(form =>
    `${formatDoseCount(takenByForm.get(form) ?? 0)}/${formatDoseCount(totalByForm.get(form) ?? 0)} ${dosageFormUnitLabel(form, locale)}`,
  ).join(joiner)
  return { id: format('id', ' + '), zh: format('zh', '＋') ,en: format('id', ' + ') }
}
