/*
檔案用途：驗證服藥、藥單管理與近期血壓摘要 adapter 的 Supabase 查詢契約。
所在層：tests/unit 單元測試層；以鏈式 query mock 隔離遠端資料庫。
主要關聯：對應 src/lib/medications.ts、src/lib/medicationToday.ts 與 InputPage.utils.ts。
*/
import { beforeEach, describe, expect, mock, test } from 'bun:test'

type Response = { data?: unknown; error?: unknown }

const responses: Response[] = []
const calls: Array<{ table: string; method: string; args: unknown[] }> = []
let rpcResponse: Response = {}

function queuedResponse() {
  return responses.shift() ?? { data: null, error: null }
}

function query(table: string, response: Response) {
  const record = (method: string, ...args: unknown[]) => calls.push({ table, method, args })
  const chain: Record<string, (...args: unknown[]) => unknown> = {}
  for (const method of ['select', 'eq', 'gte', 'order', 'limit', 'in', 'not', 'insert', 'upsert', 'update', 'delete']) {
    chain[method] = (...args) => {
      record(method, ...args)
      return chain
    }
  }
  chain.single = () => Promise.resolve(response)
  chain.maybeSingle = () => Promise.resolve(response)
  chain.then = (resolve, reject) => Promise.resolve(response).then(resolve, reject)
  return chain
}

const supabase = {
  from(table: string) {
    calls.push({ table, method: 'from', args: [] })
    return query(table, queuedResponse())
  },
  rpc(name: string, args: unknown) {
    calls.push({ table: 'rpc', method: name, args: [args] })
    return Promise.resolve(rpcResponse)
  },
}

mock.module('../../src/lib/supabase', () => ({ supabase }))

const {
  addExistingMedicationPlan,
  createMedicationPlan,
  readMedicationAdminData,
  setMedicationPlanActive,
} = await import('../../src/lib/medicationAdmin')
const {
  clearMedicationDose,
  readMedicationDay,
  saveMedicationDose,
} = await import('../../src/lib/medications')
const {
  clearMedicationTodayLog,
  readMedicationTodayLog,
  saveMedicationTodayLog,
} = await import('../../src/lib/medicationToday')
const { fetchRecentSummary } = await import('../../src/features/vitals/pages/InputPage.utils')

const plan = {
  id: 'plan-1', account_email: ' Care@example.com ', patient_id: 'patient-1',
  medication_id: 'med-1', schedule_slot: 'morning', as_needed: false,
  dose_amount: 1, dose_count: 1, display_order: 1, active: true,
  created_at: '2026-07-17T00:00:00.000Z',
  medication: {
    id: 'med-1', drug_product_id: null, brand_name: 'Example', brand_name_zh: null, generic_name: 'Example', strength_mg: 5,
    dosage_form: 'tablet', appearance_note: null, appearance_color: null, appearance_shape: null, appearance_photo_url: null, created_at: '2026-07-17T00:00:00.000Z',
    specialties: [], verification_status: 'manually_verified' as const, tfda_license_number: null, nhi_drug_code: null,
  },
}

const log = {
  id: 'log-1', account_email: 'care@example.com', patient_id: 'patient-1',
  medication_id: 'med-1', medication_name: 'Example', plan_id: 'plan-1', dose_number: 1,
  taken_on: '2026-07-17', taken_at: '2026-07-17T01:00:00.000Z', created_at: '2026-07-17T01:00:00.000Z',
}

beforeEach(() => {
  responses.length = 0
  calls.length = 0
  rpcResponse = { error: null }
})

describe('medication admin adapters', () => {
  test('normalizes a new plan before sending the single RPC payload', async () => {
    await createMedicationPlan({
      brandName: ' Example ', brandNameZh: ' 範例藥 ', genericName: ' Generic ', strengthMg: 5, dosageForm: 'tablet',
      scheduleSlot: 'morning', doseAmount: 1, doseCount: 2, asNeeded: false, appearanceColor: 'white', appearanceShape: 'round', appearancePhotoUrl: '',
    }, 'patient-1', 'reviewed prescription')

    expect(calls[0]).toMatchObject({ table: 'rpc', method: 'apply_medication_plan_change' })
    expect(calls[0].args[0]).toMatchObject({
      p_patient_id: 'patient-1', p_brand_name: 'Example', p_brand_name_zh: '範例藥', p_generic_name: 'Generic',
      p_dose_count: 2, p_reason: 'reviewed prescription', p_action: 'create',
    })
  })

  test('returns all admin datasets and stops on any failed query', async () => {
    responses.push({ data: [{ id: 'plan-1' }], error: null }, { data: [{ id: 'med-1' }], error: null }, { data: [{ id: 'change-1' }], error: null })
    await expect(readMedicationAdminData('patient-1')).resolves.toEqual({
      plans: [{ id: 'plan-1' }], medications: [{ id: 'med-1' }], changes: [{ id: 'change-1' }],
    })
    // 官方關聯若沒在 adapter 的明確 select 中，migration 雖已回填，前端仍會把它丟掉。
    expect(calls.find(call => call.table === 'medications' && call.method === 'select')?.args[0]).toContain('drug_product_id')

    const failure = new Error('changes unavailable')
    responses.push({ data: [], error: null }, { data: [], error: null }, { data: null, error: failure })
    await expect(readMedicationAdminData('patient-1')).rejects.toBe(failure)
  })

  test('writes existing plans and active state with their safety keys', async () => {
    await addExistingMedicationPlan('med-1', 'patient-1', 'night', 0.5, true, 'dose adjusted')
    await addExistingMedicationPlan('med-1', 'patient-1', 'after_dinner', 1, false, 'schedule corrected', 'plan-1')
    await setMedicationPlanActive('plan-1', false, 'patient-1', 'stopped by doctor')

    expect(calls.filter(call => call.table === 'rpc').map(call => call.method)).toEqual(['apply_medication_plan_change', 'apply_medication_plan_change', 'apply_medication_plan_change'])
    expect(calls.filter(call => call.table === 'rpc').map(call => call.args[0])).toContainEqual(expect.objectContaining({ p_action: 'update', p_plan_id: 'plan-1', p_schedule_slot: 'after_dinner' }))
    expect(calls.filter(call => call.table === 'rpc').map(call => call.args[0])).toContainEqual(expect.objectContaining({ p_action: 'deactivate', p_reason: 'stopped by doctor' }))
  })

})

