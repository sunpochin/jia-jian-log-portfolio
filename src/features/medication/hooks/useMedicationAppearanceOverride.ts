/*
檔案用途：「這顆藥的劑型或顏色登錄錯了嗎？」修正面板的範圍判斷（issue #759，共用藥品目錄單位 D）——
  依規劃文件 §4.4 決定情境 A／B／C，並提供病人層外觀覆蓋的讀取、儲存與還原。
所在層：src/features/medication/hooks；只管這個修正面板自己的狀態，不碰 useMedicationAdminForm
  既有的 dosageForm／appearanceColor 等直接修正欄位（情境 A 仍照舊路徑走 apply_medication_plan_change）。
主要關聯：src/lib/medication/medicationAppearanceOverrides.ts（資料層）、
  src/features/medication/components/MedicationAppearanceOverridePanel.tsx（畫面）。
*/
import { useEffect, useState } from 'react'
import type { MedicationOption } from '../../../lib/medication/medicationAdmin'
import {
  clearPatientMedicationAppearanceOverride,
  readMedicationCatalogUsage,
  readPatientMedicationAppearanceOverrides,
  resolveAppearanceCorrectionScenario,
  savePatientMedicationAppearanceOverride,
  type MedicationAppearanceCorrectionScenario,
  type MedicationCatalogUsage,
} from '../../../lib/medication/medicationAppearanceOverrides'
import type { PatientMedicationAppearanceOverride } from '../../../types/database'
import type { LocalizedText } from '../../../lib/i18n'

export interface MedicationAppearanceOverridePanelState {
  loading: boolean
  // 查範圍（medication_catalog_usage）或查既有覆蓋列失敗時設定；跟 status（送出結果訊息）分開，
  // 因為讀取失敗時表單只是空白初始值，絕不能讓照護者以為「目前顯示的就是這顆藥現在的樣子」再送出，
  // 那樣會把一筆全空或沿用上一顆藥殘留狀態的覆蓋整組寫進去（code review 抓到的問題）。
  loadError: LocalizedText | null
  // 已經有覆蓋列時，不論目前重新查到的 usage 情境是什麼，一律先顯示覆蓋面板——
  // 覆蓋是這個人真實存在的資料，不能因為其他家庭剛好也不再用這顆藥就讓畫面憑空切回共用面板。
  scenario: 'direct' | MedicationAppearanceCorrectionScenario
  existingOverride: PatientMedicationAppearanceOverride | null
  color: string
  shape: string
  photoUrl: string
  note: string
  setColor: (value: string) => void
  setShape: (value: string) => void
  setPhotoUrl: (value: string) => void
  setNote: (value: string) => void
  saving: boolean
  status: LocalizedText | null
  save: () => Promise<boolean>
  restoreShared: () => Promise<boolean>
}

