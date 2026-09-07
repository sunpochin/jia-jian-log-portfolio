/*
檔案用途：讓家庭 owner 為單一病人建立、分享、確認或撤銷家人照護邀請。
所在層：src/features/care-family/components；由設定頁載入的 owner 管理區塊。
主要關聯：caregiverInvitations 轉接層、fetch_household_management_patients 與 care_access RPC。
*/
import { useEffect, useState } from 'react'
import { useI18n, type LocalizedText, type Locale } from '../../../lib/i18n'
import { useConfirm } from '../../../hooks/useConfirm'
import { describeSaveError } from '../../../lib/dataErrors'
import { fetchHouseholdManagementPatients, type ManagedPatient } from '../../../lib/tenant'
import {
  approveCaregiverInvitation,
  buildCaregiverInvitationUrl,
  caregiverInvitationShareText,
  createCaregiverInvitationWithEmail,
  fetchCaregiverInvitations,
  revokeCaregiverAccess,
  revokeCaregiverInvitation,
  type CaregiverInvitation,
} from '../../../lib/caregiverInvitations'

type CreatedInvite = { invitationId: string; url: string; expiresAt: string; invitedEmail: string; emailStatus: 'sent' | 'not_configured' | 'failed' }

function formatDate(iso: string, locale: Locale): string {
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString(locale === 'zh' ? 'zh-TW' : locale === 'id' ? 'id-ID' : 'en-US')
}

function statusText(status: CaregiverInvitation['status']): LocalizedText {
  if (status === 'pending') return { id: 'Menunggu login', zh: '等待對方登入', en: 'Waiting for sign-in' }
  if (status === 'requested') return { id: 'Menunggu konfirmasi', zh: '等待管理者確認', en: 'Waiting for owner approval' }
  if (status === 'accepted') return { id: 'Akses aktif', zh: '已加入照護', en: 'Care access active' }
  if (status === 'revoked') return { id: 'Dicabut', zh: '已撤銷', en: 'Revoked' }
  return { id: 'Kedaluwarsa', zh: '已過期', en: 'Expired' }
}

function invitationStatusText(invitation: CaregiverInvitation): LocalizedText {
  if (invitation.status === 'accepted' && !invitation.accessActive) return { id: 'Akses dicabut', zh: '病人權限已撤銷', en: 'Patient access revoked' }
  return statusText(invitation.status)
}

