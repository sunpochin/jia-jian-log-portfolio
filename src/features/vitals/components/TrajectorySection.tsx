/*
檔案用途：在醫師版血壓報告中列出區間內的藥單異動、看診／醫囑等時間線事件與逾期提醒，純描述不解讀。
所在層：src/features/vitals/components；由 RecordReport 放在「目前藥單」之後、「資料限制」之前呈現。
主要關聯：src/lib/medicalTrajectory.ts（事件資料模型）、usePreVisitSources（讀取狀態）、
src/lib/medication/medicationAtcCategories.ts、src/lib/medication/medicationSchedule.ts、src/lib/careTimeline.ts、
src/lib/careDueReminders.ts（各自的雙語／三語標籤字典）。
*/
import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import timezone from 'dayjs/plugin/timezone'
import { useI18n, type LocalizedText } from '../../../lib/i18n'
import { REPORT_TIMEZONE } from '../../../lib/recordReport'
import { TRAJECTORY_DIRECTION_LABELS, type TrajectoryEvent } from '../../../lib/medicalTrajectory'
import type { PreVisitSourceStatuses } from '../../../lib/preVisitSources'
import { careTimelineEventText, visitKindText, type CareTimelineEntry } from '../../../lib/careTimeline'
import { REMINDER_TYPE_META } from '../../../lib/careDueReminders'
import { resolveMedicationCategory } from '../../../lib/medication/medicationAtcCategories'
import { formatDoseAmountLocalized, formatMedicationDisplayName } from '../../../lib/medication/medications'
import { medicationSlotText } from '../../../lib/medication/medicationSchedule'

// 元件可能被測試或 lazy-load 單獨載入，不能依賴 recordReport 的副作用先註冊 .tz()。
dayjs.extend(utc)
dayjs.extend(timezone)

const SECTION_TITLE: LocalizedText = { id: 'Riwayat medis terkini', zh: '近期醫療軌跡', en: 'Recent medical trajectory' }

const EMPTY_STATE_TEXT: LocalizedText = {
  id: 'Tidak ada perubahan obat, kunjungan, atau pengingat jatuh tempo pada rentang ini.',
  zh: '這段期間沒有藥單異動、看診事件或到期提醒。',
  en: 'No medication changes, visits, or due reminders in this period.',
}

// 為什麼不同來源各自的錯誤訊息要分開列，不能合併成一句「無法讀取」：驗收條件明訂
// 來源不可用時要印「無法讀取」，不能被誤讀成「這段期間真的沒有異動」；三個來源各自
// 獨立查詢、獨立失敗，只合併成一句籠統訊息會讓照護者以為所有資料都拿不到。
const SOURCE_UNAVAILABLE_TEXT: Record<keyof PreVisitSourceStatuses, LocalizedText> = {
  medicationChanges: { id: 'Riwayat perubahan obat belum dapat dibaca.', zh: '藥單異動紀錄暫時無法讀取。', en: 'Medication change history could not be read right now.' },
  timelineEntries: { id: 'Catatan kunjungan/arahan dokter belum dapat dibaca.', zh: '看診／醫囑等時間線事件暫時無法讀取。', en: 'Visit and doctor-instruction events could not be read right now.' },
  dueReminders: { id: 'Pengingat jatuh tempo belum dapat dibaca.', zh: '到期提醒暫時無法讀取。', en: 'Due reminders could not be read right now.' },
  // 這個區塊本身不呈現檢驗值事件（見 preVisitBrief.ts 的 R5 直接吃 labResults，不經過 TrajectoryEvent），
  // 但 sourceStatus 是跟 PreVisitBriefSection 共用的同一個型別，仍需要這個鍵才能編譯與正確顯示「未計入」提示。
  labResults: { id: 'Hasil lab belum dapat dibaca.', zh: '檢驗值暫時無法讀取。', en: 'Lab results could not be read right now.' },
}

const AS_NEEDED_TEXT: LocalizedText = { id: 'Bila perlu', zh: '需要時服用', en: 'As needed' }

const OVERDUE_REMINDER_BADGE: LocalizedText = { id: 'Pengingat terlambat', zh: '逾期提醒', en: 'Overdue reminder' }

export function TrajectorySection({ events, sourceStatus }: { events: TrajectoryEvent[]; sourceStatus: PreVisitSourceStatuses }) {
  const { locale, text } = useI18n()
  const unavailableSources = (Object.keys(sourceStatus) as Array<keyof PreVisitSourceStatuses>).filter(key => sourceStatus[key] === 'unavailable')
  const hasAnyUnavailable = unavailableSources.length > 0

  return (
    <div className="mt-4 rounded-xl border border-slate-200 bg-white p-3" aria-labelledby="trajectory-section-title">
      <p id="trajectory-section-title" className="text-xs print:text-[10px] font-bold uppercase tracking-[0.16em] text-indigo-600">{text(SECTION_TITLE)}</p>

      {unavailableSources.length > 0 && (
        <ul className="mt-2 space-y-1">
          {unavailableSources.map(key => (
            <li key={key} role="alert" className="rounded-lg bg-amber-50 px-2 py-1.5 text-xs print:text-[10px] text-amber-900">{text(SOURCE_UNAVAILABLE_TEXT[key])}</li>
          ))}
        </ul>
      )}

      {events.length === 0 && !hasAnyUnavailable && (
        <p className="mt-2 text-xs print:text-[10px] text-slate-500">{text(EMPTY_STATE_TEXT)}</p>
      )}

      {events.length > 0 && (
        <ol className="mt-2 space-y-2">
          {events.map(event => renderTrajectoryEventRow(event, locale, text))}
        </ol>
      )}
    </div>
  )
}

