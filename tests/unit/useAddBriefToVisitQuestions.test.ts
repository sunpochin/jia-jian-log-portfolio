/*
檔案用途：驗證就診前摘要「加入問題清單」hook（照護閉環 T4，issue #948）——既有清單的「已在清單」判定、
一鍵寫入的 payload（提問＋觀察、規則代號＋來源列 id 成對）、23505 視為已在清單、其他錯誤進入 error、
切換病人後不殘留舊病人的狀態，以及問題文字的 500 字截斷。
所在層：tests/unit；以可追蹤的 Supabase chain mock 搭配 React hook harness 執行真正的 hook。
主要關聯：src/features/vitals/hooks/useAddBriefToVisitQuestions.ts、src/lib/visitQuestions.ts。
*/
import { beforeEach, describe, expect, mock, test } from 'bun:test'
import { installReactHookHarness, renderHook } from './helpers/reactHookHarness'
import type { PreVisitBriefItem } from '../../src/lib/preVisitBrief'

installReactHookHarness()

const calls: Array<{ method: string; args: unknown[] }> = []
let listResult: { data: unknown; error: unknown } = { data: [], error: null }
let insertResult: { data: unknown; error: unknown } = { data: null, error: null }

const supabase = {
  from(table: string) {
    calls.push({ method: 'from', args: [table] })
    let pendingInsert = false
    const chain: Record<string, (...args: unknown[]) => unknown> = {}
    chain.insert = (...args) => { pendingInsert = true; calls.push({ method: 'insert', args }); return chain }
    chain.select = (...args) => { calls.push({ method: 'select', args }); return chain }
    chain.eq = (...args) => { calls.push({ method: 'eq', args }); return chain }
    chain.order = (...args) => { calls.push({ method: 'order', args }); return chain }
    chain.single = () => { calls.push({ method: 'single', args: [] }); return Promise.resolve(insertResult) }
    chain.then = (onFulfilled?: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) =>
      Promise.resolve(pendingInsert ? insertResult : listResult).then(onFulfilled, onRejected)
    return chain
  },
}

mock.module('../../src/lib/supabase', () => ({ supabase }))

const { useAddBriefToVisitQuestions, buildAdoptedQuestionText, VISIT_QUESTION_MAX_LENGTH } = await import('../../src/features/vitals/hooks/useAddBriefToVisitQuestions')

const LOCALE_CONTEXT_VALUE = { locale: 'zh' as const, setLocale: () => {} }
const flush = () => new Promise(resolve => setTimeout(resolve, 0))

function item(overrides: Partial<PreVisitBriefItem> = {}): PreVisitBriefItem {
  return {
    ruleId: 'R5', priority: 1, occurredAt: '2026-07-10T00:00:00.000Z', relatedMedicationId: null, dedupeId: 'lab-1',
    observation: { id: 'Kalium 2.8 mmol/L di bawah rentang.', zh: '血鉀 2.8 mmol/L，低於參考值。', en: 'Potassium 2.8 mmol/L below range.' },
    question: { id: 'Tanyakan kepada dokter: apakah perlu tindak lanjut?', zh: '請與醫師確認：這項血鉀結果是否需要追蹤？', en: 'Please confirm with the doctor: whether follow-up is needed?' },
    ...overrides,
  }
}

const savedRow = { id: 'q-new', patient_id: 'p1', question: 'x', answer: null, status: 'open', source: 'pre_visit_rule', source_rule_id: 'R5', source_entity_id: 'lab-1', sort_order: 3 }

beforeEach(() => {
  calls.length = 0
  listResult = { data: [], error: null }
  insertResult = { data: savedRow, error: null }
})

