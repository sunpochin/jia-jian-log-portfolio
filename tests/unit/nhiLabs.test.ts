/*
檔案用途：驗證 HealthWorkbench labs 知識庫（aliasMap／別名對照表）移植後行為與上游一致，
以及 normalizeNhiLabRow() 的白名單命中／非白名單負向案例。所有 fixture 皆為手造合成資料，
不含任何真實健保匯出檔或真實病歷內容。
所在層：tests/unit；保護 src/lib/adapters/nhi/labs.ts 的純函式行為。
主要關聯：src/lib/adapters/nhi/labs.ts；src/lib/labItemMeta.ts；
          移植對照的上游測試：notoriouslab/health-workbench tests/test_knowledge.py
          （test_alias_mapping、test_egfr_not_merged）。
*/
import { describe, expect, test } from 'bun:test'
import {
  buildAliasMap,
  NHI_LAB_KNOWLEDGE_ENTRIES,
  normalizeNhiLabRow,
} from '../../src/lib/adapters/nhi/labs'
import { LAB_ITEM_META } from '../../src/lib/labItemMeta'

describe('nhi/labs: knowledge base（移植自 labs.yaml）', () => {
  test('至少收錄上游 labs.yaml 的全部條目數（parity：test_entry_schema 斷言 >= 30）', () => {
    expect(NHI_LAB_KNOWLEDGE_ENTRIES.length).toBeGreaterThanOrEqual(30)
  })
})

describe('nhi/labs: buildAliasMap（移植自 labs.js aliasMap，parity 對照 test_knowledge.py）', () => {
  test('別名與正規化名稱本身都指向同一個 normalized_name（對照 test_alias_mapping）', () => {
    const m = buildAliasMap(NHI_LAB_KNOWLEDGE_ENTRIES)
    expect(m.get('Hb')).toBe('Hemoglobin')
    expect(m.get('HB')).toBe('Hemoglobin')
    expect(m.get('Hemoglobin')).toBe('Hemoglobin')
    expect(m.get('Lym')).toBe('Lymphocyte')
    expect(m.get('Lym.')).toBe('Lymphocyte')
    expect(m.get('BUN')).toBe('Blood Urea Nitrogen')
    expect(m.get('UN')).toBe('Blood Urea Nitrogen')
  })

  test('eGFR 三個公式變體各自獨立、不合併（對照 test_egfr_not_merged）', () => {
    const m = buildAliasMap(NHI_LAB_KNOWLEDGE_ENTRIES)
    const targets = new Set([m.get('eGFR (CKD-EPI)'), m.get('eGFR (MDRD)'), m.get('eGFR Male')])
    expect(targets.size).toBe(3)
  })

  test('別名衝突時拋出明確錯誤，不得靜默覆蓋（移植自 labs.js 的別名衝突檢查）', () => {
    expect(() => buildAliasMap([
      { normalizedName: 'A', aliases: ['X'] },
      { normalizedName: 'B', aliases: ['X'] },
    ])).toThrow(/別名衝突/)
  })

  test('不在知識庫裡的項目名稱查無對應', () => {
    const m = buildAliasMap(NHI_LAB_KNOWLEDGE_ENTRIES)
    expect(m.get('Unknown Test XYZ')).toBeUndefined()
  })
})

describe('nhi/labs: normalizeNhiLabRow 白名單命中（S4：K／NA／CR／EGFR／HBA1C／GLU／HB）', () => {
  test('Hb／HB／Hemoglobin 都命中 HB，單位固定為 LAB_ITEM_META.HB.unit', () => {
    for (const raw of ['Hb', 'HB', 'Hemoglobin']) {
      const result = normalizeNhiLabRow({ 'r7.10': raw })
      expect(result.code).toBe('HB')
      expect(result.unit).toBe(LAB_ITEM_META.HB.unit)
    }
  })

  test('Cr／CRE／Creatinine 都命中 CR', () => {
    for (const raw of ['Cr', 'CRE', 'Creatinine']) {
      const result = normalizeNhiLabRow({ 'r7.10': raw })
      expect(result.code).toBe('CR')
      expect(result.unit).toBe(LAB_ITEM_META.CR.unit)
    }
  })

  test('三個 eGFR 公式變體都命中同一個 EGFR 代碼（本專案 schema 限制下的刻意簡化，非移植上游行為）', () => {
    for (const raw of ['eGFR (CKD-EPI)', 'eGFR (MDRD)', 'eGFR Male']) {
      const result = normalizeNhiLabRow({ 'r7.10': raw })
      expect(result.code).toBe('EGFR')
      expect(result.unit).toBe(LAB_ITEM_META.EGFR.unit)
    }
  })
})

describe('nhi/labs: normalizeNhiLabRow 非白名單負向案例', () => {
  test('知識庫裡有、但不在 S4 白名單的項目（ALT）回 code: null，unit 也是 null', () => {
    const result = normalizeNhiLabRow({ 'r7.10': 'ALT' })
    expect(result.code).toBeNull()
    expect(result.unit).toBeNull()
  })

  test('完全不在知識庫裡的項目名稱回 code: null', () => {
    const result = normalizeNhiLabRow({ 'r7.10': 'Unknown Test XYZ' })
    expect(result.code).toBeNull()
  })

  test('K／NA／HBA1C／GLU 目前上游知識庫尚無別名資料，即使帶上代碼字串本身也不命中', () => {
    for (const raw of ['K', 'NA', 'HBA1C', 'GLU', 'Potassium', 'Sodium', 'Glucose']) {
      expect(normalizeNhiLabRow({ 'r7.10': raw }).code).toBeNull()
    }
  })

  test('缺 r7.10 回 code: null，不拋例外', () => {
    expect(normalizeNhiLabRow({}).code).toBeNull()
  })
})
