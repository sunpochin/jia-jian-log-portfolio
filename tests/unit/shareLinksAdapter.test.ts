/*
檔案用途：驗證分享連結資料轉接層的 RPC 映射、token 交接與錯誤邊界。
所在層：tests/unit；用可控的 Supabase RPC mock，不接觸真實分享連結或病人資料。
主要關聯：src/lib/shareLinks.ts、ShareLinkManagement.tsx 與分享連結 RPC。
*/
import { beforeEach, describe, expect, mock, test } from 'bun:test'

const calls: Array<{ name: string; args?: unknown }> = []
let nextResponse: { data: unknown; error: unknown } = { data: [], error: null }

const supabase = {
  rpc(name: string, args?: unknown) {
    calls.push({ name, args })
    const response = nextResponse
    if (name === 'create_patient_share_link') {
      return { maybeSingle: () => Promise.resolve(response) }
    }
    return Promise.resolve(response)
  },
}

mock.module('../../src/lib/supabase', () => ({ supabase }))

const {
  SHARE_CONSENT_TEXT_VERSION,
  SHARE_CONSENT_TEXT_VERSION_BY_SCOPE,
  SHARE_LINK_SCOPE_VERSION,
  SHARE_SCOPE_LABELS,
  SHARE_SCOPE_VERSIONS,
  createShareLink,
  fetchShareablePatients,
  fetchShareLinks,
  isShareScopeVersion,
  revokeShareLink,
  shareConsentTextVersion,
  shareScopeLabel,
} = await import('../../src/lib/shareLinks')

beforeEach(() => {
  calls.length = 0
  nextResponse = { data: [], error: null }
})

