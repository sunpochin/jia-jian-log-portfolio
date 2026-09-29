/*
檔案用途：驗證畫面內確認對話框的 Promise 結果、危險樣式、Escape 與 Tab focus trap。
所在層：tests/unit；用極簡 DOM fixture 執行可及性邏輯，不啟動瀏覽器 renderer。
主要關聯：src/hooks/useConfirm.tsx、MedicationAdminSection、TemperaturePage 與刪除操作元件。
*/
import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { installReactHookHarness, renderHook } from './helpers/reactHookHarness'
import { fire, findAll, textContent } from './helpers/elementTree'

installReactHookHarness()

const { useConfirm } = await import('../../src/hooks/useConfirm')

const originalDocument = Object.getOwnPropertyDescriptor(globalThis, 'document')
const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window')
const originalHTMLElement = Object.getOwnPropertyDescriptor(globalThis, 'HTMLElement')

class FakeElement {
  focused = false
  constructor(private readonly children: FakeElement[] = []) {}
  focus() {
    this.focused = true
    fakeDocument.activeElement = this
  }
  contains(node: unknown) {
    return node === this || this.children.includes(node as FakeElement)
  }
  querySelectorAll() {
    return this.children
  }
}

let fakeDocument: {
  activeElement: FakeElement | null
  addEventListener: (type: string, listener: (event: KeyboardEvent) => void) => void
  removeEventListener: (type: string, listener: (event: KeyboardEvent) => void) => void
  listener: ((event: KeyboardEvent) => void) | null
}

function installDom() {
  fakeDocument = {
    activeElement: null,
    listener: null,
    addEventListener: (_type, listener) => { fakeDocument.listener = listener },
    removeEventListener: (_type, listener) => {
      if (fakeDocument.listener === listener) fakeDocument.listener = null
    },
  }
  Object.defineProperty(globalThis, 'HTMLElement', { configurable: true, value: FakeElement })
  Object.defineProperty(globalThis, 'document', { configurable: true, writable: true, value: fakeDocument })
  Object.defineProperty(globalThis, 'window', { configurable: true, writable: true, value: {
    setTimeout: globalThis.setTimeout.bind(globalThis),
    clearTimeout: globalThis.clearTimeout.bind(globalThis),
  } })
}

beforeEach(installDom)

afterEach(() => {
  if (originalDocument) Object.defineProperty(globalThis, 'document', originalDocument)
  else Reflect.deleteProperty(globalThis, 'document')
  if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow)
  else Reflect.deleteProperty(globalThis, 'window')
  if (originalHTMLElement) Object.defineProperty(globalThis, 'HTMLElement', originalHTMLElement)
  else Reflect.deleteProperty(globalThis, 'HTMLElement')
})

const context = { locale: 'zh' as const, setLocale: () => undefined }

function dialogNode(view: { current: unknown }) {
  const dialog = (view.current as { dialog: { props: Record<string, unknown>; ref?: unknown } }).dialog
  if (!dialog) throw new Error('Expected confirmation dialog')
  return dialog
}

function setElementRef(element: { ref?: unknown }, value: FakeElement) {
  const ref = element.ref as { current: FakeElement | null } | undefined
  if (!ref) throw new Error('Expected React ref object')
  ref.current = value
}

