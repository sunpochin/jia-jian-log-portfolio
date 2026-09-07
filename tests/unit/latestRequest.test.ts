/*
檔案用途：驗證「只有最新一次查詢可以改寫畫面」的競態防護。
所在層：tests/unit；保護切換照護對象時不會把上一位的健康資料顯示成目前對象的數值。
主要關聯：src/hooks/useLatestRequest.ts，以及使用它的 useBpRecords、useLatestBpRecord。
*/
import { describe, expect, test } from 'bun:test'
import { createRequestTracker } from '../../src/hooks/useLatestRequest'

describe('createRequestTracker', () => {
  test('accepts the only in-flight request', () => {
    const tracker = createRequestTracker()
    expect(tracker.begin()()).toBe(true)
  })

  test('discards a slow earlier request once a newer one started', () => {
    // 繁體中文註解：這正是換照護對象的情境——A 的查詢比 B 晚回來，
    // 若照單全收，畫面會把 A 的血壓標成 B 的數值。
    const tracker = createRequestTracker()
    const isPatientA = tracker.begin()
    const isPatientB = tracker.begin()
    expect(isPatientA()).toBe(false)
    expect(isPatientB()).toBe(true)
  })

  test('keeps rejecting a stale request no matter how often it is asked', () => {
    const tracker = createRequestTracker()
    const stale = tracker.begin()
    tracker.begin()
    expect(stale()).toBe(false)
    expect(stale()).toBe(false)
  })

  test('invalidate stops every in-flight request from writing state', () => {
    // 樂觀更新與元件卸載都靠這條：已知較新的結果不可被仍在飛的查詢蓋掉。
    const tracker = createRequestTracker()
    const inFlight = tracker.begin()
    tracker.invalidate()
    expect(inFlight()).toBe(false)
  })

  test('trackers are independent so one screen cannot cancel another', () => {
    const a = createRequestTracker()
    const b = createRequestTracker()
    const isA = a.begin()
    b.begin()
    b.invalidate()
    expect(isA()).toBe(true)
  })
})
