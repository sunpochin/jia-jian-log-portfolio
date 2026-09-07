/*
檔案用途：驗證血壓規則、低壓警示與多語系健康處置文案。
所在層：tests/unit；只測試純規則函式，不啟動瀏覽器或資料庫。
主要關聯：src/types/database.ts 與 src/config/blood-pressure-spec.json。
*/
import { describe, test, expect } from 'bun:test'
import { evaluateBp, evaluateReading, getAlertLevel } from '../../src/types/database'

// Home BP thresholds (台灣高血壓學會家庭血壓標準): normal < 130/80,
// warning >= 130/80, danger >= 160/100. See TECHNICAL.md.
describe('getAlertLevel', () => {
  test('normal when well below thresholds', () => {
    expect(getAlertLevel(110, 70)).toBe('normal')
  })

  test('normal at the exact edge (just under warning)', () => {
    expect(getAlertLevel(129, 79)).toBe('normal')
  })

  test('warning when systolic hits 130', () => {
    expect(getAlertLevel(130, 70)).toBe('warning')
  })

  test('warning when diastolic hits 80', () => {
    expect(getAlertLevel(120, 80)).toBe('warning')
  })

  test('warning when pulse exceeds 120, even with normal BP', () => {
    expect(getAlertLevel(110, 70, 121)).toBe('warning')
  })

  test('pulse of exactly 120 does not trigger warning', () => {
    expect(getAlertLevel(110, 70, 120)).toBe('normal')
  })

  test('danger when systolic hits 160', () => {
    expect(getAlertLevel(160, 70)).toBe('danger')
  })

  test('danger when diastolic hits 100', () => {
    expect(getAlertLevel(120, 100)).toBe('danger')
  })

  test('danger takes priority over warning-level pulse', () => {
    expect(getAlertLevel(160, 100, 50)).toBe('danger')
  })

  test('keeps the English danger label and guidance when BP and pulse are both abnormal', () => {
    const evaluation = evaluateReading(160, 100, 121)

    expect(evaluation.labels.en).toContain('Significantly high')
    expect(evaluation.labels.en).toContain('Heartbeat')
    expect(evaluation.recommendations.en).toContain('Measure again within 10 minutes')
    expect(evaluation.recommendations.en).toContain('Rest briefly')
  })

  test('null/undefined pulse is treated as absent, not a trigger', () => {
    expect(getAlertLevel(110, 70, null)).toBe('normal')
    expect(getAlertLevel(110, 70, undefined)).toBe('normal')
  })

  test('uses a pulse-specific label instead of showing warning color with normal text', () => {
    const evaluation = evaluateReading(110, 70, 121)

    expect(evaluation.level).toBe('warning')
    expect(evaluation.labels.zh).toContain('心跳 >120')
    expect(evaluation.labels.zh).not.toContain('正常')
  })
})

// Low-side thresholds (ROADMAP.md P0.1): mother has a hypotension history,
// so a low reading must not silently show "normal". Mirrors the low-end
// bands in appscript/blood_pressure_bot_docs.md.
describe('getAlertLevel — low blood pressure', () => {
  test('danger-low when systolic is under 90', () => {
    expect(getAlertLevel(85, 48)).toBe('danger-low')
  })

  test('danger-low is not downgraded when pulse also exceeds its warning threshold', () => {
    // 紅色血壓警示必須保留優先級，否則同一筆多重異常反而會被畫成較輕的橘色。
    expect(getAlertLevel(85, 48, 121)).toBe('danger-low')
  })

  test('danger-low when diastolic is under 50', () => {
    expect(getAlertLevel(110, 48)).toBe('danger-low')
  })

  test('danger-low at the exact boundary (systolic 89)', () => {
    expect(getAlertLevel(89, 60)).toBe('danger-low')
  })

  test('warning-low when systolic is 90-99', () => {
    expect(getAlertLevel(95, 60)).toBe('warning-low')
  })

  test('warning-low when diastolic is 50-54', () => {
    expect(getAlertLevel(110, 52)).toBe('warning-low')
  })

  test('normal at the low-side boundary (systolic exactly 100)', () => {
    expect(getAlertLevel(100, 60)).toBe('normal')
  })

  test('normal at the low-side boundary (diastolic exactly 55)', () => {
    expect(getAlertLevel(110, 55)).toBe('normal')
  })

  test('diastolic 55-59 is deliberately not flagged (alarm-fatigue denoise)', () => {
    expect(getAlertLevel(115, 57)).toBe('normal')
    expect(getAlertLevel(120, 59)).toBe('normal')
  })

  test('high-side check takes priority over an unphysiological low-systolic reading', () => {
    // Matches getBpStatus() in Code.js: high-end checks run first.
    expect(getAlertLevel(85, 90)).toBe('warning')
  })

  test('falls back to the spec default rule when no rule range covers the reading', () => {
    // blood-pressure-spec.json 的舒張壓區間在 54 與 55 之間留了一條縫（54.5）：
    // 不屬於任何 danger/warning/normal_low/normal 規則，必須有明確的 defaultRule 接住，
    // 而不是讓 evaluateBp 回傳 undefined 讓畫面壞掉。
    expect(evaluateBp(105, 54.5)).toMatchObject({ key: 'normal_default', webAlertLevel: 'normal' })
  })
})
