/*
檔案用途：提供人與寵物共用的「事件」主頁，集中新增與回顧照護大事記。
所在層：src/components 頁面組合層；負責共同頁首、對象切換與事件附近的血壓脈絡。
主要關聯：由 App.tsx 的最左側主 tab 掛載，組合 TabHeader、SubjectSwitcher、CareTimeline 與 useBpRecords。
*/
import { useBpRecords } from '../../../hooks/useBpRecords'
import type { PatientIdentity, Subject } from '../../../lib/auth'
import { CareTimeline } from '../../care-family/components/CareTimeline'
import { SubjectSwitcher } from '../../../components/ui/SubjectSwitcher'
import { TabHeader } from '../../../components/ui/TabHeader'

export function EventsPage({ patientId, availablePatients, userEmail, onSubjectSelect }: {
  patientId: string
  availablePatients: PatientIdentity[]
  userEmail?: string
  onSubjectSelect: (patientId: Subject) => void
}) {
  // 同一個 patient-scoped 事件入口服務所有已授權的人與寵物；照片不再依物種分支，避免新功能只落在寵物流程。
  // 事件頁只需足夠的近期量測作前後脈絡；完整趨勢仍留在資料頁，避免重複載入較重的報表。
  const { records } = useBpRecords(28, patientId)

  return (
    <div className="min-h-full bg-gray-50 px-5 pt-5 pb-6 text-gray-900">
      <header className="mb-4 space-y-3">
        <TabHeader title="events" />
        <SubjectSwitcher patientId={patientId} patients={availablePatients} onSelect={onSubjectSelect} />
      </header>
      <CareTimeline patientId={patientId} userEmail={userEmail} records={records} />
    </div>
  )
}
