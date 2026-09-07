/*
檔案用途：驗證服藥時段的排序、雙語名稱與完成提示語意。
所在層：tests/unit；保護每日服藥流程共用的時段文案與排序規則。
主要關聯：測試 src/lib/medicationSchedule，供 MedicationPage 與藥單管理介面使用。
*/
import { describe, expect, test } from 'bun:test'
import { compareMedicationSlots, getMedicationSlotCollapseDefaults, medicationSlotCompletionText, medicationSlotQuantityProgressText, medicationSlotQuantityText, medicationSlotText, MEDICATION_SLOTS } from '../../src/lib/medicationSchedule'

describe('medication schedule', () => {
  test('offers only the specific meal-based timings, with bedtime last', () => {
    expect([...MEDICATION_SLOTS.map(([slot]) => slot)]).toEqual([
      'before_breakfast', 'after_breakfast', 'before_lunch', 'after_lunch', 'before_dinner', 'after_dinner', 'before_bed',
    ])
  })

  test('keeps each medication time slot in the active interface language', () => {
    expect(medicationSlotText('before_breakfast')).toMatchObject({ id: 'Sebelum sarapan', zh: '早餐前', en: 'Before breakfast' })
  })

  test('describes a completed slot as a recorded dose instead of confirmed ingestion', () => {
    expect(medicationSlotCompletionText('before_lunch')).toMatchObject({
      title: { id: 'Obat sebelum makan siang sudah lengkap', zh: '午餐前用藥已完成' ,en: 'Medication for before lunch is complete' },
      description: { id: 'Semua obat sebelum makan siang sudah tercatat diminum.', zh: '午餐前的所有藥物都已記錄為服用。' ,en: 'All before lunch medications have been recorded as taken.' },
    })
  })

  test('sorts current and legacy daily medicine groups by the shared schedule', () => {
    expect(['after_bed', 'before_bed', 'after_meal', 'before_dinner', 'morning', 'anytime'].sort(compareMedicationSlots)).toEqual([
      'anytime', 'morning', 'before_dinner', 'after_meal', 'before_bed', 'after_bed',
    ])
  })

  test('keeps the adjustment list in the caregiver reading order', () => {
    expect(['before_bed', 'after_dinner', 'before_dinner', 'after_lunch', 'before_lunch', 'after_breakfast', 'before_breakfast'].sort(compareMedicationSlots)).toEqual([
      'before_breakfast', 'after_breakfast', 'before_lunch', 'after_lunch', 'before_dinner', 'after_dinner', 'before_bed',
    ])
  })

  test('honors expanded and earliest-slot display defaults', () => {
    const slots = ['before_breakfast', 'after_breakfast', 'before_lunch']

    expect(getMedicationSlotCollapseDefaults(slots, true)).toEqual(new Set())
    expect(getMedicationSlotCollapseDefaults(slots, false)).toEqual(new Set(['after_breakfast', 'before_lunch']))
  })

  test('sums dose amount times dose count across a slot, e.g. a potassium plan taken as 2 pills at once', () => {
    expect(medicationSlotQuantityText([
      { dose_amount: 2, dose_count: 1, dosage_form: 'tablet' }, // Const-K：單次 2 顆
      { dose_amount: 1, dose_count: 1, dosage_form: 'tablet' }, // Bokey：單次 1 顆
    ])).toEqual({ id: '3 tablet', zh: '3 錠' ,en: "3 tablet" })
    expect(medicationSlotQuantityText([{ dose_amount: 1, dose_count: 2, dosage_form: 'tablet' }])).toEqual({ id: '2 tablet', zh: '2 錠' ,en: "2 tablet" })
    expect(medicationSlotQuantityText([])).toEqual({ id: '', zh: '' ,en: "" })
  })

  test('keeps dosage forms separate instead of mislabeling a powder sachet as a pill', () => {
    // 鈣加 D 是沖泡粉包，跟藥錠混在同一個時段時不能被算成「3 顆」，否則照護者核對藥盒會對不上實際包裝數量。
    expect(medicationSlotQuantityText([
      { dose_amount: 2, dose_count: 1, dosage_form: 'tablet' },
      { dose_amount: 1, dose_count: 1, dosage_form: 'powder' },
    ])).toEqual({ id: '2 tablet + 1 sachet', zh: '2 錠＋1 包' ,en: "2 tablet + 1 sachet" })
  })

  test('reports taken/total as a fraction per dosage form, e.g. 1 of 2 tablets and a completed sachet', () => {
    expect(medicationSlotQuantityProgressText(
      [{ dose_amount: 1, dosage_form: 'tablet' }, { dose_amount: 1, dosage_form: 'powder' }],
      [{ dose_amount: 1, dosage_form: 'tablet' }, { dose_amount: 1, dosage_form: 'tablet' }, { dose_amount: 1, dosage_form: 'powder' }],
    )).toEqual({ id: '1/2 tablet + 1/1 sachet', zh: '1/2 錠＋1/1 包' ,en: "1/2 tablet + 1/1 sachet" })
  })
})
