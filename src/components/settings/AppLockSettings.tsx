/*
檔案用途：設定頁的「用 Face ID／指紋解鎖 App」開關與背景逾時分鐘數（issue #821）；只在 iOS 原生殼顯示，預設關閉。
所在層：src/components/settings；自己管狀態、只寫這台裝置的 localStorage，不寫資料庫、不碰 Supabase session。
主要關聯：SettingsPage、src/lib/preferences/appLockPreference.ts、src/lib/nativeAppLock.ts、src/components/system/AppLockGate.tsx。
*/
import { useEffect, useState } from 'react'
import { useI18n, type LocalizedText } from '../../lib/i18n'
import { getNativePlatform, isNativeApp } from '../../lib/platform'
import { authenticateAppLock, checkAppLockAvailability, setAppLockPrivacyCover } from '../../lib/nativeAppLock'
import {
  APP_LOCK_TIMEOUT_OPTIONS,
  readAppLockPreference,
  saveAppLockPreference,
  subscribeAppLockPreference,
  type AppLockPreference,
  type AppLockTimeoutMinutes,
} from '../../lib/preferences/appLockPreference'

const TIMEOUT_LABELS: Record<AppLockTimeoutMinutes, LocalizedText> = {
  1: { id: '1 menit', zh: '1 分鐘', en: '1 minute' },
  5: { id: '5 menit', zh: '5 分鐘', en: '5 minutes' },
  15: { id: '15 menit', zh: '15 分鐘', en: '15 minutes' },
  30: { id: '30 menit', zh: '30 分鐘', en: '30 minutes' },
}

export function AppLockSettings() {
  // 與 AppLockGate 同一個守門：只有 iOS 殼有原生實作；Web／PWA 沒有這個功能（issue 範圍外），Android 尚未實作。
  if (!isNativeApp() || getNativePlatform() !== 'ios') return null
  return <AppLockSettingsNative />
}

