/*
檔案用途：處理使用者驗證、身份權限解析與活躍照護對象清單讀取。
所在層：src/lib；為身份驗證與授權邏輯共用模組。
主要關聯：由 useAuth Hook 與 App.tsx 呼叫，提供應用程式導覽與照護選單所需的活躍對象列表。
*/
import { supabase } from './supabase'
import { isNativeApp, readIsStandalonePwa } from './platform'

// 這裡刻意維持字面常數，不改走環境變數：前端 bundle 本來就會被瀏覽器看到，塞進 build-time env 並不會
// 增加隱密性，反而多一層設定要同步。這裡只用來決定要不要顯示「管理」選單／行程分頁，擋不下任何實際呼叫。
//
// ⚠️ 若未來要更換管理者帳號，除了 Supabase Function secret（見下方），還必須同步更新這裡與
// 下列每一處，否則會出現「新管理者被前端擋在 /admin 外、舊管理者卡在畫面卻被後端 403」或
// 「舊管理者仍保有跨病人刪除權限」的不一致視窗：
//   - supabase/functions/_shared/adminIdentity.ts 讀取的 ADMIN_EMAIL Function secret
//     （admin-list-users／admin-set-account-entitlement 的真正授權邊界，需在 staging 與
//     production 各自用 `supabase secrets set` 更新）
//   - supabase/migrations/20260907040000_scope_administrator_delete_to_granted_patients.sql
//     的 "administrator deletes records within granted patients" RLS policy——這是 Postgres
//     policy，無法讀 Deno 環境變數，只能寫新 migration 直接改字面 email 或改造成從設定表讀取。
export const ADMIN_EMAIL = 'admin@careapp.local'
export const MOTHER_SELF_ONLY_EMAIL = 'demo.mother@example.test'

export interface PatientIdentity {
  patientId: string
  displayName: string
  isOwnPatient: boolean
  canManageMedication: boolean
  // ADR-007 票 10：care_access.can_record，「今天」頁用它決定通知 incident 橫幅有沒有「已處理」按鈕
  // （D7：care_access 且 can_record 才能結案；管理者只放寬 can_record）。可選是為了不動既有 32 處建構點；
  // 未知（undefined）一律當成不能結案，寧可少一顆按鈕也不讓唯讀照護者按掉別人的漏送告警。
  canRecord?: boolean
  careRecipientType: 'human' | 'dog' | 'cat' | 'bird' | 'rabbit' | 'other'
  archivedAt: string | null
}

// Transitional TypeScript alias: values are always patient UUIDs. Keeping the
// old type name briefly avoids a risky all-at-once UI rename while removing the
// former fixed role strings from runtime data and authorization.
export type Subject = string
export type MedicationManagementPatient = PatientIdentity

export interface ProfileIdentity {
  ownPatientId: string
  subject: string
  displayName: string | null
  accessiblePatients: PatientIdentity[]
  allAccessiblePatients: PatientIdentity[]
  accessibleSubjects: string[]
  allAccessibleSubjects: string[]
  patientIdsBySubject: Record<string, string>
  medicationManagementPatients: MedicationManagementPatient[]
  isAdmin: boolean
}

export function isAdministratorEmail(email: string | undefined | null): boolean {
  return email?.trim().toLowerCase() === ADMIN_EMAIL
}

export function defaultDisplayNameForEmail(email: string | undefined | null): string {
  if (!email) return 'User'
  const prefix = email.split('@')[0] ?? ''
  return prefix ? prefix.charAt(0).toUpperCase() + prefix.slice(1) : 'User'
}

export function patientIcon(patient: Pick<PatientIdentity, 'isOwnPatient' | 'careRecipientType'>): string {
  // 依物種回傳對應圖示；人類資料庫預設檔位則按是否為登入者本人區分單人與群組。
  if (patient.careRecipientType === 'cat') return '🐱'
  if (patient.careRecipientType === 'dog') return '🐶'
  if (patient.careRecipientType === 'bird') return '🐦'
  if (patient.careRecipientType === 'rabbit') return '🐰'
  if (patient.careRecipientType === 'other') return '🐾'
  return patient.isOwnPatient ? '👤' : '👥'
}

