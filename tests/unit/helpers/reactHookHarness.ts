/*
檔案用途：提供不依賴 DOM renderer 的最小 React Hook 執行環境，讓 hooks 與含狀態的元件能在 bun test 中被實際執行。
所在層：tests/unit/helpers 測試支援層；只在測試程序內替換 react 的 hook 匯出，不影響正式程式碼。
主要關聯：useKeyboardViewport、useUpcomingSchedule、LocaleProvider、PwaUpdateGuardProvider 等測試檔。
*/
import { mock } from 'bun:test'
import * as reactNamespace from 'react'

// 為什麼先把原始 hook 抓成區域常數：mock.module 會改寫 'react' 的 live binding，
// 若延後再讀 reactNamespace.useState，回退路徑會指回我們自己的替身而變成無限遞迴。
const realUseState = reactNamespace.useState
const realUseEffect = reactNamespace.useEffect
const realUseRef = reactNamespace.useRef
const realUseMemo = reactNamespace.useMemo
const realUseCallback = reactNamespace.useCallback
const realUseContext = reactNamespace.useContext
const realReactDefault = (reactNamespace as unknown as { default?: unknown }).default ?? reactNamespace

type StateSlot = { kind: 'state'; value: unknown }
type RefSlot = { kind: 'ref'; ref: { current: unknown } }
const UNSET = Symbol('unset-memo-deps')
type MemoSlot = { kind: 'memo'; deps: unknown[] | undefined | typeof UNSET; value: unknown }
type Slot = StateSlot | RefSlot | MemoSlot
type EffectSlot = {
  create: () => void | (() => void)
  deps: unknown[] | undefined
  cleanup?: (() => void) | void
  dirty: boolean
}

function sameDeps(previous: unknown[] | undefined, next: unknown[] | undefined) {
  if (!previous || !next || previous.length !== next.length) return false
  return previous.every((value, index) => Object.is(value, next[index]))
}

/** 單一 hook 樹的執行狀態；一次只有一個 host 是 active，其餘 react 呼叫仍走原生實作。 */
class HookHost<T> {
  private slots: Slot[] = []
  private effects: EffectSlot[] = []
  private slotCursor = 0
  private effectCursor = 0
  private rendering = false
  private flushing = false
  private needsRender = false
  private unmounted = false
  readonly contexts = new Map<unknown, unknown>()
  current!: T

  constructor(private readonly body: () => T) {}

  private nextSlot<S extends Slot>(create: () => S): S {
    const index = this.slotCursor
    this.slotCursor += 1
    if (!this.slots[index]) this.slots[index] = create()
    return this.slots[index] as S
  }

  useState<S>(initial: S | (() => S)): [S, (next: S | ((current: S) => S)) => void] {
    const slot = this.nextSlot<StateSlot>(() => ({
      kind: 'state',
      value: typeof initial === 'function' ? (initial as () => S)() : initial,
    }))
    const setState = (next: S | ((current: S) => S)) => {
      const value = typeof next === 'function' ? (next as (current: S) => S)(slot.value as S) : next
      if (Object.is(value, slot.value)) return
      slot.value = value
      this.requestRender()
    }
    return [slot.value as S, setState]
  }

  useRef<S>(initial: S) {
    return this.nextSlot<RefSlot>(() => ({ kind: 'ref', ref: { current: initial } })).ref as { current: S }
  }

  useMemo<S>(factory: () => S, deps?: unknown[]): S {
    const slot = this.nextSlot<MemoSlot>(() => ({ kind: 'memo', deps: UNSET, value: undefined }))
    // UNSET 代表這個 slot 還沒算過；不能用 undefined 判斷，因為「沒有 deps」本身就是合法輸入。
    if (slot.deps === UNSET || !sameDeps(slot.deps as unknown[] | undefined, deps)) {
      slot.value = factory()
      slot.deps = deps
    }
    return slot.value as S
  }

  useEffect(create: () => void | (() => void), deps?: unknown[]) {
    const index = this.effectCursor
    this.effectCursor += 1
    const existing = this.effects[index]
    if (!existing) {
      this.effects[index] = { create, deps, dirty: true }
      return
    }
    existing.create = create
    if (!sameDeps(existing.deps, deps)) {
      existing.deps = deps
      existing.dirty = true
    }
  }

  defaultContext: unknown = null

  useContext<S>(context: unknown): S {
    if (this.contexts.has(context)) return this.contexts.get(context) as S
    // 沒有指定對應 Provider 時回傳 defaultContext；預設為 null，
    // 讓「必須包在 Provider 內」的防呆分支也能被測到。
    return this.defaultContext as S
  }

  private requestRender() {
    if (this.unmounted) return
    if (this.rendering || this.flushing) { this.needsRender = true; return }
    this.render()
  }

