/*
檔案用途：展示模式（/demo）頂部的固定提示橫幅，說明目前資料為虛構且提供「Google 登入」出口。
所在層：src/components/system；純呈現元件，不持有狀態，由父層傳入離開展示模式的 callback。
主要關聯：從 App.tsx 抽出（issue #764 App.tsx 拆分），只在 isDemoMode 為 true 時由 App 掛載。
*/
import { useI18n } from '../../lib/i18n'

interface DemoModeBannerProps {
  onExitDemoMode: () => void
}

export function DemoModeBanner({ onExitDemoMode }: DemoModeBannerProps) {
  const { text } = useI18n()
  return (
    <div className="bg-indigo-900 text-white px-4 py-2.5 text-xs md:text-sm font-semibold flex items-center justify-between shadow-sm border-b border-indigo-700/50">
      <div className="flex items-center gap-2 min-w-0">
        <span className="shrink-0 text-base">✨</span>
        <span className="truncate">
          {text({
            id: 'Mode Demo | Data fiktif + perubahan tersimpan di browser ini.',
            zh: '展示模式｜虛構照護資料，試用變更會保存在此瀏覽器', en: 'Demo mode | Fictional care data; changes you try are saved in this browser',
          })}
        </span>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {/* 照護者常在手機上快速切換展示與正式登入；保留小字級但擴大點擊區，避免誤觸。 */}
        <a
          href="/"
          onClick={onExitDemoMode}
          className="flex min-h-11 items-center gap-1 rounded-lg border border-white/30 bg-white/10 px-2.5 py-1 text-xs font-bold text-white transition hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-indigo-900 active:scale-95"
        >
          {/* 為什麼使用 SVG：鎖頭是操作提示，不應因手機 emoji 字型不同而改變尺寸或顏色。 */}
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
            <rect x="5" y="10" width="14" height="10" rx="2" />
            <path d="M8 10V7a4 4 0 0 1 8 0v3" />
          </svg>
          <span>{text({ id: 'Masuk dengan Google', zh: 'Google 登入' ,en: 'Sign in with Google' })}</span>
        </a>
      </div>
    </div>
  )
}
