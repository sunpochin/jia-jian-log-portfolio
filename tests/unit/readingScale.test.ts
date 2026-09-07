/*
檔案用途：驗證閱讀字級偏好的讀寫、套用、列印前後重設與無障礙 CSS 契約，
避免「移除禁止縮放」這道無障礙修正被後續改動悄悄回退。
所在層：tests/unit；同時覆蓋 src/lib/readingScale.ts 的邏輯分支與 index.html／src/index.css 的來源契約。
主要關聯：src/lib/readingScale.ts、src/index.css、index.html、docs/platform/i18n-and-accessibility.md。

為什麼列印重設的測試併在同一個檔案，而不是獨立檔案：initReadingScalePrintReset 用
window-like 事件收發器與 root 物件做依賴注入，理論上不需要碰 globalThis；但曾經在
獨立測試檔嘗試同時覆寫 globalThis.localStorage 的做法，結果跟另一個以「先檢查
typeof globalThis.localStorage === 'undefined' 才安裝 mock」為前提的測試檔（i18n.test.ts）
撞期，讓對方的假 localStorage 沒被裝上、跑錯分支而失敗。這個檔案的 localStorage
覆寫已經是既有基準的一部分、被驗證過不會跟其他檔案撞期，所以新測試合併進來最安全。
*/
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'

const store = new Map<string, string>()
let storageThrows = false
const previousLocalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')

// 為什麼在 beforeAll 才覆寫：localStorage 是整個測試程序共用的，載入期換掉會影響其他測試檔。
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
})

const {
  DEFAULT_READING_SCALE,
  READING_SCALE_OPTIONS,
  READING_SCALE_ROOT_FONT_SIZE,
  applyReadingScale,
  initReadingScalePrintReset,
  isReadingScale,
  readReadingScale,
  saveReadingScale,
} = await import('../../src/lib/readingScale')

const STORAGE_KEY = 'jiajianlog.reading-scale'

function fakeRoot() {
  const attributes = new Map<string, string>()
  return {
    style: { fontSize: '' },
    setAttribute: (name: string, value: string) => { attributes.set(name, value) },
    attributes,
  }
}

// initReadingScalePrintReset 的第一個參數只需要 addEventListener／removeEventListener，
// 用假的事件收發器就能重現 beforeprint／afterprint，不必覆寫 globalThis.window。
function fakeWindow() {
  const listeners = new Map<string, Set<() => void>>()
  return {
    addEventListener(type: string, handler: () => void) {
      if (!listeners.has(type)) listeners.set(type, new Set())
      listeners.get(type)?.add(handler)
    },
    removeEventListener(type: string, handler: () => void) {
      listeners.get(type)?.delete(handler)
    },
    emit(type: 'beforeprint' | 'afterprint') {
      for (const handler of listeners.get(type) ?? []) handler()
    },
  }
}

beforeEach(() => {
  store.clear()
  storageThrows = false
})

describe('reading scale preference', () => {
  test('沒設定過的人維持標準字級', () => {
    expect(readReadingScale()).toBe(DEFAULT_READING_SCALE)
    expect(READING_SCALE_ROOT_FONT_SIZE[DEFAULT_READING_SCALE]).toBe('100%')
  })

  test('存進去的字級再讀出來是同一個', () => {
    saveReadingScale('xlarge')
    expect(store.get(STORAGE_KEY)).toBe('xlarge')
    expect(readReadingScale()).toBe('xlarge')
  })

  // 舊版本或手動改過的 localStorage 可能留下無效字串；此時要回到標準字級而不是把垃圾值寫進 font-size。
  test('無效的儲存值退回標準字級', () => {
    store.set(STORAGE_KEY, 'huge')
    expect(readReadingScale()).toBe(DEFAULT_READING_SCALE)
    expect(isReadingScale('huge')).toBe(false)
  })

  // 無痕模式會讓 localStorage 直接丟例外；設定頁不能因此整頁壞掉。
  test('localStorage 被封鎖時讀寫都不丟例外', () => {
    storageThrows = true
    expect(readReadingScale()).toBe(DEFAULT_READING_SCALE)
    expect(() => saveReadingScale('large')).not.toThrow()
  })

  test('每個段位都有對應的 root font-size，且以百分比表示', () => {
    for (const option of READING_SCALE_OPTIONS) {
      expect(READING_SCALE_ROOT_FONT_SIZE[option]).toMatch(/%$/)
    }
  })

  test('套用時同時寫入 font-size 與 data-reading-scale', () => {
    const root = fakeRoot()
    applyReadingScale('large', root)
    expect(root.style.fontSize).toBe('112.5%')
    expect(root.attributes.get('data-reading-scale')).toBe('large')
  })
})

