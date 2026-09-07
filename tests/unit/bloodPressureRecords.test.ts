/*
檔案用途：驗證血壓寫入 adapter 使用固定 client id，讓網路回應遺失後的重送不新增第二筆。
所在層：tests/unit；以 Supabase query mock 驗證冪等 INSERT 與非重複錯誤傳播。
主要關聯：src/lib/bloodPressureRecords.ts、InputPage 與 blood_pressure_records 的 UUID primary key。
*/
import { describe, expect, mock, test } from 'bun:test'
import type { BloodPressureInsertPayload } from '../../src/lib/bloodPressureRecords'
import { isRetryableWriteError } from '../../src/lib/dataErrors'

const responses: Array<{ data?: unknown; error?: unknown }> = []
const calls: Array<{ method: string; args: unknown[] }> = []

function query(response: { data?: unknown; error?: unknown }) {
  const chain: Record<string, (...args: unknown[]) => unknown> = {}
  for (const method of ['select', 'eq', 'insert']) {
    chain[method] = (...args) => {
      calls.push({ method, args })
      return chain
    }
  }
  chain.maybeSingle = () => Promise.resolve(response)
  chain.then = (resolve, reject) => Promise.resolve(response).then(resolve, reject)
  return chain
}

const supabase = {
  from: () => query(responses.shift() ?? { data: null, error: null }),
}

mock.module('../../src/lib/supabase', () => ({ supabase }))

const { insertBloodPressureRecord } = await import('../../src/lib/bloodPressureRecords')

const payload: BloodPressureInsertPayload = {
  id: 'client-record-1', systolic: 132, diastolic: 78, pulse: 72,
  measured_at: '2026-08-22T03:00:00.000Z', source: 'manual_web',
  patient_id: 'patient-a', recorded_by: 'care@example.com',
}

describe('blood pressure insert adapter', () => {
  test('passes the fixed client UUID through on the first insert', async () => {
    calls.length = 0
    responses.push({ error: null })
    await expect(insertBloodPressureRecord(payload)).resolves.toBe('inserted')
    expect(calls.find(call => call.method === 'insert')?.args[0]).toMatchObject({ id: payload.id, patient_id: payload.patient_id })
  })

  test('treats a duplicate id as success only after reading that exact row', async () => {
    calls.length = 0
    responses.push({ error: { code: '23505' } }, { data: { id: payload.id }, error: null })
    await expect(insertBloodPressureRecord(payload)).resolves.toBe('already-existed')
    expect(calls.filter(call => call.method === 'eq')).toContainEqual({ method: 'eq', args: ['id', payload.id] })
  })

  test('does not hide a duplicate error when the id is not readable', async () => {
    const duplicate = { code: '23505', message: 'duplicate key' }
    responses.push({ error: duplicate }, { data: null, error: null })
    await expect(insertBloodPressureRecord(payload)).rejects.toEqual(duplicate)
  })

  test('carries the top-level HTTP status so transient failures are queued instead of shown as errors', async () => {
    calls.length = 0
    responses.push({ error: { code: '57014', message: 'timeout' }, status: 503 } as { error: unknown; status: number })
    let thrown: unknown
    try {
      await insertBloodPressureRecord(payload)
    } catch (error) {
      thrown = error
    }
    expect(isRetryableWriteError(thrown)).toBe(true)
  })
})
