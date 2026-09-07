/*
檔案用途：未登入公開首頁 / 登入進入點元件，包含品牌形象、雙語特色介紹與 Google GIS 登入。
所在層：src/components/auth；負責引導訪客登入或開啟 Demo 體驗模式。
主要關聯：src/App.tsx、GoogleSignInButton、LanguageSwitcher、WebViewWarning。
*/
import { useState } from 'react'
import { useI18n, type LocalizedText } from '../../lib/i18n'
import { APP_HEADER_TITLE, APP_SUBTITLE } from '../../lib/appInfo'
import { isWebView } from '../../lib/auth'
import { GoogleSignInButton } from './GoogleSignInButton'
import { PublicBrandHeader } from '../ui/PublicBrandHeader'
import { WebViewWarning } from '../system/WebViewWarning'
import { ContactAndVersionFooter } from '../system/ContactAndVersionFooter'
import { trackEvent } from '../../lib/analytics'

type LoginScreenProps = {
  onEnterDemo?: () => void
  showDemo?: boolean
}

const TRUST_ITEMS: { text: LocalizedText; href: string }[] = [
  {
    text: {
      id: 'Data disimpan di database Supabase yang terenkripsi SSL/TLS.',
      zh: '資料存放於經 SSL/TLS 加密的 Supabase 資料庫。' ,en: 'Data is stored in an SSL/TLS-encrypted Supabase database.'
    },
    href: '/privacy'
  },
  {
    text: {
      id: 'Hanya anggota keluarga yang berwenang yang dapat melihat data Anda (isolasi RLS per keluarga).',
      zh: '僅授權家庭成員看得到您的資料（RLS 家庭隔離）。' ,en: 'Only authorized family members can view your data (RLS isolates each family).'
    },
    href: '/privacy'
  },
  {
    text: {
      id: 'Anda dapat mengekspor seluruh catatan sebagai CSV kapan saja di Pengaturan.',
      zh: '您可隨時於設定頁面將所有紀錄匯出為 CSV。' ,en: 'You can export all records as CSV at any time from Settings.'
    },
    href: '/privacy'
  },
  {
    text: {
      id: 'Anda dapat menghapus akun dan seluruh data pribadi sendiri kapan saja.',
      zh: '您可隨時自主刪除帳號與所有個人資料。' ,en: 'You can delete your account and all personal data at any time.'
    },
    href: '/privacy'
  },
  {
    text: {
      id: 'Saat ini layanan ini tidak memungut biaya apa pun.',
      zh: '目前完全不收費使用。' ,en: 'This service is currently free of charge.'
    },
    href: '/terms'
  }
]

