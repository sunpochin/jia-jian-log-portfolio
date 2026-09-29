/*
檔案用途：門診頁「醫師說了什麼」區塊（照護閉環 T5，issue #949，#847 delta #9）——把已填答案的回診問題依
answered_at 與最近一筆看診配對後分組顯示；來自就診前摘要的問題標出規則來源，配不到看診的答案也照樣顯示。
所在層：src/features/visit/components；純呈現，配對邏輯在 src/lib/visitOutcomes.ts、資料由 useNextVisitOverview 提供。
主要關聯：src/lib/visitOutcomes.ts（pairAnsweredQuestionsWithVisits、PRE_VISIT_RULE_LABELS）、
src/lib/careTimeline.ts（visitKindText）、docs/product/care-loop-domain-model.md §3 Q3、§5。
*/
import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import timezone from 'dayjs/plugin/timezone'
import { common, useI18n, type LocalizedText } from '../../../lib/i18n'
import { TZ } from '../../../lib/timezone'
import { visitKindText } from '../../../lib/careTimeline'
import { PRE_VISIT_RULE_LABELS, type HealthVisitSummary, type VisitOutcomeGroup } from '../../../lib/visitOutcomes'

dayjs.extend(utc)
dayjs.extend(timezone)

const TITLE: LocalizedText = { id: 'Apa kata dokter', zh: '醫師說了什麼', en: 'What the doctor said' }
const CAPTION: LocalizedText = { id: 'Jawaban yang tercatat dipasangkan dengan kunjungan terdekat menurut waktu; bukan tautan resmi ke satu kunjungan.', zh: '已記錄的回答依時間相近性配對最近一次看診，不是正式綁定某次看診。', en: 'Recorded answers are paired with the nearest visit by time; this is not a formal link to one visit.' }
const EMPTY_TEXT: LocalizedText = { id: 'Belum ada jawaban dokter yang tercatat. Catat jawabannya di daftar pertanyaan di atas.', zh: '還沒有記錄任何醫師的回答；請在上方的問題清單填入回答。', en: 'No doctor answers have been recorded yet. Record them in the question list above.' }
const UNAVAILABLE_TEXT: LocalizedText = { id: 'Jawaban atau riwayat kunjungan tidak dapat dimuat. Periksa koneksi lalu coba lagi.', zh: '回答或看診紀錄無法讀取，請確認網路後再試。', en: 'Answers or visit records could not be loaded. Check your connection and try again.' }
const DEMO_TEXT: LocalizedText = { id: 'Daftar pertanyaan belum tersedia di mode demo.', zh: '回診問題清單目前尚未支援展示模式。', en: 'The question checklist is not available in demo mode yet.' }
const UNPAIRED_TITLE: LocalizedText = { id: 'Belum dipasangkan dengan kunjungan', zh: '未配對到看診紀錄', en: 'Not paired with a visit' }
const ANSWER_PREFIX: LocalizedText = { id: 'Jawaban: ', zh: '回答：', en: 'Answer: ' }
const SOURCE_PREFIX: LocalizedText = { id: 'Dari ringkasan sebelum kunjungan', zh: '來自就診前摘要', en: 'From the pre-visit brief' }

function visitHeading(visit: HealthVisitSummary, text: (copy: LocalizedText) => string): string {
  const date = dayjs(visit.occurred_at).tz(TZ).format('YYYY-MM-DD')
  const parts = [visit.visit_kind ? text(visitKindText[visit.visit_kind]) : null, visit.visit_department, visit.visit_institution].filter(Boolean)
  return `${date} · ${parts.length > 0 ? parts.join(' · ') : visit.title}`
}

export function VisitOutcomesSection({ groups, loading, unavailable, demo }: {
  groups: VisitOutcomeGroup[]
  loading: boolean
  unavailable: boolean
  demo: boolean
}) {
  const { text } = useI18n()

  return (
    <section className="mb-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm" aria-labelledby="visit-outcomes-title">
      <h2 id="visit-outcomes-title" className="text-lg font-black text-slate-900">{text(TITLE)}</h2>
      <p className="mt-1 text-xs text-slate-500">{text(CAPTION)}</p>

      {demo && <p className="mt-3 text-sm font-medium text-slate-600">{text(DEMO_TEXT)}</p>}
      {!demo && loading && <p className="mt-3 text-sm text-slate-500">{text(common.loading)}</p>}
      {!demo && !loading && unavailable && <p role="alert" className="mt-3 text-sm font-semibold text-red-700">{text(UNAVAILABLE_TEXT)}</p>}
      {!demo && !loading && !unavailable && groups.length === 0 && <p className="mt-3 text-sm font-medium text-slate-600">{text(EMPTY_TEXT)}</p>}

      {!demo && !loading && groups.map(group => (
        <section key={group.visit?.id ?? 'unpaired'} className="mt-4" aria-label={group.visit ? visitHeading(group.visit, text) : text(UNPAIRED_TITLE)}>
          <h3 className="text-sm font-black text-slate-700">{group.visit ? visitHeading(group.visit, text) : text(UNPAIRED_TITLE)}</h3>
          <ul className="mt-2 space-y-2">
            {group.questions.map(question => {
              const ruleLabel = question.source === 'pre_visit_rule' && question.source_rule_id ? PRE_VISIT_RULE_LABELS[question.source_rule_id] : null
              return (
                <li key={question.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                  <p className="text-base font-bold text-slate-900">{question.question}</p>
                  <p className="mt-1 text-sm text-slate-700">{text(ANSWER_PREFIX)}{question.answer}</p>
                  {question.source === 'pre_visit_rule' && (
                    <p className="mt-1 text-xs text-indigo-700">{text(SOURCE_PREFIX)}{ruleLabel ? `（${text(ruleLabel)}）` : ''}</p>
                  )}
                </li>
              )
            })}
          </ul>
        </section>
      ))}
    </section>
  )
}
