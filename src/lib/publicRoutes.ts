/*
檔案用途：集中定義公開路由（免登入即可讀取）的清單、各頁專屬 title／description，以及把這些資料
套進已建置 index.html、產生 sitemap.xml、產生首頁 JSON-LD 的純函式。
所在層：src/lib 共用設定層；純字串與純函式，不依賴任何 Vite 建置期注入的全域變數，因此
vite.config.ts 可在 Node 執行期直接匯入，也方便寫單元測試。
主要關聯：vite.config.ts 的 publicRoutePrerenderPlugin／sitemapPlugin 在建置期讀取本檔，輸出成各自的靜態 HTML；
src/lib/shareMeta.ts 提供首頁預設文案與 hreflang 清單；vercel.json 的 X-Robots-Tag 規則對應本檔的 TOKEN_ENTRY_ROUTE_PATHS。
本檔同時是「伺服器能直接回 200 的 SPA 入口」清單：vercel.json 刻意沒有萬用 SPA rewrite（避免未知路徑
全部變成 200、失去可靠的 404），所以 App.tsx／PublicRouteSwitch.tsx 用 currentPath 判斷的每一條可直接開啟的
路徑都必須在這裡有一筆，否則全新瀏覽器第一次開分享網址會直接拿到 Vercel 404，只有已被 service worker
接管的舊使用者看起來正常（issue #806）。tests/unit/publicRoutes.test.ts 會掃整個 src/ 的
`currentPath === '…'`／`pathname === '…'` 判斷，漏列就失敗（startsWith 等其他寫法掃不到，新增路由時仍要自己加）；新增路由只需在 PUBLIC_ROUTE_META 加一筆，prerender／sitemap／globIgnores 都會自動涵蓋。
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
  /** 是否列進 sitemap.xml；登入後台、分享連結與邀請連結路徑一律 false。 */
  includeInSitemap: boolean
  /** 是否要在該頁插入 <meta name="robots" content="noindex, nofollow" />。 */
  noindex: boolean
}

