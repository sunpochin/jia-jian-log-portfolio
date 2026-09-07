/*
檔案用途：將單一照護對象的血壓、體溫、藥單、服藥紀錄與照護大事記整合為可下載的完整 CSV。
所在層：src/lib 資料匯出服務層；不含畫面狀態，僅讀取已由 Supabase RLS 授權的資料。
主要關聯：由 ExportCsvModal 呼叫，使用 database.ts、careTimeline.ts 型別與 Supabase 資料表產生檔案。
*/
import dayjs from 'dayjs'
import timezone from 'dayjs/plugin/timezone'
import utc from 'dayjs/plugin/utc'
import { supabase } from './supabase'
import { REPORT_TIMEZONE } from './recordReport'
import type { CareTimelineEntry } from './careTimeline'
import { normalizeCareEventPhotoPaths } from './careEventPhotos'
import type { BpRecord, MealRecord, MealRecordItem, MedicationCatalog, MedicationIntakeLog, MedicationPlan, PatientWeightMeasurementRecord, PrnMedicationDailyAssessment, PrnMedicationEvent, TemperatureRecord } from '../types/database'

dayjs.extend(utc)
dayjs.extend(timezone)

const CSV_PAGE_SIZE = 1_000
const CSV_HEADERS = [
  'Jenis data / 資料類型',
  'Waktu kejadian / 發生時間',
  'Timestamp asli / 原始時間戳',
  'Zona waktu / 時區',
  'ID data / 資料 ID',
  'Sistolik mmHg / 收縮壓',
  'Diastolik mmHg / 舒張壓',
  'Denyut bpm / 心跳',
  'Sumber / 來源',
  'Pencatat / 紀錄者',
  'ID obat / 藥品 ID',
  'Nama obat / 藥品名稱',
  'Nama generik / 學名',
  'Kekuatan / 劑量規格',
  'Jadwal / 用藥時段',
  'Takaran sekali minum / 單次用量',
  'Jumlah dosis / 劑數',
  'Jika perlu / 需要時服用',
  'Aktif / 啟用中',
  'ID rencana obat / 藥單 ID',
  'Dosis ke- / 第幾劑',
  'Hari perawatan / 照護日',
  'Jenis peristiwa / 大事記類型',
  'Judul peristiwa / 大事記標題',
  'Rincian peristiwa / 大事記細節',
  'Tanggal evaluasi ulang / 下次評估日期',
  'Dibuat pada / 建立時間',
  'Suhu °C / 體溫',
  'Lokasi pengukuran / 測量部位',
  'Konteks / 量測情境',
  'Catatan suhu / 體溫備註',
  'Efek PRN / PRN 效果',
  'Alasan PRN / PRN 原因',
  'Alasan pembatalan PRN / PRN 作廢原因',
  'Status PRN / PRN 狀態',
  'ID perubahan obat / 調藥變更 ID',
  'Snapshot perubahan obat / 調藥快照',
  'Path foto peristiwa / 照護事件照片路徑',
  'Berat kg / 體重公斤',
  'Nomor pengukuran / 量測次數',
  'Jenis makan / 餐點類型',
  'Catatan makan / 餐點備註',
  'Nama makanan / 食物名稱',
  'Porsi / 份量',
  'Kalori / 熱量',
  'Dasar kalori / 熱量依據',
]

export interface CompleteCareExportData {
  bloodPressureRecords: BpRecord[]
  medicationPlans: MedicationPlan[]
  medicationLogs: MedicationIntakeLog[]
  medications: MedicationCatalog[]
  timelineEntries: CareTimelineEntry[]
  temperatureRecords?: TemperatureRecord[]
  prnMedicationEvents?: PrnMedicationEvent[]
  prnMedicationAssessments?: PrnMedicationDailyAssessment[]
  mealRecords?: MealRecord[]
  mealRecordItems?: MealRecordItem[]
  weightMeasurements?: PatientWeightMeasurementRecord[]
}

