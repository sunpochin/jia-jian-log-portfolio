/*
檔案用途：就診前摘要規則引擎——把調藥後量測對照、逾期提醒與醫師指示回顧，整理成「觀察」＋「請與醫師
確認」問題，最多取 3 項供醫師版報告與 GPT 摘要使用。第一版刻意用確定性規則模板而非 LLM：可被單元測試
審計、資料不外送，也不踩醫材（SaMD）紅線（規劃文件 docs/product/clinical-care-ops.md §4、§5.2）。
所在層：src/lib 純函式業務邏輯層；只接受呼叫端已查好的資料做規則比對與排序，不連線 Supabase。
主要關聯：由 src/features/vitals/components/BloodPressureReportPanel.tsx 呼叫並傳入
src/features/vitals/hooks/usePreVisitSources.ts 的輸出，結果交給 PreVisitBriefSection.tsx 呈現，
並供 recordReport.ts 的 buildGptReportText 擴充段落使用（issue #686，S2；依賴 issue #684／S1 的
medicalTrajectory.ts 與 usePreVisitSources.ts 擴寬視窗血壓基線）。
*/
import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import timezone from 'dayjs/plugin/timezone'
import type { LocalizedText, Locale } from './i18n'
import type { BpRecord } from '../types/database'
import { summarizeBpRecords } from './dashboardStats'
import type { BpStandardResolver } from './bpStandards'
import { summarizeEventReviewDays } from './careTimeline'
import { calendarDateKey } from './careDay'
import { TZ } from './timezone'
import type { TrajectoryEvent, TrajectoryMedicationGroup, TimelineTrajectoryEvent, MedicationChangeTrajectoryEvent } from './medicalTrajectory'
import { TRAJECTORY_DIRECTION_LABELS } from './medicalTrajectory'
import type { CareDueReminder } from './careDueReminders'
import { REMINDER_TYPE_META, computeRemainingDays } from './careDueReminders'
import type { PreVisitSourceStatuses } from './preVisitSources'
import type { PatientLabResult } from '../types/database'
import { LAB_ITEM_META, labRangeStatus } from './labResults'

dayjs.extend(utc)
dayjs.extend(timezone)

export type PreVisitBriefRuleId = 'R1' | 'R2' | 'R3' | 'R4' | 'R5' | 'R6'

export interface PreVisitBriefItem {
  ruleId: PreVisitBriefRuleId
  // 數字越小越優先：R5=1、R1=2、R2/R3=3、R4=4、R6=5（規劃文件 §5.2 的規則優先序；R5 為 issue #687
  // 新增的檢驗值超出參考值規則，優先度最高——超出參考值比調藥後對照、逾期提醒更需要優先讓醫師看到）。
  priority: number
  occurredAt: string
  // 只有 R1（調藥）與 R2（藥量倒數，可能連結某張藥單）會帶非 null 值；其餘規則固定為 null，
  // 去重時改用 `${ruleId}:${dedupeId}` 當鍵，避免不同規則的項目因為同為 null 被誤併成一項。
  relatedMedicationId: string | null
  // 來源實體的 id（調藥事件、提醒、時間線事件、檢驗值列），只在 relatedMedicationId 為 null 時用來組去重鍵。
  dedupeId: string
  observation: LocalizedText
  // null 代表「只有觀察」：調藥後零量測（R1）或量測涵蓋率過低（R6）時，沒有足夠資訊可以形成提問。
  question: LocalizedText | null
}

export interface PreVisitBriefWindow {
  start: string
  end: string
}

