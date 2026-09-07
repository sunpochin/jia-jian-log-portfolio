/*
檔案用途：解析多租戶 Domain、子網域與特定家庭情境設定。
所在層：src/lib；為多租戶判斷輔助層。
主要關聯：由 TenantApp 與系統網域邏輯使用。
*/
import { supabase } from './supabase'

export type HouseholdRole = 'owner' | 'caregiver' | 'viewer'
export type CareRecipientType = 'human' | 'dog' | 'cat' | 'bird' | 'rabbit' | 'other'

export interface HouseholdOnboardingInput {
  householdName: string
  patientName: string
  displayName?: string
}

export interface HouseholdOnboardingResult {
  householdId: string
  patientId: string
}

export interface TenantPatient {
  id: string
  household_id: string
  display_name: string
  care_recipient_type: CareRecipientType
}

export interface TenantContext {
  householdId: string
  patients: TenantPatient[]
}

export function validateHouseholdOnboarding(input: HouseholdOnboardingInput): string | null {
  const values = [input.householdName, input.patientName]
  // 名稱限制與資料庫一致，讓使用者在送出前就知道怎麼修正，而不是收到 PostgreSQL 原始錯誤。
  if (values.some(value => value.trim().length < 1 || value.trim().length > 100)) {
    return 'Nama keluarga dan nama pasien harus 1–100 karakter. / 家庭與病人名稱需為 1–100 個字。'
  }
  return null
}

export function isCareRecipientType(value: string): value is CareRecipientType {
  // bird 是獨立物種而非 other，才能讓資料庫、照護模組與選單保留一致的判讀。
  return value === 'human' || value === 'dog' || value === 'cat' || value === 'bird' || value === 'rabbit' || value === 'other'
}

export async function beginHouseholdOnboarding(input: HouseholdOnboardingInput): Promise<HouseholdOnboardingResult> {
  const validationError = validateHouseholdOnboarding(input)
  if (validationError) throw new Error(validationError)

  const { data, error } = await supabase.rpc('begin_household_onboarding_v2', {
    p_payload: { household_name: input.householdName.trim(), patient_name: input.patientName.trim() },
  })
  if (error) throw error

  const result = data
  if (!result?.household_id || !result.patient_id) {
    // RPC 合約異常時仍維持雙語，避免錯誤處理路徑破壞公開介面的語系承諾。
    throw new Error('Ruang keluarga tidak dapat dibuat. / 無法建立家庭空間。')
  }
  return { householdId: result.household_id, patientId: result.patient_id }
}

export async function fetchTenantContext(): Promise<TenantContext | null> {
  const { data: memberships, error: membershipError } = await supabase
    .from('household_members')
    .select('household_id')
    .order('created_at')
    .limit(1)
  if (membershipError) throw membershipError
  const householdId = memberships?.[0]?.household_id
  if (!householdId) return null

  const { data: patients, error: patientError } = await supabase
    .from('patients')
    .select('id, household_id, display_name, care_recipient_type')
    .eq('household_id', householdId)
    .order('created_at')
  if (patientError) throw patientError
  return { householdId, patients: (patients ?? []) as TenantPatient[] }
}

export async function saveTenantBpRecord(patientId: string, reading: { systolic: number; diastolic: number; pulse: number | null; measuredAt: string }) {
  const { data: authData, error: authError } = await supabase.auth.getUser()
  if (authError) throw authError
  // session 過期是使用者可自行處理的情況，提示必須和主要介面使用相同雙語契約。
  if (!authData.user) throw new Error('Silakan masuk lagi. / 請重新登入。')
  // 公開模式刻意不呼叫 Telegram：在每戶通知設定與 JWT Worker 都完成前，寫入只應影響自己的家庭資料。
  const { error } = await supabase.from('blood_pressure_records').insert({
    systolic: reading.systolic,
    diastolic: reading.diastolic,
    pulse: reading.pulse,
    measured_at: reading.measuredAt,
    source: 'manual_web',
    patient_id: patientId,
    recorded_by_user_id: authData.user.id,
  })
  if (error) throw error
}

export async function addHouseholdPatient(displayName: string, careRecipientType: CareRecipientType = 'human'): Promise<string> {
  // 前端先用與資料庫相同限制拒絕無效名稱，才不會把技術錯誤帶到公開畫面。
  if (!displayName.trim() || displayName.trim().length > 100) throw new Error('Nama penerima perawatan harus 1–100 karakter. / 照護對象名稱需為 1–100 個字。')
  // 類型也在 client 先白名單驗證，避免 UI 被竄改時把未知類型送到資料庫。
  if (!isCareRecipientType(careRecipientType)) throw new Error('Jenis penerima perawatan tidak valid. / 照護對象類型不正確。')
  const { data, error } = await supabase.rpc('add_household_care_recipient', { p_display_name: displayName.trim(), p_care_recipient_type: careRecipientType })
  if (error) throw error
  if (!data) throw new Error('Penerima perawatan tidak dapat ditambahkan. / 無法新增照護對象。')
  return data as string
}

