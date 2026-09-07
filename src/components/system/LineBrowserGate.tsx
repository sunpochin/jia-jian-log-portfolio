/*
檔案用途：在 LINE 內建瀏覽器中說明如何切換到 Safari／Chrome 完成登入。
所在層：src/components/system；由 App 的路由外殼在公開登入頁使用。
主要關聯：使用 LanguageSwitcher、WebViewWarning 與 i18n，並接收目前網址作為輔助開啟連結。
*/
import { useI18n } from '../../lib/i18n'
import { WebViewWarning } from './WebViewWarning'
import { PublicBrandHeader } from '../ui/PublicBrandHeader'

export function LineBrowserGate({ externalBrowserUrl }: { externalBrowserUrl: string }) {
  const { text } = useI18n()

  return (
    <div className="min-h-dvh bg-white px-6 py-6 text-slate-700">
      <PublicBrandHeader className="mx-auto w-full max-w-sm" />
      <main className="mx-auto flex min-h-[calc(100dvh-6rem)] w-full max-w-sm flex-col items-center justify-center gap-4 text-center">
        <span className="text-3xl" aria-hidden="true">🌐</span>
        <div className="space-y-2">
          <h1 className="text-lg font-bold">{text({ id: 'Buka di Safari atau Chrome', zh: '請用 Safari 或 Chrome 開啟', en: 'Open in Safari or Chrome' })}</h1>
          <p className="text-slate-500">{text({ id: 'LINE tidak dapat menyelesaikan login Google dengan aman.', zh: 'LINE 內建瀏覽器無法安全完成 Google 登入。', en: 'Line’s built-in browser is not able to securely complete Google Sign-In.' })}</p>
        </div>
        <WebViewWarning />
        <a
          href={externalBrowserUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-11 items-center justify-center rounded-xl bg-indigo-700 px-5 py-3 font-bold text-white"
        >
          {text({ id: 'Coba buka di browser', zh: '嘗試在外部瀏覽器開啟', en: 'Try opening in an external browser' })}
        </a>
        <p className="max-w-xs text-xs text-slate-500">
          {text({ id: 'Jika tombol tetap dibuka di LINE, gunakan menu kanan atas LINE.', zh: '如果按鈕仍留在 LINE，請使用 LINE 右上角選單開啟外部瀏覽器。', en: 'If the button remains on line, open an external browser using the menu in the top right corner of line.' })}
        </p>
      </main>
    </div>
  )
}
