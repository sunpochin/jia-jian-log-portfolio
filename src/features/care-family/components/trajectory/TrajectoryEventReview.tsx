/*
檔案用途：呈現單一軌跡事件「前後最接近的血壓讀值」與展開後「事件前後 7 天回顧」表格。
所在層：src/features/care-family/components/trajectory；純呈現，回顧資料各自獨立查詢或由呼叫端傳入。
主要關聯：由 TrajectoryEventList.tsx 的一般事件列與調藥事件列共用，拆分自原 CareTimeline.tsx 的
ContextReading／EventReview（issue #735，#659 D 期：調藥事件改直接讀 change log，因此改吃 occurredAt 而非整筆 entry）。
*/
import { useEffect, useMemo, useState } from 'react'
import dayjs from 'dayjs'
import timezone from 'dayjs/plugin/timezone'
import { supabase } from '../../../../lib/supabase'
import { eventReviewWindow, findTimelineReadingContext, summarizeEventReviewDays } from '../../../../lib/careTimeline'
import { TZ } from '../../../../lib/timezone'
import { useI18n, type LocalizedText } from '../../../../lib/i18n'
import { VitalReading } from '../../../vitals/components/VitalReading'
import type { BpRecord } from '../../../../types/database'

dayjs.extend(timezone)

const BP_UNAVAILABLE_TEXT: LocalizedText = { id: 'Tekanan darah belum dapat dibaca.', zh: '血壓資料暫時無法讀取。', en: 'Blood pressure data could not be read right now.' }

export function TrajectoryContextReading({ label, record, occurredAt, unavailable }: { label: LocalizedText; record?: BpRecord; occurredAt: string; unavailable?: boolean }) {
  const { text } = useI18n()
  // 「無法讀取」跟「這段期間真的沒有量測」是不同的事實，混在一起會讓照護者誤以為資料完整
  // （沿用 preVisitSources.ts／TrajectorySection.tsx 對三態讀取狀態的既有規則）。
  if (unavailable) return <p className="text-amber-800">{text(label)}：{text(BP_UNAVAILABLE_TEXT)}</p>
  if (!record) return <p className="text-slate-500">{text(label)}：{text({ id: 'tidak ada pembacaan dalam rentang laporan 48 jam', zh: '目前報告區間的 48 小時內沒有量測' ,en: 'no readings within 48 hours in the current report period' })}</p>
  const hours = Math.round(Math.abs(new Date(record.measured_at).getTime() - new Date(occurredAt).getTime()) / 3_600_000)
  return <p className="flex flex-wrap items-center gap-x-1 text-slate-700"><b>{text(label)}：</b><VitalReading systolic={record.systolic} diastolic={record.diastolic} pulse={record.pulse} valueClassName="text-sm font-black" /><span className="text-slate-500">({text({ id: `${hours} jam dari catatan`, zh: `距紀錄 ${hours} 小時` ,en: `${hours} hours from the record` })})</span></p>
}

export function TrajectoryClosestReadings({ records, occurredAt, unavailable }: { records: BpRecord[]; occurredAt: string; unavailable?: boolean }) {
  const { text } = useI18n()
  const context = findTimelineReadingContext(records, occurredAt)
  return <div className="mt-2 grid gap-1 rounded-lg bg-slate-50 p-2 text-xs"><p className="font-bold text-slate-700">{text({ id: 'Pembacaan terdekat', zh: '最接近的量測' ,en: 'Closest Measurement' })}</p><TrajectoryContextReading label={{ id: 'Sebelum', zh: '之前' ,en: 'Before' }} record={context.before} occurredAt={occurredAt} unavailable={unavailable} /><TrajectoryContextReading label={{ id: 'Sesudah', zh: '之後' ,en: 'After' }} record={context.after} occurredAt={occurredAt} unavailable={unavailable} /></div>
}

