/*
檔案用途：測試結構化藥品單位格式化、藥品名稱展示與服藥變更歷史紀錄讀取。
所在層：tests/unit 單元測試層。
主要關聯：驗證 src/lib/medications.ts 邏輯。
*/
import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'

type QueryResponse = { data?: unknown; error?: unknown }
let changeLogsResponse: QueryResponse = { data: [], error: null }
let medicationsResponse: QueryResponse = { data: [], error: null }

const mockSupabase = {
  from(table: string) {
    if (table === 'medication_plan_change_logs') {
      return {
        select() {
          return {
            eq() {
              return {
                order() {
                  return {
                    limit() {
                      return Promise.resolve(changeLogsResponse)
                    },
                  }
                },
              }
            },
          }
        },
      }
    }
    if (table === 'medications') {
      return {
        select() {
          return {
            in() {
              return Promise.resolve(medicationsResponse)
            },
          }
        },
      }
    }
    return {}
  },
}

mock.module('../../src/lib/supabase', () => ({ supabase: mockSupabase }))

const {
  buildMedicationDoseInsert,
  clearMedicationDose,
  completesRequiredMedicationSlot,
  doseAmountFieldLabel,
  formatDoseAmount,
  formatDoseAmountLocalized,
  formatMedicationDisplayName,
  formatMedicationLabel,
  isCurrentMedicationView,
  readMedicationDay,
  readMedicationHistory,
  resolveMedicationNames,
  saveMedicationDose,
} = await import('../../src/lib/medications')
const { DEMO_MEILING_PATIENT_ID, getFallbackDemoMedicationHistory } = await import('../../src/lib/demoData')
import type { MedicationPlanView } from '../../src/lib/medications'

const plan: MedicationPlanView = {
  id: 'portfolio-author-latrigine-am',
  account_email: ' admin@careapp.local ',
  patient_id: 'patient-1',
  medication_id: 'latrigine-50',
  schedule_slot: 'morning',
  as_needed: false,
  dose_amount: 1,
  dose_count: 2,
  display_order: 10,
  active: true,
  created_at: '2026-07-11T00:00:00.000Z',
  medication: {
    id: 'latrigine-50',
    drug_product_id: null,
    brand_name: 'Latrigine',
    brand_name_zh: null,
    generic_name: 'Lamotrigine',
    strength_mg: 50,
    dosage_form: 'tablet',
    appearance_note: 'Green print',
    appearance_color: null,
    appearance_shape: null,
    appearance_photo_url: null,
    created_at: '2026-07-11T00:00:00.000Z',
  },
}

