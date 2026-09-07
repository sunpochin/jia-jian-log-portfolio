/*
檔案用途：承接家人照護邀請連結，讓登入者提出加入申請並等待 owner 確認。
所在層：src/features/care-family/pages；由 App.tsx 的 /join 路由載入。
主要關聯：GoogleSignInButton、caregiverInvitations token 暫存，以及 request_caregiver_invitation RPC。
*/
import { useEffect, useRef, useState } from 'react'
import { LoginScreen } from '../../../components/auth/LoginScreen'
import { signOut } from '../../../lib/auth'
import { useI18n } from '../../../lib/i18n'
import {
  captureCaregiverInvitationToken,
  clearStoredCaregiverInvitationToken,
  readStoredCaregiverInvitationToken,
  requestCaregiverInvitation,
} from '../../../lib/caregiverInvitations'

export function CaregiverInvitationJoinPage({ userEmail }: { userEmail?: string }) {
  const { text } = useI18n()
  const tokenRef = useRef<string | null>(null)
  const [state, setState] = useState<'idle' | 'requesting' | 'requested' | 'error'>('idle')

  useEffect(() => {
    // 先把 fragment 移入 sessionStorage 再交給登入頁，避免 GIS 成功後回到根路徑時遺失邀請。
    tokenRef.current = captureCaregiverInvitationToken()
  }, [])

  useEffect(() => {
    if (!userEmail || state !== 'idle') return
    const token = tokenRef.current ?? readStoredCaregiverInvitationToken()
    if (!token) { setState('error'); return }
    let cancelled = false
    setState('requesting')
    void requestCaregiverInvitation(token)
      .then(() => {
        if (!cancelled) {
          clearStoredCaregiverInvitationToken()
          setState('requested')
        }
      })
      .catch(error => {
        // 不把 token 是否存在、邀請狀態或病人資訊回傳給未完成確認的登入者。
        console.error('[caregiver invitation request error]', error)
        if (!cancelled) setState('error')
      })
    return () => { cancelled = true }
  }, [state, userEmail])

  if (!userEmail) return <LoginScreen showDemo={false} />

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col bg-gray-50 px-5 py-10 text-gray-900">
      <header className="flex items-start justify-between">
        <div>
          <p className="text-sm font-bold text-indigo-700">{text({ id: 'Undangan perawatan keluarga', zh: '家庭照護邀請', en: 'Family care invitation' })}</p>
          <h1 className="mt-2 text-2xl font-black">{text({ id: 'Ajukan untuk bergabung', zh: '申請加入照護', en: 'Request to join care' })}</h1>
        </div>
        <button type="button" onClick={() => void signOut()} className="rounded-lg px-2 py-1 text-xs text-gray-500">{text({ id: 'Keluar', zh: '登出', en: 'Sign out' })}</button>
      </header>

      {state === 'requesting' && <p role="status" className="mt-6 rounded-2xl bg-white p-5 text-sm leading-6 text-gray-700">{text({ id: 'Memeriksa undangan dan mengirim permintaan…', zh: '正在檢查邀請並送出加入申請…', en: 'Checking the invitation and sending your request…' })}</p>}
      {state === 'requested' && <section className="mt-6 rounded-2xl bg-white p-5 shadow-sm">
        <p role="status" className="text-sm leading-6 text-gray-700">{text({ id: 'Permintaan Anda sudah dikirim. Pengelola keluarga harus memeriksa akun Google ini dan mengonfirmasi izin. Anda belum dapat melihat catatan kesehatan.', zh: '你的申請已送出。家庭管理者需要確認這個 Google 帳號與權限；目前你還看不到任何健康紀錄。', en: 'Your request was sent. The family owner must review this Google account and approve permissions. You cannot see health records yet.' })}</p>
        <p className="mt-3 break-all text-xs text-gray-500">{userEmail}</p>
      </section>}
      {state === 'error' && <section className="mt-6 rounded-2xl bg-white p-5 shadow-sm">
        <p role="alert" className="text-sm leading-6 text-red-700">{text({ id: 'Tautan ini tidak valid, sudah kedaluwarsa, atau sudah digunakan. Minta pengelola keluarga membuat tautan baru.', zh: '這個邀請連結無效、已過期或已使用；請家庭管理者重新建立邀請。', en: 'This link is invalid, expired, or already used. Ask the family owner to create a new invitation.' })}</p>
      </section>}
    </main>
  )
}
