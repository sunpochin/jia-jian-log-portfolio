/*
檔案用途：公開衛教內容頁——居家血壓 722 原則與家庭血壓標準表，供搜尋引擎索引與未登入訪客閱讀。
所在層：src/features/system-admin/pages/guides 公開內容頁層；未登入也可存取，不讀取任何照護資料。
主要關聯：內容來源為 README.md「血壓 722 原則」與「血壓警示標準」段落；排版沿用 ContentGuideLayout，底部 CTA 導向 /demo。
*/
import { ContentGuideLayout, GuideSection } from '../../../../components/ui/ContentGuideLayout'
import { useI18n } from '../../../../lib/i18n'

export function BloodPressure722GuidePage() {
  const { text } = useI18n()
  return (
    <ContentGuideLayout
      title={{ id: 'Prinsip 722 Pengukuran Tekanan Darah di Rumah', zh: '居家血壓 722 原則', en: 'The 722 Rule for Home Blood Pressure Monitoring' }}
      sourceNote={{ id: 'Sumber: README.md proyek ini · Diperbarui 2026-08-26', zh: '資料來源：本專案 README.md · 更新日期 2026-08-26', en: 'Source: Project README.md · Updated 2026-08-26' }}
      metaDescription={{
        id: 'Panduan prinsip 722 pengukuran tekanan darah di rumah (7 hari, 2 sesi/hari, 2 kali/sesi) dan tabel standar tekanan darah rumah tangga, lengkap dengan cara mencatatnya.',
        zh: '居家血壓 722 原則（連續量 7 天、早晚各 2 次、每次量 2 遍）與家庭血壓標準表說明，並介紹如何用 App 記錄。',
        en: 'Guide to the 722 home blood pressure monitoring rule (7 consecutive days, 2 sessions/day, 2 readings/session) and home blood pressure standards, with instructions on tracking in the app.',
      }}
    >
      <GuideSection title={{ id: 'Apa itu prinsip 722?', zh: '什麼是 722 原則？', en: 'What is the 722 rule?' }}>
        <p>
          {text({
            id: 'Menurut rekomendasi Perhimpunan Hipertensi Taiwan, pengukuran tekanan darah di rumah sebaiknya mengikuti pola "722": ukur selama 7 hari berturut-turut, pagi dan malam (2 sesi/hari), dan setiap sesi diukur 2 kali dengan jeda istirahat 1 menit di antaranya.',
            zh: '依台灣高血壓學會建議，居家血壓量測建議依循「722」原則：連續量 7 天，每天早晚各量 2 次，每次量 2 遍，兩遍間休息 1 分鐘。',
            en: 'According to the Taiwan Hypertension Society, home blood pressure monitoring should follow the "722" rule: measure for 7 consecutive days, twice daily in the morning and evening, taking 2 readings each time with a 1-minute rest in between.',
          })}
        </p>
      </GuideSection>

      <GuideSection title={{ id: 'Mengapa berbeda dengan pengukuran di klinik?', zh: '為什麼跟診間量的不一樣？', en: 'Why does home measurement differ from clinic readings?' }}>
        <p>
          {text({
            id: 'Tekanan darah di rumah sering berbeda dari di klinik karena faktor kecemasan atau rutinitas harian. Pengukuran berulang di rumah membantu keluarga dan tenaga medis melihat tren yang lebih stabil, bukan hanya satu angka sesaat.',
            zh: '居家量測與診間量測常有落差，可能受緊張情緒或日常作息影響。多次居家量測有助於家人與醫療人員看到較穩定的趨勢，而不只是單一時間點的數字。',
            en: 'Home blood pressure readings often differ from clinic readings due to anxiety or daily routines. Repeated home measurements help families and healthcare professionals identify stable trends rather than relying on a single snapshot.',
          })}
        </p>
        <p>
          {text({
            id: 'Jumlah sesi aktual tetap disesuaikan dengan kondisi orang yang dirawat saat itu — misalnya jika tekanan darah malam hari cenderung rendah, pengasuh mungkin mengukur pada beberapa waktu berbeda untuk membantu keluarga memutuskan apakah perlu berkonsultasi dengan tenaga medis.',
            zh: '實際量測次數仍以照護對象當下狀況為準——例如夜間血壓偏低時，照護者可能會在不同時段分別量測，協助家屬判斷是否需要與醫療人員討論。',
            en: 'The actual number of sessions is tailored to the individual’s condition — for example, if evening blood pressure is low, caregivers may measure at different intervals to help the family decide whether to consult a physician.',
          })}
        </p>
      </GuideSection>

      <GuideSection title={{ id: 'Standar tekanan darah rumah tangga (referensi)', zh: '家庭血壓標準（參考）', en: 'Home blood pressure standards (reference)' }}>
        {/* 等級文字色沿用 VitalAlertBadge.alertBadgeClassName 的 emerald-700／orange-700／red-700 色階，
            與畫面上其他血壓警示徽章保持同一套辨識色，不另外發明一組配色。 */}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[420px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-xs font-bold text-gray-500">
                <th className="py-2 pr-3">{text({ id: 'Tingkat', zh: '等級', en: 'Category' })}</th>
                <th className="py-2 pr-3">{text({ id: 'Sistolik (angka atas)', zh: '收縮壓', en: 'Systolic' })}</th>
                <th className="py-2">{text({ id: 'Diastolik (angka bawah)', zh: '舒張壓', en: 'Diastolic' })}</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-gray-100">
                <td className="py-2 pr-3 font-semibold text-emerald-700">{text({ id: 'Normal', zh: '正常', en: 'Normal' })}</td>
                <td className="py-2 pr-3">&lt; 130</td>
                <td className="py-2">&lt; 80</td>
              </tr>
              <tr className="border-b border-gray-100">
                <td className="py-2 pr-3 font-semibold text-orange-700">{text({ id: 'Waspada', zh: '略高', en: 'Elevated' })}</td>
                <td className="py-2 pr-3">≥ 130</td>
                <td className="py-2">≥ 80</td>
              </tr>
              <tr>
                <td className="py-2 pr-3 font-semibold text-red-700">{text({ id: 'Tinggi', zh: '偏高', en: 'High' })}</td>
                <td className="py-2 pr-3">≥ 160</td>
                <td className="py-2">≥ 100</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="text-xs text-gray-500">
          {text({
            id: 'Tabel ini adalah standar rumah tangga untuk referensi (berbeda dari standar klinik), bukan anjuran pengobatan. Silakan diskusikan hasil pengukuran dengan tenaga medis.',
            zh: '此表為居家參考標準（與診間標準不同），非用藥或治療建議，量測結果請與醫療人員討論。',
            en: 'This table provides home reference standards (which differ from clinic criteria) and does not constitute medical or treatment advice. Please discuss measurements with your healthcare provider.',
          })}
        </p>
      </GuideSection>

      <GuideSection title={{ id: 'Bagaimana Family Health Note membantu mencatat?', zh: '家健錄如何協助記錄？', en: 'How does Family Health Note help you record?' }}>
        <p>
          {text({
            id: 'Aplikasi ini menyediakan alur pencatatan dua kali pengukuran dengan pengingat waktu istirahat, menyimpan riwayat tekanan darah, denyut nadi, dan menampilkan tren untuk dibagikan ke keluarga atau dokter.',
            zh: '本 App 提供「量兩遍」的輸入流程與休息時間提示，保存血壓、心跳歷史紀錄，並提供趨勢圖表可分享給家人或醫師參考。',
            en: 'The app provides a two-reading workflow with rest timers, stores blood pressure and pulse history, and offers trend charts to share with family or physicians.',
          })}
        </p>
      </GuideSection>
    </ContentGuideLayout>
  )
}
