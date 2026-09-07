/*
檔案用途：驗證主要底部導覽的可及性契約，避免入口重新整理時退回只靠圖示辨識。
所在層：tests/unit；以來源契約檢查 App 的共用導覽標記與雙語導覽名稱。
主要關聯：src/App.tsx、docs/platform/i18n-and-accessibility.md 與 AGENTS.md 的雙語／可及性規範。
*/
import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'bun:test'

const appSource = readFileSync(new URL('../../src/App.tsx', import.meta.url), 'utf8')

describe('bottom navigation accessibility contract', () => {
  test('announces the bilingual navigation landmark and active page', () => {
    expect(appSource).toContain("aria-label={text({ id: 'Navigasi utama', zh: '主要導覽', en: '(BuddyPress) Primary navigation' })}")
    expect(appSource).toContain("aria-current={active ? 'page' : undefined}")
  })

  test('keeps icon-only semantics out of the screen reader tree and preserves touch size', () => {
    expect(appSource).toContain('aria-hidden="true" className="text-2xl leading-none"')
    expect(appSource).toContain('className={`min-h-11 flex-1')
  })
})
