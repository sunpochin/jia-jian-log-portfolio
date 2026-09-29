/*
檔案用途：App 外殼底部主要導覽列，負責五個分頁（今天／軌跡／照護／門診／設定）的頁籤按鈕與切換。
所在層：src/components/system；純呈現元件，實際分頁狀態與切換邏輯仍由 App.tsx 的 changeTab 掌控。
主要關聯：從 App.tsx 抽出（issue #764 App.tsx 拆分），使用 components/ui 的 TabHeader 標籤與 Icon。
*/
import { useI18n, type LocalizedText } from '../../lib/i18n'
import { TAB_NAV_LABELS } from '../ui/TabHeader'
import { Icon, type IconName } from '../ui/Icon'

export type Tab = 'today' | 'events' | 'dailyCare' | 'visit' | 'settings'

interface BottomNavProps {
  tab: Tab
  onChangeTab: (tab: Tab) => void
}

export function BottomNav({ tab, onChangeTab }: BottomNavProps) {
  const { text } = useI18n()
  return (
    <nav aria-label={text({ id: 'Navigasi utama', zh: '主要導覽', en: '(BuddyPress) Primary navigation' })} className="print-hidden flex w-full max-w-md shrink-0 self-center border-t border-slate-200 bg-white/95 shadow-[0_-6px_24px_rgba(15,23,42,0.05)]">
      {/* 傳入 dataTutorial 讓新手教學 overlay 能精確定位底欄頁籤 */}
      {/* 一律走 changeTab，作為已封存對象萬一殘留在 activeSubject 時的最後防線。 */}
      <TabBtn active={tab === 'today'} onClick={() => onChangeTab('today')}
        icon="sun" label={TAB_NAV_LABELS.today} dataTutorial="tab-today" />
      <TabBtn active={tab === 'events'} onClick={() => onChangeTab('events')}
        icon="history" label={TAB_NAV_LABELS.events} dataTutorial="tab-events" />
      <TabBtn active={tab === 'dailyCare'} onClick={() => onChangeTab('dailyCare')}
        icon="calendar" label={TAB_NAV_LABELS.dailyCare} dataTutorial="tab-dailyCare" />
      {/* E 期（照護閉環 T5，issue #949）：「門診」對所有照護者開放，取代原本只有家庭擁有者看得到的「行程」tab；
          Google 行程併入門診頁內，仍只給家庭擁有者顯示。 */}
      <TabBtn active={tab === 'visit'} onClick={() => onChangeTab('visit')}
        icon="stethoscope" label={TAB_NAV_LABELS.visit} dataTutorial="tab-visit" />
      {/* 體重已整合進每日照護，避免同一筆健康資料在兩個主入口分流；
          趨勢與報告已回到各照護模組，不再有獨立的「報告」分頁。 */}
      <TabBtn active={tab === 'settings'} onClick={() => onChangeTab('settings')}
        icon="settings" label={TAB_NAV_LABELS.settings} dataTutorial="tab-settings" />
    </nav>
  )
}

function TabBtn({ active, onClick, icon, label, dataTutorial }: {
  active: boolean; onClick: () => void
  icon: IconName; label: LocalizedText
  dataTutorial?: string
}) {
  const { text } = useI18n()
  // 底部導覽是照護流程的主要入口，最小高度固定為 44px，並用 focus ring 補足鍵盤與低視力辨識。
  // active 顏色改用品牌色 brand-700，不再用 text-red-500——紅色在這個 app 同時代表「選中」
  // 與「血壓偏高」，導覽選到某個 tab 不該讓人聯想到危險數值（docs/product/clinical-care-ops-ui-design.md §4.1）。
  // inactive 改用 text-slate-500：原本的 text-gray-400 在白底上對比僅約 2.5:1，不符 design doc §7
  // 對 TabBtn 訂的 inactive slate-500（≥4.5:1）規格，slate-500 才能讓低視力照護者看清楚未選取的分頁。
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      data-tutorial={dataTutorial}
      className={`min-h-11 flex-1 flex flex-col items-center justify-center gap-0.5 px-1 pt-2 pb-[calc(env(safe-area-inset-bottom)+0.5rem)] text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-700 focus-visible:ring-inset
        ${active ? 'text-brand-700' : 'text-slate-500'}`}
    >
      {/* 圖示只作為辨識提示；目前頁面與入口名稱由文字及 aria-current 明確表達，避免讀屏重複朗讀圖示。 */}
      <Icon name={icon} className="h-6 w-6" />
      <span>{text(label)}</span>
    </button>
  )
}
