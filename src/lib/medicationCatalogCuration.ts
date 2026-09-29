/*
檔案用途：共用藥品目錄管理員（curator）資料層——列出使用者建立的共用藥品、呼叫
         curate_medication_catalog／medication_catalog_admin_usage／list_medication_catalog_changes
         三支 RPC，供 /admin「藥品目錄」分頁使用。
所在層：src/lib；純資料轉接層，不保存清單狀態（狀態邏輯見 useMedicationCatalogCuration）。
主要關聯：supabase/migrations/20260915120000_add_medication_catalog_curator_rpcs.sql，
         docs/product/shared-medication-catalog.md §4.6、§5.6。
*/
import { supabase } from './supabase'

export type CuratableMedicationRow = {
  id: string
  brandName: string
  brandNameZh: string | null
  genericName: string
  strengthMg: number | null
  strengthLabel: string | null
  dosageForm: string
  productKind: 'drug' | 'supplement'
  verificationStatus: 'official' | 'manually_verified' | 'unverified'
  catalogSource: string | null
  createdAt: string
  updatedAt: string
  // curator 專用：全站是否有一個以上家庭在用（不回傳計數與 patient_id，見 medication_catalog_admin_usage）。
  sharedWithOthers: boolean | null
}

export const CURATABLE_MEDICATIONS_PAGE_SIZE = 100

export type CuratableMedicationsPage = {
  rows: CuratableMedicationRow[]
  // 這一頁筆數等於 page size 時，代表可能還有更舊的列沒載入；不是精確的「還有幾筆」計數
  // （§5.4／§5.6 的反探測邊界一貫不回傳計數），只用來決定要不要顯示「載入更多」。
  hasMore: boolean
}

// 只列出使用者建立的共用列（created_by_user_id 有值）：官方目錄（TFDA／健保中藥／農業部）匯入的資料
// 不需要目錄管理員核對身分；已經被合併掉的列（merged_into_medication_id 有值）不再需要出現在待整理清單。
// medications 對已登入的 profiles 一律開放 SELECT（20260711010000），curator 不需要額外的 RPC 才能讀清單。
// offset 分頁：目錄成長後固定只抓第一頁會讓較舊的列永遠無法從這個畫面被核對／合併（PR #797 review）；
// 呼叫端（useMedicationCatalogCuration）用「載入更多」按鈕累加頁面，不做搜尋／排序切換，
// 先用最簡單的 offset 分頁滿足「不會有列被永久卡住看不到」，不做成熟的游標分頁。
export async function fetchCuratableMedications(offset = 0, limit = CURATABLE_MEDICATIONS_PAGE_SIZE): Promise<CuratableMedicationsPage> {
  const { data, error } = await supabase
    .from('medications')
    .select('id, brand_name, brand_name_zh, generic_name, strength_mg, strength_label, dosage_form, product_kind, verification_status, catalog_source, created_at, updated_at')
    .not('created_by_user_id', 'is', null)
    .is('merged_into_medication_id', null)
    .order('updated_at', { ascending: false })
    .range(offset, offset + limit - 1)
  if (error) throw error
  const rows = (data ?? []) as Array<{
    id: string
    brand_name: string
    brand_name_zh: string | null
    generic_name: string
    strength_mg: number | null
    strength_label: string | null
    dosage_form: string
    product_kind: string
    verification_status: string
    catalog_source: string | null
    created_at: string
    updated_at: string
  }>

  const usageById = await fetchAdminUsage(rows.map(row => row.id))

  return {
    rows: rows.map(row => ({
      id: row.id,
      brandName: row.brand_name,
      brandNameZh: row.brand_name_zh,
      genericName: row.generic_name,
      strengthMg: row.strength_mg,
      strengthLabel: row.strength_label,
      dosageForm: row.dosage_form,
      productKind: row.product_kind === 'supplement' ? 'supplement' : 'drug',
      verificationStatus: row.verification_status === 'official' || row.verification_status === 'manually_verified' ? row.verification_status : 'unverified',
      catalogSource: row.catalog_source,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      sharedWithOthers: usageById.get(row.id) ?? null,
    })),
    hasMore: rows.length === limit,
  }
}

