import { describe, expect, test } from 'bun:test'
import { canApplyPwaUpdate, canCheckForPwaUpdate, PWA_UPDATE_CHECK_INTERVAL_MS } from '../../src/lib/pwaUpdate'
import { hasAnyUnsavedInput } from '../../src/lib/pwaUpdateGuard'

describe('PWA update checks', () => {
  test('checks only while the app is visible and online', () => {
    expect(canCheckForPwaUpdate({ online: true, visibilityState: 'visible' })).toBe(true)
    expect(canCheckForPwaUpdate({ online: false, visibilityState: 'visible' })).toBe(false)
    expect(canCheckForPwaUpdate({ online: true, visibilityState: 'hidden' })).toBe(false)
  })

  test('rechecks a postponed update every fifteen minutes', () => {
    expect(PWA_UPDATE_CHECK_INTERVAL_MS).toBe(15 * 60 * 1000)
  })

  test('blocks a reload until an unfinished blood-pressure input is saved', () => {
    expect(canApplyPwaUpdate(true)).toBe(false)
    expect(canApplyPwaUpdate(false)).toBe(true)
  })

  test('keeps the update blocked while any mounted form is unfinished', () => {
    expect(hasAnyUnsavedInput({})).toBe(false)
    expect(hasAnyUnsavedInput({ 'blood-pressure': false, 'body-temperature': true })).toBe(true)
    expect(hasAnyUnsavedInput({ 'blood-pressure': false, 'body-temperature': false })).toBe(false)
  })
})
