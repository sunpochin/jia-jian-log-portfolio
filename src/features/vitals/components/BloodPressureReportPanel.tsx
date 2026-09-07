/*
檔案用途：呈現單一照護對象的完整血壓報告——趨勢圖、統計卡片、逐筆報告與 CSV 匯出。
所在層：src/features/vitals/components；由血壓模組的「近期趨勢」與封存對象的唯讀歷史頁共用同一份內容。
主要關聯：useBpRecords、DashboardChart、DashboardStatsCards、RecordReport、readMedicationHistory、readMedicationDay。

為什麼合併成一個元件：原本這些內容集中在獨立的「報告」底部分頁，但趨勢圖與體溫圖其實
已經跟血壓、體溫模組自己的「近期趨勢」重複顯示。拆分後這裡只保留真正不重複的部分
（統計卡片、逐筆報告、CSV／GPT 匯出），並改成接受明確的 patientId，不再依賴全域對象狀態——
封存對象的唯讀歷史頁因此可以直接傳入已封存的 patientId，不需要讓它進入 activeSubject。

目前藥單改讀 readMedicationDay(patientId, 今天照護日) 而不是變更歷史：
醫師版報告需要「現在正在吃什麼」，變更紀錄只回答「藥單什麼時候改過」，兩者不能互相取代。
*/
import { useEffect, useState } from 'react'
import { useBpRecords } from '../../../hooks/useBpRecords'
import { useDarkColorScheme } from '../../../hooks/useDarkColorScheme'
import { common, useI18n } from '../../../lib/i18n'
import { summarizeBpRecords } from '../../../lib/dashboardStats'
import { careDateKey } from '../../../lib/careDay'
import { readMedicationDay, readMedicationHistory, type MedicationPlanChangeLogView, type MedicationPlanView } from '../../../lib/medications'
import type { PatientIdentity } from '../../../lib/auth'
import { DashboardChart } from './DashboardChart'
import { DashboardStatsCards } from './DashboardStatsCards'
import { RecordReport } from './RecordReport'

export function BloodPressureReportPanel({ patientId, days, subjectLabel, careRecipientType, userEmail }: {
  patientId: string
  days: number
  subjectLabel: string
  careRecipientType?: PatientIdentity['careRecipientType']
  userEmail?: string
}) {
  const { text } = useI18n()
  const { records, loading, error, isOfflineData, cacheUpdatedAt, refetch } = useBpRecords(days, patientId)
  const usesDarkColorScheme = useDarkColorScheme()
  const [medicationChanges, setMedicationChanges] = useState<MedicationPlanChangeLogView[]>([])
  const [currentMedications, setCurrentMedications] = useState<MedicationPlanView[]>([])

  useEffect(() => {
    let cancelled = false
    readMedicationHistory(patientId).then(data => {
      if (!cancelled) setMedicationChanges(data)
    })
    readMedicationDay(patientId, careDateKey()).then(day => {
      if (!cancelled) setCurrentMedications(day.plans)
    })
    return () => { cancelled = true }
  }, [patientId])

  if (loading) return <p role="status" className="text-sm text-slate-500">{text(common.loading)}</p>
  if (error) return <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
    {error}
    <button type="button" className="ml-3 font-semibold underline" onClick={refetch}>{text(common.retry)}</button>
  </p>

  const summary = summarizeBpRecords(records)

  return (
    <div className="space-y-4">
      {isOfflineData && (
        <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-xs text-amber-850 flex items-center gap-2" role="status">
          <span className="text-base">⚠️</span>
          <div>
            <p className="font-semibold">{text({ id: 'Mode Offline', zh: '離線模式', en: 'Mode Offline' })}</p>
            <p className="mt-0.5 text-amber-600">{text({ id: 'Tidak ada internet. Menampilkan data cache.', zh: '目前無網路，顯示的是快取資料。', en: 'Not ada internet. Showing data cache.' })}</p>
          </div>
        </div>
      )}

      {careRecipientType && careRecipientType !== 'human' && (
        <div className="rounded-xl bg-indigo-50 border border-indigo-200 p-3 text-xs text-indigo-950 flex items-center gap-2">
          <span className="text-base">🐾</span>
          <div>
            <p className="font-bold">{text({ id: 'Catatan Kesehatan Hewan', zh: '寵物健康與日常紀錄', en: 'Pet health and routine' })}</p>
            <p className="mt-0.5 text-indigo-900">{text({ id: 'Tekanan darah hewan umumnya diukur di klinik veteriner. Gunakan aplikasi ini untuk memantau berat badan, jadwal obat, dan peristiwa kesehatan harian.', zh: '寵物血壓常規由獸醫師診所量測；家健錄為您聚焦體重變化、服藥紀錄與健康大事記。', en: 'Your pet’s blood pressure is routinely measured by your veterinarian’s office; your home health record keeps you focused on weight changes, medication records, and health memories.' })}</p>
          </div>
        </div>
      )}

      {records.length === 0
        ? <p className="text-sm text-slate-500">{text({ id: 'Belum ada catatan tekanan darah pada rentang ini.', zh: '這個區間還沒有血壓紀錄。', en: 'Not yet ada record blood pressure on rentang this.' })}</p>
        : <DashboardChart
            records={records}
            days={days}
            subjectLabel={subjectLabel}
            isOfflineData={isOfflineData}
            usesDarkColorScheme={usesDarkColorScheme}
            medicationChanges={medicationChanges}
          />}

      <DashboardStatsCards summary={summary} />

      <RecordReport
        records={records}
        subjectLabel={subjectLabel}
        selectedDays={days}
        canExport={Boolean(userEmail)}
        isOfflineData={isOfflineData}
        cacheUpdatedAt={cacheUpdatedAt}
        currentMedications={currentMedications}
      />
    </div>
  )
}
