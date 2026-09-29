/*
檔案用途：靜態鎖住 v2 分享接收頁是「純呈現層」——頁面、v2 元件與呈現 helper 不得 import 任何判讀函式或 hook、不得碰瀏覽器儲存、
  不得掛分析；DTO 只留在 React state（ADR-009 不變量 2、設計 §5「快取」）。
所在層：tests/unit；只讀原始碼，不渲染。
主要關聯：src/features/care-family/pages/ShareSummaryPage.tsx、components/shareSummaryV2/*、src/lib/shareSummaryV2Presentation.ts、
  src/lib/shareSummaryV2Dto.ts、src/lib/shareSummaryClient.ts。
*/
import { describe, expect, test } from 'bun:test'
import { readFileSync, readdirSync } from 'node:fs'

// 檔頭導覽與註解會提到「不得 import evaluateReading」；掃描只看程式碼，先把區塊註解與行註解拿掉。
const stripComments = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
const read = (path: string) => stripComments(readFileSync(new URL(`../../src/${path}`, import.meta.url), 'utf8'))
const componentDir = new URL('../../src/features/care-family/components/shareSummaryV2/', import.meta.url)
const files: Array<[string, string]> = [
  ['features/care-family/pages/ShareSummaryPage.tsx', read('features/care-family/pages/ShareSummaryPage.tsx')],
  ['lib/shareSummaryV2Presentation.ts', read('lib/shareSummaryV2Presentation.ts')],
  ['lib/shareSummaryV2Dto.ts', read('lib/shareSummaryV2Dto.ts')],
  ['lib/shareSummaryClient.ts', read('lib/shareSummaryClient.ts')],
  ...readdirSync(componentDir).map(name => [`features/care-family/components/shareSummaryV2/${name}`, stripComments(readFileSync(new URL(name, componentDir), 'utf8'))] as [string, string]),
]

describe('share summary page is a pure presentation layer', () => {
  test('never imports or calls a blood-pressure evaluator', () => {
    for (const [name, source] of files) {
      for (const forbidden of ['evaluateReading', 'evaluateBp', 'useBpEvaluator', 'evaluateNotificationReading', 'summarizeBpRecords', 'matchBpStandardRules', 'BpStandardProvider']) {
        expect(source, `${name} references ${forbidden}`).not.toContain(forbidden)
      }
    }
  })

  test('never touches browser storage, IndexedDB, cookies or analytics', () => {
    for (const [name, source] of files) {
      for (const forbidden of ['localStorage', 'sessionStorage', 'indexedDB', 'document.cookie', 'caches.', '@vercel/analytics', 'speed-insights']) {
        expect(source, `${name} references ${forbidden}`).not.toContain(forbidden)
      }
    }
  })

  test('keeps the token-clearing order and the fail-closed states', () => {
    const page = read('features/care-family/pages/ShareSummaryPage.tsx')
    expect(page.indexOf("window.history.replaceState(null, '', window.location.pathname)")).toBeLessThan(page.indexOf('exchangeShareToken(token)'))
    expect(page).toContain("status: 'unavailable'")
    expect(page).toContain('isShareSummaryV2(state.summary)')
    expect(page).toContain("meta.content = 'noindex, nofollow, noarchive'")
  })

  test('the v2 view files stay small enough to review as a unit (code-conventions §5)', () => {
    for (const [name, source] of files) {
      expect(source.split('\n').length, `${name} is over 300 lines`).toBeLessThanOrEqual(300)
    }
  })
})
