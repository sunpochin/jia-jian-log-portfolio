/**
 * 檔案用途：提供全域國際化 (i18n) 語系設定 context、語言偏好儲存與雙語文案解析 helper。
 * 所在層：src/lib 共用核心層。
 * 主要關聯：被 src/App.tsx 載入作為 Context Provider，並供所有 UI 元件使用 useI18n。
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

export type Locale = 'id' | 'zh' | 'en'
// 三種語系都必須在資料邊界明確提供，避免英文畫面靜默退回中文健康提醒。
export type LocalizedText = Record<Locale, string>

const STORAGE_KEY = 'bp-tracker.locale'
const LocaleContext = createContext<{ locale: Locale; setLocale: (locale: Locale) => void } | null>(null)

export function resolveInitialLocale(savedLocale: string | null): Locale {
  if (savedLocale === 'id' || savedLocale === 'zh' || savedLocale === 'en') return savedLocale as Locale
  // 首次入口以中文家屬為預設；只有右上角已明確選過印尼文或英文時才保留該偏好，不能被瀏覽器語言悄悄改寫。
  return 'zh'
}

export function initialLocale(): Locale {
  try {
    return resolveInitialLocale(localStorage.getItem(STORAGE_KEY))
  } catch {
    // 儲存被禁用時仍以首次入口規則顯示中文，避免不同裝置語言讓登入頁看起來不一致。
    return resolveInitialLocale(null)
  }
}

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState<Locale>(initialLocale)

  useEffect(() => {
    document.documentElement.lang = locale === 'zh' ? 'zh-Hant' : locale === 'id' ? 'id' : 'en'
    try { localStorage.setItem(STORAGE_KEY, locale) } catch { /* 見 initialLocale：偏好不可用不影響 App。 */ }
  }, [locale])

  const value = useMemo(() => ({ locale, setLocale }), [locale])
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
}

export function useI18n() {
  const context = useContext(LocaleContext)
  if (!context) throw new Error('useI18n must be used inside LocaleProvider')
  const text = useCallback((value: LocalizedText) => localized(value, context.locale), [context.locale])
  return useMemo(() => ({
    ...context,
    // 每個系統文案都要有兩種翻譯，但畫面要依看護當下選擇的語言保持清楚，不把兩份文案塞在一起。
    // 函式 identity 必須隨語言才改變，否則依賴它的資料刷新會在每次 render 重跑並互相覆蓋。
    text,
  }), [context, text])
}

export function localized(value: LocalizedText, locale: Locale) {
  // 若 runtime 字典意外缺少目前語系，退回另一份文案，避免更新提示或其他共用 UI 變成空白。
  if (value[locale]) return value[locale]!
  // 即使外部資料暫時缺少某個值，也保留安全回退，避免共用提示變成空白。
  if (locale === 'en') return value['zh'] || value['id'] || ''
  return value[locale === 'zh' ? 'id' : 'zh'] || ''
}

export const common = {
  // 繁體中文註解：將語系名稱簡寫為「繁中」、「Indo」與「EN」，以利在狹窄的手機標頭按鈕中達成視覺對稱與清晰辨識。
  language: { id: 'Indo', zh: '繁中', en: 'EN' },
  loading: { id: 'Memuat…', zh: '載入中…', en: 'Loading…' },
  retry: { id: 'Coba lagi', zh: '重試', en: 'Retry' },
  close: { id: 'Tutup', zh: '關閉', en: 'Close' },
  error: { id: 'Gagal', zh: '錯誤', en: 'Error' },
  days: (days: number): LocalizedText => ({ id: `${days} hari`, zh: `${days} 天`, en: `${days} days` }),
} as const
