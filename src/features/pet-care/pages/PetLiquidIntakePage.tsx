/*
檔案用途：記錄寵物飲水量、排尿與貓砂尿塊數，協助監測泌尿系統健康（如慢性腎病）。
所在層：src/features/pet-care/pages；提供液體管理照護流程。
主要關聯：DailyCarePage、PetLiquidIntakeRecord 與 Supabase pet_liquid_intake_records（每個病人每天只有一筆，UNIQUE patient_id+recorded_date）。
*/
import { lazy, useEffect, useState } from 'react'
import { ModuleTrendSection } from '../../../components/daily-care/ModuleTrendSection'
import { useI18n } from '../../../lib/i18n'
import { supabase } from '../../../lib/supabase'
import { calendarDateKey } from '../../../lib/careDay'
import { isDemoMode, readDemoPetLiquidIntakeRecord, saveDemoPetLiquidIntakeRecord } from '../../../lib/demoStorage'
import type { PetLiquidIntakeRecord } from '../../../types/database'

// 圖表只在照護者展開回顧時才載入，避免今天的輸入頁每次開啟都先下載較重的圖表套件。
const PetTrendPanel = lazy(() => import('../components/PetTrendPanel').then(module => ({ default: module.PetTrendPanel })))

interface FormData {
  waterIntakeMl: number | ''
  urinationCount: number | ''
  litterBoxUrineClumps: number | ''
}

const EMPTY_FORM: FormData = { waterIntakeMl: '', urinationCount: '', litterBoxUrineClumps: '' }

