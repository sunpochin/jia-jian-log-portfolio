/*
檔案用途：記錄術後體液平衡觀察，包含便當攝取公克數（吃前／吃後秤重）、喝水量、尿量與大便次數。
所在層：src/features/postop-care/pages；提供術後照護（如腦動脈瘤術後血鉀過低）的量化紀錄流程。
主要關聯：DailyCarePage、FluidBalanceRecord、src/lib/fluidBalance.ts 與 Supabase fluid_balance_records；
四種類型共用同一張表（見 migration 說明），因此送出時只需要一次 insert，列表也只需要一次查詢。
*/
import { useEffect, useState } from 'react'
import dayjs from 'dayjs'
import timezone from 'dayjs/plugin/timezone'
import { useSaveStatus } from '../../../hooks/useSaveStatus'
import { useI18n } from '../../../lib/i18n'
import { supabase } from '../../../lib/supabase'
import { TZ } from '../../../lib/timezone'
import { isDemoMode, readDemoFluidBalanceRecords, saveDemoFluidBalanceRecord } from '../../../lib/demoStorage'
import {
  FLUID_BALANCE_RECORD_TYPES,
  FLUID_BALANCE_TYPE_LABELS,
  computeMealConsumedGrams,
  fluidBalanceAmountUnit,
  fluidBalanceRecordNeedsAmount,
  fluidBalanceRecordUsesWeighing,
  isValidFluidBalanceDraft,
} from '../../../lib/fluidBalance'
import type { FluidBalanceRecord, FluidBalanceRecordType } from '../../../types/database'

dayjs.extend(timezone)

