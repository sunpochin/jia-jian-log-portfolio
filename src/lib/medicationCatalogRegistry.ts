/*
檔案用途：實作藥品目錄的 Strategy 與 Registry 模式，用來整合多種藥品資料來源。
所在層：src/lib 共用資料處理層。
主要關聯：由 medicationCatalog.ts 與 MedicationAdminSection.tsx 呼叫。
*/
import { supabase } from './supabase'

export type MedicationCatalogSource = 'tfda' | 'nhi_tcm' | 'moa_animal'

export interface MedicationCatalogResult {
  id: string
  source: MedicationCatalogSource
  sourceId: string // e.g. tfda_license_number, nhi_code, license_number
  nameZh: string
  nameEn?: string
  ingredient?: string
  dosageForm?: string
  manufacturer?: string
  score?: number
  isPossibleMatch?: boolean
}

export interface MedicationCatalogProvider {
  sourceName: MedicationCatalogSource
  search(query: string, limit?: number): Promise<MedicationCatalogResult[]>
}

export class TfdaCatalogProvider implements MedicationCatalogProvider {
  sourceName: MedicationCatalogSource = 'tfda'

  async search(query: string, limit = 10): Promise<MedicationCatalogResult[]> {
    if (query.length < 2) return []
    try {
      const { data, error } = await supabase.rpc('search_drug_products', { p_query: query, p_limit: limit })
      if (error) {
        console.error('[TfdaCatalogProvider] search error', error)
        return []
      }
      return (data || []).map((item: any) => ({
        id: item.id,
        source: this.sourceName,
        sourceId: item.tfda_license_number,
        nameZh: item.chinese_name,
        nameEn: item.english_name,
        ingredient: item.ingredient_name,
        dosageForm: item.dosage_form || undefined,
        manufacturer: item.manufacturer_name || undefined,
        score: item.score,
        isPossibleMatch: item.is_possible_match
      }))
    } catch (e) {
      console.error('[TfdaCatalogProvider] exception', e)
      return []
    }
  }
}

export class NhiTcmCatalogProvider implements MedicationCatalogProvider {
  sourceName: MedicationCatalogSource = 'nhi_tcm'

  async search(query: string, limit = 10): Promise<MedicationCatalogResult[]> {
    if (query.length < 2) return []
    try {
      const { data, error } = await supabase.rpc('search_nhi_tcm_products', { p_query: query, p_limit: limit })
      if (error) {
        console.error('[NhiTcmCatalogProvider] search error', error)
        return []
      }
      return (data || []).map((item: any) => ({
        id: item.id,
        source: this.sourceName,
        sourceId: item.nhi_code,
        nameZh: item.name_zh,
        dosageForm: item.dosage_form || undefined,
        manufacturer: item.manufacturer_name || undefined,
        score: item.score,
        isPossibleMatch: item.is_possible_match
      }))
    } catch (e) {
      console.error('[NhiTcmCatalogProvider] exception', e)
      return []
    }
  }
}

export class MoaAnimalCatalogProvider implements MedicationCatalogProvider {
  sourceName: MedicationCatalogSource = 'moa_animal'

  async search(query: string, limit = 10): Promise<MedicationCatalogResult[]> {
    if (query.length < 2) return []
    try {
      const { data, error } = await supabase.rpc('search_moa_animal_drugs', { p_query: query, p_limit: limit })
      if (error) {
        console.error('[MoaAnimalCatalogProvider] search error', error)
        return []
      }
      return (data || []).map((item: any) => ({
        id: item.id,
        source: this.sourceName,
        sourceId: item.license_number,
        nameZh: item.name_zh,
        nameEn: item.name_en || undefined,
        ingredient: item.ingredients || undefined,
        dosageForm: item.dosage_form || undefined,
        manufacturer: item.manufacturer_name || undefined,
        score: item.score,
        isPossibleMatch: item.is_possible_match
      }))
    } catch (e) {
      console.error('[MoaAnimalCatalogProvider] exception', e)
      return []
    }
  }
}

export class MedicationCatalogRegistry {
  private providers: Map<MedicationCatalogSource, MedicationCatalogProvider> = new Map()

  register(provider: MedicationCatalogProvider) {
    this.providers.set(provider.sourceName, provider)
  }

  async searchAll(query: string, limit = 10, sources?: MedicationCatalogSource[]): Promise<MedicationCatalogResult[]> {
    if (query.length < 2) return []
    const targets = sources ? sources : Array.from(this.providers.keys())
    const promises = targets.map(source => {
      const provider = this.providers.get(source)
      // 單一策略失敗時捕獲異常並回傳空陣列，確保單一來源問題不會中斷整體搜尋
      return provider
        ? provider.search(query, limit).catch(err => {
            console.error(`[MedicationCatalogRegistry] provider search error for ${source}`, err)
            return []
          })
        : Promise.resolve([])
    })
    const results = await Promise.all(promises)
    // 依分數排序，合併多來源結果
    const flat = results.flat()
    return flat.sort((a, b) => {
      if (a.isPossibleMatch !== b.isPossibleMatch) return a.isPossibleMatch ? 1 : -1
      return (b.score || 0) - (a.score || 0)
    }).slice(0, limit)
  }
}

export const globalCatalogRegistry = new MedicationCatalogRegistry()
globalCatalogRegistry.register(new TfdaCatalogProvider())
globalCatalogRegistry.register(new NhiTcmCatalogProvider())
globalCatalogRegistry.register(new MoaAnimalCatalogProvider())
