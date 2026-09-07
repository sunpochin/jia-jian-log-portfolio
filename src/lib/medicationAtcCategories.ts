/*
檔案用途：把 WHO ATC 分類碼轉成照護者看得懂的雙語主要功能標籤（例如降血壓、抗凝血）。
所在層：src/lib；純前端靜態對照表與轉換函式，不連線 Supabase。
主要關聯：medications.atc_code 由 supabase/migrations 的 refresh_official_medication_atc() 從 TFDA 公開資料回填；
本檔只負責把該碼轉成顯示文字，讓 MedicationAppearance 等元件呈現。改措辭只需改這裡，不必跑 migration。
*/
import type { LocalizedText } from './i18n'

// 只收長期照護常見的慢性病用藥分類；ATC 碼比對用「前綴」，越長的前綴要排在越前面才能優先命中細分類。
// 對照表刻意保留 WHO 官方階層順序（如 C02 降血壓、C07 乙型阻斷劑本身也常用於降血壓），
// 未命中的碼一律不顯示，避免把不熟悉的分類硬套一個可能誤導照護判斷的標籤。
const ATC_CATEGORY_PREFIXES: Array<{ prefix: string; label: LocalizedText }> = [
  { prefix: 'B01AC', label: { id: 'Obat antiplatelet (pengencer darah)', zh: '抗血小板藥（血液稀釋劑）' ,en: "Medication antiplatelet (pengencer blood)" } },
  { prefix: 'B01A', label: { id: 'Obat antikoagulan (pengencer darah)', zh: '抗凝血藥（血液稀釋劑）' ,en: "Medication antikoagulan (pengencer blood)" } },
  { prefix: 'C01D', label: { id: 'Obat nitrat (angina)', zh: '硝酸鹽類（心絞痛用藥）' ,en: "Medication nitrat (angina)" } },
  { prefix: 'C02', label: { id: 'Obat tekanan darah tinggi', zh: '降血壓藥' ,en: "Medication blood pressure high" } },
  { prefix: 'C03', label: { id: 'Obat diuretik (peluruh cairan)', zh: '利尿劑' ,en: "Medication diuretik (peluruh fluid)" } },
  { prefix: 'C07', label: { id: 'Obat tekanan darah tinggi (beta blocker)', zh: '降血壓藥（乙型阻斷劑）' ,en: "Medication blood pressure high (beta bloctor)" } },
  { prefix: 'C08', label: { id: 'Obat tekanan darah tinggi (calcium channel blocker)', zh: '降血壓藥（鈣離子通道阻斷劑）' ,en: "Medication blood pressure high (calcium channel bloctor)" } },
  { prefix: 'C09', label: { id: 'Obat tekanan darah tinggi (ACE/ARB)', zh: '降血壓藥（ACE抑制劑／ARB）' ,en: "Medication blood pressure high (ACE/ARB)" } },
  { prefix: 'C10', label: { id: 'Obat penurun kolesterol', zh: '降血脂藥' ,en: "Medication penurun kolesterol" } },
  { prefix: 'A10', label: { id: 'Obat diabetes', zh: '糖尿病用藥' ,en: "Medication diabetes" } },
  { prefix: 'A02B', label: { id: 'Obat asam lambung', zh: '胃酸／胃潰瘍用藥' ,en: "Medication asam lambung" } },
  { prefix: 'A04', label: { id: 'Obat mual/vertigo', zh: '止吐／暈眩用藥' ,en: "Medication mual/vertigo" } },
  { prefix: 'A11', label: { id: 'Vitamin', zh: '維生素' ,en: "Vitamin" } },
  { prefix: 'A12', label: { id: 'Suplemen mineral', zh: '礦物質補充劑' ,en: "Suplemen mineral" } },
  { prefix: 'M01A', label: { id: 'Obat anti-inflamasi (NSAID)', zh: '消炎止痛藥（NSAID）' ,en: "Medication anti-inflamasi (NSAID)" } },
  { prefix: 'N02', label: { id: 'Obat pereda nyeri', zh: '止痛藥' ,en: "Medication pereda nyeri" } },
  { prefix: 'N03', label: { id: 'Obat anti-epilepsi', zh: '抗癲癇藥' ,en: "Medication anti-epilepsi" } },
  { prefix: 'N05', label: { id: 'Obat penenang/anti-cemas', zh: '鎮靜／抗焦慮藥' ,en: "Medication penenang/anti-cemas" } },
  { prefix: 'N06', label: { id: 'Obat antidepresan', zh: '抗憂鬱藥' ,en: "Medication antidepresan" } },
  { prefix: 'H03', label: { id: 'Obat tiroid', zh: '甲狀腺用藥' ,en: "Medication tiroid" } },
  { prefix: 'M04', label: { id: 'Obat asam urat', zh: '痛風用藥' ,en: "Medication asam urat" } },
  { prefix: 'M05B', label: { id: 'Obat osteoporosis', zh: '骨質疏鬆用藥' ,en: "Medication osteoporosis" } },
  { prefix: 'J01', label: { id: 'Antibiotik', zh: '抗生素' ,en: "Antibiotik" } },
  { prefix: 'R06', label: { id: 'Obat antihistamin (alergi)', zh: '抗組織胺（過敏藥）' ,en: "Medication antihistamin (alergi)" } },
]

export function resolveMedicationCategory(atcCode: string | null | undefined): LocalizedText | null {
  const code = atcCode?.trim().toUpperCase()
  if (!code) return null
  // 對照表已依前綴長度排序，取第一個相符的即是最精確的分類。
  const match = ATC_CATEGORY_PREFIXES.find(entry => code.startsWith(entry.prefix))
  return match?.label ?? null
}
