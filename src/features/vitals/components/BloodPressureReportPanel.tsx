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
import { useEffect, useMemo, useState } from 'react'
import { useBpRecords } from '../../../hooks/useBpRecords'
import { useDarkColorScheme } from '../../../hooks/useDarkColorScheme'
import { common, useI18n } from '../../../lib/i18n'
import { summarizeBpRecords } from '../../../lib/dashboardStats'
import { careDateKey } from '../../../lib/careDay'
import { readMedicationDay, readMedicationHistory, type MedicationPlanChangeLogView, type MedicationPlanView } from '../../../lib/medication/medications'
import { buildPreVisitBrief, type PreVisitBriefItem } from '../../../lib/preVisitBrief'
import type { PatientIdentity } from '../../../lib/auth'
import { DashboardChart } from './DashboardChart'
import { DashboardStatsCards } from './DashboardStatsCards'
import { RecordReport } from './RecordReport'
import { usePreVisitSources } from '../hooks/usePreVisitSources'
import { useAddBriefToVisitQuestions } from '../hooks/useAddBriefToVisitQuestions'
import { isDemoPatientId } from '../../../lib/demoData'
import { BpStandardProvider, useBpEvaluator } from '../hooks/useBpEvaluator'

/**
 * 這個面板自己掛一層 BpStandardProvider，不依賴 App.tsx 那一層。
 *
 * 封存對象的唯讀歷史頁會直接把已封存的 patientId 傳進來（見上方檔案說明），那個 id 刻意
 * **不**進入 activeSubject，所以 App 那一層的 Provider 綁的是另一位病人。巢狀的 Provider
 * 讓內層覆蓋外層，報告因此永遠對著自己那一位病人的標準判讀。
 */
export function BloodPressureReportPanel(props: {
  patientId: string
  days: number
  subjectLabel: string
  careRecipientType?: PatientIdentity['careRecipientType']
  userEmail?: string
  // 照護閉環 T4（issue #948）：只有可寫的正式路徑（血壓模組的近期趨勢）開啟「加入問題清單」；
  // 封存對象的唯讀歷史頁不傳，維持唯讀。
  allowQuestionAdoption?: boolean
  // 成功加入問題清單後通知掛載端（門診頁要重新讀同頁的問題清單與「醫師說了什麼」）。
  onQuestionAdopted?: () => void
}) {
  return (
    <BpStandardProvider patientId={props.patientId}>
      <BloodPressureReportPanelContent {...props} />
    </BpStandardProvider>
  )
}

