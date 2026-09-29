/*
檔案用途：抽出 MedicationAdminSection 原本 37 個 useState 與所有讀寫邏輯，讓元件檔只剩下 JSX。
所在層：src/features/medication/hooks；藥單管理表單專用的容器 hook，不對外通用。
主要關聯：由 MedicationAdminSection／ExistingPlanForm／NewMedicationForm 共用同一份回傳值；
  資料存取仍透過 lib/medication/medicationAdmin、lib/medication/medicationCatalog 等既有資料層完成。
  本檔是一個外殼 hook：狀態拆成三個協作 hook（useExistingPlanFormState／useNewMedicationFormState／
  useMedicationAdminData，對應「既有醫囑表單」「新藥品表單」「資料載入與目錄搜尋」三組職責），
  但 chooseMedication／startEditingPlan／applyDraft／addExisting／addNew 等操作同時牽動兩組以上
  狀態，屬於跨組業務邏輯，刻意留在這個外殼裡，不強行塞進任何一個子 hook（AGENTS.md Rule A：
  語意動詞函數優先於過度切片）。對外的回傳形狀維持不變，呼叫端不需要跟著這次拆分修改。
*/
import { useEffect, useMemo, useRef, useState } from 'react'
import { isMedicationAppearancePhotoPath } from '../../../lib/medication/medicationAppearancePhotos'
import {
  addExistingMedicationPlan,
  createMedicationPlan,
  findMedicationPlanConflict,
  listActiveMedicationPlansForMedication,
  resolveMedicationSelection,
  setMedicationPlanActive,
  type AdminMedicationPlan,
  type MedicationCorrectionInput,
} from '../../../lib/medication/medicationAdmin'
import { parseDosageFormFromText, parseStrengthFromDrugName } from '../../../lib/medication/medicationCatalog'
import type { MedicationCatalogResult } from '../../../lib/medication/medicationCatalog'
import type { MedicationDraftItem } from '../../../lib/medication/medicationAiDraft'
import { formatDoseAmountLocalized, formatMedicationLabel } from '../../../lib/medication/medications'
import { medicationSlotText } from '../../../lib/medication/medicationSchedule'
import { matchFrequencyPreset } from '../../../lib/medication/medicationFrequencyPresets'
import { DOSAGE_FORM_LABELS, medicationErrorStatus, parseMgStrengthLabel, validDoseAmount } from '../../../lib/medication/medicationAdminFormHelpers'
import { type LocalizedText, useI18n } from '../../../lib/i18n'
import { isDemoMode } from '../../../lib/demoStorage'
import { useConfirm } from '../../../hooks/useConfirm'
import { useExistingPlanFormState } from './useExistingPlanFormState'
import { useNewMedicationFormState } from './useNewMedicationFormState'
import { useMedicationAdminData } from './useMedicationAdminData'

// withDosageForm 原本定義在這個檔案；移到 lib/medication/medicationAdminFormHelpers 後在這裡重新匯出，
// 讓 MedicationAdminSection.tsx 等既有呼叫端不必改 import 路徑。
export { withDosageForm } from '../../../lib/medication/medicationAdminFormHelpers'

export interface MedicationAdminFormArgs {
  patientId: string
  isOwnPatient: boolean
  onMedicationPlanChanged?: () => void
  externalCatalogQuery?: string | null
  onExternalCatalogQueryConsumed?: () => void
}

