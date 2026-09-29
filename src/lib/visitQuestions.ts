/*
檔案用途：回診問題清單（issue #723）的資料轉接層與純邏輯函式；照護閉環 T1（issue #945）起也承接
「就診前摘要採納的觀察」——source／source_rule_id／source_entity_id 記錄這筆問題從哪條規則、哪一列來，
answered_at 由資料庫 trigger 維護、前端只讀。
所在層：src/lib 共用資料層；隔離 Supabase RLS 細節，供 VisitQuestionsPage、就診前摘要「加入問題清單」
與門診頁及相關單元測試使用。
主要關聯：patient_visit_questions migration（20260912120800、20260925180000）、
src/features/reminders/pages/VisitQuestionsPage.tsx、docs/product/care-loop-domain-model.md §3 Q1／Q3。
*/
import { supabase } from './supabase'
import type { LocalizedText } from './i18n'

export type VisitQuestionStatus = 'open' | 'asked' | 'skipped'
// manual：照護者手動輸入；pre_visit_rule：從就診前摘要（R1–R5）一鍵加入，此時 source_rule_id／source_entity_id 必成對。
export type VisitQuestionSource = 'manual' | 'pre_visit_rule'

export interface VisitQuestion {
  id: string
  patient_id: string
  question: string
  answer: string | null
  status: VisitQuestionStatus
  asked_at: string | null
  // 由資料庫 trigger 在 answer 由空變有時設為 now()、清空時設回 null；前端送什麼都會被覆寫，只能讀。
  answered_at: string | null
  source: VisitQuestionSource
  // 就診前摘要的規則代號（'R1'…'R5'）與觸發它的那一列 id（PreVisitBriefItem.dedupeId），手動問題一律 null。
  source_rule_id: string | null
  source_entity_id: string | null
  sort_order: number
  // 由 DB 端 auth.uid()／auth.jwt() 自動填入，前端從不送這兩個欄位，畫面顯示 created_by_email 做可追溯性。
  created_by_user_id: string
  created_by_email: string
  created_at: string
  updated_at: string
}

export interface VisitQuestionSourceRef {
  ruleId: string
  entityId: string
}

export interface CreateVisitQuestionInput {
  patientId: string
  question: string
  sortOrder: number
  // 省略＝手動問題（source = 'manual'）；帶入＝就診前摘要採納的觀察，兩個 id 由資料庫 CHECK 保證成對。
  source?: VisitQuestionSourceRef
}

export interface UpdateVisitQuestionInput {
  patientId: string
  question: string
  answer: string | null
}

export const VISIT_QUESTION_STATUS_META: Record<VisitQuestionStatus, { label: LocalizedText }> = {
  open: { label: { id: 'Belum ditanyakan', zh: '未問', en: 'Not asked yet' } },
  asked: { label: { id: 'Sudah ditanyakan', zh: '已問', en: 'Asked' } },
  skipped: { label: { id: 'Dilewati', zh: '略過', en: 'Skipped' } },
}

// 起手式範本：只問事實，不推論病因或建議治療——直接回應 issue #723 那種
// 「要問良性還是惡性」的誤解，把「該問什麼」換成醫師真的能回答的具體問題。
export const VISIT_QUESTION_PRESETS: LocalizedText[] = [
  { id: 'Apa nama diagnosis resminya?', zh: '這次診斷的正式名稱是什麼？', en: 'What is the official name of this diagnosis?' },
  { id: 'Berapa ukuran atau nilai hasil pemeriksaan ini?', zh: '這次檢查的數值或大小是多少？', en: 'What are the size or values from this exam?' },
  { id: 'Kapan pemeriksaan lanjutan berikutnya, dan seberapa sering?', zh: '下一次追蹤檢查是什麼時候、多久要做一次？', en: 'When is the next follow-up exam, and how often?' },
  { id: 'Dalam kondisi apa harus segera kembali periksa atau ke UGD?', zh: '什麼情況要立刻回診或掛急診？', en: 'Under what conditions should we return immediately or go to the ER?' },
  { id: 'Apakah ada aktivitas harian yang perlu disesuaikan?', zh: '有沒有需要調整的日常活動？', en: 'Are there any daily activities that need to be adjusted?' },
]