function BloodPressureReportPanelContent({ patientId, days, subjectLabel, careRecipientType, userEmail, allowQuestionAdoption = false, onQuestionAdopted }: {
  patientId: string
  days: number
  subjectLabel: string
  careRecipientType?: PatientIdentity['careRecipientType']
  userEmail?: string
  allowQuestionAdoption?: boolean
  onQuestionAdopted?: () => void
}) {
  const { text } = useI18n()
  const { records, loading, error, isOfflineData, cacheUpdatedAt, refetch } = useBpRecords(days, patientId)
  const evaluator = useBpEvaluator()
  const usesDarkColorScheme = useDarkColorScheme()
  const [medicationChanges, setMedicationChanges] = useState<MedicationPlanChangeLogView[]>([])
  const [currentMedications, setCurrentMedications] = useState<MedicationPlanView[]>([])
  const { events: trajectoryEvents, sourceStatus: trajectorySourceStatus, baselineRecords, dueReminders, labResults, window: preVisitWindow } = usePreVisitSources(patientId, days)
  // 就診前摘要（S2）只服務人類病人——寵物用藥與提醒規則不同（規劃文件 §5.2 驗收條件「非人類病人隱藏」），
  // null 讓 RecordReport 完全不渲染這個區塊，而不是渲染一個永遠空白的區塊。這個限制對 S4 的 R5
  // （檢驗值規則）同樣適用：檢驗值白名單模組本身就人類限定（見 dailyCareModules.ts）。
  const isHumanPatient = !careRecipientType || careRecipientType === 'human'
  // 「加入問題清單」只在：可寫路徑、人類病人、已登入、非展示病人時啟用——展示模式的 patient_visit_questions
  // 沒有種子也對 anon 撤銷了寫入，硬打只會產生注定失敗的請求。
  const questionAdoptionEnabled = allowQuestionAdoption && isHumanPatient && Boolean(userEmail) && !isDemoPatientId(patientId)
  const briefAdoption = useAddBriefToVisitQuestions(patientId, { enabled: questionAdoptionEnabled, onAdded: onQuestionAdopted })
  const preVisitBriefItems = useMemo<PreVisitBriefItem[] | null>(() => {
    if (!isHumanPatient || !preVisitWindow.start || !preVisitWindow.end) return null
    return buildPreVisitBrief(records, trajectoryEvents, preVisitWindow, {
      baselineRecords,
      dueReminders,
      sourceStatus: trajectorySourceStatus,
      labResults,
      standardResolver: evaluator.resolver,
    })
  }, [isHumanPatient, records, trajectoryEvents, preVisitWindow, baselineRecords, dueReminders, trajectorySourceStatus, labResults, evaluator.resolver])

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

  // Codex review（PR #905，P1）：判讀標準還沒讀到時，原本整頁照常渲染、判讀靜默退回一般成人標準。
  // 報告與匯出是交給醫師的輸出，用一份還不知道對不對的門檻算出「偏高幾筆／平均」再印出去，
  // 比多等半秒糟得多，所以這一頁連同標準一起等。讀取**失敗**則不擋畫面（空白報告更糟），
  // 改成明講 ＋ 可重試 ＋ 停用匯出，見下方。
  if (loading || evaluator.loading) return <p role="status" className="text-sm text-slate-500">{text(common.loading)}</p>
  if (error) return <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
    {error}
    <button type="button" className="ml-3 font-semibold underline" onClick={refetch}>{text(common.retry)}</button>
  </p>

  const summary = summarizeBpRecords(records, evaluator.resolver)

  return (
    <div className="space-y-4">
      {evaluator.error != null && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-800" role="alert">
          <p className="font-semibold">{text({ id: 'Standar penilaian tidak terbaca', zh: '判讀標準讀取失敗', en: 'Could not read the interpretation standard' })}</p>
          <p className="mt-0.5">{text({ id: 'Warna dan hitungan di bawah sementara memakai standar dewasa umum, bukan target pasien ini. Ekspor dinonaktifkan sampai berhasil dibaca.', zh: '以下顏色與統計暫時以一般成人標準計算，不是這位照護對象的目標。讀取成功前停用匯出。', en: 'The colours and counts below temporarily use the general adult standard, not this person’s target. Export is disabled until it loads.' })}</p>
          <button type="button" className="mt-1 font-semibold underline" onClick={() => evaluator.reload()}>{text(common.retry)}</button>
        </div>
      )}

      {isOfflineData && (
        <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-xs text-amber-850 flex items-center gap-2" role="status">
          <span className="text-base">⚠️</span>
          <div>
            <p className="font-semibold">{text({ id: 'Mode Offline', zh: '離線模式', en: 'Offline Mode' })}</p>
            <p className="mt-0.5 text-amber-600">{text({ id: 'Tidak ada internet. Menampilkan data cache.', zh: '目前無網路，顯示的是快取資料。', en: 'No internet connection. Showing cached data.' })}</p>
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
        ? <p className="text-sm text-slate-500">{text({ id: 'Belum ada catatan tekanan darah pada rentang ini.', zh: '這個區間還沒有血壓紀錄。', en: 'No blood pressure records in this range yet.' })}</p>
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
        // 標準讀不到時不得匯出：CSV 與 GPT 摘要會在每一列印出判讀標準，
        // 那份檔案會離開 app 進到醫師手上，不能帶著一份我們自己都不確定的判讀出去。
        canExport={Boolean(userEmail) && evaluator.error == null}
        isOfflineData={isOfflineData}
        cacheUpdatedAt={cacheUpdatedAt}
        currentMedications={currentMedications}
        trajectoryEvents={trajectoryEvents}
        trajectorySourceStatus={trajectorySourceStatus}
        preVisitBriefItems={preVisitBriefItems}
        briefAdoption={questionAdoptionEnabled ? briefAdoption : undefined}
      />
    </div>
  )
}
