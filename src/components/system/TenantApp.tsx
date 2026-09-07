/*
檔案用途：多租戶 (Multi-tenant) 情境下的應用程式外殼封裝。
所在層：src/components；處理特定租戶路徑與網域邏輯。
主要關聯：連接 lib/tenant 資料層與 App 核心流程。
*/
import { useEffect, useState, useMemo } from 'react'
import type { User } from '@supabase/supabase-js'
import dayjs from 'dayjs'
import { useBpRecords } from '../../hooks/useBpRecords'
import { evaluateReading } from '../../types/database'
import { addHouseholdPatient, beginHouseholdOnboarding, fetchTenantContext, saveTenantBpRecord, type CareRecipientType, type TenantContext } from '../../lib/tenant'
import { signOut } from '../../lib/auth'
import { useI18n } from '../../lib/i18n'
import { isValidBpInput } from '../../features/vitals/pages/InputPage.utils'
import { HouseholdMemberManagement } from '../../features/care-family/components/HouseholdMemberManagement'

export function TenantApp({ user }: { user: User }) {
  const { text } = useI18n()
  const [context, setContext] = useState<TenantContext | null | undefined>(undefined)
  const [error, setError] = useState('')

  const reload = async () => {
    setError('')
    try { setContext(await fetchTenantContext()) } catch (cause) {
      console.error('[tenant context error]', cause)
      setError(text({ id: 'Tidak dapat memuat data keluarga. Coba lagi.', zh: '無法讀取家庭資料，請再試一次。' ,en: 'Unable to read family data, please try again.' }))
      setContext(null)
    }
  }

  useEffect(() => { void reload() // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.id])

  if (context === undefined) return <main className="flex h-dvh items-center justify-center text-sm text-gray-400">{text({ id: 'Memuat…', zh: '載入中…' ,en: 'Loading…' })}</main>
  if (!context) return <TenantOnboarding onDone={reload} error={error} />
  return <TenantRecorder context={context} onReload={reload} error={error} />
}

function TenantOnboarding({ onDone, error }: { onDone: () => Promise<void>; error: string }) {
  const { text } = useI18n()
  const [householdName, setHouseholdName] = useState('')
  const [patientName, setPatientName] = useState('')
  const [status, setStatus] = useState<'idle' | 'saving' | 'error'>('idle')
  const [message, setMessage] = useState(error)
  // reload 失敗後元件不會重掛載；同步新的父層錯誤才能讓使用者看見可重試提示。
  useEffect(() => { if (error) setMessage(error) }, [error])
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setStatus('saving'); setMessage('')
    try { await beginHouseholdOnboarding({ householdName, patientName }); await onDone() }
    catch (cause) {
      console.error('[tenant onboarding error]', cause)
      // 資料庫與 OAuth 錯誤常含英文或內部細節，畫面只顯示可理解且不洩漏實作的雙語提示。
      setMessage(text({ id: 'Tidak dapat membuat ruang pribadi. Coba lagi.', zh: '暫時無法建立私人空間，請再試一次。' ,en: 'There was an error creating your private space, please try again.' }))
      setStatus('error')
    }
  }
  return <main className="mx-auto flex min-h-dvh max-w-md flex-col bg-gray-50 px-5 py-10 text-gray-900">
    <header className="flex items-start justify-between"><h1 className="text-3xl font-black">{text({ id: 'Mulai catat tekanan darah', zh: '開始記錄血壓' ,en: 'Start recording blood pressure' })}</h1><button onClick={() => signOut()} className="rounded-lg px-2 py-1 text-xs text-gray-500">{text({ id: 'Keluar', zh: '登出' ,en: 'Sign out' })}</button></header>
    <p className="mt-2 text-sm text-gray-600">{text({ id: 'Buat ruang keluarga pribadi. Hanya anggota yang diberi akses dapat melihat data ini.', zh: '建立私人家庭空間；只有取得授權的成員能看見這些資料。' ,en: 'Create a private family space; only authorized members can see this information.' })}</p>
    <form onSubmit={submit} className="mt-8 space-y-5 rounded-3xl bg-white p-5 shadow-sm">
      <label className="block text-sm font-bold">{text({ id: 'Nama keluarga', zh: '家庭名稱' ,en: 'Family name' })}<input required maxLength={100} value={householdName} onChange={event => setHouseholdName(event.target.value)} className="mt-2 w-full rounded-xl border border-gray-300 px-3 py-3" /></label>
      <label className="block text-sm font-bold">{text({ id: 'Nama orang yang diukur', zh: '量測對象名稱' ,en: 'Name of the person being measured' })}<input required maxLength={100} value={patientName} onChange={event => setPatientName(event.target.value)} className="mt-2 w-full rounded-xl border border-gray-300 px-3 py-3" /></label>
      {message && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{message}</p>}
      <button disabled={status === 'saving'} className="w-full rounded-xl bg-red-600 px-4 py-3 font-bold text-white disabled:opacity-60">{text({ id: 'Buat ruang pribadi', zh: '建立私人空間' ,en: 'Create a private space' })}</button>
    </form>
  </main>
}

function CareRecipientForm({ onCreated }: { onCreated: (patientId: string) => Promise<void> }) {
  const { text } = useI18n()
  const [name, setName] = useState('')
  const [recipientType, setRecipientType] = useState<CareRecipientType>('human')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setSaving(true)
    setMessage('')
    try {
      const patientId = await addHouseholdPatient(name, recipientType)
      // 建立後立刻切換，避免照護者以為自己正在替新貓記錄、實際卻仍寫到上一位對象。
      await onCreated(patientId)
      setName('')
      setRecipientType('human')
      setMessage(text({ id: 'Penerima perawatan ditambahkan.', zh: '已新增照護對象。' ,en: 'Subject added.' }))
    } catch (cause) {
      console.error('[tenant care recipient creation error]', cause)
      setMessage(text({ id: 'Tidak dapat menambah penerima perawatan. Coba lagi.', zh: '暫時無法新增照護對象，請再試一次。' ,en: 'There was an error adding the subject of care, please try again.' }))
    } finally {
      setSaving(false)
    }
  }

  return <section aria-labelledby="add-care-recipient-heading" className="mt-5 rounded-3xl border border-indigo-100 bg-indigo-50 p-4">
    <h2 id="add-care-recipient-heading" className="text-base font-black text-indigo-950">{text({ id: 'Tambah orang atau hewan', zh: '新增人或寵物' ,en: 'Add people or pets' })}</h2>
    <p className="mt-1 text-sm text-indigo-900">{text({ id: 'Tambahkan kucing, anjing, atau anggota keluarga yang Anda rawat.', zh: '加入你照護的貓、狗或家人。' ,en: 'Add a cat, dog, or family member you care for.' })}</p>
    <form onSubmit={submit} className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto]">
      <label className="block text-sm font-bold text-gray-800">{text({ id: 'Nama', zh: '名稱' ,en: 'Name' })}
        <input required maxLength={100} value={name} onChange={event => setName(event.target.value)} placeholder={text({ id: 'Contoh: Whiskers', zh: '例如：小乖' ,en: 'Example: Whiskers' })} className="mt-1 w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5" />
      </label>
      <label className="block text-sm font-bold text-gray-800">{text({ id: 'Jenis', zh: '類型' ,en: 'Type' })}
          <option value="human">{text({ id: '👤 Orang', zh: '👤 人' ,en: '👤 Person' })}</option>
          <option value="dog">{text({ id: '🐶 Anjing', zh: '🐶 狗' ,en: '🐶 Dog' })}</option>
          <option value="cat">{text({ id: '🐱 Kucing', zh: '🐱 貓' ,en: '🐱 Cat' })}</option>
          <option value="other">{text({ id: '🐾 Lainnya', zh: '🐾 其他' ,en: '🐾 Other' })}</option>
      </label>
      {message && <p role="status" className="text-sm text-indigo-900 sm:col-span-2">{message}</p>}
      <button type="submit" disabled={saving} className="rounded-xl bg-indigo-700 px-4 py-3 text-sm font-bold text-white disabled:opacity-60 sm:col-span-2">{text({ id: 'Tambah penerima perawatan', zh: '新增照護對象' ,en: 'Add a care recipient' })}</button>
    </form>
  </section>
}

