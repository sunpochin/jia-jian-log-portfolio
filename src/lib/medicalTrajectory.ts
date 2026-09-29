/*
檔案用途：合併調藥紀錄、照護時間線事件與到期提醒為單一時間序「醫療軌跡」清單，供醫師報告與 GPT 匯出使用。
所在層：src/lib 純函式業務邏輯層；只接受呼叫端已查好的資料做合併、去重與排序，不連線 Supabase。
主要關聯：由 src/lib/preVisitSources.ts 組裝輸入、src/features/vitals/hooks/usePreVisitSources.ts 呼叫、
TrajectorySection.tsx 呈現，並供 recordReport.ts 的 buildGptReportText 擴充段落使用（issue #684，S1）。
*/
import type { LocalizedText } from './i18n'
import type { MedicationCatalog, MedicationPlanSnapshot } from '../types/database'
import type { MedicationPlanChangeLogView } from './medication/medications'
import type { CareTimelineEntry, CareTimelineEventType } from './careTimeline'
import { eventReviewWindow } from './careTimeline'
import type { CareDueReminder, ReminderType } from './careDueReminders'
import { classifyReminderDueLevel, computeRemainingDays } from './careDueReminders'
import { calendarDateKey } from './careDay'

export type TrajectoryMedicationDirection = 'start' | 'stop' | 'dose_up' | 'dose_down' | 'schedule_change' | 'other'

export const TRAJECTORY_DIRECTION_LABELS: Record<TrajectoryMedicationDirection, LocalizedText> = {
  start: { id: 'Obat baru dimulai', zh: '新增用藥', en: 'Medication started' },
  stop: { id: 'Obat dihentikan', zh: '停用藥物', en: 'Medication stopped' },
  dose_up: { id: 'Dosis dinaikkan', zh: '劑量調高', en: 'Dose increased' },
  dose_down: { id: 'Dosis diturunkan', zh: '劑量調降', en: 'Dose decreased' },
  schedule_change: { id: 'Jadwal/cara minum diubah', zh: '服藥時段調整', en: 'Schedule changed' },
  other: { id: 'Daftar obat diperbarui', zh: '藥單調整', en: 'Medication plan updated' },
}

// R1（S2 的規則引擎）需要依 ATC 前綴知道這筆調藥屬於哪一類慢性病用藥，才能決定要不要比對哪組生理數值；
// 這裡只負責分類貼標籤，不做任何解讀、比對或建議——判斷邏輯屬於 S2 範圍，本票（S1）純描述。
export type TrajectoryMedicationGroup = 'blood_pressure' | 'diuretic' | 'potassium' | 'diabetes' | 'anticoagulant' | 'other'

const MEDICATION_GROUP_PREFIXES: Array<{ group: TrajectoryMedicationGroup; prefixes: string[] }> = [
  { group: 'blood_pressure', prefixes: ['C02', 'C07', 'C08', 'C09'] },
  { group: 'diuretic', prefixes: ['C03'] },
  { group: 'potassium', prefixes: ['A12B'] },
  { group: 'diabetes', prefixes: ['A10'] },
  { group: 'anticoagulant', prefixes: ['B01A'] },
]

export function resolveTrajectoryMedicationGroup(atcCode: string | null | undefined): TrajectoryMedicationGroup {
  const code = atcCode?.trim().toUpperCase()
  if (!code) return 'other'
  const match = MEDICATION_GROUP_PREFIXES.find(entry => entry.prefixes.some(prefix => code.startsWith(prefix)))
  return match?.group ?? 'other'
}

function snapshotTotalDose(snapshot: Partial<MedicationPlanSnapshot>): number | null {
  if (snapshot.dose_amount == null || snapshot.dose_count == null) return null
  return snapshot.dose_amount * snapshot.dose_count
}

