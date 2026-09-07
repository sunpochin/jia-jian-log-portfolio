/*
檔案用途：驗證血壓 pending queue 的病人／帳號隔離、重試保留與本機去重契約。
所在層：tests/unit；保護離線時健康數值不因一次網路錯誤消失，也不會送到另一位病人。
主要關聯：src/lib/bloodPressurePendingQueue.ts、InputPage 與 DailyBloodPressureRecords。
*/
import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import {
  enqueuePendingBloodPressureRecord,
  flushPendingBloodPressureRecords,
  pendingBloodPressureRecordToView,
  readPendingBloodPressureRecords,
} from '../../src/lib/bloodPressurePendingQueue'

const originalLocalStorage = globalThis.localStorage
const values = new Map<string, string>()

function installStorage() {
  values.clear()
  ;(globalThis as typeof globalThis & { localStorage: Storage }).localStorage = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value) },
    removeItem: key => { values.delete(key) },
  } as Storage
}

const pendingRecord = (overrides: Partial<Parameters<typeof enqueuePendingBloodPressureRecord>[0]> = {}) => ({
  id: 'record-1',
  systolic: 132,
  diastolic: 78,
  pulse: 72,
  measured_at: '2026-08-22T03:00:00.000Z',
  source: 'manual_web',
  patient_id: 'patient-a',
  recorded_by: 'care@example.com',
  queued_at: '2026-08-22T03:01:00.000Z',
  ...overrides,
})

beforeEach(installStorage)
afterEach(() => {
  if (originalLocalStorage) {
    ;(globalThis as typeof globalThis & { localStorage: Storage }).localStorage = originalLocalStorage
  } else {
    delete (globalThis as typeof globalThis & { localStorage?: Storage }).localStorage
  }
})

describe('blood pressure pending queue', () => {
  test('keeps patient and account scopes separate and exposes an explicit pending view id', () => {
    expect(enqueuePendingBloodPressureRecord(pendingRecord())).toBe(true)
    expect(enqueuePendingBloodPressureRecord(pendingRecord({ id: 'record-2', patient_id: 'patient-b' }))).toBe(true)
    expect(enqueuePendingBloodPressureRecord(pendingRecord({ id: 'record-3', recorded_by: 'other@example.com' }))).toBe(true)

    expect(readPendingBloodPressureRecords('patient-a', 'CARE@example.com')).toHaveLength(1)
    expect(readPendingBloodPressureRecords('patient-b', 'care@example.com')).toHaveLength(1)
    expect(readPendingBloodPressureRecords('patient-a', 'other@example.com')).toHaveLength(1)
    expect(pendingBloodPressureRecordToView(pendingRecord()).id).toBe('pending-bp-record-1')
  })

  test('upserts the same client id instead of duplicating a retried measurement', () => {
    expect(enqueuePendingBloodPressureRecord(pendingRecord())).toBe(true)
    expect(enqueuePendingBloodPressureRecord(pendingRecord({ systolic: 135 }))).toBe(true)
    expect(readPendingBloodPressureRecords('patient-a', 'care@example.com')).toEqual([pendingRecord({ systolic: 135 })])
  })

  test('flushes in order and removes only records confirmed by the saver', async () => {
    enqueuePendingBloodPressureRecord(pendingRecord())
    enqueuePendingBloodPressureRecord(pendingRecord({ id: 'record-2', queued_at: '2026-08-22T03:02:00.000Z' }))
    const saved: string[] = []
    const result = await flushPendingBloodPressureRecords({
      patientId: 'patient-a',
      recordedBy: 'care@example.com',
      save: async record => { saved.push(record.id) },
    })

    expect(saved).toEqual(['record-1', 'record-2'])
    expect(result.blocked).toBe(false)
    expect(result.synced.map(record => record.id)).toEqual(saved)
    expect(result.remaining).toEqual([])
  })

  test('keeps the failed record and later records in order for a future retry', async () => {
    enqueuePendingBloodPressureRecord(pendingRecord())
    enqueuePendingBloodPressureRecord(pendingRecord({ id: 'record-2', queued_at: '2026-08-22T03:02:00.000Z' }))
    const result = await flushPendingBloodPressureRecords({
      patientId: 'patient-a',
      recordedBy: 'care@example.com',
      save: async () => { throw new TypeError('Failed to fetch') },
    })

    expect(result.blocked).toBe(true)
    expect(result.synced).toEqual([])
    expect(result.remaining.map(record => record.id)).toEqual(['record-1', 'record-2'])
  })

  test('skips a permanently failing record so later measurements still sync', async () => {
    enqueuePendingBloodPressureRecord(pendingRecord())
    enqueuePendingBloodPressureRecord(pendingRecord({ id: 'record-2', queued_at: '2026-08-22T03:02:00.000Z' }))
    const saved: string[] = []
    const result = await flushPendingBloodPressureRecords({
      patientId: 'patient-a',
      recordedBy: 'care@example.com',
      save: async record => {
        if (record.id === 'record-1') throw { code: '42501', message: 'permission denied' }
        saved.push(record.id)
      },
    })

    expect(saved).toEqual(['record-2'])
    expect(result.blocked).toBe(true)
    expect(result.synced.map(record => record.id)).toEqual(['record-2'])
    expect(result.remaining.map(record => record.id)).toEqual(['record-1'])
  })
})
