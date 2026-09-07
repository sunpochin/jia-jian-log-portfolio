/*
檔案用途：系統設定頁面，包含個人顯示名稱、被照護者管理、目前操作對象切換、體重/服藥顯示與資料匯出。
所在層：src/features/system-admin/pages；為 App 主 Shell 中的 Settings Tab 頁面。
主要關聯：src/App.tsx、CareRecipientManagement、每日照護顯示設定、MedicationDisplaySettings、ExportCsvModal、DeleteAccountModal。
*/
import { useState, useMemo, useEffect } from 'react'
import { defaultDisplayNameForEmail, updateProfileDisplayName, signOut, type PatientIdentity, type Subject } from '../../../lib/auth'
import type { ManagedPet } from '../../../lib/tenant'
import { useI18n, type LocalizedText } from '../../../lib/i18n'
import { describeSaveError } from '../../../lib/dataErrors'
import { TabHeader } from '../../../components/ui/TabHeader'
import { SubjectSwitcher } from '../../../components/ui/SubjectSwitcher'
import { CareRecipientManagement } from '../../care-family/components/CareRecipientManagement'
import { CaregiverInvitationManagement } from '../../care-family/components/CaregiverInvitationManagement'
import { ShareLinkManagement } from '../../care-family/components/ShareLinkManagement'
import { ArchivedPatientHistoryPage } from './ArchivedPatientHistoryPage'
import { CareHandbookPage } from '../../care-family/pages/CareHandbookPage'
import { MedicationDisplaySettings } from '../../../components/settings/MedicationDisplaySettings'
import { DailyCareDisplaySettings } from '../../../components/settings/DailyCareDisplaySettings'
import { ReadingScaleSettings } from '../../../components/settings/ReadingScaleSettings'
import type { DailyCareModuleId, DailyCareVisibilityPreference } from '../../../lib/dailyCareModules'
import { ExportCsvModal, type ExportTarget } from '../../../components/modals/ExportCsvModal'
import { DeleteAccountModal } from '../../../components/modals/DeleteAccountModal'
import { ContactAndVersionFooter } from '../../../components/system/ContactAndVersionFooter'
import { useTutorial, type TutorialStep } from '../../../components/tutorial'

export type SettingsPageProps = {
  activeSubject: Subject
  onChangeActiveSubject: (subject: Subject) => void
  onCareRecipientCreated: (patientId: string) => Promise<void>
  onCareRecipientArchived: () => Promise<void>
  availablePatients: PatientIdentity[]
  profileDisplayName?: string
  userEmail?: string
  canConfigureActiveSubject: boolean
  medicationSlotsExpanded: boolean
  medicationSettingsSaving: boolean
  medicationSettingsError: LocalizedText | null
  medicationNameEnglishFirst: boolean
  medicationNameSettingsSaving: boolean
  medicationNameSettingsError: LocalizedText | null
  isDemoMode: boolean
  onToggleMedicationSlotsExpanded: (expanded: boolean) => Promise<void>
  onToggleMedicationNameEnglishFirst: (englishFirst: boolean) => Promise<void>
  dailyCarePreference: DailyCareVisibilityPreference
  dailyCareSettingsSaving: boolean
  dailyCareSettingsError: LocalizedText | null
  onToggleDailyCareModule: (moduleId: DailyCareModuleId, enabled: boolean) => Promise<void>
  useCustomDailyCareTemplate: boolean
  onToggleCustomTemplate: (enabled: boolean) => Promise<void>
  activePatientCareRecipientType?: string
  activePatientId?: string
  canUseMedication: boolean
}

