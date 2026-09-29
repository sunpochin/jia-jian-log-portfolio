/*
檔案用途：驗證回診問題清單的純邏輯函式與範本文案。
所在層：tests/unit；純函式測試，不連線 Supabase。
主要關聯：src/lib/visitQuestions.ts。
*/
import { describe, expect, test } from 'bun:test'
import { nextSortOrder, visitQuestionSourceKey, VISIT_QUESTION_PRESETS, VISIT_QUESTION_STATUS_META } from '../../src/lib/visitQuestions'

describe('visit question pure logic', () => {
  test('computes the next sort order from the current maximum, starting at 1 for an empty list', () => {
    expect(nextSortOrder([])).toBe(1)
    expect(nextSortOrder([{ sort_order: 1 }, { sort_order: 3 }])).toBe(4)
    expect(nextSortOrder([{ sort_order: 0 }])).toBe(1)
  })

  // 照護閉環 T1（issue #945）：去重鍵只對「系統採納的觀察」成立，手動問題沒有來源，不能被誤判成同一筆。
  test('builds a source key only for pre-visit-rule questions with a complete pair', () => {
    expect(visitQuestionSourceKey({ source: 'pre_visit_rule', source_rule_id: 'R5', source_entity_id: 'lab-1' })).toBe('R5:lab-1')
    expect(visitQuestionSourceKey({ source: 'manual', source_rule_id: null, source_entity_id: null })).toBeNull()
    expect(visitQuestionSourceKey({ source: 'pre_visit_rule', source_rule_id: 'R5', source_entity_id: null })).toBeNull()
  })

  test('every status has a trilingual label', () => {
    for (const meta of Object.values(VISIT_QUESTION_STATUS_META)) {
      expect(meta.label.id).toBeTruthy()
      expect(meta.label.zh).toBeTruthy()
      expect(meta.label.en).toBeTruthy()
    }
  })

  // 為什麼要鎖住範本文案：issue #723 的教訓是「要問良性還是惡性」這種把腫瘤分類套到血管疾病的誤解；
  // 範本只能問事實（診斷名稱、數值、下次追蹤、何時要掛急診、日常活動調整），不能推論病因或建議治療。
  test('preset questions are trilingual and contain no diagnosis or treatment suggestions', () => {
    expect(VISIT_QUESTION_PRESETS.length).toBeGreaterThan(0)
    const forbiddenWords = ['良性', '惡性', 'benign', 'malignant', '建議', '應該吃', '應該用']
    for (const preset of VISIT_QUESTION_PRESETS) {
      expect(preset.id).toBeTruthy()
      expect(preset.zh).toBeTruthy()
      expect(preset.en).toBeTruthy()
      for (const word of forbiddenWords) {
        expect(preset.zh).not.toContain(word)
        expect(preset.en.toLowerCase()).not.toContain(word.toLowerCase())
      }
    }
  })
})
