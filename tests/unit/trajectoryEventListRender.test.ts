/*
檔案用途：驗證軌跡頁合併清單的排序、血壓週摘要穿插與型別篩選邏輯。淺層 hook 測試 harness 不會遞迴執行
巢狀自訂元件，因此改用 element 參照（WeeklyBpRow／TrajectoryEventRow）比對合成後的列，而不是深比對文字；
各列內部的呈現內容已由既有的 trajectorySectionRender.test.ts 覆蓋同一套 renderer 慣例。
所在層：tests/unit。
主要關聯：src/features/care-family/components/trajectory/TrajectoryEventList.tsx、
TrajectoryFilterChips.tsx、src/lib/medicalTrajectory.ts、src/lib/bpWeeklySummary.ts（issue #735，#659 D 期）。
*/
import { describe, expect, test } from 'bun:test'
import { installReactHookHarness, renderHook } from './helpers/reactHookHarness'
import { findAll, textContent } from './helpers/elementTree'
import type { DueReminderTrajectoryEvent, MedicationChangeTrajectoryEvent, TimelineTrajectoryEvent, TrajectoryEvent } from '../../src/lib/medicalTrajectory'
import type { WeeklyBpSummary } from '../../src/lib/bpWeeklySummary'
import type { CareTimelineEntry } from '../../src/lib/careTimeline'
import type { MedicationCatalog } from '../../src/types/database'
import type { useTrajectoryEntryEditor } from '../../src/features/care-family/hooks/useTrajectoryEntryEditor'

installReactHookHarness()

const LOCALE_CONTEXT_VALUE = { locale: 'zh' as const, setLocale: () => {} }

const { TrajectoryEventList, TrajectoryEventRow, WeeklyBpRow } = await import('../../src/features/care-family/components/trajectory/TrajectoryEventList')
const { TrajectoryFilterChips } = await import('../../src/features/care-family/components/trajectory/TrajectoryFilterChips')

function fakeEditor(): ReturnType<typeof useTrajectoryEntryEditor> {
  return {
    expanded: false, setExpanded: () => {}, saving: false, message: '',
    eventType: 'family_observation', setEventType: () => {},
    title: '', setTitle: () => {}, details: '', setDetails: () => {},
    occurredAt: '', setOccurredAt: () => {}, reassessOn: '', setReassessOn: () => {},
    editingEntry: null, photoFiles: [], existingPhotoCount: 0,
    cameraPhotoInputRef: { current: null }, libraryPhotoInputRef: { current: null },
    selectPhotoFiles: () => {}, removeSelectedPhoto: () => {},
    save: async () => {}, beginEdit: () => {}, cancelEdit: () => {}, remove: async () => {},
    photoUploadEnabled: true,
  }
}

const medication: MedicationCatalog = {
  id: 'med-1', drug_product_id: null, brand_name: 'Amdixal', brand_name_zh: '脈優', generic_name: 'Amlodipine',
  strength_mg: 5, dosage_form: 'tablet', specialties: [], verification_status: 'unverified',
  tfda_license_number: null, nhi_drug_code: null, appearance_note: null, appearance_color: null,
  appearance_shape: null, appearance_photo_url: null, atc_code: 'C09AA05',
}

const medicationEvent: MedicationChangeTrajectoryEvent = {
  id: 'log-1', occurredAt: '2026-07-10T00:00:00.000Z', kind: 'medication_change', direction: 'dose_up',
  medicationGroup: 'blood_pressure', medication, scheduleSlot: 'morning', doseAmount: 2, doseCount: 1,
  dosageForm: 'tablet', asNeeded: false, reason: null,
}

const visitEntry: CareTimelineEntry = {
  id: 'visit-1', patient_id: 'patient-1', event_type: 'health_visit', title: '心臟科回診', details: '',
  occurred_at: '2026-07-15T00:00:00.000Z', reassess_on: null, created_by: 'caregiver@example.com', created_at: '2026-07-15T00:00:00.000Z', medication_plan_id: null,
}
const visitEvent: TimelineTrajectoryEvent = { id: 'visit-1', occurredAt: '2026-07-15T00:00:00.000Z', kind: 'health_visit', title: visitEntry.title, details: '', reassessOn: null, sourceEntry: visitEntry }

const reminderEvent: DueReminderTrajectoryEvent = { id: 'reminder-1', occurredAt: '2026-07-01', kind: 'due_reminder', reminderType: 'medication_refill', daysOverdue: 5 }

const weeklyBp: WeeklyBpSummary[] = [{ weekStart: '2026-07-06', weekEnd: '2026-07-12', avgSystolic: 120, avgDiastolic: 80, avgPulse: 70, recordCount: 4 }]

const events: TrajectoryEvent[] = [medicationEvent, visitEvent, reminderEvent]

function render(activeEvents: TrajectoryEvent[] = events, activeWeeklyBp: WeeklyBpSummary[] = weeklyBp) {
  return renderHook(() => TrajectoryEventList({ events: activeEvents, weeklyBp: activeWeeklyBp, bpRecords: [], patientId: 'patient-1', editor: fakeEditor() }), { defaultContext: LOCALE_CONTEXT_VALUE })
}

describe('TrajectoryEventList', () => {
  test('merges events and the weekly BP summary into one newest-first timeline', () => {
    const view = render()
    const rows = findAll(view.current, element => element.type === TrajectoryEventRow || element.type === WeeklyBpRow)
    const identities = rows.map(row => row.type === WeeklyBpRow
      ? `weekly-${(row.props as { summary: WeeklyBpSummary }).summary.weekStart}`
      : `event-${(row.props as { event: TrajectoryEvent }).event.id}`)
    // 由新到舊：看診（07-15）→ 血壓週摘要（週末 07-12）→ 調藥（07-10）→ 到期提醒（07-01）。
    expect(identities).toEqual(['event-visit-1', 'weekly-2026-07-06', 'event-log-1', 'event-reminder-1'])
    view.unmount()
  })

  test('filtering to a single type hides the weekly BP summary row too', () => {
    const view = render()
    const chips = findAll(view.current, element => element.type === TrajectoryFilterChips)[0]
    const onSelect = (chips.props as { onSelect: (filter: string) => void }).onSelect
    view.act(() => onSelect('medication_change'))

    const rows = findAll(view.current, element => element.type === TrajectoryEventRow || element.type === WeeklyBpRow)
    expect(rows).toHaveLength(1)
    expect(rows[0].type).toBe(TrajectoryEventRow)
    expect((rows[0].props as { event: TrajectoryEvent }).event.id).toBe('log-1')
    view.unmount()
  })

  test('shows the empty-state message when a filter matches nothing', () => {
    const view = render([medicationEvent], [])
    const chips = findAll(view.current, element => element.type === TrajectoryFilterChips)[0]
    const onSelect = (chips.props as { onSelect: (filter: string) => void }).onSelect
    view.act(() => onSelect('doctor_instruction'))

    expect(textContent(view.current)).toContain('這個篩選條件下還沒有紀錄。')
    view.unmount()
  })
})
