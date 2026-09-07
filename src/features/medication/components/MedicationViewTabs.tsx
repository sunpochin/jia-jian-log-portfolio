/*
檔案用途：呈現服藥頁四個分頁（服藥打卡／本週藥單／排藥／變更藥物）的頁籤列，取代原本擠在角落的次要文字連結。
所在層：src/features/medication/components；只負責頁籤外觀與鍵盤操作，不持有藥單資料。
主要關聯：由 MedicationPage 掛載，樣式沿用 DailyCareSectionTabs 同一套 tablist 規範，保持全站頁籤操作一致。
*/
import type { KeyboardEvent } from 'react'
import { useI18n, type LocalizedText } from '../../../lib/i18n'

export type MedicationView = 'today' | 'week' | 'manage' | 'history'

interface MedicationViewTabConfig {
  id: MedicationView
  label: LocalizedText
}

const ALL_TABS: MedicationViewTabConfig[] = [
  { id: 'today', label: { id: 'Catat obat', zh: '服藥打卡' ,en: "Record medication" } },
  { id: 'week', label: { id: 'Jadwal minggu ini', zh: '每週藥單' ,en: "Schedule weeks this" } },
  { id: 'manage', label: { id: 'Jadwalkan obat', zh: '排藥' ,en: "Schedulekan medication" } },
  { id: 'history', label: { id: 'Ubah obat', zh: '變更藥物' ,en: "Edit medication" } },
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
      aria-label={text({ id: 'Bagian obat', zh: '服藥區段' ,en: "Bagian medication" })}
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
            className={`min-h-11 min-w-0 rounded-xl px-1 text-xs font-bold whitespace-nowrap transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600 sm:px-2 sm:text-sm ${selected ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:bg-white/60'}`}
          >
            {text(tab.label)}
          </button>
        )
      })}
    </div>
  )
}
