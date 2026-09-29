/*
檔案用途：呼叫 admin-list-users／admin-set-account-entitlement Edge Function 並驗證回傳形狀，
         供後台使用者管理分頁顯示註冊人數、帳號清單與付費旗標現值，並提供開通／取消開通的寫入函式。
所在層：src/lib；純資料轉接層，不保存清單狀態。
主要關聯：admin-list-users／admin-set-account-entitlement Edge Function、AdminPage.tsx 的使用者管理分頁。
*/
import { supabase } from './supabase'

// 與 supabase/functions/admin-set-account-entitlement/adminSetAccountEntitlement.ts 的白名單保持一致；
// 前端這份白名單只用來組請求與提示文案，實際授權邊界仍在 Edge Function 與 RPC 內。
export const ENTITLEMENT_KEYS = ['personal_notification_tier', 'medication_ai_draft_tier', 'premium_tier', 'medication_catalog_curator_tier'] as const
export type EntitlementKey = (typeof ENTITLEMENT_KEYS)[number]

export const ENTITLEMENT_REASONS = ['paid', 'trial', 'complimentary', 'correction', 'revoked'] as const
export type EntitlementReason = (typeof ENTITLEMENT_REASONS)[number]

export type AdminUserRow = {
  userId: string
  email: string
  displayName: string | null
  createdAt: string | null
  lastSignInAt: string | null
  personalNotificationTier: string
  medicationAiDraftTier: string
  premiumTier: string
  medicationCatalogCuratorTier: string
}

export type AdminUsersResponse = { users: AdminUserRow[]; totalCount: number }

export async function fetchAdminUsers(signal?: AbortSignal): Promise<AdminUsersResponse> {
  const { data, error } = await supabase.functions.invoke('admin-list-users', { body: {}, signal })
  if (error) throw new Error('admin list users request failed')
  return parseAdminUsersResponse(data)
}

export type SetAccountEntitlementParams = {
  targetEmail: string
  entitlement: EntitlementKey
  value: string
  reason: EntitlementReason
}

// 回傳更新後的 account_usage_limits 列，呼叫端用它把畫面上的現值同步成伺服器實際寫入的值，
// 而不是直接信任使用者勾選當下的樂觀狀態——寫入失敗或值被 RPC 內部正規化時，畫面都要以這裡回傳的為準。
export async function setAccountEntitlement(params: SetAccountEntitlementParams, signal?: AbortSignal): Promise<void> {
  const { error } = await supabase.functions.invoke('admin-set-account-entitlement', { body: params, signal })
  if (error) {
    // 保留 HTTP status（例如 Function 回的 403）在拋出的錯誤上，讓呼叫端能用
    // lib/dataErrors 的 isPermissionError／describeSaveError 分辨出「沒有權限」而不是一般儲存失敗，
    // 否則 FunctionsHttpError 的 status 只會停留在 error.context.status，被外層訊息蓋掉。
    const status = typeof (error as { context?: { status?: unknown } })?.context?.status === 'number'
      ? (error as { context: { status: number } }).context.status
      : undefined
    throw Object.assign(new Error('admin set account entitlement request failed'), status !== undefined ? { status } : {})
  }
}

// 為什麼即使是管理者專用畫面也要驗證形狀：Function 回應仍可能因升級或錯誤回應而變形，避免把 undefined／非陣列直接丟進畫面渲染。
export function parseAdminUsersResponse(value: unknown): AdminUsersResponse {
  if (!value || typeof value !== 'object') throw new Error('admin users response is invalid')
  const response = value as { users?: unknown; totalCount?: unknown }
  if (!Array.isArray(response.users)) throw new Error('admin users list is invalid')
  const users = response.users.map(parseAdminUserRow)
  if (typeof response.totalCount !== 'number') throw new Error('admin users total count is invalid')
  return { users, totalCount: response.totalCount }
}

function parseAdminUserRow(value: unknown): AdminUserRow {
  if (!value || typeof value !== 'object') throw new Error('admin user row is invalid')
  const row = value as Record<string, unknown>
  if (typeof row.userId !== 'string' || typeof row.email !== 'string') throw new Error('admin user row is invalid')
  if (row.displayName !== null && typeof row.displayName !== 'string') throw new Error('admin user row display name is invalid')
  if (row.createdAt !== null && typeof row.createdAt !== 'string') throw new Error('admin user row created at is invalid')
  if (row.lastSignInAt !== null && typeof row.lastSignInAt !== 'string') throw new Error('admin user row last sign-in is invalid')
  if (typeof row.personalNotificationTier !== 'string') throw new Error('admin user row personal notification tier is invalid')
  if (typeof row.medicationAiDraftTier !== 'string') throw new Error('admin user row medication ai draft tier is invalid')
  // premiumTier 是這次才新增的欄位；admin-list-users 沒有自動部署（CI 只跑 migration），
  // Vercel 前端卻會在合併後自動部署，兩者之間有一段視窗前端已更新但 Function 還沒重新部署。
  // 那段時間舊回應完全不會帶這個欄位，若在這裡照其他欄位一樣嚴格要求字串，會讓使用者管理
  // 分頁在部署空窗期整頁掛掉；缺欄位時退回 'none'（與資料表 DEFAULT 一致），欄位存在但形狀錯誤時仍要拒絕。
  if (row.premiumTier !== undefined && typeof row.premiumTier !== 'string') throw new Error('admin user row premium tier is invalid')
  // medicationCatalogCuratorTier 也比照 premiumTier：Edge Function 與前端各自獨立部署，
  // 部署空窗期舊回應不會帶這個欄位，缺欄位時退回 'none'（與資料表 DEFAULT 一致），欄位存在但形狀錯誤時仍要拒絕。
  if (row.medicationCatalogCuratorTier !== undefined && typeof row.medicationCatalogCuratorTier !== 'string') throw new Error('admin user row medication catalog curator tier is invalid')
  return {
    userId: row.userId,
    email: row.email,
    displayName: row.displayName as string | null,
    createdAt: row.createdAt as string | null,
    lastSignInAt: row.lastSignInAt as string | null,
    personalNotificationTier: row.personalNotificationTier,
    medicationAiDraftTier: row.medicationAiDraftTier,
    premiumTier: typeof row.premiumTier === 'string' ? row.premiumTier : 'none',
    medicationCatalogCuratorTier: typeof row.medicationCatalogCuratorTier === 'string' ? row.medicationCatalogCuratorTier : 'none',
  }
}
