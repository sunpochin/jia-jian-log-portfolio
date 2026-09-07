/*
檔案用途：處理今日服藥 MVP 之讀取、寫入、清除與跨裝置衝突判定。
所在層：src/lib；為今日服藥即時資料層。
主要關聯：由 MedicationTodayCard 載入並同步 Supabase。
*/
import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import timezone from 'dayjs/plugin/timezone'
import { supabase } from './supabase'
import { calendarDateKey, CARE_DAY_TIMEZONE, careDateKey } from './careDay'
import type { MedicationIntakeLog } from '../types/database'

dayjs.extend(utc)
dayjs.extend(timezone)

export const MEDICATION_TZ = CARE_DAY_TIMEZONE
export const TODAY_MEDICATION_MVP = {
  accountEmail: 'admin@careapp.local',
  medicationId: 'exforge-5-160',
  nameZh: '易安穩 5/160',
  scheduleZh: '每日一次',
}

export interface MedicationTodayLog {
  id?: string
  medicationId: string
  accountEmail: string
  date: string
  takenAt: string
}

export type MedicationSyncErrorKind = 'setup' | 'permission' | 'network'

export function taipeiDateKey(now = dayjs()): string {
  // 繁體中文註解：每日服藥的「今天」必須跟照護日同步；真正發生日期另由 calendarDateKey 保留。
  return careDateKey(now)
}

export function normalizeMedicationEmail(accountEmail: string): string {
  return accountEmail.trim().toLowerCase()
}

export function toMedicationTodayLog(row: MedicationIntakeLog): MedicationTodayLog {
  return {
    id: row.id,
    medicationId: row.medication_id,
    accountEmail: normalizeMedicationEmail(row.account_email),
    date: row.care_date ?? row.taken_on,
    takenAt: row.taken_at,
  }
}

export function buildMedicationInsert(
  accountEmail: string,
  medicationId: string,
  _date: string,
  takenAt = dayjs().toISOString(),
) {
  const takenAtDay = dayjs(takenAt)
  return {
    account_email: normalizeMedicationEmail(accountEmail),
    medication_id: medicationId,
    medication_name: TODAY_MEDICATION_MVP.nameZh,
    // 繁體中文註解：taken_on 保留日曆日相容欄位；每日去重與照護卡改讀 care_date。
    taken_on: calendarDateKey(takenAtDay),
    care_date: careDateKey(takenAtDay),
    taken_at: takenAt,
  }
}

export function getMedicationSyncErrorKind(error: unknown): MedicationSyncErrorKind {
  // 繁體中文註解：catch 進來的是 unknown，甚至可能是 null；先收斂型別，避免錯誤處理本身再崩潰。
  const err = error && typeof error === 'object' ? error as { code?: string; message?: string } : {}
  const message = typeof err.message === 'string' ? err.message.toLowerCase() : ''

  // 繁體中文註解：migration 尚未套用時 Postgres/PostgREST 會回不同 code；集中判斷避免 UI 把資料庫未開通誤報成網路問題。
  if (err.code === '42P01' || err.code === 'PGRST205') return 'setup'
  // 繁體中文註解：RLS 或登入權限問題要和網路問題分開，否則使用者一直重試也不會成功。
  if (err.code === '42501' || message.includes('row-level security') || message.includes('permission denied')) return 'permission'
  if (message.includes('medication_intake_logs') || message.includes('medication_plans') || message.includes('medications')) return 'setup'

  return 'network'
}

export function medicationSyncErrorMessage(kind: MedicationSyncErrorKind): string {
  // 繁體中文註解：服藥者無法處理 migration 或權限設定，統一提供可理解的下一步，技術原因仍由 console 保留給維護者。
  if (kind === 'setup') return '服藥紀錄暫時無法使用，請稍後再試或聯絡家人。'
  if (kind === 'permission') return '此帳號暫時無法讀取服藥紀錄，請聯絡家人。'
  return '同步失敗，請確認網路後再試一次'
}

export async function readMedicationTodayLog(
  accountEmail: string,
  medicationId: string,
  date: string,
) {
  const { data, error } = await supabase
    .from('medication_intake_logs')
    .select('id, account_email, medication_id, medication_name, taken_on, care_date, taken_at, created_at')
    .eq('account_email', normalizeMedicationEmail(accountEmail))
    .eq('medication_id', medicationId)
    .eq('care_date', date)
    .maybeSingle()

  if (error) throw error
  return data ? toMedicationTodayLog(data as MedicationIntakeLog) : null
}

export async function saveMedicationTodayLog(
  accountEmail: string,
  medicationId: string,
  date: string,
) {
  const { data, error } = await supabase
    .from('medication_intake_logs')
    .insert(buildMedicationInsert(accountEmail, medicationId, date))
    .select('id, account_email, medication_id, medication_name, taken_on, care_date, taken_at, created_at')
    .single()

  if (error) {
    // 繁體中文註解：如果另一台裝置剛好已經記錄成功，回讀資料比把唯一鍵錯誤丟給使用者更符合「不要重複吃」目標。
    if (error.code === '23505') return readMedicationTodayLog(accountEmail, medicationId, date)
    throw error
  }

  return toMedicationTodayLog(data as MedicationIntakeLog)
}

export async function clearMedicationTodayLog(
  accountEmail: string,
  medicationId: string,
  date: string,
) {
  const { error } = await supabase
    .from('medication_intake_logs')
    .delete()
    .eq('account_email', normalizeMedicationEmail(accountEmail))
    .eq('medication_id', medicationId)
    .eq('care_date', date)

  if (error) throw error
}
