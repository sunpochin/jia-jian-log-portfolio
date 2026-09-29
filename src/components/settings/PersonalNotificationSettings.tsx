/*
檔案用途：讓已付費使用者查看並管理自己的 Telegram／LINE 個人化通知綁定狀態。
所在層：src/components/settings；自給自足元件，不接 props、自己管狀態、自己呼叫 lib，比照 ReadingScaleSettings 慣例。
主要關聯：SettingsPage、src/lib/messagingLinks.ts 與 current_messaging_link_status／create_messaging_link_token／
unlink_messaging_channel RPC（issue #599）。LINE 那一列（issue #604）沿用同一組狀態與 handler，只換 channel 名稱、
env 設定 key 與訊息文案；webhook／push sender 本身不在這支檔案的範圍內。
*/
import { useCallback, useEffect, useState } from 'react'
import { useI18n, type LocalizedText } from '../../lib/i18n'
import { useSaveStatus } from '../../hooks/useSaveStatus'
import { describeReadError, describeSaveError } from '../../lib/dataErrors'
import { isDemoMode } from '../../lib/demoStorage'
import { createMessagingLinkUrl, fetchMessagingLinkStatus, normalizeLineOaBasicId, unlinkMessagingChannel, type MessagingChannel, type MessagingLinkStatus } from '../../lib/messagingLinks'

const TITLE: LocalizedText = { id: 'Notifikasi pribadi', zh: '個人化通知', en: 'Personal notifications' }
const HELP: LocalizedText = {
  id: 'Hubungkan Telegram atau LINE Anda sendiri agar menerima notifikasi tekanan darah untuk orang yang Anda rawat, tanpa perlu berbagi grup keluarga. Tautan berlaku 10 menit.',
  zh: '把你自己的 Telegram 或 LINE 綁到這個帳號，就能收到你有照護權限的病人的血壓通知，不用共用家庭群組。連結有效期 10 分鐘。',
  en: 'Link your own Telegram or LINE to receive blood pressure notifications for the people you care for, without sharing the family group. The link is valid for 10 minutes.',
}
const PAYWALL_NOTICE: LocalizedText = {
  id: 'Notifikasi pribadi adalah fitur berbayar. Hubungi pengelola akun untuk mengaktifkannya.',
  zh: '個人化通知是付費功能，請聯絡帳號管理者開通。',
  en: 'Personal notifications is a paid feature. Contact your account administrator to enable it.',
}
const DEMO_NOTICE: LocalizedText = {
  id: 'Notifikasi pribadi tidak tersedia dalam mode demo.',
  zh: '展示模式不提供個人化通知。',
  en: 'Personal notifications is not available in demo mode.',
}
const BOT_NOT_CONFIGURED: LocalizedText = { id: 'Bot Telegram belum dikonfigurasi.', zh: 'Telegram bot 尚未設定', en: 'Telegram bot is not configured yet.' }
const LINE_OA_NOT_CONFIGURED: LocalizedText = { id: 'Akun LINE resmi belum dikonfigurasi.', zh: 'LINE 官方帳號尚未設定', en: 'LINE official account is not configured yet.' }
// 為什麼特別提醒「加入好友」：line.me 的 oaMessage 連結不需要先加好友就能打開對話、送出 /link 並綁定成功，
// 但 LINE 對「沒加好友或已封鎖」的收件人推播時一樣回 HTTP 200、訊息卻不會送達——outbox 會記成已送出，
// 使用者卻永遠收不到血壓通知，而且系統看不出來。這裡在綁定當下就把前提講清楚，是目前唯一擋得住的地方。
const LINE_LINK_OPENED: LocalizedText = {
  id: 'Buka LINE dan kirim pesan yang sudah terisi untuk menyelesaikan koneksi, lalu pastikan akun resmi sudah ditambahkan sebagai teman — tanpa berteman, notifikasi tidak akan sampai.',
  zh: '請在開啟的 LINE 對話中送出已預填的訊息完成綁定，並確認已把官方帳號加入好友——沒有加好友將收不到通知。',
  en: 'Open LINE and send the prefilled message to finish linking, and make sure the official account is added as a friend — otherwise notifications will not arrive.',
}

