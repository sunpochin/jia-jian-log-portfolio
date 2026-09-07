/*
檔案用途：測試 MedicationCatalogRegistry 及 TFDA、NHI 中藥、MOA 動物藥三種 Catalog Provider 的搜尋轉譯、Strategy 模式與異常處理邏輯。
所在層：tests/unit 單元測試層。
主要關聯：驗證 src/lib/medicationCatalogRegistry.ts 邏輯。
*/
import { beforeEach, describe, expect, mock, test } from 'bun:test'
import type { MedicationCatalogProvider } from '../../src/lib/medicationCatalogRegistry'

type RpcResponse = { data?: unknown; error?: unknown }
let rpcResponses: Record<string, RpcResponse> = {}

const mockSupabase = {
  rpc(name: string) {
    return Promise.resolve(rpcResponses[name] ?? { data: [], error: null })
  },
}

mock.module('../../src/lib/supabase', () => ({ supabase: mockSupabase }))

const {
  MedicationCatalogRegistry,
  MoaAnimalCatalogProvider,
  NhiTcmCatalogProvider,
  TfdaCatalogProvider,
  globalCatalogRegistry,
} = await import('../../src/lib/medicationCatalogRegistry')
// medicationCatalog.ts 只是薄相容層，底層仍是同一個 TfdaCatalogProvider；
// 沿用這裡已經建立好的 supabase.rpc mock，避免另開一個 mock.module 造成跨檔污染。
const { searchTfdaDrugProducts } = await import('../../src/lib/medicationCatalog')

