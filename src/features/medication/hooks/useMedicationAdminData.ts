/*
檔案用途：useMedicationAdminForm 三組職責之一——「資料載入與目錄搜尋」：藥單／藥品清單讀取、
  官方目錄關鍵字搜尋（含防抖）、以及只依賴這份資料就能算出的衍生值（今日藥卡分組、每日總量等）。
所在層：src/features/medication/hooks；不知道「既有醫囑表單」或「新藥品表單」欄位的存在，
  只透過呼叫端傳入的 catalogQuery 驅動目錄搜尋。
主要關聯：由 useMedicationAdminForm 組合使用；資料存取仍透過 lib/medication/medicationAdmin、
  lib/medication/medicationCatalog 等既有資料層完成。
*/
import { useEffect, useMemo, useState } from 'react'
import {
  groupActiveMedicationPlans,
  readMedicationAdminData,
  type AdminMedicationPlan,
  type MedicationOption,
} from '../../../lib/medication/medicationAdmin'
import {
  searchMedicationCatalog,
  searchMedicationRegistry,
  type MedicationCatalogResult,
} from '../../../lib/medication/medicationCatalog'
import { medicationSlotQuantityText } from '../../../lib/medication/medicationSchedule'
import { withDosageForm } from '../../../lib/medication/medicationAdminFormHelpers'
import type { Locale } from '../../../lib/i18n'

export interface MedicationAdminDataArgs {
  patientId: string
  // 官方目錄搜尋關鍵字屬於「既有醫囑表單」那組狀態；這裡只讀不寫，維持資料層與表單欄位互不相知。
  catalogQuery: string
  locale: Locale
}

export function useMedicationAdminData({ patientId, catalogQuery, locale }: MedicationAdminDataArgs) {
  const [plans, setPlans] = useState<AdminMedicationPlan[]>([])
  const [medications, setMedications] = useState<MedicationOption[]>([])
  const [loading, setLoading] = useState(true)
  const [loadFailed, setLoadFailed] = useState(false)
  // 目錄非同步搜尋結果與選擇狀態
  const [registryResults, setRegistryResults] = useState<MedicationCatalogResult[]>([])
  const [searchingRegistry, setSearchingRegistry] = useState(false)
  const [selectedCatalogProduct, setSelectedCatalogProduct] = useState<MedicationCatalogResult | null>(null)

  const medicationById = useMemo(() => new Map(medications.map(medication => [medication.id, medication])), [medications])
  const activeAccount = true
  // 媽媽專用入口由資料庫 RPC 驗證照護權，不能因為這頁刻意不讀 profiles 就誤當成沒有授權帳號。
  const canEditSubject = !loading && !loadFailed
  const personalMedicationIds = useMemo(() => new Set(plans.map(plan => plan.medication_id)), [plans])
  const personalMedications = useMemo(() => medications.filter(medication => personalMedicationIds.has(medication.id)), [medications, personalMedicationIds])
  const activePlanGroups = useMemo(() => groupActiveMedicationPlans(plans, medicationById, locale), [locale, medicationById, plans])
  // 排藥畫面按時段分區檢視，但照護者實際核對藥盒時需要「一天總共」的數字；在這裡另外加總，不必逐時段心算。
  const allActivePlans = useMemo(() => activePlanGroups.flatMap(([, slotPlans]) => slotPlans), [activePlanGroups])
  const dailyMedicationCount = allActivePlans.length
  const dailyQuantity = useMemo(() => medicationSlotQuantityText(withDosageForm(allActivePlans, medicationById)), [allActivePlans, medicationById])
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

  // 回傳讀取到的資料而非 void：呼叫端（useMedicationAdminForm）需要用最新的 medications
  // 重新解析目前選取的 medicationId（resolveMedicationSelection），但那個欄位屬於「既有醫囑表單」
  // 那組狀態，不該讓這個只管資料的 hook 反過來認識它。
  const refresh = async () => {
    setLoading(true)
    setLoadFailed(false)
    try {
      const data = await readMedicationAdminData(patientId)
      setPlans(data.plans)
      setMedications(data.medications)
      return data
    } catch (error) {
      setLoadFailed(true)
      throw error
    } finally {
      // 讀取失敗也必須結束載入，否則照護者會一直看到無法操作的假載入畫面。
      setLoading(false)
    }
  }

  return {
    plans,
    medications,
    loading,
    loadFailed,
    registryResults,
    searchingRegistry,
    selectedCatalogProduct, setSelectedCatalogProduct,
    medicationById,
    activeAccount,
    canEditSubject,
    personalMedicationIds,
    personalMedications,
    activePlanGroups,
    allActivePlans,
    dailyMedicationCount,
    dailyQuantity,
    catalogResults,
    filteredRegistryResults,
    refresh,
  }
}
