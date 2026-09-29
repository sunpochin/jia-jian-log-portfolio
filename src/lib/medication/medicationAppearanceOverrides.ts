/*
檔案用途：病人層外觀覆蓋（issue #759，共用藥品目錄單位 D）資料轉接層——讀寫
  patient_medication_appearance_overrides、查詢 medication_catalog_usage() 決定修正範圍，
  並提供把覆蓋值合併進共用藥品資料的純函式。
所在層：src/lib/medication 資料層；不含畫面狀態，寫入由 Supabase RLS（can_manage_medication）把關。
主要關聯：patient_medication_appearance_overrides 資料表、medication_catalog_usage() RPC（單位 A，
  20260914120000_stop_shared_medication_catalog_silent_overwrite.sql）；顯示端合併點在
  readMedicationDay／readMedicationAdminData（medicationToday.ts／medicationAdmin.ts），
  UI 面板見 src/features/medication/hooks/useMedicationAppearanceOverride.ts。
*/
import { supabase } from '../supabase'
import { isDemoMode } from '../demoStorage'
import { isDemoPatientId } from '../demoData'
import type { MedicationCatalog, PatientMedicationAppearanceOverride } from '../../types/database'

const PATIENT_MEDICATION_APPEARANCE_OVERRIDE_SELECT = 'patient_id, medication_id, appearance_color, appearance_shape, appearance_photo_url, appearance_note, updated_by, updated_at'

export const MEDICATION_APPEARANCE_OVERRIDE_NOTE_MAX_LENGTH = 120

export interface SavePatientMedicationAppearanceOverrideInput {
  patientId: string
  medicationId: string
  appearanceColor: string | null
  appearanceShape: string | null
  appearancePhotoUrl: string | null
  appearanceNote: string | null
}

export interface MedicationCatalogUsage {
  medicationId: string
  sharedWithOthers: boolean
  allManagedByCaller: boolean
}

/**
 * 讀取一位病人所有的外觀覆蓋列。/demo 是單一家庭的離線沙盒，規劃文件 §7 明講不需要覆蓋表，
 * 因此 demo 病人一律回傳空陣列，讓呼叫端不必另外判斷 demo／正式兩條路徑。
 */
export async function readPatientMedicationAppearanceOverrides(patientId: string): Promise<PatientMedicationAppearanceOverride[]> {
  if (isDemoMode() && isDemoPatientId(patientId)) return []
  const { data, error } = await supabase
    .from('patient_medication_appearance_overrides')
    .select(PATIENT_MEDICATION_APPEARANCE_OVERRIDE_SELECT)
    .eq('patient_id', patientId)
  if (error) throw error
  return (data ?? []) as unknown as PatientMedicationAppearanceOverride[]
}

/** 新增或覆寫一顆藥在這位病人身上的外觀；updated_by／updated_at 交給資料庫 trigger 從 JWT 寫入。 */
export async function savePatientMedicationAppearanceOverride(input: SavePatientMedicationAppearanceOverrideInput): Promise<PatientMedicationAppearanceOverride> {
  const trimmedNote = input.appearanceNote?.trim() || null
  if (trimmedNote && trimmedNote.length > MEDICATION_APPEARANCE_OVERRIDE_NOTE_MAX_LENGTH) {
    throw new Error(`Appearance override note must be at most ${MEDICATION_APPEARANCE_OVERRIDE_NOTE_MAX_LENGTH} characters`)
  }
  const payload = {
    patient_id: input.patientId,
    medication_id: input.medicationId,
    appearance_color: input.appearanceColor || null,
    appearance_shape: input.appearanceShape || null,
    appearance_photo_url: input.appearancePhotoUrl?.trim() || null,
    appearance_note: trimmedNote,
  }
  const { data, error } = await supabase
    .from('patient_medication_appearance_overrides')
    .upsert(payload, { onConflict: 'patient_id,medication_id' })
    .select(PATIENT_MEDICATION_APPEARANCE_OVERRIDE_SELECT)
    .single()
  if (error) throw error
  return data as unknown as PatientMedicationAppearanceOverride
}

