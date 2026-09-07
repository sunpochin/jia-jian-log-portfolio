/*
檔案用途：在 LINE、Instagram、Facebook 等內建瀏覽器中提示使用者改用外部瀏覽器登入。
所在層：src/components/system 系統提示元件層；由登入畫面依 WebView 狀態組合使用。
主要關聯：使用 src/lib/i18n.tsx 的目前語系，並與 src/lib/auth.ts 的 WebView 偵測保持責任分離。
*/
import { useI18n } from '../../lib/i18n'

const WEBVIEW_WARNING_COPY = {
  id: {
    title: '⚠️ Buka di Browser Eksternal',
    intro: 'Google login tidak tersedia di browser internal. Ketuk menu',
    menu: '(···)',
    connector: 'lalu pilih',
    action: '"Buka di Browser" atau gunakan Safari/Chrome',
    period: '.',
  },
  zh: {
    title: '⚠️ 在瀏覽器中開啟',
    intro: '應用內瀏覽器無法使用 Google 登入。請點擊右上角選單',
    menu: '(⋯)',
    connector: '並選擇',
    action: '「在瀏覽器中開啟」或用 Safari/Chrome 開啟',
    period: '。',
  },
 en: {
    title: '⚠️ Open in Browser',
    intro: 'Google login is not available in the app browser. Tap the menu',
    menu: '(···)',
    connector: 'and select',
    action: '"Open in Browser" or use Safari/Chrome',
    period: '.',
  },
} as const

export function WebViewWarning() {
  const { locale } = useI18n()
  const copy = WEBVIEW_WARNING_COPY[locale]

  return (
    <div className="mt-4 max-w-xs text-left rounded-2xl bg-amber-50 border border-amber-200 px-4 py-3 text-xs text-amber-800 flex flex-col gap-2">
      <div>
        {/* 繁體中文註解：內文依目前選定語系取單一文案，避免手機 WebView 同時堆疊兩種語言而壓縮操作指引。 */}
        <span className="font-bold">{copy.title}</span>
        <p className="mt-0.5">
          {copy.intro} (<span className="font-bold">{copy.menu}</span>) {copy.connector}{' '}
          <span className="font-bold">{copy.action}</span>{copy.period}
        </p>
      </div>
    </div>
  )
}