// 雙語文案一律「印尼文在前、中文在後」，與 shareMeta.ts、src/lib/recordReport.ts 的既有慣例一致；
// 品牌名稱「家健錄 Family Health Note」是固定商標字串，不受排序規則影響。
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
    title: '家健錄 Family Health Note — Coba Gratis / 免費體驗展示模式',
    description: 'Coba Family Health Note dengan data lansia fiktif, tanpa perlu masuk akun. Cocok untuk keluarga dan perawat yang ingin melihat cara mencatat tekanan darah, obat, dan perawatan harian. ／ 用虛構長輩資料免登入試用家健錄，適合想了解如何記錄血壓、用藥與每日照護的家人與看護。',
    includeInSitemap: true,
    noindex: false,
  },
  {
    path: '/privacy',
    title: '家健錄 Family Health Note — Kebijakan Privasi / 隱私權政策',
    description: 'Bagaimana Family Health Note mengumpulkan, menyimpan, dan melindungi data kesehatan keluarga Anda, termasuk penggunaan Google Cloud Vision untuk pembacaan foto obat. ／ 說明家健錄如何蒐集、儲存與保護您家人的健康資料，包含藥品照片委外辨識（Google Cloud Vision）的揭露。',
    includeInSitemap: true,
    noindex: false,
  },
  {
    path: '/terms',
    title: '家健錄 Family Health Note — Syarat Layanan / 服務條款',
    description: 'Syarat dan ketentuan penggunaan aplikasi pencatatan kesehatan keluarga Family Health Note. ／ 家健錄家庭健康紀錄應用程式的使用條款與服務規範。',
    includeInSitemap: true,
    noindex: false,
  },
  {
    path: '/releases',
    title: '家健錄 Family Health Note — Riwayat Rilis / 版本更新紀錄',
    description: 'Catatan perubahan dan riwayat rilis Family Health Note, termasuk fitur baru dan perbaikan bug di setiap versi. ／ 家健錄的版本更新紀錄，包含每個版本的新功能與錯誤修正。',
    includeInSitemap: true,
    noindex: false,
  },
  {
    path: '/health-data-notice',
    // 與 /privacy、/terms 同屬法遵告知頁，允許索引；標題沿用頁面 h1 的「個人資料蒐集告知事項」。
    title: '家健錄 Family Health Note — Pemberitahuan Pengumpulan Data Pribadi / 個人資料蒐集告知事項 / Personal Information Collection Notice',
    description: 'Data apa saja yang dikumpulkan Family Health Note, tujuan, penerima, jangka waktu penyimpanan, dan hak Anda atas data tersebut. ／ 家健錄個人資料蒐集告知：蒐集哪些資料、目的、接收者、保存期間，以及您可以行使的權利。 ／ What data Family Health Note collects, why, who receives it, how long it is kept, and your rights over it.',
    includeInSitemap: true,
    noindex: false,
  },
  // 以下 issue #806 新增的路由一律「印尼文 / 中文 / 英文」三語：這些 <title> 在 /share、/join 等頁會一直留在
  // 分頁標題上，而且搜尋引擎與不跑 JS 的預覽器只看得到這份靜態 HTML，屬於 AGENTS.md § 3.6 的使用者可見文字。
  // 英文沿用站內既有、已審過的 en 文案（衛教卡片、各頁 h1），不另寫一套。上面 issue #441 的舊路由仍是雙語，
  // 補齊英文另案處理，避免本 PR 順手改到首頁分享預覽文案。
  // 公開衛教頁（issue #442）本來就是為了被搜尋引擎索引而做的，所以列進 sitemap；
  // 描述逐字沿用 GuidesIndexPage 卡片上的 id／zh 文案；標題也沿用卡片標題，但前面已有品牌字串，太長的印尼文標題只取前段，中文維持原樣。
  {
    path: '/guides',
    title: '家健錄 Family Health Note — Panduan Edukatif / 公開衛教 / Educational Guides',
    description: 'Panduan edukatif kesehatan lansia dan hewan peliharaan: tekanan darah, jadwal obat, operan perawat, dan pencatatan harian. Gratis dan tanpa login. ／ 家健錄免登入公開衛教：長輩血壓量測、服藥時段、看護交接、寵物慢性病紀錄等實用指南。 ／ Public health education for elderly and pet care: blood pressure monitoring, medication schedules, caregiver handovers, and chronic pet care logging. Free without login.',
    includeInSitemap: true,
    noindex: false,
  },
  {
    path: '/guides/blood-pressure-722',
    title: '家健錄 Family Health Note — Prinsip 722 Pengukuran Tekanan Darah di Rumah / 居家血壓 722 原則 / The 722 Rule for Home Blood Pressure Monitoring',
    description: 'Panduan pengukuran tekanan darah sesuai standar rumah tangga (7 hari, 2 sesi/hari, 2 kali/sesi) dan tabel referensi tekanan darah normal. ／ 按照家庭標準量血壓的 722 原則與家庭血壓參考表，認識正常血壓範圍。 ／ Guide to home blood pressure monitoring using the 722 rule (7 days, 2 sessions/day, 2 readings/session) and reference range table.',
    includeInSitemap: true,
    noindex: false,
  },
  {
    path: '/guides/medication-schedule',
    title: '家健錄 Family Health Note — Jadwal Waktu Minum Obat Lansia / 長輩用藥時段對照與漏藥處理原則 / Elderly Medication Schedules',
    description: 'Enam waktu minum obat (sebelum/sesudah makan, sebelum tidur) dan cara mencatat dosis terlewat tanpa menghitung persentase kepatuhan otomatis. ／ 六個常用服藥時段的對照，以及為何 App 只記錄實際情形而不自動換算遵從率百分比。 ／ Six common medication time slots and how to record missed doses without automated compliance percentages.',
    includeInSitemap: true,
    noindex: false,
  },
  {
    path: '/guides/caregiver-handover',
    title: '家健錄 Family Health Note — Daftar Serah Terima Pengasuh Baru / 外籍看護到職第一週交接清單 / First-Week Handover Checklist for New Caregivers',
    description: 'Checklist empat bagian (jadwal obat, alergi, rutinitas harian, kontak darurat) untuk membantu pengasuh baru memulai dengan informasi lengkap. ／ 給新看護的四大交接重點：服藥時間、過敏禁忌、作息習慣、緊急聯絡人。 ／ A 4-part handover checklist (medication schedule, allergies, daily routines, emergency contacts) to help new caregivers get started.',
    includeInSitemap: true,
    noindex: false,
  },
  {
    path: '/guides/pet-chronic-disease',
    title: '家健錄 Family Health Note — Pencatatan Harian Kucing Ginjal Kronis / 慢性腎病貓／糖尿病犬貓的居家紀錄項目 / Daily Tracking for CKD Cats & Diabetic Pets',
    description: 'Item pencatatan harian untuk hewan kronis (cairan infus, insulin, gula darah, nafsu makan) yang membantu dokter hewan memantau perkembangan. ／ 慢性腎病貓與糖尿病犬貓要記錄的項目：飲水量、排尿、輸液、胰島素、血糖、食慾等。 ／ Daily tracking items for chronic pet diseases (fluid therapy, insulin, blood glucose, appetite) to help veterinarians track trends.',
    includeInSitemap: true,
    noindex: false,
  },
  {
    path: '/guides/family-invitations',
    title: '家健錄 Family Health Note — Cara Mengundang Keluarga / 如何邀請家人使用家健錄 / How to Invite Family',
    description: 'Panduan memilih jenis undangan, membagikan tautan, mengonfirmasi akun, dan mencabut akses dengan aman. ／ 教你選對邀請類型、分享連結、確認帳號，以及安全撤銷邀請或照護權限。 ／ Learn how to choose an invitation type, share a link, approve an account, and safely revoke an invitation or care access.',
    includeInSitemap: true,
    noindex: false,
  },
  {
    path: '/admin',
    // 後台需要登入且畫面因人而異，不能被索引；仍給雙語 title 而不是英文佔位字，符合雙語介面規範。
    title: '家健錄 Family Health Note — Admin / 後台管理',
    description: SHARE_PREVIEW_DESCRIPTION,
    includeInSitemap: false,
    noindex: true,
  },
  // 以下三條都是帶一次性 token 的收件入口（token 放在 # 後面，不會送到伺服器，所以同一份靜態 HTML
  // 可以服務所有 token）。它們必須能被全新瀏覽器直接打開，但絕不能被索引或列進 sitemap；
  // 描述刻意寫成通用說明，不能提到任何病人、分享內容或邀請者，避免預覽卡片洩漏脈絡。
  // 三條都另有 vercel.json 的 X-Robots-Tag header（清單見下方 TOKEN_ENTRY_ROUTE_PATHS）；
  // 這裡的靜態 noindex 涵蓋只讀初始 HTML、不看 header 的預覽器，兩層缺一不可。
  {
    path: '/share',
    // /share 另有第三層：ShareSummaryPage 會在執行期補 robots meta。
    title: '家健錄 Family Health Note — Ringkasan Baca-saja / 唯讀分享摘要 / Read-only Summary',
    description: 'Tautan berbagi baca-saja dari Family Health Note. ／ 家健錄唯讀分享連結。 ／ A read-only share link from Family Health Note.',
    includeInSitemap: false,
    noindex: true,
  },
  {
    path: '/join',
    title: '家健錄 Family Health Note — Ajukan untuk bergabung / 申請加入照護 / Request to join care',
    description: 'Undangan untuk bergabung sebagai pengasuh di Family Health Note. ／ 家健錄照護者邀請連結。 ／ An invitation to join Family Health Note as a caregiver.',
    includeInSitemap: false,
    noindex: true,
  },
  {
    path: '/patient-invite',
    title: '家健錄 Family Health Note — Periksa undangan Anda / 查看你的邀請 / Review your invitation',
    description: 'Undangan Family Health Note untuk orang yang dirawat. ／ 家健錄被照顧者邀請連結。 ／ A Family Health Note invitation for the person receiving care.',
    includeInSitemap: false,
    noindex: true,
  },
] as const

/**
 * 帶 token 的收件入口，vercel.json 必須對它們回 `X-Robots-Tag: noindex, nofollow, noarchive`。
 * 為什麼 header 還要再加一層：HTML meta 只有爬蟲真的解析 HTML 才看得到，header 則在任何解析前就生效，
 * 也涵蓋只看回應標頭的預覽器／快取。刻意不含 /admin——它不帶 token，只靠靜態 noindex 與 robots.txt Disallow。
 * 也刻意不把這些路徑加進 robots.txt Disallow（/share 是歷史例外）：被 Disallow 的網址爬蟲不會去抓，
 * 就永遠看不到 noindex，反而可能因外部連結被收錄成「只有網址」的結果。
 * vercelHeaders.test.ts 鎖住 header 規則，scripts/smoke-public-routes.ts 在 --base-url 模式實測 header。
 */
export const TOKEN_ENTRY_ROUTE_PATHS: readonly string[] = ['/share', '/join', '/patient-invite']

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
 * 只列 includeInSitemap 為 true 的路由；/admin、/share、/join、/patient-invite 與任何帶 token 的路徑
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
    name: '家健錄 Family Health Note',
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
