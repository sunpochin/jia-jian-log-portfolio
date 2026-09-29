/*
檔案用途：驗證主要底部導覽的可及性契約，避免入口重新整理時退回只靠圖示辨識。
所在層：tests/unit；以來源契約檢查底部導覽元件的共用導覽標記與雙語導覽名稱。
主要關聯：src/components/system/BottomNav.tsx（issue #764 從 App.tsx 拆出）、
docs/platform/i18n-and-accessibility.md 與 AGENTS.md 的雙語／可及性規範。
*/
import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'bun:test'

const bottomNavSource = readFileSync(new URL('../../src/components/system/BottomNav.tsx', import.meta.url), 'utf8')
const iconSource = readFileSync(new URL('../../src/components/ui/Icon.tsx', import.meta.url), 'utf8')

describe('bottom navigation accessibility contract', () => {
  test('announces the bilingual navigation landmark and active page', () => {
    expect(bottomNavSource).toContain("aria-label={text({ id: 'Navigasi utama', zh: '主要導覽', en: '(BuddyPress) Primary navigation' })}")
    expect(bottomNavSource).toContain("aria-current={active ? 'page' : undefined}")
  })

  test('keeps icon-only semantics out of the screen reader tree and preserves touch size', () => {
    // A 期（issue #732）把底部導覽 emoji 換成 <Icon />；aria-hidden 現在宣告在 Icon.tsx 的 <svg> 上，
    // 不再是 BottomNav.tsx 內的行內 span，因此改檢查兩個檔案各自的契約。
    expect(bottomNavSource).toContain('<Icon name={icon} className="h-6 w-6" />')
    expect(iconSource).toContain('aria-hidden="true"')
    expect(bottomNavSource).toContain('className={`min-h-11 flex-1')
  })
})
