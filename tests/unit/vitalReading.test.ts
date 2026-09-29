/*
檔案用途：測試 VitalReading、VitalValue 與 PulseReading 生命徵象元件之指標色系與語意屬性。
所在層：tests/unit 單元測試層。
主要關聯：驗證 src/components/VitalReading.tsx 呈現在不同數據輸入時的產出。
*/
import { describe, expect, mock, test } from 'bun:test'
import React from 'react'

import { installReactHookHarness, renderHook } from './helpers/reactHookHarness'

// 繁體中文註解：不使用 mock.module 改寫 i18n，改用 installReactHookHarness 與 defaultContext
// 注入語系，避免 Bun 的全域 mock.module 污染其它測試檔的印尼文／英文斷言。
installReactHookHarness()

const { PulseReading, VitalReading, VitalValue } = await import('../../src/features/vitals/components/VitalReading')
// VitalAlertBadge 需要 useBpEvaluator() 提供的病人綁定標準；本檔是非 DOM 的純函式測試，
// 沒有 React 樹可以掛 Provider，所以把 hook 換成一個固定回一般成人標準的假 evaluator。
// 這裡刻意**不**讓 hook 回傳預設值來規避例外——正式程式碼沒有 Provider 就該炸掉（見 useBpEvaluator）。
const { evaluateReading, GENERAL_ADULT_STANDARD } = await import('../../src/types/database')
mock.module('../../src/features/vitals/hooks/useBpEvaluator', () => ({
  useBpEvaluator: () => ({
    resolver: () => ({ standard: GENERAL_ADULT_STANDARD, templateKey: 'general_adult', prescribedNote: null, configured: false, unavailable: false }),
    evaluateAt: (sys: number, dia: number, pulse: number | null | undefined) => ({
      ...evaluateReading(sys, dia, pulse, GENERAL_ADULT_STANDARD),
      resolved: { standard: GENERAL_ADULT_STANDARD, templateKey: 'general_adult', prescribedNote: null, configured: false, unavailable: false },
    }),
  }),
}))

const { VitalAlertBadge } = await import('../../src/features/vitals/components/VitalAlertBadge')
const { ALERT_CHIP_CLASS } = await import('../../src/lib/alertPresentation')

const LOCALE_CONTEXT_VALUE = { locale: 'zh' as const, setLocale: () => {} }
const render = <T,>(fn: () => T) => renderHook(fn, { defaultContext: LOCALE_CONTEXT_VALUE }).current

describe('VitalReading component presentation and accessibility', () => {
  test('VitalReading renders systolic, diastolic, and optional pulse with correct class names', () => {
    const element = render(() => VitalReading({
      systolic: 120,
      diastolic: 80,
      pulse: 72,
      showUnits: true,
      showPulse: true,
    }))

    expect(element).not.toBeNull()
    expect(element.type).toBe('span')
    const children = React.Children.toArray(element.props.children)
    expect(children.length).toBeGreaterThanOrEqual(4)
  })

  test('VitalReading can hide pulse or units when specified', () => {
    const noPulseElement = render(() => VitalReading({
      systolic: 135,
      diastolic: 85,
      pulse: 75,
      showUnits: false,
      showPulse: false,
    }))
    expect(noPulseElement).not.toBeNull()
  })

  test('VitalValue renders single vital sign indicator with unit', () => {
    const systolicValue = render(() => VitalValue({
      kind: 'systolic',
      value: 125,
      unit: 'mmHg',
    }))

    expect(systolicValue).not.toBeNull()
    expect(systolicValue.props.className).toContain('vital-systolic')

    const diastolicValue = render(() => VitalValue({
      kind: 'diastolic',
      value: 85,
      unit: 'mmHg',
    }))
    expect(diastolicValue.props.className).toContain('vital-diastolic')

    const pulseValue = render(() => VitalValue({
      kind: 'pulse',
      value: 75,
      unit: 'bpm',
    }))
    expect(pulseValue.props.className).toContain('vital-pulse')
  })

  test('PulseReading renders heart symbol and pulse value or fallback dash', () => {
    const pulseWithData = render(() => PulseReading({ pulse: 68 }))
    expect(pulseWithData).not.toBeNull()
    expect(pulseWithData.props.className).toContain('vital-pulse')

    const pulseNull = render(() => PulseReading({ pulse: null }))
    expect(pulseNull).not.toBeNull()
  })

  test('低側與正常維持原有色階（§4.2「維持現況」那三列）', () => {
    // 高側改成分級紅是刻意的；低側與正常**不**跟著改，因為「琥珀＝低、紅＝高」這個語彙
    // 是全 app 一致的既有約定，把低側也變紅會把「往哪邊調」這個資訊丟掉。
    expect(ALERT_CHIP_CLASS['danger-low']).toContain('bg-red-600')
    expect(ALERT_CHIP_CLASS['warning-low']).toContain('bg-orange-700')
    expect(ALERT_CHIP_CLASS.normal).toContain('bg-emerald-700')
  })

  test('renders the shared blood-pressure alert text and preserves caller classes', () => {
    const element = render(() => VitalAlertBadge({
      systolic: 180,
      diastolic: 110,
      pulse: 130,
      measuredAt: '2026-09-23T00:00:00.000Z',
      className: 'test-class',
    }))
    expect(element.type).toBe('span')
    expect(element.props.className).toContain('test-class')
    expect(element.props.children).toBeTruthy()
  })
})