export interface PatientCareInvitation {
  invitation_id: string
  patient_id: string
  display_name: string
  authorization_basis: string
  inviter_email: string
  inviter_display_name: string | null
  created_at: string
}

export interface CreatedPatientCareInvitation {
  invitationId: string
  patientId: string
  token: string
  expiresAt: string
  invitedEmail?: string
  emailStatus?: 'sent' | 'not_configured' | 'failed'
}

export async function createHouseholdPatientInvitationWithEmail(displayName: string, invitedEmail: string, authorizationBasis: string): Promise<CreatedPatientCareInvitation> {
  if (!displayName.trim() || displayName.trim().length > 100) throw new Error('Nama pasien harus 1–100 karakter. / 被照顧者名稱需為 1–100 個字。')
  if (!invitedEmail.trim() || !invitedEmail.includes('@')) throw new Error('Email Google tidak valid. / Google Email 格式不正確。')
  if (!authorizationBasis.trim() || authorizationBasis.trim().length > 200) throw new Error('Dasar kewenangan harus diisi. / 請填寫授權依據。')
  const { data, error } = await supabase.functions.invoke('send-invitation-email', {
    body: { kind: 'patient', displayName: displayName.trim(), invitedEmail: invitedEmail.trim(), authorizationBasis: authorizationBasis.trim() },
  })
  if (error) throw error
  const row = data as { emailStatus?: CreatedPatientCareInvitation['emailStatus']; invitation?: { invitationId?: string; patientId?: string; token?: string; expiresAt?: string; invitedEmail?: string } } | null
  if (!row) throw new Error('Undangan pasien tidak dapat dibuat. / 無法建立被照顧者邀請。')
  const invitation = row?.invitation
  if (!invitation?.invitationId || !invitation.patientId || !invitation.token || !invitation.expiresAt || !/^[0-9a-f]{64}$/i.test(invitation.token)) throw new Error('Undangan pasien tidak dapat dibuat. / 無法建立被照顧者邀請。')
  if (row.emailStatus !== 'sent' && row.emailStatus !== 'not_configured' && row.emailStatus !== 'failed') throw new Error('Invitation email status is invalid. / 邀請 email 狀態不正確。')
  return { invitationId: invitation.invitationId, patientId: invitation.patientId, token: invitation.token, expiresAt: invitation.expiresAt, invitedEmail: invitation.invitedEmail ?? invitedEmail.trim().toLowerCase(), emailStatus: row.emailStatus }
}

export async function createHouseholdPatientInvitationWithShare(displayName: string, invitedEmail: string, authorizationBasis: string): Promise<CreatedPatientCareInvitation> {
  if (!displayName.trim() || displayName.trim().length > 100) throw new Error('Nama pasien harus 1–100 karakter. / 被照顧者名稱需為 1–100 個字。')
  if (!invitedEmail.trim() || !invitedEmail.includes('@')) throw new Error('Email Google tidak valid. / Google Email 格式不正確。')
  if (!authorizationBasis.trim() || authorizationBasis.trim().length > 200) throw new Error('Dasar kewenangan harus diisi. / 請填寫授權依據。')
  const { data, error } = await supabase.rpc('create_household_patient_invitation', {
    p_display_name: displayName.trim(),
    p_invited_email: invitedEmail.trim(),
    p_authorization_basis: authorizationBasis.trim(),
  })
  if (error) throw error
  const row = data as { invitation_id?: string; patient_id?: string; share_token?: string; expires_at?: string } | null
  if (!row?.invitation_id || !row.patient_id || !row.share_token || !row.expires_at) throw new Error('Undangan pasien tidak dapat dibuat. / 無法建立被照顧者邀請。')
  return { invitationId: row.invitation_id, patientId: row.patient_id, token: row.share_token, expiresAt: row.expires_at }
}

export async function createHouseholdPatientInvitation(displayName: string, invitedEmail: string, authorizationBasis: string): Promise<string> {
  if (!displayName.trim() || displayName.trim().length > 100) throw new Error('Nama pasien harus 1–100 karakter. / 被照顧者名稱需為 1–100 個字。')
  if (!invitedEmail.trim() || !invitedEmail.includes('@')) throw new Error('Email Google tidak valid. / Google Email 格式不正確。')
  if (!authorizationBasis.trim() || authorizationBasis.trim().length > 200) throw new Error('Dasar kewenangan harus diisi. / 請填寫授權依據。')
  const { data, error } = await supabase.rpc('create_household_patient_invitation', {
    p_display_name: displayName.trim(),
    p_invited_email: invitedEmail.trim(),
    p_authorization_basis: authorizationBasis.trim(),
  })
  if (error) throw error
  const invitationId = (data as { invitation_id?: string } | null)?.invitation_id
  if (!invitationId) throw new Error('Undangan pasien tidak dapat dibuat. / 無法建立被照顧者邀請。')
  // 舊呼叫端只需要 ID；避免把一次性分享 token 擴散到不需要它的流程。
  return invitationId
}

