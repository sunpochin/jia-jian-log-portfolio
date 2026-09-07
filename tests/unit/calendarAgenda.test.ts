/*
檔案用途：驗證未來行程的天數限制、台北日期分組、排序與前端敏感欄位白名單。
所在層：tests/unit；不呼叫 Supabase、Google 或 localStorage，保護純資料轉接契約。
主要關聯：src/lib/calendarAgenda.ts、UpcomingScheduleList 與 calendar-agenda Edge Function。
*/
import { describe, expect, test } from 'bun:test'
import { agendaDateKey, groupUpcomingSchedule, isAgendaDays, parseAgendaResponse } from '../../src/lib/calendarAgenda'
import { scheduleScopeKey, selectScopedScheduleState } from '../../src/hooks/useUpcomingSchedule'

describe('calendar agenda adapter', () => {
  test('accepts only the two supported future ranges', () => {
    expect(isAgendaDays(7)).toBe(true)
    expect(isAgendaDays(14)).toBe(true)
    expect(isAgendaDays(1)).toBe(false)
    expect(isAgendaDays('7')).toBe(false)
  })

  test('keeps timed, all-day and recurring instances while dropping sensitive response fields', () => {
    const parsed = parseAgendaResponse({
      events: [
        { key: 'a'.repeat(64), summary: '回診', start: '2026-08-14T08:30:00.000Z', end: '2026-08-14T09:00:00.000Z', allDay: false, location: '診所', id: 'raw-google-id', description: 'private', attendees: ['private@example.com'] },
        { key: 'b'.repeat(64), summary: '休息', start: '2026-08-15', end: '2026-08-16', allDay: true },
        { key: 'c'.repeat(64), summary: '復健', start: '2026-08-21T08:30:00.000Z', end: '2026-08-21T09:00:00.000Z', allDay: false },
      ],
    })
    expect(parsed.events).toHaveLength(3)
    expect(parsed.events[0]).toEqual({ key: 'a'.repeat(64), summary: '回診', start: '2026-08-14T08:30:00.000Z', end: '2026-08-14T09:00:00.000Z', allDay: false, location: '診所' })
    expect('description' in parsed.events[0]).toBe(false)
    expect('id' in parsed.events[0]).toBe(false)
    expect('attendees' in parsed.events[0]).toBe(false)
  })

  test('groups at the Taipei date boundary and sorts events by start time', () => {
    const events = parseAgendaResponse({ events: [
      { key: 'a'.repeat(64), summary: 'later', start: '2026-08-14T17:00:00.000Z', end: '2026-08-14T18:00:00.000Z', allDay: false },
      { key: 'b'.repeat(64), summary: 'boundary', start: '2026-08-14T16:00:00.000Z', end: '2026-08-14T16:30:00.000Z', allDay: false },
      { key: 'c'.repeat(64), summary: 'all day', start: '2026-08-14', end: '2026-08-15', allDay: true },
    ] }).events
    expect(agendaDateKey(events[1])).toBe('2026-08-15')
    expect(groupUpcomingSchedule(events)).toEqual([
      { date: '2026-08-14', events: [events[2]] },
      { date: '2026-08-15', events: [events[1], events[0]] },
    ])
  })

  test('fails closed for malformed server events and hides a previous scope before effects run', () => {
    expect(() => parseAgendaResponse({ events: [{ key: 'x'.repeat(64), summary: 'bad', start: '2026-08-14T10:00:00Z', end: '2026-08-14T09:00:00Z', allDay: false }] })).toThrow('calendar agenda event is invalid')
    expect(() => parseAgendaResponse({ events: [], notConfigured: 'yes' })).toThrow('calendar agenda configuration state is invalid')
    expect(() => parseAgendaResponse({ events: [{ key: 'x'.repeat(64), summary: 'bad date', start: '2026-02-30', end: '2026-03-03', allDay: true }] })).toThrow('calendar agenda event is invalid')
    expect(() => parseAgendaResponse({ events: [{ key: 'x'.repeat(64), summary: 'missing timezone', start: '2026-08-14T10:00:00', end: '2026-08-14T11:00:00', allDay: false }] })).toThrow('calendar agenda event is invalid')
    const prior = { events: [{ key: 'd'.repeat(64), summary: 'A', start: '2026-08-14T08:00:00Z', end: '2026-08-14T09:00:00Z', allDay: false }], status: 'ready' as const, updatedAt: new Date() }
    expect(selectScopedScheduleState(scheduleScopeKey('b', 7, false), scheduleScopeKey('a', 7, false), prior)).toMatchObject({ events: [], status: 'loading', updatedAt: null })
  })
})
