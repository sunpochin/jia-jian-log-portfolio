/*
檔案用途：提供未登入公開入口共用的品牌標頭與語言切換。
所在層：src/components/ui；供登入頁與 WebView 公開引導頁重用。
主要關聯：使用 appInfo 的品牌文案、LanguageSwitcher 與全域 i18n context。
*/
import { useI18n } from '../../lib/i18n'
import { APP_HEADER_TITLE, APP_SUBTITLE } from '../../lib/appInfo'
import { LanguageSwitcher } from './LanguageSwitcher'

type PublicBrandHeaderProps = {
  className?: string
}

export function PublicBrandHeader({ className = '' }: PublicBrandHeaderProps) {
  const { text } = useI18n()

  return (
    <header className={`flex items-center justify-between ${className}`}>
      <div className="flex min-w-0 items-center gap-2">
        <img
          src="/favicon.svg"
          alt={text({ id: 'Logo JiaJian Log', zh: '家健錄商標', en: 'Home Health Record Logo' })}
          className="h-6 w-6 shrink-0 object-contain"
        />
        <div className="min-w-0">
          <p className="truncate text-sm font-bold tracking-tight text-slate-700">
            {text(APP_HEADER_TITLE)}
          </p>
          <p className="truncate text-[11px] font-medium text-slate-500">
            {text(APP_SUBTITLE)}
          </p>
        </div>
      </div>
      {/* 公開入口共用同一個語言位置，避免從登入頁切到 WebView 提示頁時迷路。 */}
      <LanguageSwitcher className="shrink-0" />
    </header>
  )
}
