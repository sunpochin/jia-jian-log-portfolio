/*
檔案用途：集中 Telegram、LINE、Resend 三家通知／寄信供應商的隱私揭露文案（zh／id／en），
供 /privacy 與 /health-data-notice 共用，並讓單元測試逐項鎖住「送了什麼、為什麼、境外、是否選用」。
所在層：src/features/system-admin 公開頁面的文案資料層；純資料，不讀取任何照護資料或秘密。
主要關聯：PrivacyPage.tsx、HealthDataNoticePage.tsx、tests/unit/notificationProviderDisclosures.test.ts；
資料流依據 supabase/functions/blood-pressure-notifier、personal-notification-drain、care-due-reminders、
calendar-notifier、telegram-webhook、line-webhook、send-invitation-email（issue #424 第三方供應商盤點）。
*/
import type { LocalizedText } from '../../lib/i18n'

// 為什麼抽成獨立檔而不直接寫在 PrivacyPage.tsx：同一時間另一個 #424 工作（分享連結告知）也在改 PrivacyPage，
// 文案放這裡可以把兩邊的 merge 衝突壓到只剩一行元件插入；同時讓測試直接 import 資料逐項檢查，
// 不用對 TSX 原始碼做字串比對。
export type ProviderDisclosure = {
  // 測試與 React key 用的穩定代號，不顯示在畫面上。
  key: 'telegram' | 'line' | 'resend'
  title: LocalizedText
  // 每一項都是獨立一句，對應個資法 §8 告知事項：送了哪些欄位、目的、境外處理、是否由使用者選用。
  sent: LocalizedText
  purpose: LocalizedText
  location: LocalizedText
  optIn: LocalizedText
}

