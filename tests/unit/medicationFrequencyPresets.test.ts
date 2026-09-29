// 檔案用途：測試台灣常見服藥頻率預設組合與 AI 比對演算法。
// 所在層：tests/unit；單元測試層。
// 主要關聯：測試 src/lib/medication/medicationFrequencyPresets.ts。

import { describe, expect, test } from 'bun:test'
import {
  TAIWAN_MEDICATION_FREQUENCY_PRESETS,
  matchFrequencyPreset,
  findMatchingPresetBySlots,
} from '../../src/lib/medication/medicationFrequencyPresets'

describe('medicationFrequencyPresets', () => {
  test('包含台灣常見的一天三次與一天四次等預設選項', () => {
    const ids = TAIWAN_MEDICATION_FREQUENCY_PRESETS.map(p => p.id)
    expect(ids).toContain('tid_pc') // 一天三次，餐後
    expect(ids).toContain('tid_any') // 一天三次，餐前餐後都可以
    expect(ids).toContain('tid_ac') // 一天三次，餐前
    expect(ids).toContain('qid_pc_hs') // 一天四次，三餐後及睡前
    expect(ids).toContain('qid_ac_hs') // 一天四次，三餐前及睡前
    expect(ids).toContain('bid_pc') // 一天二次，早晚飯後
    expect(ids).toContain('qd_morning_pc') // 一天一次，早餐後
    expect(ids).toContain('qd_hs') // 一天一次，睡前
  })

  test('每個預設選項具備完整三語文字與對應的 slots', () => {
    for (const preset of TAIWAN_MEDICATION_FREQUENCY_PRESETS) {
      expect(preset.label.zh.length).toBeGreaterThan(0)
      expect(preset.label.id.length).toBeGreaterThan(0)
      expect(preset.label.en.length).toBeGreaterThan(0)
      expect(preset.slots.length).toBe(preset.timesPerDay)
      expect(preset.slots.length).toBeGreaterThan(0)
    }
  })

  describe('matchFrequencyPreset 智慧比對', () => {
    test('次數為 3 且時機為「飯後」或「三餐飯後」時，比對到 tid_pc（一天三次，餐後）', () => {
      const match1 = matchFrequencyPreset(3, '三餐飯後')
      expect(match1?.id).toBe('tid_pc')
      expect(match1?.slots).toEqual(['after_breakfast', 'after_lunch', 'after_dinner'])

      const match2 = matchFrequencyPreset(3, '餐後 30 分鐘')
      expect(match2?.id).toBe('tid_pc')

      const match3 = matchFrequencyPreset(3, 'TID pc')
      expect(match3?.id).toBe('tid_pc')
    })

    test('次數為 3 且時機為「餐前餐後都可以」或「不拘」時，比對到 tid_any', () => {
      const match1 = matchFrequencyPreset(3, '餐前餐後都可以')
      expect(match1?.id).toBe('tid_any')

      const match2 = matchFrequencyPreset(3, '早中晚均可')
      expect(match2?.id).toBe('tid_any')
    })

    test('次數為 3 且時機為「飯前」時，比對到 tid_ac（一天三次，餐前）', () => {
      const match1 = matchFrequencyPreset(3, '三餐前')
      expect(match1?.id).toBe('tid_ac')
      expect(match1?.slots).toEqual(['before_breakfast', 'before_lunch', 'before_dinner'])

      const match2 = matchFrequencyPreset(3, '飯前30分鐘服用')
      expect(match2?.id).toBe('tid_ac')

      // 支援英文與印尼文 before meal / sebelum makan
      const matchEn = matchFrequencyPreset(3, 'before meals')
      expect(matchEn?.id).toBe('tid_ac')

      const matchId = matchFrequencyPreset(3, 'sebelum makan')
      expect(matchId?.id).toBe('tid_ac')
    })

    test('次數為 4 且時機為三餐後加睡前時，比對到 qid_pc_hs', () => {
      const match = matchFrequencyPreset(4, '三餐飯後及睡前')
      expect(match?.id).toBe('qid_pc_hs')
      expect(match?.slots).toEqual(['after_breakfast', 'after_lunch', 'after_dinner', 'before_bed'])
    })

    test('次數為 4 且時機為三餐前加睡前時，比對到 qid_ac_hs', () => {
      const match = matchFrequencyPreset(4, '飯前與睡前')
      expect(match?.id).toBe('qid_ac_hs')
      expect(match?.slots).toEqual(['before_breakfast', 'before_lunch', 'before_dinner', 'before_bed'])
    })

    test('timesPerDay 為 null 但 timingHint 包含「一天三次」或「TID」時能自動推斷次數', () => {
      const match = matchFrequencyPreset(null, '一天三次 飯後')
      expect(match?.id).toBe('tid_pc')
    })

    test('若完全無法推斷任何次數或時機，回傳 null', () => {
      expect(matchFrequencyPreset(null, null)).toBeNull()
      expect(matchFrequencyPreset(null, '未註明')).toBeNull()
    })

    test('無法從次數或關鍵字推斷一天次數，但時機字串明確含「睡前」時，仍比對到 qd_hs', () => {
      expect(matchFrequencyPreset(null, '睡前')?.id).toBe('qd_hs')
    })

    test('次數為 2 時比對到 bid_ac（餐前）或 bid_pc（餐後）', () => {
      expect(matchFrequencyPreset(2, '早晚飯前')?.id).toBe('bid_ac')
      expect(matchFrequencyPreset(2, '早晚飯後')?.id).toBe('bid_pc')
    })

    test('次數為 1 時依睡前／餐前／餐後分別比對到 qd_hs、qd_morning_ac、qd_morning_pc', () => {
      expect(matchFrequencyPreset(1, '睡前')?.id).toBe('qd_hs')
      expect(matchFrequencyPreset(1, '早餐前')?.id).toBe('qd_morning_ac')
      // 一天一次且沒有明確餐前/睡前字樣時，預設落在早餐後。
      expect(matchFrequencyPreset(1, '早餐後')?.id).toBe('qd_morning_pc')
      expect(matchFrequencyPreset(1, '')?.id).toBe('qd_morning_pc')
    })

    test('次數為 3 或 4 但時機字串含糊（既非餐前也非餐後也非皆可）時，回傳 null 讓照護者自訂', () => {
      expect(matchFrequencyPreset(3, '不明確的服藥說明')).toBeNull()
      expect(matchFrequencyPreset(4, '不明確的服藥說明')).toBeNull()
    })

    test('次數為 2 但時機字串含糊時，回傳 null 讓照護者自訂', () => {
      expect(matchFrequencyPreset(2, '不明確的服藥說明')).toBeNull()
    })
  })

  describe('findMatchingPresetBySlots 比對已選時段', () => {
    test('當選取早中晚飯後三個時段時，命中 tid_pc 或 tid_any', () => {
      const preset = findMatchingPresetBySlots(['after_breakfast', 'after_lunch', 'after_dinner'])
      expect(preset).not.toBeNull()
      expect(['tid_pc', 'tid_any']).toContain(preset!.id)
    })

    test('當選取早中晚飯前三個時段時，命中 tid_ac', () => {
      const preset = findMatchingPresetBySlots(['before_breakfast', 'before_lunch', 'before_dinner'])
      expect(preset?.id).toBe('tid_ac')
    })

    test('當選取的時段不屬於任何預設時，回傳 null（自訂複選）', () => {
      const preset = findMatchingPresetBySlots(['after_breakfast', 'before_bed'])
      expect(preset).toBeNull()
    })
  })
})
