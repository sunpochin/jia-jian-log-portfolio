/*
檔案用途：提供 components 與 features 元件的相容匯出入口。
所在層：src/components 根目錄；作為前端元件導出的統一彙整點。
主要關聯：匯出 src/components/ui, modals, system 以及 src/features 中的頁面與元件。
*/
export * from './ui/PickerCard'
export * from './ui/TabHeader'
export * from './ui/LanguageSwitcher'
export * from './ui/PublicBrandHeader'
export * from './ui/SubjectSwitcher'

export * from './modals/ExportCsvModal'
export * from './modals/DeleteAccountModal'

export * from './system/PwaUpdatePrompt'
export * from './system/ReleaseVersion'
// 版本頁與 build card 共用同一個匯出入口，避免不同頁面各自複製 provenance 呈現。
export * from './system/BuildProvenance'
export * from './system/MengniDogMark'
export * from './system/MengniCatMark'
export * from './system/MengniRabbitMark'
// Pickle 也從共用入口輸出，避免設定頁與其他寵物視覺入口各自複製鳥的 SVG。
export * from './system/PickleBirdMark'
export * from './system/TenantApp'
// 登入頁只需組合 WebView 條件；提示內容集中在元件內，避免語系文案再度分散。
export * from './system/WebViewWarning'

export * from './auth/GoogleSignInButton'

export * from '../features/vitals/pages/InputPage'
export * from '../features/vitals/pages/WeightPage'

export * from '../features/medication/pages/MedicationPage'
export * from '../features/care-family/pages/DailyCarePage'
export * from '../features/system-admin/pages/AdminPage'
export * from '../features/system-admin/pages/ArchivedPatientHistoryPage'
export * from '../features/system-admin/pages/EventsPage'
export * from '../features/system-admin/pages/HealthDataNoticePage'
export * from '../features/system-admin/pages/PrivacyPage'
export * from '../features/system-admin/pages/TermsPage'
// 公開版本頁和條款頁同樣不需要登入，集中匯出方便公開入口維持一致。
export * from '../features/system-admin/pages/ReleasesPage'