// 欄位清單逐字對照程式實際送出的內容（盤點日 2026-09-25）：
// - 血壓通知：bloodPressureNotifier.ts 的 buildBloodPressureNotificationFields —— 照護對象顯示名稱、收縮壓、舒張壓、
//   心跳、量測時間與時段、判讀狀態與所用標準，以及「提交者名稱」（取自提交者電子郵件 @ 前的帳號名稱，不是完整信箱）。
// - 到期提醒：careDueReminders.ts 只送提醒類型、到期日與剩餘／逾期天數，刻意不帶藥名、姓名或自由文字。
// - 日曆提醒：calendarNotifier.ts 只送「N 分鐘後有行程」，刻意不帶行程標題。
// - 個人通知的收件人：enqueue_blood_pressure_personal_notifications 對「該照護對象所有有 care_access、付費且已綁定」的家人扇出，
//   不只記錄者本人；所以文案必須說清楚「別的家人綁定，就會收到這位照護對象的數值（含記錄者名稱）」，不能寫成只有「您」綁定才送。
//   但 LINE 例外：personal-notification-drain 為了共用的 LINE 月額度，同一輪只放行第一位 LINE 收件人、其餘標記失敗
//   （跨輪不去重，所以寫「通常只送一位」）；文案不得宣稱每位綁定 LINE 的家人都會收到，否則家人會依賴一則不會來的警報。
// 若之後改動任何一支 Function 的訊息欄位或收件人範圍，必須同步改這裡並升版，否則就是不實揭露。
export const NOTIFICATION_PROVIDER_DISCLOSURES: ReadonlyArray<ProviderDisclosure> = [
  {
    key: 'telegram',
    title: { zh: 'Telegram（即時通訊通知）', id: 'Telegram (notifikasi pesan)', en: 'Telegram (messaging notifications)' },
    sent: {
      zh: '血壓通知會送出：照護對象的顯示名稱、收縮壓、舒張壓、心跳、量測時間與時段、判讀狀態與所用的判讀標準，以及提交者名稱（取自提交者電子郵件 @ 前面的帳號名稱）。回診、抽血、打針、疫苗、藥量等到期提醒只送提醒類型、到期日與剩餘或逾期天數；Google 日曆提醒只送「幾分鐘後有行程」，不含行程標題。綁定個人通知時，Telegram 會把您的 Telegram 對話 ID 傳給我們，用來指定收件人。',
      id: 'Notifikasi tekanan darah mengirim: nama tampilan penerima perawatan, sistolik, diastolik, denyut nadi, waktu dan sesi pengukuran, status penilaian beserta standar yang dipakai, serta nama pengirim (diambil dari bagian sebelum @ pada email pengirim). Pengingat jatuh tempo (kontrol dokter, ambil darah, suntikan, vaksin, sisa obat, dll.) hanya mengirim jenis pengingat, tanggal jatuh tempo, dan jumlah hari tersisa atau terlambat; pengingat Google Kalender hanya mengirim "acara dimulai dalam beberapa menit", tanpa judul acara. Saat Anda menghubungkan notifikasi pribadi, Telegram mengirimkan ID obrolan Telegram Anda kepada kami untuk menentukan penerima.',
      en: 'Blood-pressure notifications send: the care recipient’s display name, systolic, diastolic, heartbeat, measurement time and session, the assessed status with the standard used, and the submitter’s name (taken from the part of the submitter’s email before the @). Due reminders (follow-up visits, blood draws, injections, vaccinations, medication supply, etc.) send only the reminder type, due date and days remaining or overdue; Google Calendar reminders send only "an event starts in a few minutes", without the event title. When you link personal notifications, Telegram sends us your Telegram chat ID so we know where to deliver.',
    },
    purpose: {
      zh: '目的：讓家屬與看護即時知道剛量到的血壓與即將到期的照護事項。',
      id: 'Tujuan: agar keluarga dan pengasuh segera mengetahui tekanan darah yang baru diukur dan jadwal perawatan yang akan jatuh tempo.',
      en: 'Purpose: letting family members and caregivers know right away about a new blood-pressure reading and upcoming care tasks.',
    },
    location: {
      zh: '處理地區：Telegram 由 Telegram Messenger Inc. 提供；依其隱私權政策（2026 年 9 月查證），資料可能與其位於英屬維京群島與杜拜的關係企業共享，訊息會在台灣以外的地區處理與保存。訊息一旦送達就留在 Telegram 對話紀錄中；在本 App 刪除紀錄或帳號，不會刪除已送出的 Telegram 訊息。',
      id: 'Lokasi pemrosesan: Telegram disediakan oleh Telegram Messenger Inc.; menurut kebijakan privasinya (diperiksa September 2026), data dapat dibagikan dengan perusahaan grupnya di Kepulauan Virgin Britania Raya dan Dubai, dan pesan diproses serta disimpan di luar Taiwan. Setelah terkirim, pesan tetap ada di riwayat obrolan Telegram; menghapus catatan atau akun di aplikasi ini tidak menghapus pesan Telegram yang sudah terkirim.',
      en: 'Processing location: Telegram is provided by Telegram Messenger Inc.; per its privacy policy (checked September 2026), data may be shared with its group companies in the British Virgin Islands and Dubai, and messages are processed and stored outside Taiwan. Once delivered, a message stays in the Telegram chat history; deleting records or your account in this app does not delete Telegram messages that were already sent.',
    },
    optIn: {
      zh: '是否選用：家庭群組通知預設關閉，只有服務維護者為特定照護對象開通後才會送出，無法在 App 內自行開啟。個人通知是付費功能：只要有任何一位對這位照護對象有照護權限的家人在「設定」中綁定了自己的 Telegram 帳號，這位照護對象的新血壓紀錄（含記錄者的提交者名稱）就會送到那位家人的 Telegram，即使記錄的人自己沒有綁定。綁定與解除綁定只決定是否送到您自己的帳號，可隨時解除；沒有任何家人綁定時，就不會送出個人通知。',
      id: 'Opsional atau tidak: notifikasi grup keluarga nonaktif secara bawaan dan hanya dikirim setelah pengelola layanan mengaktifkannya untuk penerima perawatan tertentu; tidak dapat diaktifkan sendiri di aplikasi. Notifikasi pribadi adalah fitur berbayar: jika ada anggota keluarga yang memiliki akses perawatan ke penerima perawatan ini dan menghubungkan akun Telegram miliknya di "Pengaturan", catatan tekanan darah baru untuk penerima perawatan ini (termasuk nama pengirim) akan dikirim ke Telegram anggota keluarga tersebut, meskipun orang yang mencatat tidak menghubungkan akunnya. Menghubungkan atau melepas hanya menentukan apakah notifikasi dikirim ke akun Anda sendiri, dan dapat dilepas kapan saja; jika tidak ada anggota keluarga yang terhubung, notifikasi pribadi tidak dikirim.',
      en: 'Opt-in: family group notifications are off by default and are sent only after the service maintainer turns them on for a specific care recipient; they cannot be turned on from inside the app. Personal notifications are a paid feature: if any family member with care access to this care recipient links their own Telegram account in Settings, new blood-pressure records for this care recipient (including the submitter’s name) are sent to that family member’s Telegram, even if the person recording has not linked anything. Linking or unlinking only controls delivery to your own account, and you can unlink at any time; if no family member has linked, no personal notifications are sent.',
    },
  },
  {
    key: 'line',
    title: { zh: 'LINE（即時通訊通知）', id: 'LINE (notifikasi pesan)', en: 'LINE (messaging notifications)' },
    sent: {
      zh: '個人血壓通知會送出與 Telegram 相同的內容：照護對象的顯示名稱、收縮壓、舒張壓、心跳、量測時間與時段、判讀狀態與所用的判讀標準，以及提交者名稱（取自提交者電子郵件 @ 前面的帳號名稱）。綁定時，LINE 會把您的 LINE 使用者 ID 傳給我們，用來指定收件人。',
      id: 'Notifikasi tekanan darah pribadi mengirim isi yang sama seperti Telegram: nama tampilan penerima perawatan, sistolik, diastolik, denyut nadi, waktu dan sesi pengukuran, status penilaian beserta standar yang dipakai, serta nama pengirim (diambil dari bagian sebelum @ pada email pengirim). Saat menghubungkan, LINE mengirimkan ID pengguna LINE Anda kepada kami untuk menentukan penerima.',
      en: 'Personal blood-pressure notifications send the same content as Telegram: the care recipient’s display name, systolic, diastolic, heartbeat, measurement time and session, the assessed status with the standard used, and the submitter’s name (taken from the part of the submitter’s email before the @). When you link, LINE sends us your LINE user ID so we know where to deliver.',
    },
    purpose: {
      zh: '目的：讓選用個人通知的家屬在自己的 LINE 即時收到剛量到的血壓。',
      id: 'Tujuan: agar anggota keluarga yang memilih notifikasi pribadi langsung menerima tekanan darah yang baru diukur di LINE mereka sendiri.',
      en: 'Purpose: letting family members who choose personal notifications receive a new blood-pressure reading right away in their own LINE.',
    },
    location: {
      zh: '處理地區：LINE Messaging API 由 LY Corporation（日本）提供，訊息會在台灣以外的地區處理與保存。訊息一旦送達就留在 LINE 對話紀錄中；在本 App 刪除紀錄或帳號，不會刪除已送出的 LINE 訊息。',
      id: 'Lokasi pemrosesan: LINE Messaging API disediakan oleh LY Corporation (Jepang); pesan diproses dan disimpan di luar Taiwan. Setelah terkirim, pesan tetap ada di riwayat obrolan LINE; menghapus catatan atau akun di aplikasi ini tidak menghapus pesan LINE yang sudah terkirim.',
      en: 'Processing location: the LINE Messaging API is provided by LY Corporation (Japan), and messages are processed and stored outside Taiwan. Once delivered, a message stays in the LINE chat history; deleting records or your account in this app does not delete LINE messages that were already sent.',
    },
    optIn: {
      zh: '是否選用：這是付費功能。只要有對這位照護對象有照護權限的家人在「設定」中綁定了自己的 LINE 帳號，這位照護對象的新血壓紀錄（含記錄者的提交者名稱）就會送到 LINE，即使記錄的人自己沒有綁定。目前 LINE 每筆紀錄通常只送給其中一位已綁定的家人，其他已綁定 LINE 的家人不一定會收到，請不要把 LINE 當成每位家人都會收到的警報。綁定與解除綁定只決定您自己的帳號是否可能收到，可隨時解除；沒有任何家人綁定 LINE 時，就不會有資料送到 LINE。',
      id: 'Opsional atau tidak: ini adalah fitur berbayar. Jika ada anggota keluarga yang memiliki akses perawatan ke penerima perawatan ini dan menghubungkan akun LINE miliknya di "Pengaturan", catatan tekanan darah baru untuk penerima perawatan ini (termasuk nama pengirim) akan dikirim ke LINE, meskipun orang yang mencatat tidak menghubungkan akunnya. Saat ini LINE biasanya hanya mengirim setiap catatan ke salah satu anggota keluarga yang terhubung; anggota keluarga lain yang menghubungkan LINE belum tentu menerimanya, jadi jangan mengandalkan LINE sebagai peringatan yang diterima setiap anggota keluarga. Menghubungkan atau melepas hanya menentukan apakah akun Anda sendiri dapat menerimanya, dan dapat dilepas kapan saja; jika tidak ada anggota keluarga yang menghubungkan LINE, tidak ada data yang dikirim ke LINE.',
      en: 'Opt-in: this is a paid feature. If family members with care access to this care recipient link their own LINE accounts in Settings, new blood-pressure records for this care recipient (including the submitter’s name) are sent to LINE, even if the person recording has not linked anything. For now, LINE usually delivers each record to only one of the linked family members; other family members who linked LINE may not receive it, so do not rely on LINE as an alert that reaches every family member. Linking or unlinking only controls whether your own account can receive it, and you can unlink at any time; if no family member has linked LINE, no data is sent to LINE.',
    },
  },
  {
    key: 'resend',
    title: { zh: 'Resend（邀請信寄送）', id: 'Resend (pengiriman email undangan)', en: 'Resend (invitation emails)' },
    sent: {
      zh: '邀請家人或照護對象時會送出：受邀者的電子郵件地址、固定的三語邀請說明，以及一次性的邀請連結。邀請信不含任何健康數值、照護對象姓名或照片。',
      id: 'Saat mengundang anggota keluarga atau penerima perawatan, yang dikirim adalah: alamat email orang yang diundang, teks undangan tetap dalam tiga bahasa, dan tautan undangan sekali pakai. Email undangan tidak memuat data kesehatan, nama penerima perawatan, atau foto.',
      en: 'When you invite a family member or care recipient, we send: the invitee’s email address, a fixed trilingual invitation text, and a one-time invitation link. Invitation emails contain no health values, care-recipient names, or photos.',
    },
    purpose: {
      zh: '目的：把家庭照護邀請寄到受邀者的信箱。',
      id: 'Tujuan: mengirim undangan perawatan keluarga ke kotak masuk orang yang diundang.',
      en: 'Purpose: delivering the family care invitation to the invitee’s inbox.',
    },
    location: {
      zh: '處理地區：Resend（Resend, Inc.，美國）是境外的電子郵件寄送服務，資料會在台灣以外的地區處理。',
      id: 'Lokasi pemrosesan: Resend (Resend, Inc., Amerika Serikat) adalah layanan pengiriman email di luar negeri; data diproses di luar Taiwan.',
      en: 'Processing location: Resend (Resend, Inc., United States) is an overseas email delivery service, and data is processed outside Taiwan.',
    },
    optIn: {
      zh: '何時使用：只有在您主動用電子郵件邀請某人時才會寄出。',
      id: 'Kapan digunakan: hanya dikirim ketika Anda sendiri mengundang seseorang melalui email.',
      en: 'When it is used: only when you choose to invite someone by email.',
    },
  },
]

