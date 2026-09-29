/*
檔案用途：驗證原生殼 App 鎖狀態機（issue #821）：關閉時完全無感、背景逾時回前景才上鎖並自動叫一次驗證、
  取消不會無限重彈、失敗維持上鎖、殺掉重開仍會上鎖、裝置沒密碼時解鎖並關閉設定。
所在層：tests/unit；用假的 Capacitor App 事件與假的原生驗證結果重現 iOS 生命週期順序，不啟動模擬器。
主要關聯：src/hooks/useAppLock.ts、src/lib/preferences/appLockPreference.ts、src/lib/nativeAppLock.ts（此處 mock）。
*/
import { afterAll, beforeAll, beforeEach, describe, expect, mock, test } from 'bun:test'
import { installReactHookHarness, renderHook } from './helpers/reactHookHarness'

installReactHookHarness()

type Handler = (data: { isActive: boolean }) => void
const handlers = new Map<string, Handler>()
let removedListeners = 0
mock.module('@capacitor/app', () => ({
  App: {
    addListener: async (eventName: string, handler: Handler) => {
      handlers.set(eventName, handler)
      return { remove: async () => { removedListeners += 1; handlers.delete(eventName) } }
    },
  },
}))

let nextAuthResult: 'success' | 'cancelled' | 'failed' | 'unavailable' = 'success'
const authenticateAppLock = mock(async (_reason: string) => nextAuthResult)
const privacyCoverCalls: boolean[] = []
mock.module('../../src/lib/nativeAppLock', () => ({
  authenticateAppLock,
  setAppLockPrivacyCover: async (enabled: boolean) => { privacyCoverCalls.push(enabled) },
  checkAppLockAvailability: async () => true,
}))

const { useAppLock } = await import('../../src/hooks/useAppLock')
const { readAppLockPreference, saveAppLockPreference, saveLastBackgroundAt } = await import('../../src/lib/preferences/appLockPreference')

const store = new Map<string, string>()
const previousLocalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
beforeAll(() => {
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    writable: true,
    value: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => { store.set(key, value) },
      removeItem: (key: string) => { store.delete(key) },
    },
  })
})
afterAll(() => {
  if (previousLocalStorage) Object.defineProperty(globalThis, 'localStorage', previousLocalStorage)
  else Reflect.deleteProperty(globalThis, 'localStorage')
})

const realNow = Date.now
let now = 1_700_000_000_000
beforeEach(() => {
  store.clear()
  handlers.clear()
  removedListeners = 0
  privacyCoverCalls.length = 0
  nextAuthResult = 'success'
  authenticateAppLock.mockClear()
  now = 1_700_000_000_000
  Date.now = () => now
})
afterAll(() => { Date.now = realNow })

const flush = () => new Promise(resolve => setTimeout(resolve, 0))
const MINUTE = 60_000
const emit = (event: string, isActive = true) => handlers.get(event)?.({ isActive })

// iOS 真實順序：切走 inactive → pause；切回 resume → active。
function goBackground(hook: { act: (fn: () => void) => void }) {
  hook.act(() => emit('appStateChange', false))
  hook.act(() => emit('pause'))
}
function comeBack(hook: { act: (fn: () => void) => void }) {
  hook.act(() => emit('resume'))
  hook.act(() => emit('appStateChange', true))
}