export function useMedicationAppearanceOverride(
  patientId: string,
  medication: MedicationOption | undefined,
  enabled: boolean,
  // 儲存或還原成功後，父層的藥單清單（useMedicationAdminForm 的 medications／今日藥卡）仍停留在
  // 讀取當下的舊外觀；呼叫端可以傳這個 callback 重抓，讓畫面立刻反映剛存的覆蓋（code review 抓到的問題）。
  onChanged?: () => void,
): MedicationAppearanceOverridePanelState {
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<LocalizedText | null>(null)
  const [usage, setUsage] = useState<MedicationCatalogUsage | undefined>(undefined)
  const [existingOverride, setExistingOverride] = useState<PatientMedicationAppearanceOverride | null>(null)
  const [color, setColor] = useState('')
  const [shape, setShape] = useState('')
  const [photoUrl, setPhotoUrl] = useState('')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState<LocalizedText | null>(null)

  useEffect(() => {
    if (!enabled || !medication) return
    let cancelled = false
    setLoading(true)
    setLoadError(null)
    setStatus(null)
    Promise.all([
      readMedicationCatalogUsage([medication.id]),
      readPatientMedicationAppearanceOverrides(patientId),
    ]).then(([usageRows, overrides]) => {
      if (cancelled) return
      const matchedUsage = usageRows.find(row => row.medicationId === medication.id)
      const override = overrides.find(candidate => candidate.medication_id === medication.id) ?? null
      setUsage(matchedUsage)
      setExistingOverride(override)
      // 表單預填：已有覆蓋就照覆蓋值改；還沒有覆蓋則照共用值起改，讓照護者從「目前看到的樣子」出發修正。
      // 四欄都要退回共用值，不能漏掉照片／備註——mergeMedicationAppearanceOverride 存檔時是整組四欄
      // 一起換成表單目前的值，退回共用值的欄位漏填空字串會在儲存時把共用照片／備註靜默清空。
      setColor(override?.appearance_color ?? medication.appearance_color ?? '')
      setShape(override?.appearance_shape ?? medication.appearance_shape ?? '')
      setPhotoUrl(override?.appearance_photo_url ?? medication.appearance_photo_url ?? '')
      setNote(override?.appearance_note ?? medication.appearance_note ?? '')
    }).catch(() => {
      if (cancelled) return
      // 讀取失敗留在初始空白值；不能讓 save()／restoreShared() 用這組不完整的狀態寫進資料庫，
      // 靠 loadError 擋在按鈕層級，不是靠使用者自己看得出表單「看起來怪怪的」。
      setLoadError({ id: 'Gagal memuat cakupan perbaikan. Coba lagi.', zh: '讀取修正範圍失敗，請重試。', en: 'Failed to load correction scope. Please try again.' })
    }).finally(() => {
      if (!cancelled) setLoading(false)
    })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, medication?.id, patientId])

  const computedScenario = medication ? resolveAppearanceCorrectionScenario(medication.verification_status, usage) : 'direct'
  // 已有覆蓋列時強制非 direct：覆蓋是這個人真實存在的資料，不能因為重新查到的 usage 剛好符合
  // 「全部由呼叫者管理」就讓畫面憑空切回共用面板，害照護者以為剛才存的覆蓋不見了。
  const scenario: MedicationAppearanceOverridePanelState['scenario'] = existingOverride && computedScenario === 'direct' ? 'shared_with_others' : computedScenario

  const save = async () => {
    // loadError 未清除代表表單目前是空白初始值或上一顆藥殘留的狀態，不是這顆藥真正的現況；
    // 擋在這裡而不是只靠畫面停用按鈕，避免有呼叫端繞過 UI 直接呼叫這個函式。
    if (!medication || loadError) return false
    setSaving(true)
    setStatus(null)
    try {
      const saved = await savePatientMedicationAppearanceOverride({
        patientId, medicationId: medication.id,
        appearanceColor: color || null, appearanceShape: shape || null,
        appearancePhotoUrl: photoUrl.trim() || null, appearanceNote: note.trim() || null,
      })
      setExistingOverride(saved)
      setStatus({ id: 'Tampilan khusus untuk orang ini sudah disimpan.', zh: '已儲存此人專屬外觀。', en: "This person's appearance override has been saved." })
      onChanged?.()
      return true
    } catch {
      setStatus({ id: 'Gagal menyimpan. Coba lagi.', zh: '儲存失敗，請重試。', en: 'Failed to save. Please try again.' })
      return false
    } finally {
      setSaving(false)
    }
  }

  const restoreShared = async () => {
    if (!medication || loadError) return false
    setSaving(true)
    setStatus(null)
    try {
      await clearPatientMedicationAppearanceOverride(patientId, medication.id)
      setExistingOverride(null)
      // 還原後表單要照著「現在真的會顯示什麼」重填，不能留空——照片／備註跟顏色／形狀一樣要退回共用值，
      // 否則照護者留在面板上會看到「共用外觀」其實不是共用列真正的樣子。
      setColor(medication.appearance_color ?? '')
      setShape(medication.appearance_shape ?? '')
      setPhotoUrl(medication.appearance_photo_url ?? '')
      setNote(medication.appearance_note ?? '')
      setStatus({ id: 'Sudah dikembalikan ke tampilan bersama.', zh: '已還原成共用外觀。', en: 'Restored to the shared appearance.' })
      onChanged?.()
      return true
    } catch {
      setStatus({ id: 'Gagal mengembalikan. Coba lagi.', zh: '還原失敗，請重試。', en: 'Failed to restore. Please try again.' })
      return false
    } finally {
      setSaving(false)
    }
  }

  return { loading, loadError, scenario, existingOverride, color, shape, photoUrl, note, setColor, setShape, setPhotoUrl, setNote, saving, status, save, restoreShared }
}
