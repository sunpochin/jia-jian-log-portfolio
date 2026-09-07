/*
檔案用途：集中處理血壓 Telegram 通知的前端呼叫邊界。
所在層：src/lib；供血壓輸入頁使用，只把紀錄與病人 UUID 交給登入者 session。
主要關聯：InputPage、Supabase `blood-pressure-notifier` Edge Function 與資料庫 RLS。
*/
import { supabase } from './supabase'

export type TelegramNotificationRequest = {
  recordId: string
  patientId: string
}

type InvokeLike = (
  functionName: string,
  options: { body: TelegramNotificationRequest },
) => Promise<{ error: unknown }>

export async function sendTelegramNotification(
  request: TelegramNotificationRequest,
  invoke: InvokeLike = (functionName, options) => supabase.functions.invoke(functionName, options),
): Promise<void> {
  // Server 會從這兩個 UUID 重新讀取資料並套用 RLS；瀏覽器不再依賴某個 build 是否帶到公開 Worker key。
  const { error } = await invoke('blood-pressure-notifier', { body: request })
  if (error) throw new Error('Blood pressure notification failed')
}
