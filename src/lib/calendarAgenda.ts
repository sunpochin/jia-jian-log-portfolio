/*
檔案用途：定義未來行程的瀏覽器資料契約、日期分組與 Edge Function 薄轉接。
所在層：src/lib；不保存日曆內容，僅在呼叫期間把已授權的 response 交給 hook。
主要關聯：useUpcomingSchedule、UpcomingSchedulePage、calendar-agenda Edge Function 與 Supabase session。
*/
import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import timezone from 'dayjs/plugin/timezone'
import { supabase } from './supabase'
import { TZ } from './timezone'

dayjs.extend(utc)
dayjs.extend(timezone)

export type AgendaDays = 7 | 14
export type UpcomingScheduleEvent = {
  key: string
  summary: string
  start: string
  end: string
  allDay: boolean
  location?: string
}

export type AgendaResponse = { events: UpcomingScheduleEvent[]; notConfigured?: boolean }

export function isAgendaDays(value: unknown): value is AgendaDays {
  return value === 7 || value === 14
}

// 為什麼只挑白名單欄位：即使 server 未來錯誤多回傳 Google metadata，前端也不把敏感欄位帶進 React state。
export function parseAgendaResponse(value: unknown): AgendaResponse {
  if (!value || typeof value !== 'object') throw new Error('calendar agenda response is invalid')
  const response = value as { events?: unknown; notConfigured?: unknown }
  if (!Array.isArray(response.events)) throw new Error('calendar agenda events are invalid')
  if (response.notConfigured !== undefined && typeof response.notConfigured !== 'boolean') throw new Error('calendar agenda configuration state is invalid')
  return {
    events: response.events.map(event => {
      if (!event || typeof event !== 'object') throw new Error('calendar agenda event is invalid')
      const row = event as Record<string, unknown>
      if (!isValidAgendaEvent(row)) throw new Error('calendar agenda event is invalid')
      return {
        key: row.key,
        summary: row.summary,
        start: row.start,
        end: row.end,
        allDay: row.allDay,
        ...(typeof row.location === 'string' && row.location.trim() ? { location: row.location } : {}),
      }
    }),
    notConfigured: response.notConfigured === true,
  }
}

export function agendaDateKey(event: UpcomingScheduleEvent): string {
  return event.allDay ? event.start : dayjs(event.start).tz(TZ).format('YYYY-MM-DD')
}

export function groupUpcomingSchedule(events: UpcomingScheduleEvent[]): Array<{ date: string; events: UpcomingScheduleEvent[] }> {
  const sorted = [...events].sort(compareUpcomingScheduleEvents)
  const groups = new Map<string, UpcomingScheduleEvent[]>()
  for (const event of sorted) {
    const date = agendaDateKey(event)
    groups.set(date, [...(groups.get(date) ?? []), event])
  }
  return [...groups.entries()].map(([date, groupedEvents]) => ({ date, events: groupedEvents }))
}

export async function fetchCalendarAgenda(patientId: string, days: AgendaDays, signal: AbortSignal): Promise<AgendaResponse> {
  if (!isAgendaDays(days)) throw new Error('calendar agenda range is invalid')
  const { data, error } = await supabase.functions.invoke('calendar-agenda', { body: { patientId, days }, signal })
  if (error) throw new Error('calendar agenda request failed')
  return parseAgendaResponse(data)
}

type ValidAgendaEventRow = Record<string, unknown> & {
  key: string
  summary: string
  start: string
  end: string
  allDay: boolean
  location?: string
}

function isValidAgendaEvent(row: Record<string, unknown>): row is ValidAgendaEventRow {
  if (typeof row.key !== 'string' || !/^[0-9a-f]{64}$/u.test(row.key) || typeof row.summary !== 'string' || typeof row.start !== 'string' || typeof row.end !== 'string' || typeof row.allDay !== 'boolean') return false
  if (row.location !== undefined && typeof row.location !== 'string') return false
  if (row.allDay) return isCalendarDate(row.start) && isCalendarDate(row.end) && row.end > row.start
  const start = parseAgendaInstant(row.start)
  const end = parseAgendaInstant(row.end)
  return start !== null && end !== null && end > start
}

function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false
  const parsed = new Date(`${value}T00:00:00.000Z`)
  // 為什麼要 round-trip：Date.parse 會把不存在的 2/30 自動捲到 3 月，不能讓錯誤行程悄悄換一天。
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value
}

function parseAgendaInstant(value: string): number | null {
  const pattern = /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,9})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/u
  if (!pattern.test(value) || !isCalendarDate(value.slice(0, 10))) return null
  const instant = Date.parse(value)
  return Number.isNaN(instant) ? null : instant
}

function compareUpcomingScheduleEvents(left: UpcomingScheduleEvent, right: UpcomingScheduleEvent): number {
  const leftInstant = left.allDay ? Date.parse(`${left.start}T00:00:00+08:00`) : Date.parse(left.start)
  const rightInstant = right.allDay ? Date.parse(`${right.start}T00:00:00+08:00`) : Date.parse(right.start)
  if (leftInstant !== rightInstant) return leftInstant - rightInstant
  if (left.allDay !== right.allDay) return left.allDay ? -1 : 1
  return left.start.localeCompare(right.start) || left.end.localeCompare(right.end) || left.key.localeCompare(right.key)
}
