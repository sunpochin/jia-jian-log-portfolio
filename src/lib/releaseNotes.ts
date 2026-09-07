/*
檔案用途：把 release-please 產生的 CHANGELOG.md 轉成 release 頁面可呈現的資料。
所在層：src/lib 共用資料轉接層；不負責載入網路資料或決定畫面樣式。
主要關聯：由 ReleasesPage 使用，並由單元測試固定 release-please 常見的 Markdown 結構。
*/

import type { LocalizedText } from './i18n'

export type ReleaseNoteSection = {
  title: string
  items: string[]
}

export type ReleaseNote = {
  version: string
  date?: string
  url?: string
  sections: ReleaseNoteSection[]
}

// 為什麼以版本彙整而非逐條 commit 翻譯：release-please 會重寫 CHANGELOG，逐條 HTML metadata 不能成為可靠資料來源；人工確認的照護摘要才不會在下次發版又消失。
const CURATED_RELEASE_SUMMARIES: Record<string, Record<string, LocalizedText[]>> = {
  // 為什麼先人工彙整：1.13.1 的修正涉及照片與離線補送，不能讓自動產生的英文條目被誤當成照護者已確認的雙語說明。
  '1.13.1': {
    'bug fixes': [
      { id: 'Pratinjau foto catatan perawatan kini kembali tampil dengan stabil, termasuk setelah pemuatan ulang atau saat foto sedang dicoba dikirim ulang.', zh: '修正照護紀錄照片預覽與載入狀態，重新整理或補送重試後也能穩定看見照片。' ,en: "Pratinjau photo recordan care now back tampil with stabil, termasuk after pemuatan ulang or when photo currently dicoba dikirim ulang." },
      { id: 'Pengiriman ulang catatan tekanan darah saat offline kini lebih aman: foto dan notifikasi keluarga tetap diproses dengan benar, termasuk ketika data ternyata sudah tersimpan.', zh: '修正離線補送血壓紀錄的處理，包含照片、家人通知與「資料已存在」的重試情況，避免補送成功卻少了通知。' ,en: "Pengiriman ulang recordan blood pressure when offline now more aman: photo and notifikasi family tetap diproses with benar, termasuk totika data ternyata already saved." },
    ],
  },
  '1.13.0': {
    features: [
      { id: 'Judul setiap sesi minum obat di catatan harian kini menampilkan jumlah total pil, bukan hanya jumlah berapa kali minum obat.', zh: '服藥打卡的每個時段標題現在會顯示總顆數，不只顯示服藥次數，避免同一次吃兩顆以上時被誤以為顆數也對得上。' ,en: "Judul each sesi take medication in recordan daily now show jumlah total pil, bukan only jumlah berapa kali take medication." },
      { id: 'Ringkasan jumlah pil kini dikelompokkan menurut bentuk sediaan (tablet, kapsul, sachet, dll.), sehingga obat serbuk/cair tidak lagi salah dihitung sebagai "pil".', zh: '顆數摘要改成依劑型（錠、膠囊、粉包等）分組計算，粉包／液劑不再被誤標成「顆」，跟藥盒核對更準確。' ,en: "Ringkasan jumlah pil now ditolompokkan menurut shape sediaan (tablet, kapsul, sachet, dll.), so that medication serbuk/cair no longer salah dihthatng sebagai \"pil\"." },
      { id: 'Kartu progres minum obat sepanjang hari kini juga menampilkan total jumlah pil, mengikuti aturan yang sama dengan setiap sesi minum obat.', zh: '服藥打卡的全天進度卡也加上總顆數，跟每個時段使用同一套計算規則，方便照護者一次核對整天的用量。' ,en: "Kartu progres take medication sepanjang days now juga show total jumlah pil, mengikuti aturan that sama with each sesi take medication." },
    ],
  },
  '1.12.3': {
    'bug fixes': [
      { id: 'Memperbaiki proses rilis staging: jika pembaruan database dibatalkan secara tidak sengaja, sistem kini mencoba lagi secara otomatis agar rilis tidak tersangkut.', zh: '修正 staging 發版流程：資料庫更新如果不小心被取消，系統現在會自動重試，避免發版卡住。' ,en: "Memperbaiki proses rilis staging: if pembaruan database dibatalkan secara not sengaja, sistem now mencoba lagi secara otomatis so that rilis not tersangkut." },
    ],
  },
  '1.12.0': {
    features: [
      { id: 'Pintasan "Tambah ke Layar Utama" di Android/Chrome desktop kini menampilkan nama sesuai bahasa yang dipilih (Bahasa Indonesia atau Mandarin), tidak lagi tetap bahasa Inggris.', zh: 'Android／桌面 Chrome 的「加到主畫面」捷徑名稱與桌面圖示文字，現在會依照目前選擇的語言顯示中文或印尼文，不再固定顯示英文。' ,en: "Pintasan \"Add to Layar Utama\" in Android/Chrome desktop now show name sesuai bahasa selected (Bahasa Indonesia or Manfromn), no longer tetap bahasa Inggris." },
      { id: 'Nama obat pada jadwal minggu ini kini bisa diketuk untuk membuka jendela detail obat, dan jendela detail kini punya tautan cadangan untuk mencari nama obat dalam bahasa Inggris via Google saat data belum lengkap.', zh: '本週藥單現在可以點擊藥名開啟藥品詳情視窗，詳情視窗也新增「用 Google 搜尋英文藥名」的備援連結，方便資料不齊全時查詢。' ,en: "Name medication on schedule weeks this now can ditotuk for membuka jendela detail medication, and jendela detail now punya tautan caandgan for mencari name medication in bahasa Inggris via Google when data not yet lengkap." },
    ],
    'bug fixes': [
      { id: 'Membuka aplikasi dari ikon yang sudah ditambahkan ke Layar Utama di iOS/Android tidak lagi salah dikira sebagai browser tersemat biasa, sehingga login dan fitur berjalan normal.', zh: '從 iOS／Android 加到主畫面的圖示開啟 App，不再被誤判成一般嵌入式瀏覽器，登入與功能可以正常運作。' ,en: "Membuka aplikasi from ikon that already added to Layar Utama in iOS/Android no longer salah dikira sebagai browser tersemat biasa, so that login and fthatr berjalan normal." },
      { id: 'Judul pintasan di layar utama diperbaiki kembali menampilkan "家健錄" dalam bahasa Mandarin, tidak lagi menampilkan nama bahasa Inggris.', zh: '加到主畫面的桌面捷徑標題修正回顯示中文「家健錄」，不再顯示成英文名稱。' ,en: "Judul pintasan in layar main diperbaiki back show \"家健錄\" in bahasa Manfromn, no longer show name bahasa Inggris." },
      { id: 'Saat penyimpanan data obat gagal, layar kini menampilkan pesan error, tidak lagi gagal secara diam-diam yang membuat pengasuh mengira data sudah tersimpan.', zh: '儲存用藥資料失敗時，畫面會顯示錯誤訊息，不再默默失敗讓照護者誤以為已經存檔成功。' ,en: "When penyimpanan data medication failed, layar now show pesan error, no longer failed secara diam-diam that create caregiver mengira data already saved." },
      { id: 'Memperbaiki logika saat gagal membaca status persetujuan data kesehatan dengan mencoba ulang otomatis satu kali, agar akun yang sudah menyetujui tidak salah dianggap perlu menyetujui ulang.', zh: '修正讀取健康資料使用同意狀態失敗時的處理，改為自動重試一次，避免已經同意過的帳號被誤判成需要重新同意。' ,en: "Memperbaiki logika when failed read status persetujuan data tosehatan with mencoba ulang otomatis satu kali, so that akun that already menyetujui not salah dianggap perlu menyetujui ulang." },
    ],
  },
  '1.11.0': {
    features: [
      { id: 'Bagian jadwal minum obat yang diciutkan kini menampilkan progres jumlah pil yang sudah diminum (x/y), dan menampilkan tanda centang besar saat satu sesi sudah selesai diminum semua.', zh: '收合的服藥時段標題現在會顯示「已吃幾顆／共幾顆」的進度，收合後若整段已完成，也會顯示放大版的完成勾勾。' ,en: "Bagian schedule take medication that diciutkan now show progres jumlah pil that already taken (x/y), and show tanda centang besar when satu sesi already done taken all." },
      { id: 'Kartu obat yang sudah diminum kini disederhanakan menjadi satu baris ringkas, dengan kategori obat tetap ditampilkan, memudahkan pengasuh memindai seluruh jadwal obat sekaligus.', zh: '已服用的藥卡簡化為單行矮版卡片，並保留藥物分類文字，方便照護者一次掃過整段藥單確認。' ,en: "Kartu medication that already taken now disederhanakan menjadi satu baris ringkas, with kategori medication tetap shown, memudahkan caregiver memindai all schedule medication sekaligus." },
    ],
    'bug fixes': [
      { id: 'Memperbaiki warna nama obat dan kategori pada kartu yang sudah diminum agar menggunakan warna hijau (selesai), tidak lagi bentrok dengan warna merah/magenta yang biasanya berarti peringatan.', zh: '修正已服用藥卡的藥名與分類顏色，改用綠色系呈現「已完成」，不再跟原本代表警示的紅色／洋紅混用。' ,en: "Memperbaiki color name medication and kategori on kartu that already taken so that menggunakan color hijau (done), no longer bentrok with color merah/magenta that biasanya berarti peringatan." },
      { id: 'Memperbaiki BRILINTA/Exforge dan obat terkait yang kode ATC-nya tetap kosong karena ID lama pada data awal tidak cocok dengan ID sebenarnya di database, sehingga label kategorinya kini tampil dengan benar.', zh: '修正 BRILINTA/Exforge 等藥品因舊種子資料的 id 對不上實際資料庫 id，導致 ATC 分類代碼一直是空值、分類標籤顯示不出來的問題。' ,en: "Memperbaiki BRILINTA/Exforge and medication terkait that kode ATC-nya tetap empty because ID old on data awal not cocok with ID sebenarnya in database, so that label kategorinya now tampil with benar." },
    ],
  },
  '1.10.0': {
    features: [
      { id: 'Menambahkan modul pencatatan keseimbangan cairan pasca-operasi (berat makanan yang dihabiskan, asupan air, volume urine, dan jumlah buang air besar) sebagai modul perawatan harian opsional yang dapat diaktifkan sendiri.', zh: '新增術後體液平衡照護模組（飲食秤重前後差、喝水量、排尿量與排便次數），可自行選擇開啟的每日照護模組。' ,en: "Menambahkan modul penrecordan toseimbangan fluid pasca-operasi (weight food that dihabiskan, asupan water, volume urine, and jumlah bowel movement) sebagai modul daily care opsional that can diaktifkan sendiri." },
    ],
  },
  '1.9.0': {
    features: [
      { id: 'Menambahkan kode klasifikasi ATC WHO yang telah diverifikasi ke obat-obatan pada data contoh mode demo dan data awal staging, agar label kategori obat benar-benar tampil di layar.', zh: '幫 /demo 試用模式與 staging 示範資料的藥品補上查證過的 WHO ATC 分類碼，讓分類徽章能實際顯示出來。' ,en: "Menambahkan kode klasifikasi ATC WHO that telah diverifikasi to medication-medicationan on data example demo mode and data awal staging, so that label kategori medication benar-benar tampil in layar." },
    ],
    'bug fixes': [
      { id: 'Memperbaiki logika pengisian kategori utama obat agar menggunakan kolom yang sebenarnya ditulis saat pengguna menambahkan obat dari pencarian, bukan kolom lama yang hampir tidak pernah terisi.', zh: '修正藥品主要功能分類的回填邏輯，改用使用者從目錄搜尋加入藥品時實際會寫入的欄位，不再依賴幾乎沒有藥品會用到的舊欄位。' ,en: "Memperbaiki logika pengisian kategori main medication so that menggunakan kolom that sebenarnya written when user add medication from pencarian, bukan kolom old that hampir not pernah terisi." },
      { id: 'Memperbaiki kesalahan sintaks SQL pada fungsi pengisian kategori obat yang menyebabkan fitur ini gagal total setiap kali dipanggil.', zh: '修正藥品分類回填函式裡的一個 SQL 語法錯誤，避免這個功能一被呼叫就直接失敗。' ,en: "Memperbaiki tosalahan sintaks SQL on fungsi pengisian kategori medication that menyebabkan fthatr this failed total each kali dipanggil." },
      { id: 'Menghubungkan beberapa obat contoh yang sering muncul di akun demo staging ke katalog obat resmi, agar label kategorinya dapat ditampilkan dengan benar.', zh: '把 staging 示範帳號裡幾個常見藥品連結到官方藥品目錄，讓分類徽章可以正確顯示。' ,en: "Menghubungkan beberapa medication example that sering muncul in akun demo staging to katalog medication official, so that label kategorinya can shown with benar." },
    ],
  },
  '1.8.0': {
    features: [
      { id: 'Menambahkan modul perawatan demensia (agitasi, siklus siang-malam terbalik, risiko berkeliaran).', zh: '新增失智照護模組（躁動、日夜顛倒、遊走風險）。' ,en: "Menambahkan modul care demensia (agitasi, siklus afternoon-night terbalik, risiko bertoliaran)." },
      { id: 'Menambahkan wizard panduan penggunaan pertama untuk modul perawatan harian.', zh: '新增每日照護模組的首次使用引導精靈。' ,en: "Menambahkan wizard panduan penggunaan pertama for modul daily care." },
      { id: 'Menambahkan laporan dokter hewan untuk hewan peliharaan, dan memperluas modul perawatan hewan peliharaan agar dapat digunakan juga untuk perawatan manusia.', zh: '新增寵物獸醫報告，並將寵物照護模組擴大適用於人類照護對象。' ,en: "Menambahkan laporan dokter animal for animal peliharaan, and memperluas modul care animal peliharaan so that can be used juga for care manusia." },
      { id: 'Menambahkan halaman konten edukasi dwibahasa yang dapat diakses publik beserta hub navigasinya, termasuk kartu pratinjau berbagi dan perbaikan SEO.', zh: '新增可公開瀏覽的雙語衛教內容頁與導覽入口，並補上分享預覽卡與 SEO 改善。' ,en: "Menambahkan halaman konten edukasi dwibahasa that can diakses publik beserta hub navigasinya, termasuk kartu pratinjau berbagi and perbaikan SEO." },
      { id: 'Menambahkan tombol ajakan masuk di akhir tur demo, dan memindahkan preferensi modul percobaan ke akun resmi setelah masuk.', zh: 'Demo 導覽結尾加入登入按鈕，並把試用模組偏好設定交接給正式帳號。' ,en: "Menambahkan tombol ajakan masuk in akhir tur demo, and memindahkan preferensi modul percobaan to akun official after masuk." },
      { id: 'Catatan tekanan darah kini bisa disimpan dalam antrean saat offline, dan otomatis terkirim setelah koneksi pulih.', zh: '血壓紀錄離線時可先排入佇列，恢復連線後會自動送出。' ,en: "Notes blood pressure now can disimpan in antrean when offline, and otomatis terkirim after connection pulih." },
      { id: 'Menambahkan buku panduan serah terima pengasuh satu halaman yang dapat dicetak dalam dua bahasa.', zh: '新增一頁式雙語看護交接手冊，可直接列印。' ,en: "Menambahkan buku panduan serah terima caregiver satu halaman that can dicetak in dua bahasa." },
      { id: 'Halaman obat kini terbagi menjadi empat tab, nama obat ditampilkan lebih menonjol dengan warna merah, dan dapat memilih preferensi menampilkan nama bahasa Inggris terlebih dahulu.', zh: '服藥頁改為四個分頁，藥名以紅色醒目顯示，並新增可設定英文名優先顯示的偏好。' ,en: "Halaman medication now terbagi menjadi empat tab, name medication shown more menonjol with color merah, and can memilih preferensi show name bahasa Inggris terlebih dahulu." },
      { id: 'Menghapus batasan zoom pada halaman, dan menambahkan ukuran font yang dapat disesuaikan agar keluarga dengan presbiopi lebih mudah membaca.', zh: '移除頁面禁止縮放的限制，新增可調整的閱讀字級，方便老花的家屬閱讀。' ,en: "Deleting batasan zoom on halaman, and add ukuran font that can disesuaikan so that family with presbiopi more mudah read." },
      { id: 'Menyinkronkan klasifikasi terapi farmakologi ATC dari TFDA, secara otomatis menandai fungsi utama obat.', zh: '同步 TFDA 藥理治療分類（ATC），自動標示藥品的主要功能。' ,en: "Syncing klasifikasi terapi farmakologi ATC from TFDA, secara otomatis menandai fungsi main medication." },
      { id: 'Foto obat kini bisa diketuk untuk diperbesar dan melihat versi asli yang lebih jelas.', zh: '點擊藥品照片可放大檢視原始清晰版本。' ,en: "Photo medication now can ditotuk for diperbesar and view versi original that more jelas." },
    ],
    'bug fixes': [
      { id: 'Mengizinkan popup COOP agar proses masuk dengan Google GIS tidak menampilkan layar kosong.', zh: '允許 COOP 彈出視窗，修正 Google 登入時畫面變空白的問題。' ,en: "Mengizinkan popup COOP so that proses masuk with Google GIS not show layar empty." },
      { id: 'Mengizinkan "sachet bubuk" sebagai bentuk sediaan obat yang valid.', zh: '修正「粉包」無法被登錄為有效藥品外觀劑型的問題。' ,en: "Mengizinkan \"sachet bubuk\" sebagai shape sediaan medication that valid." },
      { id: 'Memperbaiki wizard onboarding agar berdasarkan preferensi tersimpan di database, bukan localStorage, dan memisahkan status wizard untuk setiap pasien agar tidak tercampur.', zh: '修正首次使用引導精靈改依資料庫已儲存的偏好判斷（而非瀏覽器本機儲存），並讓每位病人各自獨立的引導狀態不會互相干擾。' ,en: "Memperbaiki wizard onboarding so that berdasarkan preferensi saved in database, bukan localStorage, and memisahkan status wizard for each pasien so that not tercampur." },
      { id: 'Menerjemahkan satuan pada grafik tren, tidak lagi menggunakan teks bahasa Indonesia yang ditulis langsung (hardcode).', zh: '修正趨勢圖表單位沒有依語系翻譯、直接寫死印尼文的問題。' ,en: "Menerjemahkan satuan on grafik tren, no longer menggunakan teks bahasa Indonesia that written directly (hardcode)." },
      { id: 'Membuat laporan endokrin dan ambang batas gula darah menyesuaikan jenis spesies hewan peliharaan.', zh: '修正內分泌報告與血糖門檻值，改為依寵物物種調整。' ,en: "Membuat laporan endokrin and ambang batas gula blood menyesuaikan type spesies animal peliharaan." },
      { id: 'Memperbaiki nama kolom klasifikasi ATC TFDA, menggunakan klasifikasi utama resmi yang ditandai pemerintah.', zh: '修正 TFDA ATC 分類欄位名稱，改用官方標示的主要分類。' ,en: "Memperbaiki name kolom klasifikasi ATC TFDA, menggunakan klasifikasi main official that ditandai pemerintah." },
      { id: 'Memperbaiki tombol "ciutkan" saat menyesuaikan obat yang sebelumnya membuang foto yang sudah diunggah.', zh: '修正調整藥品時按下「收合」會遺失已上傳照片的問題。' ,en: "Memperbaiki tombol \"ciutkan\" when menyesuaikan medication that senot yetnya membuang photo that already diunggah." },
      { id: 'Mengembalikan pengaturan ukuran font baca ke normal secara otomatis sebelum dan sesudah mencetak.', zh: '修正列印時沒有自動還原閱讀字級設定的問題。' ,en: "Mengembalikan settings ukuran font read to normal secara otomatis before and after mencetak." },
      { id: 'Hanya menandai perubahan obat sebagai belum disimpan jika kolom benar-benar diubah.', zh: '修正只要點開藥品就會被誤標記為「尚未儲存」的問題，改為欄位真的被修改才標記。' ,en: "Only menandai changes medication sebagai not yet disimpan if kolom benar-benar edited." },
      { id: 'Melonggarkan syarat pengisian kategori utama ATC, tidak lagi mensyaratkan status verifikasi "resmi", agar lebih banyak obat umum dapat menampilkan label kategori.', zh: '放寬 ATC 主要功能分類的回填條件，不再要求驗證狀態為「官方」，讓更多常見藥品也能顯示分類標籤。' ,en: "Melonggarkan syarat pengisian kategori main ATC, no longer mensyaratkan status verifikasi \"official\", so that more many medication umum can show label kategori." },
      { id: 'Menambahkan listener pageshow agar iOS Chrome juga dapat memicu prompt pembaruan PWA.', zh: '補上 pageshow 事件監聽，讓 iOS Chrome 也能觸發 PWA 更新提示。' ,en: "Menambahkan listener pageshow so that iOS Chrome juga can memicu prompt pembaruan PWA." },
      { id: 'Memperbaiki transfer preferensi mode percobaan agar membaca spesies terbaru melalui ref, sehingga tidak terhapus akibat effect yang berjalan ulang.', zh: '修正試用模式偏好交接，改用 ref 讀取最新物種，避免因 effect 重跑而清掉交接提示。' ,en: "Memperbaiki transfer preferensi mode percobaan so that read spesies terbaru melalui ref, so that not terhapus akibat effect that berjalan ulang." },
    ],
  },
  '1.7.0': {
    features: [
      {
        id: 'Menambahkan opsi hewan peliharaan burung, dan memastikan modul kotak pasir kucing tidak lagi muncul di halaman perawatan burung.',
        zh: '新增鳥類寵物選項，並讓貓砂盆等貓咪專屬模組不會出現在鳥類的照護畫面中。', en: "Menambahkan opsi animal peliharaan bird, and memastikan modul kotak pasir cat no longer muncul in halaman care bird.",
      },
      {
        id: 'Menambahkan grafik tren riwayat pada halaman perawatan penyakit kronis hewan peliharaan, memudahkan melihat perubahan kondisi jangka panjang.',
        zh: '寵物慢性病照護頁面新增歷史趨勢圖，方便查看長期病況變化。', en: "Menambahkan grafik tren history on halaman care disease kronis animal peliharaan, memudahkan view changes kondisi jangka panjang.",
      },
    ],
    'bug fixes': [
      {
        id: 'Menyembunyikan token tautan berbagi dari URL, agar tidak tersimpan di riwayat browser atau log server.',
        zh: '修正分享連結的驗證代碼會出現在網址上的問題，避免留在瀏覽器紀錄或伺服器日誌中。', en: "Menyembunyikan toton tautan berbagi from URL, so that not saved in history browser or log server.",
      },
      {
        id: 'Memperkuat perlindungan antar-pasien pada katalog obat bersama, agar perubahan data obat satu pasien tidak memengaruhi pasien lain.',
        zh: '加強共用藥品目錄的跨病人保護，避免修改某位病人的藥品資料時影響到其他病人。', en: "Memperkuat perlindungan antar-pasien on katalog medication together, so that changes data medication satu pasien not memengaruhi pasien lain.",
      },
      {
        id: 'Memungkinkan pengasuh memperbaiki bentuk sediaan dan tampilan obat yang salah dicatat sebelumnya, dengan konfirmasi yang jelas sebelum perubahan disimpan agar tidak tertimpa secara tidak sengaja.',
        zh: '讓照護者能修正既有藥品先前登錄錯誤的劑型與外觀，並在儲存前清楚提示確認，避免修改被誤觸或靜默覆蓋。', en: "Memungkinkan caregiver memperbaiki shape sediaan and tampilan medication that salah direcord senot yetnya, with confirm that jelas before changes disimpan so that not tertimpa secara not sengaja.",
      },
      {
        id: 'Memperbaiki peringatan agar benar-benar dikelompokkan per pasien, termasuk saat pengaturan peringatan pasien tersebut belum lengkap.',
        zh: '修正通知警示需要按照病人分開處理的問題，並涵蓋該病人尚未完成警示設定的情況。', en: "Memperbaiki peringatan so that benar-benar ditolompokkan per pasien, termasuk when settings peringatan pasien tersebut not yet lengkap.",
      },
      {
        id: 'Menampilkan alasan sebenarnya saat undangan untuk orang yang dirawat gagal dikirim, alih-alih pesan kesalahan umum.',
        zh: '邀請被照顧者失敗時，改為顯示實際失敗原因，不再只顯示籠統的錯誤訊息。', en: "Menampilkan alasan sebenarnya when invitation for care recipient failed dikirim, alih-alih pesan tosalahan umum.",
      },
      {
        id: 'Menampilkan peringatan di layar saat notifikasi Telegram gagal terkirim, agar pengasuh tidak mengira notifikasi berhasil dikirim padahal tidak.',
        zh: 'Telegram 通知傳送失敗時，會在畫面上顯示警示，避免照護者誤以為通知已成功送出。', en: "Menampilkan peringatan in layar when notifikasi Telegram failed terkirim, so that caregiver not mengira notifikasi successful dikirim onhal not.",
      },
    ],
  },
  '1.6.0': {
    features: [
      {
        id: 'Mengintegrasikan halaman perawatan penyakit kronis hewan peliharaan ke sistem perawatan harian dan menghubungkannya ke tabel Supabase yang sesungguhnya, sehingga catatan penyakit jangka panjang hewan peliharaan tidak lagi hanya data demo.',
        zh: '把寵物慢性病照護頁面整合進每日照護系統，並串接真實資料庫，寵物的長期病況記錄不再只是示範資料。', en: "Mengintegrasikan halaman care disease kronis animal peliharaan to sistem daily care and menghubungkannya to tabel Supabase that sesungguhnya, so that recordan disease jangka panjang animal peliharaan no longer only data demo.",
      },
      {
        id: 'Menambahkan opsi templat perawatan harian kustom, sekaligus memperbaiki preferensi hewan peliharaan yang sebelumnya tidak tersimpan dengan benar.',
        zh: '新增自訂每日照護範本選項，並修正先前寵物照護偏好設定沒有正確保存的問題。', en: "Menambahkan opsi templat daily care kustom, sekaligus memperbaiki preferensi animal peliharaan that senot yetnya not saved with benar.",
      },
      {
        id: 'Jenis penerima perawatan (manusia/hewan peliharaan) kini benar-benar menyaring modul perawatan yang ditampilkan di layar, sehingga tidak muncul item yang tidak relevan.',
        zh: '照護對象類型（人類／寵物）現在會正確篩選畫面顯示的照護模組，避免看到不相關的項目。', en: "Type care recipient (manusia/animal peliharaan) now benar-benar menyaring modul care that shown in layar, so that not muncul item that not relevan.",
      },
      {
        id: 'Akun demo kini memiliki satu hewan peliharaan contoh untuk setiap jenis spesies, memudahkan mencoba fitur halaman perawatan hewan peliharaan secara lengkap.',
        zh: '示範帳號現在每種寵物類型都有一隻範例寵物，方便體驗寵物照護頁面的完整功能。', en: "Akun demo now memiliki satu animal peliharaan example for each type spesies, memudahkan mencoba fthatr halaman care animal peliharaan secara lengkap.",
      },
    ],
    'bug fixes': [
      {
        id: 'Memperbaiki bug saat input suhu tubuh, pemeriksaan format secara keliru menonaktifkan tombol kirim.',
        zh: '修正體溫輸入時，格式檢查會誤將送出按鈕鎖住的問題。', en: "Memperbaiki bug when input body temperature, pemeriksaan format secara toliru menonaktifkan tombol kirim.",
      },
      {
        id: 'Memperbaiki bug ketika templat perawatan kustom dikosongkan, tampilan tidak kembali dengan benar ke item bawaan sesuai jenis spesies.',
        zh: '修正清空自訂照護範本後，畫面沒有正確退回該物種預設項目的問題。', en: "Memperbaiki bug totika templat care kustom dikosongkan, tampilan not back with benar to item bawaan sesuai type spesies.",
      },
      {
        id: 'Memperkuat kontrol akses pada fungsi database, mencegah pemanggilan fitur internal dari sumber yang tidak berwenang, guna meningkatkan keamanan data secara keseluruhan.',
        zh: '加強資料庫函式的存取權限管控，避免未授權來源呼叫內部功能，提升整體資料安全性。', en: "Memperkuat kontrol akses on fungsi database, mencegah pemanggilan fthatr internal from sumber that not berwenang, guna meningkatkan toamanan data secara toseluruhan.",
      },
    ],
  },
  '1.5.0': {
    features: [
      {
        id: 'Memperbesar teks pengingat istirahat dan memberi kode warna pada banner hitung mundur tekanan darah, agar pengguna lebih mudah melihat kapan waktu istirahat berikutnya dan status pengukuran tekanan darah saat ini.',
        zh: '放大休息提醒文字，並為血壓量測倒數計時橫幅加上顏色編碼，讓使用者更容易看到下次休息時間與目前的量測狀態。', en: 'Enlarge the break reminder text and color-code the blood pressure measurement countdown banner to make it easier for users to see the next break and the current measurement status.',
      },
      {
        id: 'Mengotomasi penerapan migration Supabase production agar proses penerbitan versi lebih lancar dan konsisten dengan alur staging.',
        zh: '自動應用正式環境 Supabase 資料庫異動，讓版本發布流程更順暢且與 staging 流程保持一致。', en: 'Automated Supabase production migrations so releases are smoother and consistent with the staging workflow.',
      },
      {
        id: 'Menambahkan daftar obat yang sedang digunakan ke laporan cetak versi dokter untuk blood pressure tracking.',
        zh: '血壓醫師版列印報告現在包含目前正在使用的藥單，方便醫療人員查看用藥與血壓的關連。', en: 'The blood pressure clinician report now includes the current medication list, making it easier to review medication and blood pressure together.',
      },
    ],
    'bug fixes': [
      {
        id: 'Memperbaiki bug saat riwayat tekanan darah harian menampilkan pesan "sedang disinkronkan" secara berulang karena perbedaan format string waktu dalam operasi perbandingan.',
        zh: '修正血壓今日量測明細因時間字串格式不同而重複顯示「同步中」的問題。', en: 'Fixed repeated “syncing” messages in the daily blood pressure history caused by inconsistent time-string formats.',
      },
    ],
  },
  '1.4.1': {
    'bug fixes': [
      {
        id: 'Menghapus batas berat 10–500 kg pada catatan berat badan, karena asumsi itu hanya berlaku untuk manusia dewasa; kini menerima berat badan hewan peliharaan apa pun, dari yang sangat kecil hingga sangat besar.',
        zh: '移除體重紀錄原本 10～500 公斤的上下限，這個假設只適用人類成人；現在不論寵物體型多小或多大都能正常記錄。', en: 'Removed the 10–500 kg limit on weight records because it only suited human adults; pets of any size can now be recorded.',
      },
    ],
  },
  '1.4.0': {
    features: [
      {
        id: 'Tren terbaru kini terintegrasi ke setiap halaman jenis perawatan; halaman data diubah menjadi ringkasan laporan menyeluruh.',
        zh: '把「近期趨勢」整合進各項照護紀錄頁面，資料頁改版為綜合報告總覽，方便快速掌握整體狀況。', en: 'Integrate "Recent Trends" into each care record page. The information page has been redesigned as a comprehensive report overview, so that you can quickly understand the overall situation.',
      },
      {
        id: 'Menambahkan bentuk obat "bubuk sachet"; satuan dosis kini bisa ditampilkan sebagai "berapa sachet".',
        zh: '新增「粉包」藥物劑型，劑量單位可直接顯示「幾包」，方便記錄沖泡藥粉的用藥量。', en: 'Added powder sachets as a medication form, with dose units shown as packets.',
      },
    ],
    'bug fixes': [
      {
        id: 'Memperbaiki masalah saat sebagian browser tidak bisa menyimpan foto kejadian perawatan sebagai WebP; kini otomatis beralih ke JPEG, dan tombol unggah foto diaktifkan kembali.',
        zh: '修正部分瀏覽器（如舊版 Safari）無法把照護事件照片存成 WebP 的問題，改用 JPEG 備援，並重新開放照片上傳按鈕。', en: 'Fixed an issue where some browsers (like old Safari) could not save care incident photos as WebP, used JPEG redundancy instead, and reopened the photo upload button.',
      },
      {
        id: 'Menstabilkan navigasi bawah saat keyboard ditutup, dan menampilkan detail kesalahan saat foto gagal disimpan.',
        zh: '修正手機鍵盤收合時底部導覽列跳動的問題，照片儲存失敗時也會顯示詳細的錯誤原因。', en: 'Fix an issue where the bottom navigation bar jumps when the phone keyboard is collapsed, and a detailed error reason is also displayed when the photo fails to save.',
      },
      {
        id: 'Daftar riwayat pengukuran (termasuk berat badan) kini diurutkan dengan waktu pengukuran terbaru di paling atas; angka berat badan ditampilkan dengan dua desimal, dan sisa teks nomor slot di daftar "catatan terbaru" dihapus.',
        zh: '生理數值與體重的量測紀錄列表，改成最新的量測時間排在最上面；體重數字統一顯示到小數點後兩位，並移除「最近紀錄」清單裡殘留的槽位編號文字。', en: 'Sorted measurement history, including weight, with the newest first; showed weight to two decimals and removed leftover slot numbers from recent records.',
      },
      {
        id: 'Kesalahan terkait anggota keluarga dan nama tampilan kini menggunakan pesan dwibahasa bersama, tidak lagi menampilkan pesan error mentah dari sistem.',
        zh: '家庭成員邀請與顯示名稱發生錯誤時，改用共用的雙語提示訊息，不再直接洩漏系統後端的原始錯誤內容。', en: 'When family member invite and display name errors occur, use the shared bilingual prompt message instead of directly revealing the original error content on the back end of the system.',
      },
      {
        id: 'Menghapus teks bahasa Mandarin yang tertulis langsung (hardcode) di laporan dan notifikasi, serta memperbaiki tanggal di halaman catatan makan agar berganti hari dengan benar saat melewati tengah malam.',
        zh: '移除報表與通知功能裡殘留的中文寫死文字，並修正飲食紀錄頁在跨過午夜時日期沒有正確換日的問題。', en: 'Removed hardcoded Chinese text from reports and notifications, and fixed the meal log date when a record crosses midnight.',
      },
      {
        id: 'Menyatukan aturan lompat kolom pada formulir tekanan darah; catatan berat badan kini diurutkan berdasarkan waktu; pengingat suhu tubuh baru muncul saat mendekati batas harian agar tidak terlalu sering mengganggu.',
        zh: '統一血壓表單的跳欄輸入規則；體重紀錄改成依時間排序操作；體溫提醒改成接近每日上限時才提示，避免過度打擾。', en: 'Standardized blood pressure field navigation, sorted weight records by time, and limited temperature reminders to times near the daily limit.',
      },
      {
        id: 'Tombol "sesuaikan" pada daftar obat kini memberi umpan balik yang jelas saat ditekan, dan akan menampilkan peringatan yang jelas sebelum menimpa resep yang sudah ada.',
        zh: '藥單「調整」按鈕加上明顯的按下回饋效果，覆蓋既有用藥醫囑前會清楚提示使用者確認。', en: 'Added clear feedback when the medication Adjust button is pressed and a confirmation warning before an existing prescription is overwritten.',
      },
      {
        id: 'Memperbaiki masalah saat pasien yang sudah diarsipkan menyebabkan orang yang ditampilkan di layar berbeda dengan orang yang datanya sebenarnya disimpan.',
        zh: '修正照護對象已被封存時，畫面顯示的照護對象與實際寫入資料的對象可能不一致的問題。', en: 'Fix an issue where, when the subject of care has been archived, the subject of care shown on the screen may not be identical to the subject who actually wrote the data.',
      },
    ],
  },
  '1.3.1': {
    'bug fixes': [
      { id: 'Meningkatkan efisiensi proses penerbitan versi agar pembaruan aplikasi dapat berjalan lebih lancar.', zh: '改善版本發布流程的效率，讓 App 更新可以更順利進行。', en: 'Improve the efficiency of the release process and make app updates smoother.' },
    ],
  },
  '1.3.0': {
    features: [
      { id: 'Setiap pasien kini punya agenda kalender sendiri, menampilkan jadwal penting yang akan datang.', zh: '每位病人現在都有專屬的行事曆代辦，可查看即將到來的重要行程。', en: 'Each patient now has their own calendar so they can see important upcoming trips.' },
      { id: 'Semua jenis catatan perawatan kini bisa dilampiri foto, tidak hanya catatan tertentu.', zh: '所有照護紀錄類型現在都能附上照片，不再侷限於特定項目。', en: 'Photos can now be attached to all types of care records, no longer limited to specific items.' },
    ],
    'bug fixes': [
      { id: 'Memperbaiki halaman catatan rilis agar tidak menampilkan ringkasan kosong; ringkasan yang belum diterjemahkan kini ditandai dengan jelas.', zh: '修正版本更新頁面不再顯示空白的雙語摘要；尚未翻譯的內容會清楚標示「尚未翻譯」。', en: 'The fix update page no longer displays blank bilingual summaries; untranslated content is clearly marked as “untranslated.”' },
    ],
  },
  '1.2.4': {
    'bug fixes': [
      { id: 'Menambahkan navigasi keyboard pada tab obat.', zh: '為用藥分頁加入鍵盤操作功能。', en: 'Adds keyboard controls to the Medications tab.' },
      { id: 'Mengumumkan peringatan demam yang tersimpan.', zh: '儲存發燒警示時會有語音朗讀提示。', en: 'There will be a voice readout when the fever alert is saved.' },
      { id: 'Memperjelas makna navigasi bawah untuk pembaca layar.', zh: '讓底部導覽列的語意更清楚，方便螢幕報讀器辨識。', en: 'Memperjelas makna navigasi bawah for pembaca layar.' },
      { id: 'Memperkuat keamanan sesi tekanan darah yang tersimpan.', zh: '強化血壓量測記錄的儲存安全性。', en: 'Enhance the storage safety of blood pressure measurement records.' },
      { id: 'Meningkatkan tipografi laporan di ponsel.', zh: '改善手機版報表的文字排版。', en: 'Improved text typography for mobile reports.' },
      { id: 'Meningkatkan fokus keyboard pada jendela pop-up.', zh: '改善彈出視窗的鍵盤焦點處理。', en: 'Improved keyboard focus for pop-ups.' },
      { id: 'Meningkatkan semantik formulir dua bahasa di pengaturan.', zh: '改善設定頁雙語表單的語意標記。', en: 'Improved semantic markup for bilingual forms on the settings page.' },
      { id: 'Meningkatkan notifikasi langsung pada formulir tanda vital.', zh: '改善生理數值表單的即時語音通知。', en: 'Improve real-time voice notifications for physiological numeric forms.' },
      { id: 'Menjaga kerangka aplikasi tetap dalam satu wadah gulir.', zh: '讓整個應用程式維持單一捲動容器，避免版面跑版。', en: 'Menjaga kernumbers app tetap in one wadah gulir.' },
      { id: 'Menjaga hitung mundur tekanan darah tetap terlihat.', zh: '讓血壓量測倒數計時保持可見。', en: 'Menjaga hitung mundur blood pressure tetap visible.' },
      { id: 'Menjaga tab perawatan harian tetap terlihat di ponsel.', zh: '讓手機版的每日照護分頁保持可見。', en: 'Menjaga tab care daysan tetap visible di ponsel.' },
      { id: 'Menjaga manajemen perawatan demo tetap hanya-baca.', zh: '讓示範帳號的照護管理維持唯讀，避免誤改資料。', en: 'Menjaga manajemen care demo tetap only-read.' },
      { id: 'Menerjemahkan bagian catatan rilis ke dua bahasa.', zh: '為版本更新頁面的分類標題加上雙語翻譯。', en: 'Add a bilingual translation to the taxonomy title of the version update page.' },
      { id: 'Menerjemahkan teks yang terlihat pada UX-09.', zh: '補齊 UX-09 項目中畫面可見文字的雙語翻譯。', en: 'Menerjemahkan teks that visible on UX-09.' },
      { id: 'Memprioritaskan ringkasan dasbor di ponsel.', zh: '讓手機版優先顯示總覽儀表板。', en: 'Memprioritaskan ringkasan dasbor di ponsel.' },
      { id: 'Memprioritaskan aksi obat rutin.', zh: '讓例行用藥的操作按鈕優先顯示。', en: 'Memprioritaskan aksi medication rutin.' },
      { id: 'Melindungi ekspor jendela dari tertutup tidak sengaja saat menekan Escape.', zh: '避免按下 Esc 鍵時誤關正在匯出的視窗。', en: 'Melindungi export jendela from tertutup not sengaja when menekan Escape.' },
      { id: 'Memperbesar area sentuh tombol perawatan.', zh: '放大照護按鈕的可點擊範圍，方便手機操作。', en: 'Increase the clickable range of the care button for easy mobile operation.' },
      { id: 'Menghormati preferensi gerakan berkurang pada perangkat.', zh: '尊重裝置「減少動態效果」的偏好設定。', en: 'Respect your device’s less dynamic preferences.' },
      { id: 'Menampilkan entri linimasa lama sesuai permintaan.', zh: '可依需求展開查看更早的時間軸紀錄。', en: 'Expand to see earlier timeline logs as needed.' },
      { id: 'Menyederhanakan alur slot pengukuran berat badan.', zh: '簡化體重量測時段的操作流程。', en: 'Menyederhanakan alur slot pengukuran berat baand.' },
      { id: 'Menyatukan header merek pada halaman publik.', zh: '統一公開頁面的品牌標頭樣式。', en: 'Menyatukan header merek on halaman publik.' },
    ],
  },
  '1.2.3': {
    'bug fixes': [
      {
        id: 'Memperbaiki catatan rilis agar ringkasan dua bahasa tetap tersedia setelah Release Please memperbarui changelog.',
        zh: '修正版更新紀錄，確保 release-please 更新 changelog 後仍保留雙語摘要。', en: 'Revised update history to ensure bilingual summaries remain after release-please update changelog.',
      },
      {
        id: 'Memastikan status rilis produksi ditandai selesai agar versi berikutnya dapat dibuat tanpa terhenti.',
        zh: '確保正式版本狀態會標記完成，讓下一版能順利產生。', en: 'Memastikan status rilis produksi ditandai selesai so that version next can created tanpa terhenti.',
      },
    ],
  },
  '1.2.2': {
    'bug fixes': [
      {
        id: 'Memastikan akun pasien ibu hanya dapat melihat dan mengelola data kesehatan ibu sendiri.',
        zh: '確保媽媽的病人帳號只能查看與管理媽媽自己的健康資料。', en: 'Memastikan account pasien ibu only can melihat and mengelola health data ibu sendiri.',
      },
      {
        id: 'Memperkuat pembersihan izin agar perubahan akses yang terjadi bersamaan tetap aman.',
        zh: '加強權限清理流程，讓同時發生的授權變更仍能安全處理。', en: 'Enhance the permission cleanup process so that concurrent authorization changes can still be handled safely.',
      },
    ],
  },
  '1.2.0': {
    features: [
      {
        id: 'Catatan perawatan kini mencakup suhu tubuh, berat badan, obat rutin maupun PRN, serta foto kejadian perawatan.',
        zh: '照護紀錄現在可包含體溫、體重、例行與需要時用藥，以及照護事件照片。', en: 'Care records can now include body temperature, weight, routine and on-demand medications, and photos of care events.',
      },
      {
        id: 'Pengaturan dan catatan kesehatan mengikuti setiap pasien, agar data tidak tercampur saat berganti orang yang dirawat.',
        zh: '照護設定與健康紀錄會跟隨每位病人，切換照護對象時不會混用資料。', en: 'Care settings and health records follow each patient and do not mix data when switching care recipients.',
      },
      {
        id: 'Linimasa dan pengingat perawatan ditingkatkan agar keluarga lebih mudah melanjutkan informasi penting.',
        zh: '照護時間線與提醒功能已加強，讓家人更容易接續重要資訊。', en: 'Care timelines and reminders have been enhanced to make it easier for families to connect with important information.',
      },
    ],
    'bug fixes': [
      {
        id: 'Memperbaiki pengalaman penggunaan di ponsel, label dua bahasa, dan tampilan catatan perawatan.',
        zh: '改善手機操作、雙語標籤與照護紀錄的顯示。', en: 'Improved display of phone controls, bilingual labels, and care records.',
      },
      {
        id: 'Memperkuat pemisahan dan izin data kesehatan untuk setiap pasien.',
        zh: '加強每位病人的健康資料分隔與授權保護。', en: 'Strengthen the separation and authorization protection of each patient’s health data.',
      },
    ],
  },
  '1.2.1': {
    'bug fixes': [
      {
        id: 'Memperbaiki cara riwayat rilis menentukan batas versi di lingkungan pengujian, agar catatan versi tidak tercampur dengan rilis produksi.',
        zh: '修正驗收環境判定版本歷史邊界的方式，避免把正式版紀錄混進來。', en: 'Modify the way the acceptance environment determines the version history boundary to avoid mixing the official version records.',
      },
      {
        id: 'Membatasi pencarian riwayat rilis agar pembaruan versi tetap stabil saat riwayat proyek bertambah.',
        zh: '限制版本歷史的搜尋範圍，讓專案歷史增加後仍能穩定更新版本資訊。', en: 'Membatasi pencarian riwayat rilis so that pembaruan version tetap stabil when riwayat proyek bertambah.',
      },
    ],
  },
}

