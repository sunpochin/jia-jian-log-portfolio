/*
檔案用途：驗證血壓 Dashboard 統計、夜間時段與 04:00 照護日分組。
所在層：tests/unit 單元測試層；以純函式輸入固定量測資料。
主要關聯：對應 src/lib/dashboardStats.ts 與 src/lib/careDay.ts 的統計規則。
*/
import { describe, expect, test } from 'bun:test'
import { alertMarkerColor, sessionFromMeasuredAt, SESSION_LABELS, summarizeBpRecords, summarizeTodayCare } from '../../src/lib/dashboardStats'
import type { BpRecord } from '../../src/types/database'

function record(overrides: Partial<BpRecord>): BpRecord {
  return {
    id: crypto.randomUUID(),
    systolic: 110,
    diastolic: 70,
    pulse: 70,
    measured_at: '2026-07-03T10:00:00.000Z',
    source: 'manual_web',
    subject: 'nenek',
    recorded_by: 'caregiver@example.com',
    created_at: '2026-07-03T10:01:00.000Z',
    ...overrides,
  }
}

describe('sessionFromMeasuredAt', () => {
  test('uses Asia/Taipei time before assigning night checkpoints', () => {
    expect(sessionFromMeasuredAt('2026-07-03T10:05:00.000Z')).toBe('malam1')
    expect(sessionFromMeasuredAt('2026-07-03T12:05:00.000Z')).toBe('malam2')
    expect(sessionFromMeasuredAt('2026-07-03T14:05:00.000Z')).toBe('malam3')
  })

  test('keeps malam3 for statistics without exposing the removed UI label', () => {
    expect(SESSION_LABELS.malam3).toMatchObject({ id: '', zh: '', en: '' })
  })
})

describe('summarizeBpRecords', () => {
  test('counts low nighttime readings separately from high alerts', () => {
    const summary = summarizeBpRecords([
      record({ systolic: 85, diastolic: 48, measured_at: '2026-07-03T10:05:00.000Z' }),
      record({ systolic: 150, diastolic: 82, measured_at: '2026-07-03T01:05:00.000Z' }),
      record({ systolic: 118, diastolic: 68, pulse: null, measured_at: '2026-07-03T04:05:00.000Z' }),
    ])

    expect(summary.recordCount).toBe(3)
    expect(summary.avgSystolic).toBe(118)
    expect(summary.avgDiastolic).toBe(66)
    expect(summary.avgPulse).toBe(70)
    expect(summary.alertCounts['danger-low']).toBe(1)
    expect(summary.alertCounts.warning).toBe(1)
    expect(summary.sessionCounts.malam1).toBe(1)
    expect(summary.nightLowCount).toBe(1)
  })

  test('counts pulse warnings separately from high blood-pressure records', () => {
    const summary = summarizeBpRecords([
      record({ systolic: 110, diastolic: 70, pulse: 121 }),
    ])

    // 醫師摘要若把心跳提示算進偏高血壓，會把兩種不同的觀察混成同一個結論。
    expect(summary.alertCounts.normal).toBe(1)
    expect(summary.alertCounts.warning).toBe(0)
    expect(summary.pulseWarningCount).toBe(1)
  })
})

describe('alertMarkerColor', () => {
  test('keeps chart markers aligned with the canonical alert categories', () => {
    expect(alertMarkerColor('normal')).toBe('#10b981')
    expect(alertMarkerColor('warning')).toBe('#f97316')
    expect(alertMarkerColor('warning-low')).toBe('#f97316')
    expect(alertMarkerColor('danger')).toBe('#ef4444')
    expect(alertMarkerColor('danger-low')).toBe('#ef4444')
  })
})

describe('summarizeTodayCare', () => {
  test('uses 04:00 care dates and keeps the latest reading for each night checkpoint', () => {
    const summary = summarizeTodayCare([
      record({ id: 'older-18', systolic: 88, diastolic: 52, measured_at: '2026-07-14T09:10:00.000Z' }),
      record({ id: 'latest-18', systolic: 90, diastolic: 55, measured_at: '2026-07-14T10:10:00.000Z' }),
      record({ id: '20', systolic: 112, diastolic: 70, measured_at: '2026-07-14T12:10:00.000Z' }),
      // 台北 00:10 仍屬前一個照護日，應和前晚夜間量測留在同一份交接摘要。
      record({ id: 'tomorrow', systolic: 120, diastolic: 72, measured_at: '2026-07-14T16:10:00.000Z' }),
    ], '2026-07-14')

    expect(summary.recordCount).toBe(4)
    expect(summary.latest?.id).toBe('tomorrow')
    expect(summary.checkpoints.malam1?.id).toBe('latest-18')
    expect(summary.checkpoints.malam2?.id).toBe('20')
    expect(summary.checkpoints.malam3?.id).toBe('tomorrow')
  })
})