export function SettingsPage({
  activeSubject,
  onChangeActiveSubject,
  onCareRecipientCreated,
  onCareRecipientArchived,
  availablePatients,
  profileDisplayName,
  userEmail,
  canConfigureActiveSubject,
  medicationSlotsExpanded,
  medicationSettingsSaving,
  medicationSettingsError,
  medicationNameEnglishFirst,
  medicationNameSettingsSaving,
  medicationNameSettingsError,
  isDemoMode,
  onToggleMedicationSlotsExpanded,
  onToggleMedicationNameEnglishFirst,
  dailyCarePreference,
  dailyCareSettingsSaving,
  dailyCareSettingsError,
  onToggleDailyCareModule,
  useCustomDailyCareTemplate,
  onToggleCustomTemplate,
  activePatientCareRecipientType,
  activePatientId,
  canUseMedication,
}: SettingsPageProps) {
  const { text } = useI18n()
  const [editingName, setEditingName] = useState(profileDisplayName || defaultDisplayNameForEmail(userEmail))
  const [savingName, setSavingName] = useState(false)
  const [nameMessage, setNameMessage] = useState('')
  const [isExportModalOpen, setIsExportModalOpen] = useState(false)
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false)
  // 只存已封存寵物的識別資料，不寫進任何全域的目前操作對象狀態；
  // 這個頁面因此無法被誤用來讓封存對象變成可寫入路徑會讀到的 activeSubject。
  const [viewingArchivedPet, setViewingArchivedPet] = useState<ManagedPet | null>(null)
  // 只在使用者主動點擊時才顯示交接手冊，避免每次進設定頁都重新查詢藥單。
  const [viewingCareHandbook, setViewingCareHandbook] = useState(false)
  const { startTutorial } = useTutorial()

  const handleReplayTutorial = () => {
    // 繁體中文註解：設定教學導覽步驟，若在展示模式則多加一步歡迎提示
    const steps: TutorialStep[] = [
      {
        targetId: 'tab-dailyCare',
        title: { zh: '每日照護', id: 'Perawatan Harian', en: 'Daily care' },
        content: { zh: '從這裡可以記錄長輩的血壓、體溫，或是對照藥單進行餵藥。每個項目下方都有「近期趨勢」，記錄完可以直接看變化；需要給醫師看的報告與 CSV 匯出也在血壓的近期趨勢裡。', id: 'Di sini Anda dapat mencatat tekanan darah, suhu tubuh, atau memberikan obat sesuai jadwal. Setiap bagian punya "Tren terkini" agar Anda bisa langsung melihat perubahannya; laporan untuk dokter dan ekspor CSV juga ada di tren tekanan darah.', en: 'Record blood pressure and temperature here, or give medication according to the schedule. Each section includes Recent Trends, and blood pressure reports and CSV export are available there.' },
        position: 'top'
      },
      {
        targetId: 'tab-settings',
        title: { zh: '設定與幫助', id: 'Pengaturan & Bantuan', en: 'Settings and help' },
        content: { zh: '您可以在設定頁面中找到「重播教學」按鈕以及其他偏好設定。', id: 'Anda dapat menemukan tombol "Putar Ulang Panduan" dan pengaturan preferensi lainnya di halaman Pengaturan.', en: 'Find the Replay Tutorial button and other preferences on the Settings page.' },
        position: 'top'
      }
    ]
    if (isDemoMode) {
      steps.unshift({
        targetId: 'tutorial-welcome',
        title: { zh: '歡迎來到展示模式', id: 'Selamat datang di Mode Demo', en: 'Welcome to demo mode' },
        content: { zh: '這裡有虛構的長輩資料，您可以隨意點擊、新增或修改，不會影響任何真實資料。', id: 'Berikut adalah data lansia fiktif. Anda dapat mengklik, menambah, atau mengubah sesuka hati tanpa memengaruhi data asli.', en: 'This is fictional care data. You can click, add, or edit freely without affecting real data.' },
        position: 'center'
      })
    }
    startTutorial(steps)
  }

  const exportTargets: ExportTarget[] = useMemo(() => {
    const list: ExportTarget[] = availablePatients.map(patient => {
      const display = { id: patient.displayName, zh: patient.displayName, en: patient.displayName }
      return {
        id: patient.patientId,
        patientId: patient.patientId,
        label: display,
      }
    })
    if (list.length > 1) {
      list.push({
        id: 'all',
        label: { id: 'Semua Anggota (Berkas Terpisah)', zh: '所有成員（分開下載檔）', en: 'All members (download files separately)' },
      })
    }
    return list
  }, [availablePatients])

  useEffect(() => {
    if (profileDisplayName) {
      setEditingName(profileDisplayName)
    } else if (userEmail) {
      setEditingName(defaultDisplayNameForEmail(userEmail))
    }
  }, [profileDisplayName, userEmail])

  const handleSaveName = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!userEmail || !editingName.trim()) return
    setSavingName(true)
    setNameMessage('')
    try {
      await updateProfileDisplayName(userEmail, editingName.trim())
      setNameMessage(text({ id: 'Nama tampilan berhasil disimpan.', zh: '已成功儲存顯示名稱。', en: 'Display name successfully saved.' }))
    } catch (err) {
      console.error('[update display name error]', err)
      setNameMessage(text(describeSaveError(err, { id: 'Gagal menyimpan nama tampilan.', zh: '儲存顯示名稱失敗。', en: 'Failed to save display name.' })))
    } finally {
      setSavingName(false)
    }
  }

  if (viewingArchivedPet) {
    return <ArchivedPatientHistoryPage
      patientId={viewingArchivedPet.patient_id}
      patientName={viewingArchivedPet.display_name}
      careRecipientType={viewingArchivedPet.care_recipient_type}
      userEmail={userEmail}
      onBack={() => setViewingArchivedPet(null)}
    />
  }

  if (viewingCareHandbook && activePatientId) {
    const activePatientName = availablePatients.find(patient => patient.patientId === activePatientId)?.displayName ?? ''
    return <CareHandbookPage
      patientId={activePatientId}
      patientName={activePatientName}
      onBack={() => setViewingCareHandbook(false)}
    />
  }

  return (
    <section className="min-h-full px-5 pt-5 pb-6 text-gray-900">
      <TabHeader title="settings" />

      {/* 編輯個人顯示名稱 */}
      <div className="mt-4 rounded-2xl border border-gray-200 bg-white p-4">
        <h2 className="font-bold text-gray-900">{text({ id: 'Nama Tampilan Saya', zh: '我的顯示名稱', en: 'My Display Name' })}</h2>
        <p className="mt-1 text-sm text-gray-500">
          {text({ id: 'Nama ini akan ditampilkan di laporan dan pilihan subjek.', zh: '此名稱將顯示在頁面與選單中（預設為 Email 帳號前綴）。', en: 'This name will be displayed on pages and menus (default is email account prefix).' })}
        </p>
        <form onSubmit={handleSaveName} className="mt-4 flex flex-col gap-1">
          {/* 放大鏡／低視力使用者也需要看得到這個 label，不能只靠會消失的 placeholder。 */}
          <label htmlFor="settings-display-name" className="text-xs font-semibold text-gray-500">{text({ id: 'Nama tampilan', zh: '顯示名稱', en: 'Name tampilan' })}</label>
          <div className="flex gap-2">
            <input
              id="settings-display-name"
              type="text"
              required
              maxLength={100}
              value={editingName}
              onChange={e => setEditingName(e.target.value)}
              className="min-w-0 flex-1 rounded-xl border border-gray-300 px-3 py-2 text-sm"
              placeholder={text({ id: 'Nama Anda', zh: '請輸入顯示名稱', en: 'Name You' })}
            />
            <button
              type="submit"
              disabled={savingName}
              className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-60"
            >
              {text({ id: 'Simpan', zh: '儲存', en: 'Save' })}
            </button>
          </div>
        </form>
        {/* 一開始就掛載空的 live region，只更新文字；已經有內容才掛載的話部分讀屏器不會播報。 */}
        <p role="status" aria-live="polite" className="mt-2 min-h-4 text-xs font-semibold text-gray-600">{nameMessage}</p>
      </div>

      <CareRecipientManagement onCreated={onCareRecipientCreated} onArchived={onCareRecipientArchived} onViewArchived={setViewingArchivedPet} availablePatients={availablePatients} isDemoMode={isDemoMode} />

      <CaregiverInvitationManagement isDemoMode={isDemoMode} />

      {/* 只對有 can_share_readonly 能力的病人顯示；元件內部查無分享對象時直接不渲染，不留空白區塊。 */}
      <ShareLinkManagement isDemoMode={isDemoMode} />

      {/* 換看護時用來當場列印的一頁雙語交接手冊；只針對目前操作對象，避免誤選到別人的資料。 */}
      {activePatientId && (
        <div className="mt-4 rounded-2xl border border-gray-200 bg-white p-4">
          <h2 className="font-bold text-gray-900">{text({ id: 'Buku Panduan Serah Terima Perawatan', zh: '換看護交接手冊' ,en: "Buku Panduan Serah Terima Care" })}</h2>
          <p className="mt-1 text-sm text-gray-500">
            {text({ id: 'Cetak satu halaman berisi jadwal obat, alergi, rutinitas, dan kontak darurat untuk pengasuh baru.', zh: '列印一頁包含服藥時間、禁忌、慣用作息與緊急聯絡人，交給新看護第一天使用。' ,en: "Cetak satu halaman berisi schedule medication, alergi, rutthistas, and kontak darurat for caregiver new." })}
          </p>
          <button
            type="button"
            onClick={() => setViewingCareHandbook(true)}
            className="mt-3 min-h-11 rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-bold text-gray-800"
          >
            {text({ id: 'Buat Buku Panduan', zh: '產生交接手冊' ,en: "Buat Buku Panduan" })}
          </button>
        </div>
      )}

      {canConfigureActiveSubject && <>
        {/* Settings 已由 TabHeader 建立頁面 h1，這裡維持階層用 h2，避免讀屏標題結構跳級。 */}
        <h2 className="mt-6 text-2xl font-black">{text({ id: 'Orang yang aktif', zh: '目前操作對象', en: 'Person that aktif' })}</h2>
        <p className="mt-1 text-sm text-gray-500">{text({ id: 'Orang yang sama digunakan di semua tab dan di setiap perangkat.', zh: '所有分頁都使用同一個人，並同步到所有裝置。', en: 'All tabs use the same person and sync to all devices.' })}</p>
        {/* 改用其他分頁共用的 SubjectSwitcher。原本這裡是一套只在這一頁出現的 radio 卡片，
            等於同一件事有兩種外觀與兩種互動方式，照護者難以建立「要換人就去哪裡」的穩定習慣。
            共用同一個元件也符合〈介面元件化規範〉。 */}
        <div className="mt-4">
          <SubjectSwitcher patientId={activeSubject} patients={availablePatients} onSelect={onChangeActiveSubject} />
        </div>
        <p className="mt-5 rounded-xl bg-gray-100 px-3 py-2 text-xs text-gray-500">{text({ id: 'Hanya orang yang diizinkan akun ini yang dapat dipilih untuk dirawat.', zh: '只能選擇這個帳號已有照護權限的人。', en: 'Only select people who already have permission to care for this account.' })}</p>
      </>}
      {/* 這張卡按病人分開保存，避免切換對象後誤用上一位病人的畫面偏好。 */}
      <DailyCareDisplaySettings preference={dailyCarePreference} onChange={onToggleDailyCareModule} saving={dailyCareSettingsSaving} error={dailyCareSettingsError} isDemoMode={isDemoMode} canUseMedication={canUseMedication} useCustomTemplate={useCustomDailyCareTemplate} onToggleCustomTemplate={onToggleCustomTemplate} careRecipientType={activePatientCareRecipientType} />
      <MedicationDisplaySettings slotsExpanded={medicationSlotsExpanded} onChange={onToggleMedicationSlotsExpanded} saving={medicationSettingsSaving} error={medicationSettingsError} nameEnglishFirst={medicationNameEnglishFirst} onChangeNameEnglishFirst={onToggleMedicationNameEnglishFirst} nameSettingsSaving={medicationNameSettingsSaving} nameSettingsError={medicationNameSettingsError} isDemoMode={isDemoMode} />
      {/* 字級是「這台裝置的使用者」的偏好，不隨被照護者切換，所以不接任何 patient 參數，
          狀態也自己顧——它不影響任何健康資料，沒有必要讓 App.tsx 多背一組 state。 */}
      <ReadingScaleSettings />

      {/* 資料匯出、合規條款與刪除帳號設定 */}
      <div className="mt-6 rounded-2xl border border-gray-200 bg-white p-4 space-y-3">
        <h2 className="font-bold text-gray-900">{text({ id: 'Data & Privasi', zh: '資料與隱私', en: 'Data & Privacy' })}</h2>
        <div className="flex flex-col gap-3 pt-1">
          <button
            type="button"
            onClick={handleReplayTutorial}
            className="text-left text-sm text-indigo-700 underline font-semibold"
          >
            {text({ id: 'Putar Ulang Panduan', zh: '重播教學導覽', en: 'Putar Ulang Panduan' })}
          </button>

          <button
            type="button"
            onClick={() => setIsExportModalOpen(true)}
            className="text-left text-sm text-gray-700 underline font-semibold"
          >
            {text({ id: 'Ekspor Data (CSV)', zh: '匯出個人資料 (CSV)', en: 'Export Personal Data (CSV)' })}
          </button>

          <a href="/privacy" className="text-left text-sm text-gray-700 underline font-semibold">
            {text({ id: 'Kebijakan Privasi', zh: '隱私權條款', en: 'Kebijakan Privacy' })}
          </a>

          <a href="/terms" className="text-left text-sm text-gray-700 underline font-semibold">
            {text({ id: 'Syarat & Ketentuan', zh: '服務條款', en: 'Terms of Service' })}
          </a>

          {/* Release notes 不讀健康資料，放在同一區讓照護者可安全查看版本變更。 */}
          <a href="/releases" className="text-left text-sm text-gray-700 underline font-semibold">
            {text({ id: 'Catatan Rilis', zh: '版本更新說明', en: 'Release notes' })}
          </a>

          <button
            type="button"
            onClick={() => setIsDeleteModalOpen(true)}
            className="text-left text-sm font-bold text-red-600 underline mt-2"
          >
            {text({ id: 'Hapus Akun', zh: '刪除帳號', en: 'DELETE ACCOUNT' })}
          </button>
        </div>
      </div>

      {/* 登出與量測無關，集中在設定頁避免擠壓最新生命徵象的閱讀空間。 */}
      <button
        type="button"
        onClick={() => signOut()}
        className="mt-6 w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-gray-600 active:bg-gray-50"
      >
        {text({ id: 'Keluar', zh: '登出', en: 'Sign out' })}
      </button>

      {/* 聯絡與版本資訊集中在登入後的設定頁，讓照護者可直接把 commit 回報給工程端，並聯絡開發者。 */}
      <ContactAndVersionFooter className="mt-4" />

      <ExportCsvModal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        targets={exportTargets}
      />

      <DeleteAccountModal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
      />
    </section>
  )
}
