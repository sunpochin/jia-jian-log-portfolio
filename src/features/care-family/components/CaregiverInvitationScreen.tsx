/*
檔案用途：讓指定的照護者在登入首頁看到並申請待處理的家庭邀請。
所在層：src/features/care-family/components；由 App.tsx 在一般照護頁之前顯示。
主要關聯：caregiverInvitations 轉接層、request_caregiver_invitation_by_id RPC 與 owner 管理清單。
*/
import { useState } from 'react'
import { useI18n } from '../../../lib/i18n'
import { requestPendingCaregiverInvitation, type PendingCaregiverInvitation } from '../../../lib/caregiverInvitations'
import { signOut } from '../../../lib/auth'

export function CaregiverInvitationScreen({ invitations, onRequested }: { invitations: PendingCaregiverInvitation[]; onRequested: (invitationId: string) => void }) {
  const { text } = useI18n()
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState('')

  const request = async (invitation: PendingCaregiverInvitation) => {
    setBusyId(invitation.invitationId)
    setError('')
    try {
      await requestPendingCaregiverInvitation(invitation.invitationId)
      onRequested(invitation.invitationId)
    } catch (cause) {
      console.error('[pending caregiver invitation request error]', cause)
      setError(text({ id: 'Undangan belum dapat diajukan. Coba lagi.', zh: '邀請暫時無法申請，請再試一次。', en: 'The invitation could not be requested. Try again.' }))
    } finally {
      setBusyId(null)
    }
  }

  return <main className="mx-auto flex min-h-dvh max-w-md flex-col bg-gray-50 px-5 py-10 text-gray-900">
    <header className="flex items-start justify-between">
      <div>
        <p className="text-sm font-bold text-indigo-700">{text({ id: 'Undangan perawatan', zh: '照護邀請', en: 'Care invitation' })}</p>
        <h1 className="mt-2 text-2xl font-black">{text({ id: 'Bergabung untuk membantu perawatan', zh: '加入家庭照護', en: 'Join family care' })}</h1>
      </div>
      <button type="button" onClick={() => void signOut()} className="rounded-lg px-2 py-1 text-xs text-gray-500">{text({ id: 'Keluar', zh: '登出', en: 'Sign out' })}</button>
    </header>
    <p className="mt-3 text-sm leading-6 text-gray-700">{text({ id: 'Periksa undangan ini. Anda belum dapat melihat catatan kesehatan; akses baru aktif setelah pemilik keluarga menyetujui.', zh: '請確認這些邀請。你目前看不到健康紀錄，必須等家庭管理者確認後才會開通。', en: 'Review these invitations. You cannot see health records yet; access starts only after the family owner approves.' })}</p>
    <section className="mt-6 space-y-4">
      {invitations.map(invitation => <article key={invitation.invitationId} className="rounded-3xl bg-white p-5 shadow-sm">
        <h2 className="text-lg font-black text-indigo-950">{invitation.patientDisplayName}</h2>
        <p className="mt-2 break-all text-sm text-gray-700">{text({ id: 'Email undangan:', zh: '受邀 Email：', en: 'Invited email:' })} {invitation.invitedEmail}</p>
        <p className="mt-2 text-sm text-gray-700">{text({ id: 'Izin setelah disetujui: lihat', zh: '確認後權限：查看', en: 'Permissions after approval: view' })}{invitation.canRecord ? text({ id: '、catat', zh: '、記錄', en: ', record' }) : ''}{invitation.canManageMedication ? text({ id: '、obat', zh: '、藥單', en: ', medication' }) : ''}</p>
        {invitation.status === 'requested'
          ? <p className="mt-5 rounded-xl bg-amber-50 p-3 text-sm font-bold text-amber-900">{text({ id: 'Permintaan dikirim. Tunggu pemilik keluarga menyetujui.', zh: '已送出申請，請等待家庭管理者確認。', en: 'Request sent. Wait for the family owner to approve it.' })}</p>
          : <button type="button" disabled={busyId !== null} onClick={() => void request(invitation)} className="mt-5 w-full rounded-xl bg-indigo-700 px-3 py-3 text-sm font-bold text-white disabled:opacity-60">{busyId === invitation.invitationId ? text({ id: 'Memproses…', zh: '處理中…', en: 'Processing…' }) : text({ id: 'Ajukan untuk bergabung', zh: '申請加入照護', en: 'Request to join' })}</button>}
      </article>)}
    </section>
    {error && <p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
  </main>
}