async function fetchAdminUsage(medicationIds: string[]): Promise<Map<string, boolean>> {
  const usage = new Map<string, boolean>()
  if (medicationIds.length === 0) return usage
  const { data, error } = await supabase.rpc('medication_catalog_admin_usage', { p_medication_ids: medicationIds })
  if (error) {
    // 使用範圍是輔助資訊，不是核對／改身分能不能做的授權判斷；查詢失敗時清單仍要能顯示，只是徽章留白。
    console.error('[medication_catalog_admin_usage error]', error)
    return usage
  }
  for (const row of (data ?? []) as Array<{ medication_id: string; shared_with_others: boolean }>) {
    usage.set(row.medication_id, row.shared_with_others)
  }
  return usage
}

export type CuratorReason = 'paid' | 'trial' | 'complimentary' | 'correction' | 'revoked'

export async function verifyMedication(medicationId: string, reason: string): Promise<void> {
  await callCurateMedicationCatalog('verify', medicationId, {}, reason)
}

export async function unverifyMedication(medicationId: string, reason: string): Promise<void> {
  await callCurateMedicationCatalog('unverify', medicationId, {}, reason)
}

export interface EditMedicationIdentityInput {
  brandName: string
  brandNameZh: string
  genericName: string
  dosageForm: string
  productKind: 'drug' | 'supplement'
  strengthMg: number | null
  strengthLabel: string
}

export async function editMedicationIdentity(medicationId: string, input: EditMedicationIdentityInput, reason: string): Promise<void> {
  await callCurateMedicationCatalog('edit_identity', medicationId, {
    brand_name: input.brandName,
    brand_name_zh: input.brandNameZh,
    generic_name: input.genericName,
    dosage_form: input.dosageForm,
    product_kind: input.productKind,
    strength_mg: input.productKind === 'supplement' ? null : input.strengthMg,
    strength_label: input.strengthLabel,
  }, reason)
}

export async function mergeMedications(sourceMedicationId: string, targetMedicationId: string, reason: string): Promise<{ mergedIntoMedicationId: string; reassignedPlanCount: number }> {
  const result = await callCurateMedicationCatalog('merge', sourceMedicationId, { target_medication_id: targetMedicationId }, reason)
  const payload = result as { merged_into_medication_id?: unknown; reassigned_plan_count?: unknown }
  return {
    mergedIntoMedicationId: typeof payload.merged_into_medication_id === 'string' ? payload.merged_into_medication_id : targetMedicationId,
    reassignedPlanCount: typeof payload.reassigned_plan_count === 'number' ? payload.reassigned_plan_count : 0,
  }
}

async function callCurateMedicationCatalog(action: string, medicationId: string, payload: Record<string, unknown>, reason: string): Promise<unknown> {
  const trimmedReason = reason.trim()
  if (!trimmedReason) throw new Error('A reason is required')
  const { data, error } = await supabase.rpc('curate_medication_catalog', {
    p_action: action,
    p_medication_id: medicationId,
    p_payload: payload,
    p_reason: trimmedReason,
  })
  if (error) throw error
  return data
}

export type MedicationCatalogChangeLogRow = {
  id: string
  medicationId: string
  action: string
  actorEmail: string
  reason: string | null
  recordedAt: string
  beforeSnapshot: Record<string, unknown> | null
  afterSnapshot: Record<string, unknown> | null
}

export async function listMedicationCatalogChanges(medicationId: string | null, limit = 50): Promise<MedicationCatalogChangeLogRow[]> {
  const { data, error } = await supabase.rpc('list_medication_catalog_changes', { p_medication_id: medicationId, p_limit: limit })
  if (error) throw error
  return ((data ?? []) as Array<{
    id: string
    medication_id: string
    action: string
    actor_email: string
    reason: string | null
    recorded_at: string
    before_snapshot: Record<string, unknown> | null
    after_snapshot: Record<string, unknown> | null
  }>).map(row => ({
    id: row.id,
    medicationId: row.medication_id,
    action: row.action,
    actorEmail: row.actor_email,
    reason: row.reason,
    recordedAt: row.recorded_at,
    beforeSnapshot: row.before_snapshot,
    afterSnapshot: row.after_snapshot,
  }))
}
