/*
檔案用途：依血壓與心跳計算警示等級，輸出共用的彩色徽章（危險紅／偏高橘／正常綠）。
所在層：src/features/vitals/components；供 DashboardStatsCards「最新」列與 DailyBloodPressureRecords 每筆量測共用，
避免兩處各自維護一份等級判斷與樣式，導致「總覽」顯示偏高觀察，本照護日清單卻看不出同一筆量測的風險。
主要關聯：包裝 types/database 的 evaluateReading，共用生命徵象規則。
*/
import { evaluateReading, type AlertLevel } from '../../../types/database'
import { useI18n } from '../../../lib/i18n'

// orange-500/emerald-600 對白字的對比度只有 2.8:1／3.77:1，低於 WCAG AA 的 4.5:1；
// 現在每筆本照護日紀錄都會顯示這個 badge，低視力照護者更容易看漏，改用 700 色階確保可讀。
export function alertBadgeClassName(level: AlertLevel): string {
  if (level === 'danger' || level === 'danger-low') return 'bg-red-600 text-white border-transparent'
  if (level === 'warning' || level === 'warning-low') return 'bg-orange-700 text-white border-transparent'
  return 'bg-emerald-700 text-white border-transparent'
}

export function VitalAlertBadge({
  systolic,
  diastolic,
  pulse,
  className = '',
}: {
  systolic: number
  diastolic: number
  pulse?: number | null
  className?: string
}) {
  const { text } = useI18n()
  const rule = evaluateReading(systolic, diastolic, pulse)
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold whitespace-nowrap ${alertBadgeClassName(rule.level)} ${className}`}>
      {text(rule.labels)}
    </span>
  )
}
