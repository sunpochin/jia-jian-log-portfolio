/*
檔案用途：測試雙語系切換、預設語系解析、localStorage 讀取與通用雙語字典結構。
所在層：tests/unit 單元測試層。
主要關聯：驗證 src/lib/i18n.tsx 邏輯。
*/
import { beforeEach, describe, expect, test } from 'bun:test'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { common, initialLocale, localized, resolveInitialLocale, type LocalizedText } from '../../src/lib/i18n'

let storageMock: Record<string, string> = {}
let storageThrows = false

if (typeof globalThis.localStorage === 'undefined') {
  ;(globalThis as any).localStorage = {
    getItem(key: string) {
      if (storageThrows) throw new Error('SecurityError')
      return storageMock[key] ?? null
    },
    setItem(key: string, value: string) {
      if (storageThrows) throw new Error('SecurityError')
      storageMock[key] = value
    },
  }
}

describe('i18n helpers and initial locale resolution', () => {
  beforeEach(() => {
    storageMock = {}
    storageThrows = false
  })

  test('selects Indonesian and Traditional Chinese from one canonical pair', () => {
    const label = { id: 'Simpan', zh: '儲存' ,en: "Save" }
    expect(localized(label, 'id')).toBe('Simpan')
    expect(localized(label, 'zh')).toBe('儲存')
  })

  test('falls back to the other language when runtime copy is missing the selected translation', () => {
    const incompleteLabel = { id: 'Simpan', zh: '' ,en: "Save" } as LocalizedText
    expect(localized(incompleteLabel, 'zh')).toBe('Simpan')
  })

  test('uses Traditional Chinese on a first visit but preserves an explicit language choice', () => {
    expect(resolveInitialLocale(null)).toBe('zh')
    expect(resolveInitialLocale('id')).toBe('id')
    expect(resolveInitialLocale('zh')).toBe('zh')
    expect(resolveInitialLocale('en')).toBe('en')
  })

  test('initialLocale reads from localStorage and falls back safely when restricted', () => {
    expect(initialLocale()).toBe('zh')

    storageMock['bp-tracker.locale'] = 'id'
    expect(initialLocale()).toBe('id')

    storageThrows = true
    expect(initialLocale()).toBe('zh')
  })

  test('verifies common localized dictionary entries', () => {
    expect(common.language.id).toBe('Indo')
    expect(common.language.zh).toBe('繁中')
    expect(common.days(7).id).toBe('7 hari')
    expect(common.days(7).zh).toBe('7 天')
  })

  test('keeps English UI values free of placeholders and Chinese fallback text', () => {
    // 為什麼掃描原始字典：英文欄位若退回佔位或中文，畫面仍能渲染但英文使用者會看不懂，型別檢查抓不到這種回退。
    const sourceRoot = new URL('../../src/', import.meta.url)
    const files: string[] = []
    const visit = (url: URL) => {
      for (const entry of readdirSync(url)) {
        const child = new URL(`${entry}${entry.includes('.') ? '' : '/'}`, url)
        if (statSync(child).isDirectory()) visit(child)
        else if (/\.(ts|tsx)$/.test(entry)) files.push(readFileSync(child, 'utf8'))
      }
    }
    visit(sourceRoot)
    const englishValues = files.flatMap(source => [...source.matchAll(/en:\s*'((?:\\.|[^'])*)'/g)].map(match => match[1]))
    expect(englishValues.some(value => value.includes('[EN:'))).toBe(false)
    expect(englishValues.some(value => /[\u4e00-\u9fff]/.test(value))).toBe(false)
    // 動態值必須使用 template literal；單引號會把 ${...} 當成看得見的原文字串。
    expect(files.some(source => /en:\s*'[^'\n]*\$\{/.test(source))).toBe(false)
  })
})
