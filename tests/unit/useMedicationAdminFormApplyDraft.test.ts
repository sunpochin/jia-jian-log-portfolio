/*
檔案用途：驗證 useMedicationAdminForm 的 applyDraft（issue #664，AI 藥袋草稿套用）只設定「新增用藥」
表單欄位、null 欄位留空不填假值、且完全不污染「調整既有醫囑」那組狀態；沿用既有 demo 資料層
（DEMO_MEILING_PATIENT_ID）讓 hook 的初始讀取不必額外 mock Supabase。
所在層：tests/unit；以最小 hook 執行環境呼叫 hook，不啟動瀏覽器。
主要關聯：src/features/medication/hooks/useMedicationAdminForm.ts、src/lib/medication/medicationAiDraft.ts。
*/
import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { installReactHookHarness, renderHook } from './helpers/reactHookHarness'
import { DEMO_MEILING_PATIENT_ID } from '../../src/lib/demoData'
import type { MedicationDraftItem } from '../../src/lib/medication/medicationAiDraft'

installReactHookHarness()

const { useMedicationAdminForm } = await import('../../src/features/medication/hooks/useMedicationAdminForm')

const LOCALE_CONTEXT_VALUE = { locale: 'zh' as const, setLocale: () => {} }

const originalWindow = globalThis.window
const values = new Map<string, string>()
const fakeWindow = {
  location: { pathname: '/demo' },
  localStorage: {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value) },
    removeItem: (key: string) => values.delete(key),
  },
  // applyDraft 展開新藥表單後會排一個 window.setTimeout 捲動到眼前；假 window 沒有這個方法會直接丟例外。
  setTimeout: globalThis.setTimeout.bind(globalThis),
  clearTimeout: globalThis.clearTimeout.bind(globalThis),
} as unknown as Window & typeof globalThis

let activeViews: Array<{ unmount: () => void }> = []

beforeEach(() => {
  values.clear()
  globalThis.window = fakeWindow
})

afterEach(async () => {
  for (const view of activeViews) {
    view.unmount()
  }
  activeViews = []
  // 等待 60ms scroll timer 執行完畢，避免 timer 在 window 被刪除後非同步觸發
  await new Promise(resolve => setTimeout(resolve, 70))
  if (originalWindow) globalThis.window = originalWindow
  else delete (globalThis as { window?: Window & typeof globalThis }).window
})

const flush = () => new Promise(resolve => setTimeout(resolve, 0))

async function renderForm() {
  const view = renderHook(() => useMedicationAdminForm({ patientId: DEMO_MEILING_PATIENT_ID, isOwnPatient: false }), { defaultContext: LOCALE_CONTEXT_VALUE })
  activeViews.push(view)
  await flush()
  return view
}

const fullDraftItem: MedicationDraftItem = {
  brandName: 'Panadol', genericName: 'Paracetamol', strengthLabel: '500mg', dosageForm: 'powder',
  doseAmount: 2, timesPerDay: 3, timingHint: '飯後', confidence: 'high',
}

const emptyDraftItem: MedicationDraftItem = {
  brandName: null, genericName: null, strengthLabel: null, dosageForm: null,
  doseAmount: null, timesPerDay: null, timingHint: null, confidence: 'low',
}

