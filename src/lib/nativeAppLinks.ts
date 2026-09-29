/*
檔案用途：原生殼收到 https 連結（Universal Links／App Links）時的白名單解析與導向；只放行 /join、/patient-invite、/share 三條帶 token 的收件入口。
所在層：src/lib；純解析＋一次性 WebView 導向，不碰 Supabase、不消費 token——token 仍由各收件頁與既有 RPC／RLS 把關。
主要關聯：nativeAuth.ts 的 appUrlOpen listener 先交 parseNativeAuthCallback，非 OAuth 才交給本檔（issue #820）；
         publicRoutes.ts 的 TOKEN_ENTRY_ROUTE_PATHS、caregiverInvitations.ts／shareLinks.ts 的連結格式；canonicalUrl.ts 的正式站網址。
為什麼不放 platform.ts：dispatcher 必須先呼叫 nativeAuth 的 OAuth parser，而 nativeAuth 又 import platform.ts，放進去會形成循環 import；
         platform.ts 也明訂不承載 auth 相關邏輯。
*/
import { APP_CANONICAL_URL } from './canonicalUrl'
import { TOKEN_ENTRY_ROUTE_PATHS } from './publicRoutes'

export type NativeAppLink = {
  /** 一定是 TOKEN_ENTRY_ROUTE_PATHS 其中之一，WebView 內既有路由（App.tsx／PublicRouteSwitch）會接手。 */
  path: string
  /** 由驗證過的 token 重新組出，不直接沿用外部傳入的 fragment 原文。 */
  hash: string
}

// 只接受正式站 host。staging host 刻意不列：同一個 bundle ID 目前同時服務兩個環境，
// 要等 native config（entitlement／intent-filter／各環境一份 AASA）那一步一起決定哪個 build 認哪個 host，
// 否則 staging App 可能攔到 production 邀請連結（issue #820 的 open question）。
export const NATIVE_APP_LINK_HOSTS: readonly string[] = [new URL(APP_CANONICAL_URL).hostname]

// 三條入口產生的 token 都是 32 bytes CSPRNG 轉 hex（shareLinks.generateShareToken、邀請 RPC）；
// 形狀先在這裡鎖死，任何超長、非 hex 或多餘欄位都不會被帶進 WebView。
const APP_LINK_TOKEN_PATTERN = /^[0-9a-f]{64}$/i
const APP_LINK_HASH_PATTERN = /^#token=([0-9a-f]{64})$/i

// 已導向過的連結指紋，存在 sessionStorage：同一個 WebView process 內跨 reload 保留、App 被殺掉後清空，
// 剛好對應 Capacitor 重送同一個 URL 的範圍。只存 domain-separated SHA-256，不存 URL 或 token 原文；
// 刻意不用 sha256(token)：那正是邀請／分享 RPC 的 p_token_hash，存它等於把可用憑證留在 storage。
export const NATIVE_APP_LINK_HANDLED_KEY = 'jia-jian-log.native-app-links-handled'
const APP_LINK_FINGERPRINT_DOMAIN = 'jia-jian-log/native-app-link/v1:'
const MAX_REMEMBERED_APP_LINKS = 20

/**
 * 白名單解析：scheme、host、path、fragment 全部要對上才回傳；其餘一律 null（由呼叫端靜默忽略）。
 * query 不轉送：通訊軟體可能自行加上追蹤參數，拒絕會讓已開啟的 App 停在首頁沒反應；
 * 但也不能把外部 query 帶進 WebView，所以只用驗證過的 path＋token 重新組出目標。
 */
export function parseNativeAppLink(rawUrl: string, allowedHosts: readonly string[] = NATIVE_APP_LINK_HOSTS): NativeAppLink | null {
  try {
    const url = new URL(rawUrl)
    // 自訂 scheme（jia-jian-log://join…）不算 app link：自訂 scheme 任何 App 都能註冊與呼叫，
    // 只有經 AASA／assetlinks 驗證過網域的 https 連結才有資格走進邀請與分享流程。
    if (
      url.protocol !== 'https:'
      || !allowedHosts.includes(url.hostname)
      || url.port
      || url.username
      || url.password
      || !TOKEN_ENTRY_ROUTE_PATHS.includes(url.pathname)
    ) return null
    const match = APP_LINK_HASH_PATTERN.exec(url.hash)
    const token = match?.[1]
    if (!token || !APP_LINK_TOKEN_PATTERN.test(token)) return null
    return { path: url.pathname, hash: `#token=${token}` }
  } catch {
    return null
  }
}

type AppLinkLocation = Pick<Location, 'pathname' | 'assign' | 'reload'>

type AppLinkStorage = Pick<Storage, 'getItem' | 'setItem'>

// 同一次頁面載入內的去重：appUrlOpen 重送與 getLaunchUrl 幾乎同時到，而且誰先到由原生 bridge 決定、沒有保證。
// 同一個 target 的呼叫串成一條 Promise 鏈：後到的等前一個的結果，前一個已導向才放棄。
// 不能用「先到先佔、後到直接放棄」：若先到的是 getLaunchUrl 而 storage 壞掉，它會選擇不導向，
// 後到的 appUrlOpen 卻已經被擋掉，整個點擊就無聲消失（違反 fail loudly）。這份只在記憶體、reload 就清空。
const dispatchChains = new Map<string, Promise<boolean>>()

