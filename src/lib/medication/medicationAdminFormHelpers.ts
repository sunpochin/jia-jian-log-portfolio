/*
檔案用途：useMedicationAdminForm 用到的純函式／常數（劑型顆數摘要、錯誤訊息轉譯、劑型雙語標籤、mg 劑量剖析）。
所在層：src/lib/medication；不持有狀態，供 hook 與其協作 hook共用，方便單元測試與局部理解。
主要關聯：src/features/medication/hooks/useMedicationAdminForm.ts（唯一呼叫端）。
*/
import type { AdminMedicationPlan, MedicationOption } from './medicationAdmin'
import { type LocalizedText } from '../i18n'
import { readErrorFields } from '../dataErrors'

// 顆數摘要要按劑型分組（錠／膠囊論顆，粉劑論包，液劑論份），不能直接加總 dose_amount，
// 否則同一時段混著藥錠與粉包時會把粉包誤標成「顆」。plans 本身沒有 dosage_form，要透過 medicationById 查藥品資料。
export function withDosageForm(planList: readonly AdminMedicationPlan[], medicationById: Map<string, MedicationOption>) {
  return planList.map(plan => ({
    dose_amount: plan.dose_amount,
    dose_count: plan.dose_count,
    dosage_form: medicationById.get(plan.medication_id)?.dosage_form ?? 'tablet',
  }))
}

// 資料庫在偵測到同一顆藥被其他病人的現役醫囑使用時會擋下目錄寫入（保護對方資料不被誤改）；
// 把這個特定錯誤換成照護者看得懂的說明，而不是統一顯示成「請確認網路」誤導成連線問題。
export function medicationErrorStatus(error: unknown, fallback: LocalizedText): LocalizedText {
  // 用共用的 readErrorFields 取代 `error instanceof Error ? error.message : String(error)`：
  // Supabase 有時會丟出不是 Error 實例的物件（例如 AuthError 的舊版形狀），String() 對那種物件
  // 只會印出 "[object Object]"，等於把真正的錯誤原因吃掉。
  const message = readErrorFields(error).message
  if (message.includes('shared with another patient')) {
    // 修正混雜印尼文的英文翻譯，並明確說明共用藥品保護機制
    return { id: 'Obat ini juga dipakai oleh orang lain, jadi datanya tidak bisa diubah dari sini. Tambahkan sebagai obat terpisah jika perlu.', zh: '這顆藥同時被其他病人使用，無法從這裡修改共用資料；如需不同資料請改成新增一筆獨立的藥品。' ,en: "This medication is also used by another person, so its shared details cannot be modified here. Add a separate medication if needed." }
  }
  if (message.includes('Not authorized to manage this medication plan')) {
    return { id: 'Anda tidak (lagi) memiliki izin mengelola obat orang ini. Muat ulang halaman lalu coba lagi, atau hubungi pemilik keluarga.', zh: '你目前沒有（或已失去）管理這個人藥單的權限，請重新整理頁面再試一次，或請家庭管理者確認授權。' ,en: "You do not (or no longer) have permission to manage medications for this person. Refresh the page and try again, or contact the family owner." }
  }
  // 沒對到已知情境時，把資料庫實際回傳的訊息一併附上——照護者不一定方便開瀏覽器主控台，
  // 讓錯誤直接顯示在畫面上，才能把真正的原因回報給開發者，而不是永遠只看到「請確認網路」。
  const detail = message.trim()
  if (!detail) return fallback
  return { id: `${fallback.id} (${detail})`, zh: `${fallback.zh}（詳細訊息：${detail}）` ,en: `${fallback.en} (${detail})` }
}

// 給確認視窗用的劑型雙語標籤；跟表單 <select> 的選項文字保持一致，避免只有印尼文照護者在確認框看到英文代碼。
export const DOSAGE_FORM_LABELS: Record<string, LocalizedText> = {
  tablet: { id: 'Tablet', zh: '錠劑' ,en: 'Tablet' },
  capsule: { id: 'Kapsul', zh: '膠囊' ,en: 'Capsule' },
  liquid: { id: 'Cair', zh: '液體' ,en: 'Liquid' },
  powder: { id: 'Bubuk (sachet)', zh: '粉劑（一包）' ,en: 'Powder (sachet)' },
}

// 步距改成 0.25：媽媽正在減藥，需要 1/4、3/4 這種更細的單次劑量可選，不能只到半顆。
const DOSE_STEP = 0.25
const MIN_DOSE_AMOUNT = DOSE_STEP
const MAX_DOSE_AMOUNT = 9

export function validDoseAmount(value: string) {
  const amount = Number(value)
  // 下限必須與步距對齊，否則瀏覽器會從 0.001 開始累加而產生 0.5001 這類假劑量。
  return Number.isFinite(amount) && amount >= MIN_DOSE_AMOUNT && amount <= MAX_DOSE_AMOUNT && Number.isInteger(amount / DOSE_STEP)
}

// 只接受明確標示 mg／毫克的劑量文字；mcg／μg／IU／mL／% 等其他單位一律當作剖析失敗、留白。
// 為什麼不能沿用 parseStrengthFromDrugName 的寬鬆數字擷取（chooseCatalogProduct 那個分支）：
// 那個備援模式會把任何數字（不論單位）都當成 mg，對「已由官方目錄核對過品名」的來源風險較低；
// 這裡的來源是 AI 讀藥袋的自由文字，"250mcg" 用寬鬆規則會擷取出 250 存成 250mg——
// mg／mcg 只差一個字母卻是 1000 倍劑量誤差，比留白危險得多（review finding）。
export function parseMgStrengthLabel(label: string): number | null {
  // \b 只能接在 ASCII 的 mg 後面：中文字元兩側都不是 \w，"...毫克" 結尾時 \b 永遠不會成立，
  // 會讓「10毫克」這種最常見的 AI 辨識輸出整段配對失敗、劑量留白（review finding）。
  const match = label.match(/(\d+(?:\.\d+)?)\s*(?:毫克|mg\b)/i)
  if (!match) return null
  const value = Number(match[1])
  return Number.isFinite(value) && value > 0 ? value : null
}
