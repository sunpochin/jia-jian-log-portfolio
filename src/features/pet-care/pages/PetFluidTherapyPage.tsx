/*
檔案用途：記錄寵物皮下液體療法（輸液）的體積、部位與時間。
所在層：src/features/pet-care/pages；提供皮下液體療法照護流程。
主要關聯：DailyCarePage、PetSubcutaneousFluidRecord 與 Supabase pet_subcutaneous_fluid_records（一天可多筆）。
*/
import { lazy, useEffect, useState } from 'react'
import dayjs from 'dayjs'
import timezone from 'dayjs/plugin/timezone'
import { ModuleTrendSection } from '../../../components/daily-care/ModuleTrendSection'
import { useI18n } from '../../../lib/i18n'
import { supabase } from '../../../lib/supabase'
import { TZ } from '../../../lib/timezone'
import { isDemoMode, readDemoPetFluidRecords, saveDemoPetFluidRecord } from '../../../lib/demoStorage'
import type { PetSubcutaneousFluidRecord } from '../../../types/database'

// 圖表只在照護者展開回顧時才載入，避免把治療輸入流程和圖表下載綁在一起。
const PetTrendPanel = lazy(() => import('../components/PetTrendPanel').then(module => ({ default: module.PetTrendPanel })))

dayjs.extend(timezone)

interface FormData {
  fluidVolumeMl: number | ''
  injectionSite: 'neck' | 'abdomen' | 'flank' | ''
}

const injectionSiteLabel = (site: string | null) => {
  if (site === 'neck') return { id: 'Leher/Selangkangan', zh: '頸部' ,en: "Leher/Selangkangan" }
  if (site === 'abdomen') return { id: 'Perut', zh: '腹部' ,en: "Perut" }
  if (site === 'flank') return { id: 'Samping', zh: '側腰' ,en: "Samping" }
  return { id: '—', zh: '—' ,en: "—" }
}

export function PetFluidTherapyPage({ patientId, userEmail }: {
  patientId: string
  patientName?: string
  userEmail?: string
}) {
  const { text } = useI18n()
  const [formData, setFormData] = useState<FormData>({ fluidVolumeMl: '', injectionSite: '' })
  const [todayRecords, setTodayRecords] = useState<PetSubcutaneousFluidRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState<'idle' | 'saving' | 'ok' | 'err'>('idle')
  const [message, setMessage] = useState('')

  const loadToday = async () => {
    setLoading(true)
    const dayStart = dayjs().tz(TZ).startOf('day').toISOString()
    if (isDemoMode()) {
      setTodayRecords(readDemoPetFluidRecords(patientId, dayStart))
      setLoading(false)
      return
    }
    const { data, error } = await supabase.from('pet_subcutaneous_fluid_records')
      .select('*')
      .eq('patient_id', patientId)
      .gte('administered_at', dayStart)
      .order('administered_at', { ascending: false })
    if (error) {
      console.error('[pet fluid therapy load error]', error)
      setLoading(false)
      return
    }
    setTodayRecords((data ?? []) as PetSubcutaneousFluidRecord[])
    setLoading(false)
  }

  useEffect(() => { void loadToday() }, [patientId]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleInputChange = (field: keyof FormData, value: string | number) => {
    setFormData(prev => ({
      ...prev,
      [field]: field === 'fluidVolumeMl' ? (value === '' ? '' : Number(value)) : value,
    }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!userEmail) return

    if (formData.fluidVolumeMl === '') {
      setMessage(text({ id: 'Masukkan volume cairan.', zh: '請輸入液體體積。' ,en: "Masukkan volume fluid." }))
      return
    }

    setStatus('saving')
    setMessage('')

    if (isDemoMode()) {
      saveDemoPetFluidRecord({ id: `demo-pet-fluid-${Date.now()}`, patient_id: patientId, fluid_volume_ml: formData.fluidVolumeMl, infusion_rate: null, injection_site: formData.injectionSite === '' ? null : formData.injectionSite, notes: null, administered_by: userEmail.toLowerCase(), administered_at: new Date().toISOString(), created_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      setMessage(text({ id: 'Tersimpan.', zh: '已儲存。' ,en: "Saved." }))
      setStatus('ok')
      setFormData({ fluidVolumeMl: '', injectionSite: '' })
      await loadToday()
      setTimeout(() => setStatus('idle'), 2000)
      return
    }

    const { error } = await supabase.from('pet_subcutaneous_fluid_records').insert({
      patient_id: patientId,
      fluid_volume_ml: formData.fluidVolumeMl,
      injection_site: formData.injectionSite === '' ? null : formData.injectionSite,
      administered_by: userEmail.toLowerCase(),
    })
    if (error) {
      console.error('[pet fluid therapy save error]', error)
      setMessage(text({ id: 'Tidak dapat menyimpan. Coba lagi.', zh: '暫時無法儲存，請再試一次。' ,en: "Could not saving. Try again." }))
      setStatus('err')
      return
    }
    setMessage(text({ id: 'Tersimpan.', zh: '已儲存。' ,en: "Saved." }))
    setStatus('ok')
    setFormData({ fluidVolumeMl: '', injectionSite: '' })
    await loadToday()
    setTimeout(() => setStatus('idle'), 2000)
  }

  return (
    <section className="space-y-5 px-5 py-6">
      <form onSubmit={handleSubmit} className="space-y-4 rounded-2xl bg-white p-5 shadow-sm">
        <div>
          <label className="block text-sm font-semibold text-gray-800">
            {text({ id: 'Volume cairan (ml)', zh: '液體體積（毫升）' ,en: "Volume fluid (ml)" })}
          </label>
          <input
            type="number"
            min="0"
            step="50"
            value={formData.fluidVolumeMl}
            onChange={e => handleInputChange('fluidVolumeMl', e.target.value)}
            placeholder="例：200"
            className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2.5"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-800">
            {text({ id: 'Lokasi injeksi', zh: '注射部位' ,en: "Lokasi injeksi" })}
          </label>
          <select
            value={formData.injectionSite}
            onChange={e => handleInputChange('injectionSite', e.target.value)}
            className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2.5"
          >
            <option value="">{text({ id: '(Opsional)', zh: '（可不填）' ,en: "(Opsional)" })}</option>
            <option value="neck">{text({ id: 'Leher/Selangkangan', zh: '頸部' ,en: "Leher/Selangkangan" })}</option>
            <option value="abdomen">{text({ id: 'Perut', zh: '腹部' ,en: "Perut" })}</option>
            <option value="flank">{text({ id: 'Samping', zh: '側腰' ,en: "Samping" })}</option>
          </select>
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
                <span className="font-semibold text-gray-700">{text(injectionSiteLabel(record.injection_site))}</span>
                <span className="font-bold text-indigo-700">{record.fluid_volume_ml} ml</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* 多次點滴用每日總量回顧，比把不同時間的針次硬連成一條線更不易誤讀。 */}
      <ModuleTrendSection moduleId="petFluidTherapy" titleId="pet-fluid-therapy-trend-title">
        {days => <PetTrendPanel kind="fluid" patientId={patientId} days={days} refreshKey={todayRecords.map(record => `${record.id}:${record.fluid_volume_ml}:${record.administered_at}`).join('|')} />}
      </ModuleTrendSection>
    </section>
  )
}
