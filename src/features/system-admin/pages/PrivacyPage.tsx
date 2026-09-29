/*
檔案用途：顯示家健錄公開的隱私權條款與聯絡、版本資訊。
所在層：src/features/system-admin/pages 公開頁面層；未登入也能閱讀，不會讀取照護資料。
主要關聯：由 App.tsx 依 /privacy 路徑呈現，使用 appInfo.ts 的統一版本與發布代號。
2026-08-26 新增藥品照片委外辨識（Google Cloud Vision）揭露段落，對應 issue #423 決策；
同日修正措辭為「事後過濾／捨棄姓名」（原「送出前遮蔽」在技術上有雞生蛋問題，已放棄），
並改為暫存照片全程不落地 Storage。DB 端 legal_consents 同意版本已隨 feature/medication-photo-ocr 升版。
2026-09-06 新增 Vercel Web Analytics 頁面瀏覽與六個匿名漏斗事件揭露，對應 issue #438；
隱私政策版本由資料庫 migration 升為 2026-09-06，健康資料同意版本不變。
2026-09-10 新增「AI 藥單草稿」（Gemini API）委外處理揭露，對應 issue #665：既有 Cloud Vision
純文字辨識維持不變，另外新增付費選用功能——由生成式模型理解整張藥袋照片並產生可編輯的醫囑欄位
草稿（藥名、劑量、頻次、用法），仍是同一家委外廠商 Google，但處理性質不同，故視為新蒐集目的並
升版健康資料同意（見 supabase/migrations/20260910180000_bump_health_consent_version_for_medication_ai_draft.sql）。
照片本身會完整送出委外處理，本站僅在回傳結果進入畫面前做「事後過濾」捨棄疑似病人姓名的欄位，
不是送出前先去識別化——文案措辭刻意精確，避免不實揭露。
2026-09-25 新增「通知與寄信：委外服務」段落（issue #424 第三方供應商盤點）：Telegram、LINE、Resend 早已在運作卻未揭露，
文案集中在 ../notificationProviderDisclosures.ts；隱私政策與健康資料同意同日升為 2026-09-25
（supabase/migrations/20260925130000_*、20260925130100_*）。
2026-09-25.2 新增「唯讀分享連結」段落，對應 issue #424 A／B／C／D／G／H 決策（docs/product/share-link-compliance-checklist.md §7.2）
與開發者自評（docs/product/share-link-stage0-self-assessment.md §4 第 1 項）；隱私政策版本另升為 2026-09-25.2
（supabase/migrations/20260925150000_*），因為 2026-09-25 已在 staging 被接受、卻不含這一段。
*/
import { useI18n } from '../../../lib/i18n'
import { LanguageSwitcher } from '../../../components/ui/LanguageSwitcher'
import { ReleaseVersion } from '../../../components/system/ReleaseVersion'
import { APP_AUTHOR_URL } from '../../../lib/appInfo'
import { NOTIFICATION_PROVIDER_DISCLOSURES } from '../notificationProviderDisclosures'
import { SHARE_LINK_PRIVACY_INTRO, SHARE_LINK_PRIVACY_ITEMS, SHARE_LINK_PRIVACY_TITLE } from '../sharePrivacyNotice'

// 內容放在 sharePrivacyNotice.ts：/privacy 與 /health-data-notice 共用同一份，避免兩頁各寫一版後漂移。
function ShareLinkPrivacySection() {
  const { text } = useI18n()
  return (
    <section className="space-y-2">
      <h2 className="text-base font-bold text-gray-900">{text(SHARE_LINK_PRIVACY_TITLE)}</h2>
      <p className="text-sm leading-relaxed text-gray-600">{text(SHARE_LINK_PRIVACY_INTRO)}</p>
      <ul className="list-disc pl-5 text-sm leading-relaxed text-gray-600 space-y-1">
        {SHARE_LINK_PRIVACY_ITEMS.map(item => (
          <li key={item.label.en}>
            <span className="font-semibold">{text(item.label)}</span>{' '}
            {text(item.body)}
          </li>
        ))}
      </ul>
    </section>
  )
}

