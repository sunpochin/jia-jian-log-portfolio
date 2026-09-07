/*
檔案用途：依目前病人與天數讀取未來行程，並在切換時取消舊請求。
所在層：src/hooks；供 UpcomingSchedulePage 使用，隔離 loading、stale response 與 retry 狀態。
主要關聯：src/lib/calendarAgenda.ts、calendar-agenda Edge Function 與 active patient selection。
*/
import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchCalendarAgenda, type AgendaDays, type UpcomingScheduleEvent } from '../lib/calendarAgenda'

export type UpcomingScheduleStatus = 'loading' | 'ready' | 'notConfigured' | 'error' | 'demo'

export function scheduleScopeKey(patientId: string, days: AgendaDays, isDemoMode: boolean): string {
  return `${patientId}:${days}:${isDemoMode ? 'demo' : 'live'}`
}

export function selectScopedScheduleState<T extends { events: UpcomingScheduleEvent[]; status: UpcomingScheduleStatus; updatedAt: Date | null }>(
  currentScope: string,
  stateScope: string | null,
  state: T,
): T {
  // 為什麼 render 前再比 scope：useEffect 在 render 之後才清空，切換病人當下不能讓上一位的行程先閃一格。
  if (currentScope === stateScope) return state
  return { ...state, events: [], status: currentScope.endsWith(':demo') ? 'demo' : 'loading', updatedAt: null }
}

export function useUpcomingSchedule(patientId: string, days: AgendaDays, isDemoMode: boolean) {
  const [events, setEvents] = useState<UpcomingScheduleEvent[]>([])
  const [status, setStatus] = useState<UpcomingScheduleStatus>(isDemoMode ? 'demo' : 'loading')
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null)
  const [stateScope, setStateScope] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const requestKey = useRef(0)
  const currentScope = scheduleScopeKey(patientId, days, isDemoMode)

  useEffect(() => {
    const currentRequest = ++requestKey.current
    const controller = new AbortController()
    const requestScope = scheduleScopeKey(patientId, days, isDemoMode)
    // 為什麼先清空：病人或範圍切換時，寧可暫時空白，也不能讓 A 的行程看起來屬於 B。
    setEvents([])
    setUpdatedAt(null)
    setStateScope(requestScope)
    if (isDemoMode) {
      setStatus('demo')
      return () => controller.abort()
    }

    setStatus('loading')
    void fetchCalendarAgenda(patientId, days, controller.signal)
      .then(response => {
        if (requestKey.current !== currentRequest) return
        setEvents(response.events)
        setStatus(response.notConfigured ? 'notConfigured' : 'ready')
        setUpdatedAt(new Date())
      })
      .catch(() => {
        if (controller.signal.aborted || requestKey.current !== currentRequest) return
        console.error('[calendar agenda request failed]')
        setStatus('error')
      })

    return () => controller.abort()
  }, [days, isDemoMode, patientId, reloadKey])

  const refresh = useCallback(() => setReloadKey(key => key + 1), [])
  const visibleState = selectScopedScheduleState(currentScope, stateScope, { events, status, updatedAt })
  return { ...visibleState, refresh }
}
