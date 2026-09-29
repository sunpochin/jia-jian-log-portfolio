/*
檔案用途：管理被照顧者（patient）與照護者（caregiver）待處理邀請的讀取狀態與解析流程，
並在確認沒有待接受邀請時觸發個人 patient 的 auto-provision。
所在層：src/hooks；封裝 App.tsx 原本內嵌的邀請相關 state 與 effect，不直接渲染畫面。
主要關聯：由 App.tsx 呼叫；依賴 lib/caregiverInvitations、lib/tenant 的邀請查詢函式，
以及 useAuth() 回傳的 refreshIdentity。
*/
import { useEffect, useRef, useState } from 'react'
import { fetchPendingCaregiverInvitations, getCaregiverInvitationsRequiringRequest, type PendingCaregiverInvitation } from '../lib/caregiverInvitations'
import { fetchPendingPatientCareInvitations, type PatientCareInvitation } from '../lib/tenant'

interface UseInvitationHandlingParams {
  isDemoMode: boolean
  userEmail: string | null | undefined
  healthConsentStatus: 'idle' | 'loading' | 'required' | 'ready'
  subject: string | null
  refreshIdentity: (force?: boolean) => Promise<void>
}

export function useInvitationHandling({ isDemoMode, userEmail, healthConsentStatus, subject, refreshIdentity }: UseInvitationHandlingParams) {
  const [pendingPatientInvitations, setPendingPatientInvitations] = useState<PatientCareInvitation[] | null>(null)
  const [pendingCaregiverInvitations, setPendingCaregiverInvitations] = useState<PendingCaregiverInvitation[]>([])
  const [patientInvitationLoadError, setPatientInvitationLoadError] = useState(false)
  const [patientInvitationLoadAttempt, setPatientInvitationLoadAttempt] = useState(0)
  const autoProvisionAttemptedEmailRef = useRef<string | null>(null)

  useEffect(() => {
    if (isDemoMode || !userEmail || healthConsentStatus !== 'ready') {
      setPendingPatientInvitations([])
      setPatientInvitationLoadError(false)
      return
    }
    let cancelled = false
    setPendingPatientInvitations(null)
    setPatientInvitationLoadError(false)
    void fetchPendingPatientCareInvitations()
      .then(invitations => { if (!cancelled) setPendingPatientInvitations(invitations) })
      .catch(error => {
        console.error('[patient invitation load error]', error)
        // 查詢失敗不能當成「沒有邀請」，否則 auto-provision 會建立錯的 patient，讓真正邀請無法接受。
        if (!cancelled) setPatientInvitationLoadError(true)
      })
    return () => { cancelled = true }
  }, [healthConsentStatus, isDemoMode, patientInvitationLoadAttempt, userEmail])

  useEffect(() => {
    if (isDemoMode || !userEmail || healthConsentStatus !== 'ready') {
      setPendingCaregiverInvitations([])
      return
    }
    let cancelled = false
    void fetchPendingCaregiverInvitations()
      .then(invitations => { if (!cancelled) setPendingCaregiverInvitations(invitations) })
      .catch(error => {
        // 邀請讀取失敗不能阻擋既有照護流程；RPC 仍會在 owner／受邀者操作時重新驗證。
        console.error('[caregiver invitation load error]', error)
        if (!cancelled) setPendingCaregiverInvitations([])
      })
    return () => { cancelled = true }
  }, [healthConsentStatus, isDemoMode, userEmail])

  useEffect(() => {
    if (isDemoMode || !userEmail || healthConsentStatus !== 'ready' || patientInvitationLoadError || pendingPatientInvitations === null || pendingPatientInvitations.length > 0 || subject) return
    // /patient-invite 仍在解析分享 token 時不能先建立 personal patient；否則失效連結會吃掉之後可用的本人邀請 email。
    if (window.location.pathname === '/patient-invite') return
    if (autoProvisionAttemptedEmailRef.current === userEmail) return
    // 沒有待接受邀請才建立個人 patient；先前先 provision 會讓被照顧者錯過邀請並誤建另一個家庭。
    autoProvisionAttemptedEmailRef.current = userEmail
    void refreshIdentity(true)
  }, [healthConsentStatus, isDemoMode, patientInvitationLoadError, pendingPatientInvitations, refreshIdentity, subject, userEmail])

  const handlePatientInvitationResolved = async (resolvedInvitationId: string, accepted: boolean) => {
    // 多個家庭可能同時送邀請；只移除已處理的一封，拒絕時才不會誤建身分並吞掉其餘邀請。
    setPendingPatientInvitations(current => current?.filter(invitation => invitation.invitation_id !== resolvedInvitationId) ?? null)
    if (accepted) await refreshIdentity(false)
  }

  const caregiverInvitationsRequiringRequest = getCaregiverInvitationsRequiringRequest(pendingCaregiverInvitations)

  return {
    pendingPatientInvitations,
    pendingCaregiverInvitations,
    setPendingCaregiverInvitations,
    patientInvitationLoadError,
    setPatientInvitationLoadAttempt,
    handlePatientInvitationResolved,
    caregiverInvitationsRequiringRequest,
  }
}
