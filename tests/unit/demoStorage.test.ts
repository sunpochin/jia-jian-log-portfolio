/*
檔案用途：驗證免登入 Demo 的血壓與藥單本機試用狀態能新增、修改、刪除並持續讀回。
所在層：tests/unit；保護 demo-only adapter 不會誤呼叫正式 Supabase 資料流。
主要關聯：對應 src/lib/demoStorage.ts，模擬瀏覽器 localStorage 與 /demo 路徑。
*/
import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { calendarDateKey } from '../../src/lib/careDay'
import { DEMO_CAT_PATIENT_ID, DEMO_MEILING_PATIENT_ID } from '../../src/lib/demoData'
import {
  addExistingDemoMedicationPlan,
  clearDemoMedicationDose,
  deactivateDemoMedicationPlan,
  getDemoBpRecords,
  getDemoBpRecordsCreatedBetween,
  getDemoTemperatureRecordsCreatedBetween,
  createDemoMedicationPlan,
  deleteDemoBpRecord,
  deleteDemoTemperatureRecord,
  getDemoTemperatureRecords,
  readDemoMedicationAdminData,
  readDemoMedicationDay,
  readDemoMedicationHistory,
  readDemoPetAppetiteRecords,
  readDemoPetDigestionRecords,
  readDemoPetDigestionRecord,
  readDemoPetFluidRecords,
  readDemoPetGlucoseRecords,
  readDemoPetInsulinRecords,
  readDemoPetLiquidIntakeRecords,
  readDemoPetLiquidIntakeRecord,
  readDemoPrnMedicationDay,
  readDemoWeightRecords,
  saveDemoPetAppetiteRecord,
  saveDemoPetDigestionRecord,
  saveDemoPetFluidRecord,
  saveDemoPetGlucoseRecord,
  saveDemoPetInsulinRecord,
  saveDemoPetLiquidIntakeRecord,
  saveDemoPrnDailyAssessment,
  saveDemoPrnMedicationEvent,
  saveDemoWeightRecord,
  updateDemoPrnMedicationEffectStatus,
  voidDemoPrnMedicationEvent,
  saveDemoBpRecord,
  saveDemoTemperatureRecord,
  saveDemoMedicationDose,
  readDemoMealData,
  saveDemoMealItem,
  searchDemoMealFoodCatalog,
  updateDemoBpRecord,
  updateDemoTemperatureRecord,
} from '../../src/lib/demoStorage'

const originalWindow = globalThis.window
const values = new Map<string, string>()
let writeFails = false
let readFails = false

const fakeWindow = {
  location: { pathname: '/demo' },
  localStorage: {
    getItem: (key: string) => {
      if (readFails) throw new Error('storage read blocked')
      return values.get(key) ?? null
    },
    setItem: (key: string, value: string) => {
      if (writeFails) throw new Error('storage quota exceeded')
      values.set(key, value)
    },
    removeItem: (key: string) => values.delete(key),
  },
} as unknown as Window & typeof globalThis

beforeEach(() => {
  values.clear()
  writeFails = false
  readFails = false
  globalThis.window = fakeWindow
})

afterEach(() => {
  if (originalWindow) globalThis.window = originalWindow
  else delete (globalThis as { window?: Window & typeof globalThis }).window
})

describe('demo blood-pressure storage', () => {
  test('keeps a new local reading in the same demo history and daily list', () => {
    const measuredAt = new Date().toISOString()
    const saved = saveDemoBpRecord({ patient_id: DEMO_MEILING_PATIENT_ID, systolic: 135, diastolic: 82, pulse: 76, measured_at: measuredAt })

    expect(getDemoBpRecords(7, DEMO_MEILING_PATIENT_ID)[0]).toMatchObject({ id: saved.id, systolic: 135, diastolic: 82 })
    expect(getDemoBpRecordsCreatedBetween(DEMO_MEILING_PATIENT_ID, new Date(Date.now() - 60_000).toISOString(), new Date(Date.now() + 60_000).toISOString())).toHaveLength(1)

    expect(updateDemoBpRecord(saved.id, DEMO_MEILING_PATIENT_ID, { systolic: 128, diastolic: 78, pulse: 72 })).toBe(true)
    expect(getDemoBpRecords(7, DEMO_MEILING_PATIENT_ID)[0]).toMatchObject({ id: saved.id, systolic: 128, diastolic: 78, pulse: 72 })
  })
})

