/*
檔案用途：鎖住原生殼 https app link（/join、/patient-invite、/share）的白名單解析與一次性導向契約。
所在層：tests/unit；不啟動 Xcode／Android，也不需要 DOM，以假 location／storage 驗證導向與 Capacitor 重送 URL 時的去重。
主要關聯：src/lib/nativeAppLinks.ts、src/lib/nativeAuth.ts（先 OAuth 再 app link）、src/lib/publicRoutes.ts（issue #820）。
*/
import { beforeEach, describe, expect, test } from 'bun:test'
import {
  NATIVE_APP_LINK_HANDLED_KEY,
  NATIVE_APP_LINK_HOSTS,
  openNativeAppLink,
  parseNativeAppLink,
  resetNativeAppLinkDispatchForTests,
} from '../../src/lib/nativeAppLinks'
import { TOKEN_ENTRY_ROUTE_PATHS } from '../../src/lib/publicRoutes'

// 假 token：64 位 hex，跟 generateShareToken／邀請 token 同形狀，不對應任何真實邀請。
const TOKEN = 'a'.repeat(32) + '0123456789abcdef0123456789abcdef'
const HOST = 'demo.careapp.local'

// 跟 shareLinks.sha256Hex 相同算法；自己算而不 import，避免這支純函式測試把 Supabase client 一起載入。
async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
}

function fakeLocation(pathname = '/') {
  const calls: string[] = []
  return {
    calls,
    location: {
      pathname,
      assign: (url: string | URL) => { calls.push(`assign:${String(url)}`) },
      reload: () => { calls.push('reload') },
    },
  }
}

function fakeStorage(initial: Record<string, string> = {}, options: { throwOnGet?: boolean, throwOnSet?: boolean } = {}) {
  const values = new Map(Object.entries(initial))
  return {
    values,
    storage: {
      getItem: (key: string) => {
        if (options.throwOnGet) throw new Error('storage blocked')
        return values.get(key) ?? null
      },
      setItem: (key: string, value: string) => {
        if (options.throwOnSet) throw new Error('quota exceeded')
        values.set(key, value)
      },
    },
  }
}

