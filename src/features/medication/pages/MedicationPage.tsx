/*
檔案用途：提供每日服藥 tab，讀取藥單、記錄每顆藥是否服用，並可進入授權的調藥介面。
所在層：src/features/medication/pages；是照護流程中的藥物操作畫面。
主要關聯：使用 TabHeader 與 SubjectSwitcher 共用頁首和病人選擇，資料操作集中在 lib/medication/medications 與 MedicationAdminSection；
本週藥單、單一時段卡片與兩個確認視窗已抽成 MedicationWeekView／MedicationSlotCard／MedicationCompletionDialog／
MedicationCancelDoseDialog，頁面本身只負責讀取資料、持有狀態並安排這些元件（AGENTS.md「介面元件化規範」）。
*/
import { lazy, useEffect, useMemo, useRef, useState } from 'react'
import dayjs from 'dayjs'
import 'dayjs/locale/id'
import 'dayjs/locale/zh-tw'
import timezone from 'dayjs/plugin/timezone'
import utc from 'dayjs/plugin/utc'
import { getMedicationSyncErrorKind } from '../../../lib/medication/medicationToday'
import { CARE_DAY_TIMEZONE, careDateKey } from '../../../lib/careDay'
import { clearMedicationDose, completesRequiredMedicationSlot, isCurrentMedicationView, readMedicationDay, saveMedicationDose, type MedicationPlanView } from '../../../lib/medication/medications'
import { savePrnDailyAssessment, savePrnMedicationEvent, updatePrnMedicationEffectStatus, voidPrnMedicationEvent, type SavePrnMedicationEventInput } from '../../../lib/medication/prnMedication'
import { compareMedicationSlots, getMedicationSlotCollapseDefaults, medicationSlotQuantityProgressText } from '../../../lib/medication/medicationSchedule'
import type { MedicationIntakeLog, PrnMedicationDailyAssessment, PrnMedicationEvent } from '../../../types/database'
import type { MedicationManagementPatient, PatientIdentity } from '../../../lib/auth'
import { SubjectSwitcher } from '../../../components/ui/SubjectSwitcher'
import { TabHeader } from '../../../components/ui/TabHeader'
import { MedicationAdminSection } from '../components/MedicationAdminSection'
import { MedicationCancelDoseDialog, type PendingMedicationCancellation } from '../components/MedicationCancelDoseDialog'
import { MedicationCompletionDialog } from '../components/MedicationCompletionDialog'
import { MedicationDetailDialog } from '../components/MedicationDetailDialog'
import { MedicationSlotCard, type MedicationSlotProgress } from '../components/MedicationSlotCard'
import { MedicationViewTabs, type MedicationView } from '../components/MedicationViewTabs'
import { MedicationWeekView } from '../components/MedicationWeekView'
import { PrnMedicationSection } from '../components/PrnMedicationSection'
import { common, useI18n, type LocalizedText } from '../../../lib/i18n'
import { ModuleTrendSection } from '../../../components/daily-care/ModuleTrendSection'

dayjs.extend(utc)
dayjs.extend(timezone)
dayjs.locale('id')

