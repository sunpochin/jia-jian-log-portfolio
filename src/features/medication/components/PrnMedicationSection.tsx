/*
檔案用途：顯示需要時服用藥物的每日狀態、使用事件與記錄／作廢流程。
所在層：src/features/medication/components；由 MedicationPage 放在固定藥工作區之後。
主要關聯：使用 prnMedication 的事件語意、MedicationAppearance 與雙語 i18n，不參與 routine 進度計算。
*/
import { useEffect, useMemo, useRef, useState } from 'react'
import dayjs from 'dayjs'
import timezone from 'dayjs/plugin/timezone'
import utc from 'dayjs/plugin/utc'
import { CARE_DAY_TIMEZONE } from '../../../lib/careDay'
import { createPrnEventId, formatPrnEffectStatus, getActivePrnEvents, getPrnDailyStatus, prnDoseUnitForDosageForm, prnEventLocalDateTime, type SavePrnMedicationEventInput } from '../../../lib/prnMedication'
import { formatMedicationDisplayName, formatMedicationLabel, type MedicationPlanView } from '../../../lib/medications'
import type { PrnMedicationAssessmentStatus, PrnMedicationDailyAssessment, PrnMedicationEffectStatus, PrnMedicationEvent } from '../../../types/database'
import { common, useI18n, type LocalizedText, type Locale } from '../../../lib/i18n'
import { MedicationAppearance } from './MedicationAppearance'

dayjs.extend(utc)
dayjs.extend(timezone)

type RecordForm = {
  doseAmount: number
  doseUnit: string
  reason: string
  effectStatus: PrnMedicationEffectStatus
  notes: string
  takenAt: string
}

type PrnMedicationSectionProps = {
  plans: MedicationPlanView[]
  events: PrnMedicationEvent[]
  assessments: PrnMedicationDailyAssessment[]
  careDate: string
  onRecord: (input: SavePrnMedicationEventInput) => Promise<void>
  onVoid: (event: PrnMedicationEvent, reason: string) => Promise<void>
  onAssessEffect: (event: PrnMedicationEvent, effectStatus: PrnMedicationEffectStatus) => Promise<void>
  onAssess: (planId: string, status: PrnMedicationAssessmentStatus) => Promise<void>
}

function doseUnitLabel(unit: string, locale: Locale) {
  if (locale === 'zh') return unit === 'capsule' ? '膠囊' : unit === 'dose' ? '份' : unit === 'ml' ? '毫升' : unit === 'sachet' ? '包' : unit === 'tablet' ? '錠' : unit
  return unit === 'capsule' ? 'kapsul' : unit === 'dose' ? 'dosis' : unit === 'ml' ? 'ml' : unit === 'sachet' ? 'sachet' : unit === 'tablet' ? 'tablet' : unit
}

const formErrorCopy = (error: unknown): LocalizedText => {
  const message = error instanceof Error ? error.message : ''
  if (message.includes('outside the selected care day')) return { id: 'Waktu penggunaan berada di luar hari perawatan yang dipilih.', zh: '實際使用時間不在所選照護日，請核對日期與時間。', en: 'The actual time of use is not on the selected day of care, please check the date and time.' }
  if (message.includes('reason')) return { id: 'Masukkan alasan atau gejala sebelum menyimpan.', zh: '請先填寫使用原因或症狀。', en: 'Enter reason or symptoms senot yet saving.' }
  return { id: 'Gagal menyimpan catatan PRN. Periksa internet lalu coba lagi.', zh: 'PRN 紀錄儲存失敗，請確認網路後再試。', en: 'PRN record save failed, please check your network and try again.' }
}

