/*
檔案用途：驗證登入帳號的服藥卡顯示偏好透過 user_settings 讀寫，且沿用展開預設。
所在層：tests/unit；以 Supabase client stub 覆蓋資料庫邊界，不連線遠端環境。
主要關聯：對應 src/lib/medicationDisplayPreference.ts 的帳號設定轉接。
*/
import { beforeEach, describe, expect, mock, test } from 'bun:test'

type Response = { data?: unknown; error?: unknown }
const responses: Response[] = []
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
}

mock.module('../../src/lib/supabase', () => ({ supabase }))

const {
  readMedicationSlotsExpandedPreferenceForUser,
  saveMedicationSlotsExpandedPreferenceForUser,
  readMedicationNameEnglishFirstPreferenceForUser,
  saveMedicationNameEnglishFirstPreferenceForUser,
} = await import('../../src/lib/medicationDisplayPreference')

beforeEach(() => {
  responses.length = 0
  calls.length = 0
})

describe('account medication display preference', () => {
  test('uses expanded when the account has no saved row', async () => {
    responses.push({ data: null, error: null })

    await expect(readMedicationSlotsExpandedPreferenceForUser('user-1')).resolves.toBe(true)
    expect(calls).toEqual([
      { method: 'select', args: ['medication_slots_expanded'] },
      { method: 'eq', args: ['user_id', 'user-1'] },
    ])
  })

  test('reads and upserts the account row without trusting another patient identity', async () => {
    responses.push({ data: { medication_slots_expanded: false }, error: null }, { data: null, error: null })

    await expect(readMedicationSlotsExpandedPreferenceForUser('user-2')).resolves.toBe(false)
    await expect(saveMedicationSlotsExpandedPreferenceForUser('user-2', true)).resolves.toBeUndefined()
    expect(calls[2]).toMatchObject({ method: 'upsert' })
    expect(calls[2]?.args[0]).toMatchObject({ user_id: 'user-2', medication_slots_expanded: true })
  })

  test('surfaces database failures so the app can show the safe fallback', async () => {
    const failure = new Error('settings unavailable')
    responses.push({ data: null, error: failure })

    await expect(readMedicationSlotsExpandedPreferenceForUser('user-3')).rejects.toBe(failure)
  })

  test('uses English-first when the account has no saved row', async () => {
    responses.push({ data: null, error: null })

    await expect(readMedicationNameEnglishFirstPreferenceForUser('user-4')).resolves.toBe(true)
    expect(calls).toEqual([
      { method: 'select', args: ['medication_name_english_first'] },
      { method: 'eq', args: ['user_id', 'user-4'] },
    ])
  })

  test('reads and upserts the medication name preference independently from slot expansion', async () => {
    responses.push({ data: { medication_name_english_first: false }, error: null }, { data: null, error: null })

    await expect(readMedicationNameEnglishFirstPreferenceForUser('user-5')).resolves.toBe(false)
    await expect(saveMedicationNameEnglishFirstPreferenceForUser('user-5', true)).resolves.toBeUndefined()
    expect(calls[2]).toMatchObject({ method: 'upsert' })
    expect(calls[2]?.args[0]).toMatchObject({ user_id: 'user-5', medication_name_english_first: true })
  })
})