// 圖表套件只在照護者展開趨勢時才下載，不進入每日照護的初始載入路徑。
const MedicationDoseHistoryPanel = lazy(() => import('../components/MedicationDoseHistoryPanel').then(m => ({ default: m.MedicationDoseHistoryPanel })))

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
  const [collapsedSlots, setCollapsedSlots] = useState<Set<string>>(new Set())
  const collapseDefaultsInitialized = useRef(false)
  const [completedSlotPrompt, setCompletedSlotPrompt] = useState<string | null>(null)
  const [pendingMedicationCancellation, setPendingMedicationCancellation] = useState<PendingMedicationCancellation | null>(null)
  // 只有本週藥單是唯讀掃視畫面，點藥名才彈出詳情；服藥打卡點藥卡是用來記錄服用，兩者操作意圖不同，不共用同一個狀態。
  const [detailPlan, setDetailPlan] = useState<MedicationPlanView | null>(null)
  const [restoreCancellationTriggerFocus, setRestoreCancellationTriggerFocus] = useState(false)
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
  const canManageSelectedPatient = manageablePatients.some(patient => patient.patientId === selectedPatientId)

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

  // PRN 沒有吃也不代表這餐沒完成，完成標記必須與跳出的完成卡使用同一套固定藥規則，因此只從已排除 PRN 的 requiredDoses 取值。
  const slotProgress = useMemo(() => {
    const map = new Map<string, MedicationSlotProgress>()
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

  const toggleDose = async (plan: MedicationPlanView, doseNumber: number, existing: MedicationIntakeLog | undefined, trigger?: HTMLButtonElement) => {
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
          // 繁體中文註解：移除原本重複的實驗性「拍藥袋辨識」區塊（MedicationPhotoOcrSection），
          // 因 MedicationAdminSection 內部已整合更完整、能產生結構化草稿的「AI 藥袋辨識」（MedicationAiDraftSection），
          // 避免照護者在同一個排藥分頁看到兩個功能重疊的辨識入口。
          ? <MedicationAdminSection
              key={selectedPatientId}
              patientId={selectedPatientId}
              patientDisplayName={manageablePatients.find(patient => patient.patientId === selectedPatientId)?.displayName ?? ''}
              isOwnPatient={selectedPatientId === ownPatientId}
              nameEnglishFirst={nameEnglishFirst}
              onMedicationPlanChanged={() => setPlanRefreshVersion(version => version + 1)}
            />
          : <section className="rounded-3xl border border-sky-200 bg-sky-50 p-5 shadow-sm" role="status">
            {/* 未授權時提示文字英文修正 */}
            <h2 className="text-lg font-black text-sky-950">{text({ id: 'Pilih orang yang dapat Anda atur', zh: '請選擇您有權排藥的對象' ,en: "Please select a care recipient you are authorized to manage" })}</h2>
            <p className="mt-2 text-sm font-medium leading-6 text-sky-900">{text({ id: 'Pengaturan obat hanya tersedia untuk penerima perawatan yang diizinkan.', zh: '藥單管理只會對您被授權的照護對象開放。' ,en: 'Medication settings are available only for care recipients you are authorized to manage.' })}</p>
          </section>}
      </div>}

      {medicationView === 'week' && <MedicationWeekView
        loading={loading}
        errorMessage={errorMessage}
        groups={groups}
        prnPlans={plans.filter(plan => plan.as_needed)}
        locale={locale}
        nameEnglishFirst={nameEnglishFirst}
        onSelectPlan={setDetailPlan}
      />}

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
            {text({ id: `Total ${requiredQuantity.id}`, zh: `共 ${requiredQuantity.zh}` ,en: `Total ${requiredQuantity.en}` })}
          </p>}
          {requiredTotal > 0 && <div className="mt-3 h-2 overflow-hidden rounded-full bg-white" aria-hidden="true">
            <div className="h-full rounded-full bg-sky-600" style={{ width: `${Math.min(100, (requiredTaken / requiredTotal) * 100)}%` }} />
          </div>}
          <p className="mt-2 text-sm font-medium text-sky-900">{requiredTotal > 0
            ? text({ id: 'Ketuk kartu obat untuk mencatat obat yang sudah diminum.', zh: '點擊藥品卡片，記錄已服用的藥物。' ,en: 'Tap a medication card to record a dose as taken.' })
            : text({ id: 'Periksa daftar obat bila resep baru belum ditambahkan.', zh: '如果剛有新醫囑，請到「排藥」查看。' ,en: 'If new prescriptions were issued, check "Manage Schedule".' })}</p>
        </section>

        {loading && <p className="py-12 text-center text-base text-gray-500">{text(common.loading)}</p>}
        {/* 錯誤保留雙語值，切換語言時只重畫文字，不能因此重抓已讀取的藥單。 */}
        {errorMessage && <p role="alert" className="rounded-xl bg-red-50 p-3 text-base font-semibold text-red-700">{text(errorMessage)}</p>}

        <MedicationCancelDoseDialog
          pending={pendingMedicationCancellation}
          busy={Boolean(busyKey)}
          restoreFocus={restoreCancellationTriggerFocus}
          triggerRef={cancellationTriggerRef}
          setRestoreFocus={setRestoreCancellationTriggerFocus}
          onDismiss={() => setPendingMedicationCancellation(null)}
          onConfirm={confirmMedicationCancellation}
        />

        <MedicationCompletionDialog
          slot={completedSlotPrompt}
          slotsExpandedByDefault={slotsExpandedByDefault}
          onDismiss={() => setCompletedSlotPrompt(null)}
        />

        {!loading && !errorMessage && groups.length === 0 && !hasPrnPlans && <section className="rounded-3xl border border-dashed border-slate-300 bg-white p-6 text-center shadow-sm">
          <div aria-hidden="true" className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-2xl font-black text-slate-500">—</div>
          {/* 空狀態與排藥按鈕英文翻譯修正 */}
          <h2 className="mt-4 text-lg font-black text-slate-900">{text({ id: 'Belum ada jadwal obat', zh: '目前沒有服藥時段' ,en: 'No medication schedule' })}</h2>
          <p className="mt-2 text-sm font-medium leading-6 text-slate-600">{text({ id: 'Daftar obat aktif untuk orang ini masih kosong.', zh: '這位照護對象目前沒有現役藥單。' ,en: 'The active medication list for this individual is currently empty.' })}</p>
          {canManageSelectedPatient && <button type="button" onClick={() => selectMedicationView('manage')} className="mt-5 min-h-12 rounded-2xl bg-sky-700 px-5 text-base font-black text-white shadow-sm transition-colors hover:bg-sky-800 active:bg-sky-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600 focus-visible:ring-offset-2">
            {text({ id: 'Buka pengaturan obat', zh: '前往排藥' ,en: "Go to Manage Schedule" })}
          </button>}
        </section>}

        {/* 固定用藥是今天最需要完成的照護動作，先呈現第一個時段；PRN 仍完整保留在固定藥單之後，避免首屏先被次要區塊佔滿。 */}
        <div className="space-y-4">
        {groups.map(([slot, slotPlans]) => (
          <MedicationSlotCard
            key={slot}
            slot={slot}
            slotPlans={slotPlans}
            progress={slotProgress.get(slot) ?? { doseTaken: 0, doseTotal: 0, quantity: { id: '', zh: '' ,en: "" } }}
            collapsed={collapsedSlots.has(slot)}
            completed={completedSlots.has(slot)}
            busyKey={busyKey}
            logs={logs}
            locale={locale}
            nameEnglishFirst={nameEnglishFirst}
            onToggleCollapse={() => setCollapsedSlots(current => {
              const next = new Set(current)
              if (next.has(slot)) next.delete(slot)
              else next.add(slot)
              return next
            })}
            onToggleDose={(plan, doseNumber, existing, trigger) => { void toggleDose(plan, doseNumber, existing, trigger) }}
          />
        ))}
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
