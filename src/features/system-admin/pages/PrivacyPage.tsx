/*
檔案用途：顯示家健錄公開的隱私權條款與聯絡、版本資訊。
所在層：src/features/system-admin/pages 公開頁面層；未登入也能閱讀，不會讀取照護資料。
主要關聯：由 App.tsx 依 /privacy 路徑呈現，使用 appInfo.ts 的統一版本與發布代號。
2026-08-26 新增藥品照片委外辨識（Google Cloud Vision）揭露段落，對應 issue #423 決策；
同日修正措辭為「事後過濾／捨棄姓名」（原「送出前遮蔽」在技術上有雞生蛋問題，已放棄），
並改為暫存照片全程不落地 Storage。DB 端 legal_consents 同意版本已隨 feature/medication-photo-ocr 升版。
2026-09-06 新增 Vercel Web Analytics 頁面瀏覽與六個匿名漏斗事件揭露，對應 issue #438；
隱私政策版本由資料庫 migration 升為 2026-09-06，健康資料同意版本不變。
*/
import { useI18n } from '../../../lib/i18n'
import { LanguageSwitcher } from '../../../components/ui/LanguageSwitcher'
import { ReleaseVersion } from '../../../components/system/ReleaseVersion'
import { APP_AUTHOR_URL } from '../../../lib/appInfo'

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
              {text({ id: 'Privasi & Keamanan Data', zh: '隱私權與資料安全' ,en: 'Privacy & Keamanan Data' })}
            </span>
            <h1 className="mt-2 text-2xl font-black tracking-tight text-gray-900 md:text-3xl">
              {text({ id: 'Kebijakan Privasi', zh: '隱私權條款' ,en: 'Kebijakan Privacy' })}
            </h1>
            <p className="mt-1 text-xs text-gray-500">
              {text({ id: 'Terakhir diperbarui: 6 September 2026', zh: '最後更新日期：2026 年 9 月 6 日' ,en: 'Last updated: September 6, 2026' })}
            </p>
          </div>

          <hr className="border-gray-100" />

          {/* 1. Pengumpulan Data */}
          <section className="space-y-2">
            <h2 className="text-base font-bold text-gray-900">
              1. {text({ id: 'Informasi yang Kami Kumpulkan', zh: '我們收集的資料' ,en: 'Information we collect' })}
            </h2>
            <p className="text-sm leading-relaxed text-gray-600">
              {text({
                id: 'Untuk menyediakan layanan pemantauan kesehatan keluarga, kami mengumpulkan data berikut:',
                zh: '為了提供家庭健康紀錄與趨勢分析服務，本系統會收集以下資料：' ,en: 'In order to provide family health records and trend analysis services, the system collects the following data:'
              })}
            </p>
            <ul className="list-disc pl-5 text-sm leading-relaxed text-gray-600 space-y-1">
              <li>
                <span className="font-semibold">{text({ id: 'Informasi Akun Google:', zh: 'Google 帳號資訊：' ,en: 'Google Account Information:' })}</span>{' '}
                {text({ id: 'Alamat email dan nama tampilan profil Google.', zh: '電子郵件地址與 Google 帳號顯示名稱。' ,en: 'Alamat email and nama tampilan profil Google.' })}
              </li>
              <li>
                <span className="font-semibold">{text({ id: 'Data Catatan Kesehatan:', zh: '健康紀錄資料：' ,en: 'Health Record Data:' })}</span>{' '}
                {text({ id: 'Tekanan darah sistolik, diastolik, denyut nadi, dan waktu pengukuran.', zh: '收縮壓、舒張壓、心跳數值與量測時間戳記。' ,en: 'Systolic, diastolic, heartbeat values and measurement timestamps.' })}
              </li>
              <li>
                <span className="font-semibold">{text({ id: 'Foto Kemasan Obat:', zh: '藥品／藥袋照片：' ,en: "Photo Kemasan Medication:" })}</span>{' '}
                {text({ id: 'Jika Anda menggunakan fitur pindai kemasan obat, kami menyimpan sementara foto kemasan obat dan teks hasil pengenalannya untuk membuat draf resep.', zh: '若您使用拍照建立藥單功能，我們會暫存藥袋照片與辨識出的文字內容，用於產生藥單草稿。' ,en: "If You menggunakan fthatr pindai tomasan medication, we saving temporarily photo tomasan medication and teks hasil pengenalannya for create draf resep." })}
              </li>
            </ul>
          </section>

          {/* 2. 藥品照片辨識與委外處理 */}
          <section className="space-y-2">
            <h2 className="text-base font-bold text-gray-900">
              2. {text({ id: 'Pemindaian Foto Obat dan Pemrosesan Pihak Ketiga', zh: '藥品照片辨識與委外處理' ,en: "Pemindaian Photo Medication and Pemrosesan Pihak Ketiga" })}
            </h2>
            <p className="text-sm leading-relaxed text-gray-600">
              {text({
                // 為什麼保留完整影像送辨識：姓名欄位需要由辨識結果比對後過濾，送出前遮蔽無法可靠定位；照片本身不落地保存。
                id: 'Jika Anda menggunakan fitur "Pindai Kemasan Obat untuk Membuat Resep", seluruh foto kemasan obat akan dikirim langsung ke layanan pengenalan teks pihak ketiga, Google Cloud Vision (Google LLC, Amerika Serikat), untuk mendapatkan nama obat, dosis, dan frekuensi. Setelah hasil pengenalan diterima, sistem kami akan secara otomatis menyaring dan membuang baris teks yang cocok dengan nama pasien sebelum disimpan atau ditampilkan — nama pasien tidak pernah disimpan ke basis data atau ditampilkan di layar. Foto sementara tidak pernah disimpan ke penyimpanan berkas kami; foto hanya ada di memori server selama satu permintaan pemrosesan dan langsung dibuang setelah pengenalan berhasil atau gagal. Hasil pengenalan selalu ditampilkan sebagai "draf" dan harus Anda konfirmasi satu per satu sebelum disimpan sebagai resep resmi.',
                zh: '若您使用「拍照建立藥單」功能，整張藥袋照片會直接送至委外文字辨識服務 Google Cloud Vision（Google LLC，美國）以取得藥名、劑量與頻次等文字內容；辨識結果送回後，由我方系統自動過濾並捨棄其中比對到病人姓名的文字行，姓名本身不會被寫入資料庫，也不會顯示在畫面上。暫存照片不會存進我方任何檔案儲存空間，只在伺服器處理單次請求時存在於記憶體中，辨識完成或失敗後立即釋放。辨識結果一律以「草稿」呈現，需經您逐項確認後才會寫入正式藥單。',
                en: 'If you use the "Scan Medication Package to Create a Prescription" feature, the entire package photo is sent directly to Google Cloud Vision (Google LLC, United States), an overseas third-party text-recognition service, to identify the medication name, dosage, and frequency. After the result is returned, our system filters and discards text lines matching the patient’s name before any result is stored or displayed. The patient’s name is never stored in our database or shown on screen. The temporary photo is never saved to our file storage; it exists only in server memory for one request and is discarded after recognition succeeds or fails. Recognition results are always shown as a draft and must be confirmed item by item before they become an official prescription.'
              })}
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-bold text-gray-900">{text({ id: 'Persetujuan data kesehatan', zh: '健康資料明確同意' ,en: 'Health Information Explicit Consent' })}</h2>
            <p className="text-sm leading-relaxed text-gray-600">{text({ id: 'Sebelum catatan kesehatan dibuat atau ditampilkan, JiaJian Log meminta persetujuan terpisah. Jika Anda mengelola data orang lain, gunakan status perwakilan yang berwenang dan catat dasar kewenangannya.', zh: '建立或顯示健康紀錄前，家健錄會另行取得明確同意；若代管他人資料，須以具授權代理人身分並記錄授權依據。' ,en: 'Before creating or displaying a health record, the family health record will obtain explicit consent separately, and if the information of others is hosted, it must be in the capacity of an authorized agent and record the authorization basis.' })}</p>
            <a href="/health-data-notice" className="text-sm font-semibold text-blue-700 underline">{text({ id: 'Pemberitahuan Pengumpulan Data Pribadi', zh: '個人資料蒐集告知事項' ,en: 'What we know about collecting personal data' })}</a>
          </section>

          {/* 3. 分析與自訂事件：只揭露不含健康資料的粗分類，不把分析用途藏在同意流程之外。 */}
          <section className="space-y-2">
            <h2 className="text-base font-bold text-gray-900">
              3. {text({ id: 'Analitik penggunaan dan peristiwa anonim', zh: '使用分析與匿名事件' ,en: 'Usage analytics and anonymous events' })}
            </h2>
            <p className="text-sm leading-relaxed text-gray-600">
              {text({
                id: 'JiaJian Log menggunakan Vercel Web Analytics untuk memahami kunjungan halaman dan apakah alur pengenalan membantu pengguna mulai mencatat. Peristiwa khusus hanya memakai nama peristiwa tetap serta klasifikasi kasar seperti bahasa, asal halaman login, atau jenis catatan; kegagalan analitik tidak menghentikan penyimpanan catatan kesehatan.',
                zh: '家健錄使用 Vercel Web Analytics 了解頁面瀏覽，以及介紹流程是否幫助使用者開始記錄。自訂事件只使用固定事件名稱與語言、登入入口、紀錄類型等粗分類；分析送出失敗不會阻擋任何健康紀錄儲存。',
                en: 'JiaJian Log uses Vercel Web Analytics to understand page visits and whether the introduction flow helps people start recording. Custom events use only fixed event names and coarse categories such as language, login entry, or record type; an analytics failure never blocks health-record saving.'
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

          {/* 4. Penggunaan Data */}
          <section className="space-y-2">
            <h2 className="text-base font-bold text-gray-900">
              4. {text({ id: 'Penggunaan Data', zh: '資料用途' ,en: 'Penggunaan Data' })}
            </h2>
            <p className="text-sm leading-relaxed text-gray-600">
              {text({
                id: 'Data Anda hanya digunakan untuk menampilkan grafik tren kesehatan dan memfasilitasi perawatan keluarga. Kami TIDAK PERNAH menjual atau membagikan data Anda kepada pihak ketiga untuk kepentingan iklan.',
                zh: '您的資料僅用於在系統內呈現健康趨勢圖表與方便家庭照護對照。我們「絕不」出售或提供您的資料給第三方用於廣告或行銷用途。' ,en: 'Your data will only be used to present health trend charts and home care matching within the system. We “never” sell or provide your information to third parties for advertising or marketing purposes.'
              })}
            </p>
          </section>

          {/* 5. Perlindungan & Keamanan */}
          <section className="space-y-2">
            <h2 className="text-base font-bold text-gray-900">
              5. {text({ id: 'Keamanan Data', zh: '資料安全與保護' ,en: 'Keamanan Data' })}
            </h2>
            <p className="text-sm leading-relaxed text-gray-600">
              {text({
                id: 'Semua data disimpan dengan aman di database Supabase yang terenkripsi SSL/TLS, dan dilindungi oleh Kebijakan Keamanan Tingkat Baris (Row Level Security / RLS) sehingga hanya anggota berwenang yang dapat mengaksesnya.',
                zh: '所有健康紀錄均安全儲存於經 SSL/TLS 加密的 Supabase 資料庫，並受資料庫層級 RLS 權限政策保護，僅限經授權之使用者或家庭成員存取。' ,en: 'All health records are securely stored in an SSL/TLS-encrypted Supabase database and are protected by a database-level RLS permission policy and are only accessible to authorized users or family members.'
              })}
            </p>
          </section>

          {/* 6. Hak Pengguna */}
          <section className="space-y-2">
            <h2 className="text-base font-bold text-gray-900">
              6. {text({ id: 'Hak Pengguna (Ekspor & Hapus)', zh: '使用者權利（匯出與自主刪除）' ,en: 'User rights (export and self-deletion)' })}
            </h2>
            <p className="text-sm leading-relaxed text-gray-600">
              {text({
                id: 'Anda memiliki kendali penuh atas data pribadi Anda:',
                zh: '您對自己的個人資料擁有完整的掌控權：' ,en: 'You have full control over your personal data:'
              })}
            </p>
            <ul className="list-disc pl-5 text-sm leading-relaxed text-gray-600 space-y-1">
              <li>
                <span className="font-semibold">{text({ id: 'Ekspor Data CSV:', zh: 'CSV 資料匯出：' ,en: 'CSV data export:' })}</span>{' '}
                {text({ id: 'Anda dapat mengunduh seluruh catatan tekanan darah dalam format CSV UTF-8 kapan saja dari menu Pengaturan.', zh: '您可隨時於設定頁面將所有血壓紀錄匯出為 UTF-8 CSV 檔案。' ,en: 'You can export all blood pressure records to a UTF-8 CSV file at any time on the settings page.' })}
              </li>
              <li>
                <span className="font-semibold">{text({ id: 'Hapus Akun Mandiri:', zh: '自主刪除帳號：' ,en: 'Delete Akun Mandiri:' })}</span>{' '}
                {text({ id: 'Anda dapat menghapus akun dan seluruh catatan data pribadi kapan saja di Pengaturan melalui fitur Hapus Akun.', zh: '您可隨時於設定頁面使用「刪除帳號」功能，永久清除您的個人檔案、權限與所有血壓紀錄。' ,en: 'You can permanently erase your profile, permissions, and all blood pressure records at any time by using the Delete Account feature on your settings page.' })}
              </li>
            </ul>
          </section>

          {/* 7. Hubungi Kami */}
          <section className="space-y-2">
            <h2 className="text-base font-bold text-gray-900">
              7. {text({ id: 'Hubungi Kami', zh: '聯絡我們' ,en: 'Hubungi Kami' })}
            </h2>
            <p className="text-sm leading-relaxed text-gray-600">
              {text({
                id: 'Jika Anda memiliki pertanyaan tentang kebijakan privasi ini, silakan hubungi kami di:',
                zh: '若您對本隱私權條款有任何疑問，請透過電子郵件與我們聯繫：' ,en: 'If You memiliki pertanyaan tentang kebijakan privasi this, please contact kami di:'
              })}
            </p>
            <p className="text-sm font-semibold text-blue-600">
              admin@careapp.local
            </p>
          </section>

          <section className="border-t border-gray-100 pt-5 text-sm text-gray-600">
            <h2 className="font-bold text-gray-900">{text({ id: 'Kontak & Versi', zh: '聯絡方式與版本' ,en: 'Kontak & Version' })}</h2>
            {/* 將聯絡我導向作者個人網站，提供完整簡介與聯繫方式 */}
            <p className="mt-2">{text({ id: 'Hubungi saya', zh: '聯絡我' ,en: 'Hubungi saya' })}: <a className="font-semibold text-blue-600 underline" href={APP_AUTHOR_URL} target="_blank" rel="noreferrer">https://portfolio-author.github.io/</a></p>
            <p className="mt-1"><a className="text-blue-600 underline" href="https://github.com/portfolio-author" target="_blank" rel="noreferrer">GitHub / portfolio-author</a> · <ReleaseVersion /></p>
          </section>
        </article>
      </main>
    </div>
  )
}
