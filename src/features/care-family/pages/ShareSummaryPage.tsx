/*
檔案用途：唯讀分享連結 Stage 3b 的公開接收頁；拿到連結的家人不需要帳號即可查看今日摘要。
所在層：src/features/care-family/pages；由 App.tsx 的 `/share` 路由掛載，沒有登入或照護資料的存取權。
主要關聯：src/lib/shareSummaryClient.ts、supabase/functions/share-link-exchange、supabase/functions/share-summary。
*/
import { useEffect, useRef, useState } from 'react'
import { useI18n, localized } from '../../../lib/i18n'
import { LanguageSwitcher } from '../../../components/ui/LanguageSwitcher'
import { VitalReading } from '../../vitals/components/VitalReading'
import { exchangeShareToken, fetchShareSummary, parseShareTokenFromHash, type PatientShareSummaryDto } from '../../../lib/shareSummaryClient'

type PageState =
  | { status: 'loading' }
  | { status: 'invalid' }
  | { status: 'ready'; summary: PatientShareSummaryDto }

// 沒有帳號、沒有寫入能力的公開頁面；任何失敗（畸形 hash、交換失敗、摘要讀取失敗）都收斂成同一種
// 「連結無效或已過期」畫面，不對外區分原因，避免變成可探測連結是否存在的旁路。
export function ShareSummaryPage() {
  const { text, locale } = useI18n()
  const [state, setState] = useState<PageState>({ status: 'loading' })
  // React 18 StrictMode 在開發模式會重跑一次 mount effect；第一次已經把 hash 清空並開始交換，
  // 沒有這個 guard 的話第二次重跑會讀到已經被清掉的 hash，把畫面錯誤地判定成「連結無效」。
  const startedRef = useRef(false)

  useEffect(() => {
    // 主要 CDN 層的 X-Robots-Tag（見 vercel.json）在任何 JS 執行前就已經生效；這裡的 meta
    // 只是給不看 HTTP header、只看畫面 DOM 的工具多一層防呆，兩者都要有才涵蓋不同種類的爬蟲／預覽器。
    const meta = document.createElement('meta')
    meta.name = 'robots'
    meta.content = 'noindex, nofollow, noarchive'
    document.head.appendChild(meta)
    return () => { document.head.removeChild(meta) }
  }, [])

  useEffect(() => {
    if (startedRef.current) return
    startedRef.current = true

    let cancelled = false
    // 為什麼在任何 await 之前就先清 hash：raw token 只能在記憶體停留最短時間；
    // 就算後面的交換或摘要讀取失敗、逾時或使用者離線，也不能讓 token 又回到網址列。
    const token = parseShareTokenFromHash(window.location.hash)
    window.history.replaceState(null, '', window.location.pathname)

    if (!token) {
      setState({ status: 'invalid' })
      return
    }

    exchangeShareToken(token)
      .then(({ session }) => fetchShareSummary(session))
      .then(summary => { if (!cancelled) setState({ status: 'ready', summary }) })
      .catch(error => {
        console.error('[share summary load error]', error)
        if (!cancelled) setState({ status: 'invalid' })
      })
    return () => { cancelled = true }
  }, [])

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center bg-gray-50 px-5 py-10 text-gray-900">
      {/* 第一次拿到連結的家人沒有任何已儲存的語言偏好，畫面預設中文；沒有這個切換器，
          印尼文使用者就完全無法把畫面換成看得懂的語言。 */}
      <div className="flex justify-end"><LanguageSwitcher /></div>
      <div className="mt-3 rounded-3xl bg-white p-6 shadow-sm">
        <p className="text-xs font-bold uppercase tracking-widest text-gray-400">{text({ id: 'Ringkasan Perawatan Baca-Saja', zh: '唯讀照護摘要' ,en: "Ringkasan Care Baca-Saja" })}</p>

        {state.status === 'loading' && (
          <p className="mt-4 text-sm text-gray-500">{text({ id: 'Memuat…', zh: '載入中…' ,en: "Loading…" })}</p>
        )}

        {state.status === 'invalid' && (
          <p className="mt-4 text-sm text-gray-700">{text({ id: 'Tautan ini tidak valid atau sudah kedaluwarsa.', zh: '這個連結無效或已過期。' ,en: "Tautan this not valid or already todaluwarsa." })}</p>
        )}

        {state.status === 'ready' && (
          <div className="mt-4 space-y-4">
            <h1 className="text-2xl font-black">{localized(state.summary.patientAlias, locale)}</h1>
            <p className="text-sm text-gray-500">{state.summary.summaryDate}（{state.summary.timezone}）</p>

            <div className="rounded-2xl border border-gray-200 p-4">
              <p className="text-xs font-bold text-gray-500">{text({ id: 'Tekanan Darah', zh: '血壓' ,en: "Blood pressure" })}</p>
              {state.summary.bloodPressure ? (
                <VitalReading
                  className="mt-1 text-xl"
                  systolic={state.summary.bloodPressure.systolic}
                  diastolic={state.summary.bloodPressure.diastolic}
                  pulse={state.summary.bloodPressure.pulse}
                />
              ) : (
                <p className="mt-1 text-sm text-gray-400">{text({ id: 'Belum ada catatan hari ini.', zh: '今天尚未記錄。' ,en: "No recordan days this." })}</p>
              )}
            </div>

            <p className="text-xs text-gray-400">
              {text({ id: 'Halaman ini hanya baca dan tidak dapat digunakan untuk mengubah data.', zh: '這是唯讀頁面，無法用來修改任何資料。' ,en: "Halaman this only read and not can be used for edit data." })}
            </p>
          </div>
        )}
      </div>
    </main>
  )
}
