/*
檔案用途：計算血壓平均值、極值統計、UTF-8 CSV 匯出與醫師/GPT 摘要模型。
所在層：src/lib；為數據統計與報表匯出資料層。
主要關聯：由 RecordReport 與 SettingsPage 匯出功能調用。
*/
import dayjs from 'dayjs'
import type { Dayjs } from 'dayjs'
import utc from 'dayjs/plugin/utc'
import timezone from 'dayjs/plugin/timezone'
import { evaluateReading, type BpRecord } from '../types/database'
import { sessionFromMeasuredAt, SESSION_LABELS, summarizeBpRecords, type DashboardSummary } from './dashboardStats'
import { careDateKey, careDayWindow } from './careDay'

dayjs.extend(utc)
dayjs.extend(timezone)

export const REPORT_TIMEZONE = 'Asia/Taipei'

export interface ReportExportContext {
  selectedDays: number
  generatedAt?: Dayjs
  isOfflineData?: boolean
  cacheUpdatedAt?: string | null
}

export interface NumberRange {
  min: number
  max: number
}

export interface RecordDayGroup {
  date: string
  records: BpRecord[]
  summary: DashboardSummary
  flaggedCount: number
}

export interface RecordReportModel {
  newestFirst: BpRecord[]
  chronological: BpRecord[]
  dailyGroups: RecordDayGroup[]
  summary: DashboardSummary
  morningSummary: DashboardSummary
  eveningSummary: DashboardSummary
  startAt: string | null
  endAt: string | null
  daysWithRecords: number
  flaggedCount: number
  missingPulseCount: number
  systolicRange: NumberRange | null
  diastolicRange: NumberRange | null
  pulseRange: NumberRange | null
  highestSystolic: BpRecord | null
  lowestDiastolic: BpRecord | null
}

function range(values: number[]): NumberRange | null {
  if (values.length === 0) return null
  return { min: Math.min(...values), max: Math.max(...values) }
}

function isFlagged(record: BpRecord): boolean {
  return evaluateReading(record.systolic, record.diastolic, record.pulse).level !== 'normal'
}

export function buildRecordReportModel(records: BpRecord[]): RecordReportModel {
  // 報告一律自行排序，不能假設每個呼叫端都維持 Supabase 的排序條件。
  const newestFirst = [...records].sort((left, right) => dayjs(right.measured_at).valueOf() - dayjs(left.measured_at).valueOf())
  const chronological = [...newestFirst].reverse()
  const grouped = new Map<string, BpRecord[]>()

  for (const record of newestFirst) {
    // Dashboard 的資料窗是照護日；每筆原始 measured_at 仍在明細中保留，避免誤讀成實際日曆日。
    const date = careDateKey(dayjs(record.measured_at))
    grouped.set(date, [...(grouped.get(date) ?? []), record])
  }

  const dailyGroups = [...grouped.entries()].map(([date, dayRecords]) => ({
    date,
    records: dayRecords,
    summary: summarizeBpRecords(dayRecords),
    flaggedCount: dayRecords.filter(isFlagged).length,
  }))
  const morningRecords = newestFirst.filter(record => sessionFromMeasuredAt(record.measured_at) === 'pagi')
  const eveningRecords = newestFirst.filter(record => sessionFromMeasuredAt(record.measured_at).startsWith('malam'))

  return {
    newestFirst,
    chronological,
    dailyGroups,
    summary: summarizeBpRecords(newestFirst),
    morningSummary: summarizeBpRecords(morningRecords),
    eveningSummary: summarizeBpRecords(eveningRecords),
    startAt: chronological[0]?.measured_at ?? null,
    endAt: newestFirst[0]?.measured_at ?? null,
    daysWithRecords: dailyGroups.length,
    flaggedCount: newestFirst.filter(isFlagged).length,
    missingPulseCount: newestFirst.filter(record => record.pulse == null).length,
    systolicRange: range(newestFirst.map(record => record.systolic)),
    diastolicRange: range(newestFirst.map(record => record.diastolic)),
    pulseRange: range(newestFirst.flatMap(record => record.pulse == null ? [] : [record.pulse])),
    // 極值保留完整原始紀錄，不能把不同時間的最高高壓與最低低壓拼成一組不存在的血壓。
    highestSystolic: newestFirst.reduce<BpRecord | null>((highest, record) => !highest || record.systolic > highest.systolic ? record : highest, null),
    lowestDiastolic: newestFirst.reduce<BpRecord | null>((lowest, record) => !lowest || record.diastolic < lowest.diastolic ? record : lowest, null),
  }
}