import { DeleteAccountModal } from '../modals/DeleteAccountModal'
import { ExportCsvModal, type ExportTarget } from '../modals/ExportCsvModal'

function TenantRecorder({ context, onReload, error }: { context: TenantContext; onReload: () => Promise<void>; error: string }) {
  const { text } = useI18n(); const [patientId, setPatientId] = useState(context.patients[0]?.id ?? '')
  const [systolic, setSystolic] = useState('120'); const [diastolic, setDiastolic] = useState('80'); const [pulse, setPulse] = useState('70'); const [message, setMessage] = useState(error); const [saving, setSaving] = useState(false)
  const [isExportModalOpen, setIsExportModalOpen] = useState(false)
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false)

  const exportTargets: ExportTarget[] = useMemo(() => {
    const list: ExportTarget[] = context.patients.map(p => ({
      id: p.id,
      patientId: p.id,
      label: { id: p.display_name, zh: p.display_name ,en: p.display_name },
    }))
    if (list.length > 1) {
      list.push({
        id: 'all',
        label: { id: 'Semua Anggota (Berkas Terpisah)', zh: '所有成員（分開下載檔）' ,en: 'All members (download files separately)' },
      })
    }
    return list
  }, [context.patients])

  // 子元件維持掛載時也要接住 reload 的錯誤，否則失敗只會留在父層 state。
  useEffect(() => { if (error) setMessage(error) }, [error])
  const { records, loading, refetch } = useBpRecords(30, patientId)
  const save = async (event: React.FormEvent) => { event.preventDefault(); const sys = Number(systolic), dia = Number(diastolic), pul = Number(pulse); if (!patientId || !isValidBpInput(sys, dia, pul)) return setMessage(text({ id: 'Masukkan angka yang masuk akal.', zh: '請輸入合理的數字。' ,en: 'Enter reasonable numbers.' })); setSaving(true); setMessage(''); try { await saveTenantBpRecord(patientId, { systolic: sys, diastolic: dia, pulse: pul, measuredAt: new Date().toISOString() }); await refetch(); setMessage(text({ id: 'Tersimpan.', zh: '已儲存。' ,en: 'Saved.' })) } catch (cause) { console.error('[tenant bp save error]', cause); setMessage(text({ id: 'Tidak dapat menyimpan. Coba lagi.', zh: '暫時無法儲存，請再試一次。' ,en: 'Error saving, please try again.' })) } finally { setSaving(false) } }
  const selected = context.patients.find(patient => patient.id === patientId)
  const progress = records.filter(record => dayjs(record.measured_at).isAfter(dayjs().subtract(7, 'day'))).length

  return <main className="mx-auto min-h-dvh max-w-md bg-gray-50 px-5 py-6 text-gray-900"><header className="flex items-start justify-between"><div><p className="text-xs font-bold uppercase tracking-widest text-gray-400">{text({ id: 'Catatan perawatan', zh: '照護紀錄' ,en: 'Care Record' })}</p><h1 className="text-2xl font-black">{selected?.display_name}</h1></div><button onClick={() => signOut()} className="rounded-lg px-2 py-1 text-xs text-gray-500">{text({ id: 'Keluar', zh: '登出' ,en: 'Sign out' })}</button></header><CareRecipientForm onCreated={async newPatientId => { await onReload(); setPatientId(newPatientId); setMessage(text({ id: 'Penerima perawatan siap dicatat.', zh: '照護對象已建立，可開始記錄。' ,en: 'Subject has been created and is ready to start recording.' })) }} /><p className="mt-3 rounded-xl bg-white p-3 text-sm text-gray-600">{text({ id: `${progress} / 28 catatan dalam 7 hari`, zh: `最近 7 天 ${progress} / 28 筆` ,en: `${progress} / 28 records in the last 7 days` })}</p><form onSubmit={save} className="mt-5 space-y-3 rounded-3xl bg-white p-5 shadow-sm"><label className="block text-sm font-bold">{text({ id: 'Penerima perawatan', zh: '照護對象' ,en: 'Subjects of Care' })}<select value={patientId} onChange={event => setPatientId(event.target.value)} className="mt-1 w-full rounded-xl border border-gray-300 p-3">{context.patients.map(patient => <option key={patient.id} value={patient.id}>{patient.display_name}</option>)}</select></label><div className="grid grid-cols-3 gap-2">{[[text({ id: 'Sistolik', zh: '收縮壓' ,en: 'Systolic' }), systolic, setSystolic], [text({ id: 'Diastolik', zh: '舒張壓' ,en: 'Diastolic' }), diastolic, setDiastolic], [text({ id: 'Nadi', zh: '心跳' ,en: 'Heart rate' }), pulse, setPulse]].map(([label, value, setValue]) => <label key={label as string} className="text-xs font-bold">{label as string}<input inputMode="numeric" value={value as string} onChange={event => (setValue as (v: string) => void)(event.target.value)} className="mt-1 w-full rounded-xl border border-gray-300 p-3 text-lg" /></label>)}</div>{message && <p role="status" className="text-sm text-gray-600">{message}</p>}<button disabled={saving} className="w-full rounded-xl bg-red-600 px-4 py-3 font-bold text-white disabled:opacity-60">{text({ id: 'Simpan', zh: '儲存讀值' ,en: 'Save readings' })}</button></form><section className="mt-5"><h2 className="font-bold">{text({ id: '30 hari terakhir', zh: '最近 30 天' ,en: 'Last 30 days' })}</h2>{loading ? <p className="mt-2 text-sm text-gray-400">{text({ id: 'Memuat…', zh: '載入中…' ,en: 'Loading…' })}</p> : <ul className="mt-2 space-y-2">{records.slice(0, 10).map(record => { const state = evaluateReading(record.systolic, record.diastolic, record.pulse); return <li key={record.id} className="rounded-xl bg-white p-3 text-sm"><span className="font-bold text-[#C23B3B]">{record.systolic}</span> / <span className="font-bold text-[#2563EB]">{record.diastolic}</span> · <span className="font-bold text-[#7C3AED]">{record.pulse ?? '—'}</span><span className="ml-2 text-xs text-gray-400">{text(state.labels)}</span></li> })}</ul>}</section>
