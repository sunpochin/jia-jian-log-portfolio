/*
檔案用途：管理服藥時段展開、藥名英文優先、看護密度模式三組帳號層顯示偏好的載入與寫入狀態，
並在展示模式下觸發首次進入的教學導覽。
所在層：src/hooks；封裝 App.tsx 原本內嵌的偏好讀取 effect（依展示模式／登入帳號切換時重新載入）。
主要關聯：由 App.tsx 呼叫，讀寫結果傳給 TodayPage／SettingsPage；依賴
lib/preferences/medicationDisplayPreference、lib/preferences/caregiverDensityPreference
與 components/tutorial 的 useTutorial()、lib/demoTutorialSteps。
*/
import { useEffect, useState } from 'react'
import type { Locale, LocalizedText } from '../lib/i18n'
import type { TutorialStep } from '../components/tutorial'
import {
  readMedicationSlotsExpandedPreference,
  readMedicationSlotsExpandedPreferenceForUser,
  saveMedicationSlotsExpandedPreference,
  saveMedicationSlotsExpandedPreferenceForUser,
  readMedicationNameEnglishFirstPreference,
  readMedicationNameEnglishFirstPreferenceForUser,
  saveMedicationNameEnglishFirstPreference,
  saveMedicationNameEnglishFirstPreferenceForUser,
} from '../lib/preferences/medicationDisplayPreference'
import {
  readCaregiverDensityModePreference,
  readCaregiverDensityModePreferenceForUser,
  saveCaregiverDensityModePreference,
  saveCaregiverDensityModePreferenceForUser,
  DEFAULT_CAREGIVER_DENSITY_MODE,
} from '../lib/preferences/caregiverDensityPreference'
import { buildDemoTutorialSteps } from '../lib/demoTutorialSteps'

interface UseMedicationDisplayPreferencesParams {
  isDemoMode: boolean
  userId: string | undefined
  locale: Locale
  startTutorial: (steps: TutorialStep[]) => void
  getActivePatientId: () => string | null
}

