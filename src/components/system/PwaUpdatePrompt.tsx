/*
檔案用途：當 Service Worker 偵測到新版本時顯示 PWA 升級提示條。
所在層：src/components；為跨頁面全域提示元件。
主要關聯：由 App.tsx 或主外殼掛載，調用 lib/pwaUpdate 並向 PwaUpdateGuard 登記全域更新遮罩。
*/
import { useCallback, useEffect, useRef, useState } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { localized, type LocalizedText, useI18n } from '../../lib/i18n'
import { canApplyPwaUpdate, canCheckForPwaUpdate, PWA_UPDATE_CHECK_INTERVAL_MS } from '../../lib/pwaUpdate'
import { usePwaUpdateGuard } from '../../lib/pwaUpdateGuard'

export function PwaUpdatePrompt() {
  const { locale } = useI18n()
  // Provider 缺失要直接暴露組合錯誤；共用 localized() 只防守字典漏掉當前語系，避免提示變空白。
  const translate = useCallback((value: LocalizedText) => localized(value, locale), [locale])
  const { hasUnsavedInput, registerGlobalOverlay } = usePwaUpdateGuard()
  const registrationRef = useRef<ServiceWorkerRegistration | undefined>()
  const [isUpdating, setIsUpdating] = useState(false)
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    immediate: true,
    onRegisteredSW(_swUrl, registration) {
      registrationRef.current = registration
    },
    onRegisterError(error) {
      console.error('[pwa service worker registration error]', error)
    },
  })

  useEffect(() => {
    // 為什麼要向共用 guard 登記：安裝提示與更新提示同時存在時，較高的 z-index 會蓋住真正重要的更新操作。
    registerGlobalOverlay('pwa-update', needRefresh || isUpdating)
    return () => registerGlobalOverlay('pwa-update', false)
  }, [isUpdating, needRefresh, registerGlobalOverlay])

  const checkForUpdate = useCallback(async () => {
    const registration = registrationRef.current
    if (!registration || !canCheckForPwaUpdate({
      online: navigator.onLine,
      visibilityState: document.visibilityState,
    })) return

    try {
      await registration.update()
      // 使用者選擇稍後時 worker 已在 waiting；再次檢查要重新提醒，不能等不存在的下一個版本。
      if (registration.waiting) setNeedRefresh(true)
    } catch (error) {
      // 暫時斷線不應阻斷照護流程；online/前景事件與下一輪排程會自然重試。
      console.error('[pwa update check error]', error)
    }
  }, [setNeedRefresh])

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return

    const checkWhenVisible = () => {
      if (document.visibilityState === 'visible') void checkForUpdate()
    }
    // iOS（含 iOS Chrome，底層仍是 WebKit）從背景／多工切換器切回時走 bfcache 還原，
    // 常常不會觸發 visibilitychange，但一定會觸發 pageshow；漏聽這個事件會讓舊分頁
    // 長期停在背景後，回到前景也檢查不到新版本、更新提示就不會出現。
    const handlePageShow = () => void checkForUpdate()
    const intervalId = window.setInterval(() => void checkForUpdate(), PWA_UPDATE_CHECK_INTERVAL_MS)

    document.addEventListener('visibilitychange', checkWhenVisible)
    window.addEventListener('online', checkWhenVisible)
    window.addEventListener('pageshow', handlePageShow)
    void checkForUpdate()

    return () => {
      window.clearInterval(intervalId)
      document.removeEventListener('visibilitychange', checkWhenVisible)
      window.removeEventListener('online', checkWhenVisible)
      window.removeEventListener('pageshow', handlePageShow)
    }
  }, [checkForUpdate])

  if (!needRefresh && !isUpdating) return null

  const applyUpdate = async () => {
    if (!canApplyPwaUpdate(hasUnsavedInput)) return
    setIsUpdating(true)
    try {
      // 只有使用者明確按下更新才讓 waiting worker 接管並重載，保護尚未送出的表單內容。
      await updateServiceWorker(true)
    } catch (error) {
      console.error('[pwa update apply error]', error)
      setIsUpdating(false)
    }
  }

  if (isUpdating) {
    return (
      <div
        className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/55 p-5 backdrop-blur-sm"
        role="status"
        aria-live="assertive"
      >
        <div className="w-full max-w-sm rounded-3xl bg-white p-6 text-center text-slate-900 shadow-2xl">
          <div className="mx-auto h-9 w-9 animate-spin rounded-full border-4 border-emerald-200 border-t-emerald-600" aria-hidden="true" />
          <p className="mt-4 font-black">{translate({ id: 'Sistem sedang diperbarui…', zh: '系統正在更新，請稍候…', en: 'Sistem currently diUpdate…' })}</p>
        </div>
      </div>
    )
  }

  return (
    <section
      className="fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+0.75rem)] z-[60] mx-auto max-w-md rounded-3xl border border-emerald-200 bg-white p-5 text-slate-900 shadow-2xl"
      role="dialog"
      aria-labelledby="pwa-update-title"
      aria-describedby="pwa-update-description"
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 text-2xl" aria-hidden="true">🔄</span>
        <div>
          <h2 id="pwa-update-title" className="font-black">
            {translate({ id: 'Versi baru tersedia', zh: '已有新版本', en: 'New version available' })}
          </h2>
          <div id="pwa-update-description" className="mt-2 space-y-1 text-xs leading-relaxed text-slate-600">
            <p className={hasUnsavedInput ? 'font-bold text-amber-800' : undefined}>
              {translate(hasUnsavedInput
                ? { id: 'Simpan pengukuran yang belum tersimpan terlebih dahulu.', zh: '目前量測尚未儲存，請先儲存後才能更新。', en: 'Save the current measurement before updating.' }
                : { id: 'Selesaikan dan simpan isian saat ini, lalu perbarui aplikasi.', zh: '請先完成並儲存目前輸入，再更新 App。', en: 'Finish and save the current entry, then update the app.' })}
            </p>
          </div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => setNeedRefresh(false)}
          className="min-h-12 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 active:bg-slate-100"
        >
          {translate({ id: 'Nanti', zh: '稍後', en: 'Later' })}
        </button>
        <button
          type="button"
          onClick={() => void applyUpdate()}
          disabled={!canApplyPwaUpdate(hasUnsavedInput)}
          className="min-h-12 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-black text-white shadow-sm active:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-600"
        >
          {translate(hasUnsavedInput
            ? { id: 'Simpan dulu', zh: '請先儲存', en: 'Save dulu' }
            : { id: 'Perbarui & buka lagi', zh: '更新並重新開啟', en: 'Update and reopen' })}
        </button>
      </div>
    </section>
  )
}
