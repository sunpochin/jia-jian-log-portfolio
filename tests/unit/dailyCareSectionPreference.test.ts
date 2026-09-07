/*
檔案用途：測試每日照護「最後選擇頁籤」的本機讀寫函數。
所在層：tests/unit 單元測試層。
主要關聯：驗證 src/lib/dailyCareSectionPreference.ts 邏輯。
*/
import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { readLastDailyCareSection, saveLastDailyCareSection } from '../../src/lib/dailyCareSectionPreference'

const originalLocalStorage = globalThis.localStorage
const values = new Map<string, string>()

beforeEach(() => {
  values.clear()
  ;(globalThis as typeof globalThis & { localStorage: Storage }).localStorage = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value) },
  } as Storage
})

afterEach(() => {
  ;(globalThis as typeof globalThis & { localStorage: Storage }).localStorage = originalLocalStorage
})

describe('daily care section preference', () => {
  test('returns null when nothing has been saved yet', () => {
    expect(readLastDailyCareSection('patient-1')).toBeNull()
  })

  test('remembers the last selected section per patient', () => {
    saveLastDailyCareSection('patient-1', 'medication')
    saveLastDailyCareSection('patient-2', 'temperature')

    expect(readLastDailyCareSection('patient-1')).toBe('medication')
    expect(readLastDailyCareSection('patient-2')).toBe('temperature')
  })

  test('overwrites a previously saved section for the same patient', () => {
    saveLastDailyCareSection('patient-1', 'medication')
    saveLastDailyCareSection('patient-1', 'weight')

    expect(readLastDailyCareSection('patient-1')).toBe('weight')
  })

  test('returns null for malformed stored data instead of throwing', () => {
    values.set('jiajianlog.daily-care-last-section', '{not-json')
    expect(readLastDailyCareSection('patient-1')).toBeNull()
  })
})
