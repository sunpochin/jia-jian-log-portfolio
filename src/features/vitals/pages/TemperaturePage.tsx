/*
檔案用途：提供每日照護中的體溫輸入、24 筆額度提示與近期紀錄修正。
所在層：src/features/vitals/pages；與血壓輸入共用病人切換與 Supabase 授權邊界。
主要關聯：DailyCarePage、useTemperatureRecords、temperature 規則與 body_temperature_records。
*/
import { lazy, useEffect, useMemo, useState } from 'react'
import dayjs from 'dayjs'
import timezone from 'dayjs/plugin/timezone'
import utc from 'dayjs/plugin/utc'
import { TabHeader } from '../../../components/ui/TabHeader'
import { ModuleTrendSection } from '../../../components/daily-care/ModuleTrendSection'
import type { PatientIdentity, Subject } from '../../../lib/auth'
import type { TemperatureRecord } from '../../../types/database'
import { isDemoMode, deleteDemoTemperatureRecord, saveDemoTemperatureRecord, updateDemoTemperatureRecord } from '../../../lib/demoStorage'
import { useI18n } from '../../../lib/i18n'
import { supabase } from '../../../lib/supabase'
import { TZ } from '../../../lib/timezone'
import { getTemperatureStatus, isTemperatureInputFormat, isValidTemperatureInput, TEMPERATURE_CONTEXT_LABELS, TEMPERATURE_DAILY_LIMIT, TEMPERATURE_QUOTA_WARNING_MARGIN, TEMPERATURE_SITE_LABELS, TEMPERATURE_SITES, temperatureErrorMessage, temperatureStatusLabel, temperatureStatusTone, TEMPERATURE_CONTEXTS, type TemperatureContext, type TemperatureSite } from '../../../lib/temperature'
import { usePwaUpdateGuard } from '../../../lib/pwaUpdateGuard'
import { useTemperatureRecords } from '../../../hooks/useTemperatureRecords'
import { useConfirm } from '../../../hooks/useConfirm'

dayjs.extend(utc)
dayjs.extend(timezone)

type TemperatureDraft = Pick<TemperatureRecord, 'temperature_c' | 'measurement_site' | 'context' | 'notes'>

// 繁體中文註解：體溫頁與血壓頁同時掛載，必須用自己的來源鍵保護未保存輸入。
const UNSAVED_INPUT_SOURCE = 'body-temperature'

// 與血壓同樣的理由：圖表套件只在展開趨勢時才下載，不進入每日照護的初始載入路徑。
const TemperatureTrend = lazy(() => import('../components/TemperatureTrend').then(m => ({ default: m.TemperatureTrend })))

const toneClasses = {
  normal: 'border-emerald-200 bg-emerald-50 text-emerald-900',
  warning: 'border-orange-200 bg-orange-50 text-orange-950',
  danger: 'border-red-200 bg-red-50 text-red-950',
} as const

