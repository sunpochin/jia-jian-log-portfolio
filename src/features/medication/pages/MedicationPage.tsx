/*
檔案用途：提供每日服藥 tab，讀取藥單、記錄每顆藥是否服用，並可進入授權的調藥介面。
所在層：src/features/medication/pages；是照護流程中的藥物操作畫面。
主要關聯：使用 TabHeader 與 SubjectSwitcher 共用頁首和病人選擇，資料操作集中在 lib/medications 與 MedicationAdminSection。
*/
import { lazy, useEffect, useMemo, useRef, useState } from 'react'
import dayjs from 'dayjs'
import 'dayjs/locale/id'
import 'dayjs/locale/zh-tw'
import timezone from 'dayjs/plugin/timezone'
import utc from 'dayjs/plugin/utc'
import { getMedicationSyncErrorKind } from '../../../lib/medicationToday'
import { CARE_DAY_TIMEZONE, careDateKey } from '../../../lib/careDay'
import { clearMedicationDose, completesRequiredMedicationSlot, formatDoseAmountLocalized, formatMedicationLabel, isCurrentMedicationView, readMedicationDay, resolveMedicationNames, saveMedicationDose, type MedicationPlanView } from '../../../lib/medications'
import { savePrnDailyAssessment, savePrnMedicationEvent, updatePrnMedicationEffectStatus, voidPrnMedicationEvent, type SavePrnMedicationEventInput } from '../../../lib/prnMedication'
import { compareMedicationSlots, getMedicationSlotCollapseDefaults, medicationSlotCompletionText, medicationSlotQuantityProgressText, medicationSlotQuantityText, medicationSlotText } from '../../../lib/medicationSchedule'
import { resolveMedicationCategory } from '../../../lib/medicationAtcCategories'
import type { MedicationIntakeLog, PrnMedicationDailyAssessment, PrnMedicationEvent } from '../../../types/database'
import type { MedicationManagementPatient, PatientIdentity } from '../../../lib/auth'
import { SubjectSwitcher } from '../../../components/ui/SubjectSwitcher'
import { TabHeader } from '../../../components/ui/TabHeader'
import { MedicationAdminSection } from '../components/MedicationAdminSection'
import { MedicationPhotoOcrSection } from '../components/MedicationPhotoOcrSection'
import { MedicationAppearance } from '../components/MedicationAppearance'
import { MedicationDetailDialog } from '../components/MedicationDetailDialog'
import { MedicationHistory } from '../components/MedicationHistory'
import { MedicationNameHeading } from '../components/MedicationNameHeading'
import { MedicationViewTabs, type MedicationView } from '../components/MedicationViewTabs'
import { PrnMedicationSection } from '../components/PrnMedicationSection'
import { common, useI18n, type LocalizedText } from '../../../lib/i18n'
import { ModuleTrendSection } from '../../../components/daily-care/ModuleTrendSection'

dayjs.extend(utc)
dayjs.extend(timezone)
dayjs.locale('id')

// 圖表套件只在照護者展開趨勢時才下載，不進入每日照護的初始載入路徑。
const MedicationDoseHistoryPanel = lazy(() => import('../components/MedicationDoseHistoryPanel').then(m => ({ default: m.MedicationDoseHistoryPanel })))

type PendingMedicationCancellation = {
  plan: MedicationPlanView
  doseNumber: number
  existing: MedicationIntakeLog
}

// 顆數摘要要按劑型分組（錠／膠囊論顆，粉劑論包，液劑論份）；medicationSlotQuantityText 需要 dosage_form，
// 這裡統一從 MedicationPlanView 帶出來，避免每個呼叫點各自重複同一段欄位對應。
const medicationQuantityInputs = (planList: readonly MedicationPlanView[]) => planList.map(plan => ({
  dose_amount: plan.dose_amount,
  dose_count: plan.dose_count,
  dosage_form: plan.medication.dosage_form,
}))

const syncErrorMessage = (error: unknown): LocalizedText => {
  const kind = getMedicationSyncErrorKind(error)
  if (kind === 'setup') return { id: 'Catatan obat sementara tidak tersedia. Silakan coba lagi nanti.', zh: '服藥紀錄暫時無法使用，請稍後再試。' ,en: 'Dosing history is temporarily unavailable, please try again later.' }
  if (kind === 'permission') return { id: 'Akun ini tidak dapat membaca daftar obat.', zh: '此帳號無法讀取藥單。' ,en: 'This account can’t read the medication list.' }
  return { id: 'Sinkronisasi gagal. Periksa internet lalu coba lagi.', zh: '同步失敗，請確認網路後再試。' ,en: 'Sync failed, please check your network and try again.' }
}

