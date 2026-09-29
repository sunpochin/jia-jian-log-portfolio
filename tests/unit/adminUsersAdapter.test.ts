/*
檔案用途：驗證後台使用者清單／開通付費旗標 adapter 的 Edge Function 呼叫與錯誤邊界。
所在層：tests/unit；只使用 Supabase Function mock，不讀取真實帳號清單。
主要關聯：src/lib/adminUsers.ts、admin-list-users／admin-set-account-entitlement Edge Function 與 AdminPage。
*/
import { beforeEach, describe, expect, mock, test } from 'bun:test'

let result: { data: unknown; error: unknown } = { data: { users: [], totalCount: 0 }, error: null }
let call: { functionName: string; options: unknown } | null = null
const supabase = {
  functions: {
    invoke: async (functionName: string, options: unknown) => {
      call = { functionName, options }
      return result
    },
  },
}

mock.module('../../src/lib/supabase', () => ({ supabase }))

const { fetchAdminUsers, setAccountEntitlement } = await import('../../src/lib/adminUsers')

const baseUserRow = {
  userId: 'u1',
  email: 'a@example.com',
  displayName: null,
  createdAt: null,
  lastSignInAt: null,
  personalNotificationTier: 'none',
  medicationAiDraftTier: 'none',
  premiumTier: 'none',
  medicationCatalogCuratorTier: 'none',
}

beforeEach(() => {
  call = null
  result = { data: { users: [baseUserRow], totalCount: 1 }, error: null }
})

describe('fetchAdminUsers', () => {
  test('passes the optional abort signal and parses the function response', async () => {
    const controller = new AbortController()
    await expect(fetchAdminUsers(controller.signal)).resolves.toEqual({ users: [baseUserRow], totalCount: 1 })
    expect(call).toEqual({ functionName: 'admin-list-users', options: { body: {}, signal: controller.signal } })
  })

  test('normalizes function errors before they reach the page', async () => {
    result = { data: null, error: new Error('upstream detail should stay internal') }
    await expect(fetchAdminUsers()).rejects.toThrow('admin list users request failed')
  })

  test('rejects a response missing the new tier fields', async () => {
    result = { data: { users: [{ userId: 'u1', email: 'a@example.com', displayName: null, createdAt: null, lastSignInAt: null }], totalCount: 1 }, error: null }
    await expect(fetchAdminUsers()).rejects.toThrow('admin user row personal notification tier is invalid')
  })
})

describe('setAccountEntitlement', () => {
  test('invokes the function with the request body and the optional abort signal', async () => {
    result = { data: { ok: true }, error: null }
    const controller = new AbortController()
    const params = { targetEmail: 'caregiver@example.com', entitlement: 'personal_notification_tier' as const, value: 'personal', reason: 'paid' as const }
    await setAccountEntitlement(params, controller.signal)
    expect(call).toEqual({ functionName: 'admin-set-account-entitlement', options: { body: params, signal: controller.signal } })
  })

  test('normalizes function errors before they reach the page', async () => {
    result = { data: null, error: new Error('upstream detail should stay internal') }
    const params = { targetEmail: 'caregiver@example.com', entitlement: 'medication_ai_draft_tier' as const, value: 'ai', reason: 'trial' as const }
    await expect(setAccountEntitlement(params)).rejects.toThrow('admin set account entitlement request failed')
  })

  test('preserves the HTTP status from a 403 so the page can show a permission-specific message', async () => {
    result = { data: null, error: Object.assign(new Error('non-2xx status code'), { context: { status: 403 } }) }
    const params = { targetEmail: 'caregiver@example.com', entitlement: 'personal_notification_tier' as const, value: 'personal', reason: 'paid' as const }
    await expect(setAccountEntitlement(params)).rejects.toMatchObject({ status: 403 })
  })
})
