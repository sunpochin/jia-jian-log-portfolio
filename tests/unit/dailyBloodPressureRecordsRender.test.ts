/*
檔案用途：驗證本照護日血壓明細畫面的讀取、修改、刪除與錯誤提示，包含 Demo 與正式資料兩條路徑。
所在層：tests/unit；以最小 hook 執行環境呼叫元件函式，不啟動瀏覽器。
主要關聯：src/features/vitals/components/DailyBloodPressureRecords.tsx、blood_pressure_records RLS 與 demoStorage。
*/
import { beforeEach, describe, expect, mock, test } from 'bun:test'
import { installReactHookHarness, renderHook } from './helpers/reactHookHarness'
import { fire, findAll, findButton, findInput, textContent } from './helpers/elementTree'
import type { BpRecord } from '../../src/types/database'

installReactHookHarness()

// 為什麼不 mock i18n 模組：bun 的 mock.module 是整個測試程序共用的，
// 換掉 useI18n 會讓其他測試檔拿到錯誤的語系實作；改用真的 useI18n，只從 harness 餵入 Provider 值。
const LOCALE_CONTEXT_VALUE = { locale: 'zh' as const, setLocale: () => {} }

type QueryResult = { data?: unknown; error?: unknown }
const calls: Array<{ method: string; args: unknown[] }> = []
let selectResult: QueryResult = { data: [], error: null }
let writeResult: QueryResult = { data: null, error: null }

function createChain(result: () => QueryResult) {
  const chain: Record<string, unknown> = {}
  for (const method of ['select', 'eq', 'gte', 'lt', 'order', 'update', 'delete']) {
    chain[method] = (...args: unknown[]) => { calls.push({ method, args }); return chain }
  }
  // Supabase 的 query builder 是 thenable；用同一個物件回應鏈式呼叫與 await。
  chain.then = (resolve: (value: QueryResult) => unknown, reject: (reason: unknown) => unknown) => Promise.resolve(result()).then(resolve, reject)
  return chain
}

mock.module('../../src/lib/supabase', () => ({
  supabase: {
    from: (table: string) => createChain(() => (calls.some(call => call.method === 'update' || call.method === 'delete') && table === 'blood_pressure_records' && writeIsPending ? writeResult : selectResult)),
  },
}))

let writeIsPending = false

const demo = {
  isDemoMode: false,
  records: [] as BpRecord[],
  updateOk: true,
  deleteOk: true,
}

const actualDemoStorage = await import('../../src/lib/demoStorage')
// 保留其餘匯出：其他模組仍會從同一個 demoStorage 取用展示資料 helper。
mock.module('../../src/lib/demoStorage', () => ({
  ...actualDemoStorage,
  isDemoMode: () => demo.isDemoMode,
  getDemoBpRecordsCreatedBetween: () => demo.records,
  updateDemoBpRecord: () => demo.updateOk,
  deleteDemoBpRecord: () => demo.deleteOk,
}))

const { DailyBloodPressureRecords } = await import('../../src/features/vitals/components/DailyBloodPressureRecords')

// 刪除前的二次確認改用畫面內對話框（useConfirm），不再是 window.confirm；
// 測試改成先按「刪除」開啟對話框，再按對話框裡的「確定」或「取消」。

const bpRecord = (overrides: Partial<BpRecord> = {}): BpRecord => ({
  id: 'bp-1',
  patient_id: 'patient-1',
  systolic: 141,
  diastolic: 69,
  pulse: 75,
  measured_at: '2026-08-14T14:09:00.000Z',
  created_at: '2026-08-14T14:09:00.000Z',
  recorded_by: 'caregiver@example.com',
  source: 'manual_web',
  ...overrides,
})

const flush = () => new Promise(resolve => setTimeout(resolve, 0))

async function renderList(records: BpRecord[], options: { optimisticRecord?: BpRecord | null; onChanged?: () => void } = {}) {
  selectResult = { data: records, error: null }
  const view = renderHook(() => DailyBloodPressureRecords({
    patientId: 'patient-1',
    refreshVersion: 0,
    optimisticRecord: options.optimisticRecord ?? null,
    onChanged: options.onChanged,
  }), { defaultContext: LOCALE_CONTEXT_VALUE })
  await flush()
  return view
}