// 回傳值刻意打包成單一物件：ExistingPlanForm／NewMedicationForm 用 `ReturnType<typeof useMedicationAdminForm>`
// 取得完整的狀態與操作，不需要各自宣告一份容易漏欄位的 props 介面。
export function useMedicationAdminForm({ patientId, isOwnPatient, onMedicationPlanChanged, externalCatalogQuery, onExternalCatalogQueryConsumed }: MedicationAdminFormArgs) {
  const { locale, text } = useI18n()
  const { confirm, dialog: confirmDialog } = useConfirm()

  // ── 既有醫囑表單狀態（見 useExistingPlanFormState） ─────────────────
  const {
    medicationId, setMedicationId,
    selectionConfirmed, setSelectionConfirmed,
    existingScheduleSlot, setExistingScheduleSlot,
    existingScheduleSlots, setExistingScheduleSlots,
    existingDoseAmount, setExistingDoseAmount,
    existingAsNeeded, setExistingAsNeeded,
    editingPlanId, setEditingPlanId,
    catalogQuery, setCatalogQuery,
    existingChangeReason, setExistingChangeReason,
    isCatalogSearchOpen, setIsCatalogSearchOpen,
    resetPlanFields,
  } = useExistingPlanFormState()

  // ── 新藥品表單狀態（見 useNewMedicationFormState） ───────────────────
  const {
    brandName, setBrandName,
    brandNameZh, setBrandNameZh,
    genericName, setGenericName,
    strengthMg, setStrengthMg,
    productKind, setProductKind,
    strengthLabel, setStrengthLabel,
    dosageForm, setDosageForm,
    newScheduleSlot, setNewScheduleSlot,
    newScheduleSlots, setNewScheduleSlots,
    newDoseAmount, setNewDoseAmount,
    newAsNeeded, setNewAsNeeded,
    appearanceColor, setAppearanceColor,
    appearanceShape, setAppearanceShape,
    appearancePhotoUrl, setAppearancePhotoUrl,
    isCorrectingMedication, setIsCorrectingMedication,
    hasCorrectionEdits, setHasCorrectionEdits,
    newChangeReason, setNewChangeReason,
  } = useNewMedicationFormState()

  // ── 資料載入與目錄搜尋狀態（見 useMedicationAdminData） ───────────────
  const {
    plans,
    medications,
    loading,
    registryResults,
    searchingRegistry,
    selectedCatalogProduct, setSelectedCatalogProduct,
    medicationById,
    activeAccount,
    canEditSubject,
    personalMedications,
    activePlanGroups,
    dailyMedicationCount,
    dailyQuantity,
    catalogResults,
    filteredRegistryResults,
    refresh: refreshAdminData,
  } = useMedicationAdminData({ patientId, catalogQuery, locale })

  // ── 共用 UI 狀態 ─────────────────────────────────────────────────
  const [isAddPanelOpen, setIsAddPanelOpen] = useState(false)
  const [status, setStatus] = useState<LocalizedText | null>(null)
  const [saving, setSaving] = useState(false)
  // 「調整」按鈕原本只是把畫面外的表單展開，照護者在藥卡旁邊看不到任何變化，才會覺得按了沒作用；
  // 這個 ref 與旗標讓表單展開後主動捲到眼前。
  const editPanelRef = useRef<HTMLDetailsElement>(null)
  const [pendingEditScroll, setPendingEditScroll] = useState(false)
  // 「新增未驗證自訂藥品」原本是 NewMedicationForm 裡完全獨立、預設收合的原生 <details>，
  // 跟 isAddPanelOpen（只控制 ExistingPlanForm 那個手風琴）無關。applyDraft 套用草稿後
  // 若不主動展開＋捲動這裡，照護者按下「套用」會看起來毫無反應（review finding，見 applyDraft 內註解）。
  const newMedicationPanelRef = useRef<HTMLDetailsElement>(null)
  const [isNewMedicationPanelOpen, setIsNewMedicationPanelOpen] = useState(false)
  const [pendingNewMedicationScroll, setPendingNewMedicationScroll] = useState(false)

  // ── 跨組衍生值：同時依賴「資料載入」（plans／medicationById）與「既有醫囑表單」
  //    （medicationId／editingPlanId／existingScheduleSlot(s)）兩組狀態，不屬於任一子 hook。
  const selectedMedication = medicationById.get(medicationId)
  const editingPlan = useMemo(() => plans.find(plan => plan.id === editingPlanId) ?? null, [editingPlanId, plans])
  // 已被同一顆藥佔用的時段：調整時要排除自己，否則會把「維持原時段」誤標成衝突。
  const samePlansForSelectedMedication = useMemo(
    () => (selectedMedication ? listActiveMedicationPlansForMedication(plans, medicationId, editingPlanId) : []),
    [editingPlanId, medicationId, plans, selectedMedication],
  )
  const occupiedSlots = useMemo(() => new Set(samePlansForSelectedMedication.map(plan => plan.schedule_slot)), [samePlansForSelectedMedication])
  const slotConflictPlan = useMemo(
    () => (selectedMedication ? findMedicationPlanConflict(plans, medicationId, existingScheduleSlot, editingPlanId) : null),
    [editingPlanId, existingScheduleSlot, medicationId, plans, selectedMedication],
  )
  // 繁體中文註解：在多時段複選模式下，計算所有選取時段中與既有有效醫囑衝突的項目清單。
  // 避免過去只看單一時段 existingScheduleSlot 導致其他勾選時段在未經明確提示與確認下被靜默覆蓋。
  const conflictedPlans = useMemo(() => {
    if (!selectedMedication || editingPlanId) return []
    return existingScheduleSlots
      .map(slot => findMedicationPlanConflict(plans, medicationId, slot, editingPlanId))
      .filter((p): p is AdminMedicationPlan => Boolean(p))
  }, [editingPlanId, existingScheduleSlots, medicationId, plans, selectedMedication])
  // 新增時撞到同一顆藥的同一時段＝實際上是覆蓋；調整時撞到別筆＝會產生兩筆重複醫囑，必須擋下來。
  const overwriteTarget = editingPlanId ? null : (conflictedPlans[0] ?? slotConflictPlan)
  const overwriteTargets = editingPlanId ? [] : conflictedPlans
  const blockedByConflict = Boolean(editingPlanId && slotConflictPlan)

  const refresh = async () => {
    const data = await refreshAdminData()
    setMedicationId(current => resolveMedicationSelection(current, data.medications))
  }

  const refreshAfterSave = async (successMessage: LocalizedText) => {
    setStatus(successMessage)
    try {
      await refresh()
      // 父層服藥卡片有自己的讀取狀態；成功後主動通知它重抓，否則要靠整頁重整才看得到新醫囑。
      onMedicationPlanChanged?.()
    } catch (error) {
      // 儲存已完成時不能把後續重抓失敗誤報成儲存失敗，否則可能誘發重複修改醫囑。
      console.error('[medication admin refresh error]', error)
      setStatus({ id: `${successMessage.id} Namun daftar terbaru gagal dimuat; muat ulang lalu periksa kembali.`, zh: `${successMessage.zh} 但重新讀取失敗，請重新整理後再核對。` ,en: `${successMessage.en} However, the latest list could not be loaded. Refresh and check again.` })
    }
  }

  // 病人層外觀覆蓋（issue #759）存檔／還原走獨立的 useMedicationAppearanceOverride，不經過
  // addExisting／refreshAfterSave；面板自己已經有成功訊息，這裡只重抓清單，不覆寫 status，
  // 否則面板剛顯示的「已儲存此人專屬外觀」會被這裡的訊息立刻蓋掉。
  const refreshAfterAppearanceOverrideChange = async () => {
    try {
      await refresh()
      onMedicationPlanChanged?.()
    } catch (error) {
      console.error('[medication admin appearance override refresh error]', error)
    }
  }

  // 多時段批次送出（一次 RPC 對應一個時段）若在中途失敗，前面已成功的時段仍留在資料庫裡；
  // 這裡一律重抓清單讓照護者看到目前實際狀態，並在選了多個時段時提醒可能已部分儲存，
  // 避免在不知情的情況下對同樣的時段重複送出。
  const notifyMultiSlotSaveFailure = async (slotCount: number, error: unknown, fallback: LocalizedText) => {
    console.error('[medication admin multi-slot save error]', error)
    try {
      await refresh()
      onMedicationPlanChanged?.()
    } catch (refreshError) {
      console.error('[medication admin multi-slot save refresh error]', refreshError)
    }
    const baseStatus = medicationErrorStatus(error, fallback)
    if (slotCount <= 1) { setStatus(baseStatus); return }
    setStatus({
      id: `${baseStatus.id} Sebagian jadwal yang dipilih mungkin sudah tersimpan; periksa daftar obat saat ini sebelum mencoba lagi.`,
      zh: `${baseStatus.zh}已選取的時段中可能有部分已成功儲存，請先核對目前藥單清單再決定是否重試，避免重複送出。`,
      en: `${baseStatus.en} Some of the selected schedules may have already been saved; please review the current medication list before retrying.`,
    })
  }

  const resetSelection = () => {
    // 一定要連 editingPlanId 一起清掉：留著它的話，下一次挑別顆藥送出會被當成「更新剛才那筆醫囑」，
    // 等於把原本的藥直接換成另一顆藥。
    setMedicationId('')
    setSelectedCatalogProduct(null)
    setSelectionConfirmed(false)
    setCatalogQuery('')
    setExistingChangeReason('')
    setEditingPlanId(null)
    setIsCorrectingMedication(false)
    setIsCatalogSearchOpen(false)
    setHasCorrectionEdits(false)
    resetPlanFields()
  }

  const finishAddFlow = () => {
    // 成功後立即清掉本次選取並收合表單，避免照護者把同一筆醫囑連按兩次送出。
    resetSelection()
    setIsAddPanelOpen(false)
  }

  const startEditingPlan = (plan: AdminMedicationPlan) => {
    // 調整既有醫囑時只帶入這一筆的內容，並清掉官方目錄選取，避免畫面同時出現兩張「已選」卡片。
    setMedicationId(plan.medication_id)
    setSelectedCatalogProduct(null)
    setSelectionConfirmed(true)
    setEditingPlanId(plan.id)
    setExistingScheduleSlot(plan.schedule_slot)
    setExistingScheduleSlots([plan.schedule_slot])
    setExistingDoseAmount(String(plan.dose_amount))
    setExistingAsNeeded(plan.as_needed)
    setExistingChangeReason('')
    setCatalogQuery('')
    setStatus(null)
    setIsAddPanelOpen(true)
    setPendingEditScroll(true)
    // 帶入這顆藥「目前登錄」的劑型／外觀，讓「修正藥品資料」的表單有正確初始值，
    // 而不是每次都要照護者從空白重填一次已經對的欄位。
    const medication = medicationById.get(plan.medication_id)
    setBrandName(medication?.brand_name ?? '')
    setBrandNameZh(medication?.brand_name_zh ?? '')
    setGenericName(medication?.generic_name ?? '')
    // 營養品的 strength_mg 是 NULL；String(null) 會變成字面上的 "null"，留白才是正確的「沒有 mg 數字」表示。
    setStrengthMg(medication?.strength_mg != null ? String(medication.strength_mg) : '')
    setDosageForm(medication?.dosage_form ?? 'tablet')
    setAppearanceColor(medication?.appearance_color ?? '')
    setAppearanceShape(medication?.appearance_shape ?? '')
    setAppearancePhotoUrl(medication?.appearance_photo_url ?? '')
    setIsCorrectingMedication(false)
    setHasCorrectionEdits(false)
  }

  useEffect(() => {
    if (!pendingEditScroll) return
    // details 要先展開才有正確位置；等一個 frame 之後再捲動，否則手機上會停在原地，看起來就像按鈕沒有反應。
    const timer = window.setTimeout(() => {
      editPanelRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' })
      setPendingEditScroll(false)
    }, 60)
    return () => {
      // 測試環境在 afterEach 可能提前 teardown window，避免非同步 cleanup 拋出 ReferenceError
      if (typeof window !== 'undefined') window.clearTimeout(timer)
      else clearTimeout(timer)
    }
  }, [pendingEditScroll])

  useEffect(() => {
    if (!pendingNewMedicationScroll) return
    // 同一個理由：<details> 要先展開才有正確位置，等一個 frame 之後再捲動。
    const timer = window.setTimeout(() => {
      newMedicationPanelRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' })
      setPendingNewMedicationScroll(false)
    }, 60)
    return () => {
      // 測試環境在 afterEach 可能提前 teardown window，避免非同步 cleanup 拋出 ReferenceError
      if (typeof window !== 'undefined') window.clearTimeout(timer)
      else clearTimeout(timer)
    }
  }, [pendingNewMedicationScroll])

  useEffect(() => {
    // 調藥面板可隨共同 SubjectSwitcher 切換對象；依 patientId 重抓，避免把前一人的藥單留在新對象名下。
    // 讀取藥單失敗英文翻譯修正
    refresh().catch(error => { console.error('[medication admin read error]', error); setStatus({ id: 'Daftar obat gagal dimuat. Periksa internet lalu coba lagi.', zh: '讀取藥單失敗，請確認網路後再試。' ,en: 'Failed to load medication list. Check your connection and try again.' }) })
    // refresh 每次 render 都重建；只依 patientId 觸發，避免狀態更新造成無限重讀。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patientId])

  useEffect(() => {
    // 為什麼直接借用既有搜尋欄位：OCR 只是幫忙少打幾個字，最終仍要走同一套「搜尋→確認→選時段→送出」流程，
    // 不能因為來源是照片就跳過人工確認這一關。
    if (!externalCatalogQuery) return
    setIsAddPanelOpen(true)
    setIsCatalogSearchOpen(true)
    setCatalogQuery(externalCatalogQuery)
    setMedicationId('')
    setSelectedCatalogProduct(null)
    setSelectionConfirmed(false)
    onExternalCatalogQueryConsumed?.()
    // onExternalCatalogQueryConsumed 每次 render 都可能重建；只依 externalCatalogQuery 觸發，避免重複展開表單。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [externalCatalogQuery])

  const chooseMedication = (id: string) => {
    // 候選項目每次重新點選都要求再次確認，避免快速切換相似藥名時沿用前一顆藥的確認。
    // 換藥＝不再是在調整原本那筆醫囑，editingPlanId 必須跟著歸零。
    setMedicationId(id); setSelectedCatalogProduct(null); setSelectionConfirmed(false); setEditingPlanId(null); resetPlanFields()
  }

  const chooseCatalogProduct = (product: MedicationCatalogResult) => {
    setSelectedCatalogProduct(product)
    setMedicationId('')
    setSelectionConfirmed(false)
    setEditingPlanId(null)
    resetPlanFields()
    setBrandNameZh(product.nameZh)
    setBrandName(product.nameEn || product.nameZh)
    setGenericName(product.ingredient ? product.ingredient.replace(/;;/g, '; ') : '')
    const parsedStrength = parseStrengthFromDrugName(`${product.nameZh} ${product.nameEn || ''}`)
    // 官方目錄品項一律是處方藥；剖析不到劑量就留白，不再預設 10——沒填就不能送出（文件 §4.3），
    // 避免照護者沒注意到留白被悄悄補成一個跟藥袋不符的假數字。
    setStrengthMg(parsedStrength > 0 ? String(parsedStrength) : '')
    setStrengthLabel('')
    setProductKind('drug')
    setDosageForm(parseDosageFormFromText(`${product.dosageForm ?? ''} ${product.nameZh}`))
  }

  // AI 藥袋草稿（issue #664）套用進「新增用藥」表單；刻意只動這一組狀態，完全不碰上面「既有醫囑」
  // 那組狀態（medicationId／catalogQuery／isCatalogSearchOpen 等)，因為草稿代表的是一顆表單還不認識、
  // 有待照護者核對的藥，不是在調整某一筆已經存在的醫囑——兩張表單本來就刻意分開（見檔頭與上方註解），
  // hook 測試會斷言套用草稿不會污染「調整既有醫囑」那組狀態。
  const applyDraft = (draft: MedicationDraftItem) => {
    setSelectedCatalogProduct(null)
    setMedicationId('')
    setSelectionConfirmed(false)
    setEditingPlanId(null)
    // 先整批重置成表單原本的空白／預設值，再疊上這次草稿有值的欄位——同一張藥袋常有兩種藥，
    // 若只在有值時才覆寫、null 時保留舊值，連續套用兩份不同藥品的草稿會讓上一顆藥殘留的劑型／
    // 劑量被誤套進這一顆藥，照護者卻看不出這是舊資料（review finding：這比留白更危險，
    // 因為欄位看起來「有填」不會被誤認成「沒讀到」）。
    setBrandName('')
    setGenericName('')
    setStrengthMg('')
    setStrengthLabel('')
    setProductKind('drug')
    setDosageForm('tablet')
    setNewDoseAmount('1')
    if (draft.brandName) setBrandName(draft.brandName)
    if (draft.genericName) setGenericName(draft.genericName)
    if (draft.strengthLabel) {
      const parsedStrength = parseMgStrengthLabel(draft.strengthLabel)
      // 剖析不出明確 mg 數字（mcg／mL／% 等其他單位）時，不再直接丟掉這段文字：改落到
      // strengthLabel 欄位讓照護者看得到、自己核對後決定要不要把種類改成營養品（文件 §4.3）。
      if (parsedStrength !== null) setStrengthMg(String(parsedStrength))
      else setStrengthLabel(draft.strengthLabel)
    }
    if (draft.dosageForm) setDosageForm(draft.dosageForm)
    if (draft.doseAmount !== null) setNewDoseAmount(String(draft.doseAmount))
    // 繁體中文註解：重設時段預設值，避免連續套用多個草稿項目時，上一筆辨識成功的時段殘留到未比對成功的第二筆藥品。
    setNewScheduleSlot('after_breakfast')
    setNewScheduleSlots(['after_breakfast'])
    // 繁體中文註解：利用台灣常見頻率預設組合智慧比對 AI 辨識出的 timesPerDay 與 timingHint。
    // 例如：一天三次且為餐後時，自動預選「早餐後、午餐後、晚餐後」；
    // 解決原本輸入藥物介面只能固定一次、需重複輸入 3 次的照護痛點。
    //
    // 為什麼沒有比對到就整段留白，不能用 timesPerDay 猜一組三餐時段（review finding）：
    // matchFrequencyPreset 在 timingHint 是空字串時就已經回傳「餐後」預設組合了；它會回傳 null
    // 只有一種情況——timingHint 有明確文字、但內容既不是餐前也不是餐後也不是「都可以」
    // （例如「每 8 小時」），代表 AI 讀到的時機資訊無法安全對應到三餐時段。這種 null 是
    // matchFrequencyPreset 刻意做的安全判斷，如果這裡再用 timesPerDay 兜一組「早午晚」硬填回去，
    // 等於把它的判斷蓋掉，讓表單自己填出一個來源文字沒說過的服藥時段。
    const matchedPreset = matchFrequencyPreset(draft.timesPerDay, draft.timingHint)
    if (matchedPreset && matchedPreset.slots.length > 0) {
      setNewScheduleSlots([...matchedPreset.slots])
      setNewScheduleSlot(matchedPreset.slots[0])
    }
    // 展開的是 NewMedicationForm 自己的 <details>，不是 isAddPanelOpen（那個只控制 ExistingPlanForm
    // 的「加入既有藥品」手風琴，跟這裡填的自訂新藥表單無關；套用草稿時已清空 selectedCatalogProduct／
    // medicationId，開那個手風琴不會顯示任何新東西，只會讓畫面看起來像沒反應——review finding）。
    setIsNewMedicationPanelOpen(true)
    setPendingNewMedicationScroll(true)
    setStatus(null)
  }

  const confirmMedicationChange = (action: LocalizedText, summary: string, reason: string) => {
    // 簡化確認流程：無論是自己還是被照顧者的藥單，均只顯示一次確認提示框，方便照護者快速操作。
    // 改用畫面內對話框（useConfirm）而不是 window.confirm：後者在部分行動瀏覽器連續彈出多次後
    // 會被直接封鎖或拋出例外，導致整個送出流程無聲中斷，照護者會看到「按了儲存沒反應」。
    const details = `\n\n${summary}\n${text({ id: 'Alasan', zh: '原因' ,en: 'Reason' })}：${reason.trim() || text({ id: 'Tidak diisi', zh: '未填寫' ,en: 'Not filled in' })}`
    const message = isOwnPatient
      ? text({ id: `Yakin ingin ${action.id} daftar obat sendiri?`, zh: `確定要${action.zh}自己的藥單嗎？` ,en: `Are you sure you want to ${action.en.toLowerCase()} your own medication list?` })
      : text({ id: `Yakin ingin ${action.id} daftar obat penerima perawatan? Pastikan sudah mencocokkan resep.`, zh: `確定要${action.zh}被照顧者的藥單嗎？請確認已依醫囑核對。` ,en: `Are you sure you want to ${action.en.toLowerCase()} the care recipient’s medication list? Confirm it matches the prescription.` })
    return confirm(message + details)
  }

  const planSummary = (medicationName: string, scheduleSlot: string, doseAmount: number, dosageForm?: string, asNeeded = false, doseCount = 1) =>
    `${text({ id: 'Rincian resep', zh: '醫囑摘要' ,en: 'Prescription summary' })}：${medicationName}／${text(medicationSlotText(scheduleSlot))}／${dosageForm ? formatDoseAmountLocalized(doseAmount, dosageForm, locale) : doseAmount}／${doseCount} ${text({ id: 'dosis', zh: '次' ,en: 'times' })}${asNeeded ? `／${text({ id: 'Bila perlu', zh: '需要時服用' ,en: 'As needed' })}` : ''}`

  const addExisting = async (event: React.FormEvent) => {
    event.preventDefault()
    // Enter 仍可送出整個 form；提交端也要確認，不能只依賴被隱藏的按鈕與欄位。
    // 單次劑量與藥品驗證英文修正
    if (!canEditSubject || (!medicationId && !selectedCatalogProduct) || (editingPlanId && !selectedMedication) || !selectionConfirmed || !validDoseAmount(existingDoseAmount)) return setStatus({ id: 'Konfirmasikan obat dan pilih dosis sekali minum yang benar.', zh: '請先確認藥品並選擇正確單次劑量。' ,en: 'Please confirm the medication and select a valid dose amount.' })
    // brandName 空白時 RPC 會直接略過整個藥品資料 upsert，讓照護者填好的修正無聲消失；
    // 與其讓它悄悄不生效，不如在送出前擋下並說明原因。
    if (hasCorrectionEdits && !brandName.trim()) return setStatus({ id: 'Data obat untuk koreksi belum lengkap. Muat ulang lalu coba lagi.', zh: '要修正的藥品資料不完整，請重新整理頁面後再試一次。' ,en: "Medication details for correction are incomplete. Please reload the page and try again." })
    // 跟「新增未驗證自訂藥品」表單套用一樣的規則：只收官方 https:// 網址或我們自己上傳產生的 bucket path，
    // 避免修正把 http:// 或打錯字的值存進共用目錄。
    if (hasCorrectionEdits && appearancePhotoUrl.trim() && !/^https:\/\//i.test(appearancePhotoUrl.trim()) && !isMedicationAppearancePhotoPath(appearancePhotoUrl.trim())) return setStatus({ id: 'Alamat foto harus dimulai dengan https://.', zh: '照片網址必須是 https:// 開頭。' ,en: 'The photo URL must start with https://.' })

    if (selectedMedication) {
      // 「藥品資料修正」摘要文字與送出用的 medicationCorrection，在編輯單一醫囑／加入既有藥品
      // 兩個分支完全一致（都是同一顆 selectedMedication），在這裡算一次即可，不必各自重複一份。
      const correctionLine = hasCorrectionEdits
        ? `\n${text({ id: 'Perbaikan obat ini (berlaku untuk SEMUA orang dan SEMUA jadwal yang memakai obat yang sama)', zh: '藥品資料修正（會套用到所有使用這顆藥的人與所有時段，不只這個人、不只這一筆）' ,en: "Medication details correction (applies to EVERYONE and ALL schedules using this same medication)" })}：${text({ id: 'Bentuk', zh: '劑型' ,en: "Dosage Form" })} ${text(DOSAGE_FORM_LABELS[dosageForm] ?? { id: dosageForm, zh: dosageForm ,en: dosageForm })}`
        : ''
      // 修正表單目前沒有「種類」欄位（單位 C 才會開放），所以種類與包裝劑量原文一律沿用選取藥品原本的值；
      // 這顆藥若是營養品，strength_mg 本來就是 NULL，不能用 0 頂替，否則會撞上 RPC 的 CHECK 而整筆修正失敗。
      const medicationCorrection: MedicationCorrectionInput | undefined = hasCorrectionEdits
        ? { brandName, brandNameZh, genericName, strengthMg: Number(strengthMg) || selectedMedication.strength_mg, dosageForm, appearanceColor, appearanceShape, appearancePhotoUrl: appearancePhotoUrl.trim(), productKind: selectedMedication.product_kind, strengthLabel: selectedMedication.strength_label }
        : undefined

      if (editingPlanId) {
        // ── 編輯既有單一醫囑模式 ──
        // 資料庫的 update 分支不會替我們去重；換到已被同一顆藥佔用的時段會留下兩筆重複醫囑，所以在送出前就擋下。
        if (blockedByConflict) return setStatus({ id: 'Waktu minum itu sudah punya resep obat yang sama. Ubah resep tersebut atau hapus dulu.', zh: '那個時段已經有同一顆藥的醫囑；請直接調整那一筆，或先移除它。' ,en: 'A prescription for this medication already exists for that time slot. Please edit or remove the existing prescription first.' })
        const medicationLabel = formatMedicationLabel(selectedMedication.brand_name, selectedMedication.strength_mg, selectedMedication.strength_label)
        const action = { id: 'memperbarui', zh: '調整' ,en: 'update' }
        if (!(await confirmMedicationChange(action, `${planSummary(medicationLabel, existingScheduleSlot, Number(existingDoseAmount), selectedMedication.dosage_form, existingAsNeeded)}${correctionLine}`, existingChangeReason))) return
        setSaving(true); setStatus(null)
        try {
          await addExistingMedicationPlan(medicationId, patientId, existingScheduleSlot, Number(existingDoseAmount), existingAsNeeded, existingChangeReason, editingPlanId, medicationCorrection)
          finishAddFlow(); await refreshAfterSave({ id: 'Resep obat sudah diperbarui.', zh: '已更新這筆醫囑。' ,en: 'This order has been updated.' })
        } catch (error) { console.error('[medication admin add plan error]', error); setStatus(medicationErrorStatus(error, { id: 'Penyimpanan gagal. Periksa internet lalu coba lagi.', zh: '儲存失敗，請確認網路後再試。' ,en: 'Saving failed, please check your network and try again.' })) } finally { setSaving(false) }
      } else {
        // ── 加入既有藥品模式（支援多時段複選）──
        const targetSlots = existingScheduleSlots
        if (targetSlots.length === 0) return setStatus({ id: 'Pilih minimal satu waktu minum.', zh: '請至少選擇一個服藥時段。', en: 'Please select at least one medication time slot.' })

        // 繁體中文註解：在送出前先找出所有選取時段中已有相同藥品有效醫囑的衝突清單（conflicts）。
        // 若存在衝突，動作文字改為「覆蓋並加入」或「覆蓋原本的醫囑」，並在確認對話框中逐一條列
        // 被覆蓋的時段與原本劑量，避免使用者在不知情的情況下蓋掉舊醫囑。
        const conflicts = targetSlots
          .map(slot => findMedicationPlanConflict(plans, medicationId, slot))
          .filter((p): p is AdminMedicationPlan => Boolean(p))
        const hasOverwrites = conflicts.length > 0
        const isAllOverwrites = hasOverwrites && conflicts.length === targetSlots.length

        const medicationLabel = formatMedicationLabel(selectedMedication.brand_name, selectedMedication.strength_mg, selectedMedication.strength_label)
        const action = isAllOverwrites
          ? { id: 'menimpa resep lama', zh: '覆蓋原本的醫囑', en: 'Overwrite existing prescription' }
          : hasOverwrites
          ? { id: 'menimpa dan menambahkan', zh: '覆蓋並加入', en: 'Overwrite and add' }
          : { id: 'menambahkan', zh: '新增', en: 'Add' }
        const slotsLabel = targetSlots.map(s => text(medicationSlotText(s))).join('、')
        const summary = planSummary(medicationLabel, slotsLabel, Number(existingDoseAmount), selectedMedication.dosage_form, existingAsNeeded, targetSlots.length)

        const overwriteDetailsLine = hasOverwrites
          ? `\n${text({ id: 'Peringatan: Akan menimpa resep lama pada waktu berikut', zh: '注意：將會覆蓋以下時段原本的醫囑', en: 'Notice: Will overwrite existing prescription at following schedules' })}：` +
            conflicts
              .map(p => `${text(medicationSlotText(p.schedule_slot))}（${formatDoseAmountLocalized(p.dose_amount, selectedMedication.dosage_form, locale)}${p.as_needed ? `／${text({ id: 'Bila perlu', zh: '需要時服用', en: 'As needed' })}` : ''}）`)
              .join('、')
          : ''

        if (!(await confirmMedicationChange(action, `${summary}${overwriteDetailsLine}${correctionLine}`, existingChangeReason))) return
        setSaving(true); setStatus(null)
        try {
          for (const slot of targetSlots) {
            const slotConflict = findMedicationPlanConflict(plans, medicationId, slot)
            await addExistingMedicationPlan(medicationId, patientId, slot, Number(existingDoseAmount), existingAsNeeded, existingChangeReason, slotConflict?.id, medicationCorrection)
          }
          const successMessage = targetSlots.length > 1
            ? (hasOverwrites
                ? { id: `Resep obat diperbarui/ditambahkan ke ${targetSlots.length} jadwal.`, zh: `已更新／加入 ${targetSlots.length} 個時段的藥單。`, en: `Prescriptions updated/added to ${targetSlots.length} schedules.` }
                : { id: `Obat sudah ditambahkan ke ${targetSlots.length} jadwal.`, zh: `已加入 ${targetSlots.length} 個時段的藥單。`, en: `Medication added to ${targetSlots.length} schedules.` })
            : (hasOverwrites
                ? { id: 'Resep obat lama sudah ditimpa dan diperbarui.', zh: '已覆蓋並更新原本的醫囑。', en: 'Existing prescription has been overwritten and updated.' }
                : { id: 'Obat sudah ditambahkan ke daftar.', zh: '已加入藥單。', en: 'has been added to the menu.' })
          finishAddFlow(); await refreshAfterSave(successMessage)
        } catch (error) { await notifyMultiSlotSaveFailure(targetSlots.length, error, { id: 'Penyimpanan gagal. Periksa internet lalu coba lagi.', zh: '儲存失敗，請確認網路後再試。' ,en: 'Saving failed, please check your network and try again.' }) } finally { setSaving(false) }
      }
    } else if (selectedCatalogProduct) {
      // ── 官方目錄藥品模式（支援多時段複選）──
      const targetSlots = existingScheduleSlots
      if (targetSlots.length === 0) return setStatus({ id: 'Pilih minimal satu waktu minum.', zh: '請至少選擇一個服藥時段。', en: 'Please select at least one medication time slot.' })

      // 官方目錄品項一律是處方藥；剖析不到劑量時 mg 欄留白，不再預設 10（文件 §4.3）——
      // 沒填就不能送出，逼照護者照著藥袋補上真正的數字，而不是讓一個假數字悄悄存進共用目錄。
      const strength = Number(strengthMg)
      if (!Number.isFinite(strength) || strength <= 0) return setStatus({ id: 'Isi kekuatan obat (mg) sesuai kemasan sebelum menambahkan.', zh: '請依藥袋填入正確的劑量（mg）後再加入。', en: 'Fill in the medication strength (mg) from the package before adding.' })
      const slotsLabel = targetSlots.map(s => text(medicationSlotText(s))).join('、')
      const summary = planSummary(formatMedicationLabel(brandName || selectedCatalogProduct.nameZh, strength), slotsLabel, Number(existingDoseAmount), dosageForm, existingAsNeeded, targetSlots.length)
      if (!(await confirmMedicationChange({ id: 'membuat dan menambahkan', zh: '建立並加入' ,en: 'Create and join' }, summary, existingChangeReason))) return
      setSaving(true); setStatus(null)
      try {
        const resolvedGenericName = (genericName || selectedCatalogProduct.ingredient || brandName || selectedCatalogProduct.nameZh).trim()
        for (const slot of targetSlots) {
          const input = {
            brandName: brandName || selectedCatalogProduct.nameEn || selectedCatalogProduct.nameZh,
            brandNameZh: brandNameZh || selectedCatalogProduct.nameZh,
            genericName: resolvedGenericName,
            strengthMg: strength,
            dosageForm,
            scheduleSlot: slot,
            doseAmount: Number(existingDoseAmount),
            doseCount: 1,
            asNeeded: existingAsNeeded,
            appearanceColor: '',
            appearanceShape: '',
            appearancePhotoUrl: '',
            catalogSource: selectedCatalogProduct.source,
            catalogSourceId: selectedCatalogProduct.sourceId,
          }
          await createMedicationPlan(input, patientId, existingChangeReason)
        }
        finishAddFlow(); await refreshAfterSave({ id: 'Obat resmi sudah ditambahkan ke daftar obat.', zh: '已將官方藥品加入藥單。' ,en: 'The official medicine has been added to the medicine list.' })
      } catch (error) { await notifyMultiSlotSaveFailure(targetSlots.length, error, { id: 'Penambahan gagal. Periksa internet lalu coba lagi.', zh: '新增失敗，請確認網路後再試。' ,en: 'Add failed, please check your network and try again.' }) } finally { setSaving(false) }
    }
  }

  const addNew = async (event: React.FormEvent) => {
    event.preventDefault()
    // 「其他（成藥、國外購入）」在資料庫只是 'drug'：跟處方藥一樣維持 mg 數字欄，
    // 只有選「營養品」才會隱藏 mg、改要求包裝劑量原文（文件 §4.3）。
    const isSupplement = productKind === 'supplement'
    const resolvedProductKind: 'drug' | 'supplement' = isSupplement ? 'supplement' : 'drug'
    const strength = Number(strengthMg)
    const trimmedLabel = strengthLabel.trim()
    // 表單與 RPC 都以去除前後空白的網址為準，避免可儲存的網址在前端被誤判失敗。
    const trimmedPhotoUrl = appearancePhotoUrl.trim()
    if (trimmedPhotoUrl && !/^https:\/\//i.test(trimmedPhotoUrl) && !isMedicationAppearancePhotoPath(trimmedPhotoUrl)) return setStatus({ id: 'Alamat foto harus dimulai dengan https://.', zh: '照片網址必須是 https:// 開頭。' ,en: 'The photo URL must start with https://.' })
    if (!canEditSubject || !brandName.trim() || !genericName.trim() || !validDoseAmount(newDoseAmount)) return setStatus({ id: 'Lengkapi data obat baru, penerima perawatan, dan dosis sekali minum.', zh: '請填好新藥品資料、對象與單次劑量。' ,en: 'Please complete the new medication details, recipient, and single dose amount.' })
    // 營養品沒有可信的 mg 數字：改要求包裝上的劑量原文必填，不用 0 或假數字頂替（文件 §4.3、migration 的 CHECK）。
    if (isSupplement) {
      if (!trimmedLabel) return setStatus({ id: 'Isi dosis pada kemasan suplemen sebelum menambahkan.', zh: '請填入營養品包裝上的劑量後再加入。' ,en: 'Fill in the supplement package strength before adding.' })
    } else if (!Number.isFinite(strength) || strength <= 0) {
      return setStatus({ id: 'Lengkapi data obat baru, penerima perawatan, dan dosis sekali minum.', zh: '請填好新藥品資料、對象與單次劑量。' ,en: 'Please complete the new medication details, recipient, and single dose amount.' })
    }

    // 繁體中文註解：支援多時段批次新增（如台灣常見處方：一天三次早餐後、午餐後、晚餐後），避免手動重複新增多次。
    const targetSlots = newScheduleSlots
    if (targetSlots.length === 0) return setStatus({ id: 'Pilih minimal satu waktu minum.', zh: '請至少選擇一個服藥時段。', en: 'Please select at least one medication time slot.' })

    const resolvedGenericName = genericName.trim() || brandName.trim() || brandNameZh.trim()
    const slotsLabel = targetSlots.map(s => text(medicationSlotText(s))).join('、')
    const summary = planSummary(formatMedicationLabel(brandName, isSupplement ? null : strength, trimmedLabel || null), slotsLabel, Number(newDoseAmount), dosageForm, newAsNeeded, targetSlots.length)

    // 建立並加入按鈕英文翻譯修正
    if (!(await confirmMedicationChange({ id: 'membuat dan menambahkan', zh: '建立並加入' ,en: 'Create and add' }, summary, newChangeReason))) return
    setSaving(true); setStatus(null)
    try {
      for (const slot of targetSlots) {
        const input = {
          brandName: brandName.trim(), brandNameZh: brandNameZh.trim(), genericName: resolvedGenericName,
          strengthMg: isSupplement ? null : strength, strengthLabel: trimmedLabel || null, productKind: resolvedProductKind,
          dosageForm, scheduleSlot: slot, doseAmount: Number(newDoseAmount), doseCount: 1, asNeeded: newAsNeeded, appearanceColor, appearanceShape, appearancePhotoUrl: trimmedPhotoUrl,
        }
        await createMedicationPlan(input, patientId, newChangeReason)
      }
      // 新藥送出後重設自己的欄位，避免展開中的表單被誤當成下一筆醫囑的預填值。
      setBrandName(''); setBrandNameZh(''); setGenericName(''); setStrengthMg(''); setStrengthLabel(''); setProductKind('drug'); setNewScheduleSlot('after_breakfast'); setNewScheduleSlots(['after_breakfast']); setNewDoseAmount('1'); setNewAsNeeded(false); setAppearanceColor(''); setAppearanceShape(''); setAppearancePhotoUrl(''); setNewChangeReason(''); setIsNewMedicationPanelOpen(false); finishAddFlow()
      const successMessage = targetSlots.length > 1
        ? { id: `Obat baru sudah ditambahkan ke ${targetSlots.length} jadwal.`, zh: `已建立新藥品並加入 ${targetSlots.length} 個時段。`, en: `A new medication has been created and added to ${targetSlots.length} schedules.` }
        : { id: 'Obat baru sudah ditambahkan.', zh: '已建立新藥品並加入藥單。', en: 'A new medication has been created and added to the list.' }
      await refreshAfterSave(successMessage)
    } catch (error) { await notifyMultiSlotSaveFailure(targetSlots.length, error, { id: 'Penambahan gagal. Periksa internet lalu coba lagi.', zh: '新增失敗，請確認網路後再試。' ,en: 'Add failed, please check your network and try again.' }) } finally { setSaving(false) }
  }

  const remove = async (plan: AdminMedicationPlan) => {
    // Demo 原因本來就是可選，略過 prompt 可讓免登入試用在不支援原生輸入對話框的手機 WebView 仍能完成調整。
    // 移除原因 prompt 英文修正
    const reason = isDemoMode() ? '' : window.prompt(text({ id: 'Alasan penghapusan (opsional)', zh: '移除原因（可不填）' ,en: 'Reason for removal (optional)' }))
    if (reason === null) return
    const medication = medicationById.get(plan.medication_id)
    if (!(await confirmMedicationChange({ id: 'menghapus', zh: '移除' ,en: 'remove' }, planSummary(medication ? formatMedicationLabel(medication.brand_name, medication.strength_mg, medication.strength_label) : plan.medication_id, plan.schedule_slot, plan.dose_amount, medication?.dosage_form, plan.as_needed, plan.dose_count), reason))) return
    setSaving(true); setStatus(null)
    try {
      // 停用而非刪除 plan，才能保留既有每日紀錄指向當時真正的藥單。
      await setMedicationPlanActive(plan.id, false, patientId, reason)
      await refreshAfterSave({ id: 'Dihapus dari daftar obat saat ini.', zh: '已從目前藥單移除。' ,en: 'Removed from current medication list.' })
    } catch (error) { console.error('[medication admin remove plan error]', error); setStatus({ id: 'Penghapusan gagal. Silakan coba lagi.', zh: '移除失敗，請重試。' ,en: 'Removal failed. Please try again.' }) } finally { setSaving(false) }
  }

  return {
    confirmDialog,
    locale,
    text,
    // 既有醫囑表單
    medicationId, setMedicationId,
    selectionConfirmed, setSelectionConfirmed,
    existingScheduleSlot, setExistingScheduleSlot,
    existingScheduleSlots, setExistingScheduleSlots,
    existingDoseAmount, setExistingDoseAmount,
    existingAsNeeded, setExistingAsNeeded,
    editingPlanId,
    catalogQuery, setCatalogQuery,
    existingChangeReason, setExistingChangeReason,
    isCatalogSearchOpen, setIsCatalogSearchOpen,
    // 新藥品表單
    brandName, setBrandName,
    brandNameZh, setBrandNameZh,
    genericName, setGenericName,
    strengthMg, setStrengthMg,
    strengthLabel, setStrengthLabel,
    productKind, setProductKind,
    dosageForm, setDosageForm,
    newScheduleSlot, setNewScheduleSlot,
    newScheduleSlots, setNewScheduleSlots,
    newDoseAmount, setNewDoseAmount,
    newAsNeeded, setNewAsNeeded,
    appearanceColor, setAppearanceColor,
    appearanceShape, setAppearanceShape,
    appearancePhotoUrl, setAppearancePhotoUrl,
    isCorrectingMedication, setIsCorrectingMedication,
    setHasCorrectionEdits,
    newChangeReason, setNewChangeReason,
    // 資料載入與目錄搜尋
    plans,
    medications,
    loading,
    activeAccount,
    canEditSubject,
    registryResults,
    searchingRegistry,
    selectedCatalogProduct, setSelectedCatalogProduct,
    catalogResults,
    filteredRegistryResults,
    medicationById,
    personalMedications,
    selectedMedication,
    activePlanGroups,
    dailyMedicationCount,
    dailyQuantity,
    editingPlan,
    samePlansForSelectedMedication,
    occupiedSlots,
    overwriteTarget,
    overwriteTargets,
    conflictedPlans,
    blockedByConflict,
    // 共用 UI 狀態
    isAddPanelOpen, setIsAddPanelOpen,
    status,
    saving,
    editPanelRef,
    newMedicationPanelRef,
    isNewMedicationPanelOpen, setIsNewMedicationPanelOpen,
    // 操作
    resetSelection,
    startEditingPlan,
    chooseMedication,
    chooseCatalogProduct,
    applyDraft,
    confirmMedicationChange,
    addExisting,
    addNew,
    remove,
    finishAddFlow,
    refreshAfterAppearanceOverrideChange,
  }
}