describe('useConfirm', () => {
  test('resolves false from Escape and restores the previously focused element', async () => {
    const previous = new FakeElement()
    previous.focus()
    const view = renderHook(() => useConfirm(), { defaultContext: context })
    const pending = view.current.confirm('刪除這筆紀錄？', { danger: true })
    const dialog = dialogNode(view)
    expect(textContent(dialog)).toContain('刪除這筆紀錄？')
    expect(textContent(dialog)).toContain('取消')
    expect(textContent(dialog)).toContain('確定')
    expect((findAll(dialog, element => element.type === 'button')[1]?.props.className as string)).toContain('bg-red-600')

    const dialogElement = new FakeElement([new FakeElement(), new FakeElement()])
    setElementRef(dialog, dialogElement)
    fakeDocument.listener?.({ key: 'Escape', preventDefault: () => undefined } as KeyboardEvent)
    await expect(pending).resolves.toBe(false)
    expect(previous.focused).toBe(true)
    expect((view.current as { dialog: unknown }).dialog).toBeNull()
    view.unmount()
  })

  test('keeps the buttons reachable when the message is taller than the viewport', () => {
    // 長同意文字（例如印尼文唯讀分享告知）在短螢幕會比視窗高：面板必須限高、只讓訊息區捲動、按鈕列不被壓縮，
    // 否則外層 fixed＋置中會把按鈕裁到畫面外，連取消都按不到（PR #922 Codex P1）。
    const view = renderHook(() => useConfirm(), { defaultContext: context })
    void view.current.confirm('長訊息'.repeat(300))
    const dialog = dialogNode(view)
    const panel = findAll(dialog, element => typeof element.props.className === 'string' && (element.props.className as string).includes('max-w-sm'))[0]
    expect(panel?.props.className).toContain('max-h-full')
    expect(panel?.props.className).toContain('flex-col')
    const message = findAll(dialog, element => element.props.id === 'confirm-dialog-message')[0]
    expect(message?.props.className).toContain('overflow-y-auto')
    expect(message?.props.className).toContain('min-h-0')
    const buttonRow = findAll(dialog, element => typeof element.props.className === 'string' && (element.props.className as string).includes('mt-4 flex'))[0]
    expect(buttonRow?.props.className).toContain('shrink-0')
    view.unmount()
  })

  test('traps Tab in both directions, ignores unrelated keys, and resolves true from confirm button', async () => {
    const view = renderHook(() => useConfirm(), { defaultContext: context })
    const pending = view.current.confirm('繼續？')
    const dialog = dialogNode(view)
    const first = new FakeElement()
    const last = new FakeElement()
    setElementRef(dialog, new FakeElement([first, last]))

    fakeDocument.activeElement = new FakeElement()
    let prevented = false
    fakeDocument.listener?.({ key: 'x', preventDefault: () => { prevented = true } } as KeyboardEvent)
    expect(prevented).toBe(false)
    fakeDocument.listener?.({ key: 'Tab', shiftKey: true, preventDefault: () => { prevented = true } } as KeyboardEvent)
    expect(prevented).toBe(true)
    expect(last.focused).toBe(true)

    fakeDocument.activeElement = last
    fakeDocument.listener?.({ key: 'Tab', shiftKey: false, preventDefault: () => undefined } as KeyboardEvent)
    expect(first.focused).toBe(true)

    const emptyDialog = new FakeElement()
    setElementRef(dialog, emptyDialog)
    fakeDocument.listener?.({ key: 'Tab', shiftKey: false, preventDefault: () => { throw new Error('should not trap without focusable nodes') } } as KeyboardEvent)

    const buttons = findAll(dialogNode(view), element => element.type === 'button')
    fire(buttons[1], 'onClick')
    await expect(pending).resolves.toBe(true)
    view.unmount()
  })

  test('asynchronously focuses the cancel button after the dialog opens, so Enter never re-triggers a dangerous default action', async () => {
    const view = renderHook(() => useConfirm(), { defaultContext: context })
    const pending = view.current.confirm('請確認', { danger: true })
    const dialog = dialogNode(view)
    const buttons = findAll(dialog, element => element.type === 'button')
    const cancelButton = new FakeElement()
    setElementRef(buttons[0], cancelButton)

    await new Promise(resolve => setTimeout(resolve, 0))
    expect(cancelButton.focused).toBe(true)

    fire(buttons[0], 'onClick')
    await expect(pending).resolves.toBe(false)
    view.unmount()
  })

  test('skips DOM effects when no document or HTMLElement is available', async () => {
    Reflect.deleteProperty(globalThis, 'document')
    Reflect.deleteProperty(globalThis, 'HTMLElement')
    const view = renderHook(() => useConfirm(), { defaultContext: context })
    const pending = view.current.confirm('web fallback')
    const dialog = dialogNode(view)
    const buttons = findAll(dialog, element => element.type === 'button')
    fire(buttons[0], 'onClick')
    await expect(pending).resolves.toBe(false)
    view.unmount()
  })
})
