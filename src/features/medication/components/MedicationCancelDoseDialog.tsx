/*
檔案用途：取消單筆服藥打卡前的二次確認視窗，並在確認或取消後把焦點還給原本觸發的藥卡按鈕。
所在層：src/features/medication/components；由 MedicationPage 在照護者點擊已服用藥卡時掛載。
主要關聯：實際的取消寫入（clearMedicationDose）與觸發按鈕的 ref 都留在 MedicationPage，
本元件只呈現對話框、管理自己的開合與內部聚焦，並在關閉時把觸發按鈕的焦點還原。
*/
import { useEffect, useRef, type MutableRefObject } from 'react'
import dayjs from 'dayjs'
import timezone from 'dayjs/plugin/timezone'
import utc from 'dayjs/plugin/utc'
import { CARE_DAY_TIMEZONE } from '../../../lib/careDay'
import { formatMedicationLabel, type MedicationPlanView } from '../../../lib/medication/medications'
import type { MedicationIntakeLog } from '../../../types/database'
import { useI18n } from '../../../lib/i18n'

dayjs.extend(utc)
dayjs.extend(timezone)

export type PendingMedicationCancellation = {
  plan: MedicationPlanView
  doseNumber: number
  existing: MedicationIntakeLog
}

export function MedicationCancelDoseDialog({
  pending,
  busy,
  restoreFocus,
  triggerRef,
  setRestoreFocus,
  onDismiss,
  onConfirm,
}: {
  pending: PendingMedicationCancellation | null
  busy: boolean
  restoreFocus: boolean
  triggerRef: MutableRefObject<HTMLButtonElement | null>
  setRestoreFocus: (value: boolean) => void
  onDismiss: () => void
  onConfirm: () => void
}) {
  const { text } = useI18n()
  const dialogRef = useRef<HTMLDialogElement>(null)
  const dismissButtonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return

    if (pending) {
      // 自訂視窗要把焦點交給「返回」，並讓背景暫時不能操作，避免照護者誤把原生 OK 當成安全操作。
      if (!dialog.open) dialog.showModal()
      dismissButtonRef.current?.focus()
      return
    }

    if (dialog.open) dialog.close()
    if (!restoreFocus || busy) return

    const trigger = triggerRef.current
    // 取消送出後原卡會先被停用；停用按鈕無法接收焦點，必須等同步結束才還原，避免鍵盤使用者失去目前位置。
    if (trigger?.isConnected && !trigger.disabled) trigger.focus()
    triggerRef.current = null
    setRestoreFocus(false)
  }, [busy, pending, restoreFocus, setRestoreFocus, triggerRef])

  return (
    <dialog
      ref={dialogRef}
      onCancel={event => {
        event.preventDefault()
        onDismiss()
      }}
      className="m-auto w-[calc(100%-2.5rem)] max-w-sm rounded-3xl border border-red-200 bg-white p-0 text-slate-900 shadow-2xl backdrop:bg-slate-950/55"
      aria-labelledby="medication-cancellation-title"
      aria-describedby="medication-cancellation-details"
    >
      {pending && <div className="p-6">
        <h2 id="medication-cancellation-title" className="text-xl font-black text-slate-950">{text({ id: 'Batalkan catatan obat?', zh: '取消服藥紀錄？' ,en: 'Cancel medication history?' })}</h2>
        <div id="medication-cancellation-details" className="mt-4 rounded-2xl bg-slate-50 p-4">
          <p className="text-base font-black text-slate-900">{formatMedicationLabel(pending.plan.medication.brand_name, pending.plan.medication.strength_mg, pending.plan.medication.strength_label)}</p>
          <p className="mt-2 text-sm font-medium text-slate-600">{text({ id: `Tercatat diminum pukul ${dayjs(pending.existing.taken_at).tz(CARE_DAY_TIMEZONE).format('HH:mm')}.`, zh: `已記錄於 ${dayjs(pending.existing.taken_at).tz(CARE_DAY_TIMEZONE).format('HH:mm')} 服用。` ,en: `Recorded as taken at ${dayjs(pending.existing.taken_at).tz(CARE_DAY_TIMEZONE).format('HH:mm')}.` })}</p>
        </div>
        <div className="mt-6 grid grid-cols-[.9fr_1.1fr] gap-3">
          <button ref={dismissButtonRef} type="button" onClick={onDismiss} className="min-h-14 rounded-2xl border border-slate-300 bg-white px-4 text-base font-black text-slate-700 active:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600 focus-visible:ring-offset-2">
            {text({ id: 'Kembali', zh: '返回' ,en: 'Back' })}
          </button>
          <button type="button" onClick={onConfirm} className="min-h-14 whitespace-nowrap rounded-2xl bg-red-700 px-4 text-base font-black text-white shadow-sm active:bg-red-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-700 focus-visible:ring-offset-2">
            {text({ id: 'Batalkan catatan', zh: '取消紀錄' ,en: 'Cancel History' })}
          </button>
        </div>
      </div>}
    </dialog>
  )
}
