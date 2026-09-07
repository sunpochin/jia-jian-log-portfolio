/*
檔案用途：驗證存在 localStorage 的每日照護顯示偏好以病人為單位讀寫（含自訂範本開關），且儲存失敗時仍保留完整入口。
所在層：tests/unit；只覆蓋本機偏好分支，資料庫分支另由 *Db 測試檔負責。
主要關聯：src/lib/dailyCarePreferences.ts 與 /demo 展示流程。
*/
import { afterAll, beforeAll, beforeEach, describe, expect, mock, test } from 'bun:test'

mock.module('../../src/lib/supabase', () => ({ supabase: {} }))

const store = new Map<string, string>()
let storageThrows = false
const previousLocalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')

// 為什麼在 beforeAll 才覆寫：localStorage 是整個測試程序共用的，載入期換掉會影響其他測試檔。
beforeAll(() => {
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    writable: true,
    value: {
      getItem: (key: string) => {
        if (storageThrows) throw new Error('SecurityError')
        return store.get(key) ?? null
      },
      setItem: (key: string, value: string) => {
        if (storageThrows) throw new Error('QuotaExceededError')
        store.set(key, value)
      },
      removeItem: (key: string) => { store.delete(key) },
    },
  })
})

const { readDailyCarePreference, saveDailyCarePreference } = await import('../../src/lib/dailyCarePreferences')

const DAILY_CARE_KEY = 'jiajianlog.daily-care-visibility'
const ALL_VISIBLE = { bloodPressure: true, temperature: true, medication: true, nutrition: true, weight: true, petLiquidIntake: true, petDigestion: true, petAppetite: true, petFluidTherapy: true, petEndocrine: true, dementiaCare: false, fluidBalance: false, careReminders: true }
const DEFAULT_STATE = { preference: ALL_VISIBLE, useCustomTemplate: false }

beforeEach(() => {
  store.clear()
  storageThrows = false
})

afterAll(() => {
  if (previousLocalStorage) Object.defineProperty(globalThis, 'localStorage', previousLocalStorage)
  else Reflect.deleteProperty(globalThis, 'localStorage')
})

describe('local daily care visibility preference', () => {
  test('shows every care entry point and non-custom template before anything was saved', () => {
    expect(readDailyCarePreference('patient-1')).toEqual(DEFAULT_STATE)
  })

  test('keeps each patient preference separate', () => {
    saveDailyCarePreference('patient-1', { preference: { ...ALL_VISIBLE, nutrition: false }, useCustomTemplate: false })
    saveDailyCarePreference('patient-2', { preference: { ...ALL_VISIBLE, temperature: false }, useCustomTemplate: true })
    expect(readDailyCarePreference('patient-1')).toEqual({ preference: { ...ALL_VISIBLE, nutrition: false }, useCustomTemplate: false })
    expect(readDailyCarePreference('patient-2')).toEqual({ preference: { ...ALL_VISIBLE, temperature: false }, useCustomTemplate: true })
  })

  test('falls back to every module when the stored value is unreadable', () => {
    store.set(DAILY_CARE_KEY, '{ broken')
    expect(readDailyCarePreference('patient-1')).toEqual(DEFAULT_STATE)
  })

  test('normalizes a stored all-off preference back to a usable screen', () => {
    store.set(DAILY_CARE_KEY, JSON.stringify({ 'patient-1': { bloodPressure: false, temperature: false, medication: false, nutrition: false, weight: false, petLiquidIntake: false, petDigestion: false, petAppetite: false, petFluidTherapy: false, petEndocrine: false, dementiaCare: false, fluidBalance: false, careReminders: false, useCustomTemplate: false } }))
    expect(readDailyCarePreference('patient-1').preference.bloodPressure).toBe(true)
  })

  test('a blocked storage never stops daily care input', () => {
    storageThrows = true
    expect(() => saveDailyCarePreference('patient-1', DEFAULT_STATE)).not.toThrow()
    expect(readDailyCarePreference('patient-1')).toEqual(DEFAULT_STATE)
  })
})
