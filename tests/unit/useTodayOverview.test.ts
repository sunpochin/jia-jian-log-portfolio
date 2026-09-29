/*
檔案用途：驗證今天頁 hook（useTodayOverview）在展示模式下的讀取彙整結果：血壓摘要、需要留意清單排序與展示模式邊界。
所在層：tests/unit；用 React hook harness 直接呼叫 hook，不經過完整頁面渲染，走真正的 demoStorage adapter。
主要關聯：src/features/today/hooks/useTodayOverview.ts、demoStorage／demoData 的展示模式 fixture、careTimeline 的 pendingReassessments。
*/
import { afterAll, beforeEach, describe, expect, test } from 'bun:test'
import { installReactHookHarness, renderHook } from './helpers/reactHookHarness'
import { DEMO_MEILING_PATIENT_ID } from '../../src/lib/demoData'
import { saveDemoCareTimelineEntry } from '../../src/lib/demoStorage'
import dayjs from 'dayjs'

installReactHookHarness()

const LOCALE_CONTEXT_VALUE = { locale: 'zh' as const, setLocale: () => {} }

// 今天頁的血壓摘要與異常示警現在都走病人綁定的判讀標準（issue #898）。正式程式碼在沒有
// BpStandardProvider 時會直接丟例外——那是刻意的防呆，所以這裡要明確注入一份，
// 而不是讓 hook 悄悄退回全域預設值（那正是這個設計要消滅的靜默失敗）。
const { BpStandardContext, GENERAL_ADULT_EVALUATOR } = await import('../../src/features/vitals/hooks/useBpEvaluator')
const BP_STANDARD_CONTEXTS: Array<readonly [unknown, unknown]> = [[BpStandardContext, GENERAL_ADULT_EVALUATOR]]

// 沿用 petCarePagesRender.test.ts 的假 window 慣例：真正的 Demo adapter 需要 window.location.pathname === '/demo'
// 與可寫的 localStorage，才會走本機種子＋本機新增合併的讀取路徑，而不是打真正的 Supabase。
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

const { useTodayOverview } = await import('../../src/features/today/hooks/useTodayOverview')

