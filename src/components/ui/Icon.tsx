/*
檔案用途：一套共用 SVG 圖示元件，逐步取代全站的 emoji 圖示。
所在層：src/components/ui；被底部導覽、每日照護模組 chip 等狀態表達元件使用。
主要關聯：App.tsx 的 TabBtn、daily-care/DailyCareSectionTabs.tsx；新增圖示請在 ICON_PATHS 補一組。
*/

// emoji 圖示跨平台字型不一（同一個 emoji 在 iOS／Android／Windows 畫出來可能完全不同形狀），
// 也無法用 design token 控制顏色與對比；改用 stroke SVG 後顏色跟著 currentColor 走，
// 尺寸與線寬固定，深色模式或未來換色只要改 CSS 變數，不用重畫圖示。
// 本檔先只收錄底部導覽用得到的圖示（A 期 scope：底部導覽與模組 chip），其餘 emoji 逐步遷移時再擴充。
import type { ReactNode } from 'react'

export type IconName = 'pin' | 'calendar' | 'calendar-check' | 'settings' | 'sun' | 'history' | 'stethoscope'

const ICON_PATHS: Record<IconName, ReactNode> = {
  // B 期新增：底部導覽「今天」tab 用太陽圖示，呼應「今天要做什麼」的第一層問題，跟其餘資料表式圖示區分開來。
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <line x1="12" y1="2.5" x2="12" y2="5" />
      <line x1="12" y1="19" x2="12" y2="21.5" />
      <line x1="4.2" y1="4.2" x2="6" y2="6" />
      <line x1="18" y1="18" x2="19.8" y2="19.8" />
      <line x1="2.5" y1="12" x2="5" y2="12" />
      <line x1="19" y1="12" x2="21.5" y2="12" />
      <line x1="4.2" y1="19.8" x2="6" y2="18" />
      <line x1="18" y1="6" x2="19.8" y2="4.2" />
    </>
  ),
  pin: (
    <>
      <path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21Z" />
      <circle cx="12" cy="9.5" r="2.5" />
    </>
  ),
  // D 期新增：底部導覽「軌跡」tab 用鐘面圖示，呼應「之前發生什麼、改了什麼」的時間軸語意。
  history: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3.5 2" />
    </>
  ),
  calendar: (
    <>
      <rect x="3.5" y="5" width="17" height="16" rx="2" />
      <line x1="3.5" y1="9.5" x2="20.5" y2="9.5" />
      <line x1="8" y1="3" x2="8" y2="6.5" />
      <line x1="16" y1="3" x2="16" y2="6.5" />
    </>
  ),
  'calendar-check': (
    <>
      <rect x="3.5" y="5" width="17" height="16" rx="2" />
      <line x1="3.5" y1="9.5" x2="20.5" y2="9.5" />
      <line x1="8" y1="3" x2="8" y2="6.5" />
      <line x1="16" y1="3" x2="16" y2="6.5" />
      <path d="M8.5 14.5 L11 17 L15.5 12.5" />
    </>
  ),
  // E 期新增（照護閉環 T5，issue #949）：底部導覽「門診」tab 用聽診器，直接對應「帶什麼去給醫師、問什麼」的看診語意。
  stethoscope: (
    <>
      <path d="M5 3H4a2 2 0 0 0-2 2v4a6 6 0 0 0 12 0V5a2 2 0 0 0-2-2h-1" />
      <path d="M8 15v1a6 6 0 0 0 12 0v-4" />
      <circle cx="20" cy="10" r="2" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 13a7.97 7.97 0 0 0 0-2l2-1.5-2-3.5-2.4 1a8.05 8.05 0 0 0-1.7-1L15 3h-4l-.3 2.5a8.05 8.05 0 0 0-1.7 1l-2.4-1-2 3.5 2 1.5a7.97 7.97 0 0 0 0 2l-2 1.5 2 3.5 2.4-1c.5.4 1.1.75 1.7 1L11 21h4l.3-2.5c.6-.25 1.2-.6 1.7-1l2.4 1 2-3.5-2-1.5Z" />
    </>
  ),
}

export function Icon({ name, className }: { name: IconName; className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className ?? 'h-6 w-6'}
    >
      {ICON_PATHS[name]}
    </svg>
  )
}
