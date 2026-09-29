/*
檔案用途：呈現血壓報告的最新量測、平均值與偏高／偏低統計卡片。
所在層：src/components；由 BloodPressureReportPanel 組合的摘要區，不負責讀取或修改資料。
主要關聯：接收 lib/dashboardStats 的 DashboardSummary，判讀走 useBpEvaluator（病人綁定的標準），
卡片與徽章配色一律取自 lib/alertPresentation，不在本檔另建一份等級對照表。
*/
import { ALERT_CARD_CLASS, ALERT_CHIP_CLASS, alertTone } from '../../../lib/alertPresentation'
import { useBpEvaluator } from '../hooks/useBpEvaluator'
import { LatestVitals } from './LatestVitals'
import { VitalReading } from './VitalReading'
import { VitalAlertBadge } from './VitalAlertBadge'
import type { DashboardSummary } from '../../../lib/dashboardStats'
import { useI18n } from '../../../lib/i18n'

// 將 Dashboard 的四項核心指標收納在「總覽」（Ringkasan）專屬卡片元件中，改為 4 個獨立 Row 垂直排列，徹底解決手機窄螢幕下 2 欄 Grid 容易擠壓文字與破圖的問題。
export function DashboardStatsCards({
  summary,
}: {
  summary: DashboardSummary
}) {
  const { text } = useI18n()
  const evaluator = useBpEvaluator()

  // 1. 最新血壓判定與樣式定義
  const latest = summary.latest
  // 最新一筆有自己的 measured_at，所以用**那個時間點**生效的標準判讀，與下方 chip 一致。
  const latestRule = latest ? evaluator.evaluateAt(latest.systolic, latest.diastolic, latest.pulse, latest.measured_at) : null
  const latestCardStyle = latestRule
    ? `${ALERT_CARD_CLASS[alertTone(latestRule)]} text-gray-900 shadow-sm`
    : 'bg-white border-gray-250 text-gray-900'
  const latestValueStyle = 'text-gray-950'

  // 2. 期間平均血壓判定與樣式定義
  const hasAvg = summary.avgSystolic != null && summary.avgDiastolic != null
  // 平均值橫跨整個區間、沒有單一的 measured_at，所以用**現在**生效的標準判讀：
  // 那是照護者此刻被要求達到的目標。區間內若換過標準，逐筆的顏色仍各自正確，
  // 報告表頭的 R5 標示也會把兩份標準都列出來，不會讓這張卡假裝整段都用同一份。
  const avgRule = hasAvg ? evaluator.evaluateNow(summary.avgSystolic!, summary.avgDiastolic!, summary.avgPulse) : null
  const avgTone = avgRule ? alertTone(avgRule) : 'normal'
  const avgCardStyle = avgRule ? ALERT_CARD_CLASS[avgTone] : 'bg-white border-gray-200'
  const avgValueStyle = 'text-gray-950'
  const avgBadgeStyle = ALERT_CHIP_CLASS[avgTone]

  // 3. 偏高統計樣式定義 (合併 warning-high 和 danger-high)
  const hasDangerHigh = summary.alertCounts.danger > 0
  const hasWarningHigh = summary.alertCounts.warning > 0
  const totalHigh = summary.alertCounts.danger + summary.alertCounts.warning

  let highCardStyle: string
  let highValueStyle: string

  if (hasDangerHigh) {
    highCardStyle = 'bg-red-50/70 border-red-200 text-red-950'
    highValueStyle = 'text-red-650'
  } else if (hasWarningHigh) {
    highCardStyle = 'bg-orange-50/60 border-orange-200 text-orange-950'
    highValueStyle = 'text-orange-650'
  } else {
    highCardStyle = 'bg-emerald-50/20 border-emerald-100 text-emerald-950'
    highValueStyle = 'text-emerald-700'
  }

  // 4. 夜間偏低與累計偏低統計樣式定義
  const nightLow = summary.nightLowCount
  const totalLow = summary.alertCounts['warning-low'] + summary.alertCounts['danger-low']
  const hasDangerLow = summary.alertCounts['danger-low'] > 0

  let lowCardStyle: string
  let lowValueStyle: string

  if (nightLow > 0) {
    if (hasDangerLow) {
      lowCardStyle = 'bg-red-50/70 border-red-200 text-red-950'
      lowValueStyle = 'text-red-650'
    } else {
      lowCardStyle = 'bg-orange-50/60 border-orange-200 text-orange-950'
      lowValueStyle = 'text-orange-650'
    }
  } else if (totalLow > 0) {
    lowCardStyle = 'bg-orange-50/30 border-orange-100 text-orange-900'
    lowValueStyle = 'text-orange-700'
  } else {
    lowCardStyle = 'bg-emerald-50/20 border-emerald-100 text-emerald-950'
    lowValueStyle = 'text-emerald-700'
  }

  return (
    <section className="dashboard-summary-container space-y-3 rounded-3xl border border-slate-200 bg-white p-4 shadow-[0_8px_30px_rgba(15,23,42,0.06)]" aria-labelledby="dashboard-overview-title">
      <div className="flex items-center justify-between border-b border-slate-100 pb-2">
        <h2 id="dashboard-overview-title" className="text-base font-extrabold tracking-tight text-slate-950">
          {text({ id: 'Ringkasan', zh: '總覽' ,en: 'Summary' })}
        </h2>
        <span className="text-xs font-semibold text-slate-400">
          {text({ id: `${summary.recordCount} catatan`, zh: `共 ${summary.recordCount} 筆` ,en: `${summary.recordCount} records` })}
        </span>
      </div>

      <div className="space-y-3">
        {/* Row 1: Terakhir / 最新 (最新血壓) */}
        <div className={`rounded-2xl border p-3.5 transition-all duration-300 ${latestCardStyle}`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-bold tracking-wider text-gray-500 uppercase">{text({ id: 'Terakhir', zh: '最新' ,en: 'Latest' })}</span>
            {latest && <VitalAlertBadge systolic={latest.systolic} diastolic={latest.diastolic} pulse={latest.pulse} measuredAt={latest.measured_at} />}
          </div>
          <LatestVitals
            className="mt-2.5 text-xs"
            valueClassName={`text-2xl tracking-tight ${latestValueStyle}`}
            record={latest}
          />
          {latestRule && (latestRule.recommendations.id || latestRule.recommendations.zh) && (
            <div className="mt-2.5 border-t border-black/5 pt-2 text-xs leading-relaxed text-gray-700">
              <span className="font-bold">{text(latestRule.recommendations)}</span>
            </div>
          )}
          {!latest && <div className="mt-2 border-t border-black/5 pt-2 text-xs text-gray-400">{text({ id: 'Belum ada', zh: '尚無資料' ,en: 'No User Memberships found' })}</div>}
        </div>

        {/* Row 2: Rata-rata / 平均 (統計平均) */}
        <div className={`rounded-2xl border p-3.5 transition-all duration-300 ${avgCardStyle}`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-bold tracking-wider text-gray-500 uppercase">{text({ id: 'Rata-rata', zh: '平均' ,en: 'Average' })}</span>
            {hasAvg && avgRule && (
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${avgBadgeStyle}`}>
                {text(avgRule.labels)}
              </span>
            )}
          </div>
          <div className="mt-2.5 flex items-baseline justify-between gap-2">
            <div>
              {hasAvg
                ? <VitalReading systolic={summary.avgSystolic!} diastolic={summary.avgDiastolic!} pulse={summary.avgPulse} className={`text-2xl font-extrabold tracking-tight ${avgValueStyle}`} />
                : <span className={`text-2xl font-extrabold tracking-tight ${avgValueStyle}`}>-</span>}
            </div>
            <div className="text-right text-xs text-gray-500">
              <span className="text-gray-400">{text({ id: 'Jumlah:', zh: '樣本：' ,en: 'Samples:' })}</span>{' '}
              <span className="font-semibold text-gray-700">{text({ id: `${summary.recordCount} catatan`, zh: `${summary.recordCount} 筆` ,en: `${summary.recordCount} records` })}</span>
            </div>
          </div>
        </div>

        {/* Row 3: Tinggi / 偏高 (高血壓統計) */}
        <div className={`rounded-2xl border p-3.5 transition-all duration-300 ${highCardStyle}`}>
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-bold tracking-wider text-gray-500 uppercase">{text({ id: 'Tinggi', zh: '偏高' ,en: 'Somewhat high' })}</span>
            {hasDangerHigh && (
              <span className="rounded-full bg-red-600 px-2.5 py-0.5 text-xs font-bold text-white">
                {text({ id: 'Bahaya', zh: '危險' ,en: 'Danger' })}
              </span>
            )}
          </div>
          <div className="mt-2 flex items-baseline justify-between gap-2">
            <div className="flex items-baseline gap-1">
              <span className={`text-2xl font-extrabold tracking-tight ${highValueStyle}`}>
                {totalHigh}
              </span>
              <span className="text-xs text-gray-400 font-semibold ml-0.5">
                {text({ id: 'kali', zh: '次' ,en: 'times' })}
              </span>
            </div>
            <div className="flex items-center gap-3 text-xs">
              <div className="flex items-center gap-1 text-red-750 font-medium">
                <span>{text({ id: 'Sangat tinggi:', zh: '危險：' ,en: 'Danger:' })}</span>
                <span className="font-bold">{summary.alertCounts.danger}</span>
              </div>
              <div className="flex items-center gap-1 text-orange-650 font-medium">
                <span>{text({ id: 'Agak tinggi:', zh: '略高：' ,en: 'Slightly higher:' })}</span>
                <span className="font-semibold">{summary.alertCounts.warning}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Row 4: Rendah Malam / 夜間偏低 */}
        <div className={`rounded-2xl border p-3.5 transition-all duration-300 ${lowCardStyle}`}>
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-bold tracking-wider text-gray-500 uppercase">{text({ id: 'Rendah Malam', zh: '夜間偏低' ,en: 'Low at night' })}</span>
            {nightLow > 0 && (
              <span className="rounded-full bg-red-600 px-2.5 py-0.5 text-xs font-bold text-white">
                {text({ id: 'Perlu dilihat', zh: '需留意' ,en: 'Needs attention' })}
              </span>
            )}
          </div>
          <div className="mt-2 flex items-baseline justify-between gap-2">
            <div className="flex items-baseline gap-1">
              <span className={`text-2xl font-extrabold tracking-tight ${lowValueStyle}`}>
                {nightLow}
              </span>
              <span className="text-xs text-gray-400 font-semibold ml-0.5">
                {text({ id: 'kali', zh: '次' ,en: 'times' })}
              </span>
            </div>
            <div className="flex items-center gap-3 text-xs">
              <div className="flex items-center gap-1 text-red-650 font-medium">
                <span>{text({ id: 'Malam:', zh: '夜間：' ,en: 'Nighttime:' })}</span>
                <span className="font-bold">{nightLow}</span>
              </div>
              <div className="flex items-center gap-1 text-gray-500 font-medium">
                <span>{text({ id: 'Total:', zh: '累計：' ,en: 'Total:' })}</span>
                <span className="font-semibold text-gray-700">{totalLow}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
