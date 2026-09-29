/*
檔案用途：組合登入後的應用程式外殼、主要 tab、共用語言列與病人選擇狀態。
所在層：src 根入口；負責在頁面元件之間傳遞授權後的病人資料，不直接實作各 tab 的照護流程。
主要關聯：使用 useAuth、LoginScreen、UnauthorizedScreen，以及 lazy 載入的 TrajectoryPage／DailyCarePage／SettingsPage 頁。
公開路由（Privacy／Terms／Releases／Guides／Share）已抽到 components/system/PublicRouteSwitch；
登入後外殼的各項副作用與狀態拆到 hooks/useAppChromeEffects、useLegalConsentStatus、useInvitationHandling、
useMedicationDisplayPreferences、useDailyCareOnboarding、useActiveSubject、useBloodPressureSession
（issue #764 App.tsx 拆分，純搬移不改行為）。
已無獨立的「報告」底部分頁——趨勢與報告已回到各照護模組，封存對象的唯讀歷史改由
SettingsPage 底下的 ArchivedPatientHistoryPage 提供，詳見 docs/features/vitals.md。
*/
import { useCallback, useMemo, useRef, useState, lazy, Suspense } from 'react'
import type { ComponentType } from 'react'
import { useAuth } from './hooks/useAuth'
import { isLineBrowser, isAdministratorEmail, type Subject } from './lib/auth'
import { useMedicationCatalogCuratorAccess } from './features/system-admin/hooks/useMedicationCatalogCuratorAccess'
import { saveActivePatientPreference } from './lib/preferences/activeSubjectPreference'
import { BpStandardProvider } from './features/vitals/hooks/useBpEvaluator'
import { resolveWritableSubject } from './lib/careSubjectGuard'
import { buildDailyCareDisplaySettingsHash, DAILY_CARE_DISPLAY_SETTINGS_ANCHOR, visibleDailyCareModules as getVisibleDailyCareModules, type DailyCareModuleId } from './lib/dailyCareModules'
import { markOnboardingWizardCompleted, type OnboardingCareTarget } from './lib/onboardingWizard'
import { OnboardingWizard } from './components/onboarding/OnboardingWizard'
import { common, useI18n } from './lib/i18n'
import { useTutorial } from './components/tutorial'
import { AppStatusBar } from './components/system/AppStatusBar'
import { HealthDataConsentScreen } from './features/care-family/components/HealthDataConsentScreen'
import { PrivacyPolicyUpdateScreen } from './features/care-family/components/PrivacyPolicyUpdateScreen'
import { DEMO_VISITOR_EMAIL } from './lib/demoStorage'
import { LoginScreen } from './components/auth/LoginScreen'
import { UnauthorizedScreen } from './components/auth/UnauthorizedScreen'
import { LineBrowserGate } from './components/system/LineBrowserGate'
import { useKeyboardViewport } from './hooks/useKeyboardViewport'
import { CaregiverInvitationJoinPage } from './features/care-family/pages/CaregiverInvitationJoinPage'
import { PatientInvitationJoinPage } from './features/care-family/pages/PatientInvitationJoinPage'
import { PatientInvitationScreen } from './features/care-family/components/PatientInvitationScreen'
import { CaregiverInvitationScreen } from './features/care-family/components/CaregiverInvitationScreen'
import { BloodPressureCountdownBanner } from './components/ui/BloodPressureCountdownBanner'
import { consumePwaShortcutQuery, resolvePwaShortcutTarget } from './lib/pwaShortcuts'
import { usePublicRoute } from './components/system/PublicRouteSwitch'
import { DemoModeBanner } from './components/system/DemoModeBanner'
import { ArchivedSubjectNotice } from './components/system/ArchivedSubjectNotice'
import { DemoHandoffNotice } from './components/system/DemoHandoffNotice'
import { BottomNav, type Tab } from './components/system/BottomNav'
import { useAppChromeEffects } from './hooks/useAppChromeEffects'
import { useLegalConsentStatus } from './hooks/useLegalConsentStatus'
import { useInvitationHandling } from './hooks/useInvitationHandling'
import { useMedicationDisplayPreferences } from './hooks/useMedicationDisplayPreferences'
import { useDailyCareOnboarding } from './hooks/useDailyCareOnboarding'
import { useActiveSubject } from './hooks/useActiveSubject'
import { useBloodPressureSession } from './hooks/useBloodPressureSession'

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
// 今天頁（B 期，issue #733）：預設分頁，組合服藥時段卡與血壓摘要，因此仍要 lazy load 以免拖慢初始 bundle。
const TodayPage = lazyWithRetry(() => import('./features/today/pages/TodayPage').then(m => ({ default: m.TodayPage })))
const DailyCarePage = lazyWithRetry(() => import('./features/care-family/pages/DailyCarePage').then(m => ({ default: m.DailyCarePage })))
// 軌跡頁（D 期，issue #735）：取代原本的事件 tab（EventsPage／CareTimeline），合併調藥、看診、
// 醫師指示、一般事件、到期提醒與血壓週摘要成單一時間軸。
const TrajectoryPage = lazyWithRetry(() => import('./features/care-family/pages/TrajectoryPage').then(m => ({ default: m.TrajectoryPage })))
// 門診頁（E 期，照護閉環 T5，issue #949）：帶什麼／問什麼／醫師說了什麼；原本只給家庭擁有者的「行程」tab 併入這一頁。
const NextVisitPage = lazyWithRetry(() => import('./features/visit/pages/NextVisitPage').then(m => ({ default: m.NextVisitPage })))
const SettingsPage = lazyWithRetry(() => import('./features/system-admin/pages/SettingsPage').then(m => ({ default: m.SettingsPage })))