function AppLockSettingsNative() {
  const { text } = useI18n()
  const [preference, setPreference] = useState<AppLockPreference>(() => readAppLockPreference())
  // null 代表還在詢問 OS；詢問完成前先鎖住開關，避免在不支援的裝置上被打開。
  const [available, setAvailable] = useState<boolean | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<LocalizedText | null>(null)

  // 鎖定畫面可能在這張卡仍掛載時把功能關掉（裝置已沒有密碼），訂閱後一律以儲存值為準重新顯示。
  useEffect(() => subscribeAppLockPreference(() => setPreference(readAppLockPreference())), [])

  useEffect(() => {
    let cancelled = false
    void checkAppLockAvailability().then(result => {
      if (!cancelled) setAvailable(result)
    })
    return () => { cancelled = true }
  }, [])

  // 以儲存值為底再套用這次的變更，而不是用掛載時的 React state：鎖定畫面可能在設定頁仍掛載時
  // 因「裝置已沒有密碼」把功能關掉；若拿舊 state 回寫，改逾時就會在沒有驗證的情況下把 App 鎖重新打開。
  const update = (patch: Partial<AppLockPreference>) => {
    const stored = saveAppLockPreference({ ...readAppLockPreference(), ...patch })
    // 原生遮蔽旗標與畫面都跟「實際存進去的值」同步，而不是要寫的值：寫入失敗時不能顯示成已開啟。
    void setAppLockPrivacyCover(stored.enabled)
    setPreference(stored)
    return stored
  }

  const handleToggle = async (enabled: boolean) => {
    setError(null)
    if (!enabled) {
      update({ enabled: false })
      return
    }
    // 開啟前先實際驗證一次：確認這台裝置真的能解鎖，避免開了之後才發現解不開；
    // 也確保是手機主人本人開啟，而不是別人在未鎖定的空檔替你開。
    setBusy(true)
    try {
      const result = await authenticateAppLock(text({
        id: 'Konfirmasi untuk mengaktifkan kunci aplikasi',
        zh: '確認身分以開啟 App 鎖',
        en: 'Confirm to turn on the app lock',
      }))
      if (result === 'success') {
        if (!update({ enabled: true }).enabled) {
          setError({ id: 'Pengaturan tidak dapat disimpan di perangkat ini. Kunci aplikasi tetap nonaktif.', zh: '這台裝置無法儲存設定，App 鎖維持關閉。', en: 'The setting could not be saved on this device. The app lock stays off.' })
        }
        return
      }
      if (result === 'unavailable') setAvailable(false)
      if (result === 'failed') setError({ id: 'Verifikasi gagal. Kunci aplikasi tetap nonaktif.', zh: '驗證失敗，App 鎖維持關閉。', en: 'Verification failed. The app lock stays off.' })
    } finally {
      setBusy(false)
    }
  }

  const disabled = busy || available !== true

  return (
    <section className="mt-6 rounded-2xl border border-gray-200 bg-white p-4" aria-labelledby="app-lock-settings-title">
      <h2 id="app-lock-settings-title" className="font-bold text-gray-900">{text({ id: 'Kunci aplikasi', zh: 'App 鎖', en: 'App lock' })}</h2>
      <p id="app-lock-settings-help" className="mt-1 text-sm text-gray-500">
        {text({
          id: 'Untuk ponsel yang dipakai bersama. Setelah aplikasi lama di latar belakang, perlu Face ID, sidik jari, atau kode sandi perangkat untuk membukanya lagi.',
          zh: '適合多人共用的手機。App 在背景超過設定時間後，回來要用 Face ID、指紋或裝置密碼才能繼續看。',
          en: 'For a shared phone. After the app has been in the background for the set time, Face ID, fingerprint, or the device passcode is needed to see it again.',
        })}
      </p>

      <label htmlFor="app-lock-enabled" className={`mt-4 flex min-h-12 items-center justify-between gap-3 rounded-xl bg-gray-50 px-3 py-2 text-sm ${disabled ? 'cursor-not-allowed opacity-70' : 'cursor-pointer'}`}>
        <span className="block font-semibold text-gray-900">{text({ id: 'Buka aplikasi dengan Face ID / sidik jari', zh: '用 Face ID／指紋解鎖 App', en: 'Unlock the app with Face ID / fingerprint' })}</span>
        <input
          id="app-lock-enabled"
          type="checkbox"
          checked={preference.enabled}
          disabled={disabled}
          onChange={event => void handleToggle(event.target.checked)}
          aria-describedby="app-lock-settings-help"
          className="h-5 w-5 shrink-0 accent-blue-600"
        />
      </label>

      {preference.enabled && (
        <label htmlFor="app-lock-timeout" className="mt-3 flex min-h-12 items-center justify-between gap-3 rounded-xl bg-gray-50 px-3 py-2 text-sm">
          <span className="font-semibold text-gray-900">{text({ id: 'Kunci setelah di latar belakang selama', zh: '在背景多久後上鎖', en: 'Lock after being in the background for' })}</span>
          <select
            id="app-lock-timeout"
            value={preference.timeoutMinutes}
            onChange={event => update({ timeoutMinutes: Number(event.target.value) as AppLockTimeoutMinutes })}
            className="min-h-11 rounded-lg border border-gray-300 bg-white px-2 text-sm"
          >
            {APP_LOCK_TIMEOUT_OPTIONS.map(minutes => (
              <option key={minutes} value={minutes}>
                {text(TIMEOUT_LABELS[minutes])}
              </option>
            ))}
          </select>
        </label>
      )}

      {available === false && (
        <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
          {text({
            id: 'Perangkat ini belum memiliki kode sandi. Atur kode sandi di Pengaturan iPhone terlebih dahulu.',
            zh: '這台裝置尚未設定密碼，請先到 iPhone「設定」開啟密碼。',
            en: 'This device has no passcode yet. Set one up in iPhone Settings first.',
          })}
        </p>
      )}
      {error && <p role="alert" className="mt-2 rounded-xl bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">{text(error)}</p>}

      {/* issue #821 要求明確說明：這不是登出，也不改變登入狀態；真的要讓別人無法使用請登出。 */}
      <p className="mt-3 text-xs text-gray-500">
        {text({
          id: 'Ini hanya kunci layar di perangkat ini; Anda tidak keluar dari akun. Untuk keluar dari akun, ketuk "Keluar".',
          zh: '這只是這台裝置上的畫面鎖，不會登出；要清除登入狀態請按「登出」。',
          en: 'This is only a screen lock on this device; you stay signed in. To clear your sign-in, use "Sign out".',
        })}
      </p>
    </section>
  )
}
