/*
檔案用途：驗證血壓今日明細的即時快照合併規則與「最新量測在最上面」的排序。
所在層：tests/unit；保護慢網路下先顯示已成功寫入紀錄的 UI adapter。
主要關聯：src/features/vitals/components/DailyBloodPressureRecords.tsx。
*/
import { describe, expect, test } from 'bun:test'
import { mergeOptimisticBpRecord, reconcileOptimisticBpRecords, sortBpRecordsByMeasuredAtDesc } from '../../src/features/vitals/components/DailyBloodPressureRecords'
import type { BpRecord } from '../../src/types/database'

const record = (overrides: Partial<BpRecord> = {}): BpRecord => ({
  id: 'bp-1',
  patient_id: 'patient-1',
  systolic: 141,
  diastolic: 69,
  pulse: 75,
  measured_at: '2026-08-14T14:09:00.000Z',
  created_at: '2026-08-14T14:09:00.000Z',
  recorded_by: 'caregiver@example.com',
  source: 'manual_web',
  ...overrides,
})

describe('mergeOptimisticBpRecord', () => {
  test('shows a successful new record before the background list query returns', () => {
    const next = mergeOptimisticBpRecord([], record({ id: 'pending-bp-1' }), 'patient-1')
    expect(next).toHaveLength(1)
    expect(next[0]).toMatchObject({ systolic: 141, diastolic: 69, pulse: 75 })
  })

  test('puts the newest measurement first so the latest reading is not buried at the bottom', () => {
    const earlier = record({ id: 'bp-earlier', measured_at: '2026-08-14T05:31:00.000Z', created_at: '2026-08-14T05:31:00.000Z' })
    const later = record({ id: 'bp-later', measured_at: '2026-08-14T07:38:00.000Z', created_at: '2026-08-14T07:38:00.000Z' })
    expect(mergeOptimisticBpRecord([earlier, later], null, 'patient-1').map(item => item.id)).toEqual(['bp-later', 'bp-earlier'])
  })

  test('places a just-saved snapshot above the older readings of the same care day', () => {
    const earlier = record({ id: 'bp-earlier', measured_at: '2026-08-14T05:31:00.000Z', created_at: '2026-08-14T05:31:00.000Z' })
    const pending = record({ id: 'pending-bp-1', measured_at: '2026-08-14T07:38:00.000Z', created_at: '2026-08-14T07:38:00.000Z' })
    expect(mergeOptimisticBpRecord([earlier], pending, 'patient-1').map(item => item.id)).toEqual(['pending-bp-1', 'bp-earlier'])
  })

  test('keeps a backfilled old measurement below the readings taken today', () => {
    const backfilled = record({ id: 'bp-backfilled', measured_at: '2026-08-01T09:00:00.000Z', created_at: '2026-08-14T08:00:00.000Z' })
    const today = record({ id: 'bp-today', measured_at: '2026-08-14T07:38:00.000Z', created_at: '2026-08-14T07:38:00.000Z' })
    expect(mergeOptimisticBpRecord([backfilled, today], null, 'patient-1').map(item => item.id)).toEqual(['bp-today', 'bp-backfilled'])
  })

  test('does not mix a record from another patient into the current list', () => {
    expect(mergeOptimisticBpRecord([], record({ patient_id: 'patient-2' }), 'patient-1')).toEqual([])
  })

  test('prefers the database row when the background query has the same measurement', () => {
    const canonical = record({ id: 'bp-canonical', systolic: 145 })
    const optimistic = record({ id: 'pending-bp-1', systolic: 145 })
    const next = mergeOptimisticBpRecord([canonical], optimistic, 'patient-1')
    expect(next).toEqual([canonical])
  })

  test('prefers the database row even when PostgREST formats the same instant differently than the client snapshot', () => {
    // 前端用 dayjs().toISOString() 產生 "...Z" 結尾；PostgREST 回傳 timestamptz 常見格式是 "...+00:00"。
    // 兩者是同一瞬間但字串不同，字串比對會誤判成不同紀錄，導致 pending 卡片一直卡著不消失。
    const canonical = record({ id: 'bp-canonical', measured_at: '2026-08-18T14:42:00.000+00:00', systolic: 124, diastolic: 69, pulse: 80 })
    const optimistic = record({ id: 'pending-bp-1', measured_at: '2026-08-18T14:42:00.000Z', systolic: 124, diastolic: 69, pulse: 80 })
    const next = mergeOptimisticBpRecord([canonical], optimistic, 'patient-1')
    expect(next).toEqual([canonical])
  })

  test('clears the snapshot after reconciliation so a later delete cannot resurrect it', () => {
    const canonical = record({ id: 'bp-canonical' })
    const reconciled = reconcileOptimisticBpRecords([canonical], record({ id: 'pending-bp-1' }), 'patient-1')
    const afterDelete = reconcileOptimisticBpRecords([], reconciled.optimisticRecord, 'patient-1')

    expect(reconciled.optimisticRecord).toBeNull()
    expect(afterDelete.records).toEqual([])
  })
})

describe('sortBpRecordsByMeasuredAtDesc', () => {
  test('breaks a measurement-time tie with the newer created_at so the order stays stable', () => {
    const firstSaved = record({ id: 'bp-first', created_at: '2026-08-14T07:38:10.000Z' })
    const secondSaved = record({ id: 'bp-second', created_at: '2026-08-14T07:38:40.000Z' })
    expect(sortBpRecordsByMeasuredAtDesc([firstSaved, secondSaved]).map(item => item.id)).toEqual(['bp-second', 'bp-first'])
  })

  test('does not mutate the list it was given', () => {
    const earlier = record({ id: 'bp-earlier', measured_at: '2026-08-14T05:31:00.000Z' })
    const later = record({ id: 'bp-later', measured_at: '2026-08-14T07:38:00.000Z' })
    const input = [earlier, later]
    sortBpRecordsByMeasuredAtDesc(input)
    expect(input.map(item => item.id)).toEqual(['bp-earlier', 'bp-later'])
  })
})
