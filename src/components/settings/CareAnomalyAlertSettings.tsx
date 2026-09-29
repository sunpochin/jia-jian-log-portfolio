/*
檔案用途：issue #415「主動異常示警」門檻設定卡——體重驟降、連續未回報服藥、血壓連續偏高／
        夜間低血壓次數，讓家屬調整判定天數與比例；驗收條件明訂門檻需可由家屬調整。
所在層：src/components/settings；自給自足元件，只接 patientId／isDemoMode／canManageMedication，
        自己管狀態、自己呼叫 lib，比照 PersonalNotificationSettings 慣例，避免 SettingsPage 的 props
        清單再變長；canManageMedication 直接來自 SettingsPage 既有的 availablePatients，不用另外查。
主要關聯：SettingsPage、src/lib/careAnomalySettings.ts、src/features/today/hooks/useCareAnomalySignals.ts。
*/
import { useEffect, useState } from 'react'
import { useI18n, type LocalizedText } from '../../lib/i18n'
import { useSaveStatus } from '../../hooks/useSaveStatus'
import { describeReadError, describeSaveError } from '../../lib/dataErrors'
import {
  readCareAnomalyAlertSettings,
  saveCareAnomalyAlertSettings,
  DEFAULT_CARE_ANOMALY_ALERT_SETTINGS,
  CARE_ANOMALY_ALERT_SETTINGS_BOUNDS,
  type CareAnomalyAlertSettings,
} from '../../lib/careAnomalySettings'

const TITLE: LocalizedText = { id: 'Peringatan perubahan tidak biasa', zh: '主動異常示警', en: 'Proactive anomaly alerts' }
const HELP: LocalizedText = {
  id: 'Sistem akan mencatat (bukan mendorong notifikasi) saat berat badan turun tajam, beberapa hari tanpa catatan minum obat, atau tekanan darah tinggi berturut-turut / tekanan darah malam rendah meningkat. Ini hanya mencatat data, bukan diagnosis — selalu diskusikan dengan dokter.',
  zh: '體重驟降、連續數日未回報服藥、血壓連續偏高或夜間低血壓次數上升時，系統會在「今天」頁記錄一筆觀察（不主動推播）。這只陳述數據變化，不是診斷，請與醫師討論。',
  en: 'The system records (does not push-notify) an observation on the Today page when weight drops sharply, medication goes unrecorded for several days, or blood pressure is elevated on consecutive days / low nighttime readings increase. This only states data changes, not a diagnosis — please discuss with a doctor.',
}
const DEMO_NOTICE: LocalizedText = { id: 'Pengaturan ini tidak tersedia dalam mode demo.', zh: '展示模式不提供這項設定。', en: 'This setting is not available in demo mode.' }
const ENABLE_LABEL: LocalizedText = { id: 'Aktifkan peringatan', zh: '啟用主動異常示警', en: 'Enable anomaly alerts' }
// 資料庫只允許 can_manage_medication 的照護者新增／修改這張表（見 migration），只讀權限的家人
// 打開這個面板卻能編輯每個欄位會在失焦儲存時收到 RLS 拒絕——直接鎖住欄位並說明原因比讓人猜測好。
const READ_ONLY_NOTICE: LocalizedText = {
  id: 'Hanya pengelola pengobatan yang dapat mengubah pengaturan ini.',
  zh: '只有被授權管理醫囑的家屬能調整這項設定。',
  en: 'Only caregivers authorized to manage medication can change this setting.',
}

type FieldKey = keyof typeof CARE_ANOMALY_ALERT_SETTINGS_BOUNDS

const FIELD_LABEL: Record<FieldKey, LocalizedText> = {
  weightDropWindowDays: { id: 'Jendela penurunan berat badan (hari)', zh: '體重下降觀察天數', en: 'Weight drop window (days)' },
  weightDropThresholdPercent: { id: 'Ambang penurunan berat badan (%)', zh: '體重下降門檻（%）', en: 'Weight drop threshold (%)' },
  missedMedicationThresholdDays: { id: 'Hari berturut-turut tanpa catatan obat', zh: '連續未回報服藥天數', en: 'Consecutive days without medication log' },
  bpHighStreakThresholdDays: { id: 'Hari berturut-turut tekanan darah tinggi', zh: '血壓連續偏高天數', en: 'Consecutive days of elevated blood pressure' },
  nightLowBpWindowDays: { id: 'Jendela tekanan darah malam rendah (hari)', zh: '夜間血壓觀察天數', en: 'Nighttime low BP window (days)' },
  nightLowBpThresholdCount: { id: 'Jumlah tekanan darah malam rendah', zh: '夜間血壓偏低次數門檻', en: 'Nighttime low BP count threshold' },
}

const FIELD_ORDER: FieldKey[] = [
  'weightDropWindowDays', 'weightDropThresholdPercent',
  'missedMedicationThresholdDays',
  'bpHighStreakThresholdDays', 'nightLowBpWindowDays', 'nightLowBpThresholdCount',
]

