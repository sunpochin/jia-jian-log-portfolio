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
  injectionSite: 'neck_only' | 'abdomen' | 'flank' | ''
}

// 注射部位 key 與標籤（issue #928）：
// - 'neck'：舊 key。當時印尼文標籤是「Leher/Selangkangan」（頸部／鼠蹊），印尼文使用者在鼠蹊注射也會存成 neck，
//   而紀錄沒有保存當時的介面語言，事後無法分辨是哪一個部位。顯示時必須保留這個不確定性，不能把歷史紀錄改寫成
//   「確定是頸部」（PR #934 Codex review）。
// - 'neck_only'：修正後新紀錄使用的 key，三語都只代表頸部。
// 用新 key 當分界而不是日期：正式部署日無法事先確定，日期分界會讓部署前後的紀錄被錯標。
// 鼠蹊若需要記錄，應另開新 key，不要再和頸部共用。
const injectionSiteLabel = (site: string | null) => {
  if (site === 'neck_only') return { id: 'Leher', zh: '頸部', en: 'Neck' }
  if (site === 'neck') return { id: 'Leher atau selangkangan (catatan lama)', zh: '頸部或鼠蹊（舊紀錄）', en: 'Neck or groin (older record)' }
  if (site === 'abdomen') return { id: 'Perut', zh: '腹部' ,en: "Abdomen" }
  if (site === 'flank') return { id: 'Samping', zh: '側腰' ,en: "Flank" }
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
      // 驗證體積提示英文修正
      setMessage(text({ id: 'Masukkan volume cairan.', zh: '請輸入液體體積。' ,en: "Please enter the fluid volume." }))
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
      setMessage(text({ id: 'Tidak dapat menyimpan. Coba lagi.', zh: '暫時無法儲存，請再試一次。' ,en: "Could not save. Please try again." }))
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
            {text({ id: 'Volume cairan (ml)', zh: '液體體積（毫升）' ,en: "Fluid volume (ml)" })}
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
            {text({ id: 'Lokasi injeksi', zh: '注射部位' ,en: "Injection site" })}
          </label>
          <select
            value={formData.injectionSite}
            onChange={e => handleInputChange('injectionSite', e.target.value)}
            className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2.5"
          >
            <option value="">{text({ id: '(Opsional)', zh: '（可不填）' ,en: "(Optional)" })}</option>
            {/* 新紀錄一律寫 neck_only；舊 key 'neck' 只用於顯示歷史紀錄，不再提供選擇。 */}
            <option value="neck_only">{text(injectionSiteLabel('neck_only'))}</option>
            <option value="abdomen">{text({ id: 'Perut', zh: '腹部' ,en: "Abdomen" })}</option>
            <option value="flank">{text({ id: 'Samping', zh: '側腰' ,en: "Flank" })}</option>
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
        {/* 今日紀錄標題與空狀態英文修正 */}
        <h3 className="text-sm font-bold text-gray-800">{text({ id: 'Catatan hari ini', zh: '今天的紀錄' ,en: "Today's records" })}</h3>
        {loading ? (
          <p className="mt-2 text-sm text-gray-500">{text({ id: 'Memuat…', zh: '讀取中…' ,en: "Loading…" })}</p>
        ) : todayRecords.length === 0 ? (
          <p className="mt-2 text-sm text-gray-500">{text({ id: 'Belum ada catatan hari ini.', zh: '今天還沒有紀錄。' ,en: "No records for today yet." })}</p>
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
