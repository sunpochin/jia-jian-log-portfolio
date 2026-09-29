/*
檔案用途：組合與整理血壓量測、事件紀錄與用藥變動之照護時間軸資料模型。
所在層：src/lib；為照護時間軸業務邏輯層。
主要關聯：由 CareTimeline 與 EventsPage 元件載入使用。
*/
import type { LocalizedText } from './i18n'
import type { BpRecord, CareEventPhotoAttachment } from '../types/database'
import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import timezone from 'dayjs/plugin/timezone'
import { TZ } from './timezone'

dayjs.extend(utc)
dayjs.extend(timezone)

export const CARE_TIMELINE_EVENT_TYPES = [
  'health_visit',
  'family_observation',
  'incident',
  'milestone',
  'care_note',
  'doctor_instruction',
  'reassessment',
  'vaccination',
  'symptom_observation',
  'diet_change',
] as const
export type CareTimelineEventType = typeof CARE_TIMELINE_EVENT_TYPES[number]
// 歷史 system event 仍可讀取，但一般使用者不能從這個表單手動製造 medication_change。
export type CareTimelineEntryEventType = CareTimelineEventType | 'medication_change'

// #659 S3（issue #685）：就醫類型列舉固定五種，對應 migration 20260914043552 的 CHECK 約束；
// 若之後要開放更細的分類，得同步改 migration，不能只改前端型別。
export const VISIT_KINDS = ['outpatient', 'emergency', 'admission', 'discharge', 'surgery'] as const
export type VisitKind = typeof VISIT_KINDS[number]

export const visitKindText: Record<VisitKind, LocalizedText> = {
  outpatient: { id: 'Rawat jalan', zh: '門診', en: 'Outpatient' },
  emergency: { id: 'Unit gawat darurat', zh: '急診', en: 'Emergency' },
  admission: { id: 'Rawat inap', zh: '住院', en: 'Admission' },
  discharge: { id: 'Pulang rawat inap', zh: '出院', en: 'Discharge' },
  surgery: { id: 'Operasi', zh: '手術', en: 'Surgery' },
}

export interface CareTimelineEntry {
  id: string
  patient_id: string
  event_type: CareTimelineEntryEventType
  title: string
  details: string
  occurred_at: string
  reassess_on: string | null
  created_by: string
  created_at: string
  medication_plan_id: string | null
  medication_plan_change_log_id?: string | null
  medication_change_snapshot?: import('../types/database').MedicationChangeSnapshot | null
  // 只有 event_type === 'health_visit' 時才會有值；migration 的跨欄位 CHECK 確保其他事件類型
  // 這三欄一律是 NULL，前端顯示與正規化都以此為前提，不需要再自行判斷型別是否相符。
  visit_kind?: VisitKind | null
  visit_department?: string | null
  visit_institution?: string | null
  photo_paths?: CareEventPhotoAttachment[]
  // 只有展示模式的本機資料（種子故事或訪客當場新增）才會帶這個欄位：一組已經可以直接顯示的圖片網址
  // （公開靜態示意圖或本機壓縮出的 data URI），刻意跟 photo_paths 分開，因為 photo_paths 只該是
  // Supabase Storage 的相對路徑——會經過 isSafeStoredPhotoPath 檢查並送去簽署 signed URL；
  // 展示模式的網址不是 Storage 物件，混進 photo_paths 會被那道檢查擋掉，或誤觸發對正式 Storage API 的簽署呼叫。
  demo_photo_urls?: string[]
}

export const CARE_TIMELINE_INITIAL_LIMIT = 5

export function visibleCareTimelineEntries(entries: CareTimelineEntry[], showAll: boolean, limit = CARE_TIMELINE_INITIAL_LIMIT) {
  // 先顯示最新幾筆，讓交班者能快速讀到重點；展開只改顯示範圍，不改查詢結果或排序。
  return showAll ? entries : entries.slice(0, limit)
}

export const careTimelineEventText: Record<CareTimelineEntryEventType, LocalizedText> = {
  health_visit: { id: 'Kunjungan kesehatan', zh: '看診／健康處置', en: 'Medical visit / Health treatment' },
  incident: { id: 'Kejadian atau cedera', zh: '意外／受傷', en: 'Accident/Injury' },
  milestone: { id: 'Peristiwa penting', zh: '重要事件', en: 'Key event' },
  care_note: { id: 'Catatan perawatan', zh: '照護筆記', en: 'Care Notes' },
  doctor_instruction: { id: 'Arahan dokter', zh: '醫師指示', en: "Doctor's instructions" },
  medication_change: { id: 'Perubahan obat dari daftar obat', zh: '藥單異動（由調整藥單產生）', en: 'Medication change (from schedule update)' },
  family_observation: { id: 'Pengamatan keluarga', zh: '家屬觀察', en: 'Family observation' },
  reassessment: { id: 'Penilaian ulang', zh: '重新評估', en: 'Reassessment' },
  vaccination: { id: 'Vaksinasi', zh: '疫苗接種', en: 'Vaccination' },
  symptom_observation: { id: 'Pengamatan gejala (muntah, pincang, dll.)', zh: '症狀觀察（嘔吐、跛腳等）', en: 'Symptom observation (vomiting, limping, etc.)' },
  diet_change: { id: 'Perubahan pakan/makanan', zh: '飲食／換糧變更', en: 'Diet / Food change' },
}

