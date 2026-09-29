/*
檔案用途：驗證血壓輸入頁共用的雙語文案、數值驗證與儲存錯誤分類。
所在層：tests/unit；保護 InputPage 與 DailyBloodPressureRecords 共用的前端輸入邊界。
主要關聯：src/features/vitals/pages/InputPage.utils.ts、dataErrors 與血壓輸入元件。
*/
import { describe, expect, test } from 'bun:test'
import { bpAutoAdvance, isFamilyAlertLevelReading, isValidBpInput, L, saveErrorMessage } from '../../src/features/vitals/pages/InputPage.utils'
import { evaluateReading, GENERAL_ADULT_STANDARD, resolveBpStandard } from '../../src/types/database'

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

  test('keeps the English rest and completion messages on their explicit branches', () => {
    expect(L.rest.en(120, 80, 70)).toContain('Rest for 60 seconds')
    expect(L.done.zh('早上')).toContain('此時段雙筆已記錄')
    expect(L.done.en('Morning')).toContain('Two readings recorded for Morning')
  })
})

describe('pending sync banner text', () => {
  test('states the queued record count in Indonesian first and Chinese second', () => {
    const banner = L.pending(3)
    expect(banner.id).toBe('3 catatan menunggu sinkronisasi')
    expect(banner.zh).toBe('3 筆紀錄等待同步')
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

describe('bpAutoAdvance', () => {
  test('returns none for non-number, non-integer, or non-positive values', () => {
    expect(bpAutoAdvance('systolic', '')).toBe('none')
    expect(bpAutoAdvance('systolic', 0)).toBe('none')
    expect(bpAutoAdvance('systolic', -10)).toBe('none')
    expect(bpAutoAdvance('systolic', 12.5 as unknown as number)).toBe('none')
  })

  test('returns immediate for 3 digits or more', () => {
    expect(bpAutoAdvance('systolic', 120)).toBe('immediate')
    expect(bpAutoAdvance('diastolic', 100)).toBe('immediate')
    expect(bpAutoAdvance('pulse', 110)).toBe('immediate')
  })

  test('returns delayed for 2 digits reaching the field minimum limit', () => {
    // systolic min is 60
    expect(bpAutoAdvance('systolic', 60)).toBe('delayed')
    expect(bpAutoAdvance('systolic', 90)).toBe('delayed')
    expect(bpAutoAdvance('systolic', 50)).toBe('none') // 50 is below min 60
    expect(bpAutoAdvance('systolic', 10)).toBe('none') // 10 is below min 60

    // diastolic min is 30
    expect(bpAutoAdvance('diastolic', 30)).toBe('delayed')
    expect(bpAutoAdvance('diastolic', 20)).toBe('none') // 20 is below min 30

    // pulse min is 20
    expect(bpAutoAdvance('pulse', 60)).toBe('delayed')
    expect(bpAutoAdvance('pulse', 15)).toBe('none') // 15 is below min 20
  })
})

// 「家人沒收到通知」提示只對需要現在行動的讀數顯示；用真的判讀引擎餵假讀數，而不是手寫 level，
// 才能抓到「偏高觀察的 level 也是 warning」這種只看 level 會判錯的情況。
describe('isFamilyAlertLevelReading', () => {
  const general = (sys: number, dia: number, pul: number | null = 72) => isFamilyAlertLevelReading(evaluateReading(sys, dia, pul, GENERAL_ADULT_STANDARD))

  test('shows the notice for readings the nine-level table asks the caregiver to act on', () => {
    expect(general(185, 115)).toBe(true) // 極高危險，需立即複測
    expect(general(165, 95)).toBe(true) // 明顯偏高
    expect(general(140, 85)).toBe(true) // 偏高
    expect(general(85, 48)).toBe(true) // 明顯偏低
    expect(general(95, 60)).toBe(true) // 偏低
    expect(general(120, 70, 130)).toBe(true) // 血壓正常但心跳 >120
  })

  test('stays quiet for normal readings and the "observe, no alert needed" band', () => {
    expect(general(120, 70)).toBe(false)
    expect(general(115, 57)).toBe(false) // 舒張壓偏低點：九級表刻意不警報
    expect(general(132, 78)).toBe(false) // 偏高觀察（level 仍是 warning，要靠規則 key 排除）
    expect(general(132, 78, 130)).toBe(true) // 偏高觀察 ＋ 心跳 >120 仍要提示
  })

  test('stays quiet for off-target / below-target readings, which are "record and report at the visit"', () => {
    const postOp = resolveBpStandard('post_op_strict')
    const offTarget = evaluateReading(125, 70, 72, postOp)
    expect(offTarget.level).toBe('off-target')
    expect(isFamilyAlertLevelReading(offTarget)).toBe(false)
  })
})
