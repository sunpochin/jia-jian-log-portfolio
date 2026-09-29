/*
檔案用途：驗證 PWA 安裝提示的期限、平台判斷與 standalone 狀態邏輯。
所在層：tests/unit；不啟動瀏覽器，也不接觸 Supabase 或真實照護資料。
主要關聯：src/lib/pwaInstall.ts 與 PwaInstallPrompt 的事件轉接。
*/

import { describe, expect, test } from 'bun:test'
import {
  clearPwaInstallDismissedAt,
  isIosDevice,
  isStandalonePwa,
  PWA_INSTALL_DISMISS_DURATION_MS,
  persistPwaInstallDismissedAt,
  readPwaInstallDismissedAt,
  shouldShowPwaInstallPrompt,
} from '../../src/lib/pwaInstall'

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

  test('reads, persists, and clears a valid dismissal timestamp', () => {
    const values = new Map<string, string>()
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value) },
      removeItem: (key: string) => { values.delete(key) },
    }
    persistPwaInstallDismissedAt(storage, 123_456)
    expect(readPwaInstallDismissedAt(storage)).toBe(123_456)
    clearPwaInstallDismissedAt(storage)
    expect(readPwaInstallDismissedAt(storage)).toBeNull()
  })

  // 私密瀏覽器可能讓三種 storage 操作各自丟例外；提示功能只能降級，不能阻斷照護輸入。
  test('storage is optional and failures never escape the PWA policy', () => {
    const brokenStorage = {
      getItem: () => { throw new Error('SecurityError') },
      setItem: () => { throw new Error('QuotaExceededError') },
      removeItem: () => { throw new Error('SecurityError') },
    }
    expect(readPwaInstallDismissedAt(brokenStorage)).toBeNull()
    expect(readPwaInstallDismissedAt(null)).toBeNull()
    expect(() => persistPwaInstallDismissedAt(brokenStorage, 1)).not.toThrow()
    expect(() => persistPwaInstallDismissedAt(undefined, 1)).not.toThrow()
    expect(() => clearPwaInstallDismissedAt(brokenStorage)).not.toThrow()
    expect(() => clearPwaInstallDismissedAt(undefined)).not.toThrow()
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