describe('demo temperature storage', () => {
  test('keeps a local temperature entry editable without touching Supabase', () => {
    const measuredAt = new Date().toISOString()
    const saved = saveDemoTemperatureRecord({
      patient_id: DEMO_MEILING_PATIENT_ID,
      temperature_c: 38.2,
      measurement_site: 'ear',
      context: 'symptoms',
      notes: '咳嗽',
      measured_at: measuredAt,
    })

    expect(getDemoTemperatureRecordsCreatedBetween(DEMO_MEILING_PATIENT_ID, new Date(Date.now() - 60_000).toISOString(), new Date(Date.now() + 60_000).toISOString())).toContainEqual(saved)
    expect(updateDemoTemperatureRecord(saved.id, DEMO_MEILING_PATIENT_ID, { temperature_c: 37.8, measurement_site: 'forehead', context: 'after_medication', notes: null })).toBe(true)
    expect(getDemoTemperatureRecordsCreatedBetween(DEMO_MEILING_PATIENT_ID, new Date(Date.now() - 60_000).toISOString(), new Date(Date.now() + 60_000).toISOString())[0]).toMatchObject({ temperature_c: 37.8, measurement_site: 'forehead' })
  })
})

describe('demo medication storage', () => {
  test('keeps one plan for the same medication and schedule slot', () => {
    const initial = readDemoMedicationAdminData(DEMO_MEILING_PATIENT_ID)
    const existingPlan = initial.plans[0]
    if (!existingPlan) throw new Error('Expected seeded demo medication plan')

    // 同一時段重試時要更新原醫囑，避免試用者看到兩張其實相同的藥單。
    addExistingDemoMedicationPlan(existingPlan.medication_id, DEMO_MEILING_PATIENT_ID, existingPlan.schedule_slot, 0.5, false, 'demo retry')

    const matchingPlans = readDemoMedicationAdminData(DEMO_MEILING_PATIENT_ID).plans.filter(plan =>
      plan.medication_id === existingPlan.medication_id && plan.schedule_slot === existingPlan.schedule_slot,
    )
    expect(matchingPlans).toHaveLength(1)
    expect(matchingPlans[0]).toMatchObject({ id: existingPlan.id, dose_amount: 0.5, active: true })
  })

  test('applies the selected medication and schedule when editing by plan id', () => {
    const initial = readDemoMedicationAdminData(DEMO_MEILING_PATIENT_ID)
    const existingPlan = initial.plans[0]
    const replacementMedication = initial.medications.find(medication => medication.id !== existingPlan?.medication_id)
    if (!existingPlan || !replacementMedication) throw new Error('Expected seeded demo plan and replacement medication')

    // 這條路徑模擬後台的「調整」按鈕；固定 plan id 才能證明原本那張藥單真的被改寫。
    addExistingDemoMedicationPlan(replacementMedication.id, DEMO_MEILING_PATIENT_ID, 'bedtime', 1, false, 'demo schedule update', 'demo.visitor@example.test', existingPlan.id)

    const updated = readDemoMedicationAdminData(DEMO_MEILING_PATIENT_ID).plans.find(plan => plan.id === existingPlan.id)
    expect(updated).toMatchObject({ id: existingPlan.id, medication_id: replacementMedication.id, schedule_slot: 'bedtime', dose_amount: 1, active: true })
  })

  test('persists medication dose checks and plan changes without database writes', () => {
    const initial = readDemoMedicationDay(DEMO_MEILING_PATIENT_ID, '2026-08-05')
    const plan = initial.plans[0]
    if (!plan) throw new Error('Expected seeded demo medication')

    const saved = saveDemoMedicationDose(plan, '2026-08-05', 1, 'visitor@example.test')
    expect(readDemoMedicationDay(DEMO_MEILING_PATIENT_ID, '2026-08-05').logs).toEqual([saved])
    expect(clearDemoMedicationDose(plan.id, DEMO_MEILING_PATIENT_ID, '2026-08-05', 1)).toBe(true)
    expect(readDemoMedicationDay(DEMO_MEILING_PATIENT_ID, '2026-08-05').logs).toHaveLength(0)

    const admin = readDemoMedicationAdminData(DEMO_MEILING_PATIENT_ID)
    const removable = admin.plans.find(candidate => candidate.active)
    if (!removable) throw new Error('Expected active demo medication plan')
    deactivateDemoMedicationPlan(removable.id, DEMO_MEILING_PATIENT_ID, 'demo test')
    expect(readDemoMedicationAdminData(DEMO_MEILING_PATIENT_ID).plans.find(candidate => candidate.id === removable.id)?.active).toBe(false)

    const medication = admin.medications.find(candidate => candidate.id === 'demo-med-isormol-5')
    if (!medication) throw new Error('Expected seeded demo medication catalog')
    addExistingDemoMedicationPlan(medication.id, DEMO_MEILING_PATIENT_ID, 'after_dinner', 0.5, false, 'demo test')
    expect(readDemoMedicationDay(DEMO_MEILING_PATIENT_ID, '2026-08-05').plans.some(candidate => candidate.medication_id === medication.id && candidate.active)).toBe(true)
  })

  test('keeps a demo mutation in memory when browser storage rejects the write', () => {
    writeFails = true
    const saved = saveDemoBpRecord({ patient_id: DEMO_MEILING_PATIENT_ID, systolic: 142, diastolic: 88, pulse: 80, measured_at: new Date().toISOString() })

    expect(getDemoBpRecords(7, DEMO_MEILING_PATIENT_ID)).toContainEqual(saved)
  })
})

