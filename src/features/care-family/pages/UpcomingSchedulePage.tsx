/*
檔案用途：提供授權照護者檢視病人未來 7 或 14 天 Google Calendar 行程的唯讀頁。
所在層：src/features/care-family/pages；由 App 主 tab 掛載，組合病人切換、行程 hook 與可重用清單。
主要關聯：calendar-agenda Edge Function、useUpcomingSchedule、SubjectSwitcher 與 TabHeader。
*/
import { useState } from 'react'
import type { PatientIdentity, Subject } from '../../../lib/auth'
import { type AgendaDays } from '../../../lib/calendarAgenda'
import { common, useI18n } from '../../../lib/i18n'
import { useUpcomingSchedule } from '../../../hooks/useUpcomingSchedule'
import { SubjectSwitcher } from '../../../components/ui/SubjectSwitcher'
import { TabHeader } from '../../../components/ui/TabHeader'
import { UpcomingScheduleList } from '../../../components/schedule/UpcomingScheduleList'

export function UpcomingSchedulePage({ patientId, availablePatients, onSubjectSelect, isDemoMode }: {
  patientId: string
  availablePatients: PatientIdentity[]
  onSubjectSelect: (subject: Subject) => void
  isDemoMode: boolean
}) {
  const { locale, text } = useI18n()
  const [days, setDays] = useState<AgendaDays>(7)
  const { events, status, updatedAt, refresh } = useUpcomingSchedule(patientId, days, isDemoMode)

  const updatedLabel = updatedAt
    ? new Intl.DateTimeFormat(locale === 'zh' ? 'zh-TW' : 'id-ID', { timeZone: 'Asia/Taipei', dateStyle: 'short', timeStyle: 'short' }).format(updatedAt)
    : null

  return <div className="min-h-full bg-slate-50 px-5 pt-5 pb-6 text-slate-900">
    <header className="space-y-3">
      <TabHeader title="schedule" />
      <SubjectSwitcher patientId={patientId} patients={availablePatients} onSelect={onSubjectSelect} />
      <div role="group" className="flex items-center gap-2" aria-label={text({ id: 'Rentang jadwal', zh: '行程範圍', en: 'Rentang schedule' })}>
        {[7, 14].map(value => <button
          key={value}
          type="button"
          aria-pressed={days === value}
          onClick={() => setDays(value as AgendaDays)}
          className={`min-h-11 cursor-pointer rounded-xl px-4 text-base font-bold transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 motion-reduce:transition-none ${days === value ? 'bg-slate-900 text-white' : 'border border-slate-300 bg-white text-slate-700'}`}
        >{text(common.days(value))}</button>)}
        <button type="button" onClick={refresh} disabled={status === 'loading'} className="ml-auto min-h-11 cursor-pointer rounded-xl border border-slate-300 bg-white px-4 text-base font-bold text-slate-700 transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none">
          {text({ id: 'Muat ulang', zh: '重新整理', en: 'Muat ulang' })}
        </button>
      </div>
      {updatedLabel && <p className="text-sm text-slate-600" aria-live="polite">{text({ id: `Diperbarui ${updatedLabel}`, zh: `更新於 ${updatedLabel}`, en: `Updated ${updatedLabel}` })}</p>}
    </header>

    <section className="mt-5" aria-busy={status === 'loading'} aria-live="polite">
      {status === 'loading' && <p className="rounded-2xl bg-white p-4 text-base text-slate-700">{text(common.loading)}</p>}
      {status === 'demo' && <p className="rounded-2xl border border-indigo-200 bg-indigo-50 p-4 text-base text-indigo-950">{text({ id: 'Mode demo belum terhubung ke Google Calendar.', zh: '展示模式尚未連結 Google Calendar。', en: 'Google Calendar hasn’t been linked to your impression yet.' })}</p>}
      {status === 'notConfigured' && <p className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-base text-amber-950">{text({ id: 'Jadwal Google untuk penerima perawatan ini belum dihubungkan.', zh: '這位照護對象尚未連結 Google 行程。', en: 'Google Calendar is not connected for this care recipient yet.' })}</p>}
      {status === 'error' && <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-base text-rose-950">
        <p>{text({ id: 'Jadwal tidak dapat dimuat. Coba lagi nanti.', zh: '行程載入失敗，請稍後再試。', en: 'Schedule not can dimuat. Try again nanti.' })}</p>
        <button type="button" onClick={refresh} className="mt-3 min-h-11 cursor-pointer rounded-xl bg-rose-700 px-4 text-base font-bold text-white transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-900 motion-reduce:transition-none">{text(common.retry)}</button>
      </div>}
      {status === 'ready' && events.length === 0 && <p className="rounded-2xl bg-white p-4 text-base text-slate-700">{text({ id: `Tidak ada jadwal dalam ${days} hari ke depan.`, zh: `未來 ${days} 天沒有行程。`, en: `No appointments in the next ${days} days.` })}</p>}
      {status === 'ready' && events.length > 0 && <UpcomingScheduleList events={events} />}
    </section>
  </div>
}
