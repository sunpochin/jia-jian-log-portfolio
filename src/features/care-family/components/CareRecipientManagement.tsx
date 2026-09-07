/*
檔案用途：讓家庭管理者新增照護對象、管理活躍寵物，並將不再日常照護的寵物安全移除至歷史清單。
所在層：src/components；由設定頁提供的家庭照護對象管理區。
主要關聯：透過 lib/tenant 呼叫家庭授權 RPC，完成後通知 App 重讀目前可選病人；不直接刪除任何健康歷史。
*/
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { addHouseholdPatient, archiveHouseholdPet, createHouseholdPatientInvitationWithEmail, fetchCurrentHouseholdRole, fetchHouseholdArchivedPets, fetchHouseholdPatientInvitations, revokeHouseholdPatientInvitation, type CareRecipientType, type HouseholdRole, type ManagedPet, type HouseholdPatientInvitation } from '../../../lib/tenant'
import type { PatientIdentity } from '../../../lib/auth'
import { useI18n, type LocalizedText } from '../../../lib/i18n'
import { buildPatientInvitationUrl, patientInvitationShareText } from '../../../lib/caregiverInvitations'
import { useConfirm } from '../../../hooks/useConfirm'
import { MengniDogMark } from '../../../components/system/MengniDogMark'
import { MengniCatMark } from '../../../components/system/MengniCatMark'
import { MengniRabbitMark } from '../../../components/system/MengniRabbitMark'
import { PickleBirdMark } from '../../../components/system/PickleBirdMark'

// RPC 用純英文 RAISE EXCEPTION 訊息（PostgREST 直接轉傳），這裡對照已知情境給雙語說明；
// 未列出的訊息維持原本的通用重試文字，避免顯示未經檢視的資料庫原始錯誤。
function describeInviteError(cause: unknown): LocalizedText | null {
  const message = cause instanceof Error ? cause.message : typeof cause === 'object' && cause !== null && 'message' in cause ? String((cause as { message: unknown }).message) : ''
  if (message.includes('already has a patient identity')) {
    return { id: 'Email ini sudah punya identitas pasien sendiri (mungkin akun Anda sendiri atau anggota lain). Gunakan panel akses pasien yang sudah ada.', zh: '這個 Email 已經有自己的被照顧者身分（可能是你自己或其他成員的帳號），不能重複邀請；請改用既有的授權管理入口。' ,en: "Email this already punya identitas pasien sendiri (may akun You sendiri or anggota lain). Gunakan panel akses pasien that already ada." }
  }
  if (message.includes('Only a household owner')) {
    return { id: 'Hanya pemilik keluarga yang dapat mengundang pasien.', zh: '只有家庭管理者（owner）能邀請被照顧者。' ,en: 'Only the family owner can invite a patient.' }
  }
  return null
}

function PetTypeMark({ type }: { type: ManagedPet['care_recipient_type'] }) {
  // 狗狗清單重用版本宣告的猛膩圖示，讓牠是同一個守護家庭資料的角色，而不是另一個表情符號。
  if (type === 'dog') return <MengniDogMark className="h-6 w-7 shrink-0" />
  // 貓也使用固定 SVG，避免清單在不同作業系統上因 emoji 字型不同而變形。
  if (type === 'cat') return <MengniCatMark className="h-6 w-7 shrink-0" />
  if (type === 'bird') return <PickleBirdMark className="h-6 w-7 shrink-0" />
  // 兔子是既有資料的相容類型；新增表單不再提供它，但歷史清單仍要能辨識。
  if (type === 'rabbit') return <MengniRabbitMark className="h-6 w-7 shrink-0" />
  return <span aria-hidden="true">🐾</span>
}

function patientInvitationStatusText(status: HouseholdPatientInvitation['status'], text: (value: LocalizedText) => string): string {
  if (status === 'pending') return text({ id: 'Menunggu orang tersebut masuk dan mengonfirmasi', zh: '等待對方登入並確認', en: 'Waiting for the person to sign in and confirm' })
  if (status === 'accepted') return text({ id: 'Dikonfirmasi', zh: '已確認', en: 'Confirmed' })
  if (status === 'declined') return text({ id: 'Ditolak', zh: '已拒絕', en: 'Declined' })
  return text({ id: 'Dicabut', zh: '已撤銷', en: 'Revoked' })
}

