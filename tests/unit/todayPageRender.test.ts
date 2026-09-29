/*
檔案用途：驗證今天頁（TodayPage）在展示模式下能正常組合渲染，且「量血壓」「查看全部」「查看最近變動」
三個一步到位的導覽動作都會呼叫對應的 callback，不疊加額外導覽層。
所在層：tests/unit；用 React hook harness 呼叫元件函式，不遞迴渲染巢狀元件（見 latestVitalsRender.test.ts 慣例），
因此不會連帶觸發 MedicationPage 內部的 Supabase／demo 讀取流程。
主要關聯：src/features/today/pages/TodayPage.tsx、useTodayOverview.ts、demoStorage 的展示模式 fixture。
*/
import { afterAll, beforeEach, describe, expect, test } from 'bun:test'
import { installReactHookHarness, renderHook } from './helpers/reactHookHarness'
import { fire, findAll, findButton, textContent } from './helpers/elementTree'
import { DEMO_MEILING_PATIENT_ID } from '../../src/lib/demoData'
import { saveDemoCareTimelineEntry } from '../../src/lib/demoStorage'
import { AttentionItem } from '../../src/components/ui/AttentionItem'
import dayjs from 'dayjs'

installReactHookHarness()

const LOCALE_CONTEXT_VALUE = { locale: 'zh' as const, setLocale: () => {} }

// 今天頁的血壓摘要與異常示警現在都走病人綁定的判讀標準（issue #898）。正式程式碼在沒有
// BpStandardProvider 時會直接丟例外——那是刻意的防呆，所以這裡要明確注入一份，
// 而不是讓 hook 悄悄退回全域預設值（那正是這個設計要消滅的靜默失敗）。
const { BpStandardContext, GENERAL_ADULT_EVALUATOR } = await import('../../src/features/vitals/hooks/useBpEvaluator')
const BP_STANDARD_CONTEXTS: Array<readonly [unknown, unknown]> = [[BpStandardContext, GENERAL_ADULT_EVALUATOR]]

const demoValues = new Map<string, string>()
const originalWindow = globalThis.window
const demoWindow = {
  location: { pathname: '/demo' },
  localStorage: {
    getItem: (key: string) => demoValues.get(key) ?? null,
    setItem: (key: string, value: string) => { demoValues.set(key, value) },
    removeItem: (key: string) => { demoValues.delete(key) },
  },
} as unknown as Window & typeof globalThis

beforeEach(() => {
  demoValues.clear()
  globalThis.window = demoWindow
})

afterAll(() => {
  if (originalWindow) globalThis.window = originalWindow
  else delete (globalThis as { window?: Window & typeof globalThis }).window
})

const { TodayPage } = await import('../../src/features/today/pages/TodayPage')

function baseProps(overrides: Partial<Parameters<typeof TodayPage>[0]> = {}) {
  return {
    patientId: DEMO_MEILING_PATIENT_ID,
    availablePatients: [],
    onSubjectSelect: () => {},
    userEmail: 'caregiver@example.com',
    // 關掉服藥時段卡：MedicationPage 是巢狀元件描述，harness 不會遞迴呼叫它，
    // 這裡刻意不 embed 是為了讓測試焦點放在今天頁自己的組合邏輯，而不是重新測試 MedicationPage。
    canUseMedication: false,
    manageablePatients: [],
    ownPatientId: DEMO_MEILING_PATIENT_ID,
    medicationSlotsExpanded: true,
    medicationNameEnglishFirst: true,
    caregiverDensityMode: false,
    onOpenBloodPressureMeasurement: () => {},
    onOpenReminders: () => {},
    onOpenHistory: () => {},
    ...overrides,
  }
}

