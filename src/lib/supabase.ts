/*
檔案用途：初始化與匯出單例 Supabase Client 實例。
所在層：src/lib；為全域資料庫連線核心模組。
主要關聯：被全站所有 Supabase API 呼叫檔所引入。
*/
import { createClient } from '@supabase/supabase-js'
import { resolveSupabasePublicKey, resolveSupabaseUrl, type SupabasePublicKeyEnv } from './supabaseConfig'

// 重新匯出型別與解析函式，維持既有外部模組介面相容
export { resolveSupabasePublicKey, resolveSupabaseUrl, type SupabasePublicKeyEnv }

export const supabaseUrl = resolveSupabaseUrl(import.meta.env)
const supabasePublicKey = resolveSupabasePublicKey(import.meta.env)

if (!import.meta.env.VITE_SUPABASE_URL) {
  // /demo 的試用資料不依賴 Supabase；只有真正登入後的跨裝置資料同步會在缺設定時失效。
  console.warn('[bp-tracker] VITE_SUPABASE_URL not set — authenticated database sync is unavailable; /demo local trial remains available')
}

// 原生 OAuth 只回傳一次性 code；明確固定 PKCE，避免 Supabase 預設 implicit flow 把 token 放入 fragment。
export const supabase = createClient(supabaseUrl, supabasePublicKey, {
  auth: {
    flowType: 'pkce',
  },
})