export function FluidBalancePage({ patientId, userEmail }: {
  patientId: string
  patientName?: string
  userEmail?: string
}) {
  const { text } = useI18n()
  const [recordType, setRecordType] = useState<FluidBalanceRecordType>('meal_intake')
  const [amountInput, setAmountInput] = useState('')
  const [weightBeforeInput, setWeightBeforeInput] = useState('')
  const [weightAfterInput, setWeightAfterInput] = useState('')
  const [notes, setNotes] = useState('')
  const [todayRecords, setTodayRecords] = useState<FluidBalanceRecord[]>([])
  const [loading, setLoading] = useState(true)
  const { status, message, begin, succeed, fail, reset } = useSaveStatus()

  const loadToday = async () => {
    setLoading(true)
    const dayStart = dayjs().tz(TZ).startOf('day').toISOString()
    if (isDemoMode()) {
      setTodayRecords(readDemoFluidBalanceRecords(patientId, dayStart))
      setLoading(false)
      return
    }
    const { data, error } = await supabase
      .from('fluid_balance_records')
      .select('*')
      .eq('patient_id', patientId)
      .gte('occurred_at', dayStart)
      .order('occurred_at', { ascending: false })
    if (error) console.error('[fluid balance load error]', error)
    setTodayRecords((data ?? []) as FluidBalanceRecord[])
    setLoading(false)
  }

  // 換病人時清空未送出的草稿：否則沒填完就切換病人，殘留的數字會用新病人的 patient_id 送出。
  useEffect(() => {
    setRecordType('meal_intake')
    setAmountInput('')
    setWeightBeforeInput('')
    setWeightAfterInput('')
    setNotes('')
    reset()
    void loadToday()
  }, [patientId]) // eslint-disable-line react-hooks/exhaustive-deps

  const needsAmount = fluidBalanceRecordNeedsAmount(recordType)
  const usesWeighing = fluidBalanceRecordUsesWeighing(recordType)
  const unit = fluidBalanceAmountUnit(recordType)

  const weightBefore = weightBeforeInput === '' ? null : Number(weightBeforeInput)
  const weightAfter = weightAfterInput === '' ? null : Number(weightAfterInput)
  const amountValue = usesWeighing
    ? (weightBefore !== null && weightAfter !== null ? computeMealConsumedGrams(weightBefore, weightAfter) : null)
    : (amountInput === '' ? null : Number(amountInput))

  const draftValid = isValidFluidBalanceDraft({ recordType, amountValue, weightBeforeG: weightBefore, weightAfterG: weightAfter })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!userEmail || !draftValid) {
      fail(text({ id: 'Periksa kembali angka yang dimasukkan.', zh: '請確認輸入的數字是否正確。' ,en: "Periksa back angka that dimasukkan." }))
      return
    }

    begin()

    const payload = {
      patient_id: patientId,
      record_type: recordType,
      amount_value: needsAmount ? amountValue : null,
      weight_before_g: usesWeighing ? weightBefore : null,
      weight_after_g: usesWeighing ? weightAfter : null,
      notes: notes.trim() || null,
      recorded_by: userEmail.toLowerCase(),
    }

    if (isDemoMode()) {
      const now = new Date().toISOString()
      saveDemoFluidBalanceRecord({
        id: `demo-fluid-balance-${Date.now()}`,
        occurred_at: now,
        created_at: now,
        ...payload,
      })
      succeed(text({ id: 'Tersimpan.', zh: '已儲存。' ,en: "Saved." }))
      setAmountInput('')
      setWeightBeforeInput('')
      setWeightAfterInput('')
      setNotes('')
      await loadToday()
      return
    }

    const { error } = await supabase.from('fluid_balance_records').insert(payload)
    if (error) {
      console.error('[fluid balance save error]', error)
      fail(text({ id: 'Tidak dapat menyimpan. Coba lagi.', zh: '暫時無法儲存，請再試一次。' ,en: "Could not saving. Try again." }))
      return
    }
    succeed(text({ id: 'Tersimpan.', zh: '已儲存。' ,en: "Saved." }))
    setAmountInput('')
    setWeightBeforeInput('')
    setWeightAfterInput('')
    setNotes('')
    await loadToday()
  }

  return (
    <section className="space-y-5 px-5 py-6">
      <form onSubmit={handleSubmit} className="space-y-4 rounded-2xl bg-white p-5 shadow-sm">
        <div>
          <label className="block text-sm font-semibold text-gray-800">
            {text({ id: 'Jenis catatan', zh: '紀錄類型' ,en: "Type recordan" })}
          </label>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {FLUID_BALANCE_RECORD_TYPES.map(option => (
              <button
                key={option}
                type="button"
                onClick={() => { setRecordType(option); setAmountInput(''); setWeightBeforeInput(''); setWeightAfterInput('') }}
                aria-pressed={recordType === option}
                className={`min-h-11 rounded-xl px-3 py-2 text-sm font-bold transition ${recordType === option ? 'bg-indigo-700 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
              >
                {text(FLUID_BALANCE_TYPE_LABELS[option])}
              </button>
            ))}
          </div>
        </div>

        {usesWeighing && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="fluid-weight-before" className="block text-sm font-semibold text-gray-800">
                {text({ id: 'Berat sebelum makan (g)', zh: '吃前秤重（公克）' ,en: "Weight before makan (g)" })}
              </label>
              <input
                id="fluid-weight-before"
                type="number"
                inputMode="decimal"
                min="0"
                step="0.1"
                value={weightBeforeInput}
                onChange={e => setWeightBeforeInput(e.target.value)}
                placeholder="例：450"
                className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2.5"
              />
            </div>
            <div>
              <label htmlFor="fluid-weight-after" className="block text-sm font-semibold text-gray-800">
                {text({ id: 'Berat setelah makan (g)', zh: '吃後秤重（公克）' ,en: "Weight after makan (g)" })}
              </label>
              <input
                id="fluid-weight-after"
                type="number"
                inputMode="decimal"
                min="0"
                step="0.1"
                value={weightAfterInput}
                onChange={e => setWeightAfterInput(e.target.value)}
                placeholder="例：120"
                className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2.5"
              />
            </div>
            {weightBefore !== null && weightAfter !== null && (
              <p className="col-span-2 text-sm font-bold text-indigo-800">
                {amountValue !== null
                  ? text({ id: `Jumlah yang dimakan: ${amountValue} g`, zh: `這餐吃了：${amountValue} 公克` ,en: `Jumlah that dimakan: ${amountValue} g` })
                  : text({ id: 'Berat setelah makan tidak boleh lebih berat dari sebelum makan.', zh: '吃後的重量不能比吃前重，請重新確認。' ,en: "Weight after makan not boleh more weight from before makan." })}
              </p>
            )}
          </div>
        )}

        {needsAmount && !usesWeighing && (
          <div>
            <label htmlFor="fluid-amount" className="block text-sm font-semibold text-gray-800">
              {text(FLUID_BALANCE_TYPE_LABELS[recordType])}
            </label>
            <div className="mt-1 flex items-center gap-2">
              <input
                id="fluid-amount"
                type="number"
                inputMode="decimal"
                min="0"
                step="1"
                value={amountInput}
                onChange={e => setAmountInput(e.target.value)}
                placeholder="例：200"
                className="min-h-11 w-full rounded-xl border border-gray-300 px-3 py-2.5"
              />
              <span className="text-sm font-bold text-gray-500">{unit}</span>
            </div>
          </div>
        )}

        {recordType === 'bowel_movement' && (
          <p className="text-xs text-gray-500">
            {text({ id: 'Hanya jumlah dan waktu yang dicatat, tidak perlu menimbang.', zh: '大便只需記錄次數與時間，不用秤重。' ,en: "Only jumlah and time that direcord, not perlu menimbang." })}
          </p>
        )}

        <div>
          <label htmlFor="fluid-notes" className="block text-sm font-semibold text-gray-800">
            {text({ id: 'Catatan (opsional)', zh: '備註（可不填）' ,en: "Notes (opsional)" })}
          </label>
          <textarea
            id="fluid-notes"
            value={notes}
            maxLength={240}
            onChange={e => setNotes(e.target.value)}
            rows={2}
            className="mt-1 w-full resize-none rounded-xl border border-gray-300 px-3 py-2.5"
          />
        </div>

        {message && (
          <p className={`text-sm ${status === 'err' ? 'text-red-600' : 'text-green-600'}`}>
            {message}
          </p>
        )}

        <button
          type="submit"
          disabled={status === 'saving' || !draftValid}
          className="w-full rounded-xl bg-indigo-700 px-4 py-3 text-sm font-bold text-white disabled:opacity-60"
        >
          {text({ id: 'Simpan', zh: '儲存' ,en: "Save" })}
        </button>
      </form>

      <div className="rounded-2xl bg-white p-5 shadow-sm">
        <h3 className="text-sm font-bold text-gray-800">{text({ id: 'Catatan hari ini', zh: '今天的紀錄' ,en: "Notes days this" })}</h3>
        {loading ? (
          <p className="mt-2 text-sm text-gray-500">{text({ id: 'Memuat…', zh: '讀取中…' ,en: "Loading…" })}</p>
        ) : todayRecords.length === 0 ? (
          <p className="mt-2 text-sm text-gray-500">{text({ id: 'Belum ada catatan hari ini.', zh: '今天還沒有紀錄。' ,en: "No recordan days this." })}</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {todayRecords.map(record => (
              <li key={record.id} className="rounded-xl bg-gray-50 px-3 py-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-gray-700">{text(FLUID_BALANCE_TYPE_LABELS[record.record_type])}</span>
                  <span className="text-xs text-gray-500">{dayjs(record.occurred_at).tz(TZ).format('MM/DD HH:mm')}</span>
                </div>
                {record.record_type === 'meal_intake' && record.weight_before_g != null && record.weight_after_g != null && (
                  <p className="mt-1 text-gray-600">
                    {text({
                      id: `Sebelum ${record.weight_before_g}g → setelah ${record.weight_after_g}g (dimakan ${record.amount_value}g)`,
                      zh: `吃前 ${record.weight_before_g}g → 吃後 ${record.weight_after_g}g（共吃 ${record.amount_value}g）`, en: `Senot yet ${record.weight_before_g}g → after ${record.weight_after_g}g (dimakan ${record.amount_value}g)`,
                    })}
                  </p>
                )}
                {record.record_type !== 'meal_intake' && record.record_type !== 'bowel_movement' && record.amount_value != null && (
                  <p className="mt-1 text-gray-600">{record.amount_value} {fluidBalanceAmountUnit(record.record_type)}</p>
                )}
                {record.notes && <p className="mt-1 text-gray-600">{record.notes}</p>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}
