/*
檔案用途：唯讀分享連結 Stage 3a 的資料轉接層——產生高熵 token、算 hash、呼叫建立／列出／撤銷 RPC。
所在層：src/lib；raw token 只在這一層與呼叫端記憶體短暫存在，離開這個流程就只剩資料庫裡的 hash。
主要關聯：supabase RPC create_patient_share_link／list_patient_share_links／revoke_patient_share_link／fetch_shareable_patients，
  ShareLinkManagement.tsx、shareConsentNotice.ts，以及 tests/unit/shareLinks.test.ts、shareLinksAdapter.test.ts。
  結構化代理同意字串與 supabase/migrations/20260925120000_require_structured_share_proxy_consent.sql 的 regex 是同一份契約。
*/
import { supabase } from './supabase'
import type { ConsentType } from './legalConsent'
import type { LocalizedText } from './i18n'

// 已核准的所有內容範圍（#424 F1、ADR-009）。字面值與 supabase/migrations/20260925170000_add_patient_share_summary_v2.sql 的 CHECK、
// supabase/functions/share-summary/handler.ts 的分派共用；新增一個 scope 要三處一起改，否則會出現
// 「client 建立了 A 版本、Function 只認得 B 版本」的資料不一致。
export type ShareScopeVersion = 'daily-summary-v1' | 'daily-summary-v2'

// 管理頁選單的順序：v2 在前（ADR-009 核准後預設），v1 仍可選給只想給「今天血壓」的情境。
export const SHARE_SCOPE_VERSIONS: readonly ShareScopeVersion[] = ['daily-summary-v2', 'daily-summary-v1']

// 預設 scope。2026-09-25 起為 v2（設計 §8 T4）：T1 的 RPC 與 T2 的 share-summary 都已接受 v2，
// 同意文字（shareConsentNotice.ts）也依 scope 各有一份，所以切到 v2 不會讓同意內容與實際揭露不一致。
export const SHARE_LINK_SCOPE_VERSION: ShareScopeVersion = 'daily-summary-v2'

// 分享同意文字版本，依 scope 決定。owner 於 #424 F5／G 定稿：兩個 scope 目前都是 2026-09-25-share-v1——
// 資料庫同時存 scope_version 與 consent_text_version，兩欄合起來才唯一指向「使用者當時看到的是哪一段文字」，
// 所以同一個版本字串配不同 scope 不會混淆。shareConsentNotice.ts 的任一段文字只要改一個字，對應 scope 的版本就要升，
// 不能讓文案改了但版本號沒動；Record 讓新增 scope 時 TypeScript 強制補版本。
export const SHARE_CONSENT_TEXT_VERSION_BY_SCOPE: Record<ShareScopeVersion, string> = {
  'daily-summary-v1': '2026-09-25-share-v1',
  'daily-summary-v2': '2026-09-25-share-v1',
}

export function shareConsentTextVersion(scope: ShareScopeVersion): string {
  return SHARE_CONSENT_TEXT_VERSION_BY_SCOPE[scope]
}

// 預設 scope 的文字版本；既有測試與 migration 門檻（>= 2026-09-25-share-v1）以此比對。
export const SHARE_CONSENT_TEXT_VERSION = shareConsentTextVersion(SHARE_LINK_SCOPE_VERSION)

// 連結清單與選單用的三語標籤：v2 要明示「含藥單」（設計 §4.4、§5「bearer 連結被轉傳」），讓家屬在撤銷前一眼看出這條連結的份量。
export const SHARE_SCOPE_LABELS: Record<ShareScopeVersion, LocalizedText> = {
  'daily-summary-v2': { id: 'Ringkasan perawatan dua minggu (termasuk daftar obat)', zh: '兩週照護摘要（含藥單）', en: 'Two-week care summary (includes medication list)' },
  'daily-summary-v1': { id: 'Tekanan darah hari ini saja', zh: '只有今日血壓', en: "Today's blood pressure only" },
}

export function isShareScopeVersion(value: string): value is ShareScopeVersion {
  return SHARE_SCOPE_VERSIONS.includes(value as ShareScopeVersion)
}

