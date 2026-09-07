/*
檔案用途：驗證 PWA 安裝提示的期限、平台判斷與 standalone 狀態邏輯。
所在層：tests/unit；不啟動瀏覽器，也不接觸 Supabase 或真實照護資料。
主要關聯：src/lib/pwaInstall.ts 與 PwaInstallPrompt 的事件轉接。
*/

import { describe, expect, test } from 'bun:test'
import { isIosDevice, isStandalonePwa, PWA_INSTALL_DISMISS_DURATION_MS, readPwaInstallDismissedAt, shouldShowPwaInstallPrompt } from '../../src/lib/pwaInstall'

describe('PWA install prompt policy', () => {
  test('does not nag again during the 30-day dismissal window', () => {
    const dismissedAt = 1_000
    expect(shouldShowPwaInstallPrompt(dismissedAt + PWA_INSTALL_DISMISS_DURATION_MS - 1, dismissedAt)).toBe(false)
    expect(shouldShowPwaInstallPrompt(dismissedAt + PWA_INSTALL_DISMISS_DURATION_MS, dismissedAt)).toBe(true)
  })

  test('invalid storage values are treated as no dismissal', () => {
    expect(readPwaInstallDismissedAt({ getItem: () => 'not-a-timestamp' })).toBeNull()
    expect(readPwaInstallDismissedAt({ getItem: () => null })).toBeNull()
  })

  test('recognizes iPhone, iPad and desktop-mode iPad user agents', () => {
    expect(isIosDevice('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)')).toBe(true)
    expect(isIosDevice('Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X)')).toBe(true)
    expect(isIosDevice('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 5)).toBe(true)
    expect(isIosDevice('Mozilla/5.0 (X11; Linux x86_64)')).toBe(false)
  })

  test('treats browser display mode and iOS standalone as installed', () => {
    expect(isStandalonePwa(true, false)).toBe(true)
    expect(isStandalonePwa(false, true)).toBe(true)
    expect(isStandalonePwa(false, false)).toBe(false)
  })
})