export function LoginScreen({ onEnterDemo, showDemo = true }: LoginScreenProps) {
  const { text, locale } = useI18n()
  const [errorMessage, setErrorMessage] = useState<LocalizedText | null>(null)
  const [showTrustDetails, setShowTrustDetails] = useState(false)

  return (
    <div className="min-h-dvh flex flex-col items-center justify-between px-6 py-6 bg-gradient-to-b from-slate-50 via-rose-50/20 to-indigo-50/30 text-slate-900 selection:bg-rose-100 overflow-y-auto">
      {/* 登入頁與其他公開入口共用標頭，避免品牌副標與語言入口各自漂移。 */}
      <PublicBrandHeader className="mb-4 w-full max-w-sm rounded-full border border-slate-200/80 bg-white/80 px-4 py-2 shadow-xs backdrop-blur-md" />

      {/* 首頁核心視覺區塊：優雅標題層級與特色卡片 */}
      <main className="w-full max-w-sm flex flex-col items-center text-center gap-4 my-auto">
        <div className="space-y-1.5">
          <h1 className="text-2xl md:text-3xl font-black tracking-tight text-slate-900 leading-tight">
            {text(APP_HEADER_TITLE)}
          </h1>
          <div className="flex items-center justify-center gap-2 pt-0.5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-rose-600 bg-rose-50 border border-rose-200/60 px-2.5 py-0.5 rounded-full">
              {text(APP_SUBTITLE)}
            </span>
            <span className="text-[10px] font-medium text-slate-400">|</span>
            <span className="text-xs font-medium text-slate-600">
              {text({ id: 'Platform Perawatan Keluarga', zh: '家庭照護紀錄平台' ,en: 'Family Care Record Platform' })}
            </span>
          </div>
        </div>

        {/* 公開衛教資源：取代原本的核心功能卡片，直接以可點擊的衛教連結呈現 */}
        <div className="w-full space-y-2">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            {text({ id: 'Sumber Edukasi Kesehatan', zh: '公開衛教資源' ,en: 'Health education' })}
          </p>
          <div className="grid grid-cols-2 gap-2">
            <a
              href="/guides/blood-pressure-722"
              className="p-2 rounded-xl bg-rose-50/60 border border-rose-200/60 hover:border-rose-300 hover:bg-rose-50 transition-colors text-center text-[11px] font-medium text-slate-700 hover:text-slate-900"
            >
              <div className="text-lg mb-0.5">🩺</div>
              {text({ id: 'Tekanan Darah 722', zh: '血壓 722' ,en: "Blood pressure 722" })}
            </a>
            <a
              href="/guides/medication-schedule"
              className="p-2 rounded-xl bg-blue-50/60 border border-blue-200/60 hover:border-blue-300 hover:bg-blue-50 transition-colors text-center text-[11px] font-medium text-slate-700 hover:text-slate-900"
            >
              <div className="text-lg mb-0.5">💊</div>
              {text({ id: 'Jadwal Obat', zh: '用藥時段' ,en: "Medication schedule" })}
            </a>
            <a
              href="/guides/caregiver-handover"
              className="p-2 rounded-xl bg-amber-50/60 border border-amber-200/60 hover:border-amber-300 hover:bg-amber-50 transition-colors text-center text-[11px] font-medium text-slate-700 hover:text-slate-900"
            >
              <div className="text-lg mb-0.5">📋</div>
              {text({ id: 'Operan Pengasuh', zh: '看護交接' ,en: 'Caregiver handover' })}
            </a>
            <a
              href="/guides/pet-chronic-disease"
              className="p-2 rounded-xl bg-green-50/60 border border-green-200/60 hover:border-green-300 hover:bg-green-50 transition-colors text-center text-[11px] font-medium text-slate-700 hover:text-slate-900"
            >
              <div className="text-lg mb-0.5">🐾</div>
              {text({ id: 'Hewan Kronis', zh: '寵物紀錄' ,en: 'Chronic pet care' })}
            </a>
          </div>
        </div>

        {/* 登入與試用按鈕區 */}
        <div className="w-full space-y-3 pt-2">
          <div className="w-full flex justify-center">
            <GoogleSignInButton key={locale} locale={locale} onError={setErrorMessage} />
          </div>

          {showDemo && onEnterDemo && <>
            <button
              type="button"
              onClick={() => {
                // 只送語系與固定事件名稱；Demo 內的虛構健康資料不應進分析服務。
                trackEvent('demo_start', { locale })
                onEnterDemo()
              }}
              className="w-full h-11 inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-indigo-600 via-indigo-700 to-slate-900 hover:from-indigo-500 hover:to-slate-800 px-6 text-sm font-bold text-white shadow-md shadow-indigo-600/20 active:scale-[0.98] transition-all"
            >
              <span aria-hidden="true">✨</span>
              <span>{text({ id: 'Coba sekarang', zh: '試用看看' ,en: 'Try the demo' })}</span>
            </button>

            <p className="text-xs text-slate-500 font-medium">
              {text({ id: 'Tanpa login, lihat cara mencatat tekanan darah dan mengatur obat.', zh: '不用登入，先體驗血壓紀錄與藥單調整。' ,en: 'You don’t need to be logged in to experience blood pressure records and medication list adjustments.' })}
            </p>
          </>}
        </div>
      </main>

      {/* 底部條款與開發者聯絡資訊 */}
      <footer className="w-full max-w-sm text-center space-y-3 pt-6 pb-2 text-xs text-slate-500">
        {/* 登入前信任與費用說明區塊（issue #444）：預設收合，不佔位、不影響登入按鈕版面，僅在展開時於頁尾內捲動顯示 */}
        <div className="text-left">
          <button
            type="button"
            onClick={() => setShowTrustDetails((prev) => !prev)}
            aria-expanded={showTrustDetails}
            aria-controls="login-trust-details"
            className="mx-auto flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-slate-700"
          >
            <span aria-hidden="true">{showTrustDetails ? '▾' : '▸'}</span>
            <span>{text({ id: 'Bagaimana data Anda dilindungi?', zh: '您的資料如何被保護？' ,en: 'How is your data protected?' })}</span>
          </button>

          {showTrustDetails && (
            <ul id="login-trust-details" className="mt-2 space-y-1.5 rounded-2xl border border-slate-200 bg-white/70 p-3">
              {TRUST_ITEMS.map((item) => (
                <li key={item.href + item.text.zh} className="text-[11px] leading-relaxed text-slate-600">
                  <a href={item.href} className="underline decoration-slate-300 hover:decoration-slate-500 hover:text-slate-900">
                    {text(item.text)}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>

        <p className="leading-relaxed text-slate-500">
          {/* 條款句子包含連結節點，不能只用 text()；三種語系在這裡明確分支，避免英文誤落回印尼文。 */}
          {locale === 'zh' ? <>繼續即表示您同意<a className="font-semibold underline text-slate-700 hover:text-slate-900" href="/terms">《服務條款》</a>，並確認已閱讀<a className="font-semibold underline text-slate-700 hover:text-slate-900" href="/privacy">《隱私權政策》</a>。</> : locale === 'en' ? <>By continuing, you agree to the <a className="font-semibold underline text-slate-700 hover:text-slate-900" href="/terms">Terms of Service</a> and confirm that you have read the <a className="font-semibold underline text-slate-700 hover:text-slate-900" href="/privacy">Privacy Policy</a>.</> : <>Dengan melanjutkan, Anda menyetujui <a className="font-semibold underline text-slate-700 hover:text-slate-900" href="/terms">Syarat & Ketentuan</a> dan mengonfirmasi telah membaca <a className="font-semibold underline text-slate-700 hover:text-slate-900" href="/privacy">Kebijakan Privasi</a>.</>}
        </p>

        <ContactAndVersionFooter className="text-slate-400" />

        {errorMessage && (
          <p className="mx-auto max-w-xs rounded-2xl bg-red-50 p-3 text-xs text-red-700 border border-red-100 font-medium">
            {text({ id: 'Gagal masuk', zh: '登入失敗' ,en: 'Login failed' })}
            <br />
            <span className="text-[11px] text-red-600">{text(errorMessage)}</span>
          </p>
        )}

        {isWebView() && <WebViewWarning />}
      </footer>
    </div>
  )
}
