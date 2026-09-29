/*
檔案用途：v2 分享頁的版面殼——頁首說明（不是診斷、不是醫療建議）、四個區塊、頁尾資料限制與快照聲明、列印按鈕與列印頁尾。
  DTO 只存在呼叫端的 React state，本元件不寫任何瀏覽器儲存、不掛任何分析。
所在層：src/features/care-family/components/shareSummaryV2；由 ShareSummaryPage 在 scopeVersion 為 v2 時掛載。
主要關聯：ShareSummaryBloodPressureSection、ShareSummaryMedicationSection、ShareSummaryEventsSection、../../shareSummaryV2Copy.ts、
  src/components/system/PrintSourceFooter.tsx（列印頁尾與其他報告一致）。
*/
import { useI18n, localized } from '../../../../lib/i18n'
import { PrintSourceFooter } from '../../../../components/system/PrintSourceFooter'
import type { PatientShareSummaryV2Dto } from '../../../../lib/shareSummaryV2Dto'
import { formatTaipeiDateTime } from '../../../../lib/shareSummaryV2Presentation'
import { SHARE_V2_DATA_LIMITS, SHARE_V2_INTRO, SHARE_V2_LABELS, SHARE_V2_SNAPSHOT } from '../../shareSummaryV2Copy'
import { ShareSummaryBloodPressureSection } from './ShareSummaryBloodPressureSection'
import { ShareSummaryMedicationSection } from './ShareSummaryMedicationSection'
import { ShareSummaryEventsSection } from './ShareSummaryEventsSection'

export function ShareSummaryV2View({ summary }: { summary: PatientShareSummaryV2Dto }) {
  const { text, locale } = useI18n()
  const generatedAt = formatTaipeiDateTime(summary.generatedAt)
  return (
    <div className="mt-4 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black">{localized(summary.patientAlias, locale)}</h1>
          <p className="text-sm text-gray-500">{text(SHARE_V2_LABELS.twoWeekSummary)} · {generatedAt}（{summary.timezone}）</p>
        </div>
        {/* 診間常見的 fallback 是印出來；瀏覽器列印即可，不另外產 PDF（沒有第二條資料通道）。 */}
        <button type="button" onClick={() => window.print()} className="shrink-0 rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-bold text-gray-700 print:hidden">
          {text(SHARE_V2_LABELS.print)}
        </button>
      </div>

      {/* F4 (ii)：頁首明說不是診斷、不是醫療建議。 */}
      <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-900">{text(SHARE_V2_INTRO)}</p>

      <ShareSummaryBloodPressureSection bloodPressure={summary.bloodPressure} />
      <ShareSummaryMedicationSection medications={summary.medications} />
      <ShareSummaryEventsSection recentEvents={summary.recentEvents} openConcerns={summary.openConcerns} />

      {/* D：資料限制與快照聲明，列印時一併印出。 */}
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 text-xs leading-relaxed text-amber-900">
        <p>{text(SHARE_V2_DATA_LIMITS)}</p>
        <p className="mt-1 font-semibold">{text(SHARE_V2_SNAPSHOT(generatedAt))}</p>
      </div>
      <p className="text-xs text-gray-400">{text(SHARE_V2_LABELS.readOnlyFooter)}</p>
      <PrintSourceFooter />
    </div>
  )
}
