/*
檔案用途：鎖住 scripts/sync-native-version.ts 用來寫入 iOS／Android 版本號與 build number 的純函式格式與單調遞增規則。
所在層：tests/unit；不執行真的 git 指令或寫檔，只驗證字串轉換與比較邏輯。
主要關聯：src/lib/nativeVersionSync.ts、ios/App/App.xcodeproj/project.pbxproj、android/app/build.gradle。
*/
import { describe, expect, test } from 'bun:test'
import {
  computeNextBuildNumber,
  parseAndroidVersionCode,
  parseIosProjectVersions,
  replaceAndroidVersionCode,
  replaceAndroidVersionName,
  replaceIosMarketingVersion,
  replaceIosProjectVersion,
} from '../../src/lib/nativeVersionSync'

describe('computeNextBuildNumber', () => {
  test('uses the git-commit-count candidate when it already exceeds the previous build number', () => {
    expect(computeNextBuildNumber(120, 5)).toBe(120)
  })

  test('never regresses below a build number already seen (e.g. uploaded to TestFlight/Play)', () => {
    expect(computeNextBuildNumber(5, 120)).toBe(120)
  })

  test('is idempotent when nothing changed since the last sync', () => {
    expect(computeNextBuildNumber(42, 42)).toBe(42)
  })
})

describe('iOS project.pbxproj version fields', () => {
  const sample = [
    'CODE_SIGN_STYLE = Automatic;',
    'CURRENT_PROJECT_VERSION = 1;',
    'MARKETING_VERSION = 1.0;',
    'PRODUCT_BUNDLE_IDENTIFIER = com.portfolio-author.jiajianlog;',
  ].join('\n')

  test('parses every CURRENT_PROJECT_VERSION occurrence (Debug and Release each have one)', () => {
    const both = `${sample}\nCURRENT_PROJECT_VERSION = 3;`
    expect(parseIosProjectVersions(both)).toEqual([1, 3])
  })

  test('replaces MARKETING_VERSION with package.json version', () => {
    expect(replaceIosMarketingVersion(sample, '1.17.0')).toContain('MARKETING_VERSION = 1.17.0;')
  })

  test('replaces every CURRENT_PROJECT_VERSION with the computed build number', () => {
    const both = `${sample}\nCURRENT_PROJECT_VERSION = 3;`
    const next = replaceIosProjectVersion(both, 42)
    expect(parseIosProjectVersions(next)).toEqual([42, 42])
  })
})

describe('Android build.gradle version fields', () => {
  const sample = 'versionCode 1\nversionName "1.0"\n'

  test('parses versionCode', () => {
    expect(parseAndroidVersionCode(sample)).toBe(1)
  })

  test('returns null when versionCode is missing', () => {
    expect(parseAndroidVersionCode('versionName "1.0"')).toBeNull()
  })

  test('replaces versionName with package.json version', () => {
    expect(replaceAndroidVersionName(sample, '1.17.0')).toContain('versionName "1.17.0"')
  })

  test('replaces versionCode with the computed build number', () => {
    expect(replaceAndroidVersionCode(sample, 42)).toContain('versionCode 42')
  })
})
