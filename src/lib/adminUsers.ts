/*
檔案用途：呼叫 admin-list-users Edge Function 並驗證回傳形狀，供後台使用者管理分頁顯示註冊人數與帳號清單。
所在層：src/lib；純資料轉接層，不保存清單狀態。
主要關聯：admin-list-users Edge Function、AdminPage.tsx 的使用者管理分頁。
*/
import { supabase } from './supabase'

export type AdminUserRow = {
  userId: string
  email: string
  displayName: string | null
  createdAt: string | null
  lastSignInAt: string | null
}

export type AdminUsersResponse = { users: AdminUserRow[]; totalCount: number }

export async function fetchAdminUsers(signal?: AbortSignal): Promise<AdminUsersResponse> {
  const { data, error } = await supabase.functions.invoke('admin-list-users', { body: {}, signal })
  if (error) throw new Error('admin list users request failed')
  return parseAdminUsersResponse(data)
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
  return {
    userId: row.userId,
    email: row.email,
    displayName: row.displayName as string | null,
    createdAt: row.createdAt as string | null,
    lastSignInAt: row.lastSignInAt as string | null,
  }
}
