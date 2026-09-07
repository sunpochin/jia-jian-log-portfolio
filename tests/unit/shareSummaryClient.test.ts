/*
檔案用途：驗證唯讀分享連結接收頁的純函式——fragment token 解析與摘要回應形狀驗證。
所在層：tests/unit；不連線 Supabase，只測試不依賴網路的部分。
主要關聯：src/lib/shareSummaryClient.ts、ShareSummaryPage.tsx。
*/
import { describe, expect, test } from 'bun:test'
import { parseShareSummaryResponse, parseShareTokenFromHash } from '../../src/lib/shareSummaryClient'

describe('parseShareTokenFromHash', () => {
  test('extracts the token from a #token=... fragment', () => {
    expect(parseShareTokenFromHash('#token=abc123')).toBe('abc123')
  })

  test('returns null for an empty, missing, or malformed fragment', () => {
    expect(parseShareTokenFromHash('')).toBeNull()
    expect(parseShareTokenFromHash('#')).toBeNull()
    expect(parseShareTokenFromHash('#foo=bar')).toBeNull()
    expect(parseShareTokenFromHash('#token=')).toBeNull()
  })
})

describe('parseShareSummaryResponse', () => {
  const validPayload = {
    summary: {
      patientAlias: { zh: '照護對象', en: "Objek care", id: 'Objek perawatan' },
      summaryDate: '2026-09-04',
      timezone: 'Asia/Taipei',
      bloodPressure: { systolic: 128, diastolic: 82, pulse: 70, measuredAt: '2026-09-04T01:00:00Z' },
      generatedAt: '2026-09-04T02:00:00Z',
    },
  }

  test('accepts a well-formed response with a reading', () => {
    expect(parseShareSummaryResponse(validPayload)).toEqual(validPayload.summary)
  })

  test('accepts a well-formed response with no reading today', () => {
    const payload = { summary: { ...validPayload.summary, bloodPressure: null } }
    expect(parseShareSummaryResponse(payload).bloodPressure).toBeNull()
  })

  test('rejects a missing or non-object response', () => {
    expect(() => parseShareSummaryResponse(null)).toThrow()
    expect(() => parseShareSummaryResponse('nope')).toThrow()
    expect(() => parseShareSummaryResponse({})).toThrow()
  })

  test('rejects a response with a single-language alias instead of the bilingual object', () => {
    const payload = { summary: { ...validPayload.summary, patientAlias: '照護對象' } }
    expect(() => parseShareSummaryResponse(payload)).toThrow()
  })

  test('rejects a malformed blood pressure entry rather than guessing defaults', () => {
    const payload = { summary: { ...validPayload.summary, bloodPressure: { systolic: 'high', diastolic: 82 } } }
    expect(() => parseShareSummaryResponse(payload)).toThrow()
  })
})
