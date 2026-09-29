/*
檔案用途：服藥打卡整個時段完成時彈出的慶祝提示卡，並負責把焦點交給「知道了」按鈕。
所在層：src/features/medication/components；由 MedicationPage 在完成某個時段所有必吃劑量時掛載。
主要關聯：完成文案沿用 medicationSlotCompletionText（lib/medication/medicationSchedule）；
提示是否顯示、要顯示哪個時段由 MedicationPage 的 completedSlotPrompt 狀態決定，本元件只負責呈現與關閉。
*/
import { useEffect, useRef } from 'react'
import { medicationSlotCompletionText } from '../../../lib/medication/medicationSchedule'
import { useI18n } from '../../../lib/i18n'

export function MedicationCompletionDialog({ slot, slotsExpandedByDefault, onDismiss }: {
  slot: string | null
  slotsExpandedByDefault: boolean
  onDismiss: () => void
}) {
  const { text } = useI18n()
  const dismissButtonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    // 提示必須把焦點放在「知道了」，讓鍵盤與螢幕閱讀器使用者不必回頭尋找剛跳出的完成訊息。
    if (slot) dismissButtonRef.current?.focus()
  }, [slot])

  const completionCopy = slot ? medicationSlotCompletionText(slot) : null
  if (!slot || !completionCopy) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-emerald-950/40 p-5" role="dialog" aria-modal="true" aria-labelledby="medication-completion-title">
      <div className="w-full max-w-sm rounded-3xl bg-white p-6 text-center shadow-2xl">
        <span aria-hidden="true" className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-emerald-600 text-5xl font-black text-white">✓</span>
        <h2 id="medication-completion-title" className="mt-5 text-2xl font-black text-emerald-900">{text(completionCopy.title)}</h2>
        <p className="mt-3 text-lg font-bold text-gray-700">{text(completionCopy.description)}</p>
        <p className="mt-2 text-sm text-gray-500">{text(slotsExpandedByDefault
          ? { id: 'Jika ingin memeriksa atau membatalkan catatan, langsung ketuk kartu obat di bawah.', zh: '若要查看或取消紀錄，請直接點擊下方藥品卡。' ,en: 'To view or cancel a record, tap the medication card below directly.' }
          : { id: 'Jika ingin memeriksa atau membatalkan catatan, ketuk bagian waktu makan tersebut.', zh: '若要查看或取消紀錄，請點選該服藥時段。' ,en: 'To view or cancel a record, tap that medication time slot.' })}</p>
        <button ref={dismissButtonRef} type="button" onClick={onDismiss} className="mt-6 min-h-14 w-full rounded-2xl bg-emerald-700 px-4 text-lg font-black text-white shadow-sm active:bg-emerald-800">
          {text({ id: 'Baik', zh: '知道了' ,en: 'Got it' })}
        </button>
      </div>
    </div>
  )
}
