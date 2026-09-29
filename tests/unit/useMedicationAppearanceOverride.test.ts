/*
檔案用途：驗證修正外觀面板（issue #759）的三個 code review 迴歸——
  (1) 預填共用照片／備註而不是留空，(2) 讀取範圍失敗時擋下 save()／restoreShared()、不讓半套狀態寫進去，
  (3) 存檔／還原成功後通知父層重抓，讓排藥卡片與今日藥卡立刻反映新外觀。
所在層：tests/unit；以 reactHookHarness 執行 hook，用鏈式 query mock 隔離遠端資料庫。
主要關聯：src/features/medication/hooks/useMedicationAppearanceOverride.ts、
  src/lib/medication/medicationAppearanceOverrides.ts。
*/
import { beforeEach, describe, expect, mock, test } from 'bun:test'
import { installReactHookHarness, renderHook } from './helpers/reactHookHarness'
import type { MedicationOption } from '../../src/lib/medication/medicationAdmin'

installReactHookHarness()

type Response = { data?: unknown; error?: unknown }
const calls: Array<{ table: string; method: string; args: unknown[] }> = []
let overridesListResponse: Response = { data: [], error: null }
let upsertResponse: Response = { data: null, error: null }
let deleteResponse: Response = { error: null }
let usageResponse: Response = { data: [], error: null }

function query(table: string) {
  // 同一條 chain 最後走哪個分支（純讀取／upsert／delete）決定 .then() 該回哪個排隊中的回應。
  let kind: 'select' | 'upsert' | 'delete' = 'select'
  const record = (method: string, ...args: unknown[]) => calls.push({ table, method, args })
  const chain: Record<string, (...args: unknown[]) => unknown> = {}
  for (const method of ['select', 'eq']) {
    chain[method] = (...args: unknown[]) => { record(method, ...args); return chain }
  }
  chain.upsert = (...args: unknown[]) => { record('upsert', ...args); kind = 'upsert'; return chain }
  chain.delete = (...args: unknown[]) => { record('delete', ...args); kind = 'delete'; return chain }
  chain.single = () => Promise.resolve(upsertResponse)
  chain.then = (resolve: (value: Response) => unknown, reject?: (reason: unknown) => unknown) =>
    Promise.resolve(kind === 'delete' ? deleteResponse : overridesListResponse).then(resolve, reject)
  return chain
}

const supabase = {
  from(table: string) { return query(table) },
  rpc(name: string, args: unknown) { calls.push({ table: 'rpc', method: name, args: [args] }); return Promise.resolve(usageResponse) },
}

mock.module('../../src/lib/supabase', () => ({ supabase }))

const { useMedicationAppearanceOverride } = await import('../../src/features/medication/hooks/useMedicationAppearanceOverride')

const flush = () => new Promise(resolve => setTimeout(resolve, 0))

const medication: MedicationOption = {
  id: 'med-1', drug_product_id: null, brand_name: 'Panadol', brand_name_zh: '普拿疼', generic_name: 'Paracetamol',
  strength_mg: 500, dosage_form: 'tablet', specialties: [], verification_status: 'unverified',
  tfda_license_number: null, nhi_drug_code: null,
  appearance_note: '藥局附的說明', appearance_color: 'white', appearance_shape: 'round',
  appearance_photo_url: 'medication-appearance-photos/photos/shared.webp',
  catalog_source: null, catalog_source_id: null,
}

beforeEach(() => {
  calls.length = 0
  overridesListResponse = { data: [], error: null }
  upsertResponse = { data: null, error: null }
  deleteResponse = { error: null }
  // 情境 B：這顆藥還有其他家庭在用，還沒有任何一筆覆蓋列。
  usageResponse = { data: [{ medication_id: 'med-1', shared_with_others: true, all_managed_by_caller: false }], error: null }
})

describe('useMedicationAppearanceOverride 表單預填（迴歸：漏填共用照片／備註）', () => {
  test('尚無覆蓋列時，照片與備註要退回共用藥品目前的值，不是留空', async () => {
    const hook = renderHook(() => useMedicationAppearanceOverride('patient-1', medication, true))
    await flush()

    expect(hook.current.scenario).toBe('shared_with_others')
    expect(hook.current.color).toBe('white')
    expect(hook.current.shape).toBe('round')
    expect(hook.current.photoUrl).toBe('medication-appearance-photos/photos/shared.webp')
    expect(hook.current.note).toBe('藥局附的說明')
  })

  test('照著預填值 save() 不會把共用資料的照片／備註送成 null', async () => {
    const hook = renderHook(() => useMedicationAppearanceOverride('patient-1', medication, true))
    await flush()

    await hook.act(() => { hook.current.setColor('yellow') })
    let saved = false
    await hook.act(() => { void hook.current.save().then(result => { saved = result }) })
    await flush()

    expect(saved).toBe(true)
    const upsertCall = calls.find(call => call.method === 'upsert')
    expect(upsertCall?.args[0]).toMatchObject({
      appearance_color: 'yellow',
      appearance_photo_url: 'medication-appearance-photos/photos/shared.webp',
      appearance_note: '藥局附的說明',
    })
  })

  test('還原成共用外觀後，照片與備註同樣退回共用值，不是清空', async () => {
    // 先讓 hook 看到已有一筆覆蓋列。
    overridesListResponse = {
      data: [{ patient_id: 'patient-1', medication_id: 'med-1', appearance_color: 'yellow', appearance_shape: null, appearance_photo_url: 'photos/override.webp', appearance_note: '這人的備註', updated_by: 'caregiver02884@example.test', updated_at: '2026-09-15T00:00:00.000Z' }],
      error: null,
    }
    const hook = renderHook(() => useMedicationAppearanceOverride('patient-1', medication, true))
    await flush()
    expect(hook.current.existingOverride).not.toBeNull()

    let restored = false
    await hook.act(() => { void hook.current.restoreShared().then(result => { restored = result }) })
    await flush()

    expect(restored).toBe(true)
    expect(hook.current.existingOverride).toBeNull()
    expect(hook.current.color).toBe('white')
    expect(hook.current.photoUrl).toBe('medication-appearance-photos/photos/shared.webp')
    expect(hook.current.note).toBe('藥局附的說明')
  })
})