describe('demo nutrition storage', () => {
  test('stores meal items by patient and offers the confirmed food next time', () => {
    const saved = saveDemoMealItem({ patient_id: DEMO_MEILING_PATIENT_ID, meal_type: 'breakfast', occurred_at: new Date().toISOString(), recorded_by: 'demo.visitor@example.test', food_name_snapshot: '豆漿', serving_label_snapshot: '一杯', quantity: 1, calories_kcal: 120, calorie_basis: 'user_entered' })
    const data = readDemoMealData(DEMO_MEILING_PATIENT_ID, new Date(Date.now() - 60_000).toISOString(), new Date(Date.now() + 60_000).toISOString())
    expect(data.records).toContainEqual(saved.record)
    expect(data.items).toContainEqual(saved.item)
    expect(searchDemoMealFoodCatalog(DEMO_MEILING_PATIENT_ID, '豆漿')[0]).toMatchObject({ display_name: '豆漿', default_calories_kcal: 120 })
  })
})

describe('demo record removal and temperature history', () => {
  test('deleting a demo blood-pressure record frees the daily list again', () => {
    const measuredAt = new Date().toISOString()
    const saved = saveDemoBpRecord({ patient_id: DEMO_MEILING_PATIENT_ID, systolic: 130, diastolic: 80, pulse: 70, measured_at: measuredAt })
    expect(deleteDemoBpRecord(saved.id, DEMO_MEILING_PATIENT_ID)).toBe(true)
    // 已刪除或不屬於這位展示對象的紀錄不能再被刪一次，避免畫面顯示成功卻什麼都沒發生。
    expect(deleteDemoBpRecord(saved.id, DEMO_MEILING_PATIENT_ID)).toBe(false)
    expect(getDemoBpRecordsCreatedBetween(DEMO_MEILING_PATIENT_ID, new Date(Date.now() - 60_000).toISOString(), new Date(Date.now() + 60_000).toISOString())).toHaveLength(0)
  })

  test('temperature history mixes the demo story with this session readings and only for a demo patient', () => {
    saveDemoTemperatureRecord({
      patient_id: DEMO_MEILING_PATIENT_ID,
      temperature_c: 37.8,
      measurement_site: 'ear',
      context: 'symptoms',
      notes: null,
      measured_at: new Date().toISOString(),
    })
    const history = getDemoTemperatureRecords(7, DEMO_MEILING_PATIENT_ID)
    expect(history.some(record => record.temperature_c === 37.8)).toBe(true)
    expect(getDemoTemperatureRecords(7, 'not-a-demo-patient')).toEqual([])
  })

  test('deleting a demo temperature record reports whether anything was removed', () => {
    const saved = saveDemoTemperatureRecord({
      patient_id: DEMO_MEILING_PATIENT_ID,
      temperature_c: 36.6,
      measurement_site: 'forehead',
      context: 'routine',
      notes: null,
      measured_at: new Date().toISOString(),
    })
    expect(deleteDemoTemperatureRecord(saved.id, DEMO_MEILING_PATIENT_ID)).toBe(true)
    expect(deleteDemoTemperatureRecord(saved.id, DEMO_MEILING_PATIENT_ID)).toBe(false)
  })
})

