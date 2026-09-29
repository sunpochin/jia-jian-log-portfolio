/*
檔案用途：issue #415「主動異常示警」的純規則層——體重驟降、連續數日未回報服藥、血壓連續偏高／
        夜間低血壓次數上升——只讀既有的體重／服藥／血壓資料算出「要不要記一筆觀察」，不寫入
        任何資料、不推播、不判斷病因。
所在層：src/lib 純規則層；由 src/features/today/hooks/useCareAnomalySignals.ts 讀取原始紀錄後呼叫。
主要關聯：trendSeries.ts（dailyWeightAverages／dailyDoseCounts 已存在，這裡直接重用而非重算一次）、
        types/database.ts 的 evaluateReading（血壓九級判定，D1 凍結，這裡只消費結果、不得更動）、
        dashboardStats.ts 的 summarizeBpRecords（沿用既有的夜間低血壓計數邏輯）。

為什麼文案集中寫在這個檔案：驗收條件明訂「只能陳述觀察到的數據變化與建議與醫師討論，不得推論病因
或建議調藥」——這是醫療宣稱的紅線。把四種示警的中印英文案都放在同一個檔案、用同一組測試保護，
比分散在呼叫端各自拼字串更容易在 code review 時一次核對用詞邊界。

為什麼都不算「今天要做」：北極星設計鐵律第 3 條——只有需要「現在行動」的事才推播，觀察級只記錄。
這裡產生的都是觀察級信號，呼叫端（useCareAnomalySignals）一律不得標成 dueToday，也不得接上
LINE／Telegram 等主動推播管道（那條線只保留給 appscript 的血壓危險值警報鏈）。
*/
import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import timezone from 'dayjs/plugin/timezone'
import type { TrendPoint } from './trendSeries'
import type { BpRecord } from '../types/database'
import { evaluateReading, type AlertLevel } from '../types/database'
import type { BpStandardResolver } from './bpStandards'
import { summarizeBpRecords } from './dashboardStats'
import { CARE_DAY_TIMEZONE, careDateKey, careDayBounds } from './careDay'
import type { LocalizedText } from './i18n'

dayjs.extend(utc)
dayjs.extend(timezone)

export type AnomalySignalKind = 'weight_drop' | 'missed_medication' | 'bp_high_streak' | 'bp_night_low'

export interface WeightDropSignal {
  kind: 'weight_drop'
  windowDays: number
  baselineWeightKg: number
  latestWeightKg: number
  dropPercent: number
}

export interface MissedMedicationSignal {
  kind: 'missed_medication'
  consecutiveDays: number
}

export interface BpHighStreakSignal {
  kind: 'bp_high_streak'
  consecutiveDays: number
}

export interface BpNightLowSignal {
  kind: 'bp_night_low'
  windowDays: number
  count: number
}

export type AnomalySignal = WeightDropSignal | MissedMedicationSignal | BpHighStreakSignal | BpNightLowSignal

/**
 * 體重：拿窗口內最早與最新「有值的那一天平均」比較，不是拿窗口第一天（可能剛好沒量）硬比。
 * 只有兩者都有值、基準體重是正數，且下降幅度達門檻時才成立；體重持平或上升一律回傳 null。
 */
export function detectWeightDropSignal(
  points: TrendPoint[],
  windowDays: number,
  thresholdPercent: number,
): WeightDropSignal | null {
  const withValues = points.filter((point): point is { date: string; value: number } => point.value != null)
  if (withValues.length < 2) return null

  const baseline = withValues[0]
  const latest = withValues[withValues.length - 1]
  if (baseline.value <= 0) return null

  const dropPercent = ((baseline.value - latest.value) / baseline.value) * 100
  if (dropPercent < thresholdPercent) return null

  return {
    kind: 'weight_drop',
    windowDays,
    baselineWeightKg: baseline.value,
    latestWeightKg: latest.value,
    dropPercent: Number(dropPercent.toFixed(1)),
  }
}

