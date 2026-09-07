/*
檔案用途：卡片式數值輸入視覺卡片。
所在層：src/components；為血壓與心跳輸入頁面的輸入介面元件。
主要關聯：由 InputPage 載入，整合數值微調按鈕與語音/朗讀輔助。
*/
import { forwardRef } from 'react'

interface PickerCardProps {
  inputId: string
  idLabel: string
  unit: string
  selected: number | ''
  onChange: (v: number | '') => void
  accent: string
  onNextFocus?: () => void
  enterKeyHint?: 'next' | 'done'
  onInputFocus?: (input: HTMLInputElement) => void
  // 兩位數延遲自動跳轉期間為 true；用來提示使用者「即將自動跳到下一格，不用手動點」。
  pendingAdvance?: boolean
}

// ── PickerCard: labelled wrapper around direct numeric input ───────────────────────
// 繁體中文註解：單個量測指標（高壓/低壓/心跳）之輸入卡片。點擊輸入框自動全選，並支援 Enter/順跳下一個欄位。
export const PickerCard = forwardRef<HTMLInputElement, PickerCardProps>(function PickerCard(
  { inputId, idLabel, unit, selected, onChange, accent, onNextFocus, enterKeyHint, onInputFocus, pendingAdvance },
  ref
) {
  const labelId = `${inputId}-label`

  return (
    <div className="relative flex flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
      {/* 三欄仍是 iPhone 最穩定的輸入方式，僅提升字級，避免把高低壓拆成兩列後增加捲動與遺漏風險。 */}
      <div className="px-1 pt-2 pb-1 flex flex-col items-center justify-center text-center">
        <label htmlFor={inputId} id={labelId} className={`text-base font-bold leading-tight ${accent}`}>{idLabel}</label>
      </div>
      <div className="flex-1 w-full">
        <div className="flex flex-col items-center justify-center p-2 h-[120px]">
          <input
            ref={ref}
            id={inputId}
            aria-labelledby={labelId}
            aria-label={idLabel}
            type="number"
            inputMode="numeric"
            enterKeyHint={enterKeyHint}
            pattern="[0-9]*"
            value={selected}
            onFocus={(e) => {
              // 繁體中文註解：點擊欄位自動全選既有文字，方便照護者直接覆寫數字，免去多次手動按刪除鍵。
              e.target.select()
              onInputFocus?.(e.currentTarget)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === 'Tab') {
                if (onNextFocus) {
                  e.preventDefault()
                  onNextFocus()
                }
              }
            }}
            onChange={(e) => {
              const valStr = e.target.value
              if (valStr === '') {
                onChange('')
              } else {
                // 繁體中文註解：只接受完整整數字串，避免 parseInt 把 120.5 或 120abc 悄悄截成 120 造成錯誤紀錄。
                if (/^\d+$/.test(valStr)) onChange(Number(valStr))
              }
            }}
            className={`min-h-12 w-full rounded-2xl border py-2 text-center text-3xl font-bold outline-none focus:ring-2 focus:ring-blue-500/50 transition-colors ${
              pendingAdvance
                ? 'border-blue-400 bg-blue-50 animate-pulse'
                : 'border-slate-200 bg-slate-50'
            } ${accent}`}
          />
          <span className="text-xs text-gray-500 mt-1">{unit}</span>
        </div>
      </div>
    </div>
  )
})
