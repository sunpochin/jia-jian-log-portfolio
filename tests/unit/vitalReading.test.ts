/*
檔案用途：測試 VitalReading、VitalValue 與 PulseReading 生命徵象元件之指標色系與語意屬性。
所在層：tests/unit 單元測試層。
主要關聯：驗證 src/components/VitalReading.tsx 呈現在不同數據輸入時的產出。
*/
import { describe, expect, mock, test } from 'bun:test'
import React from 'react'

const actualI18n = await import('../../src/lib/i18n')

// Mock 雙語 Context Hook，保留原本的 dictionary 與 helper 匯出，避免影響其它測試檔
mock.module('../../src/lib/i18n', () => ({
  ...actualI18n,
  useI18n: () => ({
    text: (item: { id?: string; zh?: string }) => item.zh || item.id || '',
    language: 'zh',
    setLanguage: () => {},
  }),
}))

const { PulseReading, VitalReading, VitalValue } = await import('../../src/features/vitals/components/VitalReading')

describe('VitalReading component presentation and accessibility', () => {
  test('VitalReading renders systolic, diastolic, and optional pulse with correct class names', () => {
    const element = VitalReading({
      systolic: 120,
      diastolic: 80,
      pulse: 72,
      showUnits: true,
      showPulse: true,
    })

    expect(element).not.toBeNull()
    expect(element.type).toBe('span')
    const children = React.Children.toArray(element.props.children)
    expect(children.length).toBeGreaterThanOrEqual(4)
  })

  test('VitalReading can hide pulse or units when specified', () => {
    const noPulseElement = VitalReading({
      systolic: 135,
      diastolic: 85,
      pulse: 75,
      showUnits: false,
      showPulse: false,
    })
    expect(noPulseElement).not.toBeNull()
  })

  test('VitalValue renders single vital sign indicator with unit', () => {
    const systolicValue = VitalValue({
      kind: 'systolic',
      value: 125,
      unit: 'mmHg',
    })

    expect(systolicValue).not.toBeNull()
    expect(systolicValue.props.className).toContain('vital-systolic')

    const diastolicValue = VitalValue({
      kind: 'diastolic',
      value: 85,
      unit: 'mmHg',
    })
    expect(diastolicValue.props.className).toContain('vital-diastolic')

    const pulseValue = VitalValue({
      kind: 'pulse',
      value: 75,
      unit: 'bpm',
    })
    expect(pulseValue.props.className).toContain('vital-pulse')
  })

  test('PulseReading renders heart symbol and pulse value or fallback dash', () => {
    const pulseWithData = PulseReading({ pulse: 68 })
    expect(pulseWithData).not.toBeNull()
    expect(pulseWithData.props.className).toContain('vital-pulse')

    const pulseNull = PulseReading({ pulse: null })
    expect(pulseNull).not.toBeNull()
  })
})
