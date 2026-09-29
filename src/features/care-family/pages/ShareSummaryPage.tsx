/*
檔案用途：唯讀分享連結 Stage 3b 的公開接收頁；拿到連結的家人或醫師不需要帳號即可查看 v1（今日血壓）或 v2（兩週照護摘要）。
所在層：src/features/care-family/pages；由 PublicRouteSwitch 的 `/share` 分支掛載，沒有登入或照護資料的存取權。
  純呈現層：不得 import evaluateReading／evaluateBp／useBpEvaluator，DTO 只存在 React state，不落任何瀏覽器儲存
  （ADR-009 不變量 2；tests/unit/shareSummaryPageBoundary.test.ts 靜態鎖住）。
主要關聯：src/lib/shareSummaryClient.ts、components/shareSummaryV2/ShareSummaryV2View.tsx、
  supabase/functions/share-link-exchange、supabase/functions/share-summary。
*/
import { useEffect, useRef, useState } from 'react'
import { useI18n, localized } from '../../../lib/i18n'
import { LanguageSwitcher } from '../../../components/ui/LanguageSwitcher'
import { VitalReading } from '../../vitals/components/VitalReading'
import {
  ShareSummaryUnavailableError,
  exchangeShareToken,
  fetchShareSummary,
  isShareSummaryV2,
  parseShareTokenFromHash,
  type PatientShareSummary,
} from '../../../lib/shareSummaryClient'
import { ShareSummaryV2View } from '../components/shareSummaryV2/ShareSummaryV2View'
import { SHARE_V2_INVALID, SHARE_V2_LABELS, SHARE_V2_UNAVAILABLE } from '../shareSummaryV2Copy'

type PageState =
  | { status: 'loading' }
  | { status: 'invalid' }
  // 503：伺服器暫時無法產生（標準讀不到／資料異常）；文案請對方稍後再開，不是「連結無效」。
  | { status: 'unavailable' }
  | { status: 'ready'; summary: PatientShareSummary }

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
        if (cancelled) return
        setState({ status: error instanceof ShareSummaryUnavailableError ? 'unavailable' : 'invalid' })
      })
    return () => { cancelled = true }
  }, [])

  return (
    // v2 內容較多，卡片放寬到 2xl；v1 仍是同一張卡片，只是內容少。
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col justify-center bg-gray-50 px-5 py-10 text-gray-900 print:max-w-none print:bg-white print:px-0 print:py-0">
      {/* 第一次拿到連結的家人沒有任何已儲存的語言偏好，畫面預設中文；沒有這個切換器，
          印尼文使用者就完全無法把畫面換成看得懂的語言。 */}
      <div className="flex justify-end print:hidden"><LanguageSwitcher /></div>
      <div className="mt-3 rounded-3xl bg-white p-6 shadow-sm print:mt-0 print:rounded-none print:p-0 print:shadow-none">
        <p className="text-xs font-bold uppercase tracking-widest text-gray-400">{text(SHARE_V2_LABELS.pageTitle)}</p>

        {state.status === 'loading' && (
          <p className="mt-4 text-sm text-gray-500">{text(SHARE_V2_LABELS.loading)}</p>
        )}

        {state.status === 'invalid' && (
          <p className="mt-4 text-sm text-gray-700">{text(SHARE_V2_INVALID)}</p>
        )}

        {state.status === 'unavailable' && (
          <p className="mt-4 text-sm text-gray-700">{text(SHARE_V2_UNAVAILABLE)}</p>
        )}

        {state.status === 'ready' && isShareSummaryV2(state.summary) && <ShareSummaryV2View summary={state.summary} />}

        {state.status === 'ready' && !isShareSummaryV2(state.summary) && (
          <div className="mt-4 space-y-4">
            <h1 className="text-2xl font-black">{localized(state.summary.patientAlias, locale)}</h1>
            <p className="text-sm text-gray-500">{state.summary.summaryDate}（{state.summary.timezone}）</p>

            <div className="rounded-2xl border border-gray-200 p-4">
              <p className="text-xs font-bold text-gray-500">{text({ id: 'Tekanan Darah', zh: '血壓', en: 'Blood pressure' })}</p>
              {state.summary.bloodPressure ? (
                <VitalReading
                  className="mt-1 text-xl"
                  systolic={state.summary.bloodPressure.systolic}
                  diastolic={state.summary.bloodPressure.diastolic}
                  pulse={state.summary.bloodPressure.pulse}
                />
              ) : (
                <p className="mt-1 text-sm text-gray-400">{text({ id: 'Belum ada catatan hari ini.', zh: '今天尚未記錄。', en: 'No records for today.' })}</p>
              )}
            </div>

            <p className="text-xs text-gray-400">
              {text({ id: 'Halaman ini hanya baca dan tidak dapat digunakan untuk mengubah data.', zh: '這是唯讀頁面，無法用來修改任何資料。', en: 'This is a read-only page and cannot be used to modify data.' })}
            </p>
          </div>
        )}
      </div>
    </main>
  )
}