describe('useMedicationAdminForm applyDraft', () => {
  test('把草稿裡有值的欄位套進新增用藥表單，並展開新增自訂藥品的面板', async () => {
    const view = await renderForm()
    view.act(() => view.current.applyDraft(fullDraftItem))
    expect(view.current.brandName).toBe('Panadol')
    expect(view.current.genericName).toBe('Paracetamol')
    expect(view.current.strengthMg).toBe('500')
    expect(view.current.dosageForm).toBe('powder')
    expect(view.current.newDoseAmount).toBe('2')
    // 展開的是 NewMedicationForm 自己的面板（isNewMedicationPanelOpen），不是 isAddPanelOpen——
    // 後者只控制 ExistingPlanForm 的「加入既有藥品」手風琴，跟這裡填的自訂新藥表單無關，
    // 只設 isAddPanelOpen 會讓套用草稿看起來毫無反應（見 hook 內 review finding 註解）。
    expect(view.current.isNewMedicationPanelOpen).toBe(true)
  })

  test('全 null 的草稿會把欄位重置成空白／預設值，不會殘留先前手動輸入的內容', async () => {
    const view = await renderForm()
    // 先讓每個會被 applyDraft 觸碰的欄位都有一個「照護者已經打進去」的既有值。
    view.act(() => { view.current.setBrandName('舊藥名'); view.current.setGenericName('舊學名'); view.current.setStrengthMg('9'); view.current.setDosageForm('capsule'); view.current.setNewDoseAmount('1.5') })
    view.act(() => view.current.applyDraft(emptyDraftItem))
    // 全 null 代表 AI 什麼都沒讀到；套用後應該是乾淨的空白／預設狀態，而不是照護者上一次操作留下的舊值——
    // 否則會讓照護者誤以為這些是「AI 讀到、只是恰好跟舊值一樣」的資料。
    expect(view.current.brandName).toBe('')
    expect(view.current.genericName).toBe('')
    expect(view.current.strengthMg).toBe('')
    expect(view.current.dosageForm).toBe('tablet')
    expect(view.current.newDoseAmount).toBe('1')
  })

  test('連續套用兩份不同藥品的草稿，第二份不會殘留第一份的劑型與劑量', async () => {
    // review finding：只在「有值才覆寫」會讓同一張藥袋的第二顆藥，繼承第一顆藥還沒被使用者確認過的
    // 劑型／劑量，而且畫面上看不出這是殘留資料（不像 null 欄位會顯示「沒讀到」提示）。
    const view = await renderForm()
    view.act(() => view.current.applyDraft(fullDraftItem)) // dosageForm: 'powder', doseAmount: 2
    expect(view.current.dosageForm).toBe('powder')
    expect(view.current.newDoseAmount).toBe('2')
    const secondDraftItem: MedicationDraftItem = { ...emptyDraftItem, brandName: 'Aspirin', genericName: 'Aspirin' }
    view.act(() => view.current.applyDraft(secondDraftItem))
    expect(view.current.brandName).toBe('Aspirin')
    expect(view.current.dosageForm).toBe('tablet')
    expect(view.current.newDoseAmount).toBe('1')
  })

  test('劑量標示剖析不出數字時，strengthMg 留白，改落到 strengthLabel 讓照護者自己核對（issue #758）', async () => {
    const view = await renderForm()
    view.act(() => view.current.setStrengthMg('9'))
    view.act(() => view.current.applyDraft({ ...emptyDraftItem, strengthLabel: '不明劑量' }))
    expect(view.current.strengthMg).toBe('')
    expect(view.current.strengthLabel).toBe('不明劑量')
  })

  test.each(['250mcg', '5 mL', '0.1%', '10 IU'])('劑量標示是非 mg 單位（%s）時不會被誤存成 mg 數字，改存進 strengthLabel 不丟掉（issue #758）', async label => {
    // review finding：mg／mcg 只差一個字母卻是 1000 倍劑量誤差，"250mcg" 絕不能被寬鬆的數字擷取
    // 誤存成 250（mg）；非 mg 單位一律當成剖析失敗、留白，讓照護者自己核對藥袋填寫。
    // issue #758（單位 C）：留白之後這段原文不能直接丟掉，要落到 strengthLabel 欄位讓照護者看得到、
    // 自己決定要不要把種類改成營養品，不再讓照護者重打一次。
    const view = await renderForm()
    view.act(() => view.current.applyDraft({ ...emptyDraftItem, strengthLabel: label }))
    expect(view.current.strengthMg).toBe('')
    expect(view.current.strengthLabel).toBe(label)
  })

  test('劑量標示明確標示 mg 時會正確擷取數字，且不會殘留進 strengthLabel', async () => {
    const view = await renderForm()
    view.act(() => view.current.applyDraft({ ...emptyDraftItem, strengthLabel: '250mg' }))
    expect(view.current.strengthMg).toBe('250')
    expect(view.current.strengthLabel).toBe('')
  })

  test('劑量標示用中文「毫克」結尾時也會正確擷取數字', async () => {
    // review finding：\b 接在「毫克」後面時永遠不會成立（中文字元兩側都不是 \w），
    // 導致這個最常見的 AI 辨識輸出整段配對失敗、劑量留白。
    const view = await renderForm()
    view.act(() => view.current.applyDraft({ ...emptyDraftItem, strengthLabel: '10毫克' }))
    expect(view.current.strengthMg).toBe('10')
    expect(view.current.strengthLabel).toBe('')
  })

  test('連續套用兩份草稿，第一份非 mg 劑量標示不會殘留到第二份已剖析出 mg 的草稿（issue #758）', async () => {
    const view = await renderForm()
    view.act(() => view.current.applyDraft({ ...emptyDraftItem, strengthLabel: '250mcg' }))
    expect(view.current.strengthLabel).toBe('250mcg')
    view.act(() => view.current.applyDraft({ ...emptyDraftItem, strengthLabel: '250mg' }))
    expect(view.current.strengthMg).toBe('250')
    expect(view.current.strengthLabel).toBe('')
  })

  test('套用草稿會清掉既有藥品選取狀態，避免同時顯示已選藥卡與新藥表單', async () => {
    const view = await renderForm()
    view.act(() => view.current.chooseMedication('some-medication-id'))
    expect(view.current.medicationId).toBe('some-medication-id')
    view.act(() => view.current.applyDraft(fullDraftItem))
    expect(view.current.medicationId).toBe('')
    expect(view.current.selectionConfirmed).toBe(false)
    expect(view.current.editingPlanId).toBeNull()
    expect(view.current.selectedCatalogProduct).toBeNull()
  })

  test('套用草稿完全不動「調整既有醫囑」那組表單狀態', async () => {
    const view = await renderForm()
    view.act(() => {
      view.current.setExistingScheduleSlot('after_dinner')
      view.current.setExistingDoseAmount('2.5')
      view.current.setExistingAsNeeded(true)
      view.current.setExistingChangeReason('依回診醫囑調整')
      view.current.setCatalogQuery('aspirin')
      view.current.setIsCatalogSearchOpen(true)
    })
    view.act(() => view.current.applyDraft(fullDraftItem))
    expect(view.current.existingScheduleSlot).toBe('after_dinner')
    expect(view.current.existingDoseAmount).toBe('2.5')
    expect(view.current.existingAsNeeded).toBe(true)
    expect(view.current.existingChangeReason).toBe('依回診醫囑調整')
    expect(view.current.catalogQuery).toBe('aspirin')
    expect(view.current.isCatalogSearchOpen).toBe(true)
  })

  test('套用草稿時，若包含一天三次與飯後時機，自動預選「一天三次，餐後」（早中晚飯後）三個時段', async () => {
    const view = await renderForm()
    view.act(() => view.current.applyDraft({ ...emptyDraftItem, timesPerDay: 3, timingHint: '三餐飯後' }))
    expect(view.current.newScheduleSlots).toEqual(['after_breakfast', 'after_lunch', 'after_dinner'])
    expect(view.current.newScheduleSlot).toBe('after_breakfast')
  })

  test('套用草稿時，若包含一天三次與「餐前餐後都可以」，自動預選對應的三個時段', async () => {
    const view = await renderForm()
    view.act(() => view.current.applyDraft({ ...emptyDraftItem, timesPerDay: 3, timingHint: '餐前餐後都可以' }))
    expect(view.current.newScheduleSlots).toEqual(['after_breakfast', 'after_lunch', 'after_dinner'])
  })

  test('套用草稿時，若包含一天四次與睡前，自動預選三餐後及睡前四個時段', async () => {
    const view = await renderForm()
    view.act(() => view.current.applyDraft({ ...emptyDraftItem, timesPerDay: 4, timingHint: '三餐後及睡前' }))
    expect(view.current.newScheduleSlots).toEqual(['after_breakfast', 'after_lunch', 'after_dinner', 'before_bed'])
  })

  test('套用草稿時，若時機文字無法安全對應到三餐時段，不會用次數硬猜一組時段', async () => {
    // review finding：matchFrequencyPreset 對「每 8 小時」這種無法安全對應的 timingHint 會刻意回傳
    // null；呼叫端不能再用 timesPerDay 猜一組「早午晚」蓋掉這個安全判斷，那等於把來源文字沒說過的
    // 服藥時段自動填進表單。應維持重設後的預設單一時段，讓照護者自己核對藥袋填寫。
    const view = await renderForm()
    view.act(() => view.current.applyDraft({ ...emptyDraftItem, timesPerDay: 3, timingHint: '每 8 小時' }))
    expect(view.current.newScheduleSlots).toEqual(['after_breakfast'])
    expect(view.current.newScheduleSlot).toBe('after_breakfast')
  })

  test('連續套用時，第二份無頻率/無法比對的草稿會清空上一份的時段，重設為預設單一時段', async () => {
    const view = await renderForm()
    // 第一份：一天三次
    view.act(() => view.current.applyDraft({ ...emptyDraftItem, timesPerDay: 3, timingHint: '三餐飯後' }))
    expect(view.current.newScheduleSlots).toEqual(['after_breakfast', 'after_lunch', 'after_dinner'])

    // 第二份：無頻率資訊，不應殘留第一份的三個時段
    view.act(() => view.current.applyDraft({ ...emptyDraftItem, timesPerDay: null, timingHint: null }))
    expect(view.current.newScheduleSlots).toEqual(['after_breakfast'])
    expect(view.current.newScheduleSlot).toBe('after_breakfast')
  })
})
