/*
檔案用途：鎖住血壓判讀標準設定面板的兩條安全性質（Codex review，PR #905）：
        (1) 換照護對象時表單一律重置，不得把前一位病人的目標帶與門診備註留在畫面上；
        (2) 存檔後要讓**全 app 共用的** evaluator 重讀，不是只更新自己這張表。
所在層：tests/unit 單元測試層。
主要關聯：src/components/settings/BpStandardSettings.tsx、src/features/vitals/hooks/useBpEvaluator.tsx。

第 (1) 條防的是跨病人資料外洩：照護者從設了自訂目標的病人切到尚未設定的病人，
畫面上會顯示、而且可以直接按下儲存前一位病人的目標——那是寫進另一個人健康判讀的值。
第 (2) 條防的是「換了標準但畫面還用舊的判讀」，一個會改變健康判讀的設定不能有那種延遲。
*/
import { describe, expect, mock, test } from 'bun:test'
import React from 'react'
import { installReactHookHarness, renderHook } from './helpers/reactHookHarness'

installReactHookHarness()

// 繁體中文註解：不使用 mock.module 改寫 i18n，改在 renderHook 傳入 defaultContext 注入語系，
// 避免 Bun 的全域 mock.module 污染其它測試檔的印尼文／英文斷言。
const LOCALE_CONTEXT_VALUE = { locale: 'zh' as const, setLocale: () => {} }

const actualBpStandards = await import('../../src/lib/bpStandards')
const savedCalls: Array<{ patientId: string; input: unknown }> = []
mock.module('../../src/lib/bpStandards', () => ({
  ...actualBpStandards,
  setBpStandard: async (patientId: string, input: unknown) => { savedCalls.push({ patientId, input }) },
}))

const { makeBpEvaluator, BpStandardContext } = await import('../../src/features/vitals/hooks/useBpEvaluator')
const { BpStandardSettingsPanel } = await import('../../src/components/settings/BpStandardSettings')

const CUSTOM_INTERVAL = {
  id: 'i-custom',
  templateKey: 'custom',
  customBounds: { systolicMin: 105, systolicMax: 125, diastolicMin: 62, diastolicMax: 78 },
  prescribedNote: '2026-08 心血管科門診',
  effectiveFrom: '2020-01-01T00:00:00.000Z',
  effectiveTo: null,
}

/** 走訪整棵 React element 樹，收集符合條件的節點；面板沒有 DOM，只能這樣看 props。 */
function collect(node: unknown, match: (props: any, type: unknown) => boolean, found: any[] = []): any[] {
  if (Array.isArray(node)) { for (const child of node) collect(child, match, found); return found }
  if (!React.isValidElement(node)) return found
  const props = node.props as any
  if (match(props, node.type)) found.push(props)
  collect(props?.children, match, found)
  return found
}

const textInputs = (tree: unknown) => collect(tree, props => props?.type === 'text')
const checkedRadio = (tree: unknown) => collect(tree, props => props?.type === 'radio' && props?.checked === true)
const numberInputs = (tree: unknown) => collect(tree, props => props?.type === 'number')

function evaluatorFor(patientId: string, intervals: unknown[], reload = () => {}) {
  return makeBpEvaluator(actualBpStandards.makeBpStandardResolver(intervals as never), {
    patientId, intervals: intervals as never, loading: false, error: null, reload,
  })
}

describe('BpStandardSettingsPanel 的跨病人隔離', () => {
  test('換到一位尚未設定標準的病人時，前一位的目標帶與門診備註都不得留下', () => {
    let patientId = 'patient-custom'
    let evaluator = evaluatorFor(patientId, [CUSTOM_INTERVAL])
    const view = renderHook(
      () => BpStandardSettingsPanel({ patientId, isDemoMode: false, canManageMedication: true }),
      { defaultContext: LOCALE_CONTEXT_VALUE, contexts: [[BpStandardContext, evaluator]] as any },
    )

    // 先確認第一位病人的值真的有被填進表單，否則下面那條可能只是「本來就空的」而僥倖通過。
    expect(checkedRadio(view.current)[0]?.value).toBe('custom')
    expect(textInputs(view.current)[0]?.value).toBe('2026-08 心血管科門診')
    expect(numberInputs(view.current).map(input => input.value)).toEqual(['105', '125', '62', '78'])

    // 換到一位完全沒設定過的病人。
    patientId = 'patient-blank'
    evaluator = evaluatorFor(patientId, [])
    view.provideContext(BpStandardContext, evaluator)
    const after = view.rerender()

    expect(checkedRadio(after)[0]?.value).toBe('general_adult')
    // 備註是自由文字，可能寫著「2026-08 心血管科門診」這種只屬於前一位病人的來源標示。
    expect(textInputs(after)[0]?.value).toBe('')
    // 自訂目標欄位這時不會渲染（沒選 custom），但選回 custom 時必須是預設值而不是 105–125。
    expect(numberInputs(after)).toEqual([])
    view.unmount()
  })

  test('存檔後呼叫 Provider 的 reload()，讓清單、圖表與報告同時換成新標準', async () => {
    savedCalls.length = 0
    let reloaded = 0
    const evaluator = evaluatorFor('patient-blank', [], () => { reloaded += 1 })
    const view = renderHook(
      () => BpStandardSettingsPanel({ patientId: 'patient-blank', isDemoMode: false, canManageMedication: true }),
      { defaultContext: LOCALE_CONTEXT_VALUE, contexts: [[BpStandardContext, evaluator]] as any },
    )

    const saveButton = collect(view.current, props => typeof props?.onClick === 'function' && props?.type === 'button')
      .find(props => props.className?.includes('bg-brand-700'))
    expect(saveButton).toBeTruthy()
    saveButton.onClick()
    // onClick 內是 void handleSave()；等它的 promise chain 跑完。
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()

    expect(savedCalls).toHaveLength(1)
    expect(savedCalls[0].patientId).toBe('patient-blank')
    // 這一條就是「只更新自己那張表」與「換掉全 app 的判讀」的差別。
    expect(reloaded).toBe(1)
    view.unmount()
  })
})
