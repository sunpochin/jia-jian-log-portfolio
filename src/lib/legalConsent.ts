/*
檔案用途：集中版本化同意的讀取與寫入，讓登入頁、同意畫面與資料庫使用同一份契約。
所在層：src/lib 共用資料轉接層；不處理畫面呈現或照護資料寫入。
主要關聯：App.tsx 用它讀取政策／健康同意狀態，PrivacyPolicyUpdateScreen 與 HealthDataConsentScreen 在明確操作後寫入。
*/
import { supabase } from './supabase'

// 為什麼要有這兩個常數：App.tsx 要分別判斷隱私政策與健康資料同意是否最新，
// 不能把「看過隱私政策」誤當成「同意健康資料用途」，也不能讓政策升版被靜默略過。
// 版本字串必須跟對應 migration 裡的 RPC 完全一致，否則升版後的同意畫面永遠不會被觸發。
// 2026-09-25 升版原因（issue #424）：隱私政策補揭露 Telegram、LINE、Resend 三家通知／寄信供應商與境外處理；
// 對應 supabase/migrations/20260925130000_bump_privacy_policy_version_for_notification_providers.sql。
// 2026-09-25.2 升版原因（issue #424 G，PR #922）：再揭露唯讀分享連結（控制者、目的、欄位、期限、境外接收者與雲端供應商）；
// 對應 supabase/migrations/20260925150000_bump_privacy_policy_version_for_share_link.sql。
// 為什麼不沿用 '2026-09-25'：那個版本已在 staging 上線且不含分享段落，沿用會讓已接受的人不必看新告知（Codex P1）。
// 「.2」是同日第二次修訂，文字比較大於 '2026-09-25'。
export const CURRENT_PRIVACY_POLICY_VERSION = '2026-09-25.2'
// 2026-09-10 升版原因（issue #665）：AI 藥單草稿改用 Gemini 理解整張藥袋並產生醫囑欄位，
// 與既有 Cloud Vision 純文字辨識是不同的處理性質，即使收件廠商同為 Google，仍視為新蒐集目的。
// 2026-09-25 升版原因（issue #424）：血壓數值與照護對象姓名會送到 Telegram、LINE 兩家境外接收者，
// 屬於個資法 §6 健康資料的新揭露接收者，既有使用者必須重新明確同意；
// 對應 supabase/migrations/20260925130100_bump_health_consent_version_for_notification_providers.sql。
// 2026-09-25.2 升版原因（issue #424 G，PR #922）：健康資料可經唯讀分享連結給 App 外的人看，是新的利用對象；
// 對應 supabase/migrations/20260925150100_bump_health_consent_version_for_share_link.sql。
// create_patient_share_link 要求分享者的健康同意 >= '2026-09-25.2'，即以這一版為門檻；
// 不能沿用 '2026-09-25'，理由同上（該版本不含分享告知，已在 staging 被接受）。
export const CURRENT_HEALTH_CONSENT_VERSION = '2026-09-25.2'

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
