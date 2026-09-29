/*
檔案用途：驗證 ADR-007 票 10（issue #974）的資料轉接層與 hook——查詢以 patient_id 分區且只取 open、讀取失敗 throw（不當成沒有告警）、
  結案走 RPC；hook 切換病人立刻清空且丟掉慢的舊回應（AGENTS.md § 3.5）、讀取失敗設 checkFailed、結案後從畫面移除、失敗保留。
所在層：tests/unit；以注入的假 client／loader 取代 Supabase，用 react hook harness 執行 hook。
主要關聯：src/lib/notificationDeliveryIncidents.ts、src/features/today/hooks/useNotificationDeliveryIncidents.ts、
  docs/adr/007-notification-delivery-semantics.md（驗收第 26 項）。
*/
import { beforeEach, describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { installReactHookHarness, renderHook } from './helpers/reactHookHarness'
import { DEMO_MEILING_PATIENT_ID } from '../../src/lib/demoData'
import {
  acknowledgeNotificationDeliveryIncident,
  fetchOpenNotificationDeliveryIncidents,
  type NotificationDeliveryIncident,
} from '../../src/lib/notificationDeliveryIncidents'
import { INCIDENT_POLL_INTERVAL_MS, selectScopedAcknowledgeFailed, selectScopedAcknowledgingId, selectScopedIncidents, useNotificationDeliveryIncidents } from '../../src/features/today/hooks/useNotificationDeliveryIncidents'

installReactHookHarness()

type Query = { table: string; columns: string; filters: Array<[string, string]>; order: [string, { ascending: boolean }] | null }
let queries: Query[] = []
let rpcCalls: Array<{ name: string; args: unknown }> = []
let queryResult: { data: unknown; error: unknown } = { data: [], error: null }
let rpcResult: { data: unknown; error: unknown } = { data: true, error: null }

function fakeClient() {
  return {
    from(table: string) {
      const query: Query = { table, columns: '', filters: [], order: null }
      queries.push(query)
      const chain = {
        select(columns: string) { query.columns = columns; return chain },
        eq(column: string, value: string) { query.filters.push([column, value]); return chain },
        order(column: string, options: { ascending: boolean }) { query.order = [column, options]; return Promise.resolve(queryResult) },
      }
      return chain
    },
    rpc(name: string, args: unknown) { rpcCalls.push({ name, args }); return Promise.resolve(rpcResult) },
  } as unknown as Parameters<typeof fetchOpenNotificationDeliveryIncidents>[1]
}

const incident = (id: string, alertKind: NotificationDeliveryIncident['alertKind'] = 'delivery_unknown', generation = 1): NotificationDeliveryIncident => ({
  id, alertKind, firstSeenAt: '2026-09-26T10:00:00.000Z', lastSeenAt: '2026-09-26T10:05:00.000Z', generation,
})

beforeEach(() => {
  queries = []
  rpcCalls = []
  queryResult = { data: [], error: null }
  rpcResult = { data: true, error: null }
})

describe('fetchOpenNotificationDeliveryIncidents', () => {
  test('selects only pointer/state columns, scoped to the patient and to open incidents, oldest first', async () => {
    queryResult = { data: [{ id: 'i1', alert_kind: 'failed_terminal', first_seen_at: 'a', last_seen_at: 'b', claim_generation_seen: 3 }, { id: 'i2', alert_kind: 'weird', first_seen_at: 'a', last_seen_at: 'b', claim_generation_seen: 1 }], error: null }
    const rows = await fetchOpenNotificationDeliveryIncidents('11111111-1111-4111-8111-111111111111', fakeClient())
    expect(queries).toHaveLength(1)
    expect(queries[0].table).toBe('notification_delivery_incidents')
    // claim_generation_seen 是前端分辨「同一筆 id 的新一代告警」的唯一依據（PR #993 Codex P2）。
    expect(queries[0].columns).toBe('id, alert_kind, first_seen_at, last_seen_at, claim_generation_seen')
    expect(queries[0].filters).toEqual([['patient_id', '11111111-1111-4111-8111-111111111111'], ['status', 'open']])
    expect(queries[0].order).toEqual(['first_seen_at', { ascending: true }])
    // 認不得的 alert_kind 丟掉，不猜。
    expect(rows).toEqual([{ id: 'i1', alertKind: 'failed_terminal', firstSeenAt: 'a', lastSeenAt: 'b', generation: 3 }])
    // 欄位裡沒有任何數值、收件人或訊息內容。
    expect(queries[0].columns).not.toMatch(/systolic|email|external|message|text/)
  })

  test('throws on a query error instead of returning an empty list (Fail loudly)', async () => {
    queryResult = { data: null, error: new Error('rls denied') }
    await expect(fetchOpenNotificationDeliveryIncidents('11111111-1111-4111-8111-111111111111', fakeClient())).rejects.toThrow('Unable to read notification delivery incidents')
  })

  test('returns an empty list for a demo patient without touching Supabase', async () => {
    await expect(fetchOpenNotificationDeliveryIncidents(DEMO_MEILING_PATIENT_ID, fakeClient())).resolves.toEqual([])
    expect(queries).toHaveLength(0)
  })
})

describe('acknowledgeNotificationDeliveryIncident', () => {
  test('goes through the SECURITY DEFINER RPC with the displayed generation and reports acknowledged／closed／stale (PR #993 Codex P1)', async () => {
    rpcResult = { data: 'acknowledged', error: null }
    await expect(acknowledgeNotificationDeliveryIncident('i1', 3, fakeClient())).resolves.toBe('acknowledged')
    expect(rpcCalls).toEqual([{ name: 'acknowledge_notification_delivery_incident', args: { p_incident_id: 'i1', p_claim_generation: 3 } }])
    rpcResult = { data: 'closed', error: null }
    await expect(acknowledgeNotificationDeliveryIncident('i1', 3, fakeClient())).resolves.toBe('closed')
    rpcResult = { data: 'stale', error: null }
    await expect(acknowledgeNotificationDeliveryIncident('i1', 3, fakeClient())).resolves.toBe('stale')
    // 認不得的回傳（含舊版 RPC 的布林）與錯誤都 throw：不猜。
    rpcResult = { data: true, error: null }
    await expect(acknowledgeNotificationDeliveryIncident('i1', 3, fakeClient())).rejects.toThrow('Unable to acknowledge the notification delivery incident')
    rpcResult = { data: null, error: new Error('no can_record') }
    await expect(acknowledgeNotificationDeliveryIncident('i1', 3, fakeClient())).rejects.toThrow('Unable to acknowledge the notification delivery incident')
  })
})

describe('selectScopedIncidents (synchronous mask, PR #993 Codex P1)', () => {
  test('masks rows loaded for another patient on the very first render, before any effect runs', () => {
    const loaded = { patientId: 'p1', rows: [incident('p1-incident')], checkFailed: false, loading: false }
    expect(selectScopedIncidents('p1', loaded)).toBe(loaded)
    expect(selectScopedIncidents('p2', loaded)).toEqual({ rows: [], checkFailed: false, loading: true })
    // 讀取失敗旗標也是那位病人的：換人之後不能把上一位的「無法確認」帶到新病人畫面上。
    expect(selectScopedIncidents('p2', { patientId: 'p1', rows: [], checkFailed: true, loading: false })).toEqual({ rows: [], checkFailed: false, loading: true })
  })
})

// 既有的載入／切病人／結案測試不關心補查：注入不排程、不訂閱的版本，避免掛一個真的 60 秒計時器。
const noPolling = { schedule: () => () => {}, subscribeForeground: () => () => {} }

describe('useNotificationDeliveryIncidents', () => {
  const flush = () => new Promise(resolve => setTimeout(resolve, 0))

  test('loads the open incidents of the current patient and exposes them', async () => {
    const load = async () => [incident('i1')]
    const hook = renderHook(() => useNotificationDeliveryIncidents('p1', { ...noPolling, load, acknowledge: async () => 'acknowledged' as const }))
    expect(hook.current.loading).toBe(true)
    await flush()
    hook.rerender()
    expect(hook.current.loading).toBe(false)
    expect(hook.current.checkFailed).toBe(false)
    expect(hook.current.incidents.map(item => item.id)).toEqual(['i1'])
  })

  test('a failed read sets checkFailed and never presents an empty list as "no incidents"', async () => {
    const hook = renderHook(() => useNotificationDeliveryIncidents('p1', { ...noPolling, load: async () => { throw new Error('down') }, acknowledge: async () => 'acknowledged' as const }))
    await flush()
    hook.rerender()
    expect(hook.current.checkFailed).toBe(true)
    expect(hook.current.loading).toBe(false)
    expect(hook.current.incidents).toEqual([])
  })

  test('switching patient clears the list immediately and drops a slow response from the previous patient (§3.5)', async () => {
    const resolvers = new Map<string, (rows: NotificationDeliveryIncident[]) => void>()
    const load = (patientId: string) => new Promise<NotificationDeliveryIncident[]>(resolve => { resolvers.set(patientId, resolve) })
    let patientId = 'p1'
    const hook = renderHook(() => useNotificationDeliveryIncidents(patientId, { ...noPolling, load, acknowledge: async () => 'acknowledged' as const }))
    // p1 的資料先回來並顯示。
    resolvers.get('p1')?.([incident('p1-incident')])
    await flush()
    hook.rerender()
    expect(hook.current.incidents.map(item => item.id)).toEqual(['p1-incident'])
    // 切到 p2：清單立刻清空，不等 p2 回來。
    patientId = 'p2'
    hook.rerender()
    expect(hook.current.incidents).toEqual([])
    expect(hook.current.loading).toBe(true)
    // p1 的另一個慢回應此時才到：必須被丟掉。
    const staleLoad = load('p1')
    resolvers.get('p1')?.([incident('p1-late')])
    await staleLoad
    await flush()
    hook.rerender()
    expect(hook.current.incidents).toEqual([])
    // p2 回來才顯示 p2 的。
    resolvers.get('p2')?.([incident('p2-incident')])
    await flush()
    hook.rerender()
    expect(hook.current.incidents.map(item => item.id)).toEqual(['p2-incident'])
  })

  test('acknowledge removes the incident from the list on success (also when the RPC says it was already closed) and keeps it on failure', async () => {
    let ack: (id: string) => Promise<'acknowledged' | 'closed' | 'stale'> = async () => 'acknowledged'
    const hook = renderHook(() => useNotificationDeliveryIncidents('p1', { ...noPolling, load: async () => [incident('i1'), incident('i2')], acknowledge: id => ack(id) }))
    await flush()
    hook.rerender()
    await hook.current.acknowledge('i1')
    hook.rerender()
    expect(hook.current.incidents.map(item => item.id)).toEqual(['i2'])
    expect(hook.current.acknowledgeFailed).toBe(false)
    ack = async () => 'closed'
    await hook.current.acknowledge('i2')
    hook.rerender()
    expect(hook.current.incidents).toEqual([])
    // 失敗：保留（沒有它，看護會以為已處理），並標記失敗。
    const failing = renderHook(() => useNotificationDeliveryIncidents('p1', { ...noPolling, load: async () => [incident('i3')], acknowledge: async () => { throw new Error('denied') } }))
    await flush()
    failing.rerender()
    await failing.current.acknowledge('i3')
    failing.rerender()
    expect(failing.current.incidents.map(item => item.id)).toEqual(['i3'])
    expect(failing.current.acknowledgeFailed).toBe(true)
    expect(failing.current.acknowledgingId).toBeNull()
  })

  test('keeps refreshing while Today stays mounted: the poll tick reloads in the background without flashing "loading", is re-armed per patient and cancelled on unmount (PR #993 Codex P1)', async () => {
    let rows = [incident('i1')]
    const loads: string[] = []
    const load = async (patientId: string) => { loads.push(patientId); return rows }
    const scheduled: Array<{ tick: () => void; intervalMs: number; cancelled: boolean }> = []
    const schedule = (tick: () => void, intervalMs: number) => {
      const entry = { tick, intervalMs, cancelled: false }
      scheduled.push(entry)
      return () => { entry.cancelled = true }
    }
    let patientId = 'p1'
    const hook = renderHook(() => useNotificationDeliveryIncidents(patientId, { load, acknowledge: async () => 'acknowledged' as const, schedule, subscribeForeground: () => () => {} }))
    await flush()
    hook.rerender()
    expect(hook.current.incidents.map(item => item.id)).toEqual(['i1'])
    expect(scheduled).toHaveLength(1)
    expect(scheduled[0].intervalMs).toBe(INCIDENT_POLL_INTERVAL_MS)
    // sweeper 之後新開了一筆：下一個 tick 要把它帶進畫面；等待期間舊清單留著、不閃「載入中」。
    rows = [incident('i1'), incident('i2')]
    scheduled[0].tick()
    hook.rerender()
    expect(hook.current.loading).toBe(false)
    expect(hook.current.incidents.map(item => item.id)).toEqual(['i1'])
    await flush()
    hook.rerender()
    expect(hook.current.incidents.map(item => item.id)).toEqual(['i1', 'i2'])
    expect(loads).toEqual(['p1', 'p1'])
    // 切病人：舊排程取消、以新病人重新排程。
    rows = [incident('p2-i')]
    patientId = 'p2'
    hook.rerender()
    expect(scheduled[0].cancelled).toBe(true)
    const rearmed = scheduled.filter(entry => !entry.cancelled)
    expect(rearmed).toHaveLength(1)
    await flush()
    hook.rerender()
    expect(hook.current.incidents.map(item => item.id)).toEqual(['p2-i'])
    // 卸載：排程全部取消。
    hook.unmount()
    expect(scheduled.every(entry => entry.cancelled)).toBe(true)
  })

  test('a failed background poll shows "cannot confirm" instead of keeping the stale list as if it were just verified (Fail loudly)', async () => {
    let fail = false
    const load = async () => { if (fail) throw new Error('down'); return [incident('i1')] }
    let tick: (() => void) | null = null
    const hook = renderHook(() => useNotificationDeliveryIncidents('p1', { load, acknowledge: async () => 'acknowledged' as const, schedule: (callback: () => void) => { tick = callback; return () => {} }, subscribeForeground: () => () => {} }))
    await flush()
    hook.rerender()
    expect(hook.current.incidents.map(item => item.id)).toEqual(['i1'])
    fail = true
    tick!()
    await flush()
    hook.rerender()
    expect(hook.current.checkFailed).toBe(true)
    expect(hook.current.incidents).toEqual([])
    // 下一次補查成功就恢復。
    fail = false
    tick!()
    await flush()
    hook.rerender()
    expect(hook.current.checkFailed).toBe(false)
    expect(hook.current.incidents.map(item => item.id)).toEqual(['i1'])
    hook.unmount()
  })

  test('a poll tick while the document is hidden is skipped; returning to the foreground reloads immediately (PR #993 Codex P1)', async () => {
    const loads: string[] = []
    const load = async (patientId: string) => { loads.push(patientId); return [incident('i1')] }
    let tick: (() => void) | null = null
    let onForeground: (() => void) | null = null
    const hook = renderHook(() => useNotificationDeliveryIncidents('p1', {
      load,
      acknowledge: async () => 'acknowledged' as const,
      schedule: (callback: () => void) => { tick = callback; return () => {} },
      subscribeForeground: (callback: () => void) => { onForeground = callback; return () => {} },
    }))
    await flush()
    expect(loads).toEqual(['p1'])
    const globalRecord = globalThis as unknown as Record<string, unknown>
    const previousDocument = globalRecord.document
    globalRecord.document = { visibilityState: 'hidden' }
    try {
      tick!()
      await flush()
      expect(loads).toEqual(['p1'])
      // 回到前景：不看 visibilityState（事件本身就代表可見），立刻補查一次。
      onForeground!()
      await flush()
      expect(loads).toEqual(['p1', 'p1'])
      globalRecord.document = { visibilityState: 'visible' }
      tick!()
      await flush()
      expect(loads).toEqual(['p1', 'p1', 'p1'])
    } finally {
      globalRecord.document = previousDocument
    }
    hook.unmount()
  })

  test('an acknowledgement still in flight when the patient changes never leaves the new patient\'s button stuck on "Saving…" (PR #993 Codex P1)', async () => {
    let resolveAck: ((value: 'acknowledged' | 'closed' | 'stale') => void) | null = null
    let rejectAck: ((reason: unknown) => void) | null = null
    const acknowledge = () => new Promise<'acknowledged' | 'closed' | 'stale'>((resolve, reject) => { resolveAck = resolve; rejectAck = reject })
    let patientId = 'p1'
    const hook = renderHook(() => useNotificationDeliveryIncidents(patientId, { ...noPolling, load: async id => [incident(`${id}-i`)], acknowledge }))
    await flush()
    hook.rerender()
    const ackPromise = hook.current.acknowledge('p1-i')
    hook.rerender()
    expect(hook.current.acknowledgingId).toBe('p1-i')
    // 切到 p2：第一次 render 就必須是 null（同步遮罩），不等 effect。
    patientId = 'p2'
    hook.rerender()
    expect(hook.current.acknowledgingId).toBeNull()
    await flush()
    hook.rerender()
    expect(hook.current.incidents.map(item => item.id)).toEqual(['p2-i'])
    expect(hook.current.acknowledgingId).toBeNull()
    // p1 的結案這時才失敗：p2 的畫面不顯示失敗、也不會被卡住。
    rejectAck!(new Error('denied'))
    await ackPromise
    hook.rerender()
    expect(hook.current.acknowledgingId).toBeNull()
    expect(hook.current.acknowledgeFailed).toBe(false)
    // p2 自己的結案照常運作。
    const p2Ack = hook.current.acknowledge('p2-i')
    hook.rerender()
    expect(hook.current.acknowledgingId).toBe('p2-i')
    resolveAck!('acknowledged')
    await p2Ack
    hook.rerender()
    expect(hook.current.acknowledgingId).toBeNull()
    expect(hook.current.incidents).toEqual([])
    // 純函式：只有目前病人的進行中結案才算。
    expect(selectScopedAcknowledgingId('p2', [{ patientId: 'p1', incidentId: 'a' }, { patientId: 'p2', incidentId: 'b' }])).toBe('b')
    expect(selectScopedAcknowledgingId('p3', [{ patientId: 'p1', incidentId: 'a' }])).toBeNull()
  })

  test('a background load that snapshotted an incident before it was acknowledged cannot restore it when its response arrives later (PR #993 Codex P2)', async () => {
    const resolvers: Array<(rows: NotificationDeliveryIncident[]) => void> = []
    const load = () => new Promise<NotificationDeliveryIncident[]>(resolve => { resolvers.push(resolve) })
    let tick: (() => void) | null = null
    const hook = renderHook(() => useNotificationDeliveryIncidents('p1', { load, acknowledge: async () => 'acknowledged' as const, schedule: (callback: () => void) => { tick = callback; return () => {} }, subscribeForeground: () => () => {} }))
    resolvers[0]([incident('i1')])
    await flush()
    hook.rerender()
    expect(hook.current.incidents.map(item => item.id)).toEqual(['i1'])
    // 補查先發出（伺服器此時 i1 仍 open），回應還沒回來。
    tick!()
    expect(resolvers).toHaveLength(2)
    // 看護按「已處理」成功：畫面立刻移除。
    await hook.current.acknowledge('i1')
    hook.rerender()
    expect(hook.current.incidents).toEqual([])
    // 舊快照這時才到：必須被丟掉，不能把剛結掉的告警放回來。
    resolvers[1]([incident('i1')])
    await flush()
    hook.rerender()
    expect(hook.current.incidents).toEqual([])
    expect(hook.current.acknowledgingId).toBeNull()
    // 結案之後才發出的補查讀到伺服器新狀態（空）→ 仍空；之後 sweeper 真的重開（世代前進）→ 正常顯示。
    tick!()
    resolvers[2]([])
    await flush()
    hook.rerender()
    expect(hook.current.incidents).toEqual([])
    tick!()
    resolvers[3]([incident('i1')])
    await flush()
    hook.rerender()
    expect(hook.current.incidents.map(item => item.id)).toEqual(['i1'])
    hook.unmount()
  })

  test('an acknowledgement failure sticks to the failed incident only and is discarded once that incident is no longer open (PR #993 Codex P2)', async () => {
    let rows = [incident('i1')]
    let tick: (() => void) | null = null
    const hook = renderHook(() => useNotificationDeliveryIncidents('p1', { load: async () => rows, acknowledge: async () => { throw new Error('denied') }, schedule: (callback: () => void) => { tick = callback; return () => {} }, subscribeForeground: () => () => {} }))
    await flush()
    hook.rerender()
    await hook.current.acknowledge('i1')
    hook.rerender()
    expect(hook.current.acknowledgeFailed).toBe(true)
    // i1 被別人結掉、同一位病人新開了 i2：新橫幅不得頂著 i1 的失敗。
    rows = [incident('i2')]
    tick!()
    await flush()
    hook.rerender()
    expect(hook.current.incidents.map(item => item.id)).toEqual(['i2'])
    expect(hook.current.acknowledgeFailed).toBe(false)
    // i1 之後重開（世代前進）：舊失敗已丟掉，不再顯示。
    rows = [incident('i1'), incident('i2')]
    tick!()
    await flush()
    hook.rerender()
    expect(hook.current.acknowledgeFailed).toBe(false)
    // 再失敗一次 i2：只要 i2 還在畫面上就顯示；再按一次 i2 先清掉這一筆的記號（按鈕期間不顯示失敗）。
    await hook.current.acknowledge('i2')
    hook.rerender()
    expect(hook.current.acknowledgeFailed).toBe(true)
    // 純函式：失敗只在那筆 incident 的同一世代仍 open 且屬於目前病人時成立。
    const failures = [{ patientId: 'p1', incidentId: 'i2', generation: 1 }]
    expect(selectScopedAcknowledgeFailed('p1', [incident('i2')], failures)).toBe(true)
    expect(selectScopedAcknowledgeFailed('p1', [incident('i2', 'delivery_unknown', 2)], failures)).toBe(false)
    expect(selectScopedAcknowledgeFailed('p1', [incident('i3')], failures)).toBe(false)
    expect(selectScopedAcknowledgeFailed('p2', [incident('i2')], failures)).toBe(false)
    hook.unmount()
  })

  test('an old patient\'s acknowledgement completing after a switch does not discard the new patient\'s in-flight load (PR #993 Codex P2)', async () => {
    const resolvers = new Map<string, (rows: NotificationDeliveryIncident[]) => void>()
    const load = (patientId: string) => new Promise<NotificationDeliveryIncident[]>(resolve => { resolvers.set(patientId, resolve) })
    let resolveAck: ((value: 'acknowledged' | 'closed' | 'stale') => void) | null = null
    const acknowledge = () => new Promise<'acknowledged' | 'closed' | 'stale'>(resolve => { resolveAck = resolve })
    let patientId = 'p1'
    const hook = renderHook(() => useNotificationDeliveryIncidents(patientId, { ...noPolling, load, acknowledge }))
    resolvers.get('p1')?.([incident('p1-i')])
    await flush()
    hook.rerender()
    const ack = hook.current.acknowledge('p1-i')
    hook.rerender()
    // 切到 p2：p2 的重設載入還在路上。
    patientId = 'p2'
    hook.rerender()
    expect(hook.current.loading).toBe(true)
    // p1 的結案這時才成功：不得讓 p2 在途的載入作廢。
    resolveAck!('acknowledged')
    await ack
    hook.rerender()
    resolvers.get('p2')?.([incident('p2-i')])
    await flush()
    hook.rerender()
    expect(hook.current.loading).toBe(false)
    expect(hook.current.incidents.map(item => item.id)).toEqual(['p2-i'])
  })

  test('a failure that arrives after a load already removed the incident is not recorded, so a later reopen of the same id shows no stale failure (PR #993 Codex P2)', async () => {
    let rows = [incident('i1')]
    let rejectAck: ((reason: unknown) => void) | null = null
    const acknowledge = () => new Promise<'acknowledged' | 'closed' | 'stale'>((_resolve, reject) => { rejectAck = reject })
    let tick: (() => void) | null = null
    const hook = renderHook(() => useNotificationDeliveryIncidents('p1', { load: async () => rows, acknowledge, schedule: (callback: () => void) => { tick = callback; return () => {} }, subscribeForeground: () => () => {} }))
    await flush()
    hook.rerender()
    const ack = hook.current.acknowledge('i1')
    hook.rerender()
    // 等待結案期間，補查發現 i1 已被別人結掉。
    rows = []
    tick!()
    await flush()
    hook.rerender()
    expect(hook.current.incidents).toEqual([])
    // 結案這時才失敗：i1 已不在畫面上，不記失敗。
    rejectAck!(new Error('denied'))
    await ack
    hook.rerender()
    expect(hook.current.acknowledgeFailed).toBe(false)
    // 同一個 id 之後因世代前進重開：不得頂著上一個世代的失敗。
    rows = [incident('i1')]
    tick!()
    await flush()
    hook.rerender()
    expect(hook.current.incidents.map(item => item.id)).toEqual(['i1'])
    expect(hook.current.acknowledgeFailed).toBe(false)
    hook.unmount()
  })

  test('every write to the loaded rows goes through commitLoaded, which updates the ref synchronously before setState (PR #993 Codex P2)', () => {
    // 這個 harness 的 setState 是同步 render，重現不了 React 18 在 Promise 回呼裡的批次；改以原始碼契約鎖死：
    // 只有 commitLoaded 會 setLoaded，而它先寫 ref 再 setState，所以 catch 讀 loadedRef 時一定是最新已提交的列。
    const hookSource = readFileSync(new URL('../../src/features/today/hooks/useNotificationDeliveryIncidents.ts', import.meta.url), 'utf8')
    expect(hookSource.match(/setLoaded\(/g)).toHaveLength(1)
    expect(hookSource).toContain('const commitLoaded = useCallback((next: LoadedIncidents) => {\n    loadedRef.current = next\n    setLoaded(next)\n  }, [])')
    // 四個提交點：切病人重設、載入成功、載入失敗、結案成功後的移除。
    expect(hookSource.match(/commitLoaded\(/g)).toHaveLength(4)
    expect(hookSource).toContain('const openRow = loadedRef.current.patientId === entry.patientId ? loadedRef.current.rows.find(incident => incident.id === incidentId) : undefined')
  })

  test('a failure is bound to the incident generation: the same id reopened in place with a higher claim_generation_seen shows no stale failure (PR #993 Codex P2)', async () => {
    let rows = [incident('i1', 'delivery_unknown', 1)]
    let tick: (() => void) | null = null
    const hook = renderHook(() => useNotificationDeliveryIncidents('p1', { load: async () => rows, acknowledge: async () => { throw new Error('denied') }, schedule: (callback: () => void) => { tick = callback; return () => {} }, subscribeForeground: () => () => {} }))
    await flush()
    hook.rerender()
    await hook.current.acknowledge('i1')
    hook.rerender()
    expect(hook.current.acknowledgeFailed).toBe(true)
    // 兩次補查之間：別人結掉 → sweeper 就地重開（id 不變、世代 1 → 2）。下一次補查仍回 i1，但已是新一代。
    rows = [incident('i1', 'delivery_unknown', 2)]
    tick!()
    await flush()
    hook.rerender()
    expect(hook.current.incidents.map(item => item.id)).toEqual(['i1'])
    expect(hook.current.acknowledgeFailed).toBe(false)
    // 同一世代仍在：失敗照樣顯示（沒有被誤清）。
    await hook.current.acknowledge('i1')
    hook.rerender()
    expect(hook.current.acknowledgeFailed).toBe(true)
    tick!()
    await flush()
    hook.rerender()
    expect(hook.current.acknowledgeFailed).toBe(true)
    hook.unmount()
  })

  test('acknowledges with the displayed generation; a stale answer keeps the row and reloads instead of removing it (PR #993 Codex P1)', async () => {
    let rows = [incident('i1', 'delivery_unknown', 4)]
    const acknowledged: Array<[string, number]> = []
    let outcome: 'acknowledged' | 'closed' | 'stale' = 'stale'
    const loads: number[] = []
    const hook = renderHook(() => useNotificationDeliveryIncidents('p1', { ...noPolling, load: async () => { loads.push(rows[0]?.generation ?? 0); return rows }, acknowledge: async (id: string, generation: number) => { acknowledged.push([id, generation]); return outcome } }))
    await flush()
    hook.rerender()
    // 交出畫面上的世代 4；RPC 回 stale（sweeper 已把同一筆 id 推進到世代 5）→ 不移除、重讀，重讀後看到新一代的告警。
    rows = [incident('i1', 'delivery_unknown', 5)]
    await hook.current.acknowledge('i1')
    await flush()
    hook.rerender()
    expect(acknowledged).toEqual([['i1', 4]])
    expect(hook.current.incidents.map(item => [item.id, item.generation])).toEqual([['i1', 5]])
    expect(hook.current.acknowledgingId).toBeNull()
    expect(hook.current.acknowledgeFailed).toBe(false)
    expect(loads.length).toBe(2)
    // 現在用世代 5 結案：acknowledged → 移除。
    outcome = 'acknowledged'
    await hook.current.acknowledge('i1')
    hook.rerender()
    expect(acknowledged).toEqual([['i1', 4], ['i1', 5]])
    expect(hook.current.incidents).toEqual([])
    // 畫面上沒有這筆（補查剛移除）：不打 RPC，直接重讀。
    await hook.current.acknowledge('i9')
    await flush()
    expect(acknowledged).toHaveLength(2)
    expect(loads.length).toBe(3)
  })

  test('an acknowledgement that completes after a poll already committed a newer generation keeps that newer alert and reloads (PR #993 Codex P1)', async () => {
    let rows = [incident('i1', 'delivery_unknown', 1)]
    let resolveAck: ((value: 'acknowledged' | 'closed' | 'stale') => void) | null = null
    const acknowledge = () => new Promise<'acknowledged' | 'closed' | 'stale'>(resolve => { resolveAck = resolve })
    let tick: (() => void) | null = null
    const loads: number[] = []
    const hook = renderHook(() => useNotificationDeliveryIncidents('p1', { load: async () => { loads.push(rows[0]?.generation ?? 0); return rows }, acknowledge, schedule: (callback: () => void) => { tick = callback; return () => {} }, subscribeForeground: () => () => {} }))
    await flush()
    hook.rerender()
    const ack = hook.current.acknowledge('i1')
    hook.rerender()
    // RPC 已在伺服器提交（世代 1 結案），回應還在路上；sweeper 重開成世代 2，補查把它提交進畫面。
    rows = [incident('i1', 'delivery_unknown', 2)]
    tick!()
    await flush()
    hook.rerender()
    expect(hook.current.incidents.map(item => [item.id, item.generation])).toEqual([['i1', 2]])
    // 結案回應這時才到：畫面上的是世代 2，不是結掉的那一代 → 保留，並重讀。
    resolveAck!('acknowledged')
    await ack
    await flush()
    hook.rerender()
    expect(hook.current.incidents.map(item => [item.id, item.generation])).toEqual([['i1', 2]])
    expect(hook.current.acknowledgingId).toBeNull()
    expect(loads.length).toBe(3)
    // 對照：世代沒變時照常移除。
    const plain = renderHook(() => useNotificationDeliveryIncidents('p1', { ...noPolling, load: async () => [incident('i2', 'delivery_unknown', 7)], acknowledge: async () => 'acknowledged' as const }))
    await flush()
    plain.rerender()
    await plain.current.acknowledge('i2')
    plain.rerender()
    expect(plain.current.incidents).toEqual([])
  })

  test('a failure that arrives after a poll committed a newer generation is not recorded against that newer generation (PR #993 Codex P2)', async () => {
    let rows = [incident('i1', 'delivery_unknown', 1)]
    let rejectAck: ((reason: unknown) => void) | null = null
    const acknowledge = () => new Promise<'acknowledged' | 'closed' | 'stale'>((_resolve, reject) => { rejectAck = reject })
    let tick: (() => void) | null = null
    const hook = renderHook(() => useNotificationDeliveryIncidents('p1', { load: async () => rows, acknowledge, schedule: (callback: () => void) => { tick = callback; return () => {} }, subscribeForeground: () => () => {} }))
    await flush()
    hook.rerender()
    const ack = hook.current.acknowledge('i1')
    hook.rerender()
    // 結案（世代 1）還在路上時，補查提交了世代 2。
    rows = [incident('i1', 'delivery_unknown', 2)]
    tick!()
    await flush()
    hook.rerender()
    // RPC 這時才失敗：失敗屬於世代 1，不能記到畫面上的世代 2。
    rejectAck!(new Error('network down'))
    await ack
    hook.rerender()
    expect(hook.current.incidents.map(item => [item.id, item.generation])).toEqual([['i1', 2]])
    expect(hook.current.acknowledgeFailed).toBe(false)
    hook.unmount()
  })

  test('the replacement reload started after a newer-generation completion is not invalidated by the same completion (PR #993 Codex P2)', async () => {
    let rows = [incident('i1', 'delivery_unknown', 1)]
    let resolveAck: ((value: 'acknowledged' | 'closed' | 'stale') => void) | null = null
    const acknowledge = () => new Promise<'acknowledged' | 'closed' | 'stale'>(resolve => { resolveAck = resolve })
    let tick: (() => void) | null = null
    const pendingLoads: Array<(value: NotificationDeliveryIncident[]) => void> = []
    let deferLoads = false
    const load = (): Promise<NotificationDeliveryIncident[]> => (deferLoads ? new Promise(resolve => { pendingLoads.push(resolve) }) : Promise.resolve(rows))
    const hook = renderHook(() => useNotificationDeliveryIncidents('p1', { load, acknowledge, schedule: (callback: () => void) => { tick = callback; return () => {} }, subscribeForeground: () => () => {} }))
    await flush()
    hook.rerender()
    const ack = hook.current.acknowledge('i1')
    hook.rerender()
    // 補查提交世代 2。
    rows = [incident('i1', 'delivery_unknown', 2)]
    tick!()
    await flush()
    hook.rerender()
    // 結案（世代 1）成功回來：畫面上是世代 2 → 保留並發出替代重讀；把這次重讀延後，先完成結案回呼。
    deferLoads = true
    resolveAck!('acknowledged')
    await ack
    hook.rerender()
    expect(pendingLoads).toHaveLength(1)
    // 重讀回來時世代 2 已被別人結掉：替代重讀必須仍然有效，畫面要清空，不能沿用舊列。
    pendingLoads[0]([])
    await flush()
    hook.rerender()
    expect(hook.current.incidents).toEqual([])
    hook.unmount()
  })

  test('the banner\'s "acknowledge all" fires several acknowledgements at once; the button stays pending until the last one settles', async () => {
    const resolvers: Array<(value: 'acknowledged' | 'closed' | 'stale') => void> = []
    const acknowledge = () => new Promise<'acknowledged' | 'closed' | 'stale'>(resolve => { resolvers.push(resolve) })
    const hook = renderHook(() => useNotificationDeliveryIncidents('p1', { ...noPolling, load: async () => [incident('i1'), incident('i2')], acknowledge }))
    await flush()
    hook.rerender()
    const first = hook.current.acknowledge('i1')
    const second = hook.current.acknowledge('i2')
    hook.rerender()
    expect(hook.current.acknowledgingId).not.toBeNull()
    resolvers[1]('acknowledged')
    await second
    hook.rerender()
    expect(hook.current.acknowledgingId).toBe('i1')
    resolvers[0]('acknowledged')
    await first
    hook.rerender()
    expect(hook.current.acknowledgingId).toBeNull()
    expect(hook.current.incidents).toEqual([])
  })
})
