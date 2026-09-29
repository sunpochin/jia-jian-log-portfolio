/*
檔案用途：驗證就診前摘要每條規則的三語輸出都符合措辭契約——問題以「請與醫師確認／Tanyakan kepada
dokter／Please confirm with the doctor」開頭，且觀察與問題都不含因果推論或停／加藥指示詞。這是這張票
（健康安全語意變更）能否過主刀複查的關鍵測試，涵蓋 R1（含零量測分支）、R2、R3、R4、R5（含證據並列分支）、R6。
所在層：tests/unit 單元測試層。
主要關聯：對應 src/lib/preVisitBrief.ts 的 PRE_VISIT_FORBIDDEN_PHRASES（issue #686，S2）。
*/
import { describe, expect, test } from 'bun:test'
import { GENERAL_ADULT_RESOLVER } from '../../src/lib/bpStandards'
import {
  buildPreVisitBrief,
  PRE_VISIT_FORBIDDEN_PHRASES,
  type BuildPreVisitBriefOptions,
  type PreVisitBriefItem,
  type PreVisitBriefWindow,
} from '../../src/lib/preVisitBrief'
import type { MedicationChangeTrajectoryEvent, TimelineTrajectoryEvent, TrajectoryEvent } from '../../src/lib/medicalTrajectory'
import type { CareDueReminder } from '../../src/lib/careDueReminders'
import type { MedicationCatalog, BpRecord, PatientLabResult } from '../../src/types/database'
import type { PreVisitSourceStatuses } from '../../src/lib/preVisitSources'

function medication(overrides: Partial<MedicationCatalog> = {}): MedicationCatalog {
  return {
    id: 'med-bp', drug_product_id: null, brand_name: 'Amdixal', brand_name_zh: '脈優', generic_name: 'Amlodipine',
    strength_mg: 5, dosage_form: 'tablet', specialties: [], verification_status: 'unverified',
    tfda_license_number: null, nhi_drug_code: null, appearance_note: null, appearance_color: null,
    appearance_shape: null, appearance_photo_url: null, atc_code: 'C09AA05',
    ...overrides,
  }
}

function medicationChangeEvent(overrides: Partial<MedicationChangeTrajectoryEvent> = {}): MedicationChangeTrajectoryEvent {
  return {
    id: 'log-r1', occurredAt: '2026-07-09T00:00:00.000Z', kind: 'medication_change', direction: 'dose_up',
    medicationGroup: 'blood_pressure', medication: medication(), scheduleSlot: 'morning', doseAmount: 2,
    doseCount: 1, dosageForm: 'tablet', asNeeded: false, reason: null,
    ...overrides,
  }
}

function doctorInstructionEvent(overrides: Partial<TimelineTrajectoryEvent> = {}): TimelineTrajectoryEvent {
  return {
    id: 'instruction-1', occurredAt: '2026-07-09T00:00:00.000Z', kind: 'doctor_instruction',
    title: '調整用藥後續追蹤', details: '兩週後回診', reassessOn: '2026-07-20',
    ...overrides,
  }
}

function labResult(overrides: Partial<PatientLabResult> = {}): PatientLabResult {
  return {
    id: 'lab-1', patient_id: 'patient-1', item_code: 'K', value: 2.8, unit: 'mmol/L',
    reference_low: 3.5, reference_high: 5.1, sampled_at: '2026-07-10T00:00:00.000Z',
    institution: null, notes: null, source: 'manual', source_fingerprint: null,
    recorded_by: 'caregiver@example.com', created_at: '2026-07-10T00:00:00.000Z',
    ...overrides,
  }
}

function dueReminder(overrides: Partial<CareDueReminder> = {}): CareDueReminder {
  return {
    id: 'reminder-1', patient_id: 'patient-1', reminder_type: 'medication_refill', medication_plan_id: null,
    days_supply: 30, start_date: '2026-06-10', due_date: '2026-07-05', threshold_days: 7, status: 'active',
    completed_at: null, created_by_user_id: null, related_entry_id: null, related_lab_result_id: null, visit_department: null, created_at: '2026-06-10T00:00:00.000Z', updated_at: '2026-06-10T00:00:00.000Z',
    ...overrides,
  }
}

function bpRecord(overrides: Partial<BpRecord> = {}): BpRecord {
  return {
    id: 'bp-1', systolic: 130, diastolic: 85, pulse: 70, measured_at: '2026-07-10T04:00:00.000Z',
    source: 'manual', recorded_by: 'caregiver@example.com', patient_id: 'patient-1', created_at: '2026-07-10T04:00:00.000Z',
    ...overrides,
  }
}

const OK_STATUS: PreVisitSourceStatuses = { medicationChanges: 'ok', timelineEntries: 'ok', dueReminders: 'ok' }
const WINDOW: PreVisitBriefWindow = { start: '2026-07-08T00:00:00.000Z', end: '2026-07-15T00:00:00.000Z' }
const TODAY = '2026-07-12'

function fullCoverageRecords(): BpRecord[] {
  const dates = ['2026-07-08', '2026-07-09', '2026-07-10', '2026-07-11', '2026-07-12', '2026-07-13', '2026-07-14']
  return dates.map((date, index) => bpRecord({ id: `cover-${index}`, measured_at: `${date}T04:00:00.000Z` }))
}

function opts(overrides: Partial<BuildPreVisitBriefOptions> = {}): BuildPreVisitBriefOptions {
  return {
    baselineRecords: [],
    dueReminders: [],
    sourceStatus: OK_STATUS,
    standardResolver: GENERAL_ADULT_RESOLVER,
    today: TODAY,
    ...overrides,
  }
}

