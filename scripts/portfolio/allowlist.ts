/*
檔案用途：PORTFOLIO-01 產線的 allowlist 設定——只有這裡列出的路徑會被複製進公開作品集輸出目錄。
所在層：scripts/portfolio，供 build.ts 讀取；本檔案本身不執行任何動作。
主要關聯：docs/operations/portfolio-pipeline.md 第 3.1 節；新增任何私有內容時，只要不在這份清單裡就不會外流（default-deny）。
*/

// 為什麼用 allowlist 而不是「複製全部再排除」：新增檔案（例如某次不小心產生的 CSV 或 SQL dump）
// 若沒有明確加進這份清單，就永遠不會進入公開輸出，不必仰賴「記得排除它」。

// 遞迴複製的目錄（相對於 repo root）。
//
// ⚠️ scripts/portfolio 絕不能整個加進這裡：owner 執行 build 時，scripts/portfolio/
// 目錄底下就正躺著含真實個資的 replacements.local.json 與 forbidden.local.json
// （兩者都已加進 .gitignore，但 cpSync 遞迴複製是直接操作檔案系統，完全不理會
// .gitignore；只要這個目錄被整個當成 ALLOWLIST_DIRS 的一員，這兩份私有設定檔就會被
// 原封不動複製進公開輸出目錄）。這個產線自己的原始碼要公開，只能像下面
// ALLOWLIST_FILES 那樣逐一列出安全的 .ts／.example 檔案，永遠不能用目錄遞迴複製。
export const ALLOWLIST_DIRS = [
  'src',
  'public',
  'docs/architecture',
  'docs/features',
  'tests/unit',
]

// 單一檔案（相對於 repo root）。
export const ALLOWLIST_FILES = [
  'package.json', // 會另外做 script 欄位篩選，見 build.ts pruneScripts()
  'bun.lock',
  'tsconfig.json',
  'tsconfig.app.json',
  'tsconfig.node.json',
  'vite.config.ts',
  'eslint.config.js',
  'playwright.config.ts',
  'index.html',
  '.env.example',
  // PORTFOLIO-01 產線自己的原始碼——逐一列出，見上方 ALLOWLIST_DIRS 的警告：
  // 絕不能把 scripts/portfolio 整個目錄加進 ALLOWLIST_DIRS。
  'scripts/portfolio/allowlist.ts',
  'scripts/portfolio/build.ts',
  'scripts/portfolio/check.ts',
  'scripts/portfolio/release.ts',
  'scripts/portfolio/verify.ts',
  'scripts/portfolio/checkLogic.ts',
  'scripts/portfolio/replacements.local.json.example',
  'scripts/portfolio/forbidden.local.json.example',
  'tests/bp-contract-tests.json', // tests/unit/contract.test.ts 依賴，不屬於 tests/unit/ 目錄本身
  'CHANGELOG.md', // src/features/system-admin/pages/ReleasesPage.tsx 用 `?raw` 靜態 import，vite build 需要這個檔案存在；
                  // 內容只有 release-please 產生的功能/修正條目與 commit 連結，無個資（連結指向私有 repo，公開版點了會 404，可接受）。
]

// tests/*.spec.ts（Playwright，位於 tests/ 根目錄，不在 tests/unit/ 遞迴範圍內）。
export const ALLOWLIST_GLOB_SPEC_FILES = [
  'tests/calendarSchedule.spec.ts',
  'tests/caregiverInvitation.spec.ts',
  'tests/dailyCareDisplay.spec.ts',
  'tests/nutrition.spec.ts',
  'tests/readingScale.spec.ts',
  'tests/smoke.spec.ts',
  'tests/webview-warning.spec.ts',
]

