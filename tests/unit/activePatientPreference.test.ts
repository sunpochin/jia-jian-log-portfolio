/*
檔案用途：測試活躍對象偏好解析與讀寫函數。
所在層：tests/unit 單元測試層。
主要關聯：驗證 src/lib/activeSubjectPreference.ts 邏輯。
*/
import { describe, expect, mock, test } from 'bun:test'

// 為什麼要 mock `../../src/lib/supabase`：這個測試原本讓 readActivePatientPreference／
// saveActivePatientPreference 打向真的（placeholder）Supabase URL，只靠 try/catch 吞掉
// 例外來驗證呼叫入口沒有語法/型別錯。CI runner 對 placeholder 網域的連線延遲不穩定，
// 曾經在 GitHub Actions 上穩定超過 bun test 預設的 5 秒逾時而讓 app-ci 整個變紅
// （本機網路環境常常連線失敗得比較快，不容易重現）；且在 `--coverage` 模式下就算改寫
// `globalThis.fetch` 也攔不到，因為 coverage 的模組預先載入會搶在改寫之前就綁定
// `createClient()` 內部用的 fetch。改用其他測試檔已經在用的 `mock.module` 模式，讓
// `from().select().eq().maybeSingle()` 與 `from().upsert()` 直接回傳 Promise 錯誤，
// 完全不碰真的網路，才能穩定驗證呼叫入口。
const supabaseError = { message: 'not available in unit tests' }
const mockSupabase = {
  from() {
    return {
      select() {
        return {
          eq() {
            return { maybeSingle: () => Promise.resolve({ data: null, error: supabaseError }) }
          },
        }
      },
      upsert() {
        return Promise.resolve({ error: supabaseError })
      },
    }
  },
}

mock.module('../../src/lib/supabase', () => ({ supabase: mockSupabase }))

const { readActivePatientPreference, resolveActivePatientPreference, saveActivePatientPreference } = await import('../../src/lib/activeSubjectPreference')

describe('active patient preference', () => {
  test('keeps a saved patient UUID only while the account is still authorized', () => {
    expect(resolveActivePatientPreference('patient-mother', ['patient-own', 'patient-mother'], 'patient-own')).toBe('patient-mother')
  })

  test('falls back to an authorized patient UUID when a saved value is stale', () => {
    expect(resolveActivePatientPreference('patient-revoked', ['patient-own'], 'patient-own')).toBe('patient-own')
  })

  test('readActivePatientPreference and saveActivePatientPreference handle supabase calls', async () => {
    await expect(readActivePatientPreference('user@example.com')).rejects.toBe(supabaseError)
    await expect(saveActivePatientPreference('user@example.com', 'patient-1')).rejects.toBe(supabaseError)
  })
})