export function PetLiquidIntakePage({ patientId, userEmail }: {
  patientId: string
  patientName?: string
  userEmail?: string
}) {
  const { text } = useI18n()
  const [formData, setFormData] = useState<FormData>(EMPTY_FORM)
  // 今天已有的那一筆紀錄；有值時代表送出要走 update，避免違反 UNIQUE(patient_id, recorded_date)。
  const [todayRecord, setTodayRecord] = useState<PetLiquidIntakeRecord | null>(null)
  const [status, setStatus] = useState<'loading' | 'idle' | 'saving' | 'ok' | 'err'>('loading')
  const [message, setMessage] = useState('')

  useEffect(() => {
    let cancelled = false
    setStatus('loading')
    setMessage('')
    if (isDemoMode()) {
      const record = readDemoPetLiquidIntakeRecord(patientId)
      setTodayRecord(record)
      setFormData(record
        ? { waterIntakeMl: record.water_intake_ml ?? '', urinationCount: record.urination_count ?? '', litterBoxUrineClumps: record.litter_box_urine_clumps ?? '' }
        : EMPTY_FORM)
      setStatus('idle')
      return
    }
    void supabase.from('pet_liquid_intake_records')
      .select('*')
      .eq('patient_id', patientId)
      .eq('recorded_date', calendarDateKey())
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) {
          console.error('[pet liquid intake load error]', error)
          setStatus('err')
          setMessage(text({ id: 'Tidak dapat memuat data.', zh: '暫時無法讀取資料。' ,en: "Could not loading data." }))
          return
        }
        const record = data as PetLiquidIntakeRecord | null
        setTodayRecord(record)
        setFormData(record
          ? { waterIntakeMl: record.water_intake_ml ?? '', urinationCount: record.urination_count ?? '', litterBoxUrineClumps: record.litter_box_urine_clumps ?? '' }
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

    if (formData.waterIntakeMl === '' && formData.urinationCount === '' && formData.litterBoxUrineClumps === '') {
      setMessage(text({ id: 'Masukkan setidaknya satu nilai.', zh: '請至少輸入一個值。' ,en: "Masukkan setidaknya satu nilai." }))
      return
    }

    setStatus('saving')
    setMessage('')

    const payload = {
      patient_id: patientId,
      recorded_date: calendarDateKey(),
      water_intake_ml: formData.waterIntakeMl === '' ? null : formData.waterIntakeMl,
      urination_count: formData.urinationCount === '' ? null : formData.urinationCount,
      litter_box_urine_clumps: formData.litterBoxUrineClumps === '' ? null : formData.litterBoxUrineClumps,
      recorded_by: userEmail.toLowerCase(),
    }

    if (isDemoMode()) {
      const record: PetLiquidIntakeRecord = { id: todayRecord?.id ?? `demo-pet-liquid-${Date.now()}`, notes: null, created_at: todayRecord?.created_at ?? new Date().toISOString(), updated_at: new Date().toISOString(), ...payload }
      saveDemoPetLiquidIntakeRecord(record)
      setTodayRecord(record)
      setMessage(text({ id: 'Tersimpan.', zh: '已儲存。' ,en: "Saved." }))
      setStatus('ok')
      setTimeout(() => setStatus('idle'), 2000)
      return
    }

    // 今天已有紀錄就更新同一筆，否則新增；靠 UNIQUE(patient_id, recorded_date) 避免同一天出現兩筆。
    const request = todayRecord
      ? supabase.from('pet_liquid_intake_records').update(payload).eq('id', todayRecord.id)
      : supabase.from('pet_liquid_intake_records').insert(payload)

    const { data, error } = await request.select('*').single()
    if (error) {
      console.error('[pet liquid intake save error]', error)
      setMessage(text({ id: 'Tidak dapat menyimpan. Coba lagi.', zh: '暫時無法儲存，請再試一次。' ,en: "Could not saving. Try again." }))
      setStatus('err')
      return
    }
    setTodayRecord(data as PetLiquidIntakeRecord)
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
            {text({ id: 'Asupan air (ml)', zh: '飲水量（毫升）' ,en: "Asupan water (ml)" })}
          </label>
          <input
            type="number"
            min="0"
            step="50"
            value={formData.waterIntakeMl}
            onChange={e => handleInputChange('waterIntakeMl', e.target.value)}
            placeholder="例：250"
            className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2.5"
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-800">
            {text({ id: 'Frekuensi buang air kecil', zh: '排尿次數' ,en: "Frekuensi buang water tocil" })}
          </label>
          <input
            type="number"
            min="0"
            step="1"
            value={formData.urinationCount}
            onChange={e => handleInputChange('urinationCount', e.target.value)}
            placeholder="例：4"
            className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2.5"
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-800">
            {text({ id: 'Jumlah gumpalan urin di kotak pasir', zh: '貓砂盆尿塊數' ,en: "Jumlah gumpalan urin in kotak pasir" })}
          </label>
          <p className="mt-1 text-xs text-gray-500">
            {text({ id: '(Opsional) Untuk kucing dengan kotak pasir', zh: '（可不填）適用於使用貓砂盆的貓咪' ,en: "(Opsional) Untuk cat with kotak pasir" })}
          </p>
          <input
            type="number"
            min="0"
            step="1"
            value={formData.litterBoxUrineClumps}
            onChange={e => handleInputChange('litterBoxUrineClumps', e.target.value)}
            placeholder="例：3"
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
          disabled={status === 'saving' || status === 'loading'}
          className="w-full rounded-xl bg-indigo-700 px-4 py-3 text-sm font-bold text-white disabled:opacity-60"
        >
          {text({ id: 'Simpan', zh: '儲存' ,en: "Save" })}
        </button>
      </form>

      {/* 今天的輸入與過去的變化放在同一個模組，照護者不必跳到另一個分頁才能比較。 */}
      <ModuleTrendSection moduleId="petLiquidIntake" titleId="pet-liquid-intake-trend-title">
        {days => <PetTrendPanel kind="liquid" patientId={patientId} days={days} refreshKey={todayRecord ? `${todayRecord.id}:${todayRecord.water_intake_ml}:${todayRecord.urination_count}:${todayRecord.litter_box_urine_clumps}:${todayRecord.updated_at}` : ''} />}
      </ModuleTrendSection>
    </section>
  )
}