// 在已允許的目錄範圍內，仍要排除的個別檔案。
//
// 為什麼這份清單是「跑過 bun test 找出來的」而不是單靠 grep 猜的：第一版只 grep 了
// import scripts/ 的測試（5 個），結果實際在輸出目錄跑 `bun test tests/unit` 才發現
// 還有 43 個測試因為讀取 supabase/（migrations、functions）、ios/（Info.plist）、
// 或 root 設定檔（vercel.json）而在載入階段就整份 crash——grep import 語句抓不到
// `readFileSync(new URL('../../supabase/migrations/...'))` 這種動態路徑讀檔。
// 教訓：改動這份清單後必須實際在輸出目錄跑一次 bun test 驗證，不能只用 grep 推論。
export const EXCLUDE_WITHIN_ALLOWLIST = [
  // 依賴 scripts/（備份、匯入等維運腳本，未進 allowlist）：
  'tests/unit/importMoaAnimalDrugs.test.ts',
  'tests/unit/databaseBackupV2.test.ts',
  'tests/unit/medicationCatalogBackfill.test.ts',
  'tests/unit/importNhiTcmProducts.test.ts',
  'tests/unit/tfdaDrugImport.test.ts',
  // 依賴 supabase/migrations/*.sql 內容（migration 逐條驗證測試；P0 決策：整個
  // supabase/ 不進 allowlist，見文件 1.2 第 4 點）：
  'tests/unit/calendarNotificationMigration.test.ts',
  'tests/unit/careDueRemindersMigration.test.ts',
  'tests/unit/careEventPhotoMigration.test.ts',
  'tests/unit/careEventPhotoRetentionMigration.test.ts',
  'tests/unit/caregiverInvitationsMigration.test.ts',
  'tests/unit/dailyCarePreferenceMigration.test.ts',
  'tests/unit/fourDailyWeightMigration.test.ts',
  'tests/unit/healthConsentTypeUpgradeMigration.test.ts',
  'tests/unit/medicationAppearancePhotoRetentionMigration.test.ts',
  'tests/unit/medicationTimelineMigration.test.ts',
  'tests/unit/motherPatientOnlyAccessMigration.test.ts',
  'tests/unit/nutritionMigration.test.ts',
  'tests/unit/patientAccessMigration.test.ts',
  'tests/unit/patientInvitationSharingMigration.test.ts',
  'tests/unit/patientShareLinkRedemptionMigration.test.ts',
  'tests/unit/patientShareLinksMigration.test.ts',
  'tests/unit/prnMedicationMigration.test.ts',
  'tests/unit/publicHealthDataAccessMigration.test.ts',
  'tests/unit/shareLinkManagementMigration.test.ts',
  'tests/unit/weightLegacyRetentionMigration.test.ts',
  'tests/unit/weightRetentionMigration.test.ts',
  'tests/unit/securityReviewFollowupsMigration.test.ts',
  'tests/unit/analytics.test.ts', // 同樣以 readFileSync 讀取一個 migration 檔案驗證版本號
  // 依賴 supabase/functions/*（Edge Function 原始碼，未進 allowlist）：
  'tests/unit/adminListUsers.test.ts',
  'tests/unit/adminListUsersFunction.test.ts',
  'tests/unit/bloodPressureNotifier.test.ts',
  'tests/unit/calendarAgendaFunction.test.ts',
  'tests/unit/calendarAgendaRules.test.ts',
  'tests/unit/calendarNotifier.test.ts',
  'tests/unit/careDueRemindersFunction.test.ts',
  'tests/unit/careEventPhotoRetention.test.ts',
  'tests/unit/googleCalendarClient.test.ts',
  'tests/unit/invitationEmail.test.ts',
  'tests/unit/medicationAppearancePhotoRetention.test.ts',
  'tests/unit/medicationOcr.test.ts',
  'tests/unit/medicationOcrFunction.test.ts',
  'tests/unit/sendInvitationEmailFunction.test.ts',
  'tests/unit/shareCors.test.ts',
  'tests/unit/shareLinkExchange.test.ts',
  'tests/unit/shareLinkFunctionsCors.test.ts',
  'tests/unit/shareSession.test.ts',
  'tests/unit/shareSummary.test.ts',
  // 依賴 ios/（Capacitor 原生殼，未進 allowlist）：
  'tests/unit/nativeAuth.test.ts',
  // 依賴 root 設定檔（未進 allowlist）：
  'tests/unit/vercelHeaders.test.ts', // 讀取 vercel.json
  'tests/unit/temperature.test.ts', // 同時讀取一個 migration 檔案驗證欄位定義
  // 依賴真實 email 值（替換後測試失敗）：
  'tests/unit/auth.test.ts',
  'tests/unit/medicationToday.test.ts',
]

// package.json 的 scripts 欄位裡，只保留跟「跑得起來這個 repo」直接相關的指令；
// 其餘（native app 建置、私有維運腳本、資料匯入／備份／種子）對應的檔案本來就不在
// allowlist 裡，留著這些 script 只會讓公開版的 `bun run xxx` 指到不存在的檔案。
export const KEPT_PACKAGE_JSON_SCRIPTS = ['dev', 'build', 'lint', 'preview', 'test:e2e', 'test:unit', 'test:coverage']
