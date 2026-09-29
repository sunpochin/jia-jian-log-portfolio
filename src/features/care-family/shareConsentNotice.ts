/*
檔案用途：唯讀分享連結「建立前告知」的三語同意文字，依連結的內容範圍（scope_version）各有一份。
所在層：src/features/care-family；純資料與純函式，不碰 React 或 Supabase，方便單元測試逐句鎖住。
主要關聯：ShareLinkManagement.tsx（顯示與確認）、src/lib/shareLinks.ts（SHARE_LINK_SCOPE_VERSION、SHARE_CONSENT_TEXT_VERSION）、
  docs/product/share-summary-v2-design.md §6 A（v2 文案來源）、docs/product/share-link-compliance-checklist.md §7.2（#424 A–H 決策）、
  tests/unit/shareConsentNotice.test.ts。
為什麼同意文字要依 scope 分開：#424 F1 核准「v1 連結永遠只回 v1 內容、v2 連結需重新取得 v2 同意」。
  管理頁讓家屬選 scope（預設 v2，2026-09-25 起 T1／T2 已能回 v2），確認畫面顯示的一定是所選 scope 的那一段，
  同意內容才與實際揭露一致（自評風險 R2）。
改任何一個字都要一起升 src/lib/shareLinks.ts 的 SHARE_CONSENT_TEXT_VERSION_BY_SCOPE 對應項：資料庫只存版本號，不存文字本身。
*/
import type { LocalizedText } from '../../lib/i18n'
import type { ShareScopeVersion } from '../../lib/shareLinks'

// v1：對應 supabase/functions/share-summary/shareSummary.ts 的 PatientShareSummaryDto——
// 最新一筆血壓（收縮壓、舒張壓、心跳、量測時間），姓名用固定別名「照護對象」。
// 注意「今天」是「對方打開連結的那一天」：get_patient_share_summary 在讀取當下用 now() 算台北日界，
// 不是建立連結的那天。7 天連結等於對方每天都能看到當天最新一筆，文字必須講清楚，否則揭露比同意的多。
const V1_CONTENT: LocalizedText = {
  id: 'Tautan ini memungkinkan siapa pun yang memilikinya (tanpa perlu masuk) melihat, selama masa berlaku: catatan tekanan darah terbaru penerima perawatan pada hari tautan dibuka (waktu Taiwan), yaitu sistolik, diastolik, denyut nadi, dan waktu pengukuran; selama tautan berlaku, setiap hari akan menampilkan catatan terbaru hari itu. Tidak termasuk nama orang, kontak, foto, catatan, daftar obat, atau data kesehatan lainnya.',
  zh: '這個連結會讓拿到它的人（不需登入）在有效期限內看到：照護對象在對方打開連結當天（台灣時間）的最新一筆血壓，包括收縮壓、舒張壓、心跳與量測時間；連結有效期間每天都會顯示當天的最新一筆。不包含姓名、聯絡方式、照片、筆記、藥單或其他生理數值。',
  en: 'Anyone who has this link (no sign-in needed) can see, until it expires: the care recipient’s latest blood-pressure reading on the day the link is opened (Taiwan time), including systolic, diastolic, heart rate and measurement time; while the link is valid, it shows that day’s latest reading each day. It does not include personal names, contact details, photos, notes, the medication list or other health measurements.',
}

