/*
檔案用途：驗證每日服藥藥卡顯示偏好的展示模式本機備援與安全預設。
所在層：tests/unit；只測試未登入展示模式的瀏覽器儲存，不連線 Supabase。
主要關聯：對應 src/lib/medicationDisplayPreference.ts 的 localStorage 轉接。
*/
import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { readMedicationNameEnglishFirstPreference, readMedicationSlotsExpandedPreference, saveMedicationNameEnglishFirstPreference, saveMedicationSlotsExpandedPreference } from '../../src/lib/medicationDisplayPreference'

const originalLocalStorage = globalThis.localStorage
const values = new Map<string, string>()
let storageThrows = false

beforeEach(() => {
  values.clear()
  storageThrows = false
  ;(globalThis as typeof globalThis & { localStorage: Storage }).localStorage = {
    getItem: key => {
      if (storageThrows) throw new Error('SecurityError')
      return values.get(key) ?? null
    },
    setItem: (key, value) => {
      if (storageThrows) throw new Error('SecurityError')
      values.set(key, value)
    },
  } as Storage
})

afterEach(() => {
  ;(globalThis as typeof globalThis & { localStorage: Storage }).localStorage = originalLocalStorage
})

describe('medication display preference', () => {
  test('defaults to expanded and remembers an explicitly compact choice', () => {
    expect(readMedicationSlotsExpandedPreference()).toBe(true)

    saveMedicationSlotsExpandedPreference(false)
    expect(readMedicationSlotsExpandedPreference()).toBe(false)

    saveMedicationSlotsExpandedPreference(true)
    expect(readMedicationSlotsExpandedPreference()).toBe(true)
  })

  test('keeps medication slots expanded when browser storage is restricted', () => {
    storageThrows = true

    expect(readMedicationSlotsExpandedPreference()).toBe(true)
    expect(() => saveMedicationSlotsExpandedPreference(false)).not.toThrow()
  })

  test('defaults medication name to English-first and remembers a localized-first choice', () => {
    expect(readMedicationNameEnglishFirstPreference()).toBe(true)

    saveMedicationNameEnglishFirstPreference(false)
    expect(readMedicationNameEnglishFirstPreference()).toBe(false)

    saveMedicationNameEnglishFirstPreference(true)
    expect(readMedicationNameEnglishFirstPreference()).toBe(true)
  })

  test('keeps medication name English-first when browser storage is restricted', () => {
    storageThrows = true

    expect(readMedicationNameEnglishFirstPreference()).toBe(true)
    expect(() => saveMedicationNameEnglishFirstPreference(false)).not.toThrow()
  })
})
