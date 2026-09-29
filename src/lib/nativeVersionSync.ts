/*
檔案用途：純函式讀寫 iOS Xcode 專案與 Android Gradle 設定裡的版本號／build number 字串。
所在層：src/lib 共用設定層；不做檔案 I/O，只處理字串轉換，讓 scripts/sync-native-version.ts 的邏輯能被 bun test 鎖住。
主要關聯：scripts/sync-native-version.ts、ios/App/App.xcodeproj/project.pbxproj、android/app/build.gradle、package.json 的 version。
*/

// git commit 數與原生專案裡既有的 build number 都可能大於這次候選值
// （例如上次手動在 App Store Connect／Play Console 上傳過更高的號碼）；
// 一律取最大值，確保重新同步不會把已經上架審核過的號碼往回調（issue #817 風險評估）。
export function computeNextBuildNumber(candidate: number, previousMax: number): number {
  return Math.max(candidate, previousMax)
}

export function parseIosProjectVersions(pbxprojContent: string): number[] {
  return [...pbxprojContent.matchAll(/CURRENT_PROJECT_VERSION = (\d+);/g)]
    .map(match => Number.parseInt(match[1], 10))
}

export function replaceIosMarketingVersion(pbxprojContent: string, version: string): string {
  return pbxprojContent.replace(/MARKETING_VERSION = [^;]+;/g, `MARKETING_VERSION = ${version};`)
}

export function replaceIosProjectVersion(pbxprojContent: string, buildNumber: number): string {
  return pbxprojContent.replace(/CURRENT_PROJECT_VERSION = \d+;/g, `CURRENT_PROJECT_VERSION = ${buildNumber};`)
}

export function parseAndroidVersionCode(gradleContent: string): number | null {
  const match = gradleContent.match(/versionCode\s+(\d+)/)
  return match ? Number.parseInt(match[1], 10) : null
}

export function replaceAndroidVersionName(gradleContent: string, version: string): string {
  return gradleContent.replace(/versionName\s+"[^"]*"/, `versionName "${version}"`)
}

export function replaceAndroidVersionCode(gradleContent: string, buildNumber: number): string {
  return gradleContent.replace(/versionCode\s+\d+/, `versionCode ${buildNumber}`)
}
