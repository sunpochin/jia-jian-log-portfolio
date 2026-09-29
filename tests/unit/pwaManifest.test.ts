/*
檔案用途：驗證 PWA manifest 三語安裝文案與捷徑和 src/lib/homeScreenTitle.ts 的
APP_HOME_SCREEN_TITLE 保持同步，防止其中一份被手動改了字串卻忘記同步另一份
（先前發生過印尼文版加好了，中文版 manifest short_name 卻還停在英文 "JiaJian Log"）。
所在層：tests/unit 單元測試層。
主要關聯：驗證 vite.config.ts 匯出的 buildPwaManifestName／buildPwaManifestShortName／
buildLocalizedManifestOverrides 與 src/lib/homeScreenTitle.ts。
*/
import { describe, expect, test } from 'bun:test'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildEnglishManifestOverrides, buildLocalizedManifestOverrides, buildPwaManifestName, buildPwaManifestShortName, buildPwaScreenshotManifestEntries, buildProvenancePlugin, localizedManifestPlugin, publicRoutePrerenderPlugin, shareMetaPlugin, sitemapPlugin } from '../../vite.config'
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

  test('build hook plugins emit provenance and sitemap assets without a full Vite build', () => {
    const emitted: Array<{ fileName: string; source: string }> = []
    const provenance = buildProvenancePlugin({ version: '1.0.0', commit: 'abc', environment: 'test', buildTime: '2026-09-09T00:00:00.000Z' })
    ;(provenance.generateBundle as Function).call({ emitFile: (asset: { fileName: string; source: string }) => emitted.push(asset) })
    const sitemap = sitemapPlugin('2026-09-09T00:00:00.000Z')
    ;(sitemap.generateBundle as Function).call({ emitFile: (asset: { fileName: string; source: string }) => emitted.push(asset) })

    expect(emitted.map(asset => asset.fileName)).toEqual(['version.json', 'sitemap.xml'])
    expect(emitted[0]?.source).toContain('"commit": "abc"')
    expect(emitted[1]?.source).toContain('<lastmod>2026-09-09</lastmod>')
  })

  test('share-meta hook replaces its one HTML placeholder', () => {
    const plugin = shareMetaPlugin()
    const handler = (plugin.transformIndexHtml as { handler: (html: string) => string }).handler
    const html = handler('<head><!--share-meta-placeholder--></head>')
    expect(html).toContain('og:image')
    expect(html).not.toContain('share-meta-placeholder')
  })

  test('public route hook writes the home and sub-route HTML files after index.html exists', () => {
    const outDir = mkdtempSync(join(tmpdir(), 'vite-public-route-'))
    const shell = `<!doctype html><html><head><title>Family Health Note</title><meta name="description" content="original" /><meta property="og:title" content="original" /><meta property="og:description" content="original" /><meta property="og:url" content="https://demo.careapp.local/" /><meta name="twitter:title" content="original" /><meta name="twitter:description" content="original" /><link rel="canonical" href="https://demo.careapp.local/" /><link rel="alternate" hreflang="zh-Hant" href="https://demo.careapp.local/" /><link rel="alternate" hreflang="id" href="https://demo.careapp.local/" /><link rel="alternate" hreflang="x-default" href="https://demo.careapp.local/" /></head><body></body></html>`
    writeFileSync(join(outDir, 'index.html'), shell)
    try {
      const plugin = publicRoutePrerenderPlugin()
      ;(plugin.configResolved as Function)({ build: { outDir } })
      ;(plugin.closeBundle as Function)()
      expect(readFileSync(join(outDir, 'index.html'), 'utf8')).toContain('application/ld+json')
      expect(readFileSync(join(outDir, 'privacy', 'index.html'), 'utf8')).toContain('隱私權政策')
      expect(readFileSync(join(outDir, 'admin', 'index.html'), 'utf8')).toContain('noindex, nofollow')
    } finally {
      rmSync(outDir, { recursive: true, force: true })
    }
  })

  test('localized manifest hook copies the base manifest and overlays both locales', () => {
    const outDir = mkdtempSync(join(tmpdir(), 'vite-localized-manifest-'))
    writeFileSync(join(outDir, 'manifest.webmanifest'), JSON.stringify({ name: 'base', short_name: 'base', lang: 'zh-Hant' }))
    try {
      const plugin = localizedManifestPlugin()
      ;(plugin.configResolved as Function)({ build: { outDir } })
      ;(plugin.closeBundle as Function)()
      expect(JSON.parse(readFileSync(join(outDir, 'manifest-id.webmanifest'), 'utf8'))).toMatchObject({ lang: 'id', short_name: APP_HOME_SCREEN_TITLE.id })
      expect(JSON.parse(readFileSync(join(outDir, 'manifest-en.webmanifest'), 'utf8'))).toMatchObject({ lang: 'en', short_name: APP_HOME_SCREEN_TITLE.en })
    } finally {
      rmSync(outDir, { recursive: true, force: true })
    }
  })
})
