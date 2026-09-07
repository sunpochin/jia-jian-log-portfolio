/*
檔案用途：藥量倒數與回診／抽血／打針／疫苗到期提醒的每日照護頁籤，列出、新增與結案提醒。
所在層：src/features/reminders/pages；由 DailyCarePage 依 careReminders 模組掛載。
主要關聯：src/lib/careDueReminders.ts 負責資料存取與純邏輯，本檔只處理畫面呈現與表單狀態。
*/
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useI18n, type LocalizedText } from '../../../lib/i18n'
import { calendarDateKey } from '../../../lib/careDay'
import { isDemoPatientId } from '../../../lib/demoData'
import {
  classifyReminderDueLevel,
  computeMedicationDueDate,
  computeRemainingDays,
  createCareDueReminder,
  deleteCareDueReminder,
  listCareDueReminders,
  reminderTypesForSpecies,
  setCareDueReminderStatus,
  updateCareDueReminder,
  REMINDER_TYPE_META,
  type CareDueReminder,
  type CareRecipientType,
  type ReminderType,
} from '../../../lib/careDueReminders'

const DUE_LEVEL_STYLE: Record<ReturnType<typeof classifyReminderDueLevel>, string> = {
  overdue: 'border-red-300 bg-red-50',
  due_soon: 'border-amber-300 bg-amber-50',
  ok: 'border-slate-200 bg-white',
}

const DUE_LEVEL_BADGE_STYLE: Record<ReturnType<typeof classifyReminderDueLevel>, string> = {
  overdue: 'bg-red-700 text-white',
  due_soon: 'bg-amber-600 text-white',
  ok: 'bg-slate-200 text-slate-700',
}

function remainingDaysText(remainingDays: number): LocalizedText {
  if (remainingDays < 0) return { id: `Terlambat ${Math.abs(remainingDays)} hari`, zh: `已逾期 ${Math.abs(remainingDays)} 天`, en: `${Math.abs(remainingDays)} days overdue` }
  if (remainingDays === 0) return { id: 'Jatuh tempo hari ini', zh: '今天到期', en: 'Due today' }
  return { id: `${remainingDays} hari lagi`, zh: `還剩 ${remainingDays} 天`, en: `${remainingDays} days remaining` }
}

type FormState = {
  reminderType: ReminderType
  startDate: string
  daysSupply: string
  dueDate: string
  thresholdDays: string
}

function defaultFormState(reminderType: ReminderType, today: string): FormState {
  return {
    reminderType,
    startDate: today,
    daysSupply: '',
    dueDate: '',
    thresholdDays: String(REMINDER_TYPE_META[reminderType].defaultThresholdDays),
  }
}

