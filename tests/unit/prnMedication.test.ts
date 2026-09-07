/*
檔案用途：驗證 PRN 使用事件的照護日、狀態投影、冪等重試與作廢資料轉接。
所在層：tests/unit；隔離 Supabase query chain，不連接真實資料庫。
主要關聯：對應 src/lib/prnMedication.ts 與 PRN 每日照護元件。
*/
import { beforeEach, describe, expect, mock, test } from 'bun:test'
import dayjs from 'dayjs'
import type { MedicationPlanView } from '../../src/lib/medications'
import type { PrnMedicationEvent } from '../../src/types/database'

type Response = { data?: unknown; error?: unknown }
const responses: Response[] = []
const calls: Array<{ table: string; method: string; args: unknown[] }> = []

function query(table: string, response: Response) {
  const chain: Record<string, (...args: unknown[]) => unknown> = {}
  for (const method of ['select', 'eq', 'in', 'order', 'insert', 'update', 'upsert']) {
    chain[method] = (...args) => {
      calls.push({ table, method, args })
      return chain
    }
  }
  chain.onConflict = (...args) => {
    calls.push({ table, method: 'onConflict', args })
    return chain
  }
  chain.single = () => Promise.resolve(response)
  chain.then = (resolve, reject) => Promise.resolve(response).then(resolve, reject)
  return chain
}

const supabase = {
  from(table: string) {
    calls.push({ table, method: 'from', args: [] })
    return query(table, responses.shift() ?? { data: null, error: null })
  },
}

mock.module('../../src/lib/supabase', () => ({ supabase }))

const {
  buildPrnMedicationEventInsert,
  createPrnEventId,
  formatPrnEffectStatus,
  getActivePrnEvents,
  getPrnDailyStatus,
  prnCalendarDateLabel,
  prnDoseUnitForDosageForm,
  prnEffectStatusLabel,
  prnEventLocalDateTime,
  readPrnMedicationDay,
  savePrnDailyAssessment,
  savePrnMedicationEvent,
  updatePrnMedicationEffectStatus,
  voidPrnMedicationEvent,
} = await import('../../src/lib/prnMedication')

const plan: MedicationPlanView = {
  id: 'prn-plan-1',
  account_email: 'care@example.com',
  patient_id: 'patient-1',
  medication_id: 'med-1',
  schedule_slot: 'before_bed',
  as_needed: true,
  dose_amount: 1,
  dose_count: 1,
  display_order: 1,
  active: true,
  created_at: '2026-08-01T00:00:00.000Z',
  medication: {
    id: 'med-1', drug_product_id: null, brand_name: 'Example', brand_name_zh: null, generic_name: 'Example', strength_mg: 5,
    dosage_form: 'tablet', specialties: [], verification_status: 'manually_verified', tfda_license_number: null, nhi_drug_code: null,
    appearance_note: null, appearance_color: null, appearance_shape: null, appearance_photo_url: null, created_at: '2026-08-01T00:00:00.000Z',
  },
}

const event: PrnMedicationEvent = {
  id: 'event-1', patient_id: 'patient-1', plan_id: plan.id, medication_id: plan.medication_id,
  taken_at: '2026-08-01T04:30:00.000Z', care_date: '2026-08-01', dose_amount: 1, dose_unit: 'tablet',
  reason: 'symptom', effect_status: 'pending', notes: null, recorded_by_user_id: 'user-1', recorded_by_email: 'care@example.com',
  status: 'active', voided_at: null, voided_by_user_id: null, voided_by_email: null, void_reason: null, created_at: '2026-08-01T04:30:00.000Z',
}

beforeEach(() => {
  responses.length = 0
  calls.length = 0
})

