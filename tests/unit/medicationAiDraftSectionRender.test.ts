/*
檔案用途：驗證 AI 藥袋草稿卡片（issue #664）的病人綁定三道防線、三語文案、低信心與 null 欄位視覺區別，
以及套用草稿只呼叫 onApplyDraft、不觸發任何 Supabase 寫入。病人綁定是本批最高優先的健康安全要求，
覆蓋：發出請求後切換病人使遲到回應不套用、草稿顯示中切換病人會清空草稿、回應 patientId 不符會整份丟棄。
所在層：tests/unit；以最小 hook 執行環境呼叫元件函式，不啟動瀏覽器；mock supabase.functions.invoke，
並比照 careEventPhotos.test.ts 的既有做法，用假的全域 document.createElement／createImageBitmap
讓真正的 prepareSingleCompressedImage 可以在 bun test 環境完整跑完——不 mock lib/careEventPhotos
整個模組，因為 bun 的 mock.module 是整個測試程序共用的，會讓同程序內其他直接測試該模組真實實作的
測試檔（例如 careEventPhotos.test.ts）被互相污染。
主要關聯：src/features/medication/components/MedicationAiDraftSection.tsx、src/lib/medication/medicationAiDraft.ts。
*/
import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'
import { installReactHookHarness, renderHook } from './helpers/reactHookHarness'
import { fire, findAll, findButton, textContent } from './helpers/elementTree'

installReactHookHarness()

type InvokeResult = { data?: unknown; error?: unknown }
let invokeImpl: (patientId: string) => Promise<InvokeResult> = async patientId => ({ data: { patientId, items: [] }, error: null })
const invokeCalls: string[] = []

mock.module('../../src/lib/supabase', () => ({
  supabase: {
    functions: {
      invoke: (name: string, options: { headers?: Record<string, string> }) => {
        invokeCalls.push(name)
        return invokeImpl(options.headers?.['x-patient-id'] ?? '')
      },
    },
  },
}))

// 同理保留 demoStorage 的其餘原始匯出：這個模組被許多測試檔（例如 *PagesRender.test.ts）直接測試
// 真實的 demo adapter 實作，只覆寫這裡真正需要控制的 isDemoMode。
let demoMode = false
const actualDemoStorage = await import('../../src/lib/demoStorage')
mock.module('../../src/lib/demoStorage', () => ({
  ...actualDemoStorage,
  // 繁體中文註解：Bun 的 mock.module 在同一行程跨測試檔全域生效，若 demoMode 為 false 時固定回傳 false，
  // 會破壞後續測試檔依賴 window.location.pathname === '/demo' 的展示模式判定。
  isDemoMode: () => demoMode || (typeof window !== 'undefined' && window.location?.pathname === '/demo'),
}))

const { MedicationAiDraftSection, DEMO_SCRIPTED_DRAFT_DELAY_MS } = await import('../../src/features/medication/components/MedicationAiDraftSection')

const LOCALE_CONTEXT_VALUE = { locale: 'zh' as const, setLocale: () => {} }
const fakeFile = new File(['abc'], 'bag.jpg', { type: 'image/jpeg' })
const flush = () => new Promise(resolve => setTimeout(resolve, 0))
// 展示模式的劇本結果會晚一小段固定延遲才出現（見元件內的 DEMO_SCRIPTED_DRAFT_DELAY_MS 註解），
// 測試要真的等過這段延遲，不能只 flush 一個 macrotask，否則永遠斷言在「辨識中」畫面。
const flushDemoScriptDelay = () => new Promise(resolve => setTimeout(resolve, DEMO_SCRIPTED_DRAFT_DELAY_MS + 20))

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(r => { resolve = r })
  return { promise, resolve }
}

function fileInput(tree: unknown) {
  const inputs = findAll(tree, el => el.type === 'input' && el.props.type === 'file')
  if (!inputs[0]) throw new Error('file input not found')
  return inputs[0]
}

// 選擇照片（相簿）按鈕對應的第二個 file input：跟拍照那個唯一的差別是沒有 capture 屬性。
function libraryFileInput(tree: unknown) {
  const inputs = findAll(tree, el => el.type === 'input' && el.props.type === 'file')
  if (!inputs[1]) throw new Error('library file input not found')
  return inputs[1]
}

