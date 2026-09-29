/*
檔案用途：底部導覽「今天」tab 的首頁——回答 Now／Attention 兩層問題，其餘三層（Trend／History／Next visit）
各露出一行連結，不重新實作任何既有邏輯。同一個元件依 caregiverDensityMode 切換兩種密度組合
（F 期「看護密度模式」），不是另外做第六個 tab。
所在層：src/features/today/pages；純組合既有元件與 useTodayOverview 的讀取結果，本身不直接呼叫 Supabase。
主要關聯：組合 MedicationPage（embedded 時段卡）、LatestVitals、AttentionItem、useTodayOverview；
對應 docs/product/clinical-care-ops-ui-design.md §5／§6（W1 wireframe）與 issue #733（B 期）／#737（F 期）。
*/
import { useState } from 'react'
import { useI18n } from '../../../lib/i18n'
import { TabHeader } from '../../../components/ui/TabHeader'
import { SubjectSwitcher } from '../../../components/ui/SubjectSwitcher'
import { AttentionItem } from '../../../components/ui/AttentionItem'
import { LatestVitals } from '../../vitals/components/LatestVitals'
import { MedicationPage } from '../../medication/pages/MedicationPage'
import { useTodayOverview } from '../hooks/useTodayOverview'
import { useNotificationDeliveryIncidents } from '../hooks/useNotificationDeliveryIncidents'
import { NotificationIncidentBanner } from '../components/NotificationIncidentBanner'
import type { MedicationManagementPatient, PatientIdentity } from '../../../lib/auth'

