/*
檔案用途：集中「藥品目錄」分頁的清單讀取（含分頁載入更多）、核對／改身分／合併四個動作的送出狀態，
         供 MedicationCatalogCurationPanel 呼叫。
所在層：src/features/system-admin/hooks；feature-specific 狀態容器 hook（AGENTS.md Rule A）。
主要關聯：MedicationCatalogCurationPanel.tsx（唯一呼叫端）、src/lib/medicationCatalogCuration.ts
         （Supabase／RPC adapter）。
*/
import { useRef, useState } from 'react'
import type { LocalizedText } from '../../../lib/i18n'
import { describeSaveError } from '../../../lib/dataErrors'
import {
  CURATABLE_MEDICATIONS_PAGE_SIZE,
  type CuratableMedicationRow,
  type EditMedicationIdentityInput,
  editMedicationIdentity,
  fetchCuratableMedications,
  mergeMedications,
  unverifyMedication,
  verifyMedication,
} from '../../../lib/medicationCatalogCuration'

export function useMedicationCatalogCuration() {
  const [rows, setRows] = useState<CuratableMedicationRow[]>([])
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [loadError, setLoadError] = useState<LocalizedText | null>(null)
  const loadedRef = useRef(false)

  // 每個動作各自用 medicationId 索引送出中／錯誤狀態，避免清單裡的其他列被同一個 loading 卡住（Rule B／C）。
  const [actionSaving, setActionSaving] = useState<Record<string, boolean>>({})
  const [actionErrors, setActionErrors] = useState<Record<string, LocalizedText | null>>({})

  // 重新從第一頁載入：初次進分頁、重試、以及任何動作成功後都呼叫這支，讓剛核對／改身分／合併的
  // 那一列（updated_at 剛被更新）依排序規則跳回最上方，同時把「載入更多」的進度重置——
  // 比起只更新單一列，整頁重抓能確保排序、使用範圍徽章與新加入的列都反映最新狀態。
  const fetchRows = async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const page = await fetchCuratableMedications(0)
      setRows(page.rows)
      setHasMore(page.hasMore)
    } catch (err) {
      console.error('[curatable medications read error]', err)
      setLoadError({
        id: 'Daftar katalog obat sementara tidak dapat dimuat. Periksa internet lalu coba lagi.',
        zh: '暫時無法讀取藥品目錄清單，請確認網路後重試。',
        en: 'The medication catalog list could not be loaded. Check your internet connection and try again.',
      })
    }
    setLoading(false)
  }

  const loadOnce = () => {
    if (loadedRef.current) return
    loadedRef.current = true
    fetchRows()
  }

  // 目錄成長後固定只抓第一頁會讓較舊的列永遠無法從這個畫面被核對／合併，所以清單支援「載入更多」，
  // 累加在既有清單後面，不重新排序既有列（PR #797 review）。
  const loadMore = async () => {
    if (loadingMore || !hasMore) return
    setLoadingMore(true)
    try {
      const page = await fetchCuratableMedications(rows.length, CURATABLE_MEDICATIONS_PAGE_SIZE)
      setRows(current => [...current, ...page.rows])
      setHasMore(page.hasMore)
    } catch (err) {
      console.error('[curatable medications load more error]', err)
      setLoadError({
        id: 'Daftar katalog obat sementara tidak dapat dimuat. Periksa internet lalu coba lagi.',
        zh: '暫時無法讀取藥品目錄清單，請確認網路後重試。',
        en: 'The medication catalog list could not be loaded. Check your internet connection and try again.',
      })
    }
    setLoadingMore(false)
  }

  // 回傳是否成功：呼叫端（表單）只在動作真的成功時才清空／收合表單，失敗時保留使用者已填的內容，
  // 不能讓 curator 因為一次失敗（例如驗證錯誤或網路問題）就要整份表單重打一次（PR #797 review）。
  const runAction = async (medicationId: string, action: () => Promise<void>): Promise<boolean> => {
    setActionSaving(current => ({ ...current, [medicationId]: true }))
    setActionErrors(current => ({ ...current, [medicationId]: null }))
    try {
      await action()
      await fetchRows()
      return true
    } catch (err) {
      console.error('[medication catalog curation action error]', err)
      setActionErrors(current => ({
        ...current,
        [medicationId]: describeSaveError(err, { id: 'Tindakan gagal disimpan.', zh: '操作無法儲存。', en: 'The action could not be saved.' }),
      }))
      return false
    } finally {
      setActionSaving(current => ({ ...current, [medicationId]: false }))
    }
  }

  const verify = (medicationId: string, reason: string) => runAction(medicationId, () => verifyMedication(medicationId, reason))
  const unverify = (medicationId: string, reason: string) => runAction(medicationId, () => unverifyMedication(medicationId, reason))
  const editIdentity = (medicationId: string, input: EditMedicationIdentityInput, reason: string) =>
    runAction(medicationId, () => editMedicationIdentity(medicationId, input, reason))
  const merge = (medicationId: string, targetMedicationId: string, reason: string) =>
    runAction(medicationId, async () => {
      await mergeMedications(medicationId, targetMedicationId, reason)
    })

  return {
    rows,
    hasMore,
    loading,
    loadingMore,
    loadError,
    fetchRows,
    loadOnce,
    loadMore,
    actionSaving,
    actionErrors,
    verify,
    unverify,
    editIdentity,
    merge,
  }
}