// 照抄 tests/unit/careEventPhotos.test.ts 的假瀏覽器 Canvas／Image API 寫法，讓真正的
// prepareSingleCompressedImage（含 decodeImage、renderCompressedImage）能在 bun test 環境完整跑完，
// 而不必 mock 掉整個模組。
const previousDocument = Object.getOwnPropertyDescriptor(globalThis, 'document')
const previousCreateImageBitmap = Object.getOwnPropertyDescriptor(globalThis, 'createImageBitmap')

beforeEach(() => {
  invokeCalls.length = 0
  demoMode = false
  invokeImpl = async patientId => ({ data: { patientId, items: [] }, error: null })
  Object.defineProperty(globalThis, 'createImageBitmap', { configurable: true, value: async () => ({ width: 900, height: 600, close() {} }) })
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: {
      createElement: () => {
        const canvas = {
          width: 0,
          height: 0,
          getContext: () => ({ drawImage() {} }),
          toBlob: (callback: (blob: Blob | null) => void, type: string) => callback(new Blob([new Uint8Array(Math.max(1, canvas.width * canvas.height))], { type })),
        }
        return canvas
      },
    },
  })
})

afterEach(() => {
  demoMode = false
  if (previousDocument) Object.defineProperty(globalThis, 'document', previousDocument)
  else Reflect.deleteProperty(globalThis, 'document')
  if (previousCreateImageBitmap) Object.defineProperty(globalThis, 'createImageBitmap', previousCreateImageBitmap)
  else Reflect.deleteProperty(globalThis, 'createImageBitmap')
})

describe('demo mode（展示模式：固定劇本，不呼叫真正的 Function）', () => {
  test('選照片後顯示固定的示範草稿，完全不呼叫 Supabase Function', async () => {
    demoMode = true
    const view = renderHook(() => MedicationAiDraftSection({ patientId: 'patient-1', onApplyDraft: () => {} }), { defaultContext: LOCALE_CONTEXT_VALUE })
    view.act(() => fire(fileInput(view.current), 'onChange', { target: { files: [fakeFile], value: '' } }))
    await flushDemoScriptDelay()
    const rendered = textContent(view.current)
    expect(rendered).toContain('Concor')
    expect(rendered).toContain('Exforge')
    expect(rendered).toContain('⚠️ 低信心辨識，請格外仔細核對')
    // 展示模式選了任何照片都完全不打網路請求——不只是「這次剛好沒打」，是整條路徑都不會呼叫 invoke。
    expect(invokeCalls).toEqual([])
    view.unmount()
  })

  test('常駐顯示「示範結果」標籤，不是只在有草稿時才出現，因為訪客可能跳過導覽直接點進這張卡', async () => {
    demoMode = true
    const view = renderHook(() => MedicationAiDraftSection({ patientId: 'patient-1', onApplyDraft: () => {} }), { defaultContext: LOCALE_CONTEXT_VALUE })
    // 還沒選照片、草稿是空的，標籤也該已經在畫面上。
    expect(textContent(view.current)).toContain('示範結果，未實際呼叫 AI')
    view.act(() => fire(fileInput(view.current), 'onChange', { target: { files: [fakeFile], value: '' } }))
    await flushDemoScriptDelay()
    expect(textContent(view.current)).toContain('示範結果，未實際呼叫 AI')
    view.unmount()
  })

  test('非展示模式完全不顯示示範結果標籤', () => {
    demoMode = false
    const view = renderHook(() => MedicationAiDraftSection({ patientId: 'patient-1', onApplyDraft: () => {} }), { defaultContext: LOCALE_CONTEXT_VALUE })
    expect(textContent(view.current)).not.toContain('示範結果，未實際呼叫 AI')
    view.unmount()
  })

  test('展示模式的草稿一樣可以套用到表單，只呼叫 onApplyDraft，不寫入任何地方', async () => {
    demoMode = true
    const applied: unknown[] = []
    const view = renderHook(() => MedicationAiDraftSection({ patientId: 'patient-1', onApplyDraft: item => applied.push(item) }), { defaultContext: LOCALE_CONTEXT_VALUE })
    view.act(() => fire(fileInput(view.current), 'onChange', { target: { files: [fakeFile], value: '' } }))
    await flushDemoScriptDelay()
    view.act(() => fire(findButton(view.current, '套用到新增用藥表單'), 'onClick'))
    expect(applied).toHaveLength(1)
    expect((applied[0] as { brandName: string }).brandName).toBe('Concor')
    view.unmount()
  })

  test('展示模式切換病人時，還沒顯示的劇本結果不會套到新病人畫面上', async () => {
    demoMode = true
    let patientId = 'patient-1'
    const view = renderHook(() => MedicationAiDraftSection({ patientId, onApplyDraft: () => {} }), { defaultContext: LOCALE_CONTEXT_VALUE })
    view.act(() => fire(fileInput(view.current), 'onChange', { target: { files: [fakeFile], value: '' } }))
    patientId = 'patient-2'
    view.rerender()
    await flushDemoScriptDelay()
    expect(textContent(view.current)).not.toContain('Concor')
    view.unmount()
  })
})

