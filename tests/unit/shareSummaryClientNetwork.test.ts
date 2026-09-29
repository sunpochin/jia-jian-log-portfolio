/*
檔案用途：驗證匿名分享頁的原生 fetch 呼叫、最小 header 與錯誤處理。
所在層：tests/unit；所有 HTTP 回應都由本地 mock 提供，避免 token 或摘要資料離開測試程序。
主要關聯：src/lib/shareSummaryClient.ts、share-link-exchange 與 share-summary Edge Functions。
*/
import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { exchangeShareToken, fetchShareSummary } from '../../src/lib/shareSummaryClient'

const originalFetch = globalThis.fetch
let requests: Array<{ input: RequestInfo | URL; init?: RequestInit }> = []
let responseBody: unknown
let responseStatus = 200
let responseOk = true

beforeEach(() => {
  requests = []
  responseBody = { session: 'session-1' }
  responseStatus = 200
  responseOk = true
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    requests.push({ input, init })
    return new Response(JSON.stringify(responseBody), { status: responseStatus })
  }) as typeof globalThis.fetch
})

afterEach(() => {
  globalThis.fetch = originalFetch
})

const validSummary = {
  summary: {
    patientAlias: { zh: '照護對象', id: 'Orang yang dirawat', en: 'Care recipient' },
    summaryDate: '2026-09-09',
    timezone: 'Asia/Taipei',
    bloodPressure: null,
    generatedAt: '2026-09-09T01:00:00Z',
  },
}

describe('shareSummaryClient network adapter', () => {
  test('exchanges a token with the minimal browser-safe request', async () => {
    const result = await exchangeShareToken('token-1')

    expect(result).toEqual({ session: 'session-1' })
    expect(requests[0]?.input.toString()).toContain('/functions/v1/share-link-exchange')
    expect(requests[0]?.init).toMatchObject({ method: 'POST', headers: { 'content-type': 'application/json' } })
    expect(requests[0]?.init?.body).toBe(JSON.stringify({ token: 'token-1' }))
  })

  test('validates the exchanged session before returning it', async () => {
    responseBody = { session: 123 }
    await expect(exchangeShareToken('token-1')).rejects.toThrow('share link exchange response is invalid')
  })

  test('fetches and validates a share summary with an optional absent reading', async () => {
    responseBody = validSummary
    await expect(fetchShareSummary('session-1')).resolves.toEqual(validSummary.summary)
    expect(requests[0]?.input.toString()).toContain('/functions/v1/share-summary')
    expect(requests[0]?.init?.body).toBe(JSON.stringify({ session: 'session-1' }))
  })

  test('turns non-2xx responses into a stable request error', async () => {
    responseOk = false
    responseStatus = 410
    await expect(exchangeShareToken('expired')).rejects.toThrow('share-link-exchange request failed with status 410')
    await expect(fetchShareSummary('expired')).rejects.toThrow('share-summary request failed with status 410')
  })

  test('lets malformed summary payloads fail closed at the client boundary', async () => {
    responseBody = { summary: { ...validSummary.summary, patientAlias: 'not-localized' } }
    await expect(fetchShareSummary('session-1')).rejects.toThrow('share summary alias is invalid')
  })

  test('rejects malformed summary metadata instead of rendering partial data', async () => {
    responseBody = { summary: { ...validSummary.summary, summaryDate: 20260909 } }
    await expect(fetchShareSummary('session-1')).rejects.toThrow('share summary metadata is invalid')
  })
})