function csvCell(value: string | number | boolean | null | undefined): string {
  const text = value == null ? '' : String(value)
  // 匯出的自由文字可能由使用者輸入；先阻止 Excel 將它當公式，避免下載檔成為執行入口。
  const safeText = /^[=+\-@\t\r\n]/.test(text) ? `'${text}` : text
  return `"${safeText.replace(/"/g, '""')}"`
}

function localTime(timestamp: string | null | undefined): string {
  return timestamp ? dayjs(timestamp).tz(REPORT_TIMEZONE).format('YYYY-MM-DD HH:mm:ss') : ''
}

function completeCareRow(values: Record<string, string | number | boolean | null | undefined>): string[] {
  return CSV_HEADERS.map(header => {
    const value = values[header]
    return value == null ? '' : String(value)
  })
}

/** 產生一個依時間排序、欄位固定的 CSV，讓同一檔能被 Excel 篩選不同照護資料類型。 */
export function buildCompleteCareCsv(data: CompleteCareExportData): string {
  const medicationById = new Map(data.medications.map(medication => [medication.id, medication]))
  const rows: Array<{ occurredAt: string; cells: string[] }> = [
    ...data.bloodPressureRecords.map(record => ({
      occurredAt: record.measured_at,
      cells: completeCareRow({
        [CSV_HEADERS[0]]: 'Tekanan darah / 血壓紀錄',
        [CSV_HEADERS[1]]: localTime(record.measured_at),
        [CSV_HEADERS[2]]: record.measured_at,
        [CSV_HEADERS[3]]: REPORT_TIMEZONE,
        [CSV_HEADERS[4]]: record.id,
        [CSV_HEADERS[5]]: record.systolic,
        [CSV_HEADERS[6]]: record.diastolic,
        [CSV_HEADERS[7]]: record.pulse,
        [CSV_HEADERS[8]]: record.source,
        [CSV_HEADERS[9]]: record.recorded_by,
        [CSV_HEADERS[26]]: localTime(record.created_at),
      }),
    })),
    ...(data.temperatureRecords ?? []).map(record => ({
      occurredAt: record.measured_at,
      cells: completeCareRow({
        [CSV_HEADERS[0]]: 'Suhu tubuh / 體溫紀錄',
        [CSV_HEADERS[1]]: localTime(record.measured_at),
        [CSV_HEADERS[2]]: record.measured_at,
        [CSV_HEADERS[3]]: REPORT_TIMEZONE,
        [CSV_HEADERS[4]]: record.id,
        [CSV_HEADERS[8]]: record.source,
        [CSV_HEADERS[9]]: record.recorded_by,
        [CSV_HEADERS[26]]: localTime(record.created_at),
        [CSV_HEADERS[27]]: record.temperature_c,
        [CSV_HEADERS[28]]: record.measurement_site,
        [CSV_HEADERS[29]]: record.context,
        [CSV_HEADERS[30]]: record.notes,
      }),
    })),
    ...data.medicationPlans.map(plan => {
      const medication = medicationById.get(plan.medication_id)
      return {
        occurredAt: plan.created_at,
        cells: completeCareRow({
          [CSV_HEADERS[0]]: 'Rencana obat / 用藥清單',
          [CSV_HEADERS[1]]: localTime(plan.created_at),
          [CSV_HEADERS[2]]: plan.created_at,
          [CSV_HEADERS[3]]: REPORT_TIMEZONE,
          [CSV_HEADERS[4]]: plan.id,
          [CSV_HEADERS[9]]: plan.account_email,
          [CSV_HEADERS[10]]: plan.medication_id,
          [CSV_HEADERS[11]]: medication?.brand_name_zh || medication?.brand_name,
          [CSV_HEADERS[12]]: medication?.generic_name,
          [CSV_HEADERS[13]]: medication?.strength_label || (medication ? `${medication.strength_mg} mg` : ''),
          [CSV_HEADERS[14]]: plan.schedule_slot,
          [CSV_HEADERS[15]]: plan.dose_amount,
          [CSV_HEADERS[16]]: plan.dose_count,
          [CSV_HEADERS[17]]: plan.as_needed ? 'Ya / 是' : 'Tidak / 否',
          [CSV_HEADERS[18]]: plan.active ? 'Ya / 是' : 'Tidak / 否',
          [CSV_HEADERS[19]]: plan.id,
          [CSV_HEADERS[26]]: localTime(plan.created_at),
        }),
      }
    }),
    ...data.medicationLogs.map(log => {
      const medication = medicationById.get(log.medication_id)
      return {
        occurredAt: log.taken_at,
        cells: completeCareRow({
          [CSV_HEADERS[0]]: 'Catatan minum obat / 服藥紀錄',
          [CSV_HEADERS[1]]: localTime(log.taken_at),
          [CSV_HEADERS[2]]: log.taken_at,
          [CSV_HEADERS[3]]: REPORT_TIMEZONE,
          [CSV_HEADERS[4]]: log.id,
          [CSV_HEADERS[9]]: log.account_email,
          [CSV_HEADERS[10]]: log.medication_id,
          [CSV_HEADERS[11]]: log.medication_name || medication?.brand_name_zh || medication?.brand_name,
          [CSV_HEADERS[12]]: medication?.generic_name,
          [CSV_HEADERS[13]]: medication?.strength_label || (medication ? `${medication.strength_mg} mg` : ''),
          [CSV_HEADERS[19]]: log.plan_id,
          [CSV_HEADERS[20]]: log.dose_number,
          // 繁體中文註解：匯出同時保留發生時間與照護日；不要把凌晨服藥誤標成下一個照護日。
          [CSV_HEADERS[21]]: log.care_date || log.taken_on,
          [CSV_HEADERS[26]]: localTime(log.created_at),
        }),
      }
    }),
    ...(data.prnMedicationEvents ?? []).map(event => {
      const medication = medicationById.get(event.medication_id)
      return {
        occurredAt: event.taken_at,
        cells: completeCareRow({
          [CSV_HEADERS[0]]: 'Catatan PRN / PRN 使用紀錄',
          [CSV_HEADERS[1]]: localTime(event.taken_at),
          [CSV_HEADERS[2]]: event.taken_at,
          [CSV_HEADERS[3]]: REPORT_TIMEZONE,
          [CSV_HEADERS[4]]: event.id,
          [CSV_HEADERS[9]]: event.recorded_by_email,
          [CSV_HEADERS[10]]: event.medication_id,
          [CSV_HEADERS[11]]: medication?.brand_name_zh || medication?.brand_name,
          [CSV_HEADERS[12]]: medication?.generic_name,
          [CSV_HEADERS[13]]: medication?.strength_label || (medication ? `${medication.strength_mg} mg` : ''),
          [CSV_HEADERS[15]]: `${event.dose_amount} ${event.dose_unit}`,
          [CSV_HEADERS[19]]: event.plan_id,
          [CSV_HEADERS[21]]: event.care_date,
          [CSV_HEADERS[22]]: 'prn_usage / PRN 使用',
          [CSV_HEADERS[23]]: event.reason,
          [CSV_HEADERS[24]]: event.notes,
          [CSV_HEADERS[26]]: localTime(event.created_at),
          [CSV_HEADERS[31]]: event.effect_status,
          [CSV_HEADERS[32]]: event.reason,
          [CSV_HEADERS[33]]: event.void_reason,
          [CSV_HEADERS[34]]: event.status,
        }),
      }
    }),
    ...(data.prnMedicationAssessments ?? []).map(assessment => ({
      occurredAt: assessment.assessed_at ?? assessment.updated_at,
      cells: completeCareRow({
        [CSV_HEADERS[0]]: 'Status harian PRN / PRN 每日狀態',
        [CSV_HEADERS[1]]: localTime(assessment.assessed_at ?? assessment.updated_at),
        [CSV_HEADERS[2]]: assessment.assessed_at ?? assessment.updated_at,
        [CSV_HEADERS[3]]: REPORT_TIMEZONE,
        [CSV_HEADERS[4]]: assessment.id,
        [CSV_HEADERS[9]]: assessment.assessed_by_email,
        [CSV_HEADERS[19]]: assessment.plan_id,
        [CSV_HEADERS[21]]: assessment.care_date,
        [CSV_HEADERS[22]]: 'prn_daily_status / PRN 每日狀態',
        [CSV_HEADERS[23]]: assessment.status,
        [CSV_HEADERS[24]]: assessment.notes,
        [CSV_HEADERS[26]]: localTime(assessment.created_at),
      }),
    })),
    ...data.timelineEntries.map(entry => ({
      occurredAt: entry.occurred_at,
      cells: completeCareRow({
        [CSV_HEADERS[0]]: 'Peristiwa perawatan / 照護大事記',
        [CSV_HEADERS[1]]: localTime(entry.occurred_at),
        [CSV_HEADERS[2]]: entry.occurred_at,
        [CSV_HEADERS[3]]: REPORT_TIMEZONE,
        [CSV_HEADERS[4]]: entry.id,
        [CSV_HEADERS[9]]: entry.created_by,
        [CSV_HEADERS[19]]: entry.medication_plan_id,
        [CSV_HEADERS[22]]: entry.event_type,
        [CSV_HEADERS[23]]: entry.title,
        [CSV_HEADERS[24]]: entry.details,
        [CSV_HEADERS[25]]: entry.reassess_on,
        [CSV_HEADERS[26]]: localTime(entry.created_at),
        [CSV_HEADERS[35]]: entry.medication_plan_change_log_id,
        // 保留 canonical before/after projection，讓 CSV 交接不必依賴目前藥品目錄名稱。
        [CSV_HEADERS[36]]: entry.medication_change_snapshot ? JSON.stringify(entry.medication_change_snapshot) : null,
        // 匯出相對 path 而不是短效 signed URL；交接檔不應在下載後假裝照片永久可用。
        [CSV_HEADERS[37]]: normalizeCareEventPhotoPaths(entry.photo_paths).map(photo => JSON.stringify(photo)).join('\n'),
      }),
    })),
    ...(data.weightMeasurements ?? []).map(record => ({
      occurredAt: record.measured_at,
      cells: completeCareRow({
        [CSV_HEADERS[0]]: 'Berat badan / 體重紀錄',
        [CSV_HEADERS[1]]: localTime(record.measured_at),
        [CSV_HEADERS[2]]: record.measured_at,
        [CSV_HEADERS[3]]: REPORT_TIMEZONE,
        [CSV_HEADERS[4]]: record.id,
        [CSV_HEADERS[9]]: record.recorded_by,
        [CSV_HEADERS[26]]: localTime(record.created_at),
        [CSV_HEADERS[38]]: record.weight_kg,
        [CSV_HEADERS[39]]: record.measurement_number,
      }),
    })),
    ...(data.mealRecords ?? []).map(record => ({
      occurredAt: record.occurred_at,
      cells: completeCareRow({
        [CSV_HEADERS[0]]: 'Makanan / 餐點紀錄',
        [CSV_HEADERS[1]]: localTime(record.occurred_at),
        [CSV_HEADERS[2]]: record.occurred_at,
        [CSV_HEADERS[3]]: REPORT_TIMEZONE,
        [CSV_HEADERS[4]]: record.id,
        [CSV_HEADERS[8]]: record.source,
        [CSV_HEADERS[9]]: record.recorded_by,
        [CSV_HEADERS[22]]: record.meal_type,
        [CSV_HEADERS[24]]: record.notes,
        [CSV_HEADERS[26]]: localTime(record.created_at),
        [CSV_HEADERS[40]]: record.meal_type,
        [CSV_HEADERS[41]]: record.notes,
      }),
    })),
    ...(data.mealRecordItems ?? []).map(item => ({
      occurredAt: data.mealRecords?.find(record => record.id === item.meal_record_id)?.occurred_at ?? item.created_at,
      cells: completeCareRow({
        [CSV_HEADERS[0]]: 'Makanan / 食物項目',
        [CSV_HEADERS[2]]: item.created_at,
        [CSV_HEADERS[3]]: REPORT_TIMEZONE,
        [CSV_HEADERS[4]]: item.id,
        [CSV_HEADERS[26]]: localTime(item.created_at),
        [CSV_HEADERS[42]]: item.food_name_snapshot,
        [CSV_HEADERS[43]]: `${item.quantity} ${item.serving_label_snapshot}`.trim(),
        [CSV_HEADERS[44]]: item.calories_kcal,
        [CSV_HEADERS[45]]: item.calorie_basis,
      }),
    })),
  ]

  rows.sort((left, right) => right.occurredAt.localeCompare(left.occurredAt))
  // BOM 讓 Excel 直接開啟時仍可辨識繁中與印尼文，避免使用者自行選字元編碼。
  return `\uFEFF${[CSV_HEADERS, ...rows.map(row => row.cells)].map(row => row.map(csvCell).join(',')).join('\r\n')}`
}