  render(): T {
    let guard = 0
    do {
      this.needsRender = false
      this.slotCursor = 0
      this.effectCursor = 0
      this.rendering = true
      const previousHost = activeHost
      activeHost = this as HookHost<unknown>
      try {
        this.current = this.body()
      } finally {
        activeHost = previousHost
        this.rendering = false
      }
      this.flushEffects()
      guard += 1
      // 防呆上限：測試中的無限重繪要立刻爆掉，而不是讓 bun test 卡住。
      if (guard > 50) throw new Error('Hook harness re-rendered more than 50 times; check for a render loop.')
    } while (this.needsRender)
    return this.current
  }

  private flushEffects() {
    this.flushing = true
    try {
      for (const effect of this.effects) {
        if (!effect.dirty) continue
        effect.dirty = false
        if (typeof effect.cleanup === 'function') effect.cleanup()
        effect.cleanup = effect.create()
      }
    } finally {
      this.flushing = false
    }
  }

  unmount() {
    for (const effect of this.effects) {
      if (typeof effect.cleanup === 'function') effect.cleanup()
      effect.cleanup = undefined
      effect.dirty = false
    }
    this.unmounted = true
  }
}

let activeHost: HookHost<unknown> | null = null

const harnessHooks = {
  useState: (<S,>(initial: S | (() => S)) => (activeHost ? activeHost.useState(initial) : realUseState(initial))) as typeof realUseState,
  useEffect: ((create: () => void | (() => void), deps?: unknown[]) => (
    activeHost ? activeHost.useEffect(create, deps) : realUseEffect(create, deps)
  )) as typeof realUseEffect,
  useLayoutEffect: ((create: () => void | (() => void), deps?: unknown[]) => (
    activeHost ? activeHost.useEffect(create, deps) : realUseEffect(create, deps)
  )) as typeof realUseEffect,
  useRef: (<S,>(initial: S) => (activeHost ? activeHost.useRef(initial) : realUseRef(initial))) as typeof realUseRef,
  useMemo: (<S,>(factory: () => S, deps?: unknown[]) => (activeHost ? activeHost.useMemo(factory, deps) : realUseMemo(factory, deps))) as typeof realUseMemo,
  useCallback: (<S,>(callback: S, deps?: unknown[]) => (
    activeHost ? activeHost.useMemo(() => callback, deps) : realUseCallback(callback as never, deps as never)
  )) as typeof realUseCallback,
  useContext: (<S,>(context: unknown) => (activeHost ? activeHost.useContext<S>(context) : realUseContext(context as never))) as typeof realUseContext,
}

let installed = false

/**
 * 用測試替身覆蓋 react 的 hook 匯出。必須在 `await import()` 受測模組之前呼叫。
 * 沒有 active host 時所有 hook 都回退到真正的 react 實作，因此不會污染其他測試檔。
 */
export function installReactHookHarness() {
  if (installed) return
  installed = true
  mock.module('react', () => ({
    ...reactNamespace,
    ...harnessHooks,
    default: { ...(realReactDefault as object), ...harnessHooks },
  }))
}

export interface HookHandle<T> {
  /** 最近一次 render 的回傳值。 */
  readonly current: T
  /** 重新執行一次 render（等同 props 未變的重繪）。 */
  rerender: () => T
  /** 在 host 內執行互動，結束後回傳最新 render 結果。 */
  act: (action: () => void) => T
  /** 觸發卸載，執行所有 effect cleanup。 */
  unmount: () => void
  /** 註冊 useContext 要回傳的值，模擬外層 Provider。 */
  provideContext: (context: unknown, value: unknown) => void
}

export interface RenderHookOptions {
  /** 指定某個 context 物件要回傳的值。 */
  contexts?: Iterable<readonly [unknown, unknown]>
  /** 未指定對應 context 時的共用回傳值；元件測試通常用它餵入語系 Provider 的值。 */
  defaultContext?: unknown
}

/** 執行一個 hook 或元件函式，並同步跑完它的 effects。 */
export function renderHook<T>(body: () => T, options: RenderHookOptions = {}): HookHandle<T> {
  const host = new HookHost(body)
  // Provider 值必須在第一次 render 前就備妥，否則元件會先看到「不在 Provider 內」的狀態。
  for (const [context, value] of options.contexts ?? []) host.contexts.set(context, value)
  if (options.defaultContext !== undefined) host.defaultContext = options.defaultContext
  host.render()
  return {
    get current() { return host.current },
    rerender: () => host.render(),
    act: (action: () => void) => {
      const previousHost = activeHost
      activeHost = null
      try { action() } finally { activeHost = previousHost }
      return host.current
    },
    unmount: () => host.unmount(),
    provideContext: (context: unknown, value: unknown) => { host.contexts.set(context, value) },
  }
}
