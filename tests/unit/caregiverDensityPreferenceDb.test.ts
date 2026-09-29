/*
檔案用途：驗證登入帳號的看護密度模式偏好透過 user_settings 讀寫；「是否已做過選擇」只看
caregiver_density_mode_saved_at 這個專屬時間戳（不受同一列其他設定寫入影響），
NULL 時改讀 fetch_current_household_role() 算角色預設，非 NULL 則永遠尊重使用者的選擇。
所在層：tests/unit；以 Supabase client stub 覆蓋資料庫邊界，不連線遠端環境。
主要關聯：對應 src/lib/preferences/caregiverDensityPreference.ts 的帳號設定轉接與 issue #737 的角色預設修正。
*/
import { beforeEach, describe, expect, mock, test } from 'bun:test'

type Response = { data?: unknown; error?: unknown }
const responses: Response[] = []
const rpcResponses: Response[] = []
const calls: Array<{ method: string; args: unknown[] }> = []

function queuedResponse(): Response {
  return responses.shift() ?? { data: null, error: null }
}

const supabase = {
  from(table: string) {
    expect(table).toBe('user_settings')
    const response = queuedResponse()
    const chain: Record<string, (...args: unknown[]) => unknown> = {}
    chain.select = (...args) => { calls.push({ method: 'select', args }); return chain }
    chain.eq = (...args) => { calls.push({ method: 'eq', args }); return chain }
    chain.maybeSingle = () => Promise.resolve(response)
    chain.upsert = (...args) => { calls.push({ method: 'upsert', args }); return Promise.resolve(response) }
    return chain
  },
  rpc(name: string) {
    calls.push({ method: 'rpc', args: [name] })
    return Promise.resolve(rpcResponses.shift() ?? { data: 'viewer', error: null })
  },
}

mock.module('../../src/lib/supabase', () => ({ supabase }))

const {
  readCaregiverDensityModePreferenceForUser,
  saveCaregiverDensityModePreferenceForUser,
} = await import('../../src/lib/preferences/caregiverDensityPreference')

beforeEach(() => {
  responses.length = 0
  rpcResponses.length = 0
  calls.length = 0
})

describe('account caregiver density mode preference', () => {
  test('when the account has no saved row, defaults on for the caregiver role', async () => {
    responses.push({ data: null, error: null })
    rpcResponses.push({ data: 'caregiver', error: null })

    await expect(readCaregiverDensityModePreferenceForUser('user-1')).resolves.toBe(true)
    expect(calls).toEqual([
      { method: 'select', args: ['caregiver_density_mode, caregiver_density_mode_saved_at'] },
      { method: 'eq', args: ['user_id', 'user-1'] },
      { method: 'rpc', args: ['fetch_current_household_role'] },
    ])
  })

  test('when saved_at is NULL, defaults off for owner/viewer roles regardless of the stored value', async () => {
    responses.push({ data: { caregiver_density_mode: null, caregiver_density_mode_saved_at: null }, error: null })
    rpcResponses.push({ data: 'owner', error: null })

    await expect(readCaregiverDensityModePreferenceForUser('user-owner')).resolves.toBe(false)
  })

  // 回歸測試：Codex review 在 PR #746 抓到的情境——同一列其他設定（例如藥卡展開偏好）的
  // upsert 不會動到 caregiver_density_mode 本身，但如果誤用共用的 updated_at 判斷「是否選過」，
  // 就會被那次不相干的寫入騙成「已經選過」，讓看護角色永遠拿不到角色預設。
  // caregiver_density_mode_saved_at 是唯一只在密度模式自己被存過時才會非 NULL 的欄位。
  test('a caregiver row left over FALSE with no saved_at still gets the role default, not the stale value', async () => {
    responses.push({ data: { caregiver_density_mode: false, caregiver_density_mode_saved_at: null }, error: null })
    rpcResponses.push({ data: 'caregiver', error: null })

    await expect(readCaregiverDensityModePreferenceForUser('user-legacy-caregiver')).resolves.toBe(true)
  })

  test('respects an explicit false once saved_at is set, even for a caregiver role, without querying the role RPC', async () => {
    responses.push({ data: { caregiver_density_mode: false, caregiver_density_mode_saved_at: '2026-09-14T00:00:00Z' }, error: null })

    await expect(readCaregiverDensityModePreferenceForUser('user-2')).resolves.toBe(false)
    expect(calls.some(call => call.method === 'rpc')).toBe(false)
  })

  test('reads the explicit choice and upserts both the value and its dedicated saved_at marker', async () => {
    responses.push({ data: { caregiver_density_mode: true, caregiver_density_mode_saved_at: '2026-09-14T00:00:00Z' }, error: null }, { data: null, error: null })

    await expect(readCaregiverDensityModePreferenceForUser('user-3')).resolves.toBe(true)
    await expect(saveCaregiverDensityModePreferenceForUser('user-3', false)).resolves.toBeUndefined()
    expect(calls[2]).toMatchObject({ method: 'upsert' })
    expect(calls[2]?.args[0]).toMatchObject({ user_id: 'user-3', caregiver_density_mode: false })
    expect((calls[2]?.args[0] as { caregiver_density_mode_saved_at?: string }).caregiver_density_mode_saved_at).toBeTruthy()
  })

  test('surfaces database failures so the app can show the safe fallback', async () => {
    const failure = new Error('settings unavailable')
    responses.push({ data: null, error: failure })

    await expect(readCaregiverDensityModePreferenceForUser('user-4')).rejects.toBe(failure)
  })

  test('surfaces unexpected role RPC failures instead of silently defaulting', async () => {
    responses.push({ data: null, error: null })
    const failure = new Error('role unavailable')
    rpcResponses.push({ data: null, error: failure })

    await expect(readCaregiverDensityModePreferenceForUser('user-5')).rejects.toThrow('role unavailable')
  })

  test('quietly falls back to the safe default when no household exists yet (mid-onboarding)', async () => {
    responses.push({ data: null, error: null })
    rpcResponses.push({ data: null, error: new Error('Household membership required') })

    await expect(readCaregiverDensityModePreferenceForUser('user-6')).resolves.toBe(false)
  })
})