<button onClick={() => void onReload()} className="mt-5 text-xs text-gray-500 underline">{text({ id: 'Muat ulang', zh: '重新載入家庭資料' ,en: 'Reload' })}</button>

<div className="mt-8 border-t border-gray-200 pt-5 space-y-3 pb-10">
  <h2 className="font-bold text-gray-700">{text({ id: 'Pengaturan', zh: '系統設定' ,en: 'Settings' })}</h2>
  <HouseholdMemberManagement />
  <div className="flex flex-col gap-3 pt-3">
    <button
      onClick={() => setIsExportModalOpen(true)}
      className="text-left text-sm text-gray-600 underline"
    >
      {text({ id: 'Ekspor Data (CSV)', zh: '匯出個人資料 (CSV)' ,en: 'Export Personal Data (CSV)' })}
    </button>

    <a href="/privacy" className="text-left text-sm text-gray-600 underline">
      {text({ id: 'Kebijakan Privasi', zh: '隱私權條款' ,en: 'Privacy Policy' })}
    </a>

    <a href="/terms" className="text-left text-sm text-gray-600 underline">
      {text({ id: 'Syarat & Ketentuan', zh: '服務條款' ,en: 'Terms of Service' })}
    </a>

    <button
      onClick={() => setIsDeleteModalOpen(true)}
      className="text-left text-sm font-bold text-red-600 underline mt-2"
    >
      {text({ id: 'Hapus Akun', zh: '刪除帳號' ,en: 'DELETE ACCOUNT' })}
    </button>
  </div>
</div>

<ExportCsvModal
  isOpen={isExportModalOpen}
  onClose={() => setIsExportModalOpen(false)}
  targets={exportTargets}
/>

<DeleteAccountModal
  isOpen={isDeleteModalOpen}
  onClose={() => setIsDeleteModalOpen(false)}
/>
</main>
}