export interface BuildPreVisitBriefOptions {
  // S1 擴寬視窗的血壓紀錄（selectedDays + 14 天），R1 的調藥前後基線比對要靠它才抓得到
  // 落在報告視窗起點前的調藥事件所需的基線資料；一般報告用的 records 只涵蓋視窗本身，不夠用。
  baselineRecords: BpRecord[]
  // 刻意要求未過濾的原始清單（listCareDueReminders 的完整結果），R2／R3 自己過濾
  // status === 'active'：不能直接沿用 medicalTrajectory.ts 已篩過視窗與到期日的 events，
  // 否則無法涵蓋到期日落在視窗之外、但現在仍逾期未續開的提醒（Codex review PR #689 的既有坑）。
  dueReminders: CareDueReminder[]
  sourceStatus: PreVisitSourceStatuses
  today?: string
  // 選填並預設 []：不強制既有呼叫端（例如既有測試 fixture）一定要補上這個欄位；
  // 缺省時 R5 自然沒有資料可比對，等同「這段期間沒有檢驗值」，行為安全。
  labResults?: PatientLabResult[]
  // 這位病人的判讀標準解析器。**必填**：R1 的調藥前後對照直接引用 summarizeBpRecords 的平均與
  // 警示計數，用錯標準會讓「調藥後有沒有改善」這句話對著錯的目標算（issue #898 §6.1）。
  standardResolver: BpStandardResolver
}

// 三語一律以「請與醫師確認／Tanyakan kepada dokter／Please confirm with the doctor」開頭，
// 讓照護者與醫師都能一眼認出這是「待確認的問題」而非系統下的結論（規劃文件 §4 措辭契約）。
const CONFIRM_PREFIX: LocalizedText = { id: 'Tanyakan kepada dokter', zh: '請與醫師確認', en: 'Please confirm with the doctor' }

function confirmQuestion(body: LocalizedText): LocalizedText {
  return {
    id: `${CONFIRM_PREFIX.id}: ${body.id}`,
    zh: `${CONFIRM_PREFIX.zh}：${body.zh}`,
    en: `${CONFIRM_PREFIX.en}: ${body.en}`,
  }
}

// 每條規則的文案都必須避開這份清單——因果推論詞、停藥／加藥指示詞——才不會讓「觀察＋提問」
// 讀起來像系統在下診斷或建議調藥。三語測試（tests/unit/preVisitBriefPhrasing.test.ts）逐條掃過。
export const PRE_VISIT_FORBIDDEN_PHRASES: Record<Locale, string[]> = {
  zh: ['導致', '造成', '因為', '建議停', '建議加', '請調', '應該停', '應該加', '副作用'],
  id: ['menyebabkan', 'karena', 'akibat', 'hentikan', 'tambah dosis', 'kurangi dosis'],
  en: ['caused', 'because', 'due to', 'stop taking', 'increase the dose', 'reduce the dose', 'should stop', 'side effect'],
}

function medicationTrilingualName(medication: { brand_name: string; brand_name_zh: string | null; brand_name_id?: string | null }): LocalizedText {
  return {
    id: medication.brand_name_id || medication.brand_name,
    zh: medication.brand_name_zh || medication.brand_name,
    en: medication.brand_name,
  }
}

function recordsBetween(records: BpRecord[], startMs: number, endMs: number, endInclusive: boolean): BpRecord[] {
  return records.filter(record => {
    const measured = dayjs(record.measured_at).valueOf()
    if (!Number.isFinite(measured) || measured < startMs) return false
    return endInclusive ? measured <= endMs : measured < endMs
  })
}

function formatBpAverage(summary: ReturnType<typeof summarizeBpRecords>): string {
  if (summary.avgSystolic == null || summary.avgDiastolic == null) return `n=${summary.recordCount}`
  return `${summary.avgSystolic}/${summary.avgDiastolic} mmHg (n=${summary.recordCount})`
}

// R1（P2）：調藥後量測對照，只比對 blood_pressure／diuretic 群——利尿劑（C03）與血鉀是否併陳
// 屬於規劃文件 §10 的開放決策，本票先只做「同義配對」（把利尿劑併入同一組基線比對邏輯），
// 不另外抓血鉀數值或做因果配對。
const R1_QUALIFYING_GROUPS: TrajectoryMedicationGroup[] = ['blood_pressure', 'diuretic']