describe('三語文案', () => {
  test.each([
    ['zh', '📷 AI 拍藥袋辨識'],
    ['id', '📷 Pindai resep dengan AI'],
    ['en', '📷 Scan prescription with AI'],
  ])('%s locale 的拍照按鈕文案完整', (locale, label) => {
    const view = renderHook(() => MedicationAiDraftSection({ patientId: 'patient-1', onApplyDraft: () => {} }), { defaultContext: { locale, setLocale: () => {} } })
    expect(findButton(view.current, label)).toBeDefined()
    view.unmount()
  })
})

describe('拍照或選擇既有照片', () => {
  test('提供拍照與選擇照片兩個各自獨立的 file input，只有拍照那個帶 capture=environment', () => {
    const view = renderHook(() => MedicationAiDraftSection({ patientId: 'patient-1', onApplyDraft: () => {} }), { defaultContext: LOCALE_CONTEXT_VALUE })
    const inputs = findAll(view.current, el => el.type === 'input' && el.props.type === 'file')
    expect(inputs).toHaveLength(2)
    expect(inputs[0].props.capture).toBe('environment')
    expect(inputs[1].props.capture).toBeUndefined()
    expect(findButton(view.current, '🖼️ 選擇照片')).toBeDefined()
    view.unmount()
  })

  test('從相簿選擇的照片走同一套辨識流程', async () => {
    invokeImpl = async patientId => ({ data: { patientId, items: [{ brandName: 'FromLibrary', genericName: null, strengthLabel: null, dosageForm: null, doseAmount: null, timesPerDay: null, timingHint: null, confidence: 'high' }] }, error: null })
    const view = renderHook(() => MedicationAiDraftSection({ patientId: 'patient-1', onApplyDraft: () => {} }), { defaultContext: LOCALE_CONTEXT_VALUE })
    view.act(() => fire(libraryFileInput(view.current), 'onChange', { target: { files: [fakeFile], value: '' } }))
    await flush()
    expect(textContent(view.current)).toContain('FromLibrary')
    expect(invokeCalls).toEqual(['medication-ai-draft'])
    view.unmount()
  })
})

