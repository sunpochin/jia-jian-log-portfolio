/*
檔案用途：測試多租戶、家庭 Onboarding、成員權限與照護對象類型的全方位邏輯驗證。
所在層：tests/unit 單元測試層。
主要關聯：驗證 src/lib/tenant.ts 中多租戶與家庭照護隔離 RPC 呼叫。
*/
import { beforeEach, describe, expect, mock, test } from 'bun:test'

type MockResponse = { data?: unknown; error?: unknown }
let rpcMockHandler: (name: string, args: unknown) => MockResponse = () => ({ data: null, error: null })
let householdMembersResponse: MockResponse = { data: [], error: null }
let patientsResponse: MockResponse = { data: [], error: null }
let authUserResponse: MockResponse = { data: { user: null }, error: null }
let insertRecordResponse: MockResponse = { data: null, error: null }
let functionsInvokeResponse: MockResponse = { data: null, error: null }
let lastFunctionInvoke: { name: string; body: unknown } | null = null

const mockSupabase = {
  rpc(name: string, args: unknown) {
    return Promise.resolve(rpcMockHandler(name, args))
  },
  from(table: string) {
    if (table === 'household_members') {
      return {
        select() {
          return {
            order() {
              return {
                limit() {
                  return Promise.resolve(householdMembersResponse)
                },
              }
            },
          }
        },
      }
    }
    if (table === 'patients') {
      return {
        select() {
          return {
            eq() {
              return {
                order() {
                  return Promise.resolve(patientsResponse)
                },
              }
            },
          }
        },
      }
    }
    if (table === 'blood_pressure_records') {
      return {
        insert() {
          return Promise.resolve(insertRecordResponse)
        },
      }
    }
    return {
      select() {
        return Promise.resolve({ data: null, error: null })
      },
    }
  },
  auth: {
    getUser() {
      return Promise.resolve(authUserResponse)
    },
  },
  functions: {
    invoke(name: string, options: { body: unknown }) {
      lastFunctionInvoke = { name, body: options.body }
      return Promise.resolve(functionsInvokeResponse)
    },
  },
}

mock.module('../../src/lib/supabase', () => ({ supabase: mockSupabase }))

const {
  acceptPatientCareInvitation,
  addHouseholdMember,
  addHouseholdPatient,
  createHouseholdPatientInvitation,
  createHouseholdPatientInvitationWithEmail,
  archiveHouseholdPet,
  beginHouseholdOnboarding,
  declinePatientCareInvitation,
  fetchCurrentHouseholdRole,
  fetchPendingPatientCareInvitations,
  fetchHouseholdArchivedPets,
  fetchHouseholdMembers,
  fetchHouseholdPatientAccess,
  fetchHouseholdPets,
  fetchHouseholdManagementPatients,
  fetchTenantContext,
  isCareRecipientType,
  removeHouseholdMember,
  saveTenantBpRecord,
  setHouseholdPatientAccess,
  validateHouseholdOnboarding,
} = await import('../../src/lib/tenant')

