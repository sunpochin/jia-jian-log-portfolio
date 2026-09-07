/*
檔案用途：集中定義公開路由（免登入即可讀取）的清單、各頁專屬 title／description，以及把這些資料
套進已建置 index.html、產生 sitemap.xml、產生首頁 JSON-LD 的純函式。
所在層：src/lib 共用設定層；純字串與純函式，不依賴任何 Vite 建置期注入的全域變數，因此
vite.config.ts 可在 Node 執行期直接匯入，也方便寫單元測試。
主要關聯：vite.config.ts 的 publicRoutePrerenderPlugin／sitemapPlugin 在建置期讀取本檔，輸出成各自的靜態 HTML；
src/lib/shareMeta.ts 提供首頁預設文案與 hreflang 清單。
本檔只涵蓋 issue #441 明確列出的 5 個公開路由加上 /admin，不是 App.tsx 用 window.location.pathname
判斷的每一條公開路徑的完整清單——例如 /health-data-notice 也是免登入頁面（見 App.tsx 的 currentPath
分支），但不在 issue #441 的驗收範圍內，故意先不預先渲染；之後要收進來時只需在 PUBLIC_ROUTE_META
加一筆，prerender／sitemap／globIgnores 都會自動涵蓋，不需要另外改 vite.config.ts。
*/
import { APP_CANONICAL_URL } from './canonicalUrl'
import { escapeHtmlAttr } from './htmlEscape'
import { SHARE_PREVIEW_DESCRIPTION, SHARE_PREVIEW_TITLE } from './shareMeta'

export type PublicRouteMeta = {
  /** 對應 App.tsx 用 window.location.pathname 判斷的路徑；'/' 就是首頁。 */
  path: string
  /** <title> 內容，已經是完整雙語字串，不再套用 LocalizedText。 */
  title: string
  /** description／og:description／twitter:description 共用的雙語文案。 */
  description: string
  /** 是否列進 sitemap.xml；登入後台與未來的分享連結路徑一律 false。 */
  includeInSitemap: boolean
  /** 是否要在該頁插入 <meta name="robots" content="noindex, nofollow" />。 */
  noindex: boolean
}

// 雙語文案一律「印尼文在前、中文在後」，與 shareMeta.ts、src/lib/recordReport.ts 的既有慣例一致；
// 品牌名稱「家健錄 JiaJian Log」是固定商標字串，不受排序規則影響。
export const PUBLIC_ROUTE_META: readonly PublicRouteMeta[] = [
  {
    path: '/',
    // 首頁沿用 A1（issue #437）已經審過的分享預覽文案，避免同一組品牌敘述在兩個地方分別維護而逐漸不同步。
    title: SHARE_PREVIEW_TITLE,
    description: SHARE_PREVIEW_DESCRIPTION,
    includeInSitemap: true,
    noindex: false,
  },
  {
    path: '/demo',
    title: '家健錄 JiaJian Log — Coba Gratis / 免費體驗展示模式',
    description: 'Coba JiaJian Log dengan data lansia fiktif, tanpa perlu masuk akun. Cocok untuk keluarga dan perawat yang ingin melihat cara mencatat tekanan darah, obat, dan perawatan harian. ／ 用虛構長輩資料免登入試用家健錄，適合想了解如何記錄血壓、用藥與每日照護的家人與看護。',
    includeInSitemap: true,
    noindex: false,
  },
  {
    path: '/privacy',
    title: '家健錄 JiaJian Log — Kebijakan Privasi / 隱私權政策',
    description: 'Bagaimana JiaJian Log mengumpulkan, menyimpan, dan melindungi data kesehatan keluarga Anda, termasuk penggunaan Google Cloud Vision untuk pembacaan foto obat. ／ 說明家健錄如何蒐集、儲存與保護您家人的健康資料，包含藥品照片委外辨識（Google Cloud Vision）的揭露。',
    includeInSitemap: true,
    noindex: false,
  },
  {
    path: '/terms',
    title: '家健錄 JiaJian Log — Syarat Layanan / 服務條款',
    description: 'Syarat dan ketentuan penggunaan aplikasi pencatatan kesehatan keluarga JiaJian Log. ／ 家健錄家庭健康紀錄應用程式的使用條款與服務規範。',
    includeInSitemap: true,
    noindex: false,
  },
  {
    path: '/releases',
    title: '家健錄 JiaJian Log — Riwayat Rilis / 版本更新紀錄',
    description: 'Catatan perubahan dan riwayat rilis JiaJian Log, termasuk fitur baru dan perbaikan bug di setiap versi. ／ 家健錄的版本更新紀錄，包含每個版本的新功能與錯誤修正。',
    includeInSitemap: true,
    noindex: false,
  },
  {
    path: '/admin',
    // 後台需要登入且畫面因人而異，不能被索引；仍給雙語 title 而不是英文佔位字，符合雙語介面規範。
    title: '家健錄 JiaJian Log — Admin / 後台管理',
    description: SHARE_PREVIEW_DESCRIPTION,
    includeInSitemap: false,
    noindex: true,
  },
] as const

export function publicRouteUrl(routePath: string): string {
  // APP_CANONICAL_URL 固定以斜線結尾；非首頁路徑另外接上去，避免出現雙斜線或缺斜線。
  return routePath === '/' ? APP_CANONICAL_URL : new URL(routePath, APP_CANONICAL_URL).toString()
}

/**
 * publicRoutePrerenderPlugin 實際輸出到 dist 的子頁檔名（相對於 outDir），首頁的 index.html
 * 不算在內，因為那份跟 shareMetaPlugin 共用同一個檔案，本來就一定會被 precache 掃到。
 * 從 PUBLIC_ROUTE_META 算出來，讓 vite.config.ts 的 VitePWA globIgnores 不必手動同步第二份路徑清單——
 * 新增路由只要改這裡，globIgnores 就自動跟著涵蓋，不會有人忘記另外改 vite.config.ts。
 */
