/*
檔案用途：提供被照護者每日體重的讀取與新增／更新操作。
所在層：src/features/vitals/pages；可獨立呈現，也可嵌入每日照護的體重區段。
主要關聯：patient_weight_measurement_records、DailyCarePage、lib/weight 與 Supabase RLS。
*/
import { lazy, useEffect, useState } from 'react'
import dayjs from 'dayjs'
import timezone from 'dayjs/plugin/timezone'
import { supabase } from '../../../lib/supabase'
import { useI18n } from '../../../lib/i18n'
import { firstEmptyWeightMeasurement, formatWeightKg, isValidWeightInput, isWeightMeasurementNumber, roundWeightKg, taipeiWeightDate, WEIGHT_INPUT_STEP, WEIGHT_MAX_KG, WEIGHT_MEASUREMENT_NUMBERS, WEIGHT_MEASUREMENTS_PER_DAY, WEIGHT_MIN_KG, type WeightMeasurementNumber } from '../../../lib/weight'
import { TabHeader } from '../../../components/ui/TabHeader'
import { TZ } from '../../../lib/timezone'
import { isDemoMode, readDemoWeightRecords, saveDemoWeightRecord, type DemoWeightRecord } from '../../../lib/demoStorage'
import { ModuleTrendSection } from '../../../components/daily-care/ModuleTrendSection'
import { useSaveStatus } from '../../../hooks/useSaveStatus'

dayjs.extend(timezone)

// 圖表套件只在照護者展開趨勢時才下載，不進入每日照護的初始載入路徑。
const WeightTrendPanel = lazy(() => import('../components/WeightTrendPanel').then(m => ({ default: m.WeightTrendPanel })))

interface WeightMeasurementRecord {
  id: string
  patient_id: string
  weight_kg: number
  measured_on: string
  measurement_number: WeightMeasurementNumber
  measured_at: string
}

