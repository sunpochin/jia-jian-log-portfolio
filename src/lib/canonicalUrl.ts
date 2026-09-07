/*
檔案用途：單獨存放正式站 canonical 網址常數，供 appInfo.ts 轉出，也供 vite.config.ts 在建置 index.html 的分享預覽 meta 標籤時直接匯入。
所在層：src/lib 共用設定層；只放一個純字串常數，不依賴任何 Vite 建置期注入的全域變數。
主要關聯：src/lib/appInfo.ts（轉出給既有頁面與測試使用）、vite.config.ts（index.html transform 用於 canonical／og:url／hreflang）。
*/
// appInfo.ts 頂層會讀取 __APP_VERSION__ 等只在 App 打包時才由 Vite define 注入的全域變數；
// vite.config.ts 是在 Node 執行期直接載入，若從那裡 import appInfo.ts 會在還沒 define 前就 ReferenceError。
// 因此把兩邊都需要的 canonical 網址拆到這個沒有任何全域依賴的檔案，appInfo.ts 與 vite.config.ts 各自安全匯入。
export const APP_CANONICAL_URL = 'https://demo.careapp.local/'
