/*
檔案用途：鎖住展示模式導覽步驟的組成與三語完整性，並驗證 CTA 只搬模組開關、不搬健康數值。
所在層：tests/unit；這份步驟定義同時被 App.tsx 的首次導覽與 SettingsPage 的重播入口消費，
        任何一邊漏掉步驟或漏翻譯都會被這裡擋下。
主要關聯：src/lib/demoTutorialSteps.ts、src/lib/demoHandoff.ts。
*/
import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { buildDemoTutorialSteps, buildReplayTutorialSteps } from '../../src/lib/demoTutorialSteps'
import { readDemoModuleHandoff } from '../../src/lib/demoHandoff'
import type { TutorialStep } from '../../src/components/tutorial/TutorialContext'

const originalLocalStorage = globalThis.localStorage
const originalLocation = globalThis.location
const values = new Map<string, string>()
let assignedTo: string | null = null

beforeEach(() => {
  values.clear()
  assignedTo = null
  ;(globalThis as typeof globalThis & { localStorage: Storage }).localStorage = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value) },
    removeItem: key => { values.delete(key) },
  } as Storage
  // CTA 最後會導向 '/'；測試環境沒有真的 location，換成可觀察的替身。
  Object.defineProperty(globalThis, 'location', {
    configurable: true,
    value: { assign: (url: string) => { assignedTo = url } },
  })
})

afterEach(() => {
  ;(globalThis as typeof globalThis & { localStorage: Storage }).localStorage = originalLocalStorage
  Object.defineProperty(globalThis, 'location', { configurable: true, value: originalLocation })
})

const deps = { locale: 'id' as const, getActivePatientId: () => 'patient-1' }

function everyStepIsTrilingual(steps: TutorialStep[]) {
  return steps.every(step =>
    ['id', 'zh', 'en'].every(locale =>
      Boolean(step.title[locale as 'id']) && Boolean(step.content[locale as 'id'])))
}

describe('demo tutorial steps', () => {
  test('the first-run tour ends on the handoff CTA', () => {
    const steps = buildDemoTutorialSteps(deps)
    expect(steps.map(step => step.targetId)).toEqual(['tutorial-welcome', 'tab-dailyCare', 'tab-settings', 'tutorial-cta'])
    expect(steps[steps.length - 1].onPrimaryAction).toBeDefined()
  })

  test('the replay tour only shows the demo welcome inside demo mode', () => {
    expect(buildReplayTutorialSteps({ isDemoMode: true }).map(step => step.targetId))
      .toEqual(['tutorial-welcome', 'tab-dailyCare', 'tab-settings'])
    expect(buildReplayTutorialSteps({ isDemoMode: false }).map(step => step.targetId))
      .toEqual(['tab-dailyCare', 'tab-settings'])
  })

  test('every step carries all three languages, Bahasa Indonesia included', () => {
    expect(everyStepIsTrilingual(buildDemoTutorialSteps(deps))).toBe(true)
    expect(everyStepIsTrilingual(buildReplayTutorialSteps({ isDemoMode: true }))).toBe(true)
  })

  test('the CTA hands off only the enabled module ids, never a health value', () => {
    // 直接寫 dailyCarePreferences 的儲存格式：每位病人一筆，模組旗標平鋪，useCustomTemplate 同層。
    globalThis.localStorage.setItem('jiajianlog.daily-care-visibility', JSON.stringify({
      'patient-1': { bloodPressure: true, temperature: false, medication: true, useCustomTemplate: true },
    }))
    const cta = buildDemoTutorialSteps(deps)[3]
    cta.onPrimaryAction?.()

    const handoff = readDemoModuleHandoff()
    // 沒寫進偏好的模組由 normalizeDailyCareVisibility 預設為開，所以這裡只斷言「明確關掉的不會被搬過去」。
    expect(handoff?.moduleIds).toContain('bloodPressure')
    expect(handoff?.moduleIds).toContain('medication')
    expect(handoff?.moduleIds).not.toContain('temperature')
    expect(handoff?.useCustomTemplate).toBe(true)
    expect(JSON.stringify(handoff)).not.toContain('systolic')
    expect(assignedTo).toBe('/')
  })

  test('the CTA still reaches the login page when no patient is selected', () => {
    const cta = buildDemoTutorialSteps({ locale: 'zh', getActivePatientId: () => null })[3]
    cta.onPrimaryAction?.()
    expect(readDemoModuleHandoff()).toBeNull()
    expect(assignedTo).toBe('/')
  })
})
