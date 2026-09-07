/*
檔案用途：把「每天一個點」的趨勢序列畫成折線，並同步提供螢幕閱讀器可讀的表格。
所在層：src/components/daily-care；體重、飲食與服藥的趨勢面板共用同一種呈現。
主要關聯：lib/trendSeries 的 TrendPoint、各模組趨勢面板；血壓與體溫另有專屬圖表不走這裡。

為什麼共用：三個模組的趨勢在資訊結構上完全相同（日期對單一數值），
各自實作會長出三種座標、三種空值處理與三種無障礙做法。
血壓（三條線＋警示區間）與體溫（固定臨床刻度）資訊結構不同，維持專屬元件。
*/
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useI18n, type LocalizedText } from '../../lib/i18n'
import type { TrendPoint } from '../../lib/trendSeries'

export function DailyTrendChart({ points, color, unit, seriesLabel, emptyLabel, valueFormatter }: {
  points: TrendPoint[]
  color: string
  // 雙語介面規範：連度量單位（例如「次」「顆」「分」）都要跟著語系換，不能只把印尼文寫死進圖表。
  unit: LocalizedText
  seriesLabel: LocalizedText
  emptyLabel: LocalizedText
  valueFormatter?: (value: number) => string
}) {
  const { text } = useI18n()
  const formatValue = valueFormatter ?? ((value: number) => String(value))
  const unitText = text(unit)
  const recorded = points.filter(point => point.value != null)

  if (recorded.length === 0) return <p className="text-sm text-slate-500">{text(emptyLabel)}</p>

  const chartData = points.map(point => ({
    date: point.date.slice(5).replace('-', '/'),
    value: point.value,
  }))

  return (
    <>
      <div className="h-52 w-full" role="img" aria-label={text(seriesLabel)}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 8, right: 8, left: -20, bottom: 4 }}>
            <XAxis dataKey="date" tick={{ fontSize: 11 }} minTickGap={22} />
            <YAxis tick={{ fontSize: 11 }} width={42} domain={['auto', 'auto']} />
            <Tooltip
              formatter={(value: number) => [`${formatValue(value)} ${unitText}`, text(seriesLabel)]}
              labelFormatter={label => String(label)}
            />
            {/* connectNulls 維持預設 false：沒有紀錄的日子必須是斷點，
                否則中間幾天沒量會被連成直線，看起來像那幾天有平穩變化。 */}
            <Line
              type="monotone"
              dataKey="value"
              stroke={color}
              strokeWidth={3}
              dot={{ r: 4, fill: color, stroke: '#fff', strokeWidth: 2 }}
              activeDot={{ r: 6 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      {/* 圖形不能是唯一的資訊來源；同一份數字必須有可朗讀的表格。 */}
      <table className="sr-only">
        <caption>{text(seriesLabel)}</caption>
        <thead><tr><th>{text({ id: 'Tanggal', zh: '日期' ,en: 'Date' })}</th><th>{text(seriesLabel)}</th></tr></thead>
        <tbody>
          {points.map(point => (
            <tr key={point.date}>
              <td>{point.date}</td>
              <td>{point.value == null ? text({ id: 'Tidak ada catatan', zh: '無紀錄' ,en: 'No records' }) : `${formatValue(point.value)} ${unitText}`}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  )
}
