/*
檔案用途：集中驗證 TFDA 藥品外觀圖來源，並把官方圖片轉成本站 proxy URL。
所在層：src/lib；供藥品外觀元件與 Vercel API route 共用的純 URL 邏輯。
主要關聯：MedicationAppearance、api/tfda-appearance-image.ts 與 vercel.json 的 img-src CSP。
*/
// `.js` 副檔名不是筆誤：本檔也會被 api/tfda-appearance-image.ts 帶進 Vercel Function 的原生 ESM 產物，
// 無副檔名的相對 import 會讓整個 function 載入失敗（issue #807）；Vite／bun 會把 `.js` 對回 `.ts`。
import { APP_CANONICAL_URL } from '../canonicalUrl.js'

export const TFDA_APPEARANCE_IMAGE_ORIGIN = 'https://mcp.fda.gov.tw'
export const TFDA_APPEARANCE_IMAGE_PROXY_PATH = '/api/tfda-appearance-image'

// 只代理官方同步實際使用的兩個圖片目錄；固定前綴是避免 endpoint 變成任意 mcp.fda.gov.tw 路徑代理。
const TFDA_APPEARANCE_IMAGE_PATH_PREFIXES = ['/insert/shapeImg/', '/shape/'] as const

function hasSafeTfdaPath(pathname: string): boolean {
  if (!TFDA_APPEARANCE_IMAGE_PATH_PREFIXES.some(prefix => pathname.startsWith(prefix))) return false

  try {
    // URL.pathname 可能保留 percent-encoded 字元；解碼後再檢查 traversal 與控制字元，避免只驗證表面字串。
    const decodedPath = decodeURIComponent(pathname)
    const hasControlCharacter = [...decodedPath].some(character => {
      const code = character.charCodeAt(0)
      return code <= 0x1f || code === 0x7f
    })
    return !decodedPath.includes('..') && !hasControlCharacter
  } catch {
    return false
  }
}

/**
 * 回傳可安全交給 TFDA 的完整圖片 URL；不符合精確來源與路徑時一律拒絕。
 * 隱私邊界不是把公開藥圖藏起來：TFDA 仍會看到圖片 path，但改由本站伺服器代取後，
 * 不會直接收到照護者裝置的 IP／User-Agent；本站仍可看到 proxy 請求，這不是匿名化保證。
 */
export function parseTfdaAppearanceImagePath(rawPath: string | null): URL | null {
  if (!rawPath || !rawPath.startsWith('/') || rawPath.startsWith('//')) return null

  try {
    const url = new URL(rawPath, TFDA_APPEARANCE_IMAGE_ORIGIN)
    if (
      url.origin !== TFDA_APPEARANCE_IMAGE_ORIGIN
      || url.username
      || url.password
      || url.port
      || !hasSafeTfdaPath(url.pathname)
    ) return null
    return url
  } catch {
    return null
  }
}

function parseTfdaAppearanceImageUrl(rawUrl: string): URL | null {
  try {
    const url = new URL(rawUrl)
    const parsed = parseTfdaAppearanceImagePath(`${url.pathname}${url.search}`)
    return parsed?.toString() === url.toString() ? url : null
  } catch {
    return null
  }
}

export function resolveProxyOrigin(appOrigin?: string): string {
  const candidate = appOrigin ?? (typeof window !== 'undefined' ? window.location.origin : APP_CANONICAL_URL)

  try {
    const url = new URL(candidate)
    // Capacitor 的 capacitor://localhost 與本機非 HTTP scheme 沒有 Vercel /api route，退回正式站同源 proxy。
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.origin : new URL(APP_CANONICAL_URL).origin
  } catch {
    return new URL(APP_CANONICAL_URL).origin
  }
}

/**
 * 將資料庫裡的官方 TFDA 外觀 URL 轉成可供 <img> 使用的同源 proxy URL。
 * TFDA 圖片不直接回傳第三方網址；未知外站也不渲染，避免 CSP 擋住前才發現資料仍會外連。
 * 這等於由本站櫃台代手機打電話給 TFDA：TFDA 知道查哪張公開圖片，卻較難把查詢連回某支照護者裝置。
 * 照護者自行上傳的外觀照片存的是 private bucket 的 bare path，不是完整 URL，交給
 * signMedicationAppearancePhotoPath 換簽名網址，不在這裡處理。
 */
export function resolveMedicationAppearanceImageUrl(rawUrl: string | null, appOrigin?: string): string | null {
  const value = rawUrl?.trim()
  if (!value) return null

  const tfdaUrl = parseTfdaAppearanceImageUrl(value)
  if (!tfdaUrl) return null

  const proxyUrl = new URL(TFDA_APPEARANCE_IMAGE_PROXY_PATH, resolveProxyOrigin(appOrigin))
  proxyUrl.searchParams.set('path', `${tfdaUrl.pathname}${tfdaUrl.search}`)
  return proxyUrl.toString()
}