function buildR1Items(events: TrajectoryEvent[], baselineRecords: BpRecord[], windowEndIso: string, resolver: BpStandardResolver): PreVisitBriefItem[] {
  const windowEndMs = dayjs(windowEndIso).valueOf()
  const items: PreVisitBriefItem[] = []

  for (const event of events) {
    if (event.kind !== 'medication_change') continue
    if (!R1_QUALIFYING_GROUPS.includes(event.medicationGroup)) continue

    const changeAt = dayjs(event.occurredAt).tz(TZ)
    const changeMs = changeAt.valueOf()
    const baselineStartMs = changeAt.subtract(7, 'day').valueOf()
    const baseline = summarizeBpRecords(recordsBetween(baselineRecords, baselineStartMs, changeMs, false), resolver)
    const after = summarizeBpRecords(recordsBetween(baselineRecords, changeMs, windowEndMs, true), resolver)

    const medicationName = medicationTrilingualName(event.medication)
    const direction = TRAJECTORY_DIRECTION_LABELS[event.direction]
    const dateLabel = changeAt.format('YYYY-MM-DD')

    if (after.recordCount === 0) {
      items.push({
        ruleId: 'R1', priority: 2, occurredAt: event.occurredAt,
        relatedMedicationId: event.medication.id, dedupeId: event.id,
        observation: {
          id: `${dateLabel} ${direction.id} ${medicationName.id}. Belum ada catatan tekanan darah baru pada rentang ini untuk dibandingkan.`,
          zh: `${dateLabel} ${direction.zh}${medicationName.zh}後，此區間內沒有新的血壓量測可供對照。`,
          en: `${dateLabel} ${direction.en} ${medicationName.en}. No new blood pressure measurements in this period to compare.`,
        },
        question: null,
      })
      continue
    }

    const baselineText = formatBpAverage(baseline)
    const afterText = formatBpAverage(after)
    items.push({
      ruleId: 'R1', priority: 2, occurredAt: event.occurredAt,
      relatedMedicationId: event.medication.id, dedupeId: event.id,
      observation: {
        id: `${dateLabel} ${direction.id} ${medicationName.id}. Rata-rata 7 hari sebelum: ${baselineText}; sesudah sampai saat ini: ${afterText}.`,
        zh: `${dateLabel} ${direction.zh}${medicationName.zh}。調整前 7 天平均 ${baselineText}；調整後至今平均 ${afterText}。`,
        en: `${dateLabel} ${direction.en} ${medicationName.en}. Average 7 days before: ${baselineText}; after to date: ${afterText}.`,
      },
      question: confirmQuestion({
        id: `apakah perubahan tekanan darah setelah penyesuaian obat ini sesuai perkiraan?`,
        zh: `這次調整${medicationName.zh}後的血壓變化是否符合預期？`,
        en: `whether the blood pressure change after this medication adjustment is as expected?`,
      }),
    })
  }
  return items
}

// R2（P3）：藥量倒數逾期提醒——唯一的「可能未續開」信號，不從其他資料（例如藥單異動、時間線）推論；
// 一律以 dueReminders 自行過濾 status === 'active'，避免沿用已過濾過的 events 漏掉視窗外仍逾期的提醒。
function buildR2Items(dueReminders: CareDueReminder[], today: string): PreVisitBriefItem[] {
  return dueReminders
    .filter(reminder => reminder.status === 'active' && reminder.reminder_type === 'medication_refill')
    .flatMap(reminder => {
      const remainingDays = computeRemainingDays(reminder.due_date, today)
      if (remainingDays >= 0) return []
      const daysOverdue = -remainingDays
      return [{
        ruleId: 'R2' as const, priority: 3, occurredAt: reminder.due_date,
        relatedMedicationId: reminder.medication_plan_id, dedupeId: reminder.id,
        observation: {
          id: `Pengingat sisa obat sudah lewat ${daysOverdue} hari (jatuh tempo ${reminder.due_date}).`,
          zh: `藥量倒數提醒已逾期 ${daysOverdue} 天（到期日 ${reminder.due_date}）。`,
          en: `The medication supply reminder is ${daysOverdue} day(s) overdue (due ${reminder.due_date}).`,
        },
        question: confirmQuestion({
          id: `apakah resep obat ini masih perlu diperpanjang?`,
          zh: `這張藥單是否仍需要繼續開立？`,
          en: `whether this medication prescription still needs to be continued?`,
        }),
      }]
    })
}