function clamp(field: FieldKey, value: number): number {
  const { min, max } = CARE_ANOMALY_ALERT_SETTINGS_BOUNDS[field]
  if (!Number.isFinite(value)) return min
  return Math.min(max, Math.max(min, value))
}

export function CareAnomalyAlertSettingsPanel({ patientId, isDemoMode, canManageMedication }: { patientId: string; isDemoMode: boolean; canManageMedication: boolean }) {
  const { text } = useI18n()
  const [loading, setLoading] = useState(!isDemoMode)
  const [loadError, setLoadError] = useState<LocalizedText | null>(null)
  const [settings, setSettings] = useState<CareAnomalyAlertSettings>(DEFAULT_CARE_ANOMALY_ALERT_SETTINGS)
  // 數字欄位在使用者打字過程中的暫存字串；只在失焦時才夾範圍並送出儲存，避免每敲一個數字就打一次 API
  // （例如輸入「30」會先經過「3」），也讓使用者能先刪空再重打，不被即時 clamp 卡住。
  const [draftValues, setDraftValues] = useState<Partial<Record<FieldKey, string>>>({})
  const save = useSaveStatus()

  useEffect(() => {
    if (isDemoMode) { setLoading(false); return }
    let cancelled = false
    setLoading(true)
    setLoadError(null)
    readCareAnomalyAlertSettings(patientId)
      .then(result => { if (!cancelled) setSettings(result) })
      .catch(error => {
        console.error('[anomaly alert settings read error]', error)
        if (!cancelled) setLoadError(describeReadError(error))
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [patientId, isDemoMode])

  const handleSave = async (next: CareAnomalyAlertSettings) => {
    setSettings(next)
    if (isDemoMode) return
    save.begin()
    try {
      await saveCareAnomalyAlertSettings(patientId, next)
      save.succeed(text({ id: 'Pengaturan disimpan.', zh: '設定已儲存。', en: 'Settings saved.' }))
    } catch (error) {
      console.error('[anomaly alert settings save error]', error)
      save.fail(text(describeSaveError(error)))
    }
  }

  const busy = save.status === 'saving'
  const readOnly = !isDemoMode && !canManageMedication
  const fieldsDisabled = isDemoMode || readOnly || busy

  return (
    <section className="mt-6 rounded-2xl border border-gray-200 bg-white p-4" aria-labelledby="care-anomaly-alert-settings-title">
      <h2 id="care-anomaly-alert-settings-title" className="font-bold text-gray-900">{text(TITLE)}</h2>
      <p className="mt-1 text-sm text-gray-500">{text(HELP)}</p>

      {isDemoMode && <p className="mt-3 rounded-xl bg-gray-100 px-3 py-2 text-xs text-gray-600">{text(DEMO_NOTICE)}</p>}
      {readOnly && !loading && <p className="mt-3 rounded-xl bg-gray-100 px-3 py-2 text-xs text-gray-600">{text(READ_ONLY_NOTICE)}</p>}

      {!isDemoMode && loading && <p className="mt-3 text-sm text-gray-500">{text({ id: 'Memuat…', zh: '載入中…', en: 'Loading…' })}</p>}

      {!isDemoMode && !loading && loadError && (
        <p role="alert" className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">{text(loadError)}</p>
      )}

      {!loading && !loadError && (
        <>
          <label className="mt-4 flex min-h-11 items-center justify-between gap-3 rounded-xl bg-gray-50 px-3 py-2">
            <span className="font-semibold text-gray-900">{text(ENABLE_LABEL)}</span>
            <input
              type="checkbox"
              checked={settings.enabled}
              disabled={fieldsDisabled}
              onChange={e => void handleSave({ ...settings, enabled: e.target.checked })}
              className="h-5 w-5"
            />
          </label>

          {settings.enabled && (
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {FIELD_ORDER.map(field => {
                const { min, max } = CARE_ANOMALY_ALERT_SETTINGS_BOUNDS[field]
                return (
                  <label key={field} className="flex flex-col gap-1">
                    <span className="text-xs font-semibold text-gray-600">{text(FIELD_LABEL[field])}</span>
                    <input
                      type="number"
                      min={min}
                      max={max}
                      step={field === 'weightDropThresholdPercent' ? 0.5 : 1}
                      value={draftValues[field] ?? String(settings[field])}
                      disabled={fieldsDisabled}
                      onChange={e => setDraftValues(previous => ({ ...previous, [field]: e.target.value }))}
                      onBlur={e => {
                        const clamped = clamp(field, e.target.valueAsNumber)
                        setDraftValues(previous => { const next = { ...previous }; delete next[field]; return next })
                        if (clamped === settings[field]) return
                        void handleSave({ ...settings, [field]: clamped })
                      }}
                      className="min-h-11 rounded-xl border border-gray-300 px-3 py-2 text-sm"
                    />
                  </label>
                )
              })}
            </div>
          )}
        </>
      )}

      {save.status === 'ok' && <p className="mt-2 text-xs font-semibold text-emerald-700">{save.message}</p>}
      {save.status === 'err' && <p role="alert" className="mt-2 rounded-xl bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">{save.message}</p>}
    </section>
  )
}
