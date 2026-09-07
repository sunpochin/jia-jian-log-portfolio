/*
檔案用途：加到主畫面的桌面捷徑短標題（PWA manifest short_name／iOS apple-mobile-web-app-title 共用同一份值）。
所在層：src/lib 共用常數層；刻意獨立於 appInfo.ts 之外，不依賴任何建置期注入的 __APP_VERSION__ 等常數。
主要關聯：由 vite.config.ts（建置期產生中文／印尼文兩份 manifest）與 src/lib/appInfo.ts（執行期給 App.tsx
用來更新 apple-mobile-web-app-title meta）共用同一份定義，避免兩邊各自寫一次字串而悄悄失去同步——
這正是先前那次「印尼文版加好了，中文版 manifest short_name 卻還停在英文 JiaJian Log」的成因。
vite.config.ts 在 Node context 執行、不經過 Vite 的 define 注入，若直接 import appInfo.ts 會撞上
appInfo.ts 依賴的 __APP_VERSION__ 等建置期常數尚未定義而炸掉，所以這份短標題必須拆成獨立檔案。
*/
// 型別直接內寫成跟 i18n.tsx 的 LocalizedText 等價的形狀，不 import i18n.tsx：vite.config.ts
// 在建置期是用 tsconfig.node.json 檢查（沒有設定 jsx），對一個只從 .ts 檔案 import type 的
// .tsx 模組會直接編譯錯誤；這份常數只需一個等價的三語型別，不值得為了共用型別名稱
// 把 vite.config.ts 也拖進需要 React JSX 設定的檢查範圍，並讓執行期與建置期共用同一份資料。
type LocalizedText = { id: string; zh: string; en: string }

// iOS「加入主畫面」在網頁有合法 manifest 時，對話框預填的名稱讀的是 manifest 的 short_name
// （沒有 manifest 才退回 apple-mobile-web-app-title／document.title）；Android／桌面 Chrome
// 本來就是讀 short_name。分頁標題太長會被系統截斷成看不出語系差異的字串，這裡刻意給短、
// 辨識度高的文字，讓中文與印尼文家屬各自在桌面上一眼認出自己安裝的版本，且大小寫依需求固定。
export const APP_HOME_SCREEN_TITLE: LocalizedText = {
  id: 'Family Health Note',
  zh: '家健錄', en: "Family Health Note",
}