describe('TodayPage', () => {
  test('renders the Now / Attention / Trend sections with demo fixture data', () => {
    const view = renderHook(() => TodayPage(baseProps()), { defaultContext: LOCALE_CONTEXT_VALUE, contexts: BP_STANDARD_CONTEXTS })
    const rendered = textContent(view.current)
    expect(rendered).toContain('現在')
    expect(rendered).toContain('需要留意')
    expect(rendered).toContain('最近 7 天')
    expect(rendered).toContain('量血壓')
    // LatestVitals 是巢狀元件描述，只需確認今天頁真的把它組進畫面。
    expect(findAll(view.current, element => typeof element.type === 'function').length).toBeGreaterThan(0)
    view.unmount()
  })

  test('reaches blood pressure measurement in one tap', () => {
    let opened = false
    const view = renderHook(() => TodayPage(baseProps({ onOpenBloodPressureMeasurement: () => { opened = true } })), { defaultContext: LOCALE_CONTEXT_VALUE, contexts: BP_STANDARD_CONTEXTS })
    view.act(() => fire(findButton(view.current, '量血壓'), 'onClick'))
    expect(opened).toBe(true)
    view.unmount()
  })

  test('the "view all" attention link and the recent-changes link each reach their destination in one tap', () => {
    let openedReminders = false
    let openedHistory = false
    const view = renderHook(() => TodayPage(baseProps({
      onOpenReminders: () => { openedReminders = true },
      onOpenHistory: () => { openedHistory = true },
    })), { defaultContext: LOCALE_CONTEXT_VALUE, contexts: BP_STANDARD_CONTEXTS })

    view.act(() => fire(findButton(view.current, '查看全部'), 'onClick'))
    expect(openedReminders).toBe(true)

    view.act(() => fire(findButton(view.current, '查看最近變動 →'), 'onClick'))
    expect(openedHistory).toBe(true)
    view.unmount()
  })

  describe('caregiver density mode (F 期)', () => {
    test('collapses the trend section into a one-line link, and expanding it shows the same content as the family view', () => {
      const view = renderHook(() => TodayPage(baseProps({ caregiverDensityMode: true })), { defaultContext: LOCALE_CONTEXT_VALUE, contexts: BP_STANDARD_CONTEXTS })
      // 收合狀態：不直接顯示「最近 7 天」區塊標題（h2），只給一行連結；
      // 用 h2 而非整段 textContent 判斷，避免跟連結文字「查看最近 7 天趨勢 →」的子字串互相干擾。
      expect(findAll(view.current, element => element.type === 'h2' && textContent(element.props.children) === '最近 7 天').length).toBe(0)

      view.act(() => fire(findButton(view.current, '查看最近 7 天趨勢 →'), 'onClick'))
      // 展開後跟家屬版一樣直接看得到內容，不是刪除功能。
      expect(findAll(view.current, element => element.type === 'h2' && textContent(element.props.children) === '最近 7 天').length).toBe(1)
      view.unmount()
    })

    test('does not collapse the trend section when density mode is off (no regression to the B 期 layout)', () => {
      const view = renderHook(() => TodayPage(baseProps({ caregiverDensityMode: false })), { defaultContext: LOCALE_CONTEXT_VALUE, contexts: BP_STANDARD_CONTEXTS })
      expect(findAll(view.current, element => element.type === 'h2' && textContent(element.props.children) === '最近 7 天').length).toBe(1)
      expect(findAll(view.current, element => element.type === 'button' && textContent(element.props.children) === '查看最近 7 天趨勢 →').length).toBe(0)
      view.unmount()
    })

    test('only shows attention items that need action today, hiding a reassessment scheduled far in the future', () => {
      const farFuture = dayjs().add(30, 'day').format('YYYY-MM-DD')
      saveDemoCareTimelineEntry({
        id: 'today-page-density-far-future',
        patient_id: DEMO_MEILING_PATIENT_ID,
        event_type: 'reassessment',
        title: '密度模式不該顯示的複評',
        details: '',
        occurred_at: '2026-08-01T00:00:00.000Z',
        reassess_on: farFuture,
        created_by: 'owner@example.com',
        created_at: '2026-08-01T00:00:00.000Z',
        medication_plan_id: null,
      })
      saveDemoCareTimelineEntry({
        id: 'today-page-density-overdue',
        patient_id: DEMO_MEILING_PATIENT_ID,
        event_type: 'reassessment',
        title: '密度模式應該顯示的逾期複評',
        details: '',
        occurred_at: '2026-08-01T00:00:00.000Z',
        reassess_on: '2020-01-01',
        created_by: 'owner@example.com',
        created_at: '2026-08-01T00:00:00.000Z',
        medication_plan_id: null,
      })

      const view = renderHook(() => TodayPage(baseProps({ caregiverDensityMode: true })), { defaultContext: LOCALE_CONTEXT_VALUE, contexts: BP_STANDARD_CONTEXTS })
      // AttentionItem 是巢狀元件描述，title／description 是 props 不是 children，
      // 因此不能用 textContent 找標題，改用 findAll 直接比對傳入 AttentionItem 的 props。
      const attentionTitles = findAll(view.current, element => element.type === AttentionItem).map(element => (element.props as { title: string }).title)
      expect(attentionTitles).toContain('密度模式應該顯示的逾期複評')
      expect(attentionTitles).not.toContain('密度模式不該顯示的複評')
      view.unmount()
    })
  })
})