async function appLinkFingerprint(target: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(APP_LINK_FINGERPRINT_DOMAIN + target))
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
}

function readHandledFingerprints(storage: AppLinkStorage): string[] {
  const raw = storage.getItem(NATIVE_APP_LINK_HANDLED_KEY)
  if (!raw) return []
  const parsed: unknown = JSON.parse(raw)
  if (!Array.isArray(parsed)) return []
  return parsed.filter((value): value is string => typeof value === 'string')
}

/**
 * 記下這個連結已導向過，並回傳「記錄前是否已經出現過」。任何 storage／crypto 失敗都回傳 null，由呼叫端決定要不要冒險導向。
 */
async function recordAppLink(target: string, storage: AppLinkStorage | undefined): Promise<{ seenBefore: boolean } | null> {
  try {
    if (!storage) return null
    const fingerprint = await appLinkFingerprint(target)
    const handled = readHandledFingerprints(storage)
    const seenBefore = handled.includes(fingerprint)
    // 重新點過的連結移到最後；只保留最近幾筆，避免同一個 session 點了很多邀請後 storage 無限長大。
    const next = [...handled.filter(value => value !== fingerprint), fingerprint].slice(-MAX_REMEMBERED_APP_LINKS)
    storage.setItem(NATIVE_APP_LINK_HANDLED_KEY, JSON.stringify(next))
    return { seenBefore }
  } catch {
    return null
  }
}

/**
 * 把 appUrlOpen／getLaunchUrl 收到的網址導進 WebView 既有路由；回傳是否真的導向。
 * 不寫 log、不送 analytics：URL fragment 內就是邀請／分享 token。
 *
 * 為什麼要去重：Capacitor 會把同一個 URL 送來不只一次——appUrlOpen 在 listener 註冊前到的事件會保留、
 * 註冊當下重送；getLaunchUrl 又回傳同一個值（Android 是冷啟動 intent，整個 process 不變；
 * iOS 是「最後一個」連結，warm 點擊後也會更新），而且 reload 後每次初始化都會再回傳一次。
 * 導向會 reload WebView、重跑初始化，沒有去重會讓收件頁跑第二次：邀請已被第一次用掉而顯示失效、
 * 分享頁多記一筆存取稽核，最壞情況是 reload 循環。
 *
 * 為什麼只擋 getLaunchUrl、不擋 appUrlOpen：原生每一次真實點擊只會觸發一次 appUrlOpen，跨載入的重複只來自
 * getLaunchUrl。分享連結在到期或撤銷前可以重複開啟，使用者切到聊天軟體再點同一個連結時必須重新導向，
 * 不能被當成重送（PR #1009 review）。所以 appUrlOpen 一律導向並記下指紋，getLaunchUrl 只在指紋沒出現過時導向；
 * storage 失敗時 getLaunchUrl 無法判斷是否重送，寧可不導向。同一次載入內兩者的重複由 dispatchChains 擋，誰先到都一樣。
 * 目標 path 跟目前頁相同時，只改 fragment 不會 reload，收件頁只在 mount 讀 token，所以要補一次 reload。
 */
export async function openNativeAppLink(
  rawUrl: string,
  options: { fromLaunch?: boolean, location?: AppLinkLocation, storage?: AppLinkStorage } = {},
): Promise<boolean> {
  const link = parseNativeAppLink(rawUrl)
  if (!link) return false
  const location = options.location ?? (typeof window === 'undefined' ? undefined : window.location)
  if (!location) return false
  const target = `${link.path}${link.hash}`
  const storage = options.storage ?? (typeof window === 'undefined' ? undefined : safeSessionStorage())
  // 在任何 await 之前同步接上鏈，第二個同時到的相同連結才會排在後面等結果。
  const previous = dispatchChains.get(target) ?? Promise.resolve(false)
  const attempt = previous.then(alreadyNavigated => alreadyNavigated ? false : dispatchAppLink(link, target, location, storage, options.fromLaunch === true))
  dispatchChains.set(target, Promise.all([previous, attempt.catch(() => false)]).then(([before, now]) => before || now))
  return attempt
}

async function dispatchAppLink(
  link: NativeAppLink,
  target: string,
  location: AppLinkLocation,
  storage: AppLinkStorage | undefined,
  fromLaunch: boolean,
): Promise<boolean> {
  // appUrlOpen 也要先記下：導向後 reload，getLaunchUrl 會再回傳同一個網址（iOS 的 lastURL），要靠這筆指紋擋掉。
  const record = await recordAppLink(target, storage)
  // storage 壞掉時無法跨 reload 記住，getLaunchUrl 每次 reload 都會再回傳同一個網址；寧可不導向也不冒循環風險。
  // 同一次載入內若 appUrlOpen 也送來同一個連結，它排在鏈上、看到這裡回 false，仍會自己導向。
  if (fromLaunch && (record === null || record.seenBefore)) return false
  const samePath = location.pathname === link.path
  // 用相對路徑：導向留在 WebView 自己的 origin（capacitor://localhost／https://localhost），不會跳出到外部網站。
  location.assign(target)
  if (samePath) location.reload()
  return true
}

/** 只給測試用：模擬 WebView reload 後記憶體狀態歸零。 */
export function resetNativeAppLinkDispatchForTests(): void {
  dispatchChains.clear()
}

function safeSessionStorage(): Storage | undefined {
  try {
    return window.sessionStorage
  } catch {
    return undefined
  }
}
