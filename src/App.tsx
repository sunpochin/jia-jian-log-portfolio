/*
檔案用途：組合登入後的應用程式外殼、主要 tab、共用語言列與病人選擇狀態。
所在層：src 根入口；負責在頁面元件之間傳遞授權後的病人資料，不直接實作各 tab 的照護流程。
主要關聯：使用 useAuth、LoginScreen、UnauthorizedScreen，以及 lazy 載入的 EventsPage／DailyCarePage／SettingsPage／Privacy／Terms／HealthDataNotice／Releases 頁。
已無獨立的「報告」底部分頁——趨勢與報告已回到各照護模組，封存對象的唯讀歷史改由
SettingsPage 底下的 ArchivedPatientHistoryPage 提供，詳見 docs/features/vitals.md。
*/
import { useCallback, useEffect, useMemo, useRef, useState, lazy, Suspense } from 'react'
import type { ComponentType } from 'react'
import { useAuth } from './hooks/useAuth'
import { isLineBrowser, isAdministratorEmail, DEMO_MEILING_PATIENT_ID, type PatientIdentity, type Subject } from './lib/auth'
import { readActivePatientPreference, resolveActivePatientPreference, saveActivePatientPreference } from './lib/activeSubjectPreference'
import { resolveWritableSubject } from './lib/careSubjectGuard'
import { readMedicationSlotsExpandedPreference, readMedicationSlotsExpandedPreferenceForUser, saveMedicationSlotsExpandedPreference, saveMedicationSlotsExpandedPreferenceForUser, readMedicationNameEnglishFirstPreference, readMedicationNameEnglishFirstPreferenceForUser, saveMedicationNameEnglishFirstPreference, saveMedicationNameEnglishFirstPreferenceForUser } from './lib/medicationDisplayPreference'
import { readDailyCarePreference, readDailyCarePreferenceForPatient, saveDailyCarePreference, saveDailyCarePreferenceForPatient } from './lib/dailyCarePreferences'
import { DAILY_CARE_DISPLAY_SETTINGS_ANCHOR, DAILY_CARE_MODULES, DEFAULT_DAILY_CARE_VISIBILITY, updateDailyCareVisibility, visibleDailyCareModules as getVisibleDailyCareModules, type DailyCareModuleId, type DailyCareVisibilityPreference } from './lib/dailyCareModules'
import { buildOnboardingDailyCarePreference, hasCompletedOnboardingWizard, markOnboardingWizardCompleted, type OnboardingCareTarget, type OnboardingRecorder } from './lib/onboardingWizard'
import { OnboardingWizard } from './components/onboarding/OnboardingWizard'
import { common, useI18n, type LocalizedText } from './lib/i18n'
import { useTutorial } from './components/tutorial'
import { AppStatusBar } from './components/system/AppStatusBar'
import { TAB_NAV_LABELS } from './components/ui/TabHeader'
import { HealthDataConsentScreen } from './features/care-family/components/HealthDataConsentScreen'
import { PrivacyPolicyUpdateScreen } from './features/care-family/components/PrivacyPolicyUpdateScreen'
import { CURRENT_HEALTH_CONSENT_VERSION, CURRENT_PRIVACY_POLICY_VERSION, loadLegalConsentWithRetry } from './lib/legalConsent'
import { DEMO_VISITOR_EMAIL } from './lib/demoStorage'
import { clearDemoModuleHandoff, readDemoModuleHandoff, writeDemoModuleHandoff } from './lib/demoHandoff'
import { LoginScreen } from './components/auth/LoginScreen'
import { UnauthorizedScreen } from './components/auth/UnauthorizedScreen'
import { LineBrowserGate } from './components/system/LineBrowserGate'
import { useKeyboardViewport } from './hooks/useKeyboardViewport'
import { fetchPendingCaregiverInvitations, getCaregiverInvitationsRequiringRequest, type PendingCaregiverInvitation } from './lib/caregiverInvitations'
import { fetchPendingPatientCareInvitations, type PatientCareInvitation } from './lib/tenant'
import { CaregiverInvitationJoinPage } from './features/care-family/pages/CaregiverInvitationJoinPage'
import { PatientInvitationJoinPage } from './features/care-family/pages/PatientInvitationJoinPage'
import { PatientInvitationScreen } from './features/care-family/components/PatientInvitationScreen'
import { CaregiverInvitationScreen } from './features/care-family/components/CaregiverInvitationScreen'
import { BloodPressureCountdownBanner } from './components/ui/BloodPressureCountdownBanner'
import { clearBloodPressureMeasurementSession, getBloodPressureMeasurementSessionKey, readBloodPressureMeasurementSession, saveBloodPressureMeasurementSession, shouldCancelBloodPressureMeasurementSession, type BloodPressureMeasurementSession } from './lib/bloodPressureMeasurementSession'
import { APP_DOCUMENT_TITLE, APP_HOME_SCREEN_TITLE } from './lib/appInfo'
import { consumePwaShortcutQuery, resolvePwaShortcutTarget } from './lib/pwaShortcuts'
import { trackEvent, trackWeek1Return } from './lib/analytics'

// 包裝 React.lazy 以提供網路出錯或版本更新時的自動重試機制。
const lazyWithRetry = (importFn: () => Promise<{ default: ComponentType<any> }>) =>
  lazy(() =>
    importFn().catch((err) => {
      console.error('Failed to load chunk, retrying via reload...', err)
      window.location.reload()
      return { default: () => null }
    })
  )

// 使用動態載入以優化 Bundle 大小。有 PWA 快取守護，離線仍可使用。
const AdminPage = lazyWithRetry(() => import('./features/system-admin/pages/AdminPage').then(m => ({ default: m.AdminPage })))
const DailyCarePage = lazyWithRetry(() => import('./features/care-family/pages/DailyCarePage').then(m => ({ default: m.DailyCarePage })))
const EventsPage = lazyWithRetry(() => import('./features/system-admin/pages/EventsPage').then(m => ({ default: m.EventsPage })))
const UpcomingSchedulePage = lazyWithRetry(() => import('./features/care-family/pages/UpcomingSchedulePage').then(m => ({ default: m.UpcomingSchedulePage })))
const SettingsPage = lazyWithRetry(() => import('./features/system-admin/pages/SettingsPage').then(m => ({ default: m.SettingsPage })))
// 條款／隱私／版本頁多半只被直接連結存取一次，不必進主要進入點的 bundle。
const PrivacyPage = lazyWithRetry(() => import('./features/system-admin/pages/PrivacyPage').then(m => ({ default: m.PrivacyPage })))
const TermsPage = lazyWithRetry(() => import('./features/system-admin/pages/TermsPage').then(m => ({ default: m.TermsPage })))
const HealthDataNoticePage = lazyWithRetry(() => import('./features/system-admin/pages/HealthDataNoticePage').then(m => ({ default: m.HealthDataNoticePage })))
const ReleasesPage = lazyWithRetry(() => import('./features/system-admin/pages/ReleasesPage').then(m => ({ default: m.ReleasesPage })))
// 公開衛教內容頁（issue #442）：免登入、不寫入資料，供搜尋引擎索引與訪客閱讀，底部附 CTA 導向 /demo。
const GuidesIndexPage = lazyWithRetry(() => import('./features/system-admin/pages/guides/GuidesIndexPage').then(m => ({ default: m.GuidesIndexPage })))
const BloodPressure722GuidePage = lazyWithRetry(() => import('./features/system-admin/pages/guides/BloodPressure722GuidePage').then(m => ({ default: m.BloodPressure722GuidePage })))
const CaregiverHandoverGuidePage = lazyWithRetry(() => import('./features/system-admin/pages/guides/CaregiverHandoverGuidePage').then(m => ({ default: m.CaregiverHandoverGuidePage })))
const PetChronicDiseaseGuidePage = lazyWithRetry(() => import('./features/system-admin/pages/guides/PetChronicDiseaseGuidePage').then(m => ({ default: m.PetChronicDiseaseGuidePage })))
const MedicationScheduleGuidePage = lazyWithRetry(() => import('./features/system-admin/pages/guides/MedicationScheduleGuidePage').then(m => ({ default: m.MedicationScheduleGuidePage })))
const FamilyInvitationGuidePage = lazyWithRetry(() => import('./features/system-admin/pages/guides/FamilyInvitationGuidePage').then(m => ({ default: m.FamilyInvitationGuidePage })))
// 唯讀分享連結接收頁（Stage 3b）：免登入、無寫入能力，token 只在瀏覽器記憶體短暫存在。
const ShareSummaryPage = lazyWithRetry(() => import('./features/care-family/pages/ShareSummaryPage').then(m => ({ default: m.ShareSummaryPage })))

