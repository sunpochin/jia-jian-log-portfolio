/*
檔案用途：驗證到期提醒 adapter 的病人範圍查詢與不可重新歸戶契約。
所在層：tests/unit；用 Supabase chain mock 驗證 update 不會改寫 patient_id。
主要關聯：src/lib/careDueReminders.ts、care_due_reminders 的 patient-scoped RLS。
*/
import { beforeEach, describe, expect, mock, test } from 'bun:test'

const calls: Array<{ method: string; args: unknown[] }> = []
const savedReminder = { id: 'reminder-a', patient_id: 'patient-a' }

const supabase = {
  from(table: string) {
    calls.push({ method: 'from', args: [table] })
    const chain: Record<string, (...args: unknown[]) => unknown> = {}
    chain.update = (...args) => { calls.push({ method: 'update', args }); return chain }
    chain.eq = (...args) => { calls.push({ method: 'eq', args }); return chain }
    chain.select = (...args) => { calls.push({ method: 'select', args }); return chain }
    chain.single = () => { calls.push({ method: 'single', args: [] }); return Promise.resolve({ data: savedReminder, error: null }) }
    return chain
  },
}

mock.module('../../src/lib/supabase', () => ({ supabase }))

const { updateCareDueReminder } = await import('../../src/lib/careDueReminders')

beforeEach(() => {
  calls.length = 0
})

describe('care due reminder adapter', () => {
  test('updates only the existing patient row and never sends patient_id in the update payload', async () => {
    await updateCareDueReminder('reminder-a', {
      patientId: 'patient-a',
      reminderType: 'follow_up_visit',
      startDate: '2026-09-07',
      dueDate: '2026-09-14',
      thresholdDays: 7,
    })

    expect(calls).toEqual([
      { method: 'from', args: ['care_due_reminders'] },
      { method: 'update', args: [expect.not.objectContaining({ patient_id: 'patient-a' })] },
      { method: 'eq', args: ['id', 'reminder-a'] },
      // 為什麼 update 要把病人 UUID 放進 WHERE：即使同一位照護者能管理多位病人，也不能把提醒搬到另一位名下。
      { method: 'eq', args: ['patient_id', 'patient-a'] },
      { method: 'select', args: ['*'] },
      { method: 'single', args: [] },
    ])
  })
})
