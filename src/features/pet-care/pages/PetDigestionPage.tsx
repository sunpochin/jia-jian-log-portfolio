/*
檔案用途：記錄寵物排便次數、便便健康評分與嘔吐次數，監測消化系統。
所在層：src/features/pet-care/pages；提供消化健康照護流程。
主要關聯：DailyCarePage、PetDigestionRecord 與 Supabase pet_digestion_records（每個病人每天只有一筆，UNIQUE patient_id+recorded_date）。
*/
import { lazy, useEffect, useState } from 'react'
import { ModuleTrendSection } from '../../../components/daily-care/ModuleTrendSection'
import { useI18n } from '../../../lib/i18n'
import { supabase } from '../../../lib/supabase'
import { calendarDateKey } from '../../../lib/careDay'
import { isDemoMode, readDemoPetDigestionRecord, saveDemoPetDigestionRecord } from '../../../lib/demoStorage'
import type { PetDigestionRecord } from '../../../types/database'

// 圖表只在照護者展開回顧時才載入，讓日常輸入仍維持輕量且快速。
const PetTrendPanel = lazy(() => import('../components/PetTrendPanel').then(module => ({ default: module.PetTrendPanel })))

interface FormData {
  defecationCount: number | ''
  stoolScore: 1 | 2 | 3 | 4 | 5 | ''
  vomitingCount: number | ''
}

const EMPTY_FORM: FormData = { defecationCount: '', stoolScore: '', vomitingCount: '' }