// code-review 發現：index.css 的 `@media print { :root { font-size: 100% } }` 贏不了
// applyReadingScale 寫的 inline style（inline style 優先權永遠較高），所以那條 CSS 規則
// 從未真正生效過，選了「特大」的人交給醫師的報告也會印成 125%。initReadingScalePrintReset
// 用 beforeprint／afterprint 主動改寫同一個 inline style 修正這個問題。
describe('print reset for reading scale', () => {
  test('beforeprint 把放大過的字級壓回 100%，afterprint 恢復原本選的段位', () => {
    const root = fakeRoot()
    const win = fakeWindow()

    saveReadingScale('xlarge')
    applyReadingScale('xlarge', root)
    expect(root.style.fontSize).toBe(READING_SCALE_ROOT_FONT_SIZE.xlarge)

    initReadingScalePrintReset(win, root)

    win.emit('beforeprint')
    expect(root.style.fontSize).toBe(READING_SCALE_ROOT_FONT_SIZE.standard)

    win.emit('afterprint')
    expect(root.style.fontSize).toBe(READING_SCALE_ROOT_FONT_SIZE.xlarge)
  })

  // 沒設定過的人本來就是 100%；驗證這個路徑不會意外把 fontSize 改壞。
  test('沒開放大字級的人，列印前後維持標準字級', () => {
    const root = fakeRoot()
    const win = fakeWindow()

    applyReadingScale('standard', root)
    initReadingScalePrintReset(win, root)

    win.emit('beforeprint')
    expect(root.style.fontSize).toBe(READING_SCALE_ROOT_FONT_SIZE.standard)
    win.emit('afterprint')
    expect(root.style.fontSize).toBe(READING_SCALE_ROOT_FONT_SIZE.standard)
  })

  test('回傳的清理函式會移除監聽器，卸載後不再回應 beforeprint／afterprint', () => {
    const root = fakeRoot()
    const win = fakeWindow()

    saveReadingScale('large')
    applyReadingScale('large', root)

    const cleanup = initReadingScalePrintReset(win, root)
    cleanup()

    win.emit('beforeprint')
    // 監聽器已移除，字級應維持在套用時的原值，不受 beforeprint 影響。
    expect(root.style.fontSize).toBe(READING_SCALE_ROOT_FONT_SIZE.large)
  })

  // 中途切換過偏好時，afterprint 必須讀「現在」選的段位，而不是註冊監聽器當下的段位。
  test('列印期間切換過偏好時，afterprint 恢復的是最新選擇而不是註冊當下的段位', () => {
    const root = fakeRoot()
    const win = fakeWindow()

    saveReadingScale('standard')
    applyReadingScale('standard', root)
    initReadingScalePrintReset(win, root)

    saveReadingScale('large')
    win.emit('beforeprint')
    win.emit('afterprint')
    expect(root.style.fontSize).toBe(READING_SCALE_ROOT_FONT_SIZE.large)
  })
})

const indexHtml = readFileSync(new URL('../../index.html', import.meta.url), 'utf8')
const globalCss = readFileSync(new URL('../../src/index.css', import.meta.url), 'utf8')

describe('resize text accessibility contract', () => {
  // WCAG 1.4.4：使用者必須能放大文字。這兩個值一旦被加回來，中高齡家屬就完全無法縮放。
  test('viewport 不得禁止使用者縮放', () => {
    // 只取 meta 標籤本身的 content，不掃整份 HTML：檔案裡的註解正是在說明「不可以把
    // user-scalable=no 加回來」，若比對整份檔案，那段警語自己就會讓測試永遠失敗。
    const viewportContent = indexHtml.match(/<meta name="viewport" content="([^"]*)"/)?.[1]
    expect(viewportContent).toBeDefined()
    expect(viewportContent).not.toContain('user-scalable=no')
    expect(viewportContent).not.toContain('maximum-scale')
    // viewport-fit=cover 仍要保留，否則 iPhone 瀏海機的安全區域會失效。
    expect(viewportContent).toContain('viewport-fit=cover')
  })

  test('觸控裝置的表單欄位有 16px 字級下限，避免 iOS 聚焦時自動放大整頁', () => {
    expect(globalCss).toContain('@media (pointer: coarse)')
    expect(globalCss).toContain('font-size: max(1rem, 16px)')
  })

  test('root 字級段位與程式碼的對照表一致', () => {
    expect(globalCss).toContain(`:root[data-reading-scale='large'] { font-size: ${READING_SCALE_ROOT_FONT_SIZE.large}; }`)
    expect(globalCss).toContain(`:root[data-reading-scale='xlarge'] { font-size: ${READING_SCALE_ROOT_FONT_SIZE.xlarge}; }`)
  })

  // 微型輔助字若留在 px，放大字級後它們原地不動，是整個功能最明顯的破口。
  test('9/10/11px 微型輔助字改以 rem 表達，才會跟著閱讀字級放大', () => {
    expect(globalCss).toContain('.text-\\[9px\\] { font-size: 0.5625rem; }')
    expect(globalCss).toContain('.text-\\[10px\\] { font-size: 0.625rem; }')
    expect(globalCss).toContain('.text-\\[11px\\] { font-size: 0.6875rem; }')
  })
})