describe('parseNativeAppLink', () => {
  test('only trusts the production canonical host until per-environment native config exists', () => {
    // staging host 要等 entitlement／AASA 分環境時一起決定；先列進來會讓同一個 bundle ID 攔到另一個環境的連結。
    expect(NATIVE_APP_LINK_HOSTS).toEqual([HOST])
  })

  test('accepts each token entry route with a well-formed fragment token', () => {
    expect(TOKEN_ENTRY_ROUTE_PATHS).toEqual(['/share', '/join', '/patient-invite'])
    for (const path of TOKEN_ENTRY_ROUTE_PATHS) {
      expect(parseNativeAppLink(`https://${HOST}${path}#token=${TOKEN}`)).toEqual({ path, hash: `#token=${TOKEN}` })
    }
    // 邀請 token 大小寫都是合法 hex；不能因大寫而讓已開啟的 App 沒反應。
    expect(parseNativeAppLink(`https://${HOST}/join#token=${TOKEN.toUpperCase()}`)).toEqual({ path: '/join', hash: `#token=${TOKEN.toUpperCase()}` })
  })

  test('drops query parameters instead of forwarding them into the WebView', () => {
    // 通訊軟體可能加追蹤參數；只用驗證過的 path＋token 重組目標，外部 query 一律不帶進去。
    expect(parseNativeAppLink(`https://${HOST}/share?utm_source=line&next=/admin#token=${TOKEN}`)).toEqual({ path: '/share', hash: `#token=${TOKEN}` })
  })

  test('rejects non-https schemes, including the app custom scheme', () => {
    expect(parseNativeAppLink(`http://${HOST}/join#token=${TOKEN}`)).toBeNull()
    // 自訂 scheme 任何 App 都能呼叫；邀請與分享只能經網域驗證過的 https 進來。
    expect(parseNativeAppLink(`jia-jian-log://join#token=${TOKEN}`)).toBeNull()
    expect(parseNativeAppLink(`jia-jian-log://${HOST}/join#token=${TOKEN}`)).toBeNull()
    expect(parseNativeAppLink(`javascript:alert(1)//#token=${TOKEN}`)).toBeNull()
    expect(parseNativeAppLink(`file:///join#token=${TOKEN}`)).toBeNull()
  })

  test('rejects lookalike hosts, ports and credentials', () => {
    expect(parseNativeAppLink(`https://staging-${HOST}/join#token=${TOKEN}`)).toBeNull()
    expect(parseNativeAppLink(`https://${HOST}.evil.example/join#token=${TOKEN}`)).toBeNull()
    expect(parseNativeAppLink(`https://evil.example/${HOST}/join#token=${TOKEN}`)).toBeNull()
    expect(parseNativeAppLink(`https://${HOST}:8443/join#token=${TOKEN}`)).toBeNull()
    expect(parseNativeAppLink(`https://user@${HOST}/join#token=${TOKEN}`)).toBeNull()
    expect(parseNativeAppLink(`https://user:pass@${HOST}/join#token=${TOKEN}`)).toBeNull()
  })

  test('rejects paths outside the three token entry routes', () => {
    for (const path of ['/', '/admin', '/demo', '/join/', '/join/extra', '/JOIN', '/share.html', '/join/index.html', '//join', '/auth/callback']) {
      expect(parseNativeAppLink(`https://${HOST}${path}#token=${TOKEN}`)).toBeNull()
    }
    // 以 ../ 繞回白名單路徑：URL 正規化後若剛好等於 /join 也只會得到乾淨的 path，不會帶上原字串。
    expect(parseNativeAppLink(`https://${HOST}/admin/../join#token=${TOKEN}`)).toEqual({ path: '/join', hash: `#token=${TOKEN}` })
  })

  test('rejects missing, malformed, oversized or extra fragment content', () => {
    expect(parseNativeAppLink(`https://${HOST}/join`)).toBeNull()
    expect(parseNativeAppLink(`https://${HOST}/join#`)).toBeNull()
    expect(parseNativeAppLink(`https://${HOST}/join#token=`)).toBeNull()
    expect(parseNativeAppLink(`https://${HOST}/join#token=${TOKEN.slice(1)}`)).toBeNull()
    expect(parseNativeAppLink(`https://${HOST}/join#token=${TOKEN}0`)).toBeNull()
    expect(parseNativeAppLink(`https://${HOST}/join#token=${'g'.repeat(64)}`)).toBeNull()
    expect(parseNativeAppLink(`https://${HOST}/join#token=${TOKEN}&next=/admin`)).toBeNull()
    expect(parseNativeAppLink(`https://${HOST}/join#next=/admin&token=${TOKEN}`)).toBeNull()
    expect(parseNativeAppLink(`https://${HOST}/join#access_token=${TOKEN}`)).toBeNull()
    expect(parseNativeAppLink(`https://${HOST}/join#token=${TOKEN}%0A`)).toBeNull()
    // token 只能在 fragment；放在 query 會進伺服器 log，不能被當成合法連結接受。
    expect(parseNativeAppLink(`https://${HOST}/join?token=${TOKEN}`)).toBeNull()
  })

  test('rejects garbage input without throwing', () => {
    expect(parseNativeAppLink('')).toBeNull()
    expect(parseNativeAppLink('not a URL')).toBeNull()
    expect(parseNativeAppLink(`/join#token=${TOKEN}`)).toBeNull()
  })
})

