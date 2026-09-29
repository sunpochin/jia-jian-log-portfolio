/*
檔案用途：集中「使用者管理」分頁的帳號清單讀取與付費旗標開通/取消的狀態與操作邏輯，供 AdminPage.tsx 呼叫。
所在層：src/features/system-admin/hooks；feature-specific 狀態容器 hook（AGENTS.md Rule A）。
主要關聯：AdminPage.tsx（唯一呼叫端）、src/lib/adminUsers.ts（Edge Function adapter）、
         supabase/functions/admin-set-account-entitlement/adminSetAccountEntitlement.ts
         （value／reason 相容性規則必須與這裡的預設邏輯一致）。
*/
import { useRef, useState } from 'react'
import type { LocalizedText } from '../../../lib/i18n'
import {
  type AdminUserRow,
  type EntitlementKey,
  type EntitlementReason,
  fetchAdminUsers,
  setAccountEntitlement,
} from '../../../lib/adminUsers'
import { describeSaveError } from '../../../lib/dataErrors'

// 每個 entitlement 開通後對應的資料庫值；取消勾選一律寫回 'none'。
export const ENTITLEMENT_ON_VALUE: Record<EntitlementKey, string> = {
  personal_notification_tier: 'personal',
  medication_ai_draft_tier: 'ai',
  premium_tier: 'premium',
  medication_catalog_curator_tier: 'curator',
}

export type EntitlementFieldKey = 'personalNotificationTier' | 'medicationAiDraftTier' | 'premiumTier' | 'medicationCatalogCuratorTier'
export const ENTITLEMENT_FIELD_BY_KEY: Record<EntitlementKey, EntitlementFieldKey> = {
  personal_notification_tier: 'personalNotificationTier',
  medication_ai_draft_tier: 'medicationAiDraftTier',
  premium_tier: 'premiumTier',
  medication_catalog_curator_tier: 'medicationCatalogCuratorTier',
}

// 與 supabase/functions/admin-set-account-entitlement/adminSetAccountEntitlement.ts 的
// isReasonCompatibleWithValue 保持一致：取消開通（value='none'）只接受這兩種 reason。
const REVOKE_COMPATIBLE_REASONS: readonly EntitlementReason[] = ['revoked', 'correction']

export function useAccountEntitlements() {
  const [users, setUsers] = useState<AdminUserRow[]>([])
  const [usersLoading, setUsersLoading] = useState(false)
  const [usersError, setUsersError] = useState<LocalizedText | null>(null)
  const usersLoadedRef = useRef(false)

  // 每個帳號各自選一個開通原因；用 userId 索引，切換分頁或重新整理清單後保留選擇。
  const [entitlementReasons, setEntitlementReasons] = useState<Record<string, EntitlementReason>>({})
  // 送出狀態與錯誤各自用 `${userId}:${entitlement}` 索引，讓同一個帳號的兩個勾選框互不干擾（Rule B／C）。
  const [entitlementSaving, setEntitlementSaving] = useState<Record<string, boolean>>({})
  const [entitlementErrors, setEntitlementErrors] = useState<Record<string, LocalizedText | null>>({})

  const fetchUsers = async () => {
    setUsersLoading(true)
    setUsersError(null)
    try {
      const response = await fetchAdminUsers()
      setUsers(response.users)
    } catch (err) {
      console.error('[admin list users read error]', err)
      setUsersError({
        id: 'Daftar pengguna sementara tidak dapat dimuat. Periksa internet lalu coba lagi.',
        zh: '暫時無法讀取使用者清單，請確認網路後重試。',
        en: 'The user list could not be loaded right now. Check your internet connection and try again.',
      })
    }
    setUsersLoading(false)
  }

  // 只在第一次切到「使用者管理」分頁時才呼叫 Function，避免管理者只看血壓總表時也額外打一次全站使用者查詢。
  const loadUsersOnce = () => {
    if (usersLoadedRef.current) return
    usersLoadedRef.current = true
    fetchUsers()
  }

  const setReason = (userId: string, reason: EntitlementReason) => {
    setEntitlementReasons(current => ({ ...current, [userId]: reason }))
  }

  const toggleEntitlement = async (user: AdminUserRow, entitlement: EntitlementKey, checked: boolean) => {
    const field = ENTITLEMENT_FIELD_BY_KEY[entitlement]
    const previousValue = user[field]
    const nextValue = checked ? ENTITLEMENT_ON_VALUE[entitlement] : 'none'
    const selectedReason = entitlementReasons[user.userId]
    // 取消勾選時，選單可能還停留在上一次選的開通類原因（例如「付費」）；照樣送出的話，
    // Edge Function 的 value/reason 相容性檢查會直接擋下這個請求。這裡改成自動挑一個跟
    // 「取消開通」相容的預設值（除非使用者已經明確選過 revoked／correction），並把選單
    // 同步成實際送出的原因，不讓管理者以為勾選失敗、也不讓稽核表留下自相矛盾的紀錄。
    const reason: EntitlementReason = checked
      ? (selectedReason ?? 'paid')
      : (selectedReason && REVOKE_COMPATIBLE_REASONS.includes(selectedReason) ? selectedReason : 'revoked')
    const key = `${user.userId}:${entitlement}`

    // 樂觀更新勾選框，讓操作有即時回饋；失敗時會在下面把這一列改回 previousValue，
    // 不能停在使用者按下當下的狀態，否則管理者會誤以為開通成功但其實沒有。
    setUsers(current => current.map(row => (row.userId === user.userId ? { ...row, [field]: nextValue } : row)))
    setEntitlementReasons(current => ({ ...current, [user.userId]: reason }))
    setEntitlementSaving(current => ({ ...current, [key]: true }))
    setEntitlementErrors(current => ({ ...current, [key]: null }))

    try {
      await setAccountEntitlement({ targetEmail: user.email, entitlement, value: nextValue, reason })
    } catch (err) {
      console.error('[admin set account entitlement error]', err)
      setUsers(current => current.map(row => (row.userId === user.userId ? { ...row, [field]: previousValue } : row)))
      setEntitlementErrors(current => ({
        ...current,
        [key]: describeSaveError(err, { id: 'Gagal menyimpan status berlangganan.', zh: '無法儲存付費狀態。', en: 'Unable to save the subscription status.' }),
      }))
    } finally {
      setEntitlementSaving(current => ({ ...current, [key]: false }))
    }
  }

  return {
    users,
    usersLoading,
    usersError,
    fetchUsers,
    loadUsersOnce,
    entitlementReasons,
    entitlementSaving,
    entitlementErrors,
    setReason,
    toggleEntitlement,
  }
}
