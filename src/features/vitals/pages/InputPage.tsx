/*
檔案用途：提供血壓輸入 tab，處理量測值、兩次量測流程與安全儲存。
所在層：src/features/vitals/pages；此頁負責血壓功能的輸入流程與頁面編排，不是共用元件層。
主要關聯：使用 TabHeader 呈現共同頁首，並透過 SubjectSwitcher、LatestVitals 與 Supabase 服務目前病人的紀錄。
*/
import { useState, useEffect, useRef, useCallback, useMemo, lazy } from 'react'
import dayjs from 'dayjs'
import 'dayjs/locale/id'
import 'dayjs/locale/zh-tw'
import utc from 'dayjs/plugin/utc'
import timezone from 'dayjs/plugin/timezone'
import { PickerCard } from '../../../components/ui/PickerCard'
import { SubjectSwitcher } from '../../../components/ui/SubjectSwitcher'
import { TabHeader } from '../../../components/ui/TabHeader'
import { LatestVitals } from '../components/LatestVitals'
import { VitalReading } from '../components/VitalReading'
import { DailyBloodPressureRecords } from '../components/DailyBloodPressureRecords'
import { ModuleTrendSection } from '../../../components/daily-care/ModuleTrendSection'
import { evaluateReading, getAlertLevel } from '../../../types/database'
import { type PatientIdentity, type Subject } from '../../../lib/auth'
import type { BpRecord } from '../../../types/database'
import { getSession } from '../../../lib/session'
import { useI18n } from '../../../lib/i18n'
import { usePwaUpdateGuard } from '../../../lib/pwaUpdateGuard'
import { useLatestBpRecord } from '../../../hooks/useLatestBpRecord'
import { useKeyboardViewport } from '../../../hooks/useKeyboardViewport'
import { isDemoPatientId } from '../../../lib/demoData'
import { isDemoMode, saveDemoBpRecord } from '../../../lib/demoStorage'
import { sendTelegramNotification } from '../../../lib/telegramNotification'
import { insertBloodPressureRecord, type BloodPressureInsertPayload } from '../../../lib/bloodPressureRecords'
import {
  enqueuePendingBloodPressureRecord,
  flushPendingBloodPressureRecords,
  pendingBloodPressureRecordToView,
  readPendingBloodPressureRecords,
  type PendingBloodPressureRecord,
} from '../../../lib/bloodPressurePendingQueue'
import { isRetryableWriteError } from '../../../lib/dataErrors'
import { getBloodPressureMeasurementSessionKey, SECOND_MEASUREMENT_DELAY_MS, type BloodPressureMeasurementSession } from '../../../lib/bloodPressureMeasurementSession'
import { notifyMeasurementSaved } from '../../../lib/nativeNotifications'
import { isFirstRecordEventEligible, trackFirstRecordSaved } from '../../../lib/analytics'
import {
  TZ,
  L,
  alertCls,
  btnCls,
  sessionIcon,
  statusIcon,
  isValidBpInput,
  bpAutoAdvance,
  BP_AUTO_ADVANCE_DELAY_MS,
  fetchRecentSummary,
  saveErrorMessage,
  type BpField,
  type SessionSummary,
} from './InputPage.utils'

dayjs.extend(utc)
dayjs.extend(timezone)
dayjs.locale('id')

// ── Snapshot of the 1st measurement (shown in the "rest" prompt) ──────────
interface FirstRecord { sys: number; dia: number; pul: number }

