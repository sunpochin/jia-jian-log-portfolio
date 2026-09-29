/*
檔案用途：提供血壓輸入 tab，處理量測值、兩次量測流程與安全儲存。
所在層：src/features/vitals/pages；此頁負責血壓功能的輸入流程與頁面編排，不是共用元件層。
主要關聯：使用 TabHeader 呈現共同頁首，並透過 SubjectSwitcher、LatestVitals 與 Supabase 服務目前病人的紀錄；
  狀態與讀寫邏輯抽到 features/vitals/hooks/useBloodPressureInputForm（AGENTS.md Rule A／B／C），本檔只負責 JSX 編排。
*/
import { useRef, lazy } from 'react'
import { PickerCard } from '../../../components/ui/PickerCard'
import { SubjectSwitcher } from '../../../components/ui/SubjectSwitcher'
import { TabHeader } from '../../../components/ui/TabHeader'
import { LatestVitals } from '../components/LatestVitals'
import { VitalReading } from '../components/VitalReading'
import { DailyBloodPressureRecords } from '../components/DailyBloodPressureRecords'
import { ModuleTrendSection } from '../../../components/daily-care/ModuleTrendSection'
import { ALERT_BUTTON_CLASS, ALERT_ICON, alertTone } from '../../../lib/alertPresentation'
import { useBpEvaluator } from '../hooks/useBpEvaluator'
import { type PatientIdentity, type Subject } from '../../../lib/auth'
import { useI18n } from '../../../lib/i18n'
import { useKeyboardViewport } from '../../../hooks/useKeyboardViewport'
import { type BloodPressureMeasurementSession } from '../../../lib/bloodPressureMeasurementSession'
import { useBloodPressureInputForm } from '../hooks/useBloodPressureInputForm'
import {
  L,
  alertCls,
  formatPendingAttemptTime,
  sessionIcon,
} from './InputPage.utils'

// 圖表套件只在照護者實際展開「近期趨勢」時才下載；血壓是每日照護的第一個區段，
// 若直接 import 會讓 recharts 進入開 App 的初始載入路徑，拖慢每天最常走的量測動線。
// 這裡同時吸收了原本獨立「報告」分頁的統計卡片、逐筆報告與 CSV／GPT 匯出，
// 因為那些內容本來就是血壓資料的延伸，不需要另外佔一個底部分頁才看得到。
const BloodPressureReportPanel = lazy(() => import('../components/BloodPressureReportPanel').then(m => ({ default: m.BloodPressureReportPanel })))

