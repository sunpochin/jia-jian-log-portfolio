/*
檔案用途：HTML 屬性字串跳脫的單一共用實作。
所在層：src/lib 共用設定層；純函式，不依賴任何 Vite 建置期注入的全域變數。
主要關聯：vite.config.ts 的 shareMetaPlugin 與 src/lib/publicRoutes.ts 的 applyRouteMetaToHtml
都要把常數文案塞進 HTML 屬性，共用同一份跳脫邏輯，避免兩處各自維護一份而在跳脫規則上逐漸不同步。
*/
export function escapeHtmlAttr(value: string): string {
  // 目前所有值都來自 src/lib 內寫死的常數，非使用者輸入；仍統一跳脫，避免日後有人改成動態文案時漏做。
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}
