/*
檔案用途：驗證五個寵物慢性病頁面的輸入、儲存回饋與趨勢區塊掛載。
所在層：tests/unit；用 React hook harness 取代瀏覽器，走 Demo adapter 的實際頁面互動路徑。
主要關聯：src/features/pet-care/pages、demoStorage 與 ModuleTrendSection。
*/
import { afterAll, beforeEach, describe, expect, test } from 'bun:test'
import { installReactHookHarness, renderHook } from './helpers/reactHookHarness'
import { fire, findAll, findButton, textContent } from './helpers/elementTree'
import {
  readDemoPetAppetiteRecords,
  readDemoPetDigestionRecord,
  readDemoPetFluidRecords,
  readDemoPetGlucoseRecords,
  readDemoPetInsulinRecords,
  readDemoPetLiquidIntakeRecord,
} from '../../src/lib/demoStorage'

installReactHookHarness()

const LOCALE_CONTEXT_VALUE = { locale: 'zh' as const, setLocale: () => {} }
const PATIENT_ID = 'pet-render-test'
const USER_EMAIL = 'Caregiver@example.com'

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

// 使用真正的 Demo adapter 而不 mock module：Bun 多檔測試可能共享 mock，會把 isDemoMode 或假資料漏給其他測試。
// 假 window 只存在於本檔測試期間，既能驗證頁面實際存讀，也能保持病人資料留在本地 Map。
beforeEach(() => {
  demoValues.clear()
  globalThis.window = demoWindow
})

afterAll(() => {
  if (originalWindow) globalThis.window = originalWindow
  else delete (globalThis as { window?: Window & typeof globalThis }).window
})

const { PetLiquidIntakePage } = await import('../../src/features/pet-care/pages/PetLiquidIntakePage')
const { PetDigestionPage } = await import('../../src/features/pet-care/pages/PetDigestionPage')
const { PetAppetitePage } = await import('../../src/features/pet-care/pages/PetAppetitePage')
const { PetFluidTherapyPage } = await import('../../src/features/pet-care/pages/PetFluidTherapyPage')
const { PetEndocrinePage } = await import('../../src/features/pet-care/pages/PetEndocrinePage')

const PAGE_PROPS = { patientId: PATIENT_ID, userEmail: USER_EMAIL }

const flush = () => new Promise(resolve => setTimeout(resolve, 0))

function findPlaceholder(node: unknown, placeholder: string) {
  const field = findAll(node, element => element.type === 'input' && element.props.placeholder === placeholder)[0]
  if (!field) throw new Error(`Input with placeholder "${placeholder}" is not on screen.`)
  return field
}

function findForm(node: unknown) {
  const form = findAll(node, element => element.type === 'form')[0]
  if (!form) throw new Error('Form is not on screen.')
  return form
}

function findTrendSection(node: unknown, moduleId: string) {
  const section = findAll(node, element => element.props.moduleId === moduleId)[0]
  if (!section) throw new Error(`Trend section "${moduleId}" is not on screen.`)
  return section
}