describe('useTodayOverview (demo mode)', () => {
  test('summarizes the last 7 days of blood pressure from the demo fallback story', () => {
    const view = renderHook(() => useTodayOverview(DEMO_MEILING_PATIENT_ID), { defaultContext: LOCALE_CONTEXT_VALUE, contexts: BP_STANDARD_CONTEXTS })
    expect(view.current.loading).toBe(false)
    expect(view.current.offline).toBe(false)
    expect(view.current.bpSummary.recordCount).toBeGreaterThan(0)
    expect(view.current.latestBpRecord).not.toBeNull()
    view.unmount()
  })

  test('surfaces an overdue reassessment ahead of unrelated demo timeline entries', () => {
    saveDemoCareTimelineEntry({
      id: 'today-hook-test-overdue',
      patient_id: DEMO_MEILING_PATIENT_ID,
      event_type: 'reassessment',
      title: '複評血壓用藥',
      details: '',
      occurred_at: '2026-08-01T00:00:00.000Z',
      reassess_on: '2020-01-01',
      created_by: 'owner@example.com',
      created_at: '2026-08-01T00:00:00.000Z',
      medication_plan_id: null,
    })

    const view = renderHook(() => useTodayOverview(DEMO_MEILING_PATIENT_ID), { defaultContext: LOCALE_CONTEXT_VALUE, contexts: BP_STANDARD_CONTEXTS })
    expect(view.current.attentionItems[0]?.id).toBe('reassessment:today-hook-test-overdue')
    expect(view.current.attentionItems[0]?.tone).toBe('overdue')
    view.unmount()
  })

  test('does not surface a reassessment scheduled far in the future', () => {
    const farFuture = dayjs().add(365, 'day').format('YYYY-MM-DD')
    saveDemoCareTimelineEntry({
      id: 'today-hook-test-far-future',
      patient_id: DEMO_MEILING_PATIENT_ID,
      event_type: 'reassessment',
      title: '明年才需要複評',
      details: '',
      occurred_at: '2026-08-01T00:00:00.000Z',
      reassess_on: farFuture,
      created_by: 'owner@example.com',
      created_at: '2026-08-01T00:00:00.000Z',
      medication_plan_id: null,
    })

    const view = renderHook(() => useTodayOverview(DEMO_MEILING_PATIENT_ID), { defaultContext: LOCALE_CONTEXT_VALUE, contexts: BP_STANDARD_CONTEXTS })
    expect(view.current.attentionItems.some(item => item.id === 'reassessment:today-hook-test-far-future')).toBe(false)
    view.unmount()
  })

  test('never queries live due reminders for a demo patient (feature not available in demo mode)', () => {
    const view = renderHook(() => useTodayOverview(DEMO_MEILING_PATIENT_ID), { defaultContext: LOCALE_CONTEXT_VALUE, contexts: BP_STANDARD_CONTEXTS })
    expect(view.current.attentionItems.every(item => !item.id.startsWith('reminder:'))).toBe(true)
    view.unmount()
  })

  describe('density (F 期看護密度模式擴充點)', () => {
    test('defaults to family density when no options are passed', () => {
      const view = renderHook(() => useTodayOverview(DEMO_MEILING_PATIENT_ID), { defaultContext: LOCALE_CONTEXT_VALUE, contexts: BP_STANDARD_CONTEXTS })
      expect(view.current.density).toBe('family')
      view.unmount()
    })

    test('reports caregiver density when densityMode is requested by the caller', () => {
      const view = renderHook(() => useTodayOverview(DEMO_MEILING_PATIENT_ID, { densityMode: true }), { defaultContext: LOCALE_CONTEXT_VALUE, contexts: BP_STANDARD_CONTEXTS })
      expect(view.current.density).toBe('caregiver')
      view.unmount()
    })

    test('todayAttentionItems only keeps overdue-or-due-today items, dropping a reassessment scheduled far in the future', () => {
      saveDemoCareTimelineEntry({
        id: 'today-hook-test-density-overdue',
        patient_id: DEMO_MEILING_PATIENT_ID,
        event_type: 'reassessment',
        title: '今天就要處理的複評',
        details: '',
        occurred_at: '2026-08-01T00:00:00.000Z',
        reassess_on: '2020-01-01',
        created_by: 'owner@example.com',
        created_at: '2026-08-01T00:00:00.000Z',
        medication_plan_id: null,
      })
      // 3 天後到期：在 pendingReassessments 的 7 天視窗內，會出現在 attentionItems（tone: due_soon），
      // 但不算「今天要做」，用來驗證 todayAttentionItems 真的比 attentionItems 更收斂。
      saveDemoCareTimelineEntry({
        id: 'today-hook-test-density-due-soon',
        patient_id: DEMO_MEILING_PATIENT_ID,
        event_type: 'reassessment',
        title: '三天後才需要複評',
        details: '',
        occurred_at: '2026-08-01T00:00:00.000Z',
        reassess_on: dayjs().add(3, 'day').format('YYYY-MM-DD'),
        created_by: 'owner@example.com',
        created_at: '2026-08-01T00:00:00.000Z',
        medication_plan_id: null,
      })

      const view = renderHook(() => useTodayOverview(DEMO_MEILING_PATIENT_ID, { densityMode: true }), { defaultContext: LOCALE_CONTEXT_VALUE, contexts: BP_STANDARD_CONTEXTS })
      expect(view.current.attentionItems.some(item => item.id === 'reassessment:today-hook-test-density-overdue')).toBe(true)
      expect(view.current.attentionItems.some(item => item.id === 'reassessment:today-hook-test-density-due-soon')).toBe(true)
      expect(view.current.todayAttentionItems.some(item => item.id === 'reassessment:today-hook-test-density-overdue')).toBe(true)
      expect(view.current.todayAttentionItems.some(item => item.id === 'reassessment:today-hook-test-density-due-soon')).toBe(false)
      view.unmount()
    })
  })
})
