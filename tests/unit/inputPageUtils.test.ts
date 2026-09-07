import { describe, expect, test } from 'bun:test'
import { isValidBpInput, L, saveErrorMessage } from '../../src/features/vitals/pages/InputPage.utils'

describe('saveErrorMessage', () => {
  test('explains permission failures as a re-login action', () => {
    expect(saveErrorMessage({ code: '42501' }, 'zh')).toContain('請重新登入')
    expect(saveErrorMessage({ status: 401 }, 'zh')).toContain('請重新登入')
    expect(saveErrorMessage({ code: '42501' }, 'id')).toContain('Silakan masuk lagi')
  })

  test('keeps unknown failures generic', () => {
    expect(saveErrorMessage({ code: 'unknown' }, 'id')).toBe('Gagal menyimpan. Silakan coba lagi.')
    expect(saveErrorMessage({ code: 'unknown' }, 'zh')).toBe('儲存失敗，請再試一次')
  })

  test('explains the daily blood pressure quota instead of a generic save failure', () => {
    expect(saveErrorMessage({ message: 'daily_blood_pressure_limit' }, 'zh')).toContain('上限')
    expect(saveErrorMessage({ message: 'daily_blood_pressure_limit' }, 'id')).toContain('batas')
  })

  test('a permission or connection failure takes priority over the quota wording', () => {
    // 權限／連線問題不是配額問題；照護者需要看到「重新登入」或「連線」而不是「今天已達上限」。
    expect(saveErrorMessage({ code: '42501', message: 'daily_blood_pressure_limit' }, 'zh')).toContain('請重新登入')
    expect(saveErrorMessage({ code: 'TypeError', message: 'daily_blood_pressure_limit' }, 'zh')).not.toContain('上限')
  })
})

describe('rest prompt', () => {
  test('shows Indonesian first and an exact 60-second instruction in both languages', () => {
    const idPrompt = L.rest.id(120, 80, 70)
    const zhPrompt = L.rest.zh(120, 80, 70)

    expect(idPrompt).toContain('Istirahat selama 60 detik')
    expect(idPrompt).not.toContain('±1 menit')
    expect(zhPrompt).toContain('請休息 60 秒')
    expect(idPrompt.indexOf('Catatan 1')).toBeLessThan(idPrompt.indexOf('Istirahat'))
  })
})

describe('night labels', () => {
  test('keeps the late-night bucket for data flow without showing a redundant label', () => {
    expect(L.malam3.id).toBe('')
    expect(L.malam3.zh).toBe('')
    expect(L.done.id(L.malam3.id)).toBe('✓ 2 catatan tersimpan')
  })
})

describe('isValidBpInput', () => {
  test('accepts realistic integer readings', () => {
    expect(isValidBpInput(120, 80, 70)).toBe(true)
    expect(isValidBpInput(120, 80, null)).toBe(true)
  })

  test('rejects empty, non-finite, decimal, and out-of-range values', () => {
    expect(isValidBpInput('', 80, 70)).toBe(false)
    expect(isValidBpInput(Number.NaN, 80, 70)).toBe(false)
    expect(isValidBpInput(120.5, 80, 70)).toBe(false)
    expect(isValidBpInput(301, 80, 70)).toBe(false)
    expect(isValidBpInput(120, 201, 70)).toBe(false)
    expect(isValidBpInput(120, 80, 301)).toBe(false)
  })

  test('rejects impossible pressure ordering', () => {
    expect(isValidBpInput(80, 80, 70)).toBe(false)
    expect(isValidBpInput(75, 90, 70)).toBe(false)
  })
})
