/*
檔案用途：驗證近期醫療軌跡區塊在各種來源狀態與事件種類下的呈現內容。
所在層：tests/unit；以最小 hook 執行環境呼叫元件函式，不啟動瀏覽器。
主要關聯：src/features/vitals/components/TrajectorySection.tsx、src/lib/medicalTrajectory.ts。
*/
import { describe, expect, test } from 'bun:test'
import { installReactHookHarness, renderHook } from './helpers/reactHookHarness'
import { textContent } from './helpers/elementTree'
import type { MedicationChangeTrajectoryEvent, TimelineTrajectoryEvent, DueReminderTrajectoryEvent } from '../../src/lib/medicalTrajectory'
import type { PreVisitSourceStatuses } from '../../src/lib/preVisitSources'
import type { MedicationCatalog } from '../../src/types/database'
import type { CareTimelineEntry } from '../../src/lib/careTimeline'

installReactHookHarness()

const LOCALE_CONTEXT_VALUE = { locale: 'zh' as const, setLocale: () => {} }

const { TrajectorySection } = await import('../../src/features/vitals/components/TrajectorySection')

const OK_STATUS: PreVisitSourceStatuses = { medicationChanges: 'ok', timelineEntries: 'ok', dueReminders: 'ok' }

function render(events: Array<MedicationChangeTrajectoryEvent | TimelineTrajectoryEvent | DueReminderTrajectoryEvent>, sourceStatus: PreVisitSourceStatuses = OK_STATUS) {
  const view = renderHook(() => TrajectorySection({ events, sourceStatus }), { defaultContext: LOCALE_CONTEXT_VALUE })
  return textContent(view.current)
}

const medication: MedicationCatalog = {
  id: 'med-1', drug_product_id: null, brand_name: 'Amdixal', brand_name_zh: '脈優', generic_name: 'Amlodipine',
  strength_mg: 5, dosage_form: 'tablet', specialties: [], verification_status: 'unverified',
  tfda_license_number: null, nhi_drug_code: null, appearance_note: null, appearance_color: null,
  appearance_shape: null, appearance_photo_url: null, atc_code: 'C09AA05',
}

describe('TrajectorySection', () => {
  test('tells the caregiver there is nothing to report when every source read successfully and found nothing', () => {
    const rendered = render([])
    expect(rendered).toContain('近期醫療軌跡')
    expect(rendered).toContain('這段期間沒有藥單異動、看診事件或到期提醒。')
  })

  test('reports which source is unavailable instead of implying nothing changed', () => {
    const rendered = render([], { medicationChanges: 'unavailable', timelineEntries: 'ok', dueReminders: 'not_applicable' })
    expect(rendered).toContain('藥單異動紀錄暫時無法讀取。')
    expect(rendered).not.toContain('這段期間沒有藥單異動、看診事件或到期提醒。')
  })

  test('renders a medication change with its direction, category, schedule, and dose', () => {
    const event: MedicationChangeTrajectoryEvent = {
      id: 'log-1', occurredAt: '2026-07-10T00:00:00.000Z', kind: 'medication_change', direction: 'dose_up',
      medicationGroup: 'blood_pressure', medication, scheduleSlot: 'morning', doseAmount: 2, doseCount: 1,
      dosageForm: 'tablet', asNeeded: false, reason: '血壓仍偏高',
    }
    const rendered = render([event])
    expect(rendered).toContain('劑量調高')
    expect(rendered).toContain('脈優')
    expect(rendered).toContain('降血壓藥')
    expect(rendered).toContain('早上')
    expect(rendered).toContain('2 錠')
    expect(rendered).toContain('血壓仍偏高')
  })

  test('renders a timeline event with its badge, title, and details', () => {
    const event: TimelineTrajectoryEvent = {
      id: 'visit-1', occurredAt: '2026-07-11T00:00:00.000Z', kind: 'health_visit', title: '心臟科回診', details: '醫師確認調藥後續追蹤', reassessOn: null,
    }
    const rendered = render([event])
    expect(rendered).toContain('看診／健康處置')
    expect(rendered).toContain('心臟科回診')
    expect(rendered).toContain('醫師確認調藥後續追蹤')
  })

  test('renders a health_visit event with its structured department, visit type, and institution (#659 S3)', () => {
    const sourceEntry: CareTimelineEntry = {
      id: 'visit-2', patient_id: 'patient-1', event_type: 'health_visit', title: '心臟科回診', details: '',
      occurred_at: '2026-07-12T00:00:00.000Z', reassess_on: null, created_by: 'caregiver@example.com', created_at: '2026-07-12T00:00:00.000Z',
      medication_plan_id: null, visit_kind: 'outpatient', visit_department: '心臟內科', visit_institution: '台大醫院',
    }
    const event: TimelineTrajectoryEvent = {
      id: 'visit-2', occurredAt: '2026-07-12T00:00:00.000Z', kind: 'health_visit', title: '心臟科回診', details: '', reassessOn: null,
      sourceEntry,
    }
    const rendered = render([event])
    expect(rendered).toContain('心臟內科 門診')
    expect(rendered).toContain('台大醫院')
  })

  test('does not render a visit structure line when the health_visit entry has no structured fields', () => {
    const event: TimelineTrajectoryEvent = {
      id: 'visit-3', occurredAt: '2026-07-13T00:00:00.000Z', kind: 'health_visit', title: '一般回診', details: '', reassessOn: null,
      sourceEntry: {
        id: 'visit-3', patient_id: 'patient-1', event_type: 'health_visit', title: '一般回診', details: '',
        occurred_at: '2026-07-13T00:00:00.000Z', reassess_on: null, created_by: 'caregiver@example.com', created_at: '2026-07-13T00:00:00.000Z',
        medication_plan_id: null,
      },
    }
    const rendered = render([event])
    expect(rendered).not.toContain('undefined')
    expect(rendered).not.toContain('null')
  })

  test('renders an overdue reminder with how many days it is overdue', () => {
    const event: DueReminderTrajectoryEvent = {
      id: 'reminder-1', occurredAt: '2026-07-10', kind: 'due_reminder', reminderType: 'medication_refill', daysOverdue: 3,
    }
    const rendered = render([event])
    expect(rendered).toContain('逾期提醒')
    expect(rendered).toContain('藥量倒數')
    expect(rendered).toContain('逾期 3 天')
  })
})
