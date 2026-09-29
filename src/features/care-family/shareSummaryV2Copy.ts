/*
檔案用途：v2 分享接收頁的三語文案（設計 §6 B 頁首說明、C 判讀依據、D 資料限制與快照聲明、E 空狀態／截斷／狀態標籤）。
所在層：src/features/care-family；純資料，不碰 React，方便 tests/unit 逐句鎖住且讓 i18n 測試逐鍵檢查。
主要關聯：components/shareSummaryV2/*（顯示）、docs/product/share-summary-v2-design.md §6（owner 於 #424 F5 核准的草稿）、
  tests/unit/shareSummaryV2Copy.test.ts。印尼文依設計 §6 仍待看護或母語者複核；改字不影響 consent_text_version（那是建立前告知）。
*/
import type { LocalizedText } from '../../lib/i18n'

// B：分享頁頂部說明（F4 (ii)：不是診斷、不是醫療建議）。
export const SHARE_V2_INTRO: LocalizedText = {
  id: 'Ini adalah ringkasan perawatan baca-saja yang dibagikan oleh pengasuh. Isinya adalah rangkuman catatan pengukuran dan daftar obat, bukan diagnosis atau saran medis; jangan mengubah obat sendiri berdasarkan halaman ini. Halaman ini tidak dapat dibuka lagi setelah tautan kedaluwarsa.',
  zh: '這是一份唯讀的照護摘要，由照護者主動分享。內容是量測紀錄與藥單的整理，不是診斷，也不是醫療建議；請勿依此自行調整用藥。連結到期後這個頁面無法再開啟。',
  en: 'This is a read-only care summary shared by a caregiver. It is a digest of recorded measurements and the medication list, not a diagnosis or medical advice; do not change medication based on this page. This page cannot be opened after the link expires.',
}

// C：判讀依據（R5）。{standard}／{date} 由呼叫端代入；第二句說明「不依現在的標準重新判讀」。
export const SHARE_V2_STANDARD_PREFIX: LocalizedText = { id: 'Standar penilaian:', zh: '判讀依據：', en: 'Interpretation standard:' }
export const SHARE_V2_STANDARD_EFFECTIVE_FROM = (date: string): LocalizedText => ({
  id: `(berlaku sejak ${date})`,
  zh: `（${date} 起）`,
  en: `(effective from ${date})`,
})
// 已結束的區間要印出終點，讀者才分得出「跨越變更日」的兩份標準各管哪一段（PR #941 Codex P1）。
export const SHARE_V2_STANDARD_EFFECTIVE_RANGE = (from: string, to: string): LocalizedText => ({
  id: `(berlaku ${from} – ${to})`,
  zh: `（${from} – ${to}）`,
  en: `(effective ${from} – ${to})`,
})
// 每筆讀數旁的標準記號（①②…）指向上方橫幅的同一個編號；只有橫幅列出兩份以上時才顯示。
export const SHARE_V2_STANDARD_MARKER_HINT: LocalizedText = {
  id: 'Angka di lingkaran pada setiap catatan menunjukkan standar mana yang dipakai.',
  zh: '每筆紀錄旁的圈號代表採用上方哪一份標準。',
  en: 'The circled number beside each reading shows which standard above was applied.',
}
export const SHARE_V2_STANDARD_NOT_REPAINTED: LocalizedText = {
  id: 'Warna dan tanda mengikuti standar yang berlaku saat pengukuran dilakukan, tidak dinilai ulang dengan standar sekarang.',
  zh: '顏色與標記依該筆量測當時生效的標準判定，不會依現在的標準重新判讀。',
  en: 'Colours and flags follow the standard in force when each reading was taken; readings are not re-interpreted with the current standard.',
}

// D：資料限制與快照聲明（頁尾；列印時一併印出）。
export const SHARE_V2_DATA_LIMITS: LocalizedText = {
  id: 'Hanya memuat tekanan darah, denyut, waktu pengukuran, daftar obat, dan jenis kejadian; tidak memuat gejala, foto, catatan, hasil lab, berat badan, atau data kesehatan lainnya. Tanggal yang kosong berarti tidak ada catatan hari itu, bukan berarti nilainya normal.',
  zh: '僅含血壓、心跳、量測時間、藥單與事件類型；不含症狀、照片、筆記、檢驗值、體重或其他生理數值。缺少的日期代表當天沒有紀錄，不代表數值正常。',
  en: 'Contains blood pressure, heartbeat, measurement time, the medication list and event types only; no symptoms, photos, notes, lab results, weight or other measurements. A missing day means nothing was recorded that day, not that values were normal.',
}
export const SHARE_V2_SNAPSHOT = (generatedAt: string): LocalizedText => ({
  id: `Halaman ini adalah salinan yang dibuat pada ${generatedAt}; tidak dapat diverifikasi lagi setelah tautan kedaluwarsa.`,
  zh: `本頁是產生於 ${generatedAt} 的快照；連結到期後無法再核對。`,
  en: `This page is a snapshot generated at ${generatedAt}; it cannot be verified after the link expires.`,
})