describe('shareLinks RPC adapter', () => {
  test('maps shareable patients and active links into camelCase view models', async () => {
    nextResponse = {
      data: [{ patient_id: 'p1', display_name: '王阿姨', is_own_patient: true }],
      error: null,
    }
    await expect(fetchShareablePatients()).resolves.toEqual([{ patientId: 'p1', displayName: '王阿姨', isOwnPatient: true }])

    nextResponse = {
      data: [{ link_id: 'link-1', patient_id: 'p1', scope_version: 'daily-summary-v1', expires_at: '2026-09-10T00:00:00Z', revoked_at: null, created_at: '2026-09-09T00:00:00Z' }],
      error: null,
    }
    await expect(fetchShareLinks('p1')).resolves.toEqual([{
      linkId: 'link-1',
      patientId: 'p1',
      scopeVersion: 'daily-summary-v1',
      expiresAt: '2026-09-10T00:00:00Z',
      revokedAt: null,
      createdAt: '2026-09-09T00:00:00Z',
    }])

    expect(calls).toEqual([
      { name: 'fetch_shareable_patients', args: undefined },
      { name: 'list_patient_share_links', args: { p_patient_id: 'p1' } },
    ])
  })

  test('treats missing RPC arrays as empty lists', async () => {
    nextResponse = { data: null, error: null }
    await expect(fetchShareablePatients()).resolves.toEqual([])
    await expect(fetchShareLinks('p1')).resolves.toEqual([])
  })

  test('passes the consent contract to create and returns the one-time raw token', async () => {
    nextResponse = { data: { link_id: 'link-2', expires_at: '2026-09-12T00:00:00Z' }, error: null }

    const created = await createShareLink({
      patientId: 'p2',
      consentType: 'authorized_representative',
      proxyConsent: { relationship: 'child', incapacityAttested: true },
      expiryHours: 72,
    })

    expect(created).toMatchObject({ linkId: 'link-2', expiresAt: '2026-09-12T00:00:00Z' })
    expect(created.token).toMatch(/^[0-9a-f]{64}$/)
    expect(calls[0]).toMatchObject({
      name: 'create_patient_share_link',
      args: {
        p_patient_id: 'p2',
        p_scope_version: SHARE_LINK_SCOPE_VERSION,
        p_consent_type: 'authorized_representative',
        p_authorization_basis: 'relationship=child;reason=patient_cannot_consent;guardian_status=not_court_appointed',
        p_consent_text_version: SHARE_CONSENT_TEXT_VERSION,
      },
    })
    const createArgs = calls[0]?.args as Record<string, unknown>
    expect(createArgs.p_token_hash).toMatch(/^[0-9a-f]{64}$/)
    expect(createArgs.p_token_hash).not.toBe(created.token)
  })

  test('rethrows RPC failures so the UI cannot present a link that was not persisted', async () => {
    const failure = new Error('rpc unavailable')
    nextResponse = { data: null, error: failure }
    await expect(fetchShareablePatients()).rejects.toBe(failure)
    await expect(fetchShareLinks('p1')).rejects.toBe(failure)
    await expect(createShareLink({ patientId: 'p1', consentType: 'self', expiryHours: 24 })).rejects.toBe(failure)
    await expect(revokeShareLink('link-1')).rejects.toBe(failure)
  })

  test('sends no authorization basis for self consent', async () => {
    nextResponse = { data: { link_id: 'link-4', expires_at: '2026-09-12T00:00:00Z' }, error: null }
    // self 帶依據會被 RPC 拒絕；就算呼叫端誤傳 proxyConsent，也不能送出去。
    await createShareLink({ patientId: 'p1', consentType: 'self', proxyConsent: { relationship: 'spouse', incapacityAttested: true }, expiryHours: 24 })
    expect((calls[0]?.args as Record<string, unknown>).p_authorization_basis).toBeNull()
  })

  test('refuses a proxy share without relationship or attestation before minting a token or calling the RPC', async () => {
    // 前端第一道防線：缺證據的代理同意連 RPC 都不送；伺服器端的 regex 是第二道（見 structured proxy migration 測試）。
    await expect(createShareLink({ patientId: 'p2', consentType: 'authorized_representative', expiryHours: 24 })).rejects.toThrow('Structured proxy consent')
    await expect(createShareLink({ patientId: 'p2', consentType: 'authorized_representative', proxyConsent: { relationship: 'child', incapacityAttested: false }, expiryHours: 24 })).rejects.toThrow('Structured proxy consent')
    await expect(createShareLink({
      patientId: 'p2',
      consentType: 'authorized_representative',
      proxyConsent: { relationship: 'legal_guardian' as never, incapacityAttested: true },
      expiryHours: 24,
    })).rejects.toThrow('Structured proxy consent')
    expect(calls).toEqual([])
  })

  test('uses the owner-approved consent text version', () => {
    // #424 G：2026-09-25 定稿版本取代 2026-09-04-draft；F5：v2 沿用同一版本號（scope 由 scope_version 欄位區分）。
    expect(SHARE_CONSENT_TEXT_VERSION).toBe('2026-09-25-share-v1')
    expect(SHARE_CONSENT_TEXT_VERSION_BY_SCOPE).toEqual({ 'daily-summary-v1': '2026-09-25-share-v1', 'daily-summary-v2': '2026-09-25-share-v1' })
    // migration 20260925120000 拒絕早於 2026-09-25-share-v1 的文字版本；兩個 scope 都不能低於它。
    for (const scope of SHARE_SCOPE_VERSIONS) expect(shareConsentTextVersion(scope) >= '2026-09-25-share-v1').toBe(true)
  })

  test('defaults to daily-summary-v2 and sends the scope-matched consent text version (ADR-009 T4)', async () => {
    expect(SHARE_LINK_SCOPE_VERSION).toBe('daily-summary-v2')
    expect(SHARE_SCOPE_VERSIONS).toEqual(['daily-summary-v2', 'daily-summary-v1'])
    nextResponse = { data: { link_id: 'link-5', expires_at: '2026-09-26T00:00:00Z' }, error: null }
    await createShareLink({ patientId: 'p1', consentType: 'self', expiryHours: 24 })
    expect(calls[0]?.args).toMatchObject({ p_scope_version: 'daily-summary-v2', p_consent_text_version: shareConsentTextVersion('daily-summary-v2') })

    calls.length = 0
    nextResponse = { data: { link_id: 'link-6', expires_at: '2026-09-26T00:00:00Z' }, error: null }
    await createShareLink({ patientId: 'p1', consentType: 'self', expiryHours: 24, scopeVersion: 'daily-summary-v1' })
    expect(calls[0]?.args).toMatchObject({ p_scope_version: 'daily-summary-v1', p_consent_text_version: shareConsentTextVersion('daily-summary-v1') })
  })

  test('labels every scope in three locales and marks v2 as including the medication list', () => {
    for (const scope of SHARE_SCOPE_VERSIONS) {
      expect(isShareScopeVersion(scope)).toBe(true)
      const label = SHARE_SCOPE_LABELS[scope]
      expect(label.zh.length).toBeGreaterThan(0)
      expect(label.id.length).toBeGreaterThan(0)
      expect(label.en.length).toBeGreaterThan(0)
    }
    expect(SHARE_SCOPE_LABELS['daily-summary-v2'].zh).toContain('含藥單')
    expect(SHARE_SCOPE_LABELS['daily-summary-v2'].en).toContain('medication list')
    expect(SHARE_SCOPE_LABELS['daily-summary-v2'].id).toContain('daftar obat')
    expect(isShareScopeVersion('daily-summary-v3')).toBe(false)
    // 不認得的 scope：三語「未知」字樣＋識別碼，不是三語相同的 runtime fallback（PR #942 Codex P2）。
    const unknown = shareScopeLabel('daily-summary-v3')
    expect(unknown.zh).toBe('未知的連結內容範圍（daily-summary-v3）')
    expect(unknown.en).toBe('Unknown link contents (daily-summary-v3)')
    expect(unknown.id).toBe('Isi tautan tidak dikenal (daily-summary-v3)')
    expect(shareScopeLabel('daily-summary-v2')).toBe(SHARE_SCOPE_LABELS['daily-summary-v2'])
  })

  test('calls revoke with the server-side link id only', async () => {
    await revokeShareLink('link-3')
    expect(calls).toEqual([{ name: 'revoke_patient_share_link', args: { p_link_id: 'link-3' } }])
  })
})