beforeEach(() => {
  calls.length = 0
  selectResult = { data: [], error: null }
  writeResult = { data: null, error: null }
  writeIsPending = false
  demo.isDemoMode = false
  demo.records = []
  demo.updateOk = true
  demo.deleteOk = true
})

describe('daily blood pressure list rendering', () => {
  test('tells the caregiver the care day is still empty', async () => {
    const view = await renderList([])
    expect(textContent(view.current)).toContain('本照護日還沒有量測紀錄。')
    view.unmount()
  })

  test('lists the care day records with their measured time and both action buttons', async () => {
    const view = await renderList([bpRecord()])
    const rendered = textContent(view.current)
    expect(rendered).toContain('2026/08/14 22:09')
    expect(rendered).toContain('本照護日新增 1 筆')
    expect(findButton(view.current, '修改')).toBeDefined()
    expect(findButton(view.current, '刪除')).toBeDefined()
    view.unmount()
  })

  test('marks a not-yet-synced record and blocks editing it', async () => {
    const view = await renderList([], { optimisticRecord: bpRecord({ id: 'pending-bp-1' }) })
    expect(textContent(view.current)).toContain('同步中…')
    expect(findButton(view.current, '修改').props.disabled).toBe(true)
    expect(findButton(view.current, '刪除').props.disabled).toBe(true)
    view.unmount()
  })

  test('explains a failed read instead of pretending there are no records', async () => {
    selectResult = { data: null, error: new Error('offline') }
    const view = renderHook(() => DailyBloodPressureRecords({ patientId: 'patient-1', refreshVersion: 0 }), { defaultContext: LOCALE_CONTEXT_VALUE })
    await flush()
    expect(textContent(view.current)).toContain('目前無法讀取今天的血壓紀錄。')
    view.unmount()
  })
})

describe('correcting a record', () => {
  test('opens an edit form with bilingual labels prefilled from the record', async () => {
    const view = await renderList([bpRecord()])
    view.act(() => fire(findButton(view.current, '修改'), 'onClick'))
    expect(findInput(view.current, '高壓').props.value).toBe('141')
    expect(findInput(view.current, '低壓').props.value).toBe('69')
    expect(findInput(view.current, '心跳（可不填）').props.value).toBe('75')
    view.unmount()
  })

  test('refuses an impossible correction before it reaches the database', async () => {
    const view = await renderList([bpRecord()])
    view.act(() => fire(findButton(view.current, '修改'), 'onClick'))
    view.act(() => fire(findInput(view.current, '高壓'), 'onChange', { target: { value: '5' } }))
    view.act(() => fire(findButton(view.current, '儲存修改'), 'onClick'))
    await flush()
    expect(textContent(view.current)).toContain('請重新確認高壓、低壓，以及有填寫時的心跳數字。')
    expect(calls.some(call => call.method === 'update')).toBe(false)
    view.unmount()
  })

  test('saves a valid correction and lets the caller refresh its quota', async () => {
    let changed = 0
    const view = await renderList([bpRecord()], { onChanged: () => { changed += 1 } })
    view.act(() => fire(findButton(view.current, '修改'), 'onClick'))
    view.act(() => fire(findInput(view.current, '高壓'), 'onChange', { target: { value: '132' } }))
    view.act(() => fire(findInput(view.current, '心跳（可不填）'), 'onChange', { target: { value: '' } }))
    view.act(() => fire(findButton(view.current, '儲存修改'), 'onClick'))
    await flush()
    expect(calls.find(call => call.method === 'update')?.args[0]).toEqual({ systolic: 132, diastolic: 69, pulse: null })
    expect(textContent(view.current)).toContain('血壓紀錄已更新。')
    expect(changed).toBe(1)
    view.unmount()
  })

  test('keeps the edit form open when the update fails', async () => {
    const view = await renderList([bpRecord()])
    view.act(() => fire(findButton(view.current, '修改'), 'onClick'))
    writeIsPending = true
    writeResult = { data: null, error: new Error('network down') }
    view.act(() => fire(findButton(view.current, '儲存修改'), 'onClick'))
    await flush()
    expect(textContent(view.current)).toContain('無法更新紀錄，請確認網路後再試。')
    expect(findInput(view.current, '高壓')).toBeDefined()
    view.unmount()
  })

  test('cancelling leaves the record untouched', async () => {
    const view = await renderList([bpRecord()])
    view.act(() => fire(findButton(view.current, '修改'), 'onClick'))
    view.act(() => fire(findButton(view.current, '取消'), 'onClick'))
    expect(findAll(view.current, element => element.type === 'input')).toHaveLength(0)
    view.unmount()
  })
})

