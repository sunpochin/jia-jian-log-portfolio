/*
檔案用途：服用方式 B 層（人講過的）資料轉接層——代碼字典、Supabase／Demo 讀寫與 A/B 兩層衝突偵測。
所在層：src/lib 資料層；不含畫面狀態，寫入由 Supabase RLS（can_manage_medication）把關，不透過 RPC。
主要關聯：patient_medication_instructions 資料表、src/lib/demoStorage/medication.ts、accountExport.ts；
顯示端是 src/features/medication/components/MedicationIntakeGuidance.tsx，
填寫端是 src/features/medication/components/MedicationInstructionEditor.tsx。
*/
import { supabase } from '../supabase'
import { isDemoMode, readDemoPatientMedicationInstructions, saveDemoPatientMedicationInstruction, clearDemoPatientMedicationInstruction } from '../demoStorage'
import { isDemoPatientId } from '../demoData'
import type { PatientMedicationInstruction, PatientMedicationInstructionSource } from '../../types/database'
import type { LocalizedText } from '../i18n'
import type { SwallowGuidanceLevel } from './medicationSwallowGuidance'

// chip 清單與顯示端共用同一份文字，形狀比照 MEDICATION_SPECIALTIES（src/lib/medicationCatalog.ts）。
export const MEDICATION_INSTRUCTION_CODES: readonly [string, LocalizedText][] = [
  ['swallow_whole', { id: 'Ditelan utuh', zh: '整顆吞下', en: 'Swallow whole' }],
  ['crush_ok', { id: 'Boleh digerus dicampur air', zh: '可磨粉配水', en: 'May be crushed and mixed with water' }],
  ['open_capsule_ok', { id: 'Boleh dibuka kapsulnya lalu dituang', zh: '可打開膠囊倒出', en: 'Capsule may be opened and contents poured out' }],
  ['split_half', { id: 'Boleh dibelah dua', zh: '可剝半', en: 'May be split in half' }],
  ['mix_with_water', { id: 'Dilarutkan dalam air lalu diminum', zh: '泡水後喝', en: 'Dissolve in water before drinking' }],
  ['with_food', { id: 'Diminum bersama makanan / setelah makan', zh: '隨餐／飯後服用', en: 'Take with food / after meals' }],
  ['empty_stomach', { id: 'Diminum saat perut kosong', zh: '空腹服用', en: 'Take on an empty stomach' }],
  ['plenty_of_water', { id: 'Minum dengan banyak air putih', zh: '配大量開水服用', en: 'Take with plenty of water' }],
  ['not_with_milk', { id: 'Jangan diminum bersama susu / antasida', zh: '不與牛奶／制酸劑同服', en: 'Do not take with milk / antacids' }],
]

export const SOURCE_LABELS: readonly [PatientMedicationInstructionSource, LocalizedText][] = [
  ['pharmacist', { id: 'Apoteker', zh: '藥師', en: 'Pharmacist' }],
  ['doctor', { id: 'Dokter', zh: '醫師', en: 'Doctor' }],
  ['package_insert', { id: 'Label kemasan obat', zh: '藥袋仿單', en: 'Package insert' }],
  ['family', { id: 'Dicatat sendiri oleh keluarga', zh: '家屬自行記錄', en: 'Recorded by family' }],
]

export const MEDICATION_INSTRUCTION_NOTE_MAX_LENGTH = 200

// 顯示端（issue #627 的 MedicationIntakeGuidance.tsx 與交接手冊）都需要「代碼／來源 → 三語文字」查找，
// 用 Map／Record 集中一次，避免兩處各自重複 find() 掃整張表。
const INSTRUCTION_CODE_TEXT_BY_VALUE = new Map(MEDICATION_INSTRUCTION_CODES)
export function instructionCodeText(code: string): LocalizedText | undefined {
  return INSTRUCTION_CODE_TEXT_BY_VALUE.get(code)
}

const SOURCE_LABEL_BY_VALUE = Object.fromEntries(SOURCE_LABELS) as Record<PatientMedicationInstructionSource, LocalizedText>
export function sourceLabelText(source: PatientMedicationInstructionSource): LocalizedText {
  return SOURCE_LABEL_BY_VALUE[source]
}

const PATIENT_MEDICATION_INSTRUCTION_SELECT = 'patient_id, medication_id, instruction_codes, instruction_note, source, confirmed_on, updated_by, updated_at'

export interface SavePatientMedicationInstructionInput {
  patientId: string
  medicationId: string
  instructionCodes: string[]
  instructionNote: string
  source: PatientMedicationInstructionSource
  confirmedOn: string
}

/** 讀取一位病人所有藥品的服用方式；Demo 模式改走 localStorage，不打正式 Supabase。 */
export async function readPatientMedicationInstructions(patientId: string): Promise<PatientMedicationInstruction[]> {
  if (isDemoMode() && isDemoPatientId(patientId)) return readDemoPatientMedicationInstructions(patientId)
  const { data, error } = await supabase
    .from('patient_medication_instructions')
    .select(PATIENT_MEDICATION_INSTRUCTION_SELECT)
    .eq('patient_id', patientId)
  if (error) throw error
  return (data ?? []) as unknown as PatientMedicationInstruction[]
}

