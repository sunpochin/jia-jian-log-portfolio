/*
檔案用途：驗證服用方式 B 層的代碼字典三語齊全、200 字上限與 A/B 兩層衝突偵測涵蓋整張給藥動作矩陣。
所在層：tests/unit；不連接 Supabase，避免測試意外碰到 staging 或 production。
主要關聯：src/lib/medication/medicationInstructions.ts、docs/features/medication.md 的「服用方式」小節。
*/
import { describe, expect, test } from 'bun:test'
import { MEDICATION_INSTRUCTION_CODES, MEDICATION_INSTRUCTION_NOTE_MAX_LENGTH, SOURCE_LABELS, detectInstructionConflict, instructionCodeText, savePatientMedicationInstruction, sourceLabelText } from '../../src/lib/medication/medicationInstructions'
import type { SwallowGuidanceLevel } from '../../src/lib/medication/medicationSwallowGuidance'

const CJK_PATTERN = /[぀-ヿ㐀-䶿一-鿿]/

describe('MEDICATION_INSTRUCTION_CODES / SOURCE_LABELS 三語字典', () => {
  test('every instruction code has id/zh/en with no missing or CJK-in-English values', () => {
    for (const [code, text] of MEDICATION_INSTRUCTION_CODES) {
      expect(code.length).toBeGreaterThan(0)
      expect(text.id.length).toBeGreaterThan(0)
      expect(text.zh.length).toBeGreaterThan(0)
      expect(text.en.length).toBeGreaterThan(0)
      expect(CJK_PATTERN.test(text.en)).toBe(false)
    }
  })

  test('every source label has id/zh/en with no missing or CJK-in-English values', () => {
    for (const [source, text] of SOURCE_LABELS) {
      expect(source.length).toBeGreaterThan(0)
      expect(text.id.length).toBeGreaterThan(0)
      expect(text.zh.length).toBeGreaterThan(0)
      expect(text.en.length).toBeGreaterThan(0)
      expect(CJK_PATTERN.test(text.en)).toBe(false)
    }
  })

  test('covers the exact code set the plan requires', () => {
    const codes = MEDICATION_INSTRUCTION_CODES.map(([code]) => code)
    expect(codes).toEqual(['swallow_whole', 'crush_ok', 'open_capsule_ok', 'split_half', 'mix_with_water', 'with_food', 'empty_stomach', 'plenty_of_water', 'not_with_milk'])
  })

  test('covers the exact source set the plan requires', () => {
    const sources = SOURCE_LABELS.map(([source]) => source)
    expect(sources).toEqual(['pharmacist', 'doctor', 'package_insert', 'family'])
  })
})

describe('instructionCodeText() / sourceLabelText() 顯示端查找', () => {
  test('instructionCodeText finds the matching bilingual text by code, and returns undefined for an unknown code', () => {
    expect(instructionCodeText('crush_ok')).toEqual({ id: 'Boleh digerus dicampur air', zh: '可磨粉配水', en: 'May be crushed and mixed with water' })
    expect(instructionCodeText('not_a_real_code')).toBeUndefined()
  })

  test('sourceLabelText finds the matching bilingual text for every known source', () => {
    for (const [source, text] of SOURCE_LABELS) {
      expect(sourceLabelText(source)).toEqual(text)
    }
  })
})

describe('savePatientMedicationInstruction 200 字備註上限', () => {
  test('rejects a note longer than the limit before touching Supabase', async () => {
    const tooLong = '之'.repeat(MEDICATION_INSTRUCTION_NOTE_MAX_LENGTH + 1)
    await expect(savePatientMedicationInstruction({
      patientId: 'patient-1', medicationId: 'med-1', instructionCodes: ['swallow_whole'],
      instructionNote: tooLong, source: 'pharmacist', confirmedOn: '2026-09-01',
    })).rejects.toThrow(`${MEDICATION_INSTRUCTION_NOTE_MAX_LENGTH} characters`)
  })
})