export interface HouseholdPatientInvitation {
  invitation_id: string
  patient_id: string
  display_name: string
  invited_email: string
  status: 'pending' | 'accepted' | 'declined' | 'revoked'
  created_at: string
  expires_at: string
  revoked_at: string | null
}

export async function fetchHouseholdPatientInvitations(): Promise<HouseholdPatientInvitation[]> {
  const { data, error } = await supabase.rpc('fetch_household_patient_invitations')
  if (error) throw error
  return (data ?? []) as HouseholdPatientInvitation[]
}

export async function revokeHouseholdPatientInvitation(invitationId: string): Promise<void> {
  const { error } = await supabase.rpc('revoke_household_patient_invitation', { p_invitation_id: invitationId })
  if (error) throw error
}

export async function fetchPendingPatientCareInvitations(): Promise<PatientCareInvitation[]> {
  const { data, error } = await supabase.rpc('fetch_pending_patient_care_invitations')
  if (error) throw error
  return (data ?? []) as PatientCareInvitation[]
}

export async function acceptPatientCareInvitation(invitationId: string): Promise<string> {
  const { data, error } = await supabase.rpc('accept_patient_care_invitation', { p_invitation_id: invitationId })
  if (error) throw error
  if (!data) throw new Error('Undangan pasien tidak dapat diterima. / 無法接受被照顧者邀請。')
  return data as string
}

export async function declinePatientCareInvitation(invitationId: string): Promise<void> {
  const { error } = await supabase.rpc('decline_patient_care_invitation', { p_invitation_id: invitationId })
  if (error) throw error
}

export interface HouseholdMemberInfo {
  user_id: string
  email: string
  display_name: string | null
  role: HouseholdRole
  created_at: string
}

export interface ManagedPatient {
  patient_id: string
  display_name: string
}

export interface ManagedPet extends ManagedPatient {
  care_recipient_type: Exclude<CareRecipientType, 'human'>
}

export interface PatientAccessGrant {
  profile_email: string
  patient_id: string
  can_record: boolean
  can_manage_medication: boolean
}

export async function fetchHouseholdMembers(): Promise<HouseholdMemberInfo[]> {
  const { data, error } = await supabase.rpc('fetch_household_members')
  if (error) throw error
  return (data ?? []) as HouseholdMemberInfo[]
}

export async function fetchCurrentHouseholdRole(): Promise<HouseholdRole> {
  const { data, error } = await supabase.rpc('fetch_current_household_role')
  if (error) throw error
  if (data !== 'owner' && data !== 'caregiver' && data !== 'viewer') throw new Error('Peran ruang keluarga tidak valid. / 家庭角色不正確。')
  return data
}

export async function addHouseholdMember(email: string, role: HouseholdRole = 'caregiver'): Promise<void> {
  if (!email.trim()) throw new Error('Email harus diisi. / 請輸入 Email。')
  const { error } = await supabase.rpc('add_household_member', { p_email: email.trim(), p_role: role })
  if (error) throw error
}

export async function removeHouseholdMember(userId: string): Promise<void> {
  const { error } = await supabase.rpc('remove_household_member', { p_user_id: userId })
  if (error) throw error
}

export async function fetchHouseholdManagementPatients(): Promise<ManagedPatient[]> {
  const { data, error } = await supabase.rpc('fetch_household_management_patients')
  if (error) throw error
  return (data ?? []) as ManagedPatient[]
}

export async function fetchHouseholdPets(): Promise<ManagedPet[]> {
  const { data, error } = await supabase.rpc('fetch_household_pets')
  if (error) throw error
  return (data ?? []) as ManagedPet[]
}

export async function fetchHouseholdArchivedPets(): Promise<ManagedPet[]> {
  const { data, error } = await supabase.rpc('fetch_household_archived_pets')
  if (error) throw error
  return (data ?? []) as ManagedPet[]
}

export async function archiveHouseholdPet(patientId: string): Promise<void> {
  const { error } = await supabase.rpc('archive_household_pet', { p_patient_id: patientId })
  if (error) throw error
}

export async function fetchHouseholdPatientAccess(): Promise<PatientAccessGrant[]> {
  const { data, error } = await supabase.rpc('fetch_household_patient_access')
  if (error) throw error
  return (data ?? []) as PatientAccessGrant[]
}

export async function setHouseholdPatientAccess(email: string, patientId: string, canRecord: boolean, canManageMedication: boolean): Promise<void> {
  const { error } = await supabase.rpc('set_household_patient_access', {
    p_profile_email: email.trim(),
    p_patient_id: patientId,
    p_can_record: canRecord,
    p_can_manage_medication: canManageMedication,
  })
  if (error) throw error
}