export async function profileForEmail(email: string | undefined | null, provisionIfMissing = false): Promise<ProfileIdentity | null> {
  if (!email) return null
  const normalizedEmail = email.toLowerCase()
  // issue #774：下游 RLS policy 仍同時比對 care_access.profile_email 與 JWT email；Google 帳號改過 email 後，
  // 舊快照會讓使用者看不到任何既有病人。先讓資料庫把「本人 user_id 名下」的快照對齊目前的 JWT email，
  // 再讀 profiles／care_access／patients，否則這一趟載入仍會讀到被舊快照擋掉的空結果。
  // 必須在每次解析身分時呼叫，不能只靠 auto_provision_profile：那支只在「這個 email 還沒有 profiles 列」時
  // 才會被呼叫，被邀請過的 email、或曾因唯一鍵守門而略過同步的帳號，之後的登入都不會再經過它。
  // RPC 本身失敗只會維持同步前的狀態（等於現況），不能因此讓整個身分解析失敗。
  const { error: syncError } = await supabase.rpc('sync_care_access_profile_email')
  if (syncError) console.error('[sync_care_access_profile_email error]', syncError)
  const [profileResult, accessResult] = await Promise.all([
    supabase.from('profiles').select('display_name, patient_id').eq('email', normalizedEmail).maybeSingle(),
    supabase.from('care_access').select('patient_id, can_manage_medication, can_record, patients(display_name, care_recipient_type, archived_at)'),
  ])
  if (profileResult.error) {
    console.error('[profile fetch error]', profileResult.error)
    return null
  }
  if (!profileResult.data?.patient_id) {
    // 首次 GIS 登入回來只能辨識帳號，不能因此搶先建立健康空間；必須等健康資料同意頁完成後才允許 provision。
    if (!provisionIfMissing) return null
    const { data: provisioned, error: autoErr } = await supabase.rpc('auto_provision_profile')
    if (autoErr) {
      console.error('[auto_provision_profile error]', autoErr)
      return null
    }
    const ownPatientId = String((provisioned as Record<string, unknown>)?.patient_id ?? '')
    if (!ownPatientId) return null
    const displayName = String((provisioned as Record<string, unknown>)?.display_name || defaultDisplayNameForEmail(email))
    const ownPatientRecord: PatientIdentity = { patientId: ownPatientId, displayName, isOwnPatient: true, canManageMedication: true, canRecord: true, careRecipientType: 'human', archivedAt: null }
    return {
      ownPatientId,
      subject: ownPatientId,
      displayName,
      accessiblePatients: [ownPatientRecord],
      allAccessiblePatients: [ownPatientRecord],
      accessibleSubjects: [ownPatientId],
      allAccessibleSubjects: [ownPatientId],
      patientIdsBySubject: { [ownPatientId]: ownPatientId },
      medicationManagementPatients: [ownPatientRecord],
      isAdmin: isAdministratorEmail(email),
    }
  }
  if (accessResult.error) console.error('[care_access fetch error]', accessResult.error)
  const ownPatientId = String(profileResult.data.patient_id)
  const ownDisplayName = profileResult.data.display_name?.trim() || defaultDisplayNameForEmail(email)
  const selfOnlyAccount = normalizedEmail === MOTHER_SELF_ONLY_EMAIL
  const accessByPatientId = new Map<string, PatientIdentity>()
  for (const row of accessResult.data ?? []) {
    if (!row.patient_id) continue
    const patientId = String(row.patient_id)
    // 媽媽帳號只負責自己的紀錄；即使舊版資料庫殘留寵物 access，前端也不能把它變成可切換的健康對象。
    if (selfOnlyAccount && patientId !== ownPatientId) continue
    const patient = row as unknown as { can_manage_medication: boolean; can_record?: boolean; patients: { display_name: string; care_recipient_type: PatientIdentity['careRecipientType']; archived_at: string | null } | { display_name: string; care_recipient_type: PatientIdentity['careRecipientType']; archived_at: string | null }[] | null }
    // Supabase 的一對一關聯在不同查詢版本可能回傳物件或陣列；先正規化，不能讓 UUID 權限資料遺失病人名稱。
    const patientRecord = Array.isArray(patient.patients) ? patient.patients[0] : patient.patients
    const existing = accessByPatientId.get(patientId)
    // 同一病人可能有多條舊授權列；以 UUID 合併，不能再讓舊角色字串製造重複選項。
    accessByPatientId.set(patientId, {
      patientId,
      displayName: patientRecord?.display_name?.trim() || (patientId === ownPatientId ? ownDisplayName : '未命名對象'),
      isOwnPatient: patientId === ownPatientId,
      canManageMedication: Boolean(existing?.canManageMedication || row.can_manage_medication),
      canRecord: Boolean(existing?.canRecord || patient.can_record),
      // 舊資料 migration 預設 human；讀取異常時也不能讓未知類型影響既有家人的 icon 與操作。
      careRecipientType: patientRecord?.care_recipient_type ?? 'human',
      archivedAt: patientRecord?.archived_at ?? null,
    })
  }
  if (!accessByPatientId.has(ownPatientId)) {
    // 預設能管理自己的藥單。被照顧者專用帳號不是靠這裡的 email 白名單擋下來——那樣每多一位被照顧者
    // 就要多改一次程式碼，無法隨開放使用者成長。正確做法是被照顧者邀請流程（accept_patient_care_invitation）
    // 在接受邀請當下就明確寫入 can_manage_medication = false 的 care_access 列，這裡的迴圈會在上面
    // 就讀到那筆列並採用它，不會落到這個「沒有明確授權列」的預設分支。
    // 但如果是因為這次 care_access 查詢本身失敗（accessResult.error）才落到這裡，代表真正的授權狀態
    // 讀不到，不能因為讀取失敗就預設放行管理權——這對任何帳號都成立，不是只有被照顧者帳號才會遇到
    // 這個查詢失敗；病人身分本身仍要能顯示／選取，只是暫時不給「排藥」「變更紀錄」的管理能力。
    accessByPatientId.set(ownPatientId, { patientId: ownPatientId, displayName: ownDisplayName, isOwnPatient: true, canManageMedication: !accessResult.error, canRecord: !accessResult.error, careRecipientType: 'human', archivedAt: null })
  }
  const allAccessiblePatients = [...accessByPatientId.values()].sort((left, right) => Number(right.isOwnPatient) - Number(left.isOwnPatient) || left.displayName.localeCompare(right.displayName, 'zh-Hant'))
  // 帳號本人 (isOwnPatient) 強制保留不可刪除；被歸檔/移除的對象從日常選單過濾掉，避免寫入記錄至已封存寵物。
  const accessiblePatients = allAccessiblePatients.filter(patient => patient.isOwnPatient || !patient.archivedAt)
  const accessibleSubjects = accessiblePatients.map(patient => patient.patientId)
  const allAccessibleSubjects = allAccessiblePatients.map(patient => patient.patientId)
  return {
    ownPatientId,
    subject: ownPatientId,
    displayName: ownDisplayName,
    accessiblePatients,
    allAccessiblePatients,
    accessibleSubjects,
    allAccessibleSubjects,
    patientIdsBySubject: Object.fromEntries(allAccessibleSubjects.map(patientId => [patientId, patientId])),
    medicationManagementPatients: accessiblePatients.filter(patient => patient.canManageMedication),
    isAdmin: isAdministratorEmail(email),
  }
}

