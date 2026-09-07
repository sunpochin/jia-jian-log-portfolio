import { describe, expect, test } from 'bun:test'
import { VITAL_COLORS } from '../../src/lib/vitalPresentation'

describe('vital sign presentation tokens', () => {
  test('keeps indicator colors distinct from alert semantics', () => {
    expect(VITAL_COLORS).toEqual({
      systolic: { light: '#C23B3B', dark: '#F87171' },
      diastolic: { light: '#2563EB', dark: '#60A5FA' },
      pulse: { light: '#7C3AED', dark: '#C084FC' },
    })
  })
})
