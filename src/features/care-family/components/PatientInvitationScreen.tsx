/*
檔案用途：讓登入後的被照顧者查看並明確接受或拒絕家庭照護邀請。
所在層：src/features/care-family；在尚未建立 patient profile 時由 App.tsx 顯示。
主要關聯：透過 tenant 的 invitation RPC 取得邀請，接受後由 App 重新載入 patient 與 care_access。
*/
import { useState } from 'react'
import { useI18n } from '../../../lib/i18n'
import { acceptPatientCareInvitation, declinePatientCareInvitation, type PatientCareInvitation } from '../../../lib/tenant'
import { signOut } from '../../../lib/auth'

interface PatientInvitationScreenProps {
  invitations: PatientCareInvitation[]
  loadFailed?: boolean
  onRetry?: () => void
  onResolved: (invitationId: string, accepted: boolean) => Promise<void>
}

export function PatientInvitationScreen({ invitations, loadFailed = false, onRetry, onResolved }: PatientInvitationScreenProps) {
  const { text } = useI18n()
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState('')

  const resolve = async (invitation: PatientCareInvitation, accepted: boolean) => {
    setBusyId(invitation.invitation_id)
    setError('')
    try {
      if (accepted) await acceptPatientCareInvitation(invitation.invitation_id)
      else await declinePatientCareInvitation(invitation.invitation_id)
      // 接受後才會出現 patient profile；必須等 RPC 完成再重讀，避免畫面短暫沿用未授權狀態。
      await onResolved(invitation.invitation_id, accepted)
    } catch (cause) {
      console.error('[patient invitation resolution error]', cause)
      // 這個畫面是登入後的授權邊界；三種語言都要是完整句子，避免混語讓使用者誤判安全操作。
      setError(text({ id: 'Undangan belum dapat diproses. Coba lagi.', zh: '邀請暫時無法處理，請再試一次。', en: 'The invitation could not be processed. Try again.' }))
    } finally {
      setBusyId(null)
    }
  }

  return <main className="mx-auto flex min-h-dvh max-w-md flex-col bg-gray-50 px-5 py-10 text-gray-900">
    <header className="flex items-start justify-between">
      <div>
        <p className="text-sm font-bold text-indigo-700">{text({ id: 'Undangan perawatan', zh: '照護邀請', en: 'Invitation to care' })}</p>
        {/* 英文要明確表達受邀者正在授權他人存取自己的資料，避免把授權方向寫反。 */}
        <h1 className="mt-2 text-2xl font-black">{text({ id: 'Konfirmasi akses data Anda', zh: '確認你的資料照護授權', en: 'Confirm access to your data' })}</h1>
      </div>
      <button type="button" onClick={() => void signOut()} className="rounded-lg px-2 py-1 text-xs text-gray-500">{text({ id: 'Keluar', zh: '登出', en: 'Sign out' })}</button>
    </header>
    <p className="mt-3 text-sm leading-6 text-gray-700">{text({ id: 'Periksa siapa yang meminta akses dan dasar kewenangannya. Tidak ada catatan kesehatan yang dibagikan sebelum Anda menerima.', zh: '請確認邀請內容與授權依據；你接受前，不會分享任何健康紀錄。', en: 'Review who requested access and the authorization basis. No health records are shared before you accept.' })}</p>
    {loadFailed && <section className="mt-6 rounded-3xl bg-white p-5 shadow-sm">
      <p role="alert" className="text-sm leading-6 text-red-700">{text({ id: 'Undangan belum dapat dimuat. Kami tidak akan membuat profil pasien baru sampai pemeriksaan berhasil.', zh: '暫時無法讀取邀請；確認完成前，系統不會建立新的病人資料。', en: 'The invitation could not be read at this time; no new patient data will be created until the confirmation is complete.' })}</p>
      <button type="button" onClick={onRetry} className="mt-4 w-full rounded-xl bg-indigo-700 px-3 py-3 text-sm font-bold text-white">{text({ id: 'Coba lagi', zh: '再試一次', en: 'Try again' })}</button>
    </section>}
    <section className="mt-6 space-y-4">
      {invitations.map(invitation => <article key={invitation.invitation_id} className="rounded-3xl bg-white p-5 shadow-sm">
        <h2 className="text-lg font-black text-indigo-950">{invitation.display_name}</h2>
        <p className="mt-2 break-all text-sm font-bold text-gray-800">{text({ id: 'Diminta oleh:', zh: '邀請人：', en: 'Requested by:' })} {invitation.inviter_display_name ? `${invitation.inviter_display_name} · ` : ''}{invitation.inviter_email}</p>
        <p className="mt-2 text-sm text-gray-700">{text({ id: 'Dasar kewenangan:', zh: '授權依據：', en: 'Authorized by:' })} {invitation.authorization_basis}</p>
        <div className="mt-5 grid grid-cols-2 gap-2">
          <button type="button" disabled={busyId !== null} onClick={() => void resolve(invitation, false)} className="rounded-xl border border-gray-300 px-3 py-3 text-sm font-bold text-gray-700 disabled:opacity-60">{text({ id: 'Tolak', zh: '拒絕', en: 'Reject' })}</button>
          <button type="button" disabled={busyId !== null} onClick={() => void resolve(invitation, true)} className="rounded-xl bg-indigo-700 px-3 py-3 text-sm font-bold text-white disabled:opacity-60">{busyId === invitation.invitation_id ? text({ id: 'Memproses…', zh: '處理中…', en: 'Processing…' }) : text({ id: 'Terima', zh: '接受', en: 'Accept' })}</button>
        </div>
      </article>)}
    </section>
    {error && <p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
  </main>
}