function csvCell(value: string | number): string {
  const text = String(value)
  // Excel 會把危險字首當公式執行；單引號可保留原字串又避免姓名或來源觸發公式。
  const safeText = /^[=+\-@\t\r\n]/.test(text) ? `'${text}` : text
  return `"${safeText.replace(/"/g, '""')}"`
}

function formatRecordStatus(record: BpRecord): string {
  const evaluation = evaluateReading(record.systolic, record.diastolic, record.pulse)
  return `${evaluation.labels.id} / ${evaluation.labels.zh}`
}

export function reportWindow(selectedDays: number, generatedAt: Dayjs) {
  const { start, end } = careDayWindow(selectedDays, generatedAt.tz(REPORT_TIMEZONE))
  // end 是下一個 04:00 的排他邊界；保留這個邊界可讓查詢不必依賴 03:59:59.999。
  return { start, end }
}

function dataStatus(context: ReportExportContext): string {
  if (!context.isOfflineData) return 'Online fetch / 線上讀取'
  const cacheTime = context.cacheUpdatedAt
    ? dayjs(context.cacheUpdatedAt).tz(REPORT_TIMEZONE).format('YYYY-MM-DD HH:mm:ss')
    : 'unknown / 未知'
  return `Offline cache / 離線快取; last sync / 最後同步 ${cacheTime}`
}

export function buildRecordCsv(records: BpRecord[], subjectLabel: string, context: ReportExportContext): string {
  const model = buildRecordReportModel(records)
  const generatedAt = context.generatedAt ?? dayjs().tz(REPORT_TIMEZONE)
  const window = reportWindow(context.selectedDays, generatedAt)
  const selectedPeriod = `${window.start.format('YYYY-MM-DD')} 04:00 to ${window.end.format('YYYY-MM-DD')} 04:00`
  const rows = model.chronological.map(record => {
    const session = SESSION_LABELS[sessionFromMeasuredAt(record.measured_at)]
    return [
      subjectLabel,
      selectedPeriod,
      `${model.daysWithRecords}/${Math.max(1, context.selectedDays)}`,
      dataStatus(context),
      dayjs(record.measured_at).tz(REPORT_TIMEZONE).format('YYYY-MM-DD HH:mm:ss'),
      record.measured_at,
      REPORT_TIMEZONE,
      record.systolic,
      record.diastolic,
      record.pulse ?? '',
      `${session.id} / ${session.zh}`,
      formatRecordStatus(record),
      record.source,
    ].map(csvCell).join(',')
  })

  const header = [
    'Subjek / 對象',
    'Periode dipilih / 選取區間',
    'Hari berisi data / 有紀錄日',
    'Status data / 資料狀態',
    'Waktu ukur / 量測時間',
    'Timestamp asli / 原始時間戳',
    'Zona waktu / 時區',
    'Sistolik mmHg / 收縮壓',
    'Diastolik mmHg / 舒張壓',
    'Denyut bpm / 心跳',
    'Sesi / 時段',
    'Tanda sistem / 系統提示',
    'Sumber / 來源',
  ].map(csvCell).join(',')

  // BOM 讓 Excel 直接開啟時仍能正確辨識繁體中文與印尼文，不需使用者手動選編碼。
  return `\uFEFF${[header, ...rows].join('\r\n')}`
}

function formatAverage(summary: DashboardSummary): string {
  if (summary.avgSystolic == null || summary.avgDiastolic == null) return '—'
  const pulse = summary.avgPulse == null ? '' : `, pulse ${summary.avgPulse} bpm`
  return `${summary.avgSystolic}/${summary.avgDiastolic} mmHg${pulse} (n=${summary.recordCount})`
}

function formatRange(value: NumberRange | null, unit: string): string {
  return value ? `${value.min}–${value.max} ${unit}` : '—'
}

