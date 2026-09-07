/*
檔案用途：統計 Dashboard 專用的日/週/月平均值與時段歸類模型。
所在層：src/lib；為看板統計計算邏輯。
主要關聯：由 Dashboard 與 DashboardStatsCards 載入。
*/
import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import timezone from 'dayjs/plugin/timezone'
import { evaluateReading, type AlertLevel, type BpRecord } from '../types/database'
import { getSession, type Session } from './session'
import { TZ } from './timezone'
import { careDateKey } from './careDay'
import type { LocalizedText } from './i18n'

dayjs.extend(utc)
dayjs.extend(timezone)


// 移除了晚間時段的 "Malam" 字樣以簡化介面，讓印尼籍看護能更快速辨識時間點。
export const SESSION_LABELS: Record<Session, LocalizedText> = {
  pagi: { id: 'Pagi', zh: '早上', en: 'Morning' },
  siang: { id: 'Siang', zh: '下午', en: 'Afternoon' },
  malam1: { id: '18:00+', zh: '晚上18點', en: '18:00 PM' },
  malam2: { id: '20:00+', zh: '晚上20點', en: '8pm' },
  // malam3 仍保留給統計，但不再顯示成 22:00 後的額外 checkpoint 標籤。
  malam3: { id: '', zh: '', en: '' },
}

export const ALERT_LABELS: Record<AlertLevel, LocalizedText> = {
  normal: { id: 'Normal', zh: '正常', en: 'Normal' },
  warning: { id: 'Agak Tinggi', zh: '略高', en: 'Somewhat higher' },
  danger: { id: 'Terlalu Tinggi', zh: '偏高', en: 'Somewhat high' },
  'warning-low': { id: 'Agak Rendah', zh: '偏低注意', en: 'Low attention' },
  'danger-low': { id: 'Terlalu Rendah', zh: '過低', en: 'Very low' },
}

export function alertMarkerColor(level: AlertLevel): string {
  // 圖表的事件點必須和九級規格的警示結果共用同一判定，否則視覺提示可能先於或晚於真正警報而誤導家屬。
  if (level === 'danger' || level === 'danger-low') return '#ef4444'
  if (level === 'warning' || level === 'warning-low') return '#f97316'
  return '#10b981'
}

export interface DashboardSummary {
  latest: BpRecord | null
  recordCount: number
  avgSystolic: number | null
  avgDiastolic: number | null
  avgPulse: number | null
  alertCounts: Record<AlertLevel, number>
  pulseWarningCount: number
  sessionCounts: Record<Session, number>
  nightLowCount: number
}

export interface TodayCareSummary {
  latest: BpRecord | null
  recordCount: number
  checkpoints: Record<'malam1' | 'malam2' | 'malam3', BpRecord | null>
}

const emptyAlertCounts = (): Record<AlertLevel, number> => ({
  normal: 0,
  warning: 0,
  danger: 0,
  'warning-low': 0,
  'danger-low': 0,
})

const emptySessionCounts = (): Record<Session, number> => ({
  pagi: 0,
  siang: 0,
  malam1: 0,
  malam2: 0,
  malam3: 0,
})

function average(values: number[]): number | null {
  if (values.length === 0) return null
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length)
}

export function sessionFromMeasuredAt(measuredAt: string): Session {
  // Supabase may return UTC (`Z`) even when the app saved a Taipei timestamp.
  // Convert back to Asia/Taipei before bucketizing, otherwise an 18:00 check
  // can look like 10:00 and disappear from the night-low view.
  return getSession(dayjs(measuredAt).tz(TZ).hour())
}

export function summarizeBpRecords(records: BpRecord[]): DashboardSummary {
  const alertCounts = emptyAlertCounts()
  const sessionCounts = emptySessionCounts()
  let nightLowCount = 0
  let pulseWarningCount = 0

  for (const record of records) {
    const reading = evaluateReading(record.systolic, record.diastolic, record.pulse)
    const bpLevel = reading.bpRule.webAlertLevel as AlertLevel
    const session = sessionFromMeasuredAt(record.measured_at)

    // 血壓與心跳分開計數，否則「只有心跳 >120」會被誤算成一筆偏高血壓。
    alertCounts[bpLevel] += 1
    if (reading.pulseWarning) pulseWarningCount += 1
    sessionCounts[session] += 1

    if (
      (session === 'malam1' || session === 'malam2' || session === 'malam3') &&
      (bpLevel === 'warning-low' || bpLevel === 'danger-low')
    ) {
      nightLowCount += 1
    }
  }

  return {
    latest: records[0] ?? null,
    recordCount: records.length,
    avgSystolic: average(records.map(record => record.systolic)),
    avgDiastolic: average(records.map(record => record.diastolic)),
    avgPulse: average(records.flatMap(record => record.pulse == null ? [] : [record.pulse])),
    alertCounts,
    pulseWarningCount,
    sessionCounts,
    nightLowCount,
  }
}

export function summarizeTodayCare(records: BpRecord[], today = careDateKey(dayjs().tz(TZ))): TodayCareSummary {
  const checkpoints: TodayCareSummary['checkpoints'] = {
    malam1: null,
    malam2: null,
    malam3: null,
  }
  const todayRecords = records
    // 照護交接以 04:00 切日；直接切日曆日期會把凌晨睡前後續量測拆到另一頁。
    .filter(record => careDateKey(dayjs(record.measured_at)) === today)
    .sort((a, b) => dayjs(b.measured_at).valueOf() - dayjs(a.measured_at).valueOf())

  for (const record of todayRecords) {
    const session = sessionFromMeasuredAt(record.measured_at)
    // records 是由新到舊走訪，保留第一筆才能在同一 checkpoint 有兩次量測時顯示最新狀態。
    if ((session === 'malam1' || session === 'malam2' || session === 'malam3') && checkpoints[session] == null) {
      checkpoints[session] = record
    }
  }

  return {
    latest: todayRecords[0] ?? null,
    recordCount: todayRecords.length,
    checkpoints,
  }
}
