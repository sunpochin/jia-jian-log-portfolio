/*
檔案用途：公開衛教內容頁——長輩用藥時段對照與漏藥處理原則，供搜尋引擎索引與未登入訪客閱讀。
所在層：src/features/system-admin/pages/guides 公開內容頁層；未登入也可存取，不讀取任何照護資料。
主要關聯：內容來源為 src/lib/medication/medicationSchedule.ts 與 docs/features/medication.md；排版沿用 ContentGuideLayout，底部 CTA 導向 /demo。
*/
import { ContentGuideLayout, GuideList, GuideSection } from '../../../../components/ui/ContentGuideLayout'
import { useI18n } from '../../../../lib/i18n'

export function MedicationScheduleGuidePage() {
  const { text } = useI18n()
  return (
    <ContentGuideLayout
      title={{ id: 'Jadwal Waktu Minum Obat Lansia dan Prinsip Mencatat Dosis Terlewat', zh: '長輩用藥時段對照與漏藥處理原則', en: 'Elderly Medication Schedules and Missed Dose Logging Principles' }}
      sourceNote={{ id: 'Sumber: modul obat Family Health Note · Diperbarui 2026-08-26', zh: '資料來源：家健錄藥單模組 · 更新日期 2026-08-26', en: 'Source: Family Health Note medication module · Updated 2026-08-26' }}
      metaDescription={{
        id: 'Enam waktu minum obat lansia (sebelum/sesudah makan, sebelum tidur) dan prinsip mencatat dosis yang terlewat tanpa menghitung persentase kepatuhan otomatis.',
        zh: '長輩用藥六大時段（餐前餐後、睡前）對照，以及漏藥該如何如實記錄、為什麼不自動換算服藥遵從率。',
        en: 'Six common medication time slots for seniors (before/after meals, bedtime) and how to record missed doses without automated compliance percentages.',
      }}
    >
      <GuideSection title={{ id: 'Enam waktu minum obat yang umum', zh: '常見的六個用藥時段', en: 'Six common medication time slots' }}>
        <p>
          {text({
            id: 'Resep dokter untuk lansia sering ditulis sebagai "sebelum/sesudah makan", tetapi keluarga dan pengasuh perlu menerjemahkannya ke waktu nyata sehari-hari. Enam waktu berikut adalah kerangka yang umum dipakai untuk mencatat:',
            zh: '醫師的醫囑常寫成「飯前／飯後」，但家屬與看護實際要對照成一天中的具體時段。以下六個時段是常用的紀錄架構：',
            en: 'Doctor prescriptions for seniors are often written as "before/after meals", but families and caregivers need to map them to real daily schedules. The following six slots provide a practical tracking framework:',
          })}
        </p>
        <GuideList items={[
          { id: 'Sebelum sarapan / Sesudah sarapan', zh: '早餐前／早餐後', en: 'Before breakfast / After breakfast' },
          { id: 'Sebelum makan siang / Sesudah makan siang', zh: '午餐前／午餐後', en: 'Before lunch / After lunch' },
          { id: 'Sebelum makan malam / Sesudah makan malam', zh: '晚餐前／晚餐後', en: 'Before dinner / After dinner' },
          { id: 'Sebelum tidur', zh: '睡前', en: 'Bedtime' },
        ]} />
        <p>
          {text({
            id: 'Selain jadwal tetap, ada juga obat "bila perlu" (PRN) yang diminum hanya saat gejala muncul, dicatat terpisah dengan waktu, jumlah, dan alasan pemakaian.',
            zh: '除了固定時段，也有「需要時服用」（PRN）的藥物，只在症狀出現時才服用，需另外記錄實際時間、劑量與服用原因。',
            en: 'In addition to fixed schedules, "as-needed" (PRN) medications are taken only when symptoms arise, and should be recorded separately with time, dose, and reason.',
          })}
        </p>
      </GuideSection>

      <GuideSection title={{ id: 'Mengapa jam 00:00–03:59 sering membingungkan?', zh: '為什麼凌晨 00:00–03:59 常讓人搞混？', en: 'Why is 00:00–03:59 often confusing?' }}>
        <p>
          {text({
            id: 'Untuk lansia yang tidur larut atau bangun tengah malam, dosis yang diminum antara pukul 00:00–03:59 sebaiknya tetap dihitung sebagai bagian dari hari sebelumnya (bukan hari baru), agar catatan harian tetap konsisten dengan rutinitas nyata, bukan mengikuti pergantian tanggal di kalender.',
            zh: '對於晚睡或半夜起床服藥的長輩，凌晨 00:00～03:59 服用的藥物，建議仍歸入前一天的紀錄（而非算成新的一天），讓每日紀錄符合實際作息，而不是機械式地跟著日曆換日。',
            en: 'For seniors who stay up late or wake up during the night, doses taken between 00:00 and 03:59 are best counted as part of the previous day’s log (rather than a new day), keeping daily records aligned with real sleep routines instead of calendar date changes.',
          })}
        </p>
      </GuideSection>

      <GuideSection title={{ id: 'Bagaimana mencatat dosis yang terlewat?', zh: '漏藥該怎麼記錄？', en: 'How should missed doses be recorded?' }}>
        <p>
          {text({
            id: 'Aplikasi ini hanya mencatat apa yang benar-benar diberikan — bukan menghitung otomatis persentase kepatuhan minum obat. Alasannya: persentase yang dihitung otomatis terlihat presisi tetapi bisa salah, dan dalam konteks pengobatan, informasi yang salah lebih berbahaya daripada tidak ada informasi sama sekali.',
            zh: '本 App 只如實記錄實際餵藥情形，不會自動換算「服藥遵從率」百分比。原因是：自動算出來的百分比看起來很精確，卻可能是錯的；在用藥情境下，錯誤的資訊比沒有資訊更危險。',
            en: 'This app only records what was actually administered — it does not automatically calculate medication adherence percentages. Automated percentages look precise but can be misleading; in medical contexts, incorrect data is more dangerous than no data at all.',
          })}
        </p>
        <p>
          {text({
            id: 'Jika satu dosis terlewat atau ditunda, keluarga/pengasuh dapat mencatatnya apa adanya (misalnya waktu sebenarnya diminum, atau ditandai belum diminum), lalu mendiskusikan pola yang muncul dengan dokter atau apoteker — aplikasi ini tidak menyarankan cara "mengganti" dosis yang terlewat.',
            zh: '若某次劑量漏服或延後服用，家屬／看護可以如實記錄（例如實際服用時間，或標記尚未服用），再把觀察到的型態拿去與醫師或藥師討論；App 本身不會建議如何「補服」漏掉的劑量。',
            en: 'If a dose is missed or delayed, families and caregivers can record the actual facts (e.g. actual time taken, or marked as not taken) and discuss observed patterns with a physician or pharmacist — the app does not offer advice on "making up" missed doses.',
          })}
        </p>
      </GuideSection>

      <GuideSection title={{ id: 'Bagaimana Family Health Note membantu?', zh: '家健錄如何協助？', en: 'How does Family Health Note help?' }}>
        <p>
          {text({
            id: 'Aplikasi mengelompokkan obat berdasarkan enam waktu di atas, mencatat dosis PRN secara terpisah dengan waktu dan alasan, serta hanya menampilkan "tercatat sebagai diminum" — tidak pernah mengklaim telah memverifikasi bahwa obat benar-benar tertelan.',
            zh: 'App 依上述六個時段分組管理藥物，PRN 劑量另外記錄實際時間與原因，畫面上只會顯示「已記錄為服用」，不會宣稱已確認長輩實際吞下藥物。',
            en: 'The app organizes medications into the six slots above, logs PRN doses with timestamps and reasons, and displays "recorded as taken" — never claiming to have verified that the medication was actually swallowed.',
          })}
        </p>
      </GuideSection>
    </ContentGuideLayout>
  )
}