export function useMedicationDisplayPreferences({ isDemoMode, userId, locale, startTutorial, getActivePatientId }: UseMedicationDisplayPreferencesParams) {
  const [medicationSlotsExpanded, setMedicationSlotsExpanded] = useState(readMedicationSlotsExpandedPreference)
  const [medicationSettingsSaving, setMedicationSettingsSaving] = useState(false)
  const [medicationSettingsError, setMedicationSettingsError] = useState<LocalizedText | null>(null)
  const [medicationNameEnglishFirst, setMedicationNameEnglishFirst] = useState(readMedicationNameEnglishFirstPreference)
  const [medicationNameSettingsSaving, setMedicationNameSettingsSaving] = useState(false)
  const [medicationNameSettingsError, setMedicationNameSettingsError] = useState<LocalizedText | null>(null)
  // F 期看護密度模式：帳號層開關；這裡的初始值只是讀取完成前的短暫佔位（本機展示模式偏好），
  // 登入帳號的實際預設改依 household_members.role 計算，見 caregiverDensityPreference.ts。
  const [caregiverDensityMode, setCaregiverDensityMode] = useState(readCaregiverDensityModePreference)
  const [caregiverDensitySettingsSaving, setCaregiverDensitySettingsSaving] = useState(false)
  const [caregiverDensitySettingsError, setCaregiverDensitySettingsError] = useState<LocalizedText | null>(null)

  useEffect(() => {
    if (isDemoMode) {
      setMedicationSlotsExpanded(readMedicationSlotsExpandedPreference())
      setMedicationSettingsError(null)
      setMedicationSettingsSaving(false)
      setMedicationNameEnglishFirst(readMedicationNameEnglishFirstPreference())
      setMedicationNameSettingsError(null)
      setMedicationNameSettingsSaving(false)
      setCaregiverDensityMode(readCaregiverDensityModePreference())
      setCaregiverDensitySettingsError(null)
      setCaregiverDensitySettingsSaving(false)

      // 繁體中文註解：觸發展示模式的初次教學導覽。
      // 步驟內容住在 src/lib/demoTutorialSteps.ts，跟設定頁的重播入口共用同一份定義。
      const hasSeenTutorial = localStorage.getItem('jia-jian-log-demo-tutorial')
      if (!hasSeenTutorial) {
        setTimeout(() => {
          startTutorial(buildDemoTutorialSteps({ locale, getActivePatientId }))
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
      setCaregiverDensityMode(DEFAULT_CAREGIVER_DENSITY_MODE)
      setCaregiverDensitySettingsError(null)
      setCaregiverDensitySettingsSaving(false)
      return
    }

    setMedicationSlotsExpanded(true)
    setMedicationSettingsError(null)
    setMedicationSettingsSaving(true)
    setMedicationNameEnglishFirst(true)
    setMedicationNameSettingsError(null)
    setMedicationNameSettingsSaving(true)
    setCaregiverDensityMode(DEFAULT_CAREGIVER_DENSITY_MODE)
    setCaregiverDensitySettingsError(null)
    setCaregiverDensitySettingsSaving(true)
    let cancelled = false
    void readMedicationSlotsExpandedPreferenceForUser(userId)
      .then(expanded => {
        if (!cancelled) setMedicationSlotsExpanded(expanded)
      })
      .catch(error => {
        console.error('[medication display settings read error]', error)
        if (!cancelled) {
          setMedicationSlotsExpanded(true)
          setMedicationSettingsError({ id: 'Pengaturan tampilan obat tidak dapat dimuat. Tampilan diperluas digunakan sementara.', zh: '服藥顯示設定讀取失敗，暫時使用直接展開。' ,en: 'Could not load medication display settings; showing the expanded view for now.' })
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
          // 藥名顯示設定讀取與儲存錯誤英文翻譯修正
          setMedicationNameSettingsError({ id: 'Pengaturan nama obat tidak dapat dimuat. Nama Inggris digunakan sementara.', zh: '藥名顯示設定讀取失敗，暫時優先顯示英文名。' ,en: "Medication name settings could not be loaded. English names will be prioritized temporarily." })
        }
      })
      .finally(() => {
        if (!cancelled) setMedicationNameSettingsSaving(false)
      })
    void readCaregiverDensityModePreferenceForUser(userId)
      .then(enabled => {
        if (!cancelled) setCaregiverDensityMode(enabled)
      })
      .catch(error => {
        console.error('[caregiver density mode settings read error]', error)
        if (!cancelled) {
          setCaregiverDensityMode(DEFAULT_CAREGIVER_DENSITY_MODE)
          setCaregiverDensitySettingsError({ id: 'Pengaturan mode pengasuh tidak dapat dimuat. Tampilan lengkap digunakan sementara.', zh: '看護密度模式設定讀取失敗，暫時使用完整顯示。', en: 'Caregiver density mode settings could not be loaded. The full view is used temporarily.' })
        }
      })
      .finally(() => {
        if (!cancelled) setCaregiverDensitySettingsSaving(false)
      })

    return () => { cancelled = true }
    // startTutorial 刻意不列入依賴：它是 TutorialContext 每次 render 重新建立的函式（provider 的 value 也是新物件），
    // 加進依賴會讓這個 effect 每次 render 都重跑，展示模式的教學導覽就會被反覆觸發。
    // 這個 effect 只該在「進入／離開展示模式」或「換帳號」時執行一次。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDemoMode, userId])

  const onToggleMedicationSlotsExpanded = async (expanded: boolean) => {
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
  }

  const onToggleMedicationNameEnglishFirst = async (englishFirst: boolean) => {
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
      setMedicationNameSettingsError({ id: 'Pengaturan nama obat gagal disimpan. Coba lagi nanti.', zh: '藥名顯示設定儲存失敗，請稍後再試。' ,en: "Medication name settings could not be saved. Please try again later." })
    } finally {
      setMedicationNameSettingsSaving(false)
    }
  }

  const onToggleCaregiverDensityMode = async (enabled: boolean) => {
    if (caregiverDensitySettingsSaving) return
    setCaregiverDensitySettingsSaving(true)
    setCaregiverDensitySettingsError(null)
    try {
      if (isDemoMode || !userId) {
        saveCaregiverDensityModePreference(enabled)
      } else {
        await saveCaregiverDensityModePreferenceForUser(userId, enabled)
      }
      setCaregiverDensityMode(enabled)
    } catch (error) {
      console.error('[caregiver density mode settings save error]', error)
      setCaregiverDensitySettingsError({ id: 'Pengaturan mode pengasuh gagal disimpan. Coba lagi nanti.', zh: '看護密度模式設定儲存失敗，請稍後再試。', en: 'Caregiver density mode settings failed to save, please try again later.' })
    } finally {
      setCaregiverDensitySettingsSaving(false)
    }
  }

  return {
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
  }
}
