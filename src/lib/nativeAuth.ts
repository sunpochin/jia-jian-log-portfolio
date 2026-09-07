/*
檔案用途：提供 Capacitor iOS／Android 共用的系統瀏覽器 OAuth 與受控 deep link 轉接。
所在層：src/lib；只包裝原生 App／Browser plugin，不取代既有 Supabase auth 與 RLS。
主要關聯：由 useAuth 與 GoogleSignInButton 呼叫，將 callback code 交回 Supabase session；
         iOS／Android 共用同一份 adapter，React 畫面只需改一處就能同時反映在兩個平台。
*/
import { App, type URLOpenListenerEvent } from '@capacitor/app'
import { Capacitor } from '@capacitor/core'
import { Browser } from '@capacitor/browser'
import { supabase } from './supabase'

export const NATIVE_AUTH_CALLBACK_URL = 'jia-jian-log://auth/callback'

export type NativeAuthCallback = {
  code: string
  error?: string
}

const NATIVE_AUTH_ERROR = 'oauth_error'
const NATIVE_AUTH_CALLBACK_PARAMS = new Set(['code', 'state', 'error', 'error_code', 'error_description'])

// 只判定「是不是原生殼」，不分 iOS／Android：兩個平台都用同一套系統瀏覽器 OAuth 流程，
// 避免未來新增平台時要在每個呼叫點重複加條件。
export function isNativeApp(): boolean {
  return Capacitor.isNativePlatform()
}

/**
 * 只接受 App 自己註冊的 scheme、host 與 path；即使外部 App 傳入另一個 URL，
 * 也不能讓 WebView 把它當成 OAuth 回程處理。
 */
export function parseNativeAuthCallback(rawUrl: string): NativeAuthCallback | null {
  try {
    const url = new URL(rawUrl)
    // 禁止 fragment：OAuth implicit flow 可能把 access token 放在這裡，本 POC 只接受 PKCE code。
    if (
      url.protocol !== 'jia-jian-log:'
      || url.hostname !== 'auth'
      || url.pathname !== '/callback'
      || url.hash
      || url.username
      || url.password
      || url.port
    ) return null
    // 自訂 scheme 可能被其他 App 手寫呼叫；只接受 Supabase PKCE 會用到的欄位，避免 token 或未知 OAuth 回應被帶進 WebView。
    const queryKeys = [...url.searchParams.keys()]
    if (queryKeys.some(key => !NATIVE_AUTH_CALLBACK_PARAMS.has(key))) return null
    if ([...NATIVE_AUTH_CALLBACK_PARAMS].some(key => url.searchParams.getAll(key).length > 1)) return null
    const code = url.searchParams.get('code')?.trim()
    const error = url.searchParams.get('error')?.trim()
    const errorCode = url.searchParams.get('error_code')?.trim()
    const errorDescription = url.searchParams.get('error_description')?.trim()
    // 錯誤描述可能含 provider 回傳的個資；只回傳固定哨兵值，讓 UI 能結束等待但不攜帶原文。
    if (error || errorCode || errorDescription) return { code: '', error: NATIVE_AUTH_ERROR }
    // OAuth code 是一次性短期憑證；限制長度也避免把任意大字串送進 auth client。
    if (!code || code.length > 2048) return null
    if ((url.searchParams.get('state')?.length ?? 0) > 2048) return null
    return { code }
  } catch {
    return null
  }
}

type NativeAuthAttempt = {
  callbackReceived: boolean
  resolve: () => void
  reject: (error: Error) => void
}

let activeNativeAuthAttempt: NativeAuthAttempt | null = null

function settleNativeAuthAttempt(error?: Error): void {
  const attempt = activeNativeAuthAttempt
  if (!attempt) return
  activeNativeAuthAttempt = null
  if (error) attempt.reject(error)
  else attempt.resolve()
}