// #659 S3（issue #685）：科別／類型／院所同一行「{科別} {類型}」呈現，院所另起一小行——
// 三者都選填，任一缺漏時只拼接已知部分，不留空格或佔位符讓交班者誤以為漏填。
function renderVisitStructureLine(sourceEntry: CareTimelineEntry | undefined, text: (value: LocalizedText) => string) {
  if (!sourceEntry) return null
  const kindLabel = sourceEntry.visit_kind ? text(visitKindText[sourceEntry.visit_kind]) : null
  const departmentAndKind = [sourceEntry.visit_department, kindLabel].filter(Boolean).join(' ')
  if (!departmentAndKind && !sourceEntry.visit_institution) return null
  return (
    <>
      {departmentAndKind && <p className="mt-0.5 text-xs print:text-[10px] font-semibold text-indigo-700">{departmentAndKind}</p>}
      {sourceEntry.visit_institution && <p className="mt-0.5 text-xs print:text-[10px] text-slate-500">{sourceEntry.visit_institution}</p>}
    </>
  )
}

// 為什麼是一般函式呼叫、不是 <TrajectoryEventRow .../> JSX 寫法：這裡的最小 hook 測試環境只會攤平
// 已經解出來的 React 元素樹，不會真的執行巢狀的自訂元件函式；用一般函式呼叫讓 <li> 在
// TrajectorySection 自己的 render 當下就被建立好，測試才看得到裡面的文字（見 tests/unit/helpers/elementTree.ts）。
function renderTrajectoryEventRow(event: TrajectoryEvent, locale: 'id' | 'zh' | 'en', text: (value: LocalizedText) => string) {
  const occurredLabel = dayjs(event.occurredAt).tz(REPORT_TIMEZONE).format('YYYY/MM/DD')
  const key = `${event.kind}-${event.id}`

  if (event.kind === 'medication_change') {
    const medicationName = formatMedicationDisplayName(event.medication, locale)
    const categoryLabel = resolveMedicationCategory(event.medication.atc_code)
    const doseText = event.doseAmount != null ? formatDoseAmountLocalized(event.doseAmount, event.dosageForm || 'tablet', locale) : null
    const slotLabel = event.scheduleSlot ? text(medicationSlotText(event.scheduleSlot)) : null
    return (
      <li key={key} className="border-l-4 border-indigo-300 pl-2">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <time className="text-xs print:text-[10px] font-bold text-slate-500">{occurredLabel}</time>
          <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs print:text-[10px] font-bold text-indigo-800">{text(TRAJECTORY_DIRECTION_LABELS[event.direction])}</span>
        </div>
        <p className="mt-0.5 text-xs print:text-[11px] font-bold text-slate-900">{medicationName}</p>
        <p className="mt-0.5 text-xs print:text-[10px] text-slate-600">
          {[categoryLabel ? text(categoryLabel) : null, slotLabel, doseText, event.asNeeded ? text(AS_NEEDED_TEXT) : null].filter(Boolean).join(' · ')}
        </p>
        {event.reason && <p className="mt-0.5 text-xs print:text-[10px] italic text-slate-500">{event.reason}</p>}
      </li>
    )
  }

  if (event.kind === 'due_reminder') {
    const reminderMeta = REMINDER_TYPE_META[event.reminderType]
    return (
      <li key={key} className="border-l-4 border-amber-300 pl-2">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <time className="text-xs print:text-[10px] font-bold text-slate-500">{occurredLabel}</time>
          <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs print:text-[10px] font-bold text-amber-800">{text(OVERDUE_REMINDER_BADGE)}</span>
        </div>
        <p className="mt-0.5 text-xs print:text-[11px] font-bold text-slate-900">{text(reminderMeta.label)}</p>
        <p className="mt-0.5 text-xs print:text-[10px] text-slate-600">
          {text({ id: `Terlambat ${event.daysOverdue} hari`, zh: `逾期 ${event.daysOverdue} 天`, en: `${event.daysOverdue} day(s) overdue` })}
        </p>
      </li>
    )
  }

  return (
    <li key={key} className="border-l-4 border-slate-300 pl-2">
      <div className="flex flex-wrap items-baseline gap-x-2">
        <time className="text-xs print:text-[10px] font-bold text-slate-500">{occurredLabel}</time>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs print:text-[10px] font-bold text-slate-700">{text(careTimelineEventText[event.kind])}</span>
      </div>
      <p className="mt-0.5 text-xs print:text-[11px] font-bold text-slate-900">{event.title}</p>
      {/* #659 S3（issue #685）：科別／院所／就醫類型只有 health_visit 事件才可能有值；
          用 sourceEntry 而不是幫 TimelineTrajectoryEvent 另開欄位，因為這三個欄位只有軌跡頁的
          手動事件才會帶（見 toTimelineEvent），沒有理由為醫師報告路徑另外複製一份。 */}
      {event.kind === 'health_visit' && renderVisitStructureLine(event.sourceEntry, text)}
      {event.details && <p className="mt-0.5 text-xs print:text-[10px] text-slate-600">{event.details}</p>}
      {event.reassessOn && <p className="mt-0.5 text-xs print:text-[10px] font-semibold text-amber-800">{text({ id: `Evaluasi lagi: ${event.reassessOn}`, zh: `下次評估：${event.reassessOn}`, en: `Reassess on: ${event.reassessOn}` })}</p>}
    </li>
  )
}