describe('PRN event contract', () => {
  test('uses actual time and care day, not routine dose_number', () => {
    expect(buildPrnMedicationEventInsert({
      plan,
      careDate: '2026-08-01',
      doseAmount: 0.5,
      doseUnit: 'tablet',
      reason: ' 頭暈 ',
      effectStatus: 'pending',
      notes: '觀察',
      takenAt: '2026-08-01T12:00:00+08:00',
      recordedByEmail: ' Care@example.com ',
    }, 'event-fixed')).toEqual({
      id: 'event-fixed', patient_id: 'patient-1', plan_id: 'prn-plan-1', medication_id: 'med-1',
      taken_at: '2026-08-01T04:00:00.000Z', care_date: '2026-08-01', dose_amount: 0.5, dose_unit: 'tablet',
      reason: '頭暈', effect_status: 'pending', notes: '觀察', recorded_by_email: 'care@example.com',
    })
  })

  test('interprets datetime-local wall time in the care timezone', () => {
    const inserted = buildPrnMedicationEventInsert({
      plan,
      careDate: '2026-08-01',
      doseAmount: 1,
      doseUnit: 'tablet',
      reason: '頭暈',
      effectStatus: 'pending',
      notes: '',
      takenAt: '2026-08-01T12:00',
      recordedByEmail: 'care@example.com',
    }, 'event-wall-time')
    expect(inserted.taken_at).toBe('2026-08-01T04:00:00.000Z')
  })

  test('derives used only from active events and keeps not-needed separate from unknown', () => {
    expect(getPrnDailyStatus(plan.id, [], [])).toBe('not_assessed')
    expect(getPrnDailyStatus(plan.id, [], [{ plan_id: plan.id, status: 'not_needed' } as never])).toBe('not_needed')
    expect(getPrnDailyStatus(plan.id, [{ ...event, status: 'voided' }], [{ plan_id: plan.id, status: 'not_needed' } as never])).toBe('not_needed')
    expect(getPrnDailyStatus(plan.id, [event], [{ plan_id: plan.id, status: 'not_needed' } as never])).toBe('used')
    expect(getActivePrnEvents(plan.id, [{ ...event, taken_at: '2026-08-01T05:00:00.000Z' }, event])).toHaveLength(2)
  })

  test('returns the existing event when the same id is retried', async () => {
    responses.push({ data: null, error: { code: '23505' } }, { data: event, error: null })
    await expect(savePrnMedicationEvent({
      plan, careDate: '2026-08-01', doseAmount: 1, doseUnit: 'tablet', reason: 'symptom', effectStatus: 'pending', notes: '',
      takenAt: dayjs('2026-08-01T04:30:00Z').toISOString(), recordedByEmail: 'care@example.com', idempotencyKey: event.id,
    })).resolves.toEqual(event)
    expect(calls.filter(call => call.table === 'prn_medication_events' && call.method === 'insert')).toHaveLength(1)
    expect(calls).toContainEqual({ table: 'prn_medication_events', method: 'eq', args: ['id', event.id] })
  })
})

describe('prn dose units', () => {
  test('records powdered medicine in sachets instead of tablets', () => {
    // PRN 粉包的使用量是「幾包」；沿用 tablet 會讓紀錄寫成吃了半顆粉。
    expect(prnDoseUnitForDosageForm('powder')).toBe('sachet')
    expect(prnDoseUnitForDosageForm('capsule')).toBe('capsule')
    expect(prnDoseUnitForDosageForm('liquid')).toBe('dose')
    expect(prnDoseUnitForDosageForm('tablet')).toBe('tablet')
  })
})

