/*
檔案用途：統一的聯絡與版本信息頁尾，在登入頁與設定頁共用以維持一致品牌形象。
所在層：src/components/system；無狀態呈現層，提供可重用的頁尾排版。
主要關聯：登入頁 (LoginScreen)、設定頁 (SettingsPage)、ReleaseVersion。
*/
import { APP_AUTHOR_URL } from '../../lib/appInfo'
import { useI18n } from '../../lib/i18n'
import { ReleaseVersion } from './ReleaseVersion'

type ContactAndVersionFooterProps = {
  className?: string
}

export function ContactAndVersionFooter({ className = '' }: ContactAndVersionFooterProps) {
  const { text } = useI18n()

  return (
    <footer className={`text-center space-y-2 text-xs text-gray-400 ${className}`}>
      {/* 聯絡與版本信息 */}
      <div className="flex flex-col items-center gap-2">
        <span>{text({ id: 'Hubungi saya', zh: '聯絡我', en: 'Hubungi saya' })}: <a className="underline hover:text-gray-600" href={APP_AUTHOR_URL} target="_blank" rel="noreferrer">{APP_AUTHOR_URL}</a></span>
        <ReleaseVersion />
      </div>
    </footer>
  )
}
