/*
檔案用途：驗證醫療軌跡合併純函式——調藥方向判定、ATC 分組、時間線去重與視窗篩選。
所在層：tests/unit 單元測試層。
主要關聯：對應 src/lib/medicalTrajectory.ts（issue #684，S1）。
*/
import { describe, expect, test } from 'bun:test'
import {
  buildCareTrajectoryFeed,
  buildMedicalTrajectory,
  classifyMedicationChangeDirection,
  resolveTrajectoryMedicationGroup,
  type MedicationChangeTrajectoryEvent,
} from '../../src/lib/medicalTrajectory'
import type { MedicationPlanChangeLogView } from '../../src/lib/medication/medications'
import type { CareTimelineEntry } from '../../src/lib/careTimeline'
import type { CareDueReminder } from '../../src/lib/careDueReminders'
import type { MedicationCatalog } from '../../src/types/database'

function medication(overrides: Partial<MedicationCatalog> = {}): MedicationCatalog {
  return {
    id: 'med-1',
    drug_product_id: null,
    brand_name: 'Amdixal',
    brand_name_zh: '脈優',
    generic_name: 'Amlodipine',
    strength_mg: 5,
    dosage_form: 'tablet',
    specialties: [],
    verification_status: 'unverified',
    tfda_license_number: null,
    nhi_drug_code: null,
    appearance_note: null,
    appearance_color: null,
    appearance_shape: null,
    appearance_photo_url: null,
    atc_code: 'C09AA05',
    ...overrides,
  }
}

function changeLog(overrides: Partial<MedicationPlanChangeLogView> = {}): MedicationPlanChangeLogView {
  return {
    id: 'log-1',
    patient_id: 'patient-1',
    action: 'update',
    plan_id: 'plan-1',
    medication_id: 'med-1',
    schedule_slot: 'morning',
    dose_amount: 1,
    dose_count: 1,
    as_needed: false,
    reason: null,
    actor_email: 'caregiver@example.com',
    before_snapshot: { schedule_slot: 'morning', dose_amount: 1, dose_count: 1, as_needed: false },
    after_snapshot: { schedule_slot: 'morning', dose_amount: 1, dose_count: 1, as_needed: false },
    recorded_at: '2026-07-10T00:00:00.000Z',
    effective_at: '2026-07-10T00:00:00.000Z',
    created_at: '2026-07-10T00:00:00.000Z',
    medication: medication(),
    ...overrides,
  }
}

function timelineEntry(overrides: Partial<CareTimelineEntry> = {}): CareTimelineEntry {
  return {
    id: 'timeline-1',
    patient_id: 'patient-1',
    event_type: 'health_visit',
    title: '門診',
    details: '常規回診',
    occurred_at: '2026-07-10T00:00:00.000Z',
    reassess_on: null,
    created_by: 'caregiver@example.com',
    created_at: '2026-07-10T00:00:00.000Z',
    medication_plan_id: null,
    ...overrides,
  }
}

function dueReminder(overrides: Partial<CareDueReminder> = {}): CareDueReminder {
  return {
    id: 'reminder-1',
    patient_id: 'patient-1',
    reminder_type: 'medication_refill',
    medication_plan_id: null,
    days_supply: 30,
    start_date: '2026-06-10',
    due_date: '2026-07-10',
    threshold_days: 7,
    status: 'active',
    completed_at: null,
    created_by_user_id: null,
    created_at: '2026-06-10T00:00:00.000Z',
    updated_at: '2026-06-10T00:00:00.000Z',
    ...overrides,
  }
}

const WINDOW_START = '2026-07-08T00:00:00.000Z'
const WINDOW_END = '2026-07-15T00:00:00.000Z'
const TODAY = '2026-07-12'