describe('useAddBriefToVisitQuestions', () => {
  test('marks items already adopted from the existing list and leaves the rest available', async () => {
    listResult = { data: [{ id: 'q1', patient_id: 'p1', source: 'pre_visit_rule', source_rule_id: 'R5', source_entity_id: 'lab-1', sort_order: 2 }, { id: 'q2', patient_id: 'p1', source: 'manual', source_rule_id: null, source_entity_id: null, sort_order: 1 }], error: null }
    const view = renderHook(() => useAddBriefToVisitQuestions('p1', { enabled: true }), { defaultContext: LOCALE_CONTEXT_VALUE })
    await flush()
    expect(view.current.statusOf(item())).toBe('added')
    expect(view.current.statusOf(item({ ruleId: 'R1', dedupeId: 'log-9' }))).toBe('available')
    expect(calls.find(call => call.method === 'eq')?.args).toEqual(['patient_id', 'p1'])
    view.unmount()
  })

  test('writes question + observation with the paired source ids and reports added', async () => {
    listResult = { data: [{ id: 'q1', patient_id: 'p1', source: 'manual', source_rule_id: null, source_entity_id: null, sort_order: 2 }], error: null }
    const view = renderHook(() => useAddBriefToVisitQuestions('p1', { enabled: true }), { defaultContext: LOCALE_CONTEXT_VALUE })
    await flush()
    view.act(() => view.current.add(item()))
    expect(view.current.statusOf(item())).toBe('saving')
    await flush()
    const insert = calls.find(call => call.method === 'insert')?.args[0] as Record<string, unknown>
    expect(insert).toEqual({
      patient_id: 'p1',
      question: '請與醫師確認：這項血鉀結果是否需要追蹤？（血鉀 2.8 mmol/L，低於參考值。）',
      status: 'open',
      sort_order: 3,
      source: 'pre_visit_rule',
      source_rule_id: 'R5',
      source_entity_id: 'lab-1',
    })
    expect(view.current.statusOf(item())).toBe('added')
    expect(view.current.errorMessage).toBeNull()
    view.unmount()
  })

  test('treats a unique violation as already on the list and surfaces other failures', async () => {
    const view = renderHook(() => useAddBriefToVisitQuestions('p1', { enabled: true }), { defaultContext: LOCALE_CONTEXT_VALUE })
    await flush()
    insertResult = { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint' } }
    view.act(() => view.current.add(item()))
    await flush()
    expect(view.current.statusOf(item())).toBe('added')
    expect(view.current.errorMessage).toBeNull()

    insertResult = { data: null, error: { code: '42501', message: 'permission denied' } }
    const other = item({ ruleId: 'R1', dedupeId: 'log-1' })
    view.act(() => view.current.add(other))
    await flush()
    expect(view.current.statusOf(other)).toBe('error')
    expect(view.current.errorMessage).not.toBeNull()
    view.unmount()
  })

  // Codex review PR #954 P2：清單還沒回來就按，sort_order 會從空清單算成 1 而插到最前面；載入中一律不可加入，
  // 連續加入兩個項目也要拿到連號的 sort_order。
  test('reports loading until the list arrives, ignores taps meanwhile, and allocates consecutive sort orders', async () => {
    listResult = { data: [{ id: 'q1', patient_id: 'p1', source: 'manual', source_rule_id: null, source_entity_id: null, sort_order: 4 }], error: null }
    let added = 0
    const view = renderHook(() => useAddBriefToVisitQuestions('p1', { enabled: true, onAdded: () => { added += 1 } }), { defaultContext: LOCALE_CONTEXT_VALUE })
    expect(view.current.statusOf(item())).toBe('loading')
    view.act(() => view.current.add(item()))
    expect(calls.some(call => call.method === 'insert')).toBe(false)
    await flush()
    expect(view.current.statusOf(item())).toBe('available')

    const second = item({ ruleId: 'R1', dedupeId: 'log-1' })
    view.act(() => view.current.add(item()))
    view.act(() => view.current.add(second))
    await flush()
    const orders = calls.filter(call => call.method === 'insert').map(call => (call.args[0] as { sort_order: number }).sort_order)
    expect(orders).toEqual([5, 6])
    expect(added).toBe(2)
    view.unmount()
  })

  // 2026-09-26 獨立複審：來源被刪或不屬於這位病人時資料庫回 23503，重試永遠不會成功——要標成 stale、停止重送。
  test('marks a 23503 rejection as stale and stops retrying that item', async () => {
    const view = renderHook(() => useAddBriefToVisitQuestions('p1', { enabled: true }), { defaultContext: LOCALE_CONTEXT_VALUE })
    await flush()
    insertResult = { data: null, error: { code: '23503', message: 'patient_visit_questions_source_entity_patient_mismatch' } }
    view.act(() => view.current.add(item()))
    await flush()
    expect(view.current.statusOf(item())).toBe('stale')
    expect(view.current.errorMessage?.zh).toContain('來源資料已被刪除或變更')
    const insertsBefore = calls.filter(call => call.method === 'insert').length
    view.act(() => view.current.add(item()))
    await flush()
    expect(calls.filter(call => call.method === 'insert').length).toBe(insertsBefore)
    view.unmount()
  })

  test('ignores observation-only items and does nothing while disabled', async () => {
    const view = renderHook(() => useAddBriefToVisitQuestions('p1', { enabled: false }), { defaultContext: LOCALE_CONTEXT_VALUE })
    await flush()
    view.act(() => view.current.add(item({ ruleId: 'R6', dedupeId: 'coverage', question: null })))
    view.act(() => view.current.add(item()))
    await flush()
    expect(calls.length).toBe(0)
    view.unmount()
  })

  test('does not carry one patient\'s adopted keys over to the next patient', async () => {
    listResult = { data: [{ id: 'q1', patient_id: 'p1', source: 'pre_visit_rule', source_rule_id: 'R5', source_entity_id: 'lab-1', sort_order: 1 }], error: null }
    let patientId = 'p1'
    const view = renderHook(() => useAddBriefToVisitQuestions(patientId, { enabled: true }), { defaultContext: LOCALE_CONTEXT_VALUE })
    await flush()
    expect(view.current.statusOf(item())).toBe('added')
    listResult = { data: [], error: null }
    patientId = 'p2'
    view.rerender()
    // 切換的瞬間（新清單尚未回來）就不能再顯示上一位病人的「已在清單」：此時是 loading（按鈕停用），
    // 新清單回來後才是 available。
    expect(view.current.statusOf(item())).toBe('loading')
    await flush()
    expect(view.current.statusOf(item())).toBe('available')
    view.unmount()
  })
})

describe('buildAdoptedQuestionText', () => {
  test('uses full-width parentheses for zh and ASCII parentheses otherwise', () => {
    expect(buildAdoptedQuestionText(item(), 'zh')).toBe('請與醫師確認：這項血鉀結果是否需要追蹤？（血鉀 2.8 mmol/L，低於參考值。）')
    expect(buildAdoptedQuestionText(item(), 'id')).toBe('Tanyakan kepada dokter: apakah perlu tindak lanjut? (Kalium 2.8 mmol/L di bawah rentang.)')
  })

  test('clamps to the database question length limit', () => {
    const long = buildAdoptedQuestionText(item({ observation: { id: 'x'.repeat(600), zh: '觀'.repeat(600), en: 'y'.repeat(600) } }), 'zh')
    expect(long.length).toBe(VISIT_QUESTION_MAX_LENGTH)
    expect(long.endsWith('…')).toBe(true)
  })
})
