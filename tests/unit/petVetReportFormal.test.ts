/*
檔案用途：驗證獸醫／回診報告在正式 Supabase 資料源上的七組查詢與彙整結果。
所在層：tests/unit；不使用 Demo fallback，也不連線資料庫，專門鎖住查詢欄位、期間邊界與錯誤傳遞。
主要關聯：src/lib/petVetReport.ts、PetVetReport 元件與七張寵物／照護資料表。
*/
import { beforeEach, describe, expect, mock, test } from 'bun:test'
import { DEMO_DOG_PATIENT_ID } from '../../src/lib/demoData'

type QueryResult = { data: unknown; error: unknown }
const results: Record<string, QueryResult> = {}

const supabase = {
  from(table: string) {
    const chain: Record<string, (...args: unknown[]) => unknown> = {}
    chain.select = (..._args) => chain
    chain.eq = (..._args) => chain
    chain.gte = (..._args) => chain
    chain.lte = (..._args) => chain
    chain.lt = (..._args) => chain
    chain.order = (..._args) => chain
    chain.limit = (..._args) => chain
    // 為什麼使用 thenable chain：正式 adapter 的查詢都是 await builder，這樣能同時驗證每個查詢分支而不引入真正的 SDK。
    chain.then = (onFulfilled?: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) => Promise.resolve(results[table] ?? { data: [], error: null }).then(onFulfilled, onRejected)
    return chain
  },
}

mock.module('../../src/lib/supabase', () => ({ supabase }))

// 為什麼同時匯入 petVetReportBounds：測試需比對日期計算邊界，以動態計算結果代替寫死日期，防止換日跨日斷言失敗。
const { loadPetVetReportModel, petVetReportBounds } = await import('../../src/lib/petVetReport')

function resetResults() {
  Object.assign(results, {
    patient_weight_measurement_records: { data: [], error: null },
    pet_appetite_records: { data: [], error: null },
    pet_liquid_intake_records: { data: [], error: null },
    pet_digestion_records: { data: [], error: null },
    pet_subcutaneous_fluid_records: { data: [], error: null },
    pet_insulin_records: { data: [], error: null },
    pet_blood_glucose_records: { data: [], error: null },
    care_timeline_entries: { data: [], error: null },
  })
}

beforeEach(resetResults)

describe('formal pet vet report data source', () => {
  test('aggregates weight, appetite, liquid, digestion, fluid, endocrine, and last visit data', async () => {
    results.patient_weight_measurement_records = { data: [
      { weight_kg: 4, measured_on: '2026-09-05' },
      { weight_kg: 4.2, measured_on: '2026-09-05' },
      { weight_kg: 4.6, measured_on: '2026-09-09' },
    ], error: null }
    results.pet_appetite_records = { data: [{ appetite_percent: 80 }, { appetite_percent: 60 }], error: null }
    results.pet_liquid_intake_records = { data: [{ water_intake_ml: 200, urination_count: 3 }, { water_intake_ml: null, urination_count: 2 }], error: null }
    results.pet_digestion_records = { data: [{ vomiting_count: 2, defecation_count: 1, stool_score: 3 }], error: null }
    results.pet_subcutaneous_fluid_records = { data: [{ fluid_volume_ml: 100 }, { fluid_volume_ml: 50 }], error: null }
    results.pet_insulin_records = { data: [{ insulin_units: 2 }, { insulin_units: 1.5 }], error: null }
    results.pet_blood_glucose_records = { data: [{ glucose_mg_dl: 100 }, { glucose_mg_dl: 110 }], error: null }
    results.care_timeline_entries = { data: [{ occurred_at: '2026-08-01T00:00:00Z', title: '回診' }], error: null }

    const model = await loadPetVetReportModel('formal-pet', 14)
    expect(model.weight).toEqual({ latestKg: 4.6, latestMeasuredOn: '2026-09-09', earliestKg: 4.1, earliestMeasuredOn: '2026-09-05', deltaKg: 0.5, recordCount: 3 })
    expect(model.appetite).toEqual({ avgPercent: 70, recordCount: 2 })
    expect(model.liquid).toEqual({ waterTotalMl: 200, waterAvgMlPerDay: 100, urinationTotal: 5, recordDays: 2 })
    expect(model.digestion).toEqual({ vomitingTotal: 2, defecationTotal: 1, avgStoolScore: 3, recordDays: 1 })
    expect(model.fluidTherapy).toEqual({ volumeTotalMl: 150, recordCount: 2 })
    expect(model.endocrine).toEqual({ insulinTotalUnits: 3.5, insulinRecordCount: 2, glucoseAvgMgDl: 105, glucoseRecordCount: 2 })
    expect(model.lastHealthVisit).toEqual({ occurredAt: '2026-08-01T00:00:00Z', title: '回診' })
    const expectedBounds = petVetReportBounds(14)
    expect(model.bounds.sinceDate).toBe(expectedBounds.sinceDate)
    expect(model.bounds.untilDate).toBe(expectedBounds.untilDate)
  })

  test('returns null aggregates and no visit when formal tables are empty', async () => {
    const model = await loadPetVetReportModel('formal-pet', 0)
    expect(model.bounds.sinceDate).toBe(model.bounds.untilDate)
    expect(model.weight).toEqual({ latestKg: null, latestMeasuredOn: null, earliestKg: null, earliestMeasuredOn: null, deltaKg: null, recordCount: 0 })
    expect(model.appetite).toEqual({ avgPercent: null, recordCount: 0 })
    expect(model.liquid).toEqual({ waterTotalMl: null, waterAvgMlPerDay: null, urinationTotal: null, recordDays: 0 })
    expect(model.digestion).toEqual({ vomitingTotal: null, defecationTotal: null, avgStoolScore: null, recordDays: 0 })
    expect(model.fluidTherapy).toEqual({ volumeTotalMl: null, recordCount: 0 })
    expect(model.endocrine).toEqual({ insulinTotalUnits: null, insulinRecordCount: 0, glucoseAvgMgDl: null, glucoseRecordCount: 0 })
    expect(model.lastHealthVisit).toBeNull()
  })

  test('propagates each formal query error instead of producing a partial report', async () => {
    const queryTables = [
      'patient_weight_measurement_records',
      'pet_appetite_records',
      'pet_liquid_intake_records',
      'pet_digestion_records',
      'pet_subcutaneous_fluid_records',
      'pet_insulin_records',
      'pet_blood_glucose_records',
      'care_timeline_entries',
    ]
    for (const table of queryTables) {
      resetResults()
      const failure = new Error(`${table} unavailable`)
      results[table] = { data: null, error: failure }
      await expect(loadPetVetReportModel('formal-pet', 14)).rejects.toBe(failure)
    }
  })

  test('loads last health visit fallback for demo patient without querying Supabase', async () => {
    resetResults()
    // 為什麼在 care_timeline_entries 注入資料庫錯誤：
    // 若 loadLastHealthVisit 未命中 isDemoPatientId 分支而誤打正式資料庫查詢，
    // 會因讀取此處的失敗而拋出異常；以此驗證 Demo fallback 確實隔絕正式資料庫。
    results.care_timeline_entries = { data: null, error: new Error('care_timeline_entries should not be queried for demo patient') }
    const model = await loadPetVetReportModel(DEMO_DOG_PATIENT_ID, 14)
    expect(model).toBeDefined()
    // 為什麼斷言 lastHealthVisit 為 null：
    // 示範時間軸預設未登錄 DEMO_DOG_PATIENT_ID 的健康回診事件，應回傳 null 且不應走訪已故障的正式查詢表。
    expect(model.lastHealthVisit).toBeNull()
  })
})
