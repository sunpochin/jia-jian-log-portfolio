/*
檔案用途：底部導覽「門診」tab（照護閉環 T5，issue #949；docs/product/clinical-care-ops-ui-design.md phase E）——
回答五層 IA 的第五層 Next visit：「下次」（最近的回診／抽血提醒＋家庭擁有者的 Google 行程）、「帶去給醫師」
（既有血壓報告：軌跡、就診前摘要、列印／複製）、「問什麼」（回診問題清單）、「醫師說了什麼」（答案依時間配對
看診）與「看診後」（記錄醫師指示）。純組合既有元件，不新增資料表。
所在層：src/features/visit/pages；由 App.tsx 的 visit tab 掛載。
主要關聯：useNextVisitOverview（讀）、NextVisitCard、UpcomingScheduleSection（原行程 tab 併入）、
BloodPressureReportPanel、VisitQuestionsPage（embedded）、VisitOutcomesSection、TrajectoryEntryForm＋
useTrajectoryEntryEditor（寫醫師指示）；docs/product/care-loop-domain-model.md §5。
*/
import { lazy, Suspense, useCallback, useMemo, useState } from 'react'
import { common, useI18n, type LocalizedText } from '../../../lib/i18n'
import type { PatientIdentity } from '../../../lib/auth'
import { TabHeader } from '../../../components/ui/TabHeader'
import { SubjectSwitcher } from '../../../components/ui/SubjectSwitcher'
import { ModuleTrendSection } from '../../../components/daily-care/ModuleTrendSection'
import { useConfirm } from '../../../hooks/useConfirm'
import { useTrajectoryEntryEditor } from '../../care-family/hooks/useTrajectoryEntryEditor'
import { TrajectoryEntryForm } from '../../care-family/components/trajectory/TrajectoryEntryForm'
import { VisitQuestionsPage } from '../../reminders/pages/VisitQuestionsPage'
import { nextClinicalReminder, pairAnsweredQuestionsWithVisits } from '../../../lib/visitOutcomes'
import { useNextVisitOverview } from '../hooks/useNextVisitOverview'
import { NextVisitCard } from '../components/NextVisitCard'
import { UpcomingScheduleSection } from '../components/UpcomingScheduleSection'
import { VisitOutcomesSection } from '../components/VisitOutcomesSection'

// 報告面板含 recharts 圖表，跟 InputPage 一樣延後載入，不拖慢門診頁的第一眼。
const BloodPressureReportPanel = lazy(() => import('../../vitals/components/BloodPressureReportPanel').then(m => ({ default: m.BloodPressureReportPanel })))

const BRING_TITLE: LocalizedText = { id: 'Bawa ke dokter', zh: '帶去給醫師', en: 'Bring to the doctor' }
const ASK_TITLE: LocalizedText = { id: 'Apa yang ditanyakan', zh: '問什麼', en: 'What to ask' }
const AFTER_TITLE: LocalizedText = { id: 'Setelah kunjungan', zh: '看診後', en: 'After the visit' }
const AFTER_CAPTION: LocalizedText = { id: 'Catat arahan dokter di sini; catatan masuk ke riwayat perawatan.', zh: '在這裡記下醫師指示；紀錄會進入照護軌跡。', en: 'Record the doctor’s instructions here; they go into the care history.' }
const OPEN_HISTORY: LocalizedText = { id: 'Lihat riwayat', zh: '查看軌跡', en: 'View history' }