// 為什麼健康資料告知頁只列 Telegram 與 LINE：個資法 §6 特種個資的接收者揭露只涉及真正收到健康數值的對象；
// Resend 的邀請信不含任何健康資料，放進「健康資料接收者」反而會誤導使用者以為血壓會被寄到信箱。
export const HEALTH_DATA_NOTIFICATION_RECIPIENTS: LocalizedText = {
  zh: '血壓通知會把照護對象的顯示名稱、收縮壓、舒張壓、心跳、量測時間與時段、判讀狀態與所用的判讀標準（可能反映該照護對象的個別目標），以及提交者名稱（取自提交者電子郵件 @ 前面的帳號名稱）送到兩家境外即時通訊服務：Telegram（Telegram Messenger Inc.），以及 LINE（LY Corporation，日本），資料會在台灣以外的地區處理與保存。Telegram 家庭群組通知預設關閉，只有服務維護者為特定照護對象開通後才會送出。個人通知是付費功能：對這位照護對象有照護權限、並在「設定」中綁定自己 Telegram 的家人，每一位都會收到這位照護對象的新血壓紀錄；綁定 LINE 的家人中，目前每筆紀錄通常只送給其中一位。即使記錄的人自己沒有綁定也會送出；綁定與解除綁定只決定您自己的帳號是否可能收到。回診、抽血、打針、疫苗、藥量等到期提醒只送提醒類型、到期日與剩餘或逾期天數。已送達的訊息會留在收件人的對話紀錄中，在本 App 刪除資料不會一併刪除這些訊息。',
  id: 'Notifikasi tekanan darah mengirim nama tampilan penerima perawatan, sistolik, diastolik, denyut nadi, waktu dan sesi pengukuran, status penilaian beserta standar yang dipakai (dapat mencerminkan target pribadi penerima perawatan), serta nama pengirim (diambil dari bagian sebelum @ pada email pengirim) ke dua layanan pesan di luar negeri: Telegram (Telegram Messenger Inc.), dan LINE (LY Corporation, Jepang); data diproses dan disimpan di luar Taiwan. Notifikasi grup keluarga Telegram nonaktif secara bawaan dan hanya dikirim setelah pengelola layanan mengaktifkannya untuk penerima perawatan tertentu. Notifikasi pribadi adalah fitur berbayar: setiap anggota keluarga yang memiliki akses perawatan ke penerima perawatan ini dan menghubungkan akun Telegram miliknya di "Pengaturan" akan menerima catatan tekanan darah baru penerima perawatan ini; di antara anggota keluarga yang menghubungkan LINE, saat ini setiap catatan biasanya hanya dikirim ke salah satunya. Notifikasi tetap dikirim meskipun orang yang mencatat tidak menghubungkan akunnya; menghubungkan atau melepas hanya menentukan apakah akun Anda sendiri dapat menerimanya. Pengingat jatuh tempo (kontrol dokter, ambil darah, suntikan, vaksin, sisa obat, dll.) hanya mengirim jenis pengingat, tanggal jatuh tempo, dan jumlah hari tersisa atau terlambat. Pesan yang sudah terkirim tetap ada di riwayat obrolan penerima; menghapus data di aplikasi ini tidak ikut menghapus pesan tersebut.',
  en: 'Blood-pressure notifications send the care recipient’s display name, systolic, diastolic, heartbeat, measurement time and session, the assessed status with the standard used (which may reflect the care recipient’s personal target), and the submitter’s name (taken from the part of the submitter’s email before the @) to two overseas messaging services: Telegram (Telegram Messenger Inc.), and LINE (LY Corporation, Japan); the data is processed and stored outside Taiwan. Telegram family group notifications are off by default and are sent only after the service maintainer turns them on for a specific care recipient. Personal notifications are a paid feature: every family member with care access to this care recipient who links their own Telegram account in Settings receives this care recipient’s new blood-pressure records; among family members who link LINE, each record is currently usually delivered to only one of them. Notifications are sent even if the person recording has not linked anything; linking or unlinking only controls whether your own account can receive them. Due reminders (follow-up visits, blood draws, injections, vaccinations, medication supply, etc.) send only the reminder type, due date and days remaining or overdue. Delivered messages stay in the recipient’s chat history; deleting data in this app does not delete those messages.',
}
