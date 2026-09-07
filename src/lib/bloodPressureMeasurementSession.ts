/*
檔案用途：保存目前病人的血壓雙次量測休息流程，讓跨分頁返回時仍能恢復倒數。
所在層：src/lib；提供 App 外殼與血壓輸入頁共用的輕量狀態轉接。
主要關聯：App、DailyCarePage、InputPage 與 BloodPressureCountdownBanner。
*/
import type { BpRecord } from '../types/database'
import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import timezone from 'dayjs/plugin/timezone'
import { careDateKey } from './careDay'
import { TZ } from './timezone'
import { getSession } from './session'

dayjs.extend(utc)
dayjs.extend(timezone)

export interface BloodPressureMeasurementSession {
  patientId: string
  sessionKey: string
  deadline: number
  firstRecord: Pick<BpRecord, 'systolic' | 'diastolic' | 'pulse'>
}

// Web 第二次量測倒數仍需要固定休息時間；它與 iOS 的即時測試通知刻意分開，避免平台 adapter 反過來持有 Web 規則。
export const SECOND_MEASUREMENT_DELAY_MS = 60_000

export function shouldCancelBloodPressureMeasurementSession(
  session: Pick<BloodPressureMeasurementSession, 'patientId'> | null,
  selectedPatientId: string | undefined,
  accountChanged = false,
): boolean {
  if (!session) return false
  // 量測輪次是暫時的病人範圍狀態；帳號或目前病人一變，就不能讓第二筆落到新範圍。
  return accountChanged || session.patientId !== selectedPatientId
}

export function getBloodPressureMeasurementSessionKey(patientId: string, at = Date.now()) {
  const date = dayjs(at).tz(TZ)
  return `${careDateKey(date)}-${getSession(date.hour())}-${patientId}`
}

const STORAGE_KEY = 'jia-jian-log-blood-pressure-measurement-session'

export function readBloodPressureMeasurementSession(): BloodPressureMeasurementSession | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<BloodPressureMeasurementSession>
    if (
      typeof parsed.patientId !== 'string' ||
      typeof parsed.sessionKey !== 'string' ||
      typeof parsed.deadline !== 'number' ||
      !parsed.firstRecord ||
      typeof parsed.firstRecord.systolic !== 'number' ||
      typeof parsed.firstRecord.diastolic !== 'number'
    ) return null
    return parsed as BloodPressureMeasurementSession
  } catch {
    return null
  }
}

export function saveBloodPressureMeasurementSession(session: BloodPressureMeasurementSession) {
  if (typeof window === 'undefined') return
  // 為什麼只放 sessionStorage：倒數是這次裝置操作的暫時狀態，不應變成跨日或跨裝置的健康紀錄。
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session))
  } catch (error) {
    // 儲存空間被封鎖時仍保留記憶體狀態，不能讓已成功寫入的血壓卡在 saving。
    console.warn('[blood pressure session persistence skipped]', error)
  }
}

export function clearBloodPressureMeasurementSession() {
  if (typeof window === 'undefined') return
  try {
    window.sessionStorage.removeItem(STORAGE_KEY)
  } catch (error) {
    console.warn('[blood pressure session persistence clear skipped]', error)
  }
}
