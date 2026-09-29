// 檔案用途：定義台灣醫療處方與健保藥袋常見的服藥頻率預設組合（TID、QID、BID、QD 等），
//           並提供根據 AI 辨識結果（一天次數與服藥時機）智慧比對最相近時段組合的演算法。
// 所在層：src/lib；純邏輯與資料層，無副作用，不依賴外部狀態。
// 主要關聯：供 MedicationAdminFormFields（表單選單與複選時段）、useMedicationAdminForm（套用草稿時預選）、
//           MedicationAiDraftSection（草稿卡片顯示建議時段）共同使用。

import type { LocalizedText } from '../i18n'

export interface MedicationFrequencyPreset {
  id: string
  label: LocalizedText
  timesPerDay: number
  slots: readonly string[]
  description?: LocalizedText
}

// 台灣處方箋與健保藥袋最常見的頻率與服用時段組合：
// 1. 一天三次（TID）：餐後最普遍，亦有餐前（ac）或餐前餐後皆可（如胃藥或不傷胃藥品）
// 2. 一天四次（QID）：最典型為三餐後加睡前（pc & hs），抗生素或症狀緩解藥常見
// 3. 一天兩次（BID）：早晚飯後最常見
// 4. 一天一次（QD）：早晨飯後或睡前（降血壓、降血脂、抗組織胺等）
export const TAIWAN_MEDICATION_FREQUENCY_PRESETS: readonly MedicationFrequencyPreset[] = [
  // ── 一天三次 (TID) ──────────────────────────────────────────────
  {
    id: 'tid_pc',
    label: {
      zh: '一天三次，餐後',
      id: '3 kali sehari, setelah makan',
      en: '3 times a day, after meals',
    },
    timesPerDay: 3,
    slots: ['after_breakfast', 'after_lunch', 'after_dinner'],
    description: {
      zh: '早餐後、午餐後、晚餐後（台灣最常見處方）',
      id: 'Setelah sarapan, makan siang, dan makan malam',
      en: 'After breakfast, lunch, and dinner',
    },
  },
  {
    id: 'tid_any',
    label: {
      zh: '一天三次，餐前餐後都可以',
      id: '3 kali sehari, bebas sebelum/setelah makan',
      en: '3 times a day, before or after meals',
    },
    timesPerDay: 3,
    slots: ['after_breakfast', 'after_lunch', 'after_dinner'],
    description: {
      zh: '早中晚服用，不拘用餐時間（排於三餐時段）',
      id: 'Pagi, siang, dan malam (jadwal teratur)',
      en: 'Morning, afternoon, and evening',
    },
  },
  {
    id: 'tid_ac',
    label: {
      zh: '一天三次，餐前',
      id: '3 kali sehari, sebelum makan',
      en: '3 times a day, before meals',
    },
    timesPerDay: 3,
    slots: ['before_breakfast', 'before_lunch', 'before_dinner'],
    description: {
      zh: '早餐前、午餐前、晚餐前（如腸胃蠕動促進劑或特定降血糖藥）',
      id: 'Sebelum sarapan, makan siang, dan makan malam',
      en: 'Before breakfast, lunch, and dinner',
    },
  },

  // ── 一天四次 (QID) ──────────────────────────────────────────────
  {
    id: 'qid_pc_hs',
    label: {
      zh: '一天四次，三餐後及睡前',
      id: '4 kali sehari, setelah makan dan sebelum tidur',
      en: '4 times a day, after meals and bedtime',
    },
    timesPerDay: 4,
    slots: ['after_breakfast', 'after_lunch', 'after_dinner', 'before_bed'],
    description: {
      zh: '早餐後、午餐後、晚餐後、睡前（常見於感冒藥水、抗生素）',
      id: 'Setelah sarapan, makan siang, makan malam, dan sebelum tidur',
      en: 'After breakfast, lunch, dinner, and before bedtime',
    },
  },
  {
    id: 'qid_ac_hs',
    label: {
      zh: '一天四次，三餐前及睡前',
      id: '4 kali sehari, sebelum makan dan sebelum tidur',
      en: '4 times a day, before meals and bedtime',
    },
    timesPerDay: 4,
    slots: ['before_breakfast', 'before_lunch', 'before_dinner', 'before_bed'],
    description: {
      zh: '早餐前、午餐前、晚餐前、睡前',
      id: 'Sebelum sarapan, makan siang, makan malam, dan sebelum tidur',
      en: 'Before breakfast, lunch, dinner, and before bedtime',
    },
  },

  // ── 一天二次 (BID) ──────────────────────────────────────────────
  {
    id: 'bid_pc',
    label: {
      zh: '一天二次，早晚飯後',
      id: '2 kali sehari, setelah sarapan dan makan malam',
      en: '2 times a day, after breakfast and dinner',
    },
    timesPerDay: 2,
    slots: ['after_breakfast', 'after_dinner'],
    description: {
      zh: '早餐後與晚餐後',
      id: 'Setelah sarapan dan makan malam',
      en: 'After breakfast and dinner',
    },
  },
  {
    id: 'bid_ac',
    label: {
      zh: '一天二次，早晚飯前',
      id: '2 kali sehari, sebelum sarapan dan makan malam',
      en: '2 times a day, before breakfast and dinner',
    },
    timesPerDay: 2,
    slots: ['before_breakfast', 'before_dinner'],
    description: {
      zh: '早餐前與晚餐前',
      id: 'Sebelum sarapan dan makan malam',
      en: 'Before breakfast and dinner',
    },
  },

  // ── 一天一次 (QD / QHS) ─────────────────────────────────────────
  {
    id: 'qd_morning_pc',
    label: {
      zh: '一天一次，早餐後',
      id: '1 kali sehari, setelah sarapan',
      en: 'Once a day, after breakfast',
    },
    timesPerDay: 1,
    slots: ['after_breakfast'],
    description: {
      zh: '早晨飯後（如多數降血壓藥、維他命）',
      id: 'Setelah sarapan pagi',
      en: 'In the morning after breakfast',
    },
  },
  {
    id: 'qd_morning_ac',
    label: {
      zh: '一天一次，早餐前',
      id: '1 kali sehari, sebelum sarapan',
      en: 'Once a day, before breakfast',
    },
    timesPerDay: 1,
    slots: ['before_breakfast'],
    description: {
      zh: '早晨空腹（如甲狀腺素、特定胃藥 PPI）',
      id: 'Sebelum sarapan pagi',
      en: 'In the morning before breakfast',
    },
  },
  {
    id: 'qd_hs',
    label: {
      zh: '一天一次，睡前',
      id: '1 kali sehari, sebelum tidur',
      en: 'Once a day, before bedtime',
    },
    timesPerDay: 1,
    slots: ['before_bed'],
    description: {
      zh: '睡前（如安眠藥、特定降血脂藥、長效抗組織胺）',
      id: 'Sebelum tidur malam',
      en: 'Before bedtime',
    },
  },
] as const

