/*
檔案用途：原生殼 App 鎖的狀態機——記錄進背景時間、回前景時依逾時決定是否上鎖、自動叫出 Face ID／裝置密碼，
  以及 App 切到非作用中（多工畫面、控制中心）時先遮住畫面（issue #821）。
所在層：src/hooks；只管「畫面要不要蓋住」，不登出、不動 Supabase session、不讀任何健康資料。
主要關聯：src/components/system/AppLockGate.tsx（唯一呼叫端）、src/lib/preferences/appLockPreference.ts（設定與逾時判斷）、
  src/lib/nativeAppLock.ts（原生 LocalAuthentication 橋接）、@capacitor/app 的 pause／resume／appStateChange 事件。
*/
import { useCallback, useEffect, useRef, useState } from 'react'
import { App } from '@capacitor/app'
import { authenticateAppLock, setAppLockPrivacyCover } from '../lib/nativeAppLock'
import {
  readAppLockPreference,
  readLastBackgroundAt,
  saveAppLockPreference,
  saveLastBackgroundAt,
  shouldLockOnResume,
} from '../lib/preferences/appLockPreference'

export interface AppLockState {
  /** 需要驗證才能繼續使用。 */
  locked: boolean
  /** 只是暫時遮住（App 非作用中），回到作用中就自動移除，不需要驗證。 */
  obscured: boolean
  authenticating: boolean
  /** 最近一次驗證被 OS 判定失敗（不含使用者自己取消），用來顯示「再試一次」提示。 */
  failed: boolean
  unlock: () => Promise<void>
}

function lockRequiredNow(): boolean {
  return shouldLockOnResume({ preference: readAppLockPreference(), backgroundedAt: readLastBackgroundAt(), now: Date.now() })
}

/**
 * @param enabled 只有 iOS 原生殼才傳 true；Web／PWA／Android 完全不掛監聽、永遠不上鎖。
 * @param reason 系統驗證對話框上顯示的用途說明（已依目前語言翻好）。
 */
export function useAppLock(enabled: boolean, reason: string): AppLockState {
  // 冷啟動要在第一次 render 就決定是否上鎖（lazy initializer），不能等 effect：
  // 等 effect 才上鎖的話，第一個畫面會先閃出健康數值再被蓋住。
  const [locked, setLocked] = useState(() => enabled && lockRequiredNow())
  const [obscured, setObscured] = useState(false)
  const [authenticating, setAuthenticating] = useState(false)
  const [failed, setFailed] = useState(false)

  // 事件監聽只掛一次，需要讀到最新值的狀態都走 ref，避免每次 render 重新掛 Capacitor listener。
  const lockedRef = useRef(locked)
  const inFlightRef = useRef(false)
  // 每一輪上鎖只自動叫一次驗證：使用者按取消後若又自動彈出，會變成關不掉的迴圈；之後改由畫面上的按鈕重試。
  const autoPromptPendingRef = useRef(locked)
  const reasonRef = useRef(reason)
  reasonRef.current = reason

  const unlock = useCallback(async () => {
    if (inFlightRef.current) return
    inFlightRef.current = true
    setAuthenticating(true)
    setFailed(false)
    try {
      const result = await authenticateAppLock(reasonRef.current)
      if (result === 'success') {
        lockedRef.current = false
        setLocked(false)
        return
      }
      if (result === 'unavailable') {
        // 原生端只在「裝置已經沒有密碼」時回報 unavailable；能拿掉裝置密碼的人本來就知道密碼，
        // 繼續鎖著只會把照護者永遠擋在 App 外面，所以解鎖並關閉設定，設定頁會顯示需要先設定裝置密碼。
        saveAppLockPreference({ ...readAppLockPreference(), enabled: false })
        void setAppLockPrivacyCover(false)
        lockedRef.current = false
        setLocked(false)
        return
      }
      // 使用者自己取消不算錯誤，不顯示紅字；只有 OS 判定驗證失敗才提示。兩種情況都維持上鎖、絕不登出。
      setFailed(result === 'failed')
    } finally {
      inFlightRef.current = false
      setAuthenticating(false)
    }
  }, [])

  useEffect(() => {
    if (!enabled) return
    // 原生遮蔽旗標只存在原生記憶體，每次 App 啟動都要依本機設定重新同步一次。
    void setAppLockPrivacyCover(readAppLockPreference().enabled)

    // 冷啟動已經上鎖：App 此時已在前景，不會再收到 appStateChange(active)，直接叫出驗證。
    if (lockedRef.current && autoPromptPendingRef.current) {
      autoPromptPendingRef.current = false
      void unlock()
    }

    // 這一輪「離開前景」是否已經在 inactive 記過時間；回到 active 才清掉。
    let stampedSinceActive = false

    const listeners = [
      // 事件順序（iOS）：切走時 appStateChange(inactive) → pause；切回時 resume → appStateChange(active)。
      // Face ID 對話框本身也會觸發 inactive／active，但不會觸發 pause／resume，所以「要不要上鎖」只在 resume 判斷。
      App.addListener('appStateChange', ({ isActive }) => {
        if (!isActive) {
          // 離開時間在 inactive 就記，而不是等 pause：pause 是 didEnterBackground 之後才送進 WebView 的 JS 事件，
          // WebView 若在那之前就被系統暫停，pause 會延到「回來時」才和 resume 一起送達，記下的就變成回來的時間，
          // 放了一小時也判斷成「剛離開」而不上鎖。inactive 發生時 App 還在前景、JS 一定跑得到；
          // Face ID 對話框或控制中心造成的 inactive 只會讓時間記得比較早，只可能多鎖、不會少鎖。
          saveLastBackgroundAt(Date.now())
          stampedSinceActive = true
          // 非作用中時先遮住：多工畫面預覽、控制中心下拉時都不該看到健康數值。只在開啟 App 鎖時才遮，關閉時完全無感。
          if (readAppLockPreference().enabled) setObscured(true)
          return
        }
        stampedSinceActive = false
        setObscured(false)
        if (lockedRef.current && autoPromptPendingRef.current) {
          autoPromptPendingRef.current = false
          void unlock()
        }
      }),
      App.addListener('pause', () => {
        // 只當備援：這一輪已在 inactive 記過就不覆寫，避免延遲送達的 pause 把時間改成「回來的時間」（見上方註解）。
        if (!stampedSinceActive) saveLastBackgroundAt(Date.now())
      }),
      App.addListener('resume', () => {
        // 只會從「未上鎖」變成「上鎖」，不會因為這次回來還在逾時內就把原本鎖著的畫面解開。
        if (!lockedRef.current && !lockRequiredNow()) return
        lockedRef.current = true
        autoPromptPendingRef.current = true
        setLocked(true)
        setFailed(false)
      }),
    ]

    return () => {
      for (const listener of listeners) void listener.then(handle => handle.remove())
    }
  }, [enabled, unlock])

  return { locked, obscured, authenticating, failed, unlock }
}
