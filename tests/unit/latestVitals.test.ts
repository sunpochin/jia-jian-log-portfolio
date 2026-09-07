/*
檔案用途：測試最新生命徵象格式化、一分鐘倒數算式、狀態計算與量測間隔活躍度判斷。
所在層：tests/unit 單元測試層。
主要關聯：驗證 src/components/LatestVitals.tsx 邏輯。
*/
import { describe, expect, test } from 'bun:test'
import { formatLatestVitals, formatMeasurementInterval, getLatestVitalsStatus, isMeasurementIntervalActive } from '../../src/features/vitals/components/LatestVitals'
import type { BpRecord } from '../../src/types/database'

const record: BpRecord = {
  id: 'record-1',
  systolic: 120,
  diastolic: 80,
  pulse: 70,
  measured_at: '2026-07-16T12:13:02.000Z',
  source: 'manual_web',
  subject: 'nenek',
  recorded_by: null,
  created_at: '2026-07-16T12:13:02.000Z',
}

describe('LatestVitals formatting and status helper', () => {
  test('latest vital display uses Indonesian weekday and Taipei seconds', () => {
    expect(formatLatestVitals(record)).toEqual({ timestamp: 'Kam, 16 Jul 20:13:02', values: '120/80 ♥ 70' })
  })

  test('measurement interval counts down to the 60-second repeat threshold', () => {
    const measuredAt = '2026-07-16T12:13:02.000Z'
    expect(formatMeasurementInterval(measuredAt, Date.parse(measuredAt) + 23_000)).toBe('Tunggu 00:37')
    expect(formatMeasurementInterval(measuredAt, Date.parse(measuredAt) + 60_000)).toBe('Boleh ukur lagi')
    expect(formatMeasurementInterval(measuredAt, Date.parse(measuredAt) + 23_000, 'zh')).toBe('再等 00:37')
    expect(formatMeasurementInterval(measuredAt, Date.parse(measuredAt) + 60_000, 'zh')).toBe('可再量測')
    expect(isMeasurementIntervalActive(measuredAt, Date.parse(measuredAt) + 59_000)).toBe(true)
    expect(isMeasurementIntervalActive(measuredAt, Date.parse(measuredAt) + 60_000)).toBe(false)
  })

  test('getLatestVitalsStatus calculates loading, error, empty, and ready states', () => {
    expect(getLatestVitalsStatus({ record: null, loading: true, now: Date.now() })).toEqual({ state: 'loading' })
    expect(getLatestVitalsStatus({ record: null, error: true, now: Date.now() })).toEqual({ state: 'error' })
    expect(getLatestVitalsStatus({ record: null, now: Date.now() })).toEqual({ state: 'empty' })

    const readyStatus = getLatestVitalsStatus({ record, now: Date.parse(record.measured_at) + 10_000, locale: 'zh' })
    expect(readyStatus.state).toBe('ready')
    expect(readyStatus.intervalText).toBe('再等 00:50')
    expect(readyStatus.isActive).toBe(true)
  })
})