describe('useAppLock', () => {
  test('does nothing at all outside the iOS shell: no listeners, no lock', async () => {
    saveAppLockPreference({ enabled: true, timeoutMinutes: 5 })
    const hook = renderHook(() => useAppLock(false, 'reason'))
    await flush()
    expect(handlers.size).toBe(0)
    expect(hook.current.locked).toBe(false)
    expect(authenticateAppLock).not.toHaveBeenCalled()
    hook.unmount()
  })

  test('with the lock off, backgrounding is invisible: no cover, no lock, no prompt', async () => {
    const hook = renderHook(() => useAppLock(true, 'reason'))
    await flush()
    goBackground(hook)
    expect(hook.current.obscured).toBe(false)
    now += 60 * MINUTE
    comeBack(hook)
    await flush()
    expect(hook.current.locked).toBe(false)
    expect(authenticateAppLock).not.toHaveBeenCalled()
    expect(privacyCoverCalls).toEqual([false])
    hook.unmount()
  })

  test('a return within the timeout only flashes the cover and never prompts', async () => {
    saveAppLockPreference({ enabled: true, timeoutMinutes: 5 })
    saveLastBackgroundAt(now)
    const hook = renderHook(() => useAppLock(true, 'reason'))
    await flush()
    expect(privacyCoverCalls).toEqual([true])
    goBackground(hook)
    expect(hook.current.obscured).toBe(true)
    now += 4 * MINUTE
    comeBack(hook)
    await flush()
    expect(hook.current.obscured).toBe(false)
    expect(hook.current.locked).toBe(false)
    expect(authenticateAppLock).not.toHaveBeenCalled()
    hook.unmount()
  })

  test('after the timeout it locks, prompts once automatically, and unlocks on success', async () => {
    saveAppLockPreference({ enabled: true, timeoutMinutes: 5 })
    saveLastBackgroundAt(now)
    const hook = renderHook(() => useAppLock(true, 'Unlock please'))
    await flush()
    goBackground(hook)
    now += 5 * MINUTE
    comeBack(hook)
    await flush()
    expect(authenticateAppLock).toHaveBeenCalledTimes(1)
    expect(authenticateAppLock.mock.calls[0][0]).toBe('Unlock please')
    expect(hook.current.locked).toBe(false)
    hook.unmount()
  })

  test('still locks when iOS suspends the WebView and delivers pause late, on return', async () => {
    saveAppLockPreference({ enabled: true, timeoutMinutes: 5 })
    saveLastBackgroundAt(now)
    const hook = renderHook(() => useAppLock(true, 'reason'))
    await flush()
    // 只有 inactive 在離開當下送達；WebView 被暫停，pause 延到一小時後回來時才和 resume 一起到。
    hook.act(() => emit('appStateChange', false))
    now += 60 * MINUTE
    hook.act(() => emit('pause'))
    comeBack(hook)
    await flush()
    expect(authenticateAppLock).toHaveBeenCalledTimes(1)
    hook.unmount()
  })

  test('a cancelled prompt stays locked without an error and is not re-shown automatically', async () => {
    saveAppLockPreference({ enabled: true, timeoutMinutes: 5 })
    saveLastBackgroundAt(now)
    nextAuthResult = 'cancelled'
    const hook = renderHook(() => useAppLock(true, 'reason'))
    await flush()
    goBackground(hook)
    now += 10 * MINUTE
    comeBack(hook)
    await flush()
    expect(hook.current.locked).toBe(true)
    expect(hook.current.failed).toBe(false)
    // Face ID 對話框本身會觸發 inactive／active；取消後不能因此再自動彈一次，變成關不掉的迴圈。
    hook.act(() => emit('appStateChange', false))
    hook.act(() => emit('appStateChange', true))
    await flush()
    expect(authenticateAppLock).toHaveBeenCalledTimes(1)

    // 使用者按「解鎖」才重試。
    nextAuthResult = 'success'
    hook.act(() => { void hook.current.unlock() })
    await flush()
    expect(hook.current.locked).toBe(false)
    hook.unmount()
  })

  test('a failed verification keeps the lock and shows the error (never signs out)', async () => {
    saveAppLockPreference({ enabled: true, timeoutMinutes: 1 })
    saveLastBackgroundAt(now)
    nextAuthResult = 'failed'
    const hook = renderHook(() => useAppLock(true, 'reason'))
    await flush()
    goBackground(hook)
    now += 2 * MINUTE
    comeBack(hook)
    await flush()
    expect(hook.current.locked).toBe(true)
    expect(hook.current.failed).toBe(true)
    expect(readAppLockPreference().enabled).toBe(true)
    hook.unmount()
  })

  test('a short background after staying locked does not unlock it', async () => {
    saveAppLockPreference({ enabled: true, timeoutMinutes: 5 })
    saveLastBackgroundAt(now)
    nextAuthResult = 'cancelled'
    const hook = renderHook(() => useAppLock(true, 'reason'))
    await flush()
    goBackground(hook)
    now += 6 * MINUTE
    comeBack(hook)
    await flush()
    expect(hook.current.locked).toBe(true)
    goBackground(hook)
    now += 10_000
    comeBack(hook)
    await flush()
    expect(hook.current.locked).toBe(true)
    // 回到前景時重新自動叫一次驗證（新的一輪），而不是默默解鎖。
    expect(authenticateAppLock).toHaveBeenCalledTimes(2)
    hook.unmount()
  })

  test('killing and relaunching after the timeout is locked on the very first render', async () => {
    saveAppLockPreference({ enabled: true, timeoutMinutes: 5 })
    saveLastBackgroundAt(now - 30 * MINUTE)
    nextAuthResult = 'cancelled'
    const hook = renderHook(() => useAppLock(true, 'reason'))
    expect(hook.current.locked).toBe(true)
    await flush()
    expect(authenticateAppLock).toHaveBeenCalledTimes(1)
    hook.unmount()
  })

  test('if the device passcode was removed, it unlocks and turns the feature off', async () => {
    saveAppLockPreference({ enabled: true, timeoutMinutes: 5 })
    saveLastBackgroundAt(now - 30 * MINUTE)
    nextAuthResult = 'unavailable'
    const hook = renderHook(() => useAppLock(true, 'reason'))
    await flush()
    expect(hook.current.locked).toBe(false)
    expect(readAppLockPreference().enabled).toBe(false)
    expect(privacyCoverCalls.at(-1)).toBe(false)
    hook.unmount()
  })

  test('removes every Capacitor listener on unmount', async () => {
    const hook = renderHook(() => useAppLock(true, 'reason'))
    await flush()
    expect(handlers.size).toBe(3)
    hook.unmount()
    await flush()
    expect(removedListeners).toBe(3)
  })
})