describe('demo weight records', () => {
  test('keeps only the latest reading per past day but never trims today', () => {
    const today = new Date().toISOString()
    const past = '2026-08-01'
    saveDemoWeightRecord({ id: 'w-1', patient_id: DEMO_MEILING_PATIENT_ID, weight_kg: 50, measured_on: past, measurement_number: 1, measured_at: '2026-08-01T01:00:00.000Z' })
    saveDemoWeightRecord({ id: 'w-2', patient_id: DEMO_MEILING_PATIENT_ID, weight_kg: 51, measured_on: past, measurement_number: 2, measured_at: '2026-08-01T02:00:00.000Z' })
    saveDemoWeightRecord({ id: 'w-3', patient_id: DEMO_MEILING_PATIENT_ID, weight_kg: 52, measured_on: today.slice(0, 10), measurement_number: 1, measured_at: today })

    const records = readDemoWeightRecords(DEMO_MEILING_PATIENT_ID)
    expect(records.filter(record => record.measured_on === past)).toHaveLength(1)
    expect(records.find(record => record.measured_on === past)?.weight_kg).toBe(51)
    expect(readDemoWeightRecords('another-patient')).toEqual([])
  })
})

describe('demo pet liquid intake and digestion records (one row per day)', () => {
  test('reads only the requested patient and date range for history panels', () => {
    const liquidRecord = { id: 'pli-history', patient_id: DEMO_CAT_PATIENT_ID, recorded_date: '2026-08-05', water_intake_ml: 240, urination_count: 3, litter_box_urine_clumps: 2, notes: null, recorded_by: 'demo@example.test', created_at: '2026-08-05T00:00:00.000Z', updated_at: '2026-08-05T00:00:00.000Z' }
    const digestionRecord = { id: 'pdg-history', patient_id: DEMO_CAT_PATIENT_ID, recorded_date: '2026-08-05', vomiting_count: 0, defecation_count: 1, stool_score: 3 as const, notes: null, recorded_by: 'demo@example.test', created_at: '2026-08-05T00:00:00.000Z', updated_at: '2026-08-05T00:00:00.000Z' }
    saveDemoPetLiquidIntakeRecord(liquidRecord)
    saveDemoPetDigestionRecord(digestionRecord)

    expect(readDemoPetLiquidIntakeRecords(DEMO_CAT_PATIENT_ID, '2026-08-05', '2026-08-05')).toEqual([liquidRecord])
    expect(readDemoPetDigestionRecords(DEMO_CAT_PATIENT_ID, '2026-08-05', '2026-08-05')).toEqual([digestionRecord])
    expect(readDemoPetLiquidIntakeRecords('another-pet-patient', '2026-08-01', '2026-08-31')).toEqual([])
    expect(readDemoPetDigestionRecords(DEMO_CAT_PATIENT_ID, '2026-08-06', '2026-08-31')).toEqual([])
  })

  test('has no record for today until one is saved, then reads it back', () => {
    expect(readDemoPetLiquidIntakeRecord(DEMO_CAT_PATIENT_ID)).toBeNull()
    const record = { id: 'pli-1', patient_id: DEMO_CAT_PATIENT_ID, recorded_date: calendarDateKey(), water_intake_ml: 200, urination_count: 3, litter_box_urine_clumps: null, notes: null, recorded_by: 'demo@example.test', created_at: '2026-08-01T00:00:00.000Z', updated_at: '2026-08-01T00:00:00.000Z' }
    saveDemoPetLiquidIntakeRecord(record)
    expect(readDemoPetLiquidIntakeRecord(DEMO_CAT_PATIENT_ID)).toEqual(record)
  })

  test('saving the same id again updates today\'s row in place instead of duplicating it', () => {
    const today = calendarDateKey()
    const first = { id: 'pli-2', patient_id: DEMO_CAT_PATIENT_ID, recorded_date: today, water_intake_ml: 100, urination_count: 2, litter_box_urine_clumps: null, notes: null, recorded_by: 'demo@example.test', created_at: '2026-08-01T00:00:00.000Z', updated_at: '2026-08-01T00:00:00.000Z' }
    saveDemoPetLiquidIntakeRecord(first)
    saveDemoPetLiquidIntakeRecord({ ...first, water_intake_ml: 250, updated_at: '2026-08-01T01:00:00.000Z' })
    expect(readDemoPetLiquidIntakeRecord(DEMO_CAT_PATIENT_ID)?.water_intake_ml).toBe(250)
  })

  test('does not mix up different patients\' liquid intake records', () => {
    const today = calendarDateKey()
    saveDemoPetLiquidIntakeRecord({ id: 'pli-3', patient_id: DEMO_CAT_PATIENT_ID, recorded_date: today, water_intake_ml: 300, urination_count: 1, litter_box_urine_clumps: null, notes: null, recorded_by: 'demo@example.test', created_at: '2026-08-01T00:00:00.000Z', updated_at: '2026-08-01T00:00:00.000Z' })
    expect(readDemoPetLiquidIntakeRecord('another-pet-patient')).toBeNull()
  })

  test('has no digestion record for today until one is saved, then reads it back', () => {
    expect(readDemoPetDigestionRecord(DEMO_CAT_PATIENT_ID)).toBeNull()
    const record = { id: 'pdg-1', patient_id: DEMO_CAT_PATIENT_ID, recorded_date: calendarDateKey(), vomiting_count: 0, defecation_count: 1, stool_score: 3 as const, notes: null, recorded_by: 'demo@example.test', created_at: '2026-08-01T00:00:00.000Z', updated_at: '2026-08-01T00:00:00.000Z' }
    saveDemoPetDigestionRecord(record)
    expect(readDemoPetDigestionRecord(DEMO_CAT_PATIENT_ID)).toEqual(record)
  })

  test('saving the digestion record again with the same id replaces today\'s row', () => {
    const today = calendarDateKey()
    const first = { id: 'pdg-2', patient_id: DEMO_CAT_PATIENT_ID, recorded_date: today, vomiting_count: 1, defecation_count: 1, stool_score: 2 as const, notes: null, recorded_by: 'demo@example.test', created_at: '2026-08-01T00:00:00.000Z', updated_at: '2026-08-01T00:00:00.000Z' }
    saveDemoPetDigestionRecord(first)
    saveDemoPetDigestionRecord({ ...first, vomiting_count: 0, stool_score: 3, updated_at: '2026-08-01T01:00:00.000Z' })
    const updated = readDemoPetDigestionRecord(DEMO_CAT_PATIENT_ID)
    expect(updated?.vomiting_count).toBe(0)
    expect(updated?.stool_score).toBe(3)
  })
})

