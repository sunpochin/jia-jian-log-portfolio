/*
檔案用途：以一致格式顯示正式版本、提交識別、發布代號與發布日期，並連到完整 release notes。
所在層：src/components 共用呈現層；不管理版本內容，僅讀取 appInfo.ts 的單一來源。
主要關聯：由登入頁、設定／條款頁使用，並以 MengniDogMark 呈現「猛膩版」旁的視覺記號。
*/
import { APP_GIT_SHA_SHORT, APP_RELEASE_CODENAME, APP_RELEASE_DATE, APP_VERSION } from '../../lib/appInfo'
import { useI18n } from '../../lib/i18n'
import { MengniDogMark } from './MengniDogMark'

export function ReleaseVersion() {
  const { text } = useI18n()
  return (
    <a
      href="/releases"
      className="inline-flex flex-wrap items-center gap-x-1 gap-y-0.5 underline decoration-gray-300 underline-offset-2 hover:text-gray-700"
      aria-label={text({ id: 'Buka catatan rilis', zh: '開啟版本更新說明', en: 'Open release notes' })}
    >
      <span>v{APP_VERSION}</span>
      <span aria-hidden="true">｜</span>
      <span className="inline-flex items-center gap-0.5 font-semibold text-gray-700">{text(APP_RELEASE_CODENAME)}<MengniDogMark /></span>
      <span>· {text({ id: 'Commit ' + APP_GIT_SHA_SHORT, zh: '提交 ' + APP_GIT_SHA_SHORT, en: 'Commit ' + APP_GIT_SHA_SHORT })}</span>
      <span>· {text({ id: 'Dirilis ' + APP_RELEASE_DATE, zh: '發布於 ' + APP_RELEASE_DATE, en: 'Released ' + APP_RELEASE_DATE })}</span>
    </a>
  )
}
