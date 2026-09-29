/*
檔案用途：驗證就診前摘要規則引擎——R1 調藥後量測對照、R2／R3 逾期提醒、R4 醫師指示回顧、R6 量測涵蓋率，
以及排名／去重／取 3 的邏輯。措辭本身的三語驗收見 tests/unit/preVisitBriefPhrasing.test.ts。
所在層：tests/unit 單元測試層。
主要關聯：對應 src/lib/preVisitBrief.ts（issue #686，S2）。
*/
import { describe, expect, test } from 'bun:test'
import { GENERAL_ADULT_RESOLVER } from '../../src/lib/bpStandards'
import {
  buildPreVisitBrief,
  rankPreVisitQuestions,
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
    title: '調整用藥後續追蹤', details: '兩週後回診', reassessOn: null,
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

function opts(overrides: Partial<BuildPreVisitBriefOptions> = {}): BuildPreVisitBriefOptions {
  return {
    baselineRecords: [],
    dueReminders: [],
    sourceStatus: OK_STATUS,
    today: TODAY,
    standardResolver: GENERAL_ADULT_RESOLVER,
    ...overrides,
  }
}

// 給不想觸發 R6（量測涵蓋率 < 50%）的測試使用：涵蓋 WINDOW 全部 7 天。
function fullCoverageRecords(): BpRecord[] {
  const dates = ['2026-07-08', '2026-07-09', '2026-07-10', '2026-07-11', '2026-07-12', '2026-07-13', '2026-07-14']
  return dates.map((date, index) => bpRecord({ id: `cover-${index}`, measured_at: `${date}T04:00:00.000Z` }))
}

describe('buildPreVisitBrief — R1 medication-adjustment vs. BP baseline', () => {
  test('compares the 7-day baseline average against the post-change average', () => {
    const event = medicationChangeEvent({ occurredAt: '2026-07-09T00:00:00.000Z' })
    const baselineRecords = [
      bpRecord({ id: 'baseline-1', systolic: 150, diastolic: 95, measured_at: '2026-07-05T04:00:00.000Z' }),
      bpRecord({ id: 'baseline-2', systolic: 150, diastolic: 95, measured_at: '2026-07-06T04:00:00.000Z' }),
      bpRecord({ id: 'after-1', systolic: 130, diastolic: 85, measured_at: '2026-07-10T04:00:00.000Z' }),
      bpRecord({ id: 'after-2', systolic: 132, diastolic: 83, measured_at: '2026-07-12T04:00:00.000Z' }),
    ]
    const items = buildPreVisitBrief(fullCoverageRecords(), [event], WINDOW, opts({ baselineRecords }))

    expect(items).toHaveLength(1)
    expect(items[0].ruleId).toBe('R1')
    expect(items[0].priority).toBe(2)
    expect(items[0].relatedMedicationId).toBe('med-bp')
    expect(items[0].question).not.toBeNull()
    expect(items[0].observation.zh).toContain('150/95 mmHg (n=2)')
    expect(items[0].observation.zh).toContain('131/84 mmHg (n=2)')
  })

  test('a medication change with zero post-change measurements is observation-only (no question)', () => {
    const event = medicationChangeEvent({ occurredAt: '2026-07-09T00:00:00.000Z' })
    const baselineRecords = [bpRecord({ id: 'baseline-1', measured_at: '2026-07-05T04:00:00.000Z' })]
    const items = buildPreVisitBrief(fullCoverageRecords(), [event], WINDOW, opts({ baselineRecords }))

    expect(items).toHaveLength(1)
    expect(items[0].question).toBeNull()
    expect(items[0].observation.zh).toContain('沒有新的血壓量測')
  })

  test('the baseline still finds records when the medication change falls before the window start', () => {
    // 調藥落在視窗起點（07-08）前 3 天（07-05），基線要往回抓到 06-28 才涵蓋得到；
    // S1 的擴寬視窗（selectedDays+14）本來就是為了讓 baselineRecords 蓋到這裡（見 usePreVisitSources.ts）。
    const event = medicationChangeEvent({ occurredAt: '2026-07-05T00:00:00.000Z' })
    const baselineRecords = [
      bpRecord({ id: 'early-baseline', systolic: 145, diastolic: 92, measured_at: '2026-07-01T04:00:00.000Z' }),
      bpRecord({ id: 'after-early', systolic: 135, diastolic: 88, measured_at: '2026-07-10T04:00:00.000Z' }),
    ]
    const items = buildPreVisitBrief(fullCoverageRecords(), [event], WINDOW, opts({ baselineRecords }))

    expect(items).toHaveLength(1)
    expect(items[0].observation.zh).toContain('145/92 mmHg (n=1)')
  })

  test('a medication change outside the blood_pressure/diuretic groups does not trigger R1', () => {
    const event = medicationChangeEvent({ medicationGroup: 'diabetes' })
    const items = buildPreVisitBrief(fullCoverageRecords(), [event], WINDOW, opts({ baselineRecords: fullCoverageRecords() }))
    expect(items).toHaveLength(0)
  })

  test('the diuretic group is treated the same as blood_pressure (synonym pairing only, no potassium lookup)', () => {
    const event = medicationChangeEvent({ medicationGroup: 'diuretic', medication: medication({ id: 'med-diuretic', atc_code: 'C03CA01' }) })
    const baselineRecords = [
      bpRecord({ id: 'baseline-1', measured_at: '2026-07-05T04:00:00.000Z' }),
      bpRecord({ id: 'after-1', measured_at: '2026-07-10T04:00:00.000Z' }),
    ]
    const items = buildPreVisitBrief(fullCoverageRecords(), [event], WINDOW, opts({ baselineRecords }))
    expect(items).toHaveLength(1)
    expect(items[0].ruleId).toBe('R1')
  })
})

describe('buildPreVisitBrief — R2/R3 overdue reminders', () => {
  test('an active, overdue medication_refill reminder produces an R2 item', () => {
    const reminder = dueReminder({ id: 'refill-1', reminder_type: 'medication_refill', due_date: '2026-07-05', medication_plan_id: 'plan-1' })
    const items = buildPreVisitBrief(fullCoverageRecords(), [], WINDOW, opts({ dueReminders: [reminder] }))
    expect(items).toHaveLength(1)
    expect(items[0].ruleId).toBe('R2')
    expect(items[0].priority).toBe(3)
    expect(items[0].relatedMedicationId).toBe('plan-1')
    expect(items[0].question).not.toBeNull()
    expect(items[0].observation.zh).toContain('逾期 7 天')
  })

  test('an active, overdue follow_up_visit or blood_draw reminder produces an R3 item', () => {
    const reminder = dueReminder({ id: 'draw-1', reminder_type: 'blood_draw', due_date: '2026-07-05', medication_plan_id: null })
    const items = buildPreVisitBrief(fullCoverageRecords(), [], WINDOW, opts({ dueReminders: [reminder] }))
    expect(items).toHaveLength(1)
    expect(items[0].ruleId).toBe('R3')
    expect(items[0].relatedMedicationId).toBeNull()
  })

  test('completed or dismissed overdue reminders never trigger R2/R3 (Codex review PR #689)', () => {
    const completedRefill = dueReminder({ id: 'refill-completed', reminder_type: 'medication_refill', due_date: '2026-07-01', status: 'completed' })
    const dismissedDraw = dueReminder({ id: 'draw-dismissed', reminder_type: 'blood_draw', due_date: '2026-07-01', status: 'dismissed' })
    const items = buildPreVisitBrief(fullCoverageRecords(), [], WINDOW, opts({ dueReminders: [completedRefill, dismissedDraw] }))
    expect(items).toHaveLength(0)
  })

  test('a reminder that is not yet overdue does not trigger R2/R3', () => {
    const notYetDue = dueReminder({ id: 'refill-future', reminder_type: 'medication_refill', due_date: '2026-08-01' })
    const items = buildPreVisitBrief(fullCoverageRecords(), [], WINDOW, opts({ dueReminders: [notYetDue] }))
    expect(items).toHaveLength(0)
  })
})

describe('buildPreVisitBrief — R4 doctor-instruction review', () => {
  test('caps at the 2 most recent doctor_instruction events within the window', () => {
    const events: TrajectoryEvent[] = [
      doctorInstructionEvent({ id: 'oldest', occurredAt: '2026-07-09T00:00:00.000Z' }),
      doctorInstructionEvent({ id: 'middle', occurredAt: '2026-07-11T00:00:00.000Z' }),
      doctorInstructionEvent({ id: 'newest', occurredAt: '2026-07-13T00:00:00.000Z' }),
    ]
    const items = buildPreVisitBrief(fullCoverageRecords(), events, WINDOW, opts())
    const r4Items = items.filter(item => item.ruleId === 'R4')
    expect(r4Items).toHaveLength(2)
    expect(r4Items.map(item => item.dedupeId)).toEqual(['newest', 'middle'])
  })

  test('includes the pending reassessment date in the observation when present', () => {
    const event = doctorInstructionEvent({ id: 'with-reassess', reassessOn: '2026-07-20' })
    const items = buildPreVisitBrief(fullCoverageRecords(), [event], WINDOW, opts())
    const r4Item = items.find(item => item.ruleId === 'R4')
    expect(r4Item?.observation.zh).toContain('2026-07-20 重新評估')
  })
})

describe('buildPreVisitBrief — R5 lab result out of range', () => {
  test('a value below this report’s own reference range produces an R5 item at the highest priority', () => {
    const result = labResult({ id: 'lab-k-low', value: 2.8, reference_low: 3.5, reference_high: 5.1 })
    const items = buildPreVisitBrief(fullCoverageRecords(), [], WINDOW, opts({ labResults: [result] }))
    expect(items).toHaveLength(1)
    expect(items[0].ruleId).toBe('R5')
    expect(items[0].priority).toBe(1)
    expect(items[0].relatedMedicationId).toBeNull()
    expect(items[0].dedupeId).toBe('lab-k-low')
    expect(items[0].question).not.toBeNull()
    expect(items[0].observation.zh).toContain('低於報告參考值')
    expect(items[0].observation.zh).toContain('2.8mmol/L')
  })

  test('a value above the reference range is also flagged', () => {
    const result = labResult({ item_code: 'GLU', value: 260, unit: 'mg/dL', reference_low: 70, reference_high: 140 })
    const items = buildPreVisitBrief(fullCoverageRecords(), [], WINDOW, opts({ labResults: [result] }))
    expect(items).toHaveLength(1)
    expect(items[0].observation.zh).toContain('高於報告參考值')
  })

  test('a value within the reference range does not trigger R5', () => {
    const result = labResult({ value: 4.0, reference_low: 3.5, reference_high: 5.1 })
    const items = buildPreVisitBrief(fullCoverageRecords(), [], WINDOW, opts({ labResults: [result] }))
    expect(items).toHaveLength(0)
  })

  // 缺參考值只在檢驗頁顯示不分類（labRangeStatus 回傳 unknown），不產生 R5 項目——不能用全域門檻硬猜。
  test('a value with no reference range on the report does not trigger R5', () => {
    const result = labResult({ value: 2.8, reference_low: null, reference_high: null })
    const items = buildPreVisitBrief(fullCoverageRecords(), [], WINDOW, opts({ labResults: [result] }))
    expect(items).toHaveLength(0)
  })

  // 第一版只做同義配對（issue #687：A12B↔K、A10↔GLU/HbA1c）；證據並列在 ±14 天內才出現，且不用因果連接詞。
  test('juxtaposes a nearby related medication change as evidence without a causal connector', () => {
    const result = labResult({ item_code: 'K', value: 2.8, sampled_at: '2026-07-10T00:00:00.000Z' })
    const nearbyChange = medicationChangeEvent({
      id: 'diuretic-change', occurredAt: '2026-07-05T00:00:00.000Z',
      medicationGroup: 'potassium', medication: medication({ id: 'med-k', brand_name: 'K-Care', brand_name_zh: '鉀樂', atc_code: 'A12BA01' }),
    })
    const items = buildPreVisitBrief(fullCoverageRecords(), [nearbyChange], WINDOW, opts({ labResults: [result] }))
    expect(items).toHaveLength(1)
    expect(items[0].observation.zh).toContain('鉀樂')
    expect(items[0].observation.zh).toContain('用藥調整紀錄')
    for (const phrase of PRE_VISIT_FORBIDDEN_PHRASES.zh) {
      expect(items[0].observation.zh).not.toContain(phrase)
    }
  })

  test('when two related medication changes are both within the window, picks the one closest to the sample date', () => {
    const result = labResult({ item_code: 'K', value: 2.8, sampled_at: '2026-07-10T00:00:00.000Z' })
    const closerChange = medicationChangeEvent({
      id: 'diuretic-close', occurredAt: '2026-07-09T00:00:00.000Z',
      medicationGroup: 'potassium', medication: medication({ id: 'med-k-close', brand_name: 'K-Care', brand_name_zh: '近的鉀樂' }),
    })
    const fartherChange = medicationChangeEvent({
      id: 'diuretic-far-in-window', occurredAt: '2026-07-01T00:00:00.000Z',
      medicationGroup: 'potassium', medication: medication({ id: 'med-k-far', brand_name: 'K-Care', brand_name_zh: '遠的鉀樂' }),
    })
    const items = buildPreVisitBrief(fullCoverageRecords(), [fartherChange, closerChange], WINDOW, opts({ labResults: [result] }))
    expect(items[0].observation.zh).toContain('近的鉀樂')
    expect(items[0].observation.zh).not.toContain('遠的鉀樂')
  })

  test('does not juxtapose a medication change outside the ±14-day window', () => {
    const result = labResult({ item_code: 'K', value: 2.8, sampled_at: '2026-07-10T00:00:00.000Z' })
    const farChange = medicationChangeEvent({
      id: 'diuretic-far', occurredAt: '2026-06-01T00:00:00.000Z',
      medicationGroup: 'potassium', medication: medication({ id: 'med-k', brand_name: 'K-Care', brand_name_zh: '鉀樂' }),
    })
    const items = buildPreVisitBrief(fullCoverageRecords(), [farChange], WINDOW, opts({ labResults: [result] }))
    expect(items[0].observation.zh).not.toContain('鉀樂')
  })

  test('does not juxtapose an unrelated medication group even within the window', () => {
    const result = labResult({ item_code: 'K', value: 2.8, sampled_at: '2026-07-10T00:00:00.000Z' })
    const unrelatedChange = medicationChangeEvent({
      id: 'bp-change', occurredAt: '2026-07-09T00:00:00.000Z', medicationGroup: 'blood_pressure',
    })
    const items = buildPreVisitBrief(fullCoverageRecords(), [unrelatedChange], WINDOW, opts({ labResults: [result] }))
    expect(items[0].observation.zh).not.toContain('用藥調整紀錄')
  })

  test('an unavailable labResults source skips R5 even when out-of-range results are present', () => {
    const result = labResult({ value: 2.8 })
    const items = buildPreVisitBrief(fullCoverageRecords(), [], WINDOW, opts({
      labResults: [result],
      sourceStatus: { ...OK_STATUS, labResults: 'unavailable' },
    }))
    expect(items).toHaveLength(0)
  })

  test('ranks ahead of R1 when both trigger in the same window', () => {
    const labEvent = labResult({ value: 2.8 })
    const medEvent = medicationChangeEvent({ occurredAt: '2026-07-09T00:00:00.000Z' })
    const baselineRecords = [bpRecord({ id: 'baseline-1', measured_at: '2026-07-05T04:00:00.000Z' })]
    const items = buildPreVisitBrief(fullCoverageRecords(), [medEvent], WINDOW, opts({ labResults: [labEvent], baselineRecords }))
    expect(items[0].ruleId).toBe('R5')
  })
})

describe('buildPreVisitBrief — R6 measurement coverage', () => {
  test('flags coverage below 50% as observation-only', () => {
    const records = [
      bpRecord({ id: 'day-1', measured_at: '2026-07-09T04:00:00.000Z' }),
      bpRecord({ id: 'day-2', measured_at: '2026-07-10T04:00:00.000Z' }),
    ]
    const items = buildPreVisitBrief(records, [], WINDOW, opts())
    expect(items).toHaveLength(1)
    expect(items[0].ruleId).toBe('R6')
    expect(items[0].priority).toBe(5)
    expect(items[0].question).toBeNull()
  })

  test('does not flag coverage at or above 50%', () => {
    const items = buildPreVisitBrief(fullCoverageRecords(), [], WINDOW, opts())
    expect(items).toHaveLength(0)
  })
})

describe('buildPreVisitBrief — source-status gating (offline handling)', () => {
  test('an unavailable dueReminders source skips R2/R3 even when reminders are present', () => {
    const reminder = dueReminder({ id: 'refill-1', reminder_type: 'medication_refill', due_date: '2026-07-05' })
    const items = buildPreVisitBrief(fullCoverageRecords(), [], WINDOW, opts({
      dueReminders: [reminder],
      sourceStatus: { ...OK_STATUS, dueReminders: 'unavailable' },
    }))
    expect(items).toHaveLength(0)
  })

  test('an unavailable medicationChanges source skips R1', () => {
    const event = medicationChangeEvent()
    const items = buildPreVisitBrief(fullCoverageRecords(), [event], WINDOW, opts({
      baselineRecords: [bpRecord({ measured_at: '2026-07-10T04:00:00.000Z' })],
      sourceStatus: { ...OK_STATUS, medicationChanges: 'unavailable' },
    }))
    expect(items).toHaveLength(0)
  })

  test('an unavailable timelineEntries source skips R4', () => {
    const event = doctorInstructionEvent()
    const items = buildPreVisitBrief(fullCoverageRecords(), [event], WINDOW, opts({
      sourceStatus: { ...OK_STATUS, timelineEntries: 'unavailable' },
    }))
    expect(items).toHaveLength(0)
  })
})

describe('buildPreVisitBrief — zero candidates', () => {
  test('returns an empty array when no rule triggers', () => {
    const items = buildPreVisitBrief(fullCoverageRecords(), [], WINDOW, opts())
    expect(items).toHaveLength(0)
  })
})

describe('buildPreVisitBrief — ranking, dedup, and the top-3 cap', () => {
  test('keeps distinct null-relatedMedicationId items from different rules instead of collapsing them', () => {
    // R2、R3、R4 三筆的 relatedMedicationId 都是 null，去重鍵必須各自用規則專屬鍵，
    // 否則會被誤判成「同一項」而只剩一筆（Codex review PR #689 的既有坑）。
    const refill = dueReminder({ id: 'refill-1', reminder_type: 'medication_refill', due_date: '2026-07-05', medication_plan_id: null })
    const bloodDraw = dueReminder({ id: 'draw-1', reminder_type: 'blood_draw', due_date: '2026-07-06', medication_plan_id: null })
    const instruction = doctorInstructionEvent({ id: 'instruction-1', occurredAt: '2026-07-09T00:00:00.000Z' })
    const items = buildPreVisitBrief(fullCoverageRecords(), [instruction], WINDOW, opts({ dueReminders: [refill, bloodDraw] }))

    expect(items).toHaveLength(3)
    expect(new Set(items.map(item => item.ruleId))).toEqual(new Set(['R2', 'R3', 'R4']))
  })

  test('two R1 items about the same medication dedupe to the more recent one', () => {
    const olderChange = medicationChangeEvent({ id: 'log-old', occurredAt: '2026-07-08T00:00:00.000Z', direction: 'dose_up' })
    const newerChange = medicationChangeEvent({ id: 'log-new', occurredAt: '2026-07-11T00:00:00.000Z', direction: 'dose_down' })
    const baselineRecords = [
      bpRecord({ id: 'b1', measured_at: '2026-07-05T04:00:00.000Z' }),
      bpRecord({ id: 'b2', measured_at: '2026-07-12T04:00:00.000Z' }),
    ]
    const items = buildPreVisitBrief(fullCoverageRecords(), [olderChange, newerChange], WINDOW, opts({ baselineRecords }))

    expect(items).toHaveLength(1)
    expect(items[0].dedupeId).toBe('log-new')
  })
})

describe('rankPreVisitQuestions', () => {
  const base: Omit<PreVisitBriefItem, 'ruleId' | 'priority' | 'occurredAt' | 'dedupeId'> = {
    relatedMedicationId: null,
    observation: { id: 'obs', zh: '觀察', en: 'observation' },
    question: { id: 'q', zh: '問題', en: 'question' },
  }

  test('sorts by priority ascending, then by time descending', () => {
    const items: PreVisitBriefItem[] = [
      { ...base, ruleId: 'R4', priority: 4, occurredAt: '2026-07-10T00:00:00.000Z', dedupeId: 'a' },
      { ...base, ruleId: 'R1', priority: 2, occurredAt: '2026-07-08T00:00:00.000Z', dedupeId: 'b' },
      { ...base, ruleId: 'R1', priority: 2, occurredAt: '2026-07-12T00:00:00.000Z', dedupeId: 'c' },
    ]
    expect(rankPreVisitQuestions(items).map(item => item.dedupeId)).toEqual(['c', 'b', 'a'])
  })

  test('dedupes by relatedMedicationId when non-null, keeping the higher-ranked item', () => {
    const items: PreVisitBriefItem[] = [
      { ...base, ruleId: 'R1', priority: 2, occurredAt: '2026-07-08T00:00:00.000Z', dedupeId: 'a', relatedMedicationId: 'med-1' },
      { ...base, ruleId: 'R2', priority: 3, occurredAt: '2026-07-12T00:00:00.000Z', dedupeId: 'b', relatedMedicationId: 'med-1' },
    ]
    expect(rankPreVisitQuestions(items).map(item => item.dedupeId)).toEqual(['a'])
  })

  test('caps the result at 3 items after dedup', () => {
    const items: PreVisitBriefItem[] = Array.from({ length: 5 }, (_, index) => ({
      ...base, ruleId: 'R6' as const, priority: 5, occurredAt: '2026-07-08T00:00:00.000Z', dedupeId: `item-${index}`,
    }))
    expect(rankPreVisitQuestions(items)).toHaveLength(3)
  })
})
