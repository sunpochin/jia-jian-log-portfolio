/*
檔案用途：提供管理者檢視與刪除血壓紀錄，以及查看全站註冊用戶清單的後台畫面。
所在層：src/features/system-admin/pages；僅由受限的 /admin 路由載入。
主要關聯：使用 Supabase 讀寫血壓紀錄、VitalReading 呈現生命徵象、i18n 顯示目前語系，以及 lib/adminUsers 呼叫 admin-list-users Edge Function 取得使用者管理分頁資料。
*/
import { useState, useEffect, useRef } from 'react'
import { supabase } from '../../../lib/supabase'
import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import timezone from 'dayjs/plugin/timezone'
import 'dayjs/locale/id'
import { signOut } from '../../../lib/auth'
import { VitalReading } from '../../vitals/components/VitalReading'
import { type LocalizedText, useI18n } from '../../../lib/i18n'
import { useConfirm } from '../../../hooks/useConfirm'
import { type EntitlementKey, type EntitlementReason, ENTITLEMENT_REASONS } from '../../../lib/adminUsers'
import { ENTITLEMENT_FIELD_BY_KEY, useAccountEntitlements } from '../hooks/useAccountEntitlements'
import { MedicationCatalogCurationPanel } from '../components/MedicationCatalogCurationPanel'

// 延伸 dayjs 以支援時區與 UTC 轉換，確保時間不論管理員本地裝置時區為何，均統一以台北時區呈現
dayjs.extend(utc)
dayjs.extend(timezone)

type BPRecord = {
  id: string
  systolic: number
  diastolic: number
  pulse: number | null
  measured_at: string
  patient_id: string
  patients: { display_name: string } | { display_name: string }[] | null
}

// 從未登入過的帳號 last_sign_in_at 會是 null；統一顯示「－」，避免管理者誤讀成空白或載入失敗。
function formatAdminTimestamp(value: string | null): string {
  if (!value) return '－'
  const parsed = dayjs(value)
  return parsed.isValid() ? parsed.tz('Asia/Taipei').format('YYYY-MM-DD HH:mm') : '－'
}

// 開通原因的三語文案；值域必須與 adminUsers.ts 的 ENTITLEMENT_REASONS 及 RPC 內的 CHECK 值域一致。
const ENTITLEMENT_REASON_LABELS: Record<EntitlementReason, LocalizedText> = {
  paid: { id: 'Berbayar', zh: '付費', en: 'Paid' },
  trial: { id: 'Uji coba', zh: '試用', en: 'Trial' },
  complimentary: { id: 'Gratis (undangan)', zh: '招待', en: 'Complimentary' },
  correction: { id: 'Koreksi data', zh: '更正登錄錯誤', en: 'Data correction' },
  revoked: { id: 'Dicabut', zh: '停權', en: 'Revoked' },
}

// medication_ai_draft_tier 的說明文字刻意標出「額度更高」：2026-09-11 起未開通帳號也有每日 3 次
// 免費額度（推廣策略），這裡不再是純粹的「有沒有」開關，勾選只代表把額度從免費的 3 次提高到付費額度，
// 避免管理者誤以為不勾就完全擋掉。
const ENTITLEMENT_LABELS: Record<EntitlementKey, LocalizedText> = {
  personal_notification_tier: { id: 'Notifikasi pribadi', zh: '個人化通知', en: 'Personal notifications' },
  medication_ai_draft_tier: { id: 'Draf AI kantong obat (kuota harian lebih banyak)', zh: 'AI 藥袋草稿（提升每日次數）', en: 'AI medication draft (higher daily quota)' },
  premium_tier: { id: 'Premium', zh: 'Premium 付費會員', en: 'Premium' },
  medication_catalog_curator_tier: { id: 'Pengelola katalog obat bersama', zh: '共用藥品目錄管理員', en: 'Shared medication catalog curator' },
}

// 四個 entitlement 勾選框與各自的錯誤訊息都依這個順序渲染；只有一個地方要改順序或新增/移除一項。
const ENTITLEMENT_DISPLAY_ORDER: readonly EntitlementKey[] = ['personal_notification_tier', 'medication_ai_draft_tier', 'premium_tier', 'medication_catalog_curator_tier']