// 為什麼比較「總量」（單次劑量 × 次數）而非只比 dose_amount：鉀離子等藥物常見「每次固定顆數，
// 改成一天吃兩次」的調整方式，只看 dose_amount 會把這種實質加量誤判成 other。
export function classifyMedicationChangeDirection(log: Pick<MedicationPlanChangeLogView, 'action' | 'before_snapshot' | 'after_snapshot'>): TrajectoryMedicationDirection {
  if (log.action === 'create') return 'start'
  if (log.action === 'deactivate') return 'stop'
  const beforeTotal = snapshotTotalDose(log.before_snapshot)
  const afterTotal = snapshotTotalDose(log.after_snapshot)
  if (beforeTotal != null && afterTotal != null && beforeTotal !== afterTotal) {
    return afterTotal > beforeTotal ? 'dose_up' : 'dose_down'
  }
  if (log.before_snapshot.schedule_slot !== log.after_snapshot.schedule_slot || log.before_snapshot.as_needed !== log.after_snapshot.as_needed) {
    return 'schedule_change'
  }
  return 'other'
}

export interface MedicationChangeTrajectoryEvent {
  id: string
  occurredAt: string
  kind: 'medication_change'
  direction: TrajectoryMedicationDirection
  medicationGroup: TrajectoryMedicationGroup
  medication: MedicationCatalog
  scheduleSlot: string | null
  doseAmount: number | null
  doseCount: number | null
  dosageForm: string | null
  asNeeded: boolean | null
  reason: string | null
}

const TIMELINE_TRAJECTORY_EVENT_TYPES = ['health_visit', 'doctor_instruction', 'incident', 'reassessment'] as const

// 醫師報告（buildMedicalTrajectory）只印上面四種臨床相關類型；軌跡頁（buildCareTrajectoryFeed，#735）
// 是既有「事件」tab 的直接替代，必須承接 CareTimeline 原本支援的全部十種類型（包含家屬觀察、疫苗、飲食變更等），
// 否則照護者原本記錄好的事件會在改版後從主要入口消失。因此 kind 欄位型別沿用完整的 CareTimelineEventType，
// 實際跑出來的值仍由各自的 build 函式各自收斂（見下方 toTimelineEvent 呼叫端）。
export type TimelineTrajectoryEventType = CareTimelineEventType

export interface TimelineTrajectoryEvent {
  id: string
  occurredAt: string
  kind: TimelineTrajectoryEventType
  title: string
  details: string
  reassessOn: string | null
  // 只有軌跡頁（buildCareTrajectoryFeed）需要完整原始 entry 來顯示照片與支援編輯／刪除；
  // 醫師報告（buildMedicalTrajectory）與既有測試 fixture 不需要，因此設為選填而不強制每個呼叫端補上。
  sourceEntry?: CareTimelineEntry
}

export interface DueReminderTrajectoryEvent {
  id: string
  // 到期提醒沒有「發生時間」，借用到期日把它排進同一條時間軸，跟調藥、看診事件依時間交錯呈現。
  occurredAt: string
  kind: 'due_reminder'
  reminderType: ReminderType
  daysOverdue: number
}

export type TrajectoryEvent = MedicationChangeTrajectoryEvent | TimelineTrajectoryEvent | DueReminderTrajectoryEvent

function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart <= bEnd && bStart <= aEnd
}

