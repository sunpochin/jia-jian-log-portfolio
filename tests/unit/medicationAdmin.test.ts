/*
檔案用途：驗證藥單管理的純函式邏輯——藥品識別碼組成、非本人藥物的雙重確認規則、
已刪除藥品的選擇復原、依時段分組排序，以及同藥品同時段的覆蓋衝突偵測。
所在層：tests/unit；對應 src/lib/medication/medicationAdmin.ts 的單元測試。
主要關聯：src/lib/medication/medicationAdmin.ts、MedicationAdminSection。
*/
import { describe, expect, test } from 'bun:test'
import { findMedicationPlanConflict, groupActiveMedicationPlans, listActiveMedicationPlansForMedication, medicationIdFor, resolveMedicationSelection, requiresDoubleMedicationConfirmation, type AdminMedicationPlan, type MedicationOption } from '../../src/lib/medication/medicationAdmin'

describe('medication admin identifiers', () => {
  test('uses the complete medicine identity so retrying the same form keeps one catalog item', () => {
    expect(medicationIdFor('My Medicine!', 'Generic', 5, 'tablet')).toBe('my-medicine-generic-5-tablet')
    expect(medicationIdFor('My Medicine!', 'Generic', 5, 'tablet')).toBe('my-medicine-generic-5-tablet')
    expect(medicationIdFor('My Medicine!', 'Generic', 10, 'tablet')).not.toBe('my-medicine-generic-5-tablet')
  })

  test('accepts a package strength label instead of a number for supplements without a trustworthy mg value (issue #758)', () => {
    // 營養品沒有可信的 mg 數字；slug 改用包裝劑量原文，重試同一張新藥表單時仍要指向同一筆目錄。
    expect(medicationIdFor('DaYan Vitamin D3', 'Cholecalciferol', '800 IU', 'tablet')).toBe('dayan-vitamin-d3-cholecalciferol-800-iu-tablet')
    expect(medicationIdFor('DaYan Vitamin D3', 'Cholecalciferol', '800 IU', 'tablet')).toBe('dayan-vitamin-d3-cholecalciferol-800-iu-tablet')
    // 不同包裝劑量標示必須落在不同的 id，否則兩種不同劑量的同名營養品會被誤存成同一筆目錄。
    expect(medicationIdFor('DaYan Vitamin D3', 'Cholecalciferol', '1000 IU', 'tablet')).not.toBe('dayan-vitamin-d3-cholecalciferol-800-iu-tablet')
  })
})

describe('medication admin safety boundary', () => {
  test('requires a double confirmation for every non-personal medication plan', () => {
    expect(requiresDoubleMedicationConfirmation(true)).toBe(false)
    expect(requiresDoubleMedicationConfirmation(false)).toBe(true)
  })
})

describe('medication admin selection recovery', () => {
  test('keeps a selected medication but requires a new choice when it no longer exists', () => {
    const medications = [
      { id: 'a', brand_name: 'Alpha', generic_name: 'A', strength_mg: 10, dosage_form: 'tablet', specialties: [], verification_status: 'manually_verified' as const, tfda_license_number: null, nhi_drug_code: null },
      { id: 'b', brand_name: 'Beta', generic_name: 'B', strength_mg: 20, dosage_form: 'tablet', specialties: [], verification_status: 'manually_verified' as const, tfda_license_number: null, nhi_drug_code: null },
    ]

    expect(resolveMedicationSelection('b', medications)).toBe('b')
    expect(resolveMedicationSelection('missing', medications)).toBe('')
    expect(resolveMedicationSelection('', [])).toBe('')
  })
})

