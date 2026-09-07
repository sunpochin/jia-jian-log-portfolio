/**
 * 檔案用途：提供頂部雙語切換按鈕元件 (LanguageSwitcher)。
 * 所在層：src/components 畫面元件層。
 * 主要關聯：依賴 src/lib/i18n.tsx 提供之 useI18n context 更新系統語言狀態。
 */
import { useI18n } from '../../lib/i18n'

export function LanguageSwitcher({ className = '' }: { className?: string }) {
  const { locale, setLocale } = useI18n()
  return (
    <div className={`inline-flex rounded-xl bg-slate-200/80 p-0.5 shadow-sm ring-1 ring-inset ring-slate-300/70 ${className}`} role="group" aria-label="Pilih bahasa / 選擇語言 / Select language">
      {/* 語言切換器位於手機上方工具列，三個按鈕保留至少 44px 觸控面積，避免小字難以點按。縮小 px 確保三語言在窄螢幕仍可顯示。 */}
      <button type="button" aria-pressed={locale === 'zh'} onClick={() => setLocale('zh')} className={`min-h-11 min-w-12 px-2 text-xs font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600 focus-visible:ring-offset-1 rounded-lg ${locale === 'zh' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:bg-white/60'}`}>繁中</button>
      <button type="button" aria-pressed={locale === 'id'} onClick={() => setLocale('id')} className={`min-h-11 min-w-12 px-2 text-xs font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600 focus-visible:ring-offset-1 rounded-lg ${locale === 'id' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:bg-white/60'}`}>Indo</button>
      <button type="button" aria-pressed={locale === 'en'} onClick={() => setLocale('en')} className={`min-h-11 min-w-12 px-2 text-xs font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600 focus-visible:ring-offset-1 rounded-lg ${locale === 'en' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:bg-white/60'}`}>EN</button>
    </div>
  )
}
