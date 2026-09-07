/*
檔案用途：驗證 unknown 錯誤解析與雙語使用者訊息的挑選規則。
所在層：tests/unit；保護「畫面不得洩漏資料庫原文、且兩種語言都必須存在」這條規範。
主要關聯：src/lib/dataErrors.ts，以及依賴它的 useBpRecords、temperature 與 InputPage.utils。
*/
import { describe, expect, test } from 'bun:test'
import {
  DATA_ERROR_TEXT,
  describeReadError,
  describeSaveError,
  isConnectionError,
  isPermissionError,
  isRetryableWriteError,
  matchesConstraint,
  readErrorFields,
} from '../../src/lib/dataErrors'

describe('readErrorFields', () => {
  test('reads Supabase PostgrestError shape', () => {
    expect(readErrorFields({ message: 'permission denied', code: '42501' })).toEqual({
      message: 'permission denied',
      code: '42501',
      status: 0,
    })
  })

  test('reads AuthError shape with an HTTP status', () => {
    expect(readErrorFields({ message: 'unauthorized', status: 401 }).status).toBe(401)
  })

  test('survives non-object throwables without crashing the screen', () => {
    expect(readErrorFields(null)).toEqual({ message: '', code: '', status: 0 })
    expect(readErrorFields('boom')).toEqual({ message: '', code: '', status: 0 })
    expect(readErrorFields(undefined).message).toBe('')
  })

  test('normalizes a string HTTP status so comparisons still match', () => {
    expect(readErrorFields({ status: '403' }).status).toBe(403)
    expect(readErrorFields({ status: 'nope' }).status).toBe(0)
  })

  test('reads native Error instances thrown by fetch', () => {
    expect(readErrorFields(new TypeError('Failed to fetch')).message).toBe('Failed to fetch')
  })
})

describe('error classification', () => {
  test('treats RLS denial and 401/403 as a re-login situation', () => {
    expect(isPermissionError({ code: '42501' })).toBe(true)
    expect(isPermissionError({ status: 401 })).toBe(true)
    expect(isPermissionError({ status: 403 })).toBe(true)
    expect(isPermissionError({ code: 'PGRST301' })).toBe(false)
  })

  test('treats transport and configuration failures separately from permissions', () => {
    expect(isConnectionError({ code: 'PGRST301' })).toBe(true)
    expect(isConnectionError({ code: 'ENOTFOUND' })).toBe(true)
    expect(isConnectionError(new TypeError('Failed to fetch'))).toBe(true)
    expect(isConnectionError({ code: '42501' })).toBe(false)
  })

  test('queues only transport and temporary server failures, never permission errors', () => {
    expect(isRetryableWriteError(new TypeError('Failed to fetch'))).toBe(true)
    expect(isRetryableWriteError({ status: 503 })).toBe(true)
    expect(isRetryableWriteError({ status: 429 })).toBe(true)
    expect(isRetryableWriteError({ code: '42501' })).toBe(false)
    expect(isRetryableWriteError({ message: 'daily_blood_pressure_limit' })).toBe(false)
  })

  test('matches database constraint names carried in the message', () => {
    expect(matchesConstraint({ message: 'violates daily_temperature_limit' }, 'daily_temperature_limit')).toBe(true)
    expect(matchesConstraint({ message: 'something else' }, 'daily_temperature_limit')).toBe(false)
    expect(matchesConstraint(null, 'daily_temperature_limit')).toBe(false)
  })
})

describe('user-facing messages', () => {
  test('permission failures win over the caller fallback', () => {
    expect(describeSaveError({ code: '42501' }, { id: 'x', zh: 'x' ,en: "x" })).toBe(DATA_ERROR_TEXT.reauth)
    expect(describeReadError({ status: 403 }, { id: 'x', zh: 'x' ,en: "x" })).toBe(DATA_ERROR_TEXT.reauth)
  })

  test('connection failures point at the family, not at a retry', () => {
    expect(describeSaveError({ code: 'ENOTFOUND' })).toBe(DATA_ERROR_TEXT.connection)
  })

  test('unknown failures fall back to the caller-specific wording', () => {
    const fallback = { id: 'Gagal membaca suhu.', zh: '無法讀取體溫。' ,en: "Failed read temperature." }
    expect(describeReadError({ code: 'unknown' }, fallback)).toBe(fallback)
  })

  test('never returns a single string, so callers cannot bypass the bilingual rule', () => {
    // 繁體中文註解：這條測試是憲法規範的護欄。回傳型別若退化成 string，
    // 呼叫端就能像過去的 useBpRecords 一樣把中印文用斜線串起來一次顯示兩種語言。
    for (const value of Object.values(DATA_ERROR_TEXT)) {
      expect(typeof value.id).toBe('string')
      expect(typeof value.zh).toBe('string')
      expect(value.id.length).toBeGreaterThan(0)
      expect(value.zh.length).toBeGreaterThan(0)
      expect(value.id).not.toContain('／')
      expect(value.zh).not.toMatch(/[A-Za-z]{4,}/)
    }
  })
})