export function CareDueRemindersPage({ patientId, canManage, careRecipientType }: {
  patientId: string
  patientName?: string
  userEmail?: string
  canManage: boolean
  careRecipientType?: CareRecipientType
}) {
  const { text } = useI18n()
  const today = calendarDateKey()
  const applicableTypes = useMemo(() => reminderTypesForSpecies(careRecipientType), [careRecipientType])
  const [reminders, setReminders] = useState<CareDueReminder[]>([])
  const [remindersPatientId, setRemindersPatientId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState<LocalizedText | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(() => defaultFormState(applicableTypes[0] ?? 'medication_refill', today))
  const [showCompleted, setShowCompleted] = useState(false)
  const demoPatient = isDemoPatientId(patientId)
  const activePatientIdRef = useRef(patientId)
  // render 當下就更新 ref，讓使用者切換病人後，尚未完成的請求／mutation 立即知道自己已過期。
  activePatientIdRef.current = patientId
  const isCurrentPatient = useCallback((mutationPatientId: string) => activePatientIdRef.current === mutationPatientId, [])

  useEffect(() => {
    // 為什麼切換病人要一次清掉所有表單狀態：提醒、編輯中的 ID、草稿與 busy 狀態都屬於上一位病人，不能短暫沿用到下一位。
    setReminders([])
    setRemindersPatientId(null)
    setEditingId(null)
    setShowForm(false)
    setForm(defaultFormState(applicableTypes[0] ?? 'medication_refill', today))
    setShowCompleted(false)
    setBusyId(null)
    setErrorMessage(null)
    if (demoPatient) { setLoading(false); setRemindersPatientId(patientId); return }
    let cancelled = false
    setLoading(true)
    listCareDueReminders(patientId)
      .then(rows => { if (!cancelled && isCurrentPatient(patientId)) { setReminders(rows); setRemindersPatientId(patientId); setErrorMessage(null) } })
      .catch(error => {
        console.error('[care due reminders read error]', error)
        if (!cancelled && isCurrentPatient(patientId)) setErrorMessage({ id: 'Pengingat tidak dapat dimuat. Coba lagi nanti.', zh: '提醒讀取失敗，請稍後再試。', en: 'Reminders could not be loaded. Try again later.' })
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [applicableTypes, demoPatient, isCurrentPatient, patientId, today])

  const patientReady = remindersPatientId === patientId
  const patientReminders = patientReady ? reminders : []
  const activeReminders = patientReminders.filter(item => item.status === 'active').sort((a, b) => a.due_date.localeCompare(b.due_date))
  const inactiveReminders = patientReminders.filter(item => item.status !== 'active')

  const openAddForm = () => {
    setEditingId(null)
    setForm(defaultFormState(applicableTypes[0] ?? 'medication_refill', today))
    setShowForm(true)
  }

  const openEditForm = (reminder: CareDueReminder) => {
    setEditingId(reminder.id)
    setForm({
      reminderType: reminder.reminder_type,
      startDate: reminder.start_date,
      daysSupply: reminder.days_supply ? String(reminder.days_supply) : '',
      dueDate: reminder.reminder_type === 'medication_refill' ? '' : reminder.due_date,
      thresholdDays: String(reminder.threshold_days),
    })
    setShowForm(true)
  }

  const closeForm = () => { setShowForm(false); setEditingId(null) }

  const submitForm = async () => {
    const mutationPatientId = patientId
    const thresholdDays = Number(form.thresholdDays)
    if (!Number.isInteger(thresholdDays) || thresholdDays < 1 || thresholdDays > 180) {
      setErrorMessage({ id: 'Jumlah hari pengingat harus antara 1-180.', zh: '提醒門檻天數需介於 1-180 天。', en: 'The reminder threshold must be between 1 and 180 days.' })
      return
    }
    const isMedication = form.reminderType === 'medication_refill'
    const daysSupply = isMedication ? Number(form.daysSupply) : undefined
    if (isMedication && (!Number.isInteger(daysSupply) || (daysSupply as number) < 1)) {
      setErrorMessage({ id: 'Jumlah hari obat harus lebih dari 0.', zh: '藥量天數需大於 0。', en: 'Medication supply must be more than 0 days.' })
      return
    }
    if (!isMedication && !form.dueDate) {
      setErrorMessage({ id: 'Tanggal jatuh tempo wajib diisi.', zh: '請填寫到期日。', en: 'Enter a due date.' })
      return
    }

    setBusyId(editingId ?? 'new')
    try {
      const input = {
        patientId: mutationPatientId,
        reminderType: form.reminderType,
        startDate: form.startDate,
        thresholdDays,
        daysSupply,
        dueDate: isMedication ? undefined : form.dueDate,
      }
      const saved = editingId ? await updateCareDueReminder(editingId, input) : await createCareDueReminder(input)
      if (!isCurrentPatient(mutationPatientId)) return
      setReminders(current => editingId ? current.map(item => item.id === saved.id ? saved : item) : [...current, saved])
      setErrorMessage(null)
      closeForm()
    } catch (error) {
      console.error('[care due reminder save error]', error)
      if (!isCurrentPatient(mutationPatientId)) return
      setErrorMessage({ id: 'Pengingat gagal disimpan. Coba lagi nanti.', zh: '提醒儲存失敗，請稍後再試。', en: 'The reminder could not be saved. Try again later.' })
    } finally {
      if (isCurrentPatient(mutationPatientId)) setBusyId(null)
    }
  }

  const changeStatus = async (reminder: CareDueReminder, status: 'completed' | 'dismissed' | 'active') => {
    const mutationPatientId = patientId
    setBusyId(reminder.id)
    try {
      const saved = await setCareDueReminderStatus(reminder.id, status)
      if (!isCurrentPatient(mutationPatientId)) return
      setReminders(current => current.map(item => item.id === saved.id ? saved : item))
      setErrorMessage(null)
    } catch (error) {
      console.error('[care due reminder status error]', error)
      if (!isCurrentPatient(mutationPatientId)) return
      setErrorMessage({ id: 'Status pengingat gagal diperbarui. Coba lagi nanti.', zh: '提醒狀態更新失敗，請稍後再試。', en: 'The reminder status could not be updated. Try again later.' })
    } finally {
      if (isCurrentPatient(mutationPatientId)) setBusyId(null)
    }
  }

  const removeReminder = async (reminder: CareDueReminder) => {
    const mutationPatientId = patientId
    setBusyId(reminder.id)
    try {
      await deleteCareDueReminder(reminder.id)
      if (!isCurrentPatient(mutationPatientId)) return
      setReminders(current => current.filter(item => item.id !== reminder.id))
      setErrorMessage(null)
    } catch (error) {
      console.error('[care due reminder delete error]', error)
      if (!isCurrentPatient(mutationPatientId)) return
      // 已經送過 Telegram 通知的提醒會留下 care_due_reminder_deliveries 稽核紀錄，
      // 外鍵是 ON DELETE RESTRICT 讓刪除在資料庫層被擋下；這種情況要請照護者改用「略過」，
      // 而不是顯示看起來像系統故障、其實永遠會失敗的通用錯誤訊息。
      const isBlockedByDeliveryHistory = (error as { code?: string })?.code === '23503'
      setErrorMessage(isBlockedByDeliveryHistory
        ? { id: 'Pengingat ini sudah pernah mengirim notifikasi, sehingga tidak dapat dihapus. Gunakan "Abaikan" sebagai gantinya.', zh: '這筆提醒已經送出過通知，無法刪除，請改用「略過」。', en: 'This reminder has a delivery record and cannot be deleted. Use "Dismiss" instead.' }
        : { id: 'Pengingat gagal dihapus. Coba lagi nanti.', zh: '提醒刪除失敗，請稍後再試。', en: 'The reminder could not be deleted. Try again later.' })
    } finally {
      if (isCurrentPatient(mutationPatientId)) setBusyId(null)
    }
  }

  const previewDueDate = form.reminderType === 'medication_refill' && form.startDate && Number(form.daysSupply) > 0
    ? computeMedicationDueDate(form.startDate, Number(form.daysSupply))
    : null

  return (
    <section className="min-h-full bg-slate-50 px-4 pb-8 pt-4 text-slate-950 sm:px-5">
      <header className="mb-4 space-y-1">
        <h2 className="text-lg font-black text-slate-950">{text({ id: 'Pengingat jatuh tempo', zh: '到期提醒', en: 'Due reminders' })}</h2>
        <p className="text-sm font-medium leading-6 text-slate-600">{text({ id: 'Hanya menampilkan tanggal dan jumlah hari; tidak menyarankan penyebab atau perubahan dosis.', zh: '這裡只顯示時間與天數，不會推論病因或建議調藥。', en: 'This page states only dates and day counts; it does not infer causes or suggest dose changes.' })}</p>
      </header>

      {demoPatient && <section className="rounded-3xl border border-dashed border-slate-300 bg-white p-6 text-center shadow-sm">
        <p className="text-sm font-medium leading-6 text-slate-600">{text({ id: 'Pengingat jatuh tempo belum tersedia di mode demo.', zh: '到期提醒目前尚未支援展示模式。', en: 'Due reminders are not available in demo mode yet.' })}</p>
      </section>}

      {!demoPatient && <>
        {errorMessage && <p role="alert" className="mb-3 rounded-xl bg-red-50 p-3 text-base font-semibold text-red-700">{text(errorMessage)}</p>}

        {canManage && <div className="mb-4 flex justify-end">
          <button type="button" disabled={!patientReady || loading} onClick={patientReady && showForm && !editingId ? closeForm : openAddForm} className="min-h-11 rounded-2xl bg-sky-700 px-4 text-sm font-black text-white shadow-sm active:bg-sky-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600 focus-visible:ring-offset-2 disabled:opacity-60">
            {patientReady && showForm && !editingId ? text({ id: 'Tutup formulir', zh: '關閉表單', en: 'Close form' }) : text({ id: '+ Tambah pengingat', zh: '＋ 新增提醒', en: '＋ Add reminder' })}
          </button>
        </div>}

        {patientReady && showForm && canManage && <section className="mb-4 rounded-3xl border border-sky-200 bg-sky-50 p-4 shadow-sm">
          <h3 className="text-base font-black text-sky-950">{editingId ? text({ id: 'Ubah pengingat', zh: '編輯提醒', en: 'Edit reminder' }) : text({ id: 'Pengingat baru', zh: '新增提醒', en: 'New reminder' })}</h3>
          <div className="mt-3 space-y-3">
            <label className="block">
              <span className="mb-1 block text-sm font-bold text-sky-900">{text({ id: 'Jenis', zh: '類型', en: 'Type' })}</span>
              <select
                value={form.reminderType}
                disabled={Boolean(editingId)}
                onChange={event => setForm(current => ({ ...defaultFormState(event.target.value as ReminderType, today), startDate: current.startDate }))}
                className="min-h-11 w-full rounded-xl border border-sky-300 bg-white px-3 text-base font-semibold text-slate-900"
              >
                {applicableTypes.map(type => <option key={type} value={type}>{text(REMINDER_TYPE_META[type].label)}</option>)}
              </select>
            </label>

            <label className="block">
              <span className="mb-1 block text-sm font-bold text-sky-900">{form.reminderType === 'medication_refill' ? text({ id: 'Tanggal ambil obat', zh: '領藥日期', en: 'Medication pickup date' }) : text({ id: 'Tanggal mulai', zh: '起算日期', en: 'Start date' })}</span>
              <input type="date" value={form.startDate} onChange={event => setForm(current => ({ ...current, startDate: event.target.value }))} className="min-h-11 w-full rounded-xl border border-sky-300 bg-white px-3 text-base font-semibold text-slate-900" />
            </label>

            {form.reminderType === 'medication_refill'
              ? <label className="block">
                <span className="mb-1 block text-sm font-bold text-sky-900">{text({ id: 'Jumlah hari obat', zh: '藥量天數', en: 'Medication supply (days)' })}</span>
                <input type="number" min={1} value={form.daysSupply} onChange={event => setForm(current => ({ ...current, daysSupply: event.target.value }))} className="min-h-11 w-full rounded-xl border border-sky-300 bg-white px-3 text-base font-semibold text-slate-900" />
                {previewDueDate && <span className="mt-1 block text-xs font-semibold text-sky-800">{text({ id: `Jatuh tempo: ${previewDueDate}`, zh: `到期日：${previewDueDate}`, en: `Due date: ${previewDueDate}` })}</span>}
              </label>
              : <label className="block">
              <span className="mb-1 block text-sm font-bold text-sky-900">{text({ id: 'Tanggal jatuh tempo', zh: '到期日', en: 'Due date' })}</span>
                <input type="date" value={form.dueDate} onChange={event => setForm(current => ({ ...current, dueDate: event.target.value }))} className="min-h-11 w-full rounded-xl border border-sky-300 bg-white px-3 text-base font-semibold text-slate-900" />
              </label>}

            <label className="block">
              <span className="mb-1 block text-sm font-bold text-sky-900">{text({ id: 'Ingatkan berapa hari sebelumnya', zh: '提前幾天提醒', en: 'Remind me how many days ahead' })}</span>
              <input type="number" min={1} max={180} value={form.thresholdDays} onChange={event => setForm(current => ({ ...current, thresholdDays: event.target.value }))} className="min-h-11 w-full rounded-xl border border-sky-300 bg-white px-3 text-base font-semibold text-slate-900" />
            </label>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <button type="button" onClick={closeForm} className="min-h-12 rounded-2xl border border-slate-300 bg-white px-4 text-base font-black text-slate-700 active:bg-slate-100">{text({ id: 'Batal', zh: '取消', en: 'Cancel' })}</button>
            <button type="button" disabled={busyId === (editingId ?? 'new')} onClick={submitForm} className="min-h-12 rounded-2xl bg-sky-700 px-4 text-base font-black text-white shadow-sm active:bg-sky-900 disabled:opacity-60">{text({ id: 'Simpan', zh: '儲存', en: 'Save' })}</button>
          </div>
        </section>}

        {loading && <p className="py-12 text-center text-base text-gray-500">{text({ id: 'Memuat…', zh: '載入中…', en: 'Loading…' })}</p>}

        {!loading && activeReminders.length === 0 && <section className="rounded-3xl border border-dashed border-slate-300 bg-white p-6 text-center shadow-sm">
          <p className="text-sm font-medium leading-6 text-slate-600">{text({ id: 'Belum ada pengingat aktif.', zh: '目前沒有進行中的提醒。', en: 'There are no active reminders.' })}</p>
        </section>}

        {!loading && activeReminders.length > 0 && <ul className="space-y-3">
          {activeReminders.map(reminder => {
            const remainingDays = computeRemainingDays(reminder.due_date, today)
            const level = classifyReminderDueLevel(remainingDays, reminder.threshold_days)
            return (
              <li key={reminder.id} className={`rounded-2xl border p-4 shadow-sm ${DUE_LEVEL_STYLE[level]}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-base font-black text-slate-900">{text(REMINDER_TYPE_META[reminder.reminder_type].label)}</p>
                  <span className={`rounded-full px-3 py-1 text-xs font-black ${DUE_LEVEL_BADGE_STYLE[level]}`}>{text(remainingDaysText(remainingDays))}</span>
                </div>
                <p className="mt-1 text-sm font-medium text-slate-600">
                  {reminder.reminder_type === 'medication_refill'
                    ? text({ id: `Ambil ${reminder.start_date}, cukup ${reminder.days_supply} hari · jatuh tempo ${reminder.due_date}`, zh: `領藥日 ${reminder.start_date}，共 ${reminder.days_supply} 天份・到期日 ${reminder.due_date}`, en: `Picked up ${reminder.start_date}, ${reminder.days_supply} days supplied · due ${reminder.due_date}` })
                    : text({ id: `Jatuh tempo ${reminder.due_date}`, zh: `到期日 ${reminder.due_date}`, en: `Due ${reminder.due_date}` })}
                </p>
                {canManage && <div className="mt-3 flex flex-wrap gap-2">
                  <button type="button" disabled={busyId === reminder.id} onClick={() => openEditForm(reminder)} className="min-h-9 rounded-xl border border-slate-300 bg-white px-3 text-xs font-black text-slate-700 active:bg-slate-100">{text({ id: 'Ubah', zh: '編輯', en: 'Edit' })}</button>
                  <button type="button" disabled={busyId === reminder.id} onClick={() => changeStatus(reminder, 'completed')} className="min-h-9 rounded-xl border border-emerald-300 bg-emerald-50 px-3 text-xs font-black text-emerald-800 active:bg-emerald-100">{text({ id: 'Selesai', zh: '已完成', en: 'Completed' })}</button>
                  <button type="button" disabled={busyId === reminder.id} onClick={() => changeStatus(reminder, 'dismissed')} className="min-h-9 rounded-xl border border-slate-300 bg-white px-3 text-xs font-black text-slate-700 active:bg-slate-100">{text({ id: 'Abaikan', zh: '略過', en: 'Dismiss' })}</button>
                  <button type="button" disabled={busyId === reminder.id} onClick={() => removeReminder(reminder)} className="min-h-9 rounded-xl border border-red-300 bg-red-50 px-3 text-xs font-black text-red-800 active:bg-red-100">{text({ id: 'Hapus', zh: '刪除', en: 'Delete' })}</button>
                </div>}
              </li>
            )
          })}
        </ul>}

        {inactiveReminders.length > 0 && <div className="mt-5">
          <button type="button" onClick={() => setShowCompleted(current => !current)} className="min-h-9 text-sm font-bold text-sky-800 underline decoration-sky-300 underline-offset-4">
            {showCompleted ? text({ id: 'Sembunyikan riwayat', zh: '收合已結案', en: 'Hide history' }) : text({ id: `Lihat riwayat (${inactiveReminders.length})`, zh: `查看已結案（${inactiveReminders.length}）`, en: `View history (${inactiveReminders.length})` })}
          </button>
          {showCompleted && <ul className="mt-3 space-y-2">
            {inactiveReminders.map(reminder => (
              <li key={reminder.id} className="rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-600">
                <span className="font-bold text-slate-800">{text(REMINDER_TYPE_META[reminder.reminder_type].label)}</span>
                {' · '}{text({ id: `Jatuh tempo ${reminder.due_date}`, zh: `到期日 ${reminder.due_date}`, en: `Due ${reminder.due_date}` })}
                {' · '}{text(reminder.status === 'completed' ? { id: 'Selesai', zh: '已完成', en: 'Completed' } : { id: 'Diabaikan', zh: '已略過', en: 'Dismissed' })}
                {canManage && <button type="button" disabled={busyId === reminder.id} onClick={() => changeStatus(reminder, 'active')} className="ml-2 font-bold text-sky-700 underline">{text({ id: 'Aktifkan lagi', zh: '重新啟用', en: 'Reactivate' })}</button>}
              </li>
            ))}
          </ul>}
        </div>}
      </>}
    </section>
  )
}
