/*
檔案用途：集中保存體溫輸入的數值邊界、測量部位、情境與提醒規則。
所在層：src/lib；供體溫輸入頁、紀錄清單與趨勢圖共用。
主要關聯：TemperaturePage、useTemperatureRecords、demoStorage 與溫度單元測試。
*/
import { localized, type Locale, type LocalizedText } from './i18n'
import { describeSaveError, isConnectionError, isPermissionError, matchesConstraint } from './dataErrors'

export const TEMPERATURE_DAILY_LIMIT = 24

// 剩幾筆才開始提醒額度。24 筆是防爆上限，一般照護一天量兩三次永遠碰不到，
// 常駐顯示只會讓照護者每天注意一件不需要在意的事；留 3 筆緩衝足以在真的要滿之前示警。
export const TEMPERATURE_QUOTA_WARNING_MARGIN = 3
export const TEMPERATURE_RETENTION_DAYS = 24

export const TEMPERATURE_LIMITS = {
  min: 30,
  max: 45,
} as const

export function isTemperatureInputFormat(value: string) {
  // 先在輸入層擋掉第二位小數，讓照護者立即知道限制，而不是等到按鈕被停用才猜原因。
  return /^\d*(?:\.\d{0,1})?$/.test(value)
}

export const TEMPERATURE_SITES = ['ear', 'forehead', 'oral', 'axillary'] as const
export type TemperatureSite = typeof TEMPERATURE_SITES[number]

export const TEMPERATURE_CONTEXTS = ['symptoms', 'after_medication', 'routine'] as const
export type TemperatureContext = typeof TEMPERATURE_CONTEXTS[number]

export type TemperatureStatus = 'low' | 'normal' | 'elevated' | 'fever' | 'high-fever'

export const TEMPERATURE_SITE_LABELS: Record<TemperatureSite, LocalizedText> = {
  ear: { id: 'Telinga', zh: '耳溫', en: 'Ear' },
  forehead: { id: 'Dahi', zh: '額溫', en: 'Forehead' },
  oral: { id: 'Mulut', zh: '口溫', en: 'Oral temperature' },
  axillary: { id: 'Ketiak', zh: '腋溫', en: 'Armpit' },
}

export const TEMPERATURE_CONTEXT_LABELS: Record<TemperatureContext, LocalizedText> = {
  symptoms: { id: 'Saat tidak enak badan', zh: '感覺不舒服', en: 'Feeling uncomfortable' },
  after_medication: { id: 'Setelah obat penurun demam', zh: '退燒藥後', en: 'After fever medication' },
  routine: { id: 'Pemeriksaan rutin', zh: '例行量測', en: 'Routine measurements' },
}

export function isValidTemperatureInput(value: unknown): value is number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return false
  // 只接受一位小數，避免 38.25 這類看似精準、但一般家用體溫計無法可靠提供的數值。
  const hasOneDecimal = Math.abs(Math.round(value * 10) - value * 10) < Number.EPSILON
  return hasOneDecimal && value >= TEMPERATURE_LIMITS.min && value <= TEMPERATURE_LIMITS.max
}

export function getTemperatureStatus(value: number): TemperatureStatus {
  if (value < 35) return 'low'
  if (value >= 39) return 'high-fever'
  if (value >= 38) return 'fever'
  if (value >= 37.5) return 'elevated'
  return 'normal'
}

export function temperatureStatusLabel(status: TemperatureStatus): LocalizedText {
  switch (status) {
    case 'low': return { id: 'Suhu rendah', zh: '體溫偏低', en: 'Low temperature' }
    case 'elevated': return { id: 'Sedikit tinggi', zh: '體溫略高', en: 'Sedikit tinggi' }
    case 'fever': return { id: 'Demam', zh: '發燒範圍', en: 'Fever range' }
    case 'high-fever': return { id: 'Demam tinggi', zh: '高燒範圍', en: 'High fever' }
    default: return { id: 'Normal', zh: '正常', en: 'Normal' }
  }
}

export function temperatureStatusTone(status: TemperatureStatus) {
  if (status === 'low' || status === 'high-fever') return 'danger'
  if (status === 'elevated' || status === 'fever') return 'warning'
  return 'normal'
}

const TEMPERATURE_SAVE_ERROR_TEXT = {
  id: 'Gagal menyimpan suhu. Periksa koneksi lalu coba lagi.',
  zh: '體溫儲存失敗，請確認網路後再試', en: 'Failed to save temperature. Check your connection and try again.',
} as const

/**
 * 繁體中文註解：權限與連線的判斷共用 lib/dataErrors，這裡只保留體溫專屬的每日配額訊息。
 * 之前這個函式與血壓的 saveErrorMessage 各自複製一份 unknown 錯誤解析，
 * 導致體溫少了「連線／設定有問題」這個分支；收斂到同一份實作後兩邊行為自動一致。
 */
export function temperatureErrorMessage(error: unknown, locale: Locale): string {
  if (matchesConstraint(error, 'daily_temperature_limit') && !isPermissionError(error) && !isConnectionError(error)) {
    return localized({
      id: `Hari ini sudah mencapai batas ${TEMPERATURE_DAILY_LIMIT} catatan suhu per orang. Hapus catatan yang salah lalu coba lagi.`,
      zh: `今天已達到每人 ${TEMPERATURE_DAILY_LIMIT} 筆體溫紀錄上限；可刪除錯誤紀錄後再試。`, en: `Today has reached the limit of ${TEMPERATURE_DAILY_LIMIT} temperature records per person. Delete an incorrect record and try again.`,
    }, locale)
  }
  return localized(describeSaveError(error, TEMPERATURE_SAVE_ERROR_TEXT), locale)
}