// v2：採用 share-summary-v2-design.md §6 A（#424 F5 核准）；印尼文依設計 §6 仍需看護或母語者複核，
// 複核後若改字要一併升 SHARE_CONSENT_TEXT_VERSION_BY_SCOPE['daily-summary-v2']。相對草稿做了三處調整：
// (1) {alias} 佔位改成固定的「照護對象」，因為管理頁頂部這段不綁特定病人；
// (2) 「誰都能看／截圖轉傳／可撤銷／期限」移到下面的共同段落，兩個 scope 用同一份，避免兩邊措辭漂移；
// (3) en／id 的「不含 names／nama」改成「personal names／nama orang」，因為同一句前面才列出「藥名」會被分享。
// F4 (i)–(iii)（等級標籤附判讀依據、不是診斷聲明、不給處置建議）是接收頁的呈現規則（設計 §8 T3），
// 這裡只告知「會附判讀依據」，因為那是會被揭露的內容。
const V2_CONTENT: LocalizedText = {
  id: 'Tautan ini memungkinkan siapa pun yang memilikinya (tanpa perlu masuk) melihat, selama masa berlaku: catatan tekanan darah penerima perawatan selama 14 hari terakhir beserta standar penilaiannya, daftar lengkap obat yang sedang diminum (nama, dosis, waktu minum, warna dan bentuk, apakah datanya resmi, kode cara minum), catatan kunjungan dokter (jenis kunjungan, poli, dan tanggal) dan perubahan obat (nama obat, ditambah/diubah atau dihentikan, dan tanggal) dalam 30 hari terakhir, tanpa isi kunjungan atau catatan apa pun; serta jumlah pertanyaan yang belum ditanyakan ke dokter. Tidak termasuk foto, catatan bebas, nama orang, kontak, atau data kesehatan lainnya.',
  zh: '這個連結會讓拿到它的人（不需登入）在有效期限內看到：照護對象近 14 天的血壓讀數與判讀依據、目前正在服用的完整藥單（品名、劑量、時段、外觀顏色與形狀、資料是否官方、服用方式代碼）、近 30 天的就診紀錄（就診類型、科別與日期）與調藥紀錄（藥名、新增／調整或停用、日期），不含就診內容或任何筆記；以及尚未提出的回診問題數量。不包含照片、自由筆記、姓名、聯絡方式或其他生理數值。',
  en: 'Anyone who has this link (no sign-in needed) can see, until it expires: the care recipient’s blood-pressure readings from the last 14 days with the standard used to interpret them, the complete current medication list (name, dose, timing, colour and shape, whether the record is official, how-to-take codes), doctor visits (visit type, department and date) and medication changes (medication name, added/adjusted or stopped, and date) from the last 30 days with no visit details or notes of any kind, and the number of questions not yet asked at the next visit. It does not include photos, free-text notes, personal names, contact details or other health measurements.',
}

// 兩個 scope 共用：#424 要求每份同意文字都講清楚四件事——
// 拿到連結就能看、App 擋不住截圖與轉傳、可以撤銷、本功能未經律師或個資專責人員審閱（H 項：以揭露代替審閱）。
const COMMON_NOTICE: LocalizedText = {
  id: 'Siapa pun yang memegang tautan dapat melihat, menangkap layar, atau meneruskannya; aplikasi ini tidak dapat mencegah tangkapan layar atau penerusan, dan tidak dapat menarik kembali tampilan yang sudah dilihat atau disimpan. Anda dapat mencabut tautan kapan saja di sini dan tautan langsung tidak berlaku. Masa berlaku paling lama 7 hari, bawaan 24 jam. Fitur berbagi ini belum ditinjau oleh pengacara atau petugas perlindungan data pribadi.',
  zh: '任何拿到連結的人都能查看、截圖或轉傳；本 App 無法阻止截圖或轉傳，也無法收回已被看過或已儲存的畫面。你可以隨時在這裡撤銷連結，撤銷後立即失效。連結最長 7 天，預設 24 小時。本分享功能未經律師或個資專責人員審閱。',
  en: 'Anyone holding the link can view, screenshot or forward it; this app cannot prevent screenshots or forwarding, and cannot take back what has already been seen or saved. You can revoke the link here at any time and it stops working immediately. Links last at most 7 days, 24 hours by default. This sharing feature has not been reviewed by a lawyer or a data-protection specialist.',
}

function joinLocalized(first: LocalizedText, second: LocalizedText): LocalizedText {
  // 印尼文與英文句子之間要空格，中文不用；逐語系組合，確保三語永遠同時存在。
  return { id: `${first.id} ${second.id}`, zh: `${first.zh}${second.zh}`, en: `${first.en} ${second.en}` }
}

// Record 而不是 if/else：之後新增 scope 時 TypeScript 會強制補上對應文字，不會有 scope 沒有同意文字。
export const SHARE_CONSENT_NOTICE_BY_SCOPE: Record<ShareScopeVersion, LocalizedText> = {
  'daily-summary-v1': joinLocalized(V1_CONTENT, COMMON_NOTICE),
  'daily-summary-v2': joinLocalized(V2_CONTENT, COMMON_NOTICE),
}

export function shareConsentNotice(scope: ShareScopeVersion): LocalizedText {
  return SHARE_CONSENT_NOTICE_BY_SCOPE[scope]
}
