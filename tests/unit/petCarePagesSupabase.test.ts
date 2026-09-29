/*
檔案用途：驗證五個寵物照護頁面的正式 Supabase 讀寫路徑與失敗回饋。
所在層：tests/unit；用可追蹤的 query chain mock 取代資料庫，覆蓋新增／更新、空值與錯誤分支。
主要關聯：src/features/pet-care/pages、Supabase pet_* tables、record_pet_endocrine RPC 與 React hook harness。
*/
import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test'
import { installReactHookHarness, renderHook } from './helpers/reactHookHarness'
import { fire, findAll, findButton, textContent } from './helpers/elementTree'

installReactHookHarness()

type QueryResult = { data: unknown; error: unknown }
type Write = { table: string; operation: 'insert' | 'update'; payload: unknown }

const readResults: Record<string, QueryResult> = {}
let writeResult: QueryResult = { data: null, error: null }
let rpcResult: { error: unknown } = { error: null }
const writes: Write[] = []
const rpcCalls: Array<{ name: string; args: unknown }> = []

function resultFor(table: string, mode: 'read' | 'write'): QueryResult {
  return mode === 'write' ? writeResult : (readResults[table] ?? { data: [], error: null })
}

const supabase = {
  from(table: string) {
    let mode: 'read' | 'write' = 'read'
    const chain: Record<string, (...args: unknown[]) => unknown> = {}
    chain.select = (..._args) => chain
    chain.eq = (..._args) => chain
    chain.gte = (..._args) => chain
    chain.lte = (..._args) => chain
    chain.lt = (..._args) => chain
    chain.order = (..._args) => chain
    chain.insert = (payload: unknown) => {
      mode = 'write'
      writes.push({ table, operation: 'insert', payload })
      return chain
    }
    chain.update = (payload: unknown) => {
      mode = 'write'
      writes.push({ table, operation: 'update', payload })
      return chain
    }
    chain.maybeSingle = () => Promise.resolve(resultFor(table, mode))
    chain.single = () => Promise.resolve(resultFor(table, mode))
    // 為什麼保留 thenable：頁面有些查詢以 order 結尾、有些寫入以 insert 結尾，兩者都直接 await chain。
    chain.then = (onFulfilled?: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) => Promise.resolve(resultFor(table, mode)).then(onFulfilled, onRejected)
    return chain
  },
  rpc(name: string, args: unknown) {
    rpcCalls.push({ name, args })
    return Promise.resolve(rpcResult)
  },
}

mock.module('../../src/lib/supabase', () => ({ supabase }))

const { PetAppetitePage } = await import('../../src/features/pet-care/pages/PetAppetitePage')
const { PetDigestionPage } = await import('../../src/features/pet-care/pages/PetDigestionPage')
const { PetFluidTherapyPage } = await import('../../src/features/pet-care/pages/PetFluidTherapyPage')
const { PetLiquidIntakePage } = await import('../../src/features/pet-care/pages/PetLiquidIntakePage')
const { PetEndocrinePage } = await import('../../src/features/pet-care/pages/PetEndocrinePage')

const context = { locale: 'zh' as const, setLocale: () => undefined }
const props = { patientId: 'patient-formal', userEmail: 'CARE@EXAMPLE.COM' }
const flush = () => new Promise(resolve => setTimeout(resolve, 0))

function resetResults() {
  for (const key of Object.keys(readResults)) delete readResults[key]
  Object.assign(readResults, {
    pet_appetite_records: { data: [], error: null },
    pet_digestion_records: { data: null, error: null },
    pet_liquid_intake_records: { data: null, error: null },
    pet_subcutaneous_fluid_records: { data: [], error: null },
    pet_insulin_records: { data: [], error: null },
    pet_blood_glucose_records: { data: [], error: null },
    pet_blood_glucose_target_ranges: { data: null, error: null },
  })
  writeResult = { data: null, error: null }
  rpcResult = { error: null }
  writes.length = 0
  rpcCalls.length = 0
}

function form(node: unknown) {
  const found = findAll(node, element => element.type === 'form')[0]
  if (!found) throw new Error('Expected page form')
  return found
}

function input(node: unknown, placeholder: string) {
  const found = findAll(node, element => element.type === 'input' && element.props.placeholder === placeholder)[0]
  if (!found) throw new Error(`Expected input ${placeholder}`)
  return found
}

beforeEach(() => {
  resetResults()
  if (typeof globalThis.window !== 'undefined') {
    delete (globalThis as { window?: unknown }).window
  }
})

