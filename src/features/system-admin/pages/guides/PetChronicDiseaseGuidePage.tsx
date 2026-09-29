/*
檔案用途：公開衛教內容頁——慢性腎病貓／糖尿病犬貓的居家紀錄項目，供搜尋引擎索引與未登入訪客閱讀。
所在層：src/features/system-admin/pages/guides 公開內容頁層；未登入也可存取，不讀取任何照護資料。
主要關聯：內容來源為 src/features/pet-care 各模組（PetFluidTherapyPage、PetEndocrinePage、PetAppetitePage、PetDigestionPage、PetLiquidIntakePage）；排版沿用 ContentGuideLayout，底部 CTA 導向 /demo。
*/
import { ContentGuideLayout, GuideList, GuideSection } from '../../../../components/ui/ContentGuideLayout'
import { useI18n } from '../../../../lib/i18n'

export function PetChronicDiseaseGuidePage() {
  const { text } = useI18n()
  return (
    <ContentGuideLayout
      title={{ id: 'Item Pencatatan Harian untuk Kucing Ginjal Kronis / Anjing-Kucing Diabetes', zh: '慢性腎病貓／糖尿病犬貓的居家紀錄項目', en: 'Daily Tracking Items for Chronic Kidney Disease Cats & Diabetic Pets' }}
      sourceNote={{ id: 'Sumber: modul perawatan hewan Family Health Note · Diperbarui 2026-08-26', zh: '資料來源：家健錄寵物照護模組 · 更新日期 2026-08-26', en: 'Source: Family Health Note pet care module · Updated 2026-08-26' }}
      metaDescription={{
        id: 'Item pencatatan harian untuk kucing penyakit ginjal kronis dan anjing/kucing diabetes: asupan air, urine, cairan infus, insulin, gula darah, dan nafsu makan.',
        zh: '慢性腎病貓與糖尿病犬貓的居家紀錄項目：飲水量、排尿、皮下輸液、胰島素、血糖與食慾，逐項說明。',
        en: 'Daily tracking items for cats with chronic kidney disease and diabetic pets: water intake, urination, fluid therapy, insulin, blood glucose, and appetite.',
      }}
    >
      <GuideSection title={{ id: 'Mengapa pencatatan harian penting untuk penyakit kronis hewan?', zh: '為什麼慢性病寵物需要每天記錄？', en: 'Why is daily logging important for pets with chronic conditions?' }}>
        <p>
          {text({
            id: 'Penyakit ginjal kronis pada kucing dan diabetes pada anjing/kucing berkembang perlahan. Perubahan kecil pada nafsu makan, asupan air, atau berat badan sering kali baru terlihat jelas setelah dicatat selama beberapa hari — inilah yang membantu keluarga dan dokter hewan membuat keputusan tepat waktu.',
            zh: '貓的慢性腎病與犬貓糖尿病通常進展緩慢。食慾、飲水量或體重的細微變化，往往要連續記錄好幾天才看得出趨勢——這正是幫助家屬與獸醫及時判斷的關鍵。',
            en: 'Chronic kidney disease in cats and diabetes in dogs and cats progress gradually. Subtle changes in appetite, water intake, or body weight often only become apparent after tracking over several days — helping families and veterinarians make timely decisions.',
          })}
        </p>
      </GuideSection>

      <GuideSection title={{ id: 'Kucing dengan penyakit ginjal kronis (CKD)', zh: '慢性腎病貓', en: 'Cats with chronic kidney disease (CKD)' }}>
        <GuideList items={[
          { id: 'Asupan air minum (ml) dan jumlah buang air kecil per hari.', zh: '每日飲水量（ml）與排尿次數。', en: 'Daily water intake (ml) and urination frequency.' },
          { id: 'Jumlah gumpalan urine di kotak pasir (khusus kucing).', zh: '貓砂盆內的尿塊數量（貓咪適用）。', en: 'Litter box urine clump count (for cats).' },
          { id: 'Volume cairan infus subkutan (ml) dan lokasi suntikan (leher/perut/pinggang), jika dokter hewan meresepkan terapi cairan di rumah.', zh: '皮下輸液量（ml）與注射部位（頸部／腹部／側腰），若獸醫開立居家皮下輸液。', en: 'Subcutaneous fluid volume (ml) and injection site (neck, abdomen, flank), if prescribed by a veterinarian.' },
          { id: 'Persentase makanan yang dihabiskan per waktu makan (0%–100%).', zh: '每餐進食比例（0%～100%）。', en: 'Percentage of meal finished per feeding (0%–100%).' },
          { id: 'Berat badan, untuk memantau tren penurunan berat badan.', zh: '體重，用於觀察體重下降趨勢。', en: 'Body weight, to monitor weight loss trends.' },
        ]} />
      </GuideSection>

      <GuideSection title={{ id: 'Anjing dan kucing dengan diabetes', zh: '糖尿病犬貓', en: 'Dogs and cats with diabetes' }}>
        <GuideList items={[
          { id: 'Dosis insulin (unit) yang diberikan setiap kali suntik.', zh: '每次注射的胰島素劑量（單位）。', en: 'Insulin dosage (units) administered per injection.' },
          { id: 'Kadar gula darah (mg/dL) hasil pengukuran di rumah.', zh: '居家量測的血糖值（mg/dL）。', en: 'Blood glucose levels (mg/dL) measured at home.' },
          { id: 'Persentase makanan yang dihabiskan — penting karena dosis insulin biasanya terkait dengan asupan makan.', zh: '進食比例——因為胰島素劑量通常與進食量有關，格外重要。', en: 'Meal percentage consumed — crucial as insulin dosing is typically tied to food intake.' },
          { id: 'Jumlah buang air besar dan skor bentuk feses, muntah, jika ada.', zh: '排便次數與糞便型態評分、嘔吐次數（若有）。', en: 'Bowel movement count, fecal score, and vomiting episodes (if any).' },
        ]} />
        <p className="text-xs text-gray-500">
          {text({
            id: 'Rentang referensi gula darah 80–120 mg/dL yang ditampilkan aplikasi hanya berlaku untuk anjing/kucing, bukan manusia, dan tetap harus dibandingkan dengan target yang ditentukan dokter hewan untuk masing-masing hewan.',
            zh: 'App 顯示的血糖參考範圍 80–120 mg/dL 僅適用於犬貓，不適用於人類，實際判讀仍須依獸醫為個別動物設定的目標值。',
            en: 'The blood glucose reference range of 80–120 mg/dL shown in the app applies only to dogs and cats, not humans, and should always be compared against individual targets set by your veterinarian.',
          })}
        </p>
      </GuideSection>

      <GuideSection title={{ id: 'Bagaimana Family Health Note membantu mencatat?', zh: '家健錄如何協助記錄？', en: 'How does Family Health Note help you record?' }}>
        <p>
          {text({
            id: 'Aplikasi menyediakan modul terpisah untuk cairan infus, insulin/gula darah, nafsu makan, pencernaan, dan asupan air/urine, lalu merangkumnya menjadi laporan yang bisa dicetak untuk dibawa ke kunjungan dokter hewan.',
            zh: 'App 提供皮下輸液、胰島素／血糖、食慾、消化、飲水／排尿等獨立模組，並整理成可列印的回診報告，方便帶去給獸醫參考。',
            en: 'The app provides dedicated modules for subcutaneous fluids, insulin and blood glucose, appetite, digestion, and water intake/urination, summarizing them into printable visit reports for veterinary checkups.',
          })}
        </p>
      </GuideSection>
    </ContentGuideLayout>
  )
}
