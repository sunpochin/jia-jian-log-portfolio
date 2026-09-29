/*
檔案用途：服用方式 B 層的填寫入口——chip 多選代碼、來源下拉、交代日期、200 字備註，直接讀寫 patient_medication_instructions。
所在層：src/features/medication/components；由 PlanFields 掛載，只在已確認的病人專屬藥品（有 medicationId）時顯示，
不放進會覆寫跨病人共用目錄的「修正藥品資料」fieldset。
主要關聯：src/lib/medication/medicationInstructions.ts 的 MEDICATION_INSTRUCTION_CODES／SOURCE_LABELS／
readPatientMedicationInstructions／savePatientMedicationInstruction／clearPatientMedicationInstruction。
*/
import { useEffect, useState } from 'react'
import dayjs from 'dayjs'
import { useI18n } from '../../../lib/i18n'
import { useSaveStatus } from '../../../hooks/useSaveStatus'
import {
  MEDICATION_INSTRUCTION_CODES,
  MEDICATION_INSTRUCTION_NOTE_MAX_LENGTH,
  SOURCE_LABELS,
  clearPatientMedicationInstruction,
  readPatientMedicationInstructions,
  savePatientMedicationInstruction,
} from '../../../lib/medication/medicationInstructions'
import type { PatientMedicationInstructionSource } from '../../../types/database'

const TODAY = () => dayjs().format('YYYY-MM-DD')

