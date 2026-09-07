/*
檔案用途：驗證帳號設定相關的匯出資料格式與隱私保護行為。
所在層：tests/unit 單元測試層；不連線真實 Supabase，也不建立實際下載。
主要關聯：覆蓋 recordReport.ts 與 accountExport.ts 的純 CSV 產生函式。
*/
import { describe, expect, test } from 'bun:test'
import { buildRecordCsv } from '../../src/lib/recordReport'
import { buildCompleteCareCsv } from '../../src/lib/accountExport'

describe('Account Features & Legal Compliance', () => {
  test('CSV export generates valid UTF-8 BOM formatted output', () => {
    const csv = buildRecordCsv([], 'Test User', {
      selectedDays: 365,
    })
    expect(csv.startsWith('\uFEFF')).toBe(true)
    expect(csv).toContain('Subjek / 對象')
    expect(csv).toContain('Sistolik mmHg / 收縮壓')
  })

  test('complete care CSV contains blood pressure, temperature, medication, intake, nutrition, weight, and timeline data', () => {
    const csv = buildCompleteCareCsv({
      bloodPressureRecords: [{ id: 'bp-1', systolic: 120, diastolic: 80, pulse: 70, measured_at: '2026-07-30T01:00:00.000Z', source: 'manual', recorded_by: 'caregiver@example.com', patient_id: 'patient-1', created_at: '2026-07-30T01:01:00.000Z' }],
      temperatureRecords: [{ id: 'temp-1', temperature_c: 38.2, measurement_site: 'ear', context: 'symptoms', notes: '咳嗽', measured_at: '2026-07-30T00:50:00.000Z', source: 'manual', recorded_by: 'caregiver@example.com', patient_id: 'patient-1', created_at: '2026-07-30T00:51:00.000Z' }],
      medicationPlans: [{ id: 'plan-1', account_email: 'caregiver@example.com', patient_id: 'patient-1', medication_id: 'med-1', schedule_slot: 'morning', as_needed: false, dose_amount: 1, dose_count: 1, display_order: 0, active: true, created_at: '2026-07-29T01:00:00.000Z' }],
      medicationLogs: [{ id: 'log-1', account_email: 'caregiver@example.com', patient_id: 'patient-1', medication_id: 'med-1', medication_name: 'Test medicine', plan_id: 'plan-1', dose_number: 1, taken_on: '2026-07-30', taken_at: '2026-07-30T01:10:00.000Z', created_at: '2026-07-30T01:10:00.000Z' }],
      medications: [{ id: 'med-1', drug_product_id: null, brand_name: 'Test medicine', brand_name_zh: '測試藥品', generic_name: 'test generic', strength_mg: 10, dosage_form: 'tablet', specialties: [], verification_status: 'official', tfda_license_number: null, nhi_drug_code: null, appearance_note: null, appearance_color: null, appearance_shape: null, appearance_photo_url: null, created_at: '2026-07-01T00:00:00.000Z' }],
      mealRecords: [{ id: 'meal-1', patient_id: 'patient-1', meal_type: 'lunch', occurred_at: '2026-07-30T03:00:00.000Z', notes: '少鹽', source: 'manual', recorded_by: 'caregiver@example.com', created_at: '2026-07-30T03:01:00.000Z', updated_at: '2026-07-30T03:01:00.000Z' }],
      mealRecordItems: [{ id: 'meal-item-1', meal_record_id: 'meal-1', patient_id: 'patient-1', food_catalog_item_id: null, food_name_snapshot: '粥', serving_label_snapshot: '碗', quantity: 1, calories_kcal: 180, calorie_basis: 'user_entered', created_at: '2026-07-30T03:01:00.000Z' }],
      weightMeasurements: [{ id: 'weight-1', patient_id: 'patient-1', profile_email: 'caregiver@example.com', weight_kg: 52.4, measured_on: '2026-07-30', measurement_number: 1, measured_at: '2026-07-30T00:30:00.000Z', recorded_by: 'caregiver@example.com', created_at: '2026-07-30T00:30:00.000Z' }],
      timelineEntries: [{ id: 'event-1', patient_id: 'patient-1', event_type: 'care_note', title: '=Doctor note', details: 'Observe after meal', occurred_at: '2026-07-30T02:00:00.000Z', reassess_on: null, created_by: 'caregiver@example.com', created_at: '2026-07-30T02:00:00.000Z', medication_plan_id: 'plan-1', photo_paths: [{ path: 'patients/patient-1/events/event-1/photo.webp', thumbnail_path: 'patients/patient-1/events/event-1/photo-thumb.webp' }] }],
    })
    expect(csv.startsWith('\uFEFF')).toBe(true)
    expect(csv).toContain('Tekanan darah / 血壓紀錄')
    expect(csv).toContain('Suhu tubuh / 體溫紀錄')
    expect(csv).toContain('Rencana obat / 用藥清單')
    expect(csv).toContain('Catatan minum obat / 服藥紀錄')
    expect(csv).toContain('Makanan / 餐點紀錄')
    expect(csv).toContain('粥')
    expect(csv).toContain('Berat badan / 體重紀錄')
    expect(csv).toContain('52.4')
    expect(csv).toContain('Peristiwa perawatan / 照護大事記')
    expect(csv).toContain('調藥變更 ID')
    expect(csv).toContain('patients/patient-1/events/event-1/photo.webp')
    expect(csv).toContain("'=Doctor note")
  })
})
