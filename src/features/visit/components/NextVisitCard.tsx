/*
檔案用途：門診頁最上方的「下次」卡（照護閉環 T5，issue #949）——顯示最接近的回診／抽血／打針等非藥量倒數提醒
（含 T2 的科別）與距今天數，並提供「所有提醒」入口；沒有提醒、讀不到、展示模式各有明確文案，不留空白。
所在層：src/features/visit/components；純呈現，資料由 useNextVisitOverview 透過 NextVisitPage 傳入。
主要關聯：src/lib/visitOutcomes.ts（nextClinicalReminder）、src/lib/careDueReminders.ts（REMINDER_TYPE_META、
computeRemainingDays、classifyReminderDueLevel）、src/components/ui/AttentionItem.tsx（與今天頁共用的列樣式）。
*/
import { common, useI18n, type LocalizedText } from '../../../lib/i18n'
import { calendarDateKey } from '../../../lib/careDay'
import { classifyReminderDueLevel, computeRemainingDays, REMINDER_TYPE_META, type CareDueReminder } from '../../../lib/careDueReminders'
import { AttentionItem } from '../../../components/ui/AttentionItem'

const TITLE: LocalizedText = { id: 'Berikutnya', zh: '下次', en: 'Next' }
const ALL_REMINDERS: LocalizedText = { id: 'Semua pengingat', zh: '所有提醒', en: 'All reminders' }
const EMPTY_TEXT: LocalizedText = { id: 'Belum ada pengingat kontrol, ambil darah, atau suntikan yang dijadwalkan.', zh: '目前沒有排定的回診、抽血或打針提醒。', en: 'No follow-up, blood draw, or injection reminder is scheduled.' }
const UNAVAILABLE_TEXT: LocalizedText = { id: 'Pengingat tidak dapat dimuat. Periksa koneksi lalu coba lagi.', zh: '提醒無法讀取，請確認網路後再試。', en: 'Reminders could not be loaded. Check your connection and try again.' }
const DEMO_TEXT: LocalizedText = { id: 'Pengingat jatuh tempo belum tersedia di mode demo.', zh: '到期提醒目前尚未支援展示模式。', en: 'Due reminders are not available in demo mode yet.' }

export function describeReminderTiming(reminder: CareDueReminder, today: string): LocalizedText {
  const remainingDays = computeRemainingDays(reminder.due_date, today)
  if (remainingDays < 0) {
    const overdue = Math.abs(remainingDays)
    return { id: `Terlambat ${overdue} hari (jatuh tempo ${reminder.due_date})`, zh: `已逾期 ${overdue} 天（到期日 ${reminder.due_date}）`, en: `${overdue} days overdue (due ${reminder.due_date})` }
  }
  if (remainingDays === 0) return { id: `Jatuh tempo hari ini (${reminder.due_date})`, zh: `今天到期（${reminder.due_date}）`, en: `Due today (${reminder.due_date})` }
  return { id: `${remainingDays} hari lagi (jatuh tempo ${reminder.due_date})`, zh: `還有 ${remainingDays} 天（到期日 ${reminder.due_date}）`, en: `In ${remainingDays} days (due ${reminder.due_date})` }
}

export function NextVisitCard({ reminder, loading, unavailable, demo, onOpenReminders }: {
  reminder: CareDueReminder | null
  loading: boolean
  unavailable: boolean
  demo: boolean
  onOpenReminders: () => void
}) {
  const { text } = useI18n()
  const today = calendarDateKey()

  let body: React.ReactNode
  if (demo) body = <p className="mt-3 text-sm font-medium text-slate-600">{text(DEMO_TEXT)}</p>
  else if (loading) body = <p className="mt-3 text-sm text-slate-500">{text(common.loading)}</p>
  else if (unavailable) body = <p role="alert" className="mt-3 text-sm font-semibold text-red-700">{text(UNAVAILABLE_TEXT)}</p>
  else if (!reminder) body = <p className="mt-3 text-sm font-medium text-slate-600">{text(EMPTY_TEXT)}</p>
  else {
    const remainingDays = computeRemainingDays(reminder.due_date, today)
    body = (
      <ul className="mt-3 space-y-3">
        <AttentionItem
          tone={classifyReminderDueLevel(remainingDays, reminder.threshold_days)}
          title={text(REMINDER_TYPE_META[reminder.reminder_type].label)}
          // T2 的科別：有填才顯示，沿用 AttentionItem 的 badge 位置，不另外排版。
          badge={reminder.visit_department ?? undefined}
          description={text(describeReminderTiming(reminder, today))}
        />
      </ul>
    )
  }

  // 底色沿用今天頁「現在」卡的 brand（emerald）：這張卡回答的是「下一步要去哪」，是門診頁最主要的資訊。
  return (
    <section className="mb-4 rounded-3xl border border-brand-200 bg-brand-50 p-5 shadow-sm" aria-labelledby="next-visit-next-title">
      <div className="flex items-center justify-between gap-2">
        <h2 id="next-visit-next-title" className="text-lg font-black text-ink">{text(TITLE)}</h2>
        <button type="button" onClick={onOpenReminders} className="min-h-9 text-sm font-bold text-brand-700 underline decoration-brand-200 underline-offset-4">
          {text(ALL_REMINDERS)}
        </button>
      </div>
      {body}
    </section>
  )
}
