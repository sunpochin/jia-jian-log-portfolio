/*
檔案用途：門診頁內的 Google Calendar 行程區塊（照護閉環 T5，issue #949）——原本的「行程」底部 tab
（UpcomingSchedulePage）依 docs/product/clinical-care-ops-ui-design.md §5／§7 併入門診頁，清單元件與
7／14 天切換、重新整理、各種狀態文案原封不動搬過來，只拿掉頁首與對象切換列。
所在層：src/features/visit/components；由 NextVisitPage 在 canUseSchedule（目前只有家庭擁有者）時掛載。
主要關聯：useUpcomingSchedule、UpcomingScheduleList、calendar-agenda Edge Function；ADR-001（行事曆不投影進
時間線，只是同頁顯示）。
*/
import { useState } from 'react'
import { type AgendaDays } from '../../../lib/calendarAgenda'
import { common, useI18n } from '../../../lib/i18n'
import { useUpcomingSchedule } from '../../../hooks/useUpcomingSchedule'
import { UpcomingScheduleList } from '../../../components/schedule/UpcomingScheduleList'

export function UpcomingScheduleSection({ patientId, isDemoMode }: { patientId: string; isDemoMode: boolean }) {
  const { locale, text } = useI18n()
  const [days, setDays] = useState<AgendaDays>(7)
  const { events, status, updatedAt, refresh } = useUpcomingSchedule(patientId, days, isDemoMode)

  const updatedLabel = updatedAt
    ? new Intl.DateTimeFormat(locale === 'zh' ? 'zh-TW' : 'id-ID', { timeZone: 'Asia/Taipei', dateStyle: 'short', timeStyle: 'short' }).format(updatedAt)
    : null

  return <section className="mb-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm" aria-labelledby="next-visit-schedule-title" aria-busy={status === 'loading'}>
    <h2 id="next-visit-schedule-title" className="text-lg font-black text-slate-900">{text({ id: 'Jadwal Google', zh: 'Google 行程', en: 'Google Calendar' })}</h2>
    <div role="group" className="mt-3 flex items-center gap-2" aria-label={text({ id: 'Rentang jadwal', zh: '行程範圍', en: 'Schedule range' })}>
      {[7, 14].map(value => <button
        key={value}
        type="button"
        aria-pressed={days === value}
        onClick={() => setDays(value as AgendaDays)}
        className={`min-h-11 cursor-pointer rounded-xl px-4 text-base font-bold transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 motion-reduce:transition-none ${days === value ? 'bg-slate-900 text-white' : 'border border-slate-300 bg-white text-slate-700'}`}
      >{text(common.days(value))}</button>)}
      <button type="button" onClick={refresh} disabled={status === 'loading'} className="ml-auto min-h-11 cursor-pointer rounded-xl border border-slate-300 bg-white px-4 text-base font-bold text-slate-700 transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none">
        {text({ id: 'Muat ulang', zh: '重新整理', en: 'Reload' })}
      </button>
    </div>
    {updatedLabel && <p className="mt-2 text-sm text-slate-600" aria-live="polite">{text({ id: `Diperbarui ${updatedLabel}`, zh: `更新於 ${updatedLabel}`, en: `Updated ${updatedLabel}` })}</p>}

    <div className="mt-4" aria-live="polite">
      {status === 'loading' && <p className="rounded-2xl bg-slate-50 p-4 text-base text-slate-700">{text(common.loading)}</p>}
      {status === 'demo' && <p className="rounded-2xl border border-indigo-200 bg-indigo-50 p-4 text-base text-indigo-950">{text({ id: 'Mode demo belum terhubung ke Google Calendar.', zh: '展示模式尚未連結 Google Calendar。', en: 'Demo mode is not connected to Google Calendar yet.' })}</p>}
      {status === 'notConfigured' && <p className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-base text-amber-950">{text({ id: 'Jadwal Google untuk penerima perawatan ini belum dihubungkan.', zh: '這位照護對象尚未連結 Google 行程。', en: 'Google Calendar is not connected for this care recipient yet.' })}</p>}
      {status === 'error' && <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-base text-rose-950">
        <p>{text({ id: 'Jadwal tidak dapat dimuat. Coba lagi nanti.', zh: '行程載入失敗，請稍後再試。', en: 'Unable to load the schedule. Please try again later.' })}</p>
        <button type="button" onClick={refresh} className="mt-3 min-h-11 cursor-pointer rounded-xl bg-rose-700 px-4 text-base font-bold text-white transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-900 motion-reduce:transition-none">{text(common.retry)}</button>
      </div>}
      {status === 'ready' && events.length === 0 && <p className="rounded-2xl bg-slate-50 p-4 text-base text-slate-700">{text({ id: `Tidak ada jadwal dalam ${days} hari ke depan.`, zh: `未來 ${days} 天沒有行程。`, en: `No appointments in the next ${days} days.` })}</p>}
      {status === 'ready' && events.length > 0 && <UpcomingScheduleList events={events} />}
    </div>
  </section>
}
