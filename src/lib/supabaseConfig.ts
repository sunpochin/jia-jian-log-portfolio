/*
檔案用途：解析 Supabase 公開 Key 與環境變數設定邏輯，避免 client 實例化與測試 mock 互相污染。
所在層：src/lib 共用核心設定層；為純函式設定解析，不建立 client 實體。
主要關聯：被 src/lib/supabase.ts 與 tests/unit/supabaseConfig.test.ts 引入。
*/

export type SupabasePublicKeyEnv = {
  VITE_SUPABASE_URL?: string
  VITE_SUPABASE_PUBLISHABLE_KEY?: string
  VITE_SUPABASE_ANON_KEY?: string
}

export function resolveSupabaseUrl(env: SupabasePublicKeyEnv): string {
  // 分享摘要只需要專案 URL，不應為了讀取設定而載入會被測試替換的 Supabase client。
  return env.VITE_SUPABASE_URL || 'https://placeholder.supabase.co'
}

export function resolveSupabasePublicKey(env: SupabasePublicKeyEnv): string {
  // 新舊 key 同時存在時，優先新版可避免 production 誤吃另一個 project 的 legacy key。
  return env.VITE_SUPABASE_PUBLISHABLE_KEY || env.VITE_SUPABASE_ANON_KEY || 'placeholder-key'
}