describe('detectInstructionConflict() 給藥動作矩陣', () => {
  // 規劃文件 §3.2／issue #625 明講的四個真實可達組合：寫死配對清單一定會漏掉，矩陣投影法不會。
  test('flags the four contradictions the issue explicitly calls out', () => {
    expect(detectInstructionConflict('sublingual', ['swallow_whole'])).toBe(true)
    expect(detectInstructionConflict('chewable', ['swallow_whole'])).toBe(true)
    expect(detectInstructionConflict('dissolve_in_water', ['swallow_whole'])).toBe(true)
    expect(detectInstructionConflict('swallow_whole', ['open_capsule_ok'])).toBe(true)
  })

  // 每個「破壞劑型」代碼都要各自被 swallow_whole 等級擋下，不能只測其中一個代表值。
  test.each(['crush_ok', 'split_half', 'open_capsule_ok'] as const)('swallow_whole level conflicts with alter-form code %s', code => {
    expect(detectInstructionConflict('swallow_whole', [code])).toBe(true)
  })

  test.each(['sublingual', 'chewable', 'dissolve_in_water', 'dissolve_in_mouth'] as const)('%s level conflicts with an alter-form code', level => {
    expect(detectInstructionConflict(level, ['crush_ok'])).toBe(true)
  })

  test.each(['sublingual', 'chewable', 'dissolve_in_mouth'] as const)('%s level conflicts with mix_with_water (dissolve_in_water action)', level => {
    expect(detectInstructionConflict(level, ['mix_with_water'])).toBe(true)
  })

  const NON_CONFLICTING_MATRIX_ROWS: [SwallowGuidanceLevel, string[]][] = [
    ['swallow_whole', ['swallow_whole']],
    ['dissolve_in_water', ['mix_with_water']],
  ]
  test.each(NON_CONFLICTING_MATRIX_ROWS)('%s level agrees with its matching B-layer code(s)', (level, codes) => {
    expect(detectInstructionConflict(level, codes)).toBe(false)
  })

  // 迴歸測試：detectInstructionConflict() 只比對「A 層單一等級」對「B 層每個代碼」，
  // 不會把 B 層代碼互相比對——crush_ok（可磨粉配水）＋mix_with_water（泡水後喝）是同一套服藥步驟
  // 的兩個描述，不是兩種互斥吃法；沒有 A 層資料時更不該只因為 B 層選了兩個代碼就判定衝突。
  test('does not flag crush_ok + mix_with_water as conflicting when there is no A-layer guidance', () => {
    expect(detectInstructionConflict(null, ['crush_ok', 'mix_with_water'])).toBe(false)
    expect(detectInstructionConflict(undefined, ['crush_ok', 'mix_with_water'])).toBe(false)
  })

  test('B-layer codes are never compared against each other, only against the A-layer level', () => {
    // split_half（alter_form）與 mix_with_water（dissolve_in_water）是不同動作，但兩者都只是 B 層自述；
    // 沒有 A 層資料可比對時，不能單靠 B 層代碼彼此不同就判定衝突。
    expect(detectInstructionConflict(null, ['split_half', 'mix_with_water'])).toBe(false)
    expect(detectInstructionConflict('unknown', ['open_capsule_ok', 'mix_with_water'])).toBe(false)
  })

  test('a null/unknown A-layer level never conflicts on its own', () => {
    expect(detectInstructionConflict(null, ['crush_ok', 'split_half'])).toBe(false)
    expect(detectInstructionConflict('unknown', ['swallow_whole'])).toBe(false)
    expect(detectInstructionConflict('not_a_pill', ['mix_with_water'])).toBe(false)
  })

  test('an empty B-layer code list never conflicts on its own', () => {
    expect(detectInstructionConflict('sublingual', [])).toBe(false)
    expect(detectInstructionConflict(null, [])).toBe(false)
  })

  // with_food／empty_stomach 不在給藥動作矩陣裡，但仍互斥，要另外檢查兩種順序。
  test('with_food and empty_stomach conflict regardless of order, independent of the action matrix', () => {
    expect(detectInstructionConflict(null, ['with_food', 'empty_stomach'])).toBe(true)
    expect(detectInstructionConflict(null, ['empty_stomach', 'with_food'])).toBe(true)
    expect(detectInstructionConflict('swallow_whole', ['swallow_whole', 'with_food', 'empty_stomach'])).toBe(true)
  })

  // plenty_of_water／not_with_milk 描述配什麼吃，不是給藥動作，不該觸發衝突。
  test('descriptive codes outside the action matrix never trigger a conflict', () => {
    expect(detectInstructionConflict('swallow_whole', ['swallow_whole', 'plenty_of_water', 'not_with_milk', 'with_food'])).toBe(false)
  })
})