/** 新問題的排序值：取目前清單最大值 +1；清單為空時從 1 開始。 */
export function nextSortOrder(existing: Pick<VisitQuestion, 'sort_order'>[]): number {
  return existing.reduce((max, item) => Math.max(max, item.sort_order), 0) + 1
}

/** 「這條規則對這一列已經加入過」的去重鍵；手動問題沒有來源，回傳 null。 */
export function visitQuestionSourceKey(question: Pick<VisitQuestion, 'source' | 'source_rule_id' | 'source_entity_id'>): string | null {
  if (question.source !== 'pre_visit_rule' || !question.source_rule_id || !question.source_entity_id) return null
  return `${question.source_rule_id}:${question.source_entity_id}`
}

function toCreateRow(input: CreateVisitQuestionInput) {
  const question = input.question.trim()
  if (!question) throw new Error('question is required')
  const source = input.source
  if (source && (!source.ruleId.trim() || !source.entityId.trim())) throw new Error('source ruleId and entityId are required together')
  return {
    patient_id: input.patientId,
    question,
    status: 'open' as VisitQuestionStatus,
    sort_order: input.sortOrder,
    // 手動問題不送 source 欄位，交給資料庫預設 'manual'；只有採納就診前摘要時才明確帶出三欄。
    ...(source ? { source: 'pre_visit_rule' as VisitQuestionSource, source_rule_id: source.ruleId.trim(), source_entity_id: source.entityId.trim() } : {}),
  }
}

function toUpdateFields(input: UpdateVisitQuestionInput) {
  const question = input.question.trim()
  if (!question) throw new Error('question is required')
  return {
    question,
    answer: input.answer?.trim() ? input.answer.trim() : null,
  }
}

export async function listVisitQuestions(patientId: string): Promise<VisitQuestion[]> {
  const { data, error } = await supabase
    .from('patient_visit_questions')
    .select('*')
    .eq('patient_id', patientId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })
  if (error) throw error
  return (data ?? []) as VisitQuestion[]
}

export async function createVisitQuestion(input: CreateVisitQuestionInput): Promise<VisitQuestion> {
  const { data, error } = await supabase
    .from('patient_visit_questions')
    .insert(toCreateRow(input))
    .select('*')
    .single()
  if (error) throw error
  return data as VisitQuestion
}

export async function updateVisitQuestion(id: string, input: UpdateVisitQuestionInput): Promise<VisitQuestion> {
  const { data, error } = await supabase
    .from('patient_visit_questions')
    // 為什麼更新不帶 patient_id：問題不能因畫面切換或重放請求被重新歸戶；同時用原病人做 WHERE，讓 adapter 與 RLS 都維持病人邊界。
    // 也不帶 answered_at：那是資料庫 trigger 的責任，前端送了也會被覆寫。
    .update(toUpdateFields(input))
    .eq('id', id)
    .eq('patient_id', input.patientId)
    .select('*')
    .single()
  if (error) throw error
  return data as VisitQuestion
}

export async function setVisitQuestionStatus(id: string, status: VisitQuestionStatus): Promise<VisitQuestion> {
  const { data, error } = await supabase
    .from('patient_visit_questions')
    .update({ status, asked_at: status === 'asked' ? new Date().toISOString() : null })
    .eq('id', id)
    .select('*')
    .single()
  if (error) throw error
  return data as VisitQuestion
}

export async function deleteVisitQuestion(id: string): Promise<void> {
  const { error } = await supabase.from('patient_visit_questions').delete().eq('id', id)
  if (error) throw error
}