function toMedicationChangeEvent(log: MedicationPlanChangeLogView): MedicationChangeTrajectoryEvent {
  // 停用只留得下「停用前」的處方內容可看；新增／調整則看調整後的結果——跟 CareTimeline 對同一份
  // snapshot 的取法一致（src/features/care-family/components/CareTimeline.tsx 的 TimelineEntry）。
  const snapshot = log.action === 'deactivate' ? log.before_snapshot : log.after_snapshot
  // 品名優先讀 snapshot：原本的 MedicationHistory（已併入軌跡頁）就是為了同一個理由才優先讀
  // snapshot 的品名——藥品目錄之後若改名，舊的調藥事件不能被悄悄改標成新名字，讓照護者誤以為
  // 藥名一直是現在這個（Codex review, PR #747）。snapshot 沒有值時才退回目前目錄的品名。
  const medication: MedicationCatalog = {
    ...log.medication,
    brand_name: snapshot.brand_name ?? log.medication.brand_name,
    brand_name_zh: snapshot.brand_name_zh ?? log.medication.brand_name_zh,
  }
  return {
    id: log.id,
    // 用 effective_at 而不是 recorded_at：時間線投影列的 occurred_at 本來就是寫入 effective_at
    // （見 supabase/migrations/20260812010000_reliable_medication_timeline_events.sql 的
    // apply_medication_plan_change），沿用同一個時間才能讓兩個資料來源在時間軸上對得起來。
    occurredAt: log.effective_at,
    kind: 'medication_change',
    direction: classifyMedicationChangeDirection(log),
    medicationGroup: resolveTrajectoryMedicationGroup(log.medication.atc_code),
    medication,
    scheduleSlot: snapshot.schedule_slot ?? null,
    doseAmount: snapshot.dose_amount ?? null,
    doseCount: snapshot.dose_count ?? null,
    dosageForm: snapshot.dosage_form ?? null,
    asNeeded: snapshot.as_needed ?? null,
    reason: log.reason,
  }
}

function toTimelineEvent(entry: CareTimelineEntry): TimelineTrajectoryEvent {
  return {
    id: entry.id,
    occurredAt: entry.occurred_at,
    kind: entry.event_type as TimelineTrajectoryEventType,
    title: entry.title,
    details: entry.details,
    reassessOn: entry.reassess_on,
    sourceEntry: entry,
  }
}

function toDueReminderEvent(reminder: CareDueReminder, daysOverdue: number): DueReminderTrajectoryEvent {
  return {
    id: reminder.id,
    occurredAt: reminder.due_date,
    kind: 'due_reminder',
    reminderType: reminder.reminder_type,
    daysOverdue,
  }
}

export interface BuildMedicalTrajectoryInput {
  changeLogs: MedicationPlanChangeLogView[]
  timelineEntries: CareTimelineEntry[]
  dueReminders: CareDueReminder[]
  windowStart: string
  windowEnd: string
  today?: string
}

// 為什麼調藥要另外用 ±7 天事件回顧窗判斷是否落在報告區間，而不是直接比對 occurred_at 是否落在
// [windowStart, windowEnd] 之間：驗收條件要求「視窗起點前 7 天」的調藥也要出現在報告裡，因為 S2 的
// 基線比對本來就需要看事件前後 7 天的量測——調藥本身雖然早於報告區間開始，仍可能是這段期間血壓
// 持續受影響的原因，對醫師版報告仍是有意義的脈絡（規劃文件 §5.1，Codex review PR #689）。
export function buildMedicalTrajectory(input: BuildMedicalTrajectoryInput): TrajectoryEvent[] {
  const windowStartMs = new Date(input.windowStart).getTime()
  const windowEndMs = new Date(input.windowEnd).getTime()

  const medicationEvents = input.changeLogs
    .filter(log => {
      const review = eventReviewWindow(log.effective_at, 7)
      return overlaps(new Date(review.start).getTime(), new Date(review.end).getTime(), windowStartMs, windowEndMs)
    })
    .map(toMedicationChangeEvent)

  const timelineEvents = input.timelineEntries
    // 調藥的唯一正典來源是 medication_plan_change_logs；時間線裡帶 medication_plan_change_log_id
    // 的列只是同一事件的 1:1 顯示投影，上面的 changeLogs 已經產生過一次，混進來會讓同一次調藥
    // 重複出現兩筆，R1（S2）也會因此吃到重複調藥（Codex review PR #689）。
    .filter(entry => entry.medication_plan_change_log_id == null)
    .filter(entry => (TIMELINE_TRAJECTORY_EVENT_TYPES as readonly string[]).includes(entry.event_type))
    .filter(entry => {
      const occurred = new Date(entry.occurred_at).getTime()
      return Number.isFinite(occurred) && occurred >= windowStartMs && occurred <= windowEndMs
    })
    .map(toTimelineEvent)

  const today = input.today ?? calendarDateKey()
  const reminderEvents = input.dueReminders
    .filter(reminder => reminder.status === 'active')
    // 到期提醒要「這段期間到期，且現在仍逾期」才算數；到期日落在報告區間之外的提醒不算這次報告要交代的事，
    // 單純逾期但到期日很久以前就過的舊提醒，屬於「現在的待辦」而非「這段期間發生的事」，不混進本次時間軸。
    .filter(reminder => {
      const due = new Date(reminder.due_date).getTime()
      return Number.isFinite(due) && due >= windowStartMs && due <= windowEndMs
    })
    .flatMap(reminder => {
      const remainingDays = computeRemainingDays(reminder.due_date, today)
      if (classifyReminderDueLevel(remainingDays, reminder.threshold_days) !== 'overdue') return []
      return [toDueReminderEvent(reminder, -remainingDays)]
    })

  return [...medicationEvents, ...timelineEvents, ...reminderEvents]
    .sort((left, right) => new Date(left.occurredAt).getTime() - new Date(right.occurredAt).getTime())
}