afterAll(() => {
  // 本檔只 mock module，不改寫 window；保留這個明確結束點讓未來擴充瀏覽器 fixture 時不會遺漏清理。
})

describe('formal Supabase pet-care pages', () => {
  test('saves appetite input and reloads today records', async () => {
    const view = renderHook(() => PetAppetitePage(props), { defaultContext: context })
    await flush()
    view.act(() => fire(input(view.current, '50'), 'onChange', { target: { value: '105' } }))
    view.act(() => fire(form(view.current), 'onSubmit', { preventDefault: () => undefined }))
    await flush()
    expect(writes[0]).toMatchObject({ table: 'pet_appetite_records', operation: 'insert', payload: { appetite_percent: 100, recorded_by: 'care@example.com' } })
    expect(textContent(view.current)).toContain('已儲存。')
    view.unmount()
  })

  test('shows appetite load and save errors, and ignores submit without an email', async () => {
    readResults.pet_appetite_records = { data: null, error: new Error('load failed') }
    const view = renderHook(() => PetAppetitePage({ patientId: props.patientId }), { defaultContext: context })
    await flush()
    view.act(() => fire(form(view.current), 'onSubmit', { preventDefault: () => undefined }))
    expect(writes).toEqual([])
    view.unmount()

    resetResults()
    writeResult = { data: null, error: new Error('save failed') }
    const savingView = renderHook(() => PetAppetitePage(props), { defaultContext: context })
    await flush()
    view.act(() => fire(input(savingView.current, '50'), 'onChange', { target: { value: '40' } }))
    view.act(() => fire(form(savingView.current), 'onSubmit', { preventDefault: () => undefined }))
    await flush()
    expect(textContent(savingView.current)).toContain('暫時無法儲存')
    savingView.unmount()
  })

  test('requires an appetite percentage before saving', async () => {
    const view = renderHook(() => PetAppetitePage(props), { defaultContext: context })
    await flush()
    view.act(() => fire(form(view.current), 'onSubmit', { preventDefault: () => undefined }))
    expect(textContent(view.current)).toContain('請輸入進食比例')
    expect(writes).toEqual([])
    view.unmount()
  })

  test('creates and updates a digestion record through the same daily row contract', async () => {
    const view = renderHook(() => PetDigestionPage(props), { defaultContext: context })
    await flush()
    view.act(() => fire(input(view.current, '例：1'), 'onChange', { target: { value: '2' } }))
    view.act(() => fire(form(view.current), 'onSubmit', { preventDefault: () => undefined }))
    await flush()
    expect(writes[0]).toMatchObject({ table: 'pet_digestion_records', operation: 'insert', payload: { defecation_count: 2, recorded_by: 'care@example.com' } })
    view.unmount()

    resetResults()
    const existing = { id: 'digestion-1', defecation_count: 1, vomiting_count: 0, stool_score: 3, created_at: '2026-09-09T00:00:00Z' }
    readResults.pet_digestion_records = { data: existing, error: null }
    writeResult = { data: { ...existing, defecation_count: 3 }, error: null }
    const updateView = renderHook(() => PetDigestionPage(props), { defaultContext: context })
    await flush()
    updateView.act(() => fire(input(updateView.current, '例：1'), 'onChange', { target: { value: '3' } }))
    updateView.act(() => fire(form(updateView.current), 'onSubmit', { preventDefault: () => undefined }))
    await flush()
    expect(writes[0]).toMatchObject({ table: 'pet_digestion_records', operation: 'update', payload: { defecation_count: 3 } })
    updateView.unmount()
  })

  test('shows digestion validation and database errors', async () => {
    const view = renderHook(() => PetDigestionPage(props), { defaultContext: context })
    await flush()
    view.act(() => fire(form(view.current), 'onSubmit', { preventDefault: () => undefined }))
    expect(textContent(view.current)).toContain('請至少輸入一個值')
    view.unmount()

    resetResults()
    writeResult = { data: null, error: new Error('save failed') }
    const errorView = renderHook(() => PetDigestionPage(props), { defaultContext: context })
    await flush()
    errorView.act(() => fire(input(errorView.current, '例：1'), 'onChange', { target: { value: '1' } }))
    errorView.act(() => fire(form(errorView.current), 'onSubmit', { preventDefault: () => undefined }))
    await flush()
    expect(textContent(errorView.current)).toContain('暫時無法儲存')
    errorView.unmount()
  })

  test('shows a safe empty-state message when digestion loading fails', async () => {
    readResults.pet_digestion_records = { data: null, error: new Error('load failed') }
    const view = renderHook(() => PetDigestionPage(props), { defaultContext: context })
    await flush()
    expect(textContent(view.current)).toContain('暫時無法讀取資料')
    view.unmount()
  })

  test('saves fluid therapy and renders the selected site in today records', async () => {
    const view = renderHook(() => PetFluidTherapyPage(props), { defaultContext: context })
    await flush()
    view.act(() => fire(input(view.current, '例：200'), 'onChange', { target: { value: '200' } }))
    const select = findAll(view.current, element => element.type === 'select')[0]
    if (!select) throw new Error('Expected injection-site selector')
    // 新紀錄只能選到 neck_only；舊 key 'neck'（當年印尼文標籤是「頸部／鼠蹊」）不再是可選項（issue #928）。
    const optionValues = findAll(select, element => element.type === 'option').map(option => option.props.value)
    expect(optionValues).toEqual(['', 'neck_only', 'abdomen', 'flank'])
    view.act(() => fire(select, 'onChange', { target: { value: 'neck_only' } }))
    view.act(() => fire(form(view.current), 'onSubmit', { preventDefault: () => undefined }))
    await flush()
    expect(writes[0]).toMatchObject({ table: 'pet_subcutaneous_fluid_records', payload: { fluid_volume_ml: 200, injection_site: 'neck_only', administered_by: 'care@example.com' } })
    view.unmount()
  })

  test('keeps legacy neck records visibly ambiguous while new neck_only records read as neck', async () => {
    // 舊 'neck' 紀錄可能是印尼文使用者在鼠蹊注射時存的，事後無法分辨；不能顯示成「確定是頸部」（PR #934 Codex review）。
    readResults.pet_subcutaneous_fluid_records = {
      data: [
        { id: 'fluid-legacy', fluid_volume_ml: 100, injection_site: 'neck', administered_at: '2026-09-09T01:00:00Z' },
        { id: 'fluid-new', fluid_volume_ml: 120, injection_site: 'neck_only', administered_at: '2026-09-09T02:00:00Z' },
      ],
      error: null,
    }
    const view = renderHook(() => PetFluidTherapyPage(props), { defaultContext: context })
    await flush()
    const rendered = textContent(view.current)
    expect(rendered).toContain('頸部或鼠蹊（舊紀錄）')
    expect(rendered).toContain('頸部120 ml')
    view.unmount()
  })

  test('renders the flank injection-site label from a loaded record', async () => {
    readResults.pet_subcutaneous_fluid_records = {
      data: [{ id: 'fluid-1', fluid_volume_ml: 150, injection_site: 'flank', administered_at: '2026-09-09T01:00:00Z' }],
      error: null,
    }
    const view = renderHook(() => PetFluidTherapyPage(props), { defaultContext: context })
    await flush()
    expect(textContent(view.current)).toContain('側腰')
    view.unmount()
  })

  test('handles fluid load and save errors plus missing input', async () => {
    readResults.pet_subcutaneous_fluid_records = { data: null, error: new Error('load failed') }
    const view = renderHook(() => PetFluidTherapyPage(props), { defaultContext: context })
    await flush()
    view.act(() => fire(form(view.current), 'onSubmit', { preventDefault: () => undefined }))
    expect(textContent(view.current)).toContain('請輸入液體體積')
    view.unmount()

    resetResults()
    writeResult = { data: null, error: new Error('save failed') }
    const errorView = renderHook(() => PetFluidTherapyPage(props), { defaultContext: context })
    await flush()
    errorView.act(() => fire(input(errorView.current, '例：200'), 'onChange', { target: { value: '200' } }))
    errorView.act(() => fire(form(errorView.current), 'onSubmit', { preventDefault: () => undefined }))
    await flush()
    expect(textContent(errorView.current)).toContain('暫時無法儲存')
    errorView.unmount()
  })

  test('creates and updates the one-liquid-row-per-day record', async () => {
    const view = renderHook(() => PetLiquidIntakePage(props), { defaultContext: context })
    await flush()
    view.act(() => fire(input(view.current, '例：250'), 'onChange', { target: { value: '250' } }))
    view.act(() => fire(form(view.current), 'onSubmit', { preventDefault: () => undefined }))
    await flush()
    expect(writes[0]).toMatchObject({ table: 'pet_liquid_intake_records', operation: 'insert', payload: { water_intake_ml: 250, recorded_by: 'care@example.com' } })
    view.unmount()

    resetResults()
    const existing = { id: 'liquid-1', water_intake_ml: 100, urination_count: 2, litter_box_urine_clumps: null, created_at: '2026-09-09T00:00:00Z' }
    readResults.pet_liquid_intake_records = { data: existing, error: null }
    writeResult = { data: { ...existing, water_intake_ml: 300 }, error: null }
    const updateView = renderHook(() => PetLiquidIntakePage(props), { defaultContext: context })
    await flush()
    updateView.act(() => fire(input(updateView.current, '例：250'), 'onChange', { target: { value: '300' } }))
    updateView.act(() => fire(form(updateView.current), 'onSubmit', { preventDefault: () => undefined }))
    await flush()
    expect(writes[0]).toMatchObject({ table: 'pet_liquid_intake_records', operation: 'update', payload: { water_intake_ml: 300 } })
    updateView.unmount()
  })

  test('handles liquid load/save errors and empty validation', async () => {
    readResults.pet_liquid_intake_records = { data: null, error: new Error('load failed') }
    const view = renderHook(() => PetLiquidIntakePage(props), { defaultContext: context })
    await flush()
    view.act(() => fire(form(view.current), 'onSubmit', { preventDefault: () => undefined }))
    expect(textContent(view.current)).toContain('請至少輸入一個值')
    view.unmount()

    resetResults()
    writeResult = { data: null, error: new Error('save failed') }
    const errorView = renderHook(() => PetLiquidIntakePage(props), { defaultContext: context })
    await flush()
    errorView.act(() => fire(input(errorView.current, '例：250'), 'onChange', { target: { value: '250' } }))
    errorView.act(() => fire(form(errorView.current), 'onSubmit', { preventDefault: () => undefined }))
    await flush()
    expect(textContent(errorView.current)).toContain('暫時無法儲存')
    errorView.unmount()
  })

  test('loads endocrine rows and saves both values atomically through the RPC', async () => {
    readResults.pet_insulin_records = { data: [{ id: 'insulin-1', insulin_units: 2 }], error: null }
    readResults.pet_blood_glucose_records = { data: [{ id: 'glucose-1', glucose_mg_dl: 100 }], error: null }
    readResults.pet_blood_glucose_target_ranges = { data: { low_mg_dl: 80, high_mg_dl: 120 }, error: null }
    const view = renderHook(() => PetEndocrinePage({ ...props, patientName: 'Mimi', careRecipientType: 'cat' }), { defaultContext: context })
    await flush()
    view.act(() => fire(input(view.current, '例：5'), 'onChange', { target: { value: '5' } }))
    view.act(() => fire(input(view.current, '例：110'), 'onChange', { target: { value: '110' } }))
    view.act(() => fire(form(view.current), 'onSubmit', { preventDefault: () => undefined }))
    await flush()
    expect(rpcCalls).toEqual([{ name: 'record_pet_endocrine', args: { p_patient_id: props.patientId, p_insulin_units: 5, p_glucose_mg_dl: 110 } }])
    expect(textContent(view.current)).toContain('已儲存。')
    view.unmount()
  })

  test('keeps endocrine query errors visible only as a safe empty state and validates input', async () => {
    readResults.pet_insulin_records = { data: [], error: new Error('insulin load failed') }
    readResults.pet_blood_glucose_records = { data: [], error: new Error('glucose load failed') }
    readResults.pet_blood_glucose_target_ranges = { data: null, error: new Error('target load failed') }
    const view = renderHook(() => PetEndocrinePage(props), { defaultContext: context })
    await flush()
    view.act(() => fire(form(view.current), 'onSubmit', { preventDefault: () => undefined }))
    expect(textContent(view.current)).toContain('請至少輸入一個值')
    view.act(() => fire(input(view.current, '例：5'), 'onChange', { target: { value: '0' } }))
    view.act(() => fire(form(view.current), 'onSubmit', { preventDefault: () => undefined }))
    expect(textContent(view.current)).toContain('數值必須大於 0')
    view.unmount()

    resetResults()
    rpcResult = { error: new Error('rpc failed') }
    const errorView = renderHook(() => PetEndocrinePage(props), { defaultContext: context })
    await flush()
    errorView.act(() => fire(input(errorView.current, '例：110'), 'onChange', { target: { value: '100' } }))
    errorView.act(() => fire(form(errorView.current), 'onSubmit', { preventDefault: () => undefined }))
    await flush()
    expect(textContent(errorView.current)).toContain('暫時無法儲存')
    errorView.unmount()
  })
})
