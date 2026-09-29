/*
檔案用途：處理應用程式外殼層與語系無關但需要隨語系或登入狀態同步的瀏覽器 chrome 副作用
（分頁標題、iOS/Android 加入主畫面 metadata、公開首頁瀏覽事件追蹤）。
所在層：src/hooks；純副作用 hook，不持有畫面渲染所需的狀態，也不回傳任何值。
主要關聯：從 App.tsx 抽出（issue #764 App.tsx 拆分），供 App 元件掛載時呼叫一次；
依賴 lib/i18n 的 useI18n() 與 lib/analytics 的 trackEvent／trackWeek1Return。
*/
import { useEffect, useRef } from 'react'
import { useI18n } from '../lib/i18n'
import { APP_DOCUMENT_TITLE, APP_HOME_SCREEN_TITLE } from '../lib/appInfo'
import { trackEvent, trackWeek1Return } from '../lib/analytics'
import type { User } from '@supabase/supabase-js'

interface UseAppChromeEffectsParams {
  isDemoMode: boolean
  loading: boolean
  user: User | null | undefined
}

// 純搬移：以下三個 effect 與原本 App.tsx 內容逐字相同，只是集中到同一個 hook 裡呼叫。
export function useAppChromeEffects({ isDemoMode, loading, user }: UseAppChromeEffectsParams) {
  const { text, locale } = useI18n()
  // 為什麼同時保留兩組啟動狀態：PWA 捷徑決定初始照護分頁，漏斗 ref 則避免公開首頁事件在 auth 尚未解析時重複送出；兩者都必須由外殼層一次建立。
  const landingViewTrackedRef = useRef(false)

  useEffect(() => {
    // /guides/* 是各自管理 document.title／meta description 的公開衛教頁（ContentGuideLayout），
    // 這裡的 effect 在子元件之後才觸發；若不排除，每次切換語言都會把子元件剛設好的頁面標題蓋回通用標題。
    if (window.location.pathname.startsWith('/guides/')) return
    // 瀏覽器分頁標題也屬於系統文案；語系切換時同步更新，避免畫面與瀏覽器標籤顯示不同語言。
    document.title = text(APP_DOCUMENT_TITLE)
    // iOS「加入主畫面」讀的是這個 meta（沒有才退回分頁標題，而分頁標題太長會被系統截斷成看不出語系的字串），
    // 跟分頁標題一樣要隨語系即時更新，才不會讓印尼文家屬桌面捷徑卡在切換前的語系文字。
    document.querySelector('meta[name="apple-mobile-web-app-title"]')?.setAttribute('content', text(APP_HOME_SCREEN_TITLE))
  }, [locale, text])

  useEffect(() => {
    // Android／桌面 Chrome「加到主畫面」讀的是 manifest 的 short_name，不吃 apple-mobile-web-app-title；
    // 建置期已經輸出印尼文與英文 manifest（見 vite.config.ts），這裡只需要切換
    // <link rel="manifest"> 指到哪一份。不放進上面那個 effect，是因為 manifest 不是頁面內容，
    // /guides/* 這類公開衛教頁也要跟著全域語系走，不能被那裡的早退邏輯連帶擋掉。
    document.querySelector('link[rel="manifest"]')?.setAttribute('href', locale === 'id' ? '/manifest-id.webmanifest' : locale === 'en' ? '/manifest-en.webmanifest' : '/manifest.webmanifest')
  }, [locale])

  useEffect(() => {
    if (window.location.pathname !== '/' || isDemoMode || loading) return
    // 為什麼等 auth 完成：持久 session 的照護者也會短暫看到 root，不能把日常回到 App 算成獲客首頁瀏覽。
    if (user) {
      trackWeek1Return({ locale })
      return
    }
    if (landingViewTrackedRef.current) return
    // 只記錄確認為未登入的公開首頁，不把登入者或目前照護對象當成事件參數。
    if (trackEvent('landing_view', { locale })) landingViewTrackedRef.current = true
  }, [isDemoMode, loading, locale, user])
}