describe('classifyMedicationChangeDirection', () => {
  test('create is always start', () => {
    expect(classifyMedicationChangeDirection({ action: 'create', before_snapshot: {}, after_snapshot: { dose_amount: 1, dose_count: 1 } })).toBe('start')
  })

  test('deactivate is always stop', () => {
    expect(classifyMedicationChangeDirection({ action: 'deactivate', before_snapshot: { dose_amount: 1, dose_count: 1 }, after_snapshot: {} })).toBe('stop')
  })

  test('a higher total dose (amount x count) is dose_up', () => {
    expect(classifyMedicationChangeDirection({
      action: 'update',
      before_snapshot: { dose_amount: 1, dose_count: 1 },
      after_snapshot: { dose_amount: 2, dose_count: 1 },
    })).toBe('dose_up')
  })

  test('a lower total dose via dose_count is dose_down', () => {
    // 鉀離子藥常見「每次固定顆數，改成一天吃一次」的減量方式；只看 dose_amount 會誤判成 other。
    expect(classifyMedicationChangeDirection({
      action: 'update',
      before_snapshot: { dose_amount: 2, dose_count: 2 },
      after_snapshot: { dose_amount: 2, dose_count: 1 },
    })).toBe('dose_down')
  })

  test('same total dose but a different schedule slot is schedule_change', () => {
    expect(classifyMedicationChangeDirection({
      action: 'update',
      before_snapshot: { dose_amount: 1, dose_count: 1, schedule_slot: 'morning', as_needed: false },
      after_snapshot: { dose_amount: 1, dose_count: 1, schedule_slot: 'before_bed', as_needed: false },
    })).toBe('schedule_change')
  })

  test('same total dose but a different as_needed flag is schedule_change', () => {
    expect(classifyMedicationChangeDirection({
      action: 'update',
      before_snapshot: { dose_amount: 1, dose_count: 1, schedule_slot: 'morning', as_needed: false },
      after_snapshot: { dose_amount: 1, dose_count: 1, schedule_slot: 'morning', as_needed: true },
    })).toBe('schedule_change')
  })

  test('no meaningful difference falls back to other', () => {
    expect(classifyMedicationChangeDirection({
      action: 'update',
      before_snapshot: { dose_amount: 1, dose_count: 1, schedule_slot: 'morning', as_needed: false },
      after_snapshot: { dose_amount: 1, dose_count: 1, schedule_slot: 'morning', as_needed: false },
    })).toBe('other')
  })
})

describe('resolveTrajectoryMedicationGroup', () => {
  test.each([
    ['C09AA05', 'blood_pressure'],
    ['C07AB03', 'blood_pressure'],
    ['C08CA01', 'blood_pressure'],
    ['C02AC01', 'blood_pressure'],
    ['C03CA01', 'diuretic'],
    ['A12BA01', 'potassium'],
    ['A10BA02', 'diabetes'],
    ['B01AC06', 'anticoagulant'],
  ])('%s resolves to %s', (atcCode, group) => {
    expect(resolveTrajectoryMedicationGroup(atcCode)).toBe(group)
  })

  test('an unmapped or missing ATC code falls back to other', () => {
    expect(resolveTrajectoryMedicationGroup('C10AA01')).toBe('other')
    expect(resolveTrajectoryMedicationGroup(null)).toBe('other')
    expect(resolveTrajectoryMedicationGroup(undefined)).toBe('other')
  })
})