export function NextVisitPage({ patientId, availablePatients, onSubjectSelect, userEmail, isDemoMode, showSchedule, onOpenReminders, onOpenHistory }: {
  patientId: string
  availablePatients: PatientIdentity[]
  onSubjectSelect: (patientId: string) => void
  userEmail?: string
  isDemoMode: boolean
  // Google 行程目前只給家庭擁有者（App.tsx 的 canUseSchedule）；其他人不顯示這一段，而不是顯示「尚未連結」。
  showSchedule: boolean
  onOpenReminders: () => void
  onOpenHistory: () => void
}) {
  const { text } = useI18n()
  const overview = useNextVisitOverview(patientId)
  const patient = availablePatients.find(candidate => candidate.patientId === patientId)
  const careRecipientType = patient?.careRecipientType
  // 寵物病人隱藏「問什麼」「醫師說了什麼」（phase E 驗收條件）：就診前摘要與提問文案是為人類醫療情境設計的。
  const isHumanPatient = !careRecipientType || careRecipientType === 'human'
  const { confirm, dialog: confirmDialog } = useConfirm()
  const refreshOverview = overview.refresh
  const onSaved = useCallback(() => refreshOverview(), [refreshOverview])
  // 三個區塊各自持有問題清單的副本（報告面板的「加入問題清單」、嵌入的問題清單頁、「醫師說了什麼」的快照）；
  // 任何一處成功寫入就把其他兩處刷新，不必等 tab 重新掛載（Codex review PR #955 P2）。
  const [questionsVersion, setQuestionsVersion] = useState(0)
  const onQuestionAdopted = useCallback(() => { setQuestionsVersion(version => version + 1); refreshOverview() }, [refreshOverview])
  // 看診後最常記的是醫師指示，表單預設就選好；照護者仍可改成其他類型。
  const editor = useTrajectoryEntryEditor({ patientId, userEmail, onSaved, confirm, initialEventType: 'doctor_instruction' })
  const outcomeGroups = useMemo(() => pairAnsweredQuestionsWithVisits(overview.questions, overview.visits), [overview.questions, overview.visits])

  return (
    <section className="min-h-full bg-slate-50 px-4 pb-8 pt-4 text-slate-950 sm:px-5">
      {confirmDialog}
      <header className="mb-5 space-y-4">
        <TabHeader title="visit" />
        <SubjectSwitcher patientId={patientId} patients={availablePatients} onSelect={onSubjectSelect} />
      </header>

      {/* ── 下次：最接近的回診／抽血提醒（＋家庭擁有者的 Google 行程） ── */}
      <NextVisitCard
        reminder={nextClinicalReminder(overview.reminders)}
        loading={overview.loading}
        unavailable={overview.unavailable.reminders}
        demo={overview.demo}
        onOpenReminders={onOpenReminders}
      />
      {showSchedule && <UpcomingScheduleSection patientId={patientId} isDemoMode={isDemoMode} />}

      {/* ── 帶去給醫師：既有血壓報告（軌跡、就診前摘要、列印／複製）原封不動，只換標題；
             ModuleTrendSection 的期間偏好跨模組共用，這裡沿用同一個選擇器。 ── */}
      <ModuleTrendSection moduleId="nextVisitReport" titleId="next-visit-report-title" title={BRING_TITLE}>
        {days => (
          <Suspense fallback={<p className="text-sm text-slate-500">{text(common.loading)}</p>}>
            <BloodPressureReportPanel patientId={patientId} days={days} subjectLabel={patient?.displayName ?? ''} careRecipientType={careRecipientType} userEmail={userEmail} allowQuestionAdoption onQuestionAdopted={onQuestionAdopted} />
          </Suspense>
        )}
      </ModuleTrendSection>

      {/* ── 問什麼：沿用回診問題清單頁（embedded 去掉頁首），手動新增與範本都在裡面。 ── */}
      {isHumanPatient && (
        <section className="mt-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm" aria-labelledby="next-visit-ask-title">
          <h2 id="next-visit-ask-title" className="text-lg font-black text-slate-900">{text(ASK_TITLE)}</h2>
          <div className="mt-3">
            <VisitQuestionsPage patientId={patientId} embedded refreshKey={questionsVersion} onChanged={refreshOverview} />
          </div>
        </section>
      )}

      {/* ── 醫師說了什麼：已填答案依 answered_at 配對最近一次看診。 ── */}
      {isHumanPatient && (
        <div className="mt-4">
          <VisitOutcomesSection groups={outcomeGroups} loading={overview.loading} unavailable={overview.unavailable.questions || overview.unavailable.visits} demo={overview.demo} />
        </div>
      )}

      {/* ── 看診後：記錄醫師指示（進入照護軌跡）。 ── */}
      <section className="mt-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm" aria-labelledby="next-visit-after-title">
        <div className="flex items-center justify-between gap-2">
          <h2 id="next-visit-after-title" className="text-lg font-black text-slate-900">{text(AFTER_TITLE)}</h2>
          <button type="button" onClick={onOpenHistory} className="min-h-9 text-sm font-bold text-brand-700 underline decoration-brand-200 underline-offset-4">{text(OPEN_HISTORY)}</button>
        </div>
        <p className="mt-1 text-xs text-slate-500">{text(AFTER_CAPTION)}</p>
        <div className="mt-3">
          <TrajectoryEntryForm editor={editor} />
        </div>
      </section>
    </section>
  )
}
