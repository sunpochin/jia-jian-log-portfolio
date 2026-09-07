/*
檔案用途：唯讀分享連結 Stage 3a 的資料轉接層——產生高熵 token、算 hash、呼叫建立／列出／撤銷 RPC。
所在層：src/lib；raw token 只在這一層與呼叫端記憶體短暫存在，離開這個流程就只剩資料庫裡的 hash。
主要關聯：supabase RPC create_patient_share_link／list_patient_share_links／revoke_patient_share_link／fetch_shareable_patients，
  ShareLinkManagement.tsx，以及 tests/unit/shareLinks.test.ts。
*/
import { supabase } from './supabase'
import type { ConsentType } from './legalConsent'

// 跟 supabase/migrations/20260822020000_create_patient_share_links.sql、supabase/functions/share-summary 共用同一個字面值；
// 三處都要一起改，否則會出現「client 建立了 A 版本、Function 只認得 B 版本」的資料不一致。
export const SHARE_LINK_SCOPE_VERSION = 'daily-summary-v1'

// 分享同意文字目前是草稿版本（Stage 0 法遵文案尚未定稿）；正式文案核准後要更新這個版本字串，
// 讓資料庫留下「使用者當時同意的是哪一版文字」的稽核紀錄，不能讓文案改了但版本號沒動。
export const SHARE_CONSENT_TEXT_VERSION = '2026-09-04-draft'

export type ShareLinkExpiryHours = 24 | 72 | 168

export const SHARE_LINK_EXPIRY_OPTIONS: ShareLinkExpiryHours[] = [24, 72, 168]

export type ShareablePatient = {
  patientId: string
  displayName: string
  isOwnPatient: boolean
}

export type ShareLink = {
  linkId: string
  patientId: string
  scopeVersion: string
  expiresAt: string
  revokedAt: string | null
  createdAt: string
}

export type CreatedShareLink = {
  linkId: string
  token: string
  expiresAt: string
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')
}

// 256-bit CSPRNG token；只在瀏覽器記憶體與這次函式呼叫內存在，資料庫只收到下面的 hash。
export function generateShareToken(): string {
  return toHex(crypto.getRandomValues(new Uint8Array(32)))
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return toHex(new Uint8Array(digest))
}

// fragment（#token=…）而不是 query string：分享頁載入後要能用 history.replaceState 整個清掉，
// 不讓 raw token 進 Referer、瀏覽器歷史或伺服器 access log。
export function buildShareLinkUrl(origin: string, token: string): string {
  return `${origin}/share#token=${token}`
}

export function expiresAtFromHours(hours: ShareLinkExpiryHours, now: Date = new Date()): string {
  return new Date(now.getTime() + hours * 60 * 60 * 1000).toISOString()
}

export async function fetchShareablePatients(): Promise<ShareablePatient[]> {
  const { data, error } = await supabase.rpc('fetch_shareable_patients')
  if (error) throw error
  return ((data ?? []) as Array<{ patient_id: string; display_name: string; is_own_patient: boolean }>).map(row => ({
    patientId: row.patient_id,
    displayName: row.display_name,
    isOwnPatient: row.is_own_patient,
  }))
}

export async function fetchShareLinks(patientId: string): Promise<ShareLink[]> {
  const { data, error } = await supabase.rpc('list_patient_share_links', { p_patient_id: patientId })
  if (error) throw error
  return ((data ?? []) as Array<{ link_id: string; patient_id: string; scope_version: string; expires_at: string; revoked_at: string | null; created_at: string }>).map(row => ({
    linkId: row.link_id,
    patientId: row.patient_id,
    scopeVersion: row.scope_version,
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at,
    createdAt: row.created_at,
  }))
}

export type CreateShareLinkInput = {
  patientId: string
  consentType: ConsentType
  authorizationBasis?: string
  expiryHours: ShareLinkExpiryHours
}

// 為什麼這裡不順便呼叫 record_health_data_consent：帳號層健康同意有自己完整的告知與明確同意畫面
// （HealthDataConsentScreen），不能在分享連結這個次要流程裡，只用一句 bearer-link 警告文字
// 就順手覆寫過去；呼叫端要先確認 legal_consents.consent_type 已經符合，不符合就導去那個畫面，
// 而不是讓這支函式代為靜默升級——否則本次分享如果建立失敗，帳號同意紀錄卻已經被悄悄改掉。
export async function createShareLink(input: CreateShareLinkInput): Promise<CreatedShareLink> {
  const token = generateShareToken()
  const tokenHash = await sha256Hex(token)
  const { data, error } = await supabase
    .rpc('create_patient_share_link', {
      p_patient_id: input.patientId,
      p_token_hash: tokenHash,
      p_scope_version: SHARE_LINK_SCOPE_VERSION,
      p_expires_at: expiresAtFromHours(input.expiryHours),
      p_consent_type: input.consentType,
      p_authorization_basis: input.authorizationBasis?.trim() || null,
      p_consent_text_version: SHARE_CONSENT_TEXT_VERSION,
    })
    .maybeSingle()
  if (error) throw error
  const row = data as { link_id: string; expires_at: string }
  return { linkId: row.link_id, token, expiresAt: row.expires_at }
}

export async function revokeShareLink(linkId: string): Promise<void> {
  const { error } = await supabase.rpc('revoke_patient_share_link', { p_link_id: linkId })
  if (error) throw error
}
