// 檔案用途：宣告 Vite 與專案建置時注入的全域型別。
// 所在層：src 根目錄；提供前端環境變數與建置常數的 TypeScript 型別。
// 主要關聯：由 vite.config.ts 注入，供 appInfo.ts 與其他前端程式使用。
/// <reference types="vite/client" />
// 更新提示使用 vite-plugin-pwa 的虛擬 React 模組；集中載入型別，避免每個元件自行宣告而漂移。
/// <reference types="vite-plugin-pwa/react" />

declare const __APP_VERSION__: string
// 建置時注入日期，讓畫面不再依賴人工修改固定字串。
declare const __APP_RELEASE_DATE__: string
// 建置時注入提交識別，讓照護者回報問題時可以辨認實際執行的 build。
declare const __APP_GIT_SHA__: string
// 建置環境由 Vercel branch／環境或本機覆寫值推導，避免把 preview 誤標成 production。
declare const __APP_ENVIRONMENT__: string
// 保留 ISO 建置時間供 /version.json 與 release 頁面交叉比對。
declare const __APP_BUILD_TIME__: string