describe('demo pet appetite, fluid, insulin, and glucose records (multiple rows per day)', () => {
  test('accumulates multiple appetite entries per day and filters by patient and day start', () => {
    const dayStart = '2026-08-05T00:00:00.000Z'
    saveDemoPetAppetiteRecord({ id: 'apt-1', patient_id: DEMO_CAT_PATIENT_ID, recorded_at: '2026-08-05T08:00:00.000Z', appetite_percent: 80, meal_type: 'breakfast', notes: null, recorded_by: 'demo@example.test', created_at: '2026-08-05T08:00:00.000Z' })
    saveDemoPetAppetiteRecord({ id: 'apt-2', patient_id: DEMO_CAT_PATIENT_ID, recorded_at: '2026-08-05T18:00:00.000Z', appetite_percent: 50, meal_type: 'dinner', notes: null, recorded_by: 'demo@example.test', created_at: '2026-08-05T18:00:00.000Z' })
    // 昨天的舊紀錄不該被今天的 dayStart 篩到。
    saveDemoPetAppetiteRecord({ id: 'apt-0', patient_id: DEMO_CAT_PATIENT_ID, recorded_at: '2026-08-04T08:00:00.000Z', appetite_percent: 90, meal_type: 'breakfast', notes: null, recorded_by: 'demo@example.test', created_at: '2026-08-04T08:00:00.000Z' })

    const records = readDemoPetAppetiteRecords(DEMO_CAT_PATIENT_ID, dayStart)
    expect(records.map(record => record.id)).toEqual(['apt-2', 'apt-1'])
    expect(readDemoPetAppetiteRecords(DEMO_CAT_PATIENT_ID, dayStart, '2026-08-05T12:00:00.000Z').map(record => record.id)).toEqual(['apt-1'])
    expect(readDemoPetAppetiteRecords('another-pet-patient', dayStart)).toEqual([])
  })

  test('accumulates multiple subcutaneous fluid entries per day', () => {
    const dayStart = '2026-08-05T00:00:00.000Z'
    saveDemoPetFluidRecord({ id: 'flu-1', patient_id: DEMO_CAT_PATIENT_ID, administered_at: '2026-08-05T09:00:00.000Z', fluid_volume_ml: 100, infusion_rate: null, injection_site: 'neck', notes: null, administered_by: 'demo@example.test', created_at: '2026-08-05T09:00:00.000Z', updated_at: '2026-08-05T09:00:00.000Z' })
    saveDemoPetFluidRecord({ id: 'flu-2', patient_id: DEMO_CAT_PATIENT_ID, administered_at: '2026-08-05T20:00:00.000Z', fluid_volume_ml: 150, infusion_rate: null, injection_site: 'flank', notes: null, administered_by: 'demo@example.test', created_at: '2026-08-05T20:00:00.000Z', updated_at: '2026-08-05T20:00:00.000Z' })

    const records = readDemoPetFluidRecords(DEMO_CAT_PATIENT_ID, dayStart)
    expect(records.map(record => record.id)).toEqual(['flu-2', 'flu-1'])
  })

  test('keeps insulin and blood glucose in separate accumulating lists', () => {
    const dayStart = '2026-08-05T00:00:00.000Z'
    saveDemoPetInsulinRecord({ id: 'ins-1', patient_id: DEMO_CAT_PATIENT_ID, administered_at: '2026-08-05T08:00:00.000Z', insulin_units: 2, insulin_type: null, injection_site: null, notes: null, administered_by: 'demo@example.test', created_at: '2026-08-05T08:00:00.000Z', updated_at: '2026-08-05T08:00:00.000Z' })
    saveDemoPetGlucoseRecord({ id: 'glu-1', patient_id: DEMO_CAT_PATIENT_ID, measured_at: '2026-08-05T08:30:00.000Z', glucose_mg_dl: 110, measurement_context: null, notes: null, recorded_by: 'demo@example.test', created_at: '2026-08-05T08:30:00.000Z' })

    const insulinRecords = readDemoPetInsulinRecords(DEMO_CAT_PATIENT_ID, dayStart)
    const glucoseRecords = readDemoPetGlucoseRecords(DEMO_CAT_PATIENT_ID, dayStart)
    expect(insulinRecords.map(record => record.id)).toEqual(['ins-1'])
    expect(glucoseRecords.map(record => record.id)).toEqual(['glu-1'])
    // 一張表寫入不該讓另一張表也出現同一筆紀錄。
    expect(insulinRecords.map(record => record.id)).not.toContain('glu-1')
    expect(glucoseRecords.map(record => record.id)).not.toContain('ins-1')
  })
})

