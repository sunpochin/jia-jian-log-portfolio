/*
檔案用途：測試帳號與完整照護歷史 CSV 匯出生成、公式防禦、欄位排版、分頁讀取與下載動作。
所在層：tests/unit 單元測試層。
主要關聯：驗證 src/lib/accountExport.ts 的照護歷史導出與 CSV 安全防禦。
*/
import { beforeEach, describe, expect, mock, test } from 'bun:test'

type MockResponse = { data?: unknown; error?: unknown }
let bpRecordsResponse: MockResponse = { data: [], error: null }
let medPlansResponse: MockResponse = { data: [], error: null }
let medLogsResponse: MockResponse = { data: [], error: null }
let timelineResponse: MockResponse = { data: [], error: null }
let medicationsResponse: MockResponse = { data: [], error: null }
let fetchErrorOnTable: string | null = null
// 讓個別測試模擬「這張表回傳缺表錯誤」或「這張表要分好幾頁才讀得完」，
// 藉此驗證 readAllPatientRows 的分頁迴圈與 PRN migration 缺表降級兩條路徑。
let missingTableError: { table: string; error: unknown } | null = null
let pagedTableResponses: { table: string; pages: MockResponse[] } | null = null
// 分頁狀態必須跨越多次 `.from(table)` 呼叫維持，因為 readAllPatientRows 每一頁都會重新呼叫 supabase.from()；
// 若把游標放進 from() 內部的區域變數，每次呼叫都會重置成第 0 頁，造成測試無限迴圈。
let pagedTableCursor = 0