describe('medication admin plan groups', () => {
  test('shows occupied meal times in daily order and sorts each group by brand name', () => {
    const medications = new Map<string, MedicationOption>([
      ['zeta', { id: 'zeta', brand_name: 'Zeta', generic_name: 'Z', strength_mg: 1, dosage_form: 'tablet', specialties: [], verification_status: 'official', tfda_license_number: null, nhi_drug_code: null }],
      ['alpha', { id: 'alpha', brand_name: 'Alpha', generic_name: 'A', strength_mg: 1, dosage_form: 'tablet', specialties: [], verification_status: 'official', tfda_license_number: null, nhi_drug_code: null }],
      ['beta', { id: 'beta', brand_name: 'Beta', generic_name: 'B', strength_mg: 1, dosage_form: 'tablet', specialties: [], verification_status: 'official', tfda_license_number: null, nhi_drug_code: null }],
    ])
    const plans: AdminMedicationPlan[] = [
      { id: '1', account_email: 'care@example.com', patient_id: 'patient-1', medication_id: 'zeta', schedule_slot: 'after_breakfast', dose_amount: 1, dose_count: 1, as_needed: false, display_order: 1, active: true },
      { id: '2', account_email: 'care@example.com', patient_id: 'patient-1', medication_id: 'alpha', schedule_slot: 'after_breakfast', dose_amount: 1, dose_count: 1, as_needed: false, display_order: 2, active: true },
      { id: '3', account_email: 'care@example.com', patient_id: 'patient-1', medication_id: 'beta', schedule_slot: 'after_lunch', dose_amount: 1, dose_count: 1, as_needed: false, display_order: 3, active: true },
    ]

    expect(groupActiveMedicationPlans(plans, medications, 'id').map(([slot, groupedPlans]) => [slot, groupedPlans.map(plan => plan.medication_id)])).toEqual([
      ['after_breakfast', ['alpha', 'zeta']],
      ['after_lunch', ['beta']],
    ])
  })
})

describe('medication admin duplicate prescriptions', () => {
  // 覆蓋既有醫囑是資料庫的預設行為（同一組 patient／medication／slot 會被靜默改寫），
  // 所以這裡固定住「畫面事先看得到哪幾筆會受影響」的判斷。
  const plans: AdminMedicationPlan[] = [
    { id: 'plan-morning', account_email: 'care@example.com', patient_id: 'patient-1', medication_id: 'stilnox', schedule_slot: 'after_breakfast', dose_amount: 0.5, dose_count: 1, as_needed: false, display_order: 1, active: true },
    { id: 'plan-bedtime', account_email: 'care@example.com', patient_id: 'patient-1', medication_id: 'stilnox', schedule_slot: 'bedtime', dose_amount: 1, dose_count: 1, as_needed: true, display_order: 2, active: true },
    { id: 'plan-stopped', account_email: 'care@example.com', patient_id: 'patient-1', medication_id: 'stilnox', schedule_slot: 'after_lunch', dose_amount: 1, dose_count: 1, as_needed: false, display_order: 3, active: false },
    { id: 'plan-other', account_email: 'care@example.com', patient_id: 'patient-1', medication_id: 'valdoxan', schedule_slot: 'bedtime', dose_amount: 0.5, dose_count: 1, as_needed: false, display_order: 4, active: true },
  ]

  test('lists only the active prescriptions of the same medicine', () => {
    expect(listActiveMedicationPlansForMedication(plans, 'stilnox').map(plan => plan.id)).toEqual(['plan-morning', 'plan-bedtime'])
    expect(listActiveMedicationPlansForMedication(plans, '')).toEqual([])
    expect(listActiveMedicationPlansForMedication(plans, 'unknown')).toEqual([])
  })

  test('excludes the prescription being edited so keeping its own meal time is not a conflict', () => {
    expect(listActiveMedicationPlansForMedication(plans, 'stilnox', 'plan-morning').map(plan => plan.id)).toEqual(['plan-bedtime'])
    expect(findMedicationPlanConflict(plans, 'stilnox', 'after_breakfast', 'plan-morning')).toBeNull()
  })

  test('finds the prescription that a new entry would overwrite', () => {
    expect(findMedicationPlanConflict(plans, 'stilnox', 'after_breakfast')?.id).toBe('plan-morning')
    // 另一個時段是合法的第二次服用，不算覆蓋；已停用的舊 plan 也不能被當成現役醫囑。
    expect(findMedicationPlanConflict(plans, 'stilnox', 'after_dinner')).toBeNull()
    expect(findMedicationPlanConflict(plans, 'stilnox', 'after_lunch')).toBeNull()
  })

  test('flags moving an edited prescription onto a meal time held by the same medicine', () => {
    expect(findMedicationPlanConflict(plans, 'stilnox', 'bedtime', 'plan-morning')?.id).toBe('plan-bedtime')
  })
})
