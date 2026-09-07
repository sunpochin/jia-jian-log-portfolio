/*
檔案用途：把 Supabase／網路／瀏覽器丟出的 unknown 錯誤，統一轉成可判讀的欄位與雙語使用者訊息。
所在層：src/lib 共用核心層；所有資料讀寫失敗的畫面訊息都應該經過這裡，不要各自重寫判斷。
主要關聯：被 hooks/useBpRecords、hooks/useLatestBpRecord、lib/temperature、
          features/vitals/pages/InputPage.utils 與 CareTimeline 共用。
*/
import type { LocalizedText } from './i18n'

/**
 * 繁體中文註解：Supabase 會依失敗層級丟出形狀不同的錯誤
 * （PostgrestError 有 code、AuthError 有 status、fetch 斷線則是原生 TypeError），
 * 之前每個呼叫端各自寫一次 `'code' in error` 型別窄化，四份副本已經開始漂移。
 * 這裡只保留一份萃取邏輯，讓後續的判斷函式與測試都對著同一個資料形狀。
 */
export interface DataErrorFields {
  message: string
  code: string
  status: number
}

function readField(error: unknown, key: string): unknown {
  if (typeof error !== 'object' || error === null) return undefined
  if (!(key in error)) return undefined
  return (error as Record<string, unknown>)[key]
}

export function readErrorFields(error: unknown): DataErrorFields {
  const message = readField(error, 'message')
  const code = readField(error, 'code')
  const status = readField(error, 'status')
  return {
    message: message === undefined || message === null ? '' : String(message),
    code: code === undefined || code === null ? '' : String(code),
    // 非數字的 status（例如字串 '401'）也要能比對，Number 失敗時退回 0 代表「沒有 HTTP 狀態」。
    status: Number.isFinite(Number(status)) ? Number(status) : 0,
  }
}

/** 登入過期或 RLS 拒絕：看護能採取的下一步是重新登入，而不是重試。 */
export function isPermissionError(error: unknown): boolean {
  const { code, status } = readErrorFields(error)
  return code === '42501' || status === 401 || status === 403
}

/** 連線中斷或 Supabase 設定錯誤：呼叫端可保存待同步資料；不能把它誤判成權限錯誤。 */
export function isConnectionError(error: unknown): boolean {
  const { code } = readErrorFields(error)
  return error instanceof TypeError || code === 'PGRST301' || code === 'ENOTFOUND' || code === 'TypeError'
}

/** 只有傳輸／暫時伺服器失敗適合自動排隊；權限、配額與資料驗證錯誤重試不會改變結果。 */
export function isRetryableWriteError(error: unknown): boolean {
  if (isPermissionError(error)) return false
  const { status } = readErrorFields(error)
  return isConnectionError(error) || status === 408 || status === 429 || status >= 500
}

/**
 * 資料庫 constraint 名稱只會出現在錯誤訊息字串裡（例如 daily_blood_pressure_limit）。
 * 用具名函式取代散落的 `message.includes(...)`，讓每個配額規則都能被搜尋與測試。
 */
export function matchesConstraint(error: unknown, constraintName: string): boolean {
  return readErrorFields(error).message.includes(constraintName)
}

/**
 * 繁體中文註解：訊息一律回傳 LocalizedText 而非已經選好語言的字串。
 * 這是刻意的設計——呼叫端只能透過 text()／localized() 顯示，因此
 * 憲法要求的「兩種語言都要有、畫面只顯示一種」在型別層就被強制，
 * 不可能再出現把中印文用斜線串在一起丟到畫面上的寫法。
 */
export const DATA_ERROR_TEXT = {
  reauth: {
    id: 'Sesi login sudah habis atau belum diberi izin. Silakan masuk lagi.',
    zh: '登入已過期或沒有寫入權限，請重新登入', en: 'Login expired or no write access, please log in again',
  },
  connection: {
    id: 'Koneksi atau konfigurasi server bermasalah. Beri tahu keluarga.',
    zh: '連線或伺服器設定有問題，請通知家屬', en: 'Koneksi or konfigurasi server has a problem. Beri tahu family.',
  },
  save: {
    id: 'Gagal menyimpan. Silakan coba lagi.',
    zh: '儲存失敗，請再試一次', en: 'Saving failed, please try again',
  },
  read: {
    id: 'Gagal membaca data. Periksa koneksi lalu coba lagi.',
    zh: '暫時無法讀取資料，請確認網路後重試。', en: 'There was an error reading the data. Please check your network and try again.',
  },
} as const satisfies Record<string, LocalizedText>

/**
 * 共用的失敗訊息挑選順序：權限 → 連線 → 呼叫端提供的具體說明。
 * fallback 交給呼叫端是因為「儲存體溫失敗」與「儲存血壓失敗」要講清楚是哪一種紀錄，
 * 但「請重新登入」在所有畫面都是同一句，不該被複製成多份翻譯。
 */
export function describeDataError(error: unknown, fallback: LocalizedText): LocalizedText {
  if (isPermissionError(error)) return DATA_ERROR_TEXT.reauth
  if (isConnectionError(error)) return DATA_ERROR_TEXT.connection
  return fallback
}

export function describeSaveError(error: unknown, fallback: LocalizedText = DATA_ERROR_TEXT.save): LocalizedText {
  return describeDataError(error, fallback)
}

export function describeReadError(error: unknown, fallback: LocalizedText = DATA_ERROR_TEXT.read): LocalizedText {
  return describeDataError(error, fallback)
}
