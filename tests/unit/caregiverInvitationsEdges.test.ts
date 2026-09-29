/*
檔案用途：驗證照護邀請的 sessionStorage 接續、建立回應驗證與管理 RPC 錯誤邊界。
所在層：tests/unit；用本地 window／Supabase mock 覆蓋邀請流程，不儲存或傳送真實邀請 token。
主要關聯：src/lib/caregiverInvitations.ts、CaregiverInvitationManagement、加入邀請頁與 caregiver RPC。
*/
import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'

let rpcResponse: { data: unknown; error: unknown } = { data: null, error: null }
let functionResponse: { data: unknown; error: unknown } = { data: null, error: null }
const rpcCalls: Array<{ name: string; args: unknown }> = []
const functionCalls: Array<{ name: string; options: unknown }> = []

const supabase = {
  rpc: async (name: string, args?: unknown) => {
    rpcCalls.push({ name, args })
    return rpcResponse
  },
  functions: {
    invoke: async (name: string, options: unknown) => {
      functionCalls.push({ name, options })
      return functionResponse
    },
  },
}

mock.module('../../src/lib/supabase', () => ({ supabase }))

const {
  CAREGIVER_INVITATION_STORAGE_KEY,
  PATIENT_INVITATION_STORAGE_KEY,
  approveCaregiverInvitation,
  captureCaregiverInvitationToken,
  capturePatientInvitationToken,
  clearStoredCaregiverInvitationToken,
  clearStoredPatientInvitationToken,
  createCaregiverInvitationWithEmail,
  fetchCaregiverInvitations,
  fetchPendingCaregiverInvitations,
  readCaregiverInvitationToken,
  readStoredCaregiverInvitationToken,
  readStoredPatientInvitationToken,
  requestCaregiverInvitation,
  requestPendingCaregiverInvitation,
  revokeCaregiverAccess,
  revokeCaregiverInvitation,
  claimPatientInvitationShare,
} = await import('../../src/lib/caregiverInvitations')

const originalWindow = globalThis.window
let hash = ''
let pathname = '/join'
let search = '?from=email'
let storageThrows = false
const storage = new Map<string, string>()
const historyCalls: unknown[][] = []
const fakeWindow = {
  location: { get hash() { return hash }, get pathname() { return pathname }, get search() { return search } },
  sessionStorage: {
    getItem: (key: string) => {
      if (storageThrows) throw new Error('storage blocked')
      return storage.get(key) ?? null
    },
    setItem: (key: string, value: string) => {
      if (storageThrows) throw new Error('storage blocked')
      storage.set(key, value)
    },
    removeItem: (key: string) => {
      if (storageThrows) throw new Error('storage blocked')
      storage.delete(key)
    },
  },
  history: { replaceState: (...args: unknown[]) => { historyCalls.push(args) } },
} as unknown as Window & typeof globalThis

const validToken = 'a'.repeat(64)
const validInvitationRow = {
  invitation_id: 'i1',
  patient_id: 'p1',
  patient_display_name: '照護對象',
  invited_email: 'care@example.com',
  status: 'accepted',
  can_record: true,
  can_manage_medication: false,
  requested_email: 'helper@example.com',
  access_active: true,
  created_at: '2026-09-09T00:00:00Z',
  expires_at: '2026-09-16T00:00:00Z',
  accepted_at: '2026-09-09T01:00:00Z',
  revoked_at: null,
}

beforeEach(() => {
  globalThis.window = fakeWindow
  hash = ''
  pathname = '/join'
  search = '?from=email'
  storage.clear()
  historyCalls.length = 0
  storageThrows = false
  rpcCalls.length = 0
  functionCalls.length = 0
  rpcResponse = { data: null, error: null }
  functionResponse = { data: null, error: null }
})

afterEach(() => {
  if (originalWindow) globalThis.window = originalWindow
  else delete (globalThis as { window?: Window & typeof globalThis }).window
})

