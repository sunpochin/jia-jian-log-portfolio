/*
檔案用途：「唯讀分享連結」的三語隱私告知內容（控制者、目的、欄位、期限、接收者與地區、雲端供應商、代理同意、審閱狀態）。
所在層：src/features/system-admin；純資料與純函式，由 PrivacyPage（逐項清單）與 HealthDataNoticePage（合併成一段）共用。
主要關聯：Issue #424 A／B／C／D／G／H 決策（docs/product/share-link-compliance-checklist.md §7.2）、
  docs/product/share-link-stage0-self-assessment.md §4 第 1 項、src/features/care-family/shareConsentNotice.ts（建立前的逐條連結告知）、
  tests/unit/sharePrivacyNotice.test.ts。
改這裡的內容等於改公開隱私告知：要一起評估是否升 CURRENT_PRIVACY_POLICY_VERSION／CURRENT_HEALTH_CONSENT_VERSION。
*/
import type { LocalizedText } from '../../lib/i18n'

export const SHARE_LINK_PRIVACY_TITLE: LocalizedText = { id: 'Tautan berbagi baca-saja', zh: '唯讀分享連結', en: 'Read-only share links' }

export const SHARE_LINK_PRIVACY_INTRO: LocalizedText = {
  id: 'Anggota keluarga yang diberi izin berbagi dapat membuat tautan berbatas waktu agar orang di luar aplikasi dapat melihat ringkasan perawatan:',
  zh: '被授權分享的家屬可以建立有期限的連結，讓 App 以外的人查看照護摘要：',
  en: 'Family members who have been given sharing permission can create time-limited links that let people outside the app view a care summary:',
}

