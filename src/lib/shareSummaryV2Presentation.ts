/*
檔案用途：v2 分享摘要「純呈現」的查表與分組純函式——把伺服器給的 level／ruleKeys／pulseWarning 換成視覺階與三語標籤、
  把 standardsUsed 換成 R5 判讀依據文字、把藥單依時段分組、把日期換成台北時間字串。不含任何判讀。
所在層：src/lib 展示規則層；不 import React、不碰 Supabase。
主要關聯：src/lib/shareSummaryV2Dto.ts（輸入形狀）、src/lib/alertPresentation.ts 與 src/config/bp-levels.json（同源詞彙與配色）、
  src/lib/recordReport.ts describeBpStandard（R5 文案與列印報告逐字相同）、src/lib/medication/medicationSchedule.ts、
  src/features/care-family/components/shareSummaryV2/*、tests/unit/shareSummaryV2Presentation.test.ts。
為什麼這裡絕對不能出現 evaluateReading／evaluateBp：接收頁沒有 patient 情境，自己判讀只會拿到一般成人標準，
  術後嚴格控制期間的讀數會被漆綠；等級由伺服器依「量測當時」的標準算好，這裡只查表（ADR-009 不變量 2）。
  tests/unit/shareSummaryPageBoundary.test.ts 以靜態掃描鎖住這條線。
*/
import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import timezone from 'dayjs/plugin/timezone'
import { BP_LEVELS, alertLevelSeverity, resolveBpStandard, type AlertLevel } from '../types/database'
import { alertTone, type AlertTone } from './alertPresentation'
import { describeBpStandard } from './recordReport'
import { compareMedicationSlots } from './medication/medicationSchedule'
import { TZ } from './timezone'
import type { LocalizedText } from './i18n'
import type { ShareSummaryV2Medication, ShareSummaryV2Reading, ShareSummaryV2StandardUsed } from './shareSummaryV2Dto'

dayjs.extend(utc)
dayjs.extend(timezone)

// 詞彙表沒有的 key（例如未來新增的規則先上了伺服器）不猜、不漆成正常：顯示 key 本身並沿用伺服器等級的顏色。
const UNKNOWN_RULE_LABEL = (key: string): LocalizedText => ({ zh: key, id: key, en: key })

/** 每一條命中的規則都要有自己的標籤；呼叫端逐條顯示，不得只取第一條。 */
export function readingRuleLabels(ruleKeys: string[]): LocalizedText[] {
  return ruleKeys.map(key => BP_LEVELS[key]?.labels ?? UNKNOWN_RULE_LABEL(key))
}

export const PULSE_WARNING_LABEL: LocalizedText = { zh: '⚠️ 心跳 >120', id: '⚠️ Denyut jantung >120', en: '⚠️ Heartbeat > 120' }

/**
 * 視覺階：把伺服器的 level 與 ruleKeys 餵給全 app 唯一一份的 alertTone()。
 * 主導規則取 ruleKeys 裡 webAlertLevel 最嚴重的那條（與伺服器 composeEvaluation 相同的取法），
 * 讓 critical（danger_high）與 on-target 這兩個只有 key 才分得出的階仍然成立。
 */
export function readingTone(reading: Pick<ShareSummaryV2Reading, 'level' | 'ruleKeys' | 'pulseWarning'>): AlertTone {
  let dominant: string | null = null
  for (const key of reading.ruleKeys) {
    if (BP_LEVELS[key] === undefined) continue
    // 嚴格大於：同分時保留先出現的那條（收縮壓在前），與伺服器 composeEvaluation 的 reduce 相同。
    if (dominant === null || alertLevelSeverity(BP_LEVELS[key].webAlertLevel) > alertLevelSeverity(BP_LEVELS[dominant].webAlertLevel)) dominant = key
  }
  const bpRule = dominant
    ? { key: dominant, webAlertLevel: BP_LEVELS[dominant].webAlertLevel }
    // 沒有任何認得的 key：用伺服器等級本身當 webAlertLevel，顏色至少不會比伺服器說的輕。
    : { key: 'unknown', webAlertLevel: reading.level }
  return alertTone({ level: reading.level, bpRule, pulseWarning: reading.pulseWarning })
}

/**
 * R5：判讀依據那一行。與列印報告的 describeBpStandard 共用同一段文字（名稱＋目標帶／「當時未設定個別標準」），
 * 兩處不會漂移；生效日由呼叫端另外加在後面（設計 §6 C）。
 */
export function describeStandardUsed(standard: ShareSummaryV2StandardUsed): LocalizedText {
  return describeBpStandard({
    standard: resolveBpStandard(standard.templateKey, standard.customBounds ?? undefined),
    templateKey: standard.templateKey,
    prescribedNote: null,
    configured: standard.configured,
    unavailable: false,
  })
}

export type ReadingsByCareDay = Array<{ careDay: string; readings: ShareSummaryV2Reading[] }>