describe('demo PRN events', () => {
  const eventPayload = {
    id: 'demo-prn-1',
    patient_id: DEMO_MEILING_PATIENT_ID,
    plan_id: 'demo-plan-1',
    medication_id: 'demo-med-1',
    taken_at: '2026-08-01T04:30:00.000Z',
    care_date: '2026-08-01',
    dose_amount: 1,
    dose_unit: 'tablet',
    reason: '頭痛',
    effect_status: 'pending' as const,
    notes: null,
    recorded_by_email: 'demo.visitor@example.test',
  }

  test('saving the same event id twice never counts a second dose', () => {
    const first = saveDemoPrnMedicationEvent(eventPayload)
    const retried = saveDemoPrnMedicationEvent(eventPayload)
    expect(retried).toEqual(first)
    expect(readDemoPrnMedicationDay(DEMO_MEILING_PATIENT_ID, '2026-08-01', ['demo-plan-1']).events).toHaveLength(1)
  })

  test('only returns the requested plans and care day', () => {
    saveDemoPrnMedicationEvent(eventPayload)
    expect(readDemoPrnMedicationDay(DEMO_MEILING_PATIENT_ID, '2026-08-01', ['other-plan']).events).toHaveLength(0)
    expect(readDemoPrnMedicationDay(DEMO_MEILING_PATIENT_ID, '2026-08-02', ['demo-plan-1']).events).toHaveLength(0)
  })

  test('voiding keeps the event for the record but stops it counting as used', () => {
    saveDemoPrnMedicationEvent(eventPayload)
    const voided = voidDemoPrnMedicationEvent(eventPayload.id, DEMO_MEILING_PATIENT_ID, '記錯藥品')
    expect(voided.status).toBe('voided')
    expect(voided.void_reason).toBe('記錯藥品')
    // 重複作廢維持同一筆結果；作廢後不得再評估效果，避免作廢紀錄被當成有效用藥。
    expect(voidDemoPrnMedicationEvent(eventPayload.id, DEMO_MEILING_PATIENT_ID, '再一次')).toEqual(voided)
    expect(() => updateDemoPrnMedicationEffectStatus(eventPayload.id, DEMO_MEILING_PATIENT_ID, 'helped')).toThrow('Voided PRN event cannot be assessed')
    expect(readDemoPrnMedicationDay(DEMO_MEILING_PATIENT_ID, '2026-08-01', ['demo-plan-1']).events[0]?.status).toBe('voided')
  })

  test('effect status only changes the assessment field', () => {
    const saved = saveDemoPrnMedicationEvent(eventPayload)
    const updated = updateDemoPrnMedicationEffectStatus(eventPayload.id, DEMO_MEILING_PATIENT_ID, 'helped')
    expect(updated.effect_status).toBe('helped')
    expect(updated.taken_at).toBe(saved.taken_at)
    expect(updated.dose_amount).toBe(saved.dose_amount)
  })

  test('refuses to void or assess an event that belongs to another patient', () => {
    saveDemoPrnMedicationEvent(eventPayload)
    expect(() => voidDemoPrnMedicationEvent(eventPayload.id, 'other-patient', '測試')).toThrow('Demo PRN event not found')
    expect(() => updateDemoPrnMedicationEffectStatus(eventPayload.id, 'other-patient', 'helped')).toThrow('Demo PRN event not found')
  })

  test('a daily assessment is upserted per plan and care day', () => {
    const first = saveDemoPrnDailyAssessment({ patient_id: DEMO_MEILING_PATIENT_ID, plan_id: 'demo-plan-1', care_date: '2026-08-01', status: 'not_needed', notes: null })
    const second = saveDemoPrnDailyAssessment({ patient_id: DEMO_MEILING_PATIENT_ID, plan_id: 'demo-plan-1', care_date: '2026-08-01', status: 'used', notes: '已使用' })
    expect(second.id).toBe(first.id)
    expect(second.status).toBe('used')
    expect(readDemoPrnMedicationDay(DEMO_MEILING_PATIENT_ID, '2026-08-01', ['demo-plan-1']).assessments).toHaveLength(1)
  })
})

