/*
檔案用途：軌跡頁的型別篩選 chip（全部／調藥／看診／醫師指示／事件／提醒）。
所在層：src/features/care-family/components/trajectory；純呈現，篩選狀態由呼叫端持有。
主要關聯：由 TrajectoryEventList.tsx 的容器（TrajectoryPage）掛載，對應
docs/product/clinical-care-ops-ui-design.md §6 W2 wireframe（issue #735）。
*/
import { useI18n, type LocalizedText } from '../../../../lib/i18n'

export type TrajectoryFilter = 'all' | 'medication_change' | 'health_visit' | 'doctor_instruction' | 'event' | 'due_reminder'

const FILTER_LABELS: Record<TrajectoryFilter, LocalizedText> = {
  all: { id: 'Semua', zh: '全部', en: 'All' },
  medication_change: { id: 'Obat', zh: '調藥', en: 'Medication' },
  health_visit: { id: 'Kunjungan', zh: '看診', en: 'Visit' },
  doctor_instruction: { id: 'Arahan dokter', zh: '醫師指示', en: "Doctor's orders" },
  event: { id: 'Peristiwa', zh: '事件', en: 'Events' },
  due_reminder: { id: 'Pengingat', zh: '提醒', en: 'Reminders' },
}

const FILTER_ORDER: TrajectoryFilter[] = ['all', 'medication_change', 'health_visit', 'doctor_instruction', 'event', 'due_reminder']

export function TrajectoryFilterChips({ active, onSelect }: { active: TrajectoryFilter; onSelect: (filter: TrajectoryFilter) => void }) {
  const { text } = useI18n()
  return (
    <div role="tablist" aria-label={text({ id: 'Filter jenis riwayat', zh: '軌跡型別篩選', en: 'Trajectory type filter' })} className="flex gap-2 overflow-x-auto pb-1">
      {FILTER_ORDER.map(filter => {
        const selected = filter === active
        return (
          <button
            key={filter}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onSelect(filter)}
            className={`min-h-11 shrink-0 rounded-full border px-3 text-sm font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 ${selected ? 'border-brand-700 bg-brand-700 text-white' : 'border-slate-300 bg-white text-slate-700'}`}
          >
            {text(FILTER_LABELS[filter])}
          </button>
        )
      })}
    </div>
  )
}
