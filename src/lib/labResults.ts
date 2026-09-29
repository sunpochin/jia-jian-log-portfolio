/*
檔案用途：白名單檢驗值（K／NA／CR／EGFR／HBA1C／GLU／HB）的 Supabase 讀寫資料轉接層。
所在層：src/lib 共用資料層；隔離 Supabase RLS 細節，供 LabResultsPage 與 preVisitBrief 的 R5 規則使用。
中繼資料（LAB_ITEM_META 等）已拆到 labItemMeta.ts（純函式，不 import supabase），本檔 re-export
以維持既有呼叫端的 import 路徑不變。
主要關聯：patient_lab_results migration、src/lib/labItemMeta.ts、src/lib/preVisitBrief.ts（R5）、LabResultsPage。
*/
import { supabase } from './supabase'
import type { LabItemCode, LabResultSource, PatientLabResult } from '../types/database'
import { LAB_ITEM_META } from './labItemMeta'

export type { LabItemCode, LabResultSource, PatientLabResult } from '../types/database'
export type { LabRangeStatus } from './labItemMeta'
export { LAB_ITEM_META, LAB_ITEM_CODES, labRangeStatus, sampledAtFromDateKey, sampledDateKey } from './labItemMeta'

export interface CreateLabResultInput {
  patientId: string
  itemCode: LabItemCode
  value: number
  sampledAt: string
  referenceLow?: number | null
  referenceHigh?: number | null
  institution?: string | null
  notes?: string | null
}

// source／source_fingerprint 刻意不開放呼叫端傳入：手動輸入路徑只能是 'manual' + null，
// 這裡在應用層再鎖一次，跟資料庫 RLS 的 WITH CHECK 互為雙重保險，不是取代它。
function toRow(input: CreateLabResultInput) {
  return {
    patient_id: input.patientId,
    item_code: input.itemCode,
    value: input.value,
    unit: LAB_ITEM_META[input.itemCode].unit,
    reference_low: input.referenceLow ?? null,
    reference_high: input.referenceHigh ?? null,
    sampled_at: input.sampledAt,
    institution: input.institution ?? null,
    notes: input.notes ?? null,
    source: 'manual' as const satisfies LabResultSource,
  }
}

export async function listLabResults(patientId: string): Promise<PatientLabResult[]> {
  const { data, error } = await supabase
    .from('patient_lab_results')
    .select('*')
    .eq('patient_id', patientId)
    .order('sampled_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as PatientLabResult[]
}

// R5 規則只需要落在報告視窗內的檢驗值；獨立於 listLabResults（畫面清單一律顯示全部歷史）。
export async function listLabResultsInRange(patientId: string, sinceIso: string, untilIso: string): Promise<PatientLabResult[]> {
  const { data, error } = await supabase
    .from('patient_lab_results')
    .select('*')
    .eq('patient_id', patientId)
    .gte('sampled_at', sinceIso)
    .lte('sampled_at', untilIso)
    .order('sampled_at', { ascending: true })
  if (error) throw error
  return (data ?? []) as PatientLabResult[]
}

export async function createLabResult(input: CreateLabResultInput): Promise<PatientLabResult> {
  const { data, error } = await supabase
    .from('patient_lab_results')
    .insert(toRow(input))
    .select('*')
    .single()
  if (error) throw error
  return data as PatientLabResult
}

export async function updateLabResult(id: string, input: CreateLabResultInput): Promise<PatientLabResult> {
  const { data, error } = await supabase
    .from('patient_lab_results')
    .update(toRow(input))
    .eq('id', id)
    .eq('patient_id', input.patientId)
    .select('*')
    .single()
  if (error) throw error
  return data as PatientLabResult
}

export async function deleteLabResult(id: string): Promise<void> {
  const { error } = await supabase.from('patient_lab_results').delete().eq('id', id)
  if (error) throw error
}
