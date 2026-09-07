/*
檔案用途：驗證未來行程的 Edge Function 轉接、同時刻排序，以及切換病人時不得殘留上一位行程的讀取 hook。
所在層：tests/unit；用 Supabase client 與 fetch stub 取代真實 Edge Function。
主要關聯：src/lib/calendarAgenda.ts、src/hooks/useUpcomingSchedule.ts 與 UpcomingSchedulePage。
*/
import { beforeEach, describe, expect, mock, test } from 'bun:test'
import { installReactHookHarness, renderHook } from './helpers/reactHookHarness'

installReactHookHarness()

type InvokeResult = { data?: unknown; error?: unknown }
const invocations: Array<{ name: string; body: unknown }> = []
let invokeResult: InvokeResult = { data: { events: [] }, error: null }

mock.module('../../src/lib/supabase', () => ({
  supabase: {
    functions: {
      invoke: (name: string, options: { body: unknown }) => {
        invocations.push({ name, body: options.body })
        return Promise.resolve(invokeResult)
      },
    },
  },
}))

const calendarAgenda = await import('../../src/lib/calendarAgenda')
const { fetchCalendarAgenda, groupUpcomingSchedule } = calendarAgenda

type AgendaResponse = Awaited<ReturnType<typeof fetchCalendarAgenda>>
let agendaResponder: (patientId: string) => Promise<AgendaResponse> = () => Promise.resolve({ events: [], notConfigured: false })

mock.module('../../src/lib/calendarAgenda', () => ({
  ...calendarAgenda,
  fetchCalendarAgenda: (patientId: string) => agendaResponder(patientId),
}))

const { useUpcomingSchedule, scheduleScopeKey, selectScopedScheduleState } = await import('../../src/hooks/useUpcomingSchedule')

const eventKey = (seed: string) => seed.repeat(64).slice(0, 64)

beforeEach(() => {
  invocations.length = 0
  invokeResult = { data: { events: [] }, error: null }
  agendaResponder = () => Promise.resolve({ events: [], notConfigured: false })
})

describe('fetchCalendarAgenda transport', () => {
  test('sends the patient and range to the calendar-agenda function', async () => {
    invokeResult = { data: { events: [], notConfigured: true }, error: null }
    await expect(fetchCalendarAgenda('patient-1', 14, new AbortController().signal)).resolves.toEqual({ events: [], notConfigured: true })
    expect(invocations).toEqual([{ name: 'calendar-agenda', body: { patientId: 'patient-1', days: 14 } }])
  })

  test('refuses a range the Edge Function does not accept', async () => {
    await expect(fetchCalendarAgenda('patient-1', 30 as 7, new AbortController().signal)).rejects.toThrow('calendar agenda range is invalid')
    expect(invocations).toHaveLength(0)
  })

  test('hides transport details behind one request failure error', async () => {
    invokeResult = { data: null, error: new Error('network down') }
    await expect(fetchCalendarAgenda('patient-1', 7, new AbortController().signal)).rejects.toThrow('calendar agenda request failed')
  })
})

describe('same-instant agenda ordering', () => {
  test('puts an all-day event before a timed event that starts at the same moment', () => {
    const allDay = { key: eventKey('a'), summary: 'Kunjungan', start: '2026-08-20', end: '2026-08-21', allDay: true }
    const timed = { key: eventKey('b'), summary: 'Klinik', start: '2026-08-20T00:00:00+08:00', end: '2026-08-20T01:00:00+08:00', allDay: false }
    expect(groupUpcomingSchedule([timed, allDay])[0]?.events.map(event => event.key)).toEqual([allDay.key, timed.key])
  })

  test('breaks a full tie with a stable key order instead of an arbitrary one', () => {
    const first = { key: eventKey('1'), summary: 'A', start: '2026-08-20T09:00:00+08:00', end: '2026-08-20T10:00:00+08:00', allDay: false }
    const second = { key: eventKey('2'), summary: 'B', start: '2026-08-20T09:00:00+08:00', end: '2026-08-20T10:00:00+08:00', allDay: false }
    expect(groupUpcomingSchedule([second, first])[0]?.events.map(event => event.key)).toEqual([first.key, second.key])
  })
})

describe('useUpcomingSchedule patient isolation', () => {
  test('scope keys separate patient, range, and demo mode', () => {
    expect(scheduleScopeKey('patient-1', 7, false)).toBe('patient-1:7:live')
    expect(scheduleScopeKey('patient-1', 7, true)).toBe('patient-1:7:demo')
    expect(scheduleScopeKey('patient-2', 14, false)).toBe('patient-2:14:live')
  })

  test('blanks out another patient state before the effect can clear it', () => {
    const state = { events: [{ key: eventKey('c'), summary: 'X', start: '2026-08-20', end: '2026-08-21', allDay: true }], status: 'ready' as const, updatedAt: new Date() }
    expect(selectScopedScheduleState('patient-2:7:live', 'patient-1:7:live', state)).toEqual({ events: [], status: 'loading', updatedAt: null })
    expect(selectScopedScheduleState('patient-2:7:demo', 'patient-1:7:demo', state)).toEqual({ events: [], status: 'demo', updatedAt: null })
    expect(selectScopedScheduleState('patient-1:7:live', 'patient-1:7:live', state)).toBe(state)
  })

  test('loads events for the active patient and can refresh them', async () => {
    const meeting = { key: eventKey('d'), summary: 'Kontrol', start: '2026-08-20T09:00:00+08:00', end: '2026-08-20T10:00:00+08:00', allDay: false }
    let served = 0
    agendaResponder = () => { served += 1; return Promise.resolve({ events: [meeting], notConfigured: false }) }

    let patientId = 'patient-1'
    const hook = renderHook(() => useUpcomingSchedule(patientId, 7, false))
    expect(hook.current.status).toBe('loading')
    await Promise.resolve()
    await Promise.resolve()
    expect(hook.current.status).toBe('ready')
    expect(hook.current.events).toEqual([meeting])
    expect(hook.current.updatedAt).toBeInstanceOf(Date)

    hook.act(() => hook.current.refresh())
    await Promise.resolve()
    await Promise.resolve()
    expect(served).toBe(2)

    // 切換病人時，render 當下就必須看不到上一位的行程，不能等 effect 之後才清空。
    patientId = 'patient-2'
    expect(hook.rerender().events).toEqual([])
    hook.unmount()
  })

  test('reports the not-configured state instead of an error when no calendar is linked', async () => {
    agendaResponder = () => Promise.resolve({ events: [], notConfigured: true })
    const hook = renderHook(() => useUpcomingSchedule('patient-1', 14, false))
    await Promise.resolve()
    await Promise.resolve()
    expect(hook.current.status).toBe('notConfigured')
    hook.unmount()
  })

  test('surfaces a failed request as an error state', async () => {
    agendaResponder = () => Promise.reject(new Error('calendar agenda request failed'))
    const hook = renderHook(() => useUpcomingSchedule('patient-1', 7, false))
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
    expect(hook.current.status).toBe('error')
    hook.unmount()
  })

  test('demo mode never calls the Edge Function', async () => {
    let called = false
    agendaResponder = () => { called = true; return Promise.resolve({ events: [], notConfigured: false }) }
    const hook = renderHook(() => useUpcomingSchedule('demo-patient', 7, true))
    await Promise.resolve()
    expect(hook.current.status).toBe('demo')
    expect(called).toBe(false)
    hook.unmount()
  })
})