export function TodayPage({
  patientId,
  availablePatients,
  onSubjectSelect,
  userEmail,
  canUseMedication,
  canAcknowledgeIncidents = false,
  manageablePatients,
  ownPatientId,
  medicationSlotsExpanded,
  medicationNameEnglishFirst,
  caregiverDensityMode,
  onOpenBloodPressureMeasurement,
  onOpenReminders,
  onOpenHistory,
}: {
  patientId: string
  availablePatients: PatientIdentity[]
  onSubjectSelect: (patientId: string) => void
  userEmail: string
  canUseMedication: boolean
  // ADR-007 票 10：通知 incident 橫幅的「已處理」只給 care_access 且 can_record（或管理者）；viewer 看得到橫幅但沒有按鈕。
  canAcknowledgeIncidents?: boolean
  manageablePatients: MedicationManagementPatient[]
  ownPatientId: string
  medicationSlotsExpanded: boolean
  medicationNameEnglishFirst: boolean
  // F 期看護密度模式開關（設定頁手動切換，預設關閉，見 caregiverDensityPreference.ts）；
  // 開啟時只顯示 Now 與「今天要做」的 Attention 項目，Trend 收合成一行連結。
  caregiverDensityMode: boolean
  // 一步量血壓：今天頁本身不重做輸入表單，點擊後導去既有的血壓輸入區塊（記錄 tab）。
  onOpenBloodPressureMeasurement: () => void
  onOpenReminders: () => void
  onOpenHistory: () => void
}) {
  const { text } = useI18n()
  const overview = useTodayOverview(patientId, { densityMode: caregiverDensityMode })
  // ADR-007 D7「告警必須有指名的消費者」：sweeper 寫進告警表還不算有人知道，這裡是那個出口。
  const incidents = useNotificationDeliveryIncidents(patientId)
  // 密度模式下 Trend 預設收合成一行連結；使用者仍可點開查看，不是刪掉功能。
  const [trendExpanded, setTrendExpanded] = useState(false)
  const attentionItemsToShow = caregiverDensityMode ? overview.todayAttentionItems : overview.attentionItems

  return (
    <section className="min-h-full bg-slate-50 px-4 pb-8 pt-4 text-slate-950 sm:px-5">
      <header className="mb-5 space-y-4">
        <TabHeader title="today" />
        <SubjectSwitcher patientId={patientId} patients={availablePatients} onSelect={onSubjectSelect} />
      </header>

      {/* 通知 incident 橫幅放在最上面：這是「危險等級寧可漏送、但一定有人知道」裡「有人知道」的那一半（票 10）。
         不用 Telegram 再發一則告警——失敗的正是那條管道。 */}
      <NotificationIncidentBanner
        incidents={incidents.incidents}
        checkFailed={incidents.checkFailed}
        canAcknowledge={canAcknowledgeIncidents}
        acknowledgingId={incidents.acknowledgingId}
        acknowledgeFailed={incidents.acknowledgeFailed}
        onAcknowledge={id => { void incidents.acknowledge(id) }}
      />

      {/* 離線／讀取失敗時整段用一句話取代，不留空白也不讓畫面看起來像當機。 */}
      {overview.errorMessage && (
        <p role="alert" className="mb-4 rounded-xl bg-red-50 p-3 text-base font-semibold text-red-700">
          {overview.errorMessage}
        </p>
      )}

      {/* ── 現在（Now）：今日血壓 + 服藥時段卡，兩者都是一步到位的操作，不疊加額外導覽層。 ──
         底色跟主要 CTA 改用 brand（emerald）而非 sky：A 期 design tokens 把 sky 收斂成只給
         「系統訊息」用（見 docs/product/clinical-care-ops-ui-design.md §4.1 danger/warn/info 分工），
         這裡的「量血壓」是全頁最主要的操作按鈕，屬於「主按鈕、選中狀態」一類，應該跟品牌色一致。 */}
      <section className="mb-4 rounded-3xl border border-brand-200 bg-brand-50 p-5 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-lg font-black text-ink">{text({ id: 'Sekarang', zh: '現在', en: 'Now' })}</h2>
          <button
            type="button"
            onClick={onOpenBloodPressureMeasurement}
            className="min-h-11 shrink-0 rounded-2xl bg-brand-700 px-4 text-sm font-black text-white shadow-sm active:bg-emerald-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-700 focus-visible:ring-offset-2"
          >
            {text({ id: 'Ukur tekanan darah', zh: '量血壓', en: 'Measure blood pressure' })}
          </button>
        </div>
        <LatestVitals
          record={overview.latestBpRecord}
          loading={overview.loading && !overview.latestBpRecord}
          error={overview.offline && !overview.latestBpRecord}
          className="mt-3 text-base"
        />
      </section>

      {/* 服藥時段卡直接 embed，看護打卡不必先進「記錄」tab 再找服藥子頁。 */}
      <div className="mb-4">
        {canUseMedication
          ? <MedicationPage
              manageablePatients={manageablePatients}
              ownPatientId={ownPatientId}
              selectedPatientId={patientId}
              availablePatients={availablePatients}
              userEmail={userEmail}
              onSubjectSelect={onSubjectSelect}
              embedded
              slotsExpandedByDefault={medicationSlotsExpanded}
              nameEnglishFirst={medicationNameEnglishFirst}
            />
          : null}
      </div>

      {/* ── 需要留意（Attention）：到期提醒與待複評醫囑合併成單一清單，逾期排最前面。 ── */}
      <section className="mb-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg font-black text-slate-900">{text({ id: 'Perlu diperhatikan', zh: '需要留意', en: 'Needs attention' })}</h2>
          <button type="button" onClick={onOpenReminders} className="min-h-9 text-sm font-bold text-brand-700 underline decoration-brand-200 underline-offset-4">
            {text({ id: 'Lihat semua', zh: '查看全部', en: 'View all' })}
          </button>
        </div>
        {overview.loading && attentionItemsToShow.length === 0
          ? <p className="mt-3 text-sm text-slate-500">{text({ id: 'Memuat…', zh: '載入中…', en: 'Loading…' })}</p>
          : <>
              {/* issue #887：異常示警查詢失敗時，清單可能少列了本來該出現的觀察項目——不管清單當下
                 是空的還是已經有其他到期提醒／待複評項目，都要顯示這個警示，不能只在清單為空時才提醒，
                 否則「清單看起來完整」跟「清單其實有一項沒檢查成功」會被使用者誤判成同一種狀態。 */}
              {overview.anomalyCheckFailed && (
                <p className="mt-3 text-sm font-medium text-amber-700">{text({ id: 'Sebagian pemeriksaan gagal dimuat, daftar mungkin belum lengkap. Coba lagi nanti.', zh: '部分項目暫時無法檢查，清單可能不完整，請稍後再試。', en: 'Some checks could not be completed; this list may be incomplete. Please try again later.' })}</p>
              )}
              {attentionItemsToShow.length === 0
                ? (!overview.anomalyCheckFailed && <p className="mt-3 text-sm font-medium text-slate-600">{text({ id: 'Tidak ada yang perlu diperhatikan hari ini.', zh: '目前沒有需要留意的項目。', en: 'Nothing needs attention right now.' })}</p>)
                : <ul className="mt-3 space-y-3">
                    {attentionItemsToShow.map(item => (
                      <AttentionItem key={item.id} tone={item.tone} title={item.title} description={item.description} />
                    ))}
                  </ul>}
            </>}
      </section>

      {/* ── 最近 7 天（Trend）：不畫圖，只給數字摘要，符合 §6「少於 4 個點用數字」的準則。
         看護密度模式預設收合成一行連結（見 docs/product/clinical-care-ops-ui-design.md §5），
         點開後內容跟家屬版一致，不是刪除功能，只是預設不佔看護的第一眼版面。 ── */}
      {caregiverDensityMode && !trendExpanded
        ? (
          <button
            type="button"
            onClick={() => setTrendExpanded(true)}
            className="mb-4 min-h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-left text-sm font-bold text-slate-700 shadow-sm active:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-700 focus-visible:ring-offset-2"
          >
            {text({ id: 'Lihat tren 7 hari terakhir →', zh: '查看最近 7 天趨勢 →', en: 'View the last 7 days trend →' })}
          </button>
        )
        : (
          <section className="mb-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-black text-slate-900">{text({ id: '7 hari terakhir', zh: '最近 7 天', en: 'Last 7 days' })}</h2>
            <p className="mt-2 text-base font-medium text-slate-700">
              {overview.bpSummary.recordCount > 0
                ? text({
                    id: `${overview.bpSummary.recordCount} pengukuran · rata-rata ${overview.bpSummary.avgSystolic ?? '—'}/${overview.bpSummary.avgDiastolic ?? '—'}`,
                    zh: `共 ${overview.bpSummary.recordCount} 筆・平均 ${overview.bpSummary.avgSystolic ?? '—'}/${overview.bpSummary.avgDiastolic ?? '—'}`,
                    en: `${overview.bpSummary.recordCount} readings · avg ${overview.bpSummary.avgSystolic ?? '—'}/${overview.bpSummary.avgDiastolic ?? '—'}`,
                  })
                : text({ id: 'Belum ada pengukuran minggu ini.', zh: '這週還沒有量測紀錄。', en: 'No readings yet this week.' })}
            </p>
          </section>
        )}

      {/* ── 最近變動（History）：只給一行連結，完整時間軸留在「軌跡」（D 期才會上線的名稱，目前先連回事件 tab）。 ── */}
      <button
        type="button"
        onClick={onOpenHistory}
        className="min-h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-left text-sm font-bold text-slate-700 shadow-sm active:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-700 focus-visible:ring-offset-2"
      >
        {text({ id: 'Lihat riwayat perubahan →', zh: '查看最近變動 →', en: 'View recent changes →' })}
      </button>
    </section>
  )
}
