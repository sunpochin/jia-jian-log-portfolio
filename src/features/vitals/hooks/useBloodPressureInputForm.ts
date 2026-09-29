/*
檔案用途：抽出 InputPage 原本超過 15 個 useState 與所有讀寫／兩次量測流程邏輯，讓頁面檔只剩下 JSX 編排。
所在層：src/features/vitals/hooks；血壓輸入表單專用的狀態容器 hook（AGENTS.md Rule A），不對外通用。
主要關聯：由 InputPage 呼叫；資料存取仍透過 lib/bloodPressureRecords、lib/bloodPressurePendingQueue、
  lib/telegramNotification 等既有資料層完成，讀取狀態則沿用 hooks/useLatestBpRecord（Rule C：讀寫狀態分離）。
*/
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import dayjs from 'dayjs'
import 'dayjs/locale/id'
import 'dayjs/locale/zh-tw'
import utc from 'dayjs/plugin/utc'
import timezone from 'dayjs/plugin/timezone'
import { alertTone } from '../../../lib/alertPresentation'
import { useBpEvaluator } from './useBpEvaluator'
import type { BpRecord } from '../../../types/database'
import type { Subject } from '../../../lib/auth'
import { getSession } from '../../../lib/session'
import { useI18n } from '../../../lib/i18n'
import { usePwaUpdateGuard } from '../../../lib/pwaUpdateGuard'
import { useLatestBpRecord } from '../../../hooks/useLatestBpRecord'
import { isDemoPatientId } from '../../../lib/demoData'
import { isDemoMode, saveDemoBpRecord } from '../../../lib/demoStorage'
import { pollDirectDeliveryStatus, sendTelegramNotification, type TelegramNotificationResult, readPersonalDeliveryState, type PersonalDeliveryState } from '../../../lib/telegramNotification'
import { insertBloodPressureRecord, type BloodPressureInsertPayload } from '../../../lib/bloodPressureRecords'
import {
  enqueuePendingBloodPressureRecord,
  flushPendingBloodPressureRecords,
  pendingBloodPressureRecordToView,
  readPendingBloodPressureRecords,
  type PendingBloodPressureRecord,
} from '../../../lib/bloodPressurePendingQueue'
import { isRetryableWriteError } from '../../../lib/dataErrors'
import { usePendingBloodPressureFlush } from './usePendingBloodPressureFlush'
import { getBloodPressureMeasurementSessionKey, SECOND_MEASUREMENT_DELAY_MS, type BloodPressureMeasurementSession } from '../../../lib/bloodPressureMeasurementSession'
import { isFirstRecordEventEligible, trackFirstRecordSaved } from '../../../lib/analytics'
import {
  TZ,
  bpAutoAdvance,
  BP_AUTO_ADVANCE_DELAY_MS,
  fetchRecentSummary,
  isFamilyAlertLevelReading,
  isValidBpInput,
  saveErrorMessage,
  type BpField,
  type SessionSummary,
} from '../pages/InputPage.utils'

dayjs.extend(utc)
dayjs.extend(timezone)
dayjs.locale('id')

// ── Snapshot of the 1st measurement (shown in the "rest" prompt) ──────────
interface FirstRecord { sys: number; dia: number; pul: number }

// 繁體中文註解：用固定來源鍵註冊 dirty 狀態，避免 hidden 的體溫頁 cleanup 清掉血壓頁保護。
const UNSAVED_INPUT_SOURCE = 'blood-pressure'

interface UseBloodPressureInputFormParams {
  subject: Subject
  patientId: string
  userEmail?: string
  measurementSession?: BloodPressureMeasurementSession | null
  onMeasurementSessionStart?: (session: BloodPressureMeasurementSession) => void
  onMeasurementSessionComplete?: () => void
}

/**
 * 血壓輸入頁的狀態容器 hook（Rule A）。
 *
 * 寫入狀態刻意不改用共用的 useSaveStatus（Rule B「或 feature-specific 變體」）：
 * 血壓離線補送流程需要額外的 'queued' 狀態（已存本機、尚未同步到 Supabase），
 * 這不是 useSaveStatus 的 'idle'|'saving'|'ok'|'err' 能表達的语意，硬套用反而會讓
 * 「已存但未同步」跟「儲存失敗」被迫共用同一種畫面文字。計時器清理與多語訊息轉譯
 * 仍遵循 Rule B 的精神（見下方 resetTimerRef 的 clearTimeout 與 saveErrorMessage）。
 *
 * 讀取狀態（今日最新讀值）已透過 hooks/useLatestBpRecord 獨立管理，本 hook 只回傳
 * 該 hook 的結果，不與這裡的送出狀態 status 混用，滿足 Rule C。
 */
