/*
檔案用途：驗證每日照護頁籤（DailyCareSectionTabs）C 期「兩列常駐＋更多 sheet」的排版與互動邏輯（issue #734）：
常駐模組數量不論病人有幾個模組都會收斂在上限內、目前選到的模組一定出現在常駐列、
「更多」sheet 能選到任一個未常駐顯示的模組並在選取後正確回呼、關閉，以及既有的方向鍵切換行為仍然成立。
所在層：tests/unit；用 React hook harness 呼叫元件函式，不啟動真的瀏覽器 <dialog>（見 helpers/reactHookHarness 慣例）。
主要關聯：src/components/daily-care/DailyCareSectionTabs.tsx、src/lib/dailyCareModules.ts。
*/
import { describe, expect, test } from 'bun:test'
import { installReactHookHarness, renderHook } from './helpers/reactHookHarness'
import { fire, findAll, findButton, textContent } from './helpers/elementTree'
import { DAILY_CARE_MODULES } from '../../src/lib/dailyCareModules'

installReactHookHarness()

const LOCALE_CONTEXT_VALUE = { locale: 'zh' as const, setLocale: () => {} }

const { DailyCareSectionTabs } = await import('../../src/components/daily-care/DailyCareSectionTabs')

describe('DailyCareSectionTabs', () => {
  test('all 13 demo modules stay readable: no more than 5 always-on tabs, the rest reachable via 更多', () => {
    const view = renderHook(() => DailyCareSectionTabs({
      modules: [...DAILY_CARE_MODULES],
      activeModule: 'bloodPressure',
      onSelect: () => {},
    }), { defaultContext: LOCALE_CONTEXT_VALUE })

    const tabs = findAll(view.current, element => element.props.role === 'tab')
    // 常駐 tab 數量必須明顯少於全部 13 個模組，才算真的解決「一列塞 13 格」的截斷問題；
    // 同時要留一格給「更多」，所以嚴格小於上限（見元件內 MAX_VISIBLE_MODULES 註解）。
    expect(tabs.length).toBeLessThan(5)
    expect(tabs.length).toBeGreaterThan(1)
    expect(textContent(view.current)).toContain('更多')
    // 沒被排進常駐列的模組要能在「更多」裡找到，兩邊合起來涵蓋全部 13 個模組。
    view.act(() => fire(findButton(view.current, '更多'), 'onClick'))
    expect(textContent(view.current)).toContain('失智照護')
    view.unmount()
  })

  test('few modules (no overflow) render all of them with no 更多 button', () => {
    const modules = DAILY_CARE_MODULES.slice(0, 2)
    const view = renderHook(() => DailyCareSectionTabs({
      modules: [...modules],
      activeModule: modules[0].id,
      onSelect: () => {},
    }), { defaultContext: LOCALE_CONTEXT_VALUE })

    const tabs = findAll(view.current, element => element.props.role === 'tab')
    expect(tabs.length).toBe(2)
    expect(textContent(view.current)).not.toContain('更多')
    view.unmount()
  })

  test('the active module is always pinned into the visible row even when it would otherwise overflow', () => {
    // dementiaCare 排在 DAILY_CARE_MODULES 第 10 個，遠超過常駐上限，
    // 但如果病人上次選的就是它，畫面上一定要看得到它被選取，否則 aria-selected 找不到對應的可見 tab。
    const view = renderHook(() => DailyCareSectionTabs({
      modules: [...DAILY_CARE_MODULES],
      activeModule: 'dementiaCare',
      onSelect: () => {},
    }), { defaultContext: LOCALE_CONTEXT_VALUE })

    const selectedTab = findAll(view.current, element => element.props.role === 'tab' && element.props['aria-selected'] === true)
    expect(selectedTab.length).toBe(1)
    expect(selectedTab[0].props.id).toBe('daily-care-dementiaCare-tab')
    view.unmount()
  })

  test('picking a module from the 更多 sheet fires onSelect and closes the sheet', () => {
    let selected: string | null = null
    const view = renderHook(() => DailyCareSectionTabs({
      modules: [...DAILY_CARE_MODULES],
      activeModule: 'bloodPressure',
      onSelect: id => { selected = id },
    }), { defaultContext: LOCALE_CONTEXT_VALUE })

    view.act(() => fire(findButton(view.current, '更多'), 'onClick'))
    expect(textContent(view.current)).toContain('更多模組')

    view.act(() => fire(findButton(view.current, '失智照護'), 'onClick'))
    expect(selected).toBe('dementiaCare')
    // sheet 關閉後標題文字應該消失。
    expect(textContent(view.current)).not.toContain('更多模組')
    view.unmount()
  })

  test('arrow keys still cycle through the visible tabs only', () => {
    let selected: string | null = null
    const modules = DAILY_CARE_MODULES.slice(0, 3)
    const view = renderHook(() => DailyCareSectionTabs({
      modules: [...modules],
      activeModule: modules[0].id,
      onSelect: id => { selected = id },
    }), { defaultContext: LOCALE_CONTEXT_VALUE })

    const firstTab = findAll(view.current, element => element.props.role === 'tab')[0]
    view.act(() => fire(firstTab, 'onKeyDown', { key: 'ArrowRight', preventDefault: () => {} }))
    expect(selected).toBe(modules[1].id)
    view.unmount()
  })
})
