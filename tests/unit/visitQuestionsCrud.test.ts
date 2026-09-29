/*
檔案用途：驗證回診問題清單 adapter 的新增、列出、狀態變更、編輯與刪除流程。
所在層：tests/unit；以可追蹤的 Supabase chain mock 驗證資料欄位與錯誤傳遞。
主要關聯：src/lib/visitQuestions.ts、patient_visit_questions RLS 與 VisitQuestionsPage。
*/
import { beforeEach, describe, expect, mock, test } from 'bun:test'

const calls: Array<{ method: string; args: unknown[] }> = []
let nextResult: { data: unknown; error: unknown } = { data: null, error: null }

const supabase = {
  from(table: string) {
    calls.push({ method: 'from', args: [table] })
    const chain: Record<string, (...args: unknown[]) => unknown> = {}
    const finish = () => Promise.resolve(nextResult)
    chain.insert = (...args) => { calls.push({ method: 'insert', args }); return chain }
    chain.update = (...args) => { calls.push({ method: 'update', args }); return chain }
    chain.delete = (...args) => { calls.push({ method: 'delete', args }); return chain }
    chain.select = (...args) => { calls.push({ method: 'select', args }); return chain }
    chain.eq = (...args) => { calls.push({ method: 'eq', args }); return chain }
    chain.order = (...args) => { calls.push({ method: 'order', args }); return chain }
    chain.single = () => { calls.push({ method: 'single', args: [] }); return finish() }
    // 為什麼要讓 chain 可 await：delete().eq() 沒有 select/single，正式 Supabase 會直接回傳 promise，mock 也要保留同一個契約。
    chain.then = (onFulfilled?: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) => finish().then(onFulfilled, onRejected)
    return chain
  },
}

mock.module('../../src/lib/supabase', () => ({ supabase }))

const {
  createVisitQuestion,
  deleteVisitQuestion,
  listVisitQuestions,
  setVisitQuestionStatus,
  updateVisitQuestion,
} = await import('../../src/lib/visitQuestions')

const question = { id: 'q1', patient_id: 'p1', question: '這次診斷的正式名稱是什麼？', answer: null, status: 'open', sort_order: 1 }

beforeEach(() => {
  calls.length = 0
  nextResult = { data: question, error: null }
})

describe('visit question CRUD adapter', () => {
  test('lists rows ordered by sort_order then created_at', async () => {
    nextResult = { data: [question], error: null }
    await expect(listVisitQuestions('p1')).resolves.toEqual([question])
    expect(calls).toEqual([
      { method: 'from', args: ['patient_visit_questions'] },
      { method: 'select', args: ['*'] },
      { method: 'eq', args: ['patient_id', 'p1'] },
      { method: 'order', args: ['sort_order', { ascending: true }] },
      { method: 'order', args: ['created_at', { ascending: true }] },
    ])
  })

  test('creates a question with a trimmed question and open status', async () => {
    await createVisitQuestion({ patientId: 'p1', question: '  這次診斷的正式名稱是什麼？  ', sortOrder: 1 })
    expect(calls.find(call => call.method === 'insert')?.args[0]).toEqual({
      patient_id: 'p1',
      question: '這次診斷的正式名稱是什麼？',
      status: 'open',
      sort_order: 1,
    })
  })

  // 照護閉環 T1（issue #945）：就診前摘要「加入問題清單」要把規則代號與觸發實體 id 成對送進資料庫；
  // 手動問題則完全不送 source 欄位，交給資料庫預設 'manual'，既有 payload 一個位元組都不變。
  test('sends the rule id and entity id together only when adopting a pre-visit brief item', async () => {
    await createVisitQuestion({ patientId: 'p1', question: '請與醫師確認：這項血鉀結果是否需要追蹤？', sortOrder: 2, source: { ruleId: 'R5', entityId: ' lab-1 ' } })
    expect(calls.find(call => call.method === 'insert')?.args[0]).toEqual({
      patient_id: 'p1',
      question: '請與醫師確認：這項血鉀結果是否需要追蹤？',
      status: 'open',
      sort_order: 2,
      source: 'pre_visit_rule',
      source_rule_id: 'R5',
      source_entity_id: 'lab-1',
    })
  })

  test('rejects a half-filled source pair before any database call', async () => {
    await expect(createVisitQuestion({ patientId: 'p1', question: '問題', sortOrder: 1, source: { ruleId: 'R1', entityId: '   ' } })).rejects.toThrow('source ruleId and entityId are required together')
    expect(calls.some(call => ['insert', 'select', 'single'].includes(call.method))).toBe(false)
  })

  test('never sends answered_at on update, leaving it to the database trigger', async () => {
    await updateVisitQuestion('q1', { patientId: 'p1', question: '這次檢查的數值是多少？', answer: '2mm' })
    const update = calls.find(call => call.method === 'update')?.args[0] as Record<string, unknown>
    expect(update).not.toHaveProperty('answered_at')
    expect(update).not.toHaveProperty('source')
  })

  test('rejects a blank question before any database call', async () => {
    await expect(createVisitQuestion({ patientId: 'p1', question: '   ', sortOrder: 1 })).rejects.toThrow('question is required')
    expect(calls.every(call => call.method === 'from')).toBe(true)
    expect(calls.some(call => ['insert', 'select', 'single'].includes(call.method))).toBe(false)
  })

  test('updates with the patient boundary and never sends patient_id in the payload', async () => {
    await updateVisitQuestion('q1', { patientId: 'p1', question: '這次檢查的數值是多少？', answer: '  2mm  ' })
    const update = calls.find(call => call.method === 'update')?.args[0] as Record<string, unknown>
    expect(update).not.toHaveProperty('patient_id')
    expect(update).toEqual({ question: '這次檢查的數值是多少？', answer: '2mm' })
    expect(calls.filter(call => call.method === 'eq')).toEqual([
      { method: 'eq', args: ['id', 'q1'] },
      { method: 'eq', args: ['patient_id', 'p1'] },
    ])
  })

  test('clears the answer to null when left blank', async () => {
    await updateVisitQuestion('q1', { patientId: 'p1', question: '這次檢查的數值是多少？', answer: '   ' })
    const update = calls.find(call => call.method === 'update')?.args[0] as Record<string, unknown>
    expect(update.answer).toBeNull()
  })

  test('records asked_at only when marking asked, and clears it otherwise', async () => {
    await setVisitQuestionStatus('q1', 'asked')
    const askedUpdate = calls.find(call => call.method === 'update')?.args[0] as Record<string, unknown>
    expect(askedUpdate.status).toBe('asked')
    expect(askedUpdate.asked_at).toEqual(expect.any(String))

    calls.length = 0
    await setVisitQuestionStatus('q1', 'skipped')
    expect(calls.find(call => call.method === 'update')?.args[0]).toEqual({ status: 'skipped', asked_at: null })
  })

  test('deletes by id and forwards database errors', async () => {
    await deleteVisitQuestion('q1')
    expect(calls).toEqual([
      { method: 'from', args: ['patient_visit_questions'] },
      { method: 'delete', args: [] },
      { method: 'eq', args: ['id', 'q1'] },
    ])

    const failure = new Error('database unavailable')
    nextResult = { data: null, error: failure }
    await expect(deleteVisitQuestion('q1')).rejects.toBe(failure)
  })
})