// R3（P3）：回診／抽血逾期提醒，理由與過濾方式同 R2——只認 status === 'active' 且已逾期。
const R3_TYPES = new Set(['follow_up_visit', 'blood_draw'])

function buildR3Items(dueReminders: CareDueReminder[], today: string): PreVisitBriefItem[] {
  return dueReminders
    .filter(reminder => reminder.status === 'active' && R3_TYPES.has(reminder.reminder_type))
    .flatMap(reminder => {
      const remainingDays = computeRemainingDays(reminder.due_date, today)
      if (remainingDays >= 0) return []
      const daysOverdue = -remainingDays
      const label = REMINDER_TYPE_META[reminder.reminder_type].label
      return [{
        ruleId: 'R3' as const, priority: 3, occurredAt: reminder.due_date,
        relatedMedicationId: null, dedupeId: reminder.id,
        observation: {
          id: `Pengingat "${label.id}" sudah lewat ${daysOverdue} hari (jatuh tempo ${reminder.due_date}).`,
          zh: `「${label.zh}」提醒已逾期 ${daysOverdue} 天（到期日 ${reminder.due_date}）。`,
          en: `The "${label.en}" reminder is ${daysOverdue} day(s) overdue (due ${reminder.due_date}).`,
        },
        question: confirmQuestion({
          id: `apakah jadwal ini masih perlu diatur ulang?`,
          zh: `這項安排是否仍需要重新約定時間？`,
          en: `whether this needs to be rescheduled?`,
        }),
      }]
    })
}

// R4（P4）：醫師指示回顧，純回顧不推論「有沒有落實」（規劃文件 §6 已否決：有指示沒調藥不是證據）；
// 上限 2 筆——取視窗內最近的兩筆，而不是最舊的兩筆，讓最貼近下次回診的指示優先被看見。
function isDoctorInstructionEvent(event: TrajectoryEvent): event is TimelineTrajectoryEvent {
  return event.kind === 'doctor_instruction'
}

function buildR4Items(events: TrajectoryEvent[]): PreVisitBriefItem[] {
  const doctorInstructions = events
    .filter(isDoctorInstructionEvent)
    .sort((left, right) => dayjs(right.occurredAt).valueOf() - dayjs(left.occurredAt).valueOf())
    .slice(0, 2)

  return doctorInstructions.map(event => {
    const dateLabel = dayjs(event.occurredAt).tz(TZ).format('YYYY-MM-DD')
    const reassessOn = event.reassessOn
    return {
      ruleId: 'R4' as const, priority: 4, occurredAt: event.occurredAt,
      relatedMedicationId: null, dedupeId: event.id,
      observation: {
        id: `${dateLabel} arahan dokter: ${event.title}${event.details ? ` (${event.details})` : ''}${reassessOn ? `; evaluasi ulang pada ${reassessOn}` : ''}.`,
        zh: `${dateLabel} 醫師指示：${event.title}${event.details ? `（${event.details}）` : ''}${reassessOn ? `，預計 ${reassessOn} 重新評估` : ''}。`,
        en: `${dateLabel} doctor instruction: ${event.title}${event.details ? ` (${event.details})` : ''}${reassessOn ? `; scheduled reassessment on ${reassessOn}` : ''}.`,
      },
      question: confirmQuestion({
        id: `apakah arahan ini masih berlaku atau perlu diperbarui?`,
        zh: `這項指示是否仍然適用，或需要更新？`,
        en: `whether this instruction is still in effect or needs to be updated?`,
      }),
    }
  })
}

// R5（P1）：檢驗值超出該筆報告自己的參考值——不用全域醫療門檻，缺參考值（labRangeStatus 回傳
// 'unknown'）不產生本規則項目，只在檢驗頁本身顯示「無法分類」。第一版只做同義配對證據並列
// （issue #687：A12B↔K、A10↔GLU／HbA1c，定義於 LAB_ITEM_META.relatedMedicationGroups），
// 且刻意不重用 TRAJECTORY_DIRECTION_LABELS（R1 專用的調整方向文案）：那組文案是為了「調整前後對照」
// 設計，直接套進這裡的證據並列句可能撞上 PRE_VISIT_FORBIDDEN_PHRASES（例如「停用」包含「停」字根），
// 因此另外寫一句不含方向動詞、只講「有調整紀錄」的中性事實句。
const R5_EVIDENCE_WINDOW_MS = 14 * 24 * 60 * 60 * 1000