/**
 * 服藥：從「昨天」往回數連續零劑次的天數，刻意排除「今天」——照護日還沒過完，今天是 0 劑
 * 常常只是「還沒到服藥時間」，不是漏服，用今天算連續天數會製造假警訊（Alarm fatigue 是頭號敵人）。
 * 沒有排藥中的病人（hasScheduledMedication=false）永遠回傳 null：沒有應服藥物，缺紀錄不代表漏服。
 * planEffectiveSinceCareDate（照護日字串）標出目前生效藥單最早的生效日：往回數時遇到比這個日期
 * 更早的桶就停止——藥單今天才剛建，不能把建立之前那幾天的空白也算成「漏服」（那幾天根本沒有藥要吃）。
 */
export function detectMissedMedicationSignal(
  doseCounts: TrendPoint[],
  thresholdDays: number,
  hasScheduledMedication: boolean,
  planEffectiveSinceCareDate: string | null = null,
): MissedMedicationSignal | null {
  if (!hasScheduledMedication) return null

  let streak = 0
  for (let index = doseCounts.length - 2; index >= 0; index -= 1) {
    if (planEffectiveSinceCareDate && doseCounts[index].date < planEffectiveSinceCareDate) break
    if ((doseCounts[index].value ?? 0) > 0) break
    streak += 1
  }
  if (streak < thresholdDays) return null

  return { kind: 'missed_medication', consecutiveDays: streak }
}

/**
 * 血壓連續偏高：以「照護日」為單位（不是量測次數），一天內只要有一筆落在 warning／danger
 * 就算那天偏高；同樣從昨天往回數，排除今天未過完的部分。門檻判定完全沿用 evaluateReading
 * （九級表 single source of truth），這裡只做「連續幾天」的彙整，不重新定義任何血壓等級。
 */
export function detectBpHighStreakSignal(
  records: BpRecord[],
  thresholdDays: number,
  // 必填：連續偏高的定義完全取決於用哪一份標準判讀。同一串 128/78 在一般成人標準下一天都不算偏高，
  // 在術後嚴格控制（目標 110–120）下每天都超出目標——這條規則因此不能自己挑一份標準（issue #898 §6.1）。
  resolver: BpStandardResolver,
  today: string = careDateKey(),
): BpHighStreakSignal | null {
  const highDays = new Set<string>()
  for (const record of records) {
    const level = evaluateReading(record.systolic, record.diastolic, record.pulse, resolver(record.measured_at).standard).bpRule.webAlertLevel as AlertLevel
    // 'off-target' 刻意**不**計入連續偏高：它是「帶去問醫師」而不是「連續數日的警訊」，
    // 把它算進來會讓術後嚴格控制的病人幾乎每天都觸發示警，正是北極星第 3 條要避免的警報疲乏。
    if (level === 'warning' || level === 'danger') {
      highDays.add(careDateKey(dayjs(record.measured_at)))
    }
  }

  let streak = 0
  let cursor = dayjs.tz(today, CARE_DAY_TIMEZONE).subtract(1, 'day')
  while (highDays.has(cursor.format('YYYY-MM-DD'))) {
    streak += 1
    cursor = cursor.subtract(1, 'day')
  }
  if (streak < thresholdDays) return null

  return { kind: 'bp_high_streak', consecutiveDays: streak }
}

/**
 * 夜間低血壓次數：直接重用 dashboardStats.summarizeBpRecords 既有的 nightLowCount 邏輯
 * （晚間時段＋warning-low／danger-low），避免同一個「什麼算夜間」的定義在兩個地方各自維護。
 * 自行依 windowDays 篩選日期範圍，而不是要求呼叫端先篩好——呼叫端（useCareAnomalySignals）
 * 為了少打一次血壓 API，會把血壓連續偏高與夜間低血壓兩個規則需要的天數合併成同一次查詢，
 * 這裡若直接吃合併後的完整 records，門檻會被更寬的那個窗口悄悄放大，必須自己收斂回 windowDays。
 * 窗口起點用 careDayBounds() 對齊照護日 04:00 分界，不是單純的日曆日 00:00——凌晨 00:00–03:59
 * 的量測（session.ts 的 malam3 桶涵蓋這段「跨夜零星量測」）實際屬於前一個照護日，若用日曆日 00:00
 * 當起點，會把窗口外前一晚最後 4 小時的讀數也算進來，把夜間低血壓次數多算一筆。
 */
