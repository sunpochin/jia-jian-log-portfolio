/*
檔案用途：計算血壓平均值、極值統計、UTF-8 CSV 匯出與醫師/GPT 摘要模型。
所在層：src/lib；為數據統計與報表匯出資料層。
主要關聯：由 RecordReport 與 SettingsPage 匯出功能調用。
*/
import dayjs from 'dayjs'
import type { Dayjs } from 'dayjs'
import utc from 'dayjs/plugin/utc'
import timezone from 'dayjs/plugin/timezone'
import { evaluateReading, targetSystolicBand, type BpRecord } from '../types/database'
import type { BpStandardResolver, ResolvedBpStandard } from './bpStandards'
import type { LocalizedText } from './i18n'
import { sessionFromMeasuredAt, SESSION_LABELS, summarizeBpRecords, type DashboardSummary } from './dashboardStats'
import { careDateKey, careDayWindow } from './careDay'
import { TRAJECTORY_DIRECTION_LABELS, type TrajectoryEvent } from './medicalTrajectory'
import type { PreVisitSourceStatuses } from './preVisitSources'
import type { PreVisitBriefItem } from './preVisitBrief'
import { careTimelineEventText } from './careTimeline'
import { REMINDER_TYPE_META } from './careDueReminders'
import { resolveMedicationCategory } from './medication/medicationAtcCategories'
import { medicationSlotText } from './medication/medicationSchedule'

dayjs.extend(utc)
dayjs.extend(timezone)

export const REPORT_TIMEZONE = 'Asia/Taipei'