type AdminTab = 'medications' | 'blood-pressure' | 'users' | 'catalog'

// tab 順序也決定左右鍵切換順序，維持與畫面排列一致，避免 focus 跳到看不到的分頁。
const ADMIN_TAB_ORDER_FOR_ADMINISTRATOR_WITH_CATALOG: AdminTab[] = ['medications', 'blood-pressure', 'users', 'catalog']
const ADMIN_TAB_ORDER_FOR_ADMINISTRATOR_WITHOUT_CATALOG: AdminTab[] = ['medications', 'blood-pressure', 'users']
// 目錄管理員（curator）不是唯一的 administrator：血壓總表與使用者管理動的是跨病人健康資料與
// 付費／權限旗標，不屬於 curator 的職責範圍，只讓「藥品目錄」分頁可見（文件 §4.6）。
const ADMIN_TAB_ORDER_FOR_CURATOR: AdminTab[] = ['catalog']

export interface AdminPageProps {
  // 由 App.tsx 判斷：是否為站內唯一的 administrator（isAdministratorEmail）。false 代表只是
  // 共用藥品目錄管理員（curator）身分通過 /admin 路由。
  isAdministrator: boolean
  // 由 App.tsx 呼叫 current_user_is_medication_catalog_curator() 取得。新的目錄 RPC 只認這個
  // entitlement、不認舊的寫死 administrator email（文件 §3.6）：administrator 預設不是 curator，
  // 「藥品目錄」分頁只有在這裡是 true 時才顯示，否則 administrator 會看到分頁卻每個動作都被
  // RPC 擋下，一頭霧水（PR #797 review）。curator-only 帳號能進到這個頁面就代表這裡一定是 true
  // （App.tsx 的路由守門已經驗證過）。
  isCatalogCurator: boolean
}

