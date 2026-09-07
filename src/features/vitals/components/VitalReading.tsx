/*
檔案用途：統一呈現收縮壓、舒張壓與心跳之指標數值元件，落實視覺規範色系與螢幕讀報雙語語意。
所在層：src/components；為跨頁面共用的生命徵象基礎 UI 元件。
主要關聯：由 RecordReport、LatestVitals、CareTimeline 呼叫，並使用 lib/vitalPresentation 的顏色類別。
*/
import { VITAL_VALUE_CLASSES } from '../../../lib/vitalPresentation'
import { useI18n } from '../../../lib/i18n'

type VitalReadingProps = {
  systolic: number
  diastolic: number
  pulse?: number | null
  className?: string
  valueClassName?: string
  unitClassName?: string
  showUnits?: boolean
  showPulse?: boolean
}

// 所有讀值共用這個元件，讓數字直接帶指標色以節省手機寬度，警示仍由外層 Badge 負責。
export function VitalReading({
  systolic,
  diastolic,
  pulse,
  className = '',
  valueClassName = '',
  unitClassName = 'text-gray-400',
  showUnits = true,
  showPulse = true,
}: VitalReadingProps) {
  const { text } = useI18n()
  return (
    <span className={`inline-flex flex-wrap items-baseline gap-x-1 tabular-nums ${className}`}>
      <span className={`${VITAL_VALUE_CLASSES.systolic} ${valueClassName}`}><span className="sr-only">{text({ id: 'Sistolik ', zh: '收縮壓 ', en: 'Systolic' })}</span>{systolic}</span>
      {/* 斜線必須讓輔助工具讀到，否則兩個數字會被誤認成沒有關係的相鄰數值。 */}
      <span className="text-gray-400">/</span>
      <span className={`${VITAL_VALUE_CLASSES.diastolic} ${valueClassName}`}><span className="sr-only">{text({ id: 'Diastolik ', zh: '舒張壓 ', en: 'Diastolic' })}</span>{diastolic}</span>
      {showUnits && <span className={`text-xs font-normal ${unitClassName}`}>mmHg</span>}
      {showPulse && pulse != null && (
        <span className={`ml-1 inline-flex items-baseline gap-1 ${VITAL_VALUE_CLASSES.pulse}`}>
          <span aria-hidden="true">♥</span>
          <span className={valueClassName}><span className="sr-only">{text({ id: 'Denyut ', zh: '心跳 ', en: 'Heart rate' })}</span>{pulse}</span>
          {showUnits && <span className={`text-xs font-normal ${unitClassName}`}>bpm</span>}
        </span>
      )}
    </span>
  )
}

export function VitalValue({ kind, value, unit = 'mmHg', className = '', unitClassName = 'text-gray-400' }: {
  kind: keyof typeof VITAL_VALUE_CLASSES
  value: number | string
  unit?: string
  className?: string
  unitClassName?: string
}) {
  const { text } = useI18n()
  const label = kind === 'systolic'
    ? { id: 'Sistolik ', zh: '收縮壓 ', en: 'Systolic' }
    : kind === 'diastolic'
      ? { id: 'Diastolik ', zh: '舒張壓 ', en: 'Diastolic' }
      : { id: 'Denyut ', zh: '心跳 ', en: 'Heart rate' }
  return (
    <span className={`inline-flex items-baseline gap-1 tabular-nums ${VITAL_VALUE_CLASSES[kind]} ${className}`}>
      <span><span className="sr-only">{text(label)}</span>{value}</span>
      <span className={`text-xs font-normal ${unitClassName}`}>{unit}</span>
    </span>
  )
}

export function PulseReading({ pulse, className = '', unitClassName = 'text-gray-400' }: { pulse: number | null; className?: string; unitClassName?: string }) {
  const { text } = useI18n()
  return (
    <span className={`inline-flex items-baseline gap-1 tabular-nums ${VITAL_VALUE_CLASSES.pulse} ${className}`}>
      <span aria-hidden="true">♥</span>
      <span><span className="sr-only">{text({ id: 'Denyut ', zh: '心跳 ', en: 'Heart rate' })}</span>{pulse ?? '—'}</span>
      <span className={`text-[9px] font-medium ${unitClassName}`}>bpm</span>
    </span>
  )
}
