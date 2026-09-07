/*
檔案用途：驗證最新生命徵象元件的載入／錯誤／空白／已就緒四種畫面，以及一分鐘重測倒數計時器的啟停。
所在層：tests/unit；以最小 hook 執行環境呼叫元件函式，用假的計時器取代真實 setInterval。
主要關聯：src/features/vitals/components/LatestVitals.tsx、VitalReading 與 InputPage 的重測提示。
*/
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test'
import { installReactHookHarness, renderHook } from './helpers/reactHookHarness'
import { findAll, textContent } from './helpers/elementTree'
import type { BpRecord } from '../../src/types/database'

installReactHookHarness()

// 為什麼不 mock i18n 模組：bun 的 mock.module 是整個測試程序共用的，
// 換掉 useI18n 會讓其他測試檔拿到錯誤的語系實作；改用真的 useI18n，只從 harness 餵入 Provider 值。
const LOCALE_CONTEXT_VALUE = { locale: 'zh' as const, setLocale: () => {} }

const { LatestVitals } = await import('../../src/features/vitals/components/LatestVitals')

const timers = new Map<number, () => void>()
let nextTimerId = 1
const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window')
let now = Date.parse('2026-07-16T12:13:02.000Z')

beforeAll(() => {
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    writable: true,
    value: {
      setInterval: (handler: () => void) => { const id = nextTimerId++; timers.set(id, handler); return id },
      clearInterval: (id: number) => { timers.delete(id) },
    },
  })
})

afterAll(() => {
  if (previousWindow) Object.defineProperty(globalThis, 'window', previousWindow)
  else Reflect.deleteProperty(globalThis, 'window')
  Date.now = realDateNow
})

const realDateNow = Date.now
beforeEach(() => {
  timers.clear()
  nextTimerId = 1
  now = Date.parse('2026-07-16T12:13:02.000Z')
  Date.now = () => now
})

const record: BpRecord = {
  id: 'bp-1',
  patient_id: 'patient-1',
  systolic: 120,
  diastolic: 80,
  pulse: 70,
  measured_at: '2026-07-16T12:13:02.000Z',
  created_at: '2026-07-16T12:13:02.000Z',
  recorded_by: null,
  source: 'manual_web',
}

describe('LatestVitals states', () => {
  test('shows a loading label instead of a stale reading', () => {
    const view = renderHook(() => LatestVitals({ record: null, loading: true }), { defaultContext: LOCALE_CONTEXT_VALUE })
    expect(textContent(view.current)).toContain('載入中…')
    view.unmount()
  })

  test('shows an error label the caregiver can act on', () => {
    const view = renderHook(() => LatestVitals({ record: null, error: true }), { defaultContext: LOCALE_CONTEXT_VALUE })
    expect(textContent(view.current)).toContain('錯誤')
    view.unmount()
  })

  test('says there is no reading yet rather than showing zeros', () => {
    const view = renderHook(() => LatestVitals({ record: null }), { defaultContext: LOCALE_CONTEXT_VALUE })
    expect(textContent(view.current)).toContain('尚無資料')
    expect(timers.size).toBe(0)
    view.unmount()
  })

  test('renders the measured time, the shared vital reading, and the repeat countdown', () => {
    const view = renderHook(() => LatestVitals({ record }), { defaultContext: LOCALE_CONTEXT_VALUE })
    const rendered = textContent(view.current)
    expect(rendered).toContain('最後一次量測：')
    expect(rendered).toContain('20:13:02')
    expect(rendered).toContain('再等 01:00')
    // 數值必須交給共用的 VitalReading，指標色才不會在各畫面走樣。
    expect(findAll(view.current, element => typeof element.type === 'function')).toHaveLength(1)
    expect(findAll(view.current, element => element.props.role === 'timer')).toHaveLength(1)
    view.unmount()
  })

  test('can hide the timestamp and the countdown when embedded in a summary card', () => {
    const view = renderHook(() => LatestVitals({ record, showTimestamp: false, showInterval: false }), { defaultContext: LOCALE_CONTEXT_VALUE })
    const rendered = textContent(view.current)
    expect(rendered).not.toContain('最後一次量測：')
    expect(findAll(view.current, element => element.props.role === 'timer')).toHaveLength(0)
    view.unmount()
  })
})

describe('one-minute repeat countdown', () => {
  test('ticks down while the interval is active and stops itself at the deadline', () => {
    const view = renderHook(() => LatestVitals({ record }), { defaultContext: LOCALE_CONTEXT_VALUE })
    expect(timers.size).toBe(1)

    now += 23_000
    view.act(() => { for (const tick of timers.values()) tick() })
    expect(textContent(view.current)).toContain('再等 00:37')

    // 倒數結束就必須停止，避免照護頁開很久時每秒重繪耗電。
    now += 40_000
    view.act(() => { for (const tick of timers.values()) tick() })
    expect(textContent(view.current)).toContain('可再量測')
    expect(timers.size).toBe(0)
    view.unmount()
  })

  test('does not start a timer for a reading that is already older than a minute', () => {
    now = Date.parse('2026-07-16T12:20:00.000Z')
    const view = renderHook(() => LatestVitals({ record }), { defaultContext: LOCALE_CONTEXT_VALUE })
    expect(timers.size).toBe(0)
    expect(textContent(view.current)).toContain('可再量測')
    view.unmount()
  })

  test('clears the timer when the screen goes away', () => {
    const view = renderHook(() => LatestVitals({ record }), { defaultContext: LOCALE_CONTEXT_VALUE })
    expect(timers.size).toBe(1)
    view.unmount()
    expect(timers.size).toBe(0)
  })
})
