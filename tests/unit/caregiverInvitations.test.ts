/*
檔案用途：驗證家人照護邀請的 token 解析、分享文案與 RPC 轉接契約。
所在層：tests/unit；不連線 Supabase，僅使用假的 RPC 回應保護前端邊界。
主要關聯：src/lib/caregiverInvitations.ts、CaregiverInvitationJoinPage 與管理元件。
*/
import { beforeEach, describe, expect, mock, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

let rpcResponse: { data?: unknown; error?: unknown } = { data: null, error: null }
let lastRpc: { name: string; args: unknown } | null = null
let functionsResponse: { data?: unknown; error?: unknown } = { data: null, error: null }
let lastFunction: { name: string; body: unknown } | null = null

const mockSupabase = {
  rpc(name: string, args?: unknown) {
    lastRpc = { name, args }
    return Promise.resolve(rpcResponse)
  },
  functions: {
    invoke(name: string, options: { body: unknown }) {
      lastFunction = { name, body: options.body }
      return Promise.resolve(functionsResponse)
    },
  },
}

mock.module('../../src/lib/supabase', () => ({ supabase: mockSupabase }))

const {
  buildCaregiverInvitationUrl,
  caregiverInvitationShareText,
  buildPatientInvitationUrl,
  patientInvitationShareText,
  claimPatientInvitationShare,
  createCaregiverInvitationWithEmail,
  fetchPendingCaregiverInvitations,
  getCaregiverInvitationsRequiringRequest,
  readCaregiverInvitationToken,
  requestCaregiverInvitation,
  requestPendingCaregiverInvitation,
} = await import('../../src/lib/caregiverInvitations')

describe('caregiver invitations', () => {
  beforeEach(() => {
    rpcResponse = { data: null, error: null }
    lastRpc = null
    functionsResponse = { data: null, error: null }
    lastFunction = null
  })

  test('keeps invitation token in a fragment and rejects malformed values', () => {
    const token = 'A'.repeat(64)
    expect(buildCaregiverInvitationUrl('https://staging.example', token)).toBe(`https://staging.example/join#token=${token}`)
    expect(readCaregiverInvitationToken(`#token=${token}`)).toBe(token.toLowerCase())
    expect(readCaregiverInvitationToken('#token=too-short')).toBeNull()
    expect(readCaregiverInvitationToken('?token=' + 'f'.repeat(64))).toBe('f'.repeat(64))
  })

  test('uses neutral three-language share text without patient identifiers or health values', () => {
    const url = 'https://staging.example/join#token=' + 'a'.repeat(64)
    // 三種語言都逐一檢查，避免只驗中文而讓實際分享時才出現漏翻或敏感資訊。
    for (const locale of ['zh', 'id', 'en'] as const) {
      const shareText = caregiverInvitationShareText(locale, url)
      const patientShareText = patientInvitationShareText(locale, url.replace('/join#', '/patient-invite#'))
      expect(shareText).toContain(url)
      expect(patientShareText).toContain(url.replace('/join#', '/patient-invite#'))
      expect(shareText).not.toMatch(/血壓|診斷|病人姓名|患者|tekanan darah|diagnosis|nama pasien|blood pressure|diagnosis|patient name/i)
      expect(patientShareText).not.toMatch(/血壓|診斷|病人姓名|患者|tekanan darah|diagnosis|nama pasien|blood pressure|patient name/i)
    }
    expect(caregiverInvitationShareText('zh', url)).toContain('邀請你一起照護家庭成員')
    expect(caregiverInvitationShareText('id', url)).toContain('diundang untuk membantu merawat')
    expect(caregiverInvitationShareText('en', url)).toContain('invited to help care for a family member')
    expect(patientInvitationShareText('zh', url.replace('/join#', '/patient-invite#'))).toContain('指定的 Google 帳號')
    expect(patientInvitationShareText('id', url.replace('/join#', '/patient-invite#'))).toContain('akun Google yang ditentukan')
    expect(patientInvitationShareText('en', url.replace('/join#', '/patient-invite#'))).toContain('specified Google account')
  })

  test('exposes no client path that creates an invitation without a named recipient', async () => {
    // 2026-09-07 資安複查：舊的三參數 create_caregiver_invitation 會建立 invited_email 為 NULL 的邀請，
    // 那種邀請「任何拿到連結的帳號」都能申請，等於關掉收件人綁定。RPC 已由 migration DROP，
    // 這裡鎖住轉接層不得再長回一個直接呼叫 create_caregiver_invitation 的入口。
    const adapter = await import('../../src/lib/caregiverInvitations')
    expect(Object.keys(adapter)).not.toContain('createCaregiverInvitation')
    expect(readFileSync(join(import.meta.dir, '../../src/lib/caregiverInvitations.ts'), 'utf-8')).not.toContain("rpc('create_caregiver_invitation'")
  })

  test('hashes the raw token before requesting and never sends it to the RPC', async () => {
    const token = 'c'.repeat(64)
    await requestCaregiverInvitation(token)
    expect(lastRpc?.name).toBe('request_caregiver_invitation')
    expect(lastRpc?.args).toEqual({ p_token_hash: expect.stringMatching(/^[0-9a-f]{64}$/) })
    expect(JSON.stringify(lastRpc?.args)).not.toContain(token)
  })

  test('creates a targeted invitation through the email Function and preserves fallback status', async () => {
    functionsResponse = { data: { emailStatus: 'not_configured', invitation: { invitationId: 'invite-2', token: 'f'.repeat(64), expiresAt: '2026-09-12T00:00:00Z', invitedEmail: 'demo.oauth-tester@example.test' } }, error: null }
    await expect(createCaregiverInvitationWithEmail('00000000-0000-4000-8000-000000000001', 'demo.oauth-tester@example.test', true, false)).resolves.toMatchObject({ invitationId: 'invite-2', emailStatus: 'not_configured' })
    expect(lastFunction).toEqual({
      name: 'send-invitation-email',
      body: { kind: 'caregiver', patientId: '00000000-0000-4000-8000-000000000001', invitedEmail: 'demo.oauth-tester@example.test', canRecord: true, canManageMedication: false },
    })
  })

  test('reads targeted pending invitations and requests them by id', async () => {
    rpcResponse = { data: [{ invitation_id: 'invite-3', patient_display_name: 'Mother', invited_email: 'demo.oauth-tester@example.test', status: 'pending', can_record: true, can_manage_medication: false, created_at: '2026-09-06T00:00:00Z', expires_at: '2026-09-13T00:00:00Z' }], error: null }
    await expect(fetchPendingCaregiverInvitations()).resolves.toEqual([expect.objectContaining({ invitationId: 'invite-3', invitedEmail: 'demo.oauth-tester@example.test', status: 'pending' })])
    await requestPendingCaregiverInvitation('invite-3')
    expect(lastRpc).toEqual({ name: 'request_caregiver_invitation_by_id', args: { p_invitation_id: 'invite-3' } })
  })

  test('does not block existing care work after an invitation is already requested', () => {
    const base = { patientDisplayName: 'Mother', invitedEmail: 'demo.oauth-tester@example.test', canRecord: true, canManageMedication: false, createdAt: '2026-09-06T00:00:00Z', expiresAt: '2026-09-13T00:00:00Z' }
    const invitations = [
      { ...base, invitationId: 'pending', status: 'pending' as const },
      { ...base, invitationId: 'requested', status: 'requested' as const },
    ]
    expect(getCaregiverInvitationsRequiringRequest(invitations).map(invitation => invitation.invitationId)).toEqual(['pending'])
  })

  test('keeps the original patient invitation on its own route and hashes before claiming', async () => {
    const token = 'd'.repeat(64)
    const url = buildPatientInvitationUrl('https://staging.example', token)
    expect(url).toBe(`https://staging.example/patient-invite#token=${token}`)
    expect(patientInvitationShareText('zh', url)).toContain('指定的 Google 帳號')
    await claimPatientInvitationShare(token)
    expect(lastRpc?.name).toBe('claim_patient_care_invitation_share')
    expect(lastRpc?.args).toEqual({ p_token_hash: expect.stringMatching(/^[0-9a-f]{64}$/) })
    expect(JSON.stringify(lastRpc?.args)).not.toContain(token)
  })
})