describe('structured medication dose records & change logs', () => {
  test('keeps strength numeric and records each pill separately', () => {
    expect(plan.medication.strength_mg).toBe(50)
    expect(buildMedicationDoseInsert(plan, '2026-07-10', 2, ' Caregiver@example.com ', '2026-07-10T19:00:00.000Z')).toMatchObject({
      account_email: 'caregiver@example.com',
      medication_id: 'latrigine-50',
      medication_name: 'Latrigine',
      plan_id: 'portfolio-author-latrigine-am',
      dose_number: 2,
      taken_on: '2026-07-11',
      care_date: '2026-07-10',
    })
  })

  test('shows a half tablet explicitly instead of rounding it to one pill', () => {
    expect(formatDoseAmount(0.5, 'tablet')).toBe('½ tablet')
  })

  test('uses plural units whenever the prescribed amount is not one', () => {
    expect(formatDoseAmount(1, 'capsule')).toBe('1 capsule')
    expect(formatDoseAmount(2, 'tablet')).toBe('2 tablets')
    expect(formatDoseAmount(1.5, 'tablet')).toBe('1.5 tablets')
    expect(formatDoseAmount(2, 'capsule')).toBe('2 capsules')
    expect(formatDoseAmount(2, 'liquid')).toBe('2 doses')
    expect(formatDoseAmount(1, 'powder')).toBe('1 sachet')
    expect(formatDoseAmount(2, 'powder')).toBe('2 sachets')
  })

  test('counts powdered medicine in sachets so a whole packet is not read as one pill', () => {
    // 鈣加 D 這類保健粉是一包一包沖泡的；沿用「錠」會讓照護者拿著整包卻以為只要吃一顆。
    expect(formatDoseAmountLocalized(1, 'powder', 'zh')).toBe('1 包')
    expect(formatDoseAmountLocalized(0.5, 'powder', 'zh')).toBe('½ 包')
    expect(formatDoseAmountLocalized(2, 'powder', 'id')).toBe('2 sachet')
    expect(doseAmountFieldLabel('powder').zh).toBe('每次幾包')
    expect(doseAmountFieldLabel('liquid').zh).toBe('每次幾份')
    expect(doseAmountFieldLabel('tablet').zh).toBe('每次幾顆')
    expect(doseAmountFieldLabel('capsule').zh).toBe('每次幾顆')
  })

  test('keeps the medicine instruction in the selected interface language', () => {
    expect(formatDoseAmountLocalized(1, 'capsule', 'id')).toBe('1 kapsul')
    expect(formatDoseAmountLocalized(1, 'capsule', 'zh')).toBe('1 膠囊')
    expect(formatDoseAmountLocalized(0.5, 'tablet', 'id')).toBe('½ tablet')
    expect(formatDoseAmountLocalized(2, 'capsule', 'id')).toBe('2 kapsul')
    expect(formatDoseAmountLocalized(1, 'liquid', 'id')).toBe('1 dosis')
    expect(formatDoseAmountLocalized(1, 'tablet', 'zh')).toBe('1 錠')
  })

  test('does not repeat the strength already written in a combination brand name', () => {
    expect(formatMedicationLabel('Exforge 5/160', 160)).toBe('Exforge 5/160 mg')
    expect(formatMedicationLabel('Exforge 5/160 mg', 160)).toBe('Exforge 5/160 mg')
    expect(formatMedicationLabel('Famotidine', 20)).toBe('Famotidine 20 mg')
    expect(formatMedicationLabel('Cozaar 50', 5)).toBe('Cozaar 50 5 mg')
  })

  test('keeps a verified compound strength label instead of summing ingredients', () => {
    expect(formatMedicationLabel('Exforge', 85, '5/80mg')).toBe('Exforge · 5/80mg')
  })

  test('keeps supplement package units and Indonesian medication names readable', () => {
    const supplement = {
      ...plan.medication,
      brand_name: 'DaYan Vitamin D3 800 IU',
      brand_name_zh: '大研生醫 維生素 D3 膠囊（800 IU）',
      brand_name_id: 'Vitamin D3 800 IU – suplemen vitamin D',
      strength_mg: 0.02,
      strength_label: '800 IU (20 µg)',
    }
    expect(formatMedicationLabel(supplement.brand_name, supplement.strength_mg, supplement.strength_label)).toBe('DaYan Vitamin D3 800 IU · 800 IU (20 µg)')
    expect(formatMedicationDisplayName(supplement, 'id')).toBe('Vitamin D3 800 IU – suplemen vitamin D')
    expect(formatMedicationDisplayName(supplement, 'zh')).toBe('大研生醫 維生素 D3 膠囊（800 IU）')
  })

  test('puts the English brand name first for foreign caregivers when the preference is on, and drops a redundant secondary name', () => {
    const supplement = {
      ...plan.medication,
      brand_name: 'DaYan Vitamin D3 800 IU',
      brand_name_zh: '大研生醫 維生素 D3 膠囊（800 IU）',
      brand_name_id: 'Vitamin D3 800 IU – suplemen vitamin D',
    }
    expect(resolveMedicationNames(supplement, 'zh', true)).toEqual({ primary: 'DaYan Vitamin D3 800 IU', secondary: '大研生醫 維生素 D3 膠囊（800 IU）' })
    expect(resolveMedicationNames(supplement, 'zh', false)).toEqual({ primary: '大研生醫 維生素 D3 膠囊（800 IU）', secondary: 'DaYan Vitamin D3 800 IU' })

    const untranslated = { ...plan.medication, brand_name: 'Bokey', brand_name_zh: null, brand_name_id: null }
    // 尚未翻譯品名時，本地化名稱會回退成英文商品名；兩段名稱相同就不該重複顯示次要名稱。
    expect(resolveMedicationNames(untranslated, 'zh', true)).toEqual({ primary: 'Bokey', secondary: null })
  })

  test('only celebrates a meal when every routine dose is checked, not when an optional medicine is skipped', () => {
    const optionalPlan = { ...plan, id: 'optional-plan', as_needed: true }
    const secondRoutinePlan = { ...plan, id: 'second-routine-plan' }
    expect(completesRequiredMedicationSlot([plan, optionalPlan], [{ id: 'log-1', account_email: 'admin@careapp.local', patient_id: 'patient-1', medication_id: 'latrigine-50', medication_name: 'Latrigine', plan_id: plan.id, dose_number: 1, taken_on: '2026-07-22', taken_at: '2026-07-22T01:00:00.000Z', created_at: '2026-07-22T01:00:00.000Z' }], plan.id, 2)).toBe(true)
    expect(completesRequiredMedicationSlot([plan, secondRoutinePlan], [], plan.id, 2)).toBe(false)
  })

  test('ignores a dose-save result after the caregiver switches person or day', () => {
    expect(isCurrentMedicationView({ patientId: 'patient-1', date: '2026-07-22' }, { patientId: 'patient-1', date: '2026-07-22' })).toBe(true)
    expect(isCurrentMedicationView({ patientId: 'patient-2', date: '2026-07-22' }, { patientId: 'patient-1', date: '2026-07-22' })).toBe(false)
    expect(isCurrentMedicationView({ patientId: 'patient-1', date: '2026-07-23' }, { patientId: 'patient-1', date: '2026-07-22' })).toBe(false)
  })

  test('readMedicationHistory reads change logs and joins catalog details', async () => {
    changeLogsResponse = {
      data: [
        {
          id: 'log-1',
          patient_id: 'pat-1',
          action: 'create',
          plan_id: 'p-1',
          medication_id: 'latrigine-50',
          schedule_slot: 'morning',
          dose_amount: 1,
          dose_count: 1,
          as_needed: false,
          reason: '新增藥單',
          actor_email: 'admin@careapp.local',
          before_snapshot: {},
          after_snapshot: { plan_id: 'p-1', medication_id: 'latrigine-50', schedule_slot: 'morning', dose_amount: 1, dose_count: 1, as_needed: false, active: true, brand_name: 'Latrigine', dosage_form: 'tablet' },
          recorded_at: '2026-08-01T00:00:00Z',
          effective_at: '2026-08-01T00:00:00Z',
          created_at: '2026-08-01T00:00:00Z',
        },
      ],
      error: null,
    }
    medicationsResponse = {
      data: [plan.medication],
      error: null,
    }

    const history = await readMedicationHistory('pat-1')
    expect(history.length).toBe(1)
    expect(history[0].action).toBe('create')
    expect(history[0].medication.brand_name).toBe('Latrigine')
  })

  test('readMedicationHistory falls back to the demo story when a demo patient has no real change logs', async () => {
    // 這條分支專屬展示帳號：正式病人遇到空歷史應該回傳空陣列，不能被誤套 Demo 故事。
    changeLogsResponse = { data: [], error: null }
    const history = await readMedicationHistory(DEMO_MEILING_PATIENT_ID)
    expect(history).toEqual(getFallbackDemoMedicationHistory())

    changeLogsResponse = { data: [], error: null }
    expect(await readMedicationHistory('patient-1')).toEqual([])
  })

  test('readMedicationHistory surfaces a real database failure for a non-demo patient', async () => {
    changeLogsResponse = { data: null, error: new Error('logs unavailable') }
    await expect(readMedicationHistory('patient-1')).rejects.toThrow('logs unavailable')
  })
})

