/*
檔案用途：顯示家健錄公開的服務條款與聯絡、版本資訊。
所在層：src/components 公開頁面層；未登入也能閱讀，不會讀取照護資料。
主要關聯：由 App.tsx 依 /terms 路徑呈現，使用 appInfo.ts 的統一版本與發布代號。
*/
import { useI18n } from '../../../lib/i18n'
import { LanguageSwitcher } from '../../../components/ui/LanguageSwitcher'
import { APP_NAME, APP_AUTHOR_URL } from '../../../lib/appInfo'
import { ReleaseVersion } from '../../../components/system/ReleaseVersion'

export function TermsPage() {
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
            <span className="inline-block rounded-lg bg-emerald-50 px-2.5 py-1 text-xs font-extrabold text-emerald-700">
              {text({ id: 'Syarat & Ketentuan Layanan', zh: '服務條款與合規說明' ,en: 'Terms of Service and Compliance Instructions' })}
            </span>
            <h1 className="mt-2 text-2xl font-black tracking-tight text-gray-900 md:text-3xl">
              {text({ id: 'Syarat & Ketentuan', zh: '服務條款' ,en: 'Terms of Service' })}
            </h1>
            <p className="mt-1 text-xs text-gray-500">
              {text({ id: 'Terakhir diperbarui: 27 Agustus 2026', zh: '最後更新日期：2026 年 8 月 27 日' ,en: "Terakhir diperbarui: 27 Agustus 2026" })}
            </p>
          </div>

          <hr className="border-gray-100" />

          {/* 1. Penerimaan Syarat */}
          <section className="space-y-2">
            <h2 className="text-base font-bold text-gray-900">
              1. {text({ id: 'Penerimaan Syarat', zh: '條款接受' ,en: 'Terms Acceptance' })}
            </h2>
            <p className="text-sm leading-relaxed text-gray-600">
              {/* 繁體中文註解：條款必須與首頁使用同一個品牌常數，印尼文同步更新為新英文識別 JiaJian Log。 */}
              {text({
                id: 'Dengan melanjutkan dari halaman masuk, Anda menyetujui untuk terikat oleh Syarat & Ketentuan JiaJian Log ini. Data kesehatan dan medis memerlukan persetujuan tegas terpisah berdasarkan Pemberitahuan Pengumpulan Data Pribadi.',
                zh: `當您從登入頁繼續使用「${APP_NAME}」時，即代表您同意並遵守本服務條款。健康與醫療資料另依《個人資料蒐集告知事項》取得明確同意。` ,en: 'Dengan continuing from halaman sign in, You agree for bound oleh Terms & Ketentuan JiaJian Log this. Data health and medis requires persepurpose tegas separate berdasarkan Pemberitahuan Collectoran Data Pribadi.'
              })}
            </p>
          </section>

          {/* 2. Penolakan Medis (Medical Disclaimer) */}
          <section className="space-y-2">
            <h2 className="text-base font-bold font-extrabold text-amber-800">
              2. {text({ id: 'Penolakan Medis (PENTING)', zh: '醫療免責聲明（重要）' ,en: 'Penolakan Medis (PENTING)' })}
            </h2>
            <div className="rounded-2xl bg-amber-50 p-4 border border-amber-200 text-sm leading-relaxed text-amber-900 space-y-2">
              <p className="font-bold">
                ⚠️ {text({
                  id: 'Layanan ini BUKAN perangkat medis dan BUKAN pengganti saran medis profesional.',
                  zh: '本服務非醫療器材，亦不可取代專業醫師之診斷與醫療建議。' ,en: 'This service is not a medical device, nor can it replace the diagnosis and medical advice of a professional doctor.'
                })}
              </p>
              <p>
                {text({
                  id: 'Aplikasi ini hanya berfungsi sebagai alat bantu pencatatan kesehatan mandiri dan perawatan keluarga. Evaluasi sistem atau label peringatan bukan merupakan diagnosis medis. Selalu konsultasikan dengan dokter sebelum mengubah dosis obat.',
                  zh: '本應用程式僅供自主健康紀錄與家庭照護對照之用。系統提示與分級警示並非醫療診斷。在調整任何藥物劑量或療程前，請務必諮詢專業醫師。' ,en: 'This app is only for autonomous health records and home care matching. System prompts and grading alerts are not medical diagnostics. Always consult a specialist before adjusting any medication dose or course of treatment.'
                })}
              </p>
            </div>
          </section>

          {/* 3. Keamanan Akun */}
          <section className="space-y-2">
            <h2 className="text-base font-bold text-gray-900">
              3. {text({ id: 'Keamanan Akun Pengguna', zh: '帳號與資料安全' ,en: 'Account and data security' })}
            </h2>
            <p className="text-sm leading-relaxed text-gray-600">
              {text({
                id: 'Pengguna bertanggung jawab untuk menjaga kerahasiaan akun Google mereka. Setiap tindakan yang dilakukan menggunakan akun Anda akan dianggap sebagai tindakan Anda.',
                zh: '使用者有責任妥善保管其 Google 登入帳號安全。任何透過該帳號進行之操作均視為使用者本人之行為。' ,en: 'It is the user’s responsibility to keep their Google sign in account secure. Any action taken through that account is considered to be the user’s own action.'
              })}
            </p>
          </section>

          {/* 4. Hak Pembatalan & Penghapusan */}
          <section className="space-y-2">
            <h2 className="text-base font-bold text-gray-900">
              4. {text({ id: 'Penghapusan Akun & Layanan', zh: '帳號刪除與服務變更' ,en: 'Account deletion and service changes' })}
            </h2>
            <p className="text-sm leading-relaxed text-gray-600">
              {text({
                id: 'Anda dapat menghentikan penggunaan layanan dan menghapus seluruh akun serta data pribadi kapan saja melalui menu Pengaturan di dalam aplikasi.',
                zh: '您可隨時於應用程式內之「設定」選單自主刪除帳號並清除所有個人紀錄，立即終止服務。' ,en: 'You can terminate the service immediately by deleting your account and clearing all personal records at any time from the Settings menu in the app.'
              })}
            </p>
          </section>

          {/* 5. Biaya Layanan：對應登入頁費用說明區塊（issue #444），目前系統無任何付費功能或訂閱機制 */}
          <section className="space-y-2">
            <h2 className="text-base font-bold text-gray-900">
              5. {text({ id: 'Biaya Layanan', zh: '服務費用' ,en: "Biaya Layanan" })}
            </h2>
            <p className="text-sm leading-relaxed text-gray-600">
              {text({
                id: 'Saat ini layanan ini tidak memungut biaya apa pun dan tidak memiliki fitur berbayar atau langganan. Jika ini berubah di masa depan, kami akan mengumumkannya terlebih dahulu di halaman ini.',
                zh: '本服務目前完全免費，不含任何付費功能或訂閱機制。未來若有異動，我們會事先於本頁公告。' ,en: "When this layanan this not memungut biaya apa pun and not memiliki fthatr berbayar or langganan. If this berubah in masa depan, we will mengumumkannya terlebih dahulu in halaman this."
              })}
            </p>
          </section>

          {/* 6. Hubungi Kami */}
          <section className="space-y-2">
            <h2 className="text-base font-bold text-gray-900">
              6. {text({ id: 'Hubungi Kami', zh: '聯絡方式' ,en: 'Hubungi Kami' })}
            </h2>
            <p className="text-sm leading-relaxed text-gray-600">
              {text({
                id: 'Untuk pertanyaan atau saran mengenai Syarat & Ketentuan ini, silakan hubungi:',
                zh: '若對本服務條款有任何疑問，請聯繫：' ,en: 'Untuk pertanyaan or saran mengenai Terms & Ketentuan this, please contact:'
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