export function TemperaturePage({ patientId, patientName, userEmail, embedded = false }: {
  subject: Subject
  patientId: string
  patientName?: string
  availablePatients: PatientIdentity[]
  userEmail?: string
  onSubjectSelect: (subject: Subject) => void
  embedded?: boolean
}) {
  const { locale, text } = useI18n()
  const { confirm, dialog: confirmDialog } = useConfirm()
  const { registerUnsavedInput } = usePwaUpdateGuard()
  const { records, loading, error, refetch } = useTemperatureRecords(24, patientId)
  const [temperature, setTemperature] = useState<number | ''>('')
  const [site, setSite] = useState<TemperatureSite>('ear')
  const [context, setContext] = useState<TemperatureContext>('symptoms')
  const [notes, setNotes] = useState('')
  const [temperatureInputError, setTemperatureInputError] = useState(false)
  const [status, setStatus] = useState<'idle' | 'saving' | 'ok' | 'err'>('idle')
  const [message, setMessage] = useState('')
  const [feverAnnouncement, setFeverAnnouncement] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState<TemperatureDraft | null>(null)
  const [temperatureEditInputError, setTemperatureEditInputError] = useState(false)
  const [formPatientId, setFormPatientId] = useState(patientId)

  useEffect(() => {
    registerUnsavedInput(UNSAVED_INPUT_SOURCE, temperature !== '' || notes.trim() !== '')
    return () => registerUnsavedInput(UNSAVED_INPUT_SOURCE, false)
  }, [notes, registerUnsavedInput, temperature])

  useEffect(() => {
    if (formPatientId === patientId) return
    // 病人切換後清空草稿；否則下一次儲存可能把上一位病人的體溫寫到新病人名下。
    setFormPatientId(patientId)
    setTemperature('')
    setTemperatureInputError(false)
    setSite('ear')
    setContext('symptoms')
    setNotes('')
    setEditingId(null)
    setDraft(null)
    setTemperatureEditInputError(false)
    setStatus('idle')
    setMessage('')
    setFeverAnnouncement('')
    registerUnsavedInput(UNSAVED_INPUT_SOURCE, false)
  }, [formPatientId, patientId, registerUnsavedInput])

  const todayStart = dayjs().tz(TZ).startOf('day').valueOf()
  // 額度提示沿用伺服器 created_at 的日界線，避免照護者回填舊量測時間時看到錯誤的剩餘筆數。
  const todayRecords = useMemo(
    () => records.filter(record => Date.parse(record.created_at) >= todayStart),
    [records, todayStart],
  )
  const latest = records[0] ?? null
  const latestStatus = latest ? getTemperatureStatus(latest.temperature_c) : null
  const selectedStatus = typeof temperature === 'number' && isValidTemperatureInput(temperature) ? getTemperatureStatus(temperature) : null
  // 格式檢查（temperatureInputError）只用於顯示提示，不禁用按鈕；
  // 因為輸入層已經擋住不符格式的值，不應再因為格式錯誤而 disable 提交。
  const canSubmit = formPatientId === patientId && typeof temperature === 'number' && isValidTemperatureInput(temperature) && status !== 'saving' && todayRecords.length < TEMPERATURE_DAILY_LIMIT

  const handleTemperatureInputChange = (value: string) => {
    if (!isTemperatureInputFormat(value)) {
      setTemperatureInputError(true)
      return
    }
    setTemperatureInputError(false)
    setTemperature(value === '' ? '' : Number(value))
  }

  const save = async () => {
    if (!canSubmit || typeof temperature !== 'number') {
      setMessage(text({ id: `Masukkan suhu ${30}–${45}°C dengan satu angka desimal.`, zh: '請輸入 30–45°C、最多一位小數的體溫。' ,en: `Enter a temperature from ${30}–${45}°C with one decimal place.` }))
      setStatus('err')
      return
    }
    setStatus('saving')
    setMessage('')
    setFeverAnnouncement('')
    const measuredAt = dayjs().tz(TZ).toISOString()
    const payload = {
      patient_id: patientId,
      temperature_c: temperature,
      measurement_site: site,
      context,
      notes: notes.trim() || null,
      measured_at: measuredAt,
    }
    try {
      if (isDemoMode()) {
        saveDemoTemperatureRecord(payload)
      } else {
        const { error: insertError } = await supabase.from('body_temperature_records').insert({
          ...payload,
          source: 'manual_web',
          recorded_by: userEmail?.toLowerCase() ?? '',
        })
        if (insertError) throw insertError
      }
      setTemperature('')
      setTemperatureInputError(false)
      setNotes('')
      setStatus('ok')
      setMessage(text({ id: '✓ Suhu tersimpan', zh: '✓ 體溫已記錄' ,en: '✓ Temperature recorded' }))
      await refetch()
      if (selectedStatus === 'fever' || selectedStatus === 'high-fever') {
        // 儲存後的發燒警示是新出現的照護資訊，需用獨立 live region 主動通知讀屏器；初次載入舊紀錄則不重複打擾。
        setFeverAnnouncement(text({
          id: 'Peringatan demam baru tersimpan. Periksa gejala dan cari bantuan medis bila tanda bahaya muncul.',
          zh: '新的發燒警示已記錄；請檢查症狀，若出現危險徵兆請儘速就醫。' ,en: 'New fever alerts have been recorded; check for symptoms and seek medical attention as soon as possible if signs of danger appear.'
        }))
      }
      window.setTimeout(() => setStatus('idle'), 1_500)
    } catch (saveError) {
      console.error('[body temperature save error]', saveError)
      setStatus('err')
      setMessage(temperatureErrorMessage(saveError, locale))
    }
  }

  const startEdit = (record: TemperatureRecord) => {
    setEditingId(record.id)
    setDraft({ temperature_c: record.temperature_c, measurement_site: record.measurement_site, context: record.context, notes: record.notes })
    setTemperatureEditInputError(false)
    setMessage('')
  }

  const handleDraftTemperatureInputChange = (value: string) => {
    if (!isTemperatureInputFormat(value)) {
      // 編輯路徑也要即時拒絕第二位小數，否則新增與修改會給照護者兩套不一致的規則。
      setTemperatureEditInputError(true)
      return
    }
    setTemperatureEditInputError(false)
    setDraft(current => current ? { ...current, temperature_c: value === '' ? Number.NaN : Number(value) } : current)
  }

  const saveEdit = async (record: TemperatureRecord) => {
    if (!draft || temperatureEditInputError || !isValidTemperatureInput(draft.temperature_c)) {
      setStatus('err')
      setMessage(text({ id: 'Periksa kembali angka suhu.', zh: '請重新確認體溫數字。' ,en: 'Periksa back numbers temperature.' }))
      return
    }
    try {
      if (isDemoMode()) {
        if (!updateDemoTemperatureRecord(record.id, patientId, draft)) throw new Error('Demo body temperature record not found')
      } else {
        const { error: updateError } = await supabase.from('body_temperature_records').update({ ...draft, notes: draft.notes?.trim() || null }).eq('id', record.id).eq('patient_id', patientId)
        if (updateError) throw updateError
      }
      setEditingId(null)
      setDraft(null)
      setTemperatureEditInputError(false)
      setStatus('ok')
      setMessage(text({ id: 'Catatan suhu diperbarui.', zh: '體溫紀錄已更新。' ,en: 'Record temperature diUpdate.' }))
      await refetch()
    } catch (updateError) {
      console.error('[body temperature update error]', updateError)
      setStatus('err')
      setMessage(temperatureErrorMessage(updateError, locale))
    }
  }

  const remove = async (record: TemperatureRecord) => {
    if (!(await confirm(text({ id: 'Hapus catatan suhu ini? Tindakan ini tidak dapat dibatalkan.', zh: '確定刪除這筆體溫紀錄嗎？此操作無法復原。' ,en: 'Delete record temperature this? Tindakan this not can dibatalkan.' }), { danger: true }))) return
    try {
      if (isDemoMode()) {
        if (!deleteDemoTemperatureRecord(record.id, patientId)) throw new Error('Demo body temperature record not found')
      } else {
        const { error: deleteError } = await supabase.from('body_temperature_records').delete().eq('id', record.id).eq('patient_id', patientId)
        if (deleteError) throw deleteError
      }
      setStatus('ok')
      setMessage(text({ id: 'Catatan suhu dihapus.', zh: '體溫紀錄已刪除。' ,en: 'Record temperature deleted.' }))
      await refetch()
    } catch (deleteError) {
      console.error('[body temperature delete error]', deleteError)
      setStatus('err')
      setMessage(text({ id: 'Catatan tidak dapat dihapus. Coba lagi.', zh: '無法刪除體溫紀錄，請再試一次。' ,en: 'Unable to delete temperature record, please try again.' }))
    }
  }

  // 繁體中文註解：每日照護會把本頁嵌入共同的 main；只有獨立頁才建立 landmark，避免螢幕閱讀器遇到巢狀 main。
  const Content = embedded ? 'div' : 'main'

  return (
    <div className="flex min-h-full flex-col bg-slate-50 text-slate-900">
      {confirmDialog}
      {!embedded && <header className="px-5 pt-5 pb-2"><TabHeader title="temperature" /></header>}
      <header className={`${embedded ? 'pt-1' : ''} shrink-0 px-5 pb-2`}>
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-orange-700">{text({ id: 'Suhu tubuh', zh: '體溫' ,en: 'Temperature tubuh' })}</p>
            <h2 className="mt-1 text-xl font-extrabold text-slate-950">{patientName || text({ id: 'Orang yang diukur', zh: '量測對象' ,en: 'Person that diukur' })}</h2>
          </div>
          {/* 24 筆是防爆上限，一般照護一天量兩三次永遠碰不到。
              常駐顯示等於每天提醒一件使用者不需要在意的事，還會製造「是不是快用完了」的焦慮。
              只有真的接近上限時才出現。 */}
          {todayRecords.length >= TEMPERATURE_DAILY_LIMIT - TEMPERATURE_QUOTA_WARNING_MARGIN && (
            <span className="rounded-full border border-orange-200 bg-orange-50 px-3 py-1 text-xs font-black text-orange-900" aria-label={text({ id: 'Batas catatan hari ini', zh: '今日紀錄上限' ,en: 'Today’s Record Cap' })}>
              {todayRecords.length}/{TEMPERATURE_DAILY_LIMIT}
            </span>
          )}
        </div>
        {latest && <p className="mt-2 text-sm text-slate-600">{text({ id: 'Terakhir', zh: '最近一次' ,en: 'Last' })}：<strong className="text-2xl text-orange-700">{latest.temperature_c.toFixed(1)}°C</strong> · {dayjs(latest.measured_at).tz(TZ).format('MM/DD HH:mm')}</p>}
      </header>

      <Content className="space-y-3 px-5 pb-5 pt-2">
        {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-800">{error}</p>}
        <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm" aria-labelledby="temperature-form-title">
          <div className="flex items-center justify-between gap-3">
            <h2 id="temperature-form-title" className="text-base font-extrabold text-slate-950">{text({ id: 'Catat suhu sekarang', zh: '記錄現在體溫' ,en: 'Catat temperature current' })}</h2>
            <span className="text-xs font-semibold text-slate-500">°C</span>
          </div>
          <label htmlFor="body-temperature" className="mt-3 block text-sm font-bold text-slate-700">{text({ id: 'Suhu tubuh', zh: '體溫' ,en: 'Temperature tubuh' })}</label>
          <div className="mt-1 flex items-center gap-2">
            <input
              id="body-temperature"
              type="number"
              inputMode="decimal"
              min={30}
              max={45}
              step={0.1}
              value={temperature}
              onChange={event => handleTemperatureInputChange(event.target.value)}
              onKeyDown={event => { if (event.key === 'Enter') void save() }}
              className="min-h-16 min-w-0 flex-1 rounded-2xl border-2 border-orange-200 bg-orange-50 px-4 text-center text-4xl font-black tabular-nums text-orange-800 outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-300"
              aria-describedby={temperatureInputError ? 'temperature-range-hint temperature-input-error' : 'temperature-range-hint'}
              aria-invalid={temperatureInputError}
            />
            <span className="text-xl font-black text-slate-500">°C</span>
          </div>
          <p id="temperature-range-hint" className="mt-1 text-xs text-slate-500">{text({ id: 'Gunakan satu angka desimal.', zh: '請輸入最多一位小數。' ,en: 'Gunakan one numbers desimal.' })}</p>
          {temperatureInputError && <p id="temperature-input-error" role="alert" className="mt-1 text-xs font-bold text-red-700">{text({ id: 'Gunakan maksimal satu angka setelah titik desimal.', zh: '小數點後最多只能輸入一位。' ,en: 'Only one decimal place can be entered.' })}</p>}

          <fieldset className="mt-4">
            <label htmlFor="temperature-site" className="text-sm font-bold text-slate-700">{text({ id: 'Lokasi pengukuran', zh: '測量部位' ,en: 'Measurement part' })}</label>
            <select id="temperature-site" value={site} onChange={event => setSite(event.target.value as TemperatureSite)} className="mt-2 w-full min-h-11 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-bold text-slate-700 outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-300">
              {TEMPERATURE_SITES.map(option => <option key={option} value={option}>{text(TEMPERATURE_SITE_LABELS[option])}</option>)}
            </select>
          </fieldset>
          {site === 'oral' && <p className="mt-2 rounded-xl bg-amber-50 p-2 text-xs font-semibold text-amber-900">{text({ id: 'Tunggu 15 menit setelah makan atau minum sebelum mengukur lewat mulut.', zh: '口溫量測前，吃喝後請先等 15 分鐘。' ,en: 'Wait 15 minutes after eating and drinking before measuring the oral temperature.' })}</p>}

          <fieldset className="mt-4">
            <label htmlFor="temperature-context" className="text-sm font-bold text-slate-700">{text({ id: 'Konteks', zh: '量測情境' ,en: 'Konteks' })}</label>
            <select id="temperature-context" value={context} onChange={event => setContext(event.target.value as TemperatureContext)} className="mt-2 w-full min-h-11 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-bold text-slate-700 outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-300">
              {TEMPERATURE_CONTEXTS.map(option => <option key={option} value={option}>{text(TEMPERATURE_CONTEXT_LABELS[option])}</option>)}
            </select>
          </fieldset>

          <label htmlFor="temperature-notes" className="mt-4 block text-sm font-bold text-slate-700">{text({ id: 'Catatan (opsional)', zh: '備註（可不填）' ,en: 'Notes (optional)' })}</label>
          <textarea id="temperature-notes" value={notes} maxLength={240} onChange={event => setNotes(event.target.value)} rows={2} className="mt-1 w-full resize-none rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-300" />

          <button type="button" onClick={() => void save()} disabled={!canSubmit} className={`mt-4 min-h-14 w-full rounded-2xl px-4 py-3 text-lg font-black text-white transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-orange-300 disabled:opacity-50 ${selectedStatus && temperatureStatusTone(selectedStatus) === 'danger' ? 'bg-red-600' : selectedStatus && temperatureStatusTone(selectedStatus) === 'warning' ? 'bg-orange-600' : 'bg-indigo-700'}`}>
            {status === 'saving' ? text({ id: 'Menyimpan…', zh: '儲存中…' ,en: 'Saving...' }) : text({ id: 'Simpan suhu', zh: '儲存體溫' ,en: 'Storage Temperature' })}
          </button>
          {status !== 'idle' && message && <p role={status === 'err' ? 'alert' : 'status'} aria-live={status === 'err' ? 'assertive' : 'polite'} className={`mt-2 text-center text-sm font-bold ${status === 'err' ? 'text-red-700' : 'text-emerald-700'}`}>{message}</p>}
          {feverAnnouncement && <p role="status" aria-live="assertive" className="sr-only">{feverAnnouncement}</p>}
        </section>

        {latestStatus && (latestStatus === 'fever' || latestStatus === 'high-fever') && (
          <aside aria-labelledby="temperature-fever-notice-title" className={`rounded-2xl border p-4 text-sm leading-relaxed ${toneClasses[temperatureStatusTone(latestStatus)]}`}>
            <p id="temperature-fever-notice-title" className="font-black">{text(temperatureStatusLabel(latestStatus))}</p>
            <p className="mt-1">{text({ id: 'Jika ada sesak napas, nyeri dada, bibir kebiruan, kebingungan, atau demam tinggi lebih dari 72 jam, segera cari pertolongan medis.', zh: '若有呼吸困難、胸痛、嘴唇發紫、意識改變，或高燒持續超過 72 小時，請儘速就醫。' ,en: 'If ada sesak napas, nyeri dada, bibir kebiruan, kebingungan, or demam tinggi more from 72 jam, promptly cari pertolongan medis.' })}</p>
          </aside>
        )}

        <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm" aria-labelledby="today-temperature-records-title">
          <div className="flex items-center justify-between gap-3">
            <div><h2 id="today-temperature-records-title" className="font-extrabold text-slate-950">{text({ id: 'Catatan hari ini', zh: '今天的體溫紀錄' ,en: 'Today’s Temperature Record' })}</h2><p className="mt-1 text-xs text-slate-500">{text({ id: 'Catatan baru dihitung untuk batas hari ini.', zh: '只計算今天新增的紀錄。' ,en: 'Only records added today are counted.' })}</p></div>
            {/* 平常只顯示今天已記錄幾筆；接近上限才把分母一起顯示出來，讓提示真的代表「要注意了」。 */}
            <span className="text-sm font-black text-slate-700">
              {todayRecords.length >= TEMPERATURE_DAILY_LIMIT - TEMPERATURE_QUOTA_WARNING_MARGIN
                ? `${todayRecords.length}/${TEMPERATURE_DAILY_LIMIT}`
                : todayRecords.length}
            </span>
          </div>
          {loading && <p className="mt-3 text-sm text-slate-500">{text({ id: 'Memuat…', zh: '載入中…' ,en: 'Loading…' })}</p>}
          {!loading && todayRecords.length === 0 && <p className="mt-3 text-sm text-slate-500">{text({ id: 'Belum ada catatan suhu hari ini.', zh: '今天還沒有體溫紀錄。' ,en: 'There is no temperature record for today.' })}</p>}
          <ol className="mt-3 space-y-2">
            {todayRecords.map(record => {
              const recordStatus = getTemperatureStatus(record.temperature_c)
              if (editingId === record.id && draft) return <li key={record.id} className="rounded-2xl border border-indigo-200 bg-indigo-50 p-3">
                <div className="grid grid-cols-[1fr_auto] items-center gap-2">
                  <input
                    aria-label={text({ id: 'Suhu tubuh', zh: '體溫' ,en: 'Temperature tubuh' })}
                    type="number"
                    step={0.1}
                    min={30}
                    max={45}
                    value={Number.isNaN(draft.temperature_c) ? '' : draft.temperature_c}
                    onChange={event => handleDraftTemperatureInputChange(event.target.value)}
                    className="min-h-11 min-w-0 rounded-xl border border-slate-300 bg-white px-3 text-center text-xl font-black"
                    aria-describedby={temperatureEditInputError ? `temperature-edit-input-error-${record.id}` : undefined}
                    aria-invalid={temperatureEditInputError}
                  />
                  <span className="font-bold text-slate-500">°C</span>
                </div>
                {temperatureEditInputError && <p id={`temperature-edit-input-error-${record.id}`} role="alert" className="mt-1 text-xs font-bold text-red-700">{text({ id: 'Gunakan maksimal satu angka setelah titik desimal.', zh: '小數點後最多只能輸入一位。' ,en: 'Only one decimal place can be entered.' })}</p>}
                {/* 編輯表單的測量部位與情境用 select 節省空間，與主表單保持一致 */}
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <div>
                    <label htmlFor={`edit-site-${record.id}`} className="text-xs font-bold text-slate-600">{text({ id: 'Lokasi', zh: '部位' ,en: 'Lokasi' })}</label>
                    <select id={`edit-site-${record.id}`} value={draft.measurement_site} onChange={event => setDraft({ ...draft, measurement_site: event.target.value as TemperatureSite })} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs font-bold text-slate-700">
                      {TEMPERATURE_SITES.map(option => <option key={option} value={option}>{text(TEMPERATURE_SITE_LABELS[option])}</option>)}
                    </select>
                  </div>
                  <div>
                    <label htmlFor={`edit-context-${record.id}`} className="text-xs font-bold text-slate-600">{text({ id: 'Konteks', zh: '情境' ,en: "Konteks" })}</label>
                    <select id={`edit-context-${record.id}`} value={draft.context} onChange={event => setDraft({ ...draft, context: event.target.value as TemperatureContext })} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs font-bold text-slate-700">
                      {TEMPERATURE_CONTEXTS.map(option => <option key={option} value={option}>{text(TEMPERATURE_CONTEXT_LABELS[option])}</option>)}
                    </select>
                  </div>
                </div>
                <div className="mt-2 flex gap-2"><button type="button" onClick={() => void saveEdit(record)} className="min-h-11 rounded-xl bg-indigo-700 px-3 text-xs font-bold text-white">{text({ id: 'Simpan perubahan', zh: '儲存修改' ,en: 'Save Changes' })}</button><button type="button" onClick={() => { setEditingId(null); setDraft(null); setTemperatureEditInputError(false) }} className="min-h-11 rounded-xl border border-slate-300 bg-white px-3 text-xs font-bold text-slate-700">{text({ id: 'Batal', zh: '取消' ,en: 'CANCEL' })}</button></div>
              </li>
              return <li key={record.id} className="rounded-2xl bg-slate-50 p-3"><div className="flex flex-wrap items-center justify-between gap-2"><div><time className="text-xs text-slate-500">{dayjs(record.measured_at).tz(TZ).format('MM/DD HH:mm')}</time><div className="mt-0.5 flex items-baseline gap-2"><strong className={`text-2xl font-black ${recordStatus === 'normal' ? 'text-emerald-700' : recordStatus === 'low' || recordStatus === 'high-fever' ? 'text-red-700' : 'text-orange-700'}`}>{record.temperature_c.toFixed(1)}°C</strong><span className="text-xs font-bold text-slate-600">{text(temperatureStatusLabel(recordStatus))}</span></div><p className="mt-1 text-xs text-slate-500">{text(TEMPERATURE_SITE_LABELS[record.measurement_site])} · {text(TEMPERATURE_CONTEXT_LABELS[record.context])}</p>{record.notes && <p className="mt-1 text-xs text-slate-700">{record.notes}</p>}</div><div className="flex gap-2"><button type="button" onClick={() => startEdit(record)} className="min-h-11 rounded-xl border border-indigo-200 bg-white px-3 text-xs font-bold text-indigo-800">{text({ id: 'Ubah', zh: '修改' ,en: 'Modification' })}</button><button type="button" onClick={() => void remove(record)} className="min-h-11 rounded-xl border border-red-200 bg-white px-3 text-xs font-bold text-red-700">{text({ id: 'Hapus', zh: '刪除' ,en: 'DELETE' })}</button></div></div></li>
            })}
          </ol>
        </section>

        {/* 體溫趨勢原本只存在於另一個底部分頁；記錄與回顧留在同一頁，發燒的變化才看得出來。 */}
        <ModuleTrendSection moduleId="temperature" titleId="temperature-module-trend-title">
          {days => <TemperatureTrend patientId={patientId} days={days} />}
        </ModuleTrendSection>
      </Content>
    </div>
  )
}