describe('openNativeAppLink', () => {
  beforeEach(() => {
    resetNativeAppLinkDispatchForTests()
  })

  test('routes a warm link into the WebView with a relative target', async () => {
    const { calls, location } = fakeLocation('/')
    const { storage } = fakeStorage()
    expect(await openNativeAppLink(`https://${HOST}/join#token=${TOKEN}`, { location, storage })).toBe(true)
    // 相對路徑讓導向留在 WebView 自己的 origin，不會把 App 帶去外部網站。
    expect(calls).toEqual([`assign:/join#token=${TOKEN}`])
  })

  test('reloads when the target path is already open because entry pages read the token only on mount', async () => {
    const { calls, location } = fakeLocation('/share')
    const { storage } = fakeStorage()
    expect(await openNativeAppLink(`https://${HOST}/share#token=${TOKEN}`, { location, storage })).toBe(true)
    expect(calls).toEqual([`assign:/share#token=${TOKEN}`, 'reload'])
  })

  test('ignores unknown URLs without navigating or touching storage', async () => {
    const { calls, location } = fakeLocation('/')
    const { storage, values } = fakeStorage()
    expect(await openNativeAppLink(`https://${HOST}/admin#token=${TOKEN}`, { location, storage })).toBe(false)
    expect(await openNativeAppLink('jia-jian-log://auth/callback?code=one-time-code', { location, storage })).toBe(false)
    expect(calls).toEqual([])
    expect(values.size).toBe(0)
  })

  test('dispatches once when Capacitor replays appUrlOpen and getLaunchUrl in the same load', async () => {
    const { calls, location } = fakeLocation('/')
    const { storage } = fakeStorage()
    const url = `https://${HOST}/share#token=${TOKEN}`
    // 兩條路徑幾乎同時到、指紋是 async 算的；同步佔位要讓第二個直接放棄。
    const results = await Promise.all([
      openNativeAppLink(url, { location, storage }),
      openNativeAppLink(url, { fromLaunch: true, location, storage }),
    ])
    expect(results).toEqual([true, false])
    expect(calls).toEqual([`assign:/share#token=${TOKEN}`])
  })

  test('navigates exactly once for either arrival order, even when storage is broken', async () => {
    // 原生 bridge 不保證 appUrlOpen 重送與 getLaunchUrl 誰先到；兩種順序 × storage 正常／壞掉都要恰好導一次。
    const url = `https://${HOST}/join#token=${TOKEN}`
    for (const launchFirst of [true, false]) {
      for (const storageOptions of [{}, { throwOnGet: true }, { throwOnSet: true }]) {
        resetNativeAppLinkDispatchForTests()
        const { calls, location } = fakeLocation('/')
        const { storage } = fakeStorage({}, storageOptions)
        const launch = () => openNativeAppLink(url, { fromLaunch: true, location, storage })
        const warm = () => openNativeAppLink(url, { location, storage })
        const results = await Promise.all(launchFirst ? [launch(), warm()] : [warm(), launch()])
        expect(results.filter(Boolean)).toHaveLength(1)
        expect(calls).toEqual([`assign:/join#token=${TOKEN}`])
      }
    }
  })

  test('suppresses getLaunchUrl replays after reload but still honours a genuine repeat tap', async () => {
    const { calls, location } = fakeLocation('/')
    const { storage } = fakeStorage()
    const url = `https://${HOST}/share#token=${TOKEN}`
    expect(await openNativeAppLink(url, { location, storage })).toBe(true)
    // reload 後記憶體清空，但 getLaunchUrl（Android 冷啟動 intent／iOS 最後一個連結）仍回傳同一個網址。
    resetNativeAppLinkDispatchForTests()
    expect(await openNativeAppLink(url, { fromLaunch: true, location, storage })).toBe(false)
    // 分享連結到期前可重複開啟：使用者切到聊天軟體再點同一個連結，是新的 appUrlOpen，必須重新導向（PR #1009 review）。
    resetNativeAppLinkDispatchForTests()
    expect(await openNativeAppLink(url, { location, storage })).toBe(true)
    // 那一次導向後的 reload，getLaunchUrl 的重送仍要被擋住。
    resetNativeAppLinkDispatchForTests()
    expect(await openNativeAppLink(url, { fromLaunch: true, location, storage })).toBe(false)
    expect(calls).toEqual([`assign:/share#token=${TOKEN}`, `assign:/share#token=${TOKEN}`])
  })

  test('routes a launch URL that was never delivered before', async () => {
    const { calls, location } = fakeLocation('/')
    const { storage } = fakeStorage()
    expect(await openNativeAppLink(`https://${HOST}/join#token=${TOKEN}`, { fromLaunch: true, location, storage })).toBe(true)
    expect(calls).toEqual([`assign:/join#token=${TOKEN}`])
  })

  test('still routes a different link later in the same session', async () => {
    const { calls, location } = fakeLocation('/')
    const { storage } = fakeStorage()
    const otherToken = 'c'.repeat(64)
    expect(await openNativeAppLink(`https://${HOST}/join#token=${TOKEN}`, { location, storage })).toBe(true)
    resetNativeAppLinkDispatchForTests()
    expect(await openNativeAppLink(`https://${HOST}/join#token=${otherToken}`, { location, storage })).toBe(true)
    expect(calls).toEqual([`assign:/join#token=${TOKEN}`, `assign:/join#token=${otherToken}`])
  })

  test('stores only fingerprints that are neither the URL, the token nor the RPC token hash', async () => {
    const { location } = fakeLocation('/')
    const { storage, values } = fakeStorage()
    await openNativeAppLink(`https://${HOST}/join#token=${TOKEN}`, { location, storage })
    const stored = values.get(NATIVE_APP_LINK_HANDLED_KEY) ?? ''
    const fingerprints = JSON.parse(stored) as string[]
    expect(fingerprints).toHaveLength(1)
    expect(fingerprints[0]).toMatch(/^[0-9a-f]{64}$/)
    expect(stored).not.toContain(TOKEN)
    expect(stored).not.toContain('/join')
    // 邀請／分享 RPC 收的是 sha256(token)；storage 裡若出現它，等於留下一把可用的憑證。
    expect(stored).not.toContain(await sha256Hex(TOKEN))
    expect([...values.keys()]).toEqual([NATIVE_APP_LINK_HANDLED_KEY])
  })

  test('keeps only the most recent fingerprints', async () => {
    const { location } = fakeLocation('/')
    const { storage, values } = fakeStorage()
    for (let index = 0; index < 25; index += 1) {
      resetNativeAppLinkDispatchForTests()
      await openNativeAppLink(`https://${HOST}/join#token=${index.toString(16).padStart(64, '0')}`, { location, storage })
    }
    expect(JSON.parse(values.get(NATIVE_APP_LINK_HANDLED_KEY) ?? '[]')).toHaveLength(20)
  })

  test('fails closed for launch URLs but keeps warm taps working when storage is unusable', async () => {
    const url = `https://${HOST}/join#token=${TOKEN}`
    for (const storageOptions of [{ throwOnGet: true }, { throwOnSet: true }]) {
      resetNativeAppLinkDispatchForTests()
      const { calls, location } = fakeLocation('/')
      const { storage } = fakeStorage({}, storageOptions)
      // getLaunchUrl 一定是重送；無法確認有沒有處理過時寧可不導向，也不冒 reload 循環的風險。
      expect(await openNativeAppLink(url, { fromLaunch: true, location, storage })).toBe(false)
      expect(calls).toEqual([])
      // 同一次載入內，較晚到的 appUrlOpen 不能被上面失敗的佔位擋掉，點連結仍要有反應。
      expect(await openNativeAppLink(url, { location, storage })).toBe(true)
      expect(await openNativeAppLink(url, { location, storage })).toBe(false)
      expect(calls).toEqual([`assign:/join#token=${TOKEN}`])
    }
  })

  test('treats a corrupted fingerprint list as storage failure', async () => {
    const { calls, location } = fakeLocation('/')
    const { storage } = fakeStorage({ [NATIVE_APP_LINK_HANDLED_KEY]: '{not json' })
    expect(await openNativeAppLink(`https://${HOST}/join#token=${TOKEN}`, { fromLaunch: true, location, storage })).toBe(false)
    expect(calls).toEqual([])
  })

  test('never writes the link to the console', async () => {
    const original = { log: console.log, info: console.info, warn: console.warn, error: console.error, debug: console.debug }
    const logged: unknown[] = []
    for (const level of Object.keys(original) as (keyof typeof original)[]) console[level] = (...args: unknown[]) => { logged.push(...args) }
    try {
      const { location } = fakeLocation('/')
      const { storage } = fakeStorage({}, { throwOnSet: true })
      await openNativeAppLink(`https://${HOST}/join#token=${TOKEN}`, { location, storage })
      await openNativeAppLink(`https://${HOST}/share#token=${TOKEN}`, { fromLaunch: true, location, storage })
      await openNativeAppLink(`https://evil.example/join#token=${TOKEN}`, { location, storage })
      await openNativeAppLink('not a URL', { location, storage })
    } finally {
      Object.assign(console, original)
    }
    expect(logged).toEqual([])
  })
})
