/*
檔案用途：呈現服藥頁四個分頁（服藥打卡／本週藥單／排藥／變更藥物）的頁籤列，取代原本擠在角落的次要文字連結。
所在層：src/features/medication/components；只負責頁籤外觀與鍵盤操作，不持有藥單資料。
主要關聯：由 MedicationPage 掛載，樣式沿用 DailyCareSectionTabs 同一套 tablist 規範，保持全站頁籤操作一致。
*/
import type { KeyboardEvent } from 'react'
import { useI18n, type LocalizedText } from '../../../lib/i18n'

// 'history'（變更藥物子頁，顯示 MedicationHistory）已併入軌跡頁（issue #735，#659 D 期），
// 不再是服藥頁自己的分頁；藥單異動改在底部導覽「軌跡」tab 統一檢視。
export type MedicationView = 'today' | 'week' | 'manage'

interface MedicationViewTabConfig {
  id: MedicationView
  label: LocalizedText
}

// 修正頁籤導覽與標籤的英文翻譯
const ALL_TABS: MedicationViewTabConfig[] = [
  { id: 'today', label: { id: 'Catat obat', zh: '服藥打卡' ,en: "Log Doses" } },
  { id: 'week', label: { id: 'Jadwal minggu', zh: '每週藥單' ,en: "Weekly Schedule" } },
  { id: 'manage', label: { id: 'Atur obat', zh: '排藥' ,en: "Manage Schedule" } },
]

export function MedicationViewTabs({ activeView, onSelect, canManage }: {
  activeView: MedicationView
  onSelect: (view: MedicationView) => void
  // 排藥與變更藥物涉及藥單異動權限；沒有管理權的被照顧者本人只看得到服藥打卡與每週藥單。
  canManage: boolean
}) {
  const { text } = useI18n()
  const tabs = ALL_TABS.filter(tab => canManage || tab.id === 'today' || tab.id === 'week')

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    event.preventDefault()
    const currentIndex = tabs.findIndex(tab => tab.id === activeView)
    const nextIndex = event.key === 'ArrowLeft'
      ? (currentIndex - 1 + tabs.length) % tabs.length
      : (currentIndex + 1) % tabs.length
    onSelect(tabs[nextIndex].id)
    document.getElementById(`medication-view-${tabs[nextIndex].id}-tab`)?.focus()
  }

  return (
    <div
      role="tablist"
      aria-label={text({ id: 'Bagian obat', zh: '服藥區段' ,en: "Medication views" })}
      className="grid min-w-0 gap-1 rounded-2xl bg-slate-200/80 p-1 ring-1 ring-inset ring-slate-300/60"
      style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}
    >
      {tabs.map(tab => {
        const selected = tab.id === activeView
        return (
          <button
            key={tab.id}
            id={`medication-view-${tab.id}-tab`}
            type="button"
            role="tab"
            tabIndex={selected ? 0 : -1}
            aria-selected={selected}
            aria-controls={`medication-view-${tab.id}-panel`}
            onClick={() => onSelect(tab.id)}
            onKeyDown={handleKeyDown}
            className={`min-h-11 min-w-0 overflow-hidden text-ellipsis rounded-xl px-1 text-xs font-bold whitespace-nowrap transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600 sm:px-2 sm:text-sm ${selected ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:bg-white/60'}`}
          >
            {text(tab.label)}
          </button>
        )
      })}
    </div>
  )
}
