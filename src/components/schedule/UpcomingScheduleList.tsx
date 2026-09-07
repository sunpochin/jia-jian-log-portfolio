/*
檔案用途：依台北日期呈現未來行程卡片，保持標題／地點原文與其餘系統文字雙語。
所在層：src/components/schedule；由 UpcomingSchedulePage 組合，不讀取日曆或保存資料。
主要關聯：src/lib/calendarAgenda.ts、useI18n 與 UpcomingSchedulePage。
*/
import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import timezone from 'dayjs/plugin/timezone'
import { groupUpcomingSchedule, type UpcomingScheduleEvent } from '../../lib/calendarAgenda'
import { useI18n } from '../../lib/i18n'
import { TZ } from '../../lib/timezone'

dayjs.extend(utc)
dayjs.extend(timezone)

function formatDate(date: string, locale: 'id' | 'zh' | 'en') {
  return new Intl.DateTimeFormat(locale === 'zh' ? 'zh-TW' : 'id-ID', { timeZone: TZ, weekday: 'long', month: 'long', day: 'numeric' }).format(new Date(`${date}T12:00:00+08:00`))
}

export function UpcomingScheduleList({ events }: { events: UpcomingScheduleEvent[] }) {
  const { locale, text } = useI18n()
  const groups = groupUpcomingSchedule(events)

  return <div className="space-y-5">
    {groups.map(group => <section key={group.date} aria-label={formatDate(group.date, locale)}>
      <h2 className="mb-2 text-base font-bold text-slate-700">{formatDate(group.date, locale)}</h2>
      <div className="space-y-2">
        {group.events.map(event => {
          const time = event.allDay
            ? text({ id: 'Sepanjang hari', zh: '全天', en: 'Throughout the day' })
            : `${dayjs(event.start).tz(TZ).format('HH:mm')}–${dayjs(event.end).tz(TZ).format('HH:mm')}`
          return <article key={event.key} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-base font-bold text-slate-900">{event.summary || text({ id: 'Acara tanpa judul', zh: '未命名行程', en: 'Unnamed trip' })}</p>
            <p className="mt-1 text-base font-semibold text-slate-700">{time}</p>
            {event.location && <p className="mt-2 break-words text-base text-slate-600">{event.location}</p>}
          </article>
        })}
      </div>
    </section>)}
  </div>
}
