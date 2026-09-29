/*
檔案用途：把官方劑型原文（official_dosage_form_text）與收斂後的四值劑型（dosage_form）轉成
三語「服用方式」提示，回答「這顆藥到底能不能整顆吞」。
所在層：src/lib；純前端靜態對照表與轉換函式，不連線 Supabase，結構比照 medicationAtcCategories.ts。
主要關聯：official_dosage_form_text／official_score_text 由 supabase/migrations 的
refresh_official_medication_dosage_details() 從 TFDA 公開資料回填；本檔只負責轉成顯示文字，
真正呈現在畫面上的是 src/features/medication/components/MedicationIntakeGuidance.tsx。
*/
import type { LocalizedText } from '../i18n'

// 紅線（見 issue #622／#624）：官方劑型能證明的是「不可以」（腸溶／緩釋／舌下／嚼錠），
// 證明不了「可以」。這張對照表因此永遠不會輸出「可以磨粉」或「可以剝半」的語意；
// 沒命中任何關鍵字一律回 unknown，把不確定明白講出來，不預設安全。
// 沒有 scored 等級：official_score_text（刻痕）只是外觀上的一條壓痕，不保證剝半後藥效不變，
// 膜衣緩釋錠一樣可能有刻痕，因此完全不參與這張對照表的判斷（呼叫端也不會傳進來）。
export type SwallowGuidanceLevel =
  | 'sublingual'
  | 'chewable'
  | 'dissolve_in_water'
  | 'dissolve_in_mouth'
  | 'swallow_whole'
  | 'not_a_pill'
  | 'unknown'

export type SwallowGuidanceSeverity = 'caution' | 'neutral' | 'unknown'

export interface SwallowGuidance {
  level: SwallowGuidanceLevel
  severity: SwallowGuidanceSeverity
  text: LocalizedText
}

interface SwallowGuidanceInput {
  officialDosageFormText: string | null | undefined
  // 收斂後的四值劑型（medications.dosage_form），只用來判斷 not_a_pill；不是官方原文。
  dosageForm: string | null | undefined
}

// 關鍵字表依「越具體越前面」排序，find() 取第一個命中，跟 medicationAtcCategories.ts 同一個手法。
// 「泡水溶解」（dissolve_in_water）與「在口中化開」（dissolve_in_mouth）刻意分成兩個等級：
// 發泡錠是丟進水裡溶解後喝，口溶／口崩錠是直接放舌頭上化開，給藥途徑完全不同，合併會對其中
// 一種給出錯誤指示（叫照護者把發泡錠含在嘴裡，或把口崩錠拿去泡水）。
const DOSAGE_FORM_KEYWORD_LEVELS: Array<{ level: SwallowGuidanceLevel; keywords: string[] }> = [
  { level: 'sublingual', keywords: ['舌下'] },
  { level: 'chewable', keywords: ['咀嚼', '嚼錠'] },
  { level: 'dissolve_in_water', keywords: ['發泡', '分散'] },
  { level: 'dissolve_in_mouth', keywords: ['口溶', '口崩'] },
  { level: 'swallow_whole', keywords: ['腸溶', '腸衣', '持續性藥效', '緩釋', '長效', '控釋'] },
]

const SWALLOW_GUIDANCE_TEXT: Record<SwallowGuidanceLevel, { severity: SwallowGuidanceSeverity; text: LocalizedText }> = {
  sublingual: {
    severity: 'caution',
    text: { id: 'Ditaruh di bawah lidah, jangan ditelan', zh: '含在舌下，不可吞下', en: 'Place under the tongue, do not swallow' },
  },
  chewable: {
    severity: 'caution',
    text: { id: 'Harus dikunyah sampai halus baru ditelan, jangan ditelan utuh', zh: '要嚼碎後吞，不可整顆吞', en: 'Chew thoroughly before swallowing, do not swallow whole' },
  },
  dissolve_in_water: {
    severity: 'caution',
    text: { id: 'Larutkan dalam air dulu baru diminum, jangan ditelan langsung', zh: '先泡在水裡溶解後喝，不可直接吞', en: 'Dissolve in water first, then drink; do not swallow directly' },
  },
  dissolve_in_mouth: {
    severity: 'neutral',
    text: { id: 'Taruh di atas lidah dan biarkan larut sendiri, tidak perlu air', zh: '放在舌頭上讓它自己化開，不必配水吞', en: 'Place on the tongue and let it dissolve on its own, no water needed' },
  },
  swallow_whole: {
    severity: 'caution',
    text: { id: 'Telan utuh, jangan digerus atau dibelah; jika sulit ditelan tanyakan apoteker untuk ganti bentuk obat', zh: '整顆吞下，不可磨粉或剝半；吞不下請問藥師換劑型', en: 'Swallow whole; do not crush or split. If it cannot be swallowed, ask the pharmacist about a different form' },
  },
  not_a_pill: {
    severity: 'neutral',
    text: { id: 'Obat cair/serbuk, memang tidak perlu ditelan sebagai tablet', zh: '液劑／粉包，本來就不必吞錠', en: 'Liquid or powder medication; there is no tablet to swallow' },
  },
  unknown: {
    severity: 'unknown',
    text: { id: 'Data resmi tidak menjelaskan boleh tidaknya digerus atau dibelah, tanyakan apoteker dulu', zh: '官方資料沒有說明可否磨粉或剝半，請先問藥師', en: 'Official data does not confirm that crushing or splitting is safe; ask the pharmacist first' },
  },
}

function resolveSwallowGuidanceLevel({ officialDosageFormText, dosageForm }: SwallowGuidanceInput): SwallowGuidanceLevel {
  // 必須先判斷是否根本不是錠劑，再做關鍵字比對：「長效」「緩釋」「控釋」這類關鍵字同時會出現在
  // 針劑／液劑的官方劑型原文裡（例如「長效注射液」），如果先比對關鍵字會誤判成 swallow_whole，
  // 叫照護者把一瓶針劑「整顆吞下」。dosageForm 是 parseDosageFormFromText() 判斷出的四值劑型，
  // 對「是否為液劑／粉包」是比關鍵字更直接的訊號，所以優先信任它。
  if (dosageForm === 'liquid' || dosageForm === 'powder') return 'not_a_pill'

  const dosageFormText = officialDosageFormText?.trim()
  if (dosageFormText) {
    const match = DOSAGE_FORM_KEYWORD_LEVELS.find(entry => entry.keywords.some(keyword => dosageFormText.includes(keyword)))
    if (match) return match.level
  }
  return 'unknown'
}

export function resolveSwallowGuidance(input: SwallowGuidanceInput): SwallowGuidance {
  const level = resolveSwallowGuidanceLevel(input)
  const { severity, text } = SWALLOW_GUIDANCE_TEXT[level]
  return { level, severity, text }
}