export function CareRecipientManagement({ onCreated, onArchived, onViewArchived, availablePatients, isDemoMode }: { onCreated: (patientId: string) => Promise<void>; onArchived: () => Promise<void>; onViewArchived: (pet: ManagedPet) => void; availablePatients: PatientIdentity[]; isDemoMode: boolean }) {
  const { text, locale } = useI18n()
  const { confirm, dialog: confirmDialog } = useConfirm()
  const [role, setRole] = useState<HouseholdRole | null>(null)
  const [roleError, setRoleError] = useState(false)
  const [pets, setPets] = useState<ManagedPet[]>([])
  const [archivedPets, setArchivedPets] = useState<ManagedPet[]>([])
  const [name, setName] = useState('')
  const [recipientType, setRecipientType] = useState<CareRecipientType>('cat')
  const [typeMenuOpen, setTypeMenuOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  // 邀請照顧者是獨立表單與狀態，不再跟寵物新增共用同一組 name／saving／message，
  // 避免兩個表單其中一個送出中時，另一個的輸入框被誤判成停用或清空。
  const [inviteName, setInviteName] = useState('')
  const [invitedEmail, setInvitedEmail] = useState('')
  const [authorizationBasis, setAuthorizationBasis] = useState('')
  const [inviteSaving, setInviteSaving] = useState(false)
  const [inviteMessage, setInviteMessage] = useState('')
  const [patientInvitations, setPatientInvitations] = useState<HouseholdPatientInvitation[]>([])
  const [createdPatientInvite, setCreatedPatientInvite] = useState<{ url: string; expiresAt: string; invitedEmail: string; emailStatus: 'sent' | 'not_configured' | 'failed' } | null>(null)
  const canManagePets = role === 'owner' || role === 'caregiver'
  const canAddPeople = role === 'owner'
  const accessibleActivePets = useMemo(() => availablePatients.flatMap(patient => {
    if (patient.archivedAt || patient.careRecipientType === 'human') return []
    return [{ patient_id: patient.patientId, display_name: patient.displayName, care_recipient_type: patient.careRecipientType }]
  }), [availablePatients])

  const reloadPets = useCallback(async () => {
    // 登入流程已透過 care_access 取得這份活躍清單；設定頁不再重複呼叫會失敗的管理 RPC。
    setPets(accessibleActivePets)
    try {
      const nextArchivedPets = await fetchHouseholdArchivedPets()
      setArchivedPets(nextArchivedPets)
    } catch (cause) {
      // 封存生命歷史是次要資訊；讀取失敗不能連帶讓正在照護的寵物清單與新增入口都消失。
      console.error('[archived pet list read error]', cause)
      setArchivedPets([])
      setMessage(text({ id: 'Daftar riwayat hewan belum dapat dibaca. Anda tetap dapat mengelola hewan yang sedang dirawat.', zh: '暫時無法讀取已封存寵物歷史；仍可管理目前照護的寵物。' ,en: 'Archived pet history is temporarily unavailable; pets under your care can still be managed.' }))
    }
  }, [accessibleActivePets, text])

  const reloadSetup = useCallback(async () => {
    // 展示資料沒有正式 household 權限；先在 effect 入口擋住，避免設定頁把 demo 誤當成 RPC 失敗。
    if (isDemoMode) return
    setRoleError(false)
    // 角色與清單可各自失敗；不能因封存清單讀取失敗，讓可新增寵物的照護者永遠停在確認中。
    try { setRole(await fetchCurrentHouseholdRole()) } catch (cause) { console.error('[pet role read error]', cause); setRoleError(true); return }
    try { await reloadPets() } catch (cause) { console.error('[pet list read error]', cause); setMessage(text({ id: 'Daftar hewan belum dapat dibaca. Coba lagi.', zh: '暫時無法讀取寵物清單，請再試一次。' ,en: 'There was an error reading the list of pets, please try again.' })) }
    try { setPatientInvitations(await fetchHouseholdPatientInvitations()) } catch (cause) { console.error('[patient invitation management read error]', cause); setPatientInvitations([]) }
  }, [isDemoMode, reloadPets, text])

  useEffect(() => {
    // 展示模式只呈現虛構資料，不能為了填設定卡而觸發正式家庭管理查詢。
    if (!isDemoMode) void reloadSetup()
  }, [isDemoMode, reloadSetup])

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    // UI 已在展示模式隱藏寫入入口；這個 guard 仍保護未來事件接線不誤送正式邀請或新增 RPC。
    if (isDemoMode) return
    setSaving(true)
    setMessage('')
    try {
      const patientId = await addHouseholdPatient(name, recipientType)
      await onCreated(patientId)
      await reloadPets()
      setName('')
      setRecipientType('cat')
      setMessage(text({ id: 'Penerima perawatan ditambahkan dan dipilih.', zh: '已新增並切換到這位照護對象。' ,en: 'Added and switched to this caregiver.' }))
    } catch (cause) {
      console.error('[care recipient creation error]', cause)
      setMessage(text({ id: 'Tidak dapat menambah penerima perawatan. Coba lagi.', zh: '暫時無法新增照護對象，請再試一次。' ,en: 'There was an error adding the subject of care, please try again.' }))
    } finally {
      setSaving(false)
    }
  }

  const submitInvite = async (event: React.FormEvent) => {
    event.preventDefault()
    // UI 已在展示模式隱藏寫入入口；這個 guard 仍保護未來事件接線不誤送正式邀請 RPC。
    if (isDemoMode) return
    setInviteSaving(true)
    setInviteMessage('')
    try {
      // 人類資料先建立待接受邀請，不先寫 care_access；接受者未確認前，建立者也不能讀寫這位病人的健康資料。
      const created = await createHouseholdPatientInvitationWithEmail(inviteName, invitedEmail, authorizationBasis)
      setCreatedPatientInvite({ url: buildPatientInvitationUrl(window.location.origin, created.token), expiresAt: created.expiresAt, invitedEmail: created.invitedEmail ?? invitedEmail.trim().toLowerCase(), emailStatus: created.emailStatus ?? 'not_configured' })
      try { setPatientInvitations(await fetchHouseholdPatientInvitations()) } catch (refreshError) {
        // 建立與清單刷新是兩件事；清單讀取暫時失敗不能讓 owner 以為一次性分享連結沒有建立。
        console.error('[patient invitation list refresh error]', refreshError)
      }
      setInviteName('')
      setInvitedEmail('')
      setAuthorizationBasis('')
      setInviteMessage(text(created.emailStatus === 'sent'
        ? { id: `Undangan dibuat dan email dikirim ke ${created.invitedEmail}.`, zh: `已建立邀請，email 已寄到 ${created.invitedEmail}。`, en: `Invitation created and email sent to ${created.invitedEmail}.` }
        : created.emailStatus === 'not_configured'
          ? { id: 'Undangan dibuat, tetapi email belum dikonfigurasi. Gunakan tautan di bawah untuk berbagi manual.', zh: '已建立邀請，但尚未設定寄信服務；請用下方連結手動分享。', en: 'Invitation created, but email delivery is not configured. Use the link below to share it manually.' }
          : { id: 'Undangan dibuat, tetapi email gagal dikirim. Gunakan tautan di bawah untuk berbagi manual.', zh: '已建立邀請，但 email 寄送失敗；請用下方連結手動分享。', en: 'Invitation created, but email delivery failed. Use the link below to share it manually.' }))
    } catch (cause) {
      console.error('[patient invitation creation error]', cause)
      setInviteMessage(text(describeInviteError(cause) ?? { id: 'Tidak dapat membuat undangan. Coba lagi.', zh: '暫時無法建立邀請，請再試一次。' ,en: "Could not create invitation. Try again." }))
    } finally {
      setInviteSaving(false)
    }
  }

  const copyPatientInvite = async (url: string) => {
    if (!navigator.clipboard) {
      setInviteMessage(text({ id: 'Salin manual tautan di kotak bawah.', zh: '請用下方連結欄位手動複製。', en: 'Copy the link manually from the field below.' }))
      return
    }
    try {
      await navigator.clipboard.writeText(url)
      setInviteMessage(text({ id: 'Tautan disalin.', zh: '已複製邀請連結。', en: 'Invitation link copied.' }))
    } catch {
      // 不能把瀏覽器拒絕剪貼簿誤報成成功；readOnly 欄位保留人工複製退路。
      setInviteMessage(text({ id: 'Tidak dapat menyalin. Tekan lama tautan untuk menyalin.', zh: '無法自動複製，請長按下方連結手動複製。', en: 'Unable to copy automatically. Press and hold the link to copy it.' }))
    }
  }

  const sharePatientInvite = (url: string) => {
    if (!navigator.share) {
      setInviteMessage(text({ id: 'Berbagi sistem tidak tersedia; gunakan Salin tautan.', zh: '此瀏覽器不支援系統分享，請使用「複製連結」。', en: 'System sharing is unavailable; use Copy link.' }))
      return
    }
    // 不先 await 其他工作，保留按鈕的 user gesture，避免行動瀏覽器拒絕系統分享。
    void navigator.share({ title: text({ id: 'Undangan pasien', zh: '被照顧者邀請', en: 'Patient invitation' }), text: patientInvitationShareText(locale, url) }).catch(error => {
      if (error instanceof DOMException && error.name === 'AbortError') return
      setInviteMessage(text({ id: 'Berbagi dibatalkan atau gagal. Gunakan Salin tautan.', zh: '分享被取消或失敗，請改用「複製連結」。', en: 'Sharing was cancelled or failed. Use Copy link.' }))
    })
  }

  const revokePatientInvite = async (invitationId: string) => {
    if (!(await confirm(text({ id: 'Cabut undangan pasien ini?', zh: '要撤銷這封被照顧者邀請嗎？', en: 'Revoke this patient invitation?' })))) return
    try {
      await revokeHouseholdPatientInvitation(invitationId)
      setPatientInvitations(await fetchHouseholdPatientInvitations())
      setInviteMessage(text({ id: 'Undangan pasien dicabut.', zh: '被照顧者邀請已撤銷。', en: 'Patient invitation revoked.' }))
    } catch (cause) {
      console.error('[patient invitation revoke error]', cause)
      setInviteMessage(text({ id: 'Undangan tidak dapat dicabut. Coba lagi.', zh: '暫時無法撤銷邀請，請再試一次。', en: 'Unable to revoke the invitation. Try again.' }))
    }
  }

  const removePet = async (pet: ManagedPet) => {
    // 展示模式沒有可封存的正式寵物，避免任何意外事件把 archive RPC 送出。
    if (isDemoMode) return
    // 「移除」只退出日常清單；寵物也有照護歷史，不能為了整理選項就不可逆地抹掉資料。
    if (!(await confirm(text({ id: `Hapus ${pet.display_name} dari perawatan harian? Riwayat hidupnya tetap tersimpan dan tidak ada catatan baru yang dapat ditulis.`, zh: `要從日常照護移除 ${pet.display_name} 嗎？生命歷史會保留，但不能再新增日常紀錄。` ,en: `Remove ${pet.display_name} from routine care? Their history will remain saved, but no new routine records can be added.` })))) return
    setSaving(true)
    setMessage('')
    try {
      await archiveHouseholdPet(pet.patient_id)
      // RPC 成功後先在本機移除，避免清單讀取暫時失敗時又把剛封存的寵物放回日常照護畫面。
      setPets(currentPets => currentPets.filter(currentPet => currentPet.patient_id !== pet.patient_id))
      await onArchived()
      setMessage(text({ id: `${pet.display_name} dihapus dari perawatan harian.`, zh: `${pet.display_name} 已從日常照護移除。` ,en: `${pet.display_name} was removed from routine care.` }))
    } catch (cause) {
      console.error('[pet archive error]', cause)
      setMessage(text({ id: 'Tidak dapat menghapus hewan dari perawatan harian. Coba lagi.', zh: '暫時無法從日常照護移除寵物，請再試一次。' ,en: 'There was an error removing your pet from routine care, please try again.' }))
    } finally {
      setSaving(false)
    }
  }

  if (isDemoMode) return <section className="mt-6 rounded-2xl border border-indigo-100 bg-indigo-50 p-4" aria-labelledby="care-recipient-heading">
    <h2 id="care-recipient-heading" className="font-bold text-indigo-950">{text({ id: 'Zon demo: pengelolaan keluarga', zh: '展示模式：家庭管理' ,en: 'Showcase Mode: Family Management' })}</h2>
    <p className="mt-1 text-sm leading-6 text-indigo-900">{text({ id: 'Mode demo hanya menampilkan data fiktif. Penambahan orang, pengarsipan hewan, dan undangan keluarga tersedia setelah masuk secara resmi.', zh: '展示模式只顯示虛構資料；新增人員、封存寵物與家庭邀請，請在正式登入後使用。' ,en: 'Display mode shows only fictitious data; add people, archive pets, and family invitations after you’ve officially logged in.' })}</p>
  </section>

  if (role === null) return <section className="mt-6 rounded-2xl border border-indigo-100 bg-indigo-50 p-4" aria-labelledby="care-recipient-heading">
    <h2 id="care-recipient-heading" className="font-bold text-indigo-950">{text({ id: 'Tambah hewan', zh: '新增寵物' ,en: 'Add a pet' })}</h2>
    {roleError
      ? <><p className="mt-1 text-sm text-indigo-900">{text({ id: 'Izin pengelolaan belum dapat dibaca. Coba lagi.', zh: '暫時無法讀取管理權限，請再試一次。' ,en: 'Error reading administrative permissions, please try again.' })}</p><button type="button" onClick={() => void reloadSetup()} className="mt-3 rounded-lg border border-indigo-300 px-3 py-2 text-sm font-bold text-indigo-800">{text({ id: 'Coba lagi', zh: '重試' ,en: 'Try again' })}</button></>
      : <p className="mt-1 text-sm text-indigo-900">{text({ id: 'Memeriksa izin pengelolaan…', zh: '正在確認管理權限…' ,en: 'Confirming management permissions...' })}</p>}
  </section>

  return <>
  {confirmDialog}
  {canAddPeople && <section className="mt-6 rounded-2xl border border-emerald-100 bg-emerald-50 p-4" aria-labelledby="caregiver-invite-heading">
    {/* 邀請照顧者拆成獨立區塊，不再藏在「類型」下拉選單裡的「人」選項——原本的下拉選單讓這個入口很難被找到。 */}
    <h2 id="caregiver-invite-heading" className="font-bold text-emerald-950">{text({ id: 'Undang orang yang dirawat', zh: '邀請被照顧者' ,en: 'Invite a patient' })}</h2>
    <p className="mt-1 text-sm text-emerald-900">{text({ id: 'Tambahkan orang yang dirawat dengan Google Email miliknya sendiri. Ia harus masuk dan menerima undangan sebelum siapa pun dapat mencatat datanya.', zh: '用被照顧者本人的 Google Email 建立邀請；對方必須自己登入並接受後，任何人才能開始記錄其健康資料。' ,en: 'Add a patient using their own Google email. They must sign in and accept the invitation before anyone can record their health data.' })}</p>
    <form onSubmit={submitInvite} className="mt-4 space-y-3">
      <label className="block text-sm font-bold text-gray-800">{text({ id: 'Nama', zh: '名稱' ,en: 'Name' })}
        <input required maxLength={100} value={inviteName} onChange={event => setInviteName(event.target.value)} placeholder={text({ id: 'Contoh: Ibu', zh: '例如：媽媽' ,en: "Example: Ibu" })} className="mt-1 w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5" />
      </label>
      <label className="block text-sm font-bold text-gray-800">{text({ id: 'Google Email orang yang dirawat', zh: '被照顧者 Google Email' ,en: 'Google Email person that dirawat' })}
        <input required type="email" value={invitedEmail} onChange={event => setInvitedEmail(event.target.value)} placeholder="contoh@gmail.com" className="mt-1 w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5" />
      </label>
      <label className="block text-sm font-bold text-gray-800">{text({ id: 'Dasar kewenangan', zh: '授權依據' ,en: 'Authorized By' })}
        <input required maxLength={200} value={authorizationBasis} onChange={event => setAuthorizationBasis(event.target.value)} placeholder={text({ id: 'Contoh: anak, dengan persetujuan ibu', zh: '例如：子女，經母親同意' ,en: 'Ex: Child, with mother’s consent' })} className="mt-1 w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5" />
      </label>
      {inviteMessage && <p role="status" className="text-sm text-emerald-900">{inviteMessage}</p>}
      <button type="submit" disabled={inviteSaving} className="w-full rounded-xl bg-emerald-700 px-4 py-3 text-sm font-bold text-white disabled:opacity-60">{text({ id: 'Kirim undangan', zh: '送出邀請' ,en: 'Send invitation' })}</button>
    </form>
    {createdPatientInvite && <div className="mt-4 rounded-xl border border-emerald-200 bg-white p-3">
      <p className="text-sm font-bold text-emerald-950">{text({ id: 'Tautan undangan siap dibagikan', zh: '邀請連結已準備好，可分享給對方', en: 'Invitation link ready to share' })}</p>
      <p className="mt-1 text-xs text-emerald-900">{createdPatientInvite.emailStatus === 'sent' ? text({ id: `Email dikirim ke ${createdPatientInvite.invitedEmail}.`, zh: `Email 已寄到 ${createdPatientInvite.invitedEmail}。`, en: `Email sent to ${createdPatientInvite.invitedEmail}.` }) : text({ id: `Kirim tautan ini secara manual ke ${createdPatientInvite.invitedEmail}.`, zh: `請手動把連結傳給 ${createdPatientInvite.invitedEmail}。`, en: `Send this link manually to ${createdPatientInvite.invitedEmail}.` })}</p>
      <p className="mt-1 text-xs leading-5 text-emerald-900">{text({ id: 'Tautan ini hanya ditampilkan sekali. Tetap gunakan akun Google yang diundang.', zh: '這個連結只在此顯示一次；對方仍必須使用受邀的 Google 帳號。', en: 'This link is shown only once. The recipient must use the invited Google account.' })}</p>
      <input readOnly value={createdPatientInvite.url} aria-label={text({ id: 'Tautan undangan pasien', zh: '被照顧者邀請連結', en: 'Patient invitation link' })} className="mt-2 w-full rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-2 text-xs text-emerald-950" />
      <div className="mt-2 grid grid-cols-2 gap-2">
        <button type="button" onClick={() => sharePatientInvite(createdPatientInvite.url)} className="rounded-lg bg-emerald-700 px-3 py-2 text-xs font-bold text-white">{text({ id: 'Bagikan', zh: '系統分享', en: 'Share' })}</button>
        <button type="button" onClick={() => void copyPatientInvite(createdPatientInvite.url)} className="rounded-lg border border-emerald-300 px-3 py-2 text-xs font-bold text-emerald-800">{text({ id: 'Salin tautan', zh: '複製連結', en: 'Copy link' })}</button>
      </div>
      <p className="mt-2 text-xs text-emerald-900">{text({ id: `Berlaku sampai ${new Date(createdPatientInvite.expiresAt).toLocaleString('id-ID')}.`, zh: `有效期限：${new Date(createdPatientInvite.expiresAt).toLocaleString('zh-TW')}。`, en: `Valid until ${new Date(createdPatientInvite.expiresAt).toLocaleString('en-US')}.` })}</p>
    </div>}
    {patientInvitations.length > 0 && <div className="mt-4 border-t border-emerald-200 pt-4">
      <h3 className="text-sm font-bold text-emerald-950">{text({ id: 'Undangan pasien yang dibuat', zh: '已建立的被照顧者邀請', en: 'Patient invitations created' })}</h3>
      <ul className="mt-2 space-y-2">{patientInvitations.map(invitation => <li key={invitation.invitation_id} className="flex items-start justify-between gap-3 rounded-xl border border-emerald-100 bg-white p-3 text-sm">
        <div className="min-w-0"><p className="truncate font-semibold text-gray-800">{invitation.display_name}</p><p className="truncate text-xs text-gray-600">{invitation.invited_email}</p><p className="mt-1 text-xs text-emerald-900">{patientInvitationStatusText(invitation.status, text)}</p></div>
        {invitation.status === 'pending' && <button type="button" onClick={() => void revokePatientInvite(invitation.invitation_id)} className="shrink-0 rounded-lg border border-red-200 px-2.5 py-1 text-xs font-bold text-red-700">{text({ id: 'Cabut', zh: '撤銷', en: 'Revoke' })}</button>}
      </li>)}</ul>
      <p className="mt-2 text-xs text-emerald-900">{text({ id: 'Undangan yang dicabut tidak dapat diterima.', zh: '已撤銷的邀請不能再被接受。', en: 'A revoked invitation cannot be accepted.' })}</p>
    </div>}
  </section>}

  <section className="mt-6 rounded-2xl border border-indigo-100 bg-indigo-50 p-4" aria-labelledby="care-recipient-heading">
    <h2 id="care-recipient-heading" className="font-bold text-indigo-950">{text({ id: 'Tambah hewan', zh: '新增寵物' ,en: 'Add a pet' })}</h2>
    <p className="mt-1 text-sm text-indigo-900">{text(canManagePets ? { id: 'Pemilik dan pengasuh dapat menambah atau menghapus hewan dari perawatan harian bersama. Riwayat hidup tetap disimpan.', zh: '家庭管理者與照護者可共同新增或從日常照護移除寵物；生命歷史會保留。' ,en: 'Family managers and caregivers can add or remove pets together from routine care; life history is preserved.' } : { id: 'Anda adalah anggota hanya-lihat: Anda dapat melihat hewan dan riwayatnya, tetapi tidak dapat menambah atau menghapusnya dari perawatan harian.', zh: '你是僅檢視成員：可查看寵物與生命歷史，但不能新增或從日常照護移除。' ,en: 'You’re a view-only member: You can view pets and life history, but you can’t add or remove them from routine care.' })}</p>
    {canManagePets && <form onSubmit={submit} className="mt-4 space-y-3">
      <label className="block text-sm font-bold text-gray-800">{text({ id: 'Nama', zh: '名稱' ,en: 'Name' })}
        <input required maxLength={100} value={name} onChange={event => setName(event.target.value)} placeholder={text({ id: 'Contoh: Whiskers', zh: '例如：小乖' ,en: "Example: Whistors" })} className="mt-1 w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5" />
      </label>
      <RecipientTypeMenu value={recipientType} open={typeMenuOpen} onToggle={() => setTypeMenuOpen(open => !open)} onChange={type => { setRecipientType(type); setTypeMenuOpen(false) }} text={text} />
      {recipientType === 'other' && <p className="text-xs leading-5 text-indigo-900">{text({ id: 'Bedakan hewan lain melalui namanya, misalnya kura-kura atau reptil.', zh: '請用名稱區分其他動物，例如：烏龜或爬蟲類。' ,en: "Bedakan animal lain melalui namanya, misalnya kura-kura or reptil." })}</p>}
      {message && <p role="status" className="text-sm text-indigo-900">{message}</p>}
      <button type="submit" disabled={saving} className="w-full rounded-xl bg-indigo-700 px-4 py-3 text-sm font-bold text-white disabled:opacity-60">{text({ id: 'Tambah penerima perawatan', zh: '新增照護對象' ,en: 'Add a care recipient' })}</button>
    </form>}
    {pets.length > 0 && <div className="mt-5 border-t border-indigo-100 pt-4">
      <h3 className="text-sm font-bold text-indigo-950">{text({ id: 'Hewan yang dirawat', zh: '目前照護的寵物' ,en: 'Hewan that dirawat' })}</h3>
      <ul className="mt-2 space-y-2">{pets.map(pet => <li key={pet.patient_id} className="flex items-center justify-between gap-3 rounded-xl bg-white p-3 text-sm"><span className="inline-flex min-w-0 items-center gap-2"><PetTypeMark type={pet.care_recipient_type} /><span className="truncate">{pet.display_name}</span></span>{canManagePets && <button type="button" disabled={saving} onClick={() => void removePet(pet)} className="rounded-lg border border-red-200 px-2.5 py-1 text-xs font-bold text-red-700 disabled:opacity-60">{text({ id: 'Hapus', zh: '移除' ,en: 'Delete' })}</button>}</li>)}</ul>
      <p className="mt-2 text-xs text-indigo-900">{text({ id: 'Menghapus dari perawatan harian menghentikan catatan baru, tetapi riwayat hidup tetap tersimpan.', zh: '從日常照護移除後不能再新增紀錄，但生命歷史會保留。' ,en: 'Records cannot be added after removal from routine care, but life history is preserved.' })}</p>
    </div>}
    {archivedPets.length > 0 && <div className="mt-5 border-t border-indigo-100 pt-4">
      <h3 className="text-sm font-bold text-indigo-950">{text({ id: 'Hewan yang diarsipkan', zh: '已封存的寵物' ,en: 'Archived pets' })}</h3>
      <ul className="mt-2 space-y-2">{archivedPets.map(pet => <li key={pet.patient_id} className="flex items-center justify-between gap-3 rounded-xl border border-dashed border-indigo-200 bg-white/70 p-3 text-sm"><span className="inline-flex min-w-0 items-center gap-2"><PetTypeMark type={pet.care_recipient_type} /><span className="truncate">{pet.display_name}</span></span><button type="button" onClick={() => onViewArchived(pet)} className="rounded-lg border border-indigo-300 px-2.5 py-1 text-xs font-bold text-indigo-800">{text({ id: 'Lihat riwayat hidup', zh: '查看生命歷史' ,en: 'View life history' })}</button></li>)}</ul>
    </div>}
  </section>
  </>
}