export function detectBpNightLowSignal(
  records: BpRecord[],
  windowDays: number,
  thresholdCount: number,
  resolver: BpStandardResolver,
  today: string = careDateKey(),
): BpNightLowSignal | null {
  const earliestCareDate = dayjs.tz(today, CARE_DAY_TIMEZONE).subtract(windowDays - 1, 'day').format('YYYY-MM-DD')
  const cutoff = careDayBounds(earliestCareDate).start
  const windowedRecords = records.filter(record => !dayjs(record.measured_at).isBefore(cutoff))
  const { nightLowCount } = summarizeBpRecords(windowedRecords, resolver)
  if (nightLowCount < thresholdCount) return null

  return { kind: 'bp_night_low', windowDays, count: nightLowCount }
}

// 短標題用於清單卡片標頭；正文一律描述數據本身＋「建議與醫師討論」，不得出現病因推論或調藥字樣。
export const ANOMALY_SIGNAL_TITLE: Record<AnomalySignalKind, LocalizedText> = {
  weight_drop: { id: 'Berat badan turun', zh: '體重下降', en: 'Weight loss' },
  missed_medication: { id: 'Belum ada catatan minum obat', zh: '未回報服藥', en: 'Medication not reported' },
  bp_high_streak: { id: 'Tekanan darah tinggi berturut-turut', zh: '血壓連續偏高', en: 'Blood pressure elevated' },
  bp_night_low: { id: 'Tekanan darah malam rendah', zh: '夜間血壓偏低次數上升', en: 'Low nighttime blood pressure' },
}

export function describeAnomalySignal(signal: AnomalySignal): LocalizedText {
  switch (signal.kind) {
    case 'weight_drop':
      return {
        id: `Berat badan turun ${signal.dropPercent}% dalam ${signal.windowDays} hari (dari ${signal.baselineWeightKg} kg menjadi ${signal.latestWeightKg} kg). Disarankan didiskusikan dengan dokter.`,
        zh: `體重在 ${signal.windowDays} 天內下降 ${signal.dropPercent}%（從 ${signal.baselineWeightKg} kg 到 ${signal.latestWeightKg} kg），建議與醫師討論。`,
        en: `Weight dropped ${signal.dropPercent}% over ${signal.windowDays} days (from ${signal.baselineWeightKg} kg to ${signal.latestWeightKg} kg). Consider discussing with a doctor.`,
      }
    case 'missed_medication':
      return {
        id: `Belum ada catatan minum obat selama ${signal.consecutiveDays} hari berturut-turut. Disarankan didiskusikan dengan dokter.`,
        zh: `已連續 ${signal.consecutiveDays} 天沒有服藥紀錄，建議與醫師討論。`,
        en: `No medication intake has been recorded for ${signal.consecutiveDays} consecutive days. Consider discussing with a doctor.`,
      }
    case 'bp_high_streak':
      return {
        id: `Tekanan darah tercatat tinggi selama ${signal.consecutiveDays} hari berturut-turut. Disarankan didiskusikan dengan dokter.`,
        zh: `血壓已連續 ${signal.consecutiveDays} 天偏高，建議與醫師討論。`,
        en: `Blood pressure has been elevated for ${signal.consecutiveDays} consecutive days. Consider discussing with a doctor.`,
      }
    case 'bp_night_low':
      return {
        id: `Dalam ${signal.windowDays} hari terakhir, tekanan darah malam yang rendah tercatat ${signal.count} kali. Disarankan didiskusikan dengan dokter.`,
        zh: `近 ${signal.windowDays} 天內，夜間血壓偏低已出現 ${signal.count} 次，建議與醫師討論。`,
        en: `In the last ${signal.windowDays} days, low nighttime blood pressure was recorded ${signal.count} times. Consider discussing with a doctor.`,
      }
  }
}
