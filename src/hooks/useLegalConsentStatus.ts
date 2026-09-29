/*
檔案用途：讀取目前登入使用者的隱私政策與健康資料使用同意版本狀態。
所在層：src/hooks；封裝 App.tsx 原本內嵌的法遵同意狀態與讀取 effect。
主要關聯：由 App.tsx 呼叫，決定是否顯示 PrivacyPolicyUpdateScreen／HealthDataConsentScreen；
依賴 lib/legalConsent 的 loadLegalConsentWithRetry 與版本常數。
*/
import { useEffect, useState } from 'react'
import { CURRENT_HEALTH_CONSENT_VERSION, CURRENT_PRIVACY_POLICY_VERSION, loadLegalConsentWithRetry } from '../lib/legalConsent'

export type ConsentStatus = 'idle' | 'loading' | 'required' | 'ready'

export function useLegalConsentStatus(userId: string | undefined) {
  const [privacyPolicyStatus, setPrivacyPolicyStatus] = useState<ConsentStatus>('idle')
  const [healthConsentStatus, setHealthConsentStatus] = useState<ConsentStatus>('idle')

  useEffect(() => {
    if (!userId) {
      setPrivacyPolicyStatus('idle')
      setHealthConsentStatus('idle')
      return
    }
    let cancelled = false
    setPrivacyPolicyStatus('loading')
    setHealthConsentStatus('loading')
    void loadLegalConsentWithRetry().then(consent => {
      // 為什麼分開比對：隱私政策更新只需要重新確認政策，不應被誤當成健康資料用途同意；
      // 兩者都必須等使用者明確操作，不能由讀取狀態靜默升版。
      if (!cancelled) {
        setPrivacyPolicyStatus(consent?.privacy_policy_version === CURRENT_PRIVACY_POLICY_VERSION ? 'ready' : 'required')
        setHealthConsentStatus(consent?.health_consent_version === CURRENT_HEALTH_CONSENT_VERSION ? 'ready' : 'required')
      }
    }).catch(error => {
      console.error('[legal consent load error after retry]', error)
      if (!cancelled) {
        setPrivacyPolicyStatus('required')
        setHealthConsentStatus('required')
      }
    })
    return () => { cancelled = true }
  }, [userId])

  return { privacyPolicyStatus, setPrivacyPolicyStatus, healthConsentStatus, setHealthConsentStatus }
}