describe('額度用完（issue #683 推廣策略 + 後續放大文案／灰階按鈕）', () => {
  test('免費帳號（tier=none）用完顯示放大的升級 Premium 提示，帶出實際生效的次數，不是寫死的數字，且拍照／選照片按鈕變成灰階停用（不隱藏，維持升級誘因）', async () => {
    invokeImpl = async () => ({ data: null, error: Object.assign(new Error('invoke failed'), { context: { json: async () => ({ error: 'daily_medication_ai_draft_limit', tier: 'none', freeDailyLimit: 5 }) } }) })
    const view = renderHook(() => MedicationAiDraftSection({ patientId: 'patient-1', onApplyDraft: () => {} }), { defaultContext: LOCALE_CONTEXT_VALUE })
    view.act(() => fire(fileInput(view.current), 'onChange', { target: { files: [fakeFile], value: '' } }))
    await flush()
    const rendered = textContent(view.current)
    expect(rendered).toContain('今天的免費體驗已經用完囉')
    expect(rendered).toContain('今天已經用了 5 次免費 AI 藥袋辨識')
    expect(rendered).toContain('現在就去請您的家庭照護管理者開通吧')
    // Repository Privacy Boundary：畫面上不得出現任何真實 email 或聯絡窗口。
    expect(rendered).not.toContain('@')
    // 額度用完當天不可能再拍出結果，但按鈕仍要看得到、只是停用：disabled 屬性本身會阻止點擊，
    // 留著才能持續提醒免費用戶「這功能值得升級」。
    expect(findButton(view.current, '📷 AI 拍藥袋辨識')?.props.disabled).toBe(true)
    expect(findButton(view.current, '🖼️ 選擇照片')?.props.disabled).toBe(true)
    view.unmount()
  })

  test('付費帳號（tier=ai）用完只顯示放大的單純訊息，不顯示升級提示，按鈕同樣灰階停用', async () => {
    invokeImpl = async () => ({ data: null, error: Object.assign(new Error('invoke failed'), { context: { json: async () => ({ error: 'daily_medication_ai_draft_limit', tier: 'ai', freeDailyLimit: 3 }) } }) })
    const view = renderHook(() => MedicationAiDraftSection({ patientId: 'patient-1', onApplyDraft: () => {} }), { defaultContext: LOCALE_CONTEXT_VALUE })
    view.act(() => fire(fileInput(view.current), 'onChange', { target: { files: [fakeFile], value: '' } }))
    await flush()
    const rendered = textContent(view.current)
    expect(rendered).toContain('今天的 AI 藥袋辨識次數已經用完了')
    expect(rendered).not.toContain('升級')
    expect(findButton(view.current, '📷 AI 拍藥袋辨識')?.props.disabled).toBe(true)
    expect(findButton(view.current, '🖼️ 選擇照片')?.props.disabled).toBe(true)
    view.unmount()
  })
})

describe('拍照辨識結果', () => {
  test('顯示低信心警示與 null 欄位的「沒讀到」提示，不會顯示假值', async () => {
    invokeImpl = async patientId => ({
      data: {
        patientId,
        items: [{ brandName: null, genericName: 'Paracetamol', strengthLabel: null, dosageForm: null, doseAmount: null, timesPerDay: null, timingHint: null, confidence: 'low' }],
      },
      error: null,
    })
    const view = renderHook(() => MedicationAiDraftSection({ patientId: 'patient-1', onApplyDraft: () => {} }), { defaultContext: LOCALE_CONTEXT_VALUE })
    view.act(() => fire(fileInput(view.current), 'onChange', { target: { files: [fakeFile], value: '' } }))
    await flush()
    const rendered = textContent(view.current)
    expect(rendered).toContain('⚠️ 低信心辨識，請格外仔細核對')
    expect(rendered).toContain('藥袋上沒讀到，請自行填寫。')
    expect(rendered).toContain('Paracetamol')
    view.unmount()
  })

  test('AI 沒有辨識出任何藥品時顯示空結果訊息', async () => {
    const view = renderHook(() => MedicationAiDraftSection({ patientId: 'patient-1', onApplyDraft: () => {} }), { defaultContext: LOCALE_CONTEXT_VALUE })
    view.act(() => fire(fileInput(view.current), 'onChange', { target: { files: [fakeFile], value: '' } }))
    await flush()
    expect(textContent(view.current)).toContain('AI 沒有從這張照片辨識出任何藥品，請改用下方手動輸入。')
    view.unmount()
  })

  test('未開通帳號看到引導聯絡管理者的三語錯誤，不是泛用錯誤', async () => {
    invokeImpl = async () => ({ data: null, error: Object.assign(new Error('invoke failed'), { context: { json: async () => ({ error: 'medication_ai_draft_not_entitled' }) } }) })
    const view = renderHook(() => MedicationAiDraftSection({ patientId: 'patient-1', onApplyDraft: () => {} }), { defaultContext: LOCALE_CONTEXT_VALUE })
    view.act(() => fire(fileInput(view.current), 'onChange', { target: { files: [fakeFile], value: '' } }))
    await flush()
    expect(textContent(view.current)).toContain('此帳號尚未開通 AI 藥單辨識，請聯絡帳號管理者開通')
    view.unmount()
  })
})

