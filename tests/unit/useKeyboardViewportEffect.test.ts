/*
檔案用途：驗證軟鍵盤 viewport hook 的訂閱、收合緩衝與卸載清理，而不只是純判定函式。
所在層：tests/unit；用假的 visualViewport 與焦點元素重現手機鍵盤開合，不啟動真的瀏覽器。
主要關聯：src/hooks/useKeyboardViewport.ts、App 外殼與照護輸入頁的 compact mode。
*/
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test'
import { installReactHookHarness, renderHook } from './helpers/reactHookHarness'

installReactHookHarness()

class FakeHTMLElement { isContentEditable = false }
class FakeHTMLInputElement extends FakeHTMLElement {}
class FakeHTMLTextAreaElement extends FakeHTMLElement {}
class FakeHTMLSelectElement extends FakeHTMLElement {}

const listeners = new Map<string, Set<() => void>>()
const viewport = {
  height: 844,
  scale: 1,
  addEventListener(type: string, handler: () => void) {
    if (!listeners.has(type)) listeners.set(type, new Set())
    listeners.get(type)?.add(handler)
  },
  removeEventListener(type: string, handler: () => void) {
    listeners.get(type)?.delete(handler)
  },
}

const fakeWindow = { innerHeight: 844, visualViewport: viewport as unknown as VisualViewport }
const fakeDocument = { activeElement: null as unknown }

const overridden = ['window', 'document', 'HTMLElement', 'HTMLInputElement', 'HTMLTextAreaElement', 'HTMLSelectElement'] as const
const previousDescriptors = overridden.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)] as const)

function define(name: string, value: unknown) {
  Object.defineProperty(globalThis, name, { configurable: true, writable: true, value })
}

// 為什麼在 beforeAll 才覆寫：這些是整個測試程序共用的全域，模組載入期就換掉會污染其他測試檔。
beforeAll(() => {
  define('window', fakeWindow)
  define('document', fakeDocument)
  define('HTMLElement', FakeHTMLElement)
  define('HTMLInputElement', FakeHTMLInputElement)
  define('HTMLTextAreaElement', FakeHTMLTextAreaElement)
  define('HTMLSelectElement', FakeHTMLSelectElement)
})

const { useKeyboardViewport, KEYBOARD_VIEWPORT_THRESHOLD } = await import('../../src/hooks/useKeyboardViewport')

const emit = (type: 'resize' | 'scroll') => { for (const handler of listeners.get(type) ?? []) handler() }
const settle = () => new Promise(resolve => setTimeout(resolve, 160))

beforeEach(() => {
  viewport.height = 844
  viewport.scale = 1
  fakeWindow.innerHeight = 844
  fakeDocument.activeElement = null
})

afterAll(() => {
  for (const [name, descriptor] of previousDescriptors) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor)
    else Reflect.deleteProperty(globalThis, name)
  }
})

describe('useKeyboardViewport subscription', () => {
  test('opens immediately while an input is focused and only closes after the height settles', async () => {
    fakeDocument.activeElement = new FakeHTMLInputElement()
    const hook = renderHook(() => useKeyboardViewport())
    expect(hook.current).toBe(false)

    viewport.height = 844 - KEYBOARD_VIEWPORT_THRESHOLD - 100
    hook.act(() => emit('resize'))
    expect(hook.current).toBe(true)

    // 收合動畫的中間高度不能讓底部導覽列閃回來；必須等緩衝結束仍然回穩才切換。
    viewport.height = 844
    hook.act(() => emit('resize'))
    expect(hook.current).toBe(true)
    await settle()
    expect(hook.current).toBe(false)
    hook.unmount()
  })

  test('cancels a pending close when the keyboard comes back', async () => {
    fakeDocument.activeElement = new FakeHTMLTextAreaElement()
    const hook = renderHook(() => useKeyboardViewport())
    viewport.height = 500
    hook.act(() => emit('scroll'))
    expect(hook.current).toBe(true)

    viewport.height = 844
    hook.act(() => emit('scroll'))
    viewport.height = 500
    hook.act(() => emit('scroll'))
    await settle()
    expect(hook.current).toBe(true)
    hook.unmount()
  })

  test('ignores a shrunken viewport that comes from zooming without an editable focus', () => {
    fakeDocument.activeElement = new FakeHTMLElement()
    const hook = renderHook(() => useKeyboardViewport())
    viewport.height = 500
    viewport.scale = 1.5
    hook.act(() => emit('resize'))
    expect(hook.current).toBe(false)
    hook.unmount()
  })

  test('treats a contenteditable note as an editable focus', () => {
    const editable = new FakeHTMLElement()
    editable.isContentEditable = true
    fakeDocument.activeElement = editable
    const hook = renderHook(() => useKeyboardViewport())
    viewport.height = 500
    hook.act(() => emit('resize'))
    expect(hook.current).toBe(true)
    hook.unmount()
  })

  test('drops both viewport listeners on unmount', () => {
    fakeDocument.activeElement = new FakeHTMLSelectElement()
    const hook = renderHook(() => useKeyboardViewport())
    expect(listeners.get('resize')?.size).toBe(1)
    expect(listeners.get('scroll')?.size).toBe(1)
    hook.unmount()
    expect(listeners.get('resize')?.size).toBe(0)
    expect(listeners.get('scroll')?.size).toBe(0)
  })

  test('stays closed on desktop browsers without a visual viewport', () => {
    const withViewport = fakeWindow.visualViewport
    fakeWindow.visualViewport = undefined as unknown as VisualViewport
    const hook = renderHook(() => useKeyboardViewport())
    expect(hook.current).toBe(false)
    hook.unmount()
    fakeWindow.visualViewport = withViewport
  })
})
