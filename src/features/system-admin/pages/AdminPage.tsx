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
import { fetchAdminUsers, type AdminUserRow } from '../../../lib/adminUsers'

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

type AdminTab = 'medications' | 'blood-pressure' | 'users'

// tab 順序也決定左右鍵切換順序，維持與畫面排列一致，避免 focus 跳到看不到的分頁。
const ADMIN_TAB_ORDER: AdminTab[] = ['medications', 'blood-pressure', 'users']

export function AdminPage() {
  const { text } = useI18n()
  const { confirm, dialog: confirmDialog } = useConfirm()
  // 使用選取的 ID 陣列來追蹤被勾選的資料行，不選用 Set 是因為陣列配合 React 狀態操作與轉移到 Supabase .in() 更直覺
  const [records, setRecords] = useState<BPRecord[]>([])
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<LocalizedText | null>(null)
  // 管理員最常先查看最新血壓，因此以總表作為入口；調藥仍可隨時切換。
  const [activeTab, setActiveTab] = useState<AdminTab>('blood-pressure')
  const medicationTabRef = useRef<HTMLButtonElement>(null)
  const bloodPressureTabRef = useRef<HTMLButtonElement>(null)
  const usersTabRef = useRef<HTMLButtonElement>(null)
  const tabRefs = { medications: medicationTabRef, 'blood-pressure': bloodPressureTabRef, users: usersTabRef }

  const [users, setUsers] = useState<AdminUserRow[]>([])
  const [usersLoading, setUsersLoading] = useState(false)
  const [usersError, setUsersError] = useState<LocalizedText | null>(null)
  const usersLoadedRef = useRef(false)

  const handleTabKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    event.preventDefault()
    const currentIndex = ADMIN_TAB_ORDER.indexOf(activeTab)
    const delta = event.key === 'ArrowLeft' ? -1 : 1
    const nextTab = ADMIN_TAB_ORDER[(currentIndex + delta + ADMIN_TAB_ORDER.length) % ADMIN_TAB_ORDER.length]
    setActiveTab(nextTab)
    tabRefs[nextTab].current?.focus()
  }

  const fetchUsers = async () => {
    setUsersLoading(true)
    setUsersError(null)
    try {
      const response = await fetchAdminUsers()
      setUsers(response.users)
    } catch (err) {
      console.error('[admin list users read error]', err)
      setUsersError({ id: 'Daftar pengguna sementara tidak dapat dimuat. Periksa internet lalu coba lagi.', zh: '暫時無法讀取使用者清單，請確認網路後重試。' ,en: "Daftar user temporarily not could be loaded. Check your internet connection and try again." })
    }
    setUsersLoading(false)
  }

  // 只在第一次切到「使用者管理」分頁時才呼叫 Function，避免管理者只看血壓總表時也額外打一次全站使用者查詢。
  useEffect(() => {
    if (activeTab !== 'users' || usersLoadedRef.current) return
    usersLoadedRef.current = true
    fetchUsers()
  }, [activeTab])

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
    fetchRecords()
  }, [])

  const handleDelete = async (id: string) => {
    // 改用畫面內對話框（useConfirm）取代 window.confirm：原生對話框在部分行動瀏覽器連續
    // 彈出多次後會被封鎖或拋例外，導致刪除流程無聲中斷，管理者會看到「按了沒反應」。
    const confirmDelete = await confirm(text({ id: 'Yakin ingin menghapus catatan ini?', zh: '確定要刪除這筆紀錄嗎？' ,en: 'Yakin ingin deleting record this?' }), { danger: true })
    if (!confirmDelete) return

    // 健康紀錄不能再靠舊角色判斷風險；所有病人的刪除都需要第二次明確確認。
    if (!(await confirm(text({ id: '⚠️ Tindakan ini menghapus catatan kesehatan secara permanen. Lanjutkan?', zh: '⚠️ 此操作會永久刪除健康紀錄，確定繼續嗎？' ,en: '⚠️ This will permanently delete the health record, are you sure you want to continue?' }), { danger: true }))) return

    const { error } = await supabase
      .from('blood_pressure_records')
      .delete()
      .eq('id', id)

    if (error) {
      console.error('[admin blood pressure delete error]', error)
      alert(text({ id: 'Penghapusan gagal. Periksa internet lalu coba lagi.', zh: '刪除失敗，請確認網路後重試。' ,en: 'Deletion failed, please check your network and try again.' }))
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
    const { error } = await supabase
      .from('blood_pressure_records')
      .delete()
      .in('id', selectedIds)

    if (error) {
      console.error('[admin blood pressure bulk delete error]', error)
      alert(text({ id: 'Penghapusan gagal. Periksa internet lalu coba lagi.', zh: '刪除失敗，請確認網路後重試。' ,en: 'Deletion failed, please check your network and try again.' }))
    } else {
      // 成功後，過濾掉已被刪除的紀錄。使用函數式更新以避免在非同步要求期間，使用者修改選取狀態所導致的狀態競爭問題。
      setRecords(prev => prev.filter(r => !selectedIds.includes(r.id)))
      setSelectedIds(prev => prev.filter(id => !selectedIds.includes(id)))
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
    return patient?.display_name?.trim() || text({ id: 'Penerima perawatan tanpa nama', zh: '未命名對象' ,en: 'Unnamed Object' })
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
        <div role="tablist" aria-label={text({ id: 'Fungsi pengelolaan admin', zh: '後台管理功能' ,en: 'Background management features' })} className="mb-4 grid grid-cols-3 gap-2 rounded-lg bg-gray-200 p-1">
          {/* 分開三種操作，避免調藥或使用者查詢時誤碰到血壓紀錄刪除按鈕。 */}
          <button ref={medicationTabRef} id="medications-tab" type="button" role="tab" tabIndex={activeTab === 'medications' ? 0 : -1} aria-selected={activeTab === 'medications'} aria-controls="medications-panel" onClick={() => setActiveTab('medications')} onKeyDown={handleTabKeyDown} className={`rounded px-3 py-2 text-sm font-bold ${activeTab === 'medications' ? 'bg-white text-emerald-800 shadow-sm' : 'text-gray-600'}`}>{text({ id: 'Atur obat', zh: '調藥' ,en: 'Atur medication' })}</button>
          <button ref={bloodPressureTabRef} id="blood-pressure-tab" type="button" role="tab" tabIndex={activeTab === 'blood-pressure' ? 0 : -1} aria-selected={activeTab === 'blood-pressure'} aria-controls="blood-pressure-panel" onClick={() => setActiveTab('blood-pressure')} onKeyDown={handleTabKeyDown} className={`rounded px-3 py-2 text-sm font-bold ${activeTab === 'blood-pressure' ? 'bg-white text-blue-800 shadow-sm' : 'text-gray-600'}`}>{text({ id: 'Daftar tekanan darah', zh: '血壓總表' ,en: 'List blood pressure' })}</button>
          <button ref={usersTabRef} id="users-tab" type="button" role="tab" tabIndex={activeTab === 'users' ? 0 : -1} aria-selected={activeTab === 'users'} aria-controls="users-panel" onClick={() => setActiveTab('users')} onKeyDown={handleTabKeyDown} className={`rounded px-3 py-2 text-sm font-bold ${activeTab === 'users' ? 'bg-white text-purple-800 shadow-sm' : 'text-gray-600'}`}>{text({ id: 'Manajemen pengguna', zh: '使用者管理' ,en: "Manajemen user" })}</button>
        </div>

        <div id="medications-panel" role="tabpanel" aria-labelledby="medications-tab" tabIndex={0} className={activeTab !== 'medications' ? 'hidden' : ''}>
          <p className="rounded bg-amber-50 p-3 text-sm text-amber-900">{text({ id: 'Pilih diri sendiri atau penerima perawatan di halaman Obat untuk mengatur daftar obat.', zh: '請從「服藥」頁選擇本人或被照顧者後調整藥單。' ,en: 'Select diri sendiri or penerima care di halaman Medication for mengatur daftar medication.' })}</p>
        </div>

        <div id="blood-pressure-panel" role="tabpanel" aria-labelledby="blood-pressure-tab" tabIndex={0} className={activeTab !== 'blood-pressure' ? 'hidden' : ''}>
        {loading && <p className="text-sm text-gray-500">{text({ id: 'Memuat…', zh: '載入中…' ,en: 'Loading…' })}</p>}
        {error && <p className="text-sm text-red-500 bg-red-50 p-3 rounded">{text(error)}</p>}
        
        {!loading && !error && records.length === 0 && (
          <p className="text-sm text-gray-500">{text({ id: 'Belum ada data.', zh: '目前沒有任何資料。' ,en: 'Not yet ada data.' })}</p>
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
                      <span className="font-medium">{text({ id: 'Penerima perawatan', zh: '對象' ,en: 'Object' })}：{patientName(r)}</span>
                      <span className="text-gray-300">|</span>
                      <VitalReading systolic={r.systolic} diastolic={r.diastolic} pulse={r.pulse} className="font-bold text-gray-900" />
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => handleDelete(r.id)}
                  className="px-3 py-1.5 bg-red-50 text-red-600 hover:bg-red-100 rounded-lg text-sm font-semibold transition shrink-0 cursor-pointer"
                >
                  {text({ id: 'Hapus', zh: '刪除' ,en: 'DELETE' })}
                </button>
              </div>
            )
          })}
        </div>
        </div>

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
                <span className="text-sm font-semibold text-gray-700">{text({ id: 'Total pengguna terdaftar', zh: '目前總註冊用戶數' ,en: "Total user terdaftar" })}：</span>
                <span className="text-lg font-bold text-purple-800">{users.length}</span>
              </div>

              {users.length === 0 ? (
                <p className="text-sm text-gray-500">{text({ id: 'Belum ada data.', zh: '目前沒有任何資料。' ,en: 'Not yet ada data.' })}</p>
              ) : (
                <div className="space-y-2">
                  {users.map(u => (
                    <div key={u.userId} className="rounded-lg border border-gray-250 bg-white p-3 shadow-sm">
                      <div className="text-sm font-semibold text-gray-900 break-all">{u.email}</div>
                      {u.displayName && <div className="text-xs text-gray-600 mt-0.5">{u.displayName}</div>}
                      <div className="text-xs text-gray-600 mt-1 flex flex-wrap gap-x-3">
                        <span>{text({ id: 'Tanggal daftar', zh: '註冊日期' ,en: "Tanggal daftar" })}：{formatAdminTimestamp(u.createdAt)}</span>
                        <span>{text({ id: 'Login terakhir', zh: '最後登入' ,en: "Login terakhir" })}：{formatAdminTimestamp(u.lastSignInAt)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  )
}
