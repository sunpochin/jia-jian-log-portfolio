/*
檔案用途：記錄失智照護觀察，包含躁動時段、日夜顛倒模式與走失風險三種紀錄。
所在層：src/features/dementia-care/pages；提供失智照護的每日觀察紀錄流程。
主要關聯：DailyCarePage、DementiaCareRecord 與 Supabase dementia_care_records；
三種類型共用同一張表（見 migration 說明），因此送出時只需要一次 insert，列表也只需要一次查詢。
文案刻意描述「觀察到的狀況」而不評價被照護者本人，呼應 issue #421 驗收條件「文案避免污名化用語」。
*/
import { useEffect, useState } from 'react'
import dayjs from 'dayjs'
import timezone from 'dayjs/plugin/timezone'
import { useI18n, type LocalizedText } from '../../../lib/i18n'
import { supabase } from '../../../lib/supabase'
import { TZ } from '../../../lib/timezone'
import { isDemoMode, readDemoDementiaCareRecords, saveDemoDementiaCareRecord } from '../../../lib/demoStorage'
import type { DementiaCareRecord } from '../../../types/database'

dayjs.extend(timezone)

type RecordType = DementiaCareRecord['record_type']
type TimePeriod = NonNullable<DementiaCareRecord['time_period']>

const RECORD_TYPES: { value: RecordType; label: LocalizedText }[] = [
  { value: 'agitation', label: { id: 'Periode gelisah', zh: '躁動時段' ,en: "Periode gelisah" } },
  { value: 'day_night_reversal', label: { id: 'Pola siang-malam terbalik', zh: '日夜顛倒模式' ,en: "Pola afternoon-night terbalik" } },
  { value: 'wandering_risk', label: { id: 'Risiko tersesat', zh: '走失風險' ,en: "Risiko tersesat" } },
]

const TIME_PERIODS: { value: TimePeriod; label: LocalizedText }[] = [
  { value: 'morning', label: { id: 'Pagi', zh: '上午' ,en: "Morning" } },
  { value: 'afternoon', label: { id: 'Siang', zh: '下午' ,en: "Afternoon" } },
  { value: 'evening', label: { id: 'Sore', zh: '傍晚' ,en: "Evening" } },
  { value: 'night', label: { id: 'Malam', zh: '晚上' ,en: "Night" } },
]