/** 新增或覆寫一顆藥的服用方式；updated_by／updated_at 交給資料庫 trigger 從 JWT 寫入，這裡不送這兩欄。 */
export async function savePatientMedicationInstruction(input: SavePatientMedicationInstructionInput): Promise<PatientMedicationInstruction> {
  const trimmedNote = input.instructionNote.trim()
  if (trimmedNote.length > MEDICATION_INSTRUCTION_NOTE_MAX_LENGTH) {
    throw new Error(`Instruction note must be at most ${MEDICATION_INSTRUCTION_NOTE_MAX_LENGTH} characters`)
  }
  const payload = {
    patient_id: input.patientId,
    medication_id: input.medicationId,
    instruction_codes: input.instructionCodes,
    instruction_note: trimmedNote || null,
    source: input.source,
    confirmed_on: input.confirmedOn,
  }
  if (isDemoMode() && isDemoPatientId(input.patientId)) return saveDemoPatientMedicationInstruction(payload)
  const { data, error } = await supabase
    .from('patient_medication_instructions')
    .upsert(payload, { onConflict: 'patient_id,medication_id' })
    .select(PATIENT_MEDICATION_INSTRUCTION_SELECT)
    .single()
  if (error) throw error
  return data as unknown as PatientMedicationInstruction
}

/** 清除一顆藥的服用方式紀錄（例如藥師交代已過期或記錄錯誤）。 */
export async function clearPatientMedicationInstruction(patientId: string, medicationId: string): Promise<void> {
  if (isDemoMode() && isDemoPatientId(patientId)) return clearDemoPatientMedicationInstruction(patientId, medicationId)
  const { error } = await supabase
    .from('patient_medication_instructions')
    .delete()
    .eq('patient_id', patientId)
    .eq('medication_id', medicationId)
  if (error) throw error
}

// 「給藥動作」是 A 層等級與 B 層代碼的共同投影；同一顆藥被投影到兩個不同動作才是真正的衝突。
// 不能直接寫死配對清單（例如「crush_ok 對上 swallow_whole」）比對，那樣會漏掉 sublingual+swallow_whole、
// chewable+swallow_whole、dissolve_in_water+swallow_whole、swallow_whole+open_capsule_ok 這類真實可達的組合——
// 這些都是「不同給藥動作」但沒有出現在任何一份寫死清單裡的矛盾。
type AdministrationAction = 'swallow_whole' | 'alter_form' | 'sublingual' | 'chew' | 'dissolve_in_water' | 'dissolve_in_mouth'

const GUIDANCE_LEVEL_TO_ACTION: Partial<Record<SwallowGuidanceLevel, AdministrationAction>> = {
  swallow_whole: 'swallow_whole',
  sublingual: 'sublingual',
  chewable: 'chew',
  dissolve_in_water: 'dissolve_in_water',
  dissolve_in_mouth: 'dissolve_in_mouth',
  // not_a_pill／unknown 沒有明確給藥動作，不參與矩陣比對。
}

const INSTRUCTION_CODE_TO_ACTION: Partial<Record<string, AdministrationAction>> = {
  swallow_whole: 'swallow_whole',
  crush_ok: 'alter_form',
  split_half: 'alter_form',
  open_capsule_ok: 'alter_form',
  mix_with_water: 'dissolve_in_water',
  // with_food／empty_stomach／plenty_of_water／not_with_milk 描述「配什麼、什麼時候吃」，不是給藥動作。
}

/**
 * 偵測 A 層等級與 B 層代碼是否互相矛盾。只負責偵測、不負責裁決哪一邊正確——
 * 兩邊衝突時畫面要兩邊都照顯示，另外加一條「請再跟藥師確認」，不能靜默讓任何一邊勝出（見規劃文件 §2 紅線）。
 *
 * 這裡只比對「A 層的單一等級」對「B 層每一個代碼」，不會拿 B 層代碼互相比對。
 * B 層本來就可能一次記錄好幾個描述同一套服藥步驟的代碼——最典型的例子就是 `crush_ok`＋`mix_with_water`
 * （磨粉之後配水吞服，兩個代碼描述的是同一個連續動作，不是兩種互斥吃法）；
 * 如果把「codes 投影出的所有動作」也拿來互相比對，會把這種相容組合誤判成衝突。
 */
export function detectInstructionConflict(guidanceLevel: SwallowGuidanceLevel | null | undefined, codes: readonly string[]): boolean {
  const guidanceAction = guidanceLevel ? GUIDANCE_LEVEL_TO_ACTION[guidanceLevel] : undefined
  const hasActionConflict = guidanceAction != null && codes.some(code => {
    const codeAction = INSTRUCTION_CODE_TO_ACTION[code]
    return codeAction != null && codeAction !== guidanceAction
  })
  // with_food 與 empty_stomach 不是給藥動作矩陣的一部分，但彼此仍互斥，另外檢查。
  return hasActionConflict || (codes.includes('with_food') && codes.includes('empty_stomach'))
}
