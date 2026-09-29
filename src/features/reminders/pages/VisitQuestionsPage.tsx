/*
檔案用途：回診問題清單（issue #723）的每日照護頁籤，累積問題、看診時勾選已問並記錄醫師回答；照護閉環 T5
（issue #949）起也以 embedded 模式嵌在門診頁「問什麼」區塊（去掉頁首與頁面底色，其餘完全相同）。
所在層：src/features/reminders/pages；由 DailyCarePage 依 visitQuestions 模組掛載、NextVisitPage 以 embedded 嵌入。
主要關聯：src/lib/visitQuestions.ts 負責資料存取與純邏輯，本檔只處理畫面呈現與表單狀態。
*/
import { useCallback, useEffect, useRef, useState } from 'react'
import { useI18n, type LocalizedText } from '../../../lib/i18n'
import { isDemoPatientId } from '../../../lib/demoData'
import {
  createVisitQuestion,
  deleteVisitQuestion,
  listVisitQuestions,
  nextSortOrder,
  setVisitQuestionStatus,
  updateVisitQuestion,
  VISIT_QUESTION_PRESETS,
  VISIT_QUESTION_STATUS_META,
  type VisitQuestion,
} from '../../../lib/visitQuestions'

export function VisitQuestionsPage({ patientId, embedded = false, refreshKey = 0, onChanged }: {
  patientId: string
  embedded?: boolean
  // 門診頁用：外部（例如就診前摘要的「加入問題清單」）新增了問題時 +1，讓這份清單重新讀取（Codex review PR #955 P2）。
  refreshKey?: number
  // 每次成功新增／編輯／改狀態／刪除後呼叫，讓同頁的「醫師說了什麼」重新配對，不必等 tab 重新掛載。
  onChanged?: () => void
}) {
  const { text } = useI18n()
  const [questions, setQuestions] = useState<VisitQuestion[]>([])
  const [questionsPatientId, setQuestionsPatientId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState<LocalizedText | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [newQuestion, setNewQuestion] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState<{ question: string; answer: string }>({ question: '', answer: '' })
  const demoPatient = isDemoPatientId(patientId)
  const activePatientIdRef = useRef(patientId)
  // render 當下就更新 ref，讓使用者切換病人後，尚未完成的請求／mutation 立即知道自己已過期。
  activePatientIdRef.current = patientId
  const isCurrentPatient = useCallback((mutationPatientId: string) => activePatientIdRef.current === mutationPatientId, [])
  // 用 ref 讀最新的 onChanged：呼叫端多半每次 render 都給新的函式，不能讓它進入讀取 effect 的 deps 造成重讀迴圈。
  const onChangedRef = useRef(onChanged)
  onChangedRef.current = onChanged
  const notifyChanged = useCallback(() => { onChangedRef.current?.() }, [])

  useEffect(() => {
    // 為什麼切換病人要一次清掉所有表單狀態：問題清單、編輯中的草稿與 busy 狀態都屬於上一位病人，不能短暫沿用到下一位。
    setQuestions([])
    setQuestionsPatientId(null)
    setEditingId(null)
    setNewQuestion('')
    setErrorMessage(null)
    setBusyId(null)
    if (demoPatient) { setLoading(false); setQuestionsPatientId(patientId); return }
    let cancelled = false
    setLoading(true)
    listVisitQuestions(patientId)
      .then(rows => { if (!cancelled && isCurrentPatient(patientId)) { setQuestions(rows); setQuestionsPatientId(patientId); setErrorMessage(null) } })
      .catch(error => {
        console.error('[visit questions read error]', error)
        if (!cancelled && isCurrentPatient(patientId)) setErrorMessage({ id: 'Daftar pertanyaan tidak dapat dimuat. Coba lagi nanti.', zh: '問題清單讀取失敗，請稍後再試。', en: 'The question list could not be loaded. Try again later.' })
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [demoPatient, isCurrentPatient, patientId, refreshKey])

  const patientReady = questionsPatientId === patientId
  const patientQuestions = patientReady ? questions : []
  const openQuestions = patientQuestions.filter(item => item.status === 'open')
  const closedQuestions = patientQuestions.filter(item => item.status !== 'open')

  const addQuestion = async (questionText: string) => {
    const trimmed = questionText.trim()
    if (!trimmed) return
    const mutationPatientId = patientId
    setBusyId('new')
    try {
      const saved = await createVisitQuestion({ patientId: mutationPatientId, question: trimmed, sortOrder: nextSortOrder(patientQuestions) })
      if (!isCurrentPatient(mutationPatientId)) return
      setQuestions(current => [...current, saved])
      setNewQuestion('')
      setErrorMessage(null)
      notifyChanged()
    } catch (error) {
      console.error('[visit question create error]', error)
      if (!isCurrentPatient(mutationPatientId)) return
      setErrorMessage({ id: 'Pertanyaan gagal disimpan. Coba lagi nanti.', zh: '問題儲存失敗，請稍後再試。', en: 'The question could not be saved. Try again later.' })
    } finally {
      if (isCurrentPatient(mutationPatientId)) setBusyId(null)
    }
  }

  const openEditForm = (question: VisitQuestion) => {
    setEditingId(question.id)
    setEditDraft({ question: question.question, answer: question.answer ?? '' })
  }

  const closeEditForm = () => { setEditingId(null); setEditDraft({ question: '', answer: '' }) }

  const saveEdit = async (question: VisitQuestion) => {
    const mutationPatientId = patientId
    setBusyId(question.id)
    try {
      const saved = await updateVisitQuestion(question.id, { patientId: mutationPatientId, question: editDraft.question, answer: editDraft.answer })
      if (!isCurrentPatient(mutationPatientId)) return
      setQuestions(current => current.map(item => item.id === saved.id ? saved : item))
      setErrorMessage(null)
      closeEditForm()
      notifyChanged()
    } catch (error) {
      console.error('[visit question update error]', error)
      if (!isCurrentPatient(mutationPatientId)) return
      setErrorMessage({ id: 'Pertanyaan gagal disimpan. Coba lagi nanti.', zh: '問題儲存失敗，請稍後再試。', en: 'The question could not be saved. Try again later.' })
    } finally {
      if (isCurrentPatient(mutationPatientId)) setBusyId(null)
    }
  }

  const changeStatus = async (question: VisitQuestion, status: 'asked' | 'skipped' | 'open') => {
    const mutationPatientId = patientId
    setBusyId(question.id)
    try {
      const saved = await setVisitQuestionStatus(question.id, status)
      if (!isCurrentPatient(mutationPatientId)) return
      setQuestions(current => current.map(item => item.id === saved.id ? saved : item))
      setErrorMessage(null)
      notifyChanged()
    } catch (error) {
      console.error('[visit question status error]', error)
      if (!isCurrentPatient(mutationPatientId)) return
      setErrorMessage({ id: 'Status pertanyaan gagal diperbarui. Coba lagi nanti.', zh: '問題狀態更新失敗，請稍後再試。', en: 'The question status could not be updated. Try again later.' })
    } finally {
      if (isCurrentPatient(mutationPatientId)) setBusyId(null)
    }
  }

  const removeQuestion = async (question: VisitQuestion) => {
    const mutationPatientId = patientId
    setBusyId(question.id)
    try {
      await deleteVisitQuestion(question.id)
      if (!isCurrentPatient(mutationPatientId)) return
      setQuestions(current => current.filter(item => item.id !== question.id))
      setErrorMessage(null)
      notifyChanged()
    } catch (error) {
      console.error('[visit question delete error]', error)
      if (!isCurrentPatient(mutationPatientId)) return
      setErrorMessage({ id: 'Pertanyaan gagal dihapus. Coba lagi nanti.', zh: '問題刪除失敗，請稍後再試。', en: 'The question could not be deleted. Try again later.' })
    } finally {
      if (isCurrentPatient(mutationPatientId)) setBusyId(null)
    }
  }

  return (
    <section className={embedded ? 'text-slate-950' : 'min-h-full bg-slate-50 px-4 pb-8 pt-4 text-slate-950 sm:px-5'}>
      {/* 門診頁自己有「問什麼」標題，嵌入時不再重複頁首；說明句仍保留，讓看診當下的操作提示不消失。 */}
      <header className="mb-4 space-y-1">
        {!embedded && <h2 className="text-lg font-black text-slate-950">{text({ id: 'Pertanyaan untuk dokter', zh: '回診問題清單', en: 'Visit question checklist' })}</h2>}
        <p className="text-sm font-medium leading-6 text-slate-600">{text({ id: 'Kumpulkan pertanyaan sebelum kontrol, lalu catat jawaban dokter di sini.', zh: '回診前先把問題記下來，看診時逐條勾掉並記錄醫師的回答。', en: 'Collect questions before the visit, then tick them off and record the answers here.' })}</p>
      </header>

      {demoPatient && <section className="rounded-3xl border border-dashed border-slate-300 bg-white p-6 text-center shadow-sm">
        <p className="text-sm font-medium leading-6 text-slate-600">{text({ id: 'Daftar pertanyaan belum tersedia di mode demo.', zh: '回診問題清單目前尚未支援展示模式。', en: 'The question checklist is not available in demo mode yet.' })}</p>
      </section>}

      {!demoPatient && <>
        {errorMessage && <p role="alert" className="mb-3 rounded-xl bg-red-50 p-3 text-base font-semibold text-red-700">{text(errorMessage)}</p>}

        <section className="mb-4 rounded-3xl border border-sky-200 bg-sky-50 p-4 shadow-sm">
          <h3 className="text-base font-black text-sky-950">{text({ id: 'Pertanyaan baru', zh: '新增問題', en: 'New question' })}</h3>
          <div className="mt-3 flex flex-wrap gap-2">
            {VISIT_QUESTION_PRESETS.map(preset => (
              <button key={preset.zh} type="button" onClick={() => setNewQuestion(text(preset))} className="min-h-9 rounded-xl border border-sky-300 bg-white px-3 text-xs font-bold text-sky-800 active:bg-sky-100">
                {text(preset)}
              </button>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap items-start gap-2">
            <textarea value={newQuestion} onChange={event => setNewQuestion(event.target.value)} rows={2} className="min-h-11 flex-1 rounded-xl border border-sky-300 bg-white px-3 py-2 text-base font-semibold text-slate-900" placeholder={text({ id: 'Tulis pertanyaan…', zh: '輸入想問的問題…', en: 'Write a question…' })} />
            <button type="button" disabled={busyId === 'new' || !newQuestion.trim() || !patientReady} onClick={() => addQuestion(newQuestion)} className="min-h-11 rounded-2xl bg-sky-700 px-4 text-sm font-black text-white shadow-sm active:bg-sky-900 disabled:opacity-60">
              {text({ id: '+ Tambah', zh: '＋ 新增', en: '＋ Add' })}
            </button>
          </div>
        </section>

        {loading && <p className="py-12 text-center text-base text-gray-500">{text({ id: 'Memuat…', zh: '載入中…', en: 'Loading…' })}</p>}

        {!loading && openQuestions.length === 0 && <section className="rounded-3xl border border-dashed border-slate-300 bg-white p-6 text-center shadow-sm">
          <p className="text-sm font-medium leading-6 text-slate-600">{text({ id: 'Belum ada pertanyaan yang belum ditanyakan.', zh: '目前沒有待問的問題。', en: 'There are no open questions.' })}</p>
        </section>}

        {!loading && openQuestions.length > 0 && <ul className="space-y-3">
          {openQuestions.map(question => (
            <li key={question.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              {editingId === question.id
                ? <div className="space-y-2">
                  <textarea value={editDraft.question} onChange={event => setEditDraft(current => ({ ...current, question: event.target.value }))} rows={2} className="min-h-11 w-full rounded-xl border border-sky-300 bg-white px-3 py-2 text-base font-semibold text-slate-900" />
                  <textarea value={editDraft.answer} onChange={event => setEditDraft(current => ({ ...current, answer: event.target.value }))} rows={2} className="min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-base text-slate-900" placeholder={text({ id: 'Jawaban dokter (opsional)', zh: '醫師的回答（可留白）', en: "Doctor's answer (optional)" })} />
                  <div className="grid grid-cols-2 gap-2">
                    <button type="button" onClick={closeEditForm} className="min-h-10 rounded-xl border border-slate-300 bg-white px-3 text-sm font-black text-slate-700 active:bg-slate-100">{text({ id: 'Batal', zh: '取消', en: 'Cancel' })}</button>
                    <button type="button" disabled={busyId === question.id} onClick={() => saveEdit(question)} className="min-h-10 rounded-xl bg-sky-700 px-3 text-sm font-black text-white active:bg-sky-900 disabled:opacity-60">{text({ id: 'Simpan', zh: '儲存', en: 'Save' })}</button>
                  </div>
                </div>
                : <>
                  <p className="text-base font-black text-slate-900">{question.question}</p>
                  {question.answer && <p className="mt-1 text-sm font-medium text-slate-600">{text({ id: 'Jawaban: ', zh: '回答：', en: 'Answer: ' })}{question.answer}</p>}
                  <p className="mt-1 text-xs font-medium text-slate-400">{text({ id: 'Ditulis oleh: ', zh: '提出者：', en: 'Added by: ' })}{question.created_by_email}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button type="button" disabled={busyId === question.id} onClick={() => openEditForm(question)} className="min-h-9 rounded-xl border border-slate-300 bg-white px-3 text-xs font-black text-slate-700 active:bg-slate-100">{text({ id: 'Ubah', zh: '編輯', en: 'Edit' })}</button>
                    <button type="button" disabled={busyId === question.id} onClick={() => changeStatus(question, 'asked')} className="min-h-9 rounded-xl border border-emerald-300 bg-emerald-50 px-3 text-xs font-black text-emerald-800 active:bg-emerald-100">{text({ id: 'Sudah ditanyakan', zh: '已問', en: 'Asked' })}</button>
                    <button type="button" disabled={busyId === question.id} onClick={() => changeStatus(question, 'skipped')} className="min-h-9 rounded-xl border border-slate-300 bg-white px-3 text-xs font-black text-slate-700 active:bg-slate-100">{text({ id: 'Lewati', zh: '略過', en: 'Skip' })}</button>
                    <button type="button" disabled={busyId === question.id} onClick={() => removeQuestion(question)} className="min-h-9 rounded-xl border border-red-300 bg-red-50 px-3 text-xs font-black text-red-800 active:bg-red-100">{text({ id: 'Hapus', zh: '刪除', en: 'Delete' })}</button>
                  </div>
                </>}
            </li>
          ))}
        </ul>}

        {closedQuestions.length > 0 && <div className="mt-5">
          <h3 className="mb-2 text-sm font-black text-slate-700">{text({ id: 'Riwayat', zh: '已處理', en: 'History' })}</h3>
          <ul className="space-y-2">
            {closedQuestions.map(question => (
              <li key={question.id} className="rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-600">
                <span className="font-bold text-slate-800">{question.question}</span>
                {' · '}{text(VISIT_QUESTION_STATUS_META[question.status].label)}
                {question.answer && <p className="mt-1">{text({ id: 'Jawaban: ', zh: '回答：', en: 'Answer: ' })}{question.answer}</p>}
                <p className="mt-1 text-xs text-slate-400">{text({ id: 'Ditulis oleh: ', zh: '提出者：', en: 'Added by: ' })}{question.created_by_email}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button type="button" disabled={busyId === question.id} onClick={() => openEditForm(question)} className="font-bold text-sky-700 underline">{text({ id: 'Ubah', zh: '編輯', en: 'Edit' })}</button>
                  <button type="button" disabled={busyId === question.id} onClick={() => changeStatus(question, 'open')} className="font-bold text-sky-700 underline">{text({ id: 'Aktifkan lagi', zh: '重新開啟', en: 'Reopen' })}</button>
                </div>
                {editingId === question.id && <div className="mt-2 space-y-2">
                  <textarea value={editDraft.question} onChange={event => setEditDraft(current => ({ ...current, question: event.target.value }))} rows={2} className="min-h-11 w-full rounded-xl border border-sky-300 bg-white px-3 py-2 text-base font-semibold text-slate-900" />
                  <textarea value={editDraft.answer} onChange={event => setEditDraft(current => ({ ...current, answer: event.target.value }))} rows={2} className="min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-base text-slate-900" placeholder={text({ id: 'Jawaban dokter (opsional)', zh: '醫師的回答（可留白）', en: "Doctor's answer (optional)" })} />
                  <div className="grid grid-cols-2 gap-2">
                    <button type="button" onClick={closeEditForm} className="min-h-10 rounded-xl border border-slate-300 bg-white px-3 text-sm font-black text-slate-700 active:bg-slate-100">{text({ id: 'Batal', zh: '取消', en: 'Cancel' })}</button>
                    <button type="button" disabled={busyId === question.id} onClick={() => saveEdit(question)} className="min-h-10 rounded-xl bg-sky-700 px-3 text-sm font-black text-white active:bg-sky-900 disabled:opacity-60">{text({ id: 'Simpan', zh: '儲存', en: 'Save' })}</button>
                  </div>
                </div>}
              </li>
            ))}
          </ul>
        </div>}
      </>}
    </section>
  )
}
