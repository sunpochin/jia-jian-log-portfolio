/*
檔案用途：呈現每日照護的動態功能頁籤，讓所有可用入口在窄螢幕也能直接看見。
所在層：src/components/daily-care；保持頁籤互動與 ARIA 行為一致。
主要關聯：DailyCarePage、dailyCareModules 與 i18n。
*/
import type { KeyboardEvent } from 'react'
import { useI18n } from '../../lib/i18n'
import type { DailyCareModule, DailyCareModuleId } from '../../lib/dailyCareModules'

export function DailyCareSectionTabs({ modules, activeModule, onSelect }: {
  modules: DailyCareModule[]
  activeModule: DailyCareModuleId
  onSelect: (moduleId: DailyCareModuleId) => void
}) {
  const { text } = useI18n()
  if (modules.length <= 1) return null

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    event.preventDefault()
    const currentIndex = modules.findIndex(module => module.id === activeModule)
    const nextIndex = event.key === 'ArrowLeft'
      ? (currentIndex - 1 + modules.length) % modules.length
      : (currentIndex + 1) % modules.length
    onSelect(modules[nextIndex].id)
    document.getElementById(`daily-care-${modules[nextIndex].id}-tab`)?.focus()
  }

  return (
    <div
      role="tablist"
      aria-label={text({ id: 'Bagian perawatan harian', zh: '每日照護區段', en: 'Daily Care Segment' })}
      // 五個入口必須同時可見；水平捲動會讓印尼文的體重入口在手機上變成隱藏功能。
      className="grid min-w-0 gap-1 rounded-2xl bg-slate-200/80 p-1 ring-1 ring-inset ring-slate-300/60"
      style={{ gridTemplateColumns: `repeat(${modules.length}, minmax(0, 1fr))` }}
    >
      {modules.map(module => {
        const selected = module.id === activeModule
        return (
          <button
            key={module.id}
            id={`daily-care-${module.id}-tab`}
            type="button"
            role="tab"
            tabIndex={selected ? 0 : -1}
            aria-selected={selected}
            aria-controls={`daily-care-${module.id}-panel`}
            aria-label={text(module.label)}
            title={text(module.label)}
            onClick={() => onSelect(module.id)}
            onKeyDown={handleKeyDown}
            // 短標籤只負責節省手機寬度，完整名稱仍由 aria-label、title 與 panel 保留。
            className={`min-h-11 min-w-0 rounded-xl px-1 text-xs font-bold whitespace-nowrap transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600 sm:px-2 sm:text-sm ${selected ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:bg-white/60'}`}
          >
            {text(module.compactLabel)}
          </button>
        )
      })}
    </div>
  )
}