// 繁體中文註解：用固定來源鍵註冊 dirty 狀態，避免 hidden 的體溫頁 cleanup 清掉血壓頁保護。
const UNSAVED_INPUT_SOURCE = 'blood-pressure'

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
  const { locale, text } = useI18n()
  const keyboardOpen = useKeyboardViewport()
  const { registerUnsavedInput } = usePwaUpdateGuard()
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
  const [everSubmitted, setEverSubmitted] = useState(false)   // gate for alert banner
  const [now,           setNow]           = useState(() => dayjs().tz(TZ))
  const [isDirty,       setIsDirty]       = useState(false)
  const [lastSubmittedRecord, setLastSubmittedRecord] = useState<FirstRecord | null>(null)
  const [dailyRecordsVersion, setDailyRecordsVersion] = useState(0)
  const [optimisticRecord, setOptimisticRecord] = useState<BpRecord | null>(null)
  const [pendingRecords, setPendingRecords] = useState<PendingBloodPressureRecord[]>([])
  const [pendingSyncing, setPendingSyncing] = useState(false)
  const [pendingSyncError, setPendingSyncError] = useState(false)
  const submittingRef = useRef(false)
  const pendingSyncInFlightRef = useRef(false)
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const autoAdvanceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // 繁體中文註解：建立輸入欄位 Ref，實現輸入完高壓自動跳低壓、低壓自動跳心跳、心跳自動聚焦儲存按鈕之順跳流程。
  const sysRef = useRef<HTMLInputElement>(null)
  const diaRef = useRef<HTMLInputElement>(null)
  const pulRef = useRef<HTMLInputElement>(null)
  const submitBtnRef = useRef<HTMLButtonElement>(null)

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
    resetInputs()
  }

  useEffect(() => {
    return () => {
      if (resetTimerRef.current) clearTimeout(resetTimerRef.current)
      if (autoAdvanceTimerRef.current) clearTimeout(autoAdvanceTimerRef.current)
    }
  }, [])

  // 兩位數延遲跳轉期間顯示提示，讓使用者知道系統正準備自動跳走，不用急著手動點下一格。
  const [pendingAdvanceField, setPendingAdvanceField] = useState<BpField | null>(null)

  const clearAutoAdvanceTimer = () => {
    if (autoAdvanceTimerRef.current) {
      clearTimeout(autoAdvanceTimerRef.current)
      autoAdvanceTimerRef.current = null
    }
    setPendingAdvanceField(null)
  }

  // 三個輸入格共用同一條自動跳欄規則，避免外觀相同的框行為不同。
  // 每次輸入都先取消上一個待跳轉，否則使用者補打第三位數時會被前一次的延遲跳走。
  const handleAutoAdvance = (field: BpField, value: number | '', focusNext: () => void) => {
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
  }

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
  const level   = hasValues ? getAlertLevel(systolic as number, diastolic as number, pulse as number) : 'normal'
  // 輸入頁與報告共用同一份顯示判定，避免心跳警示在兩個頁面出現不同文字。
  const displayedRule = lastSubmittedRecord
    ? evaluateReading(lastSubmittedRecord.sys, lastSubmittedRecord.dia, lastSubmittedRecord.pul)
    : null
  const submittedLevel = displayedRule?.level ?? 'normal'
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
  const latest = useLatestBpRecord(patientId)
  const firstRecordEventEligible = isFirstRecordEventEligible({
    hasExistingRecord: latest.record !== null,
    historyLoading: latest.loading,
    historyError: latest.error !== null,
  })
  const refetchLatest = latest.refetch
  const normalizedUserEmail = userEmail?.trim().toLowerCase() ?? ''
  const pendingViewRecords = useMemo(() => pendingRecords.map(pendingBloodPressureRecordToView), [pendingRecords])
  // 病人名稱只能來自已授權的病人資料；不能再用舊角色或登入帳號猜測，以免報告標示到錯的人。
  const activeSubjectName = patientName || text({ id: 'Orang yang diukur', zh: '量測對象' ,en: 'Person that diukur' })

  // 線上與離線補送都只傳固定 UUID；Edge Function 會以登入者 session 重新讀取資料並套用 RLS，
  // 避免不同帳號／不同 build 因舊版通知設定缺漏而走出不同結果。
  const sendBpTelegramNotification = useCallback(async (recordId: string, recordPatientId: string) => {
    await sendTelegramNotification({ recordId, patientId: recordPatientId })
  }, [])

  const refreshPendingRecords = useCallback(() => {
    if (!normalizedUserEmail || isDemoMode()) {
      setPendingRecords([])
      return
    }
    setPendingRecords(readPendingBloodPressureRecords(patientId, normalizedUserEmail))
  }, [normalizedUserEmail, patientId])

  const syncPendingRecords = useCallback(async () => {
    refreshPendingRecords()
    if (!normalizedUserEmail || isDemoMode()) return
    // navigator.onLine 是 UX 提示，不是安全邊界；真正的寫入仍由 Supabase 回應確認。
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return
    if (pendingSyncInFlightRef.current) return

    pendingSyncInFlightRef.current = true
    setPendingSyncing(true)
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
            void sendBpTelegramNotification(record.id, record.patient_id).catch(err => {
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
    } catch (error) {
      // queue adapter 會保留原始資料；這裡只留下可診斷的 console 訊息與雙語同步提示。
      console.error('[blood pressure pending sync error]', error)
      setPendingSyncError(true)
    } finally {
      pendingSyncInFlightRef.current = false
      setPendingSyncing(false)
    }
  }, [firstRecordEventEligible, locale, normalizedUserEmail, patientId, refreshPendingRecords, refetchLatest, sendBpTelegramNotification])

  useEffect(() => {
    refreshPendingRecords()
    if (typeof window === 'undefined') return
    const handleOnline = () => { void syncPendingRecords() }
    window.addEventListener('online', handleOnline)
    void syncPendingRecords()
    return () => window.removeEventListener('online', handleOnline)
  }, [refreshPendingRecords, syncPendingRecords])
  // 報告區塊的寵物提示需要對象類型；從已授權清單解析，避免額外的 App 層 prop 傳遞。
  const activeCareRecipientType = availablePatients.find(patient => patient.patientId === patientId)?.careRecipientType

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
      setErrMsg(text({ id: 'Silakan ukur dulu', zh: '請先實際調整數值' ,en: 'Silakan ukur dulu' }))
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

    // Web 仍保留第一筆後的一分鐘倒數；iOS 每次保存各發一則即時通知，方便 staging 快速驗證原生 bridge。
    if (!isDemoMode()) {
      void notifyMeasurementSaved(locale).catch(() => {
        // 通知權限或原生排程失敗不應讓已成功保存的血壓變成失敗；Web 流程仍照常存在。
        console.warn('[native measurement notification unavailable]')
      })
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
      void sendBpTelegramNotification(recordId, patientId).catch(err => {
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
              patientId={activeSubject}
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
            onChange={(value) => {
              setIsDirty(true)
              setSystolic(value)
              // 三位數立刻跳；兩位數（例如 98）延遲跳，留時間讓使用者補完可能的三位數。
              handleAutoAdvance('systolic', value, () => diaRef.current?.focus())
            }}
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
            onChange={(value) => {
              setIsDirty(true)
              setDiastolic(value)
              handleAutoAdvance('diastolic', value, () => pulRef.current?.focus())
            }}
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
            onChange={(value) => {
              setIsDirty(true)
              setPulse(value)
              handleAutoAdvance('pulse', value, () => submitBtnRef.current?.focus())
            }}
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
            canSubmit ? btnCls[level] : 'bg-gray-300'
          }`}
        >
          {status === 'saving' ? text(L.saving) : status === 'queued' ? text(L.queued) : status === 'ok' ? text(L.saved) : text(L.save)}
        </button>
        {/* 繁體中文註解：成功文字不能只依賴按鈕標籤變化；獨立 status 區域才能讓讀屏器在寫入完成時可靠通知使用者。 */}
        <p role="status" aria-live="polite" className="sr-only">{status === 'ok' ? text(L.saved) : status === 'queued' ? text(L.queued) : ''}</p>
        {!keyboardOpen && <DailyBloodPressureRecords patientId={patientId} refreshVersion={dailyRecordsVersion} pendingRecords={pendingViewRecords} optimisticRecord={optimisticRecord?.patient_id === patientId ? optimisticRecord : null} onChanged={() => latest.refetch()} />}
        {/* 量完血壓最自然的下一個動作就是跟前幾天比一下；趨勢留在同一頁，不必跳到另一個底部分頁。 */}
        {!keyboardOpen && <ModuleTrendSection moduleId="bloodPressure" titleId="blood-pressure-trend-title">
          {days => <BloodPressureReportPanel patientId={patientId} days={days} subjectLabel={activeSubjectName} careRecipientType={activeCareRecipientType} userEmail={userEmail} />}
        </ModuleTrendSection>}
      </div>

      {/* ── Bottom Status & Banners Area ── */}
      <div className="flex-1 flex flex-col justify-end px-5 pb-4 pt-3">
        {pendingRecords.length > 0 && (
          <div role="status" className="mb-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-center text-sm text-amber-900">
            <p className="font-semibold">{pendingSyncing ? text(L.pendingSyncing) : text(L.pending(pendingRecords.length))}</p>
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
        {/* After 2nd measurement: session complete + 3-day summary */}
        {showDoneMsg && (
          <div className="w-full px-4 py-2 rounded-xl border bg-green-50 border-green-200 text-green-800 text-sm">
            <div className="font-bold text-center">{text({ id: L.done.id(L[session].id), zh: L.done.zh() ,en: L.done.en(L[session].en) })}</div>

            {/* 3-day summary — shown once loaded from Supabase */}
            {summary && summary.length > 0 && (
              <div className="mt-2 border-t border-green-200 pt-1.5 space-y-1">
                {summary.map((row, i) => {
                  const lv   = getAlertLevel(row.avgSys, row.avgDia, row.avgPul)
                  const icon = sessionIcon[row.session]
                  return (
                    <div key={i} className="flex items-center justify-between text-xs text-green-900">
                      <span className="font-medium">{icon} {row.dateStr} {row.timeStr} {text(L[row.session])}</span>
                      <VitalReading systolic={row.avgSys} diastolic={row.avgDia} pulse={row.avgPul} className="text-green-950" unitClassName="text-green-700" />
                      <span>{statusIcon[lv]}</span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* BP alert level — only after first save, hidden while session-flow messages show */}
        {everSubmitted && !showRestPrompt && !showDoneMsg && displayedRule && (
          <div className={`w-full p-4 rounded-2xl border text-sm transition-all duration-150 ${alertCls[submittedLevel]}`}>
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
