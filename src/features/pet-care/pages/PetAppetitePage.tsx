/*
檔案用途：記錄寵物每餐進食比例，監測食慾與營養攝取。
所在層：src/features/pet-care/pages；提供食慾照護流程。
主要關聯：DailyCarePage、PetAppetiteRecord 與 Supabase pet_appetite_records（一天可多筆，按餐次區分）。
*/
import { lazy, useEffect, useState } from 'react'
import dayjs from 'dayjs'
import timezone from 'dayjs/plugin/timezone'
import { ModuleTrendSection } from '../../../components/daily-care/ModuleTrendSection'
import { useI18n } from '../../../lib/i18n'
import { supabase } from '../../../lib/supabase'
import { TZ } from '../../../lib/timezone'
import { MEAL_TYPES, MEAL_TYPE_LABELS } from '../../../lib/nutrition'
import { isDemoMode, readDemoPetAppetiteRecords, saveDemoPetAppetiteRecord } from '../../../lib/demoStorage'
import type { MealType, PetAppetiteRecord } from '../../../types/database'

// 圖表只在照護者展開回顧時才載入；食慾輸入本身不需要先載入 Recharts。
const PetTrendPanel = lazy(() => import('../components/PetTrendPanel').then(module => ({ default: module.PetTrendPanel })))

dayjs.extend(timezone)

export function PetAppetitePage({ patientId, userEmail }: {
  patientId: string
  patientName?: string
  userEmail?: string
}) {
  const { text } = useI18n()
  const [eatingPercentage, setEatingPercentage] = useState<number | ''>('')
  const [mealType, setMealType] = useState<MealType>('breakfast')
  const [todayRecords, setTodayRecords] = useState<PetAppetiteRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState<'idle' | 'saving' | 'ok' | 'err'>('idle')
  const [message, setMessage] = useState('')

  const loadToday = async () => {
    setLoading(true)
    const dayStart = dayjs().tz(TZ).startOf('day').toISOString()
    if (isDemoMode()) {
      setTodayRecords(readDemoPetAppetiteRecords(patientId, dayStart))
      setLoading(false)
      return
    }
    const { data, error } = await supabase.from('pet_appetite_records')
      .select('*')
      .eq('patient_id', patientId)
      .gte('recorded_at', dayStart)
      .order('recorded_at', { ascending: false })
    if (error) {
      console.error('[pet appetite load error]', error)
      setLoading(false)
      return
    }
    setTodayRecords((data ?? []) as PetAppetiteRecord[])
    setLoading(false)
  }

  useEffect(() => { void loadToday() }, [patientId]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleInputChange = (value: string) => {
    const num = value === '' ? '' : Math.min(100, Math.max(0, Number(value)))
    setEatingPercentage(num)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!userEmail) return

    if (eatingPercentage === '') {
      setMessage(text({ id: 'Masukkan persentase makan.', zh: '請輸入進食比例。' ,en: "Masukkan persentase makan." }))
      return
    }

    setStatus('saving')
    setMessage('')

    if (isDemoMode()) {
      saveDemoPetAppetiteRecord({ id: `demo-pet-appetite-${Date.now()}`, patient_id: patientId, appetite_percent: eatingPercentage, meal_type: mealType, notes: null, recorded_by: userEmail.toLowerCase(), recorded_at: new Date().toISOString(), created_at: new Date().toISOString() })
      setMessage(text({ id: 'Tersimpan.', zh: '已儲存。' ,en: "Saved." }))
      setStatus('ok')
      setEatingPercentage('')
      await loadToday()
      setTimeout(() => setStatus('idle'), 2000)
      return
    }

    const { error } = await supabase.from('pet_appetite_records').insert({
      patient_id: patientId,
      appetite_percent: eatingPercentage,
      meal_type: mealType,
      recorded_by: userEmail.toLowerCase(),
    })
    if (error) {
      console.error('[pet appetite save error]', error)
      setMessage(text({ id: 'Tidak dapat menyimpan. Coba lagi.', zh: '暫時無法儲存，請再試一次。' ,en: "Could not saving. Try again." }))
      setStatus('err')
      return
    }
    setMessage(text({ id: 'Tersimpan.', zh: '已儲存。' ,en: "Saved." }))
    setStatus('ok')
    setEatingPercentage('')
    await loadToday()
    setTimeout(() => setStatus('idle'), 2000)
  }

  return (
    <section className="space-y-5 px-5 py-6">
      <form onSubmit={handleSubmit} className="space-y-4 rounded-2xl bg-white p-5 shadow-sm">
        <div>
          <label className="block text-sm font-semibold text-gray-800">
            {text({ id: 'Waktu makan', zh: '餐次' ,en: "Time makan" })}
          </label>
          <div className="mt-2 grid grid-cols-4 gap-2">
            {MEAL_TYPES.map(type => (
              <button
                key={type}
                type="button"
                aria-pressed={mealType === type}
                onClick={() => setMealType(type)}
                className={`min-h-11 rounded-xl border px-2 py-2 text-xs font-bold ${mealType === type ? 'border-indigo-700 bg-indigo-700 text-white' : 'border-gray-200 bg-gray-50 text-gray-700'}`}
              >
                {text(MEAL_TYPE_LABELS[type])}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-800">
            {text({ id: 'Persentase nafsu makan (%)', zh: '進食比例 (%)' ,en: "Persentase nafsu makan (%)" })}
          </label>
          <p className="mt-1 text-xs text-gray-500">
            {text({ id: '0% = tidak makan, 100% = habis semua', zh: '0% = 未進食, 100% = 全部進食' ,en: "0% = not makan, 100% = habis all" })}
          </p>
          <div className="mt-2 flex items-center gap-3">
            <input
              type="number"
              min="0"
              max="100"
              step="5"
              value={eatingPercentage}
              onChange={e => handleInputChange(e.target.value)}
              placeholder="50"
              className="flex-1 rounded-xl border border-gray-300 px-3 py-2.5"
            />
            <span className="text-sm font-semibold text-gray-600 min-w-12">
              {eatingPercentage !== '' ? `${eatingPercentage}%` : '—'}
            </span>
          </div>
          {eatingPercentage !== '' && (
            <div className="mt-2 h-2 w-full rounded-full bg-gray-200 overflow-hidden">
              <div
                className="h-full bg-indigo-600 transition-all"
                style={{ width: `${eatingPercentage}%` }}
              />
            </div>
          )}
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
            {todayRecords.map(record => (
              <li key={record.id} className="flex items-center justify-between rounded-xl bg-gray-50 px-3 py-2 text-sm">
                <span className="font-semibold text-gray-700">{text(MEAL_TYPE_LABELS[record.meal_type])}</span>
                <span className="font-bold text-indigo-700">{record.appetite_percent}%</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* 每日平均進食比例能把多餐紀錄收斂成可比較的歷史序列。 */}
      <ModuleTrendSection moduleId="petAppetite" titleId="pet-appetite-trend-title">
        {days => <PetTrendPanel kind="appetite" patientId={patientId} days={days} refreshKey={todayRecords.map(record => `${record.id}:${record.appetite_percent}:${record.recorded_at}`).join('|')} />}
      </ModuleTrendSection>
    </section>
  )
}