describe('structured medication dose adapters', () => {
  test('joins plans to catalog entries and ignores an incomplete catalog item', async () => {
    responses.push(
      { data: [plan, { ...plan, id: 'missing-plan', medication_id: 'missing' }], error: null },
      { data: [plan.medication], error: null },
      { data: [log], error: null },
    )

    await expect(readMedicationDay('patient-1', '2026-07-17')).resolves.toEqual({ plans: [plan], logs: [log], prnEvents: [], prnAssessments: [] })
  })

  test('returns the saved dose, reads a concurrent duplicate, and propagates failures', async () => {
    responses.push({ data: log, error: null })
    await expect(saveMedicationDose(plan, '2026-07-17', 1, 'portfolio-author@example.com')).resolves.toEqual(log)
    expect(calls.find(call => call.table === 'medication_intake_logs' && call.method === 'insert')?.args[0]).toMatchObject({ account_email: 'portfolio-author@example.com', patient_id: 'patient-1' })

    responses.push({ data: null, error: { code: '23505' } }, { data: log, error: null })
    await expect(saveMedicationDose(plan, '2026-07-17', 1, 'portfolio-author@example.com')).resolves.toEqual(log)

    const failure = new Error('write failed')
    responses.push({ data: null, error: failure })
    await expect(saveMedicationDose(plan, '2026-07-17', 1, 'portfolio-author@example.com')).rejects.toBe(failure)
  })

  test('clears only the selected subject, plan, date, and dose', async () => {
    await clearMedicationDose('plan-1', 'patient-1', '2026-07-17', 2)
    expect(calls.filter(call => call.method === 'eq').map(call => call.args)).toEqual([
      ['patient_id', 'patient-1'], ['plan_id', 'plan-1'], ['care_date', '2026-07-17'], ['dose_number', 2],
    ])
  })
})

describe('today medication adapters', () => {
  test('returns null for no log, maps a found log, and clears the same daily key', async () => {
    responses.push({ data: null, error: null }, { data: log, error: null }, { error: null })
    await expect(readMedicationTodayLog(' Care@example.com ', 'med-1', '2026-07-17')).resolves.toBeNull()
    await expect(readMedicationTodayLog(' Care@example.com ', 'med-1', '2026-07-17')).resolves.toMatchObject({ medicationId: 'med-1' })
    await expect(clearMedicationTodayLog(' Care@example.com ', 'med-1', '2026-07-17')).resolves.toBeUndefined()
  })

  test('maps a successful save and reads back a duplicate from another device', async () => {
    responses.push({ data: log, error: null })
    await expect(saveMedicationTodayLog(' Care@example.com ', 'med-1', '2026-07-17')).resolves.toMatchObject({
      accountEmail: 'care@example.com', medicationId: 'med-1',
    })

    responses.push({ data: null, error: { code: '23505' } }, { data: log, error: null })
    await expect(saveMedicationTodayLog(' Care@example.com ', 'med-1', '2026-07-17')).resolves.toMatchObject({ id: 'log-1' })
  })

  test('a non-duplicate insert failure is thrown instead of being treated as an already-saved dose', async () => {
    const failure = { code: '42501', message: 'permission denied' }
    responses.push({ data: null, error: failure })
    await expect(saveMedicationTodayLog(' Care@example.com ', 'med-1', '2026-07-17')).rejects.toEqual(failure)
  })
})

describe('recent blood-pressure summary', () => {
  const motherPatientId = '44a81824-fbc3-48af-9841-1401a9167073'

  test('averages each Taipei date and session while keeping the newest groups', async () => {
    // 資料庫以最新量測優先回傳；測試也必須維持相同順序，才能防止摘要誤取舊時間。
    responses.push({ data: [
      { systolic: 130, diastolic: 90, pulse: null, measured_at: '2026-07-17T00:05:00.000Z' },
      { systolic: 120, diastolic: 80, pulse: 70, measured_at: '2026-07-17T00:00:00.000Z' },
    ], error: null })

    await expect(fetchRecentSummary(motherPatientId)).resolves.toEqual([{
      dateStr: '7/17', timeStr: '08:05', session: 'pagi', avgSys: 125, avgDia: 85, avgPul: 70,
    }])
    expect(calls.filter(call => call.method === 'eq').map(call => call.args)).toContainEqual(['patient_id', motherPatientId])
  })

  test('returns an empty summary without attempting to average missing records', async () => {
    responses.push({ data: [], error: null })
    await expect(fetchRecentSummary(motherPatientId)).resolves.toEqual([])
  })
})