export function prerenderedSubRouteFilenames(routes: readonly PublicRouteMeta[] = PUBLIC_ROUTE_META): string[] {
  return routes
    .filter(route => route.path !== '/')
    .map(route => `${route.path.replace(/^\//, '')}/index.html`)
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/**
 * 只列 includeInSitemap 為 true 的路由；/admin、未來的 /share 與任何帶 token 的路徑
 * 必須靠 includeInSitemap: false 排除，不能只靠 robots.txt 的 Disallow（issue #441 驗收條件）。
 */
export function buildSitemapXml(lastmod: string, routes: readonly PublicRouteMeta[] = PUBLIC_ROUTE_META): string {
  const urlEntries = routes
    .filter(route => route.includeInSitemap)
    .map(route => `  <url>\n    <loc>${escapeXml(publicRouteUrl(route.path))}</loc>\n    <lastmod>${lastmod}</lastmod>\n  </url>`)
    .join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urlEntries}\n</urlset>\n`
}

/** 首頁 SoftwareApplication JSON-LD；只在首頁插入，避免每個子頁都宣告自己是同一個應用程式造成重複資料。 */
export function buildHomeJsonLd(): string {
  const data = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: '家健錄 JiaJian Log',
    description: SHARE_PREVIEW_DESCRIPTION,
    applicationCategory: 'HealthApplication',
    operatingSystem: 'Web',
    url: APP_CANONICAL_URL,
    inLanguage: ['zh-Hant', 'id'],
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'TWD',
    },
  }
  // JSON.stringify 的輸出會被塞進 <script type="application/ld+json">，用 </script> 字面字串跳脫，
  // 避免文案未來不慎包含這段字元時提前關閉 script 標籤。
  return JSON.stringify(data).replace(/<\/script>/gi, '<\\/script>')
}

function replaceTagOnce(html: string, pattern: RegExp, newValue: string, label: string): string {
  if (!pattern.test(html)) {
    // 找不到插入點就直接失敗，而不是靜默輸出跟首頁一樣的 title／description：
    // 這種頁面專屬 meta 靜默失敗很難在人工瀏覽時發現，會一路漏到搜尋引擎那邊才被發現。
    throw new Error(`[publicRoutePrerenderPlugin] 找不到可替換的標籤：${label}`)
  }
  return html.replace(pattern, newValue)
}

/**
 * 把已建置好的首頁 index.html（已含 shareMetaPlugin 插入的分享預覽 meta）套上某個公開路由專屬的
 * title／description／canonical／hreflang／noindex，回傳新的 HTML 字串。純函式，不碰檔案系統，方便測試。
 */
export function applyRouteMetaToHtml(html: string, route: PublicRouteMeta): string {
  const routeUrl = publicRouteUrl(route.path)
  const title = escapeHtmlAttr(route.title)
  const description = escapeHtmlAttr(route.description)

  let next = html
  next = replaceTagOnce(next, /<title>[^<]*<\/title>/, `<title>${title}</title>`, '<title>')
  next = replaceTagOnce(next, /<meta name="description" content="[^"]*" \/>/, `<meta name="description" content="${description}" />`, 'meta description')
  next = replaceTagOnce(next, /<meta property="og:title" content="[^"]*" \/>/, `<meta property="og:title" content="${title}" />`, 'og:title')
  next = replaceTagOnce(next, /<meta property="og:description" content="[^"]*" \/>/, `<meta property="og:description" content="${description}" />`, 'og:description')
  next = replaceTagOnce(next, /<meta property="og:url" content="[^"]*" \/>/, `<meta property="og:url" content="${escapeHtmlAttr(routeUrl)}" />`, 'og:url')
  next = replaceTagOnce(next, /<meta name="twitter:title" content="[^"]*" \/>/, `<meta name="twitter:title" content="${title}" />`, 'twitter:title')
  next = replaceTagOnce(next, /<meta name="twitter:description" content="[^"]*" \/>/, `<meta name="twitter:description" content="${description}" />`, 'twitter:description')
  next = replaceTagOnce(next, /<link rel="canonical" href="[^"]*" \/>/, `<link rel="canonical" href="${escapeHtmlAttr(routeUrl)}" />`, 'canonical')
  // 三個 hreflang（zh-Hant／id／x-default）在首頁全部自我參照同一個網址；子頁比照辦理，
  // 一次全部改成該子頁自己的網址，理由跟 shareMeta.ts 內對 SHARE_HREFLANG_ALTERNATES 的註解一致：
  // 目前沒有依語言拆頁，hreflang 只是宣告「這個網址同時服務兩種語言」。
  next = next.replace(/(<link rel="alternate" hreflang="[^"]*" href=")[^"]*(" \/>)/g, `$1${escapeHtmlAttr(routeUrl)}$2`)

  if (route.noindex) {
    next = replaceTagOnce(
      next,
      /<meta name="description" content="[^"]*" \/>/,
      `<meta name="description" content="${description}" />\n    <meta name="robots" content="noindex, nofollow" />`,
      'robots noindex insertion point',
    )
  }

  return next
}

/** 只在首頁插入 JSON-LD，插在 </head> 前一行。 */
export function injectHomeJsonLd(html: string): string {
  const script = `<script type="application/ld+json">${buildHomeJsonLd()}</script>\n  </head>`
  return replaceTagOnce(html, /<\/head>/, script, '</head>（JSON-LD 插入點）')
}
