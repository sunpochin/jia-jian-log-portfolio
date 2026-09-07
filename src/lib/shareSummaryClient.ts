/*
檔案用途：唯讀分享連結接收端（沒有帳號的家人）呼叫 share-link-exchange／share-summary 的資料轉接層。
所在層：src/lib；只服務 ShareSummaryPage，不與 ShareLinkManagement 的建立／管理流程共用狀態。
主要關聯：supabase/functions/share-link-exchange、supabase/functions/share-summary、ShareSummaryPage.tsx。
*/
import { resolveSupabaseUrl } from './supabaseConfig'

const supabaseUrl = resolveSupabaseUrl(import.meta.env)

// 跟 supabase/functions/share-summary/shareSummary.ts 的 LocalizedText／PatientShareSummaryDto 保持同一個形狀；
// 前端與 Deno Edge Function 是兩個獨立的建置環境，這裡刻意重新宣告三語 DTO 而不是跨環境 import。
export type LocalizedText = { zh: string; id: string; en: string }

export type PatientShareSummaryDto = {
  patientAlias: LocalizedText
  summaryDate: string
  timezone: string
  bloodPressure: { systolic: number; diastolic: number; pulse: number | null; measuredAt: string } | null
  generatedAt: string
}

// URL fragment（#token=...）只在瀏覽器記憶體短暫存在；呼叫端拿到字串後要立刻用
// history.replaceState 清掉，避免留在瀏覽器歷史、Referer 或螢幕分享中。
export function parseShareTokenFromHash(hash: string): string | null {
  if (!hash || hash.length < 2) return null
  const token = new URLSearchParams(hash.slice(1)).get('token')
  return token && token.length > 0 ? token : null
}

function isLocalizedText(value: unknown): value is LocalizedText {
  if (!value || typeof value !== 'object') return false
  const record = value as Record<string, unknown>
  return typeof record.zh === 'string' && typeof record.id === 'string' && typeof record.en === 'string'
}

// 為什麼要驗證整個形狀：這支頁面沒有帳號、沒有登入狀態保護，任何回應畸形都必須被視為
// 「連結無效」而不是讓 undefined 直接進畫面渲染或被誤讀成某個欄位有值。
export function parseShareSummaryResponse(value: unknown): PatientShareSummaryDto {
  if (!value || typeof value !== 'object') throw new Error('share summary response is invalid')
  const summary = (value as Record<string, unknown>).summary
  if (!summary || typeof summary !== 'object') throw new Error('share summary payload is invalid')
  const row = summary as Record<string, unknown>
  if (!isLocalizedText(row.patientAlias)) throw new Error('share summary alias is invalid')
  if (typeof row.summaryDate !== 'string' || typeof row.timezone !== 'string' || typeof row.generatedAt !== 'string') {
    throw new Error('share summary metadata is invalid')
  }
  let bloodPressure: PatientShareSummaryDto['bloodPressure'] = null
  if (row.bloodPressure !== null) {
    if (!row.bloodPressure || typeof row.bloodPressure !== 'object') throw new Error('share summary blood pressure is invalid')
    const bp = row.bloodPressure as Record<string, unknown>
    if (typeof bp.systolic !== 'number' || typeof bp.diastolic !== 'number' || typeof bp.measuredAt !== 'string') {
      throw new Error('share summary blood pressure is invalid')
    }
    bloodPressure = { systolic: bp.systolic, diastolic: bp.diastolic, pulse: typeof bp.pulse === 'number' ? bp.pulse : null, measuredAt: bp.measuredAt }
  }
  return {
    patientAlias: row.patientAlias,
    summaryDate: row.summaryDate,
    timezone: row.timezone,
    bloodPressure,
    generatedAt: row.generatedAt,
  }
}

// 為什麼不用 supabase.functions.invoke：那個 client 會自動加上 apikey／Authorization／x-client-info
// 這幾個 header，但 supabase/functions/_shared/shareCors.ts 的 CORS allowlist 只放行 content-type——
// 瀏覽器 preflight 會先卡在這裡失敗，導致每個有效連結都被誤判成過期。這兩支 Function 本來就
// verify_jwt=false、不需要任何 Supabase 專案憑證，改用最小 header 的原生 fetch 才對得上 CORS 設定。
async function postToShareFunction(functionName: string, body: Record<string, unknown>): Promise<unknown> {
  const response = await fetch(`${supabaseUrl}/functions/v1/${functionName}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!response.ok) throw new Error(`${functionName} request failed with status ${response.status}`)
  return response.json()
}

export async function exchangeShareToken(token: string): Promise<{ session: string }> {
  const data = await postToShareFunction('share-link-exchange', { token })
  if (!data || typeof data !== 'object' || typeof (data as Record<string, unknown>).session !== 'string') {
    throw new Error('share link exchange response is invalid')
  }
  return { session: (data as Record<string, unknown>).session as string }
}

export async function fetchShareSummary(session: string): Promise<PatientShareSummaryDto> {
  const data = await postToShareFunction('share-summary', { session })
  return parseShareSummaryResponse(data)
}
