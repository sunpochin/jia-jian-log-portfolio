/*
檔案用途：集中處理個人化通知綁定的前端呼叫邊界——查詢綁定狀態、產生綁定深連結、解除綁定。
所在層：src/lib；供 PersonalNotificationSettings 使用，只把 channel 名稱交給登入者 session。
主要關聯：src/components/settings/PersonalNotificationSettings.tsx、
current_messaging_link_status／create_messaging_link_token／unlink_messaging_channel RPC（issue #599）。
*/
import { supabase } from './supabase'

export type MessagingChannel = 'telegram' | 'line'
export type NotificationTier = 'none' | 'personal'

export type MessagingLinkStatus = {
  channel: MessagingChannel
  linked: boolean
  linkedAt: string | null
  notificationTier: NotificationTier
}

type RpcLike = (functionName: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>

const defaultRpc: RpcLike = async (functionName, args) => supabase.rpc(functionName, args)

function toMessagingLinkStatus(row: Record<string, unknown>): MessagingLinkStatus {
  return {
    channel: row.channel as MessagingChannel,
    linked: Boolean(row.linked),
    linkedAt: row.linked_at ? String(row.linked_at) : null,
    notificationTier: (row.notification_tier === 'personal' ? 'personal' : 'none'),
  }
}

export async function fetchMessagingLinkStatus(rpc: RpcLike = defaultRpc): Promise<MessagingLinkStatus[]> {
  const { data, error } = await rpc('current_messaging_link_status')
  if (error) throw error
  return ((data ?? []) as Array<Record<string, unknown>>).map(toMessagingLinkStatus)
}

// 為什麼回傳 token 只拿來組 URL 就丟掉：它是 10 分鐘內有效的一次性憑證，
// 寫進 localStorage 或 log 都會延長它的曝光時間，跟「只存 hash」的資料庫設計背道而馳。
export async function createMessagingLinkUrl(channel: MessagingChannel, rpc: RpcLike = defaultRpc): Promise<string> {
  const { data: token, error } = await rpc('create_messaging_link_token', { p_channel: channel })
  if (error) throw error
  if (typeof token !== 'string' || token.length === 0) throw new Error('Messaging link token could not be created.')

  if (channel === 'telegram') {
    const botUsername = import.meta.env.VITE_TELEGRAM_BOT_USERNAME
    if (!botUsername) throw new Error('VITE_TELEGRAM_BOT_USERNAME is not configured.')
    return `https://t.me/${botUsername}?start=${token}`
  }

  // LINE 官方帳號的「開啟對話並預填訊息」深連結：https://line.me/R/oaMessage/<percent-encoded LINE ID>/?<urlencoded message>
  // basicId 是公開資訊（LINE OA 的 @handle），可以放 VITE_*；跟 Telegram 分支一樣，缺少設定時丟出明確錯誤，
  // 不產生一個點了也不會綁定成功的連結。
  const basicId = normalizeLineOaBasicId(import.meta.env.VITE_LINE_OA_BASIC_ID)
  if (!basicId) throw new Error('VITE_LINE_OA_BASIC_ID is not configured.')
  // 為什麼 @ 要編碼成 %40：LINE 官方文件規定 LINE ID 要 percent-encode，未編碼的寫法「仍可用但已棄用」，
  // 不該讓綁定入口押在一個隨時可能被拿掉的相容行為上。
  return `https://line.me/R/oaMessage/${encodeURIComponent(`@${basicId}`)}/?${encodeURIComponent(`/link ${token}`)}`
}

// 為什麼要正規化：LINE Developers Console 顯示的 Bot basic ID 本身就帶 @（例如 @abc1234x），維護者照抄貼進
// Vercel 是最自然的做法；舊版程式卻又自己補一個 @，組出 @@abc1234x 這種點了打不開的連結，而且
// `.env.example` 當時的範例值也帶 @。這裡統一去掉前後空白與開頭的 @，有沒有帶 @ 都組出同一條正確連結；
// 只填了 @ 或空白時回空字串，讓設定頁與上面的檢查都把它當成「尚未設定」。
export function normalizeLineOaBasicId(raw: string | undefined): string {
  return (raw ?? '').trim().replace(/^@+/, '')
}

export async function unlinkMessagingChannel(channel: MessagingChannel, rpc: RpcLike = defaultRpc): Promise<void> {
  const { error } = await rpc('unlink_messaging_channel', { p_channel: channel })
  if (error) throw error
}