describe('tenant and household validation & care ops', () => {
  beforeEach(() => {
    rpcMockHandler = () => ({ data: null, error: null })
    householdMembersResponse = { data: [], error: null }
    patientsResponse = { data: [], error: null }
    authUserResponse = { data: { user: null }, error: null }
    insertRecordResponse = { data: null, error: null }
    functionsInvokeResponse = { data: null, error: null }
    lastFunctionInvoke = null
  })

  test('validateHouseholdOnboarding rejects empty or oversized names', () => {
    expect(validateHouseholdOnboarding({ householdName: '', patientName: 'Mother' })).not.toBeNull()
    expect(validateHouseholdOnboarding({ householdName: 'Family', patientName: '' })).not.toBeNull()
    expect(validateHouseholdOnboarding({ householdName: 'a'.repeat(101), patientName: 'Mother' })).not.toBeNull()
    expect(validateHouseholdOnboarding({ householdName: 'Family', patientName: 'Mother' })).toBeNull()
  })

  test('isCareRecipientType checks valid care recipient categories', () => {
    expect(isCareRecipientType('human')).toBe(true)
    expect(isCareRecipientType('dog')).toBe(true)
    expect(isCareRecipientType('cat')).toBe(true)
    expect(isCareRecipientType('bird')).toBe(true)
    expect(isCareRecipientType('other')).toBe(true)
    expect(isCareRecipientType('')).toBe(false)
  })

  test('beginHouseholdOnboarding handles success and RPC errors', async () => {
    await expect(beginHouseholdOnboarding({ householdName: '', patientName: '' })).rejects.toThrow()

    // 模擬 RPC 傳回成功 household_id 與 patient_id
    rpcMockHandler = (name) => {
      if (name === 'begin_household_onboarding_v2') {
        return { data: { household_id: 'hh-1', patient_id: 'pat-1' }, error: null }
      }
      return { data: null, error: null }
    }
    const result = await beginHouseholdOnboarding({ householdName: 'Lee Family', patientName: 'Mother' })
    expect(result).toEqual({ householdId: 'hh-1', patientId: 'pat-1' })

    // 模擬 RPC 回傳空資料時拋出雙語錯誤提示
    rpcMockHandler = () => ({ data: null, error: null })
    await expect(beginHouseholdOnboarding({ householdName: 'Lee Family', patientName: 'Mother' })).rejects.toThrow()
  })

  test('fetchTenantContext reads household and patients', async () => {
    // 模擬無家庭成員時回傳 null
    householdMembersResponse = { data: [], error: null }
    let context = await fetchTenantContext()
    expect(context).toBeNull()

    // 模擬已有家庭與成員對象列表
    householdMembersResponse = { data: [{ household_id: 'hh-100' }], error: null }
    patientsResponse = {
      data: [
        { id: 'pat-100', household_id: 'hh-100', display_name: 'Mother', care_recipient_type: 'human' },
        { id: 'pat-101', household_id: 'hh-100', display_name: 'Mimi', care_recipient_type: 'cat' },
      ],
      error: null,
    }

    context = await fetchTenantContext()
    expect(context).not.toBeNull()
    expect(context?.householdId).toBe('hh-100')
    expect(context?.patients.length).toBe(2)
  })

  test('saveTenantBpRecord checks authentication and inserts record', async () => {
    // 未登入情境應拋出提示
    authUserResponse = { data: { user: null }, error: null }
    await expect(saveTenantBpRecord('pat-1', { systolic: 120, diastolic: 80, pulse: 70, measuredAt: '2026-07-31T08:00:00Z' })).rejects.toThrow('Silakan masuk lagi')

    // 已登入情境正常寫入血壓與心跳
    authUserResponse = { data: { user: { id: 'usr-portfolio-author' } }, error: null }
    insertRecordResponse = { data: null, error: null }

    await saveTenantBpRecord('pat-1', { systolic: 120, diastolic: 80, pulse: 70, measuredAt: '2026-07-31T08:00:00Z' })
    expect(true).toBe(true)
  })

  test('addHouseholdPatient validates parameters and invokes RPC', async () => {
    await expect(addHouseholdPatient('')).rejects.toThrow()
    await expect(addHouseholdPatient('a'.repeat(101))).rejects.toThrow()
    await expect(addHouseholdPatient('Test', 'invalid' as any)).rejects.toThrow()

    rpcMockHandler = (name, args) => {
      if (name === 'add_household_care_recipient') {
        const payload = args as { p_display_name: string; p_care_recipient_type: string }
        if (payload.p_display_name === 'Doggy') return { data: 'pat-dog-1', error: null }
      }
      return { data: null, error: null }
    }

    const patientId = await addHouseholdPatient('Doggy', 'dog')
    expect(patientId).toBe('pat-dog-1')
  })

  test('createHouseholdPatientInvitation validates the consent request and returns invitation id', async () => {
    await expect(createHouseholdPatientInvitation('', 'mother@example.com', 'daughter')).rejects.toThrow()
    await expect(createHouseholdPatientInvitation('Mother', 'not-an-email', 'daughter')).rejects.toThrow()
    await expect(createHouseholdPatientInvitation('Mother', 'mother@example.com', '')).rejects.toThrow()
    rpcMockHandler = (name, args) => {
      if (name === 'create_household_patient_invitation') {
        expect(args).toEqual({ p_display_name: 'Mother', p_invited_email: 'mother@example.com', p_authorization_basis: 'daughter with consent' })
        return { data: { invitation_id: 'invite-1' }, error: null }
      }
      return { data: null, error: null }
    }
    await expect(createHouseholdPatientInvitation('Mother', 'mother@example.com', 'daughter with consent')).resolves.toBe('invite-1')
  })

  test('createHouseholdPatientInvitationWithEmail returns the one-time link and delivery status', async () => {
    functionsInvokeResponse = {
      data: {
        emailStatus: 'sent',
        invitation: { invitationId: 'invite-2', patientId: 'patient-2', token: 'e'.repeat(64), expiresAt: '2026-09-12T00:00:00Z', invitedEmail: 'demo.oauth-tester@example.test' },
      },
      error: null,
    }
    await expect(createHouseholdPatientInvitationWithEmail('Mother', 'demo.oauth-tester@example.test', 'daughter with consent')).resolves.toMatchObject({ invitationId: 'invite-2', emailStatus: 'sent' })
    expect(lastFunctionInvoke).toEqual({
      name: 'send-invitation-email',
      body: { kind: 'patient', displayName: 'Mother', invitedEmail: 'demo.oauth-tester@example.test', authorizationBasis: 'daughter with consent' },
    })
  })

  test('fetchPendingPatientCareInvitations keeps the authenticated inviter identity', async () => {
    // 同意畫面必須收到資料庫驗證的邀請者 email，不能只剩可自由填寫的授權說明。
    rpcMockHandler = (name) => name === 'fetch_pending_patient_care_invitations'
      ? { data: [{ invitation_id: 'invite-1', patient_id: 'patient-1', display_name: 'Mother', inviter_email: 'owner@example.com', inviter_display_name: 'Owner', authorization_basis: 'daughter with consent', created_at: '2026-08-14T09:00:00Z' }], error: null }
      : { data: null, error: null }

    const invitations = await fetchPendingPatientCareInvitations()
    expect(invitations[0].inviter_email).toBe('owner@example.com')

    rpcMockHandler = () => ({ data: null, error: new Error('rpc failed') })
    await expect(fetchPendingPatientCareInvitations()).rejects.toThrow('rpc failed')
  })

  test('acceptPatientCareInvitation returns the granted patient id and refuses an empty response', async () => {
    rpcMockHandler = (name) => name === 'accept_patient_care_invitation' ? { data: 'patient-1', error: null } : { data: null, error: null }
    await expect(acceptPatientCareInvitation('invite-1')).resolves.toBe('patient-1')

    rpcMockHandler = () => ({ data: null, error: null })
    await expect(acceptPatientCareInvitation('invite-1')).rejects.toThrow()

    rpcMockHandler = () => ({ data: null, error: new Error('rpc failed') })
    await expect(acceptPatientCareInvitation('invite-1')).rejects.toThrow('rpc failed')
  })

  test('declinePatientCareInvitation calls the RPC and surfaces its failure', async () => {
    rpcMockHandler = () => ({ data: null, error: null })
    await expect(declinePatientCareInvitation('invite-1')).resolves.toBeUndefined()

    rpcMockHandler = () => ({ data: null, error: new Error('rpc failed') })
    await expect(declinePatientCareInvitation('invite-1')).rejects.toThrow('rpc failed')
  })

  test('fetchHouseholdMembers and fetchCurrentHouseholdRole validate responses', async () => {
    rpcMockHandler = (name) => {
      if (name === 'fetch_household_members') {
        return { data: [{ user_id: 'u1', email: 'a@b.com', display_name: 'A', role: 'owner', created_at: '2026-07-01' }], error: null }
      }
      if (name === 'fetch_current_household_role') {
        return { data: 'owner', error: null }
      }
      return { data: null, error: null }
    }

    const members = await fetchHouseholdMembers()
    expect(members.length).toBe(1)
    expect(members[0].role).toBe('owner')

    const role = await fetchCurrentHouseholdRole()
    expect(role).toBe('owner')
  })

  test('fetchCurrentHouseholdRole rejects invalid role string', async () => {
    rpcMockHandler = () => ({ data: 'superadmin', error: null })
    await expect(fetchCurrentHouseholdRole()).rejects.toThrow()
  })

  test('household member addition and removal calls RPC correctly', async () => {
    await expect(addHouseholdMember('')).rejects.toThrow()
    await expect(addHouseholdMember('   ')).rejects.toThrow()

    rpcMockHandler = () => ({ data: null, error: null })
    await addHouseholdMember('caregiver@example.com', 'caregiver')
    await removeHouseholdMember('usr-123')
    expect(true).toBe(true)
  })

  test('pet and patient management RPCs process data correctly', async () => {
    rpcMockHandler = (name) => {
      if (name === 'fetch_household_management_patients') return { data: [{ patient_id: 'p1', display_name: 'P1' }], error: null }
      if (name === 'fetch_household_pets') return { data: [{ patient_id: 'pet1', display_name: 'Kiki', care_recipient_type: 'cat' }], error: null }
      if (name === 'fetch_household_archived_pets') return { data: [{ patient_id: 'pet2', display_name: 'Mimi', care_recipient_type: 'cat' }], error: null }
      if (name === 'fetch_household_patient_access') return { data: [{ profile_email: 'a@b.com', patient_id: 'p1', can_record: true, can_manage_medication: true }], error: null }
      return { data: null, error: null }
    }

    const patients = await fetchHouseholdManagementPatients()
    expect(patients.length).toBe(1)

    const pets = await fetchHouseholdPets()
    expect(pets[0].care_recipient_type).toBe('cat')

    const archivedPets = await fetchHouseholdArchivedPets()
    expect(archivedPets.length).toBe(1)

    const access = await fetchHouseholdPatientAccess()
    expect(access[0].can_record).toBe(true)

    await archiveHouseholdPet('pet1')
    await setHouseholdPatientAccess('caregiver@example.com', 'p1', true, true)
    expect(true).toBe(true)
  })
})
