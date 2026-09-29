/*
檔案用途：白名單檢驗值（K／NA／CR／EGFR／HBA1C／GLU／HB）的每日照護頁籤，列出、新增、編輯與刪除檢驗值。
所在層：src/features/labs/pages；由 DailyCarePage 依 labResults 模組掛載，人類限定（見 dailyCareModules.ts）。
主要關聯：src/lib/labResults.ts 負責資料存取、單位綁定與範圍判讀，本檔只處理畫面呈現與表單狀態；
結構比照 src/features/reminders/pages/CareDueRemindersPage.tsx（issue #687，S4）。
*/
import { useCallback, useEffect, useRef, useState } from 'react'
import { useI18n, type LocalizedText } from '../../../lib/i18n'
import { calendarDateKey } from '../../../lib/careDay'
import { isDemoPatientId } from '../../../lib/demoData'
import { AttentionItem, type AttentionTone } from '../../../components/ui/AttentionItem'
import {
  LAB_ITEM_CODES,
  LAB_ITEM_META,
  createLabResult,
  deleteLabResult,
  labRangeStatus,
  listLabResults,
  sampledAtFromDateKey,
  sampledDateKey,
  updateLabResult,
  type LabItemCode,
  type LabRangeStatus,
  type PatientLabResult,
} from '../../../lib/labResults'

const RANGE_STATUS_TONE: Record<LabRangeStatus, AttentionTone> = {
  below: 'overdue',
  above: 'overdue',
  within: 'ok',
  unknown: 'ok',
}

function rangeStatusLabel(status: LabRangeStatus): LocalizedText {
  switch (status) {
    case 'below': return { id: 'Di bawah rentang referensi', zh: '低於參考值', en: 'Below reference range' }
    case 'above': return { id: 'Di atas rentang referensi', zh: '高於參考值', en: 'Above reference range' }
    case 'within': return { id: 'Dalam rentang referensi', zh: '在參考值內', en: 'Within reference range' }
    case 'unknown': return { id: 'Tidak ada rentang referensi', zh: '無參考值可分類', en: 'No reference range' }
  }
}

type FormState = {
  itemCode: LabItemCode
  value: string
  sampledAt: string
  referenceLow: string
  referenceHigh: string
  institution: string
  notes: string
}

function defaultFormState(itemCode: LabItemCode, today: string): FormState {
  return { itemCode, value: '', sampledAt: today, referenceLow: '', referenceHigh: '', institution: '', notes: '' }
}

