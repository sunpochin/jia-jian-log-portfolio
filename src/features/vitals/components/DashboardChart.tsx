/*
檔案用途：繪製歷史血壓與心跳趨勢圖表，依視覺規範區分數據線型與標記形狀（實心圓/菱形/虛線）。
所在層：src/components；血壓模組近期趨勢與封存對象唯讀歷史頁共用的主要圖表元件。
主要關聯：由 BloodPressureReportPanel 載入，使用 recharts 繪圖套件與 vitalPresentation 的指標顏色。
*/
import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import timezone from 'dayjs/plugin/timezone'
import {
  ComposedChart, Line, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine
} from 'recharts'
import type { BpRecord } from '../../../types/database'
import { evaluateReading } from '../../../types/database'
import { VITAL_COLORS } from '../../../lib/vitalPresentation'
import { TZ } from '../../../lib/timezone'
import { SESSION_LABELS, sessionFromMeasuredAt } from '../../../lib/dashboardStats'
import { PulseReading, VitalValue } from './VitalReading'
import { common, localized, useI18n, type Locale } from '../../../lib/i18n'
import { formatMedicationDisplayName, type MedicationPlanChangeLogView } from '../../../lib/medications'

dayjs.extend(utc)
dayjs.extend(timezone)

// 數字色只負責指出指標種類；真正異常由 Badge 顯示，避免正常收縮壓被誤讀成紅色警報。
const CustomBpDot = (props: any) => {
  const { cx, cy, payload, type, color } = props
  if (cx == null || cy == null || !payload) return null

  if (type === 'diastolic') {
    return <path d={`M ${cx} ${cy - 5} L ${cx + 5} ${cy} L ${cx} ${cy + 5} L ${cx - 5} ${cy} Z`} fill={color} stroke="#ffffff" strokeWidth={1.5} />
  }

  return (
    <circle
      cx={cx}
      cy={cy}
      r={4.5}
      fill={color}
      stroke="#ffffff"
      strokeWidth={1.5}
    />
  )
}

function PulseDot({ cx, cy, color }: { cx?: number; cy?: number; color: string }) {
  if (cx == null || cy == null) return null
  return <rect x={cx - 3} y={cy - 3} width={6} height={6} rx={1} fill={color} />
}

// 自訂中印雙語 Tooltip，提供更易讀的高對比提示資訊，避免 Recharts 預設 Tooltip 將陣列直接印出的粗糙感
const CustomTooltip = ({ active, payload, locale }: { active?: boolean; payload?: any[]; locale: Locale }) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload
    const systolic = data.systolic
    const diastolic = data.diastolic
    const pulse = data.pulse
    const time = data.time
    const sessionName = data.sessionName

    const reading = evaluateReading(systolic, diastolic, pulse)
    const level = reading.level
    const isDanger = level === 'danger' || level === 'danger-low'
    const isWarning = level === 'warning' || level === 'warning-low'

    const statusText = localized(reading.labels, locale)

    let statusBg = 'bg-emerald-100 text-emerald-800 border-emerald-200'
    if (isDanger) {
      statusBg = 'bg-red-100 text-red-800 border-red-200'
    } else if (isWarning) {
      statusBg = 'bg-orange-100 text-orange-800 border-orange-200'
    }

    return (
      <div className="min-w-[200px] space-y-2 rounded-xl border border-gray-200 bg-white p-3 text-sm shadow-lg ring-1 ring-black/5">
        <div className="font-semibold text-gray-900 border-b border-gray-100 pb-1.5 flex justify-between items-center">
          <span>{time}</span>
          <span className="text-xs font-normal text-gray-500">{sessionName}</span>
        </div>
        <div className="space-y-1.5 pt-0.5">
          <div className="flex justify-between items-center text-gray-700">
            <span>{localized({ id: 'Sistolik:', zh: '收縮壓：', en: 'Systolic' }, locale)}</span>
            <VitalValue kind="systolic" value={systolic} className="font-bold text-gray-950" />
          </div>
          <div className="flex justify-between items-center text-gray-700">
            <span>{localized({ id: 'Diastolik:', zh: '舒張壓：', en: 'Diastolic:' }, locale)}</span>
            <VitalValue kind="diastolic" value={diastolic} className="font-bold text-gray-950" />
          </div>
          {pulse != null && (
            <div className="flex justify-between items-center text-gray-700 font-semibold">
              <span>{localized({ id: 'Jantung:', zh: '心跳：', en: 'Heart rate' }, locale)}</span>
              <PulseReading pulse={pulse} className="font-bold" />
            </div>
          )}
        </div>
        <div className={`mt-2 rounded-lg border py-1 text-center text-xs font-bold ${statusBg}`}>
          {statusText}
        </div>
      </div>
    )
  }
  return null
}