export function InputPage({ subject, patientId, patientName, availablePatients, userEmail, onSubjectSelect, embedded = false, measurementSession = null, onMeasurementSessionStart, onMeasurementSessionComplete }: {
  subject: Subject
  patientId: string
  patientName?: string
  availablePatients: PatientIdentity[]
  userEmail?: string
  onSubjectSelect: (subject: Subject) => void
  embedded?: boolean
  measurementSession?: BloodPressureMeasurementSession | null
  onMeasurementSessionStart?: (session: BloodPressureMeasurementSession) => void
  onMeasurementSessionComplete?: () => void
}) {
  const { text } = useI18n()
  const evaluator = useBpEvaluator()
  const keyboardOpen = useKeyboardViewport()
  // 繁體中文註解：建立輸入欄位 Ref，實現輸入完高壓自動跳低壓、低壓自動跳心跳、心跳自動聚焦儲存按鈕之順跳流程。
  const sysRef = useRef<HTMLInputElement>(null)
  const diaRef = useRef<HTMLInputElement>(null)
  const pulRef = useRef<HTMLInputElement>(null)
  const submitBtnRef = useRef<HTMLButtonElement>(null)

  const {
    systolic,
    diastolic,
    pulse,
    handleSystolicChange,
    handleDiastolicChange,
    handlePulseChange,
    pendingAdvanceField,
    clearAutoAdvanceTimer,
    status,
    errMsg,
    notifyFailed,
    familyAlertSkipped,
    familyDelivery,
    everSubmitted,
    canSubmit,
    tone,
    submit,
    session,
    showRestPrompt,
    showDoneMsg,
    summary,
    displayedRule,
    submittedTone,
    resetMeasurementFlow,
    pendingRecords,
    pendingViewRecords,
    pendingSyncing,
    pendingSyncError,
    pendingLastAttemptAt,
    syncPendingRecords,
    dailyRecordsVersion,
    optimisticRecord,
    latest,
  } = useBloodPressureInputForm({ subject, patientId, userEmail, measurementSession, onMeasurementSessionStart, onMeasurementSessionComplete })

  // 報告區塊的寵物提示需要對象類型；從已授權清單解析，避免額外的 App 層 prop 傳遞。
  const activeCareRecipientType = availablePatients.find(patient => patient.patientId === patientId)?.careRecipientType
  // 病人名稱只能來自已授權的病人資料；不能再用舊角色或登入帳號猜測，以免報告標示到錯的人。
  const activeSubjectName = patientName || text({ id: 'Orang yang diukur', zh: '量測對象' ,en: 'Person measured' })

  // 五個主 tab 用同一個淡灰底，讓白色輸入卡與其他頁面的卡片有一致的閱讀層次。
  return (
    <div className="flex h-full flex-col bg-slate-50">

      {/* ── Header: title + logged-in subject badge + clock ── */}
      <header className={`${keyboardOpen ? 'hidden' : 'shrink-0 px-5'} ${embedded ? 'pt-2 pb-2' : 'pt-5 pb-2'}`}>
        {!embedded && <>
          <TabHeader title="input" />

          {/* 繁體中文註解：獨立頁才自行提供切換；嵌入每日照護時交給共同外層，避免同一人被選兩次。 */}
          <div className="mt-3">
            <SubjectSwitcher
              patientId={subject}
              patients={availablePatients}
              onSelect={nextSubject => {
                onSubjectSelect(nextSubject)
                // 切換病人代表換了一輪照護流程；清掉舊人的倒數，避免誤量到不同對象。
                onMeasurementSessionComplete?.()
                resetMeasurementFlow()
              }}
            />
          </div>
        </>}

        {!keyboardOpen && <LatestVitals
          className={`${embedded ? '' : 'mt-3 '}text-base`}
          valueClassName="text-3xl tracking-tight text-gray-950"
          unitClassName="text-base font-semibold text-gray-500"
          showTimestamp={false}
          showInterval={false}
          record={latest.record}
          loading={latest.loading}
          error={Boolean(latest.error)}
        />}

      </header>

      {/* ── Pickers ── */}
      {/* 繁體中文註解：照護者的自然順序是先填數值、再儲存；不把完成動作放在尚未輸入的內容前面，避免誤觸與猶豫。 */}
      <div className="shrink-0 px-5 pt-3 flex flex-col gap-3">
        <div className="grid grid-cols-3 gap-2">
          <PickerCard
            ref={sysRef}
            inputId="bp-systolic"
            idLabel={text(L.systolic)} unit="mmHg"
            selected={systolic}
            pendingAdvance={pendingAdvanceField === 'systolic'}
            onChange={(value) => handleSystolicChange(value, () => diaRef.current?.focus())}
            onNextFocus={() => diaRef.current?.focus()}
            enterKeyHint="next"
            onInputFocus={input => {
              // 使用者手動聚焦（點擊或 Tab）任何欄位，代表前一格的延遲自動跳轉已經沒有意義，避免兩次 focus 打架。
              clearAutoAdvanceTimer()
              setTimeout(() => input.scrollIntoView({ behavior: 'smooth', block: 'center' }), 250)
            }}
            accent="text-[#C23B3B] dark:text-[#F87171]"
          />
          <PickerCard
            ref={diaRef}
            inputId="bp-diastolic"
            idLabel={text(L.diastolic)} unit="mmHg"
            selected={diastolic}
            pendingAdvance={pendingAdvanceField === 'diastolic'}
            onChange={(value) => handleDiastolicChange(value, () => pulRef.current?.focus())}
            onNextFocus={() => pulRef.current?.focus()}
            enterKeyHint="next"
            onInputFocus={input => {
              clearAutoAdvanceTimer()
              setTimeout(() => input.scrollIntoView({ behavior: 'smooth', block: 'center' }), 250)
            }}
            accent="text-[#2563EB] dark:text-[#60A5FA]"
          />
          <PickerCard
            ref={pulRef}
            inputId="bp-pulse"
            idLabel={text(L.pulse)} unit="bpm"
            selected={pulse}
            pendingAdvance={pendingAdvanceField === 'pulse'}
            onChange={(value) => handlePulseChange(value, () => submitBtnRef.current?.focus())}
            onNextFocus={() => submitBtnRef.current?.focus()}
            enterKeyHint="done"
            onInputFocus={input => {
              clearAutoAdvanceTimer()
              setTimeout(() => input.scrollIntoView({ behavior: 'smooth', block: 'center' }), 250)
            }}
            accent="text-[#7C3AED] dark:text-[#C084FC]"
          />
        </div>
        {/* 繁體中文註解：不完整數值友善提示 (如輸入 12 時即時提示是否為 120)，避免冷冰冰的報錯。 */}
        {typeof systolic === 'number' && systolic > 0 && systolic < 70 && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-2.5 text-xs font-semibold text-amber-800 text-center shadow-xs">
            {text({
              id: `Tekanan sistolik ${systolic} sepertinya tidak lengkap, pastikan apakah ${systolic}0`,
              zh: `收縮壓 ${systolic} 似乎不完整，請確認是否為 ${systolic}0` ,en: `Systolic pressure ${systolic} looks incomplete; check whether it should be ${systolic}0.`
            })}
          </div>
        )}
        <button
          ref={submitBtnRef}
          onClick={submit}
          disabled={!canSubmit}
          className={`min-h-14 w-full py-3 rounded-2xl text-white text-lg font-bold tracking-wide transition-all duration-150 disabled:opacity-60 focus:ring-4 focus:ring-emerald-400 ${
            canSubmit ? ALERT_BUTTON_CLASS[tone] : 'bg-gray-300'
          }`}
        >
          {status === 'saving' ? text(L.saving) : status === 'queued' ? text(L.queued) : status === 'ok' ? text(L.saved) : text(L.save)}
        </button>
        {/* 繁體中文註解：成功文字不能只依賴按鈕標籤變化；獨立 status 區域才能讓讀屏器在寫入完成時可靠通知使用者。 */}
        <p role="status" aria-live="polite" className="sr-only">{status === 'ok' ? text(L.saved) : status === 'queued' ? text(L.queued) : ''}</p>
        {!keyboardOpen && <DailyBloodPressureRecords patientId={patientId} refreshVersion={dailyRecordsVersion} pendingRecords={pendingViewRecords} optimisticRecord={optimisticRecord?.patient_id === patientId ? optimisticRecord : null} onChanged={() => latest.refetch()} />}
        {/* 量完血壓最自然的下一個動作就是跟前幾天比一下；趨勢留在同一頁，不必跳到另一個底部分頁。 */}
        {!keyboardOpen && <ModuleTrendSection moduleId="bloodPressure" titleId="blood-pressure-trend-title">
          {days => <BloodPressureReportPanel patientId={patientId} days={days} subjectLabel={activeSubjectName} careRecipientType={activeCareRecipientType} userEmail={userEmail} allowQuestionAdoption />}
        </ModuleTrendSection>}
      </div>

      {/* ── Bottom Status & Banners Area ── */}
      <div className="flex-1 flex flex-col justify-end px-5 pb-4 pt-3">
        {pendingRecords.length > 0 && (
          <div role="status" className="mb-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-center text-sm text-amber-900">
            <p className="font-semibold">{pendingSyncing ? text(L.pendingSyncing) : text(L.pending(pendingRecords.length))}</p>
            {/* 繁體中文註解：看護回到有訊號的地方時，用最後嘗試時間讓她判斷佇列是不是真的還在自動重試，不必猜測。 */}
            {!pendingSyncing && pendingLastAttemptAt !== null && (
              <p className="mt-1 text-xs text-amber-800">{text(L.pendingLastAttempt(formatPendingAttemptTime(pendingLastAttemptAt)))}</p>
            )}
            {pendingSyncError && <p className="mt-1 text-xs">{text(L.pendingSyncError)}</p>}
            <button type="button" disabled={pendingSyncing} onClick={() => void syncPendingRecords()} className="mt-2 min-h-10 rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-bold text-amber-900 disabled:opacity-50">{text(L.retryPending)}</button>
          </div>
        )}
        {/* Error message */}
        {status === 'err' && (
          // 繁體中文註解：這些錯誤是使用者提交後才產生的即時結果，需用 assertive alert 立即告知，但不把靜態健康說明當成 alert。
          <p role="alert" aria-live="assertive" className="mb-2 text-center text-sm font-semibold text-red-600">{errMsg}</p>
        )}
        {notifyFailed && (
          // 繁體中文註解：用琥珀色而非紅色，避免看護誤以為血壓沒存到；血壓其實已經寫入資料庫，只有 Telegram 通知沒送出。
          <p role="alert" aria-live="assertive" className="mb-2 text-center text-sm font-semibold text-amber-600">{text(L.notifyFailed)}</p>
        )}
        {familyAlertSkipped && !notifyFailed && (
          // 繁體中文註解：這不是故障（通知服務正常），而是這位照護對象沒有任何家屬通知管道；
          // 用 polite status 而非 assertive alert，但仍要明講家人不會自動收到，危險值請看護自己聯絡。
          <p role="status" aria-live="polite" className="mb-2 text-center text-sm font-semibold text-amber-700">{text(L.familyAlertSkipped)}</p>
        )}
        {familyDelivery === 'in_progress' && !notifyFailed && (
          // 繁體中文註解：另一個呼叫正在送、結果未定（ADR-007 D9-b in_progress）；不是成功，前端會回看帳本直到有結果。
          <p role="status" aria-live="polite" className="mb-2 text-center text-sm font-semibold text-amber-700">{text(L.familyAlertInProgress)}</p>
        )}
        {familyDelivery === 'unconfirmed' && !notifyFailed && (
          // 繁體中文註解：結果不明——家人可能收到也可能沒有；文案要先說「血壓已存」，再要看護直接確認。
          <p role="alert" aria-live="assertive" className="mb-2 text-center text-sm font-semibold text-amber-600">{text(L.familyAlertUnconfirmed)}</p>
        )}
        {familyDelivery === 'not_sent' && !notifyFailed && (
          // 繁體中文註解：確定沒送、也不會自動重試（直送路徑沒有重試者，D9-c）；不能寫「稍後重試」，看護會以為系統還在努力而不打電話。
          <p role="alert" aria-live="assertive" className="mb-2 text-center text-sm font-semibold text-amber-600">{text(L.familyAlertNotSent)}</p>
        )}
        {familyDelivery === 'unconfirmed_personal_queued' && !notifyFailed && (
          // 繁體中文註解：群組那一則不明，但個人化通知已排入 outbox 會自動送；文案只說群組那一則（PR #988 Codex P2）。
          <p role="alert" aria-live="assertive" className="mb-2 text-center text-sm font-semibold text-amber-600">{text(L.familyAlertSharedUnconfirmedPersonalQueued)}</p>
        )}
        {familyDelivery === 'not_sent_personal_queued' && !notifyFailed && (
          // 繁體中文註解：群組那一則確定沒送、不重試，但個人化通知已排入 outbox 會自動送；不能對整條家人通知路徑說「不會重試」。
          <p role="alert" aria-live="assertive" className="mb-2 text-center text-sm font-semibold text-amber-600">{text(L.familyAlertSharedNotSentPersonalQueued)}</p>
        )}
        {familyDelivery === 'unconfirmed_personal_unknown' && !notifyFailed && (
          // 繁體中文註解：群組那一則不明、個人那一則也不明（可能已送達、不會重送）：兩邊都只說「無法確認」（PR #988 Codex P2）。
          <p role="alert" aria-live="assertive" className="mb-2 text-center text-sm font-semibold text-amber-600">{text(L.familyAlertSharedUnconfirmedPersonalUnknown)}</p>
        )}
        {familyDelivery === 'personal_unknown' && !notifyFailed && (
          // 繁體中文註解：未訂閱共用群組、個人那一則不明：沒有任何一則被確認送達，仍要請看護直接聯絡家人（PR #988 Codex P2）。
          <p role="alert" aria-live="assertive" className="mb-2 text-center text-sm font-semibold text-amber-600">{text(L.familyAlertPersonalUnknown)}</p>
        )}
        {familyDelivery === 'unconfirmed_personal_delivered' && !notifyFailed && (
          // 繁體中文註解：群組那一則不明，但個人通知已送達（drain 已 sent）；不能說「已排入、會自動送出」（PR #988 Codex P2）。
          <p role="alert" aria-live="assertive" className="mb-2 text-center text-sm font-semibold text-amber-600">{text(L.familyAlertSharedUnconfirmedPersonalDelivered)}</p>
        )}
        {familyDelivery === 'not_sent_personal_delivered' && !notifyFailed && (
          // 繁體中文註解：群組那一則確定沒送、不重試，但個人通知已送達（drain 已 sent）。
          <p role="alert" aria-live="assertive" className="mb-2 text-center text-sm font-semibold text-amber-600">{text(L.familyAlertSharedNotSentPersonalDelivered)}</p>
        )}
        {familyDelivery === 'not_sent_personal_unknown' && !notifyFailed && (
          // 繁體中文註解：群組那一則確定沒送，個人那一則不明（可能已送達、不會重送）；不能講成「沒有個人通知」或「會自動送出」。
          <p role="alert" aria-live="assertive" className="mb-2 text-center text-sm font-semibold text-amber-600">{text(L.familyAlertSharedNotSentPersonalUnknown)}</p>
        )}
        {/* After 2nd measurement: session complete + 3-day summary */}
        {showDoneMsg && (
          <div className="w-full px-4 py-2 rounded-xl border bg-green-50 border-green-200 text-green-800 text-sm">
            <div className="font-bold text-center">{text({ id: L.done.id(L[session].id), zh: L.done.zh() ,en: L.done.en(L[session].en) })}</div>

            {/* 3-day summary — shown once loaded from Supabase */}
            {summary && summary.length > 0 && (
              <div className="mt-2 border-t border-green-200 pt-1.5 space-y-1">
                {summary.map((row, i) => {
                  // 三日摘要是各時段的平均，沒有單一 measured_at，所以用現在生效的標準判讀；
                  // 與統計卡的平均值同一個理由，兩處必須一致，否則同一組平均會出現兩種顏色。
                  const lv   = alertTone(evaluator.evaluateNow(row.avgSys, row.avgDia, row.avgPul))
                  const icon = sessionIcon[row.session]
                  return (
                    <div key={i} className="flex items-center justify-between text-xs text-green-900">
                      <span className="font-medium">{icon} {row.dateStr} {row.timeStr} {text(L[row.session])}</span>
                      <VitalReading systolic={row.avgSys} diastolic={row.avgDia} pulse={row.avgPul} className="text-green-950" unitClassName="text-green-700" />
                      <span>{ALERT_ICON[lv]}</span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* BP alert level — only after first save, hidden while session-flow messages show */}
        {everSubmitted && !showRestPrompt && !showDoneMsg && displayedRule && (
          <div className={`w-full p-4 rounded-2xl border text-sm transition-all duration-150 ${alertCls[submittedTone]}`}>
            {/* 狀態標題：中印雙語 */}
            <div className="text-center font-bold text-base mb-2.5 border-b pb-2 border-current/15">
              <span>{text(displayedRule.labels)}</span>
            </div>
            {/* 建議處置 / Tindakan */}
            {(displayedRule.recommendations.id || displayedRule.recommendations.zh) && (
              <div className="space-y-2 text-left">
                <div><span className="text-[10px] font-extrabold uppercase tracking-wider opacity-75 block">{text({ id: 'Tindakan:', zh: '建議動作：' ,en: 'Suggested action:' })}</span><span className="text-base font-bold block mt-0.5 leading-snug">{text(displayedRule.recommendations)}</span></div>
              </div>
            )}
          </div>
        )}
      </div>

    </div>
  )
}
