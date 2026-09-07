/*
檔案用途：以最小 hook 執行環境驗證共用 React 狀態層（競態 token、PWA 未存輸入守門、語系 Provider）真的會跑到 effect 與 cleanup。
所在層：tests/unit；不啟動瀏覽器 DOM，只重現 hook 的呼叫順序與生命週期。
主要關聯：src/hooks/useLatestRequest.ts、src/lib/pwaUpdateGuard.tsx、src/lib/i18n.tsx。
*/
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test'
import { installReactHookHarness, renderHook } from './helpers/reactHookHarness'

installReactHookHarness()

const storage: Record<string, string> = {}
let storageThrows = false
const previousLocalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
const previousDocument = Object.getOwnPropertyDescriptor(globalThis, 'document')

const documentElement = { lang: '' }

// 為什麼在 beforeAll 才安裝：這些全域是整個測試程序共用的，
// 在模組載入期就覆寫會在其他測試檔還在跑的時候把它們的 document／localStorage 換掉。
beforeAll(() => {
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    writable: true,
    value: {
      getItem: (key: string) => {
        if (storageThrows) throw new Error('SecurityError')
        return storage[key] ?? null
      },
      setItem: (key: string, value: string) => {
        if (storageThrows) throw new Error('SecurityError')
        storage[key] = value
      },
      removeItem: (key: string) => { delete storage[key] },
    },
  })
  Object.defineProperty(globalThis, 'document', { configurable: true, writable: true, value: { documentElement } })
})

const { useLatestRequest } = await import('../../src/hooks/useLatestRequest')
const { PwaUpdateGuardProvider, usePwaUpdateGuard, hasAnyActiveGlobalOverlay, hasAnyUnsavedInput } = await import('../../src/lib/pwaUpdateGuard')
const { LocaleProvider, useI18n, common } = await import('../../src/lib/i18n')

/** React 18 的 Provider 帶著 _context；抽出來才能把值餵給 useContext 替身。 */
function contextOf(element: unknown) {
  const type = (element as { type: unknown }).type as { _context?: unknown }
  return type?._context ?? type
}

beforeEach(() => {
  for (const key of Object.keys(storage)) delete storage[key]
  storageThrows = false
  documentElement.lang = ''
})

afterAll(() => {
  if (previousLocalStorage) Object.defineProperty(globalThis, 'localStorage', previousLocalStorage)
  else Reflect.deleteProperty(globalThis, 'localStorage')
  if (previousDocument) Object.defineProperty(globalThis, 'document', previousDocument)
  else Reflect.deleteProperty(globalThis, 'document')
})

describe('useLatestRequest lifecycle', () => {
  test('keeps one tracker identity across re-renders so fetch effects are not rebuilt', () => {
    const hook = renderHook(() => useLatestRequest())
    const first = hook.current
    expect(hook.rerender()).toBe(first)
  })

  test('unmounting invalidates every in-flight request', () => {
    const hook = renderHook(() => useLatestRequest())
    const isCurrent = hook.current.begin()
    expect(isCurrent()).toBe(true)
    hook.unmount()
    expect(isCurrent()).toBe(false)
  })
})

describe('PWA update guard provider', () => {
  test('aggregates unsaved input from several still-mounted forms', () => {
    expect(hasAnyUnsavedInput({})).toBe(false)
    expect(hasAnyUnsavedInput({ bp: false, weight: true })).toBe(true)

    const hook = renderHook(() => PwaUpdateGuardProvider({ children: null }))
    const readValue = () => (hook.current as { props: { value: { hasUnsavedInput: boolean; registerUnsavedInput: (source: string, value: boolean) => void } } }).props.value

    expect(readValue().hasUnsavedInput).toBe(false)
    hook.act(() => readValue().registerUnsavedInput('blood-pressure', true))
    expect(readValue().hasUnsavedInput).toBe(true)

    // 同一頁重複回報 true 不應產生新的 state 物件，否則整棵樹會無謂重繪。
    const stableValue = readValue()
    hook.act(() => stableValue.registerUnsavedInput('blood-pressure', true))
    expect(readValue()).toBe(stableValue)

    hook.act(() => readValue().registerUnsavedInput('temperature', false))
    expect(readValue().hasUnsavedInput).toBe(true)

    hook.act(() => readValue().registerUnsavedInput('blood-pressure', false))
    expect(readValue().hasUnsavedInput).toBe(false)
  })

  test('hides install guidance while any registered global overlay is active', () => {
    expect(hasAnyActiveGlobalOverlay({})).toBe(false)
    expect(hasAnyActiveGlobalOverlay({ tutorial: false, pwaUpdate: true })).toBe(true)
    expect(hasAnyActiveGlobalOverlay({ tutorial: false, pwaUpdate: false })).toBe(false)
  })

  test('usePwaUpdateGuard refuses to run outside its provider', () => {
    expect(() => renderHook(() => usePwaUpdateGuard())).toThrow('usePwaUpdateGuard must be used inside PwaUpdateGuardProvider')
  })

  test('usePwaUpdateGuard returns the provider value when called inside the tree', () => {
    const provider = renderHook(() => PwaUpdateGuardProvider({ children: null }))
    const providedValue = (provider.current as { props: { value: unknown } }).props.value

    const consumer = renderHook(() => usePwaUpdateGuard(), { defaultContext: providedValue })
    expect(consumer.current).toBe(providedValue)
  })
})

describe('LocaleProvider and useI18n', () => {
  test('persists the chosen language and marks the document language', () => {
    const provider = renderHook(() => LocaleProvider({ children: null }))
    const context = contextOf(provider.current)
    const readValue = () => (provider.current as { props: { value: { locale: string; setLocale: (locale: 'id' | 'zh') => void } } }).props.value

    expect(readValue().locale).toBe('zh')
    expect(documentElement.lang).toBe('zh-Hant')
    expect(storage['bp-tracker.locale']).toBe('zh')

    provider.act(() => readValue().setLocale('id'))
    expect(readValue().locale).toBe('id')
    expect(documentElement.lang).toBe('id')
    expect(storage['bp-tracker.locale']).toBe('id')

    const translate = renderHook(() => useI18n(), { contexts: [[context, readValue()]] })
    expect(translate.current.text(common.retry)).toBe('Coba lagi')
    // text() 的 identity 必須跟著語言才變，否則依賴它的查詢會每次 render 重跑。
    expect(translate.rerender().text).toBe(translate.current.text)
  })

  test('keeps working when the browser blocks storage', () => {
    storageThrows = true
    const provider = renderHook(() => LocaleProvider({ children: null }))
    expect((provider.current as { props: { value: { locale: string } } }).props.value.locale).toBe('zh')
    expect(documentElement.lang).toBe('zh-Hant')
  })

  test('useI18n refuses to run outside LocaleProvider', () => {
    expect(() => renderHook(() => useI18n())).toThrow('useI18n must be used inside LocaleProvider')
  })
})
