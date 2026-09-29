/*
檔案用途：共用的「需要留意」清單項元件（chip＋標題＋說明＋動作），依到期急迫程度套用一致的顏色與邊框。
所在層：src/components/ui；純呈現元件，不讀取資料也不知道資料來源是提醒還是照護時間軸。
主要關聯：由 features/reminders/pages/CareDueRemindersPage.tsx 與 features/today/pages/TodayPage.tsx 共用，
避免「今天頁」與「到期提醒頁」各自維護一份幾乎相同的清單項樣式而逐漸漂移（見 docs/product/clinical-care-ops-ui-design.md §7）。
*/
import type { ReactNode } from 'react'

export type AttentionTone = 'overdue' | 'due_soon' | 'ok'

// 語意色沿用 A 期在 src/index.css 定義的 danger／warn token（不是隨手挑的 Tailwind red-/amber- 調色盤）：
// overdue＝需要現在處理、due_soon＝需要留意、ok＝僅供參考，不用品牌色（brand）避免跟「選中狀態」混淆。
const TONE_CONTAINER_CLASS: Record<AttentionTone, string> = {
  overdue: 'border-danger-700/30 bg-danger-50',
  due_soon: 'border-warn-700/30 bg-warn-50',
  ok: 'border-slate-200 bg-white',
}

const TONE_BADGE_CLASS: Record<AttentionTone, string> = {
  overdue: 'bg-danger-700 text-white',
  due_soon: 'bg-warn-700 text-white',
  ok: 'bg-slate-200 text-slate-700',
}

export function AttentionItem({ tone = 'ok', title, badge, description, actions, onClick }: {
  tone?: AttentionTone
  title: string
  badge?: string
  description?: string
  actions?: ReactNode
  onClick?: () => void
}) {
  // 整列可點擊時改用 button，讓看護能一次點擊直接前往對應動作；不可點擊時維持純資訊的 li，避免多餘的 tab stop。
  const Container = onClick ? 'button' : 'div'
  return (
    <li className={`rounded-2xl border p-4 shadow-sm ${TONE_CONTAINER_CLASS[tone]}`}>
      <Container
        {...(onClick ? { type: 'button' as const, onClick } : {})}
        className={onClick ? 'block w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-700 focus-visible:ring-offset-2 rounded-xl' : undefined}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-base font-black text-slate-900">{title}</p>
          {badge && <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-black ${TONE_BADGE_CLASS[tone]}`}>{badge}</span>}
        </div>
        {description && <p className="mt-1 text-sm font-medium text-slate-600">{description}</p>}
      </Container>
      {actions && <div className="mt-3 flex flex-wrap gap-2">{actions}</div>}
    </li>
  )
}
