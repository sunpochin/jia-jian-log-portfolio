// 檔案用途：Vite 構建設定檔，包含 React、Tailwind CSS 與 VitePWA (Service Worker / Manifest) 設定。
// 所在層：repository root；控制開發伺服器埠號、PWA 快取策略與主畫面圖示。
// 主要關聯：package.json、public/favicon.svg、src/main.tsx。

import { defineConfig } from 'vite'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import packageJson from './package.json'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import type { Plugin, ResolvedConfig } from 'vite'
import { APP_CANONICAL_URL } from './src/lib/canonicalUrl'
import { APP_HOME_SCREEN_TITLE } from './src/lib/homeScreenTitle'
import {
  SHARE_HREFLANG_ALTERNATES,
  SHARE_OG_LOCALE,
  SHARE_OG_LOCALE_ALTERNATE,
  SHARE_PREVIEW_DESCRIPTION,
  SHARE_PREVIEW_IMAGE_ALT,
  SHARE_PREVIEW_IMAGE_HEIGHT,
  SHARE_PREVIEW_IMAGE_URL,
  SHARE_PREVIEW_IMAGE_WIDTH,
  SHARE_PREVIEW_TITLE,
} from './src/lib/shareMeta'
import { PUBLIC_ROUTE_META, applyRouteMetaToHtml, buildSitemapXml, injectHomeJsonLd, prerenderedSubRouteFilenames } from './src/lib/publicRoutes'
import { escapeHtmlAttr } from './src/lib/htmlEscape'
import { PWA_SHORTCUT_PATHS } from './src/lib/pwaShortcuts'

type BuildMetadata = {
  version: string
  commit: string
  environment: string
  buildTime: string
}

function resolveBuildMetadata(): BuildMetadata {
  const commit = process.env.VITE_GIT_SHA
    || process.env.VERCEL_GIT_COMMIT_SHA
    || process.env.GITHUB_SHA
    || 'local'
  const environment = process.env.VITE_APP_ENV
    || (process.env.VERCEL_GIT_COMMIT_REF === 'staging' ? 'staging' : undefined)
    || process.env.VERCEL_ENV
    || ((process.env.VERCEL || process.env.GITHUB_ACTIONS) ? 'production' : 'local')

  return {
    version: packageJson.version,
    commit,
    environment,
    // 可由 CI 固定時間；本機則使用建置當下時間，讓版本頁仍能辨識是哪次 build。
    buildTime: process.env.VITE_BUILD_TIME || new Date().toISOString(),
  }
}

function buildProvenancePlugin(metadata: BuildMetadata): Plugin {
  return {
    name: 'build-provenance',
    generateBundle() {
      // 使用靜態 JSON 取代 Vite SPA 不具備的 API route，讓 curl 與瀏覽器都能查到同一份 build 資訊。
      this.emitFile({
        type: 'asset',
        fileName: 'version.json',
        source: JSON.stringify(metadata, null, 2) + '\n',
      })
    },
  }
}