export function PrnMedicationSection({ plans, events, assessments, careDate, onRecord, onVoid, onAssessEffect, onAssess }: PrnMedicationSectionProps) {
  const { locale, text } = useI18n()
  const [recordingPlan, setRecordingPlan] = useState<MedicationPlanView | null>(null)
  const [recordForm, setRecordForm] = useState<RecordForm | null>(null)
  const [recordEventId, setRecordEventId] = useState('')
  const [voidTarget, setVoidTarget] = useState<PrnMedicationEvent | null>(null)
  const [voidReason, setVoidReason] = useState('')
  const [formError, setFormError] = useState<LocalizedText | null>(null)
  const [sectionError, setSectionError] = useState<LocalizedText | null>(null)
  const [busyKey, setBusyKey] = useState('')
  const recordDialogRef = useRef<HTMLDialogElement>(null)
  const voidDialogRef = useRef<HTMLDialogElement>(null)

  const activeEventCount = useMemo(() => events.filter(event => event.status === 'active').length, [events])

  useEffect(() => {
    const dialog = recordDialogRef.current
    if (!dialog) return
    if (recordingPlan && recordForm) {
      if (!dialog.open) dialog.showModal()
    } else if (dialog.open) dialog.close()
  }, [recordForm, recordingPlan])

  useEffect(() => {
    const dialog = voidDialogRef.current
    if (!dialog) return
    if (voidTarget) {
      if (!dialog.open) dialog.showModal()
    } else if (dialog.open) dialog.close()
  }, [voidTarget])

  if (plans.length === 0) return null

  const openRecordForm = (plan: MedicationPlanView) => {
    setRecordingPlan(plan)
    setRecordEventId(createPrnEventId())
    setRecordForm({
      doseAmount: plan.dose_amount,
      doseUnit: prnDoseUnitForDosageForm(plan.medication.dosage_form),
      reason: '',
      effectStatus: 'pending',
      notes: '',
      takenAt: prnEventLocalDateTime(),
    })
    setFormError(null)
  }

  const submitRecord = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!recordingPlan || !recordForm || busyKey) return
    const key = `record:${recordingPlan.id}`
    setBusyKey(key)
    setFormError(null)
    try {
      await onRecord({ plan: recordingPlan, careDate, recordedByEmail: '', idempotencyKey: recordEventId, ...recordForm })
      setRecordingPlan(null)
      setRecordForm(null)
    } catch (error) {
      console.error('[PRN event save error]', error)
      setFormError(formErrorCopy(error))
    } finally {
      setBusyKey(current => current === key ? '' : current)
    }
  }

  const submitVoid = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!voidTarget || !voidReason.trim() || busyKey) return
    const key = `void:${voidTarget.id}`
    setBusyKey(key)
    setFormError(null)
    try {
      await onVoid(voidTarget, voidReason)
      setVoidTarget(null)
      setVoidReason('')
    } catch (error) {
      console.error('[PRN event void error]', error)
      setFormError(formErrorCopy(error))
    } finally {
      setBusyKey(current => current === key ? '' : current)
    }
  }

  const setAssessment = async (planId: string, status: PrnMedicationAssessmentStatus) => {
    const key = `assessment:${planId}`
    setBusyKey(key)
    setFormError(null)
    setSectionError(null)
    try {
      await onAssess(planId, status)
    } catch (error) {
      console.error('[PRN assessment save error]', error)
      setSectionError(formErrorCopy(error))
    } finally {
      setBusyKey(current => current === key ? '' : current)
    }
  }

  const setEffect = async (event: PrnMedicationEvent, effectStatus: PrnMedicationEffectStatus) => {
    const key = `effect:${event.id}`
    setBusyKey(key)
    setSectionError(null)
    try {
      await onAssessEffect(event, effectStatus)
    } catch (error) {
      console.error('[PRN effect assessment error]', error)
      setSectionError(formErrorCopy(error))
    } finally {
      setBusyKey(current => current === key ? '' : current)
    }
  }

  return (
    <section className="space-y-4 rounded-3xl border border-violet-200 bg-violet-50 p-4 shadow-sm" aria-labelledby="prn-medication-title">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-bold text-violet-800">{text({ id: 'Obat bila perlu (PRN)', zh: '需要時服用（PRN）', en: 'Medication bila perlu (PRN)' })}</p>
          <h2 id="prn-medication-title" className="mt-1 text-xl font-black text-violet-950">{text({ id: 'Catatan penggunaan terpisah', zh: '獨立使用紀錄', en: 'Separate usage history' })}</h2>
          <p className="mt-2 text-sm font-medium leading-6 text-violet-900">{text({ id: 'Jumlah dan waktu diambil dari kejadian penggunaan yang benar-benar dicatat.', zh: '使用次數與時間只來自實際記錄的使用事件。', en: 'Usage counts and times are based on actual recorded usage events only.' })}</p>
        </div>
        <span className="shrink-0 rounded-full bg-white px-3 py-1 text-sm font-black tabular-nums text-violet-900">{activeEventCount} {text({ id: 'kali', zh: '次', en: 'times' })}</span>
      </div>
      <p className="rounded-2xl border border-violet-200 bg-white/70 p-3 text-sm font-semibold leading-6 text-violet-950">
        {text({ id: 'Periksa label obat atau instruksi dokter sebelum setiap penggunaan. Aplikasi tidak menghitung waktu penggunaan berikutnya atau batas dosis.', zh: '每次使用前請核對藥袋或醫囑；系統不會計算下次使用時間或最大劑量。', en: 'Check the bag or order before each use; the system will not calculate the time of the next use or the maximum dose.' })}
      </p>
      {sectionError && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-700">{text(sectionError)}</p>}

      <div className="space-y-3">
        {plans.map(plan => {
          const planEvents = events.filter(event => event.plan_id === plan.id).sort((left, right) => Date.parse(right.taken_at) - Date.parse(left.taken_at))
          const activeEvents = getActivePrnEvents(plan.id, events)
          const status = getPrnDailyStatus(plan.id, events, assessments)
          const assessmentBusy = busyKey === `assessment:${plan.id}`
          return (
            <article key={plan.id} className="rounded-2xl border border-violet-200 bg-white p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="text-lg font-black text-slate-950">{formatMedicationDisplayName(plan.medication, locale)}</h3>
                  <MedicationAppearance
                    medication={plan.medication}
                    showAppearanceNote={false}
                    details={`${formatMedicationLabel(plan.medication.brand_name, plan.medication.strength_mg, plan.medication.strength_label)} · ${plan.dose_amount} ${doseUnitLabel(prnDoseUnitForDosageForm(plan.medication.dosage_form), locale)}`}
                  />
                </div>
                <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-black ${status === 'used' ? 'bg-emerald-100 text-emerald-900' : status === 'not_needed' ? 'bg-slate-100 text-slate-700' : 'bg-violet-100 text-violet-900'}`}>
                  {status === 'used'
                    ? text({ id: `${activeEvents.length} kali hari ini · terakhir ${dayjs(activeEvents[0].taken_at).tz(CARE_DAY_TIMEZONE).format('HH:mm')}`, zh: `今天 ${activeEvents.length} 次・最後 ${dayjs(activeEvents[0].taken_at).tz(CARE_DAY_TIMEZONE).format('HH:mm')}`, en: `${activeEvents.length} uses today · last at ${dayjs(activeEvents[0].taken_at).tz(CARE_DAY_TIMEZONE).format('HH:mm')}` })
                    : status === 'not_needed'
                      ? text({ id: 'Tidak diperlukan', zh: '今天未需要', en: 'Not required today' })
                      : text({ id: 'Belum dinilai', zh: '尚未評估', en: 'Not yet evaluated' })}
                </span>
              </div>

              {status === 'not_assessed' && <p className="mt-3 rounded-xl bg-slate-50 p-3 text-sm font-semibold text-slate-700">{text({ id: 'Belum ada catatan apakah obat ini diperlukan hari ini.', zh: '目前沒有記錄今天是否需要使用；空白不代表不需要。', en: 'No record yet indicates whether this medication is needed today.' })}</p>}
              {status === 'not_needed' && <p className="mt-3 rounded-xl bg-slate-50 p-3 text-sm font-semibold text-slate-700">{text({ id: 'Ditandai tidak diperlukan hari ini.', zh: '已獨立標記今天未需要。', en: 'Separately flagged as not required today.' })}</p>}

              <div className="mt-3 space-y-2">
                {planEvents.map(item => {
                  const effect = formatPrnEffectStatus(item.effect_status)
                  return (
                    <div key={item.id} className={`rounded-xl border p-3 ${item.status === 'active' ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200 bg-slate-100 opacity-75'}`}>
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-black text-slate-900">
                          {dayjs(item.taken_at).tz(CARE_DAY_TIMEZONE).format('HH:mm')} · {item.dose_amount} {doseUnitLabel(item.dose_unit, locale)} · {text(effect)}
                        </p>
                        {item.status === 'active'
                          ? <button type="button" disabled={Boolean(busyKey)} onClick={() => { setVoidTarget(item); setVoidReason(''); setFormError(null) }} className="shrink-0 text-xs font-black text-red-700 underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600">{text({ id: 'Batalkan', zh: '作廢', en: 'Void' })}</button>
                          : <span className="shrink-0 text-xs font-black text-slate-600">{text({ id: 'Dibatalkan', zh: '已作廢', en: 'Voided' })}</span>}
                      </div>
                      <p className="mt-1 text-sm text-slate-700">{item.reason}</p>
                      {item.status === 'active' && <label className="mt-2 block text-xs font-bold text-slate-700">{text({ id: 'Penilaian efek', zh: '效果評估', en: 'Effect Evaluation' })}
                        <select value={item.effect_status} disabled={Boolean(busyKey)} onChange={event => void setEffect(item, event.target.value as PrnMedicationEffectStatus)} className="mt-1 min-h-10 w-full rounded-lg border border-slate-300 bg-white px-2 text-sm font-bold">
                          {(['pending', 'helped', 'not_helped', 'unknown'] as const).map(status => <option key={status} value={status}>{text(formatPrnEffectStatus(status))}</option>)}
                        </select>
                      </label>}
                      {item.notes && <p className="mt-1 text-xs font-medium text-slate-600">{text({ id: 'Catatan', zh: '備註', en: 'Note' })}：{item.notes}</p>}
                      {item.status === 'voided' && item.void_reason && <p className="mt-1 text-xs font-medium text-red-800">{text({ id: 'Alasan pembatalan', zh: '作廢原因', en: 'Reason for voiding' })}：{item.void_reason}</p>}
                    </div>
                  )
                })}
              </div>

              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                <button type="button" disabled={Boolean(busyKey)} onClick={() => openRecordForm(plan)} className="min-h-12 rounded-xl bg-violet-700 px-4 text-base font-black text-white shadow-sm active:bg-violet-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-600 focus-visible:ring-offset-2">
                  {text({ id: 'Catat penggunaan', zh: '記錄使用', en: 'Catat use' })}
                </button>
                {status === 'not_needed'
                  ? <button type="button" disabled={Boolean(busyKey)} onClick={() => void setAssessment(plan.id, 'not_assessed')} className="min-h-12 rounded-xl border border-slate-300 bg-white px-4 text-sm font-black text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-600 focus-visible:ring-offset-2">{assessmentBusy ? text(common.loading) : text({ id: 'Kembalikan ke belum dinilai', zh: '恢復為尚未評估', en: 'Revert to Not Evaluated' })}</button>
                  : status === 'not_assessed' && <button type="button" disabled={Boolean(busyKey)} onClick={() => void setAssessment(plan.id, 'not_needed')} className="min-h-12 rounded-xl border border-violet-300 bg-white px-4 text-sm font-black text-violet-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-600 focus-visible:ring-offset-2">{assessmentBusy ? text(common.loading) : text({ id: 'Tandai tidak diperlukan hari ini', zh: '標記今天未需要', en: 'Flag not required today' })}</button>}
              </div>
            </article>
          )
        })}
      </div>

      <dialog ref={recordDialogRef} onCancel={event => { event.preventDefault(); if (!busyKey.startsWith('record:')) { setRecordingPlan(null); setRecordForm(null) } }} className="m-auto w-[calc(100%-2rem)] max-w-lg rounded-3xl border border-violet-200 bg-white p-0 text-slate-900 shadow-2xl backdrop:bg-slate-950/55" aria-labelledby="prn-record-title">
        {recordingPlan && recordForm && <form method="dialog" onSubmit={submitRecord} className="p-6">
          <h2 id="prn-record-title" className="text-xl font-black text-violet-950">{text({ id: 'Catat penggunaan PRN', zh: '記錄 PRN 使用', en: 'Catat use PRN' })}</h2>
          <p className="mt-2 text-sm font-semibold text-slate-700">{formatMedicationDisplayName(recordingPlan.medication, locale)} · {text({ id: 'Periksa label obat atau instruksi dokter.', zh: '請核對藥袋或醫囑。', en: 'Periksa label medication or instructions doctor.' })}</p>
          <div className="mt-5 space-y-4">
            <label className="block text-sm font-black">{text({ id: 'Waktu penggunaan sebenarnya', zh: '實際使用時間', en: 'Actual time of use' })}
              <input required type="datetime-local" value={recordForm.takenAt} onChange={event => setRecordForm(current => current ? { ...current, takenAt: event.target.value } : current)} className="mt-2 min-h-12 w-full rounded-xl border border-slate-300 px-3 text-base font-bold focus:border-violet-600 focus:outline-none focus:ring-2 focus:ring-violet-200" />
            </label>
            <label className="block text-sm font-black">{text({ id: 'Jumlah sebenarnya', zh: '實際使用量', en: 'Actual usage' })}
              <span className="mt-2 flex items-center gap-2"><input required min="0.001" step="0.001" type="number" value={recordForm.doseAmount} onChange={event => setRecordForm(current => current ? { ...current, doseAmount: Number(event.target.value) } : current)} className="min-h-12 w-full rounded-xl border border-slate-300 px-3 text-base font-bold focus:border-violet-600 focus:outline-none focus:ring-2 focus:ring-violet-200" /><span className="shrink-0 text-sm font-black text-slate-600">{doseUnitLabel(recordForm.doseUnit, locale)}</span></span>
            </label>
            <label className="block text-sm font-black">{text({ id: 'Alasan atau gejala', zh: '使用原因或症狀', en: 'Causes or symptoms of use' })}
              <textarea required value={recordForm.reason} onChange={event => setRecordForm(current => current ? { ...current, reason: event.target.value } : current)} rows={2} className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-3 text-base font-medium focus:border-violet-600 focus:outline-none focus:ring-2 focus:ring-violet-200" />
            </label>
            <label className="block text-sm font-black">{text({ id: 'Efek / penilaian sementara', zh: '效果／目前評估', en: 'Effectiveness/Current Evaluation' })}
              <select value={recordForm.effectStatus} onChange={event => setRecordForm(current => current ? { ...current, effectStatus: event.target.value as PrnMedicationEffectStatus } : current)} className="mt-2 min-h-12 w-full rounded-xl border border-slate-300 bg-white px-3 text-base font-bold focus:border-violet-600 focus:outline-none focus:ring-2 focus:ring-violet-200">
                {(['pending', 'helped', 'not_helped', 'unknown'] as const).map(status => <option key={status} value={status}>{text(formatPrnEffectStatus(status))}</option>)}
              </select>
            </label>
            <label className="block text-sm font-black">{text({ id: 'Catatan (opsional)', zh: '備註（選填）', en: 'Note (optional)' })}
              <textarea value={recordForm.notes} onChange={event => setRecordForm(current => current ? { ...current, notes: event.target.value } : current)} rows={2} className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-3 text-base font-medium focus:border-violet-600 focus:outline-none focus:ring-2 focus:ring-violet-200" />
            </label>
          </div>
          {formError && <p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-700">{text(formError)}</p>}
          <p className="mt-4 text-xs font-semibold leading-5 text-slate-600">{text({ id: 'Catatan ini menyimpan kejadian penggunaan; aplikasi tidak memberi saran medis atau menghitung dosis berikutnya.', zh: '這會保存實際使用事件；系統不提供醫療建議，也不計算下次劑量。', en: 'Record this saving kejadian use; app not memberi saran medis or menghitung dose next.' })}</p>
          <div className="mt-6 grid grid-cols-[.8fr_1.2fr] gap-3">
            <button type="button" disabled={busyKey.startsWith('record:')} onClick={() => { setRecordingPlan(null); setRecordForm(null) }} className="min-h-14 rounded-2xl border border-slate-300 bg-white px-4 text-base font-black text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-600">{text({ id: 'Kembali', zh: '返回', en: 'Back' })}</button>
            <button type="submit" disabled={Boolean(busyKey)} className="min-h-14 rounded-2xl bg-violet-700 px-4 text-base font-black text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-600 focus-visible:ring-offset-2">{busyKey.startsWith('record:') ? text({ id: 'Menyimpan…', zh: '儲存中…', en: 'Saving...' }) : text({ id: 'Simpan catatan', zh: '儲存紀錄', en: 'Save Recording' })}</button>
          </div>
        </form>}
      </dialog>

      <dialog ref={voidDialogRef} onCancel={event => { event.preventDefault(); setVoidTarget(null) }} className="m-auto w-[calc(100%-2rem)] max-w-md rounded-3xl border border-red-200 bg-white p-0 text-slate-900 shadow-2xl backdrop:bg-slate-950/55" aria-labelledby="prn-void-title">
        {voidTarget && <form method="dialog" onSubmit={submitVoid} className="p-6">
          <h2 id="prn-void-title" className="text-xl font-black text-red-900">{text({ id: 'Batalkan catatan PRN?', zh: '作廢這筆 PRN 紀錄？', en: 'Void this PRN record?' })}</h2>
          <p className="mt-3 text-sm font-semibold leading-6 text-slate-700">{dayjs(voidTarget.taken_at).tz(CARE_DAY_TIMEZONE).format('YYYY-MM-DD HH:mm')} · {voidTarget.dose_amount} {doseUnitLabel(voidTarget.dose_unit, locale)}</p>
          <label className="mt-4 block text-sm font-black">{text({ id: 'Alasan pembatalan', zh: '作廢原因', en: 'Reason for voiding' })}
            <textarea required value={voidReason} onChange={event => setVoidReason(event.target.value)} rows={3} className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-3 text-base font-medium focus:border-red-600 focus:outline-none focus:ring-2 focus:ring-red-200" />
          </label>
          {formError && <p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-700">{text(formError)}</p>}
          <p className="mt-4 text-xs font-semibold leading-5 text-slate-600">{text({ id: 'Catatan lama akan tetap terlihat sebagai dibatalkan; buat catatan baru jika perlu mencatat penggunaan yang benar.', zh: '原紀錄會保留為已作廢；若需更正，請另外建立新使用紀錄。', en: 'The original record will be retained as obsolete; if you need to correct it, please create a new usage record.' })}</p>
          <div className="mt-6 grid grid-cols-[.8fr_1.2fr] gap-3">
            <button type="button" onClick={() => setVoidTarget(null)} className="min-h-14 rounded-2xl border border-slate-300 bg-white px-4 text-base font-black text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600">{text({ id: 'Kembali', zh: '返回', en: 'Back' })}</button>
            <button type="submit" disabled={Boolean(busyKey)} className="min-h-14 rounded-2xl bg-red-700 px-4 text-base font-black text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-700 focus-visible:ring-offset-2">{busyKey.startsWith('void:') ? text({ id: 'Membatalkan…', zh: '作廢中…', en: 'Voiding...' }) : text({ id: 'Batalkan catatan', zh: '作廢紀錄', en: 'Retire Record' })}</button>
          </div>
        </form>}
      </dialog>
    </section>
  )
}