describe('🔴 病人綁定（健康安全，必測項）', () => {
  test('回應的 patientId 與請求時不同（Function 異常）就整份丟棄，不顯示', async () => {
    invokeImpl = async () => ({ data: { patientId: 'someone-else', items: [{ brandName: 'X', genericName: null, strengthLabel: null, dosageForm: null, doseAmount: null, timesPerDay: null, timingHint: null, confidence: 'high' }] }, error: null })
    const view = renderHook(() => MedicationAiDraftSection({ patientId: 'patient-1', onApplyDraft: () => {} }), { defaultContext: LOCALE_CONTEXT_VALUE })
    view.act(() => fire(fileInput(view.current), 'onChange', { target: { files: [fakeFile], value: '' } }))
    await flush()
    expect(textContent(view.current)).not.toContain('X')
    expect(findAll(view.current, el => el.props.role === 'alert')).toHaveLength(0)
    view.unmount()
  })

  test('發出請求後切換病人，遲到的回應不會套用到新病人的畫面', async () => {
    const pending = deferred<InvokeResult>()
    invokeImpl = () => pending.promise
    let patientId = 'patient-1'
    const view = renderHook(() => MedicationAiDraftSection({ patientId, onApplyDraft: () => {} }), { defaultContext: LOCALE_CONTEXT_VALUE })
    view.act(() => fire(fileInput(view.current), 'onChange', { target: { files: [fakeFile], value: '' } }))
    await flush()
    expect(textContent(view.current)).toContain('辨識中…')

    patientId = 'patient-2'
    view.rerender()
    expect(textContent(view.current)).not.toContain('辨識中…')

    pending.resolve({ data: { patientId: 'patient-1', items: [{ brandName: 'DelayedDrug', genericName: null, strengthLabel: null, dosageForm: null, doseAmount: null, timesPerDay: null, timingHint: null, confidence: 'high' }] }, error: null })
    await flush()
    expect(textContent(view.current)).not.toContain('DelayedDrug')
    view.unmount()
  })

  test('草稿顯示中切換病人，草稿立刻被清空', async () => {
    let patientId = 'patient-1'
    invokeImpl = async id => ({ data: { patientId: id, items: [{ brandName: 'VisibleDrug', genericName: null, strengthLabel: null, dosageForm: null, doseAmount: null, timesPerDay: null, timingHint: null, confidence: 'high' }] }, error: null })
    const view = renderHook(() => MedicationAiDraftSection({ patientId, onApplyDraft: () => {} }), { defaultContext: LOCALE_CONTEXT_VALUE })
    view.act(() => fire(fileInput(view.current), 'onChange', { target: { files: [fakeFile], value: '' } }))
    await flush()
    expect(textContent(view.current)).toContain('VisibleDrug')

    patientId = 'patient-2'
    view.rerender()
    expect(textContent(view.current)).not.toContain('VisibleDrug')
    view.unmount()
  })

  test('套用只呼叫 onApplyDraft，改變表單狀態，沒有任何 Supabase 寫入呼叫', async () => {
    invokeImpl = async id => ({ data: { patientId: id, items: [{ brandName: 'ApplyMe', genericName: null, strengthLabel: null, dosageForm: null, doseAmount: null, timesPerDay: null, timingHint: null, confidence: 'high' }] }, error: null })
    const applied: unknown[] = []
    const view = renderHook(() => MedicationAiDraftSection({ patientId: 'patient-1', onApplyDraft: item => applied.push(item) }), { defaultContext: LOCALE_CONTEXT_VALUE })
    view.act(() => fire(fileInput(view.current), 'onChange', { target: { files: [fakeFile], value: '' } }))
    await flush()
    view.act(() => fire(findButton(view.current, '套用到新增用藥表單'), 'onClick'))
    expect(applied).toHaveLength(1)
    expect((applied[0] as { brandName: string }).brandName).toBe('ApplyMe')
    // 唯一一次 invoke 呼叫是拍照辨識本身；套用動作完全沒有再呼叫 Supabase（沒有寫入呼叫）。
    expect(invokeCalls).toEqual(['medication-ai-draft'])
    view.unmount()
  })
})