describe('pet chronic-care page rendering', () => {
  test('液體管理頁可輸入、儲存，並保留歷史趨勢區塊', async () => {
    const view = renderHook(() => PetLiquidIntakePage(PAGE_PROPS), { defaultContext: LOCALE_CONTEXT_VALUE })
    await flush()

    view.act(() => fire(findPlaceholder(view.current, '例：250'), 'onChange', { target: { value: '250' } }))
    view.act(() => fire(findForm(view.current), 'onSubmit', { preventDefault: () => {} }))
    await flush()

    const saved = readDemoPetLiquidIntakeRecord(PATIENT_ID)
    expect(saved?.water_intake_ml).toBe(250)
    expect(saved?.recorded_by).toBe(USER_EMAIL.toLowerCase())
    expect(textContent(view.current)).toContain('已儲存。')
    expect(findTrendSection(view.current, 'petLiquidIntake')).toBeDefined()
    view.unmount()
  })

  test('消化健康頁可儲存排便次數並顯示今天的紀錄', async () => {
    const view = renderHook(() => PetDigestionPage(PAGE_PROPS), { defaultContext: LOCALE_CONTEXT_VALUE })
    await flush()

    view.act(() => fire(findPlaceholder(view.current, '例：1'), 'onChange', { target: { value: '1' } }))
    view.act(() => fire(findForm(view.current), 'onSubmit', { preventDefault: () => {} }))
    await flush()

    expect(readDemoPetDigestionRecord(PATIENT_ID)?.defecation_count).toBe(1)
    expect(textContent(view.current)).toContain('已儲存。')
    expect(findTrendSection(view.current, 'petDigestion')).toBeDefined()
    view.unmount()
  })

  test('食慾頁會保存選定餐次與進食比例', async () => {
    const view = renderHook(() => PetAppetitePage(PAGE_PROPS), { defaultContext: LOCALE_CONTEXT_VALUE })
    await flush()

    view.act(() => fire(findButton(view.current, '午餐'), 'onClick'))
    view.act(() => fire(findPlaceholder(view.current, '50'), 'onChange', { target: { value: '65' } }))
    view.act(() => fire(findForm(view.current), 'onSubmit', { preventDefault: () => {} }))
    await flush()

    const saved = readDemoPetAppetiteRecords(PATIENT_ID, '2026-01-01T00:00:00.000Z')
    expect(saved[0]?.meal_type).toBe('lunch')
    expect(saved[0]?.appetite_percent).toBe(65)
    expect(textContent(view.current)).toContain('已儲存。')
    expect(findTrendSection(view.current, 'petAppetite')).toBeDefined()
    view.unmount()
  })

  test('皮下點滴頁會保存體積與注射部位', async () => {
    const view = renderHook(() => PetFluidTherapyPage(PAGE_PROPS), { defaultContext: LOCALE_CONTEXT_VALUE })
    await flush()

    view.act(() => fire(findPlaceholder(view.current, '例：200'), 'onChange', { target: { value: '200' } }))
    const select = findAll(view.current, element => element.type === 'select')[0]
    if (!select) throw new Error('Injection-site selector is not on screen.')
    view.act(() => fire(select, 'onChange', { target: { value: 'abdomen' } }))
    view.act(() => fire(findForm(view.current), 'onSubmit', { preventDefault: () => {} }))
    await flush()

    const saved = readDemoPetFluidRecords(PATIENT_ID, '2026-01-01T00:00:00.000Z')
    expect(saved[0]?.fluid_volume_ml).toBe(200)
    expect(saved[0]?.injection_site).toBe('abdomen')
    expect(textContent(view.current)).toContain('已儲存。')
    expect(findTrendSection(view.current, 'petFluidTherapy')).toBeDefined()
    view.unmount()
  })

  test('內分泌頁會分開保存胰島素與血糖，並即時顯示低血糖狀態', async () => {
    const view = renderHook(() => PetEndocrinePage(PAGE_PROPS), { defaultContext: LOCALE_CONTEXT_VALUE })
    await flush()

    view.act(() => fire(findPlaceholder(view.current, '例：5'), 'onChange', { target: { value: '5' } }))
    view.act(() => fire(findPlaceholder(view.current, '例：110'), 'onChange', { target: { value: '70' } }))
    expect(textContent(view.current)).toContain('低血糖')
    view.act(() => fire(findForm(view.current), 'onSubmit', { preventDefault: () => {} }))
    await flush()

    const savedInsulin = readDemoPetInsulinRecords(PATIENT_ID, '2026-01-01T00:00:00.000Z')
    const savedGlucose = readDemoPetGlucoseRecords(PATIENT_ID, '2026-01-01T00:00:00.000Z')
    expect(savedInsulin[0]?.insulin_units).toBe(5)
    expect(savedGlucose[0]?.glucose_mg_dl).toBe(70)
    expect(textContent(view.current)).toContain('已儲存。')
    expect(findTrendSection(view.current, 'petEndocrine')).toBeDefined()
    view.unmount()
  })

  test('人類病人的內分泌頁不套用貓狗獸醫血糖門檻判讀', async () => {
    // petEndocrine 現在也對人類開放；80-120 mg/dL 是貓狗的獸醫參考值，人類病人只該看到數值，不該看到「正常/低血糖/高血糖」這種寵物門檻判讀。
    const view = renderHook(() => PetEndocrinePage({ ...PAGE_PROPS, careRecipientType: 'human' as const }), { defaultContext: LOCALE_CONTEXT_VALUE })
    await flush()

    view.act(() => fire(findPlaceholder(view.current, '例：110'), 'onChange', { target: { value: '70' } }))
    expect(textContent(view.current)).not.toContain('低血糖')
    expect(textContent(view.current)).not.toContain('80-120')
    view.unmount()
  })
})
