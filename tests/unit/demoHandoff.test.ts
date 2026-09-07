/*
檔案用途：驗證試用承接中繼記錄（demo handoff）只搬模組開關 id、讀取即可清除、且拒絕不合法內容。
所在層：tests/unit；保護 App.tsx 導覽 CTA 寫入與首次登入讀取套用共用的規則來源。
主要關聯：src/lib/demoHandoff.ts。
*/
import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { clearDemoModuleHandoff, readDemoModuleHandoff, writeDemoModuleHandoff } from '../../src/lib/demoHandoff'

const originalLocalStorage = globalThis.localStorage
const values = new Map<string, string>()

beforeEach(() => {
  values.clear()
  ;(globalThis as typeof globalThis & { localStorage: Storage }).localStorage = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value) },
    removeItem: key => { values.delete(key) },
  } as Storage
})

afterEach(() => {
  ;(globalThis as typeof globalThis & { localStorage: Storage }).localStorage = originalLocalStorage
})

describe('demo module handoff', () => {
  test('round-trips the module ids and custom-template flag written at the end of the tutorial', () => {
    writeDemoModuleHandoff({ moduleIds: ['bloodPressure', 'medication'], useCustomTemplate: true })
    const handoff = readDemoModuleHandoff()
    expect(handoff?.moduleIds).toEqual(['bloodPressure', 'medication'])
    expect(handoff?.useCustomTemplate).toBe(true)
  })

  test('returns null when nothing was captured', () => {
    expect(readDemoModuleHandoff()).toBeNull()
  })

  test('drops unknown module ids instead of trusting whatever is in storage', () => {
    values.set('jiajianlog.demo-handoff.v1', JSON.stringify({ moduleIds: ['bloodPressure', 'notARealModule'], useCustomTemplate: false }))
    expect(readDemoModuleHandoff()?.moduleIds).toEqual(['bloodPressure'])
  })

  test('treats an empty or fully-invalid module list as no handoff at all', () => {
    values.set('jiajianlog.demo-handoff.v1', JSON.stringify({ moduleIds: [], useCustomTemplate: false }))
    expect(readDemoModuleHandoff()).toBeNull()
  })

  test('clear removes the record so a later login is never affected by an old capture', () => {
    writeDemoModuleHandoff({ moduleIds: ['weight'], useCustomTemplate: false })
    clearDemoModuleHandoff()
    expect(readDemoModuleHandoff()).toBeNull()
  })

  test('never stores anything beyond module ids and the custom-template flag (no health values)', () => {
    writeDemoModuleHandoff({ moduleIds: ['bloodPressure'], useCustomTemplate: false })
    const raw = values.get('jiajianlog.demo-handoff.v1')
    const parsed = JSON.parse(raw ?? '{}')
    expect(Object.keys(parsed).sort()).toEqual(['capturedAt', 'moduleIds', 'useCustomTemplate'])
  })
})