function findNearbyMedicationEvidence(events: TrajectoryEvent[], groups: TrajectoryMedicationGroup[], sampledAtMs: number): MedicationChangeTrajectoryEvent | null {
  if (groups.length === 0 || !Number.isFinite(sampledAtMs)) return null
  const nearby = events.filter((event): event is MedicationChangeTrajectoryEvent =>
    event.kind === 'medication_change'
    && groups.includes(event.medicationGroup)
    && Math.abs(dayjs(event.occurredAt).valueOf() - sampledAtMs) <= R5_EVIDENCE_WINDOW_MS)
  if (nearby.length === 0) return null
  // 取距離採檢時間最近的一筆調藥，最貼近的異動最有機會是照護者想核對的那一筆。
  return nearby.sort((left, right) =>
    Math.abs(dayjs(left.occurredAt).valueOf() - sampledAtMs) - Math.abs(dayjs(right.occurredAt).valueOf() - sampledAtMs))[0]
}

function buildR5Items(labResults: PatientLabResult[], events: TrajectoryEvent[]): PreVisitBriefItem[] {
  return labResults.flatMap(result => {
    const status = labRangeStatus(result)
    if (status !== 'below' && status !== 'above') return []

    const meta = LAB_ITEM_META[result.item_code]
    const sampledAtMs = dayjs(result.sampled_at).valueOf()
    const dateLabel = dayjs(result.sampled_at).tz(TZ).format('YYYY-MM-DD')
    const valueText = result.value.toFixed(meta.decimals)
    const lowText = (result.reference_low as number).toFixed(meta.decimals)
    const highText = (result.reference_high as number).toFixed(meta.decimals)
    const direction = status === 'below'
      ? { id: 'di bawah', zh: '低於', en: 'below' }
      : { id: 'di atas', zh: '高於', en: 'above' }

    const evidence = findNearbyMedicationEvidence(events, meta.relatedMedicationGroups, sampledAtMs)
    const evidenceText: LocalizedText = evidence
      ? {
        id: ` Ada juga catatan penyesuaian obat ${medicationTrilingualName(evidence.medication).id} pada periode yang sama (${dayjs(evidence.occurredAt).tz(TZ).format('YYYY-MM-DD')}).`,
        zh: `同期間（${dayjs(evidence.occurredAt).tz(TZ).format('YYYY-MM-DD')}）另有${medicationTrilingualName(evidence.medication).zh}用藥調整紀錄。`,
        en: ` A medication adjustment for ${medicationTrilingualName(evidence.medication).en} was also recorded in the same period (${dayjs(evidence.occurredAt).tz(TZ).format('YYYY-MM-DD')}).`,
      }
      : { id: '', zh: '', en: '' }

    return [{
      ruleId: 'R5' as const, priority: 1, occurredAt: result.sampled_at,
      relatedMedicationId: null, dedupeId: result.id,
      observation: {
        id: `${dateLabel} ${meta.label.id} ${valueText}${meta.unit}, ${direction.id} rentang referensi laporan ${lowText}–${highText}.${evidenceText.id}`,
        zh: `${dateLabel} ${meta.label.zh}為 ${valueText}${meta.unit}，${direction.zh}報告參考值 ${lowText}–${highText}。${evidenceText.zh}`,
        en: `${dateLabel} ${meta.label.en} was ${valueText}${meta.unit}, ${direction.en} the report's reference range of ${lowText}–${highText}.${evidenceText.en}`,
      },
      question: confirmQuestion({
        id: `apakah hasil ${meta.label.id} ini memerlukan tindak lanjut?`,
        zh: `這項${meta.label.zh}結果是否需要追蹤？`,
        en: `whether this ${meta.label.en} result needs follow-up?`,
      }),
    }]
  })
}

