/*
檔案用途：公開衛教內容頁的共用排版元件（標題、來源日期、章節、底部 CTA）。
所在層：src/components/ui 共用畫面元件層；供 src/features/system-admin/pages/guides 底下各篇文章頁引用，避免每篇重複排版與雙語骨架。
主要關聯：被 App.tsx 依 pathname 直接渲染的公開內容頁使用；不讀取任何登入狀態或照護資料，可在未登入時開啟。
*/
import { useEffect, type ReactNode } from 'react'
import { useI18n, type LocalizedText } from '../../lib/i18n'
import { APP_NAME_ZH, APP_NAME_EN } from '../../lib/appInfo'
import { LanguageSwitcher } from './LanguageSwitcher'

export function ContentGuideLayout({ title, sourceNote, metaDescription, children }: {
  title: LocalizedText
  sourceNote: LocalizedText
  metaDescription: LocalizedText
  children: ReactNode
}) {
  const { text, locale } = useI18n()

  useEffect(() => {
    // 這幾頁是特地做給搜尋引擎索引的公開內容頁，document.title 與 meta description 必須跟著
    // 目前語系走，否則不管換到哪個語言，搜尋結果與分頁標題都只會停在瀏覽器載入當下那一版。
    const previousTitle = document.title
    document.title = `${text(title)} | ${locale === 'zh' ? APP_NAME_ZH : APP_NAME_EN}`
    const metaEl = document.querySelector('meta[name="description"]')
    const previousDescription = metaEl?.getAttribute('content') ?? null
    let createdMetaEl: HTMLMetaElement | null = null
    let el = metaEl as HTMLMetaElement | null
    if (!el) {
      el = document.createElement('meta')
      el.setAttribute('name', 'description')
      document.head.appendChild(el)
      createdMetaEl = el
    }
    el.setAttribute('content', text(metaDescription))
    return () => {
      document.title = previousTitle
      if (createdMetaEl) {
        createdMetaEl.remove()
      } else if (previousDescription !== null) {
        el?.setAttribute('content', previousDescription)
      }
    }
  }, [text, title, metaDescription, locale])

  return (
    <div className="min-h-dvh bg-gray-50 text-gray-900">
      <header className="sticky top-0 z-10 border-b border-gray-200 bg-white px-4 py-3">
        <div className="mx-auto flex max-w-2xl items-center justify-between">
          <a href="/" className="text-sm font-bold text-gray-700">← {text({ id: 'Kembali ke Beranda', zh: '返回首頁' ,en: "Back to Home" })}</a>
          <LanguageSwitcher />
        </div>
      </header>
      <main className="mx-auto max-w-2xl px-5 py-8">
        <article className="space-y-6 rounded-3xl bg-white p-6 shadow-sm md:p-8">
          <div>
            <p className="text-xs font-bold text-indigo-700">{text(sourceNote)}</p>
            <h1 className="mt-2 text-2xl font-black">{text(title)}</h1>
          </div>
          {children}
          {/* 每頁固定放這段免責聲明：只陳述公開衛教資訊與本 App 的紀錄方式，不得出現診斷、治療或用藥建議措辭（AGENTS.md 橫向約束第 3 條）。 */}
          <p className="rounded-2xl bg-amber-50 p-4 text-xs leading-5 text-amber-900">
            {text({
              id: 'Halaman ini hanya berisi informasi edukasi kesehatan yang bersifat umum dan cara mencatatnya di aplikasi ini — bukan diagnosis, bukan anjuran pengobatan, dan bukan pengganti keputusan dokter. Untuk gejala yang memburuk atau keputusan pengobatan, selalu konsultasikan dengan tenaga medis.',
              zh: '本頁僅提供公開衛教資訊與本 App 的紀錄方式，不構成診斷、治療或用藥建議，不能取代醫療專業判斷。症狀惡化或用藥相關決定，請務必諮詢醫療人員。', en: 'This page provides general health education and explains how to record information in the app. It is not a diagnosis, treatment or medication recommendation, and it does not replace professional medical judgment. Consult a medical professional if symptoms worsen or you need to make a medication decision.',
            })}
          </p>
          <GuideCta />
        </article>
      </main>
    </div>
  )
}

function GuideCta() {
  const { text } = useI18n()
  return (
    <div className="rounded-2xl border border-indigo-100 bg-indigo-50 p-5 text-center">
      <p className="text-sm font-semibold text-indigo-900">
        {text({ id: 'Ingin mulai mencatatnya untuk keluarga Anda?', zh: '想開始幫家人記錄嗎？' ,en: 'Ready to start recording for your family?' })}
      </p>
      <a
        href="/demo"
        className="mt-3 inline-flex min-h-11 items-center justify-center rounded-xl bg-indigo-700 px-6 text-sm font-bold text-white shadow-sm transition hover:bg-indigo-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
      >
        {text({ id: 'Coba Mode Demo Gratis di JiaJian Log', zh: '用家健錄記錄（免費展示模式）' ,en: 'Try the free JiaJian Log demo' })}
      </a>
    </div>
  )
}

export function GuideSection({ title, children }: { title: LocalizedText; children: ReactNode }) {
  const { text } = useI18n()
  return (
    <section>
      <h2 className="font-bold">{text(title)}</h2>
      <div className="mt-2 space-y-2 text-sm leading-6 text-gray-700">{children}</div>
    </section>
  )
}

export function GuideList({ items }: { items: LocalizedText[] }) {
  const { text } = useI18n()
  return (
    <ul className="list-disc space-y-1.5 pl-5">
      {items.map((item, index) => <li key={index}>{text(item)}</li>)}
    </ul>
  )
}