// 將 Dashboard 的 Recharts 趨勢圖獨立為專屬元件，負責呈現歷史波形、Y 軸範圍保護與中印雙語 Tooltip。
export function DashboardChart({
  records,
  days,
  subjectLabel,
  isOfflineData,
  usesDarkColorScheme,
  medicationChanges = [],
}: {
  records: BpRecord[]
  days: number
  subjectLabel: string
  isOfflineData: boolean
  usesDarkColorScheme: boolean
  medicationChanges?: MedicationPlanChangeLogView[]
}) {
  const { locale, text } = useI18n()

  const chartColors = usesDarkColorScheme
    ? { systolic: VITAL_COLORS.systolic.dark, diastolic: VITAL_COLORS.diastolic.dark, pulse: VITAL_COLORS.pulse.dark }
    : { systolic: VITAL_COLORS.systolic.light, diastolic: VITAL_COLORS.diastolic.light, pulse: VITAL_COLORS.pulse.light }

  const chartData = [...records]
    .reverse()
    .map(r => {
      const session = sessionFromMeasuredAt(r.measured_at)
      const sessionDisplay = SESSION_LABELS[session]
      const sessionEmoji = session === 'pagi' ? '☀️' : session === 'siang' ? '🌤️' : '🌙'
      return {
        time: dayjs(r.measured_at).tz(TZ).format('MM/DD HH:mm'),
        shortTime: `${dayjs(r.measured_at).tz(TZ).format('MM/DD')} ${sessionEmoji}`,
        sessionName: text(sessionDisplay),
        systolic: r.systolic,
        diastolic: r.diastolic,
        pulse: r.pulse ?? undefined,
        bpRange: [r.diastolic, r.systolic],
        timestamp: new Date(r.measured_at).getTime(),
      }
    })

  // 將藥物變更記錄對應到最接近的血壓記錄時間點，以產生圖表標示線。
  const annotations = (medicationChanges || []).map(change => {
    const changeTime = new Date(change.effective_at || change.recorded_at || change.created_at).getTime()
    let closestRecord = chartData[0]
    let minDiff = Infinity
    for (const r of chartData) {
      const diff = Math.abs(r.timestamp - changeTime)
      if (diff < minDiff) {
        minDiff = diff
        closestRecord = r
      }
    }
    
    // 如果最近的紀錄差異太大（例如圖表範圍外的舊紀錄），則不標示。
    if (!closestRecord || minDiff > 14 * 24 * 60 * 60 * 1000) return null

    const snapshot = (change.action === 'deactivate' ? change.before_snapshot : change.after_snapshot) || {}
    const brandName = (locale === 'zh' ? snapshot.brand_name_zh || snapshot.brand_name : snapshot.brand_name || snapshot.brand_name_zh) || formatMedicationDisplayName(change.medication, locale)
    const isStop = change.action === 'deactivate'
    const labelText = isStop 
      ? `← ${text({id: 'Stop', zh: '停', en: 'Stop.'})} ${brandName}`
      : change.action === 'update'
        ? `← ${text({id: 'Ubah', zh: '改', en: 'Change'})} ${brandName}`
        : `← ${text({id: 'Tambah', zh: '加', en: 'Addition'})} ${brandName}`

    return {
      x: closestRecord.shortTime,
      label: labelText,
      isStop,
      id: change.id
    }
  }).filter((a): a is NonNullable<typeof a> => Boolean(a))

  // 處理同一時間點的多個標籤避免重疊（簡單去重或堆疊顯示）
  const uniqueAnnotations = annotations.reduce((acc, current) => {
    const existing = acc.find(a => a.x === current.x)
    if (existing) {
      existing.label += ` / ${current.label.replace('← ', '')}`
    } else {
      acc.push({ ...current })
    }
    return acc
  }, [] as typeof annotations)

  return (
    <section className="print-report-chart rounded-3xl border border-slate-200 bg-white p-4 shadow-[0_8px_30px_rgba(15,23,42,0.06)]" aria-labelledby="trend-chart-title">
      <div className="record-report-print-only mb-3 hidden border-b border-slate-200 pb-2 text-xs text-slate-600">
        <p className="font-bold text-slate-900">{text({ id: 'Catatan tekanan darah rumah', zh: '居家血壓趨勢', en: 'Home Blood Pressure Trends' })}</p>
        <p>{subjectLabel} · {text(common.days(days))} · {TZ} (UTC+8)</p>
      </div>
      <div className="mb-4 flex items-center justify-between">
        <h2 id="trend-chart-title" className="text-base font-semibold tracking-tight text-gray-900">
          {text({ id: 'Grafik', zh: '圖表', en: 'Charts' })}
        </h2>
        <div className="inline-flex items-center rounded-full bg-gray-50 px-2.5 py-1 text-xs font-medium text-gray-500 ring-1 ring-inset ring-gray-200">
          {text({ id: `${records.length} catatan`, zh: `${records.length} 筆`, en: `${records.length} records` })}
        </div>
      </div>
      {isOfflineData && <p className="mb-2 text-xs font-bold text-amber-700">{text({ id: 'Data cache offline', zh: '離線快取資料', en: 'Data cache offline' })}</p>}
      <p id="trend-chart-description" className="mb-2 text-xs text-gray-500">{text({ id: 'Garis lurus menghubungkan waktu ukur; tabel lengkap tersedia di bawah.', zh: '直線連接各量測時間；下方提供完整表格。', en: 'Garis lurus menghubungkan time ukur; tabel complete tersedia di bawah.' })}</p>
      <div role="img" aria-labelledby="trend-chart-title" aria-describedby="trend-chart-description">
        <ResponsiveContainer width="100%" height={260}>
          <ComposedChart data={chartData} margin={{ top: 10, right: 5, left: -10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
            {/* 繁體中文註解：保留首尾日期並提高字級，靠最小間距減少中間刻度，避免窄螢幕日期互相覆蓋。 */}
            <XAxis dataKey="shortTime" tick={{ fontSize: 10 }} interval="preserveStartEnd" minTickGap={24} tickMargin={6} />
            <YAxis
              yAxisId="left"
              domain={[(minimum: number) => (Number.isFinite(minimum) ? Math.min(40, minimum - 10) : 40), (maximum: number) => (Number.isFinite(maximum) ? Math.max(180, maximum + 10) : 180)]}
              tick={{ fontSize: 10 }}
              width={35}
              label={{ value: 'mmHg', angle: -90, position: 'insideLeft', offset: 10, style: { fontSize: 9, fill: '#9ca3af' } }}
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              domain={[(minimum: number) => (Number.isFinite(minimum) ? Math.min(40, minimum - 10) : 40), (maximum: number) => (Number.isFinite(maximum) ? Math.max(120, maximum + 10) : 120)]}
              tick={{ fontSize: 10 }}
              width={35}
              label={{ value: 'bpm', angle: 90, position: 'insideRight', offset: 10, style: { fontSize: 9, fill: '#9ca3af' } }}
            />
            {uniqueAnnotations.map(anno => (
              <ReferenceLine
                key={anno.id}
                yAxisId="left"
                x={anno.x}
                stroke={anno.isStop ? 'rgba(239,68,68,0.5)' : 'rgba(16,185,129,0.5)'}
                strokeDasharray="3 3"
                label={{ 
                  position: 'insideTopLeft', 
                  value: anno.label, 
                  fill: anno.isStop ? '#ef4444' : '#10b981', 
                  fontSize: 10 
                }}
              />
            ))}
            <Tooltip content={<CustomTooltip locale={locale} />} />
            <Legend iconSize={10} wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
            <Area
              yAxisId="left"
              type="linear"
              dataKey="bpRange"
              stroke="none"
              fill="#f1f5f9"
              fillOpacity={0.5}
              name={text({ id: 'Rentang', zh: '區間', en: 'Interval' })}
            />
            <Line
              yAxisId="left"
              type="linear"
              dataKey="systolic"
              name={text({ id: 'Sistolik', zh: '高壓', en: 'Systolic' })}
              stroke={chartColors.systolic}
              strokeWidth={2.5}
              dot={<CustomBpDot type="systolic" color={chartColors.systolic} />}
              activeDot={{ r: 6 }}
            />
            <Line
              yAxisId="left"
              type="linear"
              dataKey="diastolic"
              name={text({ id: 'Diastolik', zh: '低壓', en: 'LOW PRESSURE' })}
              stroke={chartColors.diastolic}
              strokeWidth={2.5}
              dot={<CustomBpDot type="diastolic" color={chartColors.diastolic} />}
              activeDot={{ r: 6 }}
            />
            <Line
              yAxisId="right"
              type="linear"
              dataKey="pulse"
              name={text({ id: 'Jantung', zh: '心跳', en: 'Heart rate' })}
              stroke={chartColors.pulse}
              strokeWidth={1.5}
              strokeDasharray="4 4"
              dot={<PulseDot color={chartColors.pulse} />}
              activeDot={{ r: 4 }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </section>
  )
}