export function useBloodPressureInputForm({
  subject,
  patientId,
  userEmail,
  measurementSession = null,
  onMeasurementSessionStart,
  onMeasurementSessionComplete,
}: UseBloodPressureInputFormParams) {
  const { locale, text } = useI18n()
  const { registerUnsavedInput } = usePwaUpdateGuard()
  // 這位病人的判讀標準；切換照護對象時整份 evaluator 會被 Provider 換掉，
  // 不會出現「用上一位的目標判讀這一位的輸入」。
  const evaluator = useBpEvaluator()
  // 繁體中文註解：登入者身分與量測對象要分開；量測對象直接使用 App 共用 state，才不會在其他 tab 已切換後本頁仍保留舊人。
  const activeSubject = subject

  // 三個短數字直接用手機鍵盤輸入；初始留白才能防止範例數字被誤存成量測值。
  const [systolic,      setSystolic]      = useState<number | ''>('')
  const [diastolic,     setDiastolic]     = useState<number | ''>('')
  const [pulse,         setPulse]         = useState<number | ''>('')
  const [status,        setStatus]        = useState<'idle' | 'saving' | 'ok' | 'queued' | 'err'>('idle')
  const [errMsg,        setErrMsg]        = useState('')
  // 通知失敗跟儲存失敗要分開顯示：血壓其實已經存進資料庫，只是家人沒收到 Telegram 提醒。
  const [notifyFailed,  setNotifyFailed]  = useState(false)
  // 通知服務正常，但這筆沒有任何家屬通知送出（病人沒訂閱共用群組、也沒排入個人化通知）；
  // 和 notifyFailed 分開，因為這是設定狀態而非故障，畫面用說明語氣而不是失敗警示。
  const [familyAlertSkipped, setFamilyAlertSkipped] = useState(false)
  // ADR-007 D9-b：共用群組那一則的送達狀態。Function 回 2xx 不代表送到了——
  //   in_progress：另一個呼叫正在送，結果未定，前端在門檻 M 內回看帳本直到終局；
  //   unconfirmed：結果不明（sending 逾時／delivery_unknown／resolve 失敗），家人可能收到也可能沒有；
  //   not_sent：確定沒送、也不會自動重試（直送路徑沒有重試者，不得對看護說「稍後重試」）。
  // 三者都必須讓看護看到，且文案要說「紀錄已存」，不能讓看護以為要重新輸入血壓。
  //   *_personal_queued：共用群組那一則沒送／不明，但個人化通知已排入 outbox（有自己的重試者）——文案只能說「群組那一則」，
  //   不能說「家人通知沒送出、不會重試」（PR #988 Codex P2）。
  //   *_personal_unknown：共用群組那一則沒送／不明，個人化通知沒有在路上、但有一則可能已送達（delivery_unknown，不會重送）——
  //   文案要保守說「個人通知無法確認是否送達」，不能講成「沒有個人通知」。
  //   personal_unknown：共用群組未訂閱（沒有群組那一則），個人那一則不明——沒有任何一則被確認送達，仍要請看護聯絡家人（PR #988 Codex P2）。
  const [familyDelivery, setFamilyDelivery] = useState<'idle' | 'in_progress' | 'unconfirmed' | 'not_sent' | 'unconfirmed_personal_queued' | 'not_sent_personal_queued' | 'unconfirmed_personal_unknown' | 'not_sent_personal_unknown' | 'personal_unknown' | 'unconfirmed_personal_delivered' | 'not_sent_personal_delivered'>('idle')
  // 提示寫的是「這筆紀錄」沒通知家人，所以只有最新一個通知請求的結果可以改它。每次送出通知、
  // 每次清除提示都領一個新序號；較慢的舊請求回來時序號已過期就丟掉，避免把新一筆已送達／
  // 已排入的讀數誤標成「沒通知」（Codex review on PR #927）。
  const familyAlertRequestSeqRef = useRef(0)
  const [everSubmitted, setEverSubmitted] = useState(false)   // gate for alert banner
  const [now,           setNow]           = useState(() => dayjs().tz(TZ))
  const [isDirty,       setIsDirty]       = useState(false)
  const [lastSubmittedRecord, setLastSubmittedRecord] = useState<FirstRecord | null>(null)
  const [dailyRecordsVersion, setDailyRecordsVersion] = useState(0)
  const [optimisticRecord, setOptimisticRecord] = useState<BpRecord | null>(null)
  const [pendingRecords, setPendingRecords] = useState<PendingBloodPressureRecord[]>([])
  const [pendingSyncError, setPendingSyncError] = useState(false)
  const submittingRef = useRef(false)
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const autoAdvanceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    // PWA 更新會重載頁面；把本頁 dirty 狀態交給外層，才能在更新前真正保住尚未送出的量測值。
    registerUnsavedInput(UNSAVED_INPUT_SOURCE, isDirty)
    return () => registerUnsavedInput(UNSAVED_INPUT_SOURCE, false)
  }, [isDirty, registerUnsavedInput])

  const resetInputs = () => {
    setSystolic('')
    setDiastolic('')
    setPulse('')
    setIsDirty(false)
  }

  const resetMeasurementFlow = () => {
    if (resetTimerRef.current) clearTimeout(resetTimerRef.current)
    resetTimerRef.current = null
    setSessionCount(0)
    setFirstRecord(null)
    setSummary(null)
    setEverSubmitted(false)
    setLastSubmittedRecord(null)
    setStatus('idle')
    setErrMsg('')
    setNotifyFailed(false)
    setFamilyAlertSkipped(false)
    setFamilyDelivery('idle')
    familyAlertRequestSeqRef.current += 1
    resetInputs()
  }

  // 兩條送出路徑（線上、離線補送）共用同一套結果處理：先比對序號與病人，再依 sharedDelivery 更新畫面。
  // in_progress 時回看帳本：持續重查到終局或 M 到期；回看期間畫面顯示「送出中」，不是成功。
  const applyFamilyDeliveryResult = useCallback((
    result: TelegramNotificationResult,
    request: { recordId: string; patientId: string },
    isCurrent: () => boolean,
  ) => {
    if (!isCurrent()) return
    // 個人化通知已排入時，「沒送」「不明」只指共用群組那一則。
    // 有任何一則個人通知不明就以不明為準（PR #988 Codex P2）：混合結局（一位在路上、一位不明）不能承諾「會自動送出」。
    // 優先序：不明 > 在路上 > 已送達 > 沒有個人通知。已送達（drain 已 sent）不能說「已排入、會自動送出」（PR #988 Codex P2）。
    const notSentFor = (personal: PersonalDeliveryState) => (personal.personalUnknown ? 'not_sent_personal_unknown' : personal.personalQueued ? 'not_sent_personal_queued' : personal.personalDelivered ? 'not_sent_personal_delivered' : 'not_sent')
    const unconfirmedFor = (personal: PersonalDeliveryState) => (personal.personalUnknown ? 'unconfirmed_personal_unknown' : personal.personalQueued ? 'unconfirmed_personal_queued' : personal.personalDelivered ? 'unconfirmed_personal_delivered' : 'unconfirmed')
    if (result.sharedDelivery === 'in_progress') {
      setFamilyDelivery('in_progress')
      // 期限用伺服器算好的剩餘時長（PR #988 Codex P2），只跟自己的時鐘比；沒帶就退回完整的 M。
      void pollDirectDeliveryStatus(request, result.sharedRemainingMs !== null ? { deadlineMs: result.sharedRemainingMs } : {}).then(async outcome => {
        if (!isCurrent()) return
        if (outcome === 'delivered') {
          setFamilyDelivery('idle')
          return
        }
        // 回看可能長達 M，回看前的個人快照可能已被 drain 改掉（PR #988 Codex P2）：用最終共用結果重新讀一次個人狀態；
        // 讀不到就當「個人那一則不明」——不能拿舊快照承諾「會自動送出」。
        const personal = await readPersonalDeliveryState(request).catch((): PersonalDeliveryState => ({ personalQueued: false, personalUnknown: true, personalDelivered: false }))
        if (!isCurrent()) return
        setFamilyDelivery(outcome === 'failed' ? notSentFor(personal) : unconfirmedFor(personal))
      })
      return
    }
    if (result.sharedDelivery === 'unknown') setFamilyDelivery(unconfirmedFor(result))
    else if (result.sharedDelivery === 'failed') setFamilyDelivery(notSentFor(result))
    // 未訂閱共用群組、個人那一則又不明：沒有任何一則被確認送達，不能什麼都不說（PR #988 Codex P2）。
    else if (result.sharedDelivery === 'not_subscribed' && result.personalUnknown) setFamilyDelivery('personal_unknown')
  }, [])

  useEffect(() => {
    return () => {
      if (resetTimerRef.current) clearTimeout(resetTimerRef.current)
      if (autoAdvanceTimerRef.current) clearTimeout(autoAdvanceTimerRef.current)
    }
  }, [])

  // 兩位數延遲跳轉期間顯示提示，讓使用者知道系統正準備自動跳走，不用急著手動點下一格。
  const [pendingAdvanceField, setPendingAdvanceField] = useState<BpField | null>(null)

  const clearAutoAdvanceTimer = useCallback(() => {
    if (autoAdvanceTimerRef.current) {
      clearTimeout(autoAdvanceTimerRef.current)
      autoAdvanceTimerRef.current = null
    }
    setPendingAdvanceField(null)
  }, [])

  // 三個輸入格共用同一條自動跳欄規則，避免外觀相同的框行為不同。
  // 每次輸入都先取消上一個待跳轉，否則使用者補打第三位數時會被前一次的延遲跳走。
  const handleAutoAdvance = useCallback((field: BpField, value: number | '', focusNext: () => void) => {
    clearAutoAdvanceTimer()
    const decision = bpAutoAdvance(field, value)
    if (decision === 'immediate') {
      focusNext()
    } else if (decision === 'delayed') {
      setPendingAdvanceField(field)
      autoAdvanceTimerRef.current = setTimeout(() => {
        autoAdvanceTimerRef.current = null
        setPendingAdvanceField(null)
        focusNext()
      }, BP_AUTO_ADVANCE_DELAY_MS)
    }
  }, [clearAutoAdvanceTimer])

  // 三個欄位共用同一套「標記 dirty + 寫入數值 + 判斷是否自動跳欄」流程；
  // 包成語意操作函數讓 JSX 端只需傳入 value 與 focusNext，不必碰內部 setState。
  const handleSystolicChange = useCallback((value: number | '', focusNext: () => void) => {
    setIsDirty(true)
    setSystolic(value)
    handleAutoAdvance('systolic', value, focusNext)
  }, [handleAutoAdvance])

  const handleDiastolicChange = useCallback((value: number | '', focusNext: () => void) => {
    setIsDirty(true)
    setDiastolic(value)
    handleAutoAdvance('diastolic', value, focusNext)
  }, [handleAutoAdvance])

  const handlePulseChange = useCallback((value: number | '', focusNext: () => void) => {
    setIsDirty(true)
    setPulse(value)
    handleAutoAdvance('pulse', value, focusNext)
  }, [handleAutoAdvance])

  // Track how many times this subject was submitted in the current session
  const [sessionCount,  setSessionCount]  = useState(measurementSession ? 1 : 0)
  const [firstRecord,   setFirstRecord]   = useState<FirstRecord | null>(measurementSession ? {
    sys: measurementSession.firstRecord.systolic,
    dia: measurementSession.firstRecord.diastolic,
    pul: measurementSession.firstRecord.pulse ?? 0,
  } : null)

  // 3-day summary loaded after the 2nd measurement
  const [summary, setSummary] = useState<SessionSummary[] | null>(null)
  // 每秒更新是為了讓量測者能精準看見兩次量測之間的一分鐘休息時間。
  useEffect(() => {
    const t = setInterval(() => setNow(dayjs().tz(TZ)), 1000)
    return () => clearInterval(t)
  }, [])

  const hour    = now.hour()
  const session = getSession(hour)
  const hasValues = isValidBpInput(systolic, diastolic, pulse)
  const canSubmit = isDirty && hasValues && status !== 'saving'
  // 輸入當下還沒有 measured_at（紀錄尚未存進資料庫），所以即時回饋用**現在**生效的標準——
  // 這也正是照護者此刻被要求達到的目標。存檔後清單重新渲染時會改用該筆的 measured_at 解析，
  // 兩者在「現在量、現在存」的常見情形下結果相同。
  const liveRule = hasValues ? evaluator.evaluateNow(systolic as number, diastolic as number, pulse as number) : null
  const tone = liveRule ? alertTone(liveRule) : 'normal'
  // 輸入頁與報告共用同一份顯示判定，避免心跳警示在兩個頁面出現不同文字。
  const displayedRule = lastSubmittedRecord
    ? evaluator.evaluateNow(lastSubmittedRecord.sys, lastSubmittedRecord.dia, lastSubmittedRecord.pul)
    : null
  const submittedTone = displayedRule ? alertTone(displayedRule) : 'normal'
  // 切換對象後，晚回來的摘要不能覆蓋新對象的畫面；用 ref 保留目前真實選擇。
  const activeSubjectRef = useRef(activeSubject)
  useEffect(() => {
    activeSubjectRef.current = activeSubject
  }, [activeSubject])
  // 離線佇列補送是非同步流程，補送完成時使用者可能已切到別的病人；用 ref 避免遲到的失敗汙染新病人的畫面。
  const patientIdRef = useRef(patientId)
  useEffect(() => {
    patientIdRef.current = patientId
  }, [patientId])
  // 離線補送要用同一位病人的判讀標準決定是否提示「家人沒收到」；走 ref 而非放進 useCallback 依賴，
  // 避免 evaluator 物件每次 render 換新時連帶重建 performPendingSync、觸發不必要的補送排程。
  const evaluatorRef = useRef(evaluator)
  useEffect(() => {
    evaluatorRef.current = evaluator
  }, [evaluator])
  const latest = useLatestBpRecord(patientId)
  const firstRecordEventEligible = isFirstRecordEventEligible({
    hasExistingRecord: latest.record !== null,
    historyLoading: latest.loading,
    historyError: latest.error !== null,
  })
  const refetchLatest = latest.refetch
  const normalizedUserEmail = userEmail?.trim().toLowerCase() ?? ''
  const pendingViewRecords = useMemo(() => pendingRecords.map(pendingBloodPressureRecordToView), [pendingRecords])

  // 線上與離線補送都只傳固定 UUID；Edge Function 會以登入者 session 重新讀取資料並套用 RLS，
  // 避免不同帳號／不同 build 因舊版通知設定缺漏而走出不同結果。
  const sendBpTelegramNotification = useCallback(async (recordId: string, recordPatientId: string) => {
    return sendTelegramNotification({ recordId, patientId: recordPatientId })
  }, [])

  const refreshPendingRecords = useCallback(() => {
    if (!normalizedUserEmail || isDemoMode()) {
      setPendingRecords([])
      return
    }
    setPendingRecords(readPendingBloodPressureRecords(patientId, normalizedUserEmail))
  }, [normalizedUserEmail, patientId])

  // 實際同步一輪；回傳「佇列是否已清空」給觸發器 hook 決定要不要排程退避重試（見下方 usePendingBloodPressureFlush）。
  // 連線恢復、分頁回前景、原生殼回前景等「何時該呼叫這個函式」的判斷完全交給觸發器 hook，
  // 這裡只負責「怎麼同步一筆」，避免跨 Telegram 通知／埋點／今日清單版本的業務邏輯被硬拆到別的 hook。
  const performPendingSync = useCallback(async (): Promise<boolean> => {
    refreshPendingRecords()
    if (!normalizedUserEmail || isDemoMode()) return true
    // navigator.onLine 是 UX 提示，不是安全邊界；真正的寫入仍由 Supabase 回應確認。
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return false

    setPendingSyncError(false)
    try {
      const result = await flushPendingBloodPressureRecords({
        patientId,
        recordedBy: normalizedUserEmail,
        save: async record => {
          const outcome = await insertBloodPressureRecord(record)
          // 佇列補送只有在遠端 INSERT 確認後才算啟用，不能把尚未同步的本機草稿算進漏斗。
          if (firstRecordEventEligible) {
            trackFirstRecordSaved({ locale, record_type: 'blood_pressure' })
          }
          // 離線補送成功時也要通知家人；用 record.notified 而非 outcome 判斷是否要送，
          // 因為 'already-existed' 可能來自「這筆本來就是這次才真正寫入，只是先前伺服器
          // 回應遺失」──那種情況一樣從未通知過，只看 outcome 會讓這類紀錄永遠沒通知。
          if (!record.notified) {
            // 標記已嘗試通知要先落地：就算等一下 flush 把這筆從佇列移除時 localStorage
            // 寫入失敗而殘留，下一次重試也能靠這個欄位避免對家人重複發送同一筆通知。
            enqueuePendingBloodPressureRecord({ ...record, notified: true })
            // 不 await，避免 Telegram 延遲拖慢佇列處理下一筆。
            // 用量測當下（measured_at）生效的標準判讀：補送可能晚了好幾小時，期間病人標準可能已換。
            const alertLevelReading = isFamilyAlertLevelReading(
              evaluatorRef.current.evaluateAt(record.systolic, record.diastolic, record.pulse, record.measured_at),
            )
            const familyAlertRequestSeq = ++familyAlertRequestSeqRef.current
            void sendBpTelegramNotification(record.id, record.patient_id).then(result => {
              // 同上方失敗提示的病人比對：切換病人後才回來的結果不能顯示在新病人的畫面上。
              if (result.familyAlertSkipped && alertLevelReading && familyAlertRequestSeqRef.current === familyAlertRequestSeq && patientIdRef.current === patientId) setFamilyAlertSkipped(true)
              applyFamilyDeliveryResult(result, { recordId: record.id, patientId: record.patient_id }, () => familyAlertRequestSeqRef.current === familyAlertRequestSeq && patientIdRef.current === patientId)
            }).catch(err => {
              console.error('[telegram notification function error]', err)
              // 只在使用者還停留在同一個病人時才顯示警示；切換病人後才回來的遲到失敗，不該汙染新病人的畫面。
              if (patientIdRef.current === patientId) setNotifyFailed(true)
            })
          }
          return outcome
        },
      })
      setPendingRecords(result.remaining)
      setPendingSyncError(result.blocked && result.remaining.length > 0)
      if (result.synced.length > 0) {
        // queue 成功後讓今日清單與最新讀值重新向資料庫確認，移除本機 pending 標記。
        setDailyRecordsVersion(version => version + 1)
        void refetchLatest()
      }
      return result.remaining.length === 0
    } catch (error) {
      // queue adapter 會保留原始資料；這裡只留下可診斷的 console 訊息與雙語同步提示。
      console.error('[blood pressure pending sync error]', error)
      setPendingSyncError(true)
      return false
    }
  }, [applyFamilyDeliveryResult, firstRecordEventEligible, locale, normalizedUserEmail, patientId, refreshPendingRecords, refetchLatest, sendBpTelegramNotification])

  // demo 模式或尚未取得登入者 email 時完全不需要離線佇列；避免殘留上一位病人的待同步清單。
  const pendingFlushEnabled = Boolean(normalizedUserEmail) && !isDemoMode()
  useEffect(() => {
    if (pendingFlushEnabled) return
    setPendingRecords([])
  }, [pendingFlushEnabled])

  const {
    syncing: pendingSyncing,
    lastAttemptAt: pendingLastAttemptAt,
    retryNow: syncPendingRecords,
  } = usePendingBloodPressureFlush({
    enabled: pendingFlushEnabled,
    hasPending: pendingRecords.length > 0,
    sync: performPendingSync,
    // 切換病人時要用新病人的佇列重新探測一次，不能沿用上一位病人殘留的退避排程與清單。
    resetKey: patientId,
  })

  // 包含目前病人、照護日與時段，確保重新載入或切換量測對象時不會沿用舊輪次。
  // 繁體中文註解：凌晨 00:00–03:59 仍屬前一個照護日，兩次量測流程不能在午夜被拆開。
  const currentSessionKey = getBloodPressureMeasurementSessionKey(patientId, now.valueOf())
  const sessionKeyRef = useRef(currentSessionKey)
  useEffect(() => {
    if (sessionKeyRef.current === currentSessionKey) return
    sessionKeyRef.current = currentSessionKey
    resetMeasurementFlow()
    // 繁體中文註解：session/對象切換屬於流程歸零，放在 effect 避免 render 階段觸發 setState。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentSessionKey])

  const submit = async () => {
    if (submittingRef.current) return
    if (!isDirty) {
      setErrMsg(text({ id: 'Silakan ukur dulu', zh: '請先實際調整數值' ,en: 'Please adjust the value first' }))
      setStatus('err')
      return
    }
    if (!isValidBpInput(systolic, diastolic, pulse)) {
      setErrMsg(text({ id: 'Angka tidak masuk akal, periksa lagi.', zh: '數值不合理，請重新確認' ,en: 'Value is not reasonable, please reconfirm' }))
      setStatus('err')
      return
    }

    submittingRef.current = true
    setStatus('saving')
    setErrMsg('')
    setNotifyFailed(false)
    setFamilyAlertSkipped(false)
    setFamilyDelivery('idle')
    familyAlertRequestSeqRef.current += 1
    if (resetTimerRef.current) clearTimeout(resetTimerRef.current)

    const submittedAt = dayjs().tz(TZ)
    const measured_at = submittedAt.toISOString()
    const submittedSubject = activeSubject
    const sys = systolic as number
    const dia = diastolic as number
    const pul = pulse as number
    const recordId = globalThis.crypto.randomUUID()
    const recordedBy = normalizedUserEmail || null
    const payload: BloodPressureInsertPayload = {
      id: recordId,
      systolic: sys,
      diastolic: dia,
      pulse: pul,
      measured_at,
      source: 'manual_web',
      patient_id: patientId,
      recorded_by: recordedBy,
    }
    let queuedLocally = false
    let savedRecord: BpRecord

    try {
      if (isDemoMode() && isDemoPatientId(patientId)) {
        // 匿名 Demo 不碰公開資料庫；寫入本機 overlay 才能讓面試者看到輸入真的改變趨勢與明細。
        savedRecord = saveDemoBpRecord({ systolic: sys, diastolic: dia, pulse: pul, measured_at, patient_id: patientId })
      } else {
        // 不等待第二次查詢才更新 UI；INSERT 成功本身就是資料庫已接受這筆紀錄的確認。
        await insertBloodPressureRecord(payload)
        // INSERT 不要求回傳 row，避免把資料庫回傳權限當成寫入成功的必要條件；這個快照只用於成功後的即時回饋。
        savedRecord = {
          id: recordId,
          patient_id: patientId,
          systolic: sys,
          diastolic: dia,
          pulse: pul,
          measured_at,
          created_at: measured_at,
          recorded_by: recordedBy,
          source: 'manual_web',
        }
      }
    } catch (error) {
      if (!isDemoMode() && recordedBy && isRetryableWriteError(error)) {
        const pendingRecord: PendingBloodPressureRecord = { ...payload, recorded_by: recordedBy, queued_at: new Date().toISOString() }
        if (enqueuePendingBloodPressureRecord(pendingRecord)) {
          // 連線失敗時先保存在本機；畫面會標成同步中，不冒充已寫入遠端資料庫。
          queuedLocally = true
          savedRecord = pendingBloodPressureRecordToView(pendingRecord)
          setPendingRecords(readPendingBloodPressureRecords(patientId, recordedBy))
          setPendingSyncError(true)
        } else {
          console.error('[blood pressure pending queue unavailable]')
          setErrMsg(saveErrorMessage(error, locale))
          setStatus('err')
          submittingRef.current = false
          return
        }
      } else {
        // 繁體中文註解：使用者只需要知道儲存失敗；技術細節留在 console，避免把資料庫訊息直接露出。
        console.error('[supabase save error]', error)
        setErrMsg(saveErrorMessage(error, locale))
        setStatus('err')
        submittingRef.current = false
        return
      }
    }

    if (!isDemoMode() && !queuedLocally && firstRecordEventEligible) {
      // 只在正式資料庫接受紀錄後埋點；不把血壓數值、病人或操作者資訊交給分析服務。
      trackFirstRecordSaved({ locale, record_type: 'blood_pressure' })
    }

    const newCount = sessionCount + 1
    setSessionCount(newCount)
    setLastSubmittedRecord({ sys, dia, pul })

    if (newCount === 1) {
      setFirstRecord({ sys, dia, pul })
      // 第一筆成功寫入後才開始倒數，避免網路失敗時讓媽媽誤以為已可進行第二次量測。
      const deadline = Date.now() + SECOND_MEASUREMENT_DELAY_MS
      onMeasurementSessionStart?.({ patientId, sessionKey: currentSessionKey, deadline, firstRecord: { systolic: sys, diastolic: dia, pulse: pul } })
    }

    if (newCount === 2) {
      onMeasurementSessionComplete?.()
      if (!queuedLocally && pendingRecords.length === 0) {
        fetchRecentSummary(patientId)
          .then(result => {
            if (activeSubjectRef.current === submittedSubject) {
              setSummary(result)
            }
          })
          .catch(error => console.error('[summary fetch error]', error))
      } else {
        // 不能把尚未同步到資料庫的本機紀錄混進遠端摘要，避免顯示不完整的趨勢。
        setSummary(null)
      }
    }

    setEverSubmitted(true)
    setIsDirty(false)
    setStatus(queuedLocally ? 'queued' : 'ok')
    setOptimisticRecord(savedRecord)
    latest.setOptimisticRecord(savedRecord)
    // 繁體中文註解：先完成寫入再收鍵盤，確保按下儲存後 compact mode 能隨 viewport 恢復正常畫面。
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
    setDailyRecordsVersion(version => version + 1)

    // 透過 Supabase Edge Function 發送 Telegram 通知；只傳紀錄／病人 UUID，讓 server 重新套用 RLS。
    // 使用非同步呼叫以防通知服務異常阻礙血壓主寫入流程；所有病人 UUID 都共用同一條通知管線。
    if (!isDemoMode() && !queuedLocally) {
      // 送出前就決定這筆是否屬於警示級，不在 .then 裡用當下的 evaluator：回應回來前標準可能已重新載入。
      const alertLevelReading = isFamilyAlertLevelReading(evaluator.evaluateNow(sys, dia, pul))
      const familyAlertRequestSeq = ++familyAlertRequestSeqRef.current
      void sendBpTelegramNotification(recordId, patientId).then(result => {
        // 沒有任何家屬通知送出、而且是需要現在行動的讀數時才提示（Fail loudly ＋ 警報分級）。
        if (result.familyAlertSkipped && alertLevelReading && familyAlertRequestSeqRef.current === familyAlertRequestSeq && activeSubjectRef.current === submittedSubject) setFamilyAlertSkipped(true)
        applyFamilyDeliveryResult(result, { recordId, patientId }, () => familyAlertRequestSeqRef.current === familyAlertRequestSeq && activeSubjectRef.current === submittedSubject)
      }).catch(err => {
        // 為什麼只記錄而不回滾：血壓已成功寫入，通知失敗不能讓看護重送而造成重複紀錄。
        console.error('[telegram notification function error]', err)
        // 只在使用者還停留在同一個病人時才顯示警示；切換病人後才回來的遲到失敗，不該汙染新病人的畫面。
        if (activeSubjectRef.current === submittedSubject) setNotifyFailed(true)
      })
    }

    submittingRef.current = false
    resetTimerRef.current = setTimeout(() => {
      resetInputs()
      setStatus('idle')
    }, 2000)
  }

  const showRestPrompt = sessionCount === 1 && firstRecord !== null
  const showDoneMsg    = sessionCount >= 2

  return {
    // 輸入欄位與變更處理
    systolic,
    diastolic,
    pulse,
    handleSystolicChange,
    handleDiastolicChange,
    handlePulseChange,
    pendingAdvanceField,
    clearAutoAdvanceTimer,

    // 送出狀態（Rule C：與下方 latest 讀取狀態分開管理）
    status,
    errMsg,
    notifyFailed,
    familyAlertSkipped,
    familyDelivery,
    everSubmitted,
    canSubmit,
    tone,
    submit,

    // 兩次量測流程
    session,
    showRestPrompt,
    showDoneMsg,
    summary,
    displayedRule,
    submittedTone,
    resetMeasurementFlow,

    // 離線佇列
    pendingRecords,
    pendingViewRecords,
    pendingSyncing,
    pendingSyncError,
    pendingLastAttemptAt,
    syncPendingRecords,

    // 今日清單／樂觀更新
    dailyRecordsVersion,
    optimisticRecord,

    // 最新讀值：直接透傳 useLatestBpRecord 的讀取狀態，不與 status 混用
    latest,
  }
}
