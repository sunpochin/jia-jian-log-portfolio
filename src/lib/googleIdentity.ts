/*
檔案用途：載入 Google Identity Services、產生登入 nonce 與宣告 GIS JavaScript API 型別。
所在層：src/lib；作為登入畫面與 Supabase ID-token adapter 之間的薄介面。
主要關聯：由 GoogleSignInButton 使用，將 Google 官方按鈕的 credential 交給 src/lib/auth.ts。
*/

export interface GoogleCredentialResponse {
  credential?: string
  select_by?: string
}

export interface GoogleIdConfiguration {
  client_id: string
  callback: (response: GoogleCredentialResponse) => void
  nonce?: string
  // Google 已將舊的 use_fedcm_for_prompt 標為 deprecated；按鈕流程改用目前的 opt-in 欄位。
  use_fedcm_for_button?: boolean
}

export interface GoogleButtonConfiguration {
  type?: 'standard' | 'icon'
  theme?: 'outline' | 'filled_blue' | 'filled_black'
  size?: 'small' | 'medium' | 'large'
  text?: 'signin_with' | 'signup_with' | 'continue_with' | 'signin'
  shape?: 'rectangular' | 'pill' | 'circle' | 'square'
  logo_alignment?: 'left' | 'center'
  width?: number
  locale?: string
}

export interface GoogleIdentityApi {
  initialize(config: GoogleIdConfiguration): void
  renderButton(parent: HTMLElement, options: GoogleButtonConfiguration): void
  disableAutoSelect?(): void
}

export interface GoogleIdentityServices {
  accounts: {
    id: GoogleIdentityApi
  }
}

declare global {
  interface Window {
    google?: GoogleIdentityServices
  }
}

const GOOGLE_CLIENT_SCRIPT_ID = 'google-identity-services-script'
let googleIdentityPromise: Promise<GoogleIdentityApi> | null = null

export function getGoogleClientId(): string {
  return (import.meta.env.VITE_GOOGLE_CLIENT_ID ?? '').trim()
}

function getGoogleIdentityApi(): GoogleIdentityApi | null {
  if (typeof window === 'undefined') return null
  return window.google?.accounts?.id ?? null
}

export function loadGoogleIdentityServices(): Promise<GoogleIdentityApi> {
  const alreadyLoaded = getGoogleIdentityApi()
  if (alreadyLoaded) return Promise.resolve(alreadyLoaded)
  if (typeof document === 'undefined') return Promise.reject(new Error('Google Identity Services requires a browser.'))
  if (googleIdentityPromise) return googleIdentityPromise

  // 只有設定公開 Client ID 才載入第三方 script；未設定時讓本機與 /demo 維持可用，避免空白的 Google iframe。
  const script = document.getElementById(GOOGLE_CLIENT_SCRIPT_ID) as HTMLScriptElement | null ?? document.createElement('script')
  const isNewScript = !script.id
  if (isNewScript) {
    script.id = GOOGLE_CLIENT_SCRIPT_ID
    script.src = 'https://accounts.google.com/gsi/client'
    script.async = true
    script.defer = true
  }

  const promise = new Promise<GoogleIdentityApi>((resolve, reject) => {
    const resolveWhenReady = () => {
      const api = getGoogleIdentityApi()
      if (api) resolve(api)
      else reject(new Error('Google Identity Services loaded without its API.'))
    }

    script.addEventListener('load', resolveWhenReady, { once: true })
    script.addEventListener('error', () => {
      // 失敗後移除自己，下一次重新進入登入頁時才有機會重試，不留下失效 script 節點。
      if (isNewScript) script.remove()
      reject(new Error('Google Identity Services failed to load.'))
    }, { once: true })

    if (isNewScript) document.head.appendChild(script)
  }).catch(error => {
    googleIdentityPromise = null
    throw error
  })

  googleIdentityPromise = promise
  return promise
}

export function createGoogleNonce(): string {
  const bytes = new Uint8Array(32)
  // ID token 是登入憑證；nonce 必須由瀏覽器的密碼學亂數產生，不能用 Math.random 取代。
  globalThis.crypto.getRandomValues(bytes)
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')
}

export async function hashGoogleNonce(nonce: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(nonce))
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
}