describe('PRN input validation', () => {
  const baseInput = {
    plan,
    careDate: '2026-08-01',
    doseAmount: 1,
    doseUnit: ' tablet ',
    reason: ' 頭痛 ',
    effectStatus: 'pending' as const,
    notes: '  ',
    takenAt: '2026-08-01T12:30',
    recordedByEmail: '  Care@Example.com ',
  }

  test('trims the free-text fields and lowercases the recorder email', () => {
    const payload = buildPrnMedicationEventInsert(baseInput, 'event-fixed')
    expect(payload).toMatchObject({ id: 'event-fixed', dose_unit: 'tablet', reason: '頭痛', notes: null, recorded_by_email: 'care@example.com' })
  })

  test('rejects a time the browser cannot parse', () => {
    // 帶 offset 的值走 dayjs() 解析；不可能的日期必須在寫入前就被擋下，而不是變成另一天的紀錄。
    expect(() => buildPrnMedicationEventInsert({ ...baseInput, takenAt: '2026-13-45T99:99:99Z' })).toThrow('Invalid PRN event time')
  })

  test('refuses to file a dose under a care day it does not belong to', () => {
    // 若時間與畫面照護日不一致，紀錄會被寫進另一日卻仍顯示在今天。
    expect(() => buildPrnMedicationEventInsert({ ...baseInput, careDate: '2026-08-02' })).toThrow('PRN event time is outside the selected care day')
  })

  test('refuses a non-positive or non-finite dose', () => {
    expect(() => buildPrnMedicationEventInsert({ ...baseInput, doseAmount: 0 })).toThrow('PRN dose amount must be greater than zero')
    expect(() => buildPrnMedicationEventInsert({ ...baseInput, doseAmount: Number.NaN })).toThrow('PRN dose amount must be greater than zero')
  })

  test('requires a reason so a PRN dose is never unexplained', () => {
    expect(() => buildPrnMedicationEventInsert({ ...baseInput, reason: '   ' })).toThrow('PRN reason is required')
  })

  test('creates an id the database accepts as a UUID idempotency key', () => {
    expect(createPrnEventId()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)
  })

  test('formats the local datetime-local default in the care timezone', () => {
    expect(prnEventLocalDateTime(dayjs('2026-08-01T12:30:00.000Z'))).toBe('2026-08-01T20:30')
    expect(prnCalendarDateLabel('2026-08-01T12:30:00.000Z')).toBe('2026-08-01')
  })

  test('every effect status has both languages', () => {
    for (const status of ['pending', 'helped', 'not_helped', 'unsure'] as const) {
      expect(formatPrnEffectStatus(status).zh.length).toBeGreaterThan(0)
      expect(formatPrnEffectStatus(status).id.length).toBeGreaterThan(0)
    }
    expect(prnEffectStatusLabel('helped')).toEqual(formatPrnEffectStatus('helped'))
  })
})

describe('PRN day reading', () => {
  test('skips the query entirely when there is no PRN plan on screen', async () => {
    await expect(readPrnMedicationDay('patient-1', '2026-08-01', [])).resolves.toEqual({ events: [], assessments: [] })
    expect(calls).toHaveLength(0)
  })

  test('reads events and assessments scoped to the patient and care day', async () => {
    responses.push({ data: [event], error: null }, { data: [], error: null })
    await expect(readPrnMedicationDay('patient-1', '2026-08-01', [plan.id])).resolves.toEqual({ events: [event], assessments: [] })
    expect(calls.filter(call => call.method === 'eq')).toEqual([
      { table: 'prn_medication_events', method: 'eq', args: ['patient_id', 'patient-1'] },
      { table: 'prn_medication_events', method: 'eq', args: ['care_date', '2026-08-01'] },
      { table: 'prn_medication_daily_assessments', method: 'eq', args: ['patient_id', 'patient-1'] },
      { table: 'prn_medication_daily_assessments', method: 'eq', args: ['care_date', '2026-08-01'] },
    ])
  })

  test('treats a missing PRN migration as an empty day so routine medication keeps working', async () => {
    responses.push({ data: null, error: { code: '42P01', message: 'relation does not exist' } })
    await expect(readPrnMedicationDay('patient-1', '2026-08-01', [plan.id])).resolves.toEqual({ events: [], assessments: [] })

    calls.length = 0
    responses.push({ data: [event], error: null }, { data: null, error: { message: "Could not find the table 'prn_medication_daily_assessments' in the schema cache" } })
    await expect(readPrnMedicationDay('patient-1', '2026-08-01', [plan.id])).resolves.toEqual({ events: [event], assessments: [] })
  })

  test('surfaces a real database failure instead of hiding PRN history', async () => {
    const failure = { code: '42501', message: 'permission denied' }
    responses.push({ data: null, error: failure })
    await expect(readPrnMedicationDay('patient-1', '2026-08-01', [plan.id])).rejects.toEqual(failure)

    responses.push({ data: [], error: null }, { data: null, error: failure })
    await expect(readPrnMedicationDay('patient-1', '2026-08-01', [plan.id])).rejects.toEqual(failure)
  })
})