describe('/demo mode routing keeps writes off Supabase', () => {
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

  test('readMedicationDay reads the demo adapter and includes PRN events without calling Supabase', async () => {
    const day = await readMedicationDay(DEMO_MEILING_PATIENT_ID, '2026-08-01')
    expect(Array.isArray(day.plans)).toBe(true)
    expect(day.prnEvents).toEqual([])
    expect(day.prnAssessments).toEqual([])
  })

  test('saveMedicationDose and clearMedicationDose round-trip through the demo adapter', async () => {
    const day = await readMedicationDay(DEMO_MEILING_PATIENT_ID, '2026-08-01')
    const demoPlan = day.plans[0]
    expect(demoPlan).toBeDefined()

    const saved = await saveMedicationDose(demoPlan as MedicationPlanView, '2026-08-01', 1, 'caregiver@example.com')
    expect(saved.plan_id).toBe(demoPlan?.id)

    await clearMedicationDose(demoPlan!.id, DEMO_MEILING_PATIENT_ID, '2026-08-01', 1)
    const after = await readMedicationDay(DEMO_MEILING_PATIENT_ID, '2026-08-01')
    expect(after.logs.some(log => log.plan_id === demoPlan!.id && log.dose_number === 1)).toBe(false)
  })

  test('clearMedicationDose reports a demo dose that was never taken', async () => {
    await expect(clearMedicationDose('no-such-plan', DEMO_MEILING_PATIENT_ID, '2026-08-01', 1)).rejects.toThrow('Demo medication dose not found')
  })

  test('readMedicationHistory reads the demo adapter directly when actually running in /demo mode', async () => {
    // 這裡刻意不比對 getFallbackDemoMedicationHistory() 的完整陣列：readDemoMedicationHistory 是依
    // demoStorage 目前的 medicationChanges 重新排序／重新關聯藥品組成，不保證與靜態故事資料同序。
    // 這條測試只需證明 /demo 模式真的走了 demoStorage 分支，而不是回退去查 Supabase。
    const history = await readMedicationHistory(DEMO_MEILING_PATIENT_ID)
    expect(history.length).toBeGreaterThan(0)
    expect(history.every(entry => entry.patient_id === DEMO_MEILING_PATIENT_ID && entry.medication)).toBe(true)
  })
})
