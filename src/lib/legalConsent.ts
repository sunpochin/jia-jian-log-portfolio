/*
檔案用途：集中版本化同意的讀取與寫入，讓登入頁、同意畫面與資料庫使用同一份契約。
所在層：src/lib 共用資料轉接層；不處理畫面呈現或照護資料寫入。
主要關聯：App.tsx 用它讀取政策／健康同意狀態，PrivacyPolicyUpdateScreen 與 HealthDataConsentScreen 在明確操作後寫入。
*/
import { supabase } from './supabase'

// 為什麼要有這兩個常數：App.tsx 要分別判斷隱私政策與健康資料同意是否最新，
// 不能把「看過隱私政策」誤當成「同意健康資料用途」，也不能讓政策升版被靜默略過。
// 版本字串必須跟對應 migration 裡的 RPC 完全一致，否則升版後的同意畫面永遠不會被觸發。
export const CURRENT_PRIVACY_POLICY_VERSION = '2026-09-06'
export const CURRENT_HEALTH_CONSENT_VERSION = '2026-08-26'

export type ConsentType = 'self' | 'authorized_representative'
export type StoredConsentType = ConsentType | 'legacy_existing_account'

export interface LegalConsent {
  privacy_policy_version: string | null
  health_consent_version: string | null
  consent_type: StoredConsentType | null
}

// 只有使用者完成登入頁／政策更新畫面的明確動作後才能呼叫；讀取狀態不得順便改寫稽核時間。
export async function recordAccountLegalAcceptance(): Promise<void> {
  const { error } = await supabase.rpc('record_account_legal_acceptance')
  if (error) throw error
}

export async function readLegalConsent(): Promise<LegalConsent | null> {
  const { data, error } = await supabase
    .from('legal_consents')
    .select('privacy_policy_version, health_consent_version, consent_type')
    .maybeSingle()
  if (error) throw error
  return data as LegalConsent | null
}

export async function recordHealthDataConsent(consentType: ConsentType, authorizationBasis?: string): Promise<void> {
  const { error } = await supabase.rpc('record_health_data_consent', {
    p_consent_type: consentType,
    p_authorization_basis: authorizationBasis?.trim() || null,
  })
  if (error) throw error
}

// 剛切換到全新的瀏覽器／PWA instance（例如 iOS 加到主畫面的新桌面捷徑，是完全獨立的 WKWebView
// 儲存容器，得整個重新走一次登入）時，Supabase 的登入 session 有時還沒完全穩定就送出第一次
// 請求，導致這裡短暫拋出例外；已經同意過的帳號因此被誤判成「尚未同意」，逼使用者重新看一次
// 同意畫面（即使資料庫裡那筆同意紀錄其實好好的在）。重試一次能撐過這種暫時性失敗；
// 這裡刻意只讀取，避免 session 恢復時在使用者沒有重新確認政策的情況下改寫 privacy_acknowledged_at。
export async function loadLegalConsentWithRetry(retryDelayMs = 800): Promise<LegalConsent | null> {
  try {
    return await readLegalConsent()
  } catch (firstAttemptError) {
    console.error('[legal consent read error, retrying once]', firstAttemptError)
    await new Promise(resolve => setTimeout(resolve, retryDelayMs))
    return readLegalConsent()
  }
}