describe('MedicationCatalogRegistry & Multi-source Providers', () => {
  beforeEach(() => {
    rpcResponses = {}
  })

  test('short queries under 2 characters return empty result across all providers', async () => {
    const tfda = new TfdaCatalogProvider()
    const nhiTcm = new NhiTcmCatalogProvider()
    const moa = new MoaAnimalCatalogProvider()

    expect(await tfda.search('a')).toEqual([])
    expect(await nhiTcm.search('1')).toEqual([])
    expect(await moa.search('x')).toEqual([])
    expect(await globalCatalogRegistry.searchAll('a')).toEqual([])
  })

  test('providers expose correct strategy source names', () => {
    const tfda = new TfdaCatalogProvider()
    const nhiTcm = new NhiTcmCatalogProvider()
    const moa = new MoaAnimalCatalogProvider()

    expect(tfda.sourceName).toBe('tfda')
    expect(nhiTcm.sourceName).toBe('nhi_tcm')
    expect(moa.sourceName).toBe('moa_animal')
  })

  test('TfdaCatalogProvider queries search_drug_products RPC and maps items', async () => {
    const provider = new TfdaCatalogProvider()

    rpcResponses.search_drug_products = {
      data: [
        {
          id: 'tfda-1',
          tfda_license_number: '衛署藥製字012345號',
          chinese_name: '阿斯匹靈錠',
          english_name: 'Aspirin',
          ingredient_name: 'Aspirin',
          dosage_form: '錠劑',
          manufacturer_name: '台灣製藥',
          score: 1.0,
          is_possible_match: false,
        },
      ],
      error: null,
    }

    const results = await provider.search('aspirin', 5)
    expect(results.length).toBe(1)
    expect(results[0].source).toBe('tfda')
    expect(results[0].nameZh).toBe('阿斯匹靈錠')
  })

  test('TfdaCatalogProvider handles RPC errors gracefully', async () => {
    const provider = new TfdaCatalogProvider()
    rpcResponses.search_drug_products = { data: null, error: { message: 'RPC Error' } }

    const results = await provider.search('aspirin')
    expect(results).toEqual([])
  })

  test('NhiTcmCatalogProvider queries search_nhi_tcm_products RPC and maps items', async () => {
    const provider = new NhiTcmCatalogProvider()

    rpcResponses.search_nhi_tcm_products = {
      data: [
        {
          id: 'tcm-1',
          nhi_code: 'A001234',
          name_zh: '葛根湯散',
          dosage_form: '散劑',
          manufacturer_name: '順天堂',
          score: 0.9,
          is_possible_match: false,
        },
      ],
      error: null,
    }

    const results = await provider.search('葛根湯', 5)
    expect(results.length).toBe(1)
    expect(results[0].source).toBe('nhi_tcm')
    expect(results[0].nameZh).toBe('葛根湯散')
  })

  test('NhiTcmCatalogProvider handles RPC errors gracefully', async () => {
    const provider = new NhiTcmCatalogProvider()
    rpcResponses.search_nhi_tcm_products = { data: null, error: { message: 'RPC Error' } }

    const results = await provider.search('葛根湯')
    expect(results).toEqual([])
  })

  test('MoaAnimalCatalogProvider queries search_moa_animal_drugs RPC and maps items', async () => {
    const provider = new MoaAnimalCatalogProvider()

    rpcResponses.search_moa_animal_drugs = {
      data: [
        {
          id: 'moa-1',
          license_number: '動藥製字10001號',
          name_zh: '愛波可錠',
          name_en: 'Apoquel',
          ingredients: 'Oclacitinib',
          dosage_form: '錠劑',
          manufacturer_name: '碩騰',
          score: 1.0,
          is_possible_match: false,
        },
      ],
      error: null,
    }

    const results = await provider.search('apoquel', 5)
    expect(results.length).toBe(1)
    expect(results[0].source).toBe('moa_animal')
    expect(results[0].nameZh).toBe('愛波可錠')
  })

  test('MoaAnimalCatalogProvider handles RPC errors gracefully', async () => {
    const provider = new MoaAnimalCatalogProvider()
    rpcResponses.search_moa_animal_drugs = { data: null, error: { message: 'RPC Error' } }

    const results = await provider.search('apoquel')
    expect(results).toEqual([])
  })

  test('MedicationCatalogRegistry combines search results from selected or all providers', async () => {
    const registry = new MedicationCatalogRegistry()
    registry.register(new TfdaCatalogProvider())
    registry.register(new NhiTcmCatalogProvider())

    rpcResponses.search_drug_products = {
      data: [{ id: '1', tfda_license_number: 'T1', chinese_name: '藥1', english_name: 'D1', ingredient_name: 'G1', dosage_form: '錠劑', manufacturer_name: 'M1', score: 0.8 }],
      error: null,
    }
    rpcResponses.search_nhi_tcm_products = {
      data: [{ id: '2', nhi_code: 'N1', name_zh: '中藥2', dosage_form: '散劑', manufacturer_name: 'M2', score: 0.9 }],
      error: null,
    }

    const allResults = await registry.searchAll('test')
    expect(allResults.length).toBe(2)

    const tfdaOnly = await registry.searchAll('test', 10, ['tfda'])
    expect(tfdaOnly.length).toBe(1)
    expect(tfdaOnly[0].source).toBe('tfda')
  })

  test('registry handles provider search failures gracefully without crashing other providers', async () => {
    const failingProvider: MedicationCatalogProvider = {
      sourceName: 'tfda',
      search: async () => {
        throw new Error('Network error during search')
      },
    }

    const healthyProvider: MedicationCatalogProvider = {
      sourceName: 'nhi_tcm',
      search: async () => [
        {
          id: 'tcm-safe',
          source: 'nhi_tcm',
          sourceId: 'A009999100',
          nameZh: '加味逍遙散濃縮細粒',
          score: 0.90,
          isPossibleMatch: false,
        },
      ],
    }

    const registry = new MedicationCatalogRegistry()
    registry.register(failingProvider)
    registry.register(healthyProvider)

    // 單一策略失敗時不應造成整體熔斷，仍可安全回傳其餘健康策略之結果
    const results = await registry.searchAll('加味', 10)
    expect(results.length).toBe(1)
    expect(results[0].id).toBe('tcm-safe')
  })

  test('globalCatalogRegistry delegates searchAll correctly', async () => {
    rpcResponses.search_drug_products = { data: [], error: null }
    rpcResponses.search_nhi_tcm_products = { data: [], error: null }
    rpcResponses.search_moa_animal_drugs = { data: [], error: null }
    const results = await globalCatalogRegistry.searchAll('test')
    expect(Array.isArray(results)).toBe(true)
  })
})

describe('searchTfdaDrugProducts backward-compat wrapper', () => {
  test('delegates to the same TfdaCatalogProvider used by the registry', async () => {
    rpcResponses.search_drug_products = {
      data: [{ id: 'tfda-1', tfda_license_number: 'L1', chinese_name: '易安穩', english_name: 'Exforge', ingredient_name: 'Amlodipine', dosage_form: 'tablet', manufacturer_name: 'Novartis', score: 0.95, is_possible_match: false }],
      error: null,
    }
    const results = await searchTfdaDrugProducts('易安穩', 5)
    expect(results).toEqual([{
      id: 'tfda-1', source: 'tfda', sourceId: 'L1', nameZh: '易安穩', nameEn: 'Exforge',
      ingredient: 'Amlodipine', dosageForm: 'tablet', manufacturer: 'Novartis', score: 0.95, isPossibleMatch: false,
    }])
  })
})