type PatientDataTable = 'blood_pressure_records' | 'body_temperature_records' | 'medication_plans' | 'medication_intake_logs' | 'prn_medication_events' | 'prn_medication_daily_assessments' | 'care_timeline_entries' | 'meal_records' | 'meal_record_items' | 'patient_weight_measurement_records'

function isMissingPrnTable(error: unknown) {
  const candidate = error && typeof error === 'object' ? error as { code?: string; message?: string } : {}
  const message = candidate.message?.toLowerCase() ?? ''
  return (candidate.code === '42P01' || candidate.code === 'PGRST205') && message.includes('prn_medication_')
}

async function readAllPatientRows<T>(table: PatientDataTable, columns: string, patientId: string, orderColumn: string, allowMissingPrnTable = false): Promise<T[]> {
  const allRows: T[] = []
  for (let from = 0; ; from += CSV_PAGE_SIZE) {
    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .eq('patient_id', patientId)
      .order(orderColumn, { ascending: false })
      .range(from, from + CSV_PAGE_SIZE - 1)
    if (error) {
      // PRN migration 可晚於前端 rollout；只把明確缺少 PRN 表視為空資料，其他錯誤仍要讓匯出失敗並通知照護者。
      if (allowMissingPrnTable && isMissingPrnTable(error)) return []
      throw error
    }
    const page = (data ?? []) as unknown as T[]
    allRows.push(...page)
    if (page.length < CSV_PAGE_SIZE) return allRows
  }
}