export function CaregiverInvitationManagement({ isDemoMode }: { isDemoMode: boolean }) {
  const { text, locale } = useI18n()
  const { confirm, dialog: confirmDialog } = useConfirm()
  const [patients, setPatients] = useState<ManagedPatient[]>([])
  const [invitations, setInvitations] = useState<CaregiverInvitation[]>([])
  const [selectedPatientId, setSelectedPatientId] = useState('')
  const [invitedEmail, setInvitedEmail] = useState('')
  const [canRecord, setCanRecord] = useState(false)
  const [canManageMedication, setCanManageMedication] = useState(false)
  const [createdInvite, setCreatedInvite] = useState<CreatedInvite | null>(null)
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const reload = async () => {
    setLoading(true)
    try {
      const [nextPatients, nextInvitations] = await Promise.all([fetchHouseholdManagementPatients(), fetchCaregiverInvitations()])
      setPatients(nextPatients)
      setInvitations(nextInvitations)
      setSelectedPatientId(current => current || nextPatients[0]?.patient_id || '')
    } catch (error) {
      // RPC 失敗時整段隱藏；owner 權限不能靠 UI 假設，且錯誤細節不應洩漏家庭資料。
      console.error('[caregiver invitation management authorization error]', error)
      setPatients([])
      setInvitations([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (isDemoMode) { setLoading(false); return }
    void reload()
  }, [isDemoMode])

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!selectedPatientId) return
    setSaving(true)
    setMessage('')
    setCreatedInvite(null)
    try {
      const created = await createCaregiverInvitationWithEmail(selectedPatientId, invitedEmail, canRecord, canManageMedication)
      setCreatedInvite({ invitationId: created.invitationId, url: buildCaregiverInvitationUrl(window.location.origin, created.token), expiresAt: created.expiresAt, invitedEmail: created.invitedEmail ?? invitedEmail.trim().toLowerCase(), emailStatus: created.emailStatus ?? 'not_configured' })
      setInvitedEmail('')
      await reload()
    } catch (error) {
      console.error('[create caregiver invitation error]', error)
      setMessage(text(describeSaveError(error, { id: 'Undangan tidak dapat dibuat.', zh: '無法建立家人照護邀請。', en: 'Unable to create the family care invitation.' })))
    } finally {
      setSaving(false)
    }
  }

  const copyInvite = async (url: string) => {
    if (!navigator.clipboard) {
      setMessage(text({ id: 'Salin manual tautan di kotak bawah.', zh: '請用下方連結欄位手動複製。', en: 'Copy the link manually from the field below.' }))
      return
    }
    try {
      await navigator.clipboard.writeText(url)
      setMessage(text({ id: 'Tautan disalin.', zh: '已複製邀請連結。', en: 'Invitation link copied.' }))
    } catch {
      // 剪貼簿權限可能被瀏覽器拒絕；不能顯示成功，保留 readOnly 欄位作人工退路。
      setMessage(text({ id: 'Tidak dapat menyalin. Tekan lama tautan untuk menyalin.', zh: '無法自動複製，請長按下方連結手動複製。', en: 'Unable to copy automatically. Press and hold the link to copy it.' }))
    }
  }

  const shareInvite = (url: string) => {
    if (!navigator.share) {
      setMessage(text({ id: 'Berbagi sistem tidak tersedia; gunakan Salin tautan.', zh: '此瀏覽器不支援系統分享，請使用「複製連結」。', en: 'System sharing is unavailable; use Copy link.' }))
      return
    }
    // 這個 handler 沒有先 await；保留 user gesture，iOS／Android 才不會把 navigator.share 拒絕。
    void navigator.share({ title: text({ id: 'Undangan perawatan keluarga', zh: '家庭照護邀請', en: 'Family care invitation' }), text: caregiverInvitationShareText(locale, url) }).catch(error => {
      if (error instanceof DOMException && error.name === 'AbortError') return
      setMessage(text({ id: 'Berbagi dibatalkan atau gagal. Gunakan Salin tautan.', zh: '分享被取消或失敗，請改用「複製連結」。', en: 'Sharing was cancelled or failed. Use Copy link.' }))
    })
  }

  const handleApprove = async (invitationId: string) => {
    setSaving(true)
    try {
      await approveCaregiverInvitation(invitationId)
      await reload()
      setMessage(text({ id: 'Akses caregiver telah diaktifkan.', zh: '已確認並開通家人照護權限。', en: 'Caregiver access is now active.' }))
    } catch (error) {
      console.error('[approve caregiver invitation error]', error)
      setMessage(text(describeSaveError(error, { id: 'Undangan tidak dapat dikonfirmasi.', zh: '無法確認家人照護邀請。', en: 'Unable to approve the family care invitation.' })))
    } finally {
      setSaving(false)
    }
  }

  const handleRevokeInvitation = async (invitationId: string) => {
    if (!(await confirm(text({ id: 'Cabut undangan yang belum diterima?', zh: '確定撤銷尚未加入的邀請嗎？', en: 'Revoke this invitation before it is accepted?' }), { danger: true }))) return
    setSaving(true)
    try {
      await revokeCaregiverInvitation(invitationId)
      await reload()
    } catch (error) {
      console.error('[revoke caregiver invitation error]', error)
      setMessage(text(describeSaveError(error, { id: 'Undangan tidak dapat dicabut.', zh: '無法撤銷邀請。', en: 'Unable to revoke the invitation.' })))
    } finally {
      setSaving(false)
    }
  }

  const handleRevokeAccess = async (invitation: CaregiverInvitation) => {
    if (!invitation.requestedEmail) return
    if (!(await confirm(text({ id: 'Cabut akses caregiver untuk pasien ini?', zh: '確定撤銷這位家人對此病人的照護權限嗎？', en: 'Revoke this caregiver’s access to this patient?' }), { danger: true }))) return
    setSaving(true)
    try {
      await revokeCaregiverAccess(invitation.patientId, invitation.requestedEmail)
      await reload()
      setMessage(text({ id: 'Akses pasien telah dicabut.', zh: '已撤銷對此病人的照護權限。', en: 'Patient access has been revoked.' }))
    } catch (error) {
      console.error('[revoke caregiver access error]', error)
      setMessage(text(describeSaveError(error, { id: 'Akses tidak dapat dicabut.', zh: '無法撤銷照護權限。', en: 'Unable to revoke care access.' })))
    } finally {
      setSaving(false)
    }
  }

  if (isDemoMode || loading || patients.length === 0) return null

  return (
    <section className="mt-6 rounded-2xl border border-indigo-100 bg-indigo-50/50 p-4">
      {confirmDialog}
      <h2 className="font-bold text-gray-900">{text({ id: 'Undang keluarga untuk merawat', zh: '邀請家人一起照護', en: 'Invite family to help with care' })}</h2>
      <p className="mt-1 text-sm text-gray-600">
        {text({ id: 'Pilih satu pasien, email Google penerima, dan izin yang diperlukan. Penerima dapat melihat undangan setelah masuk; Anda tetap mengonfirmasi sebelum akses dibuka.', zh: '選一位病人、對方的 Google Email 與需要的權限。對方登入後會看到邀請；仍須由你確認後才會開通權限。', en: 'Choose a patient, the recipient’s Google email, and the needed permissions. The recipient can see the invitation after signing in; you still approve before access opens.' })}
      </p>

      <form onSubmit={handleCreate} className="mt-4 space-y-3 rounded-xl bg-white p-3">
        <label className="block text-xs font-bold text-gray-700">
          {text({ id: 'Pasien yang dirawat', zh: '要照護的病人', en: 'Patient to care for' })}
          <select required value={selectedPatientId} onChange={event => setSelectedPatientId(event.target.value)} className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm">
            {patients.map(patient => <option key={patient.patient_id} value={patient.patient_id}>{patient.display_name}</option>)}
          </select>
        </label>
        <label className="block text-xs font-bold text-gray-700">
          {text({ id: 'Email Google penerima', zh: '受邀者 Google Email', en: 'Recipient Google email' })}
          <input required type="email" value={invitedEmail} onChange={event => setInvitedEmail(event.target.value)} placeholder="contoh@gmail.com" className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm" />
        </label>
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input type="checkbox" checked={canRecord} onChange={event => setCanRecord(event.target.checked)} />
          {text({ id: 'Boleh mencatat tekanan darah, suhu, dan obat', zh: '可記錄血壓、體溫與服藥', en: 'Can record blood pressure, temperature, and medication' })}
        </label>
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input type="checkbox" checked={canManageMedication} onChange={event => setCanManageMedication(event.target.checked)} />
          {text({ id: 'Boleh mengubah rencana obat', zh: '可調整藥單（獨立權限，預設關閉）', en: 'Can change the medication plan (separate permission, off by default)' })}
        </label>
        <p className="text-xs text-gray-500">{text({ id: 'Akses lihat data diberikan setelah Anda mengonfirmasi, tetapi izin catat dan obat tetap terpisah.', zh: '你確認後才會開通查看資料；記錄與藥單權限彼此分開。', en: 'View access starts after you approve, while recording and medication permissions remain separate.' })}</p>
        <button type="submit" disabled={saving} className="w-full rounded-xl bg-indigo-700 px-3 py-2 text-sm font-bold text-white disabled:opacity-60">
          {saving ? text({ id: 'Mengirim…', zh: '送出中…', en: 'Sending…' }) : text({ id: 'Kirim undangan', zh: '送出邀請', en: 'Send invitation' })}
        </button>
      </form>

      {createdInvite && (
        <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
          <p className="text-xs font-bold text-amber-900">{text({ id: 'Bagikan sekarang. Tautan ini hanya ditampilkan sekali.', zh: '請現在分享；這個連結只在此顯示一次。', en: 'Share now. This link is shown only once.' })}</p>
          <p className="mt-1 text-xs text-amber-800">{createdInvite.emailStatus === 'sent'
            ? text({ id: `Email undangan dikirim ke ${createdInvite.invitedEmail}.`, zh: `邀請 email 已寄到 ${createdInvite.invitedEmail}。`, en: `Invitation email sent to ${createdInvite.invitedEmail}.` })
            : createdInvite.emailStatus === 'not_configured'
              ? text({ id: `Email belum dikonfigurasi. Kirim tautan ini secara manual ke ${createdInvite.invitedEmail}.`, zh: `尚未設定寄信服務，請手動把連結傳給 ${createdInvite.invitedEmail}。`, en: `Email delivery is not configured. Send this link manually to ${createdInvite.invitedEmail}.` })
              : text({ id: `Email gagal dikirim. Kirim tautan ini secara manual ke ${createdInvite.invitedEmail}.`, zh: `邀請 email 寄送失敗，請手動把連結傳給 ${createdInvite.invitedEmail}。`, en: `Email delivery failed. Send this link manually to ${createdInvite.invitedEmail}.` })}</p>
          <p className="mt-1 text-xs text-amber-800">{text({ id: 'Berlaku hingga', zh: '有效至', en: 'Valid until' })} {formatDate(createdInvite.expiresAt, locale)}</p>
          <input readOnly value={createdInvite.url} onFocus={event => event.currentTarget.select()} aria-label={text({ id: 'Tautan undangan', zh: '邀請連結', en: 'Invitation link' })} className="mt-2 w-full rounded-lg border border-amber-300 bg-white px-2 py-2 text-xs text-gray-700" />
          <div className="mt-2 grid grid-cols-2 gap-2">
            <button type="button" onClick={() => shareInvite(createdInvite.url)} className="rounded-lg bg-indigo-700 px-2 py-2 text-xs font-bold text-white">{text({ id: 'Bagikan', zh: '系統分享', en: 'Share' })}</button>
            <button type="button" onClick={() => void copyInvite(createdInvite.url)} className="rounded-lg bg-white px-2 py-2 text-xs font-bold text-indigo-700">{text({ id: 'Salin tautan', zh: '複製連結', en: 'Copy link' })}</button>
          </div>
        </div>
      )}

      <div className="mt-4 border-t border-indigo-100 pt-3">
        <h3 className="text-sm font-bold text-gray-800">{text({ id: 'Status undangan', zh: '邀請狀態', en: 'Invitation status' })}</h3>
        <ul className="mt-2 space-y-2">
          {invitations.map(invitation => (
            <li key={invitation.invitationId} className="rounded-xl bg-white p-3 text-xs text-gray-700">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-bold">{invitation.patientDisplayName}</p>
                  <p className="mt-0.5">{text(invitationStatusText(invitation))}{invitation.requestedEmail || invitation.invitedEmail ? ` · ${invitation.requestedEmail || invitation.invitedEmail}` : ''}</p>
                  <p className="mt-0.5 text-gray-500">{text({ id: 'Berlaku hingga', zh: '有效至', en: 'Valid until' })} {formatDate(invitation.expiresAt, locale)}</p>
                  <p className="mt-0.5 text-gray-500">{text({ id: 'Izin: lihat', zh: '權限：查看', en: 'Permissions: view' })}{invitation.canRecord ? text({ id: '、catat', zh: '、記錄', en: ', record' }) : ''}{invitation.canManageMedication ? text({ id: '、obat', zh: '、藥單', en: ', medication' }) : ''}</p>
                </div>
                <span className="shrink-0 rounded-full bg-gray-100 px-2 py-1 font-semibold">{text(invitationStatusText(invitation))}</span>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {invitation.status === 'requested' && <button type="button" disabled={saving} onClick={() => void handleApprove(invitation.invitationId)} className="rounded-lg bg-green-700 px-2 py-1.5 font-bold text-white disabled:opacity-60">{text({ id: 'Konfirmasi akun', zh: '確認帳號並加入', en: 'Approve account and add' })}</button>}
                {(invitation.status === 'pending' || invitation.status === 'requested') && <button type="button" disabled={saving} onClick={() => void handleRevokeInvitation(invitation.invitationId)} className="rounded-lg border border-red-200 px-2 py-1.5 font-bold text-red-600 disabled:opacity-60">{text({ id: 'Cabut undangan', zh: '撤銷邀請', en: 'Revoke invitation' })}</button>}
                {invitation.status === 'accepted' && invitation.accessActive && invitation.requestedEmail && <button type="button" disabled={saving} onClick={() => void handleRevokeAccess(invitation)} className="rounded-lg border border-red-200 px-2 py-1.5 font-bold text-red-600 disabled:opacity-60">{text({ id: 'Cabut akses pasien', zh: '撤銷此病人權限', en: 'Revoke patient access' })}</button>}
              </div>
            </li>
          ))}
        </ul>
        {invitations.length === 0 && <p className="mt-2 text-xs text-gray-500">{text({ id: 'Belum ada undangan.', zh: '目前沒有邀請。', en: 'No invitations yet.' })}</p>}
      </div>

      {message && <p role="status" className="mt-3 text-xs font-semibold text-gray-700">{message}</p>}
    </section>
  )
}