function RecipientTypeMenu({ value, open, onToggle, onChange, text }: { value: CareRecipientType; open: boolean; onToggle: () => void; onChange: (type: CareRecipientType) => void; text: (value: LocalizedText) => string }) {
  const options: Array<{ type: CareRecipientType; icon: ReactNode; label: string }> = [
    { type: 'cat', icon: <RecipientTypeIcon type="cat" />, label: text({ id: 'Kucing', zh: '貓' ,en: 'Cat' }) },
    { type: 'dog', icon: <RecipientTypeIcon type="dog" />, label: text({ id: 'Anjing', zh: '狗' ,en: 'Dog' }) },
    { type: 'bird', icon: <RecipientTypeIcon type="bird" />, label: text({ id: 'Burung', zh: '鳥' ,en: "Bird" }) },
    { type: 'other', icon: <RecipientTypeIcon type="other" />, label: text({ id: 'Lainnya', zh: '其他' ,en: "Other" }) },
  ]
  const selected = options.find(option => option.type === value) ?? options[0]

  return <div className="relative">
    <p className="text-sm font-bold text-gray-800">{text({ id: 'Jenis', zh: '類型' ,en: 'Type' })}</p>
    {/* 保留單列 menu 的簡潔操作，同時避開原生 select 對 SVG 圖示的限制，讓狗選項確實使用猛膩黑狗。 */}
    <button type="button" aria-haspopup="listbox" aria-expanded={open} onClick={onToggle} className="mt-1 flex min-h-11 w-full items-center justify-between rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-left text-sm font-semibold text-gray-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600">
      <span className="inline-flex items-center gap-2">{selected.icon}{selected.label}</span><span aria-hidden="true" className="text-gray-500">⌄</span>
    </button>
    {open && <div role="listbox" aria-label={text({ id: 'Jenis penerima perawatan', zh: '照護對象類型' ,en: 'Subject Type of Care' })} onKeyDown={event => { if (event.key === 'Escape') onToggle() }} className="absolute z-20 mt-1 w-full overflow-hidden rounded-xl border border-indigo-200 bg-white py-1 shadow-lg">
      {options.map(option => <button key={option.type} type="button" role="option" aria-selected={value === option.type} onClick={() => onChange(option.type)} className={`flex min-h-11 w-full items-center gap-2 px-3 py-2.5 text-left text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-600 ${value === option.type ? 'bg-indigo-50 text-indigo-950' : 'text-gray-700 hover:bg-gray-50'}`}>{option.icon}{option.label}</button>)}
    </div>}
  </div>
}

function RecipientTypeIcon({ type }: { type: CareRecipientType }) {
  // 每種圖示共用同一個 20px 視覺框；猛膩不再壓過其他選項，手機上也能一眼辨識。
  if (type === 'dog') return <MengniDogMark className="h-5 w-6 shrink-0" />
  if (type === 'cat') return <MengniCatMark className="h-5 w-6 shrink-0" />
  if (type === 'bird') return <PickleBirdMark className="h-5 w-6 shrink-0" />
  // 保留舊兔子資料的呈現，不讓改版後的歷史清單退回沒有辨識度的爪印。
  if (type === 'rabbit') return <MengniRabbitMark className="h-5 w-6 shrink-0" />
  const emoji = type === 'human' ? '👤' : '🐾'
  return <span aria-hidden="true" className="inline-flex h-5 w-6 shrink-0 items-center justify-center text-xl leading-none">{emoji}</span>
}
