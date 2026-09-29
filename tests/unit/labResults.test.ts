/*
檔案用途：驗證白名單檢驗值中繼資料（單位、小數位、同義配對）與範圍判讀純函式。
所在層：tests/unit 單元測試層。
主要關聯：對應 src/lib/labResults.ts（issue #687，S4）。
*/
import { describe, expect, test } from 'bun:test'
import { LAB_ITEM_CODES, LAB_ITEM_META, labRangeStatus, sampledAtFromDateKey, sampledDateKey } from '../../src/lib/labResults'
import type { PatientLabResult } from '../../src/types/database'

function labResult(overrides: Partial<PatientLabResult> = {}): PatientLabResult {
  return {
    id: 'lab-1', patient_id: 'patient-1', item_code: 'K', value: 4.0, unit: 'mmol/L',
    reference_low: 3.5, reference_high: 5.1, sampled_at: '2026-07-10T00:00:00.000Z',
    institution: null, notes: null, source: 'manual', source_fingerprint: null,
    recorded_by: 'caregiver@example.com', created_at: '2026-07-10T00:00:00.000Z',
    ...overrides,
  }
}

describe('lab result metadata', () => {
  test('covers exactly the seven approved item codes with unit bound to item', () => {
    expect(LAB_ITEM_CODES.sort()).toEqual(['CR', 'EGFR', 'GLU', 'HB', 'HBA1C', 'K', 'NA'])
    expect(LAB_ITEM_META.K.unit).toBe('mmol/L')
    expect(LAB_ITEM_META.NA.unit).toBe('mmol/L')
    expect(LAB_ITEM_META.CR.unit).toBe('mg/dL')
    expect(LAB_ITEM_META.EGFR.unit).toBe('mL/min/1.73m2')
    expect(LAB_ITEM_META.HBA1C.unit).toBe('%')
    expect(LAB_ITEM_META.GLU.unit).toBe('mg/dL')
    expect(LAB_ITEM_META.HB.unit).toBe('g/dL')
  })

  // 第一版只做同義配對：A12B↔K、A10↔GLU/HbA1c（issue #687）；其餘四項目前沒有對應的慢性病用藥分類。
  test('only maps the two approved synonym pairs to a medication group', () => {
    expect(LAB_ITEM_META.K.relatedMedicationGroups).toEqual(['potassium'])
    expect(LAB_ITEM_META.GLU.relatedMedicationGroups).toEqual(['diabetes'])
    expect(LAB_ITEM_META.HBA1C.relatedMedicationGroups).toEqual(['diabetes'])
    expect(LAB_ITEM_META.NA.relatedMedicationGroups).toEqual([])
    expect(LAB_ITEM_META.CR.relatedMedicationGroups).toEqual([])
    expect(LAB_ITEM_META.EGFR.relatedMedicationGroups).toEqual([])
    expect(LAB_ITEM_META.HB.relatedMedicationGroups).toEqual([])
  })
})

// 獨立複審抓到的漂移：採檢日若以瀏覽器時區寫入、再用 UTC 字串 slice(0, 10) 讀回，台北使用者會少一天，
// 且每次編輯再存一次就再往前推一天。這裡鎖住「寫入與讀回都走台北日曆日」的往返不變量。
describe('sampled_at ↔ calendar date key', () => {
  test('round-trips a Taipei calendar date without drifting a day', () => {
    const iso = sampledAtFromDateKey('2026-07-10')
    expect(iso).toBe('2026-07-09T16:00:00.000Z')
    expect(sampledDateKey(iso)).toBe('2026-07-10')
    // 舊寫法會回 2026-07-09——正是要防的那一天漂移。
    expect(iso.slice(0, 10)).not.toBe(sampledDateKey(iso))
  })

  test('reads a PostgREST-style +00:00 timestamp back to the same Taipei date', () => {
    expect(sampledDateKey('2026-07-09T16:00:00+00:00')).toBe('2026-07-10')
    expect(sampledDateKey('2026-07-10T15:59:59+00:00')).toBe('2026-07-10')
    expect(sampledDateKey('2026-07-10T16:00:00+00:00')).toBe('2026-07-11')
  })
})

describe('labRangeStatus', () => {
  test('returns unknown when the report has no reference range', () => {
    expect(labRangeStatus(labResult({ reference_low: null, reference_high: null }))).toBe('unknown')
    expect(labRangeStatus(labResult({ reference_low: 3.5, reference_high: null }))).toBe('unknown')
  })

  test('classifies below/within/above using this report’s own reference range', () => {
    expect(labRangeStatus(labResult({ value: 2.8, reference_low: 3.5, reference_high: 5.1 }))).toBe('below')
    expect(labRangeStatus(labResult({ value: 4.0, reference_low: 3.5, reference_high: 5.1 }))).toBe('within')
    expect(labRangeStatus(labResult({ value: 5.9, reference_low: 3.5, reference_high: 5.1 }))).toBe('above')
    expect(labRangeStatus(labResult({ value: 3.5, reference_low: 3.5, reference_high: 5.1 }))).toBe('within')
    expect(labRangeStatus(labResult({ value: 5.1, reference_low: 3.5, reference_high: 5.1 }))).toBe('within')
  })
})
