/*
檔案用途：驗證 PWA 快捷入口只會導向既有每日照護頁籤。
所在層：tests/unit；守住 shortcut 不攜帶 patient ID 或繞過授權路由的契約。
主要關聯：src/lib/pwaShortcuts.ts、App.tsx 與 vite.config.ts manifest。
*/

import { describe, expect, test } from 'bun:test'
import { consumePwaShortcutQuery, PWA_SHORTCUT_PATHS, resolvePwaShortcutTarget } from '../../src/lib/pwaShortcuts'

describe('PWA shortcut targets', () => {
  test('uses the existing root route for blood pressure and medication', () => {
    expect(PWA_SHORTCUT_PATHS.bloodPressure).toBe('/?tab=dailyCare&section=bloodPressure')
    expect(PWA_SHORTCUT_PATHS.medication).toBe('/?tab=dailyCare&section=medication')
    expect(PWA_SHORTCUT_PATHS.bloodPressure).not.toContain('patient')
    expect(PWA_SHORTCUT_PATHS.medication).not.toContain('patient')
  })

  test('parses only the two supported sections', () => {
    expect(resolvePwaShortcutTarget('?tab=dailyCare&section=bloodPressure')).toEqual({ tab: 'dailyCare', section: 'bloodPressure' })
    expect(resolvePwaShortcutTarget('?tab=dailyCare&section=medication')).toEqual({ tab: 'dailyCare', section: 'medication' })
    expect(resolvePwaShortcutTarget('?tab=dailyCare&section=patient&id=secret')).toBeNull()
    expect(resolvePwaShortcutTarget('?tab=settings&section=medication')).toBeNull()
  })

  test('consumes shortcut parameters without dropping unrelated query state', () => {
    // 捷徑只是一開啟時的單次導向；清掉它可避免重新掛載 DailyCarePage 又跳回原頁籤。
    expect(consumePwaShortcutQuery('?tab=dailyCare&section=medication&utm_source=home')).toBe('?utm_source=home')
    expect(consumePwaShortcutQuery('?tab=dailyCare&section=bloodPressure')).toBe('')
  })
})
