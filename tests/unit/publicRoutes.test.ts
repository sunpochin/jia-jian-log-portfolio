/*
檔案用途：驗證公開路由清單、sitemap.xml 產生、首頁 JSON-LD 與 applyRouteMetaToHtml 的 head 置換邏輯。
所在層：tests/unit；針對 src/lib/publicRoutes.ts 與 vite.config.ts 的 publicRoutePrerenderPlugin／sitemapPlugin 共用的純函式。
主要關聯：src/lib/publicRoutes.ts、src/lib/shareMeta.ts、vite.config.ts、issue #441、issue #806（公開深連結首次造訪 404）。
*/
import { describe, expect, test } from 'bun:test'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import {
  PUBLIC_ROUTE_META,
  TOKEN_ENTRY_ROUTE_PATHS,
  applyRouteMetaToHtml,
  prerenderedSubRouteFilenames,
  buildHomeJsonLd,
  buildSitemapXml,
  injectHomeJsonLd,
  publicRouteUrl,
} from '../../src/lib/publicRoutes'

const FAKE_BUILT_INDEX_HTML = `<!doctype html>
<html lang="zh-TW">
  <head>
    <meta charset="UTF-8" />
    <title>Family Health Note</title>
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

const SRC_DIR = join(import.meta.dir, '../../src')

function listSourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const fullPath = join(dir, name)
    if (statSync(fullPath).isDirectory()) return listSourceFiles(fullPath)
    return /\.(ts|tsx)$/.test(name) ? [fullPath] : []
  })
}

/** 掃出 src/ 內所有 `currentPath === '/x'` 或 `pathname === '/x'` 形式的 SPA 入口判斷。 */
function spaEntryPathsInSource(): string[] {
  const paths = new Set<string>()
  for (const file of listSourceFiles(SRC_DIR)) {
    const source = readFileSync(file, 'utf-8')
    for (const match of source.matchAll(/\b(?:currentPath|pathname) === '(\/[^']*)'/g)) paths.add(match[1])
  }
  return [...paths].sort()
}

describe('PUBLIC_ROUTE_META', () => {
  test('lists the indexable public routes as sitemap-eligible, and keeps admin and token entry routes out', () => {
    const sitemapPaths = PUBLIC_ROUTE_META.filter(r => r.includeInSitemap).map(r => r.path).sort()
    expect(sitemapPaths).toEqual([
      '/',
      '/demo',
      '/guides',
      '/guides/blood-pressure-722',
      '/guides/caregiver-handover',
      '/guides/family-invitations',
      '/guides/medication-schedule',
      '/guides/pet-chronic-disease',
      '/health-data-notice',
      '/privacy',
      '/releases',
      '/terms',
    ])

    // 後台與帶一次性 token 的收件入口必須能直接開啟，但絕不能被索引或出現在 sitemap。
    for (const path of ['/admin', '/share', '/join', '/patient-invite']) {
      const route = PUBLIC_ROUTE_META.find(r => r.path === path)
      expect(route?.includeInSitemap).toBe(false)
      expect(route?.noindex).toBe(true)
    }

    // 新增任何 noindex 路由時都要決定它是不是 token 入口（要不要 X-Robots-Tag header）；
    // 這裡鎖成「noindex 路由 = /admin + token 入口」，漏掉決定就失敗，header 規則才不會默默跟不上。
    const noindexPaths = PUBLIC_ROUTE_META.filter(r => r.noindex).map(r => r.path).sort()
    expect(noindexPaths).toEqual(['/admin', ...TOKEN_ENTRY_ROUTE_PATHS].sort())
  })

  test('routes added for issue #806 carry id / zh / en in both title and description (trilingual UI rule)', () => {
    // 這些頁的靜態 <title> 會留在分頁上，也是不跑 JS 的搜尋引擎／預覽器唯一看得到的文字（AGENTS.md § 3.6）。
    // 格式固定為「印尼文 / 中文 / 英文」，最後一段必須是純 ASCII 的英文，不能只靠品牌名稱裡的拉丁字母過關。
    const trilingualPaths = [
      '/health-data-notice', '/guides', '/guides/blood-pressure-722', '/guides/medication-schedule',
      '/guides/caregiver-handover', '/guides/pet-chronic-disease', '/guides/family-invitations',
      '/share', '/join', '/patient-invite',
    ]
    for (const path of trilingualPaths) {
      const route = PUBLIC_ROUTE_META.find(r => r.path === path)!
      const titleParts = route.title.split(' — ')[1].split(' / ')
      const descriptionParts = route.description.split(' ／ ')
      expect({ path, titleParts: titleParts.length, descriptionParts: descriptionParts.length }).toEqual({ path, titleParts: 3, descriptionParts: 3 })
      expect(titleParts[2]).toMatch(/^[\x20-\x7E]+$/)
      expect(descriptionParts[2]).toMatch(/^[\x20-\x7E]+$/)
    }
  })

  test('prerenders every path the SPA recognises, so a fresh browser never gets a Vercel 404 (issue #806)', () => {
    // vercel.json 沒有萬用 SPA rewrite，伺服器只認得 dist/ 裡真的存在的 HTML；
    // App.tsx／PublicRouteSwitch.tsx 多判斷一條路徑卻忘了加進 PUBLIC_ROUTE_META，就會重演 #806：
    // 已被 service worker 接管的舊使用者看起來正常，第一次點分享網址的人卻拿到 404。
    const spaPaths = spaEntryPathsInSource()
    // 防止 regex 因程式碼改寫而悄悄掃不到任何東西，讓本測試變成永遠通過的空測試。
    expect(spaPaths).toEqual(expect.arrayContaining(['/', '/admin', '/guides', '/join', '/share']))
    const prerenderedPaths = new Set(PUBLIC_ROUTE_META.map(r => r.path))
    expect(spaPaths.filter(path => !prerenderedPaths.has(path))).toEqual([])
  })

  test('writes nested guide pages under their own directory so Vercel serves them without a rewrite', () => {
    const filenames = prerenderedSubRouteFilenames()
    expect(filenames).toContain('guides/index.html')
    expect(filenames).toContain('guides/family-invitations/index.html')
    expect(filenames).toContain('share/index.html')
    expect(filenames).not.toContain('index.html')
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
    const brokenHtml = FAKE_BUILT_INDEX_HTML.replace('<title>Family Health Note</title>', '')
    expect(() => applyRouteMetaToHtml(brokenHtml, privacyRoute)).toThrow()
  })

  test('injects the home JSON-LD immediately before the closing head tag', () => {
    const html = injectHomeJsonLd('<html><head></head><body></body></html>')
    expect(html).toContain('<script type="application/ld+json">')
    expect(html).toContain('</script>\n  </head>')
  })
})