// 與 lib/demoData.ts 的同名常數保持相同 UUID 值；這裡獨立宣告是為了不讓驗證層反過來 import 純資料層。
export const DEMO_LEE_PATIENT_ID = '44444444-4444-4444-a444-444444444444'
export const DEMO_MEILING_PATIENT_ID = '55555555-5555-4555-a555-555555555555'
export const DEMO_CHEN_PATIENT_ID = '66666666-6666-4666-a666-666666666666'
// 每種寵物物種各留一隻展示對象，讓 /demo 也能驗證寵物慢性病照護模組（液體、消化、食慾、點滴、內分泌）
// 依 careRecipientType 正確顯示；貓咪刻意設計成糖尿病案例，因為牠是唯一同時符合全部 5 個寵物模組的物種。
export const DEMO_DOG_PATIENT_ID = '77777777-7777-4777-a777-777777777777'
export const DEMO_CAT_PATIENT_ID = '88888888-8888-4888-a888-888888888888'
export const DEMO_RABBIT_PATIENT_ID = '99999999-9999-4999-a999-999999999999'
export const DEMO_OTHER_PET_PATIENT_ID = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa'

export function fetchDemoProfileIdentity(): ProfileIdentity {
  // 李阿姨永遠排在展示對象第一位：藥單直接對照真實案例的服藥清單，讓服藥打卡／每週藥單／排藥／變更藥物
  // 四個分頁與藥名顯示規則（英文優先、紅色醒目）每次都能立即在 staging 驗證，不必依賴任何登入帳號的真實資料。
  const lee: PatientIdentity = {
    patientId: DEMO_LEE_PATIENT_ID,
    displayName: '李阿姨',
    isOwnPatient: false,
    canManageMedication: true,
    careRecipientType: 'human',
    archivedAt: null,
  }
  const meiling: PatientIdentity = {
    patientId: DEMO_MEILING_PATIENT_ID,
    displayName: '王美玲',
    isOwnPatient: true,
    canManageMedication: true,
    careRecipientType: 'human',
    archivedAt: null,
  }
  const chen: PatientIdentity = {
    patientId: DEMO_CHEN_PATIENT_ID,
    displayName: '陳伯伯 (多重狀況案例)',
    isOwnPatient: false,
    canManageMedication: true,
    careRecipientType: 'human',
    archivedAt: null,
  }
  const dog: PatientIdentity = {
    patientId: DEMO_DOG_PATIENT_ID,
    displayName: '旺財',
    isOwnPatient: false,
    canManageMedication: true,
    careRecipientType: 'dog',
    archivedAt: null,
  }
  const cat: PatientIdentity = {
    patientId: DEMO_CAT_PATIENT_ID,
    displayName: '小乖 (糖尿病案例)',
    isOwnPatient: false,
    canManageMedication: true,
    careRecipientType: 'cat',
    archivedAt: null,
  }
  const rabbit: PatientIdentity = {
    patientId: DEMO_RABBIT_PATIENT_ID,
    displayName: '小白',
    isOwnPatient: false,
    canManageMedication: true,
    careRecipientType: 'rabbit',
    archivedAt: null,
  }
  const otherPet: PatientIdentity = {
    patientId: DEMO_OTHER_PET_PATIENT_ID,
    displayName: '皮皮',
    isOwnPatient: false,
    canManageMedication: true,
    careRecipientType: 'other',
    archivedAt: null,
  }
  const patients = [lee, meiling, chen, dog, cat, rabbit, otherPet]
  const subjects = patients.map(p => p.patientId)

  return {
    ownPatientId: DEMO_MEILING_PATIENT_ID,
    subject: DEMO_MEILING_PATIENT_ID,
    displayName: '王美玲家屬 (Demo 模式)',
    accessiblePatients: patients,
    allAccessiblePatients: patients,
    accessibleSubjects: subjects,
    allAccessibleSubjects: subjects,
    patientIdsBySubject: Object.fromEntries(subjects.map(id => [id, id])),
    medicationManagementPatients: patients,
    isAdmin: false,
  }
}

