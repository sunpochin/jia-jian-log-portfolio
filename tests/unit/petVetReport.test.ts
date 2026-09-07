/*
檔案用途：驗證獸醫版一頁式報告的彙整規則——加總、平均、體重期間變化與空紀錄回傳 null，
並確認 Demo 模式與病人隔離不會把別隻寵物的紀錄算進報告。
所在層：tests/unit；對應 src/lib/petVetReport.ts。
主要關聯：demoStorage 的寵物與體重展示資料、demoData 的照護時間軸 fallback。
*/
import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { DEMO_CAT_PATIENT_ID } from '../../src/lib/demoData'
import {
  saveDemoPetAppetiteRecord,
  saveDemoPetDigestionRecord,
  saveDemoPetFluidRecord,
  saveDemoPetGlucoseRecord,
  saveDemoPetInsulinRecord,
  saveDemoPetLiquidIntakeRecord,
  saveDemoWeightRecord,
} from '../../src/lib/demoStorage'
import { loadPetVetReportModel } from '../../src/lib/petVetReport'

const originalWindow = globalThis.window
const values = new Map<string, string>()

const fakeWindow = {
  location: { pathname: '/demo' },
  localStorage: {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value) },
    removeItem: (key: string) => values.delete(key),
  },
} as unknown as Window & typeof globalThis

beforeEach(() => {
  values.clear()
  globalThis.window = fakeWindow
})

afterEach(() => {
  if (originalWindow) globalThis.window = originalWindow
  else delete (globalThis as { window?: Window & typeof globalThis }).window
})

const OTHER_PATIENT_ID = 'demo-other-pet'

describe('pet vet report', () => {
  test('returns nulls and zero counts when nothing has been recorded', async () => {
    const model = await loadPetVetReportModel(DEMO_CAT_PATIENT_ID, 14)
    expect(model.weight).toEqual({ latestKg: null, latestMeasuredOn: null, earliestKg: null, earliestMeasuredOn: null, deltaKg: null, recordCount: 0 })
    expect(model.appetite).toEqual({ avgPercent: null, recordCount: 0 })
    expect(model.digestion.vomitingTotal).toBeNull()
    expect(model.endocrine.insulinTotalUnits).toBeNull()
    expect(model.lastHealthVisit).toBeNull()
  })

  test('sums and averages recorded values, and isolates a different patient', async () => {
    const today = new Date().toISOString()
    saveDemoWeightRecord({ id: 'w1', patient_id: DEMO_CAT_PATIENT_ID, weight_kg: 4, measured_on: new Date(Date.now() - 5 * 86400000).toISOString().slice(0, 10), measurement_number: 1, measured_at: new Date(Date.now() - 5 * 86400000).toISOString() })
    saveDemoWeightRecord({ id: 'w2', patient_id: DEMO_CAT_PATIENT_ID, weight_kg: 4.6, measured_on: new Date().toISOString().slice(0, 10), measurement_number: 1, measured_at: today })
    saveDemoPetAppetiteRecord({ id: 'a1', patient_id: DEMO_CAT_PATIENT_ID, recorded_at: today, appetite_percent: 80, meal_type: 'breakfast', notes: null, recorded_by: 'demo', created_at: today })
    saveDemoPetAppetiteRecord({ id: 'a2', patient_id: DEMO_CAT_PATIENT_ID, recorded_at: today, appetite_percent: 60, meal_type: 'dinner', notes: null, recorded_by: 'demo', created_at: today })
    saveDemoPetDigestionRecord({ id: 'd1', patient_id: DEMO_CAT_PATIENT_ID, recorded_date: new Date().toISOString().slice(0, 10), vomiting_count: 2, defecation_count: 1, stool_score: 3, notes: null, recorded_by: 'demo', created_at: today, updated_at: today })
    saveDemoPetLiquidIntakeRecord({ id: 'l1', patient_id: DEMO_CAT_PATIENT_ID, recorded_date: new Date().toISOString().slice(0, 10), water_intake_ml: 200, urination_count: 3, litter_box_urine_clumps: null, notes: null, recorded_by: 'demo', created_at: today, updated_at: today })
    saveDemoPetInsulinRecord({ id: 'i1', patient_id: DEMO_CAT_PATIENT_ID, administered_at: today, insulin_units: 2, insulin_type: null, injection_site: null, notes: null, administered_by: 'demo', created_at: today, updated_at: today })
    saveDemoPetInsulinRecord({ id: 'i2', patient_id: DEMO_CAT_PATIENT_ID, administered_at: today, insulin_units: 1.5, insulin_type: null, injection_site: null, notes: null, administered_by: 'demo', created_at: today, updated_at: today })
    saveDemoPetGlucoseRecord({ id: 'g1', patient_id: DEMO_CAT_PATIENT_ID, measured_at: today, glucose_mg_dl: 100, measurement_context: null, notes: null, recorded_by: 'demo', created_at: today })
    saveDemoPetFluidRecord({ id: 'f1', patient_id: DEMO_CAT_PATIENT_ID, administered_at: today, fluid_volume_ml: 100, infusion_rate: null, injection_site: null, notes: null, administered_by: 'demo', created_at: today, updated_at: today })

    // 另一隻寵物的紀錄不能混進上面這隻的報告。
    saveDemoPetInsulinRecord({ id: 'i3', patient_id: OTHER_PATIENT_ID, administered_at: today, insulin_units: 99, insulin_type: null, injection_site: null, notes: null, administered_by: 'demo', created_at: today, updated_at: today })

    const model = await loadPetVetReportModel(DEMO_CAT_PATIENT_ID, 14)
    expect(model.weight.latestKg).toBe(4.6)
    expect(model.weight.earliestKg).toBe(4)
    expect(model.weight.deltaKg).toBe(0.6)
    expect(model.appetite.avgPercent).toBe(70)
    expect(model.digestion.vomitingTotal).toBe(2)
    expect(model.digestion.defecationTotal).toBe(1)
    expect(model.liquid.waterTotalMl).toBe(200)
    expect(model.liquid.urinationTotal).toBe(3)
    expect(model.endocrine.insulinTotalUnits).toBe(3.5)
    expect(model.endocrine.insulinRecordCount).toBe(2)
    expect(model.endocrine.glucoseAvgMgDl).toBe(100)
    expect(model.fluidTherapy.volumeTotalMl).toBe(100)
  })
})