export function WeightPage({ patientId, patientName, userEmail, embedded = false }: {
  patientId: string
  patientName?: string
  userEmail?: string
  embedded?: boolean
}) {
  const { text } = useI18n()
  const [loadError, setLoadError] = useState(false)
  const [weight, setWeight] = useState<number | ''>('')
  // 槽位編號改為內部實作細節。使用者只會遇到兩種狀態：記錄一筆新的（null），
  // 或修改今天某一筆既有紀錄（該筆的槽位編號）。原本要求先從 12 顆按鈕選「第幾次」，
  // 但「第 7 次」對照護者沒有語意——體重不像血壓的早中晚有臨床意義。
  const [editingMeasurement, setEditingMeasurement] = useState<WeightMeasurementNumber | null>(null)
  const [todayRecords, setTodayRecords] = useState<Partial<Record<WeightMeasurementNumber, WeightMeasurementRecord>>>({})
  const [recent, setRecent] = useState<WeightMeasurementRecord[]>([])
  // 讀取狀態（頁面初次載入）跟送出狀態（存這一筆體重）本來是同一顆 status，兩件事混在一起判讀容易出錯；
  // 拆開後讀取用 loading，送出交給共用的 useSaveStatus，跟 FluidBalancePage／PetEndocrinePage 一致。
  const [loading, setLoading] = useState(true)
  const { status, message: error, begin, succeed, fail, reset } = useSaveStatus()

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    reset()
    if (isDemoMode()) {
      // 展示模式不能碰真實資料庫；空狀態仍保留十二個槽位，讓 Demo 可驗收當日密集量測流程。
      setLoadError(false)
      const records = readDemoWeightRecords(patientId) as WeightMeasurementRecord[]
      const currentDayRecords = records.reduce<Partial<Record<WeightMeasurementNumber, WeightMeasurementRecord>>>((result, record) => {
        if (record.measured_on === taipeiWeightDate() && isWeightMeasurementNumber(record.measurement_number)) result[record.measurement_number] = record
        return result
      }, {})
      setTodayRecords(currentDayRecords)
      setRecent(records)
      // 進來一律是「記錄新的一筆」，欄位留白；要改舊紀錄由下方清單點選。
      setEditingMeasurement(null)
      setWeight('')
      setLoading(false)
      return () => { cancelled = true }
    }
    void supabase.from('patient_weight_measurement_records')
      .select('id, patient_id, weight_kg, measured_on, measurement_number, measured_at')
      .eq('patient_id', patientId)
      .order('measured_on', { ascending: false })
      // 同一天內也要最新的量測在最上面，與血壓／體溫清單一致；槽位編號只是內部細節，不該決定閱讀順序。
      .order('measured_at', { ascending: false })
      .limit(16)
      .then(({ data, error: fetchError }) => {
        if (cancelled) return
        if (fetchError) {
          console.error('[weight fetch error]', fetchError)
          setLoadError(true)
          setLoading(false)
          return
        }
        const records = (data ?? []) as WeightMeasurementRecord[]
        const currentDayRecords = records.reduce<Partial<Record<WeightMeasurementNumber, WeightMeasurementRecord>>>((result, record) => {
          if (record.measured_on === taipeiWeightDate() && isWeightMeasurementNumber(record.measurement_number)) result[record.measurement_number] = record
          return result
        }, {})
        setLoadError(false)
        setTodayRecords(currentDayRecords)
        setRecent(records)
        // 進來一律是「記錄新的一筆」，欄位留白；要改舊紀錄由下方清單點選。
        setEditingMeasurement(null)
        setWeight('')
        setLoading(false)
      })
    return () => { cancelled = true }
    // reset 來自 useSaveStatus 的 useCallback，identity 穩定；這個 effect 只該在切換照護對象時重跑。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patientId])

  // 目前這一筆要寫進哪個槽位：修改既有紀錄時沿用該筆的槽位，否則取今天第一個空槽。
  const selectedMeasurement = editingMeasurement ?? firstEmptyWeightMeasurement(todayRecords)

  const startEdit = (record: WeightMeasurementRecord) => {
    setEditingMeasurement(record.measurement_number)
    setWeight(record.weight_kg)
    reset()
  }

  const cancelEdit = () => {
    setEditingMeasurement(null)
    setWeight('')
    reset()
  }

  const save = async () => {
    if (!userEmail || !isValidWeightInput(weight) || status === 'saving') return
    begin()
    if (isDemoMode()) {
      // 更新既有槽位要沿用原 ID，否則 localStorage 會同時留下新舊兩筆相同槽位。
      const record: DemoWeightRecord = { id: todayRecords[selectedMeasurement]?.id ?? `demo-weight-${Date.now()}`, patient_id: patientId, weight_kg: roundWeightKg(weight), measured_on: taipeiWeightDate(), measurement_number: selectedMeasurement, measured_at: new Date().toISOString() }
      saveDemoWeightRecord(record)
      const updated = { ...todayRecords, [selectedMeasurement]: record }
      setTodayRecords(updated)
      setRecent(current => [record as WeightMeasurementRecord, ...current.filter(item => item.id !== record.id)])
      // 存完一律回到「記錄新的一筆」；下一個空槽由 selectedMeasurement 自己算出來。
      setEditingMeasurement(null)
      setWeight('')
      succeed('')
      return
    }
    const currentRecord = todayRecords[selectedMeasurement]
    const payload = { patient_id: patientId, profile_email: userEmail.toLowerCase(), weight_kg: roundWeightKg(weight), measured_on: taipeiWeightDate(), measurement_number: selectedMeasurement, measured_at: new Date().toISOString(), recorded_by: userEmail.toLowerCase() }
    const saveRequest = currentRecord
      ? supabase.from('patient_weight_measurement_records').update(payload).eq('id', currentRecord.id)
      : supabase.from('patient_weight_measurement_records').insert(payload)
    const { data, error: saveError } = await saveRequest.select('id, patient_id, weight_kg, measured_on, measurement_number, measured_at').single()
    if (saveError) {
      // 空槽位由唯一鍵保護；競態失敗時不覆蓋別台裝置的讀值，讓照護者重新讀取後再選槽位。
      console.error('[weight save error]', saveError)
      fail(text({ id: 'Tidak dapat menyimpan berat badan.', zh: '體重儲存失敗，請重新讀取後再試。', en: 'Unable to saving berat baand.' }))
      return
    }
    const record = data as WeightMeasurementRecord
    const updated = { ...todayRecords, [selectedMeasurement]: record }
    setTodayRecords(updated)
    setRecent(current => [record, ...current.filter(item => item.id !== record.id)].sort((left, right) => right.measured_on.localeCompare(left.measured_on) || left.measurement_number - right.measurement_number))
    // 存完一律回到「記錄新的一筆」；下一個空槽由 selectedMeasurement 自己算出來。
    setEditingMeasurement(null)
    setWeight('')
    succeed('')
  }

  const todayCount = Object.keys(todayRecords).length
  const editingRecord = editingMeasurement === null ? undefined : todayRecords[editingMeasurement]
  // 依實際量測時間排序，而不是槽位編號；且與血壓、體溫、最近紀錄同一規則，最新量測排最上面，不必捲到底才看到剛量的那筆。
  const todayEntries = WEIGHT_MEASUREMENT_NUMBERS
    .map(number => todayRecords[number])
    .filter((record): record is WeightMeasurementRecord => Boolean(record))
    .sort((left, right) => Date.parse(right.measured_at) - Date.parse(left.measured_at))
  const title = patientName || text({ id: 'Orang yang dirawat', zh: '被照護者', en: 'Person that dirawat' })
  // 照護頁是體重的唯一入口；最近紀錄也必須留在同一區段，避免輸入與歷史被誤認為兩套功能。
  return <section className={embedded ? 'rounded-3xl border border-slate-200 bg-white p-4 shadow-sm' : 'min-h-full bg-gray-50 px-5 py-5 text-gray-900'}>
    {!embedded && <header><TabHeader title="weight" /></header>}
    <div className={embedded ? '' : 'mt-5 rounded-2xl bg-white p-4 shadow-sm'}>
      <h2 className="text-base font-extrabold text-slate-950">{text({ id: 'Berat badan hari ini', zh: '今天體重', en: 'Today’s weight' })}</h2>
      <p className="mt-1 text-xs text-slate-500">{title}</p>
      <label htmlFor="weight-kg" className="mt-3 block text-sm font-semibold text-gray-600">{text({ id: 'Berat (kg)', zh: '體重（公斤）', en: 'Berat (kg)' })}</label>
      {/* 正在修改哪一筆用時間表達，不用槽位編號——照護者記得的是「早上量的那次」，不是「第 3 次」。 */}
      {editingRecord && <p className="mt-1 text-sm font-bold text-blue-800">
        {text({
          id: `Mengubah catatan pukul ${dayjs(editingRecord.measured_at).tz(TZ).format('HH:mm')}`,
          zh: `正在修改 ${dayjs(editingRecord.measured_at).tz(TZ).format('HH:mm')} 的紀錄`,
         en: `Editing the record from ${dayjs(editingRecord.measured_at).tz(TZ).format('HH:mm')}`,
        })}
      </p>}
      <div className="mt-2 flex items-center gap-3"><input id="weight-kg" type="number" inputMode="decimal" min={WEIGHT_MIN_KG} max={WEIGHT_MAX_KG} step={WEIGHT_INPUT_STEP} value={weight} disabled={status === 'saving'} onChange={event => setWeight(event.target.value === '' ? '' : Number(event.target.value))} className="min-w-0 flex-1 rounded-xl border border-gray-200 px-4 py-3 text-2xl font-bold tabular-nums focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200" /><span className="text-lg font-bold text-gray-500">kg</span></div>
      <div className="mt-3 flex gap-2">
        <button type="button" disabled={!userEmail || !isValidWeightInput(weight) || status === 'saving' || (!editingRecord && todayCount >= WEIGHT_MEASUREMENTS_PER_DAY)} onClick={save} className="min-h-11 flex-1 rounded-xl bg-blue-700 px-4 py-3 font-bold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:bg-gray-300">{status === 'saving' ? text({ id: 'Menyimpan…', zh: '儲存中…', en: 'Saving...' }) : editingRecord ? text({ id: 'Perbarui catatan', zh: '更新這筆', en: 'Update this' }) : todayCount >= WEIGHT_MEASUREMENTS_PER_DAY ? text({ id: 'Batas hari ini tercapai', zh: '今天已達記錄上限', en: 'Record limit reached today' }) : text({ id: 'Simpan berat badan', zh: '儲存體重', en: 'Save weight' })}</button>
        {editingRecord && <button type="button" onClick={cancelEdit} disabled={status === 'saving'} className="min-h-11 rounded-xl border border-gray-300 bg-white px-4 font-bold text-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-60">{text({ id: 'Batal', zh: '取消', en: 'CANCEL' })}</button>}
      </div>
      {status === 'ok' && <p role="status" className="mt-2 text-sm font-semibold text-green-700">{text({ id: 'Berat badan tersimpan.', zh: '體重已儲存。', en: 'Weight saved.' })}</p>}
      {(loadError || error) && <p role="alert" className="mt-2 text-sm font-semibold text-red-700">{loadError ? text({ id: 'Tidak dapat memuat berat badan.', zh: '目前無法讀取體重紀錄。', en: 'Unable to loading berat baand.' }) : error}</p>}

      {/* 今天的紀錄直接可點修改，與血壓、體溫的當日清單同一種操作方式。
          原本要改今天量過的某一筆，得先按「更改量測次數」再從 12 顆按鈕裡找出正確的那一顆。 */}
      {todayEntries.length > 0 && <div className="mt-4 border-t border-slate-100 pt-3">
        <h3 className="text-sm font-bold text-slate-700">{text({ id: 'Catatan hari ini', zh: '今天的紀錄', en: 'Today’s Record' })}</h3>
        <ul className="mt-2 space-y-1">
          {todayEntries.map(record => <li key={record.id} className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2 text-sm">
            <span className="flex items-baseline gap-2">
              <time className="text-xs text-slate-500">{dayjs(record.measured_at).tz(TZ).format('HH:mm')}</time>
              <strong className="text-base font-black text-blue-800">{formatWeightKg(record.weight_kg)} kg</strong>
            </span>
            <button type="button" onClick={() => startEdit(record)} disabled={status === 'saving'} className="min-h-11 rounded-xl border border-blue-200 bg-white px-3 text-xs font-bold text-blue-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-60">{text({ id: 'Ubah', zh: '修改', en: 'Modification' })}</button>
          </li>)}
        </ul>
      </div>}
    </div>
    {/* 「最近紀錄」跨多天、不只今天，先前遺漏在這裡仍顯示槽位編號，
        與本次修正的目標（槽位編號不再出現在畫面上）矛盾；日期與時間已足夠識別每一筆，直接拿掉槽位文字。 */}
    <div className="mt-5 border-t border-slate-100 pt-4"><h2 className="font-bold">{text({ id: 'Riwayat terakhir', zh: '最近紀錄', en: 'Last log' })}</h2>{loading ? <p className="mt-3 text-sm text-gray-400">{text({ id: 'Memuat…', zh: '讀取中…', en: 'Loading…' })}</p> : recent.length === 0 ? <p className="mt-3 text-sm text-gray-400">{text({ id: 'Belum ada catatan.', zh: '還沒有紀錄。', en: 'Not yet ada record.' })}</p> : <ul className="mt-3 divide-y divide-gray-100">{recent.map(record => <li key={record.id} className="flex items-center justify-between gap-3 py-2 text-sm"><span><span className="block">{record.measured_on}</span><time className="block text-xs text-gray-400">{text({ id: 'Waktu input', zh: '輸入時間', en: 'Time input' })} {dayjs(record.measured_at).tz(TZ).format('HH:mm')}</time></span><span className="font-bold text-blue-700">{formatWeightKg(record.weight_kg)} kg</span></li>)}</ul>}</div>
    {/* 體重變化是醫師最常問的指標之一，原本全 App 卻沒有任何地方畫得出來。 */}
    <ModuleTrendSection moduleId="weight" titleId="weight-module-trend-title">
      {days => <WeightTrendPanel patientId={patientId} days={days} />}
    </ModuleTrendSection>
  </section>
}
