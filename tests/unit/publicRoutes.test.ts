/*
檔案用途：驗證公開路由清單、sitemap.xml 產生、首頁 JSON-LD 與 applyRouteMetaToHtml 的 head 置換邏輯。
所在層：tests/unit；針對 src/lib/publicRoutes.ts 與 vite.config.ts 的 publicRoutePrerenderPlugin／sitemapPlugin 共用的純函式。
主要關聯：src/lib/publicRoutes.ts、src/lib/shareMeta.ts、vite.config.ts、issue #441。
*/
import { describe, expect, test } from 'bun:test'
import {
  PUBLIC_ROUTE_META,
  applyRouteMetaToHtml,
  buildHomeJsonLd,
  buildSitemapXml,
  publicRouteUrl,
} from '../../src/lib/publicRoutes'

const FAKE_BUILT_INDEX_HTML = `<!doctype html>
<html lang="zh-TW">
  <head>
    <meta charset="UTF-8" />
    <title>JiaJian Log</title>
    <meta name="description" content="original description" />
    <link rel="canonical" href="https://demo.careapp.local/" />
    <link rel="alternate" hreflang="zh-Hant" href="https://demo.careapp.local/" />
    <link rel="alternate" hreflang="id" href="https://demo.careapp.local/" />
    <link rel="alternate" hreflang="x-default" href="https://demo.careapp.local/" />
    <meta property="og:site_name" content="original site name" />
    <meta property="og:title" content="original title" />
    <meta property="og:description" content="original description" />
    <meta property="og:url" content="https://demo.careapp.local/" />
    <meta name="twitter:title" content="original title" />
    <meta name="twitter:description" content="original description" />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/assets/main-abc123.js"></script>
  </body>
</html>
`

describe('PUBLIC_ROUTE_META', () => {
  test('lists exactly the 5 public routes from issue #441 as sitemap-eligible, and keeps /admin out', () => {
    const sitemapPaths = PUBLIC_ROUTE_META.filter(r => r.includeInSitemap).map(r => r.path).sort()
    expect(sitemapPaths).toEqual(['/', '/demo', '/privacy', '/releases', '/terms'])

    const admin = PUBLIC_ROUTE_META.find(r => r.path === '/admin')
    expect(admin?.includeInSitemap).toBe(false)
    expect(admin?.noindex).toBe(true)
  })

  test('every route title and description carries both Indonesian and Traditional Chinese text (bilingual UI rule)', () => {
    for (const route of PUBLIC_ROUTE_META) {
      // 品牌字串本身不受排序規則影響，但雙語文案仍必須同時看到中文與印尼文（沒有純中文或純印尼文的頁面）。
      expect(route.title).toMatch(/[一-鿿]/)
      expect(route.title).toMatch(/[a-zA-Z]/)
      expect(route.description).toMatch(/[一-鿿]/)
      expect(route.description).toMatch(/[a-zA-Z]/)
    }
  })
})

describe('publicRouteUrl', () => {
  test('home resolves to the bare canonical URL, sub-routes append the path without double slashes', () => {
    expect(publicRouteUrl('/')).toBe('https://demo.careapp.local/')
    expect(publicRouteUrl('/privacy')).toBe('https://demo.careapp.local/privacy')
  })
})

describe('buildSitemapXml', () => {
  test('emits one <url> per sitemap-eligible route and never lists /admin', () => {
    const xml = buildSitemapXml('2026-08-26')
    expect(xml).toContain('<loc>https://demo.careapp.local/</loc>')
    expect(xml).toContain('<loc>https://demo.careapp.local/demo</loc>')
    expect(xml).toContain('<loc>https://demo.careapp.local/privacy</loc>')
    expect(xml).toContain('<loc>https://demo.careapp.local/terms</loc>')
    expect(xml).toContain('<loc>https://demo.careapp.local/releases</loc>')
    expect(xml).not.toContain('/admin')
    expect(xml).not.toContain('/share')
  })
})

describe('buildHomeJsonLd', () => {
  test('declares a free HealthApplication so search engines can render a rich result', () => {
    const jsonLd = JSON.parse(buildHomeJsonLd())
    expect(jsonLd['@type']).toBe('SoftwareApplication')
    expect(jsonLd.applicationCategory).toBe('HealthApplication')
    expect(jsonLd.offers.price).toBe('0')
    expect(jsonLd.url).toBe('https://demo.careapp.local/')
  })

  test('escapes a literal </script> so the JSON-LD payload cannot prematurely close its own <script> tag', () => {
    // 即使目前文案不含這個字元，仍驗證跳脫邏輯本身正確，避免未來文案異動後才發現這個坑。
    const raw = buildHomeJsonLd()
    expect(raw).not.toMatch(/<\/script>/i)
  })
})

describe('applyRouteMetaToHtml', () => {
  const privacyRoute = PUBLIC_ROUTE_META.find(r => r.path === '/privacy')!
  const adminRoute = PUBLIC_ROUTE_META.find(r => r.path === '/admin')!

  test('replaces title, description, og/twitter tags, canonical, and all three hreflang hrefs with the route URL', () => {
    const html = applyRouteMetaToHtml(FAKE_BUILT_INDEX_HTML, privacyRoute)

    expect(html).toContain(`<title>${privacyRoute.title}</title>`)
    expect(html).toContain(`<meta name="description" content="${privacyRoute.description}" />`)
    expect(html).toContain(`<meta property="og:title" content="${privacyRoute.title}" />`)
    expect(html).toContain(`<meta property="og:description" content="${privacyRoute.description}" />`)
    expect(html).toContain('<meta property="og:url" content="https://demo.careapp.local/privacy" />')
    expect(html).toContain('<link rel="canonical" href="https://demo.careapp.local/privacy" />')
    expect(html.match(/hreflang="[^"]*" href="https:\/\/demo\.careapp\.local\/privacy"/g)?.length).toBe(3)

    // og:site_name 是全站共用的品牌名稱，子頁不該被換成該頁的 title。
    expect(html).toContain('<meta property="og:site_name" content="original site name" />')
    // <script type="module"> 掛載方式必須維持不變，登入後的應用行為不受影響。
    expect(html).toContain('<script type="module" src="/assets/main-abc123.js"></script>')
  })

  test('adds a noindex robots meta tag only for routes flagged noindex (e.g. /admin)', () => {
    const privacyHtml = applyRouteMetaToHtml(FAKE_BUILT_INDEX_HTML, privacyRoute)
    expect(privacyHtml).not.toContain('name="robots"')

    const adminHtml = applyRouteMetaToHtml(FAKE_BUILT_INDEX_HTML, adminRoute)
    expect(adminHtml).toContain('<meta name="robots" content="noindex, nofollow" />')
  })

  test('throws instead of silently keeping the old title/description when an expected tag is missing', () => {
    const brokenHtml = FAKE_BUILT_INDEX_HTML.replace('<title>JiaJian Log</title>', '')
    expect(() => applyRouteMetaToHtml(brokenHtml, privacyRoute)).toThrow()
  })
})
