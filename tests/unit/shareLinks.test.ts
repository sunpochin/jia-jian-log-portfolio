/*
檔案用途：驗證唯讀分享連結 Stage 3a 前端資料轉接層的純函式——token 熵、hash、URL 組裝與到期時間計算。
所在層：tests/unit；不連線 Supabase，只測試不依賴網路的部分。
主要關聯：src/lib/shareLinks.ts。
*/
import { describe, expect, test } from 'bun:test'
import { buildShareLinkUrl, expiresAtFromHours, generateShareToken, sha256Hex } from '../../src/lib/shareLinks'

describe('generateShareToken', () => {
  test('produces a 64-character lowercase hex string (256 bits)', () => {
    const token = generateShareToken()
    expect(token).toMatch(/^[0-9a-f]{64}$/)
  })

  test('never repeats across calls', () => {
    const tokens = new Set(Array.from({ length: 20 }, () => generateShareToken()))
    expect(tokens.size).toBe(20)
  })
})

describe('sha256Hex', () => {
  test('matches the 64-char lowercase hex shape the database CHECK constraint requires', async () => {
    const hash = await sha256Hex(generateShareToken())
    expect(hash).toMatch(/^[0-9a-f]{64}$/)
  })

  test('is deterministic for the same input', async () => {
    const token = generateShareToken()
    expect(await sha256Hex(token)).toBe(await sha256Hex(token))
  })
})

describe('buildShareLinkUrl', () => {
  test('puts the token in a URL fragment, never in the query string or path', () => {
    const url = buildShareLinkUrl('https://app.example', 'abc123')
    expect(url).toBe('https://app.example/share#token=abc123')
    expect(url).not.toContain('?')
  })
})

describe('expiresAtFromHours', () => {
  test('adds the given number of hours to the reference time', () => {
    const now = new Date('2026-09-04T00:00:00.000Z')
    expect(expiresAtFromHours(24, now)).toBe('2026-09-05T00:00:00.000Z')
    expect(expiresAtFromHours(168, now)).toBe('2026-09-11T00:00:00.000Z')
  })
})
