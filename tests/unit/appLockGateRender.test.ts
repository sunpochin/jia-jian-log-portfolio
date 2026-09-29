/*
檔案用途：鎖住 App 鎖元件的平台守門（issue #821）：Web／PWA 與 Android 殼上，AppLockGate 與 AppLockSettings 都不渲染、
  不掛任何生命週期監聽，確保 Web 行為零變更，也不會在尚未實作原生驗證的 Android 上出現解不開的鎖。
所在層：tests/unit；只驗證第一次 render 的早期 return，不啟動瀏覽器或模擬器。
主要關聯：src/components/system/AppLockGate.tsx、src/components/settings/AppLockSettings.tsx、src/lib/platform.ts。
*/
import { beforeEach, describe, expect, mock, test } from 'bun:test'
import { installReactHookHarness, renderHook } from './helpers/reactHookHarness'

installReactHookHarness()

let nativeApp = false
let nativePlatform: 'ios' | 'android' | 'web' = 'web'
mock.module('../../src/lib/platform', () => ({
  isNativeApp: () => nativeApp,
  isStandalonePwa: (displayModeMatches: boolean, navigatorStandalone = false) => displayModeMatches || navigatorStandalone,
  readIsStandalonePwa: () => false,
  getNativePlatform: () => nativePlatform,
}))

let listenerCount = 0
mock.module('@capacitor/app', () => ({
  App: {
    addListener: async () => {
      listenerCount += 1
      return { remove: async () => {} }
    },
  },
}))

const { AppLockGate } = await import('../../src/components/system/AppLockGate')
const { AppLockSettings } = await import('../../src/components/settings/AppLockSettings')

describe('app lock platform gating', () => {
  beforeEach(() => {
    listenerCount = 0
  })

  test('web / PWA renders neither the gate nor the setting', () => {
    nativeApp = false
    nativePlatform = 'web'
    const gate = renderHook(() => AppLockGate())
    const settings = renderHook(() => AppLockSettings())
    expect(gate.current).toBeNull()
    expect(settings.current).toBeNull()
    expect(listenerCount).toBe(0)
    gate.unmount()
    settings.unmount()
  })

  test('Android shell renders neither: there is no native unlock there yet', () => {
    nativeApp = true
    nativePlatform = 'android'
    const gate = renderHook(() => AppLockGate())
    const settings = renderHook(() => AppLockSettings())
    expect(gate.current).toBeNull()
    expect(settings.current).toBeNull()
    expect(listenerCount).toBe(0)
    gate.unmount()
    settings.unmount()
  })
})
