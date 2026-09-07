/*
檔案用途：顯示可關閉的 PWA 安裝提示，以及 iOS Safari 的加入主畫面圖解。
所在層：src/components/system；由 src/main.tsx 在公開與登入流程外層掛載。
主要關聯：src/lib/pwaInstall.ts、PwaUpdateGuard、LocaleProvider、PWA manifest 與既有 App shell。
*/

import { useEffect, useRef, useState } from 'react'
import { useI18n, type LocalizedText } from '../../lib/i18n'
import { isWebView } from '../../lib/auth'
import { usePwaUpdateGuard } from '../../lib/pwaUpdateGuard'
import {
  clearPwaInstallDismissedAt,
  isIosDevice,
  isStandalonePwa,
  persistPwaInstallDismissedAt,
  readPwaInstallDismissedAt,
  shouldShowPwaInstallPrompt,
  type BeforeInstallPromptEvent,
} from '../../lib/pwaInstall'

const INSTALL_PROMPT_TITLE = { id: 'Pasang JiaJian Log', zh: '把家健錄放到主畫面', en: 'Add JiaJian Log to your home screen' } satisfies LocalizedText
const INSTALL_PROMPT_DESCRIPTION = { id: 'Akses pencatatan yang sudah ada dengan cepat dari layar utama. Tidak ada fitur baru yang dijanjikan.', zh: '把現有的家健錄放在主畫面，之後更容易打開；安裝不會新增目前沒有的功能。', en: 'Keep the existing JiaJian Log web app one tap away. Installing does not add features that are not already available.' } satisfies LocalizedText
const INSTALL_BUTTON = { id: 'Pasang di layar utama', zh: '安裝到主畫面', en: 'Add to home screen' } satisfies LocalizedText
const NOT_NOW_BUTTON = { id: 'Nanti', zh: '稍後', en: 'Not now' } satisfies LocalizedText
const IOS_STEP_ONE = { id: 'Buka menu Bagikan di Safari.', zh: '在 Safari 點擊「分享」。', en: 'Open Safari’s Share menu.' } satisfies LocalizedText
const IOS_STEP_TWO = { id: 'Gulir lalu pilih Tambahkan ke Layar Utama.', zh: '向下滑後選擇「加入主畫面」。', en: 'Scroll down and choose Add to Home Screen.' } satisfies LocalizedText
const IOS_STEP_THREE = { id: 'Ketuk Tambah untuk menyelesaikan.', zh: '點擊「加入」完成。', en: 'Tap Add to finish.' } satisfies LocalizedText
const IOS_NOTE = { id: 'Safari iOS tidak mendukung tombol pemasangan otomatis; langkah ini memakai menu bawaan Apple.', zh: 'iOS Safari 不支援網頁自動安裝按鈕，因此使用 Apple 內建的分享選單。', en: 'iOS Safari does not support the automatic install button, so use Apple’s built-in Share menu.' } satisfies LocalizedText
const INSTALL_ERROR = { id: 'Dialog pemasangan tidak dapat dibuka. Coba lagi dari menu browser.', zh: '安裝視窗無法開啟，請稍後再從瀏覽器選單嘗試。', en: 'The install dialog could not open. Try again later from your browser menu.' } satisfies LocalizedText

function StepIcon({ step }: { step: 1 | 2 | 3 }) {
  if (step === 1) {
    return <svg aria-hidden="true" viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 16V4" /><path d="m7 9 5-5 5 5" /><path d="M5 13v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5" /></svg>
  }
  if (step === 2) {
    return <svg aria-hidden="true" viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M12 8v6M9 11h6" /></svg>
  }
  return <svg aria-hidden="true" viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="m3 11 9-8 9 8" /><path d="M5 10v10h14V10" /><path d="M9 20v-6h6v6" /></svg>
}

