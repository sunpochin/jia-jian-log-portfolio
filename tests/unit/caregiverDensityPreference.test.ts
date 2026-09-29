/*
檔案用途：驗證看護密度模式偏好的展示模式本機備援，以及角色→預設值的純函式對照（issue #737）。
所在層：tests/unit；只測試未登入展示模式的瀏覽器儲存與純函式，不連線 Supabase。
主要關聯：對應 src/lib/preferences/caregiverDensityPreference.ts 的 localStorage 轉接與角色預設。
*/
import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { readCaregiverDensityModePreference, resolveCaregiverDensityModeDefaultByRole, saveCaregiverDensityModePreference } from '../../src/lib/preferences/caregiverDensityPreference'

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

describe('caregiver density mode preference', () => {
  test('defaults to off and remembers an explicit opt-in', () => {
    expect(readCaregiverDensityModePreference()).toBe(false)

    saveCaregiverDensityModePreference(true)
    expect(readCaregiverDensityModePreference()).toBe(true)

    saveCaregiverDensityModePreference(false)
    expect(readCaregiverDensityModePreference()).toBe(false)
  })

  test('keeps the full (non-density) view when browser storage is restricted', () => {
    storageThrows = true

    expect(readCaregiverDensityModePreference()).toBe(false)
    expect(() => saveCaregiverDensityModePreference(true)).not.toThrow()
  })
})

describe('resolveCaregiverDensityModeDefaultByRole', () => {
  test('defaults on only for the caregiver role (#716 決策第 2 項)', () => {
    expect(resolveCaregiverDensityModeDefaultByRole('caregiver')).toBe(true)
    expect(resolveCaregiverDensityModeDefaultByRole('owner')).toBe(false)
    expect(resolveCaregiverDensityModeDefaultByRole('viewer')).toBe(false)
  })
})
