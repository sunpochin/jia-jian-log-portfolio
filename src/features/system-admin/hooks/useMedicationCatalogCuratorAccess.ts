/*
檔案用途：讓登入者查詢自己是不是共用藥品目錄管理員（curator），供 App.tsx 決定是否放行
         /admin 路由，以及 AdminPage 決定要不要顯示「藥品目錄」分頁。
所在層：src/features/system-admin/hooks；feature-specific 狀態容器 hook（AGENTS.md Rule A）。
主要關聯：supabase/migrations/20260915110000_add_medication_catalog_curator_entitlement.sql 的
         current_user_is_medication_catalog_curator() RPC（只回傳呼叫者自己的布林，不接受參數，
         account_usage_limits 本身對一般登入者是 REVOKE ALL，前端讀不到其他人的付費旗標）。
*/
import { useEffect, useState } from 'react'
import { supabase } from '../../../lib/supabase'

export interface MedicationCatalogCuratorAccess {
  isCurator: boolean
  loading: boolean
}

// enabled 為 false 時完全不打 RPC：管理者本人不需要這次額外查詢就能進 /admin，
// 一般使用者停留在其他頁面時也不該平白多一次網路呼叫。
export function useMedicationCatalogCuratorAccess(userId: string | undefined, enabled: boolean): MedicationCatalogCuratorAccess {
  const [isCurator, setIsCurator] = useState(false)
  const [loading, setLoading] = useState(enabled)

  useEffect(() => {
    if (!enabled || !userId) {
      setIsCurator(false)
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    supabase
      .rpc('current_user_is_medication_catalog_curator')
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) {
          console.error('[current_user_is_medication_catalog_curator error]', error)
          // 讀取失敗時 fail closed：不能因為查詢失敗就放行 /admin 的藥品目錄分頁。
          setIsCurator(false)
        } else {
          setIsCurator(data === true)
        }
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
    // userId 變動（切換帳號）才需要重查；enabled 只在路由／管理者身分改變時才會變動。
  }, [userId, enabled])

  return { isCurator, loading }
}