export function PwaInstallPrompt() {
  const { text } = useI18n()
  const { hasActiveGlobalOverlay } = usePwaUpdateGuard()
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [isIos, setIsIos] = useState(false)
  const [isInstalled, setIsInstalled] = useState(false)
  const [isDismissed, setIsDismissed] = useState(false)
  const [isInstalling, setIsInstalling] = useState(false)
  const [error, setError] = useState<LocalizedText | null>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const previousActiveElementRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    const dismissedAt = readPwaInstallDismissedAt(window.localStorage)
    setIsDismissed(!shouldShowPwaInstallPrompt(Date.now(), dismissedAt))
    setIsIos(isIosDevice(navigator.userAgent, navigator.maxTouchPoints))

    const mediaQuery = window.matchMedia('(display-mode: standalone)')
    const standaloneNavigator = navigator as Navigator & { standalone?: boolean }
    const syncInstalled = () => setIsInstalled(isStandalonePwa(mediaQuery.matches, standaloneNavigator.standalone === true))
    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault()
      // 事件可能在同一個分頁再次送達；每次重讀偏好才能讓剛按下「稍後」的 30 天期限立即生效。
      const currentDismissedAt = readPwaInstallDismissedAt(window.localStorage)
      if (shouldShowPwaInstallPrompt(Date.now(), currentDismissedAt)) setDeferredPrompt(event as BeforeInstallPromptEvent)
    }
    const handleAppInstalled = () => {
      setDeferredPrompt(null)
      setIsInstalled(true)
      clearPwaInstallDismissedAt(window.localStorage)
    }

    syncInstalled()
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    window.addEventListener('appinstalled', handleAppInstalled)
    mediaQuery.addEventListener('change', syncInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
      window.removeEventListener('appinstalled', handleAppInstalled)
      mediaQuery.removeEventListener('change', syncInstalled)
    }
  }, [])

  const isEligiblePath = window.location.pathname === '/' || window.location.pathname === '/demo'
  // 為什麼整個排除嵌入式瀏覽器：它沒有 Safari 的加入主畫面流程，而外開完整瀏覽器才是可用的安裝出口；既有 isWebView 也涵蓋 LINE。
  const isEmbeddedBrowser = isWebView()
  // ponytail: 只協調會阻塞全域流程的 overlay；頁內 modal 由既有 z-index 層級處理，不擴大成另一套 modal registry。
  const canShowInstallGuidance = !hasActiveGlobalOverlay && !isEmbeddedBrowser
  const showIosGuide = canShowInstallGuidance && isEligiblePath && isIos && !isInstalled && !isDismissed
  const showNativePrompt = canShowInstallGuidance && isEligiblePath && Boolean(deferredPrompt) && !isInstalled && !isDismissed
  const isVisible = canShowInstallGuidance && (showIosGuide || showNativePrompt || Boolean(error))

  function dismiss() {
    persistPwaInstallDismissedAt(window.localStorage)
    setIsDismissed(true)
    setDeferredPrompt(null)
    setError(null)
  }

  useEffect(() => {
    if (!isVisible) return
    previousActiveElementRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const focusTimer = window.setTimeout(() => closeButtonRef.current?.focus(), 0)
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') dismiss()
    }
    document.addEventListener('keydown', handleEscape)
    return () => {
      window.clearTimeout(focusTimer)
      document.removeEventListener('keydown', handleEscape)
      previousActiveElementRef.current?.focus()
    }
  // 關閉函式只負責收起全域提示；不把每次 render 的 inline handler 放進依賴，避免焦點反覆跳回關閉鈕。
  }, [isVisible])

  if (!isVisible) return null

  const install = async () => {
    if (!deferredPrompt || isInstalling) return
    setIsInstalling(true)
    setError(null)
    try {
      await deferredPrompt.prompt()
      const choice = await deferredPrompt.userChoice
      setDeferredPrompt(null)
      if (choice.outcome === 'accepted') {
        setIsInstalled(true)
        clearPwaInstallDismissedAt(window.localStorage)
      } else {
        persistPwaInstallDismissedAt(window.localStorage)
        setIsDismissed(true)
      }
    } catch (installError) {
      console.error('[pwa install prompt error]', installError)
      setError(INSTALL_ERROR)
    } finally {
      setIsInstalling(false)
    }
  }

  return (
    <section
      className="fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+0.75rem)] z-[40] mx-auto max-w-md rounded-3xl border border-indigo-200 bg-white p-5 text-slate-900 shadow-2xl"
      role="dialog"
      aria-labelledby="pwa-install-title"
      aria-describedby="pwa-install-description"
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-indigo-100 text-indigo-700" aria-hidden="true">
          <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 16V4" /><path d="m7 9 5-5 5 5" /><path d="M5 13v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5" /></svg>
        </div>
        <div className="min-w-0 flex-1">
          <h2 id="pwa-install-title" className="pr-8 font-black leading-6">{text(INSTALL_PROMPT_TITLE)}</h2>
          <p id="pwa-install-description" className="mt-1 text-sm leading-6 text-slate-600">{text(INSTALL_PROMPT_DESCRIPTION)}</p>
        </div>
        <button
          ref={closeButtonRef}
          type="button"
          onClick={dismiss}
          aria-label={text({ id: 'Tutup petunjuk pemasangan', zh: '關閉安裝提示', en: 'Close install guidance' })}
          className="absolute right-4 top-4 flex min-h-11 min-w-11 items-center justify-center rounded-xl text-2xl leading-none text-slate-500 transition hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600"
        >×</button>
      </div>

      {showIosGuide && (
        <>
          <ol className="mt-4 grid grid-cols-3 gap-2" aria-label={text({ id: 'Langkah pemasangan iOS', zh: 'iOS 安裝步驟', en: 'iOS install steps' })}>
            {[IOS_STEP_ONE, IOS_STEP_TWO, IOS_STEP_THREE].map((stepText, index) => (
              <li key={index} className="rounded-2xl bg-slate-50 p-3 text-center text-xs font-semibold leading-5 text-slate-700">
                <span className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-indigo-100 text-indigo-700"><StepIcon step={(index + 1) as 1 | 2 | 3} /></span>
                <span className="mt-2 block">{text(stepText)}</span>
              </li>
            ))}
          </ol>
          <p className="mt-3 text-xs leading-5 text-slate-500">{text(IOS_NOTE)}</p>
        </>
      )}

      {error && <p role="alert" className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-sm font-semibold leading-5 text-rose-800">{text(error)}</p>}

      {showNativePrompt && (
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button type="button" onClick={dismiss} className="min-h-12 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-700 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600">{text(NOT_NOW_BUTTON)}</button>
          <button type="button" onClick={() => void install()} disabled={isInstalling} className="min-h-12 rounded-xl bg-indigo-700 px-3 py-2 text-sm font-black text-white transition hover:bg-indigo-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600 disabled:cursor-wait disabled:opacity-60">{text(isInstalling ? { id: 'Memasang…', zh: '安裝中…', en: 'Adding…' } : INSTALL_BUTTON)}</button>
        </div>
      )}
    </section>
  )
}
