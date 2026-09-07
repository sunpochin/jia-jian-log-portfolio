/*
檔案用途：抽出 MedicationAdminSection 原本 37 個 useState 與所有讀寫邏輯，讓元件檔只剩下 JSX。
所在層：src/features/medication/hooks；藥單管理表單專用的容器 hook，不對外通用。
主要關聯：由 MedicationAdminSection／ExistingPlanForm／NewMedicationForm 共用同一份回傳值；
  資料存取仍透過 lib/medicationAdmin、lib/medicationCatalog 等既有資料層完成。
*/
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  addExistingMedicationPlan,
  createMedicationPlan,
  findMedicationPlanConflict,
  groupActiveMedicationPlans,
  listActiveMedicationPlansForMedication,
  readMedicationAdminData,
  resolveMedicationSelection,
  setMedicationPlanActive,
  type AdminMedicationPlan,
  type MedicationCorrectionInput,
  type MedicationOption,
} from '../../../lib/medicationAdmin'
import {
  parseDosageFormFromText,
  parseStrengthFromDrugName,
  searchMedicationCatalog,
  searchMedicationRegistry,
  type MedicationCatalogResult,
} from '../../../lib/medicationCatalog'
import { formatDoseAmountLocalized, formatMedicationLabel } from '../../../lib/medications'
import { medicationSlotQuantityText, medicationSlotText } from '../../../lib/medicationSchedule'
import { type LocalizedText, useI18n } from '../../../lib/i18n'
import { isDemoMode } from '../../../lib/demoStorage'
import { readErrorFields } from '../../../lib/dataErrors'
import { useConfirm } from '../../../hooks/useConfirm'

const DOSE_STEP = 0.5
const MIN_DOSE_AMOUNT = DOSE_STEP
const MAX_DOSE_AMOUNT = 9

// 顆數摘要要按劑型分組（錠／膠囊論顆，粉劑論包，液劑論份），不能直接加總 dose_amount，
// 否則同一時段混著藥錠與粉包時會把粉包誤標成「顆」。plans 本身沒有 dosage_form，要透過 medicationById 查藥品資料。
export function withDosageForm(planList: readonly AdminMedicationPlan[], medicationById: Map<string, MedicationOption>) {
  return planList.map(plan => ({
    dose_amount: plan.dose_amount,
    dose_count: plan.dose_count,
    dosage_form: medicationById.get(plan.medication_id)?.dosage_form ?? 'tablet',
  }))
}

// 資料庫在偵測到同一顆藥被其他病人的現役醫囑使用時會擋下目錄寫入（保護對方資料不被誤改）；
// 把這個特定錯誤換成照護者看得懂的說明，而不是統一顯示成「請確認網路」誤導成連線問題。
function medicationErrorStatus(error: unknown, fallback: LocalizedText): LocalizedText {
  // 用共用的 readErrorFields 取代 `error instanceof Error ? error.message : String(error)`：
  // Supabase 有時會丟出不是 Error 實例的物件（例如 AuthError 的舊版形狀），String() 對那種物件
  // 只會印出 "[object Object]"，等於把真正的錯誤原因吃掉。
  const message = readErrorFields(error).message
  if (message.includes('shared with another patient')) {
    return { id: 'Obat ini juga dipakai oleh orang lain, jadi datanya tidak bisa diubah dari sini. Tambahkan sebagai obat terpisah jika perlu.', zh: '這顆藥同時被其他病人使用，無法從這裡修改共用資料；如需不同資料請改成新增一筆獨立的藥品。' ,en: "Medication this juga dipakai oleh people lain, jadi datanya not can edited from this. Addkan sebagai medication separate if perlu." }
  }
  if (message.includes('Not authorized to manage this medication plan')) {
    return { id: 'Anda tidak (lagi) memiliki izin mengelola obat orang ini. Muat ulang halaman lalu coba lagi, atau hubungi pemilik keluarga.', zh: '你目前沒有（或已失去）管理這個人藥單的權限，請重新整理頁面再試一次，或請家庭管理者確認授權。' ,en: "You not (lagi) memiliki izin mengelola medication this person. Load ulang halaman lalu try again, or hubungi pemilik family." }
  }
  // 沒對到已知情境時，把資料庫實際回傳的訊息一併附上——照護者不一定方便開瀏覽器主控台，
  // 讓錯誤直接顯示在畫面上，才能把真正的原因回報給開發者，而不是永遠只看到「請確認網路」。
  const detail = message.trim()
  if (!detail) return fallback
  return { id: `${fallback.id} (${detail})`, zh: `${fallback.zh}（詳細訊息：${detail}）` ,en: `${fallback.id} (${detail})` }
}

