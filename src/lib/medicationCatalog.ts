/*
檔案用途：定義藥品目錄的搜尋、TFDA 官方庫檢索與科別篩選資料。
所在層：src/lib 共用資料處理層；不直接呈現畫面。
主要關聯：MedicationAdminSection 用此處的科別與搜尋結果建立藥單選擇介面。
*/
import type { MedicationOption } from './medicationAdmin'
import type { LocalizedText } from './i18n'
import type { MedicationCatalog } from '../types/database'

import { globalCatalogRegistry, TfdaCatalogProvider } from './medicationCatalogRegistry'
export { globalCatalogRegistry }
export type { MedicationCatalogResult, MedicationCatalogSource } from './medicationCatalogRegistry'

export const MEDICATION_SPECIALTIES: readonly [string, LocalizedText][] = [
  ['cardiovascular', { id: 'Kardiovaskular', zh: '心血管內科', en: 'Cardiovascular Medicine' }],
  ['mental_health', { id: 'Kesehatan jiwa', zh: '身心科', en: 'Kesehatan jiwa' }],
  ['gastroenterology', { id: 'Gastroenterologi', zh: '肝膽胃腸科', en: 'Gastroenterologi' }],
  ['neurology', { id: 'Neurologi', zh: '神經內科', en: 'Neurologi' }],
  ['other', { id: 'Lainnya', zh: '其他', en: 'Other' }],
]

export function normalizeMedicationQuery(input: string) {
  // 搜尋只統一外觀差異，刻意保留數字與劑量，避免 50 mg 和 100 mg 被誤視為同一藥。
  return input
    .normalize('NFKC')
    .toLowerCase()
    .trim()
    .replace(/[‐-‒–—]/g, '-')
    .replace(/milligrams?\b/g, 'mg')
    .replace(/毫克/g, 'mg')
    .replace(/\s+/g, ' ')
}

export function isDrugSuitableForSpecies(medication: Partial<MedicationCatalog>, species: string): { suitable: boolean; contraindicated: boolean } {
  const contra = medication.contraindicated_species ?? []
  if (contra.includes(species)) {
    return { suitable: false, contraindicated: true }
  }
  const app = medication.applicable_species
  if (!app || app.length === 0 || app.includes(species) || app.includes('all')) {
    return { suitable: true, contraindicated: false }
  }
  return { suitable: false, contraindicated: false }
}

export function searchMedicationCatalog(medications: MedicationOption[], query: string, specialty: string, excludedMedicationIds = new Set<string>()) {
  const normalizedQuery = normalizeMedicationQuery(query)
  return medications.filter(medication => {
    // 「其他既有藥品」必須排除已在個人藥箱的項目，才不會讓同一顆藥看似要加入兩次。
    if (excludedMedicationIds.has(medication.id)) return false
    if (specialty && !medication.specialties.includes(specialty)) return false
    if (!normalizedQuery) return Boolean(specialty)
    // 中文名、官方代碼、動物用藥許可證、適應症與製造商也要可搜尋，提供完整的搜尋體驗。
    const terms = normalizeMedicationQuery([
      medication.brand_name,
      medication.brand_name_zh ?? '',
      medication.generic_name,
      medication.strength_mg,
      medication.id,
      medication.tfda_license_number ?? '',
      medication.nhi_drug_code ?? '',
      medication.animal_drug_license_number ?? '',
      medication.indications ?? '',
      medication.manufacturer ?? '',
      ...(medication.applicable_species ?? []),
    ].join(' '))
    return terms.includes(normalizedQuery)
  }).slice(0, 10)
}

export async function searchMedicationRegistry(query: string, limit = 10, sources?: ('tfda' | 'nhi_tcm' | 'moa_animal')[]) {
  return globalCatalogRegistry.searchAll(query, limit, sources)
}

export async function searchTfdaDrugProducts(query: string, limit = 10) {
  // 保留舊有 searchTfdaDrugProducts 介面相容性，底層透過 TfdaCatalogProvider 策略處理。
  const provider = new TfdaCatalogProvider()
  return provider.search(query, limit)
}


export function parseDosageFormFromText(text: string): 'tablet' | 'capsule' | 'liquid' | 'powder' {
  const lower = text.toLowerCase()
  // 優先判斷膠囊與液體，劑型無法精確判斷時預設為錠劑。
  if (lower.includes('capsule') || text.includes('膠囊')) return 'capsule'
  if (lower.includes('liquid') || lower.includes('syrup') || text.includes('液') || text.includes('懸液') || text.includes('糖漿')) return 'liquid'
  // 粉包在官方劑型寫成「散劑／顆粒劑／乾粉」；判斷放在錠劑之前，避免「顆粒」被當成「顆」。
  if (lower.includes('powder') || lower.includes('granule') || lower.includes('sachet') || text.includes('散劑') || text.includes('顆粒') || text.includes('粉劑') || text.includes('乾粉') || text.includes('粉包')) return 'powder'
  return 'tablet'
}

export function parseStrengthFromDrugName(name: string): number {
  // 從品名中自動擷取劑量數字（如 60 毫克 或 60mg），避免照護者手動輸入時輸入錯。
  const match = name.match(/(\d+(?:\.\d+)?)\s*(?:毫克|mg)\b/i)
  if (match) {
    const val = Number(match[1])
    if (Number.isFinite(val) && val > 0) return val
  }
  const numberMatch = name.match(/\b(\d+(?:\.\d+)?)\b/)
  if (numberMatch) {
    const val = Number(numberMatch[1])
    if (Number.isFinite(val) && val > 0 && val < 5000) return val
  }
  return 0
}

