/*
檔案用途：release notes 人工彙整三語（zh/id/en）文案資料，依版本號索引。
所在層：src/lib 純資料層；不含任何邏輯，只被 releaseNotes.ts 匯入使用。
主要關聯：由 src/lib/releaseNotes.ts 的 curatedReleaseNoteItems() 讀取；資料量隨版本成長，
從 releaseNotes.ts 拆出以保留該檔案的邏輯可讀性（見 issue #839）。
*/

import type { LocalizedText } from './i18n'

// 為什麼以版本彙整而非逐條 commit 翻譯：release-please 會重寫 CHANGELOG，逐條 HTML metadata 不能成為可靠資料來源；人工確認的照護摘要才不會在下次發版又消失。
export const CURATED_RELEASE_SUMMARIES: Record<string, Record<string, LocalizedText[]>> = {
  // 為什麼要有 1.20.1：1.20.0 的 promotion PR（#981）審查時發現門診頁「醫師說了什麼」會把回答掛到還沒發生的看診，
  // 修正後才發布，所以正式環境會直接從 1.19.0 跳到 1.20.1。原始 CHANGELOG 只有修正本身與這則摘要兩條 fix，
  // 照搬會出現「補上 v1.20.1 的三語版本更新說明」這種照護者看不懂的條目。
  '1.20.1': {
    'bug fixes': [
      { id: 'Memperbaiki bagian "Apa kata dokter" di tab Dokter yang bisa menempelkan jawaban dokter ke kunjungan yang belum terjadi (misalnya kunjungan terjadwal besok). Jawaban kini hanya dipasangkan dengan kunjungan yang sudah berlangsung sebelum jawaban dicatat; waktu kunjungan yang tercatat hanya boleh lebih lambat paling lama dua jam, karena sering yang dicatat adalah jam janji temu.', zh: '修正門診頁「醫師說了什麼」可能把醫師的回答掛到還沒發生的看診（例如排在明天的回診）上的問題；現在只會配對在回答寫下之前已經發生的看診，看診紀錄時間最多只容許比回答晚兩小時（常記成預約時間）。', en: 'Fixed "What the doctor said" on the Visit tab sometimes filing an answer under a visit that had not happened yet (for example, a follow-up scheduled for tomorrow). Answers are now paired only with visits that took place before the answer was recorded, allowing the logged visit time to be at most two hours later, since it is often the appointment time.' },
    ],
  },
  // 為什麼先人工彙整：1.20.0 一次帶上照護閉環 T1–T5、分享摘要 v2 T1–T4、血壓通知與畫面同源判讀（#899）、
  // #424 隱私揭露與 AUDIT-1，原始 CHANGELOG 有八十多條，同一件事常被 squash 與 merge commit 各寫一次，
  // 又混著 schema 快照、secret 閘門、pre-commit hook 等照護者看不到的工程項目。這裡只留下會改變看護
  // 或家屬操作與判斷的項目。
  // 為什麼刻意不寫分享摘要 v2：production 的分享連結 secret 仍依 #424 Stage 0 刻意未設定，Function
  // 會 fail closed，寫進版本說明等於宣傳一個點下去只會顯示「連結無效」的功能；等 #424／#553 解除後再寫。
  // AUDIT-1 的異動紀錄目前沒有任何畫面，也不寫。
  // 為什麼要寫隱私告知改版：版本升到 2026-09-25.2 後，每個帳號第一次開 App 都會被要求重新同意，
  // 看護要先知道這不是故障。
  // 為什麼不寫「看護帳號不再能分享」（PR #978 Codex P1）：20260924191747 只擋新的授權、只印 WARNING，
  // 現有看護帳號的 can_share_readonly 要等部署後營運者跑 set_patient_share_readonly 才收回
  // （docs/operations/caregiver-share-readonly-revocation.md）。版本說明只寫部署本身就保證成立的行為。
  '1.20.0': {
    features: [
      { id: 'Menambahkan tab "Dokter" untuk semua pengasuh: kunjungan berikutnya, apa yang dibawa ke dokter, apa yang ditanyakan, apa kata dokter, dan hal yang perlu dilakukan setelah kunjungan kini ada di satu halaman. Tab "Jadwal" yang sebelumnya hanya terlihat oleh pemilik keluarga digabungkan ke halaman ini.', zh: '新增「門診」分頁，所有照護者都看得到：下次門診、帶去給醫師、問什麼、醫師說了什麼、看診後要做的事，集中在同一頁；原本只有家庭擁有者看得到的「行程」分頁併入這一頁。', en: 'Added a "Visit" tab for every caregiver: the next appointment, what to bring to the doctor, what to ask, what the doctor said, and what to do after the visit are now on one page. The "Schedule" tab, previously visible only to the family owner, has been folded into it.' },
      { id: 'Bagian "Ringkasan sebelum kunjungan" di laporan tekanan darah untuk dokter kini dibagi menjadi "Catatan perawatan" dan "Pengingat terjadwal". Setiap pertanyaan di sana bisa dimasukkan ke daftar pertanyaan dengan satu ketukan, dan item yang sama tidak akan masuk dua kali. Daftar pertanyaan kini mencatat apakah pertanyaan ditambahkan manual atau dari ringkasan, serta kapan pertanyaan itu dijawab; pertanyaan lama yang sudah dijawab juga dilengkapi waktu jawabannya.', zh: '醫師版血壓報告的「就診前摘要」分成「照護筆記」與「排程提醒」兩小節，每個提問都能一鍵「加入問題清單」，同一項不會重複加入。問題清單會記下每題是手動新增還是從摘要加入，以及何時得到回答；過去已回答的問題也補上了回答時間。', en: 'The "Pre-visit brief" in the doctor-facing blood pressure report is now split into "Care notes" and "Scheduled reminders", and each question there can be added to the question list with one tap without creating duplicates. The question list now records whether a question was added by hand or from the brief, and when it was answered; questions answered earlier have had their answer time filled in.' },
      { id: 'Kebijakan privasi dan pemberitahuan data kesehatan diperbarui: kini dijelaskan bahwa notifikasi dikirim melalui Telegram, LINE, dan Resend (untuk email undangan), serta bagaimana tautan berbagi baca-saja menangani data. Saat pertama kali membuka aplikasi setelah pembaruan, Anda akan diminta menyetujuinya sekali lagi.', zh: '隱私權政策與健康資料告知改版：寫明通知會經由 Telegram、LINE 與 Resend（寄送邀請信）傳送，並說明唯讀分享連結如何處理資料；更新後第一次開啟 App 會請你重新確認一次。', en: 'The privacy policy and health data notice have been updated to state that notifications go through Telegram, LINE and Resend (for invitation emails), and how read-only share links handle data. The first time you open the app after the update, you will be asked to confirm them once more.' },
    ],
    'bug fixes': [
      { id: 'Notifikasi tekanan darah untuk keluarga kini memakai penilaian yang sama dengan layar dan standar tekanan darah milik pasien itu sendiri, serta mencantumkan standar yang dipakai. Sebelumnya notifikasi bisa berkata "normal" sementara layar menunjukkan "di luar target". Jika standar pasien tersebut tidak dapat dibaca, notifikasi tetap dikirim dengan keterangan tersebut, sehingga tekanan darah rendah yang berbahaya tidak terlewat.', zh: '家人收到的血壓通知改用與畫面相同的判讀，並套用這位病人自己的血壓標準，訊息會註明依據哪個標準；先前可能發生通知說「正常」、畫面卻顯示「超出目標」。讀不到個別標準時通知仍會送出並註明，危險的低血壓不會因此漏報。', en: 'Blood pressure notifications to family now use the same assessment as the screen and the patient\'s own blood pressure standard, and state which standard was applied. Previously a notification could say "normal" while the screen showed "off target". If the individual standard cannot be read, the notification is still sent with a note saying so, so a dangerously low reading is not missed.' },
      { id: 'Jika tekanan darah yang disimpan termasuk nilai yang perlu diwaspadai tetapi tidak ada anggota keluarga yang akan menerima notifikasi, halaman input kini mengingatkan pengasuh untuk langsung menghubungi keluarga. Jika layanan notifikasi sendiri bermasalah, aplikasi menampilkan notifikasi gagal dan tidak lagi menganggapnya sudah terkirim.', zh: '存檔的血壓若屬於需要警示的數值、卻沒有任何家人會收到通知，輸入頁會提醒看護直接聯絡家人；通知服務本身出錯時會顯示通知失敗，不再被當成已經通知。', en: 'When a saved blood pressure reading needs attention but no family member will receive a notification, the input page now reminds the caregiver to contact the family directly. If the notification service itself fails, the app now shows a notification failure instead of treating it as sent.' },
      { id: 'Memperbaiki catatan tekanan darah yang sudah memicu notifikasi peringatan tidak bisa dihapus, sementara layar hanya menyuruh memeriksa jaringan.', zh: '修正已發出警示通知的血壓紀錄無法刪除、畫面卻只說「請確認網路」的問題。', en: 'Fixed blood pressure records that had already triggered an alert notification not being deletable, while the screen only blamed the network.' },
      { id: 'Memperbaiki akun yang pernah mengirim undangan perawatan, atau yang bergabung lewat undangan, tidak bisa dihapus.', zh: '修正發出過照護邀請、或經由邀請加入的帳號無法刪除的問題。', en: 'Fixed accounts that had sent a care invitation, or had joined through one, being impossible to delete.' },
      { id: 'Perbaikan menyeluruh pada antarmuka bahasa Inggris dan Indonesia: tampilan Inggris tidak lagi bercampur bahasa Indonesia, tampilan Indonesia tidak lagi bercampur bahasa Inggris atau sisa terjemahan mesin, dan satuan dosis serta tanggal kini mengikuti bahasa yang dipilih.', zh: '全面修正英文與印尼文介面：英文畫面不再夾雜印尼文，印尼文畫面不再夾雜英文與機器翻譯殘句，劑量單位與日期也改用目前選擇的語言。', en: 'Cleaned up the English and Indonesian interfaces throughout: English screens no longer mix in Indonesian, Indonesian screens no longer mix in English or leftover machine translation, and dose units and dates now follow the selected language.' },
      // 為什麼不說「鼠蹊可分開記錄」（PR #978 Codex P1）：PetFluidTherapyPage 的選單只有頸部、腹部、側腰，沒有鼠蹊可選；
      // 這次修的是「頸部」不再兼指鼠蹊，以及舊紀錄如實標示為無法區分。
      { id: 'Pada terapi cairan hewan peliharaan, pilihan lokasi suntikan "Leher" kini hanya berarti leher. Catatan lama dengan pilihan "Leher/Selangkangan" tidak bisa dibedakan lagi, sehingga ditampilkan sebagai "Leher atau selangkangan (catatan lama)" dan tidak dianggap pasti leher.', zh: '寵物皮下輸液的注射部位選項「頸部」現在只代表頸部。舊紀錄當時的選項兼指頸部或鼠蹊、無法再區分，因此標示為「頸部或鼠蹊（舊紀錄）」，不會被當成確定是頸部。', en: 'In pet fluid therapy, the "Neck" injection site option now means only the neck. Older records made with the combined neck/groin option can no longer be told apart, so they are shown as "Neck or groin (older record)" instead of being treated as definitely the neck.' },
    ],
  },
  // 為什麼先人工彙整：1.19.0 的原始 CHANGELOG 條目混雜大量內部工程用語（Edge Function secret 檢查、
  // staging migration 腳本防護、AlertLevel 型別重建），而且「病人血壓標準」這個功能的引擎／資料層／UI
  // 三個 PR（#896、#897、#898）分開各寫一條，逐條照搬只會讓 /releases 看到看不懂的實作細節，還漏了
  // 「這對照護者代表什麼」；併成一則完整說明對使用者才有意義。同一功能上線後被 review 抓出的資料安全
  // 缺口（跨病人資料殘留、讀取失敗被誤報成尚未設定、歷史備註可被事後竄改）直接影響照護者能否信任畫面
  // 顯示的血壓判讀結果，屬於本文件定義的健康安全正確性問題，故完整保留翻譯，不因為是「review 修正」
  // 就略過。
  '1.19.0': {
    features: [
      { id: 'Menambahkan "standar penilaian tekanan darah per pasien": pilih templat standar untuk setiap orang yang dirawat (misalnya dewasa umum, ketat pasca-operasi, atau dilonggarkan untuk lansia), atau masukkan target khusus sendiri. Perubahan berlaku mulai saat disimpan — catatan lama tetap dinilai dengan standar yang berlaku saat itu dan tidak akan diwarnai ulang. Seluruh aplikasi kini memakai empat tingkat warna merah untuk menandai tingkat keparahan sekali lihat.', zh: '新增「病人專屬血壓判讀標準」：可為每位照護對象選擇標準範本（例如一般成人、術後嚴格、高齡放寬）或自行輸入目標範圍，變更只從設定當下起生效，過去的血壓紀錄仍以當時的標準判讀、不會被重新上色；畫面全面改用四階分級的紅色警示，一眼就能看出嚴重程度。', en: 'Added per-patient blood pressure standards: choose a preset template for each person you care for (e.g. general adult, strict post-op, relaxed for elderly) or enter a custom target range. Changes take effect from the moment you save — past readings keep the standard that was in force at the time and are never recolored. The whole app now uses four tiers of red to flag severity at a glance.' },
    ],
    'bug fixes': [
      { id: 'Memperbaiki celah pada standar tekanan darah "ketat pasca-operasi": pembacaan diastolik yang jelas tinggi seperti 118/115 sebelumnya salah dinilai normal (ditampilkan hijau). Juga menutup celah pada rentang diastolik 80–84 yang sebelumnya tidak tercakup tingkat mana pun, dengan mengganti nilai batas yang dipilih manual menjadi pemeriksaan sistematis agar setiap pembacaan masuk ke tingkat yang benar.', zh: '修正「術後嚴格」血壓標準判讀邏輯的漏洞：舒張壓 118/115 這類明顯偏高的數值，先前會被誤判為正常（顯示綠色）；同時補齊舒張壓 80–84 之間原本沒有涵蓋到的分級區間，現在改用系統性掃描確保每個數值都落在正確的級距內。', en: 'Fixed gaps in the "strict post-op" blood pressure standard: clearly high diastolic readings like 118/115 were previously misjudged as normal (shown in green). Also closed a gap in the 80–84 diastolic range that fell outside every tier, replacing hand-picked boundary values with a systematic sweep so every reading now lands in the correct tier.' },
      { id: 'Memperbaiki empat celah keamanan data pada fitur standar tekanan darah per pasien yang baru diluncurkan: saat berpindah pasien, layar bisa sesaat masih menampilkan standar pasien sebelumnya; menyimpan di Pengaturan tidak menyegarkan layar lain (Hari Ini, catatan, laporan) tanpa memuat ulang seluruh halaman; formulir bisa masih menyimpan nilai khusus pasien sebelumnya, berisiko tersimpan ke pasien yang salah; dan kegagalan membaca standar dilaporkan sebagai "belum diatur" padahal sebenarnya "gagal dibaca" — kini kegagalan ditampilkan dengan jelas dan ekspor laporan dinonaktifkan sampai masalah teratasi, agar hasil penilaian yang tidak bisa dipercaya tidak pernah diekspor.', zh: '修正剛上線的病人血壓標準功能中四個資料安全問題：切換病人的瞬間畫面可能短暫沿用前一位病人的標準；設定頁儲存後，今天頁、血壓紀錄與報告等其他畫面沒有同步更新、須整頁重新整理才生效；換病人時表單可能殘留前一位病人的自訂數值，有被誤存到新病人身上的風險；以及讀取標準失敗時畫面誤報「尚未設定」（其實是讀取失敗，不代表真的沒設定），現在會清楚顯示讀取失敗並暫停報告匯出，避免匯出不可信的判讀結果。', en: 'Fixed four data-safety gaps in the newly launched per-patient blood pressure standards: switching patients could briefly keep showing the previous patient\'s standard; saving in Settings did not refresh other screens (Today, records, reports) without a full page reload; the form could retain a previous patient\'s custom values, risking they get saved onto the wrong patient; and a failed read was reported as "not configured" instead of "couldn\'t be checked" — it now clearly shows the read failure and disables report export until it\'s resolved, so an unreliable interpretation is never exported.' },
      { id: 'Memperbaiki dua celah integritas pada riwayat standar tekanan darah: catatan "berdasarkan kunjungan mana" pada rentang yang sudah berakhir masih bisa ditulis ulang diam-diam setelahnya, membuat laporan periode lalu menampilkan sumber yang sudah diubah; dan pemeriksaan "sedang berlaku" bisa keliru menganggap standar terjadwal yang belum aktif sebagai sudah dipakai. Keduanya telah diperbaiki, dan halaman pengaturan kini menampilkan dengan jelas standar mana yang terjadwal dan mulai kapan berlaku.', zh: '修正血壓標準異動紀錄的兩個漏洞：先前已結束的生效區間，其「依據哪次門診」備註仍可能在事後被悄悄改寫，導致過去期間的報告顯示被竄改過的來源；以及「現在生效中」的判斷方式有誤，可能把還沒到生效日的排程標準誤認成已經在用。兩者皆已修正，並新增「已排程、從何時起生效」的清楚顯示。', en: 'Fixed two integrity gaps in blood pressure standard history: a closed interval\'s "which visit" note could still be silently rewritten afterward, letting reports for a past period show a tampered-with source; and the "currently in force" check could mistake a future-dated, not-yet-active standard for one already in use. Both are fixed, and the settings screen now clearly shows which standard is scheduled and from when it takes effect.' },
      { id: 'Memperbaiki target tekanan darah khusus yang sebelumnya bisa menerima nilai tidak valid seperti bukan bilangan bulat atau tak terhingga; kini input yang tidak masuk akal langsung ditolak.', zh: '修正自訂血壓目標範圍可以輸入非整數或無限大等無效數值並被儲存的問題，現在會直接擋下不合理的輸入。', en: 'Fixed custom blood pressure target ranges accepting invalid input like non-integers or infinite values; unreasonable input is now rejected outright.' },
      { id: 'Memperbaiki dua kesalahan terjemahan pada versi antarmuka bahasa Inggris yang salah terisi teks Indonesia.', zh: '修正介面英文版有兩處欄位誤植成印尼文的翻譯錯誤。', en: 'Fixed two interface fields in the English version that were mistakenly filled with Indonesian text.' },
      { id: 'Memperbaiki data khusus pasien (seperti cara minum obat dan tampilan obat) yang tidak ikut dipindahkan — dan berisiko hilang — saat menggabungkan item katalog obat bersama yang duplikat.', zh: '修正合併重複的共用藥品目錄品項時，病人專屬資料（如服用方式、外觀設定）沒有一併搬移過去、可能因此消失的問題。', en: 'Fixed patient-specific data (like intake guidance and appearance settings) not being carried over — and potentially lost — when merging duplicate shared medication catalog entries.' },
      { id: 'Memperbaiki peringatan dini otomatis di halaman Hari Ini: jika pembacaan berat badan, dosis obat, jadwal obat, pengaturan ambang batas, atau catatan tekanan darah gagal, halaman bisa keliru melaporkan "tidak ada yang perlu diperhatikan saat ini" — bahkan saat daftar sudah menampilkan pengingat lain, tidak ada tanda bahwa pemeriksaan belum lengkap. Kini akan jelas ditampilkan "sebagian item belum bisa diperiksa, coba lagi nanti" setiap kali sebagian pemeriksaan gagal.', zh: '修正今天頁的主動異常示警：先前若體重、服藥、藥單、門檻設定或血壓查詢任一項讀取失敗，畫面可能誤報「目前沒有需要留意的項目」，即使清單裡本來就有其他提醒也看不出這次檢查沒做完整。現在只要有任一項檢查失敗，就會明確顯示「部分項目暫時無法檢查，請稍後再試」。', en: 'Fixed the Today page\'s proactive anomaly alerts: if reading weight, medication doses, medication plans, threshold settings, or blood pressure records failed, the page could wrongly report "nothing needs attention right now" — even when the list already showed other reminders, there was no sign the check was incomplete. It now clearly shows "some items couldn\'t be checked right now, please try again later" whenever any part of the check fails.' },
    ],
  },
  // 為什麼先人工彙整：1.18.0 的原始 CHANGELOG 有 70 多條，其中超過一半是內部工程用語（Codex review 收斂、
  // migration 自我檢查、CI flake 重試、RLS policy 改寫），而且 release-please 會把同一件事在 squash commit 與
  // merge commit 各寫一次，直接照搬會讓 /releases 出現大量重複又看不懂的條目。這裡只保留真正改變照護者操作
  // 的項目：四分之一劑量、主動異常示警、離線血壓補送、服用方式、營養品與病人層藥品外觀、原生 App 更新提示。
  '1.18.0': {
    features: [
      { id: 'Menambahkan pilihan dosis 1/4 dan 3/4 pada jadwal obat, agar instruksi dokter untuk menurunkan dosis secara bertahap bisa dicatat dengan tepat.', zh: '藥單新增 1/4 與 3/4 劑量選項，醫師交代逐步減藥時可以精確記錄。', en: 'Added 1/4 and 3/4 dose options to medication plans, so a doctor’s tapering instructions can be recorded precisely.' },
      { id: 'Menambahkan peringatan dini otomatis: berat badan turun drastis, obat yang berturut-turut tidak dilaporkan, serta tekanan darah tinggi berturut-turut atau tekanan darah rendah di malam hari.', zh: '新增主動異常示警：體重驟降、連續未回報服藥、血壓連續偏高或夜間低血壓時會主動提醒照護者。', en: 'Added proactive alerts for sudden weight loss, repeatedly unreported medication doses, and consecutive high or nighttime low blood pressure readings.' },
      { id: 'Catatan tekanan darah yang dibuat saat offline kini otomatis terkirim begitu koneksi pulih atau aplikasi kembali dibuka, tanpa perlu mencoba ulang secara manual.', zh: '離線時記錄的血壓，在恢復連線或回到 App 畫面時會自動補送，不用手動重試。', en: 'Blood pressure readings entered while offline now upload automatically once the connection returns or the app is reopened, with no manual retry needed.' },
      { id: 'Menambahkan kolom "cara minum obat" (sebelum/sesudah makan, dengan air, digerus, dan sebagainya) beserta sumber dan tanggal instruksinya, yang ditampilkan di empat tempat termasuk daftar obat dan halaman Hari Ini.', zh: '新增「服用方式」欄位（飯前飯後、配水、磨粉等），可填寫來源與交代日期，並在藥單、今天頁等四個位置顯示。', en: 'Added an intake-guidance field (before/after meals, with water, crushed, and so on) with its source and instruction date, shown in four places including the medication list and the Today page.' },
      { id: 'Suplemen dan produk nutrisi kini bisa dikelola seperti obat biasa dan menjadi item resmi di katalog obat bersama.', zh: '營養品與保健食品可比照藥品管理，成為共用藥品目錄的正式品項。', en: 'Supplements and nutrition products can now be managed like medications and are first-class items in the shared medication catalog.' },
      { id: 'Tampilan fisik obat (warna, bentuk, coakan) kini bisa disesuaikan per pasien, sehingga pengasuh tidak salah mengenali obat setelah pergantian merek.', zh: '同一種藥可依病人自訂外觀（顏色、形狀、刻痕），換藥廠或換包裝後不會認錯藥。', en: 'A medication’s appearance (color, shape, score line) can now be overridden per patient, so caregivers don’t misidentify pills after a brand or packaging change.' },
      { id: 'Menambahkan hak akses kurator katalog obat bersama dan tab katalog obat di halaman /admin, untuk memelihara data obat resmi.', zh: '新增共用藥品目錄管理員權限與 /admin 藥品目錄分頁，方便維護官方藥品資料。', en: 'Added a shared-catalog curator entitlement and a medication catalog tab in /admin for maintaining official medication data.' },
      { id: 'Aplikasi native (iOS/Android) kini menyinkronkan nomor versinya dan menampilkan pemberitahuan "ada versi baru, silakan perbarui aplikasi".', zh: '原生 App（iOS／Android）新增版本號同步與「有新版請更新 App」提示。', en: 'The native iOS/Android shell now syncs its version number and shows an “a new version is available, please update” prompt.' },
    ],
    'bug fixes': [
      { id: 'Memperbaiki pengenalan foto resep AI yang gagal karena perbedaan huruf besar-kecil pada header permintaan.', zh: '修正 AI 藥單拍照辨識因請求標頭大小寫不一致而失敗的問題。', en: 'Fixed AI medication-photo recognition failing because of a request header’s letter casing.' },
      { id: 'Memperbaiki banyak kesalahan terjemahan pada antarmuka Inggris dan Indonesia: kolom Inggris yang salah terisi teks Indonesia, tab obat yang teksnya meluber, dan sisa bahasa lain di halaman tanda vital.', zh: '修正英文與印尼文介面多處翻譯錯誤：英文欄位誤植成印尼文、藥品分頁文字溢出、生命徵象頁殘留其他語言。', en: 'Fixed multiple English and Indonesian interface translation errors: English fields filled with Indonesian text, medication tab labels overflowing, and another language leaking into the vitals page.' },
      { id: 'Memperbaiki tiga race condition pada pengiriman ulang tekanan darah offline, agar data tidak terkirim ganda atau justru terlewat.', zh: '修正離線血壓補送的三個競速問題，避免同一筆重複送出或漏送。', en: 'Fixed three race conditions in the offline blood pressure flush that could double-send or drop a reading.' },
      { id: 'Memperbaiki data pasien sebelumnya yang masih tertinggal di layar setelah berganti orang yang dirawat.', zh: '修正切換照護對象後，畫面仍殘留前一位病人資料的問題。', en: 'Fixed data from the previous patient remaining on screen after switching care recipients.' },
      { id: 'Memperbaiki bagian obat PRN pada daftar obat minggu ini yang tidak menampilkan status memuat dan pesan kesalahan.', zh: '修正本週藥單「需要時用藥」區塊缺少讀取中與錯誤提示的問題。', en: 'Fixed the PRN section of this week’s medication list missing its loading state and error message.' },
      { id: 'Memperbaiki item katalog obat resmi yang kolom dosisnya tidak bisa diubah.', zh: '修正官方藥品目錄品項無法編輯劑量欄位的問題。', en: 'Fixed official catalog medication items whose dosage field could not be edited.' },
      { id: 'Memperbaiki aplikasi native yang salah dikenali sebagai tampilan web di dalam aplikasi lain.', zh: '修正原生 App 被誤判成其他 App 內嵌瀏覽器畫面的問題。', en: 'Fixed the native app being misdetected as an in-app browser view.' },
      { id: 'Memperbaiki "Tambah ke Layar Utama" di Safari iOS agar aplikasi terbuka dalam mode layar penuh tanpa bilah alamat peramban.', zh: '修正 iOS Safari「加入主畫面」缺少 standalone 設定，開啟後不再顯示瀏覽器網址列。', en: 'Fixed “Add to Home Screen” on iOS Safari so the app opens full screen without the browser address bar.' },
      { id: 'Memperketat izin basis data untuk catatan pengiriman notifikasi tekanan darah dan tabel turunannya, sehingga hanya identitas yang sedang masuk yang diakui.', zh: '收緊血壓通知送達紀錄與下游資料表的資料庫授權，只認目前登入的身分。', en: 'Tightened database authorization for the blood pressure notification delivery ledger and its downstream tables so only the signed-in identity is accepted.' },
      { id: 'Memperkuat header keamanan peramban (COOP/COEP) untuk halaman aplikasi.', zh: '加強網頁端的瀏覽器安全標頭（COOP／COEP）設定。', en: 'Strengthened the browser security headers (COOP/COEP) for the web app.' },
    ],
  },
  // 為什麼先人工彙整：1.17.0 的原始 CHANGELOG 條目大量混雜內部工程用語（RLS policy、migration
  // 時間戳、Codex review 收斂、CRG／CI 修正等），且同一句修正訊息在 commit 拆分或補 issue 收尾時
  // 重複寫入了好幾次；必須篩選出真正影響照護者的病程軌跡、今天頁、LINE 通知與血壓提醒變更再翻譯，
  // 逐條照搬只會讓 /releases 頁面充滿看不懂又重複的雜訊。Reverts 只有內部 CI 自我檢查邏輯，不影響
  // 照護者，故意不彙整，讓它照 fallback 顯示「尚未翻譯」即可。
  '1.17.0': {
    features: [
      { id: 'Menambahkan daftar pertanyaan kontrol dokter, sehingga pengasuh bisa menyiapkan pertanyaan sebelum bertemu dokter.', zh: '新增回診問題清單，看診前可先列出想問醫生的問題。', en: 'Added a follow-up visit question checklist so caregivers can prepare questions before seeing the doctor.' },
      { id: 'Menambahkan mesin aturan ringkasan pra-kunjungan yang otomatis merangkum poin penting untuk dilaporkan ke dokter.', zh: '新增回診前摘要規則引擎，自動整理要跟醫生報告的重點。', en: 'Added a pre-visit brief rule engine that automatically summarizes key points to report to the doctor.' },
      { id: 'Menambahkan model riwayat perjalanan medis (hanya-baca) pada laporan dokter, memudahkan dokter memahami perkembangan kondisi dengan cepat.', zh: '醫師報告新增唯讀的病程軌跡模型，方便醫師快速掌握病情發展。', en: 'Added a read-only medical trajectory view to the doctor report, making it easier for physicians to quickly understand how a condition has progressed.' },
      { id: 'Menggabungkan tab Kejadian dan sub-halaman perubahan obat pada halaman riwayat perjalanan, sehingga informasi terkait terlihat dalam satu halaman.', zh: '病程軌跡頁合併「事件」分頁與「換藥記錄」子頁，資訊集中在同一頁面查看。', en: "Merged the trajectory page's Events tab and medication-change sub-page so related information appears together on one page." },
      { id: 'Di mode demo, fitur foto kejadian dan pengenalan label obat AI kini benar-benar bisa dicoba, tidak lagi menampilkan "tidak tersedia".', zh: '展示模式中的事件照片與 AI 藥單辨識功能改成真的可以互動，不再顯示「不提供」。', en: 'In demo mode, the event photo and AI medication-label recognition features are now genuinely interactive instead of showing "not available."' },
      { id: 'Menambahkan kolom departemen, klinik, dan jenis kunjungan yang terstruktur pada catatan kunjungan dokter, memudahkan pencarian dan pengelolaan di kemudian hari.', zh: '就醫紀錄新增科別、院所與就醫類型欄位，方便日後查詢與整理。', en: 'Added structured department, clinic, and visit-type fields to doctor-visit records, making them easier to search and organize later.' },
      { id: 'Menambahkan penghubungan akun LINE dan pengirim notifikasi push/balas bersama (MVP), sebagai dasar untuk notifikasi LINE.', zh: '新增 LINE 帳號綁定與共用推播／回覆功能（MVP），為 LINE 通知打基礎。', en: 'Added LINE account binding and a shared push/reply notification sender (MVP), laying the groundwork for LINE notifications.' },
      { id: 'Menaikkan kuota harian fitur draf resep AI untuk pengguna berbayar menjadi 20 kali per hari.', zh: '付費方案的 AI 藥單拍照草稿每日可用次數提高到 20 次。', en: "Raised the daily quota for paid users' AI medication-draft photo feature to 20 uses per day." },
      { id: 'Menambahkan "mode kepadatan pengasuh" pada halaman Hari Ini yang, tergantung pengaturan akun, meringkas tampilan menjadi bagian "Sekarang" dan "Tugas hari ini" untuk mengurangi kepadatan layar.', zh: '今天頁新增「看護密度模式」，可依帳號設定收斂為「現在」與「今天要做」兩區塊，減少畫面雜訊。', en: 'Added a "caregiver density mode" to the Today page that, depending on account settings, condenses the view into "Now" and "Today\'s tasks" sections to reduce clutter.' },
      { id: 'Merombak tampilan halaman Hari Ini dan memperbaiki kontras warna navigasi bawah yang kurang jelas dibaca.', zh: '今天頁介面改版，並修正底部導覽列文字對比不足、看不清楚的問題。', en: 'Redesigned the Today page and fixed insufficient color contrast in the bottom navigation bar that made labels hard to read.' },
      { id: 'Merombak tab Catatan menjadi tata letak dua baris tetap, dengan menu "Lainnya" baru agar lebih cepat menemukan fitur.', zh: '記錄分頁改為兩列常駐版面，並新增「更多」選單彈出視窗，方便快速找到功能。', en: 'Redesigned the Records tab into a persistent two-row layout with a new "More" menu sheet for quicker access to features.' },
      { id: 'Kartu "pengamatan keluarga" pada linimasa perawatan kini menggunakan warna hangat terracotta agar lebih mudah dibedakan dari kartu lain.', zh: '照護時間軸的「家屬觀察」卡片改用陶土暖色系，方便與其他卡片區分。', en: 'Family-observation cards on the care timeline now use a warm terracotta color to make them easier to distinguish from other cards.' },
      { id: 'Melengkapi penghubungan berisiko rendah untuk notifikasi LINE personal (pengiriman pesan, tautan dalam aplikasi, halaman pengaturan, dan dokumentasi kuota) sebagai persiapan peluncuran.', zh: '補齊 LINE 個人化通知的低風險串接（訊息派送、深連結、設定頁與額度說明文件），為後續開放做準備。', en: 'Completed low-risk wiring for personalized LINE notifications (message dispatch, deep links, settings page, and quota documentation) to prepare for rollout.' },
    ],
    'bug fixes': [
      { id: 'Memperbaiki notifikasi LINE yang bisa terkirim dua kali ke penerima yang sama, dan menghapus identifier akun resmi yang terekspos.', zh: '修正 LINE 通知可能對同一位使用者重複發送的問題，並移除外洩的官方帳號代碼。', en: 'Fixed LINE notifications that could be sent twice to the same recipient, and removed an exposed official account identifier.' },
      { id: 'Memperbaiki kesalahan pembacaan miligram dan tebakan waktu minum obat yang tidak aman pada fitur obat.', zh: '修正藥單毫克數判讀錯誤，以及不安全的服藥時段猜測邏輯。', en: 'Fixed incorrect milligram parsing and an unsafe dosing-time guess in the medication feature.' },
      { id: 'Memperbaiki tanggal sampel lab yang tidak dicatat sesuai zona waktu Taipei, dan menambahkan indeks unik untuk mencegah entri ganda.', zh: '修正抽血日期未依台灣時區記錄的問題，並加上防止重複記錄的唯一索引。', en: 'Fixed lab sample dates not being recorded in Taipei calendar time, and added a unique index to prevent duplicate entries.' },
      { id: 'Nilai default "mode kepadatan" kini otomatis ditentukan berdasarkan peran akun (pengasuh atau keluarga), tidak perlu memilih manual setiap kali.', zh: '「看護密度模式」預設值改依帳號角色（看護／家屬）自動決定，不用再每次手動選擇。', en: "The Today page's density-mode default is now chosen automatically based on account role (caregiver or family member), instead of needing manual selection each time." },
      { id: 'Memperbaiki katalog obat bersama yang bisa tertimpa secara diam-diam; perubahan kini memeriksa dampaknya lebih dulu dan meninggalkan jejak audit.', zh: '修正共用藥品目錄可能被靜默覆寫的問題，變更藥品資料前會先檢查影響範圍並留下稽核紀錄。', en: 'Fixed the shared medication catalog being silently overwritten; changes now check their impact scope first and leave an audit trail.' },
      { id: 'Memperbaiki pengasuh dengan akses baca-saja yang tidak bisa menandatangani, sambil tetap kompatibel dengan tautan berbagi versi lama yang masih digunakan selama peluncuran.', zh: '修正唯讀權限的照護者無法簽名的問題，並相容上線期間仍在使用的舊版分享連結。', en: 'Fixed read-only caregivers being unable to sign off, while remaining compatible with older share links still in use during rollout.' },
      { id: 'Memperbaiki race condition saat penyimpanan bersamaan, menambahkan pesan saat gagal memuat data tekanan darah, memperbaiki tampilan nama obat lama, dan menyatukan logika status penyimpanan di berbagai formulir.', zh: '修正資料同時寫入的競速問題、血壓讀取失敗時補上提示、修正歷史藥品名稱顯示，並統一各表單的儲存狀態邏輯。', en: 'Fixed a race condition in concurrent saves, added a prompt when blood pressure readings fail to load, fixed historical medication name display, and unified the save-state logic across forms.' },
      { id: 'Menyembunyikan sementara entri cadangan pemindaian OCR Vision untuk label obat, sambil menunggu konfigurasi API key.', zh: '因等待 API Key 設定完成，暫時隱藏藥單拍照辨識（Vision OCR）備援入口。', en: 'Temporarily hid the Vision OCR fallback entry point for medication-label scanning while waiting for the API key to be configured.' },
      { id: 'Memperbaiki celah di mana mengubah email akun bisa membuat akses ke data pasien yang sudah ada hilang, dengan menyinkronkan email saat login.', zh: '修正登入時未同步 email 快照，導致帳號改過 email 後可能看不到原本病人資料的漏洞。', en: "Fixed a gap where changing an account's email could cause it to lose access to previously visible patients, by syncing the email snapshot at login." },
      { id: 'Memperbaiki pengingat tekanan darah yang tidak menghapus pesan lama setelah diaktifkan, dan mengarahkan pasien hewan peliharaan untuk membuat templat khusus terlebih dahulu.', zh: '修正血壓提醒啟用後沒有清除舊提示的問題，並在寵物病人量血壓時導引先開啟自訂範本。', en: 'Fixed the blood pressure reminder not clearing its old prompt after being enabled, and guided pet patients to set up a custom template first.' },
      { id: 'Memperbaiki tombol "Ukur tekanan darah" di halaman Hari Ini yang tidak bereaksi saat modul tekanan darah dinonaktifkan; kini diarahkan ke Pengaturan dengan penjelasan.', zh: '修正血壓模組被停用時，今天頁點擊「量血壓」沒有反應的問題，改為導向設定頁並提示原因。', en: 'Fixed tapping "Measure blood pressure" on the Today page doing nothing when the blood pressure module is disabled; it now redirects to Settings with an explanation.' },
      { id: 'Catatan pengiriman notifikasi tekanan darah kini melalui fungsi database yang aman, mencegah pengasuh lain dari pasien yang sama memalsukan status "terkirim" untuk menekan peringatan.', zh: '血壓通知的送達紀錄改走安全的資料庫函式，避免同一位病人的其他照護者偽造「已送達」來壓下警示。', en: 'Blood pressure notification delivery records now go through a secure database function, preventing another caregiver for the same patient from faking a "delivered" status to suppress alerts.' },
    ],
    reverts: [
      { id: 'Membatalkan perubahan pemeriksaan mandiri yang melewati dan mengosongkan data pada lingkungan tertentu — perubahan itu akan menghapus baris data awal (seed.sql) yang baru dihubungkan ke akun sesudahnya.', zh: '拿掉自我檢查機制中「特定環境跳過並清空資料」的邏輯，因為這會刪掉 seed.sql 稍後才綁定的既有資料列。', en: 'Reverted a self-check change that skipped and cleared data for certain environments — it would have deleted existing seed.sql rows that get bound to an account later.' },
    ],
  },
  // 為什麼先人工彙整：1.16.0 累積了兩週多的提交，原始 CHANGELOG 條目混雜大量內部工程用語（entitlement migration、
  // Edge Function 部署、skills、NHI adapter 等），必須篩選出真正影響照護者的 AI 藥單草稿與同意畫面變更再翻譯，
  // 逐條照搬只會讓 /releases 頁面充滿看不懂的雜訊，也違反雙語版本更新說明的發版閘門。
  '1.16.0': {
    features: [
      { id: 'Menambahkan kartu draf resep AI: foto label obat kini bisa langsung menghasilkan draf jadwal minum obat, dengan pemilihan slot waktu ganda dan preset frekuensi umum di Taiwan, mempercepat pembuatan jadwal minum obat.', zh: '新增 AI 藥單拍照草稿卡片：拍攝藥單照片即可自動產生用藥草稿，並支援服藥時段複選與台灣常見頻率預設組合，加快建立用藥計畫的速度。', en: 'Added an AI medication-draft photo card: photographing a prescription now generates a draft medication schedule automatically, with multi-select dosing times and common Taiwan frequency presets to speed up setup.' },
      { id: 'Membuka fitur draf resep AI untuk pengguna gratis dengan batas percobaan harian, agar lebih banyak orang bisa mencoba fitur pembuatan jadwal dari foto ini.', zh: 'AI 藥單草稿開放免費使用者每日限次體驗，讓更多人可以先試用這項拍照建檔功能。', en: 'Opened the AI medication-draft feature to free users with a limited daily trial, so more people can try this photo-based scheduling feature.' },
      { id: 'Menambahkan pengungkapan pada layar persetujuan data kesehatan: fitur draf resep AI menggunakan layanan Gemini pihak ketiga untuk memproses foto, dan versi persetujuan telah diperbarui.', zh: '健康資料使用同意畫面新增揭露：AI 藥單草稿功能會使用外部 Gemini 服務處理照片，並更新對應的同意版本。', en: 'Added a disclosure to the health-data consent screen: the AI medication-draft feature uses the third-party Gemini service to process photos, and the consent version has been updated accordingly.' },
      { id: 'Menambahkan panel manajemen hak akses untuk admin, memudahkan administrator sistem menyesuaikan paket berbayar dan hak fitur akun.', zh: '新增管理員權限管理面板，方便系統管理者調整帳號的付費方案與功能權限。', en: 'Added an admin entitlement management panel, making it easier for system administrators to adjust accounts’ paid plans and feature access.' },
    ],
    'bug fixes': [
      { id: 'Memperbaiki teks ajakan upgrade draf resep AI yang menampilkan jumlah pemakaian harian tidak sesuai dengan kuota sebenarnya.', zh: '修正 AI 藥單草稿升級提示顯示的每日可用次數與實際配額不一致的問題。', en: 'Fixed the AI medication-draft upgrade prompt showing a daily usage count that did not match the actual quota.' },
      { id: 'Memperkuat perlindungan privasi draf resep AI: saat pencarian nama pasien gagal, sistem kini langsung memblokir proses, sehingga penyamaran nama pasien tidak lagi terlewat diam-diam dan nama pasien tidak tertinggal pada hasil pemindaian.', zh: '強化 AI 藥單草稿的隱私防護：查詢病人姓名失敗時，系統現在會直接判定失敗並阻擋，不再讓姓名去識別化被悄悄跳過、導致病人姓名殘留在辨識結果中。', en: 'Strengthened AI medication-draft privacy protection: when patient-name lookup fails, the process now fails closed instead of silently skipping name redaction, so the patient\'s name can no longer be left in the recognized draft.' },
    ],
  },
  // 為什麼先人工彙整：1.15.1 同時修正 TFDA 圖片的來源邊界與健康資料同意狀態迴歸；這兩項會直接影響照護者能否安全看到藥品圖片與順利進入 App。
  '1.15.1': {
    'bug fixes': [
      { id: 'Memperbaiki gambar tampilan obat TFDA yang gagal ditampilkan dan mengekspos sumber langsung; kini gambar dimuat melalui proxy privat.', zh: '修正 TFDA 藥品外觀圖片無法顯示與直接暴露來源的問題，改由私有代理安全載入。', en: 'Fixed TFDA medication appearance images that failed to display and exposed the source directly; images now load through a private proxy.' },
      { id: 'Memperbaiki pemeriksaan versi persetujuan data kesehatan agar akun yang sudah menyetujui tidak terus diminta menyetujui ulang.', zh: '修正健康資料同意版本判斷，已同意的帳號不會再被反覆要求重新同意。', en: 'Fixed health-data consent version checks so accounts that already agreed are not repeatedly asked to consent again.' },
    ],
  },
  // 為什麼先人工彙整：1.15.0 累積了兩個多月的提交，原始 CHANGELOG 條目多是內部工程用語（portfolio、tests、CI），
  // 必須篩選出真正影響照護者的項目再翻譯，逐條照搬只會讓 /releases 頁面充滿看不懂的雜訊。
  '1.15.0': {
    features: [
      // 為什麼保留這則且不合併進 1.16.0：Vision OCR（本則）與 1.16.0 的 Gemini AI 藥單草稿是 docs/features/medication.md 記載的兩套獨立實作、不同權限與配額模型，OCR 元件與 Edge Function 都還在，只是 2026-09-11 起前端入口暫時隱藏（等 GOOGLE_CLOUD_VISION_API_KEY 設定），並未被 AI 藥單草稿取代。
      { id: 'Menambahkan fitur awal (MVP) pemindaian foto kantong obat dengan OCR, yang dapat membaca informasi obat secara otomatis dari foto untuk mempercepat pembuatan jadwal minum obat (fitur ini kini disembunyikan sementara sambil menunggu konfigurasi API, namun tetap tersedia di sistem).', zh: '新增藥袋拍照辨識（OCR）雛形功能，可拍照自動讀取藥品資訊，加快建立用藥計畫的速度（此功能目前因等待 API 設定而暫時隱藏入口，但系統中仍保留）。', en: 'Added an initial (MVP) medication-bag photo OCR feature that automatically reads medication details from a photo to speed up setting up a medication plan (this entry point is currently hidden pending API configuration, but the feature remains in the system).' },
      { id: 'Menambahkan pengingat "pengukuran kedua" tekanan darah di iOS, yang akan mengingatkan kapan harus mengukur untuk kedua kalinya sesuai prosedur pengukuran yang disarankan.', zh: 'iOS 新增血壓「第二次測量」提醒，量測完第一次後會提示何時該量第二次，符合建議的量測流程。', en: 'Added an iOS reminder for the recommended second blood pressure measurement, prompting caregivers when it is time to take the follow-up reading.' },
      { id: 'Menambahkan pengingat "jatuh tempo perawatan" yang dilacak per pasien, mengingatkan kapan setiap tugas perawatan harian harus dilakukan, tanpa tercampur antar pasien.', zh: '新增依病人分別追蹤的「照護項目到期提醒」，可提醒各項每日照護任務何時該執行，且各病人互不干擾。', en: 'Added per-patient "care due" reminders that track when each daily care task is due, kept separate for each patient.' },
      { id: 'Menambahkan kode QR sumber di bagian bawah laporan cetak, memudahkan pemindaian untuk kembali ke catatan lengkap secara online.', zh: '列印報告底部新增來源 QR code，方便掃描回到線上完整紀錄查看原始資料。', en: 'Added a source QR code to the footer of printed reports, making it easy to scan back to the full online record.' },
      { id: 'Menambahkan fitur untuk membuat dan mengelola tautan berbagi "hanya-baca", sehingga keluarga atau tenaga medis dapat melihat ringkasan perawatan tanpa perlu masuk akun.', zh: '新增可產生並管理「唯讀分享連結」的功能，讓家人或醫療人員不需登入帳號也能查看照護摘要。', en: 'Added the ability to create and manage read-only share links, so family members or medical staff can view a care summary without needing to log in.' },
      { id: 'Alur undangan anggota keluarga kini dapat dikirim ulang, memudahkan mengirim kembali undangan yang belum diterima atau sudah kedaluwarsa.', zh: '家庭成員邀請流程改為可重複寄送，方便邀請對象沒收到或邀請逾期時重新寄送。', en: 'Family member invitations can now be resent, making it easy to send again if an invite was not received or has expired.' },
      { id: 'Menyelesaikan terjemahan antarmuka bahasa Inggris; aplikasi kini mendukung tiga bahasa: Mandarin, Indonesia, dan Inggris.', zh: '完成介面英文翻譯，App 現在支援中文、印尼文與英文三種語言切換。', en: 'Completed English interface translations — the app now supports Chinese, Indonesian, and English.' },
      { id: 'Menyelesaikan panduan instalasi PWA, dan menambahkan pintasan "Perawatan Harian" yang bisa langsung dibuka setelah aplikasi ditambahkan ke Layar Utama.', zh: '完成 PWA 安裝引導流程，並新增加到主畫面後可直接開啟「每日照護」的捷徑。', en: 'Completed the PWA install walkthrough and added a "Daily Care" shortcut that opens directly once the app is added to the home screen.' },
      { id: 'Menambahkan fitur notifikasi personal: dapat menghubungkan akun Telegram pribadi di halaman pengaturan, sehingga notifikasi seperti catatan tekanan darah dikirim langsung ke Telegram masing-masing, tidak lagi hanya lewat saluran notifikasi bersama.', zh: '新增個人化通知功能，可在設定頁綁定自己的 Telegram 帳號，之後系統會把血壓等紀錄通知直接送到個人 Telegram，不再只依賴共用通知管道。', en: 'Added personal notification channels — you can link your own Telegram account in Settings so records like blood pressure readings are sent directly to your personal Telegram instead of only a shared channel.' },
      { id: 'Menambahkan panel manajemen pengguna untuk admin, memudahkan administrator sistem melihat dan mengelola akun.', zh: '新增管理員用的使用者管理面板，方便系統管理者查看與管理帳號。', en: 'Added an admin user management panel for system administrators to view and manage accounts.' },
    ],
    'bug fixes': [
      { id: 'Memperbaiki judul halaman input tekanan darah yang salah ditampilkan saat berpindah antara mode potret dan lanskap.', zh: '修正血壓輸入頁面在直向／橫向切換時，頁首標題顯示錯誤的問題。', en: 'Fixed the blood pressure input page header showing the wrong title when switching between portrait and landscape orientation.' },
      { id: 'Memperbaiki input tekanan darah yang saling berebut fokus antara pindah kolom otomatis dan ketukan manual, yang sebelumnya membuat pengisian terganggu.', zh: '修正血壓輸入時，欄位自動跳轉與手動點擊互相搶焦點，導致輸入被打斷的問題。', en: 'Fixed blood pressure entry where automatic field-jumping and manual taps fought over focus, interrupting input.' },
      { id: 'Memperbaiki pengingat perawatan yang sebelumnya bisa terbawa dari pasien sebelumnya saat berpindah pasien; kini pengingat setiap pasien benar-benar terpisah.', zh: '修正切換不同病人時，照護提醒可能沿用上一位病人設定的問題，現在各病人的提醒會確實分開。', en: 'Fixed care reminders that could carry over from a previously selected patient when switching patients; reminders are now properly isolated per patient.' },
      { id: 'Memperbaiki keterlambatan notifikasi setelah mengukur tekanan darah di iOS; kini notifikasi langsung muncul setiap kali data tersimpan.', zh: '修正 iOS 量測血壓後通知延遲的問題，現在每次儲存血壓都會立即顯示通知。', en: 'Fixed delayed notifications after taking a blood pressure reading on iOS; a notification now appears immediately every time a reading is saved.' },
      { id: 'Memperbaiki pemeriksaan slot waktu minum obat yang sebelumnya juga menghitung jadwal obat lama yang sudah tidak aktif, sehingga gagal menambah slot baru; kini hanya jadwal obat yang sedang aktif yang diperiksa.', zh: '修正用藥時段重複檢查誤把已停用的舊藥單也算進去、導致無法新增時段的問題，現在只檢查目前生效中的藥單。', en: 'Fixed medication time-slot conflict checks that incorrectly counted inactive old medication plans, blocking new slots; only currently active plans are checked now.' },
      { id: 'Memperbaiki undangan keluarga yang terkadang tidak sampai ke penerima yang dituju atau gagal terkirim melalui email.', zh: '修正家庭邀請有時無法正確送達指定對象或邀請信件的問題。', en: 'Fixed family invitations that sometimes failed to reach the intended recipient or did not send by email.' },
      { id: 'Memperbaiki tautan penghubung Telegram di halaman pengaturan yang terkadang diblokir oleh pemblokir pop-up browser, dan kini status penghubungan otomatis diperbarui saat kembali ke halaman.', zh: '修正設定頁綁定 Telegram 的連結有時會被瀏覽器彈出視窗攔截的問題，並改為回到頁面時自動刷新綁定狀態。', en: 'Fixed the Telegram binding link in Settings sometimes being blocked by the browser pop-up blocker, and binding status now refreshes automatically when you return to the page.' },
      { id: 'Memperbaiki notifikasi Telegram yang formatnya terkadang berantakan dan alasan kegagalan yang tidak jelas; kini format notifikasi lebih rapi dan alasan kegagalan ditampilkan dengan jelas.', zh: '修正 Telegram 通知內容有時排版跑掉、失敗原因不清楚的問題，現在通知格式更完整，也能看到具體失敗原因。', en: 'Fixed Telegram notifications that sometimes had broken formatting and unclear failure reasons; notification formatting is now cleaner and failure reasons are shown clearly.' },
      { id: 'Memperbaiki disclaimer cetak yang tidak mengikuti bahasa yang sedang digunakan, dan menambahkan tanda sumber data pada laporan hewan peliharaan.', zh: '修正列印免責聲明沒有依目前語系顯示的問題，並補上寵物報告的資料來源標記。', en: 'Fixed the print disclaimer not following the currently selected language, and added a data-source mark to pet reports.' },
      { id: 'Memperbaiki data endokrin hewan peliharaan yang bisa tersimpan sebagian jika proses penyimpanan terputus; kini penyimpanan dilakukan sekaligus, seluruhnya berhasil atau tidak sama sekali.', zh: '修正寵物內分泌資料在儲存過程中若中斷，可能只存一半的問題，現在改為整批寫入，要嘛全部成功、要嘛全部不寫入。', en: 'Fixed pet endocrine data that could be saved only partially if the save was interrupted; saves now happen atomically — either fully succeed or do not happen at all.' },
      { id: 'Memperkuat pemeriksaan hak akses data untuk undangan keluarga, data hewan peliharaan, dan undangan pengasuh, guna mencegah data pasien lain terbaca secara tidak sengaja.', zh: '強化家庭邀請、寵物資料與看護邀請相關的資料存取權限檢查，避免跨病人或跨帳號誤讀到不該看到的資料。', en: 'Strengthened access-control checks around family invitations, pet data, and caregiver invitations to prevent data from being read across patients or accounts by mistake.' },
      { id: 'Notifikasi Telegram untuk catatan tekanan darah kini dikirim melalui jalur yang sudah terautentikasi, guna meningkatkan keamanan pengiriman data.', zh: '血壓紀錄的 Telegram 通知改走已驗證身分的傳送管道，強化資料傳送的安全性。', en: 'Blood pressure Telegram notifications are now sent through an authenticated delivery path, strengthening the security of data transmission.' },
    ],
  },
  // 為什麼補上 1.14.0：這個版本已在正式環境上線，但先前沒有人工雙語摘要，/releases 頁面只會顯示原文並標示「尚未翻譯」。
  '1.14.0': {
    features: [
      { id: 'Menambahkan mekanisme pencadangan database terenkripsi secara otomatis, guna memperkuat kemampuan pemulihan jika terjadi kehilangan atau kerusakan data.', zh: '新增自動化資料庫加密備份機制，強化資料遺失或毀損時的復原能力。', en: 'Added an automated, encrypted database backup mechanism to strengthen recovery in case of data loss or corruption.' },
    ],
    'bug fixes': [
      { id: 'Memperbaiki dan menutup celah keamanan yang memungkinkan pengguna yang belum masuk (anonim) tetap dapat mengakses data kesehatan.', zh: '修正並關閉未登入使用者仍可能存取健康資料的安全漏洞。', en: 'Fixed and closed a security gap that allowed anonymous (not signed-in) access to health data.' },
    ],
  },
  // 為什麼先人工彙整：1.13.1 的修正涉及照片與離線補送，不能讓自動產生的英文條目被誤當成照護者已確認的雙語說明。
  '1.13.1': {
    'bug fixes': [
      { id: 'Pratinjau foto catatan perawatan kini kembali tampil dengan stabil, termasuk setelah pemuatan ulang atau saat foto sedang dicoba dikirim ulang.', zh: '修正照護紀錄照片預覽與載入狀態，重新整理或補送重試後也能穩定看見照片。', en: 'Care record photo previews and loading states now display reliably, including after refreshes or retry attempts.' },
      { id: 'Pengiriman ulang catatan tekanan darah saat offline kini lebih aman: foto dan notifikasi keluarga tetap diproses dengan benar, termasuk ketika data ternyata sudah tersimpan.', zh: '修正離線補送血壓紀錄的處理，包含照片、家人通知與「資料已存在」的重試情況，避免補送成功卻少了通知。', en: 'Offline blood pressure resubmission is now more resilient: photos and family notifications are properly processed, even when records already exist.' },
    ],
  },
  '1.13.0': {
    features: [
      { id: 'Judul setiap sesi minum obat di catatan harian kini menampilkan jumlah total pil, bukan hanya jumlah berapa kali minum obat.', zh: '服藥打卡的每個時段標題現在會顯示總顆數，不只顯示服藥次數，避免同一次吃兩顆以上時被誤以為顆數也對得上。', en: 'Medication slot headers in the daily care log now display total pill counts rather than just administration frequency, preventing count confusion when multiple pills are taken.' },
      { id: 'Ringkasan jumlah pil kini dikelompokkan menurut bentuk sediaan (tablet, kapsul, sachet, dll.), sehingga obat serbuk/cair tidak lagi salah dihitung sebagai "pil".', zh: '顆數摘要改成依劑型（錠、膠囊、粉包等）分組計算，粉包／液劑不再被誤標成「顆」，跟藥盒核對更準確。', en: 'Pill summaries are now grouped by dosage form (tablets, capsules, powder packets, etc.), preventing liquids and powders from being miscounted as pills.' },
      { id: 'Kartu progres minum obat sepanjang hari kini juga menampilkan total jumlah pil, mengikuti aturan yang sama dengan setiap sesi minum obat.', zh: '服藥打卡的全天進度卡也加上總顆數，跟每個時段使用同一套計算規則，方便照護者一次核對整天的用量。', en: 'The full-day medication progress card now displays total pill counts using the same calculation rules as individual slots, making daily verification easier.' },
    ],
  },
  '1.12.3': {
    'bug fixes': [
      { id: 'Memperbaiki proses rilis staging: jika pembaruan database dibatalkan secara tidak sengaja, sistem kini mencoba lagi secara otomatis agar rilis tidak tersangkut.', zh: '修正 staging 發版流程：資料庫更新如果不小心被取消，系統現在會自動重試，避免發版卡住。', en: 'Improved staging release workflow: if database migrations are accidentally cancelled, the system automatically retries to prevent stuck releases.' },
    ],
  },
  '1.12.0': {
    features: [
      { id: 'Pintasan "Tambah ke Layar Utama" di Android/Chrome desktop kini menampilkan nama sesuai bahasa yang dipilih (Bahasa Indonesia atau Mandarin), tidak lagi tetap bahasa Inggris.', zh: 'Android／桌面 Chrome 的「加到主畫面」捷徑名稱與桌面圖示文字，現在會依照目前選擇的語言顯示中文或印尼文，不再固定顯示英文。', en: 'The "Add to Home Screen" shortcut name on Android/desktop Chrome now follows the selected language (Chinese or Indonesian) instead of defaulting to English.' },
      { id: 'Nama obat pada jadwal minggu ini kini bisa diketuk untuk membuka jendela detail obat, dan jendela detail kini punya tautan cadangan untuk mencari nama obat dalam bahasa Inggris via Google saat data belum lengkap.', zh: '本週藥單現在可以點擊藥名開啟藥品詳情視窗，詳情視窗也新增「用 Google 搜尋英文藥名」的備援連結，方便資料不齊全時查詢。', en: 'Medication names on the weekly schedule can now be clicked to open medication details, which also include a Google search fallback for English brand names when information is incomplete.' },
    ],
    'bug fixes': [
      { id: 'Membuka aplikasi dari ikon yang sudah ditambahkan ke Layar Utama di iOS/Android tidak lagi salah dikira sebagai browser tersemat biasa, sehingga login dan fitur berjalan normal.', zh: '從 iOS／Android 加到主畫面的圖示開啟 App，不再被誤判成一般嵌入式瀏覽器，登入與功能可以正常運作。', en: 'Launching the app from an iOS/Android Home Screen icon is no longer misidentified as an in-app browser, allowing sign-in and features to operate normally.' },
      { id: 'Judul pintasan di layar utama diperbaiki kembali menampilkan "家健錄" dalam bahasa Mandarin, tidak lagi menampilkan nama bahasa Inggris.', zh: '加到主畫面的桌面捷徑標題修正回顯示中文「家健錄」，不再顯示成英文名稱。', en: 'Home Screen shortcut titles now correctly display the Traditional Chinese app name rather than the English name.' },
      { id: 'Saat penyimpanan data obat gagal, layar kini menampilkan pesan error, tidak lagi gagal secara diam-diam yang membuat pengasuh mengira data sudah tersimpan.', zh: '儲存用藥資料失敗時，畫面會顯示錯誤訊息，不再默默失敗讓照護者誤以為已經存檔成功。', en: 'When saving medication data fails, the screen now displays an error message instead of failing silently.' },
      { id: 'Memperbaiki logika saat gagal membaca status persetujuan data kesehatan dengan mencoba ulang otomatis satu kali, agar akun yang sudah menyetujui tidak salah dianggap perlu menyetujui ulang.', zh: '修正讀取健康資料使用同意狀態失敗時的處理，改為自動重試一次，避免已經同意過的帳號被誤判成需要重新同意。', en: 'Fixed health data consent status checks by automatically retrying once on read failures, preventing consented accounts from being prompted again unnecessarily.' },
    ],
  },
  '1.11.0': {
    features: [
      { id: 'Bagian jadwal minum obat yang diciutkan kini menampilkan progres jumlah pil yang sudah diminum (x/y), dan menampilkan tanda centang besar saat satu sesi sudah selesai diminum semua.', zh: '收合的服藥時段標題現在會顯示「已吃幾顆／共幾顆」的進度，收合後若整段已完成，也會顯示放大版的完成勾勾。', en: 'Collapsed medication schedule headers now display progress of pills taken (x/y), with an enlarged checkmark when an entire session is completed.' },
      { id: 'Kartu obat yang sudah diminum kini disederhanakan menjadi satu baris ringkas, dengan kategori obat tetap ditampilkan, memudahkan pengasuh memindai seluruh jadwal obat sekaligus.', zh: '已服用的藥卡簡化為單行矮版卡片，並保留藥物分類文字，方便照護者一次掃過整段藥單確認。', en: 'Taken medication cards are now simplified into single-line compact cards while preserving category labels, allowing caregivers to quickly scan the entire schedule.' },
    ],
    'bug fixes': [
      { id: 'Memperbaiki warna nama obat dan kategori pada kartu yang sudah diminum agar menggunakan warna hijau (selesai), tidak lagi bentrok dengan warna merah/magenta yang biasanya berarti peringatan.', zh: '修正已服用藥卡的藥名與分類顏色，改用綠色系呈現「已完成」，不再跟原本代表警示的紅色／洋紅混用。', en: 'Updated medication names and categories on taken cards to green ("completed"), avoiding confusion with red/magenta warning indicators.' },
      { id: 'Memperbaiki BRILINTA/Exforge dan obat terkait yang kode ATC-nya tetap kosong karena ID lama pada data awal tidak cocok dengan ID sebenarnya di database, sehingga label kategorinya kini tampil dengan benar.', zh: '修正 BRILINTA/Exforge 等藥品因舊種子資料的 id 對不上實際資料庫 id，導致 ATC 分類代碼一直是空值、分類標籤顯示不出來的問題。', en: 'Fixed an issue where BRILINTA, Exforge, and related medications had missing ATC codes due to mismatched seed data IDs, ensuring category labels display properly.' },
    ],
  },
  '1.10.0': {
    features: [
      { id: 'Menambahkan modul pencatatan keseimbangan cairan pasca-operasi (berat makanan yang dihabiskan, asupan air, volume urine, dan jumlah buang air besar) sebagai modul perawatan harian opsional yang dapat diaktifkan sendiri.', zh: '新增術後體液平衡照護模組（飲食秤重前後差、喝水量、排尿量與排便次數），可自行選擇開啟的每日照護模組。', en: 'Added an optional post-op fluid balance care module (food weight differential, water intake, urine volume, and bowel movement count) that can be enabled in daily care.' },
    ],
  },
  '1.9.0': {
    features: [
      { id: 'Menambahkan kode klasifikasi ATC WHO yang telah diverifikasi ke obat-obatan pada data contoh mode demo dan data awal staging, agar label kategori obat benar-benar tampil di layar.', zh: '幫 /demo 試用模式與 staging 示範資料的藥品補上查證過的 WHO ATC 分類碼，讓分類徽章能實際顯示出來。', en: 'Added verified WHO ATC classification codes to demo and staging seed medications, enabling category badges to render on screen.' },
    ],
    'bug fixes': [
      { id: 'Memperbaiki logika pengisian kategori utama obat agar menggunakan kolom yang sebenarnya ditulis saat pengguna menambahkan obat dari pencarian, bukan kolom lama yang hampir tidak pernah terisi.', zh: '修正藥品主要功能分類的回填邏輯，改用使用者從目錄搜尋加入藥品時實際會寫入的欄位，不再依賴幾乎沒有藥品會用到的舊欄位。', en: 'Fixed the primary medication category backfill logic to read the column actually populated when adding from search, rather than an obsolete field.' },
      { id: 'Memperbaiki kesalahan sintaks SQL pada fungsi pengisian kategori obat yang menyebabkan fitur ini gagal total setiap kali dipanggil.', zh: '修正藥品分類回填函式裡的一個 SQL 語法錯誤，避免這個功能一被呼叫就直接失敗。', en: 'Fixed a SQL syntax error in the medication category backfill function that caused it to fail on invocation.' },
      { id: 'Menghubungkan beberapa obat contoh yang sering muncul di akun demo staging ke katalog obat resmi, agar label kategorinya dapat ditampilkan dengan benar.', zh: '把 staging 示範帳號裡幾個常見藥品連結到官方藥品目錄，讓分類徽章可以正確顯示。', en: 'Linked common sample medications in staging demo accounts to official catalogs so category badges display correctly.' },
    ],
  },
  '1.8.0': {
    features: [
      { id: 'Menambahkan modul perawatan demensia (agitasi, siklus siang-malam terbalik, risiko berkeliaran).', zh: '新增失智照護模組（躁動、日夜顛倒、遊走風險）。', en: 'Added dementia care module (agitation, reversed sleep-wake cycle, wandering risk).' },
      { id: 'Menambahkan wizard panduan penggunaan pertama untuk modul perawatan harian.', zh: '新增每日照護模組的首次使用引導精靈。', en: 'Added a first-time onboarding guide wizard for daily care modules.' },
      { id: 'Menambahkan laporan dokter hewan untuk hewan peliharaan, dan memperluas modul perawatan hewan peliharaan agar dapat digunakan juga untuk perawatan manusia.', zh: '新增寵物獸醫報告，並將寵物照護模組擴大適用於人類照護對象。', en: 'Added veterinary reports for pets and extended pet care modules to support human care recipients.' },
      { id: 'Menambahkan halaman konten edukasi dwibahasa yang dapat diakses publik beserta hub navigasinya, termasuk kartu pratinjau berbagi dan perbaikan SEO.', zh: '新增可公開瀏覽的雙語衛教內容頁與導覽入口，並補上分享預覽卡與 SEO 改善。', en: 'Added publicly accessible bilingual health guide pages and navigation hub, including social preview cards and SEO improvements.' },
      { id: 'Menambahkan tombol ajakan masuk di akhir tur demo, dan memindahkan preferensi modul percobaan ke akun resmi setelah masuk.', zh: 'Demo 導覽結尾加入登入按鈕，並把試用模組偏好設定交接給正式帳號。', en: 'Added a sign-in CTA button at the end of the demo tour and migrated trial preferences to formal accounts upon sign-in.' },
      { id: 'Catatan tekanan darah kini bisa disimpan dalam antrean saat offline, dan otomatis terkirim setelah koneksi pulih.', zh: '血壓紀錄離線時可先排入佇列，恢復連線後會自動送出。', en: 'Blood pressure readings can now be queued offline and automatically submitted once the connection is restored.' },
      { id: 'Menambahkan buku panduan serah terima pengasuh satu halaman yang dapat dicetak dalam dua bahasa.', zh: '新增一頁式雙語看護交接手冊，可直接列印。', en: 'Added a printable, one-page bilingual caregiver handover handbook.' },
      { id: 'Halaman obat kini terbagi menjadi empat tab, nama obat ditampilkan lebih menonjol dengan warna merah, dan dapat memilih preferensi menampilkan nama bahasa Inggris terlebih dahulu.', zh: '服藥頁改為四個分頁，藥名以紅色醒目顯示，並新增可設定英文名優先顯示的偏好。', en: 'The medications page now features four tabs with highlighted medication names, and introduces a preference to prioritize English drug names.' },
      { id: 'Menghapus batasan zoom pada halaman, dan menambahkan ukuran font yang dapat disesuaikan agar keluarga dengan presbiopi lebih mudah membaca.', zh: '移除頁面禁止縮放的限制，新增可調整的閱讀字級，方便老花的家屬閱讀。', en: 'Removed page zoom restrictions and added adjustable font sizing for elderly family members.' },
      { id: 'Menyinkronkan klasifikasi terapi farmakologi ATC dari TFDA, secara otomatis menandai fungsi utama obat.', zh: '同步 TFDA 藥理治療分類（ATC），自動標示藥品的主要功能。', en: 'Synchronized TFDA pharmacological ATC classifications to automatically tag primary medication functions.' },
      { id: 'Foto obat kini bisa diketuk untuk diperbesar dan melihat versi asli yang lebih jelas.', zh: '點擊藥品照片可放大檢視原始清晰版本。', en: 'Medication photos can now be tapped to zoom and view the high-resolution original.' },
    ],
    'bug fixes': [
      { id: 'Mengizinkan popup COOP agar proses masuk dengan Google GIS tidak menampilkan layar kosong.', zh: '允許 COOP 彈出視窗，修正 Google 登入時畫面變空白的問題。', en: 'Allowed COOP popups to fix blank screen issues during Google GIS sign-in.' },
      { id: 'Mengizinkan "sachet bubuk" sebagai bentuk sediaan obat yang valid.', zh: '修正「粉包」無法被登錄為有效藥品外觀劑型的問題。', en: 'Permitted "powder sachet" as a valid medication dosage form.' },
      { id: 'Memperbaiki wizard onboarding agar berdasarkan preferensi tersimpan di database, bukan localStorage, dan memisahkan status wizard untuk setiap pasien agar tidak tercampur.', zh: '修正首次使用引導精靈改依資料庫已儲存的偏好判斷（而非瀏覽器本機儲存），並讓每位病人各自獨立的引導狀態不會互相干擾。', en: 'Updated the onboarding wizard to rely on database-saved preferences instead of localStorage, isolating wizard state per patient.' },
      { id: 'Menerjemahkan satuan pada grafik tren, tidak lagi menggunakan teks bahasa Indonesia yang ditulis langsung (hardcode).', zh: '修正趨勢圖表單位沒有依語系翻譯、直接寫死印尼文的問題。', en: 'Localized trend chart units to the selected language instead of hardcoded Indonesian.' },
      { id: 'Membuat laporan endokrin dan ambang batas gula darah menyesuaikan jenis spesies hewan peliharaan.', zh: '修正內分泌報告與血糖門檻值，改為依寵物物種調整。', en: 'Adapted endocrine reports and blood glucose thresholds to pet species.' },
      { id: 'Memperbaiki nama kolom klasifikasi ATC TFDA, menggunakan klasifikasi utama resmi yang ditandai pemerintah.', zh: '修正 TFDA ATC 分類欄位名稱，改用官方標示的主要分類。', en: 'Fixed TFDA ATC classification column names to use officially marked primary classifications.' },
      { id: 'Memperbaiki tombol "ciutkan" saat menyesuaikan obat yang sebelumnya membuang foto yang sudah diunggah.', zh: '修正調整藥品時按下「收合」會遺失已上傳照片的問題。', en: 'Fixed an issue where collapsing a medication adjustment card discarded uploaded photos.' },
      { id: 'Mengembalikan pengaturan ukuran font baca ke normal secara otomatis sebelum dan sesudah mencetak.', zh: '修正列印時沒有自動還原閱讀字級設定的問題。', en: 'Automatically reset reading font size to normal before and after printing.' },
      { id: 'Hanya menandai perubahan obat sebagai belum disimpan jika kolom benar-benar diubah.', zh: '修正只要點開藥品就會被誤標記為「尚未儲存」的問題，改為欄位真的被修改才標記。', en: 'Mark medication changes as unsaved only when fields are actually modified.' },
      { id: 'Melonggarkan syarat pengisian kategori utama ATC, tidak lagi mensyaratkan status verifikasi "resmi", agar lebih banyak obat umum dapat menampilkan label kategori.', zh: '放寬 ATC 主要功能分類的回填條件，不再要求驗證狀態為「官方」，讓更多常見藥品也能顯示分類標籤。', en: 'Relaxed ATC primary category backfill criteria from strictly "official", allowing more common medications to display category badges.' },
      { id: 'Menambahkan listener pageshow agar iOS Chrome juga dapat memicu prompt pembaruan PWA.', zh: '補上 pageshow 事件監聽，讓 iOS Chrome 也能觸發 PWA 更新提示。', en: 'Added pageshow event listener so iOS Chrome can also trigger PWA update prompts.' },
      { id: 'Memperbaiki transfer preferensi mode percobaan agar membaca spesies terbaru melalui ref, sehingga tidak terhapus akibat effect yang berjalan ulang.', zh: '修正試用模式偏好交接，改用 ref 讀取最新物種，避免因 effect 重跑而清掉交接提示。', en: 'Fixed trial mode preference transfer by reading the latest species via ref, preventing rerunning effects from clearing handover prompts.' },
    ],
  },
  '1.7.0': {
    features: [
      {
        id: 'Menambahkan opsi hewan peliharaan burung, dan memastikan modul kotak pasir kucing tidak lagi muncul di halaman perawatan burung.',
        zh: '新增鳥類寵物選項，並讓貓砂盆等貓咪專屬模組不會出現在鳥類的照護畫面中。', en: 'Added bird pet option and ensured cat-specific modules (such as litter boxes) do not appear on bird care pages.',
      },
      {
        id: 'Menambahkan grafik tren riwayat pada halaman perawatan penyakit kronis hewan peliharaan, memudahkan melihat perubahan kondisi jangka panjang.',
        zh: '寵物慢性病照護頁面新增歷史趨勢圖，方便查看長期病況變化。', en: 'Added historical trend graphs to pet chronic care pages, facilitating long-term condition monitoring.',
      },
    ],
    'bug fixes': [
      {
        id: 'Menyembunyikan token tautan berbagi dari URL, agar tidak tersimpan di riwayat browser atau log server.',
        zh: '修正分享連結的驗證代碼會出現在網址上的問題，避免留在瀏覽器紀錄或伺服器日誌中。', en: 'Hid share link tokens from URLs to prevent them from remaining in browser history or server logs.',
      },
      {
        id: 'Memperkuat perlindungan antar-pasien pada katalog obat bersama, agar perubahan data obat satu pasien tidak memengaruhi pasien lain.',
        zh: '加強共用藥品目錄的跨病人保護，避免修改某位病人的藥品資料時影響到其他病人。', en: "Strengthened cross-patient isolation in the shared drug catalog so editing one patient's medications never affects others.",
      },
      {
        id: 'Memungkinkan pengasuh memperbaiki bentuk sediaan dan tampilan obat yang salah dicatat sebelumnya, dengan konfirmasi yang jelas sebelum perubahan disimpan agar tidak tertimpa secara tidak sengaja.',
        zh: '讓照護者能修正既有藥品先前登錄錯誤的劑型與外觀，並在儲存前清楚提示確認，避免修改被誤觸或靜默覆蓋。', en: 'Allowed caregivers to correct misrecorded dosage forms and appearances with explicit confirmation before saving.',
      },
      {
        id: 'Memperbaiki peringatan agar benar-benar dikelompokkan per pasien, termasuk saat pengaturan peringatan pasien tersebut belum lengkap.',
        zh: '修正通知警示需要按照病人分開處理的問題，並涵蓋該病人尚未完成警示設定的情況。', en: 'Fixed alert grouping to strictly partition notifications per patient, including cases with incomplete alert configurations.',
      },
      {
        id: 'Menampilkan alasan sebenarnya saat undangan untuk orang yang dirawat gagal dikirim, alih-alih pesan kesalahan umum.',
        zh: '邀請被照顧者失敗時，改為顯示實際失敗原因，不再只顯示籠統的錯誤訊息。', en: 'Displayed specific failure reasons instead of generic errors when care recipient invitations fail to send.',
      },
      {
        id: 'Menampilkan peringatan di layar saat notifikasi Telegram gagal terkirim, agar pengasuh tidak mengira notifikasi berhasil dikirim padahal tidak.',
        zh: 'Telegram 通知傳送失敗時，會在畫面上顯示警示，避免照護者誤以為通知已成功送出。', en: 'Displayed on-screen warnings when Telegram notifications fail, preventing caregivers from assuming messages were delivered.',
      },
    ],
  },
  '1.6.0': {
    features: [
      {
        id: 'Mengintegrasikan halaman perawatan penyakit kronis hewan peliharaan ke sistem perawatan harian dan menghubungkannya ke tabel Supabase yang sesungguhnya, sehingga catatan penyakit jangka panjang hewan peliharaan tidak lagi hanya data demo.',
        zh: '把寵物慢性病照護頁面整合進每日照護系統，並串接真實資料庫，寵物的長期病況記錄不再只是示範資料。', en: 'Integrated pet chronic care pages into the daily care system backed by real Supabase tables, turning chronic pet tracking into live data.',
      },
      {
        id: 'Menambahkan opsi templat perawatan harian kustom, sekaligus memperbaiki preferensi hewan peliharaan yang sebelumnya tidak tersimpan dengan benar.',
        zh: '新增自訂每日照護範本選項，並修正先前寵物照護偏好設定沒有正確保存的問題。', en: 'Added custom daily care template options and fixed pet care preference persistence.',
      },
      {
        id: 'Jenis penerima perawatan (manusia/hewan peliharaan) kini benar-benar menyaring modul perawatan yang ditampilkan di layar, sehingga tidak muncul item yang tidak relevan.',
        zh: '照護對象類型（人類／寵物）現在會正確篩選畫面顯示的照護模組，避免看到不相關的項目。', en: 'Care recipient type (human vs. pet) now properly filters care modules displayed on screen, hiding irrelevant options.',
      },
      {
        id: 'Akun demo kini memiliki satu hewan peliharaan contoh untuk setiap jenis spesies, memudahkan mencoba fitur halaman perawatan hewan peliharaan secara lengkap.',
        zh: '示範帳號現在每種寵物類型都有一隻範例寵物，方便體驗寵物照護頁面的完整功能。', en: 'Demo accounts now include a sample pet for each species type, enabling a complete walkthrough of pet care features.',
      },
    ],
    'bug fixes': [
      {
        id: 'Memperbaiki bug saat input suhu tubuh, pemeriksaan format secara keliru menonaktifkan tombol kirim.',
        zh: '修正體溫輸入時，格式檢查會誤將送出按鈕鎖住的問題。', en: 'Fixed an issue where temperature input format validation erroneously disabled the submit button.',
      },
      {
        id: 'Memperbaiki bug ketika templat perawatan kustom dikosongkan, tampilan tidak kembali dengan benar ke item bawaan sesuai jenis spesies.',
        zh: '修正清空自訂照護範本後，畫面沒有正確退回該物種預設項目的問題。', en: 'Fixed an issue where clearing custom care templates did not properly restore default items for the species.',
      },
      {
        id: 'Memperkuat kontrol akses pada fungsi database, mencegah pemanggilan fitur internal dari sumber yang tidak berwenang, guna meningkatkan keamanan data secara keseluruhan.',
        zh: '加強資料庫函式的存取權限管控，避免未授權來源呼叫內部功能，提升整體資料安全性。', en: 'Strengthened access controls on database functions to prevent unauthorized invocation of internal procedures.',
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
        id: 'Menambahkan daftar obat yang sedang digunakan ke laporan cetak versi dokter untuk pemantauan tekanan darah.',
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
      { id: 'Memperjelas makna navigasi bawah untuk pembaca layar.', zh: '讓底部導覽列的語意更清楚，方便螢幕報讀器辨識。', en: 'Clarified bottom navigation semantics for screen readers.' },
      { id: 'Memperkuat keamanan sesi tekanan darah yang tersimpan.', zh: '強化血壓量測記錄的儲存安全性。', en: 'Enhance the storage safety of blood pressure measurement records.' },
      { id: 'Meningkatkan tipografi laporan di ponsel.', zh: '改善手機版報表的文字排版。', en: 'Improved text typography for mobile reports.' },
      { id: 'Meningkatkan fokus keyboard pada jendela pop-up.', zh: '改善彈出視窗的鍵盤焦點處理。', en: 'Improved keyboard focus for pop-ups.' },
      { id: 'Meningkatkan semantik formulir dua bahasa di pengaturan.', zh: '改善設定頁雙語表單的語意標記。', en: 'Improved semantic markup for bilingual forms on the settings page.' },
      { id: 'Meningkatkan notifikasi langsung pada formulir tanda vital.', zh: '改善生理數值表單的即時語音通知。', en: 'Improve real-time voice notifications for physiological numeric forms.' },
      { id: 'Menjaga kerangka aplikasi tetap dalam satu wadah gulir.', zh: '讓整個應用程式維持單一捲動容器，避免版面跑版。', en: 'Maintained a single scroll container across the app layout to prevent layout jumping.' },
      { id: 'Menjaga hitung mundur tekanan darah tetap terlihat.', zh: '讓血壓量測倒數計時保持可見。', en: 'Kept the blood pressure measurement countdown visible.' },
      { id: 'Menjaga tab perawatan harian tetap terlihat di ponsel.', zh: '讓手機版的每日照護分頁保持可見。', en: 'Kept daily care tabs visible on mobile devices.' },
      { id: 'Menjaga manajemen perawatan demo tetap hanya-baca.', zh: '讓示範帳號的照護管理維持唯讀，避免誤改資料。', en: 'Enforced read-only mode for demo account care management to prevent accidental modifications.' },
      { id: 'Menerjemahkan bagian catatan rilis ke dua bahasa.', zh: '為版本更新頁面的分類標題加上雙語翻譯。', en: 'Add a bilingual translation to the taxonomy title of the version update page.' },
      { id: 'Menerjemahkan teks yang terlihat pada UX-09.', zh: '補齊 UX-09 項目中畫面可見文字的雙語翻譯。', en: 'Provided complete bilingual translations for visible UI text in UX-09.' },
      { id: 'Memprioritaskan ringkasan dasbor di ponsel.', zh: '讓手機版優先顯示總覽儀表板。', en: 'Prioritized the dashboard summary on mobile.' },
      { id: 'Memprioritaskan aksi obat rutin.', zh: '讓例行用藥的操作按鈕優先顯示。', en: 'Prioritized routine medication action buttons.' },
      { id: 'Melindungi ekspor jendela dari tertutup tidak sengaja saat menekan Escape.', zh: '避免按下 Esc 鍵時誤關正在匯出的視窗。', en: 'Prevented export dialogs from closing accidentally when pressing Escape.' },
      { id: 'Memperbesar area sentuh tombol perawatan.', zh: '放大照護按鈕的可點擊範圍，方便手機操作。', en: 'Increase the clickable range of the care button for easy mobile operation.' },
      { id: 'Menghormati preferensi gerakan berkurang pada perangkat.', zh: '尊重裝置「減少動態效果」的偏好設定。', en: 'Respect your device’s less dynamic preferences.' },
      { id: 'Menampilkan entri linimasa lama sesuai permintaan.', zh: '可依需求展開查看更早的時間軸紀錄。', en: 'Expand to see earlier timeline logs as needed.' },
      { id: 'Menyederhanakan alur slot pengukuran berat badan.', zh: '簡化體重量測時段的操作流程。', en: 'Simplified the workflow for weight measurement time slots.' },
      { id: 'Menyatukan header merek pada halaman publik.', zh: '統一公開頁面的品牌標頭樣式。', en: 'Standardized brand header styles across public pages.' },
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
        zh: '確保正式版本狀態會標記完成，讓下一版能順利產生。', en: 'Ensured production release status is marked complete so subsequent versions generate smoothly.',
      },
    ],
  },
  '1.2.2': {
    'bug fixes': [
      {
        id: 'Memastikan akun pasien ibu hanya dapat melihat dan mengelola data kesehatan ibu sendiri.',
        zh: '確保媽媽的病人帳號只能查看與管理媽媽自己的健康資料。', en: 'Ensured the mother patient account can only view and manage her own health data.',
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
        zh: '限制版本歷史的搜尋範圍，讓專案歷史增加後仍能穩定更新版本資訊。', en: 'Limited the search scope of release history to maintain stable version updates as the project history grows.'
      },
    ],
  },
}