describe('deleting a record', () => {
  test('asks before releasing the daily quota', async () => {
    const view = await renderList([bpRecord()])
    view.act(() => fire(findButton(view.current, '刪除'), 'onClick'))
    view.act(() => fire(findButton(view.current, '取消'), 'onClick'))
    await flush()
    expect(calls.some(call => call.method === 'delete')).toBe(false)
    view.unmount()
  })

  test('confirms the deletion and reports it', async () => {
    let changed = 0
    const view = await renderList([bpRecord()], { onChanged: () => { changed += 1 } })
    view.act(() => fire(findButton(view.current, '刪除'), 'onClick'))
    view.act(() => fire(findButton(view.current, '確定'), 'onClick'))
    await flush()
    expect(calls.some(call => call.method === 'delete')).toBe(true)
    expect(textContent(view.current)).toContain('血壓紀錄已刪除。')
    expect(changed).toBe(1)
    view.unmount()
  })

  test('explains a failed deletion', async () => {
    const view = await renderList([bpRecord()])
    writeIsPending = true
    writeResult = { data: null, error: new Error('network down') }
    view.act(() => fire(findButton(view.current, '刪除'), 'onClick'))
    view.act(() => fire(findButton(view.current, '確定'), 'onClick'))
    await flush()
    expect(textContent(view.current)).toContain('無法刪除紀錄，請確認網路後再試。')
    view.unmount()
  })
})

describe('demo mode', () => {
  test('lists only the records the visitor added in this demo session', async () => {
    demo.isDemoMode = true
    demo.records = [bpRecord({ id: 'demo-bp-1', systolic: 120, diastolic: 78 })]
    const view = renderHook(() => DailyBloodPressureRecords({ patientId: 'patient-1', refreshVersion: 0 }), { defaultContext: LOCALE_CONTEXT_VALUE })
    await flush()
    expect(textContent(view.current)).toContain('本照護日新增 1 筆')
    expect(calls.some(call => call.method === 'select')).toBe(false)
    view.unmount()
  })

  test('reports a demo record that can no longer be found', async () => {
    demo.isDemoMode = true
    demo.records = [bpRecord({ id: 'demo-bp-1' })]
    demo.updateOk = false
    demo.deleteOk = false
    const view = renderHook(() => DailyBloodPressureRecords({ patientId: 'patient-1', refreshVersion: 0 }), { defaultContext: LOCALE_CONTEXT_VALUE })
    await flush()

    view.act(() => fire(findButton(view.current, '修改'), 'onClick'))
    view.act(() => fire(findButton(view.current, '儲存修改'), 'onClick'))
    await flush()
    expect(textContent(view.current)).toContain('無法更新紀錄，請確認網路後再試。')

    // 更新失敗時編輯表單必須留著讓照護者重試；要先取消才會回到有刪除鈕的檢視。
    view.act(() => fire(findButton(view.current, '取消'), 'onClick'))
    view.act(() => fire(findButton(view.current, '刪除'), 'onClick'))
    view.act(() => fire(findButton(view.current, '確定'), 'onClick'))
    await flush()
    expect(textContent(view.current)).toContain('無法刪除紀錄，請確認網路後再試。')
    view.unmount()
  })
})