export interface ReportExportContext {
  selectedDays: number
  generatedAt?: Dayjs
  isOfflineData?: boolean
  cacheUpdatedAt?: string | null
  /**
   * 這位病人的「量測時間 → 判讀標準」解析器（R5）。**必填**：CSV 與 GPT 摘要都是要交給醫師的
   * 對外輸出，印出「偏高」卻沒說是對著哪一組目標講的，醫師會預設是一般成人標準。
   * 放進 context 而不是多一個位置參數，是為了讓 buildRecordCsv 與 buildGptReportText
   * 共用同一個來源，不會有一邊接上、另一邊忘了接。
   */
  standardResolver: BpStandardResolver
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

function isFlagged(record: BpRecord, resolver: BpStandardResolver): boolean {
  return evaluateReading(record.systolic, record.diastolic, record.pulse, resolver(record.measured_at).standard).level !== 'normal'
}

/**
 * `resolver` 必填（理由同 summarizeBpRecords）。每筆讀數都用**它自己的** measured_at 解析，
 * 所以一份跨越標準變更日的報告會如實混合兩種標準，而不是整份重新用現在的標準漆一次。
 */
export function buildRecordReportModel(records: BpRecord[], resolver: BpStandardResolver): RecordReportModel {
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
    summary: summarizeBpRecords(dayRecords, resolver),
    flaggedCount: dayRecords.filter(record => isFlagged(record, resolver)).length,
  }))
  const morningRecords = newestFirst.filter(record => sessionFromMeasuredAt(record.measured_at) === 'pagi')
  const eveningRecords = newestFirst.filter(record => sessionFromMeasuredAt(record.measured_at).startsWith('malam'))

  return {
    newestFirst,
    chronological,
    dailyGroups,
    summary: summarizeBpRecords(newestFirst, resolver),
    morningSummary: summarizeBpRecords(morningRecords, resolver),
    eveningSummary: summarizeBpRecords(eveningRecords, resolver),
    startAt: chronological[0]?.measured_at ?? null,
    endAt: newestFirst[0]?.measured_at ?? null,
    daysWithRecords: dailyGroups.length,
    flaggedCount: newestFirst.filter(record => isFlagged(record, resolver)).length,
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

/**
 * R5：一筆「偏高」必須同時說出是**對著哪一組目標**講的。
 *
 * 醫師看到「偏高」卻不知道判讀基準是 110–120 還是一般成人的 135/85，會做出不同的處置決定；
 * 這是本功能最容易漏、後果最嚴重的一點（規劃文件 §4／issue #898）。
 *
 * `configured: false` 一律印「當時未設定個別標準」，**不得**改印現在的標準名稱——
 * 那會讓醫師以為那段期間就是用現在這份標準判讀的。
 */
export function describeBpStandard(resolved: ResolvedBpStandard): LocalizedText {
  // 「讀不到標準」與「查過了、那段期間確實沒設定」必須分開講。把讀取失敗印成
  // 「當時未設定個別標準」是對醫師陳述一個我們並不知道的事實——那正是 R5 要避免的誤導。
  if (resolved.unavailable) {
    return {
      zh: '判讀標準讀取失敗（暫以一般成人標準判讀，請重新整理後再匯出）',
      id: 'Gagal membaca standar penilaian (sementara memakai standar dewasa umum; muat ulang sebelum mengekspor)',
      en: 'Could not read the interpretation standard (temporarily using the general adult standard; reload before exporting)',
    }
  }
  if (!resolved.configured) {
    return {
      zh: '當時未設定個別標準（一般成人）',
      id: 'Belum ada standar individual saat itu (dewasa umum)',
      en: 'No individual standard was set at the time (general adult)',
    }
  }
  const band = targetSystolicBand(resolved.standard)
  // 目標帶直接從階梯推導（targetSystolicBand），不是另外寫一份摘要——寫兩次會漂移，
  // 而漂移的那一份正好是印給醫師看的那一份。
  const range = band ? ` ${band.min}–${band.max} mmHg` : ''
  const { names } = resolved.standard
  return { zh: `${names.zh}${range}`, id: `${names.id}${range}`, en: `${names.en}${range}` }
}

/**
 * 這份報告涵蓋的**所有**標準，依首次出現的順序。跨越標準變更日的報告因此會列出兩份，
 * 而不是把整段歷史都說成現在這一份。
 */
export function bpStandardsUsed(records: BpRecord[], resolver: BpStandardResolver): LocalizedText[] {
  const seen = new Map<string, LocalizedText>()
  for (const record of records) {
    const label = describeBpStandard(resolver(record.measured_at))
    if (!seen.has(label.en)) seen.set(label.en, label)
  }
  return [...seen.values()]
}

function formatRecordStatus(record: BpRecord, resolver: BpStandardResolver): string {
  const evaluation = evaluateReading(record.systolic, record.diastolic, record.pulse, resolver(record.measured_at).standard)
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
  const model = buildRecordReportModel(records, context.standardResolver)
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
      formatRecordStatus(record, context.standardResolver),
      // R5：每一列都帶自己的判讀標準。放在「系統提示」旁邊而不是只寫在表頭，
      // 是因為匯出的 CSV 會被排序、篩選與部分複製，表頭一離開那一列就失去對應關係。
      (() => { const label = describeBpStandard(context.standardResolver(record.measured_at)); return `${label.id} / ${label.zh}` })(),
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
    'Standar penilaian / 判讀標準',
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

// 省略第三參數時完全不影響既有輸出（連換行都不多一行）：既有呼叫端（CSV、舊測試快照）
// 不需要跟著改寫，只有主動傳入軌跡資料的呼叫端才會多印這段。
export interface TrajectoryReportSection {
  events: TrajectoryEvent[]
  sourceStatus: PreVisitSourceStatuses
}

const TRAJECTORY_SOURCE_UNAVAILABLE_LABEL: Record<keyof PreVisitSourceStatuses, string> = {
  medicationChanges: 'medication changes / 藥單異動',
  timelineEntries: 'visit and doctor-instruction events / 看診與醫囑事件',
  dueReminders: 'due reminders / 到期提醒',
  labResults: 'lab results / 檢驗值',
}

function formatTrajectoryEventLine(event: TrajectoryEvent): string {
  const date = dayjs(event.occurredAt).tz(REPORT_TIMEZONE).format('YYYY-MM-DD')
  if (event.kind === 'medication_change') {
    const direction = TRAJECTORY_DIRECTION_LABELS[event.direction]
    const category = resolveMedicationCategory(event.medication.atc_code)
    const medicationName = `${event.medication.brand_name}${event.medication.brand_name_zh ? ` / ${event.medication.brand_name_zh}` : ''}`
    const slot = event.scheduleSlot ? medicationSlotText(event.scheduleSlot) : null
    const doseText = event.doseAmount != null && event.doseCount != null ? `${event.doseAmount} x ${event.doseCount}` : null
    const details = [
      category ? `${category.id}/${category.zh}` : null,
      slot ? `${slot.id}/${slot.zh}` : null,
      doseText,
      event.asNeeded ? 'as needed / 需要時' : null,
      event.reason ? `reason / 原因: ${event.reason}` : null,
    ].filter(Boolean).join('; ')
    return `${date} | ${direction.id}/${direction.zh}: ${medicationName}${details ? ` (${details})` : ''}`
  }
  if (event.kind === 'due_reminder') {
    const label = REMINDER_TYPE_META[event.reminderType].label
    return `${date} | Overdue reminder / 逾期提醒: ${label.id}/${label.zh} (${event.daysOverdue} day(s) overdue / 逾期 ${event.daysOverdue} 天)`
  }
  const kindLabel = careTimelineEventText[event.kind]
  const details = event.details ? ` - ${event.details}` : ''
  return `${date} | ${kindLabel.id}/${kindLabel.zh}: ${event.title}${details}`
}

function buildTrajectorySectionLines(trajectory: TrajectoryReportSection | undefined): string[] {
  if (!trajectory) return []
  const unavailable = (Object.keys(trajectory.sourceStatus) as Array<keyof PreVisitSourceStatuses>)
    .filter(key => trajectory.sourceStatus[key] === 'unavailable')
  const lines = ['', '## Recent medical trajectory / 近期醫療軌跡']
  if (unavailable.length > 0) {
    // 離線或讀取失敗時要明講「這個來源讀不到」，不能讓 GPT 把「讀不到」誤當成「這段期間真的沒有異動」。
    lines.push(`- Unavailable sources / 無法讀取的來源: ${unavailable.map(key => TRAJECTORY_SOURCE_UNAVAILABLE_LABEL[key]).join('; ')}`)
  }
  if (trajectory.events.length === 0) {
    lines.push('- No medication changes, visits, or due reminders in this period / 此區間沒有藥單異動、看診事件或到期提醒。')
  } else {
    lines.push(...trajectory.events.map(event => `- ${formatTrajectoryEventLine(event)}`))
  }
  return lines
}

// 只在呼叫端主動傳入 preVisitBrief 時才印這段（省略第 4 參數完全不影響既有輸出，跟 trajectory 同一慣例）；
// 零項目時直接印固定「無可對照」文案，不補一個通用問題湊數（規劃文件 §5.2 驗收條件）。
function buildPreVisitBriefSectionLines(items: PreVisitBriefItem[] | undefined): string[] {
  if (!items) return []
  const lines = ['', '## Pre-visit brief / 就診前摘要']
  if (items.length === 0) {
    lines.push('- No medication changes or overdue reminders to compare in this period / 區間內沒有可對照的藥單異動或逾期提醒。')
    return lines
  }
  for (const item of items) {
    lines.push(`- [${item.ruleId}] ${item.observation.en} / ${item.observation.zh}`)
    if (item.question) lines.push(`  ${item.question.en} / ${item.question.zh}`)
  }
  return lines
}

export function buildGptReportText(records: BpRecord[], context: ReportExportContext, trajectory?: TrajectoryReportSection, preVisitBrief?: PreVisitBriefItem[]): string {
  const model = buildRecordReportModel(records, context.standardResolver)
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
      formatRecordStatus(record, context.standardResolver),
      describeBpStandard(context.standardResolver(record.measured_at)).en,
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
    // R5：擺在「筆數」之前，因為下面每一個彙總數字（偏高幾筆、平均、標記數）都是用這些標準算出來的。
    `- Interpretation standard / 判讀標準: ${bpStandardsUsed(model.chronological, context.standardResolver).map(label => `${label.en} / ${label.zh}`).join('; ') || 'n/a'}`,
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
    ...buildTrajectorySectionLines(trajectory),
    ...buildPreVisitBriefSectionLines(preVisitBrief),
    '',
    '## Task for GPT / 給 GPT 的任務',
    'Describe observable patterns, separate facts from inferences, identify missing context, and draft questions to ask a physician. Do not diagnose or recommend medication changes.',
    '請描述可觀察到的趨勢、分開事實與推論、指出缺少的背景，並整理可詢問醫師的問題；不要診斷，也不要建議自行調藥。',
    // 只在真的印出這段摘要時才補這句，避免沒有資料時憑空指示 GPT「驗證」不存在的內容。
    ...(preVisitBrief ? ['Treat the pre-visit brief as questions to verify, not conclusions.', '請把就診前摘要當成待確認的問題，不是結論。'] : []),
    '',
    '## Raw records, oldest first / 原始紀錄（由舊到新）',
    ...rows,
  ].join('\n')
}
