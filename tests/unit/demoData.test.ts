/*
檔案用途：驗證 Demo 離線備援資料的固定時間軸與可重現性。
所在層：tests/unit 單元測試層；保護展示資料生成器不受系統目前時間影響。
主要關聯：驗證 src/lib/demoData.ts 的血壓、用藥異動與照護大事記 fallback。
*/
import { describe, expect, test } from 'bun:test'
import { DEMO_CHEN_PATIENT_ID, DEMO_FALLBACK_BASE_DATE, DEMO_LEE_PATIENT_ID, DEMO_MEILING_PATIENT_ID, getFallbackDemoBpRecords, getFallbackDemoCareTimeline, getFallbackDemoLeeMedicationCatalog, getFallbackDemoLeeMedicationPlans, getFallbackDemoMedicationCatalog, getFallbackDemoMedicationHistory, getFallbackDemoMedicationPlans, getFallbackDemoTemperatureRecords, isDemoPatientId } from '../../src/lib/demoData'

describe('demo fallback data', () => {
  test('keeps blood-pressure records on the fixed Taipei calendar timeline', () => {
    expect(getFallbackDemoBpRecords(2).map(record => record.measured_at)).toEqual([
      '2026-08-01T12:30:00.000Z',
      '2026-08-01T00:15:00.000Z',
      '2026-07-31T12:30:00.000Z',
      '2026-07-31T00:15:00.000Z',
    ])
  })

  test('keeps medication timestamps anchored to the fixed demo date', () => {
    const history = getFallbackDemoMedicationHistory()

    expect(history[0]?.medication.created_at).toBe(DEMO_FALLBACK_BASE_DATE)
    expect(history.map(log => log.created_at)).toEqual([
      '2026-05-18T00:00:00.000Z',
      '2026-05-18T00:00:00.000Z',
      '2026-05-29T00:00:00.000Z',
      '2026-07-02T00:00:00.000Z',
    ])
  })

  test('returns the same care timeline on every invocation', () => {
    expect(getFallbackDemoCareTimeline()).toEqual(getFallbackDemoCareTimeline())
  })
})

describe('demo story data coverage', () => {
  test('only the two demo patients are treated as demo subjects', () => {
    expect(isDemoPatientId(DEMO_MEILING_PATIENT_ID)).toBe(true)
    expect(isDemoPatientId(DEMO_CHEN_PATIENT_ID)).toBe(true)
    expect(isDemoPatientId('11111111-1111-4111-a111-111111111111')).toBe(false)
    expect(isDemoPatientId(null)).toBe(false)
    expect(isDemoPatientId(undefined)).toBe(false)
    expect(isDemoPatientId('')).toBe(false)
  })

  test('the 90-day Meiling story includes the hypertensive crisis and the recovery arc', () => {
    const records = getFallbackDemoBpRecords(90, DEMO_MEILING_PATIENT_ID)
    expect(records.every(record => record.patient_id === DEMO_MEILING_PATIENT_ID)).toBe(true)
    // 這一筆是故事裡的高血壓危象；缺了它，示範就看不到「先複測再通報」的流程。
    expect(records.some(record => record.systolic === 220 && record.diastolic === 110)).toBe(true)
    expect(records.some(record => record.systolic >= 160)).toBe(true)
    expect(records.some(record => record.systolic <= 112)).toBe(true)
  })

  test('the Chen story records one morning reading every other day', () => {
    const records = getFallbackDemoBpRecords(90, DEMO_CHEN_PATIENT_ID)
    expect(records.length).toBeGreaterThan(0)
    expect(records.every(record => record.patient_id === DEMO_CHEN_PATIENT_ID)).toBe(true)
    expect(records.every(record => record.id.endsWith('-m'))).toBe(true)
    expect(new Set(records.map(record => record.id)).size).toBe(records.length)
  })

  test('a longer window never exceeds the 90-day demo story', () => {
    expect(getFallbackDemoBpRecords(365, DEMO_MEILING_PATIENT_ID).length)
      .toBe(getFallbackDemoBpRecords(90, DEMO_MEILING_PATIENT_ID).length)
  })

  test('temperature, catalog, and plan fixtures stay patient-scoped and self-consistent', () => {
    const temperatures = getFallbackDemoTemperatureRecords(30, DEMO_MEILING_PATIENT_ID)
    expect(temperatures.every(record => record.patient_id === DEMO_MEILING_PATIENT_ID)).toBe(true)
    expect(temperatures.every(record => record.temperature_c >= 30 && record.temperature_c <= 45)).toBe(true)

    const catalog = getFallbackDemoMedicationCatalog()
    const plans = getFallbackDemoMedicationPlans()
    const catalogIds = new Set(catalog.map(medication => medication.id))
    // 每張藥單都必須對得到藥品主檔，否則展示畫面會出現沒有名稱的藥。
    expect(plans.every(plan => catalogIds.has(plan.medication_id))).toBe(true)
    expect(plans.every(plan => isDemoPatientId(plan.patient_id))).toBe(true)
  })

  test('李阿姨 always has her seven verification medications with a matching plan for every catalog entry', () => {
    expect(isDemoPatientId(DEMO_LEE_PATIENT_ID)).toBe(true)
    const catalog = getFallbackDemoLeeMedicationCatalog()
    const plans = getFallbackDemoLeeMedicationPlans()
    const catalogIds = new Set(catalog.map(medication => medication.id))
    expect(catalog).toHaveLength(7)
    expect(plans.every(plan => plan.patient_id === DEMO_LEE_PATIENT_ID)).toBe(true)
    expect(plans.every(plan => catalogIds.has(plan.medication_id))).toBe(true)
    // 每項藥品至少要出現在一筆現役藥單，否則畫面驗證會漏掉沒有排進任何時段的藥。
    expect([...catalogIds].every(id => plans.some(plan => plan.medication_id === id))).toBe(true)
  })
})
