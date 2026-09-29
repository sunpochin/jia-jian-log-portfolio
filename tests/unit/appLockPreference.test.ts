/*
檔案用途：鎖住原生殼 App 鎖的本機設定解析與「回前景要不要上鎖」判斷（issue #821）：預設關閉、壞資料回到關閉、
  逾時內不打擾、找不到進背景時間或時鐘倒退時一律上鎖（fail closed）。
所在層：tests/unit；純函式與 localStorage 讀寫，不需要 React 或 Capacitor。
主要關聯：src/lib/preferences/appLockPreference.ts。
*/
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test'
import {
  DEFAULT_APP_LOCK_PREFERENCE,
  parseAppLockPreference,
  readAppLockPreference,
  readLastBackgroundAt,
  saveAppLockPreference,
  saveLastBackgroundAt,
  shouldLockOnResume,
  subscribeAppLockPreference,
} from '../../src/lib/preferences/appLockPreference'

const store = new Map<string, string>()
let storageThrows = false
const previousLocalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')

// 在 beforeAll 才覆寫：localStorage 是整個測試程序共用的，載入期換掉會影響其他測試檔（同 readingScale.test.ts）。
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

afterAll(() => {
  if (previousLocalStorage) Object.defineProperty(globalThis, 'localStorage', previousLocalStorage)
  else Reflect.deleteProperty(globalThis, 'localStorage')
})

beforeEach(() => {
  store.clear()
  storageThrows = false
})

const MINUTE = 60_000

describe('app lock preference storage', () => {
  test('defaults to off with a 5-minute timeout', () => {
    expect(readAppLockPreference()).toEqual({ enabled: false, timeoutMinutes: 5 })
    expect(DEFAULT_APP_LOCK_PREFERENCE.enabled).toBe(false)
  })

  test('round-trips a saved preference', () => {
    saveAppLockPreference({ enabled: true, timeoutMinutes: 15 })
    expect(readAppLockPreference()).toEqual({ enabled: true, timeoutMinutes: 15 })
  })

  test('only an explicit true turns the lock on; unknown timeouts fall back to the default', () => {
    expect(parseAppLockPreference('{"enabled":"true","timeoutMinutes":7}')).toEqual({ enabled: false, timeoutMinutes: 5 })
    expect(parseAppLockPreference('{"enabled":true,"timeoutMinutes":30}')).toEqual({ enabled: true, timeoutMinutes: 30 })
    expect(parseAppLockPreference('not json')).toBeUndefined()
    expect(parseAppLockPreference('null')).toBeUndefined()
  })

  test('blocked storage reads as off instead of throwing', () => {
    storageThrows = true
    expect(readAppLockPreference()).toEqual(DEFAULT_APP_LOCK_PREFERENCE)
    expect(readLastBackgroundAt()).toBeNull()
    expect(() => saveLastBackgroundAt(1)).not.toThrow()
  })

  test('save reports what was actually stored: a blocked write never reads as enabled', () => {
    expect(saveAppLockPreference({ enabled: true, timeoutMinutes: 5 })).toEqual({ enabled: true, timeoutMinutes: 5 })
    store.clear()
    storageThrows = true
    // 設定頁以這個回傳值顯示開關；寫不進去時必須是「關閉」，不能讓畫面說有保護、實際沒有。
    expect(saveAppLockPreference({ enabled: true, timeoutMinutes: 5 }).enabled).toBe(false)
  })

  test('notifies subscribers on every save so an open settings card follows the lock screen', () => {
    let calls = 0
    const unsubscribe = subscribeAppLockPreference(() => { calls += 1 })
    saveAppLockPreference({ enabled: false, timeoutMinutes: 5 })
    expect(calls).toBe(1)
    unsubscribe()
    saveAppLockPreference({ enabled: false, timeoutMinutes: 5 })
    expect(calls).toBe(1)
  })

  test('persists the last background timestamp so a killed-and-relaunched app still sees it', () => {
    expect(readLastBackgroundAt()).toBeNull()
    saveLastBackgroundAt(1_700_000_000_000)
    expect(readLastBackgroundAt()).toBe(1_700_000_000_000)
  })
})

describe('shouldLockOnResume', () => {
  const on = { enabled: true, timeoutMinutes: 5 } as const

  test('never locks while the feature is off, even after a long background', () => {
    expect(shouldLockOnResume({ preference: { enabled: false, timeoutMinutes: 5 }, backgroundedAt: 0, now: 999 * MINUTE })).toBe(false)
    expect(shouldLockOnResume({ preference: { enabled: false, timeoutMinutes: 5 }, backgroundedAt: null, now: 0 })).toBe(false)
  })

  test('does not interrupt a return within the timeout', () => {
    expect(shouldLockOnResume({ preference: on, backgroundedAt: 0, now: 5 * MINUTE - 1 })).toBe(false)
  })

  test('locks once the timeout is reached', () => {
    expect(shouldLockOnResume({ preference: on, backgroundedAt: 0, now: 5 * MINUTE })).toBe(true)
    expect(shouldLockOnResume({ preference: { enabled: true, timeoutMinutes: 1 }, backgroundedAt: 0, now: 2 * MINUTE })).toBe(true)
  })

  test('fails closed when the background time is unknown or the clock went backwards', () => {
    expect(shouldLockOnResume({ preference: on, backgroundedAt: null, now: 0 })).toBe(true)
    expect(shouldLockOnResume({ preference: on, backgroundedAt: 10 * MINUTE, now: 0 })).toBe(true)
  })
})
