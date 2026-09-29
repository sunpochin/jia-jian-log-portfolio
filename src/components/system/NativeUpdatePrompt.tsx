/*
檔案用途：原生殼內比對 canonical /version.json 與內建版本，較新時顯示「請到 TestFlight／Play 更新」的非阻斷提示。
所在層：src/components/system；由 main.tsx 在全域外層掛載，Web／PWA 分支不渲染（那條路徑仍由 PwaUpdatePrompt 負責）。
主要關聯：src/lib/nativeVersionCheck.ts（純函式比對）、src/lib/platform.ts（isNativeApp／getNativePlatform 守門）、src/lib/appInfo.ts（APP_VERSION、APP_CANONICAL_URL）、PwaUpdateGuard（唯讀 hasActiveGlobalOverlay，避免與教學導覽疊加；不向 guard 登記自己，見下方元件內註解）。
*/
import { useCallback, useEffect, useState } from 'react'
import { useI18n } from '../../lib/i18n'
import { APP_CANONICAL_URL, APP_VERSION } from '../../lib/appInfo'
import { getNativePlatform, isNativeApp } from '../../lib/platform'
import { shouldShowNativeUpdatePrompt } from '../../lib/nativeVersionCheck'
import { usePwaUpdateGuard } from '../../lib/pwaUpdateGuard'

export function NativeUpdatePrompt() {
  // 原生殼的 dist/ 是 build 時打包的快照，Service Worker 更新流程在原生殼內明確 no-op（issue #812）；
  // Web／PWA 有既有的 PwaUpdatePrompt 更新流程，這裡只服務原生殼，避免兩套提示同時出現。
  if (!isNativeApp()) return null
  // /version.json 只反映 Web production 部署版號，不代表「Play 商店真的已經發布這個版本」；
  // Android 目前沒有對應的自動化發布管線（docs/operations/native-release.md §3.10 第 3 點，
  // #814／#818 待補)，在有可靠的商店發布訊號之前顯示提示會對 Android 使用者叫出不存在的更新，
  // 違反 AGENTS.md §3.7「正式使用者不得承受工程發布頻率」。iOS 因 Xcode Cloud（issue #856）
  // 已讓每次 production 批次自動同步進 TestFlight，version.json 是可靠的代理訊號，因此只擋 Android。
  if (getNativePlatform() === 'android') return null
  return <NativeUpdatePromptNative />
}

function NativeUpdatePromptNative() {
  const { text } = useI18n()
  // 只讀取，不向 guard 登記自己：這是非阻斷的小提示，不是需要獨佔畫面的 modal（同 PwaInstallPrompt
  // 的作法）。曾經讓它登記過 'native-update'，結果變成一顯示就讓 hasActiveGlobalOverlay 變 true、
  // 下一次 render 又因為擋到自己而隱藏、隱藏後又符合顯示條件——無限閃爍（Codex review 抓到的迴圈）。
  const { hasActiveGlobalOverlay } = usePwaUpdateGuard()
  const [remoteVersion, setRemoteVersion] = useState<string | null>(null)
  const [dismissed, setDismissed] = useState(false)

  const checkRemoteVersion = useCallback(async () => {
    try {
      const response = await fetch(new URL('version.json', APP_CANONICAL_URL).toString(), { cache: 'no-store' })
      if (!response.ok) return
      const data = await response.json() as { version?: unknown }
      if (typeof data.version === 'string') setRemoteVersion(data.version)
    } catch (error) {
      // 離線或 CORS 失敗時保持靜默：這是唯讀的版本比對，不能因為一次查詢失敗打擾照護流程；
      // 下一次回前景（visibilitychange／pageshow）或使用者重開 App 會自然重試。
      console.error('[native update version check error]', error)
    }
  }, [])

  useEffect(() => {
    const checkWhenVisible = () => {
      if (document.visibilityState === 'visible') void checkRemoteVersion()
    }
    // 原生殼從背景切回前景時也走 pageshow（同 PwaUpdatePrompt 對 iOS bfcache 還原的處理），
    // 避免使用者長期停在背景後回到前景卻檢查不到新版本。
    const handlePageShow = () => void checkRemoteVersion()

    void checkRemoteVersion()
    document.addEventListener('visibilitychange', checkWhenVisible)
    window.addEventListener('pageshow', handlePageShow)
    return () => {
      document.removeEventListener('visibilitychange', checkWhenVisible)
      window.removeEventListener('pageshow', handlePageShow)
    }
  }, [checkRemoteVersion])

  const shouldShow = !dismissed && !hasActiveGlobalOverlay && shouldShowNativeUpdatePrompt({
    isNative: true,
    localVersion: APP_VERSION,
    remoteVersion,
  })

  if (!shouldShow) return null

  return (
    <section
      className="fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+0.75rem)] z-[60] mx-auto max-w-md rounded-3xl border border-emerald-200 bg-white p-5 text-slate-900 shadow-2xl"
      role="dialog"
      aria-labelledby="native-update-title"
      aria-describedby="native-update-description"
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 text-2xl" aria-hidden="true">🔄</span>
        <div className="min-w-0 flex-1">
          <h2 id="native-update-title" className="font-black">
            {text({ id: 'Versi App baru tersedia', zh: '有新版本 App', en: 'A new app version is available' })}
          </h2>
          <p id="native-update-description" className="mt-2 text-xs leading-relaxed text-slate-600">
            {text({
              id: 'Perbarui aplikasi lewat TestFlight atau Play Store untuk mendapatkan versi terbaru.',
              zh: '請到 TestFlight／Play 更新到最新版本。',
              en: 'Update the app via TestFlight or the Play Store to get the latest version.',
            })}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          aria-label={text({ id: 'Tutup pemberitahuan versi baru', zh: '關閉版本更新提示', en: 'Close new version notice' })}
          className="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-xl text-2xl leading-none text-slate-500 transition hover:bg-slate-100"
        >×</button>
      </div>
    </section>
  )
}