type Tab = 'events' | 'dailyCare' | 'schedule' | 'settings'
type ConsentStatus = 'idle' | 'loading' | 'required' | 'ready'

export default function App() {
  const { text, locale } = useI18n()
  const { startTutorial } = useTutorial()
  const keyboardOpen = useKeyboardViewport()
  // 為什麼同時保留兩組啟動狀態：PWA 捷徑決定初始照護分頁，漏斗 ref 則避免公開首頁事件在 auth 尚未解析時重複送出；兩者都必須由外殼層一次建立。
  const [pwaShortcutTarget, setPwaShortcutTarget] = useState(() => resolvePwaShortcutTarget(window.location.search))
  const landingViewTrackedRef = useRef(false)

  const consumePwaShortcut = useCallback(() => {
    // 為什麼等 DailyCarePage 首次掛載才消費：App 可能先顯示登入或同意畫面，太早清除 query 會讓登入後遺失原本的捷徑頁籤。
    const nextSearch = consumePwaShortcutQuery(window.location.search)
    setPwaShortcutTarget(null)
    window.history.replaceState(window.history.state, '', window.location.pathname + nextSearch + window.location.hash)
  }, [])

  useEffect(() => {
    // /guides/* 是各自管理 document.title／meta description 的公開衛教頁（ContentGuideLayout），
    // 這裡的 effect 在子元件之後才觸發；若不排除，每次切換語言都會把子元件剛設好的頁面標題蓋回通用標題。
    if (window.location.pathname.startsWith('/guides/')) return
    // 瀏覽器分頁標題也屬於系統文案；語系切換時同步更新，避免畫面與瀏覽器標籤顯示不同語言。
    document.title = text(APP_DOCUMENT_TITLE)
    // iOS「加入主畫面」讀的是這個 meta（沒有才退回分頁標題，而分頁標題太長會被系統截斷成看不出語系的字串），
    // 跟分頁標題一樣要隨語系即時更新，才不會讓印尼文家屬桌面捷徑卡在切換前的語系文字。
    document.querySelector('meta[name="apple-mobile-web-app-title"]')?.setAttribute('content', text(APP_HOME_SCREEN_TITLE))
  }, [locale, text])

  useEffect(() => {
    // Android／桌面 Chrome「加到主畫面」讀的是 manifest 的 short_name，不吃 apple-mobile-web-app-title；
    // 建置期已經輸出印尼文與英文 manifest（見 vite.config.ts），這裡只需要切換
    // <link rel="manifest"> 指到哪一份。不放進上面那個 effect，是因為 manifest 不是頁面內容，
    // /guides/* 這類公開衛教頁也要跟著全域語系走，不能被那裡的早退邏輯連帶擋掉。
    document.querySelector('link[rel="manifest"]')?.setAttribute('href', locale === 'id' ? '/manifest-id.webmanifest' : locale === 'en' ? '/manifest-en.webmanifest' : '/manifest.webmanifest')
  }, [locale])
  const [tab, setTab] = useState<Tab>(() => pwaShortcutTarget?.tab ?? 'dailyCare')
  const [activeSubject, setActiveSubject] = useState<Subject | null>(() => {
    if (typeof window !== 'undefined' && window.location.pathname === '/demo') {
      return DEMO_MEILING_PATIENT_ID
    }
    return null
  })
  const [medicationSlotsExpanded, setMedicationSlotsExpanded] = useState(readMedicationSlotsExpandedPreference)
  const [medicationSettingsSaving, setMedicationSettingsSaving] = useState(false)
  const [medicationSettingsError, setMedicationSettingsError] = useState<LocalizedText | null>(null)
  const [medicationNameEnglishFirst, setMedicationNameEnglishFirst] = useState(readMedicationNameEnglishFirstPreference)
  const [medicationNameSettingsSaving, setMedicationNameSettingsSaving] = useState(false)
  const [medicationNameSettingsError, setMedicationNameSettingsError] = useState<LocalizedText | null>(null)
  const [dailyCarePreference, setDailyCarePreference] = useState<DailyCareVisibilityPreference>(DEFAULT_DAILY_CARE_VISIBILITY)
  const [useCustomDailyCareTemplate, setUseCustomDailyCareTemplate] = useState(false)
  const [dailyCareSettingsSaving, setDailyCareSettingsSaving] = useState(false)
  const [dailyCareSettingsError, setDailyCareSettingsError] = useState<LocalizedText | null>(null)
  const [onboardingWizardPatientId, setOnboardingWizardPatientId] = useState<string | null>(null)
  const [onboardingWizardError, setOnboardingWizardError] = useState<LocalizedText | null>(null)
  // 獨立於 dailyCareSettingsSaving：精靈儲存跟設定頁的模組切換共用同一個旗標的話，
  // 精靈存檔途中若病人被切走，finally 判斷 activePatientIdRef 不符就不會重設旗標，
  // 會讓新病人的設定頁卡在「儲存中」動彈不得。
  const [onboardingWizardSaving, setOnboardingWizardSaving] = useState(false)
  // 首次登入時若讀到試用承接的模組組合，直接套用並顯示這個空狀態提示，而不是照常跳三題精靈；
  // 只保留「套用了哪些模組 id」讓提示能列出名稱，絕不保留任何 demo 健康數值。
  const [demoHandoffNotice, setDemoHandoffNotice] = useState<{ moduleIds: DailyCareModuleId[] } | null>(null)
  const [privacyPolicyStatus, setPrivacyPolicyStatus] = useState<ConsentStatus>('idle')
  const [healthConsentStatus, setHealthConsentStatus] = useState<ConsentStatus>('idle')
  const [pendingPatientInvitations, setPendingPatientInvitations] = useState<PatientCareInvitation[] | null>(null)
  const [pendingCaregiverInvitations, setPendingCaregiverInvitations] = useState<PendingCaregiverInvitation[]>([])
  const [bloodPressureMeasurementSession, setBloodPressureMeasurementSession] = useState<BloodPressureMeasurementSession | null>(() => readBloodPressureMeasurementSession())
  // 已歸檔對象被自動換掉時必須留下痕跡；靜默換人會讓照護者以為還在同一位對象身上操作。
  const [archivedSubjectNotice, setArchivedSubjectNotice] = useState(false)
  const [patientInvitationLoadError, setPatientInvitationLoadError] = useState(false)
  const [patientInvitationLoadAttempt, setPatientInvitationLoadAttempt] = useState(0)
  const { user, isDemoMode, enterDemoMode, exitDemoMode, ownPatientId, subject, displayName, accessiblePatients, allAccessiblePatients, accessibleSubjects, allAccessibleSubjects, medicationManagementPatients, patientIdsBySubject, refreshIdentity, loading } = useAuth()
  useEffect(() => {
    if (window.location.pathname !== '/' || isDemoMode || loading) return
    // 為什麼等 auth 完成：持久 session 的照護者也會短暫看到 root，不能把日常回到 App 算成獲客首頁瀏覽。
    if (user) {
      trackWeek1Return({ locale })
      return
    }
    if (landingViewTrackedRef.current) return
    // 只記錄確認為未登入的公開首頁，不把登入者或目前照護對象當成事件參數。
    if (trackEvent('landing_view', { locale })) landingViewTrackedRef.current = true
  }, [isDemoMode, loading, locale, user])
  const effectiveAccessibleSubjects = accessibleSubjects
  const effectiveAllAccessibleSubjects = allAccessibleSubjects
  const effectiveSubject = subject
  const effectiveDisplayName = displayName || user?.user_metadata?.full_name || user?.email?.split('@')[0]
  const effectiveSubjectsKey = effectiveAccessibleSubjects.join(',')
  const userId = user?.id
  const activePatientId = activeSubject ? patientIdsBySubject[activeSubject] : undefined
  const activePatientIdRef = useRef(activePatientId)
  const autoProvisionAttemptedEmailRef = useRef<string | null>(null)
  const measurementAccountRef = useRef<string | undefined>(undefined)
  const measurementIdentityResolvedRef = useRef(false)
  activePatientIdRef.current = activePatientId
  const effectiveUserEmail = user?.email ?? (isDemoMode ? DEMO_VISITOR_EMAIL : '')
  const canUseMedication = Boolean(effectiveUserEmail && effectiveSubject)
  // 行程分頁目前只給擁有 Google Calendar 來源的家庭擁有者使用，其餘照護者暫不開放；之後要開放給更多家人時再放寬。
  const canUseSchedule = isAdministratorEmail(user?.email)
  // 讓頁內頁籤只在偏好或能力真的變動時重建，避免每次外殼重繪都觸發隱藏頁籤校正。
  const activePatientCareRecipientType = activePatientId ? accessiblePatients.find(p => p.patientId === activePatientId)?.careRecipientType : undefined
  // 只給試用承接的非同步套用邏輯讀最新值用；不能把這個值放進下面那個 effect 的依賴陣列——
  // accessiblePatients 常在該 effect 已經跑過一次之後才非同步載入完成，若列入依賴會讓整個
  // effect（包含開頭把 demoHandoffNotice 重設為 null 那段）在物種到位時重跑一次，
  // 把剛顯示出來的承接提示又立刻清掉。用 ref 讀最新物種即可，不必重跑整個 effect。
  const activePatientCareRecipientTypeRef = useRef(activePatientCareRecipientType)
  activePatientCareRecipientTypeRef.current = activePatientCareRecipientType
  const visibleDailyCareModules = useMemo(
    () => getVisibleDailyCareModules(dailyCarePreference, { canUseMedication, careRecipientType: activePatientCareRecipientType, useCustomTemplate: useCustomDailyCareTemplate }),
    [dailyCarePreference, canUseMedication, activePatientCareRecipientType, useCustomDailyCareTemplate],
  )

  const completeBloodPressureMeasurementSession = useCallback(() => {
    clearBloodPressureMeasurementSession()
    setBloodPressureMeasurementSession(null)
    // Web banner 是第二次量測的流程狀態；完成或範圍切換時要清掉，iOS 即時測試通知則各自保留紀錄。
  }, [])

  const resolvedSelectedSubject = activeSubject && (effectiveAccessibleSubjects.includes(activeSubject) || effectiveAllAccessibleSubjects.includes(activeSubject))
    ? activeSubject
    : effectiveAccessibleSubjects[0] ?? effectiveSubject ?? ''
  const resolvedSelectedPatientId = patientIdsBySubject[resolvedSelectedSubject]

  useEffect(() => {
    if (loading) return

    const accountChanged = measurementIdentityResolvedRef.current && measurementAccountRef.current !== userId
    const initialSignedOut = !measurementIdentityResolvedRef.current && !userId && bloodPressureMeasurementSession !== null
    measurementIdentityResolvedRef.current = true
    measurementAccountRef.current = userId

    if (shouldCancelBloodPressureMeasurementSession(
      bloodPressureMeasurementSession,
      resolvedSelectedPatientId,
      accountChanged || initialSignedOut,
    )) {
      // 這裡涵蓋 auth／授權清單／建立病人等直接 setActiveSubject 的路徑，避免只靠 picker callback 才取消通知。
      completeBloodPressureMeasurementSession()
    }
  }, [bloodPressureMeasurementSession, completeBloodPressureMeasurementSession, loading, resolvedSelectedPatientId, userId])

  useEffect(() => {
    if (isDemoMode) {
      setMedicationSlotsExpanded(readMedicationSlotsExpandedPreference())
      setMedicationSettingsError(null)
      setMedicationSettingsSaving(false)
      setMedicationNameEnglishFirst(readMedicationNameEnglishFirstPreference())
      setMedicationNameSettingsError(null)
      setMedicationNameSettingsSaving(false)

      // 繁體中文註解：觸發展示模式的初次教學導覽
      const hasSeenTutorial = localStorage.getItem('jia-jian-log-demo-tutorial')
      if (!hasSeenTutorial) {
        setTimeout(() => {
          startTutorial([
            {
              targetId: 'tutorial-welcome',
              title: { zh: '歡迎來到展示模式', en: 'Welcome to demo mode', id: 'Selamat datang di Mode Demo' },
              content: { zh: '這裡有虛構的長輩資料，您可以隨意點擊、新增或修改，不會影響任何真實資料。', en: 'This is fictional care data. You can click, add, or edit freely without affecting real data.', id: 'Berikut adalah data lansia fiktif. Anda dapat mengklik, menambah, atau mengubah sesuka hati tanpa memengaruhi data asli.' },
              position: 'center'
            },
            {
              targetId: 'tab-dailyCare',
              title: { zh: '每日照護', en: 'Daily care', id: 'Perawatan Harian' },
              content: { zh: '從這裡可以記錄長輩的血壓、體溫，或是對照藥單進行餵藥。每個項目下方都有「近期趨勢」，記錄完可以直接看變化；需要給醫師看的報告與 CSV 匯出也在血壓的近期趨勢裡。', en: 'Record blood pressure and temperature here, or give medication according to the schedule. Each section includes Recent Trends, and blood pressure reports and CSV export are available there.', id: 'Di sini Anda dapat mencatat tekanan darah, suhu tubuh, atau memberikan obat sesuai jadwal. Setiap bagian punya "Tren terkini" agar Anda bisa langsung melihat perubahannya; laporan untuk dokter dan ekspor CSV juga ada di tren tekanan darah.' },
              position: 'top'
            },
            {
              targetId: 'tab-settings',
              title: { zh: '需要重新教學嗎？', en: 'Need the tutorial again?', id: 'Butuh panduan lagi?' },
              content: { zh: '如果您之後想要再看一次導覽，可以在設定頁面中找到「重播教學」按鈕。', en: 'You can replay this tour from the Replay Tutorial button on the Settings page.', id: 'Jika Anda ingin melihat panduan ini lagi nanti, Anda dapat menemukan tombol "Putar Ulang Panduan" di halaman Pengaturan.' },
              position: 'top'
            },
            {
              // 導覽最後加一步承接轉換（issue #443）：試用結束不能只是「完成」就沒了下文，
              // 這裡直接把剛剛試用開啟的模組組合記下來，帶使用者去登入頁；真的登入後才套用，
              // 這個中繼記錄只存模組開關 id，不會夾帶任何 demo 血壓／體溫等健康數值。
              targetId: 'tutorial-cta',
              title: { zh: '準備好了嗎？', en: 'Ready to get started?', id: 'Sudah siap?' },
              content: { zh: '登入後，剛剛試用時開啟的照護項目會自動幫你設定好，不用重新選一次。', en: 'After you sign in, the care items you enabled in the demo will be applied automatically, so you do not need to choose them again.', id: 'Setelah login, item perawatan yang Anda aktifkan saat mencoba tadi akan otomatis diterapkan—tidak perlu memilih ulang.' },
              position: 'center',
              primaryActionLabel: { zh: '開始記錄我家人的', en: 'Start recording my family’s care', id: 'Mulai catat keluarga saya' },
              onPrimaryAction: () => {
                // CTA 被按下代表展示導覽真的走到最後；跳過導覽不算完成，避免漏斗被高估。
                trackEvent('tutorial_complete', { locale })
                const patientId = activePatientIdRef.current
                if (patientId) {
                  const state = readDailyCarePreference(patientId)
                  const moduleIds = (Object.keys(state.preference) as DailyCareModuleId[]).filter(id => state.preference[id])
                  writeDemoModuleHandoff({ moduleIds, useCustomTemplate: state.useCustomTemplate })
                }
                window.location.assign('/')
              },
            }
          ])
          localStorage.setItem('jia-jian-log-demo-tutorial', 'true')
        }, 500)
      }
      return
    }
    if (!userId) {
      setMedicationSlotsExpanded(true)
      setMedicationSettingsError(null)
      setMedicationSettingsSaving(false)
      setMedicationNameEnglishFirst(true)
      setMedicationNameSettingsError(null)
      setMedicationNameSettingsSaving(false)
      return
    }

    setMedicationSlotsExpanded(true)
    setMedicationSettingsError(null)
    setMedicationSettingsSaving(true)
    setMedicationNameEnglishFirst(true)
    setMedicationNameSettingsError(null)
    setMedicationNameSettingsSaving(true)
    let cancelled = false
    void readMedicationSlotsExpandedPreferenceForUser(userId)
      .then(expanded => {
        if (!cancelled) setMedicationSlotsExpanded(expanded)
      })
      .catch(error => {
        console.error('[medication display settings read error]', error)
        if (!cancelled) {
          setMedicationSlotsExpanded(true)
          setMedicationSettingsError({ id: 'Pengaturan tampilan obat tidak dapat dimuat. Tampilan diperluas digunakan sementara.', zh: '服藥顯示設定讀取失敗，暫時使用直接展開。' ,en: 'Medication Display Settings Read Failed, Temporary Use Direct Expand.' })
        }
      })
      .finally(() => {
        if (!cancelled) setMedicationSettingsSaving(false)
      })
    void readMedicationNameEnglishFirstPreferenceForUser(userId)
      .then(englishFirst => {
        if (!cancelled) setMedicationNameEnglishFirst(englishFirst)
      })
      .catch(error => {
        console.error('[medication name display settings read error]', error)
        if (!cancelled) {
          setMedicationNameEnglishFirst(true)
          setMedicationNameSettingsError({ id: 'Pengaturan nama obat tidak dapat dimuat. Nama Inggris digunakan sementara.', zh: '藥名顯示設定讀取失敗，暫時優先顯示英文名。' ,en: "Medication name settings could not be loaded. Name Inggris digunakan temporarily." })
        }
      })
      .finally(() => {
        if (!cancelled) setMedicationNameSettingsSaving(false)
      })

    return () => { cancelled = true }
    // startTutorial 刻意不列入依賴：它是 TutorialContext 每次 render 重新建立的函式（provider 的 value 也是新物件），
    // 加進依賴會讓這個 effect 每次 render 都重跑，展示模式的教學導覽就會被反覆觸發。
    // 這個 effect 只該在「進入／離開展示模式」或「換帳號」時執行一次。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDemoMode, userId])

  useEffect(() => {
    // 切換病人時先回到完整顯示，避免非同步讀取期間把上一位病人的偏好套到新病人。
    setDailyCarePreference(DEFAULT_DAILY_CARE_VISIBILITY)
    setUseCustomDailyCareTemplate(false)
    setDailyCareSettingsError(null)
    setDailyCareSettingsSaving(false)
    // 換病人時先收起精靈，等這位病人的偏好讀完再決定要不要跳，避免沿用上一位病人的判斷結果。
    setOnboardingWizardPatientId(null)
    setOnboardingWizardError(null)
    setDemoHandoffNotice(null)
    if (!activePatientId) return

    if (isDemoMode) {
      const state = readDailyCarePreference(activePatientId)
      setDailyCarePreference(state.preference)
      setUseCustomDailyCareTemplate(state.useCustomTemplate)
      return
    }
    if (!userId) return

    setDailyCareSettingsSaving(true)
    let cancelled = false
    void readDailyCarePreferenceForPatient(activePatientId)
      .then(state => {
        if (!cancelled) {
          setDailyCarePreference(state.preference)
          setUseCustomDailyCareTemplate(state.useCustomTemplate)
          // 精靈的「首次使用」判斷刻意綁在這個讀取結果裡，而不是另一個 effect：
          // 分成兩個 effect 時，另一邊讀到的 dailyCareSettingsSaving 還是同一個 commit 的舊值（false），
          // 精靈會搶在偏好載入完成前掛載，拿 DEFAULT_DAILY_CARE_VISIBILITY 當基準，送出就覆蓋掉真正的設定。
          // 讀取失敗時不跳精靈：分不清「沒設定過」與「讀不到」，寧可不跳也不要覆蓋既有設定。
          if (state.hasStoredPreference || hasCompletedOnboardingWizard(activePatientId)) {
            setOnboardingWizardPatientId(null)
            return
          }
          // 首次使用且讀到試用承接的模組組合時（issue #443），直接套用並顯示空狀態提示，
          // 不再跳三題精靈——精靈要問的問題使用者剛剛在 /demo 已經用行為回答過一次了。
          const handoff = readDemoModuleHandoff()
          if (handoff) {
            const nextPreference = buildOnboardingDailyCarePreference(DEFAULT_DAILY_CARE_VISIBILITY, (activePatientCareRecipientTypeRef.current as OnboardingCareTarget | undefined) ?? 'human', handoff.moduleIds)
            setDailyCarePreference(nextPreference)
            setUseCustomDailyCareTemplate(handoff.useCustomTemplate)
            markOnboardingWizardCompleted(activePatientId)
            clearDemoModuleHandoff()
            setDemoHandoffNotice({ moduleIds: handoff.moduleIds })
            setOnboardingWizardPatientId(null)
            void saveDailyCarePreferenceForPatient(activePatientId, { preference: nextPreference, useCustomTemplate: handoff.useCustomTemplate }).catch(error => {
              console.error('[demo handoff preference save error]', error)
            })
            return
          }
          setOnboardingWizardPatientId(activePatientId)
        }
      })
      .catch(error => {
        console.error('[daily care display settings read error]', error)
        if (!cancelled) {
          setDailyCarePreference(DEFAULT_DAILY_CARE_VISIBILITY)
          setUseCustomDailyCareTemplate(false)
          setDailyCareSettingsError({ id: 'Tampilan perawatan harian tidak dapat dimuat. Semua fitur ditampilkan sementara.', zh: '每日照護顯示設定讀取失敗，暫時顯示全部功能。' ,en: 'The daily care display setting failed to read, temporarily displaying all functions.' })
        }
      })
      .finally(() => {
        if (!cancelled) setDailyCareSettingsSaving(false)
      })

    return () => { cancelled = true }
  }, [activePatientId, isDemoMode, userId])

  useEffect(() => {
    if (!userId) {
      setPrivacyPolicyStatus('idle')
      setHealthConsentStatus('idle')
      return
    }
    let cancelled = false
    setPrivacyPolicyStatus('loading')
    setHealthConsentStatus('loading')
    void loadLegalConsentWithRetry().then(consent => {
      // 為什麼分開比對：隱私政策更新只需要重新確認政策，不應被誤當成健康資料用途同意；
      // 兩者都必須等使用者明確操作，不能由讀取狀態靜默升版。
      if (!cancelled) {
        setPrivacyPolicyStatus(consent?.privacy_policy_version === CURRENT_PRIVACY_POLICY_VERSION ? 'ready' : 'required')
        setHealthConsentStatus(consent?.health_consent_version === CURRENT_HEALTH_CONSENT_VERSION ? 'ready' : 'required')
      }
    }).catch(error => {
      console.error('[legal consent load error after retry]', error)
      if (!cancelled) {
        setPrivacyPolicyStatus('required')
        setHealthConsentStatus('required')
      }
    })
    return () => { cancelled = true }
  }, [userId])

  useEffect(() => {
    if (isDemoMode || !user?.email || healthConsentStatus !== 'ready') {
      setPendingPatientInvitations([])
      setPatientInvitationLoadError(false)
      return
    }
    let cancelled = false
    setPendingPatientInvitations(null)
    setPatientInvitationLoadError(false)
    void fetchPendingPatientCareInvitations()
      .then(invitations => { if (!cancelled) setPendingPatientInvitations(invitations) })
      .catch(error => {
        console.error('[patient invitation load error]', error)
        // 查詢失敗不能當成「沒有邀請」，否則 auto-provision 會建立錯的 patient，讓真正邀請無法接受。
        if (!cancelled) setPatientInvitationLoadError(true)
      })
    return () => { cancelled = true }
  }, [healthConsentStatus, isDemoMode, patientInvitationLoadAttempt, user?.email])

  useEffect(() => {
    if (isDemoMode || !user?.email || healthConsentStatus !== 'ready') {
      setPendingCaregiverInvitations([])
      return
    }
    let cancelled = false
    void fetchPendingCaregiverInvitations()
      .then(invitations => { if (!cancelled) setPendingCaregiverInvitations(invitations) })
      .catch(error => {
        // 邀請讀取失敗不能阻擋既有照護流程；RPC 仍會在 owner／受邀者操作時重新驗證。
        console.error('[caregiver invitation load error]', error)
        if (!cancelled) setPendingCaregiverInvitations([])
      })
    return () => { cancelled = true }
  }, [healthConsentStatus, isDemoMode, user?.email])

  useEffect(() => {
    if (isDemoMode || !user?.email || healthConsentStatus !== 'ready' || patientInvitationLoadError || pendingPatientInvitations === null || pendingPatientInvitations.length > 0 || subject) return
    // /patient-invite 仍在解析分享 token 時不能先建立 personal patient；否則失效連結會吃掉之後可用的本人邀請 email。
    if (window.location.pathname === '/patient-invite') return
    if (autoProvisionAttemptedEmailRef.current === user.email) return
    // 沒有待接受邀請才建立個人 patient；先前先 provision 會讓被照顧者錯過邀請並誤建另一個家庭。
    autoProvisionAttemptedEmailRef.current = user.email
    void refreshIdentity(true)
  }, [healthConsentStatus, isDemoMode, patientInvitationLoadError, pendingPatientInvitations, refreshIdentity, subject, user?.email])

  useEffect(() => {
    if (isDemoMode) {
      // 不能只認王美玲／陳伯伯兩個固定 ID：展示模式現在還有 4 隻寵物範例，硬寫死會讓照護者選到寵物後
      // 被這個 effect 在下次重跑時強制切回王美玲，看起來像選取沒有生效。
      if (!activeSubject || !accessibleSubjects.includes(activeSubject)) {
        setActiveSubject(subject ?? DEMO_MEILING_PATIENT_ID)
      }
      return
    }
    if (!user?.email || !subject || !accessibleSubjects.length) {
      setActiveSubject(null)
      return
    }
    const fallback = effectiveAccessibleSubjects[0] ?? subject
    let cancelled = false

    void readActivePatientPreference(user.email)
      .then(savedPatientId => {
        if (!cancelled) {
          const resolved = resolveActivePatientPreference(savedPatientId, effectiveAccessibleSubjects, fallback, effectiveSubject)
          setActiveSubject(resolved)
          if (savedPatientId && savedPatientId !== resolved && user.email) {
            void saveActivePatientPreference(user.email, resolved).catch(err => console.error('[save active patient fallback preference error]', err))
          }
        }
      })
      .catch(error => {
        console.error('[active patient preference read error]', error)
        if (!cancelled) setActiveSubject(fallback)
      })

    return () => { cancelled = true }
    // accessibleSubjects／activeSubject／effectiveAccessibleSubjects／effectiveSubject 刻意不列入依賴：
    // 前三者是每次 render 重新算出的陣列／物件（.filter()／.map() 沒有做 identity 快取），列進去會讓這個
    // effect 每次 render 都重跑；effectiveSubjectsKey 已是它們的穩定字串代理，只在實際內容改變時才變動。
    // 這個 effect 只該在「切換展示模式／病人清單、目前病人或帳號真的改變」時重新解析目前病人，
    // 不能因為陣列參照不同就反覆把使用者剛選好的對象重設掉。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDemoMode, effectiveSubjectsKey, subject, user?.email])

  const handlePatientInvitationResolved = async (resolvedInvitationId: string, accepted: boolean) => {
    // 多個家庭可能同時送邀請；只移除已處理的一封，拒絕時才不會誤建身分並吞掉其餘邀請。
    setPendingPatientInvitations(current => current?.filter(invitation => invitation.invitation_id !== resolvedInvitationId) ?? null)
    if (accepted) await refreshIdentity(false)
  }

  const currentPath = window.location.pathname
  const publicPageFallback = (
    <div className="h-dvh flex items-center justify-center bg-white text-gray-400 text-sm">
      {text(common.loading)}
    </div>
  )
  if (currentPath === '/privacy') return <Suspense fallback={publicPageFallback}><PrivacyPage /></Suspense>
  if (currentPath === '/terms') return <Suspense fallback={publicPageFallback}><TermsPage /></Suspense>
  if (currentPath === '/health-data-notice') return <Suspense fallback={publicPageFallback}><HealthDataNoticePage /></Suspense>
  // 版本頁只讀建置 metadata，必須在登入與 Supabase loading 前可直接開啟，方便回報 production build。
  if (currentPath === '/releases') return <Suspense fallback={publicPageFallback}><ReleasesPage /></Suspense>
  if (currentPath === '/guides') return <Suspense fallback={publicPageFallback}><GuidesIndexPage /></Suspense>
  if (currentPath === '/guides/blood-pressure-722') return <Suspense fallback={publicPageFallback}><BloodPressure722GuidePage /></Suspense>
  if (currentPath === '/guides/caregiver-handover') return <Suspense fallback={publicPageFallback}><CaregiverHandoverGuidePage /></Suspense>
  if (currentPath === '/guides/pet-chronic-disease') return <Suspense fallback={publicPageFallback}><PetChronicDiseaseGuidePage /></Suspense>
  if (currentPath === '/guides/medication-schedule') return <Suspense fallback={publicPageFallback}><MedicationScheduleGuidePage /></Suspense>
  if (currentPath === '/guides/family-invitations') return <Suspense fallback={publicPageFallback}><FamilyInvitationGuidePage /></Suspense>
  // 分享頁自己處理 token 交換與過期／無效狀態；不能先落入下面的登入或健康同意判斷。
  if (currentPath === '/share') return <Suspense fallback={publicPageFallback}><ShareSummaryPage /></Suspense>
  if (isLineBrowser() && currentPath === '/') {
    // 繁體中文註解：LINE 版本對 target=_blank 的行為不一致，提示頁必須同時提供右上角選單指引；只攔公開登入頁，讓條款與 Demo 仍可直接閱讀／試用。
    const externalBrowserUrl = `${window.location.origin}${window.location.pathname}${window.location.hash}`
    return <LineBrowserGate externalBrowserUrl={externalBrowserUrl} />
  }

  const isAdminRoute = currentPath === '/admin'

  if (loading) {
    return (
      <div className="h-dvh flex items-center justify-center bg-white text-gray-400 text-sm">
        {text(common.loading)}
      </div>
    )
  }

  if (isAdminRoute) {
    if (!user) return <LoginScreen onEnterDemo={enterDemoMode} />
    if (!isAdministratorEmail(user.email)) return <UnauthorizedScreen email={user.email} />
    return (
      <Suspense fallback={
        <div className="h-dvh flex items-center justify-center bg-white text-gray-400 text-sm">
          {text(common.loading)}
        </div>
      }>
        <div className="flex h-dvh flex-col bg-gray-50">
          <AppStatusBar />
          <div className="min-h-0 flex-1"><AdminPage /></div>
        </div>
      </Suspense>
    )
  }

  if (!user && !isDemoMode) {
    if (currentPath === '/join') return <CaregiverInvitationJoinPage />
    if (currentPath === '/patient-invite') return <PatientInvitationJoinPage />
    return <LoginScreen onEnterDemo={enterDemoMode} />
  }

  if (!isDemoMode && (privacyPolicyStatus === 'idle' || privacyPolicyStatus === 'loading' || healthConsentStatus === 'idle' || healthConsentStatus === 'loading')) return <div className="h-dvh flex items-center justify-center bg-white text-sm text-gray-400">{text(common.loading)}</div>
  if (!isDemoMode && privacyPolicyStatus !== 'ready') return <PrivacyPolicyUpdateScreen onAccepted={async () => { setPrivacyPolicyStatus('ready') }} />
  if (!isDemoMode && healthConsentStatus !== 'ready') return <HealthDataConsentScreen onAccepted={async () => { setHealthConsentStatus('ready') }} />

  if (currentPath === '/join') return <CaregiverInvitationJoinPage userEmail={user?.email} />
  if (currentPath === '/patient-invite') return <PatientInvitationJoinPage userEmail={user?.email} />

  // 被照顧者尚未有自己的 profile 時，先處理明確邀請，不能讓 auto-provision 先建立另一個私人病人。
  if (!isDemoMode && user && !subject && patientInvitationLoadError) {
    return <PatientInvitationScreen invitations={[]} loadFailed onRetry={() => setPatientInvitationLoadAttempt(attempt => attempt + 1)} onResolved={handlePatientInvitationResolved} />
  }
  if (!isDemoMode && user && !subject && pendingPatientInvitations === null) return <div className="h-dvh flex items-center justify-center bg-white text-sm text-gray-400">{text(common.loading)}</div>
  if (!isDemoMode && user && pendingPatientInvitations && pendingPatientInvitations.length > 0) {
    return <PatientInvitationScreen invitations={pendingPatientInvitations} onResolved={handlePatientInvitationResolved} />
  }

  const caregiverInvitationsRequiringRequest = getCaregiverInvitationsRequiringRequest(pendingCaregiverInvitations)
  if (!isDemoMode && user && caregiverInvitationsRequiringRequest.length > 0) {
    // requested 已完成受邀者動作，應讓有既有照護工作的使用者回到 App 等待 owner，而不是被邀請畫面鎖住。
    return <CaregiverInvitationScreen invitations={caregiverInvitationsRequiringRequest} onRequested={invitationId => setPendingCaregiverInvitations(current => current.map(invitation => invitation.invitationId === invitationId ? { ...invitation, status: 'requested' } : invitation))} />
  }

  if (!isDemoMode && user && !subject) return <UnauthorizedScreen email={user.email} />

  if (!activeSubject) {
    return (
      <div className="h-dvh flex items-center justify-center bg-white text-gray-400 text-sm">
        {text(common.loading)}
      </div>
    )
  }
  const selectedSubject = resolvedSelectedSubject
  const selectedPatientId = resolvedSelectedPatientId
  const resolvedOwnPatientId = ownPatientId ?? ''
  if (!selectedPatientId) {
    return (
      <div className="h-dvh flex items-center justify-center bg-white px-6 text-center text-sm text-gray-500">
        {text({ id: 'Data keluarga belum siap. Silakan hubungi keluarga.', zh: '家庭資料尚未完成設定，請聯絡家屬。' ,en: 'Family information is not yet set up, please contact a family member.' })}
      </div>
    )
  }
  const canConfigureActiveSubject = effectiveAccessibleSubjects.length > 1

  if (!isDemoMode && onboardingWizardPatientId && onboardingWizardPatientId === selectedPatientId) {
    const finishOnboardingWizard = async (careTarget: OnboardingCareTarget, _recorder: OnboardingRecorder, selectedModuleIds: DailyCareModuleId[]) => {
      const requestPatientId = selectedPatientId
      const requestUseCustomTemplate = useCustomDailyCareTemplate
      const nextPreference = buildOnboardingDailyCarePreference(dailyCarePreference, careTarget, selectedModuleIds)
      setOnboardingWizardSaving(true)
      setOnboardingWizardError(null)
      try {
        if (!userId) {
          saveDailyCarePreference(requestPatientId, { preference: nextPreference, useCustomTemplate: requestUseCustomTemplate })
        } else {
          await saveDailyCarePreferenceForPatient(requestPatientId, { preference: nextPreference, useCustomTemplate: requestUseCustomTemplate })
        }
        if (activePatientIdRef.current === requestPatientId) setDailyCarePreference(nextPreference)
        markOnboardingWizardCompleted(requestPatientId)
        setOnboardingWizardPatientId(null)
      } catch (error) {
        console.error('[onboarding wizard save error]', error)
        setOnboardingWizardError({ id: 'Pengaturan tidak dapat disimpan. Coba lagi.', zh: '設定儲存失敗，請再試一次。' ,en: "Settings could not be saved. Try again." })
      } finally {
        setOnboardingWizardSaving(false)
      }
    }
    return (
      <OnboardingWizard
        // 用病人 id 當 key：換病人時強制整個精靈重新掛載，避免上一位病人已經選到一半的答案
        // （物種、勾選項目）留在同一個元件實例裡，被誤存成下一位病人的每日照護設定。
        key={onboardingWizardPatientId}
        // 病人建立時已經選過物種，就用它當第一題的預設答案：精靈算出的模組範圍必須跟
        // visibleDailyCareModules() 實際套用的物種一致，否則會發生「幫貓存了人類的模組組合、
        // 每日照護頁卻照貓過濾」而整頁塌成一個不相干分頁。
        initialCareTarget={activePatientCareRecipientType as OnboardingCareTarget | undefined}
        canUseMedication={canUseMedication}
        saving={onboardingWizardSaving}
        error={onboardingWizardError}
        onComplete={finishOnboardingWizard}
        onSkip={() => {
          markOnboardingWizardCompleted(selectedPatientId)
          setOnboardingWizardPatientId(null)
        }}
      />
    )
  }

  const changeActiveSubject = (nextSubject: Subject) => {
    if ((!isDemoMode && !user?.email) || (!accessibleSubjects.includes(nextSubject) && !allAccessibleSubjects.includes(nextSubject))) return
    if (nextSubject !== activeSubject) completeBloodPressureMeasurementSession()
    setArchivedSubjectNotice(false)
    setActiveSubject(nextSubject)
    if (!user?.email) return
    void saveActivePatientPreference(user.email, nextSubject).catch(error => {
      console.error('[active patient preference save error]', error)
    })
  }

  const startBloodPressureMeasurementSession = (session: BloodPressureMeasurementSession) => {
    // 儲存只是為了重新載入後恢復提示；即使瀏覽器拒絕 sessionStorage，也不能影響已完成的血壓寫入。
    saveBloodPressureMeasurementSession(session)
    setBloodPressureMeasurementSession(session)
  }

  // 已封存對象改由 SettingsPage 的 ArchivedPatientHistoryPage 唯讀查看，不再進入這裡的
  // activeSubject；這個檢查因此是防禦性的，正常操作下不會真的觸發重導向，見 careSubjectGuard.ts。
  const changeTab = (nextTab: Tab) => {
    const resolution = resolveWritableSubject(selectedSubject, effectiveAccessibleSubjects)
    if (resolution.redirected) {
      changeActiveSubject(resolution.subject)
      // changeActiveSubject 會先清掉提示，這裡必須後寫才能保留本次自動切換的說明。
      setArchivedSubjectNotice(true)
    }
    setTab(nextTab)
  }

  const currentMeasurementSession = bloodPressureMeasurementSession
    && bloodPressureMeasurementSession.patientId === selectedPatientId
    && bloodPressureMeasurementSession.sessionKey === getBloodPressureMeasurementSessionKey(selectedPatientId)
    ? bloodPressureMeasurementSession
    : null

  return (
    <div className="app-shell flex h-dvh flex-col mx-auto max-w-md">
      {isDemoMode && (
        <div className="bg-indigo-900 text-white px-4 py-2.5 text-xs md:text-sm font-semibold flex items-center justify-between shadow-sm border-b border-indigo-700/50">
          <div className="flex items-center gap-2 min-w-0">
            <span className="shrink-0 text-base">✨</span>
            <span className="truncate">
              {text({
                id: 'Mode Demo | Data fiktif + perubahan tersimpan di browser ini.',
                zh: '展示模式｜虛構照護資料，試用變更會保存在此瀏覽器', en: 'Display mode | Fictional care data, trial changes will be saved in this browser',
              })}
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {/* 照護者常在手機上快速切換展示與正式登入；保留小字級但擴大點擊區，避免誤觸。 */}
            <a
              href="/"
              onClick={() => exitDemoMode()}
              className="flex min-h-11 items-center gap-1 rounded-lg border border-white/30 bg-white/10 px-2.5 py-1 text-xs font-bold text-white transition hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-indigo-900 active:scale-95"
            >
              {/* 為什麼使用 SVG：鎖頭是操作提示，不應因手機 emoji 字型不同而改變尺寸或顏色。 */}
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                <rect x="5" y="10" width="14" height="10" rx="2" />
                <path d="M8 10V7a4 4 0 0 1 8 0v3" />
              </svg>
              <span>{text({ id: 'Masuk dengan Google', zh: 'Google 登入' ,en: 'Sign in with Google' })}</span>
            </a>
          </div>
        </div>
      )}
      <AppStatusBar />
      <BloodPressureCountdownBanner session={currentMeasurementSession} />
      {archivedSubjectNotice && (
        <div role="status" className="print-hidden flex shrink-0 items-start gap-2 border-b border-amber-200 bg-amber-50 px-4 py-2.5 text-xs font-semibold text-amber-900">
          <span aria-hidden="true" className="text-base leading-5">⚠️</span>
          <p className="min-w-0 flex-1 leading-5">
            {text({
              id: 'Penerima perawatan yang diarsipkan hanya dapat dibaca lewat "Lihat riwayat hidup" di Pengaturan. Orang aktif telah dikembalikan agar catatan baru tidak tersimpan ke nama yang salah.',
              zh: '已封存的照護對象只能透過設定頁的「查看生命歷史」閱讀。目前操作對象已自動換回，避免新紀錄存到錯的人身上。', en: 'Archived care recipients can only be viewed through View Life History in Settings. The active subject was switched back so new records cannot be saved to the wrong person.',
            })}
          </p>
          <button
            type="button"
            onClick={() => setArchivedSubjectNotice(false)}
            className="min-h-11 shrink-0 rounded-lg px-2 font-bold text-amber-900 underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-700"
          >
            {text({ id: 'Tutup', zh: '關閉' ,en: 'Close' })}
          </button>
        </div>
      )}

      {demoHandoffNotice && (
        <div role="status" className="print-hidden flex shrink-0 items-start gap-2 border-b border-indigo-200 bg-indigo-50 px-4 py-2.5 text-xs font-semibold text-indigo-900">
          <span aria-hidden="true" className="text-base leading-5">✨</span>
          <p className="min-w-0 flex-1 leading-5">
            {text({
              id: `Anda baru saja mencoba item ini: ${demoHandoffNotice.moduleIds.map(id => DAILY_CARE_MODULES.find(module => module.id === id)?.compactLabel.id ?? id).join('、')}. Sudah diterapkan; Anda bisa mengubahnya di Pengaturan.`,
              zh: `你剛剛試用的是這些模組：${demoHandoffNotice.moduleIds.map(id => DAILY_CARE_MODULES.find(module => module.id === id)?.compactLabel.zh ?? id).join('、')}，已經幫你設定好，可在設定頁調整。`, en: `You new saja mencoba item this: ${demoHandoffNotice.moduleIds.map(id => DAILY_CARE_MODULES.find(module => module.id === id)?.compactLabel.id ?? id).join('、')}. Already diterapkan; You can mengubahnya in Settings.`,
            })}
          </p>
          <div className="flex shrink-0 flex-col items-end gap-1">
            <button
              type="button"
              onClick={() => {
                setDemoHandoffNotice(null)
                setOnboardingWizardPatientId(selectedPatientId)
              }}
              className="min-h-11 rounded-lg px-2 font-bold text-indigo-900 underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-700"
            >
              {text({ id: 'Atur ulang', zh: '重新設定' ,en: "Atur ulang" })}
            </button>
            <button
              type="button"
              onClick={() => setDemoHandoffNotice(null)}
              className="min-h-11 rounded-lg px-2 font-bold text-indigo-900 underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-700"
            >
              {text({ id: 'Tutup', zh: '關閉' ,en: 'Close' })}
            </button>
          </div>
        </div>
      )}

      <main className="flex-1 min-h-0 overflow-y-auto bg-slate-50">
        <Suspense fallback={
          <div className="h-full flex items-center justify-center bg-slate-50 text-gray-400 text-sm">
            {text(common.loading)}
          </div>
        }>
          {tab === 'events'
            ? <EventsPage patientId={selectedPatientId} availablePatients={accessiblePatients} userEmail={user?.email} onSubjectSelect={changeActiveSubject} />
            : tab === 'schedule' && canUseSchedule
              ? <UpcomingSchedulePage patientId={selectedPatientId} availablePatients={accessiblePatients} onSubjectSelect={changeActiveSubject} isDemoMode={isDemoMode} />
              : tab === 'settings'
                ? <SettingsPage activeSubject={selectedSubject} activePatientId={selectedPatientId} onChangeActiveSubject={changeActiveSubject} onCareRecipientCreated={async (patientId: string) => { await refreshIdentity(); setActiveSubject(patientId); if (user?.email) void saveActivePatientPreference(user.email, patientId) }} onCareRecipientArchived={refreshIdentity} availablePatients={accessiblePatients} profileDisplayName={effectiveDisplayName ?? undefined} userEmail={user?.email} canConfigureActiveSubject={canConfigureActiveSubject} medicationSlotsExpanded={medicationSlotsExpanded} medicationSettingsSaving={medicationSettingsSaving} medicationSettingsError={medicationSettingsError} medicationNameEnglishFirst={medicationNameEnglishFirst} medicationNameSettingsSaving={medicationNameSettingsSaving} medicationNameSettingsError={medicationNameSettingsError} isDemoMode={isDemoMode} dailyCarePreference={dailyCarePreference} dailyCareSettingsSaving={dailyCareSettingsSaving} dailyCareSettingsError={dailyCareSettingsError} canUseMedication={canUseMedication} onToggleDailyCareModule={async (moduleId: DailyCareModuleId, enabled: boolean) => {
                    if (dailyCareSettingsSaving) return
                    const requestPatientId = activePatientId
                    const next = updateDailyCareVisibility(dailyCarePreference, moduleId, enabled)
                    if (next.rejected) {
                      setDailyCareSettingsError({ id: 'Sisakan setidaknya satu fitur perawatan harian.', zh: '每日照護至少要保留一個功能。' ,en: 'Maintain at least one function in your daily care.' })
                      return
                    }
                    setDailyCareSettingsSaving(true)
                    setDailyCareSettingsError(null)
                    try {
                      if (isDemoMode || !userId || !activePatientId) {
                        saveDailyCarePreference(activePatientId ?? '', { preference: next.preference, useCustomTemplate: useCustomDailyCareTemplate })
                      } else {
                        await saveDailyCarePreferenceForPatient(activePatientId, { preference: next.preference, useCustomTemplate: useCustomDailyCareTemplate })
                      }
                      // 非同步儲存可能跨過病人切換；只把結果套回發起請求的同一位病人，避免 A 覆蓋 B 的畫面偏好。
                      if (activePatientIdRef.current === requestPatientId) setDailyCarePreference(next.preference)
                    } catch (error) {
                      console.error('[daily care display settings save error]', error)
                      if (activePatientIdRef.current === requestPatientId) {
                        setDailyCareSettingsError({ id: 'Tampilan perawatan harian gagal disimpan. Coba lagi nanti.', zh: '每日照護顯示設定儲存失敗，請稍後再試。' ,en: 'Daily care display settings failed to save, please try again later.' })
                      }
                    } finally {
                      if (activePatientIdRef.current === requestPatientId) setDailyCareSettingsSaving(false)
                    }
                  }} onToggleCustomTemplate={async (enabled: boolean) => {
                    if (dailyCareSettingsSaving) return
                    const requestPatientId = activePatientId
                    setDailyCareSettingsSaving(true)
                    setDailyCareSettingsError(null)
                    try {
                      if (isDemoMode || !userId || !activePatientId) {
                        saveDailyCarePreference(activePatientId ?? '', { preference: dailyCarePreference, useCustomTemplate: enabled })
                      } else {
                        await saveDailyCarePreferenceForPatient(activePatientId, { preference: dailyCarePreference, useCustomTemplate: enabled })
                      }
                      if (activePatientIdRef.current === requestPatientId) setUseCustomDailyCareTemplate(enabled)
                    } catch (error) {
                      console.error('[daily care template mode save error]', error)
                      if (activePatientIdRef.current === requestPatientId) {
                        setDailyCareSettingsError({ id: 'Tampilan perawatan harian gagal disimpan. Coba lagi nanti.', zh: '每日照護顯示設定儲存失敗，請稍後再試。' ,en: 'Daily care display settings failed to save, please try again later.' })
                      }
                    } finally {
                      if (activePatientIdRef.current === requestPatientId) setDailyCareSettingsSaving(false)
                    }
                  }} useCustomDailyCareTemplate={useCustomDailyCareTemplate} activePatientCareRecipientType={activePatientCareRecipientType} onToggleMedicationSlotsExpanded={async (expanded: boolean) => {
                    if (medicationSettingsSaving) return
                    setMedicationSettingsSaving(true)
                    setMedicationSettingsError(null)
                    try {
                      if (isDemoMode || !userId) {
                        saveMedicationSlotsExpandedPreference(expanded)
                      } else {
                        await saveMedicationSlotsExpandedPreferenceForUser(userId, expanded)
                      }
                      setMedicationSlotsExpanded(expanded)
                    } catch (error) {
                      console.error('[medication display settings save error]', error)
                      setMedicationSettingsError({ id: 'Pengaturan tampilan obat gagal disimpan. Coba lagi nanti.', zh: '服藥顯示設定儲存失敗，請稍後再試。' ,en: 'Dose display settings failed to save, please try again later.' })
                    } finally {
                      setMedicationSettingsSaving(false)
                    }
                  }} onToggleMedicationNameEnglishFirst={async (englishFirst: boolean) => {
                    if (medicationNameSettingsSaving) return
                    setMedicationNameSettingsSaving(true)
                    setMedicationNameSettingsError(null)
                    try {
                      if (isDemoMode || !userId) {
                        saveMedicationNameEnglishFirstPreference(englishFirst)
                      } else {
                        await saveMedicationNameEnglishFirstPreferenceForUser(userId, englishFirst)
                      }
                      setMedicationNameEnglishFirst(englishFirst)
                    } catch (error) {
                      console.error('[medication name display settings save error]', error)
                      setMedicationNameSettingsError({ id: 'Pengaturan nama obat gagal disimpan. Coba lagi nanti.', zh: '藥名顯示設定儲存失敗，請稍後再試。' ,en: "Medication name settings could not be saved. Try again nanti." })
                    } finally {
                      setMedicationNameSettingsSaving(false)
                    }
                  }} />
                // dailyCare 是預設分頁；也是 tab === 'schedule' 但 canUseSchedule 剛好變 false 時的安全回退，
                // 避免使用者卡在空白畫面。
              : <DailyCarePage subject={selectedSubject} patientId={selectedPatientId} patientName={allAccessiblePatients.find((patient: PatientIdentity) => patient.patientId === selectedPatientId)?.displayName} availablePatients={accessiblePatients} userEmail={effectiveUserEmail} onSubjectSelect={changeActiveSubject} canUseMedication={canUseMedication} manageablePatients={medicationManagementPatients} ownPatientId={resolvedOwnPatientId} medicationSlotsExpanded={medicationSlotsExpanded} medicationNameEnglishFirst={medicationNameEnglishFirst} visibleModules={visibleDailyCareModules} initialSection={pwaShortcutTarget?.section} onInitialSectionConsumed={consumePwaShortcut} measurementSession={currentMeasurementSession} onMeasurementSessionStart={startBloodPressureMeasurementSession} onMeasurementSessionComplete={completeBloodPressureMeasurementSession} onOpenDisplaySettings={() => { window.location.hash = DAILY_CARE_DISPLAY_SETTINGS_ANCHOR; changeTab('settings') }} />}
        </Suspense>
      </main>

      {!keyboardOpen && <nav aria-label={text({ id: 'Navigasi utama', zh: '主要導覽', en: '(BuddyPress) Primary navigation' })} className="print-hidden flex w-full max-w-md shrink-0 self-center border-t border-slate-200 bg-white/95 shadow-[0_-6px_24px_rgba(15,23,42,0.05)]">
        {/* 傳入 dataTutorial 讓新手教學 overlay 能精確定位底欄頁籤 */}
        {/* 一律走 changeTab，作為已封存對象萬一殘留在 activeSubject 時的最後防線。 */}
        <TabBtn active={tab === 'events'} onClick={() => changeTab('events')}
          icon="📌" label={TAB_NAV_LABELS.events} dataTutorial="tab-events" />
        <TabBtn active={tab === 'dailyCare'} onClick={() => changeTab('dailyCare')}
          icon="🗓️" label={TAB_NAV_LABELS.dailyCare} dataTutorial="tab-dailyCare" />
        {canUseSchedule && <TabBtn active={tab === 'schedule'} onClick={() => changeTab('schedule')}
          icon="📅" label={TAB_NAV_LABELS.schedule} dataTutorial="tab-schedule" />}
        {/* 體重已整合進每日照護，避免同一筆健康資料在兩個主入口分流；
            趨勢與報告已回到各照護模組，不再有獨立的「報告」分頁。 */}
        <TabBtn active={tab === 'settings'} onClick={() => changeTab('settings')}
          icon="⚙️" label={TAB_NAV_LABELS.settings} dataTutorial="tab-settings" />
      </nav>}
    </div>
  )
}

function TabBtn({ active, onClick, icon, label, dataTutorial }: {
  active: boolean; onClick: () => void
  icon: string; label: LocalizedText
  dataTutorial?: string
}) {
  const { text } = useI18n()
  // 底部導覽是照護流程的主要入口，最小高度固定為 44px，並用 focus ring 補足鍵盤與低視力辨識。
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      data-tutorial={dataTutorial}
      className={`min-h-11 flex-1 flex flex-col items-center justify-center gap-0.5 px-1 pt-2 pb-[calc(env(safe-area-inset-bottom)+0.5rem)] text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-inset
        ${active ? 'text-red-500' : 'text-gray-400'}`}
    >
      {/* 圖示只作為辨識提示；目前頁面與入口名稱由文字及 aria-current 明確表達，避免讀屏重複朗讀 emoji。 */}
      <span aria-hidden="true" className="text-2xl leading-none">{icon}</span>
      <span>{text(label)}</span>
    </button>
  )
}