export function PrivacyPage() {
  const { text } = useI18n()

  const goHome = () => {
    window.location.href = '/'
  }

  return (
    <div className="min-h-dvh bg-gray-50 text-gray-900">
      <header className="sticky top-0 z-10 border-b border-gray-200 bg-white px-4 py-3 shadow-xs">
        <div className="mx-auto flex max-w-2xl items-center justify-between">
          <button
            onClick={goHome}
            className="flex items-center gap-1 text-sm font-bold text-gray-700 hover:text-gray-900 active:text-blue-600"
          >
            <span>←</span>
            <span>{text({ id: 'Kembali ke Beranda', zh: '返回首頁' ,en: 'Back to Home' })}</span>
          </button>
          <LanguageSwitcher />
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-5 py-8">
        <article className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm md:p-8 space-y-6">
          <div>
            <span className="inline-block rounded-lg bg-blue-50 px-2.5 py-1 text-xs font-extrabold text-blue-700">
              {text({ id: 'Privasi & Keamanan Data', zh: '隱私權與資料安全', en: 'Privacy & Data Security' })}
            </span>
            <h1 className="mt-2 text-2xl font-black tracking-tight text-gray-900 md:text-3xl">
              {text({ id: 'Kebijakan Privasi', zh: '隱私權條款', en: 'Privacy Policy' })}
            </h1>
            <p className="mt-1 text-xs text-gray-500">
              {/* 這個日期是頁面文案的顯示標籤，與資料庫強制比對的 CURRENT_PRIVACY_POLICY_VERSION 是兩件事；
                  2026-09-25 這天（issue #424：補揭露 Telegram／LINE／Resend 升為 2026-09-25，唯讀分享連結再升為 2026-09-25.2）兩個版本都同日升版，
                  但 2026-09-10 那次只升健康資料同意，所以兩者不一定永遠相等。 */}
              {text({ id: 'Terakhir diperbarui: 25 September 2026', zh: '最後更新日期：2026 年 9 月 25 日', en: 'Last updated: September 25, 2026' })}
            </p>
          </div>

          <hr className="border-gray-100" />

          {/* 1. Pengumpulan Data */}
          <section className="space-y-2">
            <h2 className="text-base font-bold text-gray-900">
              1. {text({ id: 'Informasi yang Kami Kumpulkan', zh: '我們收集的資料', en: 'Information we collect' })}
            </h2>
            <p className="text-sm leading-relaxed text-gray-600">
              {text({
                id: 'Untuk menyediakan layanan pemantauan kesehatan keluarga, kami mengumpulkan data berikut:',
                zh: '為了提供家庭健康紀錄與趨勢分析服務，本系統會收集以下資料：', en: 'In order to provide family health records and trend analysis services, the system collects the following data:'
              })}
            </p>
            <ul className="list-disc pl-5 text-sm leading-relaxed text-gray-600 space-y-1">
              <li>
                <span className="font-semibold">{text({ id: 'Informasi Akun Google:', zh: 'Google 帳號資訊：', en: 'Google Account Information:' })}</span>{' '}
                {text({ id: 'Alamat email dan nama tampilan profil Google.', zh: '電子郵件地址與 Google 帳號顯示名稱。', en: 'Email address and Google account display name.' })}
              </li>
              <li>
                <span className="font-semibold">{text({ id: 'Data Catatan Kesehatan:', zh: '健康紀錄資料：', en: 'Health Record Data:' })}</span>{' '}
                {text({ id: 'Tekanan darah sistolik, diastolik, denyut nadi, dan waktu pengukuran.', zh: '收縮壓、舒張壓、心跳數值與量測時間戳記。', en: 'Systolic, diastolic, heartbeat values and measurement timestamps.' })}
              </li>
              <li>
                <span className="font-semibold">{text({ id: 'Foto Kemasan Obat:', zh: '藥品／藥袋照片：', en: 'Medication Package Photos:' })}</span>{' '}
                {text({ id: 'Jika Anda menggunakan fitur pindai kemasan obat, kami menyimpan sementara foto kemasan obat dan teks hasil pengenalannya untuk membuat draf resep.', zh: '若您使用拍照建立藥單功能，我們會暫存藥袋照片與辨識出的文字內容，用於產生藥單草稿。', en: 'If you use the medication package scan feature, we temporarily store package photos and recognized text to generate prescription drafts.' })}
              </li>
            </ul>
          </section>

          {/* 2. 藥品照片辨識與委外處理 */}
          <section className="space-y-2">
            <h2 className="text-base font-bold text-gray-900">
              2. {text({ id: 'Pemindaian Foto Obat dan Pemrosesan Pihak Ketiga', zh: '藥品照片辨識與委外處理', en: 'Medication Photo OCR and Third-Party Processing' })}
            </h2>
            <p className="text-sm leading-relaxed text-gray-600">
              {text({
                // 為什麼保留完整影像送辨識：姓名欄位需要由辨識結果比對後過濾，送出前遮蔽無法可靠定位；照片本身不落地保存。
                id: 'Jika Anda menggunakan fitur "Pindai Kemasan Obat untuk Membuat Resep", seluruh foto kemasan obat akan dikirim langsung ke layanan pengenalan teks pihak ketiga, Google Cloud Vision (Google LLC, Amerika Serikat), untuk mendapatkan nama obat, dosis, dan frekuensi. Setelah hasil pengenalan diterima, sistem kami akan secara otomatis menyaring dan membuang baris teks yang cocok dengan nama pasien sebelum disimpan atau ditampilkan — nama pasien tidak pernah disimpan ke basis data atau ditampilkan di layar. Foto sementara tidak pernah disimpan ke penyimpanan berkas kami; foto hanya ada di memori server selama satu permintaan pemrosesan dan langsung dibuang setelah pengenalan berhasil atau gagal. Hasil pengenalan selalu ditampilkan sebagai "draf" dan harus Anda konfirmasi satu per satu sebelum disimpan sebagai resep resmi.',
                zh: '若您使用「拍照建立藥單」功能，整張藥袋照片會直接送至委外文字辨識服務 Google Cloud Vision（Google LLC，美國）以取得藥名、劑量與頻次等文字內容；辨識結果送回後，由我方系統自動過濾並捨棄其中比對到病人姓名的文字行，姓名本身不會被寫入資料庫，也不會顯示在畫面上。暫存照片不會存進我方任何檔案儲存空間，只在伺服器處理單次請求時存在於記憶體中，辨識完成或失敗後立即釋放。辨識結果一律以「草稿」呈現，需經您逐項確認後才會寫入正式藥單。',
                en: 'If you use the "Scan Medication Package to Create a Prescription" feature, the entire package photo is sent directly to Google Cloud Vision (Google LLC, United States), an overseas third-party text-recognition service, to identify the medication name, dosage, and frequency. After the result is returned, our system filters and discards text lines matching the patient’s name before any result is stored or displayed. The patient’s name is never stored in our database or shown on screen. The temporary photo is never saved to our file storage; it exists only in server memory for one request and is discarded after recognition succeeds or fails. Recognition results are always shown as a draft and must be confirmed item by item before they become an official prescription.'
              })}
            </p>
            {/* 為什麼另立一段而不是改寫上面那段：Cloud Vision 純文字辨識是既有免費功能，維持不變；
                AI 藥單草稿是新的付費選用功能，處理性質從「回傳文字」變成「生成式模型理解整張照片並產生醫囑欄位」，
                即使委外廠商同為 Google 也必須分開誠實揭露，這正是本次升版健康資料同意的理由（issue #665）。 */}
            <p className="text-sm leading-relaxed text-gray-600">
              {text({
                id: 'Jika Anda menggunakan fitur berlangganan "Draf Resep Obat dengan AI", seluruh foto kemasan obat akan dikirim langsung ke Google (Gemini API) — pemroses pihak ketiga yang sama dengan di atas. Berbeda dari pengenalan teks biasa, model AI generatif ini memahami seluruh foto kemasan obat dan langsung menyusun draf kolom resep terstruktur (nama obat, dosis, frekuensi, cara pakai). Setelah hasil diterima, sistem kami menyaring dan membuang kolom yang cocok dengan nama pasien sebelum ditampilkan — ini adalah penyaringan setelah hasil diterima, bukan penyamaran sebelum foto dikirim; foto aslinya tetap dikirim utuh. Foto tidak pernah disimpan ke penyimpanan berkas kami. Berdasarkan syarat layanan resmi Google untuk Gemini API (diperiksa September 2026): pada layanan berbayar, Google tidak menggunakan prompt atau berkas (termasuk foto) Anda untuk melatih modelnya, tetapi tetap menyimpan log prompt, berkas, dan hasil hingga maksimal 55 hari untuk mendeteksi pelanggaran kebijakan dan kewajiban hukum, sebelum dihapus. Hasil AI selalu berupa "draf" dan harus Anda konfirmasi satu per satu sebelum disimpan; ini adalah fitur opsional — Anda selalu dapat mengisi resep secara manual tanpa menggunakannya.',
                zh: '若您使用付費選用功能「AI 藥單草稿」，整張藥袋照片一樣會直接送至上述同一家委外廠商 Google（Gemini API）。與單純文字辨識不同，這個生成式模型會理解整張藥袋照片，直接產生結構化的醫囑欄位草稿（藥名、劑量、頻次、用法）。結果送回後，由我方系統過濾並捨棄其中比對到病人姓名的欄位再顯示——這是「回傳結果後的過濾」，不是「送出前先去識別化」；照片本身仍會完整送出。照片不會存進我方任何檔案儲存空間。依 Google 針對 Gemini API 的官方服務條款（2026 年 9 月查證）：付費額度下，Google 不會用您的提示詞或檔案（含照片）訓練模型，但仍會保留提示詞、檔案與回應內容最長 55 天，用於偵測濫用政策違規與履行法規義務，之後才刪除。AI 產出結果一律以「草稿」呈現，需經您逐項確認後才會寫入正式藥單；這是選用功能，您隨時可以不使用它，改為手動輸入。',
                en: 'If you use the paid, opt-in "AI Medication Draft" feature, the entire medication package photo is likewise sent directly to Google (Gemini API) — the same third-party processor as above. Unlike plain text recognition, this generative model understands the entire package photo and directly drafts structured prescription fields (medication name, dosage, frequency, and instructions). After the result is returned, our system filters and discards fields matching the patient’s name before displaying it — this is post-hoc filtering after the result comes back, not de-identification before the photo is sent; the photo itself is still sent in full. The photo is never saved to our file storage. Per Google’s official Gemini API terms of service (checked September 2026): under paid usage, Google does not use your prompts or files (including photos) to train its models, but it still retains logs of prompts, files, and responses for up to 55 days to detect policy violations and meet legal obligations, before deletion. AI results are always shown as a "draft" and must be confirmed item by item before being saved as an official prescription; this is an optional feature — you can always fill in the prescription manually instead.'
              })}
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-bold text-gray-900">{text({ id: 'Persetujuan data kesehatan', zh: '健康資料明確同意', en: 'Health Information Explicit Consent' })}</h2>
            <p className="text-sm leading-relaxed text-gray-600">{text({ id: 'Sebelum catatan kesehatan dibuat atau ditampilkan, Family Health Note meminta persetujuan terpisah. Jika Anda mengelola data orang lain, gunakan status perwakilan yang berwenang dan catat dasar kewenangannya.', zh: '建立或顯示健康紀錄前，家健錄會另行取得明確同意；若代管他人資料，須以具授權代理人身分並記錄授權依據。', en: 'Before creating or displaying health records, Family Health Note obtains explicit consent separately. If managing another person’s data, you must act as an authorized representative and document the basis of authority.' })}</p>
            <a href="/health-data-notice" className="text-sm font-semibold text-blue-700 underline">{text({ id: 'Pemberitahuan Pengumpulan Data Pribadi', zh: '個人資料蒐集告知事項', en: 'Personal Data Collection Notice' })}</a>
          </section>

          <ShareLinkPrivacySection />

          {/* 3. 分析與自訂事件：只揭露不含健康資料的粗分類，不把分析用途藏在同意流程之外。 */}
          <section className="space-y-2">
            <h2 className="text-base font-bold text-gray-900">
              3. {text({ id: 'Analitik penggunaan dan peristiwa anonim', zh: '使用分析與匿名事件', en: 'Usage analytics and anonymous events' })}
            </h2>
            <p className="text-sm leading-relaxed text-gray-600">
              {text({
                id: 'Family Health Note menggunakan Vercel Web Analytics untuk memahami kunjungan halaman dan apakah alur pengenalan membantu pengguna mulai mencatat. Peristiwa khusus hanya memakai nama peristiwa tetap serta klasifikasi kasar seperti bahasa, asal halaman login, atau jenis catatan; kegagalan analitik tidak menghentikan penyimpanan catatan kesehatan.',
                zh: '家健錄使用 Vercel Web Analytics 了解頁面瀏覽，以及介紹流程是否幫助使用者開始記錄。自訂事件只使用固定事件名稱與語言、登入入口、紀錄類型等粗分類；分析送出失敗不會阻擋任何健康紀錄儲存。',
                en: 'Family Health Note uses Vercel Web Analytics to understand page visits and whether the introduction flow helps people start recording. Custom events use only fixed event names and coarse categories such as language, login entry, or record type; an analytics failure never blocks health-record saving.'
              })}
            </p>
            <p className="text-sm leading-relaxed text-gray-600">
              {text({
                id: 'Daftar peristiwa: landing_view, demo_start, tutorial_complete, login_success, first_record_saved, dan week1_return.',
                zh: '自訂事件清單：landing_view、demo_start、tutorial_complete、login_success、first_record_saved、week1_return。',
                en: 'Custom event list: landing_view, demo_start, tutorial_complete, login_success, first_record_saved, and week1_return.'
              })}
            </p>
            <p className="text-sm leading-relaxed text-gray-600">
              {text({
                id: 'Peristiwa ini tidak mengirim patient_id, user_id, alamat email, nama, nama obat, nilai tekanan darah/berat badan/gula darah, atau catatan bebas.',
                zh: '這些事件不會送出 patient_id、user_id、電子郵件、姓名、藥品名稱、血壓／體重／血糖數值或自由筆記。',
                en: 'These events never send patient_id, user_id, email addresses, names, medication names, blood-pressure/weight/glucose values, or free-form notes.'
              })}
            </p>
          </section>

          {/* 通知與寄信供應商（issue #424 盤點補揭露）：Telegram／LINE 會收到血壓數值與照護對象姓名（個資法 §6 健康資料），
              Resend 會收到受邀者信箱；個資法 §8 要求告知接收者與處理地區，因此隱私政策與健康資料同意在 2026-09-25 一起升版。
              文案集中在 notificationProviderDisclosures.ts，與同頁的分享連結段落分開放，避免兩個平行 PR 互相覆蓋。 */}
          <section className="space-y-2">
            <h2 className="text-base font-bold text-gray-900">
              {text({ id: 'Notifikasi dan email: penyedia pihak ketiga', zh: '通知與寄信：委外服務', en: 'Notifications and email: third-party providers' })}
            </h2>
            <p className="text-sm leading-relaxed text-gray-600">
              {text({
                id: 'Selain Supabase (basis data), Vercel (situs dan analitik), dan Google (login dan pemindaian obat), Family Health Note memakai tiga layanan berikut untuk mengirim notifikasi dan email. Ketiganya berada di luar Taiwan.',
                zh: '除了 Supabase（資料庫）、Vercel（網站與分析）與 Google（登入與藥袋辨識），家健錄還使用以下三家服務送出通知與邀請信，三家都在台灣以外。',
                en: 'Besides Supabase (database), Vercel (website and analytics) and Google (sign-in and medication scanning), Family Health Note uses the following three services to send notifications and invitation emails. All three are outside Taiwan.',
              })}
            </p>
            {NOTIFICATION_PROVIDER_DISCLOSURES.map(provider => (
              <div key={provider.key} className="space-y-1">
                <h3 className="text-sm font-bold text-gray-800">{text(provider.title)}</h3>
                <ul className="list-disc pl-5 text-sm leading-relaxed text-gray-600 space-y-1">
                  <li>{text(provider.sent)}</li>
                  <li>{text(provider.purpose)}</li>
                  <li>{text(provider.location)}</li>
                  <li>{text(provider.optIn)}</li>
                </ul>
              </div>
            ))}
          </section>

          {/* 4. Penggunaan Data */}
          <section className="space-y-2">
            <h2 className="text-base font-bold text-gray-900">
              4. {text({ id: 'Penggunaan Data', zh: '資料用途', en: 'Data Usage' })}
            </h2>
            <p className="text-sm leading-relaxed text-gray-600">
              {text({
                id: 'Data Anda hanya digunakan untuk menampilkan grafik tren kesehatan dan memfasilitasi perawatan keluarga. Kami TIDAK PERNAH menjual atau membagikan data Anda kepada pihak ketiga untuk kepentingan iklan.',
                zh: '您的資料僅用於在系統內呈現健康趨勢圖表與方便家庭照護對照。我們「絕不」出售或提供您的資料給第三方用於廣告或行銷用途。', en: 'Your data is only used to present health trend charts and assist family care within the system. We NEVER sell or share your information with third parties for advertising or marketing.'
              })}
            </p>
          </section>

          {/* 5. Perlindungan & Keamanan */}
          <section className="space-y-2">
            <h2 className="text-base font-bold text-gray-900">
              5. {text({ id: 'Keamanan Data', zh: '資料安全與保護', en: 'Data Security' })}
            </h2>
            <p className="text-sm leading-relaxed text-gray-600">
              {text({
                id: 'Semua data disimpan dengan aman di database Supabase yang terenkripsi SSL/TLS, dan dilindungi oleh Kebijakan Keamanan Tingkat Baris (Row Level Security / RLS) sehingga hanya anggota berwenang yang dapat mengaksesnya.',
                zh: '所有健康紀錄均安全儲存於經 SSL/TLS 加密的 Supabase 資料庫，並受資料庫層級 RLS 權限政策保護，僅限經授權之使用者或家庭成員存取。', en: 'All health records are securely stored in an SSL/TLS-encrypted Supabase database and protected by Row Level Security (RLS) policies, accessible only to authorized members.'
              })}
            </p>
          </section>

          {/* 6. Hak Pengguna */}
          <section className="space-y-2">
            <h2 className="text-base font-bold text-gray-900">
              6. {text({ id: 'Hak Pengguna (Ekspor & Hapus)', zh: '使用者權利（匯出與自主刪除）', en: 'User Rights (Export & Deletion)' })}
            </h2>
            <p className="text-sm leading-relaxed text-gray-600">
              {text({
                id: 'Anda memiliki kendali penuh atas data pribadi Anda:',
                zh: '您對自己的個人資料擁有完整的掌控權：', en: 'You have full control over your personal data:'
              })}
            </p>
            <ul className="list-disc pl-5 text-sm leading-relaxed text-gray-600 space-y-1">
              <li>
                <span className="font-semibold">{text({ id: 'Ekspor Data CSV:', zh: 'CSV 資料匯出：', en: 'CSV Data Export:' })}</span>{' '}
                {text({ id: 'Anda dapat mengunduh seluruh catatan tekanan darah dalam format CSV UTF-8 kapan saja dari menu Pengaturan.', zh: '您可隨時於設定頁面將所有血壓紀錄匯出為 UTF-8 CSV 檔案。', en: 'You can export all blood pressure records to a UTF-8 CSV file at any time on the settings page.' })}
              </li>
              <li>
                <span className="font-semibold">{text({ id: 'Hapus Akun Mandiri:', zh: '自主刪除帳號：', en: 'Self-Service Account Deletion:' })}</span>{' '}
                {text({ id: 'Anda dapat menghapus akun dan seluruh catatan data pribadi kapan saja di Pengaturan melalui fitur Hapus Akun.', zh: '您可隨時於設定頁面使用「刪除帳號」功能，永久清除您的個人檔案、權限與所有血壓紀錄。', en: 'You can permanently erase your profile, permissions, and all health records at any time using the Delete Account feature on the settings page.' })}
              </li>
            </ul>
          </section>

          {/* 7. Hubungi Kami */}
          <section className="space-y-2">
            <h2 className="text-base font-bold text-gray-900">
              7. {text({ id: 'Hubungi Kami', zh: '聯絡我們', en: 'Contact Us' })}
            </h2>
            <p className="text-sm leading-relaxed text-gray-600">
              {text({
                id: 'Jika Anda memiliki pertanyaan tentang kebijakan privasi ini, silakan hubungi kami di:',
                zh: '若您對本隱私權條款有任何疑問，請透過電子郵件與我們聯繫：', en: 'If you have any questions about this privacy policy, please contact us at:'
              })}
            </p>
            <p className="text-sm font-semibold text-blue-600">
              admin@careapp.local
            </p>
          </section>

          <section className="border-t border-gray-100 pt-5 text-sm text-gray-600">
            <h2 className="font-bold text-gray-900">{text({ id: 'Kontak & Versi', zh: '聯絡方式與版本', en: 'Contact & Version' })}</h2>
            {/* 將聯絡我導向作者個人網站，提供完整簡介與聯繫方式 */}
            <p className="mt-2">{text({ id: 'Hubungi saya', zh: '聯絡我', en: 'Contact me' })}: <a className="font-semibold text-blue-600 underline" href={APP_AUTHOR_URL} target="_blank" rel="noreferrer">https://portfolio-author.github.io/</a></p>
            <p className="mt-1"><a className="text-blue-600 underline" href="https://github.com/portfolio-author" target="_blank" rel="noreferrer">GitHub / portfolio-author</a> · <ReleaseVersion /></p>
          </section>
        </article>
      </main>
    </div>
  )
}