export function AdminPage({ isAdministrator, isCatalogCurator }: AdminPageProps) {
  const { text } = useI18n()
  const { confirm, dialog: confirmDialog } = useConfirm()
  const tabOrder = isAdministrator
    ? (isCatalogCurator ? ADMIN_TAB_ORDER_FOR_ADMINISTRATOR_WITH_CATALOG : ADMIN_TAB_ORDER_FOR_ADMINISTRATOR_WITHOUT_CATALOG)
    : ADMIN_TAB_ORDER_FOR_CURATOR
  // 使用選取的 ID 陣列來追蹤被勾選的資料行，不選用 Set 是因為陣列配合 React 狀態操作與轉移到 Supabase .in() 更直覺
  const [records, setRecords] = useState<BPRecord[]>([])
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<LocalizedText | null>(null)
  // 管理員最常先查看最新血壓，因此以總表作為入口；curator-only 帳號只有「藥品目錄」分頁可選。
  const [activeTab, setActiveTab] = useState<AdminTab>(() => (isAdministrator ? 'blood-pressure' : 'catalog'))
  const medicationTabRef = useRef<HTMLButtonElement>(null)
  const bloodPressureTabRef = useRef<HTMLButtonElement>(null)
  const usersTabRef = useRef<HTMLButtonElement>(null)
  const catalogTabRef = useRef<HTMLButtonElement>(null)
  const tabRefs = { medications: medicationTabRef, 'blood-pressure': bloodPressureTabRef, users: usersTabRef, catalog: catalogTabRef }

  const {
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
  } = useAccountEntitlements()

  const handleTabKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    event.preventDefault()
    const currentIndex = tabOrder.indexOf(activeTab)
    const delta = event.key === 'ArrowLeft' ? -1 : 1
    const nextTab = tabOrder[(currentIndex + delta + tabOrder.length) % tabOrder.length]
    setActiveTab(nextTab)
    tabRefs[nextTab].current?.focus()
  }

  // 只在第一次切到「使用者管理」分頁時才呼叫 Function，避免管理者只看血壓總表時也額外打一次全站使用者查詢；
  // curator-only 帳號看不到這個分頁，也不該有機會觸發（isAdministrator 守門，見下方 tabOrder）。
  useEffect(() => {
    if (isAdministrator && activeTab === 'users') loadUsersOnce()
  }, [isAdministrator, activeTab, loadUsersOnce])

  const fetchRecords = async () => {
    setLoading(true)
    setError(null)
    const { data, error } = await supabase
      .from('blood_pressure_records')
      .select('id, systolic, diastolic, pulse, measured_at, patient_id, patients(display_name)')
      .order('measured_at', { ascending: false })
      .limit(100)

    if (error) {
      console.error('[admin blood pressure read error]', error)
      setError({ id: 'Catatan sementara tidak dapat dimuat. Periksa internet lalu coba lagi.', zh: '暫時無法讀取紀錄，請確認網路後重試。' ,en: 'There was an error reading the log, please check your network and try again.' })
    } else if (data) {
      setRecords(data)
    }
    setLoading(false)
    setSelectedIds([])
  }

  useEffect(() => {
    // curator-only 帳號看不到血壓總表分頁，不需要（也不該）在掛載時就打這支查詢。
    if (isAdministrator) fetchRecords()
    else setLoading(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleDelete = async (id: string) => {
    // 改用畫面內對話框（useConfirm）取代 window.confirm：原生對話框在部分行動瀏覽器連續
    // 彈出多次後會被封鎖或拋例外，導致刪除流程無聲中斷，管理者會看到「按了沒反應」。
    const confirmDelete = await confirm(text({ id: 'Yakin ingin menghapus catatan ini?', zh: '確定要刪除這筆紀錄嗎？' ,en: 'Are you sure you want to delete this record?' }), { danger: true })
    if (!confirmDelete) return

    // 健康紀錄不能再靠舊角色判斷風險；所有病人的刪除都需要第二次明確確認。
    if (!(await confirm(text({ id: '⚠️ Tindakan ini menghapus catatan kesehatan secara permanen. Lanjutkan?', zh: '⚠️ 此操作會永久刪除健康紀錄，確定繼續嗎？' ,en: '⚠️ This will permanently delete the health record, are you sure you want to continue?' }), { danger: true }))) return

    // { count: 'exact' } 是為了拿到實際刪除筆數：RLS 擋下的 DELETE 對 PostgREST 而言是「成功、0 筆」，
    // 不是 error，若只看 error 會讓管理者以為刪除成功，但資料庫其實什麼都沒刪（issue #738 fail-closed 視窗）。
    const { error, count } = await supabase
      .from('blood_pressure_records')
      .delete({ count: 'exact' })
      .eq('id', id)

    if (error) {
      console.error('[admin blood pressure delete error]', error)
      alert(text({ id: 'Penghapusan gagal. Periksa internet lalu coba lagi.', zh: '刪除失敗，請確認網路後重試。' ,en: 'Deletion failed, please check your network and try again.' }))
    } else if (!count) {
      console.error('[admin blood pressure delete blocked]', { id })
      alert(text({ id: 'Penghapusan diblokir oleh izin. Tidak ada yang dihapus.', zh: '刪除被權限擋下，沒有任何紀錄被刪除。' ,en: 'Deletion was blocked by permissions; nothing was deleted.' }))
    } else {
      // 使用函數式更新以確保狀態讀取最新，防止連續操作時的 stale state 競態條件
      setRecords(prev => prev.filter(r => r.id !== id))
      setSelectedIds(prev => prev.filter(x => x !== id))
    }
  }

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return
    
    // 批次操作的對話框同樣只顯示目前語言，避免兩段文字擠壓掉最重要的筆數。
    const confirmDelete = await confirm(
      text({ id: `Yakin ingin menghapus ${selectedIds.length} catatan ini?`, zh: `確定要刪除這 ${selectedIds.length} 筆紀錄嗎？` ,en: `Are you sure you want to delete these ${selectedIds.length} records?` }), { danger: true }
    )
    if (!confirmDelete) return

    // 批次刪除的影響更大，統一保護全部病人，避免 UUID 架構下重新引入特定成員例外。
    if (!(await confirm(text({ id: '⚠️ Tindakan ini menghapus catatan kesehatan yang dipilih secara permanen. Lanjutkan?', zh: '⚠️ 此操作會永久刪除選取的健康紀錄，確定繼續嗎？' ,en: '⚠️ This will permanently delete the selected health records, are you sure you want to continue?' }), { danger: true }))) return

    // 採用 Supabase 的 .in 進行一次性多列刪除，避免多個非同步單筆請求造成 DB 負擔與寫入競爭
    // .select('id') 拿回「實際被刪除」的 id 清單：批次選取的病人可能分屬不同 care_access（例如
    // 管理者尚未同步時，部分病人仍受 20260730060000 的照護者 policy 放行、部分被擋下），
    // 只看 count 差一步就會把「刪了一部分」誤判成全部成功而整批從畫面上消失（PR #742 review）。
    const { data: deleted, error } = await supabase
      .from('blood_pressure_records')
      .delete()
      .in('id', selectedIds)
      .select('id')

    const deletedIds = new Set((deleted ?? []).map(r => r.id))

    if (error) {
      console.error('[admin blood pressure bulk delete error]', error)
      alert(text({ id: 'Penghapusan gagal. Periksa internet lalu coba lagi.', zh: '刪除失敗，請確認網路後重試。' ,en: 'Deletion failed, please check your network and try again.' }))
    } else if (deletedIds.size === 0) {
      console.error('[admin blood pressure bulk delete blocked]', { selectedIds })
      alert(text({ id: 'Penghapusan diblokir oleh izin. Tidak ada yang dihapus.', zh: '刪除被權限擋下，沒有任何紀錄被刪除。' ,en: 'Deletion was blocked by permissions; nothing was deleted.' }))
    } else {
      if (deletedIds.size < selectedIds.length) {
        console.error('[admin blood pressure bulk delete partial]', { requested: selectedIds.length, deleted: deletedIds.size })
        alert(text({
          id: `${deletedIds.size} dari ${selectedIds.length} catatan berhasil dihapus. Sisanya diblokir oleh izin.`,
          zh: `${selectedIds.length} 筆中僅刪除 ${deletedIds.size} 筆，其餘被權限擋下。`,
          en: `Deleted ${deletedIds.size} of ${selectedIds.length} records; the rest were blocked by permissions.`,
        }))
      }
      // 只從畫面移除真正被刪除的那幾筆，被擋下的紀錄留在列表上，不能讓管理者誤以為它們也不見了。
      setRecords(prev => prev.filter(r => !deletedIds.has(r.id)))
      setSelectedIds(prev => prev.filter(id => !deletedIds.has(id)))
    }
  }

  const toggleSelect = (id: string) => {
    const isSelected = selectedIds.includes(id)

    if (isSelected) {
      // 使用函數式更新確保狀態讀取最新，防止使用者連續點擊切換時發生競態條件
      setSelectedIds(prev => prev.filter(x => x !== id))
    } else {
      setSelectedIds(prev => [...prev, id])
    }
  }

  const handleSelectAll = () => {
    if (selectedIds.length === records.length) {
      setSelectedIds([])
    } else {
      setSelectedIds(records.map(r => r.id))
    }
  }

  const patientName = (record: BPRecord) => {
    // 關聯資料可能是物件或陣列；只使用病人欄位，絕不能從紀錄者猜病人身分。
    const patient = Array.isArray(record.patients) ? record.patients[0] : record.patients
    return patient?.display_name?.trim() || text({ id: 'Penerima perawatan tanpa nama', zh: '未命名對象' ,en: 'Unnamed care recipient' })
  }

  return (
    <div className="flex h-full min-h-0 w-full max-w-5xl flex-col bg-gray-50 mx-auto">
      {confirmDialog}
      <header className="shrink-0 flex items-center justify-between p-4 bg-white border-b border-gray-250">
        <h1 className="text-xl font-bold text-gray-900">{text({ id: 'Manajemen data admin', zh: '後台資料管理' ,en: 'Background data management' })}</h1>
        <div className="flex items-center gap-3">
          <button onClick={() => window.location.href = '/'} className="text-sm text-blue-500">{text({ id: 'Beranda', zh: '回首頁' ,en: 'Start' })}</button>
          <button onClick={() => signOut()} className="text-sm text-gray-400">{text({ id: 'Keluar', zh: '登出' ,en: 'Sign out' })}</button>
        </div>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
        <div role="tablist" aria-label={text({ id: 'Fungsi pengelolaan admin', zh: '後台管理功能' ,en: 'Background management features' })} className={`mb-4 grid gap-2 rounded-lg bg-gray-200 p-1 ${tabOrder.length === 4 ? 'grid-cols-4' : tabOrder.length === 3 ? 'grid-cols-3' : 'grid-cols-1'}`}>
          {/* 分開操作，避免調藥或使用者查詢時誤碰到血壓紀錄刪除按鈕；curator-only 帳號只看得到「藥品目錄」。 */}
          {isAdministrator && (
            <button ref={medicationTabRef} id="medications-tab" type="button" role="tab" tabIndex={activeTab === 'medications' ? 0 : -1} aria-selected={activeTab === 'medications'} aria-controls="medications-panel" onClick={() => setActiveTab('medications')} onKeyDown={handleTabKeyDown} className={`rounded px-3 py-2 text-sm font-bold ${activeTab === 'medications' ? 'bg-white text-emerald-800 shadow-sm' : 'text-gray-600'}`}>{text({ id: 'Atur obat', zh: '調藥' ,en: 'Medications' })}</button>
          )}
          {isAdministrator && (
            <button ref={bloodPressureTabRef} id="blood-pressure-tab" type="button" role="tab" tabIndex={activeTab === 'blood-pressure' ? 0 : -1} aria-selected={activeTab === 'blood-pressure'} aria-controls="blood-pressure-panel" onClick={() => setActiveTab('blood-pressure')} onKeyDown={handleTabKeyDown} className={`rounded px-3 py-2 text-sm font-bold ${activeTab === 'blood-pressure' ? 'bg-white text-blue-800 shadow-sm' : 'text-gray-600'}`}>{text({ id: 'Daftar tekanan darah', zh: '血壓總表' ,en: 'Blood pressure table' })}</button>
          )}
          {isAdministrator && (
            <button ref={usersTabRef} id="users-tab" type="button" role="tab" tabIndex={activeTab === 'users' ? 0 : -1} aria-selected={activeTab === 'users'} aria-controls="users-panel" onClick={() => setActiveTab('users')} onKeyDown={handleTabKeyDown} className={`rounded px-3 py-2 text-sm font-bold ${activeTab === 'users' ? 'bg-white text-purple-800 shadow-sm' : 'text-gray-600'}`}>{text({ id: 'Manajemen pengguna', zh: '使用者管理' ,en: 'User management' })}</button>
          )}
          {tabOrder.includes('catalog') && (
            <button ref={catalogTabRef} id="catalog-tab" type="button" role="tab" tabIndex={activeTab === 'catalog' ? 0 : -1} aria-selected={activeTab === 'catalog'} aria-controls="catalog-panel" onClick={() => setActiveTab('catalog')} onKeyDown={handleTabKeyDown} className={`rounded px-3 py-2 text-sm font-bold ${activeTab === 'catalog' ? 'bg-white text-teal-800 shadow-sm' : 'text-gray-600'}`}>{text({ id: 'Katalog obat', zh: '藥品目錄', en: 'Medication catalog' })}</button>
          )}
        </div>

        {isAdministrator && !isCatalogCurator && (
          <p className="mb-4 rounded bg-teal-50 px-3 py-2 text-xs text-teal-900">
            {text({ id: 'Berikan diri Anda sendiri hak "Pengelola katalog obat bersama" di tab Manajemen pengguna untuk membuka tab Katalog obat.', zh: '請在「使用者管理」分頁勾選自己的「共用藥品目錄管理員」，才能開啟「藥品目錄」分頁。', en: 'Grant yourself the "Shared medication catalog curator" entitlement in the Users tab to unlock the Medication catalog tab.' })}
          </p>
        )}

        {isAdministrator && (
          <div id="medications-panel" role="tabpanel" aria-labelledby="medications-tab" tabIndex={0} className={activeTab !== 'medications' ? 'hidden' : ''}>
            <p className="rounded bg-amber-50 p-3 text-sm text-amber-900">{text({ id: 'Pilih diri sendiri atau penerima perawatan di halaman Obat untuk mengatur daftar obat.', zh: '請從「服藥」頁選擇本人或被照顧者後調整藥單。' ,en: 'Select yourself or a care recipient on the Medication page to adjust the medication list.' })}</p>
          </div>
        )}

        {isAdministrator && (
        <div id="blood-pressure-panel" role="tabpanel" aria-labelledby="blood-pressure-tab" tabIndex={0} className={activeTab !== 'blood-pressure' ? 'hidden' : ''}>
        {loading && <p className="text-sm text-gray-500">{text({ id: 'Memuat…', zh: '載入中…' ,en: 'Loading…' })}</p>}
        {error && <p className="text-sm text-red-500 bg-red-50 p-3 rounded">{text(error)}</p>}
        
        {!loading && !error && records.length === 0 && (
          <p className="text-sm text-gray-500">{text({ id: 'Belum ada data.', zh: '目前沒有任何資料。' ,en: 'No data yet.' })}</p>
        )}

        {/* 批次操作工具列 */}
        {!loading && !error && records.length > 0 && (
          <div className="flex items-center justify-between bg-white p-3 rounded-lg border border-gray-250 shadow-sm mb-3">
            <label className="flex items-center gap-2 text-sm text-gray-700 font-semibold cursor-pointer">
              <input
                type="checkbox"
                checked={records.length > 0 && selectedIds.length === records.length}
                onChange={handleSelectAll}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 w-4 h-4 cursor-pointer"
              />
              {text({ id: 'Pilih semua', zh: '全選' ,en: 'Select All' })}
            </label>
            {selectedIds.length > 0 && (
              <button
                onClick={handleBulkDelete}
                className="px-3 py-1.5 bg-red-600 text-white hover:bg-red-700 rounded-lg text-sm font-semibold transition cursor-pointer"
              >
                {text({ id: `Hapus yang dipilih (${selectedIds.length})`, zh: `刪除選取（${selectedIds.length}）` ,en: `Delete selected (${selectedIds.length})` })}
              </button>
            )}
          </div>
        )}

        <div className="space-y-2">
          {records.map(r => {
            return (
              <div key={r.id} className="flex items-center justify-between gap-3 rounded-lg border border-gray-250 bg-white p-3 shadow-sm transition">
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(r.id)}
                    onChange={() => toggleSelect(r.id)}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 w-4 h-4 cursor-pointer"
                  />
                  <div>
                    <div className="text-sm font-semibold text-gray-900">
                      {/* 統一以台北時區呈現，以防管理人員因裝置時區不同而看到不一致的時間紀錄 */}
                      {dayjs(r.measured_at).tz('Asia/Taipei').format('YYYY-MM-DD HH:mm')}
                    </div>
                    {/* 將 對象 與 血壓/心率 數值壓縮至同一 row，以節省空間並減少視覺混淆 */}
                    <div className="text-xs text-gray-600 mt-1 flex items-center gap-2 flex-wrap">
                      <span className="font-medium">{text({ id: 'Penerima perawatan', zh: '對象' ,en: 'Care recipient' })}：{patientName(r)}</span>
                      <span className="text-gray-300">|</span>
                      <VitalReading systolic={r.systolic} diastolic={r.diastolic} pulse={r.pulse} className="font-bold text-gray-900" />
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => handleDelete(r.id)}
                  className="px-3 py-1.5 bg-red-50 text-red-600 hover:bg-red-100 rounded-lg text-sm font-semibold transition shrink-0 cursor-pointer"
                >
                  {text({ id: 'Hapus', zh: '刪除' ,en: 'Delete' })}
                </button>
              </div>
            )
          })}
        </div>
        </div>
        )}

        {isAdministrator && (
        <div id="users-panel" role="tabpanel" aria-labelledby="users-tab" tabIndex={0} className={activeTab !== 'users' ? 'hidden' : ''}>
          {usersLoading && <p className="text-sm text-gray-500">{text({ id: 'Memuat…', zh: '載入中…' ,en: 'Loading…' })}</p>}
          {usersError && (
            <div className="rounded bg-red-50 p-3">
              <p className="text-sm text-red-500">{text(usersError)}</p>
              {/* 切分頁不會重試（usersLoadedRef 已設為 true），失敗後必須有明確按鈕才能重新呼叫，不能只靠重新整理整頁。 */}
              <button onClick={fetchUsers} className="mt-2 px-3 py-1.5 bg-red-600 text-white hover:bg-red-700 rounded-lg text-sm font-semibold transition cursor-pointer">
                {text({ id: 'Coba lagi', zh: '重試' ,en: "Try again" })}
              </button>
            </div>
          )}

          {!usersLoading && !usersError && (
            <>
              <div className="mb-3 rounded-lg border border-gray-250 bg-white p-3 shadow-sm">
                <span className="text-sm font-semibold text-gray-700">{text({ id: 'Total pengguna terdaftar', zh: '目前總註冊用戶數' ,en: 'Total registered users' })}：</span>
                <span className="text-lg font-bold text-purple-800">{users.length}</span>
              </div>

              {users.length === 0 ? (
                <p className="text-sm text-gray-500">{text({ id: 'Belum ada data.', zh: '目前沒有任何資料。' ,en: 'No data yet.' })}</p>
              ) : (
                <div className="space-y-2">
                  {users.map(u => (
                    <div key={u.userId} className="rounded-lg border border-gray-250 bg-white p-3 shadow-sm">
                      <div className="text-sm font-semibold text-gray-900 break-all">{u.email}</div>
                      {u.displayName && <div className="text-xs text-gray-600 mt-0.5">{u.displayName}</div>}
                      <div className="text-xs text-gray-600 mt-1 flex flex-wrap gap-x-3">
                        <span>{text({ id: 'Tanggal daftar', zh: '註冊日期' ,en: 'Registration date' })}：{formatAdminTimestamp(u.createdAt)}</span>
                        <span>{text({ id: 'Login terakhir', zh: '最後登入' ,en: 'Last login' })}：{formatAdminTimestamp(u.lastSignInAt)}</span>
                      </div>

                      <div className="mt-2 border-t border-gray-100 pt-2">
                        <label className="flex items-center gap-1.5 text-xs text-gray-700 mb-1">
                          <span>{text({ id: 'Alasan perubahan', zh: '開通原因', en: 'Change reason' })}：</span>
                          <select
                            value={entitlementReasons[u.userId] ?? 'paid'}
                            onChange={e => setReason(u.userId, e.target.value as EntitlementReason)}
                            className="rounded border border-gray-250 px-1.5 py-0.5 text-xs"
                          >
                            {ENTITLEMENT_REASONS.map(reason => (
                              <option key={reason} value={reason}>{text(ENTITLEMENT_REASON_LABELS[reason])}</option>
                            ))}
                          </select>
                        </label>

                        <div className="flex flex-wrap gap-x-4 gap-y-1">
                          {ENTITLEMENT_DISPLAY_ORDER.map(entitlement => {
                            const field = ENTITLEMENT_FIELD_BY_KEY[entitlement]
                            const key = `${u.userId}:${entitlement}`
                            const checked = u[field] !== 'none'
                            const saving = entitlementSaving[key] === true
                            return (
                              <label key={entitlement} className="flex items-center gap-1.5 text-xs text-gray-800">
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  disabled={saving}
                                  onChange={e => toggleEntitlement(u, entitlement, e.target.checked)}
                                  className="h-3.5 w-3.5"
                                />
                                <span>{text(ENTITLEMENT_LABELS[entitlement])}</span>
                                {saving && <span className="text-gray-400">{text({ id: 'Menyimpan…', zh: '儲存中…', en: 'Saving…' })}</span>}
                              </label>
                            )
                          })}
                        </div>

                        {ENTITLEMENT_DISPLAY_ORDER.map(entitlement => {
                          const key = `${u.userId}:${entitlement}`
                          const entitlementError = entitlementErrors[key]
                          if (!entitlementError) return null
                          return <p key={entitlement} className="mt-1 text-xs text-red-600">{text(entitlementError)}</p>
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
        )}

        <div id="catalog-panel" role="tabpanel" aria-labelledby="catalog-tab" tabIndex={0} className={activeTab !== 'catalog' ? 'hidden' : ''}>
          {activeTab === 'catalog' && <MedicationCatalogCurationPanel />}
        </div>
      </main>
    </div>
  )
}