export interface BuildCareTrajectoryFeedInput {
  changeLogs: MedicationPlanChangeLogView[]
  timelineEntries: CareTimelineEntry[]
  dueReminders: CareDueReminder[]
  today?: string
}

// 軌跡頁（issue #735）是既有「事件」tab 與「變更藥物」子頁的直接替代，不是醫師報告的另一份拷貝，
// 因此跟 buildMedicalTrajectory 刻意不同：不限定報告視窗（呼叫端自行決定要查多少筆／多久），
// 也不把時間線事件收斂成四種臨床類型——只沿用「同一次調藥不重複顯示」與「到期提醒只顯示目前仍逾期者」
// 這兩條規則本身，其餘全部類型（家屬觀察、疫苗、飲食變更…）原樣保留，維持照護者原本記得住的入口。
export function buildCareTrajectoryFeed(input: BuildCareTrajectoryFeedInput): TrajectoryEvent[] {
  const medicationEvents = input.changeLogs.map(toMedicationChangeEvent)

  const timelineEvents = input.timelineEntries
    // 同一份「同一次調藥不重複顯示」規則：時間線裡帶 medication_plan_change_log_id 的列只是
    // change log 的 1:1 投影，上面的 changeLogs 已經產生過一次。
    .filter(entry => entry.medication_plan_change_log_id == null)
    // 'medication_change' 是保留給系統事件的 kind，代表 MedicationChangeTrajectoryEvent（帶 medication／direction
    // 等欄位）；即使資料本身不完整（例如漏掉 medication_plan_change_log_id 的手動筆記，見 demo 種子資料的
    // 修正），也不能把一般 TimelineTrajectoryEvent 標成這個 kind，否則畫面會以為它有 .medication 而壞掉。
    .filter(entry => entry.event_type !== 'medication_change')
    .map(toTimelineEvent)

  const today = input.today ?? calendarDateKey()
  const reminderEvents = input.dueReminders
    .filter(reminder => reminder.status === 'active')
    .flatMap(reminder => {
      const remainingDays = computeRemainingDays(reminder.due_date, today)
      if (classifyReminderDueLevel(remainingDays, reminder.threshold_days) !== 'overdue') return []
      return [toDueReminderEvent(reminder, -remainingDays)]
    })

  // 軌跡頁是「最近發生了什麼」的紀錄檢視，由新到舊排序才符合照護者滑手機回顧的習慣；
  // 跟 buildMedicalTrajectory 給醫師報告用的由舊到新敘事排序刻意相反。
  return [...medicationEvents, ...timelineEvents, ...reminderEvents]
    .sort((left, right) => new Date(right.occurredAt).getTime() - new Date(left.occurredAt).getTime())
}
