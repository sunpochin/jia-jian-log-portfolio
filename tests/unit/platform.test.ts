/*
檔案用途：驗證原生殼與 standalone PWA 的單一平台判定來源。
所在層：tests/unit；不啟動真實 Capacitor bridge，只驗證薄轉接的分支。
主要關聯：src/lib/platform.ts 及其在 nativeAuth／auth／pwaInstall 的既有呼叫端。
*/
import { beforeEach, describe, expect, mock, test } from 'bun:test'

let nativePlatform = false
let platform: 'ios' | 'android' | 'web' = 'web'

const Capacitor = {
  isNativePlatform: () => nativePlatform,
  getPlatform: () => platform,
}

const actualCapacitorCore = await import('@capacitor/core')
// 繁體中文註解：Bun 的 mock.module 是全域生效的，若只匯出 Capacitor 會造成後續載入 @capacitor/browser
// 時遺失 registerPlugin 等其它匯出而拋出 TypeError。
mock.module('@capacitor/core', () => ({
  ...actualCapacitorCore,
  Capacitor,
}))

const { getNativePlatform, isNativeApp, isStandalonePwa, readIsStandalonePwa } = await import('../../src/lib/platform')

describe('platform', () => {
  beforeEach(() => {
    nativePlatform = false
    platform = 'web'
  })

  test('isNativeApp reflects Capacitor.isNativePlatform', () => {
    expect(isNativeApp()).toBe(false)
    nativePlatform = true
    expect(isNativeApp()).toBe(true)
  })

  test('getNativePlatform reflects Capacitor.getPlatform', () => {
    expect(getNativePlatform()).toBe('web')
    platform = 'ios'
    expect(getNativePlatform()).toBe('ios')
    platform = 'android'
    expect(getNativePlatform()).toBe('android')
  })

  test('isStandalonePwa treats browser display mode and iOS standalone as installed', () => {
    expect(isStandalonePwa(true, false)).toBe(true)
    expect(isStandalonePwa(false, true)).toBe(true)
    expect(isStandalonePwa(false, false)).toBe(false)
  })

  test('readIsStandalonePwa combines navigator.standalone and the display-mode media query', () => {
    // window 可能已被其他測試檔在同一個 process 建立（見 auth.test.ts），因此不假設 undefined，
    // 而是像既有測試一樣直接操作 window 上的兩個訊號。
    if (typeof globalThis.window === 'undefined') {
      ;(globalThis as any).window = { navigator: {} }
    }
    const win = globalThis.window as unknown as { navigator: Navigator & { standalone?: boolean }; matchMedia?: (query: string) => { matches: boolean } }
    const originalStandalone = win.navigator.standalone
    const originalMatchMedia = win.matchMedia

    win.navigator.standalone = false
    win.matchMedia = () => ({ matches: false })
    expect(readIsStandalonePwa()).toBe(false)

    win.navigator.standalone = true
    expect(readIsStandalonePwa()).toBe(true)
    win.navigator.standalone = false

    win.matchMedia = (query: string) => ({ matches: query === '(display-mode: standalone)' })
    expect(readIsStandalonePwa()).toBe(true)

    win.navigator.standalone = originalStandalone
    win.matchMedia = originalMatchMedia
  })
})
