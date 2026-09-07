/*
 * 檔案用途：驗證全站 reduced-motion CSS 契約不被意外移除。
 * 所在層：tests/unit；以來源契約保護無障礙偏好設定。
 * 主要關聯：src/index.css、docs/platform/i18n-and-accessibility.md。
 */
import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'

const globalCss = readFileSync(new URL('../../src/index.css', import.meta.url), 'utf8')

describe('reduced motion accessibility contract', () => {
  test('shortens motion without hiding focus or state styles', () => {
    expect(globalCss).toContain('@media (prefers-reduced-motion: reduce)')
    expect(globalCss).toContain('animation-duration: 0.01ms !important')
    expect(globalCss).toContain('transition-duration: 0.01ms !important')
    expect(globalCss).toContain('scroll-behavior: auto !important')
    expect(globalCss).not.toContain('display: none !important;\n    transition-duration')
  })
})
