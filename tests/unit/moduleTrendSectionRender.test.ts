/*
檔案用途：驗證共用趨勢外框的收合、期間選擇、偏好保存與 render prop 行為。
所在層：tests/unit；用 React hook harness 檢查元素樹，不啟動瀏覽器或圖表套件。
主要關聯：src/components/daily-care/ModuleTrendSection.tsx、src/lib/preferences/trendPreference 與各照護頁。
*/
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test'
import { installReactHookHarness, renderHook } from './helpers/reactHookHarness'
import { fire, findAll, textContent } from './helpers/elementTree'

installReactHookHarness()

const previousLocalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
const values = new Map<string, string>()

beforeAll(() => {
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    writable: true,
    value: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value) },
    },
  })
})

afterAll(() => {
  if (previousLocalStorage) Object.defineProperty(globalThis, 'localStorage', previousLocalStorage)
  else Reflect.deleteProperty(globalThis, 'localStorage')
})

beforeEach(() => {
  values.clear()
})

const { ModuleTrendSection } = await import('../../src/components/daily-care/ModuleTrendSection')

const localeContext = { locale: 'zh' as const, setLocale: () => {} }

function toggleButton(node: unknown) {
  const button = findAll(node, element => element.type === 'button' && element.props['aria-controls'] === 'pet-trend-trend-panel')[0]
  if (!button) throw new Error('Trend toggle is not on screen.')
  return button
}

function periodButton(node: unknown, label: string) {
  const button = findAll(node, element => element.type === 'button' && textContent(element.props.children) === label)[0]
  if (!button) throw new Error('Trend period "' + label + '" is not on screen.')
  return button
}

describe('ModuleTrendSection rendering', () => {
  test('keeps the chart unmounted while collapsed and renders the selected period after expansion', () => {
    const view = renderHook(() => ModuleTrendSection({
      moduleId: 'pet-trend',
      titleId: 'pet-trend-title',
      children: days => 'chart:' + days,
    }), { defaultContext: localeContext })

    expect(toggleButton(view.current).props['aria-expanded']).toBe(false)
    expect(textContent(view.current)).not.toContain('chart:')

    view.act(() => fire(toggleButton(view.current), 'onClick'))
    expect(toggleButton(view.current).props['aria-expanded']).toBe(true)
    expect(textContent(view.current)).toContain('chart:7')

    view.act(() => fire(periodButton(view.current, '14 天'), 'onClick'))
    expect(textContent(view.current)).toContain('chart:14')
    expect(values.get('jiajianlog.trend-period')).toBe('14')
    expect(JSON.parse(values.get('jiajianlog.trend-expanded') ?? '{}')).toEqual({ 'pet-trend': true })

    view.act(() => fire(toggleButton(view.current), 'onClick'))
    expect(toggleButton(view.current).props['aria-expanded']).toBe(false)
    expect(textContent(view.current)).not.toContain('chart:14')
    expect(JSON.parse(values.get('jiajianlog.trend-expanded') ?? '{}')).toEqual({ 'pet-trend': false })
    view.unmount()
  })

  test('restores stored period, supports all period buttons, and can hide the picker', () => {
    values.set('jiajianlog.trend-period', '42')
    values.set('jiajianlog.trend-expanded', JSON.stringify({ 'pet-trend': true }))
    const view = renderHook(() => ModuleTrendSection({
      moduleId: 'pet-trend',
      titleId: 'pet-trend-title',
      showPeriodPicker: false,
      children: days => 'chart:' + days,
    }), { defaultContext: localeContext })

    expect(textContent(view.current)).toContain('chart:42')
    expect(findAll(view.current, element => element.props.role === 'group')).toHaveLength(0)

    view.act(() => fire(toggleButton(view.current), 'onClick'))
    expect(textContent(view.current)).not.toContain('chart:42')
    view.unmount()
  })

  test('renders every configured period when the picker is enabled', () => {
    values.set('jiajianlog.trend-expanded', JSON.stringify({ 'pet-trend': true }))
    const view = renderHook(() => ModuleTrendSection({
      moduleId: 'pet-trend',
      titleId: 'pet-trend-title',
      children: days => 'chart:' + days,
    }), { defaultContext: localeContext })

    expect(['7 天', '14 天', '28 天', '42 天'].map(label => Boolean(periodButton(view.current, label)))).toEqual([true, true, true, true])
    view.unmount()
  })
})
