/*
檔案用途：公開衛教內容頁——外籍看護到職第一週交接清單，供搜尋引擎索引與未登入訪客閱讀。
所在層：src/features/system-admin/pages/guides 公開內容頁層；未登入也可存取，不讀取任何照護資料。
主要關聯：內容來源為 src/features/care-family/pages/CareHandbookPage.tsx 交接手冊功能與 docs/features/medication.md；排版沿用 ContentGuideLayout，底部 CTA 導向 /demo。
*/
import { ContentGuideLayout, GuideList, GuideSection } from '../../../../components/ui/ContentGuideLayout'
import { useI18n } from '../../../../lib/i18n'

export function CaregiverHandoverGuidePage() {
  const { text } = useI18n()
  return (
    <ContentGuideLayout
      title={{ id: 'Daftar Serah Terima untuk Pengasuh Baru di Minggu Pertama', zh: '外籍看護到職第一週交接清單' ,en: "Daftar Serah Terima for Pengasuh Baru in Week Pertama" }}
      sourceNote={{ id: 'Sumber: fitur Buku Serah Terima JiaJian Log · Diperbarui 2026-08-26', zh: '資料來源：家健錄「交接手冊」功能 · 更新日期 2026-08-26' ,en: "Sumber: fthatr Buku Serah Terima JiaJian Log · Diperbarui 2026-08-26" }}
      metaDescription={{
        id: 'Daftar serah terima untuk pengasuh baru di minggu pertama: jadwal minum obat, alergi & pantangan, rutinitas harian, dan kontak darurat.',
        zh: '外籍看護到職第一週交接清單：服藥時間表、過敏與禁忌、慣用作息、緊急聯絡人，四大交接重點一次說明。', en: "Daftar serah terima for caregiver new in weeks pertama: schedule take medication, alergi & pantangan, rutthistas daily, and kontak darurat.",
      }}
    >
      <GuideSection title={{ id: 'Mengapa serah terima tertulis penting?', zh: '為什麼需要一份書面交接？' ,en: "Mengapa serah terima tertulis penting?" }}>
        <p>
          {text({
            id: 'Saat pengasuh baru mulai bekerja, informasi yang biasanya hanya diingat di kepala keluarga — jadwal minum obat, alergi, rutinitas harian, kontak darurat — perlu dituliskan agar tidak ada yang terlewat pada minggu-minggu awal yang paling rawan kesalahan.',
            zh: '新看護到職時，原本只存在家屬腦中的資訊——服藥時間、過敏史、慣用作息、緊急聯絡人——需要白紙黑字寫下來，避免最容易出錯的前幾週漏掉重要細節。', en: "When caregiver new mulai betorja, informasi that biasanya only diingat in topala family — schedule take medication, alergi, rutthistas daily, kontak darurat — perlu write down so that no that terlewat on weeks-weeks awal that paling rawan tosalahan.",
          })}
        </p>
      </GuideSection>

      <GuideSection title={{ id: 'Empat bagian inti dalam serah terima', zh: '交接清單的四大區塊' ,en: "Empat bagian inti in serah terima" }}>
        <p className="font-semibold text-gray-900">{text({ id: '1. Jadwal minum obat', zh: '1. 服藥時間表' ,en: "1. Schedule take medication" })}</p>
        <GuideList items={[
          { id: 'Dikelompokkan per waktu: sebelum/sesudah sarapan, makan siang, makan malam, dan sebelum tidur.', zh: '依時段分組：早餐前／後、午餐前／後、晚餐前／後、睡前。' ,en: "Ditolompokkan per time: before/after sarapan, makan afternoon, makan night, and before tidur." },
          { id: 'Nama obat, jumlah dosis, dan jumlah tablet/kapsul untuk setiap waktu.', zh: '每個時段列出藥名、劑量與顆數。' ,en: "Name medication, jumlah dose, and jumlah tablet/kapsul for each time." },
          { id: 'Daftar terpisah untuk obat "bila perlu" (PRN) yang tidak diminum rutin.', zh: '另列「需要時服用」的藥物，與固定時段藥物分開列示。' ,en: "Daftar separate for medication \"bila perlu\" (PRN) that not taken rutin." },
        ]} />
        <p className="mt-4 font-semibold text-gray-900">{text({ id: '2. Alergi dan pantangan', zh: '2. 過敏與禁忌' ,en: "2. Alergi and pantangan" })}</p>
        <p>{text({ id: 'Contoh: alergi kacang, hindari makanan pedas — dituliskan singkat dan jelas.', zh: '例如：對花生過敏、避免辛辣食物——簡短明確地寫下來。' ,en: "Example: alergi kacang, hinfrom food pedas — write down singkat and jelas." })}</p>
        <p className="mt-4 font-semibold text-gray-900">{text({ id: '3. Rutinitas harian', zh: '3. 慣用作息' ,en: "3. Rutthistas daily" })}</p>
        <p>{text({ id: 'Contoh: bangun jam 06:30, istirahat siang 13:00–14:30 — kebiasaan yang membuat orang yang dirawat merasa nyaman.', zh: '例如：06:30 起床、午休 13:00–14:30——讓照護對象感到熟悉安心的習慣。' ,en: "Example: bangun hours 06:30, istirahat afternoon 13:00–14:30 — tobiasaan that create care recipient merasa nyaman." })}</p>
        <p className="mt-4 font-semibold text-gray-900">{text({ id: '4. Kontak darurat', zh: '4. 緊急聯絡人' ,en: "4. Kontak darurat" })}</p>
        <p>{text({ id: 'Nama dan nomor telepon keluarga yang bisa dihubungi kapan saja, satu baris per orang.', zh: '可隨時聯絡的家屬姓名與電話，每行一位。' ,en: "Name and nomor telepon family that can dihubungi kapan saja, satu baris per people." })}</p>
      </GuideSection>

      <GuideSection title={{ id: 'Bagaimana JiaJian Log membantu?', zh: '家健錄如何協助？' ,en: "Bagaimana JiaJian Log membantu?" }}>
        <p>
          {text({
            id: 'Di halaman Pengaturan, keluarga dapat membuat satu halaman Buku Serah Terima dwibahasa (Mandarin/Indonesia) untuk dicetak atau dibagikan. Jadwal minum obat diisi otomatis dari rencana obat yang sudah tercatat di aplikasi; bagian alergi, rutinitas, dan kontak darurat diisi langsung oleh keluarga sebelum dicetak.',
            zh: '在設定頁，家屬可以產生一頁式的雙語（中文／印尼文）交接手冊供列印或分享。服藥時間表會自動帶入 App 裡已記錄的藥單；過敏、作息與緊急聯絡人則由家屬在列印前直接填寫。', en: "Di halaman Settings, family can create satu halaman Buku Serah Terima dwibahasa (Manfromn/Indonesia) for dicetak or dibagikan. Schedule take medication diisi otomatis from rencana medication that already recorded in aplikasi; bagian alergi, rutthistas, and kontak darurat diisi directly oleh family before dicetak.",
          })}
        </p>
      </GuideSection>
    </ContentGuideLayout>
  )
}