// 兩個管道共用同一組 label／文案 key，只差 channel 字串與各自的「未設定」訊息；
// 集中在這裡避免 JSX 裡出現兩份幾乎一樣但容易悄悄長歪的區塊。
const CHANNEL_LABEL: Record<MessagingChannel, string> = { telegram: 'Telegram', line: 'LINE' }
const NOT_CONFIGURED_NOTICE: Record<MessagingChannel, LocalizedText> = { telegram: BOT_NOT_CONFIGURED, line: LINE_OA_NOT_CONFIGURED }

function linkedAtText(linkedAt: string, locale: 'id' | 'zh' | 'en'): string {
  const date = new Date(linkedAt)
  if (Number.isNaN(date.getTime())) return linkedAt
  return date.toLocaleString(locale === 'zh' ? 'zh-TW' : locale === 'id' ? 'id-ID' : 'en-US')
}

export function PersonalNotificationSettings() {
  const { text, locale } = useI18n()
  const demo = isDemoMode()
  const [loading, setLoading] = useState(!demo)
  const [loadError, setLoadError] = useState<LocalizedText | null>(null)
  const [statuses, setStatuses] = useState<MessagingLinkStatus[]>([])
  const save = useSaveStatus()

  const reload = useCallback(() => {
    if (demo) { setLoading(false); return }
    setLoading(true)
    setLoadError(null)
    fetchMessagingLinkStatus()
      .then(setStatuses)
      .catch(error => {
        console.error('[fetch messaging link status error]', error)
        setLoadError(describeReadError(error))
      })
      .finally(() => setLoading(false))
  }, [demo])

  useEffect(reload, [reload])

  // 為什麼要重新查一次：使用者按下連結後會離開這個分頁去 Telegram 完成 /start，
  // 回到這裡時（切回分頁或 App 恢復前景）畫面仍停在「未綁定」的舊狀態，
  // 沒有任何自然的時機點會重新呼叫 RPC；用 focus／visibilitychange 補上這個缺口。
  useEffect(() => {
    if (demo) return
    const handleRefocus = () => {
      if (document.visibilityState === 'hidden') return
      reload()
    }
    window.addEventListener('focus', handleRefocus)
    document.addEventListener('visibilitychange', handleRefocus)
    return () => {
      window.removeEventListener('focus', handleRefocus)
      document.removeEventListener('visibilitychange', handleRefocus)
    }
  }, [demo, reload])

  // 通用化成單一函式，Telegram／LINE 共用同一套「開彈窗 → 等 RPC → 導頁」流程，只有 channel 與
  // 完成後的三語提示不同；LINE 走 line.me 深連結，一樣受同一個彈窗時機限制（見下方註解）。
  const handleLink = async (channel: MessagingChannel) => {
    save.begin()
    // 為什麼在 await 之前就先開視窗：手機版 Safari／PWA 的「使用者剛點過」授權視窗很短，
    // 等 RPC 這種需要打網路的非同步操作跑完才呼叫 window.open 常常已經超出那個視窗，
    // 導致彈窗被封鎖——使用者看到「成功」訊息，卻沒有分頁能完成綁定，token 也在 10 分鐘後失效。
    // 先同步開一個空白分頁佔住彈窗許可，等 URL 準備好了再導頁；不用 noopener 才能保留參照改寫網址，
    // 改用「導頁後清空 opener」達到等同 noopener 的效果（對方頁面無法透過 window.opener 操控本頁）。
    const popup = window.open('about:blank', '_blank')
    try {
      const url = await createMessagingLinkUrl(channel)
      if (popup) {
        popup.location.href = url
        popup.opener = null
      } else {
        // 彈窗還是被封鎖（例如使用者關掉了跳出視窗權限）：退回原本的做法，至少不會整個失敗。
        window.open(url, '_blank', 'noopener,noreferrer')
      }
      const message = channel === 'telegram'
        ? { id: 'Buka Telegram untuk menyelesaikan koneksi.', zh: '請在開啟的 Telegram 對話中按下 Start 完成綁定。', en: 'Open Telegram and tap Start to finish linking.' }
        : LINE_LINK_OPENED
      save.succeed(text(message))
    } catch (error) {
      popup?.close()
      console.error('[create messaging link error]', error)
      save.fail(text(describeSaveError(error)))
    }
  }

  const handleUnlink = async (channel: MessagingChannel) => {
    save.begin()
    try {
      await unlinkMessagingChannel(channel)
      setStatuses(previous => previous.map(status => (status.channel === channel ? { ...status, linked: false, linkedAt: null } : status)))
      const message = channel === 'telegram'
        ? { id: 'Telegram telah dilepas.', zh: '已解除 Telegram 綁定。', en: 'Telegram has been unlinked.' }
        : { id: 'LINE telah dilepas.', zh: '已解除 LINE 綁定。', en: 'LINE has been unlinked.' }
      save.succeed(text(message))
    } catch (error) {
      console.error('[unlink messaging channel error]', error)
      save.fail(text(describeSaveError(error)))
    }
  }

  const getStatus = (channel: MessagingChannel) => statuses.find(status => status.channel === channel) ?? null
  const telegram = getStatus('telegram')
  const line = getStatus('line')
  // 付費旗標「不分管道」（ADR-003 決策二）：兩個 channel 的 notification_tier 理論上永遠一致，
  // 任取其中一筆已綁定資訊即可；RPC 找不到資料時保守視為未付費，避免顯示假可用的按鈕。
  const paidTier = (telegram ?? line)?.notificationTier === 'personal'
  const botConfigured = Boolean(import.meta.env.VITE_TELEGRAM_BOT_USERNAME)
  // 與 createMessagingLinkUrl 用同一個正規化：只填了「@」也算未設定，不顯示一顆按了必定失敗的按鈕。
  const lineOaConfigured = Boolean(normalizeLineOaBasicId(import.meta.env.VITE_LINE_OA_BASIC_ID))
  const busy = save.status === 'saving'

  const channelConfigured: Record<MessagingChannel, boolean> = { telegram: botConfigured, line: lineOaConfigured }

  return (
    <section className="mt-6 rounded-2xl border border-gray-200 bg-white p-4" aria-labelledby="personal-notification-settings-title">
      <h2 id="personal-notification-settings-title" className="font-bold text-gray-900">{text(TITLE)}</h2>
      <p className="mt-1 text-sm text-gray-500">{text(HELP)}</p>

      {demo && <p className="mt-3 rounded-xl bg-gray-100 px-3 py-2 text-xs text-gray-600">{text(DEMO_NOTICE)}</p>}

      {!demo && loading && <p className="mt-3 text-sm text-gray-500">{text({ id: 'Memuat…', zh: '載入中…', en: 'Loading…' })}</p>}

      {!demo && !loading && loadError && (
        <p role="alert" className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">{text(loadError)}</p>
      )}

      {!demo && !loading && !loadError && (
        <>
          {!paidTier && <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800">{text(PAYWALL_NOTICE)}</p>}

          {(['telegram', 'line'] as const).map(channel => {
            const status = getStatus(channel)
            const configured = channelConfigured[channel]
            return (
              <div key={channel} className="mt-3 flex min-h-12 items-center justify-between gap-3 rounded-xl bg-gray-50 px-3 py-2">
                <span className="min-w-0">
                  <span className="block font-semibold text-gray-900">{CHANNEL_LABEL[channel]}</span>
                  {status?.linked && status.linkedAt && (
                    <span className="mt-0.5 block text-xs text-gray-500">
                      {text({ id: 'Terhubung sejak', zh: '綁定於', en: 'Linked since' })} {linkedAtText(status.linkedAt, locale)}
                    </span>
                  )}
                  {!configured && <span className="mt-0.5 block text-xs text-gray-400">{text(NOT_CONFIGURED_NOTICE[channel])}</span>}
                </span>
                {status?.linked ? (
                  <button
                    type="button"
                    onClick={() => void handleUnlink(channel)}
                    disabled={busy}
                    className="shrink-0 rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-semibold text-gray-700 disabled:opacity-50"
                  >
                    {text({ id: 'Lepas', zh: '解除綁定', en: 'Unlink' })}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => void handleLink(channel)}
                    disabled={busy || !paidTier || !configured}
                    className="shrink-0 rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    {text({ id: 'Hubungkan', zh: '連結', en: 'Link' })}
                  </button>
                )}
              </div>
            )
          })}
        </>
      )}

      {save.status === 'ok' && <p className="mt-2 text-xs font-semibold text-emerald-700">{save.message}</p>}
      {save.status === 'err' && <p role="alert" className="mt-2 rounded-xl bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">{save.message}</p>}
    </section>
  )
}