async function readMedications(medicationIds: string[]): Promise<MedicationCatalog[]> {
  const uniqueIds = [...new Set(medicationIds)]
  const medications: MedicationCatalog[] = []
  // 分批讀取能避免長期用藥者的 ID 清單超過 URL／PostgREST 查詢長度。
  for (let index = 0; index < uniqueIds.length; index += 100) {
    const { data, error } = await supabase
      .from('medications')
      .select('id, drug_product_id, brand_name, brand_name_zh, brand_name_id, generic_name, strength_mg, strength_label, dosage_form, specialties, verification_status, tfda_license_number, nhi_drug_code, appearance_note, appearance_color, appearance_shape, appearance_photo_url, atc_code, created_at')
      .in('id', uniqueIds.slice(index, index + 100))
    if (error) throw error
    medications.push(...((data ?? []) as MedicationCatalog[]))
  }
  return medications
}

/** 匯出指定對象的完整照護歷史；每張表都明確以 patient_id 篩選，維持多人照護下的資料隔離。 */
export async function downloadAccountCsv(subjectLabel = 'Personal / 個人紀錄', patientId?: string): Promise<void> {
  if (!patientId) throw new Error('Patient ID required for CSV export')

  try {
    const [bloodPressureRecords, temperatureRecords, medicationPlans, medicationLogs, prnMedicationEvents, prnMedicationAssessments, timelineEntries, mealRecords, mealRecordItems, weightMeasurements] = await Promise.all([
      readAllPatientRows<BpRecord>('blood_pressure_records', '*', patientId, 'measured_at'),
      readAllPatientRows<TemperatureRecord>('body_temperature_records', '*', patientId, 'measured_at'),
      readAllPatientRows<MedicationPlan>('medication_plans', 'id, account_email, patient_id, medication_id, schedule_slot, as_needed, dose_amount, dose_count, display_order, active, created_at', patientId, 'created_at'),
      readAllPatientRows<MedicationIntakeLog>('medication_intake_logs', 'id, account_email, patient_id, medication_id, medication_name, plan_id, dose_number, taken_on, care_date, taken_at, created_at', patientId, 'taken_at'),
      readAllPatientRows<PrnMedicationEvent>('prn_medication_events', '*', patientId, 'taken_at', true),
      readAllPatientRows<PrnMedicationDailyAssessment>('prn_medication_daily_assessments', '*', patientId, 'updated_at', true),
      readAllPatientRows<CareTimelineEntry>('care_timeline_entries', 'id, patient_id, event_type, title, details, occurred_at, reassess_on, created_by, created_at, medication_plan_id, medication_plan_change_log_id, medication_change_snapshot, photo_paths', patientId, 'occurred_at'),
      readAllPatientRows<MealRecord>('meal_records', 'id, patient_id, meal_type, occurred_at, notes, source, recorded_by, created_at, updated_at', patientId, 'occurred_at'),
      readAllPatientRows<MealRecordItem>('meal_record_items', 'id, meal_record_id, patient_id, food_catalog_item_id, food_name_snapshot, serving_label_snapshot, quantity, calories_kcal, calorie_basis, created_at', patientId, 'created_at'),
      readAllPatientRows<PatientWeightMeasurementRecord>('patient_weight_measurement_records', 'id, patient_id, profile_email, weight_kg, measured_on, measurement_number, measured_at, recorded_by, created_at', patientId, 'measured_at'),
    ])
    const medications = await readMedications([...medicationPlans, ...medicationLogs, ...prnMedicationEvents].map(row => row.medication_id))
    // 匯出以同一個 patient_id 讀取三個新資料域，避免「完整照護」其實漏掉餐點與體重。
    const csvContent = buildCompleteCareCsv({ bloodPressureRecords, temperatureRecords, medicationPlans, medicationLogs, medications, timelineEntries, prnMedicationEvents, prnMedicationAssessments, mealRecords, mealRecordItems, weightMeasurements })
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    const safeLabel = subjectLabel.replace(/[/\\?%*:|"<>]/g, '_').replace(/\s+/g, '_')
    link.href = url
    link.download = `care-export-${safeLabel}-${dayjs().tz(REPORT_TIMEZONE).format('YYYYMMDD')}.csv`
    document.body.appendChild(link)
    link.click()
    link.remove()
    // 延後釋放 Blob URL，避免部分 Safari 在未排入下載前就清除資源。
    setTimeout(() => URL.revokeObjectURL(url), 100)
  } catch (error) {
    console.error('[complete care csv export error]', error)
    // 專案目前的 TypeScript lib 尚未支援 ErrorOptions，仍要保留原始錯誤以便除錯而非丟失資料庫原因。
    throw Object.assign(new Error('Gagal mengunduh data perawatan lengkap / 暫時無法讀取完整照護資料以產生 CSV。'), { cause: error })
  }
}