// 給確認視窗用的劑型雙語標籤；跟表單 <select> 的選項文字保持一致，避免只有印尼文照護者在確認框看到英文代碼。
const DOSAGE_FORM_LABELS: Record<string, LocalizedText> = {
  tablet: { id: 'Tablet', zh: '錠劑' ,en: 'Tablet' },
  capsule: { id: 'Kapsul', zh: '膠囊' ,en: 'Kapsul' },
  liquid: { id: 'Cair', zh: '液體' ,en: 'Liquid' },
  powder: { id: 'Bubuk (sachet)', zh: '粉劑（一包）' ,en: 'Bubuk (sachet)' },
}

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

  // ── 既有醫囑表單狀態 ──────────────────────────────────────────────
  const [medicationId, setMedicationId] = useState('')
  const [selectionConfirmed, setSelectionConfirmed] = useState(false)
  const [existingScheduleSlot, setExistingScheduleSlot] = useState('after_breakfast')
  const [existingDoseAmount, setExistingDoseAmount] = useState('1')
  const [existingAsNeeded, setExistingAsNeeded] = useState(false)
  const [editingPlanId, setEditingPlanId] = useState<string | null>(null)
  const [catalogQuery, setCatalogQuery] = useState('')
  // 兩張表單各自保留原因，避免切換新增方式時把前一張表單的交接理由誤帶到另一筆醫囑。
  const [existingChangeReason, setExistingChangeReason] = useState('')
  // 藥袋 OCR 草稿只負責猜品名，交給既有搜尋＋逐項確認流程接手，不另外做一條寫入路徑。
  const [isCatalogSearchOpen, setIsCatalogSearchOpen] = useState(false)

  // ── 新藥品表單狀態 ────────────────────────────────────────────────
  const [brandName, setBrandName] = useState('')
  const [brandNameZh, setBrandNameZh] = useState('')
  const [genericName, setGenericName] = useState('')
  const [strengthMg, setStrengthMg] = useState('')
  const [dosageForm, setDosageForm] = useState('tablet')
  const [newScheduleSlot, setNewScheduleSlot] = useState('after_breakfast')
  const [newDoseAmount, setNewDoseAmount] = useState('1')
  const [newAsNeeded, setNewAsNeeded] = useState(false)
  const [appearanceColor, setAppearanceColor] = useState('')
  const [appearanceShape, setAppearanceShape] = useState('')
  const [appearancePhotoUrl, setAppearancePhotoUrl] = useState('')
  // 「調整」既有醫囑時，藥品本身的劑型／外觀登錄預設收合，避免每次只是改時段或劑量卻被誤導去動藥品資料。
  const [isCorrectingMedication, setIsCorrectingMedication] = useState(false)
  // 修正欄位（劑型／顏色／形狀／照片）只要被實際改過，就算之後按「收合」也要在送出時一併帶入；
  // 若只沿用 isCorrectingMedication（單純代表面板是否展開），收合會讓已上傳的照片等修正在儲存時被悄悄丟棄。
  const [hasCorrectionEdits, setHasCorrectionEdits] = useState(false)
  const [newChangeReason, setNewChangeReason] = useState('')

  // ── 資料載入與目錄搜尋狀態 ────────────────────────────────────────
  const [plans, setPlans] = useState<AdminMedicationPlan[]>([])
  const [medications, setMedications] = useState<MedicationOption[]>([])
  const [loading, setLoading] = useState(true)
  const [loadFailed, setLoadFailed] = useState(false)
  // 目錄非同步搜尋結果與選擇狀態
  const [registryResults, setRegistryResults] = useState<MedicationCatalogResult[]>([])
  const [searchingRegistry, setSearchingRegistry] = useState(false)
  const [selectedCatalogProduct, setSelectedCatalogProduct] = useState<MedicationCatalogResult | null>(null)

  // ── 共用 UI 狀態 ─────────────────────────────────────────────────
  const [isAddPanelOpen, setIsAddPanelOpen] = useState(false)
  const [status, setStatus] = useState<LocalizedText | null>(null)
  const [saving, setSaving] = useState(false)
  // 「調整」按鈕原本只是把畫面外的表單展開，照護者在藥卡旁邊看不到任何變化，才會覺得按了沒作用；
  // 這個 ref 與旗標讓表單展開後主動捲到眼前。
  const editPanelRef = useRef<HTMLDetailsElement>(null)
  const [pendingEditScroll, setPendingEditScroll] = useState(false)

  const medicationById = useMemo(() => new Map(medications.map(medication => [medication.id, medication])), [medications])
  const activeAccount = true
  // 媽媽專用入口由資料庫 RPC 驗證照護權，不能因為這頁刻意不讀 profiles 就誤當成沒有授權帳號。
  const canEditSubject = !loading && !loadFailed
  const personalMedicationIds = useMemo(() => new Set(plans.map(plan => plan.medication_id)), [plans])
  const personalMedications = useMemo(() => medications.filter(medication => personalMedicationIds.has(medication.id)), [medications, personalMedicationIds])
  const selectedMedication = medicationById.get(medicationId)
  const activePlanGroups = useMemo(() => groupActiveMedicationPlans(plans, medicationById, locale), [locale, medicationById, plans])
  // 排藥畫面按時段分區檢視，但照護者實際核對藥盒時需要「一天總共」的數字；在這裡另外加總，不必逐時段心算。
  const allActivePlans = useMemo(() => activePlanGroups.flatMap(([, slotPlans]) => slotPlans), [activePlanGroups])
  const dailyMedicationCount = allActivePlans.length
  const dailyQuantity = useMemo(() => medicationSlotQuantityText(withDosageForm(allActivePlans, medicationById)), [allActivePlans, medicationById])
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
  // 新增時撞到同一顆藥的同一時段＝實際上是覆蓋；調整時撞到別筆＝會產生兩筆重複醫囑，必須擋下來。
  const overwriteTarget = editingPlanId ? null : slotConflictPlan
  const blockedByConflict = Boolean(editingPlanId && slotConflictPlan)
  const catalogResults = useMemo(
    () => searchMedicationCatalog(medications, catalogQuery, '', personalMedicationIds),
    [medications, catalogQuery, personalMedicationIds],
  )
  const filteredRegistryResults = useMemo(() => {
    const existingSourceIds = new Set(medications.map(m => m.catalog_source_id).filter(Boolean))
    // 為了相容舊資料 tfda_license_number，也把它加入排除名單
    const existingLegacyTfda = new Set(medications.map(m => m.tfda_license_number).filter(Boolean))
    return registryResults.filter(product => !existingSourceIds.has(product.sourceId) && !existingLegacyTfda.has(product.sourceId))
  }, [medications, registryResults])

  useEffect(() => {
    const trimmed = catalogQuery.trim()
    if (trimmed.length < 2) {
      setRegistryResults([])
      setSearchingRegistry(false)
      return
    }
    setSearchingRegistry(true)
    const timer = setTimeout(() => {
      searchMedicationRegistry(trimmed)
        .then(results => setRegistryResults(results))
        .catch(err => {
          console.error('[medication catalog search error]', err)
          setRegistryResults([])
        })
        .finally(() => setSearchingRegistry(false))
    }, 300)
    return () => clearTimeout(timer)
  }, [catalogQuery])

  const refresh = async () => {
    setLoading(true)
    setLoadFailed(false)
    try {
      const data = await readMedicationAdminData(patientId)
      setPlans(data.plans); setMedications(data.medications)
      setMedicationId(current => resolveMedicationSelection(current, data.medications))
    } catch (error) {
      setLoadFailed(true)
      throw error
    } finally {
      // 讀取失敗也必須結束載入，否則照護者會一直看到無法操作的假載入畫面。
      setLoading(false)
    }
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

  const resetPlanFields = () => {
    // 時段／劑量／PRN 屬於「上一顆藥的醫囑」，換藥或結束調整時必須回到預設值；
    // 否則剛調整完 PRN 藥再加新藥，會預帶「不限時間 · 需要時服用」而看起來像系統幫忙填好了。
    setExistingScheduleSlot('after_breakfast')
    setExistingDoseAmount('1')
    setExistingAsNeeded(false)
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
    setStrengthMg(medication ? String(medication.strength_mg) : '')
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
    return () => window.clearTimeout(timer)
  }, [pendingEditScroll])

  useEffect(() => {
    // 調藥面板可隨共同 SubjectSwitcher 切換對象；依 patientId 重抓，避免把前一人的藥單留在新對象名下。
    refresh().catch(error => { console.error('[medication admin read error]', error); setStatus({ id: 'Daftar obat gagal dimuat. Periksa internet lalu coba lagi.', zh: '讀取藥單失敗，請確認網路後再試。' ,en: 'List medication failed dimuat. Periksa internet lalu try again.' }) })
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
    setStrengthMg(parsedStrength > 0 ? String(parsedStrength) : '10')
    setDosageForm(parseDosageFormFromText(`${product.dosageForm ?? ''} ${product.nameZh}`))
  }

  const validAmount = (value: string) => {
    const amount = Number(value)
    // 下限必須與步距對齊，否則瀏覽器會從 0.001 開始累加而產生 0.5001 這類假劑量。
    return Number.isFinite(amount) && amount >= MIN_DOSE_AMOUNT && amount <= MAX_DOSE_AMOUNT && Number.isInteger(amount / DOSE_STEP)
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
    `${text({ id: 'Rincian resep', zh: '醫囑摘要' ,en: 'Details prescription' })}：${medicationName}／${text(medicationSlotText(scheduleSlot))}／${dosageForm ? formatDoseAmountLocalized(doseAmount, dosageForm, locale) : doseAmount}／${doseCount} ${text({ id: 'dosis', zh: '次' ,en: 'times' })}${asNeeded ? `／${text({ id: 'Bila perlu', zh: '需要時服用' ,en: 'Bila perlu' })}` : ''}`

  const addExisting = async (event: React.FormEvent) => {
    event.preventDefault()
    // Enter 仍可送出整個 form；提交端也要確認，不能只依賴被隱藏的按鈕與欄位。
    if (!canEditSubject || (!medicationId && !selectedCatalogProduct) || (editingPlanId && !selectedMedication) || !selectionConfirmed || !validAmount(existingDoseAmount)) return setStatus({ id: 'Konfirmasikan obat dan pilih dosis sekali minum yang benar.', zh: '請先確認藥品並選擇正確單次劑量。' ,en: 'Konfirmasikan medication and select dose sekali take that benar.' })
    // brandName 空白時 RPC 會直接略過整個藥品資料 upsert，讓照護者填好的修正無聲消失；
    // 與其讓它悄悄不生效，不如在送出前擋下並說明原因。
    if (hasCorrectionEdits && !brandName.trim()) return setStatus({ id: 'Data obat untuk koreksi belum lengkap. Muat ulang lalu coba lagi.', zh: '要修正的藥品資料不完整，請重新整理頁面後再試一次。' ,en: "Data medication for koreksi not yet lengkap. Load ulang lalu try again." })
    // 跟「新增未驗證自訂藥品」表單套用一樣的規則：只收 https:// 開頭的網址，避免修正把 http:// 或打錯字的網址存進共用目錄。
    if (hasCorrectionEdits && appearancePhotoUrl.trim() && !/^https:\/\//i.test(appearancePhotoUrl.trim())) return setStatus({ id: 'Alamat foto harus dimulai dengan https://.', zh: '照片網址必須是 https:// 開頭。' ,en: 'The photo URL must start with https://.' })

    if (selectedMedication) {
      // 資料庫的 update 分支不會替我們去重；換到已被同一顆藥佔用的時段會留下兩筆重複醫囑，所以在送出前就擋下。
      if (blockedByConflict) return setStatus({ id: 'Waktu minum itu sudah punya resep obat yang sama. Ubah resep tersebut atau hapus dulu.', zh: '那個時段已經有同一顆藥的醫囑；請直接調整那一筆，或先移除它。' ,en: 'Time take itu already punya prescription medication that sama. Edit prescription tersebut or delete dulu.' })
      const medicationLabel = formatMedicationLabel(selectedMedication.brand_name, selectedMedication.strength_mg, selectedMedication.strength_label)
      const action = editingPlanId
        ? { id: 'memperbarui', zh: '調整' ,en: 'memUpdate' }
        : overwriteTarget ? { id: 'menimpa resep lama', zh: '覆蓋原本的醫囑' ,en: 'menimpa prescription lama' } : { id: 'menambahkan', zh: '新增' ,en: 'Add' }
      // 覆蓋時把「原本是什麼」也放進確認視窗；只寫新值的話，照護者無從發現自己蓋掉了另一組劑量。
      const beforeLine = overwriteTarget
        ? `\n${text({ id: 'Resep lama', zh: '原本醫囑' ,en: 'Original Medical Order' })}：${planSummary(medicationLabel, overwriteTarget.schedule_slot, overwriteTarget.dose_amount, selectedMedication.dosage_form, overwriteTarget.as_needed, overwriteTarget.dose_count)}`
        : ''
      // medications 是跨病人共用的目錄表（同一顆藥的 id 由品名/學名/劑量/劑型算出，不分病人)，
      // 修正這裡不只影響這一筆醫囑，也不只影響這個人的其他時段，任何人用到同一顆藥都會看到新資料；
      // 確認視窗必須把這點講清楚，不能讓照護者以為只改了眼前這一筆。
      const correctionLine = hasCorrectionEdits
        ? `\n${text({ id: 'Perbaikan obat ini (berlaku untuk SEMUA orang dan SEMUA jadwal yang memakai obat yang sama)', zh: '藥品資料修正（會套用到所有使用這顆藥的人與所有時段，不只這個人、不只這一筆）' ,en: "Perbaikan medication this (berlaku for SEMUA people and SEMUA schedule that memakai medication that sama)" })}：${text({ id: 'Bentuk', zh: '劑型' ,en: "Shape" })} ${text(DOSAGE_FORM_LABELS[dosageForm] ?? { id: dosageForm, zh: dosageForm ,en: dosageForm })}`
        : ''
      if (!(await confirmMedicationChange(action, `${planSummary(medicationLabel, existingScheduleSlot, Number(existingDoseAmount), selectedMedication.dosage_form, existingAsNeeded)}${beforeLine}${correctionLine}`, existingChangeReason))) return
      setSaving(true); setStatus(null)
      try {
        const medicationCorrection: MedicationCorrectionInput | undefined = hasCorrectionEdits
          ? { brandName, brandNameZh, genericName, strengthMg: Number(strengthMg) || selectedMedication.strength_mg, dosageForm, appearanceColor, appearanceShape, appearancePhotoUrl: appearancePhotoUrl.trim() }
          : undefined
        // 覆蓋時明確帶入被蓋掉那筆的 plan id，讓它走 update 而不是依賴資料庫的三元鍵 idempotent 行為。
        await addExistingMedicationPlan(medicationId, patientId, existingScheduleSlot, Number(existingDoseAmount), existingAsNeeded, existingChangeReason, editingPlanId ?? overwriteTarget?.id, medicationCorrection)
        const successMessage = editingPlanId
          ? { id: 'Resep obat sudah diperbarui.', zh: '已更新這筆醫囑。' ,en: 'This order has been updated.' }
          : overwriteTarget ? { id: 'Resep lama pada waktu minum itu sudah ditimpa.', zh: '已覆蓋該時段原本的醫囑。' ,en: 'The original order for that time period has been overwritten.' } : { id: 'Obat sudah ditambahkan ke daftar.', zh: '已加入藥單。' ,en: 'has been added to the menu.' }
        finishAddFlow(); await refreshAfterSave(successMessage)
      } catch (error) { console.error('[medication admin add plan error]', error); setStatus(medicationErrorStatus(error, { id: 'Penyimpanan gagal. Periksa internet lalu coba lagi.', zh: '儲存失敗，請確認網路後再試。' ,en: 'Saving failed, please check your network and try again.' })) } finally { setSaving(false) }
    } else if (selectedCatalogProduct) {
      const strength = Number(strengthMg) || 10
      if (!(await confirmMedicationChange({ id: 'membuat dan menambahkan', zh: '建立並加入' ,en: 'Create and join' }, planSummary(formatMedicationLabel(brandName || selectedCatalogProduct.nameZh, strength), existingScheduleSlot, Number(existingDoseAmount), dosageForm, existingAsNeeded), existingChangeReason))) return
      setSaving(true); setStatus(null)
      try {
        const resolvedGenericName = (genericName || selectedCatalogProduct.ingredient || brandName || selectedCatalogProduct.nameZh).trim()
        const input = {
          brandName: brandName || selectedCatalogProduct.nameEn || selectedCatalogProduct.nameZh,
          brandNameZh: brandNameZh || selectedCatalogProduct.nameZh,
          genericName: resolvedGenericName,
          strengthMg: strength,
          dosageForm,
          scheduleSlot: existingScheduleSlot,
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
        finishAddFlow(); await refreshAfterSave({ id: 'Obat resmi sudah ditambahkan ke daftar obat.', zh: '已將官方藥品加入藥單。' ,en: 'The official medicine has been added to the medicine list.' })
      } catch (error) { console.error('[medication admin catalog create error]', error); setStatus(medicationErrorStatus(error, { id: 'Penambahan gagal. Periksa internet lalu coba lagi.', zh: '新增失敗，請確認網路後再試。' ,en: 'Add failed, please check your network and try again.' })) } finally { setSaving(false) }
    }
  }

  const addNew = async (event: React.FormEvent) => {
    event.preventDefault()
    const strength = Number(strengthMg)
    // 表單與 RPC 都以去除前後空白的網址為準，避免可儲存的網址在前端被誤判失敗。
    const trimmedPhotoUrl = appearancePhotoUrl.trim()
    if (trimmedPhotoUrl && !/^https:\/\//i.test(trimmedPhotoUrl)) return setStatus({ id: 'Alamat foto harus dimulai dengan https://.', zh: '照片網址必須是 https:// 開頭。' ,en: 'The photo URL must start with https://.' })
    if (!canEditSubject || !brandName.trim() || !genericName.trim() || !Number.isFinite(strength) || strength <= 0 || !validAmount(newDoseAmount)) return setStatus({ id: 'Lengkapi data obat baru, penerima perawatan, dan dosis sekali minum.', zh: '請填好新藥品資料、對象與單次劑量。' ,en: 'Lengkapi data medication baru, penerima care, and dose sekali take.' })
    const resolvedGenericName = genericName.trim() || brandName.trim() || brandNameZh.trim()
    if (!(await confirmMedicationChange({ id: 'membuat dan menambahkan', zh: '建立並加入' ,en: 'Create and join' }, planSummary(formatMedicationLabel(brandName, strength), newScheduleSlot, Number(newDoseAmount), dosageForm, newAsNeeded), newChangeReason))) return
    setSaving(true); setStatus(null)
    try {
      const input = { brandName: brandName.trim(), brandNameZh: brandNameZh.trim(), genericName: resolvedGenericName, strengthMg: strength, dosageForm, scheduleSlot: newScheduleSlot, doseAmount: Number(newDoseAmount), doseCount: 1, asNeeded: newAsNeeded, appearanceColor, appearanceShape, appearancePhotoUrl: trimmedPhotoUrl }
      await createMedicationPlan(input, patientId, newChangeReason)
      // 新藥送出後重設自己的欄位，避免展開中的表單被誤當成下一筆醫囑的預填值。
      setBrandName(''); setBrandNameZh(''); setGenericName(''); setStrengthMg(''); setNewScheduleSlot('after_breakfast'); setNewDoseAmount('1'); setNewAsNeeded(false); setAppearanceColor(''); setAppearanceShape(''); setAppearancePhotoUrl(''); setNewChangeReason(''); finishAddFlow(); await refreshAfterSave({ id: 'Obat baru sudah ditambahkan.', zh: '已建立新藥品並加入藥單。' ,en: 'A new medication has been created and added to the list.' })
    } catch (error) { console.error('[medication admin create error]', error); setStatus(medicationErrorStatus(error, { id: 'Penambahan gagal. Periksa internet lalu coba lagi.', zh: '新增失敗，請確認網路後再試。' ,en: 'Add failed, please check your network and try again.' })) } finally { setSaving(false) }
  }

  const remove = async (plan: AdminMedicationPlan) => {
    // Demo 原因本來就是可選，略過 prompt 可讓免登入試用在不支援原生輸入對話框的手機 WebView 仍能完成調整。
    const reason = isDemoMode() ? '' : window.prompt(text({ id: 'Alasan penghapusan (opsional)', zh: '移除原因（可不填）' ,en: 'Reason penghapusan (optional)' }))
    if (reason === null) return
    const medication = medicationById.get(plan.medication_id)
    if (!(await confirmMedicationChange({ id: 'menghapus', zh: '移除' ,en: 'deleting' }, planSummary(medication ? formatMedicationLabel(medication.brand_name, medication.strength_mg, medication.strength_label) : plan.medication_id, plan.schedule_slot, plan.dose_amount, medication?.dosage_form, plan.as_needed, plan.dose_count), reason))) return
    setSaving(true); setStatus(null)
    try {
      // 停用而非刪除 plan，才能保留既有每日紀錄指向當時真正的藥單。
      await setMedicationPlanActive(plan.id, false, patientId, reason)
      await refreshAfterSave({ id: 'Dihapus dari daftar obat saat ini.', zh: '已從目前藥單移除。' ,en: 'Removed from current menu.' })
    } catch (error) { console.error('[medication admin remove plan error]', error); setStatus({ id: 'Penghapusan gagal. Silakan coba lagi.', zh: '移除失敗，請重試。' ,en: 'Deletion failed. Silakan try again.' }) } finally { setSaving(false) }
  }

  return {
    confirmDialog,
    locale,
    text,
    // 既有醫囑表單
    medicationId, setMedicationId,
    selectionConfirmed, setSelectionConfirmed,
    existingScheduleSlot, setExistingScheduleSlot,
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
    dosageForm, setDosageForm,
    newScheduleSlot, setNewScheduleSlot,
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
    blockedByConflict,
    // 共用 UI 狀態
    isAddPanelOpen, setIsAddPanelOpen,
    status,
    saving,
    editPanelRef,
    // 操作
    resetSelection,
    startEditingPlan,
    chooseMedication,
    chooseCatalogProduct,
    confirmMedicationChange,
    addExisting,
    addNew,
    remove,
    finishAddFlow,
  }
}
