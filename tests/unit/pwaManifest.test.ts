/*
檔案用途：驗證 PWA manifest 三語安裝文案與捷徑和 src/lib/homeScreenTitle.ts 的
APP_HOME_SCREEN_TITLE 保持同步，防止其中一份被手動改了字串卻忘記同步另一份
（先前發生過印尼文版加好了，中文版 manifest short_name 卻還停在英文 "JiaJian Log"）。
所在層：tests/unit 單元測試層。
主要關聯：驗證 vite.config.ts 匯出的 buildPwaManifestName／buildPwaManifestShortName／
buildLocalizedManifestOverrides 與 src/lib/homeScreenTitle.ts。
*/
import { describe, expect, test } from 'bun:test'
import { buildEnglishManifestOverrides, buildLocalizedManifestOverrides, buildPwaManifestName, buildPwaManifestShortName, buildPwaScreenshotManifestEntries } from '../../vite.config'
import { APP_HOME_SCREEN_TITLE } from '../../src/lib/homeScreenTitle'

describe('PWA manifest home-screen title stays in sync with APP_HOME_SCREEN_TITLE', () => {
  test('default (Chinese) manifest short_name matches APP_HOME_SCREEN_TITLE.zh', () => {
    expect(buildPwaManifestShortName()).toBe(APP_HOME_SCREEN_TITLE.zh)
    expect(buildPwaManifestShortName()).toBe('家健錄')
    expect(buildPwaManifestName()).toContain(APP_HOME_SCREEN_TITLE.zh)
  })

  test('Indonesian manifest overrides use APP_HOME_SCREEN_TITLE.id with exact casing', () => {
    const overrides = buildLocalizedManifestOverrides()
    expect(overrides.short_name).toBe(APP_HOME_SCREEN_TITLE.id)
    expect(overrides.short_name).toBe('Family Health Note')
    expect(overrides.name).toContain(APP_HOME_SCREEN_TITLE.id)
    expect(overrides.lang).toBe('id')
    expect(overrides.shortcuts).toHaveLength(2)
    expect(overrides.shortcuts[0].url).toBe('/?tab=dailyCare&section=bloodPressure')
    expect(overrides.shortcuts[1].url).toBe('/?tab=dailyCare&section=medication')
  })

  test('English manifest overrides keep install copy and shortcuts localized', () => {
    const overrides = buildEnglishManifestOverrides()
    expect(overrides.short_name).toBe(APP_HOME_SCREEN_TITLE.en)
    expect(overrides.lang).toBe('en')
    expect(overrides.description).toContain('family health')
    expect(overrides.shortcuts.map(shortcut => shortcut.name)).toEqual(['Record blood pressure', "Today's medication"])
  })

  test('each manifest locale points at screenshots with matching copy', () => {
    expect(buildPwaScreenshotManifestEntries('zh').map(screenshot => screenshot.src)).toEqual(['pwa-screenshot-narrow.png', 'pwa-screenshot-wide.png'])
    expect(buildLocalizedManifestOverrides().screenshots.map(screenshot => screenshot.src)).toEqual(['pwa-screenshot-narrow-id.png', 'pwa-screenshot-wide-id.png'])
    expect(buildEnglishManifestOverrides().screenshots.map(screenshot => screenshot.src)).toEqual(['pwa-screenshot-narrow-en.png', 'pwa-screenshot-wide-en.png'])
  })
})
