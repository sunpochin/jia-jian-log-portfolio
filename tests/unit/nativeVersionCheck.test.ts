/*
檔案用途：鎖住原生殼「有新版請更新 App」提示的顯示條件（issue #817）。
所在層：tests/unit；純函式測試，不涉及 fetch 或元件渲染。
主要關聯：src/lib/nativeVersionCheck.ts、src/components/system/NativeUpdatePrompt.tsx。
*/
import { describe, expect, test } from 'bun:test'
import { isRemoteVersionNewer, shouldShowNativeUpdatePrompt } from '../../src/lib/nativeVersionCheck'

describe('isRemoteVersionNewer', () => {
  test('detects a newer patch, minor, or major version', () => {
    expect(isRemoteVersionNewer('1.17.0', '1.17.1')).toBe(true)
    expect(isRemoteVersionNewer('1.17.0', '1.18.0')).toBe(true)
    expect(isRemoteVersionNewer('1.17.0', '2.0.0')).toBe(true)
  })

  test('treats an equal or older remote version as not newer', () => {
    expect(isRemoteVersionNewer('1.17.0', '1.17.0')).toBe(false)
    expect(isRemoteVersionNewer('1.17.0', '1.16.9')).toBe(false)
  })

  test('treats a missing patch segment as zero (1.17 === 1.17.0)', () => {
    expect(isRemoteVersionNewer('1.17', '1.17.0')).toBe(false)
    expect(isRemoteVersionNewer('1.17.0', '1.17')).toBe(false)
  })
})

describe('shouldShowNativeUpdatePrompt', () => {
  test('never shows outside the native shell (Web/PWA keeps its own PwaUpdatePrompt)', () => {
    expect(shouldShowNativeUpdatePrompt({ isNative: false, localVersion: '1.17.0', remoteVersion: '1.18.0' })).toBe(false)
  })

  test('stays silent when the remote version has not been fetched yet (offline or still loading)', () => {
    expect(shouldShowNativeUpdatePrompt({ isNative: true, localVersion: '1.17.0', remoteVersion: null })).toBe(false)
  })

  test('shows only when the remote version is strictly newer than the bundled snapshot', () => {
    expect(shouldShowNativeUpdatePrompt({ isNative: true, localVersion: '1.17.0', remoteVersion: '1.18.0' })).toBe(true)
    expect(shouldShowNativeUpdatePrompt({ isNative: true, localVersion: '1.17.0', remoteVersion: '1.17.0' })).toBe(false)
  })
})
