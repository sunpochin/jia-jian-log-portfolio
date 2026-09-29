/*
檔案用途：系統設定頁面，包含個人顯示名稱、被照護者管理、目前操作對象切換、體重/服藥顯示與資料匯出；
        「照護對象與家人」「顯示與提醒偏好」兩大類已收進 CollapsibleSection，預設收合以縮短頁面捲動距離。
所在層：src/features/system-admin/pages；為 App 主 Shell 中的 Settings Tab 頁面。
主要關聯：src/App.tsx、CollapsibleSection、CareRecipientManagement、每日照護顯示設定、MedicationDisplaySettings、AppLockSettings、ExportCsvModal、DeleteAccountModal。
*/
import { useState, useMemo, useEffect } from 'react'
import { defaultDisplayNameForEmail, updateProfileDisplayName, signOut, type PatientIdentity, type Subject } from '../../../lib/auth'
import type { ManagedPet } from '../../../lib/tenant'
import { useI18n, type LocalizedText } from '../../../lib/i18n'
import { describeSaveError } from '../../../lib/dataErrors'
import { TabHeader } from '../../../components/ui/TabHeader'
import { SubjectSwitcher } from '../../../components/ui/SubjectSwitcher'
import { CollapsibleSection } from '../../../components/ui/CollapsibleSection'
import { CareRecipientManagement } from '../../care-family/components/CareRecipientManagement'
import { CaregiverInvitationManagement } from '../../care-family/components/CaregiverInvitationManagement'
import { ShareLinkManagement } from '../../care-family/components/ShareLinkManagement'
import { ArchivedPatientHistoryPage } from './ArchivedPatientHistoryPage'
import { CareHandbookPage } from '../../care-family/pages/CareHandbookPage'
import { MedicationDisplaySettings } from '../../../components/settings/MedicationDisplaySettings'
import { CaregiverDensitySettings } from '../../../components/settings/CaregiverDensitySettings'
import { DailyCareDisplaySettings } from '../../../components/settings/DailyCareDisplaySettings'
import { ReadingScaleSettings } from '../../../components/settings/ReadingScaleSettings'
import { AppLockSettings } from '../../../components/settings/AppLockSettings'
import { PersonalNotificationSettings } from '../../../components/settings/PersonalNotificationSettings'
import { CareAnomalyAlertSettingsPanel } from '../../../components/settings/CareAnomalyAlertSettings'
import { BpStandardSettingsPanel } from '../../../components/settings/BpStandardSettings'
import { parseDailyCareDisplaySettingsHash, type DailyCareModuleId, type DailyCareVisibilityPreference } from '../../../lib/dailyCareModules'
import { ExportCsvModal, type ExportTarget } from '../../../components/modals/ExportCsvModal'
import { DeleteAccountModal } from '../../../components/modals/DeleteAccountModal'
import { ContactAndVersionFooter } from '../../../components/system/ContactAndVersionFooter'
import { useTutorial } from '../../../components/tutorial'
import { buildReplayTutorialSteps } from '../../../lib/demoTutorialSteps'

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
  caregiverDensityMode: boolean
  caregiverDensitySettingsSaving: boolean
  caregiverDensitySettingsError: LocalizedText | null
  onToggleCaregiverDensityMode: (enabled: boolean) => Promise<void>
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
  caregiverDensityMode,
  caregiverDensitySettingsSaving,
  caregiverDensitySettingsError,
  onToggleCaregiverDensityMode,
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
  // 每日照護頁的「自訂顯示」捷徑、以及「今天」頁在目標模組被關閉時的導覽，都會把網址改成這個錨點
  // （後者會再加上 `:moduleId`）再切回設定分頁；這裡只在掛載當下讀一次 hash，讓「顯示與提醒偏好」
  // 這個折疊區塊從一開始就展開，DailyCareDisplaySettings 內部才有機會捲動並清除 hash。
  const [shouldOpenDisplayPreferences] = useState(() => parseDailyCareDisplaySettingsHash(window.location.hash).isAnchor)
  const { startTutorial } = useTutorial()

  const handleReplayTutorial = () => {
    // 繁體中文註解：步驟內容住在 src/lib/demoTutorialSteps.ts，跟 App.tsx 的首次自動導覽共用同一份定義；
    // 展示模式專屬的開場白由 builder 依 isDemoMode 決定要不要加。
    startTutorial(buildReplayTutorialSteps({ isDemoMode }))
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
          <label htmlFor="settings-display-name" className="text-xs font-semibold text-gray-500">{text({ id: 'Nama tampilan', zh: '顯示名稱', en: 'Display name' })}</label>
          <div className="flex gap-2">
            <input
              id="settings-display-name"
              type="text"
              required
              maxLength={100}
              value={editingName}
              onChange={e => setEditingName(e.target.value)}
              className="min-w-0 flex-1 rounded-xl border border-gray-300 px-3 py-2 text-sm"
              placeholder={text({ id: 'Nama Anda', zh: '請輸入顯示名稱', en: 'Enter display name' })}
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

      {/* 設定頁原本是十幾張卡片一路往下排，捲動距離長到照護者很難記得「哪個設定在哪裡」。
          改用可折疊分類：預設收合，只留標題與一行說明，需要時再展開，裡面的既有卡片與行為完全不變。 */}
      <CollapsibleSection
        icon="👪"
        title={{ id: 'Orang yang dirawat & keluarga', zh: '照護對象與家人', en: 'Care recipients & family' }}
        description={{ id: 'Tambah hewan, undang keluarga & pasien, tautan berbagi, dan buku panduan', zh: '新增寵物、邀請家人與被照顧者、分享連結、交接手冊', en: 'Add pets, invite family & patients, share links, and the handover guide' }}
      >
        <CareRecipientManagement onCreated={onCareRecipientCreated} onArchived={onCareRecipientArchived} onViewArchived={setViewingArchivedPet} availablePatients={availablePatients} isDemoMode={isDemoMode} />

        <CaregiverInvitationManagement isDemoMode={isDemoMode} />

        {/* 只對有 can_share_readonly 能力的病人顯示；元件內部查無分享對象時直接不渲染，不留空白區塊。 */}
        <ShareLinkManagement isDemoMode={isDemoMode} />

        {/* 換看護時用來當場列印的一頁雙語交接手冊；只針對目前操作對象，避免誤選到別人的資料。 */}
        {activePatientId && (
          <div className="mt-6 rounded-2xl border border-gray-200 bg-white p-4">
            <h2 className="font-bold text-gray-900">{text({ id: 'Buku Panduan Serah Terima Perawatan', zh: '換看護交接手冊', en: 'Caregiver Handover Handbook' })}</h2>
            <p className="mt-1 text-sm text-gray-500">
              {text({ id: 'Cetak satu halaman berisi jadwal obat, alergi, rutinitas, dan kontak darurat untuk pengasuh baru.', zh: '列印一頁包含服藥時間、禁忌、慣用作息與緊急聯絡人，交給新看護第一天使用。', en: 'Print a single page with medication schedules, precautions, daily routines, and emergency contacts for a new caregiver.' })}
            </p>
            <button
              type="button"
              onClick={() => setViewingCareHandbook(true)}
              className="mt-3 min-h-11 rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-bold text-gray-800"
            >
              {text({ id: 'Buat Buku Panduan', zh: '產生交接手冊', en: 'Generate Handbook' })}
            </button>
          </div>
        )}

        {canConfigureActiveSubject && (
          <section className="mt-6 rounded-2xl border border-gray-200 bg-white p-4" aria-labelledby="active-subject-heading">
            <h2 id="active-subject-heading" className="font-bold text-gray-900">{text({ id: 'Orang yang aktif', zh: '目前操作對象', en: 'Active person' })}</h2>
            <p className="mt-1 text-sm text-gray-500">{text({ id: 'Orang yang sama digunakan di semua tab dan di setiap perangkat.', zh: '所有分頁都使用同一個人，並同步到所有裝置。', en: 'All tabs use the same person and sync to all devices.' })}</p>
            {/* 改用其他分頁共用的 SubjectSwitcher。原本這裡是一套只在這一頁出現的 radio 卡片，
                等於同一件事有兩種外觀與兩種互動方式，照護者難以建立「要換人就去哪裡」的穩定習慣。
                共用同一個元件也符合〈介面元件化規範〉。 */}
            <div className="mt-4">
              <SubjectSwitcher patientId={activeSubject} patients={availablePatients} onSelect={onChangeActiveSubject} />
            </div>
            <p className="mt-4 rounded-xl bg-gray-100 px-3 py-2 text-xs text-gray-500">{text({ id: 'Hanya orang yang diizinkan akun ini yang dapat dipilih untuk dirawat.', zh: '只能選擇這個帳號已有照護權限的人。', en: 'Only select people who already have permission to care for this account.' })}</p>
          </section>
        )}
      </CollapsibleSection>

      <CollapsibleSection
        icon="🎛️"
        title={{ id: 'Preferensi tampilan & notifikasi', zh: '顯示與提醒偏好', en: 'Display & notification preferences' }}
        description={{ id: 'Tampilan perawatan harian, tampilan obat, dan notifikasi pribadi', zh: '每日照護顯示、服藥顯示方式與個人化通知', en: 'Daily care display, medication display, and personal notifications' }}
        defaultOpen={shouldOpenDisplayPreferences}
      >
        {/* 這張卡按病人分開保存，避免切換對象後誤用上一位病人的畫面偏好。 */}
        <DailyCareDisplaySettings preference={dailyCarePreference} onChange={onToggleDailyCareModule} saving={dailyCareSettingsSaving} error={dailyCareSettingsError} isDemoMode={isDemoMode} canUseMedication={canUseMedication} useCustomTemplate={useCustomDailyCareTemplate} onToggleCustomTemplate={onToggleCustomTemplate} careRecipientType={activePatientCareRecipientType} />
        <MedicationDisplaySettings slotsExpanded={medicationSlotsExpanded} onChange={onToggleMedicationSlotsExpanded} saving={medicationSettingsSaving} error={medicationSettingsError} nameEnglishFirst={medicationNameEnglishFirst} onChangeNameEnglishFirst={onToggleMedicationNameEnglishFirst} nameSettingsSaving={medicationNameSettingsSaving} nameSettingsError={medicationNameSettingsError} isDemoMode={isDemoMode} />
        <CaregiverDensitySettings enabled={caregiverDensityMode} onChange={onToggleCaregiverDensityMode} saving={caregiverDensitySettingsSaving} error={caregiverDensitySettingsError} isDemoMode={isDemoMode} />
        {/* 個人化通知綁定是帳號層級的能力（不隨切換病人而變），自己管狀態、自己判斷展示模式，
            不往這個頁面已經很長的 props 清單多塞東西。 */}
        <PersonalNotificationSettings />

        {/* 主動異常示警（issue #415）門檻是病人層級的設定，只需要 patientId／isDemoMode／canManageMedication，
            同樣自己管讀取與儲存狀態，不再往這個頁面已經很長的 props 清單多塞專屬 state。canManageMedication
            直接從既有的 availablePatients 找出目前對象那筆，跟資料庫 RLS 用的同一個能力欄位，
            避免只讀權限的家人在畫面上看到可編輯的欄位，卻在失焦儲存時才發現被 RLS 拒絕。 */}
        {activePatientId && (
          <CareAnomalyAlertSettingsPanel
            patientId={activePatientId}
            isDemoMode={isDemoMode}
            canManageMedication={availablePatients.find(patient => patient.patientId === activePatientId)?.canManageMedication ?? false}
          />
        )}

        {/* 血壓判讀標準（issue #898）與上面的異常示警門檻同樣是病人層級的設定，能力欄位也是同一個
            can_manage_medication，所以放在同一個折疊區塊、用同一套自給自足慣例。 */}
        {activePatientId && (
          <BpStandardSettingsPanel
            patientId={activePatientId}
            isDemoMode={isDemoMode}
            canManageMedication={availablePatients.find(patient => patient.patientId === activePatientId)?.canManageMedication ?? false}
          />
        )}
      </CollapsibleSection>

      {/* 字級是「這台裝置的使用者」的偏好，不隨被照護者切換，所以不接任何 patient 參數，
          狀態也自己顧——它不影響任何健康資料，沒有必要讓 App.tsx 多背一組 state。
          放在折疊區塊外面：這是視力輔助功能，應該隨時看得到、點得到，不該多一次展開才能調整。 */}
      <ReadingScaleSettings />

      {/* App 鎖（issue #821）同樣綁這台裝置、不隨被照護者切換，自己管狀態；只在 iOS 原生殼渲染，Web／PWA 看不到。 */}
      <AppLockSettings />

      {/* 資料匯出、合規條款與刪除帳號設定 */}
      <div className="mt-6 rounded-2xl border border-gray-200 bg-white p-4 space-y-3">
        <h2 className="font-bold text-gray-900">{text({ id: 'Data & Privasi', zh: '資料與隱私', en: 'Data & Privacy' })}</h2>
        <div className="flex flex-col gap-3 pt-1">
          <button
            type="button"
            onClick={handleReplayTutorial}
            className="text-left text-sm text-indigo-700 underline font-semibold"
          >
            {text({ id: 'Putar Ulang Panduan', zh: '重播教學導覽', en: 'Replay Tutorial' })}
          </button>

          <button
            type="button"
            onClick={() => setIsExportModalOpen(true)}
            className="text-left text-sm text-gray-700 underline font-semibold"
          >
            {text({ id: 'Ekspor Data (CSV)', zh: '匯出個人資料 (CSV)', en: 'Export Personal Data (CSV)' })}
          </button>

          <a href="/privacy" className="text-left text-sm text-gray-700 underline font-semibold">
            {text({ id: 'Kebijakan Privasi', zh: '隱私權條款', en: 'Privacy Policy' })}
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
            {text({ id: 'Hapus Akun', zh: '刪除帳號', en: 'Delete Account' })}
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