describe('demo medication plan authoring', () => {
  const planInput = {
    brandName: 'Panadol',
    brandNameZh: '普拿疼',
    genericName: 'Paracetamol',
    strengthMg: 500,
    dosageForm: 'tablet',
    scheduleSlot: 'morning',
    doseAmount: 1,
    doseCount: 1,
    asNeeded: false,
    appearanceColor: 'white',
    appearanceShape: 'round',
    appearancePhotoUrl: '',
  }

  test('creating a plan adds the medication, the plan, and an auditable change entry', () => {
    createDemoMedicationPlan(planInput, 'demo-new-med', DEMO_MEILING_PATIENT_ID, '新增止痛藥', 'demo.visitor@example.test')
    const admin = readDemoMedicationAdminData(DEMO_MEILING_PATIENT_ID)
    expect(admin.medications.some(medication => medication.id === 'demo-new-med')).toBe(true)
    expect(admin.plans.some(plan => plan.medication_id === 'demo-new-med' && plan.schedule_slot === 'morning')).toBe(true)
    expect(readDemoMedicationHistory(DEMO_MEILING_PATIENT_ID)[0]).toMatchObject({ action: 'create', reason: '新增止痛藥' })
  })

  test('re-creating the same medication and slot updates the existing plan instead of duplicating it', () => {
    createDemoMedicationPlan(planInput, 'demo-new-med', DEMO_MEILING_PATIENT_ID, '新增', 'demo.visitor@example.test')
    createDemoMedicationPlan({ ...planInput, doseAmount: 2 }, 'demo-new-med', DEMO_MEILING_PATIENT_ID, '調整劑量', 'demo.visitor@example.test')
    const plans = readDemoMedicationAdminData(DEMO_MEILING_PATIENT_ID).plans.filter(plan => plan.medication_id === 'demo-new-med')
    expect(plans).toHaveLength(1)
    expect(plans[0]?.dose_amount).toBe(2)
    expect(readDemoMedicationHistory(DEMO_MEILING_PATIENT_ID)[0]).toMatchObject({ action: 'update', reason: '調整劑量' })
  })

  test('medication history is limited and scoped to the current demo patient', () => {
    createDemoMedicationPlan(planInput, 'demo-new-med', DEMO_MEILING_PATIENT_ID, '新增', 'demo.visitor@example.test')
    expect(readDemoMedicationHistory(DEMO_MEILING_PATIENT_ID, 1)).toHaveLength(1)
    expect(readDemoMedicationHistory('another-patient')).toEqual([])
  })
})

