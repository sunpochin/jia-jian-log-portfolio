/*
檔案用途：集中定義家健錄的品牌名稱、正式版本、發布代號與發布日期，避免各頁手動複製而不同步。
所在層：src/lib 共用設定層；只提供靜態品牌資料，不處理登入、路由或畫面狀態。
主要關聯：由 App、公開條款頁、ReleaseVersion 與 Vite 設定使用；版本與 build metadata 由 package.json／Vite 建置注入。
*/
import type { LocalizedText } from './i18n'
import { APP_CANONICAL_URL } from './canonicalUrl'
import { APP_HOME_SCREEN_TITLE } from './homeScreenTitle'

export const APP_VERSION = __APP_VERSION__
// 代號保留中文產品故事，同時提供印尼文讀音，讓兩種介面都不是只看見無意義的英文代碼。
export const APP_RELEASE_CODENAME = { id: 'Mengni', zh: '猛膩', en: 'Fierce' } as const
// 為了避免版號更新後忘記同步日期，日期由建置流程依台北時區注入。
export const APP_RELEASE_DATE = __APP_RELEASE_DATE__
// 所有 provenance 值都在同一次 Vite build 注入，確保畫面與 /version.json 不會各自猜測部署版本。
export const APP_GIT_SHA = __APP_GIT_SHA__
export const APP_GIT_SHA_SHORT = APP_GIT_SHA === 'local' ? APP_GIT_SHA : APP_GIT_SHA.slice(0, 7)
export const APP_ENVIRONMENT = __APP_ENVIRONMENT__
export const APP_BUILD_TIME = __APP_BUILD_TIME__
export const APP_NAME = '家健錄 JiaJian Log'
export const APP_NAME_ZH = '家健錄'
export const APP_NAME_EN = 'JiaJian Log'
// 副標題也是使用者可見的系統文案，必須隨語系切換，不能讓印尼文介面殘留英文。
export const APP_SUBTITLE = {
  id: 'Catatan Kesehatan Keluarga',
  zh: '家庭健康紀錄', en: 'Family Health Record',
} as const
// 品牌名稱保留 JiaJian Log；只有描述性文字才進入雙語字典，避免品牌在不同頁面漂移。
export const APP_DOCUMENT_TITLE = {
  id: 'JiaJian Log — Catatan Kesehatan Keluarga',
  zh: '家健錄 JiaJian Log — 家庭健康紀錄', en: 'JiaJian Log — Family Health Record',
} as const
// 常數本體移到 homeScreenTitle.ts，這裡轉出是為了讓既有頁面／測試的 import 路徑維持不變；
// 同一份值也被 vite.config.ts 在建置期拿去產生中文／印尼文兩份 manifest 的 short_name，
// 兩邊共用單一來源，才不會像先前那樣其中一份忘記同步更新。
export { APP_HOME_SCREEN_TITLE }
// 遵循核心憲法雙語介面規範，標題同時提供繁中與印尼文對照
export const APP_HEADER_TITLE: LocalizedText = {
  id: 'JiaJian Log',
  zh: '家健錄 JiaJian Log', en: 'Home Health Record JiaJian Log',
}
// 常數本體移到 canonicalUrl.ts，這裡轉出是為了讓既有頁面／測試的 import 路徑維持不變。
export { APP_CANONICAL_URL }
export const APP_GITHUB_RELEASES_URL = 'https://github.com/portfolio-author/jia-jian-log/releases'
// 集中管理開發者個人網站網址，避免登入頁與條款頁寫死不同連結，便於日後統一維護。
export const APP_AUTHOR_URL = 'https://portfolio-author.github.io/'