/** 「還原成共用外觀」：刪除覆蓋列，之後合併時會自動退回共用 medications 那筆的外觀。 */
export async function clearPatientMedicationAppearanceOverride(patientId: string, medicationId: string): Promise<void> {
  const { error } = await supabase
    .from('patient_medication_appearance_overrides')
    .delete()
    .eq('patient_id', patientId)
    .eq('medication_id', medicationId)
  if (error) throw error
}

/**
 * 查詢這幾顆藥「還有誰在用」；只回兩個布林（規劃文件 §5.4 刻意不回計數，避免探測跨家庭用藥情形）。
 * 不在呼叫者管理範圍內的 medication_id 一律不會出現在回傳陣列中，呼叫端要用 medicationId 對照，
 * 找不到時視為「還沒有任何現役醫囑在用」，不能當成 all_managed_by_caller。
 */
export async function readMedicationCatalogUsage(medicationIds: string[]): Promise<MedicationCatalogUsage[]> {
  if (medicationIds.length === 0) return []
  const { data, error } = await supabase.rpc('medication_catalog_usage', { p_medication_ids: medicationIds })
  if (error) throw error
  return ((data ?? []) as { medication_id: string; shared_with_others: boolean; all_managed_by_caller: boolean }[]).map(row => ({
    medicationId: row.medication_id,
    sharedWithOthers: Boolean(row.shared_with_others),
    allManagedByCaller: Boolean(row.all_managed_by_caller),
  }))
}

export type MedicationAppearanceCorrectionScenario = 'direct' | 'shared_with_others' | 'official_or_verified'

/**
 * 規劃文件 §4.4 三種情境的判斷邏輯：只要這筆共用資料是官方或已核對過（情境 C），
 * 一律走覆蓋路徑，即使呼叫者剛好管理所有目前在用的病人——已核對過的資料不該被單次修正直接改掉，
 * 而是要保留給目錄管理員（單位 E）用「核對通過」流程處理。
 */
export function resolveAppearanceCorrectionScenario(
  verificationStatus: MedicationCatalog['verification_status'],
  usage: MedicationCatalogUsage | undefined,
): MedicationAppearanceCorrectionScenario {
  if (verificationStatus === 'official' || verificationStatus === 'manually_verified') return 'official_or_verified'
  return usage?.allManagedByCaller ? 'direct' : 'shared_with_others'
}

interface AppearanceFields {
  appearance_color: string | null
  appearance_shape: string | null
  appearance_photo_url: string | null
  appearance_note: string | null
}

/**
 * 把病人層覆蓋合併進共用藥品資料：覆蓋列存在時整組外觀四欄一起換成覆蓋值（不是逐欄 COALESCE），
 * 因為覆蓋代表「這位病人手上這顆藥的外觀」是一個完整、獨立的描述，不是共用資料的局部修正——
 * 半套合併（例如顏色用覆蓋、照片仍用共用）會顯示出現實中不存在的組合。
 */
export function mergeMedicationAppearanceOverride<T extends AppearanceFields>(
  medication: T,
  override: PatientMedicationAppearanceOverride | undefined,
): T & { appearance_source: 'shared' | 'patient_override' } {
  if (!override) return { ...medication, appearance_source: 'shared' }
  return {
    ...medication,
    appearance_color: override.appearance_color,
    appearance_shape: override.appearance_shape,
    appearance_photo_url: override.appearance_photo_url,
    appearance_note: override.appearance_note,
    appearance_source: 'patient_override',
  }
}

/** 依 medication_id 建索引，讓呼叫端可以用 Map.get() 逐一合併整批藥品，不必每顆藥各自查一次陣列。 */
export function indexOverridesByMedicationId(overrides: PatientMedicationAppearanceOverride[]): Map<string, PatientMedicationAppearanceOverride> {
  return new Map(overrides.map(override => [override.medication_id, override]))
}