export function PetDigestionPage({ patientId, userEmail }: {
  patientId: string
  patientName?: string
  userEmail?: string
}) {
  const { text } = useI18n()
  const [formData, setFormData] = useState<FormData>(EMPTY_FORM)
  const [todayRecord, setTodayRecord] = useState<PetDigestionRecord | null>(null)
  const [status, setStatus] = useState<'loading' | 'idle' | 'saving' | 'ok' | 'err'>('loading')
  const [message, setMessage] = useState('')

  useEffect(() => {
    let cancelled = false
    setStatus('loading')
    setMessage('')
    if (isDemoMode()) {
      const record = readDemoPetDigestionRecord(patientId)
      setTodayRecord(record)
      setFormData(record
        ? { defecationCount: record.defecation_count ?? '', stoolScore: record.stool_score ?? '', vomitingCount: record.vomiting_count ?? '' }
        : EMPTY_FORM)
      setStatus('idle')
      return
    }
    void supabase.from('pet_digestion_records')
      .select('*')
      .eq('patient_id', patientId)
      .eq('recorded_date', calendarDateKey())
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) {
          console.error('[pet digestion load error]', error)
          setStatus('err')
          setMessage(text({ id: 'Tidak dapat memuat data.', zh: '暫時無法讀取資料。' ,en: "Could not loading data." }))
          return
        }
        const record = data as PetDigestionRecord | null
        setTodayRecord(record)
        setFormData(record
          ? { defecationCount: record.defecation_count ?? '', stoolScore: record.stool_score ?? '', vomitingCount: record.vomiting_count ?? '' }
          : EMPTY_FORM)
        setStatus('idle')
      })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patientId])

  const handleInputChange = (field: keyof FormData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value === '' ? '' : Number(value) }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!userEmail) return

    if (formData.defecationCount === '' && formData.stoolScore === '' && formData.vomitingCount === '') {
      setMessage(text({ id: 'Masukkan setidaknya satu nilai.', zh: '請至少輸入一個值。' ,en: "Masukkan setidaknya satu nilai." }))
      return
    }

    setStatus('saving')
    setMessage('')

    const payload = {
      patient_id: patientId,
      recorded_date: calendarDateKey(),
      defecation_count: formData.defecationCount === '' ? null : formData.defecationCount,
      stool_score: formData.stoolScore === '' ? null : formData.stoolScore,
      vomiting_count: formData.vomitingCount === '' ? null : formData.vomitingCount,
      recorded_by: userEmail.toLowerCase(),
    }
    if (isDemoMode()) {
      const record: PetDigestionRecord = { id: todayRecord?.id ?? `demo-pet-digestion-${Date.now()}`, notes: null, created_at: todayRecord?.created_at ?? new Date().toISOString(), updated_at: new Date().toISOString(), ...payload }
      saveDemoPetDigestionRecord(record)
      setTodayRecord(record)
      setMessage(text({ id: 'Tersimpan.', zh: '已儲存。' ,en: "Saved." }))
      setStatus('ok')
      setTimeout(() => setStatus('idle'), 2000)
      return
    }

    const request = todayRecord
      ? supabase.from('pet_digestion_records').update(payload).eq('id', todayRecord.id)
      : supabase.from('pet_digestion_records').insert(payload)

    const { data, error } = await request.select('*').single()
    if (error) {
      console.error('[pet digestion save error]', error)
      setMessage(text({ id: 'Tidak dapat menyimpan. Coba lagi.', zh: '暫時無法儲存，請再試一次。' ,en: "Could not saving. Try again." }))
      setStatus('err')
      return
    }
    setTodayRecord(data as PetDigestionRecord)
    setMessage(text({ id: 'Tersimpan.', zh: '已儲存。' ,en: "Saved." }))
    setStatus('ok')
    setTimeout(() => setStatus('idle'), 2000)
  }

  return (
    <section className="space-y-5 px-5 py-6">
      <form onSubmit={handleSubmit} className="space-y-4 rounded-2xl bg-white p-5 shadow-sm">
        {todayRecord && (
          <p className="text-xs font-semibold text-indigo-700">
            {text({ id: 'Mengedit catatan hari ini.', zh: '目前正在修改今天已存的紀錄。' ,en: "Mengedit recordan days this." })}
          </p>
        )}
        <div>
          <label className="block text-sm font-semibold text-gray-800">
            {text({ id: 'Frekuensi buang air besar', zh: '排便次數' ,en: "Frekuensi bowel movement" })}
          </label>
          <input
            type="number"
            min="0"
            step="1"
            value={formData.defecationCount}
            onChange={e => handleInputChange('defecationCount', e.target.value)}
            placeholder="例：1"
            className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2.5"
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-800">
            {text({ id: 'Skor kesehatan feses (1-5)', zh: '糞便評分 (1-5)' ,en: "Skor tosehatan feses (1-5)" })}
          </label>
          <p className="mt-1 text-xs text-gray-500">
            {text({ id: '1=diare, 3=normal, 5=sembelit', zh: '1=腹瀉, 3=正常, 5=便秘' ,en: "1=diare, 3=normal, 5=sembelit" })}
          </p>
          <select
            value={formData.stoolScore}
            onChange={e => handleInputChange('stoolScore', e.target.value)}
            className="mt-2 w-full rounded-xl border border-gray-300 px-3 py-2.5"
          >
            <option value="">{text({ id: '(Opsional)', zh: '（可不填）' ,en: "(Opsional)" })}</option>
            <option value="1">1 - {text({ id: 'Diare', zh: '腹瀉' ,en: "Diare" })}</option>
            <option value="2">2 - {text({ id: 'Lembek', zh: '軟便' ,en: "Lembek" })}</option>
            <option value="3">3 - {text({ id: 'Normal', zh: '正常' ,en: "Normal" })}</option>
            <option value="4">4 - {text({ id: 'Keras', zh: '硬便' ,en: "Keras" })}</option>
            <option value="5">5 - {text({ id: 'Sembelit', zh: '便秘' ,en: "Sembelit" })}</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-800">
            {text({ id: 'Frekuensi muntah', zh: '嘔吐次數' ,en: "Frekuensi muntah" })}
          </label>
          <input
            type="number"
            min="0"
            step="1"
            value={formData.vomitingCount}
            onChange={e => handleInputChange('vomitingCount', e.target.value)}
            placeholder="例：0"
            className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2.5"
          />
        </div>

        {message && (
          <p className={`text-sm ${status === 'err' ? 'text-red-600' : 'text-green-600'}`}>
            {message}
          </p>
        )}

        <button
          type="submit"
          disabled={status === 'saving' || status === 'loading'}
          className="w-full rounded-xl bg-indigo-700 px-4 py-3 text-sm font-bold text-white disabled:opacity-60"
        >
          {text({ id: 'Simpan', zh: '儲存' ,en: "Save" })}
        </button>
      </form>

      {/* 今天的輸入與過去的變化放在同一個模組，避免回顧時遺失目前病人的上下文。 */}
      <ModuleTrendSection moduleId="petDigestion" titleId="pet-digestion-trend-title">
        {days => <PetTrendPanel kind="digestion" patientId={patientId} days={days} refreshKey={todayRecord ? `${todayRecord.id}:${todayRecord.defecation_count}:${todayRecord.stool_score}:${todayRecord.vomiting_count}:${todayRecord.updated_at}` : ''} />}
      </ModuleTrendSection>
    </section>
  )
}
