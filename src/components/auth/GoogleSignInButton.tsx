/*
檔案用途：呈現 Google 官方 Sign in with Google 按鈕並把 ID token 送入 Supabase session。
所在層：src/components/auth；供公開登入頁與需要重新登入的入口共用。
主要關聯：使用 Google Identity Services loader、src/lib/auth.ts 的 ID-token adapter 與目前語系。
*/
import { useEffect, useRef, useState } from 'react'
import { signInWithGoogleIdToken, isWebView } from '../../lib/auth'
import { isNativeApp, startNativeGoogleOAuth } from '../../lib/nativeAuth'
import { createGoogleNonce, getGoogleClientId, hashGoogleNonce, loadGoogleIdentityServices } from '../../lib/googleIdentity'
import { useI18n, type LocalizedText, type Locale } from '../../lib/i18n'
import { analyticsLoginEntry, trackEvent } from '../../lib/analytics'

type GoogleSignInButtonProps = {
  locale: Locale
  onError: (message: LocalizedText | null) => void
  width?: number
}

type SetupStatus = 'loading' | 'ready' | 'signing-in' | 'missing-config' | 'error'

const setupError: LocalizedText = {
  id: 'Google belum siap di browser internal. Buka halaman ini di Safari atau Chrome untuk login.',
  zh: 'Google 在應用內瀏覽器中無法使用。請用 Safari 或 Chrome 等瀏覽器開啟此頁面。', en: 'Google is not available in in-app browsers. Please open this page in a browser like Safari or Chrome.',
}

const missingClientId: LocalizedText = {
  id: 'Login Google belum dikonfigurasi untuk lingkungan ini.',
  zh: '這個環境尚未設定 Google 登入。', en: 'Google sign-in is not configured for this environment yet.',
}

const tokenError: LocalizedText = {
  id: 'Google tidak mengembalikan kredensial masuk. Silakan coba lagi.',
  zh: 'Google 沒有回傳登入憑證，請再試一次。', en: 'Google did not return sign in credentials, please try again.',
}

const signInError: LocalizedText = {
  id: 'Login Google gagal. Silakan coba lagi.',
  zh: 'Google 登入失敗，請再試一次。', en: 'Google sign in failed, please try again.',
}

