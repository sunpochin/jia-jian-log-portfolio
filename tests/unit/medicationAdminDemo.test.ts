/*
檔案用途：驗證用藥管理資料層在 /demo 展示模式下改走 localStorage adapter，而非誤呼叫正式 Supabase。
所在層：tests/unit；使用真正的 demoStorage 實作（比照 demoStorage.test.ts 的模式），只 mock Supabase 讓它在被呼叫時直接失敗，藉此證明 demo 分支從未觸及正式資料庫。
主要關聯：src/lib/medicationAdmin.ts 與 src/lib/demoStorage.ts。
*/
import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'
import { DEMO_MEILING_PATIENT_ID } from '../../src/lib/demoData'

mock.module('../../src/lib/supabase', () => ({
  supabase: { from: () => { throw new Error('demo mode must not call Supabase') } },
}))

const { addExistingMedicationPlan, createMedicationPlan, readMedicationAdminData, setMedicationPlanActive } = await import('../../src/lib/medicationAdmin')

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

describe('medication admin demo routing', () => {
  test('reads the demo adapter instead of Supabase for a demo patient', async () => {
    const admin = await readMedicationAdminData(DEMO_MEILING_PATIENT_ID)
    expect(admin.plans.length).toBeGreaterThan(0)
  })

  test('creates a plan through the demo adapter without touching Supabase', async () => {
    const input = {
      brandName: 'Panadol', brandNameZh: '普拿疼', genericName: 'Paracetamol', strengthMg: 500, dosageForm: 'tablet',
      scheduleSlot: 'morning', doseAmount: 1, doseCount: 1, asNeeded: false, appearanceColor: '', appearanceShape: '', appearancePhotoUrl: '',
    }
    await createMedicationPlan(input, DEMO_MEILING_PATIENT_ID, '新增')
    const admin = await readMedicationAdminData(DEMO_MEILING_PATIENT_ID)
    const created = admin.plans.find(plan => plan.schedule_slot === 'morning' && admin.medications.find(medication => medication.id === plan.medication_id)?.brand_name === 'Panadol')
    expect(created).toBeDefined()
  })

  test('adds an existing medication to the demo plan without touching Supabase', async () => {
    const before = await readMedicationAdminData(DEMO_MEILING_PATIENT_ID)
    const existingMedicationId = before.medications[0]?.id
    expect(existingMedicationId).toBeDefined()
    await addExistingMedicationPlan(existingMedicationId as string, DEMO_MEILING_PATIENT_ID, 'noon', 1, false, '調整')
    const after = await readMedicationAdminData(DEMO_MEILING_PATIENT_ID)
    expect(after.plans.some(plan => plan.medication_id === existingMedicationId && plan.schedule_slot === 'noon')).toBe(true)
  })

  test('deactivates a demo plan without touching Supabase', async () => {
    const before = await readMedicationAdminData(DEMO_MEILING_PATIENT_ID)
    const activePlan = before.plans.find(plan => plan.active)
    expect(activePlan).toBeDefined()
    await setMedicationPlanActive(activePlan!.id, false, DEMO_MEILING_PATIENT_ID, '停用')
    const after = await readMedicationAdminData(DEMO_MEILING_PATIENT_ID)
    expect(after.plans.find(plan => plan.id === activePlan!.id)?.active).toBe(false)
  })

  test('refuses to reactivate a plan without going through the prescription flow', async () => {
    await expect(setMedicationPlanActive('plan-1', true, DEMO_MEILING_PATIENT_ID)).rejects.toThrow('Reactivating a medication plan requires its prescription details')
  })

  test('corrects a medication\'s dosage form and appearance without touching Supabase', async () => {
    // 對應「粉紅色藥錠實際上是粉劑」這類登錄錯誤：調整既有醫囑時一併修正藥品本身的劑型與外觀。
    const before = await readMedicationAdminData(DEMO_MEILING_PATIENT_ID)
    const plan = before.plans.find(item => item.active)
    expect(plan).toBeDefined()
    const medication = before.medications.find(item => item.id === plan!.medication_id)
    expect(medication).toBeDefined()
    await addExistingMedicationPlan(plan!.medication_id, DEMO_MEILING_PATIENT_ID, plan!.schedule_slot, plan!.dose_amount, plan!.as_needed, '修正藥品登錄', plan!.id, {
      brandName: medication!.brand_name, brandNameZh: medication!.brand_name_zh ?? '', genericName: medication!.generic_name, strengthMg: medication!.strength_mg,
      dosageForm: 'powder', appearanceColor: '', appearanceShape: 'sachet', appearancePhotoUrl: '',
    })
    const after = await readMedicationAdminData(DEMO_MEILING_PATIENT_ID)
    const corrected = after.medications.find(item => item.id === plan!.medication_id)
    expect(corrected?.dosage_form).toBe('powder')
    expect(corrected?.appearance_shape).toBe('sachet')
    expect(corrected?.appearance_color).toBeNull()
  })
})
