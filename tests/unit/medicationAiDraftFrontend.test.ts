/*
檔案用途：驗證前端 src/lib/medication/medicationAiDraft.ts 對 medication-ai-draft Edge Function 回應的解析邊界，
以及「草稿是否仍綁定目前病人」判斷式 draftMatchesPatient 的每個分支；病人綁定是 issue #664 最高優先
的健康安全要求，必須有獨立、不依賴元件渲染環境的單元測試覆蓋這條判斷式。
檔名刻意跟 tests/unit/medicationAiDraft.test.ts 區分：那一份測試的是
supabase/functions/medication-ai-draft/medicationAiDraft.ts（後端純邏輯，issue #663），
這一份測試的是 src/lib/medication/medicationAiDraft.ts（前端回應驗證，issue #664），兩者是不同檔案、不同執行環境。
所在層：tests/unit；不呼叫真正的 Supabase Function。
主要關聯：src/lib/medication/medicationAiDraft.ts、src/features/medication/components/MedicationAiDraftSection.tsx。
*/
import { describe, expect, test } from 'bun:test'
import { draftMatchesPatient, parseMedicationAiDraftResponse } from '../../src/lib/medication/medicationAiDraft'

const validItem = {
  brandName: 'Panadol', genericName: 'Paracetamol', strengthLabel: '500mg', dosageForm: 'tablet',
  doseAmount: 1, timesPerDay: 3, timingHint: '飯後', confidence: 'high',
}

describe('parseMedicationAiDraftResponse', () => {
  test('接受合法回應並保留欄位', () => {
    const parsed = parseMedicationAiDraftResponse({ patientId: 'patient-1', items: [validItem] })
    expect(parsed).toEqual({ patientId: 'patient-1', items: [validItem] })
  })

  test('接受全部欄位皆為 null 的低信心項目', () => {
    const nullItem = { brandName: null, genericName: null, strengthLabel: null, dosageForm: null, doseAmount: null, timesPerDay: null, timingHint: null, confidence: 'low' }
    const parsed = parseMedicationAiDraftResponse({ patientId: 'patient-1', items: [nullItem] })
    expect(parsed.items[0]).toEqual(nullItem)
  })

  test('接受空陣列（AI 沒有從照片辨識出任何藥品）', () => {
    const parsed = parseMedicationAiDraftResponse({ patientId: 'patient-1', items: [] })
    expect(parsed.items).toEqual([])
  })

  test.each([
    [null],
    [{}],
    [{ patientId: '', items: [] }],
    [{ patientId: 1, items: [] }],
    [{ patientId: 'patient-1', items: 'not-an-array' }],
    [{ patientId: 'patient-1', items: [{ ...validItem, brandName: 1 }] }],
    [{ patientId: 'patient-1', items: [{ ...validItem, dosageForm: 'syrup' }] }],
    [{ patientId: 'patient-1', items: [{ ...validItem, doseAmount: 'one' }] }],
    [{ patientId: 'patient-1', items: [{ ...validItem, timesPerDay: 'three' }] }],
    [{ patientId: 'patient-1', items: [{ ...validItem, confidence: 'medium' }] }],
    [{ patientId: 'patient-1', items: [{ ...validItem, confidence: undefined }] }],
    [{ patientId: 'patient-1', items: [null] }],
  ])('拒絕不合法的回應形狀 %#', input => {
    expect(() => parseMedicationAiDraftResponse(input)).toThrow()
  })
})

describe('draftMatchesPatient', () => {
  test('草稿的 patientId 與目前病人一致時視為相符', () => {
    expect(draftMatchesPatient({ patientId: 'patient-1', items: [] }, 'patient-1')).toBe(true)
  })

  test('草稿的 patientId 與目前病人不一致時視為不相符（遲到回應或套用當下已切換病人）', () => {
    expect(draftMatchesPatient({ patientId: 'patient-1', items: [] }, 'patient-2')).toBe(false)
  })

  test('沒有草稿（已被清空）時視為不相符', () => {
    expect(draftMatchesPatient(null, 'patient-1')).toBe(false)
  })
})
