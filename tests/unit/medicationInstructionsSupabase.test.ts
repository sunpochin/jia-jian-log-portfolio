/*
檔案用途：驗證服用方式 B 層在正式（非 Demo）病人身上的 Supabase 新增／覆寫與清除路徑，
包含成功寫入與資料庫錯誤傳遞；Demo 病人路徑已由 medicationAdminDemo.test.ts 覆蓋。
所在層：tests/unit；用 thenable mock chain 代替真正的 Supabase SDK，不連線 staging 或 production。
主要關聯：src/lib/medication/medicationInstructions.ts 的 savePatientMedicationInstruction／clearPatientMedicationInstruction。
*/
import { beforeEach, describe, expect, mock, test } from 'bun:test'

type QueryResult = { data?: unknown; error?: unknown }
const calls: Array<{ method: string; args: unknown[] }> = []
let upsertResult: QueryResult = { data: null, error: null }
let deleteResult: QueryResult = { data: null, error: null }

function createChain(terminal: () => QueryResult) {
  const chain: Record<string, unknown> = {}
  for (const method of ['upsert', 'select', 'single', 'delete', 'eq']) {
    chain[method] = (...args: unknown[]) => { calls.push({ method, args }); return chain }
  }
  chain.then = (resolve: (value: QueryResult) => unknown, reject: (reason: unknown) => unknown) => Promise.resolve(terminal()).then(resolve, reject)
  return chain
}

const supabase = {
  from: (table: string) => createChain(() => (calls.some(call => call.method === 'delete') ? deleteResult : upsertResult)),
}

mock.module('../../src/lib/supabase', () => ({ supabase }))

const { savePatientMedicationInstruction, clearPatientMedicationInstruction } = await import('../../src/lib/medication/medicationInstructions')

beforeEach(() => {
  calls.length = 0
  upsertResult = { data: null, error: null }
  deleteResult = { data: null, error: null }
})

describe('savePatientMedicationInstruction — real (non-demo) patient', () => {
  test('upserts on patient_id,medication_id and returns the saved row', async () => {
    upsertResult = { data: { patient_id: 'patient-1', medication_id: 'med-1', instruction_codes: ['crush_ok'], instruction_note: '磨粉配水', source: 'pharmacist', confirmed_on: '2026-09-01' }, error: null }

    const saved = await savePatientMedicationInstruction({
      patientId: 'patient-1', medicationId: 'med-1', instructionCodes: ['crush_ok'],
      instructionNote: '磨粉配水', source: 'pharmacist', confirmedOn: '2026-09-01',
    })

    expect(saved).toMatchObject({ patient_id: 'patient-1', medication_id: 'med-1' })
    expect(calls[0]).toMatchObject({ method: 'upsert', args: [{ patient_id: 'patient-1', medication_id: 'med-1', instruction_codes: ['crush_ok'], instruction_note: '磨粉配水', source: 'pharmacist', confirmed_on: '2026-09-01' }, { onConflict: 'patient_id,medication_id' }] })
  })

  test('propagates a database error instead of silently dropping the instruction', async () => {
    const failure = new Error('write failed')
    upsertResult = { data: null, error: failure }

    await expect(savePatientMedicationInstruction({
      patientId: 'patient-1', medicationId: 'med-1', instructionCodes: ['swallow_whole'],
      instructionNote: '', source: 'doctor', confirmedOn: '2026-09-01',
    })).rejects.toBe(failure)
  })
})

describe('clearPatientMedicationInstruction — real (non-demo) patient', () => {
  test('deletes the row scoped to both patient and medication', async () => {
    await clearPatientMedicationInstruction('patient-1', 'med-1')
    expect(calls.map(call => call.method)).toEqual(['delete', 'eq', 'eq'])
    expect(calls[1].args).toEqual(['patient_id', 'patient-1'])
    expect(calls[2].args).toEqual(['medication_id', 'med-1'])
  })

  test('propagates a database error instead of pretending the instruction was cleared', async () => {
    const failure = new Error('delete failed')
    deleteResult = { data: null, error: failure }
    await expect(clearPatientMedicationInstruction('patient-1', 'med-1')).rejects.toBe(failure)
  })
})
