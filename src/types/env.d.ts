/*
檔案用途：補充 Vite 前端公開環境變數的型別宣告。
所在層：src/types；避免 Google Web Client ID 在元件與 loader 中失去型別檢查。
主要關聯：由 Supabase client 與 Google Identity Services 登入元件讀取，值由 Vercel／本機 `.env` 提供且不包含 secret。
*/
interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_ANON_KEY?: string
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string
  readonly VITE_GOOGLE_CLIENT_ID?: string
}
