/*
檔案用途：管理每位病人的每日照護顯示偏好載入、首次使用判斷、onboarding 精靈觸發，
以及展示模式試用承接（demo handoff）提示的狀態與寫入邏輯。
所在層：src/hooks；封裝 App.tsx 原本內嵌的每日照護偏好 effect 與精靈完成／略過流程。
主要關聯：由 App.tsx 呼叫，決定是否渲染 OnboardingWizard；依賴 lib/preferences/dailyCarePreferences、
lib/onboardingWizard、lib/demoHandoff 與 lib/dailyCareModules。
*/
import { useEffect, useState } from 'react'
import { readDailyCarePreference, readDailyCarePreferenceForPatient, saveDailyCarePreference, saveDailyCarePreferenceForPatient } from '../lib/preferences/dailyCarePreferences'
import { DEFAULT_DAILY_CARE_VISIBILITY, updateDailyCareVisibility, type DailyCareModuleId, type DailyCareVisibilityPreference } from '../lib/dailyCareModules'
import { buildOnboardingDailyCarePreference, hasCompletedOnboardingWizard, markOnboardingWizardCompleted, type OnboardingCareTarget, type OnboardingRecorder } from '../lib/onboardingWizard'
import { clearDemoModuleHandoff, readDemoModuleHandoff } from '../lib/demoHandoff'
import type { LocalizedText } from '../lib/i18n'

interface UseDailyCareOnboardingParams {
  activePatientId: string | undefined
  isDemoMode: boolean
  userId: string | undefined
  getActivePatientCareRecipientType: () => OnboardingCareTarget | undefined
  // 精靈存檔／模組切換途中若病人被切走，只把結果套回發起請求的同一位病人，避免 A 覆蓋 B 的畫面偏好；
  // 用 ref accessor 而非直接傳值，確保 async callback 讀到的是「呼叫當下」的最新 patient，而不是閉包捕捉的舊值。
  getActivePatientIdRef: () => string | undefined
}

export function useDailyCareOnboarding({ activePatientId, isDemoMode, userId, getActivePatientCareRecipientType, getActivePatientIdRef }: UseDailyCareOnboardingParams) {
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
            const nextPreference = buildOnboardingDailyCarePreference(DEFAULT_DAILY_CARE_VISIBILITY, getActivePatientCareRecipientType() ?? 'human', handoff.moduleIds)
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
    // getActivePatientCareRecipientType 刻意不列入依賴：它是讀取 App.tsx ref 當下最新值的 accessor 函式，
    // 每次 render 都重新建立，但語意上等同於原本直接讀 ref.current，不是會觸發重跑的反應式狀態；
    // 加進依賴會讓這個 effect 在物種資料非同步到位時重跑，把剛顯示出來的試用承接提示又立刻清掉。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePatientId, isDemoMode, userId])

  const finishOnboardingWizard = async (careTarget: OnboardingCareTarget, _recorder: OnboardingRecorder, selectedModuleIds: DailyCareModuleId[], selectedPatientId: string) => {
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
      if (getActivePatientIdRef() === requestPatientId) setDailyCarePreference(nextPreference)
      markOnboardingWizardCompleted(requestPatientId)
      setOnboardingWizardPatientId(null)
    } catch (error) {
      console.error('[onboarding wizard save error]', error)
      setOnboardingWizardError({ id: 'Pengaturan tidak dapat disimpan. Coba lagi.', zh: '設定儲存失敗，請再試一次。' ,en: "Settings could not be saved. Try again." })
    } finally {
      setOnboardingWizardSaving(false)
    }
  }

  const onToggleDailyCareModule = async (moduleId: DailyCareModuleId, enabled: boolean) => {
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
      if (getActivePatientIdRef() === requestPatientId) setDailyCarePreference(next.preference)
    } catch (error) {
      console.error('[daily care display settings save error]', error)
      if (getActivePatientIdRef() === requestPatientId) {
        setDailyCareSettingsError({ id: 'Tampilan perawatan harian gagal disimpan. Coba lagi nanti.', zh: '每日照護顯示設定儲存失敗，請稍後再試。' ,en: 'Daily care display settings failed to save, please try again later.' })
      }
    } finally {
      if (getActivePatientIdRef() === requestPatientId) setDailyCareSettingsSaving(false)
    }
  }

  const onToggleCustomTemplate = async (enabled: boolean) => {
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
      if (getActivePatientIdRef() === requestPatientId) setUseCustomDailyCareTemplate(enabled)
    } catch (error) {
      console.error('[daily care template mode save error]', error)
      if (getActivePatientIdRef() === requestPatientId) {
        setDailyCareSettingsError({ id: 'Tampilan perawatan harian gagal disimpan. Coba lagi nanti.', zh: '每日照護顯示設定儲存失敗，請稍後再試。' ,en: 'Daily care display settings failed to save, please try again later.' })
      }
    } finally {
      if (getActivePatientIdRef() === requestPatientId) setDailyCareSettingsSaving(false)
    }
  }

  return {
    dailyCarePreference,
    setDailyCarePreference,
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
  }
}
