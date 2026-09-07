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
      title={{ id: 'Item Pencatatan Harian untuk Kucing Ginjal Kronis / Anjing-Kucing Diabetes', zh: '慢性腎病貓／糖尿病犬貓的居家紀錄項目' ,en: "Item Penrecordan Harian for Cat Ginjal Kronis / Dog-Cat Diabetes" }}
      sourceNote={{ id: 'Sumber: modul perawatan hewan JiaJian Log · Diperbarui 2026-08-26', zh: '資料來源：家健錄寵物照護模組 · 更新日期 2026-08-26' ,en: "Sumber: modul care animal JiaJian Log · Diperbarui 2026-08-26" }}
      metaDescription={{
        id: 'Item pencatatan harian untuk kucing penyakit ginjal kronis dan anjing/kucing diabetes: asupan air, urine, cairan infus, insulin, gula darah, dan nafsu makan.',
        zh: '慢性腎病貓與糖尿病犬貓的居家紀錄項目：飲水量、排尿、皮下輸液、胰島素、血糖與食慾，逐項說明。', en: "Item penrecordan daily for cat disease ginjal kronis and dog/cat diabetes: asupan water, urine, fluid infus, insulin, gula blood, and nafsu makan.",
      }}
    >
      <GuideSection title={{ id: 'Mengapa pencatatan harian penting untuk penyakit kronis hewan?', zh: '為什麼慢性病寵物需要每天記錄？' ,en: "Mengapa penrecordan daily penting for disease kronis animal?" }}>
        <p>
          {text({
            id: 'Penyakit ginjal kronis pada kucing dan diabetes pada anjing/kucing berkembang perlahan. Perubahan kecil pada nafsu makan, asupan air, atau berat badan sering kali baru terlihat jelas setelah dicatat selama beberapa hari — inilah yang membantu keluarga dan dokter hewan membuat keputusan tepat waktu.',
            zh: '貓的慢性腎病與犬貓糖尿病通常進展緩慢。食慾、飲水量或體重的細微變化，往往要連續記錄好幾天才看得出趨勢——這正是幫助家屬與獸醫及時判斷的關鍵。', en: "Penyakit ginjal kronis on cat and diabetes on dog/cat bertombang perlahan. Changes tocil on nafsu makan, asupan water, or weight baand sering kali new terview jelas after direcord selama beberapa days — thislah that membantu family and dokter animal create toputusan tepat time.",
          })}
        </p>
      </GuideSection>

      <GuideSection title={{ id: 'Kucing dengan penyakit ginjal kronis (CKD)', zh: '慢性腎病貓' ,en: "Cat with disease ginjal kronis (CKD)" }}>
        <GuideList items={[
          { id: 'Asupan air minum (ml) dan jumlah buang air kecil per hari.', zh: '每日飲水量（ml）與排尿次數。' ,en: "Asupan water take (ml) and jumlah buang water tocil per days." },
          { id: 'Jumlah gumpalan urine di kotak pasir (khusus kucing).', zh: '貓砂盆內的尿塊數量（貓咪適用）。' ,en: "Jumlah gumpalan urine in kotak pasir (khusus cat)." },
          { id: 'Volume cairan infus subkutan (ml) dan lokasi suntikan (leher/perut/pinggang), jika dokter hewan meresepkan terapi cairan di rumah.', zh: '皮下輸液量（ml）與注射部位（頸部／腹部／側腰），若獸醫開立居家皮下輸液。' ,en: "Volume fluid infus subkutan (ml) and lokasi suntikan (leher/perut/pinggang), if dokter animal meresepkan terapi fluid in rumah." },
          { id: 'Persentase makanan yang dihabiskan per waktu makan (0%–100%).', zh: '每餐進食比例（0%～100%）。' ,en: "Persentase food that dihabiskan per time makan (0%–100%)." },
          { id: 'Berat badan, untuk memantau tren penurunan berat badan.', zh: '體重，用於觀察體重下降趨勢。' ,en: "Weight baand, for memantau tren penurunan weight baand." },
        ]} />
      </GuideSection>

      <GuideSection title={{ id: 'Anjing dan kucing dengan diabetes', zh: '糖尿病犬貓' ,en: "Dog and cat with diabetes" }}>
        <GuideList items={[
          { id: 'Dosis insulin (unit) yang diberikan setiap kali suntik.', zh: '每次注射的胰島素劑量（單位）。' ,en: "Dose insulin (unit) that diberikan each kali suntik." },
          { id: 'Kadar gula darah (mg/dL) hasil pengukuran di rumah.', zh: '居家量測的血糖值（mg/dL）。' ,en: "Kadar gula blood (mg/dL) hasil pengukuran in rumah." },
          { id: 'Persentase makanan yang dihabiskan — penting karena dosis insulin biasanya terkait dengan asupan makan.', zh: '進食比例——因為胰島素劑量通常與進食量有關，格外重要。' ,en: "Persentase food that dihabiskan — penting because dose insulin biasanya terkait with asupan makan." },
          { id: 'Jumlah buang air besar dan skor bentuk feses, muntah, jika ada.', zh: '排便次數與糞便型態評分、嘔吐次數（若有）。' ,en: "Jumlah bowel movement and skor shape feses, muntah, if ada." },
        ]} />
        <p className="text-xs text-gray-500">
          {text({
            id: 'Rentang referensi gula darah 80–120 mg/dL yang ditampilkan aplikasi hanya berlaku untuk anjing/kucing, bukan manusia, dan tetap harus dibandingkan dengan target yang ditentukan dokter hewan untuk masing-masing hewan.',
            zh: 'App 顯示的血糖參考範圍 80–120 mg/dL 僅適用於犬貓，不適用於人類，實際判讀仍須依獸醫為個別動物設定的目標值。', en: "Rentang referensi gula blood 80–120 mg/dL that shown aplikasi only berlaku for dog/cat, bukan manusia, and tetap must dibandingkan with target that ditentukan dokter animal for masing-masing animal.",
          })}
        </p>
      </GuideSection>

      <GuideSection title={{ id: 'Bagaimana JiaJian Log membantu mencatat?', zh: '家健錄如何協助記錄？' ,en: "Bagaimana JiaJian Log membantu record?" }}>
        <p>
          {text({
            id: 'Aplikasi menyediakan modul terpisah untuk cairan infus, insulin/gula darah, nafsu makan, pencernaan, dan asupan air/urine, lalu merangkumnya menjadi laporan yang bisa dicetak untuk dibawa ke kunjungan dokter hewan.',
            zh: 'App 提供皮下輸液、胰島素／血糖、食慾、消化、飲水／排尿等獨立模組，並整理成可列印的回診報告，方便帶去給獸醫參考。', en: "Aplikasi menyediakan modul separate for fluid infus, insulin/gula blood, nafsu makan, pencernaan, and asupan water/urine, lalu merangkumnya menjadi laporan that can dicetak for dibawa to kunjungan dokter animal.",
          })}
        </p>
      </GuideSection>
    </ContentGuideLayout>
  )
}
