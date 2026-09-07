/*
檔案用途：驗證藥量倒數與回診／抽血／打針／疫苗到期提醒的前端純邏輯（到期日推算、剩餘天數、門檻分級）。
所在層：tests/unit；保護 src/lib/careDueReminders.ts 的日期計算與物種篩選規則。
主要關聯：src/lib/careDueReminders.ts。
*/
import { describe, expect, test } from 'bun:test'
import {
  classifyReminderDueLevel,
  computeMedicationDueDate,
  computeRemainingDays,
  reminderTypesForSpecies,
  REMINDER_TYPE_META,
} from '../../src/lib/careDueReminders'

describe('care due reminders pure functions', () => {
  test('computes medication due date as pickup date plus days supply', () => {
    expect(computeMedicationDueDate('2026-08-01', 90)).toBe('2026-10-30')
    expect(computeMedicationDueDate('2026-08-25', 14)).toBe('2026-09-08')
  })

  test('computes remaining days relative to an explicit today', () => {
    expect(computeRemainingDays('2026-09-08', '2026-08-25')).toBe(14)
    expect(computeRemainingDays('2026-08-25', '2026-08-25')).toBe(0)
    expect(computeRemainingDays('2026-08-20', '2026-08-25')).toBe(-5)
  })

  test('classifies overdue, due-soon, and ok by remaining days versus threshold', () => {
    expect(classifyReminderDueLevel(-1, 7)).toBe('overdue')
    expect(classifyReminderDueLevel(0, 7)).toBe('due_soon')
    expect(classifyReminderDueLevel(7, 7)).toBe('due_soon')
    expect(classifyReminderDueLevel(8, 7)).toBe('ok')
  })

  test('filters reminder types by care recipient species', () => {
    expect(reminderTypesForSpecies('human')).toEqual(['medication_refill', 'follow_up_visit', 'blood_draw', 'injection'])
    expect(reminderTypesForSpecies('dog')).toEqual(['medication_refill', 'vaccination', 'heartworm_prevention', 'deworming'])
    expect(reminderTypesForSpecies('bird')).toEqual(['medication_refill', 'vaccination', 'deworming'])
    // 未指定物種時（例如尚未載入病人資料）不擋任何型別，避免表單暫時性地顯示空白選單。
    expect(reminderTypesForSpecies(undefined)).toEqual(Object.keys(REMINDER_TYPE_META))
  })
})