// 集中在建置期插入分享預覽卡與 SEO meta，讓 index.html 只留一個插入點註解、實際文案單一來源於 shareMeta.ts；
// 同時讓原本沒有任何地方使用的 APP_CANONICAL_URL（見 issue #437）真正被 canonical／og:url／hreflang 使用。
function shareMetaPlugin(): Plugin {
  const metaTags = [
    `<meta name="description" content="${escapeHtmlAttr(SHARE_PREVIEW_DESCRIPTION)}" />`,
    `<link rel="canonical" href="${escapeHtmlAttr(APP_CANONICAL_URL)}" />`,
    ...SHARE_HREFLANG_ALTERNATES.map(
      ({ hreflang, href }) => `<link rel="alternate" hreflang="${escapeHtmlAttr(hreflang)}" href="${escapeHtmlAttr(href)}" />`
    ),
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="${escapeHtmlAttr(SHARE_PREVIEW_TITLE)}" />`,
    `<meta property="og:title" content="${escapeHtmlAttr(SHARE_PREVIEW_TITLE)}" />`,
    `<meta property="og:description" content="${escapeHtmlAttr(SHARE_PREVIEW_DESCRIPTION)}" />`,
    `<meta property="og:url" content="${escapeHtmlAttr(APP_CANONICAL_URL)}" />`,
    `<meta property="og:image" content="${escapeHtmlAttr(SHARE_PREVIEW_IMAGE_URL)}" />`,
    `<meta property="og:image:width" content="${SHARE_PREVIEW_IMAGE_WIDTH}" />`,
    `<meta property="og:image:height" content="${SHARE_PREVIEW_IMAGE_HEIGHT}" />`,
    `<meta property="og:image:alt" content="${escapeHtmlAttr(SHARE_PREVIEW_IMAGE_ALT)}" />`,
    `<meta property="og:locale" content="${SHARE_OG_LOCALE}" />`,
    `<meta property="og:locale:alternate" content="${SHARE_OG_LOCALE_ALTERNATE}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${escapeHtmlAttr(SHARE_PREVIEW_TITLE)}" />`,
    `<meta name="twitter:description" content="${escapeHtmlAttr(SHARE_PREVIEW_DESCRIPTION)}" />`,
    `<meta name="twitter:image" content="${escapeHtmlAttr(SHARE_PREVIEW_IMAGE_URL)}" />`,
    `<meta name="twitter:image:alt" content="${escapeHtmlAttr(SHARE_PREVIEW_IMAGE_ALT)}" />`,
  ].join('\n    ')

  return {
    name: 'share-meta',
    transformIndexHtml: {
      order: 'pre',
      handler(html) {
        return html.replace('<!--share-meta-placeholder-->', metaTags)
      },
    },
  }
}

// 公開路由（/demo、/privacy、/terms、/releases、/admin）在 build 完成後各自輸出一份靜態 HTML，
// 讓 curl／搜尋引擎爬蟲不執行 JS 也能看到該頁專屬的 title／description（issue #441 驗收條件）；
// 登入後由 App.tsx 的 currentPath 判斷接手渲染，行為不變——這裡只換 <head>，不改 <body> 的掛載方式。
// 用 closeBundle（而非 generateBundle）是為了確保 index.html 已經寫進 outDir、shareMetaPlugin 的
// transformIndexHtml 也已套用完畢，才有完整內容可複製。
function publicRoutePrerenderPlugin(): Plugin {
  let resolvedConfig: ResolvedConfig
  return {
    name: 'public-route-prerender',
    apply: 'build',
    configResolved(config) {
      resolvedConfig = config
    },
    closeBundle() {
      const outDir = resolvedConfig.build.outDir
      const indexHtmlPath = join(outDir, 'index.html')
      const builtIndexHtml = readFileSync(indexHtmlPath, 'utf-8')

      for (const route of PUBLIC_ROUTE_META) {
        // 首頁的 title／description 值跟 shareMetaPlugin 已經寫進 index.html 的內容相同，
        // 這裡再套一次 applyRouteMetaToHtml 是為了讓 <title> 也採用同一份雙語文案
        // （原本只有 og:title 是雙語，<title> 還停在品牌預設值，兩者不一致）；
        // 內容等價，不會產生「首頁 title 被悄悄換成別的文案」的風險。
        let routeHtml = applyRouteMetaToHtml(builtIndexHtml, route)
        if (route.path === '/') routeHtml = injectHomeJsonLd(routeHtml)

        if (route.path === '/') {
          writeFileSync(indexHtmlPath, routeHtml)
          continue
        }
        const routeDir = join(outDir, route.path.replace(/^\//, ''))
        mkdirSync(routeDir, { recursive: true })
        writeFileSync(join(routeDir, 'index.html'), routeHtml)
      }
    },
  }
}

// sitemap.xml 只列 PUBLIC_ROUTE_META 裡 includeInSitemap 為 true 的路由；
// /admin 與未來的 /share 一律排除，見 src/lib/publicRoutes.ts 的說明。
function sitemapPlugin(buildTime: string): Plugin {
  return {
    name: 'sitemap',
    apply: 'build',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'sitemap.xml',
        source: buildSitemapXml(buildTime.slice(0, 10)),
      })
    },
  }
}

// 兩邊都從同一個 APP_HOME_SCREEN_TITLE 常數算出來，是先前那次 bug 的教訓：印尼文版加好了，
// 中文版 manifest 的 short_name 卻手動寫死英文字串、沒人記得同步改，實機測試才發現桌面圖示
// 名稱還是英文。抽成獨立函式也讓這兩份文案可以直接被單元測試 import 驗證，不用真的跑一次
// build 才能發現兩邊字串又不小心分岔。
export function buildPwaManifestName(): string {
  return `${APP_HOME_SCREEN_TITLE.zh} JiaJian Log 家人的健康與照護紀錄`
}

export function buildPwaManifestShortName(): string {
  return APP_HOME_SCREEN_TITLE.zh
}

type PwaManifestLocale = 'zh' | 'id' | 'en'
type PwaScreenshotManifestEntry = {
  src: string
  sizes: string
  type: 'image/png'
  form_factor: 'narrow' | 'wide'
}

const PWA_SCREENSHOT_ASSETS: Record<PwaManifestLocale, readonly PwaScreenshotManifestEntry[]> = {
  // 為什麼中文沿用無後綴檔名：保留既有 manifest 的 asset URL，減少已安裝版本重新下載時的相容變化。
  zh: [
    { src: 'pwa-screenshot-narrow.png', sizes: '540x720', type: 'image/png', form_factor: 'narrow' },
    { src: 'pwa-screenshot-wide.png', sizes: '1280x720', type: 'image/png', form_factor: 'wide' },
  ],
  id: [
    { src: 'pwa-screenshot-narrow-id.png', sizes: '540x720', type: 'image/png', form_factor: 'narrow' },
    { src: 'pwa-screenshot-wide-id.png', sizes: '1280x720', type: 'image/png', form_factor: 'wide' },
  ],
  en: [
    { src: 'pwa-screenshot-narrow-en.png', sizes: '540x720', type: 'image/png', form_factor: 'narrow' },
    { src: 'pwa-screenshot-wide-en.png', sizes: '1280x720', type: 'image/png', form_factor: 'wide' },
  ],
}

export function buildPwaScreenshotManifestEntries(locale: PwaManifestLocale): PwaScreenshotManifestEntry[] {
  // 每次回傳新陣列，避免 Vite plugin 合併 manifest 時意外共用並修改設定物件。
  return PWA_SCREENSHOT_ASSETS[locale].map(screenshot => ({ ...screenshot }))
}

export function buildLocalizedManifestOverrides() {
  return {
    name: `${APP_HOME_SCREEN_TITLE.id} — JiaJian Log`,
    short_name: APP_HOME_SCREEN_TITLE.id,
    description: 'Catatan kesehatan keluarga yang mudah dipasang di layar utama.',
    lang: 'id',
    shortcuts: [
      { name: 'Catat tekanan darah', short_name: 'Tekanan darah', description: 'Buka pencatatan tekanan darah.', url: PWA_SHORTCUT_PATHS.bloodPressure, icons: [{ src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' }] },
      { name: 'Obat hari ini', short_name: 'Obat hari ini', description: 'Buka catatan obat hari ini.', url: PWA_SHORTCUT_PATHS.medication, icons: [{ src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' }] },
    ],
    screenshots: buildPwaScreenshotManifestEntries('id'),
  }
}

export function buildEnglishManifestOverrides() {
  return {
    name: 'JiaJian Log — Family Health Record',
    short_name: APP_HOME_SCREEN_TITLE.en,
    description: 'Keep the existing family health web app one tap away on your home screen.',
    lang: 'en',
    shortcuts: [
      { name: 'Record blood pressure', short_name: 'Blood pressure', description: 'Open the existing blood pressure entry.', url: PWA_SHORTCUT_PATHS.bloodPressure, icons: [{ src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' }] },
      { name: "Today's medication", short_name: 'Medication today', description: "Open today's existing medication entry.", url: PWA_SHORTCUT_PATHS.medication, icons: [{ src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' }] },
    ],
    screenshots: buildPwaScreenshotManifestEntries('en'),
  }
}

// Android／桌面 Chrome「加到主畫面」讀的是 manifest 的 name／short_name，跟 iOS 的
// apple-mobile-web-app-title 是兩條獨立路徑，沒辦法共用同一份執行期 JS 判斷語系去改內容
// （manifest 是瀏覽器直接抓的靜態檔，不是先跑過 App 再由 React 動態塞值）。因此在建置期
// 另外輸出一份印尼文 manifest，執行期再由 App.tsx 依語系切換 <link rel="manifest"> 的 href。
function localizedManifestPlugin(): Plugin {
  let resolvedConfig: ResolvedConfig
  return {
    name: 'localized-manifest',
    apply: 'build',
    configResolved(config) {
      resolvedConfig = config
    },
    // VitePWA 用 workbox-build 產生 manifest.webmanifest，是在 writeBundle 階段才真正寫進 outDir，
    // 不在一般 Rollup 的 bundle 物件裡；跟 publicRoutePrerenderPlugin 讀 index.html 一樣，
    // 用 closeBundle 直接讀已寫入磁碟的檔案最穩定，不用猜 VitePWA 內部各子外掛的 hook 執行順序。
    closeBundle() {
      const outDir = resolvedConfig.build.outDir
      const manifestPath = join(outDir, 'manifest.webmanifest')
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'))
      writeFileSync(join(outDir, 'manifest-id.webmanifest'), JSON.stringify({
        ...manifest,
        ...buildLocalizedManifestOverrides(),
      }))
      writeFileSync(join(outDir, 'manifest-en.webmanifest'), JSON.stringify({
        ...manifest,
        ...buildEnglishManifestOverrides(),
      }))
    },
  }
}

const buildMetadata = resolveBuildMetadata()

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(packageJson.version),
    // 為了讓正式發版不必再手動改 appInfo.ts，日期跟著建置產生，並固定用台北日曆避免 UTC 跨日誤差。
    __APP_RELEASE_DATE__: JSON.stringify(new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Taipei',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date())),
    __APP_GIT_SHA__: JSON.stringify(buildMetadata.commit),
    __APP_ENVIRONMENT__: JSON.stringify(buildMetadata.environment),
    __APP_BUILD_TIME__: JSON.stringify(buildMetadata.buildTime),
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // 照護表單可能正在輸入；新版先等待使用者確認，避免背景更新直接重載而吃掉未儲存資料。
      registerType: 'prompt',
      workbox: {
        // 版本檔名更新後立即移除上一版 precache，避免 iPhone PWA 長期留下已失效資源。
        cleanupOutdatedCaches: true,
        // provenance 必須反映伺服器目前部署，不能被舊 service worker 永久留在 precache。
        // publicRoutePrerenderPlugin 產生的子頁 index.html 也一併排除：這些頁面原本就是每次
        // 直接連線 Vercel 取得（沒有 SPA navigateFallback），排除它們維持既有的「一律連網取得
        // 最新內容」行為，避免 workbox 把某次建置當下的 title／description 快取後長期回舊內容
        // （issue #441 驗收條件要求重新確認 globIgnores 行為）。子頁清單從 PUBLIC_ROUTE_META
        // 算出來，避免日後在那邊加新路由卻忘記回來同步這裡。
        globIgnores: ['version.json', 'sitemap.xml', ...prerenderedSubRouteFilenames()],
        runtimeCaching: [
          {
            // 健康資料必須每次向 Supabase 取最新結果，不能因未來新增快取規則而誤用舊 API 回應。
            urlPattern: /^https:\/\/[^/]+\.supabase\.co\/(?:auth|rest|storage|functions)\/v1(?:\/|$)/i,
            handler: 'NetworkOnly',
          },
          {
            // /version.json 是給 debug 對照用，離線時寧可失敗也不要回傳過期 build。
            urlPattern: /\/version\.json$/i,
            handler: 'NetworkOnly',
          },
        ],
      },
      manifest: {
        // 同步 PWA 應用程式名稱與簡稱，確保安裝至手機主畫面時顯示全新的品牌識別。
        // short_name 才是「加入主畫面」實際顯示／預填的桌面圖示文字（iOS Safari 在有 manifest
        // 時會優先採用這裡而非 apple-mobile-web-app-title；Android/桌面 Chrome 也是讀這個欄位），
        // 從 APP_HOME_SCREEN_TITLE 算出來，不能手動另外寫一次英文品牌名。
        name: buildPwaManifestName(),
        short_name: buildPwaManifestShortName(),
        description: '家庭健康紀錄工具，將既有的家健錄網頁放到主畫面即可快速開啟。',
        lang: 'zh-Hant',
        start_url: '/',
        id: '/',
        scope: '/',
        categories: ['health', 'lifestyle'],
        shortcuts: [
          { name: '記血壓', short_name: '記血壓', description: '開啟既有的血壓紀錄入口。', url: PWA_SHORTCUT_PATHS.bloodPressure, icons: [{ src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' }] },
          { name: '今天吃藥', short_name: '今天吃藥', description: '開啟既有的今日服藥入口。', url: PWA_SHORTCUT_PATHS.medication, icons: [{ src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' }] },
        ],
        screenshots: buildPwaScreenshotManifestEntries('zh'),
        theme_color: '#f9fafb',
        background_color: '#f9fafb',
        display: 'standalone',
        icons: [
          {
            // Chrome Android 與 Desktop 捷徑必須提供 PNG 格式點陣圖示，否則安裝至桌面時會降級為「家」文字圖示
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable'
          },
          {
            // 同時保留 SVG 分頁圖示
            src: 'favicon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any'
          }
        ]
      }
    }),
    localizedManifestPlugin(),
    buildProvenancePlugin(buildMetadata),
    shareMetaPlugin(),
    sitemapPlugin(buildMetadata.buildTime),
    publicRoutePrerenderPlugin(),
  ],
  server: {
    port: Number(process.env.PORT) || 5100,
    strictPort: true,
    // 允許開發與正式環境網域，避免 Cloudflare Tunnel 代理時因 Host Header 不符而被 Vite 阻擋
    allowedHosts: ['bp.portfolio-author.xyz', 'bp-dev.portfolio-author.xyz', 'dev-bp.portfolio-author.xyz'],
  },
})