export function MedicationInstructionEditor({ patientId, medicationId, onChanged }: { patientId: string; medicationId: string; onChanged?: () => void }) {
  const { text } = useI18n()
  const [loading, setLoading] = useState(true)
  // 讀取失敗時完全不渲染可寫欄位（見下方 return），避免照護者在看不到既有紀錄的情況下，
  // 把殘留在欄位裡、其實屬於另一顆藥的舊代碼／備註存成這顆藥的服用方式。
  const [loadError, setLoadError] = useState(false)
  const [codes, setCodes] = useState<string[]>([])
  const [source, setSource] = useState<PatientMedicationInstructionSource>('pharmacist')
  const [confirmedOn, setConfirmedOn] = useState(TODAY)
  const [note, setNote] = useState('')
  const [hasExisting, setHasExisting] = useState(false)
  // 讀取狀態（loading／loadError）與送出狀態分開管理，符合 AGENTS.md Rule C；
  // 送出狀態統一交給 useSaveStatus，不再自己重造 saving／message 樣板（Rule B）。
  const { status, message, begin, succeed, fail, reset } = useSaveStatus()

  // 換藥或換病人時要重新讀一次現有紀錄；先同步清空欄位再讀取，讀取完成前後都不會殘留上一顆藥的資料。
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setLoadError(false)
    setCodes([])
    setSource('pharmacist')
    setConfirmedOn(TODAY())
    setNote('')
    setHasExisting(false)
    reset()
    readPatientMedicationInstructions(patientId)
      .then(instructions => {
        if (cancelled) return
        const existing = instructions.find(instruction => instruction.medication_id === medicationId)
        if (existing) {
          setCodes(existing.instruction_codes)
          setSource(existing.source)
          setConfirmedOn(existing.confirmed_on)
          setNote(existing.instruction_note ?? '')
          setHasExisting(true)
        }
      })
      .catch(error => {
        console.error('[medication instruction load error]', error)
        if (!cancelled) setLoadError(true)
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patientId, medicationId])

  const toggleCode = (code: string) => {
    setCodes(current => current.includes(code) ? current.filter(item => item !== code) : [...current, code])
  }

  const handleSave = async () => {
    // 一個代碼都沒勾、備註也是空的，不是一筆有意義的紀錄；存進去會讓 MedicationIntakeGuidance
    // 誤判成「已有服用方式紀錄」卻顯示不出任何內容，比「尚未有紀錄」更誤導。
    if (codes.length === 0 && note.trim().length === 0) {
      fail(text({ id: 'Pilih minimal satu kode atau isi catatan sebelum menyimpan.', zh: '請至少勾選一個代碼或填寫備註後再儲存。', en: 'Select at least one code or add a note before saving.' }))
      return
    }
    begin()
    try {
      await savePatientMedicationInstruction({ patientId, medicationId, instructionCodes: codes, instructionNote: note, source, confirmedOn })
      setHasExisting(true)
      succeed(text({ id: 'Cara minum berhasil disimpan.', zh: '服用方式已儲存。', en: 'Intake instructions saved.' }))
      // 服藥打卡卡片與每週藥單的 plans 是掛載時讀進來的快照；沒有這個通知，
      // 剛存好的服用方式要等下一次無關的藥單異動或整頁重新整理才會出現。
      onChanged?.()
    } catch (error) {
      console.error('[medication instruction save error]', error)
      fail(text({ id: 'Gagal menyimpan cara minum.', zh: '服用方式儲存失敗，請稍後再試。', en: 'Failed to save intake instructions, please try again.' }))
    }
  }

  const handleClear = async () => {
    begin()
    try {
      await clearPatientMedicationInstruction(patientId, medicationId)
      setCodes([])
      setNote('')
      setHasExisting(false)
      succeed(text({ id: 'Catatan cara minum telah dihapus.', zh: '服用方式紀錄已清除。', en: 'Intake instructions cleared.' }))
      onChanged?.()
    } catch (error) {
      console.error('[medication instruction clear error]', error)
      fail(text({ id: 'Gagal menghapus catatan.', zh: '清除紀錄失敗，請稍後再試。', en: 'Failed to clear instructions, please try again.' }))
    }
  }

  const saving = status === 'saving'

  return (
    <fieldset className="rounded-xl border border-sky-200 bg-sky-50/60 p-2.5">
      <legend className="px-1 text-xs font-bold text-sky-900">
        {text({ id: 'Cara minum (dicatat khusus untuk orang ini)', zh: '服用方式（僅屬於這位病人的紀錄）', en: 'Intake instructions (specific to this patient)' })}
      </legend>
      {loading
        ? <p role="status" className="mt-1.5 text-xs font-semibold text-sky-800">{text({ id: 'Memuat…', zh: '讀取中…', en: 'Loading…' })}</p>
        : loadError
        // 讀取失敗完全不顯示表單欄位：沒有既有值可比對時，任何存檔都可能把上一顆藥的資料誤存到這顆藥上。
        ? <p role="alert" className="mt-1.5 text-xs font-semibold text-red-700">{text({ id: 'Gagal memuat cara minum. Muat ulang halaman lalu coba lagi.', zh: '服用方式讀取失敗，請重新整理頁面後再試。', en: 'Failed to load intake instructions. Reload the page and try again.' })}</p>
        : <div className="mt-1.5 space-y-2">
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
              {MEDICATION_INSTRUCTION_CODES.map(([code, label]) => {
                const isSelected = codes.includes(code)
                return (
                  <button
                    key={code}
                    type="button"
                    aria-pressed={isSelected}
                    onClick={() => toggleCode(code)}
                    className={`min-h-11 rounded-xl border px-2 py-1.5 text-left text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600 focus-visible:ring-offset-1 ${
                      isSelected ? 'border-sky-700 bg-sky-700 font-bold text-white shadow-sm' : 'border-slate-200 bg-white text-slate-800 hover:border-sky-300'
                    }`}
                  >
                    {isSelected ? '✓ ' : ''}{text(label)}
                  </button>
                )
              })}
            </div>

            <label className="block text-xs font-bold text-sky-900">
              {text({ id: 'Siapa yang menyampaikan', zh: '誰交代的', en: 'Who told you this' })}
              <select
                value={source}
                onChange={event => setSource(event.target.value as PatientMedicationInstructionSource)}
                className="mt-1 min-h-11 w-full rounded-xl border border-sky-200 bg-white p-2 text-sm font-normal focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-200"
              >
                {SOURCE_LABELS.map(([value, label]) => <option key={value} value={value}>{text(label)}</option>)}
              </select>
            </label>

            <label className="block text-xs font-bold text-sky-900">
              {text({ id: 'Tanggal disampaikan', zh: '交代日期', en: 'Date confirmed' })}
              <input
                type="date"
                value={confirmedOn}
                onChange={event => setConfirmedOn(event.target.value)}
                className="mt-1 min-h-11 w-full rounded-xl border border-sky-200 bg-white p-2 text-sm font-normal focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-200"
              />
            </label>

            <label className="block text-xs font-bold text-sky-900">
              {text({ id: 'Catatan tambahan (opsional)', zh: '備註（可不填）', en: 'Additional note (optional)' })}
              <textarea
                value={note}
                onChange={event => setNote(event.target.value)}
                maxLength={MEDICATION_INSTRUCTION_NOTE_MAX_LENGTH}
                rows={2}
                placeholder={text({ id: 'Contoh: gerus hanya saat sulit menelan', zh: '例如：只有吞不下時才磨粉' ,en: 'Example: only crush when hard to swallow' })}
                className="mt-1 w-full rounded-xl border border-sky-200 p-2 text-sm font-normal focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-200"
              />
            </label>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={saving}
                onClick={() => void handleSave()}
                className="min-h-10 rounded-xl bg-sky-700 px-3 py-2 text-xs font-bold text-white transition-colors hover:bg-sky-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600 focus-visible:ring-offset-2 disabled:opacity-50"
              >
                {text({ id: 'Simpan cara minum', zh: '儲存服用方式', en: 'Save intake instructions' })}
              </button>
              {hasExisting && <button
                type="button"
                disabled={saving}
                onClick={() => void handleClear()}
                className="min-h-10 rounded-xl border border-red-200 bg-white px-3 py-2 text-xs font-bold text-red-700 transition-colors hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 focus-visible:ring-offset-2 disabled:opacity-50"
              >
                {text({ id: 'Hapus catatan', zh: '清除紀錄', en: 'Clear record' })}
              </button>}
            </div>
            {message && <p role="status" className={`text-xs font-semibold ${status === 'err' ? 'text-red-700' : 'text-sky-900'}`}>{message}</p>}
          </div>}
    </fieldset>
  )
}