const mockSupabase = {
  from(table: string) {
    if (fetchErrorOnTable === table) {
      return {
        select() {
          return {
            eq() {
              return {
                order() {
                  return {
                    range() {
                      return Promise.resolve({ data: null, error: { message: `Query error on ${table}` } })
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

    if (missingTableError?.table === table) {
      return {
        select() {
          return {
            eq() {
              return {
                order() {
                  return {
                    range() {
                      return Promise.resolve({ data: null, error: missingTableError!.error })
                    },
                  }
                },
              }
            },
          }
        },
      }
    }

    if (pagedTableResponses?.table === table) {
      return {
        select() {
          return {
            eq() {
              return {
                order() {
                  return {
                    range() {
                      const response = pagedTableResponses!.pages[pagedTableCursor] ?? { data: [], error: null }
                      pagedTableCursor += 1
                      return Promise.resolve(response)
                    },
                  }
                },
              }
            },
          }
        },
      }
    }

    return {
      select() {
        return {
          eq() {
            return {
              order() {
                return {
                  range() {
                    if (table === 'blood_pressure_records') return Promise.resolve(bpRecordsResponse)
                    if (table === 'medication_plans') return Promise.resolve(medPlansResponse)
                    if (table === 'medication_intake_logs') return Promise.resolve(medLogsResponse)
                    if (table === 'care_timeline_entries') return Promise.resolve(timelineResponse)
                    return Promise.resolve({ data: [], error: null })
                  },
                }
              },
            }
          },
        }
      },
    }
  },
}

mock.module('../../src/lib/supabase', () => ({ supabase: mockSupabase }))

// 模擬瀏覽器 DOM 環境與 Blob / URL 方法
let clickedLinkDownload = ''
let revokedUrl = ''

if (typeof globalThis.document === 'undefined') {
  ;(globalThis as any).document = {
    body: {
      appendChild() {},
    },
    createElement(tag: string) {
      if (tag === 'a') {
        return {
          href: '',
          download: '',
          click() {
            clickedLinkDownload = this.download
          },
          remove() {},
        }
      }
      return {}
    },
  }
}

if (typeof globalThis.URL === 'undefined' || typeof globalThis.URL.createObjectURL !== 'function') {
  ;(globalThis as any).URL = {
    createObjectURL() {
      return 'blob:http://localhost/mock-blob-uuid'
    },
    revokeObjectURL(url: string) {
      revokedUrl = url
    },
  }
}

if (typeof globalThis.Blob === 'undefined') {
  ;(globalThis as any).Blob = class MockBlob {
    content: unknown[]
    type: string
    constructor(content: unknown[], options?: { type?: string }) {
      this.content = content
      this.type = options?.type || ''
    }
  }
}

const { buildCompleteCareCsv, downloadAccountCsv } = await import('../../src/lib/accountExport')

describe('account CSV export builder & downloader', () => {
  beforeEach(() => {
    bpRecordsResponse = { data: [], error: null }
    medPlansResponse = { data: [], error: null }
    medLogsResponse = { data: [], error: null }
    timelineResponse = { data: [], error: null }
    medicationsResponse = { data: [], error: null }
    fetchErrorOnTable = null
    missingTableError = null
    pagedTableResponses = null
    pagedTableCursor = 0
    clickedLinkDownload = ''
    revokedUrl = ''
  })

  test('builds a sorted CSV with UTF-8 BOM, headers, and formula sanitization', () => {
    const csv = buildCompleteCareCsv({
      bloodPressureRecords: [
        {
          id: 'bp-1',
          measured_at: '2026-07-31T08:00:00Z',
          systolic: 120,
          diastolic: 80,
          pulse: 72,
          source: 'manual_web',
          recorded_by: 'portfolio-author@example.com',
          created_at: '2026-07-31T08:00:00Z',
        },
      ],
      medicationPlans: [
        {
          id: 'plan-1',
          account_email: 'portfolio-author@example.com',
          patient_id: 'patient-1',
          medication_id: 'med-1',
          schedule_slot: 'pagi',
          as_needed: false,
          dose_amount: 1,
          dose_count: 1,
          display_order: 1,
          active: true,
          created_at: '2026-07-30T08:00:00Z',
        },
      ],
      medicationLogs: [
        {
          id: 'log-1',
          account_email: 'portfolio-author@example.com',
          patient_id: 'patient-1',
          medication_id: 'med-1',
          medication_name: '=SUM(1,2)',
          plan_id: 'plan-1',
          dose_number: 1,
          taken_on: '2026-07-31',
          taken_at: '2026-07-31T08:05:00Z',
          created_at: '2026-07-31T08:05:00Z',
        },
      ],
      medications: [
        {
          id: 'med-1',
          drug_product_id: null,
          brand_name: 'Exforge',
          brand_name_zh: '複方降血壓錠',
          brand_name_id: null,
          generic_name: 'Amlodipine',
          strength_mg: 5,
          strength_label: '5 mg',
          dosage_form: 'tablet',
          specialties: ['cardiovascular'],
          verification_status: 'official',
          tfda_license_number: null,
          nhi_drug_code: null,
          appearance_note: null,
          appearance_color: null,
          appearance_shape: null,
          appearance_photo_url: null,
          created_at: '2026-07-30T08:00:00Z',
        },
      ],
      timelineEntries: [
        {
          id: 'time-1',
          patient_id: 'patient-1',
          event_type: 'medical_visit',
          title: '門診',
          details: '+100 Note',
          occurred_at: '2026-07-29T10:00:00Z',
          reassess_on: null,
          created_by: 'portfolio-author@example.com',
          created_at: '2026-07-29T10:00:00Z',
          medication_plan_id: null,
        },
      ],
      prnMedicationEvents: [
        {
          id: 'prn-1', patient_id: 'patient-1', plan_id: 'plan-1', medication_id: 'med-1',
          taken_at: '2026-07-31T09:00:00Z', care_date: '2026-07-31', dose_amount: 0.5, dose_unit: 'tablet',
          reason: '頭暈', effect_status: 'pending', notes: '觀察', recorded_by_user_id: 'user-1', recorded_by_email: 'portfolio-author@example.com',
          status: 'active', voided_at: null, voided_by_user_id: null, voided_by_email: null, void_reason: null, created_at: '2026-07-31T09:00:00Z',
        },
      ],
      temperatureRecords: [
        {
          id: 'temp-1', patient_id: 'patient-1', temperature_c: 37.8, measurement_site: 'ear', context: 'symptoms',
          notes: '午後略高', measured_at: '2026-07-30T13:00:00Z', source: 'manual_web', recorded_by: 'caregiver@example.com',
          created_at: '2026-07-30T13:00:00Z',
        },
      ],
      prnMedicationAssessments: [
        {
          id: 'prn-assessment-1', patient_id: 'patient-1', plan_id: 'plan-1', care_date: '2026-07-30',
          status: 'not_needed', notes: null, assessed_at: '2026-07-30T14:00:00Z', assessed_by_user_id: 'user-1',
          assessed_by_email: 'caregiver@example.com', created_at: '2026-07-30T14:00:00Z', updated_at: '2026-07-30T14:00:00Z',
        },
      ],
      weightMeasurements: [
        {
          id: 'weight-1', patient_id: 'patient-1', profile_email: 'portfolio-author@example.com', weight_kg: 52.4,
          measured_on: '2026-07-30', measured_at: '2026-07-30T00:30:00Z', recorded_by: 'caregiver@example.com',
          created_at: '2026-07-30T00:30:00Z', measurement_number: 2,
        },
      ],
      mealRecords: [
        {
          id: 'meal-1', patient_id: 'patient-1', meal_type: 'lunch', occurred_at: '2026-07-30T04:00:00Z',
          notes: '吃了八分飽', source: 'manual', recorded_by: 'caregiver@example.com',
          created_at: '2026-07-30T04:05:00Z', updated_at: '2026-07-30T04:05:00Z',
        },
      ],
      mealRecordItems: [
        {
          id: 'meal-item-1', meal_record_id: 'meal-1', patient_id: 'patient-1', food_catalog_item_id: null,
          food_name_snapshot: '雞肉粥', serving_label_snapshot: '碗', quantity: 1, calories_kcal: 320,
          calorie_basis: 'estimated', created_at: '2026-07-30T04:05:00Z',
        },
        // 找不到對應餐點時要退回自身建立時間，否則整份匯出的排序會壞掉。
        {
          id: 'meal-item-2', meal_record_id: 'meal-missing', patient_id: 'patient-1', food_catalog_item_id: null,
          food_name_snapshot: '香蕉', serving_label_snapshot: '根', quantity: 1, calories_kcal: null,
          calorie_basis: 'estimated', created_at: '2026-07-29T04:05:00Z',
        },
      ],
    })

    expect(csv.startsWith('\uFEFF')).toBe(true)
    expect(csv).toContain('Tekanan darah / 血壓紀錄')
    expect(csv).toContain('Catatan minum obat / 服藥紀錄')
    expect(csv).toContain('Catatan PRN / PRN 使用紀錄')
    expect(csv).toContain('Peristiwa perawatan / 照護大事記')
    expect(csv).toContain("'=SUM(1,2)")
    expect(csv).toContain("'+100 Note")
    expect(csv).toContain('Suhu tubuh / 體溫紀錄')
    expect(csv).toContain('Status harian PRN / PRN 每日狀態')
    expect(csv).toContain('Berat badan / 體重紀錄')
    expect(csv).toContain('Makanan / 餐點紀錄')
    expect(csv).toContain('Makanan / 食物項目')
    expect(csv).toContain('雞肉粥')
    // 交接檔要保留可長期使用的相對 path，而不是會過期的 signed URL。
    expect(csv).not.toContain('https://')
  })

  test('downloadAccountCsv throws when patientId is missing', async () => {
    await expect(downloadAccountCsv('Personal', '')).rejects.toThrow('Patient ID required for CSV export')
  })

  test('downloadAccountCsv fetches all tables, batches medication details, and triggers download', async () => {
    // 模擬完整照護歷史的多表資料與藥品關聯
    bpRecordsResponse = {
      data: [
        {
          id: 'bp-10',
          measured_at: '2026-07-31T09:00:00Z',
          systolic: 135,
          diastolic: 85,
          pulse: 78,
          source: 'manual_web',
          recorded_by: 'caregiver@example.com',
          created_at: '2026-07-31T09:00:00Z',
        },
      ],
      error: null,
    }
    medPlansResponse = {
      data: [
        {
          id: 'p-1',
          account_email: 'portfolio-author@example.com',
          patient_id: 'pat-mother',
          medication_id: 'med-exforge',
          schedule_slot: 'pagi',
          as_needed: false,
          dose_amount: 1,
          dose_count: 1,
          display_order: 1,
          active: true,
          created_at: '2026-07-01T00:00:00Z',
        },
      ],
      error: null,
    }
    medLogsResponse = {
      data: [
        {
          id: 'log-1',
          account_email: 'caregiver@example.com',
          patient_id: 'pat-mother',
          medication_id: 'med-exforge',
          medication_name: 'Exforge',
          plan_id: 'p-1',
          dose_number: 1,
          taken_on: '2026-07-31',
          taken_at: '2026-07-31T08:00:00Z',
          created_at: '2026-07-31T08:00:00Z',
        },
      ],
      error: null,
    }
    timelineResponse = { data: [], error: null }
    medicationsResponse = {
      data: [
        {
          id: 'med-exforge',
          drug_product_id: null,
          brand_name: 'Exforge',
          brand_name_zh: '易安穩錠',
          brand_name_id: null,
          generic_name: 'Amlodipine/Valsartan',
          strength_mg: 5,
          strength_label: '5/80 mg',
          dosage_form: 'tablet',
          specialties: ['cardiovascular'],
          verification_status: 'official',
          tfda_license_number: null,
          nhi_drug_code: null,
          appearance_note: null,
          appearance_color: null,
          appearance_shape: null,
          appearance_photo_url: null,
          created_at: '2026-07-01T00:00:00Z',
        },
      ],
      error: null,
    }

    await downloadAccountCsv('Mother / 媽媽', 'pat-mother')
    expect(clickedLinkDownload.startsWith('care-export-Mother___媽媽-')).toBe(true)
  })

  test('downloadAccountCsv wraps database errors with bilingual message and retains cause', async () => {
    fetchErrorOnTable = 'blood_pressure_records'
    await expect(downloadAccountCsv('Mother', 'pat-mother')).rejects.toThrow('Gagal mengunduh data perawatan lengkap')
  })

  test('treats a missing PRN table as an empty export instead of failing the whole download', async () => {
    // PRN migration 可能晚於前端 rollout；缺表時其他資料仍要能正常匯出。
    missingTableError = { table: 'prn_medication_events', error: { code: '42P01', message: 'relation "prn_medication_events" does not exist' } }
    await expect(downloadAccountCsv('Mother', 'pat-mother')).resolves.toBeUndefined()
    expect(clickedLinkDownload.startsWith('care-export-Mother-')).toBe(true)
  })

  test('a non-missing-table PRN error still fails the download', async () => {
    missingTableError = { table: 'prn_medication_daily_assessments', error: { code: '42501', message: 'permission denied for table prn_medication_daily_assessments' } }
    await expect(downloadAccountCsv('Mother', 'pat-mother')).rejects.toThrow('Gagal mengunduh data perawatan lengkap')
  })

  test('follows the pagination cursor until a short page signals the end', async () => {
    const fullPage = Array.from({ length: 1_000 }, (_, index) => ({
      id: `bp-page-${index}`,
      measured_at: '2026-07-31T09:00:00Z',
      systolic: 120,
      diastolic: 80,
      pulse: 70,
      source: 'manual_web',
      recorded_by: 'caregiver@example.com',
      created_at: '2026-07-31T09:00:00Z',
    }))
    pagedTableResponses = {
      table: 'blood_pressure_records',
      pages: [
        { data: fullPage, error: null },
        { data: [{ ...fullPage[0], id: 'bp-page-1000' }], error: null },
      ],
    }
    await downloadAccountCsv('Mother', 'pat-mother')
    expect(clickedLinkDownload.startsWith('care-export-Mother-')).toBe(true)
  })
})