describe('buildMedicalTrajectory', () => {
  test('a change log and its 1:1 timeline projection collapse into a single event', () => {
    const log = changeLog({ id: 'log-dedupe' })
    const events = buildMedicalTrajectory({
      changeLogs: [log],
      timelineEntries: [
        timelineEntry({ id: 'timeline-projection', event_type: 'medication_change', medication_plan_change_log_id: 'log-dedupe', occurred_at: log.effective_at }),
      ],
      dueReminders: [],
      windowStart: WINDOW_START,
      windowEnd: WINDOW_END,
      today: TODAY,
    })

    expect(events).toHaveLength(1)
    expect(events[0].kind).toBe('medication_change')
    expect(events[0].id).toBe('log-dedupe')
  })

  test('a medication change up to 7 days before the window start is still included', () => {
    // reviewWindow(effective_at, 7).end == windowStart 剛好相交，屬於邊界情況。
    const withinBuffer = changeLog({ id: 'log-in-buffer', effective_at: '2026-07-01T00:00:00.000Z' })
    const tooOld = changeLog({ id: 'log-too-old', effective_at: '2026-06-20T00:00:00.000Z' })
    const events = buildMedicalTrajectory({
      changeLogs: [withinBuffer, tooOld],
      timelineEntries: [],
      dueReminders: [],
      windowStart: WINDOW_START,
      windowEnd: WINDOW_END,
      today: TODAY,
    })

    expect(events.map(event => event.id)).toEqual(['log-in-buffer'])
  })

  test('only the acceptance-listed timeline event types are included', () => {
    const events = buildMedicalTrajectory({
      changeLogs: [],
      timelineEntries: [
        timelineEntry({ id: 'visit', event_type: 'health_visit' }),
        timelineEntry({ id: 'observation', event_type: 'family_observation' }),
      ],
      dueReminders: [],
      windowStart: WINDOW_START,
      windowEnd: WINDOW_END,
      today: TODAY,
    })

    expect(events.map(event => event.id)).toEqual(['visit'])
  })

  test('overdue reminders due within the window are included with days overdue; others are excluded', () => {
    const overdueInWindow = dueReminder({ id: 'overdue-in-window', due_date: '2026-07-10' })
    const notYetDue = dueReminder({ id: 'not-yet-due', due_date: '2026-07-14', threshold_days: 30 })
    const outsideWindow = dueReminder({ id: 'outside-window', due_date: '2026-07-20' })
    const dismissed = dueReminder({ id: 'dismissed', due_date: '2026-07-09', status: 'dismissed' })
    const events = buildMedicalTrajectory({
      changeLogs: [],
      timelineEntries: [],
      dueReminders: [overdueInWindow, notYetDue, outsideWindow, dismissed],
      windowStart: WINDOW_START,
      windowEnd: WINDOW_END,
      today: TODAY,
    })

    expect(events).toHaveLength(1)
    expect(events[0].kind).toBe('due_reminder')
    expect(events[0].id).toBe('overdue-in-window')
    expect((events[0] as { daysOverdue: number }).daysOverdue).toBe(2)
  })

  test('mixed events are sorted chronologically ascending', () => {
    const events = buildMedicalTrajectory({
      changeLogs: [changeLog({ id: 'log-mid', effective_at: '2026-07-11T00:00:00.000Z' })],
      timelineEntries: [timelineEntry({ id: 'visit-late', occurred_at: '2026-07-13T00:00:00.000Z' })],
      dueReminders: [dueReminder({ id: 'overdue-early', due_date: '2026-07-09' })],
      windowStart: WINDOW_START,
      windowEnd: WINDOW_END,
      today: TODAY,
    })

    expect(events.map(event => event.id)).toEqual(['overdue-early', 'log-mid', 'visit-late'])
  })

  test('the ATC-derived medication group is attached for downstream S2 rules without being interpreted here', () => {
    const events = buildMedicalTrajectory({
      changeLogs: [changeLog({ id: 'log-bp', medication: medication({ atc_code: 'C09AA05' }) })],
      timelineEntries: [],
      dueReminders: [],
      windowStart: WINDOW_START,
      windowEnd: WINDOW_END,
      today: TODAY,
    })

    expect((events[0] as MedicationChangeTrajectoryEvent).medicationGroup).toBe('blood_pressure')
  })

  test('prefers the point-in-time snapshot brand name over the current catalog name, so a later catalog rename does not relabel history', () => {
    // 回歸測試：原本的 MedicationHistory（已併入軌跡頁）優先讀 snapshot 品名就是為了這個理由
    // （Codex review, PR #747）；目錄之後改名不能悄悄把舊的調藥事件也一起改名。
    const events = buildMedicalTrajectory({
      changeLogs: [changeLog({
        id: 'log-renamed',
        medication: medication({ brand_name: 'New Catalog Name', brand_name_zh: '新目錄品名' }),
        after_snapshot: { schedule_slot: 'morning', dose_amount: 1, dose_count: 1, as_needed: false, brand_name: 'Old Snapshot Name', brand_name_zh: '舊快照品名' },
      })],
      timelineEntries: [],
      dueReminders: [],
      windowStart: WINDOW_START,
      windowEnd: WINDOW_END,
      today: TODAY,
    })

    const event = events[0] as MedicationChangeTrajectoryEvent
    expect(event.medication.brand_name).toBe('Old Snapshot Name')
    expect(event.medication.brand_name_zh).toBe('舊快照品名')
  })

  test('falls back to the current catalog name when the snapshot has none', () => {
    const events = buildMedicalTrajectory({
      changeLogs: [changeLog({ id: 'log-no-snapshot-name', medication: medication({ brand_name: 'Catalog Name', brand_name_zh: '目錄品名' }) })],
      timelineEntries: [],
      dueReminders: [],
      windowStart: WINDOW_START,
      windowEnd: WINDOW_END,
      today: TODAY,
    })

    const event = events[0] as MedicationChangeTrajectoryEvent
    expect(event.medication.brand_name).toBe('Catalog Name')
    expect(event.medication.brand_name_zh).toBe('目錄品名')
  })
})

