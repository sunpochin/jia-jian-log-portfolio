import { describe, test, expect } from 'bun:test'
import { getSession } from '../../src/lib/session'

// pagi 5–11, siang 12–16, malam1 17–18, malam2 19–20, malam3 21–4 (wraps
// past midnight). Mother's night-time hypotension monitoring may happen at
// separate evening checkpoints (~18:00 / ~20:00 / ~22:00), so malam is split
// three ways instead of one big 17:00–04:59 bucket. These are grouping
// buckets, not a promise that every night has exactly three readings.
describe('getSession', () => {
  test('early morning hours fall into malam3 (last night-check bucket, not yet pagi)', () => {
    expect(getSession(0)).toBe('malam3')
    expect(getSession(4)).toBe('malam3')
  })

  test('5 through 11 is pagi', () => {
    expect(getSession(5)).toBe('pagi')
    expect(getSession(11)).toBe('pagi')
  })

  test('12 through 16 is siang', () => {
    expect(getSession(12)).toBe('siang')
    expect(getSession(16)).toBe('siang')
  })

  test('17 through 18 is malam1 (~18:00 checkpoint)', () => {
    expect(getSession(17)).toBe('malam1')
    expect(getSession(18)).toBe('malam1')
  })

  test('19 through 20 is malam2 (~20:00 checkpoint)', () => {
    expect(getSession(19)).toBe('malam2')
    expect(getSession(20)).toBe('malam2')
  })

  test('21 through 23 is malam3 (~22:00 checkpoint)', () => {
    expect(getSession(21)).toBe('malam3')
    expect(getSession(23)).toBe('malam3')
  })
})