// 為什麼要將比對函式單獨抽出：
// 藥袋 OCR 與 AI 辨識傳回的 timesPerDay (數字) 與 timingHint (字串) 可能包含中英文縮寫（TID/AC/PC/飯後/空腹），
// 比對函式專責從雜亂字串中抓取核心時機，回傳最相近的預設組合，避免前端各處重寫重複的 regex。
export function matchFrequencyPreset(
  timesPerDay: number | null,
  timingHint: string | null,
): MedicationFrequencyPreset | null {
  const normalizedHint = (timingHint ?? '').trim().toLowerCase()

  // 1. 推斷一天次數（若 timesPerDay 未提供，嘗試從 timingHint 辨識）
  let inferredTimes = timesPerDay
  if (inferredTimes === null || !Number.isFinite(inferredTimes)) {
    if (/四次|4次|\bqid\b/i.test(normalizedHint)) inferredTimes = 4
    else if (/三次|3次|\btid\b/i.test(normalizedHint)) inferredTimes = 3
    else if (/兩次|二次|2次|\bbid\b/i.test(normalizedHint)) inferredTimes = 2
    else if (/一次|1次|\bqd\b|\bhs\b/i.test(normalizedHint)) inferredTimes = 1
  }

  if (!inferredTimes || inferredTimes < 1) {
    // 若無法推斷次數，但有明確包含「睡前」，可對應至 qd_hs
    if (/睡前|\bhs\b/i.test(normalizedHint)) {
      return TAIWAN_MEDICATION_FREQUENCY_PRESETS.find(p => p.id === 'qd_hs') ?? null
    }
    return null
  }

  // 2. 判斷餐前餐後皆可、餐前、餐後、睡前（支援中／英／印尼三語關鍵字與醫學縮寫）
  // 注意：若文字同時提到「餐前」與「餐後」（例如「餐前餐後都可以」、「before or after meals」），應判定為 isAny 而非 isAc。
  const isAny = /都可|均可|皆可|不拘|隨餐|with meals|before or after|sebelum atau sesudah/i.test(normalizedHint) ||
    (/(?:餐前|飯前|before meal|sebelum makan)/i.test(normalizedHint) && /(?:餐後|飯後|after meal|sesudah makan|setelah makan)/i.test(normalizedHint))
  const isAc = !isAny && /餐前|飯前|\bac\b|空腹|before meal|empty stomach|sebelum makan/i.test(normalizedHint)
  const isPc = /餐後|飯後|\bpc\b|after meal|sesudah makan|setelah makan/i.test(normalizedHint)
  const isHs = /睡前|\bhs\b|bedtime|before sleep|sebelum tidur/i.test(normalizedHint)

  // 依次數尋找最近似的台灣常見組合
  if (inferredTimes === 3) {
    if (isAny) return TAIWAN_MEDICATION_FREQUENCY_PRESETS.find(p => p.id === 'tid_any') ?? null
    if (isAc) return TAIWAN_MEDICATION_FREQUENCY_PRESETS.find(p => p.id === 'tid_ac') ?? null
    if (isPc || !normalizedHint) return TAIWAN_MEDICATION_FREQUENCY_PRESETS.find(p => p.id === 'tid_pc') ?? null
    // 若有非空的時機描述但既不是餐前、餐後也不是皆可，避免盲目落入相反的餐後，回傳 null 讓照護者自訂
    return null
  }

  if (inferredTimes === 4) {
    if (isAc) return TAIWAN_MEDICATION_FREQUENCY_PRESETS.find(p => p.id === 'qid_ac_hs') ?? null
    if (isPc || isHs || !normalizedHint) return TAIWAN_MEDICATION_FREQUENCY_PRESETS.find(p => p.id === 'qid_pc_hs') ?? null
    return null
  }

  if (inferredTimes === 2) {
    if (isAc) return TAIWAN_MEDICATION_FREQUENCY_PRESETS.find(p => p.id === 'bid_ac') ?? null
    if (isPc || !normalizedHint) return TAIWAN_MEDICATION_FREQUENCY_PRESETS.find(p => p.id === 'bid_pc') ?? null
    return null
  }

  if (inferredTimes === 1) {
    if (isHs) return TAIWAN_MEDICATION_FREQUENCY_PRESETS.find(p => p.id === 'qd_hs') ?? null
    if (isAc) return TAIWAN_MEDICATION_FREQUENCY_PRESETS.find(p => p.id === 'qd_morning_ac') ?? null
    return TAIWAN_MEDICATION_FREQUENCY_PRESETS.find(p => p.id === 'qd_morning_pc') ?? null
  }

  return null
}

// 根據目前已選取的 slots，判斷是否完全命中某個預設組合
export function findMatchingPresetBySlots(slots: readonly string[]): MedicationFrequencyPreset | null {
  if (slots.length === 0) return null
  const slotSet = new Set(slots)
  for (const preset of TAIWAN_MEDICATION_FREQUENCY_PRESETS) {
    if (preset.slots.length === slots.length && preset.slots.every(s => slotSet.has(s))) {
      return preset
    }
  }
  return null
}
