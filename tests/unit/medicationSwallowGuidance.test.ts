/*
檔案用途：驗證官方劑型原文轉服用方式提示的關鍵字命中規則，並鎖死「永不輸出可以磨粉／可以剝半」紅線。
所在層：tests/unit 單元測試層。
主要關聯：驗證 src/lib/medication/medicationSwallowGuidance.ts；紅線來源見 issue #622／#624。
*/
import { describe, expect, test } from 'bun:test'
import { resolveSwallowGuidance, type SwallowGuidanceLevel } from '../../src/lib/medication/medicationSwallowGuidance'

// 紅線關鍵測試要覆蓋的所有輸入組合：涵蓋每個等級的關鍵字、非錠劑劑型、一般錠劑與完全無資料的情況。
const OFFICIAL_DOSAGE_FORM_SAMPLES: Array<string | null | undefined> = [
  undefined, null, '', '舌下錠', '咀嚼錠', '發泡錠', '分散錠', '口溶錠', '口崩錠',
  '腸溶膜衣錠', '腸衣錠', '持續性藥效錠', '緩釋錠', '長效錠', '控釋錠', '膜衣緩釋錠', '一般糖衣錠',
]
const DOSAGE_FORM_SAMPLES: Array<string | null | undefined> = [undefined, null, '', 'tablet', 'capsule', 'liquid', 'powder']