describe('useMedicationAppearanceOverride 讀取失敗時擋下送出（code review 抓到的問題）', () => {
  test('讀取範圍失敗時設定 loadError，save()／restoreShared() 直接回傳 false 且不呼叫 Supabase', async () => {
    usageResponse = { data: null, error: new Error('network down') }
    const hook = renderHook(() => useMedicationAppearanceOverride('patient-1', medication, true))
    await flush()

    expect(hook.current.loadError).not.toBeNull()
    calls.length = 0

    let saveResult: boolean | undefined
    await hook.act(() => { void hook.current.save().then(result => { saveResult = result }) })
    await flush()
    expect(saveResult).toBe(false)

    let restoreResult: boolean | undefined
    await hook.act(() => { void hook.current.restoreShared().then(result => { restoreResult = result }) })
    await flush()
    expect(restoreResult).toBe(false)

    // 兩次呼叫都必須在進資料層之前就被擋下；不能靠「剛好回應是空的」蒙混過去。
    expect(calls).toEqual([])
  })
})

describe('useMedicationAppearanceOverride 寫入失敗時顯示錯誤，而不是假裝已存檔', () => {
  test('save() 的 upsert 失敗時回傳 false 並顯示重試訊息，不呼叫 onChanged', async () => {
    upsertResponse = { data: null, error: new Error('write failed') }
    let changedCount = 0
    const hook = renderHook(() => useMedicationAppearanceOverride('patient-1', medication, true, () => { changedCount += 1 }))
    await flush()

    let saveResult: boolean | undefined
    await hook.act(() => { void hook.current.save().then(result => { saveResult = result }) })
    await flush()

    expect(saveResult).toBe(false)
    expect(hook.current.status?.zh).toContain('儲存失敗')
    expect(changedCount).toBe(0)
  })

  test('restoreShared() 的 delete 失敗時回傳 false 並顯示重試訊息，不清空既有覆蓋', async () => {
    overridesListResponse = {
      data: [{ patient_id: 'patient-1', medication_id: 'med-1', appearance_color: 'yellow', appearance_shape: null, appearance_photo_url: null, appearance_note: null, updated_by: 'caregiver@example.test', updated_at: '2026-09-15T00:00:00.000Z' }],
      error: null,
    }
    deleteResponse = { error: new Error('delete failed') }
    let changedCount = 0
    const hook = renderHook(() => useMedicationAppearanceOverride('patient-1', medication, true, () => { changedCount += 1 }))
    await flush()
    expect(hook.current.existingOverride).not.toBeNull()

    let restoreResult: boolean | undefined
    await hook.act(() => { void hook.current.restoreShared().then(result => { restoreResult = result }) })
    await flush()

    expect(restoreResult).toBe(false)
    expect(hook.current.status?.zh).toContain('還原失敗')
    expect(hook.current.existingOverride).not.toBeNull()
    expect(changedCount).toBe(0)
  })
})

describe('useMedicationAppearanceOverride 存檔／還原後通知父層重抓（code review 抓到的問題）', () => {
  test('save() 成功後呼叫 onChanged，讓排藥卡片與今日藥卡不用等整頁重整就看到新外觀', async () => {
    let changedCount = 0
    const hook = renderHook(() => useMedicationAppearanceOverride('patient-1', medication, true, () => { changedCount += 1 }))
    await flush()

    await hook.act(() => { void hook.current.save() })
    await flush()

    expect(changedCount).toBe(1)
  })

  test('restoreShared() 成功後也呼叫 onChanged', async () => {
    overridesListResponse = {
      data: [{ patient_id: 'patient-1', medication_id: 'med-1', appearance_color: 'yellow', appearance_shape: null, appearance_photo_url: null, appearance_note: null, updated_by: 'caregiver@example.test', updated_at: '2026-09-15T00:00:00.000Z' }],
      error: null,
    }
    let changedCount = 0
    const hook = renderHook(() => useMedicationAppearanceOverride('patient-1', medication, true, () => { changedCount += 1 }))
    await flush()

    await hook.act(() => { void hook.current.restoreShared() })
    await flush()

    expect(changedCount).toBe(1)
  })
})
