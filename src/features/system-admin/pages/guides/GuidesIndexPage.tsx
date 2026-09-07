/*
檔案用途：公開衛教中樞頁——列舉所有免登入衛教內容頁，供搜尋引擎索引與訪客瀏覽，無需認證。
所在層：src/features/system-admin/pages/guides 公開內容頁層；未登入也可存取，不讀取任何照護資料。
主要關聯：四個子衛教頁（BloodPressure722GuidePage、MedicationScheduleGuidePage、CaregiverHandoverGuidePage、PetChronicDiseaseGuidePage）；排版沿用 ContentGuideLayout。
*/
import { useI18n } from '../../../../lib/i18n'
import { useEffect, useRef } from 'react'
import { PublicBrandHeader } from '../../../../components/ui/PublicBrandHeader'
import { ContactAndVersionFooter } from '../../../../components/system/ContactAndVersionFooter'

export function GuidesIndexPage() {
  const { text, locale } = useI18n()
  // 記錄是否由本元件建立 meta tag；若已存在就只更新內容，卸載時也不移除，避免破壞其他頁面的 SEO。
  const metaTagCreatedRef = useRef(false)

  useEffect(() => {
    document.title = text({ id: 'Panduan Edukatif JiaJian Log', zh: '家健錄公開衛教' ,en: "Panduan Edukatif JiaJian Log" })
    const metaDescription = text({
      id: 'Panduan edukatif kesehatan lansia dan hewan peliharaan: tekanan darah, jadwal obat, operan perawat, dan pencatatan harian. Gratis dan tanpa login.',
      zh: '家健錄免登入公開衛教：長輩血壓量測、服藥時段、看護交接、寵物慢性病紀錄等實用指南。', en: "Panduan edukatif tosehatan lansia and animal peliharaan: blood pressure, schedule medication, operan perawat, and penrecordan daily. Gratis and without login.",
    })
    let metaTag = document.querySelector("meta[name='description']")
    // 若 meta tag 不存在，才由本元件建立；否則只更新既有的，卸載時也不移除。
    if (!metaTag) {
      metaTag = document.createElement('meta')
      metaTag.setAttribute('name', 'description')
      document.head.appendChild(metaTag)
      metaTagCreatedRef.current = true
    }
    metaTag.setAttribute('content', metaDescription)

    return () => {
      if (metaTagCreatedRef.current && metaTag?.parentElement) {
        metaTag.parentElement.removeChild(metaTag)
      }
    }
  }, [locale, text])

  const guides = [
    {
      title: { id: 'Prinsip 722 Pengukuran Tekanan Darah di Rumah', zh: '居家血壓 722 原則' ,en: "Prinsip 722 Pengukuran Blood pressure in Rumah" },
      description: {
        id: 'Panduan pengukuran tekanan darah sesuai standar rumah tangga (7 hari, 2 sesi/hari, 2 kali/sesi) dan tabel referensi tekanan darah normal.',
        zh: '按照家庭標準量血壓的 722 原則與家庭血壓參考表，認識正常血壓範圍。', en: "Panduan pengukuran blood pressure sesuai standar rumah tangga (7 days, 2 sesi/days, 2 kali/sesi) and tabel referensi blood pressure normal.",
      },
      emoji: '🩺',
      href: '/guides/blood-pressure-722',
      color: 'rose',
    },
    {
      title: { id: 'Jadwal Waktu Minum Obat Lansia dan Prinsip Mencatat Dosis Terlewat', zh: '長輩用藥時段對照與漏藥處理原則' ,en: "Schedule Time Take Medication Lansia and Prinsip Menrecord Dose Terlewat" },
      description: {
        id: 'Enam waktu minum obat (sebelum/sesudah makan, sebelum tidur) dan cara mencatat dosis terlewat tanpa menghitung persentase kepatuhan otomatis.',
        zh: '六個常用服藥時段的對照，以及為何 App 只記錄實際情形而不自動換算遵從率百分比。', en: "Enam time take medication (before/after makan, before tidur) and cara record dose terlewat without menghthatng persentase topatuhan otomatis.",
      },
      emoji: '💊',
      href: '/guides/medication-schedule',
      color: 'blue',
    },
    {
      title: { id: 'Daftar Serah Terima untuk Pengasuh Baru di Minggu Pertama', zh: '外籍看護到職第一週交接清單' ,en: "Daftar Serah Terima for Pengasuh Baru in Week Pertama" },
      description: {
        id: 'Checklist empat bagian (jadwal obat, alergi, rutinitas harian, kontak darurat) untuk membantu pengasuh baru memulai dengan informasi lengkap.',
        zh: '給新看護的四大交接重點：服藥時間、過敏禁忌、作息習慣、緊急聯絡人。', en: "Checklist empat bagian (schedule medication, alergi, rutthistas daily, kontak darurat) for membantu caregiver new memulai with informasi lengkap.",
      },
      emoji: '📋',
      href: '/guides/caregiver-handover',
      color: 'amber',
    },
    {
      title: { id: 'Item Pencatatan Harian untuk Kucing Ginjal Kronis / Anjing-Kucing Diabetes', zh: '慢性腎病貓／糖尿病犬貓的居家紀錄項目' ,en: "Item Penrecordan Harian for Cat Ginjal Kronis / Dog-Cat Diabetes" },
      description: {
        id: 'Item pencatatan harian untuk hewan kronis (cairan infus, insulin, gula darah, nafsu makan) yang membantu dokter hewan memantau perkembangan.',
        zh: '慢性腎病貓與糖尿病犬貓要記錄的項目：飲水量、排尿、輸液、胰島素、血糖、食慾等。', en: "Item penrecordan daily for animal kronis (fluid infus, insulin, gula blood, nafsu makan) that membantu dokter animal memantau pertombangan.",
      },
      emoji: '🐾',
      href: '/guides/pet-chronic-disease',
      color: 'green',
    },
    {
      title: { id: 'Cara Mengundang Keluarga ke JiaJian Log', zh: '如何邀請家人使用家健錄', en: 'How to invite family to JiaJian Log' },
      description: {
        id: 'Panduan memilih jenis undangan, membagikan tautan, mengonfirmasi akun, dan mencabut akses dengan aman.',
        zh: '教你選對邀請類型、分享連結、確認帳號，以及安全撤銷邀請或照護權限。',
        en: 'Learn how to choose an invitation type, share a link, approve an account, and safely revoke an invitation or care access.',
      },
      // 使用方向符號作為純文字導視，不新增跨裝置會變形的 emoji 圖示。
      emoji: '↗',
      href: '/guides/family-invitations',
      color: 'indigo',
    },
  ]

  const colorMap = {
    rose: { bg: 'bg-rose-50', border: 'border-rose-200', text: 'text-rose-900', hover: 'hover:border-rose-300 hover:shadow-rose-200/30' },
    blue: { bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-900', hover: 'hover:border-blue-300 hover:shadow-blue-200/30' },
    amber: { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-900', hover: 'hover:border-amber-300 hover:shadow-amber-200/30' },
    green: { bg: 'bg-green-50', border: 'border-green-200', text: 'text-green-900', hover: 'hover:border-green-300 hover:shadow-green-200/30' },
    indigo: { bg: 'bg-indigo-50', border: 'border-indigo-200', text: 'text-indigo-900', hover: 'hover:border-indigo-300 hover:shadow-indigo-200/30' },
  }

  return (
    <div className="min-h-dvh flex flex-col items-center justify-between px-6 py-6 bg-gradient-to-b from-slate-50 via-rose-50/20 to-indigo-50/30 text-slate-900 selection:bg-rose-100 overflow-y-auto">
      <PublicBrandHeader className="mb-6 w-full max-w-2xl rounded-full border border-slate-200/80 bg-white/80 px-4 py-2 shadow-xs backdrop-blur-md" />

      <main className="w-full max-w-2xl flex-1 space-y-6">
        <div className="text-center space-y-2 mb-8">
          <h1 className="text-3xl font-black text-slate-900">
            {text({ id: 'Panduan Edukasi Kesehatan', zh: '衛教資源中心' ,en: "Panduan Edukasi Kesehatan" })}
          </h1>
          <p className="text-sm text-slate-600">
            {text({
              id: 'Panduan gratis untuk keluarga yang merawat lansia dan hewan peliharaan kronis. Baca tanpa perlu login.',
              zh: '照護長輩與寵物的實用指南，免費、免登入，隨時閱讀。', en: "Panduan gratis for family that merawat lansia and animal peliharaan kronis. Baca without perlu login.",
            })}
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4">
          {guides.map((guide) => {
            const colors = colorMap[guide.color as keyof typeof colorMap]
            return (
              <a
                key={guide.href}
                href={guide.href}
                className={`block p-5 rounded-2xl border-2 transition-all hover:shadow-lg ${colors.bg} ${colors.border} ${colors.hover}`}
              >
                <div className="flex gap-4">
                  <div className="text-3xl flex-shrink-0">{guide.emoji}</div>
                  <div className="flex-1 min-w-0">
                    <h2 className={`font-bold text-base mb-1 ${colors.text}`}>
                      {text(guide.title)}
                    </h2>
                    <p className="text-sm text-slate-600 leading-relaxed">
                      {text(guide.description)}
                    </p>
                  </div>
                  <div className="text-2xl flex-shrink-0 text-slate-400 self-center">→</div>
                </div>
              </a>
            )
          })}
        </div>

        <div className="mt-8 p-5 rounded-xl bg-amber-50 border border-amber-200">
          <p className="text-sm text-amber-900">
            <span className="font-semibold">⚠️ {text({ id: 'Perhatian', zh: '重要聲明' ,en: "Perhatian" })}</span>
            <br />
            {text({
              id: 'Panduan ini hanya edukasi kesehatan umum, bukan saran medis. Untuk keputusan kesehatan, selalu konsultasi dengan dokter atau tenaga medis profesional.',
              zh: '本頁面為健康教育資訊，非醫療建議。任何健康決策請洽詢醫師或醫療專業人員。', en: "Panduan this only edukasi tosehatan umum, bukan saran medis. Untuk toputusan tosehatan, selalu konsultasi with dokter or tenaga medis profesional.",
            })}
          </p>
        </div>
      </main>

      <footer className="w-full max-w-2xl text-center space-y-4 pt-6 pb-2">
        <p className="text-xs text-slate-500">
          {text({
            id: 'Ingin mencoba? Buka demo tanpa login atau login untuk mulai mencatat data keluarga Anda.',
            zh: '想要試用？點擊試用按鈕體驗展示版本，或登入開始記錄您的照護資料。', en: "Ingin mencoba? Open demo without login or login for mulai record data family You.",
          })}
        </p>
        <div className="flex flex-col gap-2">
          <a
            href="/demo"
            className="inline-block px-6 py-2.5 rounded-full bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold transition-colors"
          >
            ✨ {text({ id: 'Coba Demo', zh: '試用看看' ,en: "Coba Demo" })}
          </a>
          <a
            href="/"
            className="inline-block px-6 py-2 rounded-full border border-slate-300 hover:border-slate-400 text-slate-700 hover:text-slate-900 text-sm font-medium transition-colors"
          >
            {text({ id: 'Kembali', zh: '返回首頁' ,en: "Back" })}
          </a>
        </div>

        <ContactAndVersionFooter className="text-slate-400" />
      </footer>
    </div>
  )
}
