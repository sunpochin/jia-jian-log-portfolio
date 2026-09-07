/*
檔案用途：管理 Supabase Auth 登入狀態並載入使用者的活躍與歷史照護對象存取權限。
所在層：src/hooks；為身份驗證與全域權限狀態 Hook。
主要關聯：由 App.tsx 呼叫，提供 user session、accessiblePatients (活躍對象) 與 allAccessiblePatients (全對象)。
*/
import { useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { profileForEmail, fetchDemoProfileIdentity, type PatientIdentity } from '../lib/auth'
import { supabase } from '../lib/supabase'
import { initializeNativeAuth } from '../lib/nativeAuth'

export function useAuth() {
  const [user, setUser] = useState<User | null>(null)
  const [isDemoMode, setIsDemoMode] = useState(() => typeof window !== 'undefined' && window.location.pathname === '/demo')
  const [ownPatientId, setOwnPatientId] = useState<string | null>(null)
  const [displayName, setDisplayName] = useState<string | null>(null)
  const [accessiblePatients, setAccessiblePatients] = useState<PatientIdentity[]>([])
  const [allAccessiblePatients, setAllAccessiblePatients] = useState<PatientIdentity[]>([])
  const [subject, setSubject] = useState<string | null>(null)
  const [accessibleSubjects, setAccessibleSubjects] = useState<string[]>([])
  const [allAccessibleSubjects, setAllAccessibleSubjects] = useState<string[]>([])
  const [patientIdsBySubject, setPatientIdsBySubject] = useState<Record<string, string>>({})
  const [medicationManagementPatients, setMedicationManagementPatients] = useState<PatientIdentity[]>([])
  const [isAdmin, setIsAdmin] = useState(false)
  const [loading, setLoading] = useState(true)
  const [identityLoading, setIdentityLoading] = useState(true)

  const applyDemoIdentity = () => {
    const demoProfile = fetchDemoProfileIdentity()
    setOwnPatientId(demoProfile.ownPatientId)
    setSubject(demoProfile.subject)
    setDisplayName(demoProfile.displayName)
    setAccessiblePatients(demoProfile.accessiblePatients)
    setAllAccessiblePatients(demoProfile.allAccessiblePatients)
    setAccessibleSubjects(demoProfile.accessibleSubjects)
    setAllAccessibleSubjects(demoProfile.allAccessibleSubjects)
    setPatientIdsBySubject(demoProfile.patientIdsBySubject)
    setMedicationManagementPatients(demoProfile.medicationManagementPatients)
    setIsAdmin(false)
    setIdentityLoading(false)
  }

  const enterDemoMode = () => {
    if (typeof window !== 'undefined' && window.location.pathname !== '/demo') {
      window.history.pushState({}, '', '/demo')
    }
    setIsDemoMode(true)
    applyDemoIdentity()
  }

  const exitDemoMode = () => {
    if (typeof window !== 'undefined' && window.location.pathname === '/demo') {
      window.history.pushState({}, '', '/')
    }
    setIsDemoMode(false)
  }

  const refreshIdentity = async (provisionIfMissing = false) => {
    if (isDemoMode) {
      applyDemoIdentity()
      return
    }
    if (!user?.email) return
    setIdentityLoading(true)
    const profile = await profileForEmail(user.email, provisionIfMissing)
    setOwnPatientId(profile?.ownPatientId ?? null)
    setSubject(profile?.subject ?? null)
    setDisplayName(profile?.displayName ?? null)
    setAccessiblePatients(profile?.accessiblePatients ?? [])
    setAllAccessiblePatients(profile?.allAccessiblePatients ?? [])
    setAccessibleSubjects(profile?.accessibleSubjects ?? [])
    setAllAccessibleSubjects(profile?.allAccessibleSubjects ?? [])
    setPatientIdsBySubject(profile?.patientIdsBySubject ?? {})
    setMedicationManagementPatients(profile?.medicationManagementPatients ?? [])
    setIsAdmin(profile?.isAdmin ?? false)
    setIdentityLoading(false)
  }

  useEffect(() => {
    let disposed = false
    let removeNativeAuthListener: (() => Promise<void>) | undefined
    // 原生 callback 可能在冷啟動時先於登入畫面掛載；在 auth hook 最早初始化時註冊，才能不漏掉回程 session。
    void initializeNativeAuth().then(remove => {
      if (disposed) {
        void remove()
        return
      }
      removeNativeAuthListener = remove
    }).catch(() => {
      // 原生 plugin 不可用時仍保留 Web 登入；不能讓非原生平台因 adapter 失敗而整個 auth hook 掛掉。
    })
    void supabase.auth.getSession().then(({ data }) => { setUser(data.session?.user ?? null); setLoading(false) })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => setUser(session?.user ?? null))
    return () => {
      disposed = true
      void removeNativeAuthListener?.()
      sub.subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const syncDemoRoute = () => {
      // 瀏覽器返回鍵只會改 pathname；同步這個狀態才能避免 adapter 仍把正式操作誤送成匿名 Demo 操作。
      setIsDemoMode(window.location.pathname === '/demo')
    }
    window.addEventListener('popstate', syncDemoRoute)
    return () => window.removeEventListener('popstate', syncDemoRoute)
  }, [])

  useEffect(() => {
    if (isDemoMode) {
      applyDemoIdentity()
      return
    }
    if (!user?.email) { setOwnPatientId(null); setSubject(null); setDisplayName(null); setAccessiblePatients([]); setAllAccessiblePatients([]); setAccessibleSubjects([]); setAllAccessibleSubjects([]); setPatientIdsBySubject({}); setMedicationManagementPatients([]); setIsAdmin(false); setIdentityLoading(false); return }
    let cancelled = false
    setIdentityLoading(true)
    void profileForEmail(user.email).then(profile => {
      if (cancelled) return
      setOwnPatientId(profile?.ownPatientId ?? null)
      setSubject(profile?.subject ?? null)
      setDisplayName(profile?.displayName ?? null)
      setAccessiblePatients(profile?.accessiblePatients ?? [])
      setAllAccessiblePatients(profile?.allAccessiblePatients ?? [])
      setAccessibleSubjects(profile?.accessibleSubjects ?? [])
      setAllAccessibleSubjects(profile?.allAccessibleSubjects ?? [])
      setPatientIdsBySubject(profile?.patientIdsBySubject ?? {})
      setMedicationManagementPatients(profile?.medicationManagementPatients ?? [])
      setIsAdmin(profile?.isAdmin ?? false)
      setIdentityLoading(false)
    })
    return () => { cancelled = true }
  }, [user?.email, isDemoMode])

  return {
    user,
    isDemoMode,
    enterDemoMode,
    exitDemoMode,
    ownPatientId,
    subject,
    displayName,
    accessiblePatients,
    allAccessiblePatients,
    accessibleSubjects,
    allAccessibleSubjects,
    patientIdsBySubject,
    medicationManagementPatients,
    isAdmin,
    refreshIdentity,
    loading: loading || (!isDemoMode && !!user && identityLoading),
  }
}