/** 依台北照護日（04:00 切分）分組，新的一天在前；同一天內依量測時間由早到晚。 */
export function groupReadingsByCareDay(readings: ShareSummaryV2Reading[]): ReadingsByCareDay {
  const groups = new Map<string, ShareSummaryV2Reading[]>()
  for (const reading of [...readings].sort((a, b) => Date.parse(a.measuredAt) - Date.parse(b.measuredAt))) {
    const careDay = dayjs(reading.measuredAt).tz(TZ).subtract(4, 'hour').format('YYYY-MM-DD')
    groups.set(careDay, [...(groups.get(careDay) ?? []), reading])
  }
  return [...groups.entries()].sort(([a], [b]) => (a < b ? 1 : a > b ? -1 : 0)).map(([careDay, items]) => ({ careDay, readings: items }))
}

export type MedicationSlotGroup = { slot: string; items: ShareSummaryV2Medication[] }

/** 比照 RecordReport：依時段分組（既有時段順序），需要時服用另列。 */
export function groupMedicationsBySlot(items: ShareSummaryV2Medication[]): { scheduled: MedicationSlotGroup[]; asNeeded: ShareSummaryV2Medication[] } {
  const scheduled = new Map<string, ShareSummaryV2Medication[]>()
  const asNeeded: ShareSummaryV2Medication[] = []
  for (const item of items) {
    if (item.asNeeded) { asNeeded.push(item); continue }
    scheduled.set(item.scheduleSlot, [...(scheduled.get(item.scheduleSlot) ?? []), item])
  }
  return {
    scheduled: [...scheduled.entries()].sort(([a], [b]) => compareMedicationSlots(a, b)).map(([slot, group]) => ({ slot, items: group })),
    asNeeded,
  }
}

export function formatTaipeiDateTime(iso: string): string {
  return dayjs(iso).tz(TZ).format('YYYY-MM-DD HH:mm')
}

export function formatTaipeiDate(iso: string): string {
  return dayjs(iso).tz(TZ).format('YYYY-MM-DD')
}

/**
 * 視窗結束是「最後一個照護日之後那個 04:00」的排他邊界；直接印它會多出一天（PR #941 Codex P2）。
 * 退 1 毫秒再取照護日，就是實際涵蓋到的最後一天。
 */
export function lastIncludedCareDay(exclusiveEndIso: string): string {
  return dayjs(Date.parse(exclusiveEndIso) - 1).tz(TZ).subtract(4, 'hour').format('YYYY-MM-DD')
}

/** 視窗起點已是某個 04:00 邊界，直接取照護日。 */
export function firstIncludedCareDay(startIso: string): string {
  return dayjs(startIso).tz(TZ).subtract(4, 'hour').format('YYYY-MM-DD')
}

export function formatTaipeiTime(iso: string): string {
  return dayjs(iso).tz(TZ).format('HH:mm')
}

/** 醫師核藥袋要看「哪顆、幾顆」：品名（依語系）＋劑量標示＋顆數。 */
export function medicationPrimaryName(item: ShareSummaryV2Medication, locale: 'zh' | 'id' | 'en'): string {
  if (locale === 'id') return item.displayName.brandId || item.displayName.brand
  if (locale === 'zh') return item.displayName.brandZh || item.displayName.brand
  return item.displayName.brand
}

export const VERIFICATION_STATUS_LABELS: Record<ShareSummaryV2Medication['verificationStatus'], LocalizedText> = {
  official: { id: 'Data resmi izin edar', zh: '官方藥證資料', en: 'Official licence data' },
  manually_verified: { id: 'Diverifikasi manual', zh: '人工核對', en: 'Manually verified' },
  unverified: { id: 'Belum diverifikasi (dicatat sendiri oleh keluarga)', zh: '未驗證（家屬自行登錄）', en: 'Unverified (entered by the family)' },
}

export const MEDICATION_CHANGE_ACTION_LABELS: Record<'upsert' | 'deactivate', LocalizedText> = {
  upsert: { id: 'Ditambah / diubah', zh: '新增／調整', en: 'Added / adjusted' },
  deactivate: { id: 'Dihentikan', zh: '停用', en: 'Stopped' },
}

export function levelCountLabel(level: AlertLevel): LocalizedText {
  // 統計卡用等級層級的簡短字眼（與 dashboardStats ALERT_LABELS 同義），不重複 bp-levels 的長句。
  const labels: Record<AlertLevel, LocalizedText> = {
    normal: { id: 'Normal', zh: '正常', en: 'Normal' },
    warning: { id: 'Agak tinggi', zh: '略高', en: 'Somewhat higher' },
    danger: { id: 'Terlalu tinggi', zh: '偏高', en: 'Somewhat high' },
    'warning-low': { id: 'Agak rendah', zh: '偏低注意', en: 'Low attention' },
    'danger-low': { id: 'Terlalu rendah', zh: '過低', en: 'Very low' },
    'off-target': { id: 'Di atas target', zh: '超出目標', en: 'Above target' },
    'below-target': { id: 'Di bawah target', zh: '低於目標', en: 'Below target' },
  }
  return labels[level]
}
