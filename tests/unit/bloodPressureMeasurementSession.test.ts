/*
檔案用途：驗證血壓雙次量測暫存流程的病人、照護日與時段邊界。
所在層：tests/unit；保護重新載入與跨分頁倒數不誤用舊量測輪次。
主要關聯：src/lib/bloodPressureMeasurementSession.ts、App 外殼與 InputPage。
*/
import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import {
  clearBloodPressureMeasurementSession,
  getBloodPressureMeasurementSessionKey,
  readBloodPressureMeasurementSession,
  saveBloodPressureMeasurementSession,
  shouldCancelBloodPressureMeasurementSession,
} from '../../src/lib/bloodPressureMeasurementSession'

describe('blood pressure measurement session scope', () => {
  const session = { patientId: 'patient-1' }

  test('keeps a session for the same selected patient', () => {
    expect(shouldCancelBloodPressureMeasurementSession(session, 'patient-1')).toBe(false)
  })

  test('cancels when the selected patient disappears or changes', () => {
    expect(shouldCancelBloodPressureMeasurementSession(session, undefined)).toBe(true)
    expect(shouldCancelBloodPressureMeasurementSession(session, 'patient-2')).toBe(true)
  })

  test('cancels on an account transition even when the patient is shared', () => {
    expect(shouldCancelBloodPressureMeasurementSession(session, 'patient-1', true)).toBe(true)
  })
})

describe('blood pressure measurement session key', () => {
  test('keeps the same key before and after midnight until the 04:00 care boundary', () => {
    const patientId = 'patient-1'
    expect(getBloodPressureMeasurementSessionKey(patientId, Date.parse('2026-08-09T19:59:59.000Z'))).toBe(`2026-08-09-malam3-${patientId}`)
    expect(getBloodPressureMeasurementSessionKey(patientId, Date.parse('2026-08-09T20:00:00.000Z'))).toBe(`2026-08-10-malam3-${patientId}`)
  })

  test('changes when the measurement session or patient changes', () => {
    const at = Date.parse('2026-08-10T01:00:00.000Z')
    expect(getBloodPressureMeasurementSessionKey('patient-1', at)).not.toBe(getBloodPressureMeasurementSessionKey('patient-2', at))
    expect(getBloodPressureMeasurementSessionKey('patient-1', at)).not.toBe(getBloodPressureMeasurementSessionKey('patient-1', at + 8 * 60 * 60 * 1_000))
  })
})

describe('blood pressure measurement session persistence', () => {
  const store = new Map<string, string>()
  let storageThrows = false
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window')

  const useFakeWindow = () => Object.defineProperty(globalThis, 'window', {
    configurable: true,
    writable: true,
    value: {
      sessionStorage: {
        getItem: (key: string) => {
          if (storageThrows) throw new Error('SecurityError')
          return store.get(key) ?? null
        },
        setItem: (key: string, value: string) => {
          if (storageThrows) throw new Error('QuotaExceededError')
          store.set(key, value)
        },
        removeItem: (key: string) => {
          if (storageThrows) throw new Error('SecurityError')
          store.delete(key)
        },
      },
    },
  })

  const restoreWindow = () => {
    if (previousWindow) Object.defineProperty(globalThis, 'window', previousWindow)
    else Reflect.deleteProperty(globalThis, 'window')
  }

  const session = {
    patientId: 'patient-1',
    sessionKey: '2026-08-10-pagi-patient-1',
    deadline: 1_800_000,
    firstRecord: { systolic: 128, diastolic: 82, pulse: 70 },
  }

  beforeEach(() => {
    store.clear()
    storageThrows = false
    useFakeWindow()
  })

  afterEach(restoreWindow)

  test('restores a countdown that survived a reload', () => {
    saveBloodPressureMeasurementSession(session)
    expect(readBloodPressureMeasurementSession()).toEqual(session)
  })

  test('returns null when nothing was stored', () => {
    expect(readBloodPressureMeasurementSession()).toBeNull()
  })

  test('drops malformed or partial payloads instead of resuming a wrong countdown', () => {
    store.set('jia-jian-log-blood-pressure-measurement-session', '{ not json')
    expect(readBloodPressureMeasurementSession()).toBeNull()

    store.set('jia-jian-log-blood-pressure-measurement-session', JSON.stringify({ patientId: 'patient-1' }))
    expect(readBloodPressureMeasurementSession()).toBeNull()

    store.set('jia-jian-log-blood-pressure-measurement-session', JSON.stringify({ ...session, firstRecord: { systolic: '128', diastolic: 82 } }))
    expect(readBloodPressureMeasurementSession()).toBeNull()
  })

  test('clearing removes the stored round', () => {
    saveBloodPressureMeasurementSession(session)
    clearBloodPressureMeasurementSession()
    expect(readBloodPressureMeasurementSession()).toBeNull()
  })

  test('a blocked storage never breaks a blood pressure that already saved', () => {
    storageThrows = true
    expect(() => saveBloodPressureMeasurementSession(session)).not.toThrow()
    expect(() => clearBloodPressureMeasurementSession()).not.toThrow()
    expect(readBloodPressureMeasurementSession()).toBeNull()
  })

  test('server-side rendering has no session storage to read', () => {
    restoreWindow()
    Reflect.deleteProperty(globalThis, 'window')
    expect(readBloodPressureMeasurementSession()).toBeNull()
    expect(() => saveBloodPressureMeasurementSession(session)).not.toThrow()
    expect(() => clearBloodPressureMeasurementSession()).not.toThrow()
  })
})
