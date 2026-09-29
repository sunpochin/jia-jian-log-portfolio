/*
檔案用途：驗證血壓離線佇列觸發器 hook 的自動觸發時機（連線恢復、分頁回前景、iOS bfcache、原生殼回前景）、
  防重入與失敗退避排程，覆蓋 issue #816 的驗收條件。
所在層：tests/unit；用假的 window／document／Capacitor App plugin 重現各種觸發時機，不啟動真的瀏覽器。
主要關聯：src/features/vitals/hooks/usePendingBloodPressureFlush.ts、useBloodPressureInputForm。
*/
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, mock, test } from 'bun:test'
import { installReactHookHarness, renderHook } from './helpers/reactHookHarness'

installReactHookHarness()

let nativePlatform = false
mock.module('../../src/lib/platform', () => ({ isNativeApp: () => nativePlatform }))

type AppStateHandler = (state: { isActive: boolean }) => void
let appStateHandler: AppStateHandler | null = null
let removeAppListenerCalls = 0
const App = {
  addListener: async (eventName: string, handler: AppStateHandler) => {
    if (eventName === 'appStateChange') appStateHandler = handler
    return { remove: async () => { removeAppListenerCalls += 1 } }
  },
}
mock.module('@capacitor/app', () => ({ App }))

const { usePendingBloodPressureFlush } = await import('../../src/features/vitals/hooks/usePendingBloodPressureFlush')

// ── Fake window／document event targets ─────────────────────────────────────
const windowListeners = new Map<string, Set<() => void>>()
const documentListeners = new Map<string, Set<() => void>>()

function addTo(map: Map<string, Set<() => void>>, type: string, handler: () => void) {
  if (!map.has(type)) map.set(type, new Set())
  map.get(type)?.add(handler)
}
function removeFrom(map: Map<string, Set<() => void>>, type: string, handler: () => void) {
  map.get(type)?.delete(handler)
}

const fakeWindow = {
  addEventListener: (type: string, handler: () => void) => addTo(windowListeners, type, handler),
  removeEventListener: (type: string, handler: () => void) => removeFrom(windowListeners, type, handler),
}
const fakeDocument = {
  visibilityState: 'visible' as 'visible' | 'hidden',
  addEventListener: (type: string, handler: () => void) => addTo(documentListeners, type, handler),
  removeEventListener: (type: string, handler: () => void) => removeFrom(documentListeners, type, handler),
}

const emitWindow = (type: string) => { for (const handler of windowListeners.get(type) ?? []) handler() }
const emitVisible = () => {
  fakeDocument.visibilityState = 'visible'
  for (const handler of documentListeners.get('visibilitychange') ?? []) handler()
}

const overridden = ['window', 'document'] as const
const previousDescriptors = overridden.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)] as const)
function define(name: string, value: unknown) {
  Object.defineProperty(globalThis, name, { configurable: true, writable: true, value })
}

beforeAll(() => {
  define('window', fakeWindow)
  define('document', fakeDocument)
})
afterAll(() => {
  for (const [name, descriptor] of previousDescriptors) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor)
    else Reflect.deleteProperty(globalThis, name)
  }
})

beforeEach(() => {
  nativePlatform = false
  appStateHandler = null
  removeAppListenerCalls = 0
  windowListeners.clear()
  documentListeners.clear()
  fakeDocument.visibilityState = 'visible'
})

const flush = () => new Promise(resolve => setTimeout(resolve, 0))
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