export function curatedReleaseNoteItems(version: string, sectionTitle: string): LocalizedText[] | null {
  return CURATED_RELEASE_SUMMARIES[version]?.[sectionTitle.toLowerCase()] ?? null
}

// release-please 的摘要通常只有提交者使用的單一語言，只有補上這段 metadata 才算是人工確認過的翻譯。
const LOCALIZED_ITEM_METADATA = /<!--\s*id:\s*(.*?)\s*\|\s*zh:\s*(.*?)\s*-->\s*$/i

export function localizedReleaseNoteItem(item: string): LocalizedText | null {
  const match = item.match(LOCALIZED_ITEM_METADATA)
  if (!match) return null

  const id = match[1].trim()
  const zh = match[2].trim()
  // CHANGELOG 條目本身通常是英文，保留它作為第三語系，避免把印尼文 metadata 誤當英文顯示。
  const en = item.replace(LOCALIZED_ITEM_METADATA, '').trim()
  return id && zh ? { id, zh, en: en || id } : null
}

// release-please 產生的條目常帶 PR／commit 連結參照，顯示原文前先清掉這些雜訊。
const GENERATED_REFERENCE = /\s*\(\[#\d+\]\([^)]*\)\)|\s*\(\[[0-9a-f]+\]\([^)]*\)\)/gi

// 為什麼一定要有 fallback：curated 翻譯與逐條 metadata 都需要人工事後補上，若沒有 fallback，
// 每次發版在人工補完翻譯前，畫面就會回到「雙語摘要正在整理中」的空白提示。原文（通常是英文）
// 先頂上讓使用者「馬上」看到內容，但 translated: false 會讓畫面標示「尚未翻譯」，
// 不會把未經確認的原文冒充成中文／印尼文翻譯（避免照護語意被誤解）。
export function fallbackReleaseNoteItem(item: string): LocalizedText {
  const plain = item.replace(LOCALIZED_ITEM_METADATA, '').replace(GENERATED_REFERENCE, '').trim()
  return { id: plain, zh: plain, en: plain }
}

export type ReleaseNoteDisplayItem = {
  text: LocalizedText
  // false 代表 text 是未翻譯原文（兩個語系顯示相同內容），畫面要標示出來，不能當成已確認的翻譯。
  translated: boolean
}

export function resolveReleaseNoteItem(item: string): ReleaseNoteDisplayItem {
  const localized = localizedReleaseNoteItem(item)
  return localized ? { text: localized, translated: true } : { text: fallbackReleaseNoteItem(item), translated: false }
}

function parseReleaseHeading(line: string): Omit<ReleaseNote, 'sections'> | null {
  const linkedHeading = line.match(/^##\s+\[([^\]]+)\]\(([^)]+)\)(?:\s+\(([^)]+)\))?\s*$/)
  if (linkedHeading) {
    if (!isReleaseVersion(linkedHeading[1])) return null
    return {
      version: normalizeVersion(linkedHeading[1]),
      url: linkedHeading[2],
      ...(linkedHeading[3] ? { date: linkedHeading[3] } : {}),
    }
  }

  const plainHeading = line.match(/^##\s+\[?([^\s\]]+)\]?(?:\s+-\s*(.+))?\s*$/)
  if (!plainHeading) return null
  if (!isReleaseVersion(plainHeading[1])) return null

  return {
    version: normalizeVersion(plainHeading[1]),
    ...(plainHeading[2] ? { date: plainHeading[2] } : {}),
  }
}

function normalizeVersion(value: string) {
  return value.replace(/^v/i, '')
}

function isReleaseVersion(value: string) {
  return /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(normalizeVersion(value))
}

// 只解析 release-please 需要的標題與條列，保留 commit 原文，避免為了 render Markdown 再引入一套依賴。
export function parseChangelog(markdown: string): ReleaseNote[] {
  const releases: ReleaseNote[] = []
  let currentRelease: ReleaseNote | null = null
  let currentSection: ReleaseNoteSection | null = null

  for (const rawLine of markdown.split(/\r?\n/)) {
    const line = rawLine.trim()
    const releaseHeading = parseReleaseHeading(line)
    if (releaseHeading) {
      currentRelease = { ...releaseHeading, sections: [] }
      releases.push(currentRelease)
      currentSection = null
      continue
    }

    if (!currentRelease) continue

    const sectionHeading = line.match(/^###\s+(.+?)\s*$/)
    if (sectionHeading) {
      currentSection = { title: sectionHeading[1], items: [] }
      currentRelease.sections.push(currentSection)
      continue
    }

    const item = line.match(/^[-*]\s+(.+?)\s*$/)
    if (!item) continue

    // 沒有分類標題的手寫條目仍要可見，避免 release-please 格式變動時整段內容靜默消失。
    if (!currentSection) {
      currentSection = { title: 'Changes', items: [] }
      currentRelease.sections.push(currentSection)
    }
    currentSection.items.push(item[1])
  }

  return releases
    .map(release => ({
      ...release,
      sections: release.sections.filter(section => section.items.length > 0),
    }))
    .filter(release => release.sections.length > 0)
}
