/*
檔案用途：保存血壓寫入失敗時的本機 pending queue，並在恢復連線後逐筆重送。
所在層：src/lib；是血壓輸入頁與瀏覽器 localStorage 之間的病人／帳號分區 adapter。
主要關聯：InputPage、DailyBloodPressureRecords、bloodPressureRecords 與 localStorage。
*/
import type { BpRecord } from '../types/database'
import type { BloodPressureInsertPayload } from './bloodPressureRecords'
import { isRetryableWriteError } from './dataErrors'
import { patientScopedCacheKey } from './localCache'

export type PendingBloodPressureRecord = Omit<BloodPressureInsertPayload, 'recorded_by'> & {
  recorded_by: string
  queued_at: string
  // 記錄是否已嘗試過 Telegram 通知：insertBloodPressureRecord 的 'already-existed' 結果
  // 可能來自「這筆本來就是這次補送才真正寫入，只是伺服器回應遺失」，也可能來自「先前
  // 補送已成功通知，但移除佇列時 localStorage 寫入失敗而殘留」，兩者無法只靠 insert 結果
  // 分辨。缺這個欄位就得二選一：永遠不補通知（原始 bug）或每次重試都重複通知家人。
  notified?: boolean
}

export interface PendingBloodPressureFlushResult {
  synced: PendingBloodPressureRecord[]
  remaining: PendingBloodPressureRecord[]
  blocked: boolean
}

const STORAGE_NAMESPACE = 'jia-jian.pending-blood-pressure.v1'

function isValidPendingRecord(value: unknown): value is PendingBloodPressureRecord {
  if (typeof value !== 'object' || value === null) return false
  const record = value as Record<string, unknown>
  return (
    typeof record.id === 'string' && record.id.length > 0 &&
    typeof record.patient_id === 'string' && record.patient_id.length > 0 &&
    Number.isInteger(record.systolic) && Number.isInteger(record.diastolic) &&
    (record.pulse === null || Number.isInteger(record.pulse)) &&
    typeof record.measured_at === 'string' && !Number.isNaN(Date.parse(record.measured_at)) &&
    typeof record.source === 'string' &&
    typeof record.recorded_by === 'string' && record.recorded_by.length > 0 &&
    typeof record.queued_at === 'string' && !Number.isNaN(Date.parse(record.queued_at)) &&
    (record.notified === undefined || typeof record.notified === 'boolean')
  )
}

function storageKey(patientId: string, recordedBy: string): string {
  // storage key 也要帶 patient_id；只靠讀取時 filter 仍可能讓同一瀏覽器的不同病人共用一個健康資料桶。
  return patientScopedCacheKey(STORAGE_NAMESPACE, patientId, normalizedEmail(recordedBy))
}

function readQueue(patientId: string, recordedBy: string): PendingBloodPressureRecord[] {
  try {
    const raw = localStorage.getItem(storageKey(patientId, recordedBy))
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter(isValidPendingRecord) : []
  } catch (error) {
    // localStorage 被停用或 JSON 損壞時不能讓輸入頁崩潰；這次資料會回到一般錯誤提示。
    console.warn('[blood pressure pending queue read error]', error)
    return []
  }
}

function writeQueue(patientId: string, recordedBy: string, records: PendingBloodPressureRecord[]): boolean {
  try {
    localStorage.setItem(storageKey(patientId, recordedBy), JSON.stringify(records))
    return true
  } catch (error) {
    // 沒有可用的本機儲存時不能假裝已建立離線備份，呼叫端會保留輸入錯誤狀態讓使用者重試。
    console.warn('[blood pressure pending queue write error]', error)
    return false
  }
}

function normalizedEmail(email: string): string {
  return email.trim().toLowerCase()
}

export function pendingBloodPressureRecordToView(record: PendingBloodPressureRecord): BpRecord {
  return {
    id: `pending-bp-${record.id}`,
    systolic: record.systolic,
    diastolic: record.diastolic,
    pulse: record.pulse,
    measured_at: record.measured_at,
    source: record.source,
    recorded_by: record.recorded_by,
    patient_id: record.patient_id,
    created_at: record.queued_at,
  }
}

export function readPendingBloodPressureRecords(patientId: string, recordedBy: string): PendingBloodPressureRecord[] {
  const owner = normalizedEmail(recordedBy)
  return readQueue(patientId, owner)
    .filter(record => record.patient_id === patientId && record.recorded_by === owner)
    .sort((left, right) => Date.parse(left.queued_at) - Date.parse(right.queued_at))
}

export function enqueuePendingBloodPressureRecord(record: PendingBloodPressureRecord): boolean {
  const normalized: PendingBloodPressureRecord = { ...record, recorded_by: normalizedEmail(record.recorded_by) }
  const records = readQueue(normalized.patient_id, normalized.recorded_by).filter(existing => existing.id !== normalized.id)
  return writeQueue(normalized.patient_id, normalized.recorded_by, [...records, normalized])
}

export function removePendingBloodPressureRecord(record: Pick<PendingBloodPressureRecord, 'id' | 'patient_id' | 'recorded_by'>): boolean {
  const owner = normalizedEmail(record.recorded_by)
  const records = readQueue(record.patient_id, owner)
  return writeQueue(record.patient_id, owner, records.filter(existing => existing.id !== record.id))
}

export async function flushPendingBloodPressureRecords({
  patientId,
  recordedBy,
  save,
}: {
  patientId: string
  recordedBy: string
  save: (record: PendingBloodPressureRecord) => Promise<unknown>
}): Promise<PendingBloodPressureFlushResult> {
  const candidates = readPendingBloodPressureRecords(patientId, recordedBy)
  const synced: PendingBloodPressureRecord[] = []
  let blocked = false

  for (const record of candidates) {
    try {
      await save(record)
      // 先移除已確認寫入的項目；若 localStorage 此刻失敗，下一次仍會靠固定 id 安全去重。
      removePendingBloodPressureRecord(record)
      synced.push(record)
    } catch (error) {
      blocked = true
      console.warn('[blood pressure pending queue sync error]', record.id, error)
      if (isRetryableWriteError(error)) {
        // 暫時性失敗（斷線、408/429/5xx）：保留原本順序，之後這筆與後面的紀錄一起再試。
        break
      }
      // 永久性失敗（權限被收回、配額已滿等）：這筆留在佇列讓使用者知道，但繼續送出後面尚未同步的量測，
      // 不能讓一筆卡住的紀錄擋住後續所有離線資料。
    }
  }

  return {
    synced,
    remaining: readPendingBloodPressureRecords(patientId, recordedBy),
    blocked,
  }
}