export default function App() {
  const { text, locale } = useI18n()
  const { startTutorial } = useTutorial()
  const keyboardOpen = useKeyboardViewport()
  // 為什麼同時保留兩組啟動狀態：PWA 捷徑決定初始照護分頁，漏斗追蹤則交給 useAppChromeEffects；兩者都必須由外殼層一次建立。
  const [pwaShortcutTarget, setPwaShortcutTarget] = useState(() => resolvePwaShortcutTarget(window.location.search))

  const consumePwaShortcut = useCallback(() => {
    // 為什麼等 DailyCarePage 首次掛載才消費：App 可能先顯示登入或同意畫面，太早清除 query 會讓登入後遺失原本的捷徑頁籤。
    const nextSearch = consumePwaShortcutQuery(window.location.search)
    setPwaShortcutTarget(null)
    window.history.replaceState(window.history.state, '', window.location.pathname + nextSearch + window.location.hash)
  }, [])

  const [tab, setTab] = useState<Tab>(() => pwaShortcutTarget?.tab ?? 'today')
  // 今天頁的「量血壓」「到期提醒」動作要能一步跳到記錄 tab 裡對應的模組區塊；沿用跟 PWA 捷徑相同的
  // initialSection 機制，而不是另外幫今天頁做一套導覽狀態。
  const [dailyCareSectionRequest, setDailyCareSectionRequest] = useState<DailyCareModuleId | null>(null)
  // 已歸檔對象被自動換掉時必須留下痕跡；靜默換人會讓照護者以為還在同一位對象身上操作。
  const [archivedSubjectNotice, setArchivedSubjectNotice] = useState(false)

  const { user, isDemoMode, enterDemoMode, exitDemoMode, ownPatientId, subject, displayName, accessiblePatients, allAccessiblePatients, accessibleSubjects, allAccessibleSubjects, medicationManagementPatients, patientIdsBySubject, refreshIdentity, loading } = useAuth()

  useAppChromeEffects({ isDemoMode, loading, user })

  const effectiveAccessibleSubjects = accessibleSubjects
  const effectiveAllAccessibleSubjects = allAccessibleSubjects
  const effectiveSubject = subject
  const effectiveDisplayName = displayName || user?.user_metadata?.full_name || user?.email?.split('@')[0]
  const effectiveSubjectsKey = effectiveAccessibleSubjects.join(',')
  const userId = user?.id

  const { activeSubject, setActiveSubject } = useActiveSubject({
    isDemoMode,
    userEmail: user?.email,
    subject,
    accessibleSubjects,
    effectiveAccessibleSubjects,
    effectiveSubject,
    effectiveSubjectsKey,
  })

  const activePatientId = activeSubject ? patientIdsBySubject[activeSubject] : undefined
  const activePatientIdRef = useRef(activePatientId)
  activePatientIdRef.current = activePatientId
  const effectiveUserEmail = user?.email ?? (isDemoMode ? DEMO_VISITOR_EMAIL : '')
  const canUseMedication = Boolean(effectiveUserEmail && effectiveSubject)
  // Google 行程區塊（門診頁內）目前只給擁有 Google Calendar 來源的家庭擁有者使用，其餘照護者暫不開放；之後要開放給更多家人時再放寬。
  const canUseSchedule = isAdministratorEmail(user?.email)
  // 讓頁內頁籤只在偏好或能力真的變動時重建，避免每次外殼重繪都觸發隱藏頁籤校正。
  const activePatientCareRecipientType = activePatientId ? accessiblePatients.find(p => p.patientId === activePatientId)?.careRecipientType : undefined
  // 只給試用承接的非同步套用邏輯讀最新值用；不能把這個值放進 useDailyCareOnboarding effect 的依賴陣列——
  // accessiblePatients 常在該 effect 已經跑過一次之後才非同步載入完成，若列入依賴會讓整個
  // effect（包含開頭把 demoHandoffNotice 重設為 null 那段）在物種到位時重跑一次，
  // 把剛顯示出來的承接提示又立刻清掉。用 ref 讀最新物種即可，不必重跑整個 effect。
  const activePatientCareRecipientTypeRef = useRef(activePatientCareRecipientType)
  activePatientCareRecipientTypeRef.current = activePatientCareRecipientType

  const resolvedSelectedSubject = activeSubject && (effectiveAccessibleSubjects.includes(activeSubject) || effectiveAllAccessibleSubjects.includes(activeSubject))
    ? activeSubject
    : effectiveAccessibleSubjects[0] ?? effectiveSubject ?? ''
  const resolvedSelectedPatientId = patientIdsBySubject[resolvedSelectedSubject]

  const { completeBloodPressureMeasurementSession, startBloodPressureMeasurementSession, currentMeasurementSession } = useBloodPressureSession({
    loading,
    userId,
    resolvedSelectedPatientId,
  })

  const {
    medicationSlotsExpanded,
    medicationSettingsSaving,
    medicationSettingsError,
    medicationNameEnglishFirst,
    medicationNameSettingsSaving,
    medicationNameSettingsError,
    caregiverDensityMode,
    caregiverDensitySettingsSaving,
    caregiverDensitySettingsError,
    onToggleMedicationSlotsExpanded,
    onToggleMedicationNameEnglishFirst,
    onToggleCaregiverDensityMode,
  } = useMedicationDisplayPreferences({
    isDemoMode,
    userId,
    locale,
    startTutorial,
    getActivePatientId: () => activePatientIdRef.current ?? null,
  })

  const {
    dailyCarePreference,
    useCustomDailyCareTemplate,
    dailyCareSettingsSaving,
    dailyCareSettingsError,
    onboardingWizardPatientId,
    setOnboardingWizardPatientId,
    onboardingWizardError,
    onboardingWizardSaving,
    demoHandoffNotice,
    setDemoHandoffNotice,
    finishOnboardingWizard,
    onToggleDailyCareModule,
    onToggleCustomTemplate,
  } = useDailyCareOnboarding({
    activePatientId,
    isDemoMode,
    userId,
    getActivePatientCareRecipientType: () => activePatientCareRecipientTypeRef.current as OnboardingCareTarget | undefined,
    getActivePatientIdRef: () => activePatientIdRef.current,
  })

  const visibleDailyCareModules = useMemo(
    () => getVisibleDailyCareModules(dailyCarePreference, { canUseMedication, careRecipientType: activePatientCareRecipientType, useCustomTemplate: useCustomDailyCareTemplate }),
    [dailyCarePreference, canUseMedication, activePatientCareRecipientType, useCustomDailyCareTemplate],
  )

  const { privacyPolicyStatus, setPrivacyPolicyStatus, healthConsentStatus, setHealthConsentStatus } = useLegalConsentStatus(userId)

  const {
    pendingPatientInvitations,
    setPendingCaregiverInvitations,
    patientInvitationLoadError,
    setPatientInvitationLoadAttempt,
    handlePatientInvitationResolved,
    caregiverInvitationsRequiringRequest,
  } = useInvitationHandling({
    isDemoMode,
    userEmail: user?.email,
    healthConsentStatus,
    subject,
    refreshIdentity,
  })

  const currentPath = window.location.pathname
  // usePublicRoute 本身是 hook（內含 useI18n），必須在任何條件式 return 之前、依固定順序呼叫；
  // 回傳 null 代表目前路徑不是免登入公開頁，交由下面的登入／同意流程繼續判斷。
  const publicRouteView = usePublicRoute(currentPath)
  const isAdminRoute = currentPath === '/admin'
  const isAdministratorUser = isAdministratorEmail(user?.email)
  // useMedicationCatalogCuratorAccess 同樣必須在任何條件式 return 之前呼叫（規則同上）；
  // enabled 只在真的可能用到時才為 true（/admin 路由、已登入），避免其他頁面也平白多一次網路呼叫。
  // 這裡刻意也對 administrator 查詢：新的目錄 RPC 只認 entitlement、不認舊的寫死 email
  // （文件 §3.6），administrator 預設並不是 curator，AdminPage 要用這個結果決定「藥品目錄」
  // 分頁能不能真的用，不能只因為是 administrator 就以為一定有 curator 權限（PR #797 review）。
  const { isCurator: isCatalogCurator, loading: curatorAccessLoading } = useMedicationCatalogCuratorAccess(
    userId,
    isAdminRoute && !!user,
  )
  if (publicRouteView) return publicRouteView

  if (isLineBrowser() && currentPath === '/') {
    // 繁體中文註解：LINE 版本對 target=_blank 的行為不一致，提示頁必須同時提供右上角選單指引；只攔公開登入頁，讓條款與 Demo 仍可直接閱讀／試用。
    const externalBrowserUrl = `${window.location.origin}${window.location.pathname}${window.location.hash}`
    return <LineBrowserGate externalBrowserUrl={externalBrowserUrl} />
  }

  if (loading) {
    return (
      <div className="h-dvh flex items-center justify-center bg-white text-gray-400 text-sm">
        {text(common.loading)}
      </div>
    )
  }

  if (isAdminRoute) {
    if (!user) return <LoginScreen onEnterDemo={enterDemoMode} />
    if (!isAdministratorUser) {
      // 共用藥品目錄管理員（curator）不是唯一的 administrator；查詢完成前不能先當作沒有權限，
      // 否則畫面會先閃一次「未授權」才變成藥品目錄分頁，讓真正的 curator 誤以為自己沒有權限。
      if (curatorAccessLoading) {
        return (
          <div className="h-dvh flex items-center justify-center bg-white text-gray-400 text-sm">
            {text(common.loading)}
          </div>
        )
      }
      if (!isCatalogCurator) return <UnauthorizedScreen email={user.email} />
    }
    return (
      <Suspense fallback={
        <div className="h-dvh flex items-center justify-center bg-white text-gray-400 text-sm">
          {text(common.loading)}
        </div>
      }>
        <div className="flex h-dvh flex-col bg-gray-50">
          <AppStatusBar />
          <div className="min-h-0 flex-1"><AdminPage isAdministrator={isAdministratorUser} isCatalogCurator={isCatalogCurator} /></div>
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
        onComplete={(careTarget, recorder, selectedModuleIds) => finishOnboardingWizard(careTarget, recorder, selectedModuleIds, selectedPatientId)}
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

  return (
    /*
      血壓判讀標準的掛載點（issue #898）。掛在這一層而不是各頁自己接，是因為
      VitalAlertBadge 之類的元件渲染在清單深處，一路傳 patientId 會經過會被遺漏的中繼元件，
      而漏傳的後果是靜默用一般成人標準判讀別人的血壓（AGENTS.md §3.5）。
      selectedPatientId 一變，整棵子樹的判讀跟著換，不會殘留上一位照護對象的目標。
      封存對象的唯讀歷史頁另有巢狀 Provider 覆蓋這一層，見 BloodPressureReportPanel。
    */
    <BpStandardProvider patientId={selectedPatientId}>
    <div className="app-shell flex h-dvh flex-col mx-auto max-w-md">
      {isDemoMode && <DemoModeBanner onExitDemoMode={() => exitDemoMode()} />}
      <AppStatusBar />
      <BloodPressureCountdownBanner session={currentMeasurementSession} />
      {archivedSubjectNotice && <ArchivedSubjectNotice onDismiss={() => setArchivedSubjectNotice(false)} />}

      {demoHandoffNotice && (
        <DemoHandoffNotice
          moduleIds={demoHandoffNotice.moduleIds}
          onReconfigure={() => {
            setDemoHandoffNotice(null)
            setOnboardingWizardPatientId(selectedPatientId)
          }}
          onDismiss={() => setDemoHandoffNotice(null)}
        />
      )}

      <main className="flex-1 min-h-0 overflow-y-auto bg-slate-50">
        <Suspense fallback={
          <div className="h-full flex items-center justify-center bg-slate-50 text-gray-400 text-sm">
            {text(common.loading)}
          </div>
        }>
          {tab === 'today'
            ? <TodayPage
                patientId={selectedPatientId}
                availablePatients={accessiblePatients}
                onSubjectSelect={changeActiveSubject}
                userEmail={effectiveUserEmail}
                // ADR-007 D7：care_access 且 can_record 才能結案；管理者只放寬 can_record（RPC 端仍會再驗一次 care_access）。
                canAcknowledgeIncidents={Boolean(accessiblePatients.find(patient => patient.patientId === selectedPatientId)?.canRecord) || isAdministratorUser}
                canUseMedication={canUseMedication}
                manageablePatients={medicationManagementPatients}
                ownPatientId={resolvedOwnPatientId}
                medicationSlotsExpanded={medicationSlotsExpanded}
                medicationNameEnglishFirst={medicationNameEnglishFirst}
                caregiverDensityMode={caregiverDensityMode}
                onOpenBloodPressureMeasurement={() => {
                  // issue #752：病人若已在設定關掉血壓模組，「照護」頁會找不到這個分頁而靜默退到別的分頁，
                  // 使用者完全看不出發生什麼事。改成先確認可見性，不可見時直接帶去顯示設定卡並指名血壓項目。
                  if (visibleDailyCareModules.some(module => module.id === 'bloodPressure')) {
                    setDailyCareSectionRequest('bloodPressure')
                    changeTab('dailyCare')
                    return
                  }
                  window.location.hash = buildDailyCareDisplaySettingsHash('bloodPressure')
                  changeTab('settings')
                }}
                onOpenReminders={() => { setDailyCareSectionRequest('careReminders'); changeTab('dailyCare') }}
                onOpenHistory={() => changeTab('events')}
              />
            : tab === 'events'
            ? <TrajectoryPage patientId={selectedPatientId} availablePatients={accessiblePatients} userEmail={user?.email} onSubjectSelect={changeActiveSubject} />
            : tab === 'visit'
              ? <NextVisitPage
                  patientId={selectedPatientId}
                  availablePatients={accessiblePatients}
                  onSubjectSelect={changeActiveSubject}
                  userEmail={effectiveUserEmail || undefined}
                  isDemoMode={isDemoMode}
                  showSchedule={canUseSchedule}
                  onOpenReminders={() => { setDailyCareSectionRequest('careReminders'); changeTab('dailyCare') }}
                  onOpenHistory={() => changeTab('events')}
                />
              : tab === 'settings'
                ? <SettingsPage activeSubject={selectedSubject} activePatientId={selectedPatientId} onChangeActiveSubject={changeActiveSubject} onCareRecipientCreated={async (patientId: string) => { await refreshIdentity(); setActiveSubject(patientId); if (user?.email) void saveActivePatientPreference(user.email, patientId) }} onCareRecipientArchived={refreshIdentity} availablePatients={accessiblePatients} profileDisplayName={effectiveDisplayName ?? undefined} userEmail={user?.email} canConfigureActiveSubject={canConfigureActiveSubject} medicationSlotsExpanded={medicationSlotsExpanded} medicationSettingsSaving={medicationSettingsSaving} medicationSettingsError={medicationSettingsError} medicationNameEnglishFirst={medicationNameEnglishFirst} medicationNameSettingsSaving={medicationNameSettingsSaving} medicationNameSettingsError={medicationNameSettingsError} caregiverDensityMode={caregiverDensityMode} caregiverDensitySettingsSaving={caregiverDensitySettingsSaving} caregiverDensitySettingsError={caregiverDensitySettingsError} isDemoMode={isDemoMode} dailyCarePreference={dailyCarePreference} dailyCareSettingsSaving={dailyCareSettingsSaving} dailyCareSettingsError={dailyCareSettingsError} canUseMedication={canUseMedication} onToggleDailyCareModule={onToggleDailyCareModule} onToggleCustomTemplate={onToggleCustomTemplate} useCustomDailyCareTemplate={useCustomDailyCareTemplate} activePatientCareRecipientType={activePatientCareRecipientType} onToggleMedicationSlotsExpanded={onToggleMedicationSlotsExpanded} onToggleMedicationNameEnglishFirst={onToggleMedicationNameEnglishFirst} onToggleCaregiverDensityMode={onToggleCaregiverDensityMode} />
                // dailyCare（照護）是 Tab 型別以外任何殘留值的安全回退，避免使用者卡在空白畫面；
                // 'today' 才是 B 期起的預設分頁。
              : <DailyCarePage subject={selectedSubject} patientId={selectedPatientId} patientName={allAccessiblePatients.find((patient) => patient.patientId === selectedPatientId)?.displayName} availablePatients={accessiblePatients} userEmail={effectiveUserEmail} onSubjectSelect={changeActiveSubject} canUseMedication={canUseMedication} manageablePatients={medicationManagementPatients} ownPatientId={resolvedOwnPatientId} medicationSlotsExpanded={medicationSlotsExpanded} medicationNameEnglishFirst={medicationNameEnglishFirst} visibleModules={visibleDailyCareModules} initialSection={dailyCareSectionRequest ?? pwaShortcutTarget?.section} onInitialSectionConsumed={() => { if (dailyCareSectionRequest) setDailyCareSectionRequest(null); else consumePwaShortcut() }} measurementSession={currentMeasurementSession} onMeasurementSessionStart={startBloodPressureMeasurementSession} onMeasurementSessionComplete={completeBloodPressureMeasurementSession} onOpenDisplaySettings={() => { window.location.hash = DAILY_CARE_DISPLAY_SETTINGS_ANCHOR; changeTab('settings') }} />}
        </Suspense>
      </main>

      {!keyboardOpen && <BottomNav tab={tab} onChangeTab={changeTab} />}
    </div>
    </BpStandardProvider>
  )
}