export async function updateProfileDisplayName(email: string, newDisplayName: string): Promise<void> {
  const trimmed = newDisplayName.trim()
  if (!trimmed || trimmed.length > 100) throw new Error('Nama tampilan harus 1–100 karakter. / 顯示名稱需為 1–100 個字。')
  const lowerEmail = email.toLowerCase()
  const { error: profileErr } = await supabase.from('profiles').update({ display_name: trimmed }).eq('email', lowerEmail)
  if (profileErr) console.error('[update profile display_name error]', profileErr)
  const { data: authUser } = await supabase.auth.getUser()
  if (authUser?.user) void supabase.from('app_profiles').update({ display_name: trimmed, updated_at: new Date().toISOString() }).eq('user_id', authUser.user.id)
}

export function signInWithGoogleIdToken(token: string, nonce: string) {
  // GIS 已在 Google popup／FedCM 內完成身分選擇；前台只把短生命週期 ID token 交給 Supabase，不再把使用者導去 project-ref 網域。
  // nonce 保留原文傳給 Supabase；Google 初始化時使用同一 nonce 的 SHA-256 hex，才能通過 Supabase 的 replay 檢查。
  return supabase.auth.signInWithIdToken({ provider: 'google', token, nonce })
}

export function signOut() {
  // Google 官方建議登出時停用自動選取，避免使用者剛登出就被同一個 Google session 立刻帶回登入流程。
  if (typeof window !== 'undefined') window.google?.accounts?.id.disableAutoSelect?.()
  return supabase.auth.signOut()
}

// 平台判定的單一來源在 platform.ts；這裡保留 re-export，避免既有呼叫端改 import 路徑。
export { readIsStandalonePwa as isStandalonePwa }

export function isWebView(): boolean {
  if (typeof window === 'undefined') return false
  // Capacitor 原生殼的 WKWebView 也沒有 "Safari" 字樣，會被下面的規則誤判成嵌入式瀏覽器；
  // 原生殼走 startNativeGoogleOAuth 系統瀏覽器流程，不受此判定影響，必須先排除。
  if (isNativeApp()) return false
  // iOS 加到主畫面的 standalone PWA 也會被 AppleWebKit UA 沒有 "Safari" 字樣的規則誤判成嵌入式瀏覽器，
  // 導致 Google 登入按鈕被擋掉、每次從桌面圖示開啟都要重新登入；必須先排除這個受信任的情境。
  if (readIsStandalonePwa()) return false
  const ua = window.navigator.userAgent || ''
  return /wv/i.test(ua) || /(iPhone|iPod|iPad).*AppleWebKit(?!.*Safari)/i.test(ua) || /FBAN|FBAV|Instagram|Line|MicroMessenger|Messenger|Threads/i.test(ua)
}

export function isLineBrowser(): boolean {
  return typeof window !== 'undefined' && /Line/i.test(window.navigator.userAgent || '')
}
