/*
檔案用途：呈現每日照護的動態功能頁籤，讓所有可用入口在窄螢幕也能直接看見。
所在層：src/components/daily-care；保持頁籤互動與 ARIA 行為一致。
主要關聯：DailyCarePage、dailyCareModules 與 i18n。
*/
import { useState } from 'react'
import type { KeyboardEvent } from 'react'
import { useI18n } from '../../lib/i18n'
import type { DailyCareModule, DailyCareModuleId } from '../../lib/dailyCareModules'

// C 期（issue #734）：390px 手機寬度下，一列塞 10–13 個模組會讓每格只剩約 34px，
// 印尼文標籤（例如 "Pencernaan"）一定會被截斷，違反 CLAUDE.md 鐵律 5「長輩可視性」。
// 這裡把「常駐可見」的模組數量收斂到固定上限，其餘進「更多」bottom sheet；
// 病人類型／權限會讓實際模組數量在 1～14 之間變動（見 dailyCareModules.ts 的
// visibleDailyCareModules），因此不能寫死「10–13 選幾個」，而是用「總數是否超過上限」
// 來決定要不要生出「更多」入口，任意數量的模組都能落在同一套排版規則裡。
// 上限選 5：兩列 × 3 欄的格線（見下方 grid-cols-3）最後一列只會剩 2 欄，
// 5 個 44px 高、可完整顯示中／印尼文 compactLabel 的 chip 仍能維持單手可讀，
// 比設計文件草案的「兩列＋更多」再保守一點，寧可少放一個常駐項目也不要冒著截斷風險。
const MAX_VISIBLE_MODULES = 5

export function DailyCareSectionTabs({ modules, activeModule, onSelect }: {
  modules: DailyCareModule[]
  activeModule: DailyCareModuleId
  onSelect: (moduleId: DailyCareModuleId) => void
}) {
  const { text } = useI18n()
  const [moreSheetOpen, setMoreSheetOpen] = useState(false)
  if (modules.length <= 1) return null

  const hasOverflow = modules.length > MAX_VISIBLE_MODULES
  // 常駐區保留一格給「更多」按鈕，所以真正常駐顯示的模組數是「上限 - 1」。
  const pinnedSlots = hasOverflow ? MAX_VISIBLE_MODULES - 1 : MAX_VISIBLE_MODULES
  const defaultVisible = modules.slice(0, pinnedSlots)
  // 目前選到的模組若原本被排進「更多」，把它換進常駐區最後一格，
  // 否則使用者從 sheet 選了一個模組後，畫面上的常駐列反而看不到自己選的那一格被選取，
  // aria-selected 也會失去對應的可見 tab，等於選了卻找不到自己在哪裡。
  const activeInDefault = defaultVisible.some(module => module.id === activeModule)
  const visibleModules = !hasOverflow || activeInDefault
    ? defaultVisible
    : [...defaultVisible.slice(0, -1), modules.find(module => module.id === activeModule)!]
  const overflowModules = modules.filter(module => !visibleModules.some(visible => visible.id === module.id))

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    event.preventDefault()
    // 方向鍵只在常駐可見的 tab 之間移動；「更多」是開啟 sheet 的按鈕，不是分頁內容的 tab，
    // 因此不用 roving tabindex 涵蓋它——它跟一般按鈕一樣用 Tab 鍵就能到達，語意比較單純。
    const currentIndex = visibleModules.findIndex(module => module.id === activeModule)
    if (currentIndex === -1) return
    const nextIndex = event.key === 'ArrowLeft'
      ? (currentIndex - 1 + visibleModules.length) % visibleModules.length
      : (currentIndex + 1) % visibleModules.length
    onSelect(visibleModules[nextIndex].id)
    // 測試環境（bun test）沒有真的 DOM，只有瀏覽器才需要手動把 focus 移過去。
    if (typeof document !== 'undefined') document.getElementById(`daily-care-${visibleModules[nextIndex].id}-tab`)?.focus()
  }

  const selectFromSheet = (moduleId: DailyCareModuleId) => {
    onSelect(moduleId)
    setMoreSheetOpen(false)
  }

  return (
    <>
      <div
        // 視覺上仍是同一塊圓角面板，兩列排版靠 grid-cols-3 讓 5 格自然折成 3+2；
        // role="tablist" 只包住真正的 tab（display:contents 讓它不影響外層格線的排版）。
        className="grid min-w-0 grid-cols-3 gap-1 rounded-2xl bg-slate-200/80 p-1 ring-1 ring-inset ring-slate-300/60"
      >
        <div
          role="tablist"
          aria-label={text({ id: 'Bagian perawatan harian', zh: '每日照護區段', en: 'Daily Care Segment' })}
          className="contents"
        >
          {visibleModules.map(module => {
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
                onClick={() => onSelect(module.id)}
                onKeyDown={handleKeyDown}
                // compactLabel 本身就是為了在窄格內完整顯示才另外準備的雙語短字；
                // 不加 truncate/overflow-hidden，避免又蓋掉這份已經量身縮短過的文字。
                className={`min-h-11 min-w-0 rounded-xl px-1 text-xs font-bold whitespace-nowrap transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-700 sm:px-2 sm:text-sm ${selected ? 'bg-white text-ink shadow-sm' : 'text-ink-muted hover:bg-white/60'}`}
              >
                {text(module.compactLabel)}
              </button>
            )
          })}
        </div>
        {hasOverflow && (
          <button
            type="button"
            aria-haspopup="dialog"
            aria-expanded={moreSheetOpen}
            onClick={() => setMoreSheetOpen(true)}
            className="min-h-11 min-w-0 rounded-xl px-1 text-xs font-bold whitespace-nowrap text-ink-muted transition hover:bg-white/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-700 sm:px-2 sm:text-sm"
          >
            {text({ id: 'Lainnya', zh: '更多', en: 'More' })}
          </button>
        )}
      </div>

      {hasOverflow && moreSheetOpen && (
        // 沿用既有 dialog／sheet 慣例（見 MedicationDetailDialog）：shadow-2xl 面板＋
        // slate-950/55 半透明背景，不重新發明一套 modal 機制。
        <div
          role="dialog"
          aria-modal="true"
          aria-label={text({ id: 'Modul lainnya', zh: '更多模組', en: 'More modules' })}
          className="fixed inset-0 z-[60] flex items-end justify-center bg-slate-950/55 p-0 sm:items-center sm:p-5"
          onClick={event => { if (event.target === event.currentTarget) setMoreSheetOpen(false) }}
        >
          <div className="max-h-[70vh] w-full overflow-y-auto rounded-t-3xl bg-white p-4 shadow-2xl sm:max-w-sm sm:rounded-3xl">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="text-base font-black text-ink">{text({ id: 'Modul lainnya', zh: '更多模組', en: 'More modules' })}</h2>
              <button
                type="button"
                onClick={() => setMoreSheetOpen(false)}
                aria-label={text({ id: 'Tutup', zh: '關閉', en: 'Close' })}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xl font-black text-ink-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-700"
              >
                ×
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {overflowModules.map(module => {
                const selected = module.id === activeModule
                return (
                  <button
                    key={module.id}
                    type="button"
                    onClick={() => selectFromSheet(module.id)}
                    aria-current={selected}
                    className={`min-h-12 rounded-xl px-3 text-sm font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-700 ${selected ? 'bg-brand-700 text-white' : 'bg-slate-100 text-ink hover:bg-slate-200'}`}
                  >
                    {text(module.label)}
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
