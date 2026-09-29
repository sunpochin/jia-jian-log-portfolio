/*
檔案用途：可折疊的分類卡片，把多張既有設定卡片群組收合在同一個標題列下，預設收合以縮短長頁面的捲動距離。
所在層：src/components/ui；純呈現用可重用元件，只負責展開／收合互動，不知道裡面放了哪些卡片、也不讀寫任何資料。
主要關聯：SettingsPage 用它把「照護對象與家人」「顯示與提醒偏好」等既有設定卡片分組收合；子元件維持各自原有的卡片外觀不受影響。
*/
import { useId, useState, type ReactNode } from 'react'
import { useI18n, type LocalizedText } from '../../lib/i18n'

export function CollapsibleSection({ icon, title, description, defaultOpen = false, children }: {
  icon: string
  title: LocalizedText
  description: LocalizedText
  defaultOpen?: boolean
  children: ReactNode
}) {
  const { text } = useI18n()
  // defaultOpen 只在第一次算 useState 初始值時被讀取一次：例如「每日照護顯示」深連結需要一開始就展開，
  // 但使用者手動收合／展開之後，這個群組不該再因為外部狀態改變而被強制蓋回去。
  const [open, setOpen] = useState(defaultOpen)
  const panelId = useId()

  return (
    <section className="mt-6 overflow-hidden rounded-2xl border border-gray-200 bg-white">
      <button
        type="button"
        onClick={() => setOpen(current => !current)}
        aria-expanded={open}
        aria-controls={panelId}
        className="flex min-h-16 w-full items-center gap-3 px-4 py-3 text-left active:bg-gray-50"
      >
        <span aria-hidden="true" className="shrink-0 text-2xl leading-none">{icon}</span>
        <span className="min-w-0 flex-1">
          <span className="block font-bold text-gray-900">{text(title)}</span>
          <span className="mt-0.5 block text-xs text-gray-500">{text(description)}</span>
        </span>
        {/* 純裝飾的展開／收合箭頭；狀態已經由按鈕的 aria-expanded 告知讀屏器，這裡不需要重複描述。 */}
        <svg aria-hidden="true" viewBox="0 0 20 20" fill="currentColor" className={`h-5 w-5 shrink-0 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`}>
          <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.148l3.71-3.918a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
        </svg>
      </button>
      {/* 收合時只用 hidden 屬性隱藏，不能整個 unmount：裡面可能正顯示邀請連結／分享連結這類只顯示一次的
          一次性內容（伺服器只存 hash，前端狀態一消失就再也拿不回原始 token），收合／展開必須保留這些狀態。 */}
      <div id={panelId} hidden={!open} className="border-t border-gray-100 bg-gray-50 px-3 pb-4">
        {children}
      </div>
    </section>
  )
}