export function buildGptReportText(records: BpRecord[], context: ReportExportContext): string {
  const model = buildRecordReportModel(records)
  const generatedAt = context.generatedAt ?? dayjs().tz(REPORT_TIMEZONE)
  const window = reportWindow(context.selectedDays, generatedAt)
  const period = `${window.start.format('YYYY-MM-DD')} 04:00 to ${window.end.format('YYYY-MM-DD')} 04:00`
  const actualMeasurements = model.startAt && model.endAt
    ? `${dayjs(model.startAt).tz(REPORT_TIMEZONE).format('YYYY-MM-DD HH:mm:ss')} to ${dayjs(model.endAt).tz(REPORT_TIMEZONE).format('YYYY-MM-DD HH:mm:ss')}`
    : 'No data / 無資料'
  const highCount = model.summary.alertCounts.warning + model.summary.alertCounts.danger
  const lowCount = model.summary.alertCounts['warning-low'] + model.summary.alertCounts['danger-low']
  const rows = model.chronological.map(record => {
    const session = SESSION_LABELS[sessionFromMeasuredAt(record.measured_at)]
    return [
      dayjs(record.measured_at).tz(REPORT_TIMEZONE).format('YYYY-MM-DD HH:mm:ss'),
      `${record.systolic}/${record.diastolic} mmHg`,
      record.pulse == null ? 'pulse —' : `pulse ${record.pulse} bpm`,
      `${session.id}/${session.zh}`,
      formatRecordStatus(record),
    ].join(' | ')
  })

  return [
    '# Home blood pressure record / 居家血壓紀錄',
    // GPT 文字包預設不放顯示姓名，降低貼到外部服務時直接識別個人的風險。
    '- Subject / 對象: Name-removed patient / 已移除姓名的紀錄對象',
    '- Privacy / 隱私: Display name omitted, but all per-reading health values remain / 已移除顯示姓名，但仍包含所有逐筆健康數值',
    `- Selected period / 選取區間: ${period}`,
    `- First–last measurement / 首末筆量測: ${actualMeasurements}`,
    `- Timezone / 時區: ${REPORT_TIMEZONE} (UTC+8)`,
    `- Generated / 產生時間: ${generatedAt.tz(REPORT_TIMEZONE).format('YYYY-MM-DD HH:mm:ss')}`,
    `- Data status / 資料狀態: ${dataStatus(context)}`,
    `- Records / 筆數: ${model.summary.recordCount}; days with records / 有紀錄天數: ${model.daysWithRecords}/${Math.max(1, context.selectedDays)}`,
    `- Per-reading average / 逐筆平均: ${formatAverage(model.summary)}`,
    `- Morning average / 早上平均: ${formatAverage(model.morningSummary)}`,
    `- Evening average / 晚間平均: ${formatAverage(model.eveningSummary)}`,
    `- Range / 範圍: systolic ${formatRange(model.systolicRange, 'mmHg')}; diastolic ${formatRange(model.diastolicRange, 'mmHg')}; pulse ${formatRange(model.pulseRange, 'bpm')}`,
    `- System-flagged records / 系統標記: high BP ${highCount}; low BP ${lowCount}; pulse >120 ${model.summary.pulseWarningCount}; unique records ${model.flaggedCount}`,
    `- Missing pulse / 缺心跳: ${model.missingPulseCount}`,
    '',
    '## Data limits / 資料限制',
    '- This export contains measurements only. It does not contain symptoms, posture, device, medication timing, or confirmed first/second-reading pairs.',
    '- 本資料只有量測值；沒有症狀、姿勢、裝置、服藥時間，也無法確認同一輪的第一次／第二次量測。',
    '- System flags reuse the app rules and are descriptive prompts, not a diagnosis.',
    '- 系統提示沿用 App 規則，只供整理紀錄，不代表診斷。',
    '',
    '## Task for GPT / 給 GPT 的任務',
    'Describe observable patterns, separate facts from inferences, identify missing context, and draft questions to ask a physician. Do not diagnose or recommend medication changes.',
    '請描述可觀察到的趨勢、分開事實與推論、指出缺少的背景，並整理可詢問醫師的問題；不要診斷，也不要建議自行調藥。',
    '',
    '## Raw records, oldest first / 原始紀錄（由舊到新）',
    ...rows,
  ].join('\n')
}