describe('usePendingBloodPressureFlush', () => {
  test('probes once on mount and clears backoff once the sync reports the queue is empty', async () => {
    const sync = mock(async () => true)
    const hook = renderHook(() => usePendingBloodPressureFlush({ enabled: true, hasPending: true, sync }))
    await flush()
    expect(sync).toHaveBeenCalledTimes(1)
    expect(hook.current.syncing).toBe(false)
    expect(hook.current.lastAttemptAt).not.toBeNull()
    hook.unmount()
  })

  test('does nothing while disabled: no probe, no listeners fire a sync', async () => {
    const sync = mock(async () => true)
    const hook = renderHook(() => usePendingBloodPressureFlush({ enabled: false, hasPending: true, sync }))
    await flush()
    hook.act(() => emitWindow('online'))
    await flush()
    expect(sync).not.toHaveBeenCalled()
    hook.unmount()
  })

  test('online, visible visibilitychange, and pageshow each trigger a fresh sync attempt', async () => {
    const sync = mock(async () => true)
    const hook = renderHook(() => usePendingBloodPressureFlush({ enabled: true, hasPending: true, sync }))
    await flush()
    expect(sync).toHaveBeenCalledTimes(1)

    hook.act(() => emitWindow('online'))
    await flush()
    expect(sync).toHaveBeenCalledTimes(2)

    hook.act(() => emitVisible())
    await flush()
    expect(sync).toHaveBeenCalledTimes(3)

    hook.act(() => emitWindow('pageshow'))
    await flush()
    expect(sync).toHaveBeenCalledTimes(4)

    hook.unmount()
  })

  test('a hidden visibilitychange does not trigger a sync', async () => {
    const sync = mock(async () => true)
    const hook = renderHook(() => usePendingBloodPressureFlush({ enabled: true, hasPending: true, sync }))
    await flush()
    expect(sync).toHaveBeenCalledTimes(1)

    hook.act(() => {
      fakeDocument.visibilityState = 'hidden'
      for (const handler of documentListeners.get('visibilitychange') ?? []) handler()
    })
    await flush()
    expect(sync).toHaveBeenCalledTimes(1)
    hook.unmount()
  })

  test('guards against overlapping triggers while a sync is still in flight', async () => {
    let releaseSync: (() => void) | null = null
    let callCount = 0
    const sync = mock(async () => {
      callCount += 1
      await new Promise<void>(resolve => { releaseSync = resolve })
      return true
    })
    const hook = renderHook(() => usePendingBloodPressureFlush({ enabled: true, hasPending: true, sync }))
    await flush()
    expect(callCount).toBe(1)
    expect(hook.current.syncing).toBe(true)

    // 第一次呼叫尚未結束時再連續觸發兩次事件，防重入應該擋下，不能疊加成第二、第三次呼叫。
    hook.act(() => emitWindow('online'))
    hook.act(() => emitWindow('pageshow'))
    await flush()
    expect(callCount).toBe(1)

    releaseSync?.()
    await flush()
    expect(hook.current.syncing).toBe(false)
    hook.unmount()
  })

  test('retries with increasing backoff after failures and stops once the queue clears', async () => {
    let attempts = 0
    const sync = mock(async () => {
      attempts += 1
      return attempts >= 3 // 前兩次回報「仍有殘留」，第三次才清空佇列。
    })
    const hook = renderHook(() => usePendingBloodPressureFlush({
      enabled: true,
      hasPending: true,
      sync,
      retryDelaysMs: [5, 10, 15],
    }))
    await flush()
    expect(attempts).toBe(1)

    await wait(60)
    expect(attempts).toBe(3)
    expect(hook.current.syncing).toBe(false)

    // 佇列已清空；等超過最後一個 backoff 間隔也不應該再有新的嘗試。
    const attemptsAfterClear = attempts
    await wait(40)
    expect(attempts).toBe(attemptsAfterClear)
    hook.unmount()
  })

  test('clearing hasPending cancels a scheduled backoff retry', async () => {
    const sync = mock(async () => false)
    let hasPending = true
    const hook = renderHook(() => usePendingBloodPressureFlush({
      enabled: true,
      hasPending,
      sync,
      retryDelaysMs: [20],
    }))
    await flush()
    expect(sync).toHaveBeenCalledTimes(1)

    hasPending = false
    hook.rerender()
    await wait(40)
    // 排程好的重試應該被取消；佇列本來就已經沒有東西要送。
    expect(sync).toHaveBeenCalledTimes(1)
    hook.unmount()
  })

  test('a resetKey change forces a fresh probe, e.g. switching to another patient', async () => {
    const sync = mock(async () => true)
    let resetKey = 'patient-a'
    const hook = renderHook(() => usePendingBloodPressureFlush({ enabled: true, hasPending: true, sync, resetKey }))
    await flush()
    expect(sync).toHaveBeenCalledTimes(1)

    resetKey = 'patient-b'
    hook.rerender()
    await flush()
    expect(sync).toHaveBeenCalledTimes(2)
    hook.unmount()
  })

  test('registers the native appStateChange listener only when running inside the native shell, and removes it on unmount', async () => {
    nativePlatform = true
    const sync = mock(async () => true)
    const hook = renderHook(() => usePendingBloodPressureFlush({ enabled: true, hasPending: true, sync }))
    await flush()
    expect(sync).toHaveBeenCalledTimes(1)
    expect(appStateHandler).not.toBeNull()

    hook.act(() => appStateHandler?.({ isActive: true }))
    await flush()
    expect(sync).toHaveBeenCalledTimes(2)

    // 回到背景（isActive: false）不該觸發同步。
    hook.act(() => appStateHandler?.({ isActive: false }))
    await flush()
    expect(sync).toHaveBeenCalledTimes(2)

    hook.unmount()
    await flush()
    expect(removeAppListenerCalls).toBe(1)
  })

  test('does not register a native listener on the web', async () => {
    nativePlatform = false
    const sync = mock(async () => true)
    const hook = renderHook(() => usePendingBloodPressureFlush({ enabled: true, hasPending: true, sync }))
    await flush()
    expect(appStateHandler).toBeNull()
    hook.unmount()
  })

  test('a false→true transition of hasPending probes immediately, without waiting for a browser event', async () => {
    const sync = mock(async () => true)
    let hasPending = false
    const hook = renderHook(() => usePendingBloodPressureFlush({ enabled: true, hasPending, sync }))
    await flush()
    expect(sync).toHaveBeenCalledTimes(1) // 掛載時的初始探測，當時佇列還是空的

    hasPending = true
    hook.rerender()
    await flush()
    // 提交時遇到暫時性錯誤才第一次進佇列這種情況，navigator.onLine 通常仍是 true，
    // 不會有任何 online／visibilitychange 事件；沒有這個探測就要等下一次回前景才會重試。
    expect(sync).toHaveBeenCalledTimes(2)
    hook.unmount()
  })

  test('staying pending across renders does not cause a repeat probe', async () => {
    const sync = mock(async () => true)
    const hook = renderHook(() => usePendingBloodPressureFlush({ enabled: true, hasPending: true, sync }))
    await flush()
    expect(sync).toHaveBeenCalledTimes(1)

    hook.rerender()
    hook.rerender()
    await flush()
    expect(sync).toHaveBeenCalledTimes(1)
    hook.unmount()
  })

  test('switching patients (resetKey) resets the retry tier instead of inheriting the previous one', async () => {
    let attempts = 0
    const sync = mock(async () => { attempts += 1; return false }) // 一律回報仍有殘留
    let resetKey = 'patient-a'
    const hook = renderHook(() => usePendingBloodPressureFlush({
      enabled: true,
      hasPending: true,
      sync,
      resetKey,
      retryDelaysMs: [5, 1000, 5000],
    }))
    await flush()
    expect(attempts).toBe(1) // mount 探測失敗，排 5ms 後重試（退避階段 0→1）

    await wait(40)
    expect(attempts).toBe(2) // 5ms 重試已觸發並再次失敗，這次排 1000ms 重試（退避階段 1→2）

    // 在 1000ms 到期前切換病人；沒修正的話 backoffIndexRef 仍停在 2，下一次失敗會排到 5000ms。
    resetKey = 'patient-b'
    hook.rerender()
    await flush()
    expect(attempts).toBe(3) // 換探測對象要立刻重新探測一次，不等舊病人剩下的 1000ms 計時器

    await wait(40)
    // 退避階段沒重置的話，這裡仍會停在 3（因為排到了 5000ms 之後）；正確重置後應該在 5ms 附近就再次嘗試。
    expect(attempts).toBe(4)
    hook.unmount()
  })

  test('disabling mid-flight prevents the late response from scheduling a zombie retry', async () => {
    let releaseSync: (() => void) | null = null
    let callCount = 0
    const sync = mock(async () => {
      callCount += 1
      await new Promise<void>(resolve => { releaseSync = resolve })
      return false // 假裝仍有殘留；若沒修正，回應遲到後仍會照這個結果排下一輪重試。
    })
    let enabled = true
    const hook = renderHook(() => usePendingBloodPressureFlush({ enabled, hasPending: true, sync, retryDelaysMs: [10] }))
    await flush()
    expect(callCount).toBe(1)

    enabled = false
    hook.rerender()
    await flush()

    // 舊呼叫在停用之後才真正 resolve；沒有 disposed 判斷的話，會在這裡排一個 10ms 後的殭屍重試。
    releaseSync?.()
    await flush()
    await wait(40)
    expect(callCount).toBe(1)
    hook.unmount()
  })
})
