/*
檔案用途：v2 分享頁的血壓區塊——R5 判讀依據橫幅、14 天逐筆讀數（依照護日分組、每筆一個等級 chip，ruleKeys 每一條都轉標籤）、
  伺服器算好的彙整卡與截斷提示。純呈現：顏色與標籤都只從 DTO 查表，不重新判讀。
所在層：src/features/care-family/components/shareSummaryV2；由 ShareSummaryV2View 掛載。
主要關聯：src/lib/shareSummaryV2Presentation.ts（查表與分組）、src/lib/alertPresentation.ts（chip 配色）、VitalReading、
  ../../shareSummaryV2Copy.ts（三語文案）。
*/
import { useI18n } from '../../../../lib/i18n'
import { ALERT_BAR_CLASS, ALERT_CHIP_CLASS } from '../../../../lib/alertPresentation'
import { SESSION_LABELS } from '../../../../lib/dashboardStats'
import { VitalReading } from '../../../vitals/components/VitalReading'
import type { PatientShareSummaryV2Dto, ShareSummaryV2Reading } from '../../../../lib/shareSummaryV2Dto'
import {
  PULSE_WARNING_LABEL,
  describeStandardUsed,
  firstIncludedCareDay,
  formatTaipeiDate,
  formatTaipeiTime,
  groupReadingsByCareDay,
  lastIncludedCareDay,
  levelCountLabel,
  readingRuleLabels,
  readingTone,
} from '../../../../lib/shareSummaryV2Presentation'
import {
  SHARE_V2_EMPTY_BP,
  SHARE_V2_LABELS,
  SHARE_V2_STANDARD_EFFECTIVE_FROM,
  SHARE_V2_STANDARD_EFFECTIVE_RANGE,
  SHARE_V2_STANDARD_MARKER_HINT,
  SHARE_V2_STANDARD_NOT_REPAINTED,
  SHARE_V2_STANDARD_PREFIX,
  SHARE_V2_TRUNCATED,
} from '../../shareSummaryV2Copy'

// 圈號與橫幅編號一一對應；超過 10 份標準（實務上不會）退回一般數字加括號。
const STANDARD_MARKERS = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨', '⑩']
export const standardMarker = (index: number): string => STANDARD_MARKERS[index] ?? `(${index + 1})`

