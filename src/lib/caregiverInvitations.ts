/*
檔案用途：提供家人照護邀請的 token 邊界、RPC 轉接與前端狀態型別。
所在層：src/lib；隔離邀請連結的瀏覽器暫存與 Supabase 授權資料層。
主要關聯：CaregiverInvitationManagement、CaregiverInvitationJoinPage，以及 caregiver_invitations migration。
*/
import { supabase } from './supabase'
import { sha256Hex } from './shareLinks'
import type { Locale } from './i18n'

export const CAREGIVER_INVITATION_STORAGE_KEY = 'jia-jian-log.pending-caregiver-invitation'
export const PATIENT_INVITATION_STORAGE_KEY = 'jia-jian-log.pending-patient-invitation'
const TOKEN_PATTERN = /^[0-9a-f]{64}$/i

export type CaregiverInvitationStatus = 'pending' | 'requested' | 'accepted' | 'revoked' | 'expired'
export type InvitationEmailStatus = 'sent' | 'not_configured' | 'failed'

export type CaregiverInvitation = {
  invitationId: string
  patientId: string
  patientDisplayName: string
  invitedEmail: string | null
  status: CaregiverInvitationStatus
  canRecord: boolean
  canManageMedication: boolean
  requestedEmail: string | null
  accessActive: boolean
  createdAt: string
  expiresAt: string
  acceptedAt: string | null
  revokedAt: string | null
}

export type CreatedCaregiverInvitation = {
  invitationId: string
  token: string
  expiresAt: string
  invitedEmail?: string
  emailStatus?: InvitationEmailStatus
}

export type PendingCaregiverInvitation = {
  invitationId: string
  patientDisplayName: string
  invitedEmail: string
  status: Extract<CaregiverInvitationStatus, 'pending' | 'requested'>
  canRecord: boolean
  canManageMedication: boolean
  createdAt: string
  expiresAt: string
}

export function getCaregiverInvitationsRequiringRequest(invitations: PendingCaregiverInvitation[]): PendingCaregiverInvitation[] {
  // requested 代表受邀者已完成申請；只攔截尚未動作的 pending，避免既有照護者被等待 owner 的畫面鎖住整個 App。
  return invitations.filter(invitation => invitation.status === 'pending')
}

function validToken(token: string): boolean {
  return TOKEN_PATTERN.test(token)
}

export function buildCaregiverInvitationUrl(origin: string, token: string): string {
  // fragment 不會送進 Referer 或伺服器 access log；加入頁讀取後還會立即清除網址。
  return `${origin}/join#token=${token}`
}

export function buildPatientInvitationUrl(origin: string, token: string): string {
  // 本人邀請仍走原本的 email 綁定接受 RPC；這個入口只負責把邀請安全帶到登入後的既有同意畫面。
  return `${origin}/patient-invite#token=${token}`
}

export function caregiverInvitationShareText(locale: Locale, url: string): string {
  // 文案刻意不放病人姓名、診斷或讀值；連結只有在登入、申請與 owner 確認後才會產生 access。
  return locale === 'zh'
    ? `邀請你一起照護家庭成員。請先登入，再申請加入；由家庭管理者確認後才會開通權限。\n${url}`
    : locale === 'en'
      ? `You are invited to help care for a family member. Sign in and request access; permissions open only after the family owner approves.\n${url}`
      : `Anda diundang untuk membantu merawat anggota keluarga. Silakan masuk dan ajukan permintaan; akses baru dibuka setelah dikonfirmasi pengelola keluarga.\n${url}`
}

export function patientInvitationShareText(locale: Locale, url: string): string {
  // 分享訊息保持中性，不在可轉傳的文字中放姓名、診斷或任何健康數值。
  return locale === 'zh'
    ? `這是一封家庭照護邀請。請用指定的 Google 帳號登入，再查看並確認邀請。
${url}`
    : locale === 'en'
      ? `This is a family care invitation. Sign in with the specified Google account to review and confirm it.
${url}`
      : `Ini adalah undangan perawatan keluarga. Silakan masuk dengan akun Google yang ditentukan untuk melihat dan mengonfirmasi undangan.
${url}`
}