// 舊 bundle 或回滾後的 client 可能列到本版不認得的 scope：顯示三語的「未知」字樣並附上識別碼，
// 不能把技術字串當成三語共用的 runtime fallback（AGENTS.md §3.6；PR #942 Codex P2）。
export function shareScopeLabel(scope: string): LocalizedText {
  if (isShareScopeVersion(scope)) return SHARE_SCOPE_LABELS[scope]
  return {
    id: `Isi tautan tidak dikenal (${scope})`,
    zh: `未知的連結內容範圍（${scope}）`,
    en: `Unknown link contents (${scope})`,
  }
}

// 代理同意（照護對象不是登入者本人）的結構化證據（#424 D、自評 §4 第 3 項、風險 R1）。
// 為什麼不再收自由文字：自由文字留不下可比對的證據，也無法讓資料庫檢查「有沒有承認自己不是法院監護人」。
export type ProxyRelationship = 'spouse' | 'child' | 'other_family'

export const PROXY_RELATIONSHIPS: readonly ProxyRelationship[] = ['spouse', 'child', 'other_family']

export type ProxyConsent = {
  relationship: ProxyRelationship
  // 勾選「照護對象因失智或其他原因無法自行同意；我以主要照顧家屬身分代為決定；我了解我不是法院指定的監護人」。
  incapacityAttested: boolean
}

// 產生送進 p_authorization_basis 的固定格式字串；格式必須跟 migration 裡 create_patient_share_link 的 regex 完全一致。
// 為什麼沿用 authorization_basis 而不是加新欄位：RPC 簽章（7 個參數）與既有 CHECK（1–200 字）都不用動，
// 已部署的 share-link-exchange／share-summary 也不受影響；伺服器端用 regex 整串比對，自由文字一律擋下。
// 未勾選或關係不合法時回傳 null，讓呼叫端在送出前就擋住，而不是送一個伺服器必定拒絕的請求。
export function buildProxyAuthorizationBasis(consent: ProxyConsent | undefined): string | null {
  if (!consent || consent.incapacityAttested !== true || !PROXY_RELATIONSHIPS.includes(consent.relationship)) return null
  return `relationship=${consent.relationship};reason=patient_cannot_consent;guardian_status=not_court_appointed`
}

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
  // 只有 authorized_representative 需要；self 一律不送依據（RPC 會拒絕 self 帶依據）。
  proxyConsent?: ProxyConsent
  expiryHours: ShareLinkExpiryHours
  // 未指定時用預設 scope（v2）。呼叫端顯示的同意文字必須是同一個 scope 的（shareConsentNotice(scope)）。
  scopeVersion?: ShareScopeVersion
}

// 為什麼這裡不順便呼叫 record_health_data_consent：帳號層健康同意有自己完整的告知與明確同意畫面
// （HealthDataConsentScreen），不能在分享連結這個次要流程裡，只用一句 bearer-link 警告文字
// 就順手覆寫過去；呼叫端要先確認 legal_consents.consent_type 已經符合，不符合就導去那個畫面，
// 而不是讓這支函式代為靜默升級——否則本次分享如果建立失敗，帳號同意紀錄卻已經被悄悄改掉。
export async function createShareLink(input: CreateShareLinkInput): Promise<CreatedShareLink> {
  const authorizationBasis = input.consentType === 'authorized_representative'
    ? buildProxyAuthorizationBasis(input.proxyConsent)
    : null
  // 先擋在產生 token 之前：代理同意缺關係或缺勾選時，連 token 都不該產生。伺服器端 RPC 仍會再擋一次。
  if (input.consentType === 'authorized_representative' && authorizationBasis === null) {
    throw new Error('Structured proxy consent (relationship and attestation) is required')
  }
  const scopeVersion = input.scopeVersion ?? SHARE_LINK_SCOPE_VERSION
  const token = generateShareToken()
  const tokenHash = await sha256Hex(token)
  const { data, error } = await supabase
    .rpc('create_patient_share_link', {
      p_patient_id: input.patientId,
      p_token_hash: tokenHash,
      p_scope_version: scopeVersion,
      p_expires_at: expiresAtFromHours(input.expiryHours),
      p_consent_type: input.consentType,
      p_authorization_basis: authorizationBasis,
      // 文字版本跟著 scope 走：送出的 (scope_version, consent_text_version) 就是使用者剛確認的那一段文字。
      p_consent_text_version: shareConsentTextVersion(scopeVersion),
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
