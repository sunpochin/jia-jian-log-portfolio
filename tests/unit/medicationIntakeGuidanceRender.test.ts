/*
檔案用途：驗證 MedicationIntakeGuidance 的精簡徽章／完整區塊呈現，包含 A/B 兩層資料與衝突警告。
所在層：tests/unit；以最小 hook 執行環境呼叫元件函式，不啟動瀏覽器。
主要關聯：src/features/medication/components/MedicationIntakeGuidance.tsx、
src/lib/medication/medicationSwallowGuidance.ts、src/lib/medication/medicationInstructions.ts。
*/
import { describe, expect, test } from 'bun:test'
import { installReactHookHarness, renderHook } from './helpers/reactHookHarness'
import { textContent } from './helpers/elementTree'
import { resolveSwallowGuidance } from '../../src/lib/medication/medicationSwallowGuidance'
import { detectInstructionConflict } from '../../src/lib/medication/medicationInstructions'
import type { PatientMedicationInstruction } from '../../src/types/database'

installReactHookHarness()

// 為什麼不 mock i18n：mock.module 是整個測試程序共用的，換掉 useI18n 會污染其他測試檔；
// 改用真的 useI18n，只從 harness 的 defaultContext 餵入 locale，比照 dailyBloodPressureRecordsRender.test.ts。
const zhContext = { locale: 'zh' as const, setLocale: () => {} }
const idContext = { locale: 'id' as const, setLocale: () => {} }
const enContext = { locale: 'en' as const, setLocale: () => {} }

const { MedicationIntakeGuidance } = await import('../../src/features/medication/components/MedicationIntakeGuidance')

const sublingualGuidance = resolveSwallowGuidance({ officialDosageFormText: '舌下錠', dosageForm: 'tablet' })
const unknownGuidance = resolveSwallowGuidance({ officialDosageFormText: null, dosageForm: 'tablet' })

const instruction = (overrides: Partial<PatientMedicationInstruction> = {}): PatientMedicationInstruction => ({
  patient_id: 'patient-1',
  medication_id: 'med-1',
  instruction_codes: ['crush_ok'],
  instruction_note: null,
  source: 'pharmacist',
  confirmed_on: '2026-07-01',
  updated_by: 'caregiver@example.com',
  updated_at: '2026-07-01T00:00:00.000Z',
  ...overrides,
})

describe('MedicationIntakeGuidance compact badge', () => {
  test('renders nothing when the official level is unknown and nobody has recorded an instruction', () => {
    const view = renderHook(() => MedicationIntakeGuidance({ guidance: unknownGuidance, instruction: null, hasConflict: false, compact: true }), { defaultContext: zhContext })
    expect(view.current).toBeNull()
    view.unmount()
  })

  test('shows an orange caution badge with text and icon when the official level needs attention', () => {
    const view = renderHook(() => MedicationIntakeGuidance({ guidance: sublingualGuidance, instruction: null, hasConflict: false, compact: true }), { defaultContext: zhContext })
    expect(textContent(view.current)).toContain('服用方式需注意，請查看詳情')
    expect(textContent(view.current)).toContain('⚠')
    view.unmount()
  })

  test('shows a sky record badge when only the B layer has a note and the A layer is not caution', () => {
    const view = renderHook(() => MedicationIntakeGuidance({ guidance: unknownGuidance, instruction: instruction(), hasConflict: false, compact: true }), { defaultContext: zhContext })
    expect(textContent(view.current)).toContain('已有服用方式紀錄')
    view.unmount()
  })

  test('a conflict always wins over caution or record wording', () => {
    const view = renderHook(() => MedicationIntakeGuidance({ guidance: sublingualGuidance, instruction: instruction(), hasConflict: true, compact: true }), { defaultContext: zhContext })
    const text = textContent(view.current)
    expect(text).toContain('服用方式有衝突，請查看詳情')
    expect(text).not.toContain('服用方式需注意，請查看詳情')
    view.unmount()
  })

  test('switches to Indonesian and English text under the same props', () => {
    const idView = renderHook(() => MedicationIntakeGuidance({ guidance: sublingualGuidance, instruction: null, hasConflict: false, compact: true }), { defaultContext: idContext })
    expect(textContent(idView.current)).toContain('Perhatikan cara minum, lihat detail')
    idView.unmount()

    const enView = renderHook(() => MedicationIntakeGuidance({ guidance: sublingualGuidance, instruction: null, hasConflict: false, compact: true }), { defaultContext: enContext })
    expect(textContent(enView.current)).toContain('Special intake instructions, see details')
    enView.unmount()
  })
})

describe('MedicationIntakeGuidance full block', () => {
  test('always shows the official-data sentence even for the caution level', () => {
    const view = renderHook(() => MedicationIntakeGuidance({ guidance: sublingualGuidance, instruction: null, hasConflict: false }), { defaultContext: zhContext })
    const text = textContent(view.current)
    expect(text).toContain('依官方資料：')
    expect(text).toContain('含在舌下，不可吞下')
    expect(text).toContain('尚未有藥師／醫師交代的紀錄。')
    view.unmount()
  })

  test('shows the recorded codes, source, confirmed date, and note when the family has one on file', () => {
    const view = renderHook(() => MedicationIntakeGuidance({
      guidance: unknownGuidance,
      instruction: instruction({ instruction_codes: ['crush_ok', 'with_food'], instruction_note: '吞不下的時候才磨粉' }),
      hasConflict: false,
    }), { defaultContext: zhContext })
    const text = textContent(view.current)
    expect(text).toContain('可磨粉配水')
    expect(text).toContain('隨餐／飯後服用')
    expect(text).toContain('藥師')
    expect(text).toContain('2026-07-01')
    expect(text).toContain('吞不下的時候才磨粉')
    view.unmount()
  })

  // §2 紅線：A、B 兩層衝突時兩邊都要照顯示，另外加一條警告；不能只顯示比較安全的那一邊或隱藏另一邊。
  test('shows both layers and the conflict warning without silently picking a winner', () => {
    const hasConflict = detectInstructionConflict(sublingualGuidance.level, ['swallow_whole'])
    expect(hasConflict).toBe(true)
    const view = renderHook(() => MedicationIntakeGuidance({
      guidance: sublingualGuidance,
      instruction: instruction({ instruction_codes: ['swallow_whole'] }),
      hasConflict,
    }), { defaultContext: zhContext })
    const text = textContent(view.current)
    expect(text).toContain('含在舌下，不可吞下')
    expect(text).toContain('整顆吞下')
    expect(text).toContain('官方劑型與紀錄不一致，請再跟藥師確認。')
    view.unmount()
  })
})
