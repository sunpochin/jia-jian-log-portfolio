/*
檔案用途：驗證 medication-ai-draft Edge Function（#663）回傳的藥單草稿形狀，並提供「草稿是否仍綁定
目前病人」的共用判斷式；純驗證與比對邏輯，不呼叫 Supabase，回應不合預期就丟錯，不把 undefined 丟進畫面。
所在層：src/lib；資料轉接層，形狀驗證比照 adminUsers.ts 的 parse* 寫法。
主要關聯：supabase/functions/medication-ai-draft/medicationAiDraft.ts（後端同源型別，前端這裡是回應驗證的
對應版本，不是同一份程式碼——Deno Edge Function 與瀏覽器打包分屬不同執行環境，無法直接共用模組）、
src/features/medication/components/MedicationAiDraftSection.tsx（唯一呼叫端，response 到達當下與按下
「套用」當下都要用 draftMatchesPatient 再次比對，見該檔案內的兩處呼叫與註解）。
*/

export type MedicationDraftDosageForm = 'tablet' | 'capsule' | 'liquid' | 'powder'
export type MedicationDraftConfidence = 'high' | 'low'

export interface MedicationDraftItem {
  brandName: string | null
  genericName: string | null
  strengthLabel: string | null
  dosageForm: MedicationDraftDosageForm | null
  doseAmount: number | null
  timesPerDay: number | null
  timingHint: string | null
  confidence: MedicationDraftConfidence
}

export interface MedicationAiDraftResponse {
  patientId: string
  items: MedicationDraftItem[]
}

const VALID_DOSAGE_FORMS: MedicationDraftDosageForm[] = ['tablet', 'capsule', 'liquid', 'powder']

function parseNullableString(value: unknown, field: string): string | null {
  if (value === null || value === undefined) return null
  if (typeof value !== 'string') throw new Error(`medication ai draft item ${field} is invalid`)
  return value
}

function parseDosageForm(value: unknown): MedicationDraftDosageForm | null {
  if (value === null || value === undefined) return null
  if (typeof value === 'string' && (VALID_DOSAGE_FORMS as string[]).includes(value)) return value as MedicationDraftDosageForm
  throw new Error('medication ai draft item dosage form is invalid')
}

function parseNullableNumber(value: unknown, field: string): number | null {
  if (value === null || value === undefined) return null
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`medication ai draft item ${field} is invalid`)
  return value
}

function parseConfidence(value: unknown): MedicationDraftConfidence {
  if (value === 'high' || value === 'low') return value
  throw new Error('medication ai draft item confidence is invalid')
}

function parseMedicationDraftItem(value: unknown): MedicationDraftItem {
  if (!value || typeof value !== 'object') throw new Error('medication ai draft item is invalid')
  const item = value as Record<string, unknown>
  return {
    brandName: parseNullableString(item.brandName, 'brand name'),
    genericName: parseNullableString(item.genericName, 'generic name'),
    strengthLabel: parseNullableString(item.strengthLabel, 'strength label'),
    dosageForm: parseDosageForm(item.dosageForm),
    doseAmount: parseNullableNumber(item.doseAmount, 'dose amount'),
    timesPerDay: parseNullableNumber(item.timesPerDay, 'times per day'),
    timingHint: parseNullableString(item.timingHint, 'timing hint'),
    confidence: parseConfidence(item.confidence),
  }
}

// 為什麼即使是自己家的 Edge Function 回應也要驗證形狀：#663（Function）與 #664（前端）可能各自獨立
// 部署，兩邊版本不同步的視窗內，回應可能缺欄位或型別跑掉；不驗證就直接塞進畫面，會讓照護者看到
// undefined 或觸發渲染例外，而不是一個清楚可懂、可改用手動輸入的錯誤訊息。
export function parseMedicationAiDraftResponse(value: unknown): MedicationAiDraftResponse {
  if (!value || typeof value !== 'object') throw new Error('medication ai draft response is invalid')
  const response = value as { patientId?: unknown; items?: unknown }
  if (typeof response.patientId !== 'string' || !response.patientId) throw new Error('medication ai draft response patient id is invalid')
  if (!Array.isArray(response.items)) throw new Error('medication ai draft response items is invalid')
  return { patientId: response.patientId, items: response.items.map(parseMedicationDraftItem) }
}

// 🔴 健康安全：這是「草稿必須綁定發動當下病人」規則的唯一判斷式，回應抵達當下與按下「套用」當下
// 都要各自呼叫一次（缺一不可，見 issue #664）。抽成單一函式而不是在兩處各自重複比較式，
// 是為了讓兩個呼叫點的判斷邏輯保證一致，也讓這條規則能被獨立單元測試覆蓋，不必依賴元件渲染環境。
export function draftMatchesPatient(draft: MedicationAiDraftResponse | null, currentPatientId: string): draft is MedicationAiDraftResponse {
  return draft !== null && draft.patientId === currentPatientId
}