export function LabResultsPage({ patientId }: {
  patientId: string
  patientName?: string
  userEmail?: string
}) {
  const { text } = useI18n()
  const today = calendarDateKey()
  const [results, setResults] = useState<PatientLabResult[]>([])
  const [resultsPatientId, setResultsPatientId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState<LocalizedText | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(() => defaultFormState('K', today))
  const demoPatient = isDemoPatientId(patientId)
  const activePatientIdRef = useRef(patientId)
  activePatientIdRef.current = patientId
  const isCurrentPatient = useCallback((mutationPatientId: string) => activePatientIdRef.current === mutationPatientId, [])

  useEffect(() => {
    // 為什麼切換病人要一次清掉所有表單狀態：檢驗值、編輯中的 ID、草稿與 busy 狀態都屬於上一位病人。
    setResults([])
    setResultsPatientId(null)
    setEditingId(null)
    setShowForm(false)
    setForm(defaultFormState('K', today))
    setBusyId(null)
    setErrorMessage(null)
    if (demoPatient) { setLoading(false); setResultsPatientId(patientId); return }
    let cancelled = false
    setLoading(true)
    listLabResults(patientId)
      .then(rows => { if (!cancelled && isCurrentPatient(patientId)) { setResults(rows); setResultsPatientId(patientId); setErrorMessage(null) } })
      .catch(error => {
        console.error('[lab results read error]', error)
        if (!cancelled && isCurrentPatient(patientId)) setErrorMessage({ id: 'Hasil lab tidak dapat dimuat. Coba lagi nanti.', zh: '檢驗值讀取失敗，請稍後再試。', en: 'Lab results could not be loaded. Try again later.' })
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [demoPatient, isCurrentPatient, patientId, today])

  const patientReady = resultsPatientId === patientId
  const patientResults = patientReady ? results : []

  const openAddForm = () => {
    setEditingId(null)
    setForm(defaultFormState('K', today))
    setShowForm(true)
  }

  const openEditForm = (result: PatientLabResult) => {
    setEditingId(result.id)
    setForm({
      itemCode: result.item_code,
      value: String(result.value),
      sampledAt: sampledDateKey(result.sampled_at),
      referenceLow: result.reference_low != null ? String(result.reference_low) : '',
      referenceHigh: result.reference_high != null ? String(result.reference_high) : '',
      institution: result.institution ?? '',
      notes: result.notes ?? '',
    })
    setShowForm(true)
  }

  const closeForm = () => { setShowForm(false); setEditingId(null) }

  const submitForm = async () => {
    const mutationPatientId = patientId
    const value = Number(form.value)
    if (!Number.isFinite(value) || value < 0) {
      setErrorMessage({ id: 'Nilai harus berupa angka 0 atau lebih.', zh: '數值需為 0 以上的數字。', en: 'The value must be a number of 0 or more.' })
      return
    }
    const referenceLow = form.referenceLow.trim() === '' ? null : Number(form.referenceLow)
    const referenceHigh = form.referenceHigh.trim() === '' ? null : Number(form.referenceHigh)
    if ((referenceLow != null && !Number.isFinite(referenceLow)) || (referenceHigh != null && !Number.isFinite(referenceHigh))) {
      setErrorMessage({ id: 'Rentang referensi harus berupa angka.', zh: '參考值需為數字。', en: 'The reference range must be numeric.' })
      return
    }
    if (referenceLow != null && referenceHigh != null && referenceLow > referenceHigh) {
      setErrorMessage({ id: 'Batas bawah tidak boleh lebih besar dari batas atas.', zh: '參考值下限不能大於上限。', en: 'The lower reference bound cannot exceed the upper bound.' })
      return
    }
    if (!form.sampledAt) {
      setErrorMessage({ id: 'Tanggal pengambilan sampel wajib diisi.', zh: '請填寫採檢日期。', en: 'Enter the sample date.' })
      return
    }

    setBusyId(editingId ?? 'new')
    try {
      const input = {
        patientId: mutationPatientId,
        itemCode: form.itemCode,
        value,
        sampledAt: sampledAtFromDateKey(form.sampledAt),
        referenceLow,
        referenceHigh,
        institution: form.institution.trim() || null,
        notes: form.notes.trim() || null,
      }
      const saved = editingId ? await updateLabResult(editingId, input) : await createLabResult(input)
      if (!isCurrentPatient(mutationPatientId)) return
      setResults(current => {
        const next = editingId ? current.map(item => item.id === saved.id ? saved : item) : [...current, saved]
        return next.sort((a, b) => b.sampled_at.localeCompare(a.sampled_at))
      })
      setErrorMessage(null)
      closeForm()
    } catch (error) {
      console.error('[lab result save error]', error)
      if (!isCurrentPatient(mutationPatientId)) return
      // 每日配額（30 筆）觸發時資料庫回傳 P0001 daily_lab_results_limit；其餘錯誤顯示通用訊息，
      // 不揣測是哪一種 constraint 失敗，避免對照護者顯示過度技術性的原始錯誤碼。
      const isQuotaExceeded = (error as { message?: string })?.message?.includes('daily_lab_results_limit')
      setErrorMessage(isQuotaExceeded
        ? { id: 'Hasil lab hari ini sudah mencapai batas. Coba lagi besok.', zh: '今天的檢驗值筆數已達上限，請明天再試。', en: 'Today’s lab result entries have reached the daily limit. Try again tomorrow.' }
        : { id: 'Hasil lab gagal disimpan. Coba lagi nanti.', zh: '檢驗值儲存失敗，請稍後再試。', en: 'The lab result could not be saved. Try again later.' })
    } finally {
      if (isCurrentPatient(mutationPatientId)) setBusyId(null)
    }
  }

  const removeResult = async (result: PatientLabResult) => {
    const mutationPatientId = patientId
    setBusyId(result.id)
    try {
      await deleteLabResult(result.id)
      if (!isCurrentPatient(mutationPatientId)) return
      setResults(current => current.filter(item => item.id !== result.id))
      setErrorMessage(null)
    } catch (error) {
      console.error('[lab result delete error]', error)
      if (!isCurrentPatient(mutationPatientId)) return
      setErrorMessage({ id: 'Hasil lab gagal dihapus. Coba lagi nanti.', zh: '檢驗值刪除失敗，請稍後再試。', en: 'The lab result could not be deleted. Try again later.' })
    } finally {
      if (isCurrentPatient(mutationPatientId)) setBusyId(null)
    }
  }

  return (
    <section className="min-h-full bg-slate-50 px-4 pb-8 pt-4 text-slate-950 sm:px-5">
      <header className="mb-4 space-y-1">
        <h2 className="text-lg font-black text-slate-950">{text({ id: 'Hasil lab', zh: '檢驗值', en: 'Lab results' })}</h2>
        <p className="text-sm font-medium leading-6 text-slate-600">{text({ id: 'Hanya menampilkan nilai dan rentang referensi laporan itu sendiri; tidak menyarankan diagnosis atau perubahan dosis.', zh: '這裡只顯示數值與該筆報告自己的參考值，不會推論診斷或建議調藥。', en: 'This page states only values and the report’s own reference range; it does not infer a diagnosis or suggest dose changes.' })}</p>
      </header>

      {demoPatient && <section className="rounded-3xl border border-dashed border-slate-300 bg-white p-6 text-center shadow-sm">
        <p className="text-sm font-medium leading-6 text-slate-600">{text({ id: 'Hasil lab belum tersedia di mode demo.', zh: '檢驗值目前尚未支援展示模式。', en: 'Lab results are not available in demo mode yet.' })}</p>
      </section>}

      {!demoPatient && <>
        {errorMessage && <p role="alert" className="mb-3 rounded-xl bg-red-50 p-3 text-base font-semibold text-red-700">{text(errorMessage)}</p>}

        <div className="mb-4 flex justify-end">
          <button type="button" disabled={!patientReady || loading} onClick={patientReady && showForm && !editingId ? closeForm : openAddForm} className="min-h-11 rounded-2xl bg-sky-700 px-4 text-sm font-black text-white shadow-sm active:bg-sky-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600 focus-visible:ring-offset-2 disabled:opacity-60">
            {patientReady && showForm && !editingId ? text({ id: 'Tutup formulir', zh: '關閉表單', en: 'Close form' }) : text({ id: '+ Tambah hasil lab', zh: '＋ 新增檢驗值', en: '＋ Add lab result' })}
          </button>
        </div>

        {patientReady && showForm && <section className="mb-4 rounded-3xl border border-sky-200 bg-sky-50 p-4 shadow-sm">
          <h3 className="text-base font-black text-sky-950">{editingId ? text({ id: 'Ubah hasil lab', zh: '編輯檢驗值', en: 'Edit lab result' }) : text({ id: 'Hasil lab baru', zh: '新增檢驗值', en: 'New lab result' })}</h3>
          <div className="mt-3 space-y-3">
            <label className="block">
              <span className="mb-1 block text-sm font-bold text-sky-900">{text({ id: 'Jenis pemeriksaan', zh: '項目', en: 'Item' })}</span>
              <select
                value={form.itemCode}
                disabled={Boolean(editingId)}
                onChange={event => setForm(current => ({ ...defaultFormState(event.target.value as LabItemCode, today), sampledAt: current.sampledAt }))}
                className="min-h-11 w-full rounded-xl border border-sky-300 bg-white px-3 text-base font-semibold text-slate-900"
              >
                {LAB_ITEM_CODES.map(code => <option key={code} value={code}>{text(LAB_ITEM_META[code].label)}</option>)}
              </select>
            </label>

            <label className="block">
              <span className="mb-1 block text-sm font-bold text-sky-900">{text({ id: `Nilai (${LAB_ITEM_META[form.itemCode].unit})`, zh: `數值（${LAB_ITEM_META[form.itemCode].unit}）`, en: `Value (${LAB_ITEM_META[form.itemCode].unit})` })}</span>
              <input type="number" min={0} step="any" value={form.value} onChange={event => setForm(current => ({ ...current, value: event.target.value }))} className="min-h-11 w-full rounded-xl border border-sky-300 bg-white px-3 text-base font-semibold text-slate-900" />
            </label>

            <label className="block">
              <span className="mb-1 block text-sm font-bold text-sky-900">{text({ id: 'Tanggal pengambilan sampel', zh: '採檢日期', en: 'Sample date' })}</span>
              <input type="date" value={form.sampledAt} onChange={event => setForm(current => ({ ...current, sampledAt: event.target.value }))} className="min-h-11 w-full rounded-xl border border-sky-300 bg-white px-3 text-base font-semibold text-slate-900" />
            </label>

            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="mb-1 block text-sm font-bold text-sky-900">{text({ id: 'Batas bawah referensi', zh: '參考值下限', en: 'Reference low' })}</span>
                <input type="number" step="any" value={form.referenceLow} onChange={event => setForm(current => ({ ...current, referenceLow: event.target.value }))} className="min-h-11 w-full rounded-xl border border-sky-300 bg-white px-3 text-base font-semibold text-slate-900" />
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-bold text-sky-900">{text({ id: 'Batas atas referensi', zh: '參考值上限', en: 'Reference high' })}</span>
                <input type="number" step="any" value={form.referenceHigh} onChange={event => setForm(current => ({ ...current, referenceHigh: event.target.value }))} className="min-h-11 w-full rounded-xl border border-sky-300 bg-white px-3 text-base font-semibold text-slate-900" />
              </label>
            </div>
            <p className="text-xs font-medium text-sky-800">{text({ id: 'Kosongkan jika laporan tidak mencantumkan rentang referensi; hasilnya akan ditampilkan tanpa kategori.', zh: '若報告未附參考值可留空，此筆將只顯示數值、不做分類。', en: 'Leave blank if the report has no reference range; this entry will show only the value, uncategorized.' })}</p>

            <label className="block">
              <span className="mb-1 block text-sm font-bold text-sky-900">{text({ id: 'Institusi (opsional)', zh: '檢驗機構（選填）', en: 'Institution (optional)' })}</span>
              <input type="text" maxLength={80} value={form.institution} onChange={event => setForm(current => ({ ...current, institution: event.target.value }))} className="min-h-11 w-full rounded-xl border border-sky-300 bg-white px-3 text-base font-semibold text-slate-900" />
            </label>

            <label className="block">
              <span className="mb-1 block text-sm font-bold text-sky-900">{text({ id: 'Catatan (opsional)', zh: '備註（選填）', en: 'Notes (optional)' })}</span>
              <textarea maxLength={240} value={form.notes} onChange={event => setForm(current => ({ ...current, notes: event.target.value }))} className="min-h-20 w-full rounded-xl border border-sky-300 bg-white px-3 py-2 text-base font-semibold text-slate-900" />
            </label>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <button type="button" onClick={closeForm} className="min-h-12 rounded-2xl border border-slate-300 bg-white px-4 text-base font-black text-slate-700 active:bg-slate-100">{text({ id: 'Batal', zh: '取消', en: 'Cancel' })}</button>
            <button type="button" disabled={busyId === (editingId ?? 'new')} onClick={submitForm} className="min-h-12 rounded-2xl bg-sky-700 px-4 text-base font-black text-white shadow-sm active:bg-sky-900 disabled:opacity-60">{text({ id: 'Simpan', zh: '儲存', en: 'Save' })}</button>
          </div>
        </section>}

        {loading && <p className="py-12 text-center text-base text-gray-500">{text({ id: 'Memuat…', zh: '載入中…', en: 'Loading…' })}</p>}

        {!loading && patientResults.length === 0 && <section className="rounded-3xl border border-dashed border-slate-300 bg-white p-6 text-center shadow-sm">
          <p className="text-sm font-medium leading-6 text-slate-600">{text({ id: 'Belum ada hasil lab.', zh: '目前沒有檢驗值紀錄。', en: 'There are no lab results yet.' })}</p>
        </section>}

        {!loading && patientResults.length > 0 && <ul className="space-y-3">
          {patientResults.map(result => {
            const status = labRangeStatus(result)
            const meta = LAB_ITEM_META[result.item_code]
            const rangeText = result.reference_low != null && result.reference_high != null
              ? text({ id: `Rentang referensi ${result.reference_low.toFixed(meta.decimals)}–${result.reference_high.toFixed(meta.decimals)}`, zh: `參考值 ${result.reference_low.toFixed(meta.decimals)}–${result.reference_high.toFixed(meta.decimals)}`, en: `Reference range ${result.reference_low.toFixed(meta.decimals)}–${result.reference_high.toFixed(meta.decimals)}` })
              : text({ id: 'Tidak ada rentang referensi', zh: '無參考值', en: 'No reference range' })
            const sampledDate = sampledDateKey(result.sampled_at)
            const description = `${text({ id: `Diambil ${sampledDate}`, zh: `採檢日 ${sampledDate}`, en: `Sampled ${sampledDate}` })} · ${rangeText}${result.institution ? ` · ${result.institution}` : ''}`
            return (
              <AttentionItem
                key={result.id}
                tone={RANGE_STATUS_TONE[status]}
                title={`${text(meta.label)} ${result.value.toFixed(meta.decimals)}${meta.unit}`}
                badge={text(rangeStatusLabel(status))}
                description={description}
                actions={<>
                  <button type="button" disabled={busyId === result.id} onClick={() => openEditForm(result)} className="min-h-9 rounded-xl border border-slate-300 bg-white px-3 text-xs font-black text-slate-700 active:bg-slate-100">{text({ id: 'Ubah', zh: '編輯', en: 'Edit' })}</button>
                  <button type="button" disabled={busyId === result.id} onClick={() => removeResult(result)} className="min-h-9 rounded-xl border border-red-300 bg-red-50 px-3 text-xs font-black text-red-800 active:bg-red-100">{text({ id: 'Hapus', zh: '刪除', en: 'Delete' })}</button>
                </>}
              />
            )
          })}
        </ul>}
      </>}
    </section>
  )
}
