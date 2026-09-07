/*
檔案用途：呈現體溫的數值摘要與時間趨勢，供體溫模組的近期趨勢與封存對象的唯讀歷史頁共用。
所在層：src/features/vitals/components；與血壓圖表分開，避免不同單位共用錯誤刻度。
主要關聯：TemperaturePage、ArchivedPatientHistoryPage、useTemperatureRecords、temperature 規則與 Recharts。
*/
import dayjs from 'dayjs'
import timezone from 'dayjs/plugin/timezone'
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useTemperatureRecords } from '../../../hooks/useTemperatureRecords'
import { useI18n } from '../../../lib/i18n'
import { TZ } from '../../../lib/timezone'
import { getTemperatureStatus, temperatureStatusLabel, TEMPERATURE_RETENTION_DAYS } from '../../../lib/temperature'

dayjs.extend(timezone)

export function TemperatureTrend({ patientId, days }: { patientId: string; days: number }) {
  const { text } = useI18n()
  const { records, loading, error } = useTemperatureRecords(days, patientId)

  // 圖表只呈現趨勢；精確數字另放在同一區塊的可讀表格，避免只靠折線或顏色傳達健康資訊。
  const chartData = [...records].reverse().map(record => ({
    time: dayjs(record.measured_at).tz(TZ).format('MM/DD HH:mm'),
    temperature: record.temperature_c,
  }))
  const latest = records[0]
  const feverCount = records.filter(record => {
    const status = getTemperatureStatus(record.temperature_c)
    return status === 'fever' || status === 'high-fever'
  }).length

  return (
    <section className="rounded-3xl border border-orange-100 bg-white p-4 shadow-[0_8px_30px_rgba(15,23,42,0.06)]" aria-labelledby="temperature-trend-title">
      <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-2">
        <div>
          <h2 id="temperature-trend-title" className="text-base font-extrabold text-slate-950">{text({ id: 'Tren suhu', zh: '體溫趨勢', en: 'Tren temperature' })}</h2>
          <p className="mt-1 text-xs text-slate-500">{text({ id: 'Suhu ditampilkan terpisah dari tekanan darah.', zh: '體溫使用獨立刻度，不與血壓混圖。', en: 'Temperature ditampilkan separate from blood pressure.' })}</p>
          {days > TEMPERATURE_RETENTION_DAYS && <p className="mt-1 text-xs font-semibold text-orange-700">{text({ id: `Catatan suhu disimpan ${TEMPERATURE_RETENTION_DAYS} hari.`, zh: `體溫紀錄保留 ${TEMPERATURE_RETENTION_DAYS} 天。`, en: `Temperature records are retained for ${TEMPERATURE_RETENTION_DAYS} days.` })}</p>}
        </div>
        {latest && <div className="text-right"><strong className="text-2xl font-black text-orange-700">{latest.temperature_c.toFixed(1)}°C</strong><p className="text-xs font-bold text-slate-500">{text(temperatureStatusLabel(getTemperatureStatus(latest.temperature_c)))}</p></div>}
      </div>
      {loading && <p className="mt-3 text-sm text-slate-500">{text({ id: 'Memuat…', zh: '載入中…', en: 'Loading…' })}</p>}
      {error && <p role="alert" className="mt-3 text-sm font-semibold text-red-700">{error}</p>}
      {!loading && !error && records.length === 0 && <p className="mt-3 text-sm text-slate-500">{text({ id: 'Belum ada catatan suhu.', zh: '目前沒有體溫紀錄。', en: 'Not yet ada record temperature.' })}</p>}
      {!loading && !error && records.length > 0 && <>
        <div className="mt-3 h-56 w-full" role="img" aria-label={text({ id: 'Grafik tren suhu tubuh', zh: '體溫趨勢圖', en: 'Grafik tren temperature tubuh' })}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 8, right: 8, left: -18, bottom: 4 }}>
              <XAxis dataKey="time" tick={{ fontSize: 11 }} minTickGap={24} />
              <YAxis domain={[34, 41]} tick={{ fontSize: 11 }} tickFormatter={value => `${value}°`} width={40} />
              <Tooltip formatter={(value: number) => [`${value.toFixed(1)}°C`, text({ id: 'Suhu', zh: '體溫', en: 'Temperature' })]} labelFormatter={label => String(label)} />
              <Line type="monotone" dataKey="temperature" stroke="#EA580C" strokeWidth={3} dot={{ r: 4, fill: '#EA580C', stroke: '#fff', strokeWidth: 2 }} activeDot={{ r: 6 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <table className="sr-only">
          <caption>{text({ id: 'Data grafik suhu tubuh', zh: '體溫趨勢圖資料', en: 'Data grafik temperature tubuh' })}</caption>
          <thead><tr><th>{text({ id: 'Waktu', zh: '時間', en: 'time' })}</th><th>{text({ id: 'Suhu', zh: '體溫', en: 'Temperature' })}</th></tr></thead>
          <tbody>{records.map(record => <tr key={record.id}><td>{dayjs(record.measured_at).tz(TZ).format('MM/DD HH:mm')}</td><td>{record.temperature_c.toFixed(1)}°C</td></tr>)}</tbody>
        </table>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs font-semibold text-slate-600">
          <span>{text({ id: `${records.length} catatan`, zh: `共 ${records.length} 筆`, en: `${records.length} records` })}</span>
          <span className={feverCount > 0 ? 'text-orange-700' : 'text-emerald-700'}>{text({ id: `${feverCount} catatan demam`, zh: `${feverCount} 筆發燒範圍`, en: `${feverCount} fever-range records` })}</span>
        </div>
      </>}
    </section>
  )
}
