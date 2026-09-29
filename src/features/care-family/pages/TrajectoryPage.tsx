/*
檔案用途：軌跡頁（底部導覽「軌跡」tab）——合併調藥、看診、醫師指示、一般事件、到期提醒與血壓週摘要成單一時間軸，
並提供「＋ 新增紀錄」入口；取代原本的事件 tab（CareTimeline／EventsPage）與服藥頁的「變更藥物」子頁。
所在層：src/features/care-family/pages；由 App.tsx 的 events tab 掛載。
主要關聯：useCareTrajectoryFeed（讀）、useTrajectoryEntryEditor（寫）、TrajectoryEntryForm、
TrajectoryEventList；對應 docs/product/clinical-care-ops-ui-design.md §5–6（issue #735，#659 D 期）。
*/
import { useCallback } from 'react'
import type { PatientIdentity, Subject } from '../../../lib/auth'
import { SubjectSwitcher } from '../../../components/ui/SubjectSwitcher'
import { TabHeader } from '../../../components/ui/TabHeader'
import { useConfirm } from '../../../hooks/useConfirm'
import { useI18n } from '../../../lib/i18n'
import { useCareTrajectoryFeed } from '../hooks/useCareTrajectoryFeed'
import { useTrajectoryEntryEditor } from '../hooks/useTrajectoryEntryEditor'
import { TrajectoryEntryForm } from '../components/trajectory/TrajectoryEntryForm'
import { TrajectoryEventList } from '../components/trajectory/TrajectoryEventList'

export function TrajectoryPage({ patientId, availablePatients, userEmail, onSubjectSelect }: {
  patientId: string
  availablePatients: PatientIdentity[]
  userEmail?: string
  onSubjectSelect: (patientId: Subject) => void
}) {
  const { text } = useI18n()
  const { confirm, dialog: confirmDialog } = useConfirm()
  const { events, weeklyBp, bpRecords, bpUnavailable, loading, loadError, refresh } = useCareTrajectoryFeed(patientId)
  const onSaved = useCallback(() => refresh(), [refresh])
  const editor = useTrajectoryEntryEditor({ patientId, userEmail, onSaved, confirm })

  return (
    <div className="min-h-full bg-gray-50 px-5 pt-5 pb-6 text-gray-900">
      {confirmDialog}
      <header className="mb-4 space-y-3">
        <TabHeader title="events" />
        <SubjectSwitcher patientId={patientId} patients={availablePatients} onSelect={onSubjectSelect} />
      </header>
      <section className="rounded-2xl border border-slate-200 bg-white p-4" aria-labelledby="trajectory-page-title">
        <h2 id="trajectory-page-title" className="sr-only">{text({ id: 'Riwayat perawatan', zh: '照護軌跡', en: 'Care trajectory' })}</h2>
        <TrajectoryEntryForm editor={editor} />
        {loadError && <p role="alert" className="mt-3 text-xs font-semibold text-red-700">{loadError}</p>}
        {loading
          ? <p className="mt-3 text-sm text-slate-500">{text({ id: 'Memuat…', zh: '載入中…', en: 'Loading…' })}</p>
          : <TrajectoryEventList events={events} weeklyBp={weeklyBp} bpRecords={bpRecords} bpUnavailable={bpUnavailable} patientId={patientId} editor={editor} />}
      </section>
    </div>
  )
}
