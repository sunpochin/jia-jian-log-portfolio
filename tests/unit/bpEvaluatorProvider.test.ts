/*
檔案用途：鎖住 BpStandardProvider 的兩條跨病人安全性質（Codex review，PR #905）：
        (1) 手上的區間不屬於目前這位病人時，**同一次 render 就**不得拿來判讀；
        (2) 讀不到標準時回報 `unavailable`，而不是假裝「查過了、那段期間沒設定」。
所在層：tests/unit 單元測試層。
主要關聯：src/features/vitals/hooks/useBpEvaluator.tsx、src/lib/bpStandards.ts。

為什麼這兩條值得各一個測試：它們都是「畫面看起來完全正常、只是判讀對錯了人／不可信」的
靜默失敗，不會有使用者回報，只能靠測試守住。
*/
import { describe, expect, mock, test } from 'bun:test'
import { installReactHookHarness, renderHook } from './helpers/reactHookHarness'

installReactHookHarness()

const actualBpStandards = await import('../../src/lib/bpStandards')

// 每位病人一份假的生效區間；patientId 直接當 key，讓斷言看得出「拿到的是誰的標準」。
const INTERVALS: Record<string, Array<Record<string, unknown>>> = {
  'patient-strict': [{
    id: 'i-strict', templateKey: 'post_op_strict', customBounds: null, prescribedNote: null,
    effectiveFrom: '2020-01-01T00:00:00.000Z', effectiveTo: null,
  }],
  'patient-general': [{
    id: 'i-general', templateKey: 'general_adult', customBounds: null, prescribedNote: null,
    effectiveFrom: '2020-01-01T00:00:00.000Z', effectiveTo: null,
  }],
}

let readCalls: string[] = []
let readShouldFail = false

mock.module('../../src/lib/bpStandards', () => ({
  ...actualBpStandards,
  readBpStandardIntervals: async (patientId: string) => {
    readCalls.push(patientId)
    if (readShouldFail) throw new Error('network down')
    return INTERVALS[patientId] ?? []
  },
}))

const { BpStandardProvider } = await import('../../src/features/vitals/hooks/useBpEvaluator')

/** Provider 回傳的是 <Context.Provider value={…}>；測試直接讀那個 value，不需要 DOM。 */
function evaluatorOf(element: any) {
  return element.props.value
}

const AT = '2026-09-01T00:00:00.000Z'

async function settle() {
  // 讓 readBpStandardIntervals 的 promise chain 跑完；harness 的 effect 是同步呼叫的，
  // 但 setState 發生在 .then 之後。
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
}

describe('BpStandardProvider 的跨病人隔離', () => {
  test('切換病人的那一次 render 就不得再用上一位的標準', async () => {
    readCalls = []
    readShouldFail = false
    let patientId = 'patient-strict'
    const view = renderHook(() => BpStandardProvider({ patientId, children: null }) as any)
    await settle()
    const afterLoad = evaluatorOf(view.rerender())
    // 先確認第一位病人真的載到了嚴格標準，否則下面那條可能只是「什麼都沒載到」而僥倖通過。
    expect(afterLoad.patientId).toBe('patient-strict')
    expect(afterLoad.resolver(AT).templateKey).toBe('post_op_strict')
    expect(afterLoad.resolver(AT).unavailable).toBe(false)

    // 換病人。此時 effect 還沒跑、資料當然也還沒回來——關鍵是**這一次 render**。
    // 舊寫法在這裡會回傳 patient-strict 的區間（useEffect 的清空發生在 commit 之後）。
    patientId = 'patient-general'
    const duringSwitch = evaluatorOf(view.rerender())
    expect(duringSwitch.patientId).toBe('patient-general')
    expect(duringSwitch.resolver(AT).unavailable).toBe(true)
    expect(duringSwitch.resolver(AT).templateKey).not.toBe('post_op_strict')
    expect(duringSwitch.intervals).toEqual([])
    expect(duringSwitch.loading).toBe(true)

    await settle()
    const afterSwitch = evaluatorOf(view.rerender())
    expect(afterSwitch.resolver(AT).templateKey).toBe('general_adult')
    expect(afterSwitch.resolver(AT).unavailable).toBe(false)
    view.unmount()
  })

  test('讀取失敗回報 unavailable，不是「查過了、沒設定」', async () => {
    readCalls = []
    readShouldFail = true
    const view = renderHook(() => BpStandardProvider({ patientId: 'patient-strict', children: null }) as any)
    await settle()
    const evaluator = evaluatorOf(view.rerender())

    expect(evaluator.error).not.toBeNull()
    const resolved = evaluator.resolver(AT)
    // 兩個旗標都要對：configured=false 是「沒設定」，unavailable=true 才是「沒讀到」。
    // 只看 configured 的呼叫端會把讀取失敗印成一句「當時未設定個別標準」給醫師看。
    expect(resolved.configured).toBe(false)
    expect(resolved.unavailable).toBe(true)
    // 仍然給得出一份門檻讓畫面畫得出來——空白的血壓清單比暫時用預設門檻更糟。
    expect(resolved.standard.key).toBe('general_adult')

    readShouldFail = false
    view.act(() => evaluator.reload())
    await settle()
    expect(evaluatorOf(view.rerender()).resolver(AT).unavailable).toBe(false)
    view.unmount()
  })

  test('展示模式的假病人不打資料庫，而且算「查過了、沒設定」不是讀不到', async () => {
    readCalls = []
    readShouldFail = false
    const { DEMO_MEILING_PATIENT_ID } = await import('../../src/lib/demoData')
    const view = renderHook(() => BpStandardProvider({ patientId: DEMO_MEILING_PATIENT_ID, children: null }) as any)
    await settle()
    const resolved = evaluatorOf(view.rerender()).resolver(AT)

    expect(readCalls).toEqual([])
    expect(resolved.unavailable).toBe(false)
    expect(resolved.configured).toBe(false)
    view.unmount()
  })
})