export function buildCareTimelineInsert(patientId: string, eventType: CareTimelineEventType, title: string, details: string, occurredAt: string, reassessOn: string, createdBy: string, visitFields: { visitKind?: VisitKind | ''; visitDepartment?: string; visitInstitution?: string } = {}, _legacyMedicationPlanId = '') {
  // 空白內容與未選日期要轉為 NULL；否則使用者無法分辨「沒有填」和真正的空字串。
  // 舊呼叫端的 plan id 只保留參數相容性；調藥必須經由 plan RPC 產生 linkage，不能由手動事件關聯。
  // 事件類型不是 health_visit 時，就醫欄位一律清成 NULL：使用者可能先選了看診再切換成其他類型，
  // 若照樣把舊值送出，會被 migration 的跨欄位 CHECK 拒絕，且語意上這三欄只對看診事件有意義。
  const isHealthVisit = eventType === 'health_visit'
  const visitDepartment = visitFields.visitDepartment?.trim() ?? ''
  const visitInstitution = visitFields.visitInstitution?.trim() ?? ''
  return {
    patient_id: patientId,
    event_type: eventType,
    title: title.trim(),
    details: details.trim(),
    occurred_at: occurredAt,
    reassess_on: reassessOn || null,
    created_by: createdBy.trim().toLowerCase(),
    medication_plan_id: null,
    visit_kind: isHealthVisit && visitFields.visitKind ? visitFields.visitKind : null,
    visit_department: isHealthVisit && visitDepartment ? visitDepartment : null,
    visit_institution: isHealthVisit && visitInstitution ? visitInstitution : null,
  }
}

export function isValidCareTimelineDraft(title: string, details: string) {
  return title.trim().length > 0 && title.trim().length <= 120 && details.trim().length <= 2000
}

export type TimelineReadingContext = { before?: BpRecord; after?: BpRecord }

// 時間線只拿「附近的事實量測」當交接脈絡，不計算因果或把單筆讀值當成醫療結論。
export function findTimelineReadingContext(records: BpRecord[], occurredAt: string, maxHours = 48): TimelineReadingContext {
  const target = new Date(occurredAt).getTime()
  if (!Number.isFinite(target)) return {}
  const maxMs = maxHours * 60 * 60 * 1000
  let before: BpRecord | undefined
  let after: BpRecord | undefined
  for (const record of records) {
    const measured = new Date(record.measured_at).getTime()
    if (!Number.isFinite(measured) || Math.abs(measured - target) > maxMs) continue
    if (measured <= target && (!before || measured > new Date(before.measured_at).getTime())) before = record
    if (measured > target && (!after || measured < new Date(after.measured_at).getTime())) after = record
  }
  return { before, after }
}

export function pendingReassessments(entries: CareTimelineEntry[], today: string, daysAhead = 7) {
  const latest = new Date(`${today}T00:00:00+08:00`).getTime() + daysAhead * 24 * 60 * 60 * 1000
  return entries.filter(entry => entry.reassess_on && new Date(`${entry.reassess_on}T00:00:00+08:00`).getTime() <= latest)
    .sort((a, b) => (a.reassess_on ?? '').localeCompare(b.reassess_on ?? ''))
}

export function entriesInReportPeriod(entries: CareTimelineEntry[], since: string, until: string) {
  const start = new Date(since).getTime()
  const end = new Date(until).getTime()
  // 報告選擇的是「事件發生時間」而不是建立時間；補登舊事件不能假裝是今天才發生的照護脈絡。
  return entries.filter(entry => {
    const occurred = new Date(entry.occurred_at).getTime()
    return Number.isFinite(occurred) && occurred >= start && occurred <= end
  })
}

export interface EventReviewWindow { start: string; end: string; startDate: string; endDate: string }

export interface EventReviewDay {
  date: string
  recordCount: number
  avgSystolic: number
  avgDiastolic: number
  avgPulse: number | null
}

export function eventReviewWindow(occurredAt: string, daysEachSide = 7): EventReviewWindow {
  // 前後窗口以台北「日曆日」切齊，否則晚上事件會在 UTC 換日後少算或多算一整天的居家量測。
  const event = dayjs(occurredAt).tz(TZ)
  const start = event.subtract(daysEachSide, 'day').startOf('day')
  const end = event.add(daysEachSide, 'day').endOf('day')
  return { start: start.toISOString(), end: end.toISOString(), startDate: start.format('YYYY-MM-DD'), endDate: end.format('YYYY-MM-DD') }
}

export function summarizeEventReviewDays(records: BpRecord[]): EventReviewDay[] {
  const grouped = new Map<string, BpRecord[]>()
  for (const record of records) {
    const date = dayjs(record.measured_at).tz(TZ).format('YYYY-MM-DD')
    grouped.set(date, [...(grouped.get(date) ?? []), record])
  }
  return [...grouped.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, readings]) => {
    const pulseValues = readings.flatMap(reading => reading.pulse == null ? [] : [reading.pulse])
    return {
      date,
      recordCount: readings.length,
      avgSystolic: Math.round(readings.reduce((sum, reading) => sum + reading.systolic, 0) / readings.length),
      avgDiastolic: Math.round(readings.reduce((sum, reading) => sum + reading.diastolic, 0) / readings.length),
      avgPulse: pulseValues.length ? Math.round(pulseValues.reduce((sum, pulse) => sum + pulse, 0) / pulseValues.length) : null,
    }
  })
}
