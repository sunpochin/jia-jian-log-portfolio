/*
檔案用途：公開揭示健康資料蒐集、利用與當事人權利，供同意畫面直接連結閱讀。
所在層：src/features/system-admin/pages 公開頁面層；未登入也可存取，不讀取任何照護資料。
主要關聯：HealthDataConsentScreen 與 PrivacyPage 提供此頁連結；版面版本與資料庫 legal_consents.health_consent_version
（見 lib/legalConsent.ts 的 CURRENT_HEALTH_CONSENT_VERSION）一起隨 feature/medication-photo-ocr 升版為 2026-08-26。
藥袋 OCR 的去識別化措辭為「事後過濾／捨棄病人姓名」，不是送出前遮蔽；細節見 growth-roadmap.md P0-1 Stage 0 決策修正。
*/
import { useI18n } from '../../../lib/i18n'
import { LanguageSwitcher } from '../../../components/ui/LanguageSwitcher'

export function HealthDataNoticePage() {
  const { text } = useI18n()
  return <div className="min-h-dvh bg-gray-50 text-gray-900">
    <header className="sticky top-0 z-10 border-b border-gray-200 bg-white px-4 py-3"><div className="mx-auto flex max-w-2xl items-center justify-between"><a href="/" className="text-sm font-bold text-gray-700">← {text({ id: 'Kembali ke Beranda', zh: '返回首頁', en: 'Back to Home' })}</a><LanguageSwitcher /></div></header>
    <main className="mx-auto max-w-2xl px-5 py-8"><article className="space-y-6 rounded-3xl bg-white p-6 shadow-sm md:p-8">
      <div><p className="text-xs font-bold text-indigo-700">{text({ id: 'Versi 2026-08-26', zh: '版本 2026-08-26', en: 'Version 2026-08-26' })}</p><h1 className="mt-2 text-2xl font-black">{text({ id: 'Pemberitahuan Pengumpulan Data Pribadi', zh: '個人資料蒐集告知事項', en: 'Personal Information Collection Notice' })}</h1></div>
      <NoticeSection title={text({ id: 'Pengumpul dan tujuan', zh: '蒐集者與目的', en: 'Collector and purpose' })} body={text({ id: 'JiaJian Log mengumpulkan data untuk membantu keluarga mencatat, meninjau tren, dan menjalankan perawatan kesehatan keluarga.', zh: '家健錄為協助家庭記錄、查看趨勢及進行家庭照護而蒐集資料。', en: 'JiaJian Log collects information to help families record health data, review trends, and provide family care.' })} />
      <NoticeSection title={text({ id: 'Kategori data', zh: '資料類別', en: 'Data categories' })} body={text({ id: 'Data akun Google (email dan nama tampilan), tekanan darah, denyut nadi, obat, catatan perawatan, nama orang yang dirawat, serta foto kemasan obat dan teks hasil pengenalannya jika Anda menggunakan fitur pindai kemasan obat.', zh: 'Google 帳號資料（電子郵件、顯示名稱）、血壓、心跳、藥物、照護紀錄、照護對象姓名，以及若您使用拍照建立藥單功能所產生的藥袋照片與辨識文字。', en: 'Google account data (email address and display name), blood pressure, heart rate, medication, care records, the care recipient’s name, and medication package photos plus recognized text when you use the medication scanning feature.' })} />
      {/* 為什麼明確寫「整張圖送出、事後過濾」：辨識姓名本身需要先取得完整影像，送出前遮蔽無法可靠完成；同時揭露照片只在單次請求記憶體中存在。 */}
      <NoticeSection title={text({ id: 'Jangka waktu, wilayah, penerima, dan cara penggunaan', zh: '利用期間、地區、對象與方式', en: 'Retention period, location, recipients, and use' })} body={text({ id: 'Data disimpan selama akun digunakan hingga dihapus. Data diproses melalui layanan yang diperlukan untuk menjalankan JiaJian Log dan hanya dapat diakses oleh Anda atau pengasuh yang diberi izin secara tegas. Jika Anda menggunakan pindai kemasan obat, seluruh foto kemasan obat dikirim ke pemroses pihak ketiga di luar negeri, Google Cloud Vision (Google LLC, Amerika Serikat), untuk pengenalan teks; hasil pengenalan yang cocok dengan nama pasien disaring dan dibuang oleh sistem kami setelah diterima, dan foto tersebut tidak pernah disimpan ke penyimpanan berkas kami — hanya ada di memori server selama satu permintaan lalu langsung dihapus.', zh: '資料於帳號使用期間保存至刪除為止；透過運行家健錄所需服務處理，僅供本人或被明確授權的照護者依系統功能存取。若您使用拍照建立藥單功能，整張藥袋照片將傳送至委外境外受託處理者 Google Cloud Vision（Google LLC，美國）進行文字辨識；辨識結果送回後，比對到病人姓名的部分會由我方系統過濾捨棄，該照片本身不會存進我方任何檔案儲存空間，只存在伺服器處理單次請求的記憶體中，處理完立即刪除。', en: 'Data is kept while your account is in use and until it is deleted. Data is processed by services required to run JiaJian Log and is accessible only to you or explicitly authorized caregivers. If you scan a medication package, the entire photo is sent to Google Cloud Vision (Google LLC, United States), an overseas third-party processor, for text recognition. After the result is returned, our system filters and discards text lines matching the patient’s name; the patient’s name is never stored in our database or displayed, and the photo is kept only in server memory for one request before being discarded.' })} />
      <NoticeSection title={text({ id: 'Hak dan dampak penolakan', zh: '當事人權利與拒絕的影響', en: 'Rights of the data subject and impact of refusal' })} body={text({ id: 'Anda dapat meminta akses, salinan, perbaikan, penghentian penggunaan, atau penghapusan data. Jika tidak setuju, JiaJian Log tidak dapat membuat atau menampilkan catatan kesehatan.', zh: '您可請求查詢、閱覽、製給複製本、補充或更正、停止處理／利用及刪除資料；若不同意，家健錄無法建立或顯示健康紀錄。', en: 'You may request access, a copy, correction, suspension of use, or deletion of your data. If you do not agree, JiaJian Log cannot create or display health records.' })} />
      <p className="border-t pt-5 text-sm text-gray-600">{text({ id: 'Pertanyaan tentang data pribadi: ', zh: '個資相關問題：', en: 'Questions about personal information: ' })}<a className="font-bold text-blue-700 underline" href="mailto:admin@careapp.local">admin@careapp.local</a></p>
    </article></main>
  </div>
}

function NoticeSection({ title, body }: { title: string; body: string }) {
  return <section><h2 className="font-bold">{title}</h2><p className="mt-2 text-sm leading-6 text-gray-700">{body}</p></section>
}