describe('demo storage resilience', () => {
  test('keeps the visitor trial usable when the browser blocks reading localStorage', () => {
    readFails = true
    const saved = saveDemoBpRecord({ patient_id: DEMO_MEILING_PATIENT_ID, systolic: 118, diastolic: 76, pulse: 68, measured_at: new Date().toISOString() })
    expect(getDemoBpRecords(7, DEMO_MEILING_PATIENT_ID).some(record => record.id === saved.id)).toBe(true)
  })

  test('trusts this page memory state when the write failed and storage still holds an older snapshot', () => {
    saveDemoBpRecord({ patient_id: DEMO_MEILING_PATIENT_ID, systolic: 120, diastolic: 80, pulse: 70, measured_at: new Date().toISOString() })
    writeFails = true
    // 寫入失敗後 localStorage 只有舊快照；剛完成的試用操作不能因此在畫面上消失。
    const afterFailure = saveDemoBpRecord({ patient_id: DEMO_MEILING_PATIENT_ID, systolic: 145, diastolic: 90, pulse: 88, measured_at: new Date().toISOString() })
    expect(getDemoBpRecords(7, DEMO_MEILING_PATIENT_ID).some(record => record.id === afterFailure.id)).toBe(true)
  })

  test('clearing site data returns the demo to its clean story instead of resurrecting old trials', () => {
    const saved = saveDemoBpRecord({ patient_id: DEMO_MEILING_PATIENT_ID, systolic: 121, diastolic: 79, pulse: 66, measured_at: new Date().toISOString() })
    values.clear()
    expect(getDemoBpRecords(7, DEMO_MEILING_PATIENT_ID).some(record => record.id === saved.id)).toBe(false)
  })

  test('reads and writes in memory when there is no browser window at all', () => {
    delete (globalThis as { window?: Window & typeof globalThis }).window
    const saved = saveDemoBpRecord({ patient_id: DEMO_MEILING_PATIENT_ID, systolic: 122, diastolic: 78, pulse: 64, measured_at: new Date().toISOString() })
    expect(getDemoBpRecordsCreatedBetween(DEMO_MEILING_PATIENT_ID, new Date(Date.now() - 60_000).toISOString(), new Date(Date.now() + 60_000).toISOString()).some(record => record.id === saved.id)).toBe(true)
  })

  test('an unreadable snapshot is replaced instead of breaking the demo', () => {
    values.set('jia-jian-log.demo-state.v1', '{ not json')
    expect(() => getDemoBpRecords(7, DEMO_MEILING_PATIENT_ID)).not.toThrow()
  })

  test('a valid but incompatible snapshot shape is discarded, not half-adopted', () => {
    // 有效 JSON、但缺少必要陣列欄位（例如舊版更早、根本不是 Demo 快照的殘留資料）：
    // 不能只挑出看似對的欄位就沿用，必須整份視為不相容並回到乾淨故事。
    values.set('jia-jian-log.demo-state.v1', JSON.stringify({ version: 1, bpRecords: 'not-an-array' }))
    expect(getDemoBpRecords(7, DEMO_MEILING_PATIENT_ID).every(record => record.id.startsWith('demo-bp-meiling') || record.id.startsWith('demo-bp-chen'))).toBe(true)
  })
})
