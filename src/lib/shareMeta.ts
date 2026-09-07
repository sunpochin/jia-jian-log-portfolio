/*
檔案用途：集中定義貼到 LINE／Facebook／Slack 時的分享預覽卡文案（description、og:*、twitter:card）與 hreflang 對照。
所在層：src/lib 共用設定層；純字串常數，不依賴任何 Vite 建置期注入的全域變數，因此 vite.config.ts 可在 Node 執行期直接匯入。
主要關聯：vite.config.ts 的 shareMetaPlugin 於建置期讀取本檔並插入 index.html；src/lib/canonicalUrl.ts 提供 canonical 網址。
*/
import { APP_CANONICAL_URL } from './canonicalUrl'

// og 圖仍必須自架於 public/：CSP 只額外放行 Supabase 私有照片的 signed URL，不應因此讓分享預覽依賴外部 CDN。
export const SHARE_PREVIEW_IMAGE_PATH = 'og-image.png'
export const SHARE_PREVIEW_IMAGE_WIDTH = 1200
export const SHARE_PREVIEW_IMAGE_HEIGHT = 630
export const SHARE_PREVIEW_IMAGE_URL = new URL(SHARE_PREVIEW_IMAGE_PATH, APP_CANONICAL_URL).toString()

// 靜態 index.html 只能有一份 meta，因此採「以繁體中文為主、雙語文案並列於同一段落」，
// 而不是依語言拆成多個 URL 分頁：SPA 目前沒有伺服器端依語言渲染的能力（見 issue #441），
// 若強行提供 hreflang 分頁網址，兩個網址其實會回傳一模一樣的內容，對搜尋引擎反而是誤導。
// 這個選擇滿足 issue #437 驗收條件「不得只留單一語言」——印尼文讀者在標題、說明都能直接看到印尼文。
// 兩語言並列的段落一律「印尼文在前、中文在後」，與 src/lib/recordReport.ts 的 `${id} / ${zh}` 慣例一致
// （品牌名稱「家健錄 JiaJian Log」是固定不隨語言排序的商標字串，不受此規則影響）。
export const SHARE_PREVIEW_TITLE = '家健錄 JiaJian Log — Catatan Kesehatan Keluarga / 家庭健康紀錄'

// LINE／Facebook 會截斷過長說明，因此中印文各壓成一句，合計仍在多數平台顯示上限內。
export const SHARE_PREVIEW_DESCRIPTION = 'Catat tekanan darah, suhu, berat badan, obat, dan perawatan harian bersama keluarga dan perawat. Gratis, tanpa instalasi, dwibahasa Mandarin–Indonesia. ／ 家人與看護一起記錄血壓、體溫、體重、用藥與每日照護，趨勢與交接一次看懂。免費、免安裝、繁中與印尼文雙語介面。'

// alt／aria 文字同樣是使用者可見文案，讀屏器與圖片載入失敗時會用到，維持雙語並列。
export const SHARE_PREVIEW_IMAGE_ALT = '家健錄 JiaJian Log 分享預覽圖：Catatan Kesehatan Keluarga / 家庭健康紀錄'

export const SHARE_OG_LOCALE = 'zh_TW'
export const SHARE_OG_LOCALE_ALTERNATE = 'id_ID'

/**
 * 因為只有單一 URL 同時承載兩種語言（沒有分頁），hreflang 三個項目都指向同一個 APP_CANONICAL_URL；
 * 這是自我參照（self-referencing）寫法，用來明確宣告「這個網址本身就同時服務 zh-Hant 與 id 讀者」，
 * 而不是宣告兩個內容不同的網址互為翻譯版本。x-default 同樣指回本頁，作為找不到符合語系時的預設。
 */
export const SHARE_HREFLANG_ALTERNATES: ReadonlyArray<{ hreflang: string; href: string }> = [
  { hreflang: 'zh-Hant', href: APP_CANONICAL_URL },
  { hreflang: 'id', href: APP_CANONICAL_URL },
  { hreflang: 'x-default', href: APP_CANONICAL_URL },
]