function ReadingRow({ reading, showStandardMarker }: { reading: ShareSummaryV2Reading; showStandardMarker: boolean }) {
  const { text, locale } = useI18n()
  const tone = readingTone(reading)
  // ruleKeys 每一條都要顯示；心跳警示是獨立旗標，另加一個標籤而不是混進血壓規則。
  const labels = [...readingRuleLabels(reading.ruleKeys).map(text), ...(reading.pulseWarning ? [text(PULSE_WARNING_LABEL)] : [])]
  const sessionLabel = text(SESSION_LABELS[reading.session])
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 py-1.5">
      <span className="w-12 shrink-0 tabular-nums text-xs text-gray-500">{formatTaipeiTime(reading.measuredAt)}</span>
      {sessionLabel && <span className="shrink-0 text-xs text-gray-400">{sessionLabel}</span>}
      <VitalReading className="text-base" systolic={reading.systolic} diastolic={reading.diastolic} pulse={reading.pulse} />
      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold ${ALERT_CHIP_CLASS[tone]} ${ALERT_BAR_CLASS[tone]}`}>
        {labels.join(locale === 'zh' ? '；' : '; ')}
      </span>
      {/* 跨越變更日時每筆都標出自己的標準，讀者不必猜這個顏色是哪一份算的（PR #941 Codex P1）。 */}
      {showStandardMarker && (
        <span className="text-xs font-bold text-indigo-700" aria-label={`${text(SHARE_V2_STANDARD_PREFIX)} ${standardMarker(reading.standardIndex)}`}>
          {standardMarker(reading.standardIndex)}
        </span>
      )}
    </li>
  )
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-gray-50 px-3 py-2 ring-1 ring-inset ring-gray-200">
      <p className="text-[11px] text-gray-500">{label}</p>
      <p className="mt-0.5 text-sm font-extrabold tabular-nums text-gray-900">{value}</p>
    </div>
  )
}

export function ShareSummaryBloodPressureSection({ bloodPressure }: { bloodPressure: PatientShareSummaryV2Dto['bloodPressure'] }) {
  const { text } = useI18n()
  const { readings, summary, standardsUsed, truncated } = bloodPressure
  const groups = groupReadingsByCareDay(readings)
  const showStandardMarker = standardsUsed.length > 1
  const pair = (value: { systolic: number; diastolic: number } | null) => (value ? `${value.systolic}/${value.diastolic}` : '—')
  const avg = summary.avgSystolic !== null && summary.avgDiastolic !== null ? `${summary.avgSystolic}/${summary.avgDiastolic}` : '—'

  return (
    <section aria-labelledby="share-v2-bp-title" className="rounded-2xl border border-gray-200 p-4 print:break-inside-avoid">
      <h2 id="share-v2-bp-title" className="text-sm font-bold text-gray-800">{text(SHARE_V2_LABELS.bloodPressure)}</h2>
      {/* window.end 是排他的 04:00 邊界，要印「實際涵蓋到的最後一個照護日」，不能直接印它（PR #941 Codex P2）。 */}
      <p className="mt-0.5 text-xs text-gray-500">{firstIncludedCareDay(bloodPressure.window.start)} – {lastIncludedCareDay(bloodPressure.window.end)} · n={summary.recordCount}</p>

      {readings.length === 0 ? (
        <p className="mt-3 text-sm text-gray-500">{text(SHARE_V2_EMPTY_BP)}</p>
      ) : (
        <>
          {/* R5：每一份用到的標準都列出（跨越變更日就是兩份），並明說不依現在的標準重判。 */}
          <div className="mt-3 rounded-xl bg-indigo-50 px-3 py-2 text-xs text-indigo-900">
            <ul className="space-y-0.5">
              {standardsUsed.map((standard, index) => (
                <li key={index}>
                  {showStandardMarker && <span className="mr-1 font-bold">{standardMarker(index)}</span>}
                  <span className="font-bold">{text(SHARE_V2_STANDARD_PREFIX)}</span>{' '}
                  {text(describeStandardUsed(standard))}
                  {/* 有終點就印起訖，沒有終點（仍生效）只印起點；未設定（configured:false）沒有日期。 */}
                  {standard.effectiveFrom && standard.effectiveTo && <>{' '}{text(SHARE_V2_STANDARD_EFFECTIVE_RANGE(formatTaipeiDate(standard.effectiveFrom), formatTaipeiDate(standard.effectiveTo)))}</>}
                  {standard.effectiveFrom && !standard.effectiveTo && <>{' '}{text(SHARE_V2_STANDARD_EFFECTIVE_FROM(formatTaipeiDate(standard.effectiveFrom)))}</>}
                </li>
              ))}
            </ul>
            <p className="mt-1 text-[11px] text-indigo-800">{text(SHARE_V2_STANDARD_NOT_REPAINTED)}</p>
            {showStandardMarker && <p className="mt-0.5 text-[11px] text-indigo-800">{text(SHARE_V2_STANDARD_MARKER_HINT)}</p>}
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
            <StatCard label={text(SHARE_V2_LABELS.average)} value={avg} />
            <StatCard label={text(SHARE_V2_LABELS.morningAverage)} value={pair(summary.morningAvg)} />
            <StatCard label={text(SHARE_V2_LABELS.eveningAverage)} value={pair(summary.eveningAvg)} />
            <StatCard label={text(SHARE_V2_LABELS.daysWithRecords)} value={`${summary.daysWithRecords} / ${bloodPressure.window.careDays}`} />
            <StatCard label={text(SHARE_V2_LABELS.morningDays)} value={String(summary.daysWithMorning)} />
            <StatCard label={text(SHARE_V2_LABELS.eveningDays)} value={String(summary.daysWithEvening)} />
          </div>
          <p className="mt-2 text-xs text-gray-600">
            <span className="font-bold">{text(SHARE_V2_LABELS.levelCounts)}：</span>
            {(Object.keys(summary.levelCounts) as Array<keyof typeof summary.levelCounts>)
              .filter(level => summary.levelCounts[level] > 0)
              .map(level => `${text(levelCountLabel(level))} ${summary.levelCounts[level]}`)
              .join(' · ')}
            {summary.nightLowCount > 0 && ` · ${text(SHARE_V2_LABELS.nightLow)} ${summary.nightLowCount}`}
          </p>

          {truncated && <p className="mt-2 text-xs font-semibold text-amber-700">{text(SHARE_V2_TRUNCATED(readings.length))}</p>}

          <div className="mt-3 space-y-3">
            {groups.map(group => (
              <div key={group.careDay}>
                <p className="text-xs font-bold text-gray-500">{group.careDay}</p>
                <ul className="divide-y divide-gray-100">
                  {group.readings.map(reading => <ReadingRow key={reading.measuredAt} reading={reading} showStandardMarker={showStandardMarker} />)}
                </ul>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  )
}
