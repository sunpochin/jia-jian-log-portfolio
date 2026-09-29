/*
檔案用途：驗證血壓週摘要純函式——依 ISO 週（週一為週首，台北時區）分組並計算平均值。
所在層：tests/unit 單元測試層。
主要關聯：對應 src/lib/bpWeeklySummary.ts（issue #735，#659 D 期）。
*/
import { describe, expect, test } from 'bun:test'
import { summarizeWeeklyBpRecords } from '../../src/lib/bpWeeklySummary'
import type { BpRecord } from '../../src/types/database'

function record(overrides: Partial<BpRecord> = {}): BpRecord {
  return {
    id: 'r1',
    patient_id: 'patient-1',
    systolic: 120,
    diastolic: 80,
    pulse: 70,
    measured_at: '2026-07-08T01:00:00.000Z',
    source: 'manual',
    recorded_by: null,
    recorded_by_user_id: null,
    created_at: '2026-07-08T01:00:00.000Z',
    ...overrides,
  }
}

describe('summarizeWeeklyBpRecords', () => {
  test('groups records into the same ISO week (Monday start, Asia/Taipei)', () => {
    // 2026-07-06（一）～2026-07-12（日）是同一個 ISO 週；07-13（一）是下一週。
    const summaries = summarizeWeeklyBpRecords([
      record({ id: 'a', measured_at: '2026-07-06T01:00:00.000Z', systolic: 120, diastolic: 80 }),
      record({ id: 'b', measured_at: '2026-07-12T10:00:00.000Z', systolic: 130, diastolic: 85 }),
      record({ id: 'c', measured_at: '2026-07-13T01:00:00.000Z', systolic: 140, diastolic: 90 }),
    ])

    expect(summaries).toHaveLength(2)
    expect(summaries[0].weekStart).toBe('2026-07-06')
    expect(summaries[0].recordCount).toBe(2)
    expect(summaries[0].avgSystolic).toBe(125)
    expect(summaries[0].avgDiastolic).toBe(83)
    expect(summaries[1].weekStart).toBe('2026-07-13')
    expect(summaries[1].recordCount).toBe(1)
  })

  test('averages pulse only over records that have one, and returns null when none do', () => {
    const withPulse = summarizeWeeklyBpRecords([
      record({ id: 'a', pulse: 60 }),
      record({ id: 'b', pulse: 80 }),
      record({ id: 'c', pulse: null }),
    ])
    expect(withPulse[0].avgPulse).toBe(70)

    const withoutPulse = summarizeWeeklyBpRecords([record({ id: 'a', pulse: null })])
    expect(withoutPulse[0].avgPulse).toBeNull()
  })

  test('sorts weeks chronologically ascending', () => {
    const summaries = summarizeWeeklyBpRecords([
      record({ id: 'later', measured_at: '2026-07-20T01:00:00.000Z' }),
      record({ id: 'earlier', measured_at: '2026-07-06T01:00:00.000Z' }),
    ])
    expect(summaries.map(summary => summary.weekStart)).toEqual(['2026-07-06', '2026-07-20'])
  })

  test('returns an empty list for no records', () => {
    expect(summarizeWeeklyBpRecords([])).toEqual([])
  })
})