const QUESTION_PREFIX = { id: 'Tanyakan kepada dokter', zh: '請與醫師確認', en: 'Please confirm with the doctor' } as const

function assertPhrasing(item: PreVisitBriefItem) {
  for (const locale of ['id', 'zh', 'en'] as const) {
    if (item.question) {
      expect(item.question[locale].startsWith(QUESTION_PREFIX[locale])).toBe(true)
    }
    for (const phrase of PRE_VISIT_FORBIDDEN_PHRASES[locale]) {
      expect(item.observation[locale]).not.toContain(phrase)
      if (item.question) expect(item.question[locale]).not.toContain(phrase)
    }
  }
}

describe('pre-visit brief phrasing — every rule stays within the wording contract', () => {
  test('R1 with a paired question (medication change + post-change measurements)', () => {
    const event = medicationChangeEvent()
    const baselineRecords = [
      bpRecord({ id: 'baseline-1', measured_at: '2026-07-05T04:00:00.000Z' }),
      bpRecord({ id: 'after-1', measured_at: '2026-07-10T04:00:00.000Z' }),
    ]
    const [item] = buildPreVisitBrief(fullCoverageRecords(), [event], WINDOW, opts({ baselineRecords }))
    expect(item.ruleId).toBe('R1')
    assertPhrasing(item)
  })

  test('R1 observation-only branch (zero post-change measurements)', () => {
    const event = medicationChangeEvent()
    const baselineRecords = [bpRecord({ id: 'baseline-1', measured_at: '2026-07-05T04:00:00.000Z' })]
    const [item] = buildPreVisitBrief(fullCoverageRecords(), [event], WINDOW, opts({ baselineRecords }))
    expect(item.ruleId).toBe('R1')
    expect(item.question).toBeNull()
    assertPhrasing(item)
  })

  test('R2 medication_refill overdue reminder', () => {
    const reminder = dueReminder({ id: 'refill-1', reminder_type: 'medication_refill', due_date: '2026-07-05' })
    const [item] = buildPreVisitBrief(fullCoverageRecords(), [], WINDOW, opts({ dueReminders: [reminder] }))
    expect(item.ruleId).toBe('R2')
    assertPhrasing(item)
  })

  test('R3 follow_up_visit / blood_draw overdue reminders', () => {
    const followUp = dueReminder({ id: 'follow-1', reminder_type: 'follow_up_visit', due_date: '2026-07-05' })
    const bloodDraw = dueReminder({ id: 'draw-1', reminder_type: 'blood_draw', due_date: '2026-07-06' })
    const items = buildPreVisitBrief(fullCoverageRecords(), [], WINDOW, opts({ dueReminders: [followUp, bloodDraw] }))
    const r3Items = items.filter(item => item.ruleId === 'R3')
    expect(r3Items.length).toBeGreaterThan(0)
    r3Items.forEach(assertPhrasing)
  })

  test('R4 doctor-instruction review, with and without a reassessment date', () => {
    const withReassess = doctorInstructionEvent({ id: 'with-reassess', reassessOn: '2026-07-20' })
    const withoutReassess = doctorInstructionEvent({ id: 'without-reassess', occurredAt: '2026-07-08T00:00:00.000Z', reassessOn: null })
    const events: TrajectoryEvent[] = [withReassess, withoutReassess]
    const items = buildPreVisitBrief(fullCoverageRecords(), events, WINDOW, opts())
    const r4Items = items.filter(item => item.ruleId === 'R4')
    expect(r4Items).toHaveLength(2)
    r4Items.forEach(assertPhrasing)
  })

  test('R5 lab result out of range, without nearby medication evidence', () => {
    const result = labResult({ value: 2.8, reference_low: 3.5, reference_high: 5.1 })
    const [item] = buildPreVisitBrief(fullCoverageRecords(), [], WINDOW, opts({ labResults: [result] }))
    expect(item.ruleId).toBe('R5')
    assertPhrasing(item)
  })

  // 證據並列句是另外寫的一句中性事實句（刻意不重用 R1 的 TRAJECTORY_DIRECTION_LABELS，見
  // src/lib/preVisitBrief.ts 的說明），必須單獨測過措辭契約，不能只靠上面沒有證據的分支帶過。
  test('R5 lab result out of range, with nearby related-medication evidence juxtaposed', () => {
    const result = labResult({ item_code: 'K', value: 2.8, sampled_at: '2026-07-10T00:00:00.000Z' })
    const nearbyChange = medicationChangeEvent({
      id: 'diuretic-change', occurredAt: '2026-07-05T00:00:00.000Z',
      medicationGroup: 'potassium', medication: medication({ id: 'med-k', brand_name: 'K-Care', brand_name_zh: '鉀樂' }),
    })
    const [item] = buildPreVisitBrief(fullCoverageRecords(), [nearbyChange], WINDOW, opts({ labResults: [result] }))
    expect(item.ruleId).toBe('R5')
    expect(item.observation.zh).toContain('鉀樂')
    assertPhrasing(item)
  })

  test('R6 low measurement coverage (observation-only)', () => {
    const records = [bpRecord({ id: 'day-1', measured_at: '2026-07-09T04:00:00.000Z' })]
    const [item] = buildPreVisitBrief(records, [], WINDOW, opts())
    expect(item.ruleId).toBe('R6')
    expect(item.question).toBeNull()
    assertPhrasing(item)
  })
})