// R6（P5）：量測涵蓋率 < 50% 只有觀察——涵蓋率太低時，任何「對照」都不足以形成可問醫師的具體問題，
// 因此刻意不補一個空泛問題，只誠實陳述資料本身的限制。
function buildR6Items(records: BpRecord[], window: PreVisitBriefWindow): PreVisitBriefItem[] {
  const totalDays = Math.max(1, dayjs(window.end).diff(dayjs(window.start), 'day'))
  const recordedDays = summarizeEventReviewDays(records).length
  const coverage = recordedDays / totalDays
  if (coverage >= 0.5) return []
  const coveragePct = Math.round(coverage * 100)
  return [{
    ruleId: 'R6', priority: 5, occurredAt: window.end,
    relatedMedicationId: null, dedupeId: 'coverage',
    observation: {
      id: `Hanya ${recordedDays} dari ${totalDays} hari pada rentang ini memiliki catatan tekanan darah (cakupan ${coveragePct}%).`,
      zh: `此區間 ${totalDays} 天中僅有 ${recordedDays} 天有血壓量測，涵蓋率 ${coveragePct}%。`,
      en: `Only ${recordedDays} of ${totalDays} days in this period have blood pressure measurements (${coveragePct}% coverage).`,
    },
    question: null,
  }]
}

// 排名：priority 升冪 → 時間降冪 → 去重 → 取 3（規劃文件 §5.2）。去重鍵只對非 null 的
// relatedMedicationId 生效；其餘一律用 `${ruleId}:${dedupeId}`，避免不相關的項目因同為 null 被誤併。
export function rankPreVisitQuestions(items: PreVisitBriefItem[]): PreVisitBriefItem[] {
  const sorted = [...items].sort((left, right) => {
    if (left.priority !== right.priority) return left.priority - right.priority
    return dayjs(right.occurredAt).valueOf() - dayjs(left.occurredAt).valueOf()
  })

  const seenKeys = new Set<string>()
  const deduped: PreVisitBriefItem[] = []
  for (const item of sorted) {
    const key = item.relatedMedicationId != null ? `med:${item.relatedMedicationId}` : `${item.ruleId}:${item.dedupeId}`
    if (seenKeys.has(key)) continue
    seenKeys.add(key)
    deduped.push(item)
    if (deduped.length >= 3) break
  }
  return deduped
}

export function buildPreVisitBrief(records: BpRecord[], events: TrajectoryEvent[], window: PreVisitBriefWindow, opts: BuildPreVisitBriefOptions): PreVisitBriefItem[] {
  const today = opts.today ?? calendarDateKey()
  const candidates: PreVisitBriefItem[] = []

  // 離線／讀取失敗時，來源狀態會是 unavailable（見 preVisitSources.ts）；R1–R4 各自依賴的來源
  // 讀不到就不跑對應規則，避免把「讀不到」誤當成「這段期間真的沒有異動」而漏問。R6 只依賴
  // records（血壓報告本身，離線時仍可能有快取），刻意不受這三個來源狀態影響。
  if (opts.sourceStatus.medicationChanges !== 'unavailable') {
    candidates.push(...buildR1Items(events, opts.baselineRecords, window.end, opts.standardResolver))
  }
  if (opts.sourceStatus.dueReminders !== 'unavailable') {
    candidates.push(...buildR2Items(opts.dueReminders, today))
    candidates.push(...buildR3Items(opts.dueReminders, today))
  }
  if (opts.sourceStatus.timelineEntries !== 'unavailable') {
    candidates.push(...buildR4Items(events))
  }
  // labResults 的 sourceStatus 選填：既有呼叫端沒有補上時視同「可用」，反正 opts.labResults 預設
  // 也是空陣列，不會生出任何 R5 項目；有補上且明確標成 unavailable 時才略過本規則。
  if (opts.sourceStatus.labResults !== 'unavailable') {
    candidates.push(...buildR5Items(opts.labResults ?? [], events))
  }
  candidates.push(...buildR6Items(records, window))

  return rankPreVisitQuestions(candidates)
}