export function TrajectoryEventReview({ patientId, occurredAt }: { patientId: string; occurredAt: string }) {
  const { text } = useI18n()
  const window = useMemo(() => eventReviewWindow(occurredAt), [occurredAt])
  const [records, setRecords] = useState<BpRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const daily = useMemo(() => summarizeEventReviewDays(records), [records])

  useEffect(() => {
    let cancelled = false
    setLoading(true); setError(false)
    void supabase.from('blood_pressure_records').select('*').eq('patient_id', patientId).gte('measured_at', window.start).lte('measured_at', window.end).order('measured_at', { ascending: true }).then(({ data, error: readError }) => {
      if (cancelled) return
      if (readError) { console.error('[trajectory event review read error]', readError); setError(true) }
      else setRecords((data ?? []) as BpRecord[])
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [patientId, window.end, window.start])

  return <section className="mt-3 rounded-xl border border-indigo-200 bg-indigo-50/40 p-3" aria-label={text({ id: 'Tinjauan pembacaan lengkap', zh: '完整量測回顧' ,en: 'Full Measurement Review' })}>
    <h4 className="font-black text-indigo-950">{text({ id: 'Tinjauan 7 hari sebelum dan sesudah', zh: '事件前後 7 天回顧' ,en: '7 days before and after the event' })}</h4>
    <p className="mt-1 text-xs text-indigo-900">{window.startDate} — {window.endDate} · {text({ id: 'Ringkasan waktu, bukan bukti sebab-akibat atau saran medis.', zh: '僅為時間摘要，非因果證明或醫療建議。' ,en: 'Time summaries only, not proof of cause and effect or medical advice.' })}</p>
    {loading ? <p className="mt-3 text-sm text-slate-500">{text({ id: 'Memuat pembacaan…', zh: '載入量測中…' ,en: 'Loading readings…' })}</p> : error ? <p className="mt-3 text-sm text-red-700">{text({ id: 'Gagal membaca pembacaan lengkap. Periksa jaringan lalu coba lagi.', zh: '無法讀取完整量測，請確認網路後重試。' ,en: 'The full measurement could not be read, please check your network and try again.' })}</p> : records.length === 0 ? <p className="mt-3 text-sm text-slate-600">{text({ id: 'Tidak ada pembacaan dalam jendela ini.', zh: '這個時間窗內沒有量測。' ,en: 'No readings in this time window.' })}</p> : <>
      <div className="mt-3 overflow-x-auto"><table className="w-full min-w-[360px] text-left text-xs"><thead className="text-slate-600"><tr><th className="pb-1 pr-3">{text({ id: 'Tanggal', zh: '日期' ,en: 'Date' })}</th><th className="pb-1 pr-3">{text({ id: 'Rata-rata', zh: '平均' ,en: 'Average' })}</th><th className="pb-1">{text({ id: 'Jumlah', zh: '筆數' ,en: 'Count' })}</th></tr></thead><tbody>{daily.map(day => <tr key={day.date} className="border-t border-indigo-100"><td className="py-1.5 pr-3">{day.date}</td><td className="py-1.5 pr-3"><VitalReading systolic={day.avgSystolic} diastolic={day.avgDiastolic} pulse={day.avgPulse} showUnits={false} valueClassName="font-black" /></td><td className="py-1.5">{day.recordCount}</td></tr>)}</tbody></table></div>
      <details className="mt-3"><summary className="cursor-pointer text-xs font-bold text-indigo-800">{text({ id: `Semua ${records.length} pembacaan`, zh: `全部 ${records.length} 筆量測` ,en: `All ${records.length} readings` })}</summary><ol className="mt-2 space-y-1 border-l-2 border-indigo-200 pl-3">{records.map(record => <li key={record.id} className="flex flex-wrap items-center gap-x-2 text-xs text-slate-700"><time>{dayjs(record.measured_at).tz(TZ).format('YYYY/MM/DD HH:mm')}</time><VitalReading systolic={record.systolic} diastolic={record.diastolic} pulse={record.pulse} showUnits={false} valueClassName="font-black" /></li>)}</ol></details>
    </>}
  </section>
}