export function MedicationPage({ manageablePatients, ownPatientId, selectedPatientId, availablePatients, userEmail, onSubjectSelect, embedded = false, slotsExpandedByDefault = true, nameEnglishFirst = true }: { manageablePatients: MedicationManagementPatient[]; ownPatientId: string; selectedPatientId: string; availablePatients: PatientIdentity[]; userEmail: string; onSubjectSelect: (patientId: string) => void; embedded?: boolean; slotsExpandedByDefault?: boolean; nameEnglishFirst?: boolean }) {
  const { locale, text } = useI18n()
  const [today, setToday] = useState(() => careDateKey())
  const [plans, setPlans] = useState<MedicationPlanView[]>([])
  const [logs, setLogs] = useState<MedicationIntakeLog[]>([])
  const [prnEvents, setPrnEvents] = useState<PrnMedicationEvent[]>([])
  const [prnAssessments, setPrnAssessments] = useState<PrnMedicationDailyAssessment[]>([])
  const [busyKey, setBusyKey] = useState('')
  const [errorMessage, setErrorMessage] = useState<LocalizedText | null>(null)
  const [loading, setLoading] = useState(true)
  const [medicationView, setMedicationView] = useState<MedicationView>('today')
  const [planRefreshVersion, setPlanRefreshVersion] = useState(0)
  // 從藥袋 OCR 候選卡片挑到的品名，暫存後交給 MedicationAdminSection 的搜尋欄位；不是藥單資料，不需要跟病人切換一起重置。
  const [ocrCatalogQuery, setOcrCatalogQuery] = useState<string | null>(null)
  const [collapsedSlots, setCollapsedSlots] = useState<Set<string>>(new Set())
  const collapseDefaultsInitialized = useRef(false)
  const [completedSlotPrompt, setCompletedSlotPrompt] = useState<string | null>(null)
  const [pendingMedicationCancellation, setPendingMedicationCancellation] = useState<PendingMedicationCancellation | null>(null)
  // 只有本週藥單是唯讀掃視畫面，點藥名才彈出詳情；服藥打卡點藥卡是用來記錄服用，兩者操作意圖不同，不共用同一個狀態。
  const [detailPlan, setDetailPlan] = useState<MedicationPlanView | null>(null)
  const [restoreCancellationTriggerFocus, setRestoreCancellationTriggerFocus] = useState(false)
  const completionDismissButtonRef = useRef<HTMLButtonElement>(null)
  const medicationCancellationDialogRef = useRef<HTMLDialogElement>(null)
  const cancellationDismissButtonRef = useRef<HTMLButtonElement>(null)
  const cancellationTriggerRef = useRef<HTMLButtonElement | null>(null)
  const previousCompletedSlots = useRef(new Set<string>())
  const collapsedSlotContextRef = useRef('')
  const loadedPlansContextRef = useRef('')
  const activeMedicationViewRef = useRef({ patientId: selectedPatientId, date: today })
  // 在 render 就更新目前畫面身分，才能擋住「切換後、effect 尚未執行前」剛好回來的舊存檔結果。
  activeMedicationViewRef.current = { patientId: selectedPatientId, date: today }

  useEffect(() => {
    // 標題時鐘已由共用元件處理；這裡仍每秒檢查跨過台北 04:00，避免長開手機把凌晨服藥切到錯的照護日。
    const timer = setInterval(() => {
      const current = dayjs().tz(CARE_DAY_TIMEZONE)
      setToday(careDateKey(current))
    }, 1000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    let cancelled = false
    const requestContext = `${selectedPatientId}:${today}:${planRefreshVersion}`
    setLoading(true)
    // 跨日只清除勾選；保留藥單骨架可避免每次換日都整頁閃爍，且不會把昨天誤顯示成今天已服用。
    setLogs([])
    setPrnEvents([])
    setPrnAssessments([])
    setCompletedSlotPrompt(null)
    cancellationTriggerRef.current = null
    setPendingMedicationCancellation(null)
    setRestoreCancellationTriggerFocus(false)
    readMedicationDay(selectedPatientId, today)
      .then(result => {
        if (cancelled) return
        // 先標記 plans 所屬對象，再讓 React 更新畫面；收合初始化因此不會把上一位病人的資料當成新資料。
        loadedPlansContextRef.current = requestContext
        setPlans(result.plans)
        setLogs(result.logs)
        setPrnEvents(result.prnEvents)
        setPrnAssessments(result.prnAssessments)
        setErrorMessage(null)
      })
      .catch(error => {
        if (cancelled) return
        console.error('[medication plan read error]', error)
        setErrorMessage(syncErrorMessage(error))
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [today, selectedPatientId, planRefreshVersion])

  const groups = useMemo(() => {
    const result = new Map<string, MedicationPlanView[]>()
    // PRN 沒有固定餐次；先在這裡排除，避免它回到 routine 卡片與進度條。
    plans.filter(plan => !plan.as_needed).forEach(plan => result.set(plan.schedule_slot, [...(result.get(plan.schedule_slot) ?? []), plan]))
    // 同一時段固定用英文商品名排序，讓照護者每天看到的 A→B→C 順序穩定，不受 Supabase 回傳順序影響。
    return [...result.entries()].sort(([left], [right]) => compareMedicationSlots(left, right)).map(([slot, slotPlans]) => [
      slot,
      slotPlans.sort((left, right) => left.medication.brand_name.localeCompare(right.medication.brand_name, 'en', { sensitivity: 'base' })),
    ] as const)
  }, [plans])

  const hasPrnPlans = plans.some(plan => plan.as_needed)
  // 本週藥單每天固定套用；固定用藥的種類與顆數加總即代表每一天要核對的總量,讓照護者不必逐時段心算就能對藥盒。
  const weeklyRoutinePlans = useMemo(() => groups.flatMap(([, slotPlans]) => slotPlans), [groups])
  const weeklyMedicationCount = weeklyRoutinePlans.length
  const weeklyQuantity = useMemo(() => medicationSlotQuantityText(medicationQuantityInputs(weeklyRoutinePlans)), [weeklyRoutinePlans])

  useEffect(() => {
    // 繁體中文註解：手機先展開第一個時段，避免 11 張藥卡一次淹沒畫面；每個時段仍可手動展開，不改變服藥資料或順序。
    // 載入完成前不能使用舊 groups，否則切換病人時會先記住上一位病人的收合結果。
    collapseDefaultsInitialized.current = false
    collapsedSlotContextRef.current = ''
    setCollapsedSlots(new Set())
  }, [selectedPatientId, today, planRefreshVersion, slotsExpandedByDefault])

  useEffect(() => {
    const context = `${selectedPatientId}:${today}:${planRefreshVersion}`
    if (!groups.length || collapseDefaultsInitialized.current || loadedPlansContextRef.current !== context) return
    collapseDefaultsInitialized.current = true
    setCollapsedSlots(getMedicationSlotCollapseDefaults(groups.map(([slot]) => slot), slotsExpandedByDefault))
  }, [groups, planRefreshVersion, selectedPatientId, slotsExpandedByDefault, today])

  // 攤平成「一次一份」的清單，全天進度卡與每個時段標題共用同一份展開結果，不必各自重算一次「dose_count 攤平」。
  const requiredDoses = useMemo(() => groups.flatMap(([slot, slotPlans]) =>
    slotPlans.flatMap(plan =>
      Array.from({ length: plan.dose_count }, (_, index) => ({ slot, planId: plan.id, doseNumber: index + 1, dose_amount: plan.dose_amount, dosage_form: plan.medication.dosage_form })),
    ),
  ), [groups])
  const requiredTakenDoses = useMemo(() => requiredDoses.filter(dose => logs.some(log => log.plan_id === dose.planId && log.dose_number === dose.doseNumber)), [requiredDoses, logs])
  const requiredTotal = requiredDoses.length
  const requiredTaken = requiredTakenDoses.length
  // 全天顆數摘要跟每個時段用同一套「按劑型分組」規則，不能把粉包／液劑混算成「顆」。
  const requiredQuantity = useMemo(() => medicationSlotQuantityProgressText(requiredTakenDoses, requiredDoses), [requiredTakenDoses, requiredDoses])
  const canManageSelectedPatient = manageablePatients.some(patient => patient.patientId === selectedPatientId)

  const recordPrn = async (input: SavePrnMedicationEventInput) => {
    const requestView = { patientId: selectedPatientId, date: today }
    const saved = await savePrnMedicationEvent({ ...input, recordedByEmail: userEmail })
    // PRN 次數只增加實際回傳的 event；同一 id 重試時以回傳值更新，不在畫面製造第二筆。
    if (isCurrentMedicationView(activeMedicationViewRef.current, requestView)) {
      setPrnEvents(current => current.some(event => event.id === saved.id) ? current.map(event => event.id === saved.id ? saved : event) : [...current, saved])
      setErrorMessage(null)
    }
  }

  const voidPrn = async (event: PrnMedicationEvent, reason: string) => {
    const requestView = { patientId: selectedPatientId, date: today }
    const voided = await voidPrnMedicationEvent(event, selectedPatientId, reason)
    if (isCurrentMedicationView(activeMedicationViewRef.current, requestView)) setPrnEvents(current => current.map(item => item.id === voided.id ? voided : item))
  }

  const assessPrnEffect = async (event: PrnMedicationEvent, effectStatus: PrnMedicationEvent['effect_status']) => {
    const requestView = { patientId: selectedPatientId, date: today }
    const updated = await updatePrnMedicationEffectStatus(event, selectedPatientId, effectStatus)
    if (isCurrentMedicationView(activeMedicationViewRef.current, requestView)) setPrnEvents(current => current.map(item => item.id === updated.id ? updated : item))
  }

  const assessPrn = async (planId: string, status: 'not_assessed' | 'not_needed') => {
    const requestView = { patientId: selectedPatientId, date: today }
    const saved = await savePrnDailyAssessment(selectedPatientId, planId, today, status)
    if (isCurrentMedicationView(activeMedicationViewRef.current, requestView)) setPrnAssessments(current => current.some(item => item.id === saved.id) ? current.map(item => item.id === saved.id ? saved : item) : [...current, saved])
  }

  const selectMedicationView = (nextView: MedicationView) => {
    // 不自動替使用者切換照護對象；管理權不足時顯示明確提示，比無聲跳到另一位病人更安全。
    setMedicationView(nextView)
  }

  // 收合後的餐次標題要能直接顯示「幾次已吃、共幾顆」，讓長輩不用點開就能一眼確認；
  // 「次數」與「顆數」要分開算，因為同一次服藥可能不只一顆（例如鉀離子藥常見單次 2 顆），次數對不代表顆數對。
  // PRN 沒有吃也不代表這餐沒完成，完成標記必須與跳出的完成卡使用同一套固定藥規則，因此只從已排除 PRN 的 requiredDoses 取值。
  const slotProgress = useMemo(() => {
    const map = new Map<string, { doseTaken: number; doseTotal: number; quantity: LocalizedText }>()
    groups.forEach(([slot]) => {
      const doses = requiredDoses.filter(dose => dose.slot === slot)
      const takenDoses = requiredTakenDoses.filter(dose => dose.slot === slot)
      map.set(slot, {
        doseTaken: takenDoses.length,
        doseTotal: doses.length,
        quantity: medicationSlotQuantityProgressText(takenDoses, doses),
      })
    })
    return map
  }, [groups, requiredDoses, requiredTakenDoses])

  const completedSlots = useMemo(() => new Set(
    Array.from(slotProgress.entries())
      .filter(([, progress]) => progress.doseTotal > 0 && progress.doseTaken === progress.doseTotal)
      .map(([slot]) => slot),
  ), [slotProgress])

  useEffect(() => {
    if (loading || groups.length === 0) return
    const context = `${selectedPatientId}:${today}:${planRefreshVersion}`
    if (loadedPlansContextRef.current !== context || collapsedSlotContextRef.current === context) return
    collapsedSlotContextRef.current = context
    if (slotsExpandedByDefault) {
      // 全開模式不能因完成某餐而自動收合，否則設定會在初始化後又被精簡邏輯覆寫。
      previousCompletedSlots.current = completedSlots
      return
    }
    // 只有選擇精簡模式才自動收合，讓需要一眼核對每餐的照護者不會又被迫點開已完成時段。
    const nextCollapsed = new Set(groups.filter(([slot], index) => index > 0 || completedSlots.has(slot)).map(([slot]) => slot))
    setCollapsedSlots(nextCollapsed)
    previousCompletedSlots.current = completedSlots
  }, [completedSlots, groups, loading, planRefreshVersion, selectedPatientId, slotsExpandedByDefault, today])

  useEffect(() => {
    if (slotsExpandedByDefault) return
    // 只在剛完成時自動收合；若每次其他時段變動都重收，使用者就無法保留手動展開來核對或取消。
    const previous = previousCompletedSlots.current
    setCollapsedSlots(current => {
      const next = new Set(current)
      groups.forEach(([slot]) => {
        const isCompleted = completedSlots.has(slot)
        const wasCompleted = previous.has(slot)
        if (isCompleted && !wasCompleted) next.add(slot)
        if (!isCompleted && wasCompleted) next.delete(slot)
      })
      return next.size === current.size && [...next].every(slot => current.has(slot)) ? current : next
    })
    previousCompletedSlots.current = completedSlots
  }, [completedSlots, groups, slotsExpandedByDefault])

  useEffect(() => {
    // 提示必須把焦點放在「知道了」，讓鍵盤與螢幕閱讀器使用者不必回頭尋找剛跳出的完成訊息。
    if (completedSlotPrompt) completionDismissButtonRef.current?.focus()
  }, [completedSlotPrompt])

  useEffect(() => {
    const dialog = medicationCancellationDialogRef.current
    if (!dialog) return

    if (pendingMedicationCancellation) {
      // 自訂視窗要把焦點交給「返回」，並讓背景暫時不能操作，避免照護者誤把原生 OK 當成安全操作。
      if (!dialog.open) dialog.showModal()
      cancellationDismissButtonRef.current?.focus()
      return
    }

    if (dialog.open) dialog.close()
    if (!restoreCancellationTriggerFocus || busyKey) return

    const trigger = cancellationTriggerRef.current
    // 取消送出後原卡會先被停用；停用按鈕無法接收焦點，必須等同步結束才還原，避免鍵盤使用者失去目前位置。
    if (trigger?.isConnected && !trigger.disabled) trigger.focus()
    cancellationTriggerRef.current = null
    setRestoreCancellationTriggerFocus(false)
  }, [busyKey, pendingMedicationCancellation, restoreCancellationTriggerFocus])

  const clearDose = async (plan: MedicationPlanView, doseNumber: number, existing: MedicationIntakeLog) => {
    const key = `${plan.id}:${doseNumber}`
    if (busyKey) return
    const requestView = { patientId: selectedPatientId, date: today }
    const requestIsCurrent = () => isCurrentMedicationView(activeMedicationViewRef.current, requestView)

    setBusyKey(key)
    try {
      await clearMedicationDose(plan.id, selectedPatientId, today, doseNumber)
      if (requestIsCurrent()) setLogs(current => current.filter(log => log.id !== existing.id))
      if (requestIsCurrent()) setErrorMessage(null)
    } catch (error) {
      console.error('[medication dose sync error]', error)
      if (requestIsCurrent()) setErrorMessage(syncErrorMessage(error))
    } finally {
      setBusyKey(current => current === key ? '' : current)
    }
  }

  const toggleDose = async (plan: MedicationPlanView, doseNumber: number, existing?: MedicationIntakeLog, trigger?: HTMLButtonElement) => {
    const key = `${plan.id}:${doseNumber}`
    if (busyKey) return

    if (existing) {
      // 先保留這次點擊的完整脈絡，確認視窗才能明確指出會取消哪顆藥、哪個時間的紀錄。
      cancellationTriggerRef.current = trigger ?? null
      setRestoreCancellationTriggerFocus(true)
      setPendingMedicationCancellation({ plan, doseNumber, existing })
      return
    }

    const requestView = { patientId: selectedPatientId, date: today }
    const requestIsCurrent = () => isCurrentMedicationView(activeMedicationViewRef.current, requestView)

    setBusyKey(key)
    try {
      const saved = await saveMedicationDose(plan, today, doseNumber, userEmail)
      const slotPlans = groups.find(([slot]) => slot === plan.schedule_slot)?.[1] ?? []
      // 只在這次勾選剛好完成整個時段時提示；重讀資料或切換對象不能反覆跳窗打擾媽媽。
      if (requestIsCurrent()) {
        if (completesRequiredMedicationSlot(slotPlans, logs, plan.id, doseNumber)) setCompletedSlotPrompt(plan.schedule_slot)
        setLogs(current => [...current, saved])
      }
      if (requestIsCurrent()) setErrorMessage(null)
    } catch (error) {
      console.error('[medication dose sync error]', error)
      if (requestIsCurrent()) setErrorMessage(syncErrorMessage(error))
    } finally {
      setBusyKey(current => current === key ? '' : current)
    }
  }

  const confirmMedicationCancellation = () => {
    const pending = pendingMedicationCancellation
    if (!pending || busyKey) return
    setPendingMedicationCancellation(null)
    void clearDose(pending.plan, pending.doseNumber, pending.existing)
  }

  const completionCopy = completedSlotPrompt ? medicationSlotCompletionText(completedSlotPrompt) : null

  return (
    <section className="min-h-full bg-slate-50 px-4 pb-8 pt-4 text-slate-950 sm:px-5">
      <header className="mb-5 space-y-4">
        {!embedded && <>
          <TabHeader title="medication" />
          <SubjectSwitcher
            patientId={selectedPatientId}
            patients={availablePatients}
            onSelect={onSubjectSelect}
          />
        </>}
        {/* 四個分頁一律可見：服藥打卡與每週藥單是唯讀查詢，被照顧者本人也看得到；
            排藥（原「調整藥單」）與變更藥物則只給有管理權的照護者，由 MedicationViewTabs 自行過濾。 */}
        <MedicationViewTabs activeView={medicationView} onSelect={selectMedicationView} canManage={manageablePatients.length > 0} />
      </header>

      {manageablePatients.length > 0 && medicationView === 'manage' && <div id="medication-view-manage-panel" role="tabpanel" aria-labelledby="medication-view-manage-tab" className="space-y-4">
        {canManageSelectedPatient
          ? <>
            <MedicationPhotoOcrSection key={`ocr-${selectedPatientId}`} patientId={selectedPatientId} onPickCandidate={setOcrCatalogQuery} />
            <MedicationAdminSection key={selectedPatientId} patientId={selectedPatientId} isOwnPatient={selectedPatientId === ownPatientId} nameEnglishFirst={nameEnglishFirst} onMedicationPlanChanged={() => setPlanRefreshVersion(version => version + 1)} externalCatalogQuery={ocrCatalogQuery} onExternalCatalogQueryConsumed={() => setOcrCatalogQuery(null)} />
          </>
          : <section className="rounded-3xl border border-sky-200 bg-sky-50 p-5 shadow-sm" role="status">
            <h2 className="text-lg font-black text-sky-950">{text({ id: 'Pilih orang yang dapat Anda atur', zh: '請選擇您有權排藥的對象' ,en: "Select people that can You atur" })}</h2>
            <p className="mt-2 text-sm font-medium leading-6 text-sky-900">{text({ id: 'Pengaturan obat hanya tersedia untuk penerima perawatan yang diizinkan.', zh: '藥單管理只會對您被授權的照護對象開放。' ,en: 'Medication settings are available only for care recipients you are authorized to manage.' })}</p>
          </section>}
      </div>}

      {medicationView === 'week' && <div id="medication-view-week-panel" role="tabpanel" aria-labelledby="medication-view-week-tab" className="space-y-4">
        <section className="rounded-3xl border border-sky-200 bg-sky-50 p-5 shadow-sm">
          <h2 className="text-lg font-black text-sky-950">{text({ id: 'Jadwal obat minggu ini', zh: '本週藥單' ,en: "Schedule medication weeks this" })}</h2>
          <p className="mt-2 text-sm font-medium leading-6 text-sky-900">{text({ id: 'Jadwal ini berlaku setiap hari minggu ini dan hanya untuk dilihat. Ketuk nama obat untuk melihat detail.', zh: '此藥單每天固定套用，這裡僅供查看，無法在此修改。點擊藥名可查看詳情。' ,en: "Schedule this berlaku each days weeks this and only for diview. Tap name medication for view detail." })}</p>
        </section>
        {loading && <p className="py-12 text-center text-base text-gray-500">{text(common.loading)}</p>}
        {/* 換病人時舊藥單會暫留畫面避免閃爍；但若這次讀取失敗，絕對不能把舊病人的藥單當成新病人的本週藥單顯示，
            否則會讓照護者或被照顧者誤看到別人的藥並準備錯藥。讀取失敗時只顯示錯誤，不顯示任何殘留藥單。 */}
        {!loading && errorMessage && <p role="alert" className="rounded-xl bg-red-50 p-3 text-base font-semibold text-red-700">{text(errorMessage)}</p>}
        {/* 每天總計獨立成一列，放在時段列表之前，讓照護者核對整週固定藥盒時第一眼就看到當天總量。 */}
        {!loading && !errorMessage && groups.length > 0 && <p role="status" className="rounded-2xl border border-sky-300 bg-white px-4 py-2.5 text-sm font-black text-sky-950">
          {text({ id: `Total per hari: ${weeklyMedicationCount} obat · ${weeklyQuantity.id}`, zh: `每日總計：${weeklyMedicationCount} 種藥・共 ${weeklyQuantity.zh}` ,en: `Total per days: ${weeklyMedicationCount} medication · ${weeklyQuantity.id}` })}
        </p>}
        {!loading && !errorMessage && groups.length === 0 && !hasPrnPlans && <section className="rounded-3xl border border-dashed border-slate-300 bg-white p-6 text-center shadow-sm">
          <p className="text-sm font-medium leading-6 text-slate-600">{text({ id: 'Belum ada jadwal obat minggu ini.', zh: '這位照護對象目前沒有本週藥單。' ,en: "No schedule medication weeks this." })}</p>
        </section>}
        {!loading && !errorMessage && groups.length > 0 && <div className="space-y-3">
          {groups.map(([slot, slotPlans]) => (
            <section key={slot} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <h3 className="flex items-center justify-between gap-2 text-base font-black text-gray-800">
                {text(medicationSlotText(slot))}
                {/* 種類數＋總顆數要並列顯示，讓照護者不必逐項心算就知道這餐要準備幾種藥、共幾顆（例如鉀離子藥常見單次 2 顆）。 */}
                <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-700">
                  {text({ id: `${slotPlans.length} obat · ${medicationSlotQuantityText(medicationQuantityInputs(slotPlans)).id}`, zh: `${slotPlans.length} 種藥・共 ${medicationSlotQuantityText(medicationQuantityInputs(slotPlans)).zh}` ,en: `${slotPlans.length} medication · ${medicationSlotQuantityText(medicationQuantityInputs(slotPlans)).id}` })}
                </span>
              </h3>
              {/* 每項藥品保留成獨立列，讓長品名換行時仍不會和下一項黏在一起；使用細線而非巢狀卡片維持唯讀藥單的掃讀節奏，
                  但整列改成可點擊的 button 開詳情視窗，因此加上右側箭頭與 focus 樣式，避免看起來仍是純文字。 */}
              <ul className="mt-3 divide-y divide-slate-200">
                {slotPlans.map(plan => (
                  <li key={plan.id}>
                    <button
                      type="button"
                      onClick={() => setDetailPlan(plan)}
                      aria-haspopup="dialog"
                      className="flex w-full items-center gap-3 py-3 text-left first:pt-0 last:pb-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600 focus-visible:ring-offset-2 rounded-lg"
                    >
                      <span className="min-w-0 flex-1">
                        <MedicationNameHeading medication={plan.medication} locale={locale} englishFirst={nameEnglishFirst} />
                        <span className="mt-1 block text-base font-medium leading-6 text-slate-700">
                          {formatMedicationLabel(plan.medication.brand_name, plan.medication.strength_mg, plan.medication.strength_label)}
                          {' · '}{formatDoseAmountLocalized(plan.dose_amount, plan.medication.dosage_form, locale)}
                          {plan.dose_count > 1 ? ` · ${text({ id: `${plan.dose_count} pil setiap kali`, zh: `每次 ${plan.dose_count} 顆` ,en: `${plan.dose_count} pil each kali` })}` : ''}
                        </span>
                      </span>
                      <span aria-hidden="true" className="shrink-0 text-xl font-black text-slate-300">›</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>}
        {/* PRN 不在 groups 裡（groups 已把 as_needed 過濾掉），必須另外列出，
            否則被照顧者查看本週藥單時會誤以為自己沒有需要時服用的醫囑。 */}
        {!loading && !errorMessage && hasPrnPlans && <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h3 className="text-base font-black text-gray-800">{text({ id: 'Bila perlu (PRN)', zh: '需要時服用（PRN）' ,en: "Bila perlu (PRN)" })}</h3>
          {/* PRN 也沿用固定藥的列分隔與可點擊詳情，讓唯讀藥單在不同時段仍維持同一套掃讀節奏。 */}
          <ul className="mt-3 divide-y divide-slate-200">
            {plans.filter(plan => plan.as_needed).map(plan => (
              <li key={plan.id}>
                <button
                  type="button"
                  onClick={() => setDetailPlan(plan)}
                  aria-haspopup="dialog"
                  className="flex w-full items-center gap-3 py-3 text-left first:pt-0 last:pb-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600 focus-visible:ring-offset-2 rounded-lg"
                >
                  <span className="min-w-0 flex-1">
                    <MedicationNameHeading medication={plan.medication} locale={locale} englishFirst={nameEnglishFirst} />
                    <span className="mt-1 block text-base font-medium leading-6 text-slate-700">
                      {formatMedicationLabel(plan.medication.brand_name, plan.medication.strength_mg, plan.medication.strength_label)}
                      {' · '}{formatDoseAmountLocalized(plan.dose_amount, plan.medication.dosage_form, locale)}
                    </span>
                  </span>
                  <span aria-hidden="true" className="shrink-0 text-xl font-black text-slate-300">›</span>
                </button>
              </li>
            ))}
          </ul>
        </section>}
      </div>}

      {manageablePatients.length > 0 && medicationView === 'history' && <div id="medication-view-history-panel" role="tabpanel" aria-labelledby="medication-view-history-tab" className="space-y-4">
        {canManageSelectedPatient
          ? <MedicationHistory patientId={selectedPatientId} nameEnglishFirst={nameEnglishFirst} />
          : <section className="rounded-3xl border border-sky-200 bg-sky-50 p-5 shadow-sm" role="status">
            <h2 className="text-lg font-black text-sky-950">{text({ id: 'Pilih orang yang dapat Anda atur', zh: '請選擇您有權調整藥單的對象' ,en: 'Select a person whose medication you can manage' })}</h2>
            <p className="mt-2 text-sm font-medium leading-6 text-sky-900">{text({ id: 'Riwayat obat hanya tersedia untuk penerima perawatan yang diizinkan.', zh: '用藥變更紀錄只會對您被授權的照護對象開放。' ,en: 'The medication change log will only be available to the person you are authorized to care for.' })}</p>
          </section>}
      </div>}

      {medicationView === 'today' && <div id="medication-view-today-panel" role="tabpanel" aria-labelledby="medication-view-today-tab" className="space-y-4">
        <section className="rounded-3xl border border-sky-200 bg-sky-50 p-5 shadow-sm" aria-labelledby="medication-progress-title">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-bold text-sky-800">{text({ id: 'Hari perawatan', zh: '照護日' ,en: 'Care Day' })}</p>
              <h2 id="medication-progress-title" className="mt-1 text-xl font-black text-sky-950">{text({ id: 'Kemajuan minum obat', zh: '服藥進度' ,en: 'Medication Progress' })}</h2>
            </div>
            <time className="shrink-0 rounded-full bg-white px-3 py-1 text-sm font-bold tabular-nums text-sky-900">{today}</time>
          </div>
          <p role="status" className="mt-4 text-2xl font-black tabular-nums text-sky-950">
            {requiredTotal > 0
              ? text({ id: `${requiredTaken} / ${requiredTotal} dosis sudah diminum`, zh: `${requiredTaken} / ${requiredTotal} 次已服用` ,en: `${requiredTaken} / ${requiredTotal} doses taken` })
              : text({ id: 'Belum ada obat rutin hari ini', zh: '今天沒有固定服藥項目（請另看 PRN）' ,en: 'There are no fixed dosing items today (see also PRN)' })}
          </p>
          {/* 跟每個時段標題同一套「次數＋顆數」規則：全天總次數不等於總顆數，同一次服藥可能不只一顆。 */}
          {requiredTotal > 0 && <p className="mt-1 text-sm font-bold tabular-nums text-sky-800">
            {text({ id: `Total ${requiredQuantity.id}`, zh: `共 ${requiredQuantity.zh}` ,en: `Total ${requiredQuantity.id}` })}
          </p>}
          {requiredTotal > 0 && <div className="mt-3 h-2 overflow-hidden rounded-full bg-white" aria-hidden="true">
            <div className="h-full rounded-full bg-sky-600" style={{ width: `${Math.min(100, (requiredTaken / requiredTotal) * 100)}%` }} />
          </div>}
          <p className="mt-2 text-sm font-medium text-sky-900">{requiredTotal > 0
            ? text({ id: 'Ketuk kartu obat untuk mencatat obat yang sudah diminum.', zh: '點擊藥品卡片，記錄已服用的藥物。' ,en: 'Tap a medication card to record a dose as taken.' })
            : text({ id: 'Periksa daftar obat bila resep baru belum ditambahkan.', zh: '如果剛有新醫囑，請到「排藥」查看。' ,en: "Periksa daftar medication bila resep new not yet added." })}</p>
        </section>

        {loading && <p className="py-12 text-center text-base text-gray-500">{text(common.loading)}</p>}
        {/* 錯誤保留雙語值，切換語言時只重畫文字，不能因此重抓已讀取的藥單。 */}
        {errorMessage && <p role="alert" className="rounded-xl bg-red-50 p-3 text-base font-semibold text-red-700">{text(errorMessage)}</p>}

        <dialog
          ref={medicationCancellationDialogRef}
          onCancel={event => {
            event.preventDefault()
            setPendingMedicationCancellation(null)
          }}
          className="m-auto w-[calc(100%-2.5rem)] max-w-sm rounded-3xl border border-red-200 bg-white p-0 text-slate-900 shadow-2xl backdrop:bg-slate-950/55"
          aria-labelledby="medication-cancellation-title"
          aria-describedby="medication-cancellation-details"
        >
          {pendingMedicationCancellation && <div className="p-6">
            <h2 id="medication-cancellation-title" className="text-xl font-black text-slate-950">{text({ id: 'Batalkan catatan obat?', zh: '取消服藥紀錄？' ,en: 'Cancel medication history?' })}</h2>
            <div id="medication-cancellation-details" className="mt-4 rounded-2xl bg-slate-50 p-4">
              <p className="text-base font-black text-slate-900">{formatMedicationLabel(pendingMedicationCancellation.plan.medication.brand_name, pendingMedicationCancellation.plan.medication.strength_mg, pendingMedicationCancellation.plan.medication.strength_label)}</p>
              <p className="mt-2 text-sm font-medium text-slate-600">{text({ id: `Tercatat diminum pukul ${dayjs(pendingMedicationCancellation.existing.taken_at).tz(CARE_DAY_TIMEZONE).format('HH:mm')}.`, zh: `已記錄於 ${dayjs(pendingMedicationCancellation.existing.taken_at).tz(CARE_DAY_TIMEZONE).format('HH:mm')} 服用。` ,en: `Recorded as taken at ${dayjs(pendingMedicationCancellation.existing.taken_at).tz(CARE_DAY_TIMEZONE).format('HH:mm')}.` })}</p>
            </div>
            <div className="mt-6 grid grid-cols-[.9fr_1.1fr] gap-3">
              <button ref={cancellationDismissButtonRef} type="button" onClick={() => setPendingMedicationCancellation(null)} className="min-h-14 rounded-2xl border border-slate-300 bg-white px-4 text-base font-black text-slate-700 active:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600 focus-visible:ring-offset-2">
                {text({ id: 'Kembali', zh: '返回' ,en: 'Back' })}
              </button>
              <button type="button" onClick={confirmMedicationCancellation} className="min-h-14 whitespace-nowrap rounded-2xl bg-red-700 px-4 text-base font-black text-white shadow-sm active:bg-red-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-700 focus-visible:ring-offset-2">
                {text({ id: 'Batalkan catatan', zh: '取消紀錄' ,en: 'Cancel History' })}
              </button>
            </div>
          </div>}
        </dialog>

        {completedSlotPrompt && completionCopy && <div className="fixed inset-0 z-50 flex items-center justify-center bg-emerald-950/40 p-5" role="dialog" aria-modal="true" aria-labelledby="medication-completion-title">
        <div className="w-full max-w-sm rounded-3xl bg-white p-6 text-center shadow-2xl">
          <span aria-hidden="true" className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-emerald-600 text-5xl font-black text-white">✓</span>
          <h2 id="medication-completion-title" className="mt-5 text-2xl font-black text-emerald-900">{text(completionCopy.title)}</h2>
          <p className="mt-3 text-lg font-bold text-gray-700">{text(completionCopy.description)}</p>
          <p className="mt-2 text-sm text-gray-500">{text(slotsExpandedByDefault
            ? { id: 'Jika ingin memeriksa atau membatalkan catatan, langsung ketuk kartu obat di bawah.', zh: '若要查看或取消紀錄，請直接點擊下方藥品卡。' ,en: 'If ingin memeriksa or membatalkan record, directly ketuk card medication di bawah.' }
            : { id: 'Jika ingin memeriksa atau membatalkan catatan, ketuk bagian waktu makan tersebut.', zh: '若要查看或取消紀錄，請點選該服藥時段。' ,en: 'If ingin memeriksa or membatalkan record, ketuk bagian time meal tersebut.' })}</p>
          <button ref={completionDismissButtonRef} type="button" onClick={() => setCompletedSlotPrompt(null)} className="mt-6 min-h-14 w-full rounded-2xl bg-emerald-700 px-4 text-lg font-black text-white shadow-sm active:bg-emerald-800">
            {text({ id: 'Baik', zh: '知道了' ,en: 'Baik' })}
          </button>
        </div>
        </div>}

        {!loading && !errorMessage && groups.length === 0 && !hasPrnPlans && <section className="rounded-3xl border border-dashed border-slate-300 bg-white p-6 text-center shadow-sm">
          <div aria-hidden="true" className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-2xl font-black text-slate-500">—</div>
          <h2 className="mt-4 text-lg font-black text-slate-900">{text({ id: 'Belum ada jadwal obat', zh: '目前沒有服藥時段' ,en: 'Not yet ada schedule medication' })}</h2>
          <p className="mt-2 text-sm font-medium leading-6 text-slate-600">{text({ id: 'Daftar obat aktif untuk orang ini masih kosong.', zh: '這位照護對象目前沒有現役藥單。' ,en: 'List medication aktif for person this still empty.' })}</p>
          {canManageSelectedPatient && <button type="button" onClick={() => selectMedicationView('manage')} className="mt-5 min-h-12 rounded-2xl bg-sky-700 px-5 text-base font-black text-white shadow-sm transition-colors hover:bg-sky-800 active:bg-sky-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600 focus-visible:ring-offset-2">
            {text({ id: 'Buka pengaturan obat', zh: '前往排藥' ,en: "Open settings medication" })}
          </button>}
        </section>}

        {/* 固定用藥是今天最需要完成的照護動作，先呈現第一個時段；PRN 仍完整保留在固定藥單之後，避免首屏先被次要區塊佔滿。 */}
        <div className="space-y-4">
        {groups.map(([slot, slotPlans]) => {
          const progress = slotProgress.get(slot) ?? { doseTaken: 0, doseTotal: 0, quantity: { id: '', zh: '' ,en: "" } }
          const slotCollapsed = collapsedSlots.has(slot)
          const slotCompleted = completedSlots.has(slot)
          return (
          // 完成的餐次退成淺灰，未完成餐次維持白底；視線自然先落在還需要處理的藥。
          <section key={slot} className={`rounded-3xl border p-4 ${slotCompleted ? 'border-slate-300 bg-slate-100 shadow-none' : 'border-slate-200 bg-white shadow-sm'}`}>
            <h2 className="mb-3">
              <button
                type="button"
                onClick={() => setCollapsedSlots(current => {
                  const next = new Set(current)
                  if (next.has(slot)) next.delete(slot)
                  else next.add(slot)
                  return next
                })}
                aria-expanded={!slotCollapsed}
                className="flex min-h-11 w-full flex-col gap-1 rounded-xl px-2 py-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600 focus-visible:ring-offset-2"
              >
                <span className="flex items-center justify-between gap-3">
                  <span className={`text-base font-black ${slotCompleted ? 'text-slate-700' : 'text-gray-800'}`}>{text(medicationSlotText(slot))}</span>
                  <span aria-hidden="true" className={`shrink-0 text-lg font-bold ${slotCompleted ? 'text-slate-500' : 'text-gray-500'}`}>{slotCollapsed ? '⌄' : '⌃'}</span>
                </span>
                {/* 次數（服藥打卡幾次）與顆數（實際吞下幾顆）分兩個數字標示，因為同一次服藥可能不只一顆
                    （例如鉀離子藥常見單次 2 顆）；次數對不代表顆數對，照護者核對藥盒時兩個數字都要看。
                    收合且整餐已完成時，這行放大成跟藥名同級並加勾勾徽章，取代點擊提示，不必展開也能一眼確認。 */}
                {slotCollapsed && slotCompleted
                  ? <span className="flex items-center gap-2 text-base font-black text-slate-700">
                      <span aria-hidden="true" className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-sm text-white">✓</span>
                      <span className="tabular-nums">
                        {text({ id: `${progress.doseTaken}/${progress.doseTotal} dosis · ${progress.quantity.id} selesai`, zh: `${progress.doseTaken}/${progress.doseTotal} 次・${progress.quantity.zh}已完成` ,en: `${progress.doseTaken}/${progress.doseTotal} doses · ${progress.quantity.en} complete` })}
                      </span>
                    </span>
                  : <span className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                      <span className={`text-sm font-bold tabular-nums ${slotCompleted ? 'text-slate-600' : 'text-gray-600'}`}>
                        {text({ id: `${progress.doseTaken}/${progress.doseTotal} dosis · ${progress.quantity.id}`, zh: `${progress.doseTaken}/${progress.doseTotal} 次・${progress.quantity.zh}` ,en: `${progress.doseTaken}/${progress.doseTotal} doses · ${progress.quantity.en}` })}
                      </span>
                      <span className={`text-xs font-semibold ${slotCompleted ? 'text-slate-500' : 'text-gray-500'}`}>
                        {slotCollapsed ? text({ id: 'Ketuk untuk membuka daftar obat', zh: '點擊展開藥品' ,en: 'Ketuk for membuka daftar medication' }) : text({ id: 'Ketuk untuk menutup', zh: '點擊收合' ,en: 'Ketuk for menutup' })}
                      </span>
                    </span>}
              </button>
            </h2>
            {!slotCollapsed && <div className="space-y-2">
              {slotPlans.flatMap(plan => Array.from({ length: plan.dose_count }, (_, index) => {
                const doseNumber = index + 1
                const existing = logs.find(log => log.plan_id === plan.id && log.dose_number === doseNumber)
                const key = `${plan.id}:${doseNumber}`
                // 已服用的矮版卡片仍要保留分類，讓照護者收合後掃過整段藥單也能一眼確認「降血壓、抗凝血都吃了幾顆」。
                const category = resolveMedicationCategory(plan.medication.atc_code)
                return (
                  <button
                    key={key}
                    type="button"
                    disabled={Boolean(busyKey)}
                    aria-pressed={Boolean(existing)}
                    onClick={event => toggleDose(plan, doseNumber, existing, event.currentTarget)}
                    className={existing
                      // 已服用後改成單行、矮版的卡片，讓長輩滑一整段時段時不必一直看到吃藥前才需要的外觀圖／色形。
                      ? 'flex min-h-16 w-full items-center gap-3 rounded-2xl border-2 border-emerald-600 bg-emerald-100 px-4 py-2.5 text-left shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600 focus-visible:ring-offset-2 disabled:opacity-50'
                      // 黃色代表「還要處理」；未服用仍要完整呈現外觀，讓照護者核對手上的藥是不是這顆。
                      : 'flex w-full flex-col rounded-2xl border-2 border-amber-400 bg-amber-50 p-4 text-left shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600 focus-visible:ring-offset-2 disabled:opacity-50'}
                  >
                    {existing ? <>
                      <span aria-hidden="true" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-700 text-base text-white">✓</span>
                      {/* 已服用只留藥名＋分類兩行；次要名稱／外觀是吃藥前才需要核對的細節，這裡省略讓卡片維持矮版。 */}
                      <span className="min-w-0 flex-1 truncate">
                        {/* 沿用同一張卡的 emerald 色階做深淺分層，藥名深、分類淺，避免另外混入紅／洋紅跟「已完成」的綠色語意打架。 */}
                        <span className="block truncate text-base font-black text-emerald-950">{resolveMedicationNames(plan.medication, locale, nameEnglishFirst).primary}</span>
                        {category && <span className="block truncate text-sm font-black text-emerald-700">{text(category)}</span>}
                      </span>
                      <span className="shrink-0 text-right text-sm font-black text-emerald-900">
                        {busyKey === key
                          ? text({ id: 'Membatalkan…', zh: '取消中…' ,en: 'Cancelling…' })
                          : <>
                            {/* 勾勾圖示已經代表「已服用」，這裡只留時間，不重複整句「已服用於」讓行高多長一行。 */}
                            <span className="block">{dayjs(existing.taken_at).tz('Asia/Taipei').format('HH:mm')}</span>
                            <span className="block text-xs font-bold text-emerald-700">{text({ id: 'Ketuk untuk batalkan', zh: '點擊取消' ,en: "Tap for batalkan" })}</span>
                          </>}
                      </span>
                    </> : <>
                      <span className="min-w-0 flex-1">
                        <MedicationNameHeading medication={plan.medication} locale={locale} englishFirst={nameEnglishFirst} size="lg" />
                        <span className="block text-base font-bold text-slate-700">{formatMedicationLabel(plan.medication.brand_name, plan.medication.strength_mg, plan.medication.strength_label)}</span>
                        {/* 服藥時只留照片後的單一外觀資訊；辨識代碼留在調藥介面，避免日常卡片重複又過高。 */}
                        <MedicationAppearance
                          medication={plan.medication}
                          showAppearanceNote={false}
                          showCategory={false}
                          details={`${plan.medication.generic_name} · ${formatDoseAmountLocalized(plan.dose_amount, plan.medication.dosage_form, locale)}${plan.as_needed ? ` · ${text({ id: 'Bila perlu', zh: '需要時服用' ,en: 'As needed' })}` : ''}${plan.dose_count > 1 ? ` · ${text({ id: `Pil ke-${doseNumber}`, zh: `第 ${doseNumber} 顆` ,en: `Pill ${doseNumber}` })}` : ''}`}
                        />
                      </span>
                      {/* 狀態獨立放到底部，避免右欄擠壓藥名。 */}
                      <span className="mt-3 flex w-full flex-col items-end border-t border-amber-300 pt-3 text-base font-black text-amber-950">
                        {busyKey === key
                          ? text({ id: 'Mencatat…', zh: '記錄中…' ,en: 'Menrecord…' })
                          : <span><span aria-hidden="true" className="mr-1.5 inline-flex h-7 w-7 items-center justify-center rounded-full bg-amber-500 text-base text-white">!</span>{text({ id: 'Belum diminum · ketuk untuk mencatat', zh: '尚未服用・點擊記錄' ,en: 'Not Taken/Clicked' })}</span>}
                      </span>
                    </>}
                  </button>
                )
              }))}
            </div>}
          </section>
          )
        })}
        </div>

        {!loading && !errorMessage && <PrnMedicationSection
          plans={plans.filter(plan => plan.as_needed)}
          events={prnEvents}
          assessments={prnAssessments}
          careDate={today}
          onRecord={recordPrn}
          onVoid={voidPrn}
          onAssessEffect={assessPrnEffect}
          onAssess={assessPrn}
        />}

        {/* 「變更紀錄」記的是藥單被改過什麼；這裡回答的是「這禮拜到底吃了幾次」，兩者互補。 */}
        <ModuleTrendSection moduleId="medication" titleId="medication-module-trend-title">
          {days => <MedicationDoseHistoryPanel patientId={selectedPatientId} days={days} />}
        </ModuleTrendSection>
      </div>}

      <MedicationDetailDialog plan={detailPlan} locale={locale} nameEnglishFirst={nameEnglishFirst} onClose={() => setDetailPlan(null)} />
    </section>
  )
}