export function GoogleSignInButton({ locale, onError, width }: GoogleSignInButtonProps) {
  const { text } = useI18n()
  const buttonRef = useRef<HTMLDivElement>(null)
  const onErrorRef = useRef(onError)
  const clientId = getGoogleClientId()
  const nativeApp = isNativeApp()
  const [status, setStatus] = useState<SetupStatus>(clientId ? 'loading' : 'missing-config')
  const [setupMessage, setSetupMessage] = useState<LocalizedText | null>(clientId ? null : missingClientId)

  useEffect(() => {
    onErrorRef.current = onError
  }, [onError])

  useEffect(() => {
    let cancelled = false
    const inWebView = isWebView()

    if (nativeApp) {
      // iOS／Android POC 改由系統瀏覽器承接 OAuth；原生 WebView 不載入 GIS iframe，也避免 Google WebView 政策阻擋登入。
      setSetupMessage(null)
      setStatus('ready')
      onErrorRef.current(null)
      return () => { cancelled = true }
    }

    if (inWebView) {
      setSetupMessage(setupError)
      setStatus('error')
      onErrorRef.current(null)
      return () => { cancelled = true }
    }

    setSetupMessage(clientId ? null : missingClientId)
    setStatus(clientId ? 'loading' : 'missing-config')
    onErrorRef.current(null)

    if (!clientId) return () => { cancelled = true }

    const setup = async () => {
      const nonce = createGoogleNonce()
      const hashedNonce = await hashGoogleNonce(nonce)
      const googleIdentity = await loadGoogleIdentityServices()
      if (cancelled || !buttonRef.current) return

      googleIdentity.initialize({
        client_id: clientId,
        nonce: hashedNonce,
        // 目前 GIS 的 FedCM opt-in 是 button 欄位；舊的 use_fedcm_for_prompt 已被官方標記為 deprecated。
        use_fedcm_for_button: true,
        callback: response => {
          if (cancelled) return
          const credential = response.credential?.trim()
          if (!credential) {
            setStatus('ready')
            onErrorRef.current(tokenError)
            return
          }

          setStatus('signing-in')
          onErrorRef.current(null)
          void signInWithGoogleIdToken(credential, nonce).then(({ error }) => {
            if (cancelled) return
            if (error) {
              console.error('[google id-token sign-in error]', error)
              setStatus('ready')
              onErrorRef.current(signInError)
              return
            }
            // 兩種邀請頁都必須保留 fragment；否則 GIS 成功後會把待申請的 token 流程丟掉。
            const invitationPath = window.location.pathname === '/join' || window.location.pathname === '/patient-invite'
            const invitationHash = invitationPath ? window.location.hash : ''
            // 這裡只記錄固定入口分類；credential、email 與 invitation hash 永遠不進分析參數。
            trackEvent('login_success', { locale, entry: analyticsLoginEntry() })
            window.location.assign(invitationPath ? `${window.location.pathname}${invitationHash}` : '/')
          }).catch(error => {
            if (cancelled) return
            console.error('[google id-token sign-in exception]', error)
            setStatus('ready')
            onErrorRef.current(signInError)
          })
        },
      })

      buttonRef.current.replaceChildren()
      // 取外層容器 (max-w-sm = 384px) 或當前螢幕可用寬度，精準限制在 200~384px，確保在 Desktop (384px) 與 Mobile (如 320~375px) 都與卡片及試用按鈕 100% 同寬
      const el = buttonRef.current
      const measuredWidth = el?.clientWidth || el?.parentElement?.clientWidth || (typeof window !== 'undefined' ? Math.min(window.innerWidth - 48, 384) : 384)
      const targetWidth = width ?? measuredWidth
      const buttonWidth = Math.min(Math.max(Math.floor(targetWidth), 200), 384)

      googleIdentity.renderButton(buttonRef.current, {
        type: 'standard',
        theme: 'outline',
        size: 'large',
        text: 'signin_with',
        shape: 'pill',
        logo_alignment: 'left',
        width: buttonWidth,
        locale: locale === 'zh' ? 'zh_TW' : 'id',
      })
      if (!cancelled) setStatus('ready')
    }

    void setup().catch(error => {
      if (cancelled) return
      console.error('[google identity services setup error]', error)
      setSetupMessage(setupError)
      setStatus('error')
    })

    const buttonElement = buttonRef.current
    return () => {
      cancelled = true
      buttonElement?.replaceChildren()
    }
  }, [clientId, locale, nativeApp, width])

  return (
    <div className="flex w-full min-h-11 flex-col items-center justify-center gap-2 overflow-hidden" data-testid="google-sign-in-entry">
      {nativeApp ? (
        <button
          type="button"
          disabled={status === 'signing-in'}
          onClick={() => {
            setStatus('signing-in')
            onErrorRef.current(null)
            void startNativeGoogleOAuth().then(() => {
              // 原生流程在 code exchange 完成後才 resolve，這時才算真正登入成功。
              trackEvent('login_success', { locale, entry: analyticsLoginEntry() })
            }).catch(() => {
              console.error('[native Google sign-in failed]')
              // 不論 plugin 回傳哪一種 throwable 都要解除 busy 狀態，否則一次失敗會永久鎖住登入按鈕。
              setStatus('ready')
              onErrorRef.current(signInError)
            })
          }}
          className="min-h-11 w-full rounded-full border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-wait disabled:opacity-60"
        >
          {text({ id: 'Masuk dengan Google', zh: '使用 Google 登入' ,en: "Sign in with Google" })}
        </button>
      ) : (
        <div ref={buttonRef} className={`w-full flex justify-center max-w-full [&>div]:max-w-full [&>iframe]:max-w-full ${status === 'signing-in' ? 'pointer-events-none opacity-60' : ''}`} />
      )}
      {(status === 'loading' || status === 'signing-in') && (
        <p role="status" aria-live="polite" className="text-xs text-gray-500">
          {text(status === 'loading'
            ? { id: 'Memuat tombol Google…', zh: '正在載入 Google 登入按鈕…', en: 'Loading Google Login Button...' }
            : { id: 'Menyelesaikan login…', zh: '正在完成登入…', en: 'Completing sign in...' })}
        </p>
      )}
      {(status === 'missing-config' || status === 'error') && setupMessage && (
        <p role="status" aria-live="polite" className="max-w-xs rounded-xl bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-800">
          {text(setupMessage)}
        </p>
      )}
    </div>
  )
}
