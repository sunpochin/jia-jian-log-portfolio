/*
檔案用途：React 應用程式的 DOM 掛載主入口與全域 Provider 包裹。
所在層：src 根目錄；為前端打包與執行的第一入口。
主要關聯：掛載 App.tsx 並引入 index.css 全域樣式、PWA 更新提示與 Vercel 的效能及流量分析；另在 render 前套用 lib/readingScale 的閱讀字級偏好。
*/
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { LocaleProvider } from './lib/i18n.tsx'
import { PwaUpdatePrompt } from './components/system/PwaUpdatePrompt.tsx'
import { PwaInstallPrompt } from './components/system/PwaInstallPrompt.tsx'
import { PwaUpdateGuardProvider } from './lib/pwaUpdateGuard.tsx'
import { TutorialProvider, TutorialOverlay } from './components/tutorial'
// 本專案屬於 Vite + React 應用程式，若載入 @vercel/speed-insights/next 會引發 Next.js 特有 hook/SSR 運行時期錯誤；因此採用 React 專用的 @vercel/speed-insights/react 子路徑
import { SpeedInsights } from '@vercel/speed-insights/react'
import { inject } from '@vercel/analytics'
import { sanitizeAnalyticsUrl } from './lib/analytics.ts'
import { applyReadingScale, initReadingScalePrintReset, readReadingScale } from './lib/readingScale.ts'

// 唯讀分享連結的接收頁明確承諾「不載入第三方分析」（見 docs/product/share-link-compliance-checklist.md
// 第 5、6 節）；分享頁沒有帳號、沒有登入狀態保護，不能讓 Vercel Analytics／Speed Insights 這類全域元件
// 照樣蒐集這個路徑的存取遙測。判斷只依賴 pathname，不依賴任何 React context，因此可以放在 render 之前。
const isShareRoute = typeof window !== 'undefined' && window.location.pathname === '/share'

// 為什麼要在 createRoot 前注入：App 的 useEffect 可能比 Analytics React 元件的 passive effect 先執行，
// 導致首個 landing_view 沒有 window.va 可以排入 queue；同步建立 queue 才能保留第一次首頁事件。
if (!isShareRoute) {
  inject({
    framework: 'react',
    beforeSend: sanitizeAnalyticsUrl,
    mode: import.meta.env.PROD ? 'production' : 'development',
  })
}

// 在 render 之前就套用閱讀字級：若等 React 掛載後才改 root font-size，
// 已經調到「特大」的長輩每次開 App 都會先看到一瞬間的小字再跳大，看起來像畫面壞掉。
// 這一步只讀 localStorage 並改一個 style，不依賴任何 Provider，所以放在最前面是安全的。
applyReadingScale(readReadingScale())

// 同樣在最前面註冊一次列印重設：inline style 的優先權高於 index.css 的 @media print 規則，
// 那條規則實際上救不了列印字級，必須在 beforeprint/afterprint 主動改寫同一個 inline style。
initReadingScalePrintReset()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <LocaleProvider>
      <PwaUpdateGuardProvider>
        <TutorialProvider>
          <App />
          <TutorialOverlay />
          {!isShareRoute && (
            <>
              {/* 於全域最外層渲染 SpeedInsights 元件，用以即時蒐集與回傳真實使用者的 Core Web Vitals 載入效能指標 */}
              <SpeedInsights />
            </>
          )}
        </TutorialProvider>
        {/* 更新提示放在所有公開與登入路由外層，避免某個早期 return 讓舊 PWA 永遠收不到新版通知。 */}
        <PwaInstallPrompt />
        <PwaUpdatePrompt />
      </PwaUpdateGuardProvider>
    </LocaleProvider>
  </StrictMode>,
)