describe('buildCareTrajectoryFeed', () => {
  test('a change log and its 1:1 timeline projection still collapse into a single event', () => {
    const log = changeLog({ id: 'log-dedupe' })
    const events = buildCareTrajectoryFeed({
      changeLogs: [log],
      timelineEntries: [
        timelineEntry({ id: 'timeline-projection', event_type: 'medication_change', medication_plan_change_log_id: 'log-dedupe', occurred_at: log.effective_at }),
      ],
      dueReminders: [],
      today: TODAY,
    })

    expect(events).toHaveLength(1)
    expect(events[0].kind).toBe('medication_change')
    expect(events[0].id).toBe('log-dedupe')
  })

  test('unlike the report, every manual timeline event type is included — not just the four clinical types', () => {
    // 軌跡頁是既有事件 tab 的直接替代；家屬觀察、疫苗等既有類型不能在改版後從主要入口消失。
    const events = buildCareTrajectoryFeed({
      changeLogs: [],
      timelineEntries: [
        timelineEntry({ id: 'visit', event_type: 'health_visit' }),
        timelineEntry({ id: 'observation', event_type: 'family_observation' }),
        timelineEntry({ id: 'vaccination', event_type: 'vaccination' }),
      ],
      dueReminders: [],
      today: TODAY,
    })

    expect(events.map(event => event.id).sort()).toEqual(['observation', 'vaccination', 'visit'])
  })

  test('a manual timeline event carries its full source entry for edit/delete/photos', () => {
    const entry = timelineEntry({ id: 'visit', event_type: 'health_visit' })
    const events = buildCareTrajectoryFeed({ changeLogs: [], timelineEntries: [entry], dueReminders: [], today: TODAY })
    expect(events[0].kind === 'health_visit' && events[0].sourceEntry).toEqual(entry)
  })

  test('is not bound to a report window; a change log far outside any window still appears', () => {
    const oldLog = changeLog({ id: 'log-old', effective_at: '2020-01-01T00:00:00.000Z' })
    const events = buildCareTrajectoryFeed({ changeLogs: [oldLog], timelineEntries: [], dueReminders: [], today: TODAY })
    expect(events.map(event => event.id)).toEqual(['log-old'])
  })

  test('only currently-overdue active reminders are included, regardless of how old the due date is', () => {
    const overdue = dueReminder({ id: 'overdue', due_date: '2020-01-01' })
    const notYetDue = dueReminder({ id: 'not-yet-due', due_date: '2026-08-01', threshold_days: 30 })
    const dismissed = dueReminder({ id: 'dismissed', due_date: '2020-01-01', status: 'dismissed' })
    const events = buildCareTrajectoryFeed({ changeLogs: [], timelineEntries: [], dueReminders: [overdue, notYetDue, dismissed], today: TODAY })
    expect(events.map(event => event.id)).toEqual(['overdue'])
  })

  test('a manual entry mislabeled with the reserved medication_change event_type is dropped, not passed through as a fake medication event', () => {
    // 回歸測試：demo 種子資料曾有一筆手寫敘事筆記誤用 event_type: 'medication_change'（沒有對應的
    // medication_plan_change_log_id／snapshot），會讓軌跡頁把它當成 MedicationChangeTrajectoryEvent
    // 而在讀取 .medication 時當掉（issue #735 發現，修正見 src/lib/demoData.ts 的 demo-timeline-3）。
    const malformed = timelineEntry({ id: 'malformed', event_type: 'medication_change', medication_plan_change_log_id: null })
    const events = buildCareTrajectoryFeed({ changeLogs: [], timelineEntries: [malformed], dueReminders: [], today: TODAY })
    expect(events).toHaveLength(0)
  })

  test('sorts newest first, the opposite of the chronological report order', () => {
    const events = buildCareTrajectoryFeed({
      changeLogs: [changeLog({ id: 'log-mid', effective_at: '2026-07-11T00:00:00.000Z' })],
      timelineEntries: [timelineEntry({ id: 'visit-late', occurred_at: '2026-07-13T00:00:00.000Z' })],
      dueReminders: [dueReminder({ id: 'overdue-early', due_date: '2026-07-01' })],
      today: TODAY,
    })
    expect(events.map(event => event.id)).toEqual(['visit-late', 'log-mid', 'overdue-early'])
  })
})
