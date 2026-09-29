/*
檔案用途：軌跡頁合併時間軸清單——依篩選顯示調藥、看診、醫師指示、一般事件、到期提醒，並穿插血壓週摘要列。
所在層：src/features/care-family/components/trajectory；純呈現＋輕量本地篩選／展開狀態，
新增／編輯／刪除邏輯來自 editor（useTrajectoryEntryEditor），血壓與合併後的事件清單由呼叫端傳入。
主要關聯：src/lib/medicalTrajectory.ts 的 buildCareTrajectoryFeed、src/lib/bpWeeklySummary.ts、
TrajectoryFilterChips、TrajectoryEventPhotos、TrajectoryEventReview；拆分自原 CareTimeline.tsx 的
TimelineEntry（issue #735，#659 D 期：拆表單與清單、合併調藥與週摘要）。
*/
import { useMemo, useState } from 'react'
import dayjs from 'dayjs'
import timezone from 'dayjs/plugin/timezone'
import { useI18n, type LocalizedText } from '../../../../lib/i18n'
import { TZ } from '../../../../lib/timezone'
import { TRAJECTORY_DIRECTION_LABELS, type TrajectoryEvent } from '../../../../lib/medicalTrajectory'
import type { WeeklyBpSummary } from '../../../../lib/bpWeeklySummary'
import { careTimelineEventText } from '../../../../lib/careTimeline'
import { REMINDER_TYPE_META } from '../../../../lib/careDueReminders'
import { resolveMedicationCategory } from '../../../../lib/medication/medicationAtcCategories'
import { formatDoseAmountLocalized, formatMedicationDisplayName } from '../../../../lib/medication/medications'
import { medicationSlotText } from '../../../../lib/medication/medicationSchedule'
import { VitalReading } from '../../../vitals/components/VitalReading'
import { normalizeCareEventPhotoPaths } from '../../../../lib/careEventPhotos'
import { TrajectoryFilterChips, type TrajectoryFilter } from './TrajectoryFilterChips'
import { TrajectoryEventPhotos } from './TrajectoryEventPhotos'
import { TrajectoryClosestReadings, TrajectoryEventReview } from './TrajectoryEventReview'
import type { BpRecord, CareEventPhotoAttachment } from '../../../../types/database'
import type { useTrajectoryEntryEditor } from '../../hooks/useTrajectoryEntryEditor'

dayjs.extend(timezone)

type Row =
  | { type: 'event'; event: TrajectoryEvent; key: string; sortAt: number }
  | { type: 'weeklyBp'; summary: WeeklyBpSummary; key: string; sortAt: number }

function classify(event: TrajectoryEvent): Exclude<TrajectoryFilter, 'all'> {
  if (event.kind === 'medication_change') return 'medication_change'
  if (event.kind === 'due_reminder') return 'due_reminder'
  if (event.kind === 'health_visit') return 'health_visit'
  if (event.kind === 'doctor_instruction') return 'doctor_instruction'
  return 'event'
}

const AS_NEEDED_TEXT: LocalizedText = { id: 'Bila perlu', zh: '需要時服用', en: 'As needed' }
const OVERDUE_REMINDER_BADGE: LocalizedText = { id: 'Pengingat terlambat', zh: '逾期提醒', en: 'Overdue reminder' }
const EMPTY_TEXT: LocalizedText = { id: 'Belum ada riwayat pada filter ini.', zh: '這個篩選條件下還沒有紀錄。', en: 'No records yet under this filter.' }
const REVIEW_TOGGLE_TEXT = { open: { id: 'Lihat pembacaan lengkap', zh: '查看完整量測', en: 'View Full Measurement' }, close: { id: 'Tutup pembacaan lengkap', zh: '收起完整量測', en: 'Collapse full measurement' } }
const BP_UNAVAILABLE_NOTICE: LocalizedText = { id: 'Rata-rata tekanan darah mingguan belum dapat dibaca.', zh: '血壓週平均暫時無法讀取。', en: 'The weekly blood pressure average could not be read right now.' }

