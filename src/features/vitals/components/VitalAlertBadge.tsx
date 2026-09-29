/*
檔案用途：依血壓與心跳計算警示等級，輸出共用的彩色徽章（§4.2 的四階分級紅＋在目標內／低於目標）。
所在層：src/features/vitals/components；供 DashboardStatsCards「最新」列與 DailyBloodPressureRecords 每筆量測共用，
避免兩處各自維護一份等級判斷與樣式，導致「總覽」顯示偏高觀察，本照護日清單卻看不出同一筆量測的風險。
主要關聯：useBpEvaluator（取得這位病人在**量測當時**生效的標準）、
src/lib/alertPresentation.ts（全 app 唯一一份 chip 配色）。
*/
import { ALERT_BAR_CLASS, ALERT_CHIP_CLASS, CRITICAL_ACTION_TEXT, alertTone } from '../../../lib/alertPresentation'
import { useI18n } from '../../../lib/i18n'
import { useBpEvaluator } from '../hooks/useBpEvaluator'

/**
 * `measuredAt` 是必填的：判讀要用**量測當時**生效的標準，不是「現在」的。
 * 少了它就只能用現在的標準重漆歷史，那正是 issue #897 的生效日期化要防止的事。
 */
export function VitalAlertBadge({
  systolic,
  diastolic,
  pulse,
  measuredAt,
  className = '',
}: {
  systolic: number
  diastolic: number
  pulse?: number | null
  measuredAt: string | Date
  className?: string
}) {
  const { text } = useI18n()
  const evaluator = useBpEvaluator()
  const evaluation = evaluator.evaluateAt(systolic, diastolic, pulse, measuredAt)
  const tone = alertTone(evaluation)
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold whitespace-nowrap ${ALERT_CHIP_CLASS[tone]} ${ALERT_BAR_CLASS[tone]} ${className}`}>
      {text(evaluation.labels)}
      {/* 只有最高階附行動文字：每一階都掛指示會讓照護者整頁都是指令、反而不讀（§4.2）。 */}
      {tone === 'critical' && <span className="font-black">· {text(CRITICAL_ACTION_TEXT)}</span>}
    </span>
  )
}