// E：空狀態、截斷與狀態標籤。
export const SHARE_V2_EMPTY_BP: LocalizedText = { id: 'Tidak ada catatan tekanan darah dalam 14 hari terakhir.', zh: '近 14 天沒有血壓紀錄。', en: 'No blood-pressure records in the last 14 days.' }
export const SHARE_V2_EMPTY_MEDICATIONS: LocalizedText = { id: 'Saat ini tidak ada daftar obat yang terdaftar.', zh: '目前沒有登錄中的藥單。', en: 'No medications are currently listed.' }
export const SHARE_V2_EMPTY_EVENTS: LocalizedText = { id: 'Tidak ada catatan kunjungan dokter atau perubahan obat dalam 30 hari terakhir.', zh: '近 30 天沒有就診或調藥紀錄。', en: 'No doctor visits or medication changes in the last 30 days.' }
export const SHARE_V2_TRUNCATED = (n: number): LocalizedText => ({
  id: `Catatan terlalu banyak, hanya ${n} catatan terbaru yang ditampilkan.`,
  zh: `紀錄過多，只顯示最新的 ${n} 筆。`,
  en: `Too many records; only the latest ${n} are shown.`,
})
export const SHARE_V2_OPEN_QUESTIONS = (n: number): LocalizedText => ({
  id: `Keluarga memiliki ${n} pertanyaan yang belum ditanyakan ke dokter.`,
  zh: `家屬有 ${n} 個尚未提出的回診問題。`,
  en: `The family has ${n} questions not yet asked at a visit.`,
})
export const SHARE_V2_NO_OPEN_QUESTIONS: LocalizedText = { id: 'Tidak ada pertanyaan yang menunggu untuk ditanyakan ke dokter.', zh: '目前沒有待提出的回診問題。', en: 'No questions are waiting to be asked at a visit.' }
// E7：503。
export const SHARE_V2_UNAVAILABLE: LocalizedText = { id: 'Ringkasan sementara tidak dapat dibuat, silakan buka tautan ini lagi nanti.', zh: '暫時無法產生摘要，請稍後再開啟這個連結。', en: 'The summary cannot be generated right now; please open this link again later.' }
// E8：沿用 v1。
export const SHARE_V2_INVALID: LocalizedText = { id: 'Tautan ini tidak valid atau sudah kedaluwarsa.', zh: '這個連結無效或已過期。', en: 'This link is invalid or has expired.' }

// 區塊標題與欄位名。
export const SHARE_V2_LABELS = {
  pageTitle: { id: 'Ringkasan Perawatan Baca-Saja', zh: '唯讀照護摘要', en: 'Read-Only Care Summary' },
  twoWeekSummary: { id: 'Ringkasan perawatan dua minggu', zh: '兩週照護摘要', en: 'Two-week care summary' },
  bloodPressure: { id: 'Tekanan darah 14 hari terakhir', zh: '近 14 天血壓', en: 'Blood pressure, last 14 days' },
  medications: { id: 'Daftar obat saat ini', zh: '目前藥單', en: 'Current medications' },
  events: { id: 'Kunjungan dokter dan perubahan obat 30 hari terakhir', zh: '近 30 天就診與調藥', en: 'Doctor visits and medication changes, last 30 days' },
  concerns: { id: 'Pertanyaan untuk dokter', zh: '回診問題', en: 'Questions for the doctor' },
  records: { id: 'catatan', zh: '筆', en: 'readings' },
  daysWithRecords: { id: 'Hari dengan catatan', zh: '有紀錄天數', en: 'Days with records' },
  morningDays: { id: 'Hari dengan ukur pagi', zh: '早上量測天數', en: 'Days with a morning reading' },
  eveningDays: { id: 'Hari dengan ukur malam', zh: '晚上量測天數', en: 'Days with an evening reading' },
  average: { id: 'Rata-rata', zh: '平均', en: 'Average' },
  morningAverage: { id: 'Rata-rata pagi', zh: '早上平均', en: 'Morning average' },
  eveningAverage: { id: 'Rata-rata malam', zh: '晚上平均', en: 'Evening average' },
  nightLow: { id: 'Rendah di malam hari', zh: '夜間偏低次數', en: 'Night-time lows' },
  levelCounts: { id: 'Jumlah per tingkat', zh: '各等級筆數', en: 'Readings per level' },
  asNeeded: { id: 'Bila perlu', zh: '需要時服用', en: 'As needed' },
  perDose: { id: 'setiap kali', zh: '每次', en: 'per dose' },
  licence: { id: 'No. izin edar TFDA', zh: 'TFDA 許可證字號', en: 'TFDA licence no.' },
  howToTake: { id: 'Cara minum', zh: '服用方式', en: 'How to take' },
  visit: { id: 'Kunjungan dokter', zh: '就診', en: 'Doctor visit' },
  medicationChange: { id: 'Perubahan obat', zh: '調藥', en: 'Medication change' },
  readOnlyFooter: { id: 'Halaman ini hanya baca dan tidak dapat digunakan untuk mengubah data.', zh: '這是唯讀頁面，無法用來修改任何資料。', en: 'This is a read-only page and cannot be used to modify data.' },
  print: { id: 'Cetak', zh: '列印', en: 'Print' },
  loading: { id: 'Memuat…', zh: '載入中…', en: 'Loading…' },
} satisfies Record<string, LocalizedText>