export function TrajectoryEventList({ events, weeklyBp, bpRecords, bpUnavailable, patientId, editor }: {
  events: TrajectoryEvent[]
  weeklyBp: WeeklyBpSummary[]
  bpRecords: BpRecord[]
  bpUnavailable: boolean
  patientId: string
  editor: ReturnType<typeof useTrajectoryEntryEditor>
}) {
  const { text } = useI18n()
  const [filter, setFilter] = useState<TrajectoryFilter>('all')
  const [reviewOpenKey, setReviewOpenKey] = useState<string | null>(null)

  const filteredEvents = filter === 'all' ? events : events.filter(event => classify(event) === filter)
  // 血壓週摘要只在「全部」視圖下當情境列穿插進時間軸；篩選到特定型別時只看那個型別本身，
  // 避免「調藥」篩選結果裡混進跟調藥無關的血壓平均列（型別篩選 chip 沒有獨立的「血壓」選項）。
  const rows: Row[] = useMemo(() => {
    const eventRows: Row[] = filteredEvents.map(event => ({ type: 'event', event, key: `event-${event.kind}-${event.id}`, sortAt: new Date(event.occurredAt).getTime() }))
    const weeklyRows: Row[] = filter === 'all' ? weeklyBp.map(summary => ({ type: 'weeklyBp', summary, key: `weekly-bp-${summary.weekStart}`, sortAt: dayjs.tz(summary.weekEnd, TZ).endOf('day').valueOf() })) : []
    return [...eventRows, ...weeklyRows].sort((left, right) => right.sortAt - left.sortAt)
  }, [filteredEvents, weeklyBp, filter])

  return <div>
    <TrajectoryFilterChips active={filter} onSelect={setFilter} />
    {/* 血壓讀不到時週摘要列會直接消失；這裡明講「無法讀取」，避免看起來像「這段期間血壓沒有異動」。 */}
    {bpUnavailable && filter === 'all' && <p role="alert" className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900">{text(BP_UNAVAILABLE_NOTICE)}</p>}
    <ol className="mt-3 space-y-3">
      {rows.length === 0 && <li className="text-sm text-slate-500">{text(EMPTY_TEXT)}</li>}
      {rows.map(row => row.type === 'weeklyBp'
        ? <WeeklyBpRow key={row.key} summary={row.summary} />
        : <TrajectoryEventRow
            key={row.key}
            event={row.event}
            bpRecords={bpRecords}
            bpUnavailable={bpUnavailable}
            patientId={patientId}
            editor={editor}
            reviewOpen={reviewOpenKey === row.key}
            onToggleReview={() => setReviewOpenKey(current => current === row.key ? null : row.key)}
          />)}
    </ol>
  </div>
}

// 兩個列元件匯出出去，讓單元測試能用 element type 比對合成後的列（見 trajectoryEventListRender.test.ts）；
// 淺層測試 harness 不會遞迴執行巢狀自訂元件，因此無法靠 textContent 直接看到清單內文（沿用
// TrajectorySection 既有慣例的替代做法：這裡改成用 element 參照比對，而不是把整棵渲染樹攤平）。
export function WeeklyBpRow({ summary }: { summary: WeeklyBpSummary }) {
  const { text } = useI18n()
  return <li className="border-l-4 border-slate-300 pl-3">
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1"><span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-700">{text({ id: 'Rata-rata tekanan darah mingguan', zh: '血壓週平均', en: 'Weekly blood pressure average' })}</span><time className="text-xs text-slate-500">{summary.weekStart} – {summary.weekEnd}</time></div>
    <p className="mt-1 flex flex-wrap items-center gap-x-2 text-sm text-slate-700"><VitalReading systolic={summary.avgSystolic} diastolic={summary.avgDiastolic} pulse={summary.avgPulse} valueClassName="font-black" /><span className="text-xs text-slate-500">{text({ id: `${summary.recordCount} pembacaan`, zh: `${summary.recordCount} 筆量測`, en: `${summary.recordCount} readings` })}</span></p>
  </li>
}

export function TrajectoryEventRow({ event, bpRecords, bpUnavailable, patientId, editor, reviewOpen, onToggleReview }: {
  event: TrajectoryEvent
  bpRecords: BpRecord[]
  bpUnavailable: boolean
  patientId: string
  editor: ReturnType<typeof useTrajectoryEntryEditor>
  reviewOpen: boolean
  onToggleReview: () => void
}) {
  const { text, locale } = useI18n()

  if (event.kind === 'medication_change') {
    const medicationName = formatMedicationDisplayName(event.medication, locale)
    const categoryLabel = resolveMedicationCategory(event.medication.atc_code)
    const doseText = event.doseAmount != null ? formatDoseAmountLocalized(event.doseAmount, event.dosageForm || 'tablet', locale) : null
    const slotLabel = event.scheduleSlot ? text(medicationSlotText(event.scheduleSlot)) : null
    return <li className="border-l-4 border-indigo-300 pl-3">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1"><span className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-bold text-indigo-800">{text(TRAJECTORY_DIRECTION_LABELS[event.direction])}</span><time className="text-xs text-slate-500">{dayjs(event.occurredAt).tz(TZ).format('YYYY/MM/DD')}</time></div>
      <h3 className="mt-1 font-bold text-slate-900">{medicationName}</h3>
      <p className="mt-1 text-sm text-slate-700">{[categoryLabel ? text(categoryLabel) : null, slotLabel, doseText, event.asNeeded ? text(AS_NEEDED_TEXT) : null].filter(Boolean).join(' · ')}</p>
      {event.reason && <p className="mt-1 text-sm italic text-slate-600">{event.reason}</p>}
      <TrajectoryClosestReadings records={bpRecords} occurredAt={event.occurredAt} unavailable={bpUnavailable} />
      <ReviewToggle open={reviewOpen} onToggle={onToggleReview} />
      {reviewOpen && <TrajectoryEventReview patientId={patientId} occurredAt={event.occurredAt} />}
    </li>
  }

  if (event.kind === 'due_reminder') {
    const reminderMeta = REMINDER_TYPE_META[event.reminderType]
    return <li className="border-l-4 border-amber-300 pl-3">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1"><span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-bold text-amber-800">{text(OVERDUE_REMINDER_BADGE)}</span><time className="text-xs text-slate-500">{dayjs(event.occurredAt).tz(TZ).format('YYYY/MM/DD')}</time></div>
      <h3 className="mt-1 font-bold text-slate-900">{text(reminderMeta.label)}</h3>
      <p className="mt-1 text-sm text-slate-700">{text({ id: `Terlambat ${event.daysOverdue} hari`, zh: `逾期 ${event.daysOverdue} 天`, en: `${event.daysOverdue} day(s) overdue` })}</p>
    </li>
  }

  const entry = event.sourceEntry
  // 理論上一定存在：軌跡頁的資料來源（buildCareTrajectoryFeed）一律由 toTimelineEvent 附帶完整原始 entry；
  // 型別上設為選填只是為了不強迫報告端與既有測試 fixture 一起補這個欄位，這裡防禦性略過而不是拋錯。
  if (!entry) return null
  const isFamilyObservation = entry.event_type === 'family_observation'
  const isProtected = Boolean(entry.medication_plan_change_log_id) || entry.event_type === 'medication_change'
  const demoPhotos: CareEventPhotoAttachment[] = (entry.demo_photo_urls ?? []).map(url => ({ path: url, thumbnail_path: url, thumbnailUrl: url }))
  const photos = demoPhotos.length > 0 ? demoPhotos : normalizeCareEventPhotoPaths(entry.photo_paths, true)

  return <li className={`border-l-4 pl-3 ${isFamilyObservation ? 'border-family-300' : 'border-indigo-300'}`}>
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1"><span className={`rounded-full px-2 py-0.5 text-xs font-bold ${isFamilyObservation ? 'bg-family-50 text-family-800' : 'bg-indigo-50 text-indigo-800'}`}>{text(careTimelineEventText[entry.event_type])}</span><time className="text-xs text-slate-500">{dayjs(entry.occurred_at).tz(TZ).format('YYYY/MM/DD HH:mm')}</time></div>
    <h3 className="mt-1 font-bold text-slate-900">{entry.title}</h3>
    {entry.details && <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{entry.details}</p>}
    {entry.reassess_on && <p className="mt-1 text-xs font-semibold text-amber-800">{text({ id: `Evaluasi lagi: ${entry.reassess_on}`, zh: `下次評估：${entry.reassess_on}`, en: `Reassess on: ${entry.reassess_on}` })}</p>}
    {photos.length > 0 && <TrajectoryEventPhotos photos={photos} isDemo={demoPhotos.length > 0} />}
    <TrajectoryClosestReadings records={bpRecords} occurredAt={entry.occurred_at} unavailable={bpUnavailable} />
    {!isProtected && <div className="mt-2 flex flex-wrap gap-2">
      <button type="button" disabled={editor.saving} onClick={() => editor.beginEdit(entry)} className="min-h-11 rounded-lg border border-indigo-200 bg-white px-3 py-1.5 text-xs font-bold text-indigo-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2">{text({ id: 'Ubah', zh: '修改', en: 'Edit' })}</button>
      <button type="button" disabled={editor.saving} onClick={() => editor.remove(entry)} className="min-h-11 rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-bold text-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2">{text({ id: 'Hapus', zh: '刪除', en: 'Delete' })}</button>
    </div>}
    <ReviewToggle open={reviewOpen} onToggle={onToggleReview} />
    {reviewOpen && <TrajectoryEventReview patientId={patientId} occurredAt={entry.occurred_at} />}
  </li>
}

function ReviewToggle({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  const { text } = useI18n()
  return <button type="button" aria-expanded={open} onClick={onToggle} className="mt-2 min-h-11 rounded-lg border border-indigo-200 bg-white px-3 py-1.5 text-xs font-bold text-indigo-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2">{text(open ? REVIEW_TOGGLE_TEXT.close : REVIEW_TOGGLE_TEXT.open)}</button>
}
