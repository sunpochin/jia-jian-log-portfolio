/*
檔案用途：v2 分享頁的「近 30 天就診與調藥」列表與「回診問題數量」——只顯示日期、就診類型、科別、藥名與動作，沒有標題、內容、院所。
所在層：src/features/care-family/components/shareSummaryV2；由 ShareSummaryV2View 掛載。
主要關聯：src/lib/careTimeline.ts（就診類型詞彙）、src/lib/shareSummaryV2Presentation.ts、../../shareSummaryV2Copy.ts。
*/
import { useI18n } from '../../../../lib/i18n'
import { visitKindText, type VisitKind } from '../../../../lib/careTimeline'
import type { PatientShareSummaryV2Dto } from '../../../../lib/shareSummaryV2Dto'
import { MEDICATION_CHANGE_ACTION_LABELS, formatTaipeiDate } from '../../../../lib/shareSummaryV2Presentation'
import { SHARE_V2_EMPTY_EVENTS, SHARE_V2_LABELS, SHARE_V2_NO_OPEN_QUESTIONS, SHARE_V2_OPEN_QUESTIONS, SHARE_V2_TRUNCATED } from '../../shareSummaryV2Copy'

export function ShareSummaryEventsSection({ recentEvents, openConcerns }: Pick<PatientShareSummaryV2Dto, 'recentEvents' | 'openConcerns'>) {
  const { text } = useI18n()
  return (
    <>
      <section aria-labelledby="share-v2-events-title" className="rounded-2xl border border-gray-200 p-4 print:break-inside-avoid">
        <h2 id="share-v2-events-title" className="text-sm font-bold text-gray-800">{text(SHARE_V2_LABELS.events)}</h2>
        {recentEvents.items.length === 0 ? (
          <p className="mt-3 text-sm text-gray-500">{text(SHARE_V2_EMPTY_EVENTS)}</p>
        ) : (
          <ul className="mt-2 divide-y divide-gray-100">
            {recentEvents.items.map((event, index) => {
              const kind = event.visitKind && event.visitKind in visitKindText ? text(visitKindText[event.visitKind as VisitKind]) : event.visitKind
              return (
                <li key={`${event.occurredAt}-${index}`} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 py-1.5 text-sm text-gray-800">
                  <span className="shrink-0 tabular-nums text-xs text-gray-500">{formatTaipeiDate(event.occurredAt)}</span>
                  {event.eventType === 'health_visit' ? (
                    <span>
                      <span className="font-bold">{text(SHARE_V2_LABELS.visit)}</span>
                      {kind && ` · ${kind}`}
                      {/* 科別是 ≤40 字的使用者短標籤，是「哪一科」的必要資訊；院所名稱刻意不在 DTO 裡。 */}
                      {event.visitDepartment && ` · ${event.visitDepartment}`}
                    </span>
                  ) : (
                    <span>
                      <span className="font-bold">{text(SHARE_V2_LABELS.medicationChange)}</span>
                      {event.medicationChange && ` · ${event.medicationChange.medicationDisplayName} · ${text(MEDICATION_CHANGE_ACTION_LABELS[event.medicationChange.action])}`}
                    </span>
                  )}
                </li>
              )
            })}
          </ul>
        )}
        {recentEvents.truncated && <p className="mt-2 text-xs font-semibold text-amber-700">{text(SHARE_V2_TRUNCATED(recentEvents.items.length))}</p>}
      </section>

      <section aria-labelledby="share-v2-concerns-title" className="rounded-2xl border border-gray-200 p-4 print:break-inside-avoid">
        <h2 id="share-v2-concerns-title" className="text-sm font-bold text-gray-800">{text(SHARE_V2_LABELS.concerns)}</h2>
        {/* 只顯示「有幾個」，不顯示「是什麼」（ADR-009 決策六）。 */}
        <p className="mt-2 text-sm text-gray-800">
          {openConcerns.openQuestionCount > 0 ? text(SHARE_V2_OPEN_QUESTIONS(openConcerns.openQuestionCount)) : text(SHARE_V2_NO_OPEN_QUESTIONS)}
        </p>
      </section>
    </>
  )
}