describe('medication swallow guidance resolver', () => {
  test('matches each official dosage-form keyword to its level', () => {
    const cases: Array<[string, SwallowGuidanceLevel]> = [
      ['舌下錠', 'sublingual'],
      ['咀嚼錠', 'chewable'],
      ['嚼錠', 'chewable'],
      ['發泡錠', 'dissolve_in_water'],
      ['分散錠', 'dissolve_in_water'],
      ['口溶錠', 'dissolve_in_mouth'],
      ['口崩錠', 'dissolve_in_mouth'],
      ['腸溶膜衣錠', 'swallow_whole'],
      ['腸衣錠', 'swallow_whole'],
      ['持續性藥效錠', 'swallow_whole'],
      ['緩釋錠', 'swallow_whole'],
      ['長效錠', 'swallow_whole'],
      ['控釋錠', 'swallow_whole'],
    ]
    for (const [officialDosageFormText, level] of cases) {
      expect(resolveSwallowGuidance({ officialDosageFormText, dosageForm: 'tablet' }).level).toBe(level)
    }
  })

  test('falls back to not_a_pill from the collapsed four-value dosage_form when there is no official text', () => {
    expect(resolveSwallowGuidance({ officialDosageFormText: null, dosageForm: 'liquid' }).level).toBe('not_a_pill')
    expect(resolveSwallowGuidance({ officialDosageFormText: undefined, dosageForm: 'powder' }).level).toBe('not_a_pill')
  })

  test('not_a_pill wins over an official-text keyword match when dosage_form says liquid/powder', () => {
    // dosageForm（parseDosageFormFromText 判斷出的四值劑型）比關鍵字更直接：「長效」「緩釋」「控釋」
    // 這類字樣同時會出現在針劑／液劑的官方劑型原文裡（例如「長效注射液」），若讓關鍵字贏，會把一瓶
    // 液劑針劑判成 swallow_whole，叫照護者把針劑「整顆吞下」——這正是紅線之外另一種會誤導照護行為的錯誤。
    expect(resolveSwallowGuidance({ officialDosageFormText: '長效注射液', dosageForm: 'liquid' }).level).toBe('not_a_pill')
    expect(resolveSwallowGuidance({ officialDosageFormText: '舌下錠', dosageForm: 'liquid' }).level).toBe('not_a_pill')
  })

  test('returns unknown and points to the pharmacist when there is no official data at all', () => {
    const guidance = resolveSwallowGuidance({ officialDosageFormText: null, dosageForm: 'tablet' })
    expect(guidance.level).toBe('unknown')
    expect(guidance.severity).toBe('unknown')
    expect(guidance.text.zh).toContain('問藥師')
    expect(guidance.text.id.toLowerCase()).toContain('apoteker')
    expect(guidance.text.en.toLowerCase()).toContain('pharmacist')
    expect(guidance.text.en.toLowerCase()).not.toContain('can be crushed')
  })

  test('dissolve_in_water (泡水溶解) and dissolve_in_mouth (口中化開) are distinct routes with distinct text', () => {
    const water = resolveSwallowGuidance({ officialDosageFormText: '發泡錠', dosageForm: 'tablet' })
    const mouth = resolveSwallowGuidance({ officialDosageFormText: '口崩錠', dosageForm: 'tablet' })
    expect(water.level).toBe('dissolve_in_water')
    expect(mouth.level).toBe('dissolve_in_mouth')
    expect(water.text).not.toEqual(mouth.text)
    expect(water.text.zh).toContain('泡')
    expect(mouth.text.zh).not.toContain('泡')
    expect(mouth.text.zh).toContain('化開')
  })

  test('a coated extended-release tablet still says do-not-crush-or-split even though such tablets often have a visible score mark', () => {
    // 這正是紅線裡「刻痕尤其不是例外」的案例：膜衣緩釋錠外觀上常見一條刻痕，但服用方式提示只看
    // 官方劑型關鍵字（緩釋），不看刻痕，結果必須仍是「整顆吞、不可磨粉或剝半」。
    const guidance = resolveSwallowGuidance({ officialDosageFormText: '膜衣緩釋錠', dosageForm: 'tablet' })
    expect(guidance.level).toBe('swallow_whole')
    expect(guidance.text.zh).toContain('不可磨粉或剝半')
  })

  test('official_score_text (刻痕) is not part of the guidance input and cannot flip the verdict', () => {
    // resolveSwallowGuidance 的型別故意不接受 official_score_text；即使呼叫端手上的藥品物件
    // 刻痕欄位有值，這裡也只把 officialDosageFormText／dosageForm 傳進去，驗證刻痕完全不影響結果。
    const medicationWithScoreMark = { official_dosage_form_text: '膜衣錠', official_score_text: '一字刻痕', dosage_form: 'tablet' }
    const guidance = resolveSwallowGuidance({
      officialDosageFormText: medicationWithScoreMark.official_dosage_form_text,
      dosageForm: medicationWithScoreMark.dosage_form,
    })
    expect(guidance.level).toBe('unknown')
    expect(guidance.text.zh).toContain('問藥師')
  })

  test('every level provides a complete trilingual LocalizedText with no missing key', () => {
    const levels: SwallowGuidanceLevel[] = ['sublingual', 'chewable', 'dissolve_in_water', 'dissolve_in_mouth', 'swallow_whole', 'not_a_pill', 'unknown']
    const officialDosageFormTextByLevel: Record<SwallowGuidanceLevel, string | null> = {
      sublingual: '舌下錠',
      chewable: '咀嚼錠',
      dissolve_in_water: '發泡錠',
      dissolve_in_mouth: '口崩錠',
      swallow_whole: '緩釋錠',
      not_a_pill: null,
      unknown: null,
    }
    const dosageFormByLevel: Record<SwallowGuidanceLevel, string> = {
      sublingual: 'tablet', chewable: 'tablet', dissolve_in_water: 'tablet', dissolve_in_mouth: 'tablet',
      swallow_whole: 'tablet', not_a_pill: 'liquid', unknown: 'tablet',
    }
    for (const level of levels) {
      const guidance = resolveSwallowGuidance({ officialDosageFormText: officialDosageFormTextByLevel[level], dosageForm: dosageFormByLevel[level] })
      expect(guidance.level).toBe(level)
      expect(guidance.text.id.trim().length).toBeGreaterThan(0)
      expect(guidance.text.zh.trim().length).toBeGreaterThan(0)
      expect(guidance.text.en.trim().length).toBeGreaterThan(0)
    }
  })

  // 紅線核心測試：窮舉官方劑型原文與收斂劑型的所有組合，斷言任何輸入都不會產生
  // 「可以磨粉」或「可以剝半」語意（三語都要檢查），即使輸入字串裡帶著跟刻痕相關的字樣。
  test('never produces "may crush" or "may split" semantics for any input combination', () => {
    for (const officialDosageFormText of OFFICIAL_DOSAGE_FORM_SAMPLES) {
      for (const dosageForm of DOSAGE_FORM_SAMPLES) {
        const guidance = resolveSwallowGuidance({ officialDosageFormText, dosageForm })
        // 「不可磨粉」本身就含有「可磨粉」子字串，不能拿掉否定詞來比對；只鎖死真正代表「允許」的完整片語。
        expect(guidance.text.zh).not.toContain('可以磨粉')
        expect(guidance.text.zh).not.toContain('可以剝半')
        expect(guidance.text.zh).not.toContain('可沿刻痕')
        const id = guidance.text.id.toLowerCase()
        expect(id).not.toContain('boleh digerus')
        expect(id).not.toContain('boleh dibelah')
        const en = guidance.text.en.toLowerCase()
        expect(en).not.toContain('can be crushed')
        expect(en).not.toContain('can be split')
        expect(en).not.toContain('may be crushed')
        expect(en).not.toContain('may be split')
      }
    }
  })
})
