/*
檔案用途：驗證照護大事記草稿驗證、複評提醒與時間軸漸進顯示規則。
所在層：tests/unit；保護 careTimeline 資料層不因 UI 或排程變更而放寬邊界。
主要關聯：src/lib/careTimeline.ts 與 CareTimeline 元件。
*/
import { describe, expect, test } from 'bun:test'
import { buildCareTimelineInsert, entriesInReportPeriod, eventReviewWindow, findTimelineReadingContext, isValidCareTimelineDraft, pendingReassessments, summarizeEventReviewDays, visibleCareTimelineEntries, type CareTimelineEntry } from '../../src/lib/careTimeline'
import type { BpRecord } from '../../src/types/database'

const record = (id: string, measured_at: string): BpRecord => ({ id, systolic: 120, diastolic: 70, pulse: 65, measured_at, source: 'manual', recorded_by: 'caregiver@example.com', patient_id: 'patient-1', created_at: measured_at })
const entry = (id: string, reassess_on: string | null): CareTimelineEntry => ({ id, patient_id: 'patient-1', event_type: 'reassessment', title: id, details: '', occurred_at: '2026-07-27T08:00:00.000Z', reassess_on, created_by: 'caregiver@example.com', created_at: '2026-07-27T08:00:00.000Z', medication_plan_id: null })

describe('care timeline helpers', () => {
  test('normalizes the authored entry without inventing a reassessment date', () => {
    expect(buildCareTimelineInsert('patient-1', 'doctor_instruction', '  Measure twice  ', '  morning and evening  ', '2026-07-27T08:30:00.000Z', '', ' Caregiver@Example.com ')).toEqual({
      patient_id: 'patient-1', event_type: 'doctor_instruction', title: 'Measure twice', details: 'morning and evening', occurred_at: '2026-07-27T08:30:00.000Z', reassess_on: null, created_by: 'caregiver@example.com', medication_plan_id: null,
    })
  })

  test('normalizes pet care event types (vaccination, symptom_observation, diet_change)', () => {
    expect(buildCareTimelineInsert('patient-pet', 'vaccination', '狂犬病疫苗', '年度定期施打', '2026-08-01T10:00:00.000Z', '', 'caregiver@example.com')).toEqual({
      patient_id: 'patient-pet', event_type: 'vaccination', title: '狂犬病疫苗', details: '年度定期施打', occurred_at: '2026-08-01T10:00:00.000Z', reassess_on: null, created_by: 'caregiver@example.com', medication_plan_id: null,
    })
    expect(buildCareTimelineInsert('patient-pet', 'symptom_observation', '觀察嘔吐', '早上吐毛球', '2026-08-01T10:00:00.000Z', '', 'caregiver@example.com')).toEqual({
      patient_id: 'patient-pet', event_type: 'symptom_observation', title: '觀察嘔吐', details: '早上吐毛球', occurred_at: '2026-08-01T10:00:00.000Z', reassess_on: null, created_by: 'caregiver@example.com', medication_plan_id: null,
    })
    expect(buildCareTimelineInsert('patient-pet', 'diet_change', '更換處方糧', '更換處方飼料', '2026-08-01T10:00:00.000Z', '', 'caregiver@example.com')).toEqual({
      patient_id: 'patient-pet', event_type: 'diet_change', title: '更換處方糧', details: '更換處方飼料', occurred_at: '2026-08-01T10:00:00.000Z', reassess_on: null, created_by: 'caregiver@example.com', medication_plan_id: null,
    })
  })

  test('keeps the note deliberately bounded for readable handover', () => {
    expect(isValidCareTimelineDraft('觀察紀錄', '')).toBe(true)
    expect(isValidCareTimelineDraft('   ', '')).toBe(false)
    expect(isValidCareTimelineDraft('a'.repeat(121), '')).toBe(false)
    expect(isValidCareTimelineDraft('標題', 'a'.repeat(2001))).toBe(false)
  })

  test('shows only the newest five entries until the timeline is expanded', () => {
    const entries = Array.from({ length: 7 }, (_, index) => entry(`entry-${index}`, null))
    expect(visibleCareTimelineEntries(entries, false).map(item => item.id)).toEqual(['entry-0', 'entry-1', 'entry-2', 'entry-3', 'entry-4'])
    expect(visibleCareTimelineEntries(entries, true)).toHaveLength(7)
    expect(visibleCareTimelineEntries(entries.slice(0, 3), false)).toHaveLength(3)
  })

  test('pairs an event with only the closest factual readings on either side', () => {
    const context = findTimelineReadingContext([record('too-old', '2026-07-24T08:00:00.000Z'), record('before', '2026-07-27T07:00:00.000Z'), record('after', '2026-07-27T10:00:00.000Z'), record('later', '2026-07-27T11:00:00.000Z')], '2026-07-27T08:00:00.000Z')
    expect(context.before?.id).toBe('before')
    expect(context.after?.id).toBe('after')
  })

  test('surfaces overdue and next-seven-day reassessments in date order', () => {
    expect(pendingReassessments([entry('later', '2026-08-05'), entry('overdue', '2026-07-25'), entry('soon', '2026-08-01'), entry('none', null)], '2026-07-27').map(item => item.id)).toEqual(['overdue', 'soon'])
  })

  test('does not pair a decision outside the selected report period with unrelated current readings', () => {
    expect(entriesInReportPeriod([{ ...entry('old', null), occurred_at: '2026-07-17T03:30:00.000Z' }, entry('current', null)], '2026-07-21T16:00:00.000Z', '2026-07-28T15:59:59.999Z').map(item => item.id)).toEqual(['current'])
  })

  test('uses Taipei calendar days for the complete seven-day-before-and-after review', () => {
    expect(eventReviewWindow('2026-07-17T03:30:00.000Z')).toMatchObject({ startDate: '2026-07-10', endDate: '2026-07-24' })
  })

  test('groups full-review readings by Taipei day and reports an honest pulse average', () => {
    expect(summarizeEventReviewDays([record('late', '2026-07-16T16:30:00.000Z'), { ...record('same-day', '2026-07-17T01:00:00.000Z'), systolic: 130, diastolic: 80, pulse: null }])).toEqual([{ date: '2026-07-17', recordCount: 2, avgSystolic: 125, avgDiastolic: 75, avgPulse: 65 }])
  })

  test('keeps an absent pulse absent and handles a review window with no readings', () => {
    expect(summarizeEventReviewDays([])).toEqual([])
    expect(summarizeEventReviewDays([{ ...record('no-pulse', '2026-07-17T01:00:00.000Z'), pulse: null }])[0]?.avgPulse).toBeNull()
  })
})
