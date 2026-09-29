/*
檔案用途：驗證病人層外觀覆蓋（issue #759）的情境判斷、合併純函式與備註長度上限。
所在層：tests/unit；不連接 Supabase，避免測試意外碰到 staging 或 production。
主要關聯：src/lib/medication/medicationAppearanceOverrides.ts、docs/product/shared-medication-catalog.md §4.4。
*/
import { describe, expect, test } from 'bun:test'
import {
  MEDICATION_APPEARANCE_OVERRIDE_NOTE_MAX_LENGTH,
  indexOverridesByMedicationId,
  mergeMedicationAppearanceOverride,
  resolveAppearanceCorrectionScenario,
  savePatientMedicationAppearanceOverride,
  type MedicationCatalogUsage,
} from '../../src/lib/medication/medicationAppearanceOverrides'
import type { PatientMedicationAppearanceOverride } from '../../src/types/database'

const usage = (allManagedByCaller: boolean): MedicationCatalogUsage => ({ medicationId: 'med-1', sharedWithOthers: !allManagedByCaller, allManagedByCaller })

describe('resolveAppearanceCorrectionScenario（規劃文件 §4.4 情境 A/B/C）', () => {
  test('情境 A：unverified 且全部由呼叫者管理 → direct', () => {
    expect(resolveAppearanceCorrectionScenario('unverified', usage(true))).toBe('direct')
  })

  test('情境 B：unverified 但其他家庭也在用 → shared_with_others', () => {
    expect(resolveAppearanceCorrectionScenario('unverified', usage(false))).toBe('shared_with_others')
  })

  test('情境 B：完全查不到 usage（例如這顆藥還沒有任何現役醫囑）→ 不能當成 direct，一律走覆蓋', () => {
    expect(resolveAppearanceCorrectionScenario('unverified', undefined)).toBe('shared_with_others')
  })

  test('情境 C：即使全部由呼叫者管理，official 或 manually_verified 一律走覆蓋，不是 direct', () => {
    expect(resolveAppearanceCorrectionScenario('official', usage(true))).toBe('official_or_verified')
    expect(resolveAppearanceCorrectionScenario('manually_verified', usage(true))).toBe('official_or_verified')
  })
})

describe('mergeMedicationAppearanceOverride', () => {
  const medication = { appearance_color: 'white', appearance_shape: 'round', appearance_photo_url: null, appearance_note: null }

  test('沒有覆蓋列時標記為 shared，且不改動任何欄位', () => {
    expect(mergeMedicationAppearanceOverride(medication, undefined)).toEqual({ ...medication, appearance_source: 'shared' })
  })

  test('有覆蓋列時整組外觀四欄改用覆蓋值，不是逐欄 COALESCE', () => {
    const override = {
      patient_id: 'patient-1', medication_id: 'med-1',
      appearance_color: 'yellow', appearance_shape: null, appearance_photo_url: 'https://example.test/photo.webp', appearance_note: '藥局換了新包裝',
      updated_by: 'caregiver@example.test', updated_at: '2026-09-15T00:00:00.000Z',
    } satisfies PatientMedicationAppearanceOverride
    expect(mergeMedicationAppearanceOverride(medication, override)).toEqual({
      appearance_color: 'yellow', appearance_shape: null, appearance_photo_url: 'https://example.test/photo.webp', appearance_note: '藥局換了新包裝',
      appearance_source: 'patient_override',
    })
  })
})

describe('indexOverridesByMedicationId', () => {
  test('依 medication_id 建索引，讓合併時可以用 Map.get() 逐筆查找', () => {
    const overrides = [
      { patient_id: 'p1', medication_id: 'med-1', appearance_color: 'white', appearance_shape: null, appearance_photo_url: null, appearance_note: null, updated_by: 'a@example.test', updated_at: 't' },
      { patient_id: 'p1', medication_id: 'med-2', appearance_color: 'green', appearance_shape: null, appearance_photo_url: null, appearance_note: null, updated_by: 'a@example.test', updated_at: 't' },
    ] satisfies PatientMedicationAppearanceOverride[]
    const index = indexOverridesByMedicationId(overrides)
    expect(index.get('med-1')?.appearance_color).toBe('white')
    expect(index.get('med-2')?.appearance_color).toBe('green')
    expect(index.get('missing')).toBeUndefined()
  })
})

describe('savePatientMedicationAppearanceOverride 120 字備註上限', () => {
  test('rejects an overlong note before it ever reaches Supabase', async () => {
    const overlong = 'x'.repeat(MEDICATION_APPEARANCE_OVERRIDE_NOTE_MAX_LENGTH + 1)
    await expect(savePatientMedicationAppearanceOverride({
      patientId: 'patient-1', medicationId: 'med-1',
      appearanceColor: null, appearanceShape: null, appearancePhotoUrl: null, appearanceNote: overlong,
    })).rejects.toThrow(`Appearance override note must be at most ${MEDICATION_APPEARANCE_OVERRIDE_NOTE_MAX_LENGTH} characters`)
  })
})
