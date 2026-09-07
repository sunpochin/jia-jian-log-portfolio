/*
檔案用途：驗證 Supabase 瀏覽器公開 key 的環境變數選擇規則。
所在層：tests/unit；鎖定部署設定與前端 client 初始化之間的薄轉接層。
主要關聯：src/lib/supabase.ts、Vercel Production 環境變數與 Supabase API。
*/
import { describe, expect, test } from 'bun:test'
// 直接引入無副作用的純設定解析函式，避免受其他測試 mock.module('../../src/lib/supabase') 影響
import { resolveSupabasePublicKey } from '../../src/lib/supabaseConfig'

describe('resolveSupabasePublicKey', () => {
  test('prefers publishable key when both public key names exist', () => {
    expect(resolveSupabasePublicKey({
      VITE_SUPABASE_PUBLISHABLE_KEY: 'publishable-key',
      VITE_SUPABASE_ANON_KEY: 'legacy-key',
    })).toBe('publishable-key')
  })

  test('keeps legacy anon key as a compatibility fallback', () => {
    expect(resolveSupabasePublicKey({ VITE_SUPABASE_ANON_KEY: 'legacy-key' })).toBe('legacy-key')
  })
})