// 為什麼每一項都獨立成一句：#424 要求告知涵蓋控制者、目的、欄位、期限、接收者與地區、雲端供應商、未經專業審閱，
// 分開寫才能讓 tests/unit/sharePrivacyNotice.test.ts 逐項鎖住，之後改文案時不會悄悄漏掉其中一項。
// 欄位清單同時列出兩種內容範圍：scope 在連結建立時固定、建立前的告知畫面只列該連結的範圍（shareConsentNotice.ts），
// 所以這裡寫「每條連結只含建立時告知的那一種」，不寫「目前只有哪一種」這種會隨上線進度過期的描述。
export const SHARE_LINK_PRIVACY_ITEMS: ReadonlyArray<{ label: LocalizedText; body: LocalizedText }> = [
  {
    label: { id: 'Pengendali data:', zh: '資料控制者：', en: 'Data controller:' },
    body: { id: 'Pengembang perorangan portfolio-author (bukan perusahaan); kontak tercantum di bagian "Hubungi Kami" pada Kebijakan Privasi.', zh: '個人開發者 portfolio-author（非公司），聯絡方式見隱私權條款的「聯絡我們」。', en: 'The individual developer portfolio-author (not a company); contact details are in the "Contact Us" section of the Privacy Policy.' },
  },
  {
    label: { id: 'Tujuan:', zh: '目的：', en: 'Purpose:' },
    body: { id: 'Membantu anggota keluarga dan dokter memahami kondisi perawatan penerima perawatan.', zh: '讓家人與醫師了解照護對象的照護狀況。', en: 'Helping family members and doctors understand the care recipient’s care situation.' },
  },
  {
    label: { id: 'Data yang dibagikan:', zh: '分享的欄位：', en: 'Fields shared:' },
    body: { id: 'Setiap tautan memiliki satu cakupan isi yang ditetapkan saat dibuat; layar pemberitahuan sebelum pembuatan mencantumkan isi tautan tersebut, dan isinya tidak berubah setelahnya. "Ringkasan hari ini" hanya memuat catatan tekanan darah terbaru pada hari tautan dibuka (waktu Taiwan): sistolik, diastolik, denyut nadi, dan waktu pengukuran, diperbarui setiap hari selama tautan berlaku. "Ringkasan perawatan dua minggu" memuat catatan tekanan darah 14 hari terakhir beserta standar penilaiannya, daftar lengkap obat yang sedang diminum (nama, dosis, waktu minum, warna dan bentuk, apakah datanya resmi, kode cara minum), catatan kunjungan dokter (jenis kunjungan, poli, tanggal) dan perubahan obat (nama obat, ditambah/diubah atau dihentikan, tanggal) dalam 30 hari terakhir, serta jumlah pertanyaan yang belum ditanyakan ke dokter. Keduanya tidak memuat nama orang, email, foto, catatan bebas, atau data kesehatan lainnya.', zh: '每條連結在建立時固定一種內容範圍，建立前的告知畫面會列出該連結包含的項目，之後不會改變。「今日摘要」只含對方打開連結當天（台灣時間）最新一筆血壓的收縮壓、舒張壓、心跳與量測時間，連結有效期間每天更新；「兩週照護摘要」含近 14 天的血壓讀數與判讀依據、目前服用的完整藥單（品名、劑量、時段、外觀顏色與形狀、資料是否官方、服用方式代碼）、近 30 天的就診紀錄（就診類型、科別、日期）與調藥紀錄（藥名、新增／調整或停用、日期），以及尚未提出的回診問題數量。兩種都不含姓名、電子郵件、照片、自由筆記或其他生理數值。', en: 'Each link has one content scope fixed when it is created; the notice shown before creating it lists exactly what that link includes, and this does not change later. The "today summary" contains only the latest blood-pressure reading on the day the link is opened (Taiwan time): systolic, diastolic, heart rate and measurement time, updated daily while the link is valid. The "two-week care summary" contains blood-pressure readings from the last 14 days with the standard used to interpret them, the complete current medication list (name, dose, timing, colour and shape, whether the record is official, how-to-take codes), doctor visits (visit type, department, date) and medication changes (medication name, added/adjusted or stopped, date) from the last 30 days, and the number of questions not yet asked at the next visit. Neither includes personal names, email addresses, photos, free-text notes or other health measurements.' },
  },
  {
    label: { id: 'Masa berlaku:', zh: '期限：', en: 'Expiry:' },
    body: { id: 'Bawaan 24 jam, paling lama 7 hari; pembagi dapat mencabutnya kapan saja, dan tautan langsung tidak berlaku setelah dicabut atau kedaluwarsa.', zh: '預設 24 小時，最長 7 天；分享者可以隨時撤銷，撤銷或到期後連結立即失效。', en: '24 hours by default, 7 days at most; the sharer can revoke a link at any time, and it stops working immediately once revoked or expired.' },
  },
  {
    label: { id: 'Penerima dan wilayah:', zh: '接收者與地區：', en: 'Recipients and location:' },
    body: { id: 'Penerima dipilih sendiri oleh pembagi dan dapat berada di luar Taiwan; siapa pun yang memegang tautan dapat melihatnya tanpa masuk, dan aplikasi ini tidak dapat mencegah tangkapan layar atau penerusan.', zh: '接收者由分享者自行選擇，可能在台灣以外；任何拿到連結的人不需登入即可查看，本 App 無法阻止截圖或轉傳。', en: 'The sharer chooses the recipients, who may be outside Taiwan; anyone holding the link can view it without signing in, and the app cannot prevent screenshots or forwarding.' },
  },
  {
    label: { id: 'Penyedia cloud:', zh: '雲端供應商：', en: 'Cloud providers:' },
    body: { id: 'Ringkasan yang dibagikan diproses melalui dua layanan cloud, Supabase (basis data dan fungsi server) dan Vercel (hosting situs), dan data dapat diproses di luar Taiwan.', zh: '分享摘要經由 Supabase（資料庫與伺服器函式）與 Vercel（網站主機）這兩家雲端服務處理，資料可能在台灣以外的地區處理。', en: 'Shared summaries are processed by two cloud services, Supabase (database and server functions) and Vercel (website hosting), and data may be processed outside Taiwan.' },
  },
  {
    label: { id: 'Persetujuan dan perwakilan:', zh: '同意與代理：', en: 'Consent and proxies:' },
    body: { id: 'Setiap tautan baru memerlukan persetujuan baru. Jika penerima perawatan bukan pembagi sendiri, anggota keluarga pengasuh utama memberikan persetujuan sebagai perwakilan, dan hubungan serta alasannya dicatat; aplikasi ini tidak memverifikasi dokumen perwalian dari pengadilan.', zh: '每建立一條連結都要重新同意。照護對象不是分享者本人時，由主要照顧家屬以代理人身分同意，並記錄關係與代理事由；本 App 不驗證法院監護宣告文件。', en: 'Every new link requires fresh consent. When the care recipient is not the sharer, the main family caregiver consents as a proxy, and the relationship and reason are recorded; the app does not verify court guardianship documents.' },
  },
  {
    label: { id: 'Status peninjauan:', zh: '審閱狀態：', en: 'Review status:' },
    body: { id: 'Fitur berbagi ini belum ditinjau oleh pengacara atau petugas perlindungan data pribadi.', zh: '本分享功能未經律師或個資專責人員審閱。', en: 'This sharing feature has not been reviewed by a lawyer or a data-protection specialist.' },
  },
]

// 健康資料告知頁的 NoticeSection 只吃一段文字：把逐項清單依語系串成一段，內容仍與 /privacy 同源。
export function joinSharePrivacyItems(locale: keyof LocalizedText): string {
  const separator = locale === 'zh' ? '' : ' '
  return [SHARE_LINK_PRIVACY_INTRO[locale], ...SHARE_LINK_PRIVACY_ITEMS.map(item => `${item.label[locale]}${separator}${item.body[locale]}`)].join(separator)
}