function handleNativeBrowserFinished(): void {
  const attempt = activeNativeAuthAttempt
  if (!attempt) return
  // callback handler 會先標記 callbackReceived 再呼叫 Browser.close()；因此 close 觸發的 browserFinished
  // 不能把已回程的成功登入誤判成使用者取消。真正未收到 callback 的關閉才恢復按鈕並顯示錯誤。
  if (attempt.callbackReceived) return
  settleNativeAuthAttempt(new Error('Native OAuth browser was dismissed before the callback.'))
}

async function exchangeNativeAuthCallback(event: URLOpenListenerEvent): Promise<void> {
  const callback = parseNativeAuthCallback(event.url)
  if (!callback) return
  if (activeNativeAuthAttempt) activeNativeAuthAttempt.callbackReceived = true
  await Browser.close().catch(() => undefined)
  if (callback.error || !callback.code) {
    // 不印出 callback URL：query 可能含 OAuth error description，不應進 log 或分析服務。
    console.warn('[native auth callback rejected]')
    settleNativeAuthAttempt(new Error('Native OAuth callback was rejected.'))
    return
  }
  // 交換前先清掉 callback 物件中的 code；Supabase 只在這次呼叫中接收一次性憑證，adapter 不留第二份。
  const code = callback.code
  callback.code = ''
  const { error } = await supabase.auth.exchangeCodeForSession(code)
  if (error) {
    // code 與 session 都不可寫入 log；畫面由既有 auth state 與登入錯誤 UI 接手。
    console.error('[native auth code exchange failed]')
    settleNativeAuthAttempt(new Error('Native OAuth code exchange failed.'))
    return
  }
  settleNativeAuthAttempt()
}

let nativeAuthListenerPromise: Promise<void> | null = null

async function ensureNativeAuthListeners(): Promise<void> {
  if (!nativeAuthListenerPromise) {
    nativeAuthListenerPromise = Promise.all([
      App.addListener('appUrlOpen', event => {
        void exchangeNativeAuthCallback(event).catch(() => {
          // 不把原生 callback 的 URL 或 code 帶進錯誤訊息；OAuth 失敗只停在未登入狀態。
          console.error('[native auth callback handling failed]')
          settleNativeAuthAttempt(new Error('Native OAuth callback handling failed.'))
        })
      }),
      Browser.addListener('browserFinished', handleNativeBrowserFinished),
    ]).then(() => undefined)
  }
  await nativeAuthListenerPromise
}

export async function initializeNativeAuth(): Promise<() => Promise<void>> {
  if (!isNativeApp()) return async () => undefined
  await ensureNativeAuthListeners()
  // 冷啟動時 callback 可能早於 listener 到達；getLaunchUrl 補上這個唯一競態窗口。
  const launchUrl = await App.getLaunchUrl()
  if (launchUrl?.url) await exchangeNativeAuthCallback({ url: launchUrl.url })
  // listener 跟 App 同壽命；不在 React StrictMode 的 effect cleanup 移除，避免開發模式的 mount/unmount
  // 競態讓第二次初始化拿到已被第一個 cleanup 移除的 listener，進而漏接 OAuth 回程。
  return async () => undefined
}

export async function startNativeGoogleOAuth(): Promise<void> {
  if (!isNativeApp()) throw new Error('Native OAuth is unavailable on this platform.')
  await ensureNativeAuthListeners()
  if (activeNativeAuthAttempt) throw new Error('Native OAuth is already in progress.')
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: NATIVE_AUTH_CALLBACK_URL,
      skipBrowserRedirect: true,
    },
  })
  if (error || !data.url) throw error ?? new Error('Supabase did not return an OAuth URL.')
  // 只把 Supabase 產生的 authorize URL 交給系統瀏覽器；token 永遠不經自訂 scheme。
  const result = new Promise<void>((resolve, reject) => {
    activeNativeAuthAttempt = { callbackReceived: false, resolve, reject }
  })
  try {
    await Browser.open({ url: data.url })
  } catch (error) {
    // Browser.open 失敗時 result 尚未被 await；只清掉嘗試，避免為未消費的 Promise 製造 unhandled rejection。
    activeNativeAuthAttempt = null
    throw error
  }
  await result
}