export function DementiaCarePage({ patientId, userEmail }: {
  patientId: string
  patientName?: string
  userEmail?: string
}) {
  const { text } = useI18n()
  const [recordType, setRecordType] = useState<RecordType>('agitation')
  const [timePeriod, setTimePeriod] = useState<TimePeriod | ''>('')
  const [notes, setNotes] = useState('')
  const [todayRecords, setTodayRecords] = useState<DementiaCareRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState<'idle' | 'saving' | 'ok' | 'err'>('idle')
  const [message, setMessage] = useState('')

  const loadToday = async () => {
    setLoading(true)
    const dayStart = dayjs().tz(TZ).startOf('day').toISOString()
    if (isDemoMode()) {
      setTodayRecords(readDemoDementiaCareRecords(patientId, dayStart))
      setLoading(false)
      return
    }
    const { data, error } = await supabase
      .from('dementia_care_records')
      .select('*')
      .eq('patient_id', patientId)
      .gte('occurred_at', dayStart)
      .order('occurred_at', { ascending: false })
    if (error) console.error('[dementia care load error]', error)
    setTodayRecords((data ?? []) as DementiaCareRecord[])
    setLoading(false)
  }

  // 換病人時清空未送出的草稿：否則沒填完就切換病人，殘留的紀錄類型與備註會用新病人的 patient_id 送出。
  useEffect(() => {
    setRecordType('agitation')
    setTimePeriod('')
    setNotes('')
    setMessage('')
    setStatus('idle')
    void loadToday()
  }, [patientId]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!userEmail) return

    setStatus('saving')
    setMessage('')

    if (isDemoMode()) {
      const now = new Date().toISOString()
      saveDemoDementiaCareRecord({
        id: `demo-dementia-care-${Date.now()}`,
        patient_id: patientId,
        record_type: recordType,
        time_period: timePeriod || null,
        notes: notes.trim() || null,
        occurred_at: now,
        recorded_by: userEmail.toLowerCase(),
        created_at: now,
      })
      setMessage(text({ id: 'Tersimpan.', zh: '已儲存。' ,en: "Saved." }))
      setStatus('ok')
      setTimePeriod('')
      setNotes('')
      await loadToday()
      setTimeout(() => setStatus('idle'), 2000)
      return
    }

    const { error } = await supabase.from('dementia_care_records').insert({
      patient_id: patientId,
      record_type: recordType,
      time_period: timePeriod || null,
      notes: notes.trim() || null,
      recorded_by: userEmail.toLowerCase(),
    })
    if (error) {
      console.error('[dementia care save error]', error)
      setMessage(text({ id: 'Tidak dapat menyimpan. Coba lagi.', zh: '暫時無法儲存，請再試一次。' ,en: "Could not saving. Try again." }))
      setStatus('err')
      return
    }
    setMessage(text({ id: 'Tersimpan.', zh: '已儲存。' ,en: "Saved." }))
    setStatus('ok')
    setTimePeriod('')
    setNotes('')
    await loadToday()
    setTimeout(() => setStatus('idle'), 2000)
  }

  return (
    <section className="space-y-5 px-5 py-6">
      <form onSubmit={handleSubmit} className="space-y-4 rounded-2xl bg-white p-5 shadow-sm">
        <div>
          <label className="block text-sm font-semibold text-gray-800">
            {text({ id: 'Jenis catatan', zh: '紀錄類型' ,en: "Type recordan" })}
          </label>
          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
            {RECORD_TYPES.map(option => (
              <button
                key={option.value}
                type="button"
                onClick={() => setRecordType(option.value)}
                aria-pressed={recordType === option.value}
                className={`min-h-11 rounded-xl px-3 py-2 text-sm font-bold transition ${recordType === option.value ? 'bg-indigo-700 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
              >
                {text(option.label)}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-800">
            {text({ id: 'Waktu (opsional)', zh: '時段（可不填）' ,en: "Time (opsional)" })}
          </label>
          <div className="mt-2 grid grid-cols-4 gap-2">
            {TIME_PERIODS.map(option => (
              <button
                key={option.value}
                type="button"
                onClick={() => setTimePeriod(timePeriod === option.value ? '' : option.value)}
                aria-pressed={timePeriod === option.value}
                className={`min-h-11 rounded-xl px-2 py-2 text-xs font-bold transition sm:text-sm ${timePeriod === option.value ? 'bg-indigo-700 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
              >
                {text(option.label)}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-800">
            {text({ id: 'Catatan (kondisi yang diamati)', zh: '備註（觀察到的狀況）' ,en: "Notes (kondisi that diamati)" })}
          </label>
          <p className="mt-1 text-xs text-gray-500">
            {text({ id: '(Opsional) Contoh: ingin keluar rumah, mengulang pertanyaan yang sama', zh: '（可不填）例如：想出門、重複問同樣的問題、坐立不安' ,en: "(Opsional) Example: ingin toluar rumah, mengulang pertanyaan that sama" })}
          </p>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            rows={3}
            className="mt-2 w-full rounded-xl border border-gray-300 px-3 py-2.5"
          />
        </div>

        {message && (
          <p className={`text-sm ${status === 'err' ? 'text-red-600' : 'text-green-600'}`}>
            {message}
          </p>
        )}

        <button
          type="submit"
          disabled={status === 'saving'}
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
            {todayRecords.map(record => {
              const typeLabel = RECORD_TYPES.find(option => option.value === record.record_type)?.label
              const periodLabel = TIME_PERIODS.find(option => option.value === record.time_period)?.label
              return (
                <li key={record.id} className="rounded-xl bg-gray-50 px-3 py-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-gray-700">{typeLabel ? text(typeLabel) : record.record_type}</span>
                    <span className="text-xs text-gray-500">
                      {periodLabel ? text(periodLabel) : dayjs(record.occurred_at).tz(TZ).format('HH:mm')}
                    </span>
                  </div>
                  {record.notes && <p className="mt-1 text-gray-600">{record.notes}</p>}
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </section>
  )
}
