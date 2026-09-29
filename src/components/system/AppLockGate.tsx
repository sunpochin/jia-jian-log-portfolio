/*
檔案用途：iOS 原生殼的 App 鎖遮罩——背景逾時回前景時蓋住整個畫面並要求 Face ID／Touch ID／裝置密碼（issue #821）；
  App 暫時非作用中時先遮住畫面，避免多工畫面或控制中心下拉時露出健康數值。
所在層：src/components/system；由 main.tsx 在全域外層掛載，Web／PWA／Android 完全不渲染。
主要關聯：src/hooks/useAppLock.ts（狀態機）、src/lib/platform.ts（iOS 原生殼守門）、PwaUpdateGuard（登記全域遮罩 'app-lock'，
  讓 NativeUpdatePrompt／PwaInstallPrompt 在鎖定時不彈出）。
*/
import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useI18n } from '../../lib/i18n'
import { getNativePlatform, isNativeApp } from '../../lib/platform'
import { usePwaUpdateGuard } from '../../lib/pwaUpdateGuard'
import { useAppLock } from '../../hooks/useAppLock'

export function AppLockGate() {
  // 只有 iOS 殼有原生 AppLock plugin；Android 尚未實作，若在 Android 上誤開會變成「永遠解不開的鎖」，
  // 所以這裡以平台守門而不是只靠設定值。Web／PWA 的行為維持零變更（ADR-004）。
  if (!isNativeApp() || getNativePlatform() !== 'ios') return null
  return <AppLockGateNative />
}

function AppLockGateNative() {
  const { text } = useI18n()
  const { registerGlobalOverlay } = usePwaUpdateGuard()
  const { locked, obscured, authenticating, failed, unlock } = useAppLock(true, text({
    id: 'Buka kunci untuk melihat catatan perawatan',
    zh: '解鎖以查看照護紀錄',
    en: 'Unlock to view care records',
  }))
  const covering = locked || obscured

  useEffect(() => {
    registerGlobalOverlay('app-lock', covering)
    return () => registerGlobalOverlay('app-lock', false)
  }, [covering, registerGlobalOverlay])

  useEffect(() => {
    // 只蓋一層不透明遮罩還不夠：底下的輸入框仍可能保有焦點（鍵盤還開著），讀屏器也仍讀得到健康數值。
    // 對 #root 設 inert 讓整棵 App 無法聚焦、點擊或被無障礙工具讀取；遮罩本身用 portal 放在 #root 外面才不會一起失效。
    // 底下的畫面刻意保持掛載，未存的表單草稿不會因為上鎖而消失。
    const root = document.getElementById('root')
    if (!root) return
    if (covering) {
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
      root.setAttribute('inert', '')
      root.setAttribute('aria-hidden', 'true')
    } else {
      root.removeAttribute('inert')
      root.removeAttribute('aria-hidden')
    }
    return () => {
      root.removeAttribute('inert')
      root.removeAttribute('aria-hidden')
    }
  }, [covering])

  if (!covering) return null

  return createPortal(
    // 完全不透明的白底、不顯示任何病人名稱或數值：遮罩本身就是鎖定畫面，不能洩漏它在保護的東西。
    <div
      className="fixed inset-0 z-[1000] flex flex-col items-center justify-center bg-white px-6 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] text-center text-gray-900"
      role={locked ? 'dialog' : undefined}
      aria-modal={locked ? true : undefined}
      aria-labelledby={locked ? 'app-lock-title' : undefined}
    >
      <span className="text-6xl" aria-hidden="true">🔒</span>
      {locked && (
        <>
          <h1 id="app-lock-title" className="mt-4 text-2xl font-black">
            {text({ id: 'Aplikasi terkunci', zh: 'App 已鎖定', en: 'App locked' })}
          </h1>
          <p className="mt-2 max-w-sm text-base text-gray-600">
            {text({
              id: 'Gunakan Face ID, sidik jari, atau kode sandi perangkat untuk membuka.',
              zh: '請用 Face ID、指紋或裝置密碼解鎖。',
              en: 'Use Face ID, fingerprint, or your device passcode to unlock.',
            })}
          </p>
          {failed && (
            <p role="alert" className="mt-4 rounded-xl bg-red-50 px-4 py-2 text-sm font-semibold text-red-700">
              {text({ id: 'Gagal membuka kunci. Coba lagi.', zh: '解鎖失敗，請再試一次。', en: 'Unlock failed. Please try again.' })}
            </p>
          )}
          {/* 大按鈕、高對比：半夜單手也要一次點中（15 秒原則、長輩可視性）。 */}
          <button
            type="button"
            onClick={() => void unlock()}
            disabled={authenticating}
            className="mt-6 min-h-14 w-full max-w-xs rounded-2xl bg-indigo-600 px-6 text-lg font-bold text-white active:bg-indigo-700 disabled:opacity-60"
          >
            {authenticating
              ? text({ id: 'Memeriksa…', zh: '驗證中…', en: 'Checking…' })
              : text({ id: 'Buka kunci', zh: '解鎖', en: 'Unlock' })}
          </button>
          <p className="mt-6 max-w-sm text-xs text-gray-500">
            {text({
              id: 'Ini hanya kunci layar. Anda tidak keluar dari akun dan data tidak dihapus.',
              zh: '這只是畫面鎖，不會登出，也不會刪除任何資料。',
              en: 'This is only a screen lock. You stay signed in and no data is deleted.',
            })}
          </p>
        </>
      )}
    </div>,
    document.body,
  )
}