describe('caregiver invitation edge paths', () => {
  test('captures, lowercases, cleans, restores, and clears caregiver tokens', () => {
    hash = `#token=${validToken.toUpperCase()}`
    expect(readCaregiverInvitationToken()).toBe(validToken)
    expect(captureCaregiverInvitationToken()).toBe(validToken)
    expect(storage.get(CAREGIVER_INVITATION_STORAGE_KEY)).toBe(validToken)
    expect(historyCalls[0]).toEqual([null, '', '/join?from=email'])

    hash = ''
    expect(captureCaregiverInvitationToken()).toBe(validToken)
    expect(readStoredCaregiverInvitationToken()).toBe(validToken)
    storage.set(CAREGIVER_INVITATION_STORAGE_KEY, 'not-a-token')
    expect(readStoredCaregiverInvitationToken()).toBeNull()
    clearStoredCaregiverInvitationToken()
    expect(storage.has(CAREGIVER_INVITATION_STORAGE_KEY)).toBe(false)
  })

  test('captures and restores patient invitations through their separate storage key', () => {
    hash = `#token=${validToken}`
    pathname = '/patient-invite'
    expect(capturePatientInvitationToken()).toBe(validToken)
    expect(storage.get(PATIENT_INVITATION_STORAGE_KEY)).toBe(validToken)
    expect(historyCalls[0]).toEqual([null, '', '/patient-invite?from=email'])
    expect(readStoredPatientInvitationToken()).toBe(validToken)
    clearStoredPatientInvitationToken()
    expect(readStoredPatientInvitationToken()).toBeNull()
  })

  test('fails closed when invitation storage is unavailable, but still clears the token from the URL', () => {
    hash = `#token=${validToken}`
    storageThrows = true
    expect(captureCaregiverInvitationToken()).toBe(validToken)
    // storage 失敗也必須清掉 #token=…，否則邀請 secret 會留在網址列與瀏覽器歷史。
    expect(historyCalls[0]).toEqual([null, '', '/join?from=email'])
    expect(readStoredCaregiverInvitationToken()).toBeNull()
    clearStoredCaregiverInvitationToken()
    pathname = '/patient-invite'
    expect(capturePatientInvitationToken()).toBe(validToken)
    expect(historyCalls[1]).toEqual([null, '', '/patient-invite?from=email'])
    expect(readStoredPatientInvitationToken()).toBeNull()
    clearStoredPatientInvitationToken()
  })

  test('accepts valid email invitation responses and supplies a normalized email fallback', async () => {
    functionResponse = { data: { emailStatus: 'sent', invitation: { invitationId: 'i2', token: validToken, expiresAt: '2026-09-20T00:00:00Z' } }, error: null }
    await expect(createCaregiverInvitationWithEmail('p1', '  CARE@EXAMPLE.COM  ', true, true)).resolves.toEqual({
      invitationId: 'i2',
      token: validToken,
      expiresAt: '2026-09-20T00:00:00Z',
      invitedEmail: 'care@example.com',
      emailStatus: 'sent',
    })
    expect(functionCalls[0]).toEqual({ name: 'send-invitation-email', options: { body: { kind: 'caregiver', patientId: 'p1', invitedEmail: 'CARE@EXAMPLE.COM', canRecord: true, canManageMedication: true } } })

    functionResponse = { data: { emailStatus: 'failed', invitation: { invitationId: 'i3', token: validToken, expiresAt: '2026-09-20T00:00:00Z', invitedEmail: 'other@example.com' } }, error: null }
    await expect(createCaregiverInvitationWithEmail('p1', 'care@example.com', false, false)).resolves.toMatchObject({ invitedEmail: 'other@example.com', emailStatus: 'failed' })
  })

  test('rejects invalid email input and malformed Function responses', async () => {
    await expect(createCaregiverInvitationWithEmail('p1', '  ', true, false)).rejects.toThrow('Valid Google email')
    await expect(createCaregiverInvitationWithEmail('p1', 'not-an-email', true, false)).rejects.toThrow('Valid Google email')

    const functionError = new Error('function failed')
    functionResponse = { data: null, error: functionError }
    await expect(createCaregiverInvitationWithEmail('p1', 'care@example.com', true, false)).rejects.toBe(functionError)

    for (const data of [null, { invitation: { invitationId: 'i', token: 'short', expiresAt: 'date' }, emailStatus: 'sent' }, { invitation: { invitationId: 'i', token: validToken, expiresAt: 'date' }, emailStatus: 'unknown' }]) {
      functionResponse = { data, error: null }
      await expect(createCaregiverInvitationWithEmail('p1', 'care@example.com', true, false)).rejects.toThrow()
    }
  })

  test('maps invitation lists and pending lists, including nullable audit fields', async () => {
    rpcResponse = { data: [validInvitationRow], error: null }
    await expect(fetchCaregiverInvitations()).resolves.toEqual([{
      invitationId: 'i1', patientId: 'p1', patientDisplayName: '照護對象', invitedEmail: 'care@example.com', status: 'accepted',
      canRecord: true, canManageMedication: false, requestedEmail: 'helper@example.com', accessActive: true,
      createdAt: '2026-09-09T00:00:00Z', expiresAt: '2026-09-16T00:00:00Z', acceptedAt: '2026-09-09T01:00:00Z', revokedAt: null,
    }])
    rpcResponse = { data: [{ invitation_id: 'i2', patient_display_name: null, invited_email: null, status: 'pending', can_record: 0, can_manage_medication: 1, created_at: 'created', expires_at: 'expires' }], error: null }
    await expect(fetchPendingCaregiverInvitations()).resolves.toEqual([{ invitationId: 'i2', patientDisplayName: '', invitedEmail: '', status: 'pending', canRecord: false, canManageMedication: true, createdAt: 'created', expiresAt: 'expires' }])
    expect(rpcCalls.map(call => call.name)).toEqual(['fetch_caregiver_invitations', 'fetch_pending_caregiver_invitations'])
  })

  test('forwards invitation state changes and all RPC errors', async () => {
    await requestPendingCaregiverInvitation('i1')
    await approveCaregiverInvitation('i1')
    await revokeCaregiverInvitation('i1')
    await revokeCaregiverAccess('p1', 'care@example.com')
    expect(rpcCalls).toEqual([
      { name: 'request_caregiver_invitation_by_id', args: { p_invitation_id: 'i1' } },
      { name: 'approve_caregiver_invitation', args: { p_invitation_id: 'i1' } },
      { name: 'revoke_caregiver_invitation', args: { p_invitation_id: 'i1' } },
      { name: 'revoke_caregiver_access', args: { p_patient_id: 'p1', p_profile_email: 'care@example.com' } },
    ])

    const failure = new Error('rpc failed')
    rpcResponse = { data: null, error: failure }
    await expect(fetchCaregiverInvitations()).rejects.toBe(failure)
    await expect(fetchPendingCaregiverInvitations()).rejects.toBe(failure)
    await expect(requestPendingCaregiverInvitation('i1')).rejects.toBe(failure)
    await expect(approveCaregiverInvitation('i1')).rejects.toBe(failure)
    await expect(revokeCaregiverInvitation('i1')).rejects.toBe(failure)
    await expect(revokeCaregiverAccess('p1', 'care@example.com')).rejects.toBe(failure)
  })

  test('validates and hashes caregiver/patient tokens before protected RPCs', async () => {
    await expect(requestCaregiverInvitation('short')).rejects.toThrow('invalid or expired')
    await expect(claimPatientInvitationShare('short')).rejects.toThrow('invalid or expired')
    await requestCaregiverInvitation(validToken)
    await claimPatientInvitationShare(validToken)
    expect(rpcCalls).toEqual([
      { name: 'request_caregiver_invitation', args: { p_token_hash: expect.stringMatching(/^[0-9a-f]{64}$/) } },
      { name: 'claim_patient_care_invitation_share', args: { p_token_hash: expect.stringMatching(/^[0-9a-f]{64}$/) } },
    ])

    const failure = new Error('claim failed')
    rpcResponse = { data: null, error: failure }
    await expect(requestCaregiverInvitation(validToken)).rejects.toBe(failure)
    await expect(claimPatientInvitationShare(validToken)).rejects.toBe(failure)
  })
})