export function readCaregiverInvitationToken(hash: string = typeof window === 'undefined' ? '' : window.location.hash): string | null {
  return readInvitationToken(hash)
}

export function readInvitationToken(hash: string): string | null {
  const value = new URLSearchParams(hash.replace(/^#/, '?')).get('token')?.trim() ?? ''
  return validToken(value) ? value.toLowerCase() : null
}

export function captureCaregiverInvitationToken(): string | null {
  const token = readCaregiverInvitationToken()
  if (!token) return readStoredCaregiverInvitationToken()
  try {
    // sessionStorage 只在同一瀏覽器工作階段短暫保留，讓 Google GIS 登入重新載入後仍能接續邀請。
    window.sessionStorage.setItem(CAREGIVER_INVITATION_STORAGE_KEY, token)
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`)
  } catch {
    // 私密瀏覽器可能停用 storage；URL 已清理，但使用者仍可重新打開邀請連結。
  }
  return token
}

export function readStoredCaregiverInvitationToken(): string | null {
  try {
    const token = window.sessionStorage.getItem(CAREGIVER_INVITATION_STORAGE_KEY)?.trim() ?? ''
    return validToken(token) ? token.toLowerCase() : null
  } catch {
    return null
  }
}

export function clearStoredCaregiverInvitationToken(): void {
  try {
    window.sessionStorage.removeItem(CAREGIVER_INVITATION_STORAGE_KEY)
  } catch {
    // 清理失敗不應把已完成的授權流程變成錯誤；下次載入仍會由 RPC 以單次狀態擋住重播。
  }
}

export function capturePatientInvitationToken(): string | null {
  const token = readInvitationToken(typeof window === 'undefined' ? '' : window.location.hash)
  if (!token) return readStoredPatientInvitationToken()
  try {
    // sessionStorage 只保留登入接續所需的短暫 token；清掉 fragment 可避免連結被瀏覽器歷史或截圖再次暴露。
    window.sessionStorage.setItem(PATIENT_INVITATION_STORAGE_KEY, token)
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`)
  } catch {
    // 私密瀏覽器可能停用 storage；RPC 仍會以 email 與 token 雙重驗證，不能因此放寬權限。
  }
  return token
}

export function readStoredPatientInvitationToken(): string | null {
  try {
    const token = window.sessionStorage.getItem(PATIENT_INVITATION_STORAGE_KEY)?.trim() ?? ''
    return validToken(token) ? token.toLowerCase() : null
  } catch {
    return null
  }
}

export function clearStoredPatientInvitationToken(): void {
  try {
    window.sessionStorage.removeItem(PATIENT_INVITATION_STORAGE_KEY)
  } catch {
    // 清除失敗只會讓同一個 token 再次被 RPC 判斷，不能讓它變成新的授權來源。
  }
}

export async function createCaregiverInvitationWithEmail(patientId: string, invitedEmail: string, canRecord: boolean, canManageMedication: boolean): Promise<CreatedCaregiverInvitation> {
  if (!invitedEmail.trim() || !invitedEmail.includes('@')) throw new Error('Valid Google email required. / Google Email 格式不正確。')
  const { data, error } = await supabase.functions.invoke('send-invitation-email', {
    body: { kind: 'caregiver', patientId, invitedEmail: invitedEmail.trim(), canRecord, canManageMedication },
  })
  if (error) throw error
  const row = data as { emailStatus?: InvitationEmailStatus; invitation?: { invitationId?: string; token?: string; expiresAt?: string; invitedEmail?: string } } | null
  if (!row) throw new Error('Caregiver invitation could not be created. / 無法建立家人照護邀請。')
  const invitation = row?.invitation
  if (!invitation?.invitationId || !invitation.token || !invitation.expiresAt || !validToken(invitation.token)) {
    throw new Error('Caregiver invitation could not be created. / 無法建立家人照護邀請。')
  }
  if (row.emailStatus !== 'sent' && row.emailStatus !== 'not_configured' && row.emailStatus !== 'failed') {
    throw new Error('Invitation email status is invalid. / 邀請 email 狀態不正確。')
  }
  return { invitationId: invitation.invitationId, token: invitation.token, expiresAt: invitation.expiresAt, invitedEmail: invitation.invitedEmail ?? invitedEmail.trim().toLowerCase(), emailStatus: row.emailStatus }
}

export async function fetchCaregiverInvitations(): Promise<CaregiverInvitation[]> {
  const { data, error } = await supabase.rpc('fetch_caregiver_invitations')
  if (error) throw error
  return ((data ?? []) as Array<Record<string, unknown>>).map(row => ({
    invitationId: String(row.invitation_id),
    patientId: String(row.patient_id),
    patientDisplayName: String(row.patient_display_name ?? ''),
    invitedEmail: row.invited_email ? String(row.invited_email) : null,
    status: row.status as CaregiverInvitationStatus,
    canRecord: Boolean(row.can_record),
    canManageMedication: Boolean(row.can_manage_medication),
    requestedEmail: row.requested_email ? String(row.requested_email) : null,
    accessActive: Boolean(row.access_active),
    createdAt: String(row.created_at),
    expiresAt: String(row.expires_at),
    acceptedAt: row.accepted_at ? String(row.accepted_at) : null,
    revokedAt: row.revoked_at ? String(row.revoked_at) : null,
  }))
}

export async function fetchPendingCaregiverInvitations(): Promise<PendingCaregiverInvitation[]> {
  const { data, error } = await supabase.rpc('fetch_pending_caregiver_invitations')
  if (error) throw error
  return ((data ?? []) as Array<Record<string, unknown>>).map(row => ({
    invitationId: String(row.invitation_id),
    patientDisplayName: String(row.patient_display_name ?? ''),
    invitedEmail: String(row.invited_email ?? ''),
    status: row.status as PendingCaregiverInvitation['status'],
    canRecord: Boolean(row.can_record),
    canManageMedication: Boolean(row.can_manage_medication),
    createdAt: String(row.created_at),
    expiresAt: String(row.expires_at),
  }))
}

export async function requestPendingCaregiverInvitation(invitationId: string): Promise<void> {
  const { error } = await supabase.rpc('request_caregiver_invitation_by_id', { p_invitation_id: invitationId })
  if (error) throw error
}

export async function requestCaregiverInvitation(token: string): Promise<void> {
  if (!validToken(token)) throw new Error('Caregiver invitation is invalid or expired. / 家人照護邀請無效或已過期。')
  const tokenHash = await sha256Hex(token)
  const { error } = await supabase.rpc('request_caregiver_invitation', { p_token_hash: tokenHash })
  if (error) throw error
}

export async function approveCaregiverInvitation(invitationId: string): Promise<void> {
  const { error } = await supabase.rpc('approve_caregiver_invitation', { p_invitation_id: invitationId })
  if (error) throw error
}

export async function revokeCaregiverInvitation(invitationId: string): Promise<void> {
  const { error } = await supabase.rpc('revoke_caregiver_invitation', { p_invitation_id: invitationId })
  if (error) throw error
}

export async function revokeCaregiverAccess(patientId: string, email: string): Promise<void> {
  const { error } = await supabase.rpc('revoke_caregiver_access', { p_patient_id: patientId, p_profile_email: email })
  if (error) throw error
}

export async function claimPatientInvitationShare(token: string): Promise<void> {
  if (!validToken(token)) throw new Error('Patient invitation is invalid or expired. / 被照顧者邀請無效或已過期。')
  const tokenHash = await sha256Hex(token)
  const { error } = await supabase.rpc('claim_patient_care_invitation_share', { p_token_hash: tokenHash })
  if (error) throw error
}
