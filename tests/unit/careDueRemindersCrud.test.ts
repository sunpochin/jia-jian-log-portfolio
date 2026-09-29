/*
檔案用途：驗證到期提醒 adapter 的新增、列出、狀態變更與刪除流程。
所在層：tests/unit；以可追蹤的 Supabase chain mock 驗證資料欄位與錯誤傳遞。
主要關聯：src/lib/careDueReminders.ts、care_due_reminders RLS 與 CareDueRemindersPage。
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
    chain.order = (...args) => { calls.push({ method: 'order', args }); return finish() }
    chain.single = () => { calls.push({ method: 'single', args: [] }); return finish() }
    // 為什麼要讓 chain 可 await：delete().eq() 沒有 select/single，正式 Supabase 會直接回傳 promise，mock 也要保留同一個契約。
    chain.then = (onFulfilled?: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) => finish().then(onFulfilled, onRejected)
    return chain
  },
}

mock.module('../../src/lib/supabase', () => ({ supabase }))

const {
  classifyReminderDueLevel,
  computeRemainingDays,
  createCareDueReminder,
  deleteCareDueReminder,
  listCareDueReminders,
  reminderTypesForSpecies,
  setCareDueReminderStatus,
  updateCareDueReminder,
} = await import('../../src/lib/careDueReminders')

const reminder = { id: 'r1', patient_id: 'p1', reminder_type: 'medication_refill', status: 'active' }

beforeEach(() => {
  calls.length = 0
  nextResult = { data: reminder, error: null }
})

describe('care due reminder CRUD adapter', () => {
  test('lists rows in due-date order', async () => {
    nextResult = { data: [reminder], error: null }
    await expect(listCareDueReminders('p1')).resolves.toEqual([reminder])
    expect(calls).toEqual([
      { method: 'from', args: ['care_due_reminders'] },
      { method: 'select', args: ['*'] },
      { method: 'eq', args: ['patient_id', 'p1'] },
      { method: 'order', args: ['due_date', { ascending: true }] },
    ])
  })

  test('creates medication reminders with a computed due date', async () => {
    await createCareDueReminder({ patientId: 'p1', reminderType: 'medication_refill', startDate: '2026-09-09', daysSupply: 5, thresholdDays: 2, medicationPlanId: 'plan-1' })
    expect(calls.find(call => call.method === 'insert')?.args[0]).toMatchObject({
      patient_id: 'p1',
      reminder_type: 'medication_refill',
      medication_plan_id: 'plan-1',
      days_supply: 5,
      due_date: '2026-09-14',
      status: 'active',
    })
  })

  test('creates non-medication reminders from the explicitly entered due date', async () => {
    await createCareDueReminder({ patientId: 'p1', reminderType: 'vaccination', startDate: '2026-09-09', dueDate: '2027-01-01', thresholdDays: 14 })
    expect(calls.find(call => call.method === 'insert')?.args[0]).toMatchObject({
      reminder_type: 'vaccination',
      medication_plan_id: null,
      days_supply: null,
      due_date: '2027-01-01',
    })
  })

  // 照護閉環 T2（issue #946）：回診／複驗提醒可連回同病人的時間線事件或檢驗值並記科別；藥量倒數一律送 null。
  // 關聯欄位走 patch 語意（Codex review PR #952 P2）：沒提供的欄位不送，明確傳 null 才清除。
  test('links follow-up reminders to a timeline entry or lab result and trims the department', async () => {
    await createCareDueReminder({ patientId: 'p1', reminderType: 'follow_up_visit', startDate: '2026-09-09', dueDate: '2026-10-09', thresholdDays: 7, relatedEntryId: 'entry-1', visitDepartment: ' 心臟內科 ' })
    const linkedInsert = calls.find(call => call.method === 'insert')?.args[0] as Record<string, unknown>
    // 設定其中一個連結＝取代：另一個一律送 null（見 toClinicalLinkFields 的互斥說明）。
    expect(linkedInsert).toMatchObject({ reminder_type: 'follow_up_visit', related_entry_id: 'entry-1', related_lab_result_id: null, visit_department: '心臟內科' })

    calls.length = 0
    await createCareDueReminder({ patientId: 'p1', reminderType: 'blood_draw', startDate: '2026-09-09', dueDate: '2026-10-09', thresholdDays: 7, relatedLabResultId: 'lab-1', visitDepartment: '' })
    const labInsert = calls.find(call => call.method === 'insert')?.args[0] as Record<string, unknown>
    expect(labInsert).toMatchObject({ related_lab_result_id: 'lab-1', related_entry_id: null, visit_department: null })
  })

  test('preserves clinical links on update when the edit form omits them and clears them only on explicit null', async () => {
    await updateCareDueReminder('r1', { patientId: 'p1', reminderType: 'follow_up_visit', startDate: '2026-09-09', dueDate: '2026-10-20', thresholdDays: 7 })
    const untouched = calls.find(call => call.method === 'update')?.args[0] as Record<string, unknown>
    expect(untouched).toMatchObject({ due_date: '2026-10-20' })
    expect(untouched).not.toHaveProperty('related_entry_id')
    expect(untouched).not.toHaveProperty('related_lab_result_id')
    expect(untouched).not.toHaveProperty('visit_department')

    calls.length = 0
    await updateCareDueReminder('r1', { patientId: 'p1', reminderType: 'follow_up_visit', startDate: '2026-09-09', dueDate: '2026-10-20', thresholdDays: 7, relatedEntryId: null, visitDepartment: null })
    expect(calls.find(call => call.method === 'update')?.args[0]).toMatchObject({ related_entry_id: null, visit_department: null })
  })

  test('never sends clinical links or a department for medication refill reminders', async () => {
    await createCareDueReminder({ patientId: 'p1', reminderType: 'medication_refill', startDate: '2026-09-09', daysSupply: 5, thresholdDays: 2, relatedEntryId: 'entry-1', relatedLabResultId: 'lab-1', visitDepartment: '心臟內科' })
    expect(calls.find(call => call.method === 'insert')?.args[0]).toMatchObject({
      reminder_type: 'medication_refill',
      related_entry_id: null,
      related_lab_result_id: null,
      visit_department: null,
    })
  })

  // 2026-09-26 獨立複審：patch 語意下只送一個新連結時，必須同時清掉另一個，否則資料庫裡的舊連結留著，
  // 兩欄同時有值被 care_due_reminders_related_source_check 擋下。
  test('replacing one clinical link clears the other on update', async () => {
    await updateCareDueReminder('r1', { patientId: 'p1', reminderType: 'blood_draw', startDate: '2026-09-09', dueDate: '2026-10-20', thresholdDays: 7, relatedLabResultId: 'lab-1' })
    expect(calls.find(call => call.method === 'update')?.args[0]).toMatchObject({ related_lab_result_id: 'lab-1', related_entry_id: null })

    calls.length = 0
    await updateCareDueReminder('r1', { patientId: 'p1', reminderType: 'follow_up_visit', startDate: '2026-09-09', dueDate: '2026-10-20', thresholdDays: 7, relatedEntryId: 'entry-1' })
    expect(calls.find(call => call.method === 'update')?.args[0]).toMatchObject({ related_entry_id: 'entry-1', related_lab_result_id: null })
  })

  test('does not reject an over-long leftover department on a medication refill', async () => {
    await createCareDueReminder({ patientId: 'p1', reminderType: 'medication_refill', startDate: '2026-09-09', daysSupply: 5, thresholdDays: 2, visitDepartment: 'x'.repeat(41) })
    expect(calls.find(call => call.method === 'insert')?.args[0]).toMatchObject({ visit_department: null })
  })

  test('rejects both links at once or an over-long department before any database call', async () => {
    await expect(createCareDueReminder({ patientId: 'p1', reminderType: 'follow_up_visit', startDate: '2026-09-09', dueDate: '2026-10-09', thresholdDays: 7, relatedEntryId: 'entry-1', relatedLabResultId: 'lab-1' })).rejects.toThrow('mutually exclusive')
    await expect(createCareDueReminder({ patientId: 'p1', reminderType: 'follow_up_visit', startDate: '2026-09-09', dueDate: '2026-10-09', thresholdDays: 7, visitDepartment: 'x'.repeat(41) })).rejects.toThrow('at most 40 characters')
    expect(calls.some(call => ['insert', 'select', 'single'].includes(call.method))).toBe(false)
  })

  test('rejects incomplete reminder inputs before any database call', async () => {
    await expect(createCareDueReminder({ patientId: 'p1', reminderType: 'medication_refill', startDate: '2026-09-09', thresholdDays: 2 })).rejects.toThrow('days_supply is required')
    await expect(createCareDueReminder({ patientId: 'p1', reminderType: 'medication_refill', startDate: '2026-09-09', daysSupply: 0, thresholdDays: 2 })).rejects.toThrow('days_supply is required')
    await expect(createCareDueReminder({ patientId: 'p1', reminderType: 'vaccination', startDate: '2026-09-09', thresholdDays: 2 })).rejects.toThrow('dueDate is required')
    // JavaScript 會先取出 supabase.from，再計算 insert 的參數；真正的寫入鏈仍不應被建立。
    expect(calls.every(call => call.method === 'from')).toBe(true)
    expect(calls.some(call => ['insert', 'select', 'single'].includes(call.method))).toBe(false)
  })

  test('updates with the patient boundary and records completed time only for completed status', async () => {
    await updateCareDueReminder('r1', { patientId: 'p1', reminderType: 'follow_up_visit', startDate: '2026-09-09', dueDate: '2026-09-20', thresholdDays: 7 })
    const update = calls.find(call => call.method === 'update')?.args[0] as Record<string, unknown>
    expect(update).not.toHaveProperty('patient_id')

    calls.length = 0
    await setCareDueReminderStatus('r1', 'completed')
    const completedUpdate = calls.find(call => call.method === 'update')?.args[0] as Record<string, unknown>
    expect(completedUpdate.status).toBe('completed')
    expect(completedUpdate.completed_at).toEqual(expect.any(String))

    calls.length = 0
    await setCareDueReminderStatus('r1', 'dismissed')
    expect(calls.find(call => call.method === 'update')?.args[0]).toEqual({ status: 'dismissed', completed_at: null })
  })

  test('deletes by id and forwards database errors', async () => {
    await deleteCareDueReminder('r1')
    expect(calls).toEqual([
      { method: 'from', args: ['care_due_reminders'] },
      { method: 'delete', args: [] },
      { method: 'eq', args: ['id', 'r1'] },
    ])

    const failure = new Error('database unavailable')
    nextResult = { data: null, error: failure }
    await expect(deleteCareDueReminder('r1')).rejects.toBe(failure)
  })

  // 為什麼未指定物種時必須回傳全量型別：建立提醒表單若尚未載入或不限制照護對象，不可鎖死選項或崩潰；指定 human/dog 則防呆過濾（如人類排除寵物疫苗、犬隻排除門診回診），避免醫療照護項目誤套用。
  test('filters reminder types for species and handles undefined species', () => {
    const allTypes = reminderTypesForSpecies(undefined)
    expect(allTypes.length).toBeGreaterThan(0)
    expect(allTypes).toContain('medication_refill')
    expect(allTypes).toContain('follow_up_visit')
    expect(allTypes).toContain('vaccination')

    const humanTypes = reminderTypesForSpecies('human')
    expect(humanTypes).toContain('follow_up_visit')
    expect(humanTypes).not.toContain('vaccination')

    const dogTypes = reminderTypesForSpecies('dog')
    expect(dogTypes).toContain('vaccination')
    expect(dogTypes).toContain('heartworm_prevention')
    expect(dogTypes).not.toContain('follow_up_visit')
  })

  // 為什麼要測預設時鐘路徑與明確基準日：前端多數呼叫依賴預設 calendarDateKey()（台北時區）計算倒數，需確認無參數時仍回傳有效剩餘天數；指定基準日則鎖定負數（overdue）、當天與臨界值（due_soon <= 門檻）、安全期（ok > 門檻）的等級邊界，避免時區與浮點落差造成警示誤判。
  test('computes remaining days and classifies due level correctly', () => {
    // 驗證未傳入基準日時，預設時區時鐘解析正常運作且未來日期回傳正數
    const daysFromNow = computeRemainingDays('2099-01-01')
    expect(daysFromNow).toBeGreaterThan(0)

    // 鎖定固定基準日驗證過期（負數）、當日（0）與未來剩餘天數計算
    expect(computeRemainingDays('2026-09-15', '2026-09-10')).toBe(5)
    expect(computeRemainingDays('2026-09-10', '2026-09-10')).toBe(0)
    expect(computeRemainingDays('2026-09-09', '2026-09-10')).toBe(-1)

    // 驗證等級分類邊界：< 0 為 overdue、<= threshold 為 due_soon、> threshold 為 ok
    expect(classifyReminderDueLevel(-1, 3)).toBe('overdue')
    expect(classifyReminderDueLevel(0, 3)).toBe('due_soon')
    expect(classifyReminderDueLevel(3, 3)).toBe('due_soon')
    expect(classifyReminderDueLevel(4, 3)).toBe('ok')
  })
})
