/*
檔案用途：承接被照顧者本人邀請的分享連結，登入後回到既有 email 綁定同意流程。
所在層：src/features/care-family/pages；由 App.tsx 的 /patient-invite 路由載入。
主要關聯：GoogleSignInButton、caregiverInvitations token 暫存，以及既有 patient_care_invitation RPC。
*/
import { useEffect, useRef, useState } from 'react'
import { LoginScreen } from '../../../components/auth/LoginScreen'
import { signOut } from '../../../lib/auth'
import { useI18n } from '../../../lib/i18n'
import { capturePatientInvitationToken, claimPatientInvitationShare, clearStoredPatientInvitationToken, readStoredPatientInvitationToken } from '../../../lib/caregiverInvitations'

export function PatientInvitationJoinPage({ userEmail }: { userEmail?: string }) {
  const { text } = useI18n()
  const tokenRef = useRef<string | null>(null)
  const [state, setState] = useState<'idle' | 'checking' | 'ready' | 'error'>('idle')

  useEffect(() => {
    // 先暫存 fragment 再交給登入頁；Google 登入重新載入後，連結仍能回到原本的本人邀請。
    tokenRef.current = capturePatientInvitationToken()
  }, [])

  useEffect(() => {
    if (!userEmail || state !== 'idle') return
    const token = tokenRef.current ?? readStoredPatientInvitationToken()
    if (!token) { setState('error'); return }
    let cancelled = false
    setState('checking')
    void claimPatientInvitationShare(token)
      .then(() => {
        if (cancelled) return
        clearStoredPatientInvitationToken()
        // claim 不接受邀請；回首頁後仍由既有 fetch_pending／PatientInvitationScreen 顯示同意內容。
        setState('ready')
        window.location.assign('/')
      })
      .catch(error => {
        console.error('[patient invitation share claim error]', error)
        if (!cancelled) setState('error')
      })
    return () => { cancelled = true }
  }, [state, userEmail])

  if (!userEmail) return <LoginScreen showDemo={false} />

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col bg-gray-50 px-5 py-10 text-gray-900">
      <header className="flex items-start justify-between">
        <div>
          <p className="text-sm font-bold text-emerald-700">{text({ id: 'Undangan pasien', zh: '被照顧者邀請', en: 'Patient invitation' })}</p>
          <h1 className="mt-2 text-2xl font-black">{text({ id: 'Periksa undangan Anda', zh: '查看你的邀請', en: 'Review your invitation' })}</h1>
        </div>
        <button type="button" onClick={() => void signOut()} className="rounded-lg px-2 py-1 text-xs text-gray-500">{text({ id: 'Keluar', zh: '登出', en: 'Sign out' })}</button>
      </header>

      {state === 'checking' && <p role="status" className="mt-6 rounded-2xl bg-white p-5 text-sm leading-6 text-gray-700">{text({ id: 'Memeriksa tautan undangan…', zh: '正在檢查邀請連結…', en: 'Checking the invitation link…' })}</p>}
      {state === 'ready' && <p role="status" className="mt-6 rounded-2xl bg-white p-5 text-sm leading-6 text-gray-700">{text({ id: 'Mengalihkan ke halaman konfirmasi…', zh: '正在前往邀請確認頁面…', en: 'Redirecting to the confirmation page…' })}</p>}
      {state === 'error' && <section className="mt-6 rounded-2xl bg-white p-5 shadow-sm">
        <p role="alert" className="text-sm leading-6 text-red-700">{text({ id: 'Tautan ini tidak valid, sudah kedaluwarsa, atau bukan untuk akun Google ini. Minta pengelola keluarga membuat tautan baru.', zh: '這個邀請連結無效、已過期，或不屬於這個 Google 帳號；請家庭管理者重新建立邀請。', en: 'This link is invalid, expired, or not for this Google account. Ask the family owner to create a new invitation.' })}</p>
      </section>}
    </main>
  )
}