describe('PRN event writes', () => {
  test('surfaces an insert failure that is not a duplicate retry', async () => {
    const failure = { code: '23514', message: 'check constraint' }
    responses.push({ data: null, error: failure })
    await expect(savePrnMedicationEvent({
      plan, careDate: '2026-08-01', doseAmount: 1, doseUnit: 'tablet', reason: '頭痛',
      effectStatus: 'pending', notes: '', takenAt: '2026-08-01T12:30', recordedByEmail: 'care@example.com',
    })).rejects.toEqual(failure)
  })

  test('voiding requires a reason and writes the voided status for the same patient', async () => {
    await expect(voidPrnMedicationEvent(event, 'patient-1', '   ')).rejects.toThrow('A reason is required to void a PRN event')

    responses.push({ data: { ...event, status: 'voided' }, error: null })
    await expect(voidPrnMedicationEvent(event, 'patient-1', ' 記錯藥品 ')).resolves.toMatchObject({ status: 'voided' })
    expect(calls.find(call => call.method === 'update')?.args[0]).toEqual({ status: 'voided', void_reason: '記錯藥品' })
    expect(calls.filter(call => call.method === 'eq')).toEqual([
      { table: 'prn_medication_events', method: 'eq', args: ['id', event.id] },
      { table: 'prn_medication_events', method: 'eq', args: ['patient_id', 'patient-1'] },
    ])
  })

  test('a failed void is reported instead of showing the dose as cancelled', async () => {
    const failure = { code: '42501', message: 'permission denied' }
    responses.push({ data: null, error: failure })
    await expect(voidPrnMedicationEvent(event, 'patient-1', '記錯藥品')).rejects.toEqual(failure)
  })

  test('effect status updates only touch the assessment column', async () => {
    responses.push({ data: { ...event, effect_status: 'helped' }, error: null })
    await expect(updatePrnMedicationEffectStatus(event, 'patient-1', 'helped')).resolves.toMatchObject({ effect_status: 'helped' })
    expect(calls.find(call => call.method === 'update')?.args[0]).toEqual({ effect_status: 'helped' })

    const failure = { code: '42501', message: 'permission denied' }
    responses.push({ data: null, error: failure })
    await expect(updatePrnMedicationEffectStatus(event, 'patient-1', 'helped')).rejects.toEqual(failure)
  })

  test('a daily assessment upserts on patient, plan, and care day', async () => {
    responses.push({ data: { id: 'assessment-1' }, error: null })
    await expect(savePrnDailyAssessment('patient-1', plan.id, '2026-08-01', 'not_needed', '  ')).resolves.toMatchObject({ id: 'assessment-1' })
    const upsert = calls.find(call => call.method === 'upsert')
    expect(upsert?.args[0]).toEqual({ patient_id: 'patient-1', plan_id: plan.id, care_date: '2026-08-01', status: 'not_needed', notes: null })
    expect(upsert?.args[1]).toEqual({ onConflict: 'patient_id,plan_id,care_date' })

    const failure = { code: '42501', message: 'permission denied' }
    responses.push({ data: null, error: failure })
    await expect(savePrnDailyAssessment('patient-1', plan.id, '2026-08-01', 'used')).rejects.toEqual(failure)
  })
})
