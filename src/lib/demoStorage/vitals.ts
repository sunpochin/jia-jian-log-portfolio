/*
檔案用途：/demo 展示模式的生理量測本機存取——血壓、體溫與體重紀錄的讀取、新增、更新與刪除。
所在層：src/lib/demoStorage；vitals（生理量測）領域，狀態透過 ./store 的共用 loadState／saveState 存取。
主要關聯：由血壓／體溫／體重 hooks 與頁面（useBpRecords、useTemperatureRecords、WeightPage 等）經 demoStorage/index.ts 呼叫。
*/
import type { BpRecord, TemperatureRecord } from '../../types/database'
import { getFallbackDemoBpRecords, getFallbackDemoTemperatureRecords, isDemoPatientId } from '../demoData'
import { taipeiWeightDate } from '../weight'
import { DEMO_VISITOR_EMAIL, type DemoWeightRecord, loadState, saveState } from './store'

export function readDemoWeightRecords(patientId: string): DemoWeightRecord[] {
  return (loadState().weightRecords ?? [])
    .filter(record => record.patient_id === patientId)
    .sort((left, right) => Date.parse(right.measured_at) - Date.parse(left.measured_at))
}

export function saveDemoWeightRecord(record: DemoWeightRecord): void {
  const state = loadState()
  const today = taipeiWeightDate()
  const records = [...(state.weightRecords ?? []).filter(existing => existing.id !== record.id), record]
  const latestByPastDate = new Map<string, DemoWeightRecord>()
  const retained = records.filter(item => {
    if (item.patient_id !== record.patient_id || item.measured_on >= today) return true
    const current = latestByPastDate.get(item.measured_on)
    if (!current || Date.parse(item.measured_at) > Date.parse(current.measured_at)) latestByPastDate.set(item.measured_on, item)
    return false
  })
  saveState({ ...state, weightRecords: [...retained, ...latestByPastDate.values()] })
}

export function getDemoBpRecords(days: number, patientId: string): BpRecord[] {
  if (!isDemoPatientId(patientId)) return []
  const localSince = Date.now() - (Math.max(1, days) - 1) * 24 * 60 * 60 * 1_000
  const localRecords = loadState().bpRecords.filter(record => record.patient_id === patientId && Date.parse(record.measured_at) >= localSince)
  return [...getFallbackDemoBpRecords(days, patientId), ...localRecords]
    .sort((left, right) => Date.parse(right.measured_at) - Date.parse(left.measured_at))
}

export function getDemoBpRecordsCreatedBetween(patientId: string, start: string, end: string): BpRecord[] {
  const startMs = Date.parse(start)
  const endMs = Date.parse(end)
  return loadState().bpRecords
    .filter(record => record.patient_id === patientId && Date.parse(record.created_at) >= startMs && Date.parse(record.created_at) < endMs)
    .sort((left, right) => Date.parse(left.created_at) - Date.parse(right.created_at))
}

export function saveDemoBpRecord(input: Pick<BpRecord, 'patient_id' | 'systolic' | 'diastolic' | 'pulse' | 'measured_at'>): BpRecord {
  const now = new Date().toISOString()
  const record: BpRecord = {
    id: `demo-bp-local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    patient_id: input.patient_id,
    systolic: input.systolic,
    diastolic: input.diastolic,
    pulse: input.pulse,
    measured_at: input.measured_at,
    created_at: now,
    recorded_by: DEMO_VISITOR_EMAIL,
    source: 'demo_local',
  }
  const state = loadState()
  // 以 id 做本機 upsert；若重試沿用同一筆 id，不能讓同一筆量測在 Demo 清單出現兩次。
  const bpRecords = [...state.bpRecords.filter(existing => existing.id !== record.id), record]
  saveState({ ...state, bpRecords })
  return record
}

export function updateDemoBpRecord(id: string, patientId: string, values: Pick<BpRecord, 'systolic' | 'diastolic' | 'pulse'>): boolean {
  const state = loadState()
  let changed = false
  const bpRecords = state.bpRecords.map(record => {
    if (record.id !== id || record.patient_id !== patientId) return record
    changed = true
    return { ...record, ...values }
  })
  if (changed) saveState({ ...state, bpRecords })
  return changed
}

export function deleteDemoBpRecord(id: string, patientId: string): boolean {
  const state = loadState()
  const bpRecords = state.bpRecords.filter(record => record.id !== id || record.patient_id !== patientId)
  if (bpRecords.length === state.bpRecords.length) return false
  saveState({ ...state, bpRecords })
  return true
}

export function getDemoTemperatureRecords(days: number, patientId: string): TemperatureRecord[] {
  if (!isDemoPatientId(patientId)) return []
  const localSince = Date.now() - (Math.max(1, days) - 1) * 24 * 60 * 60 * 1_000
  const localRecords = (loadState().temperatureRecords ?? []).filter(record => record.patient_id === patientId && Date.parse(record.measured_at) >= localSince)
  return [...getFallbackDemoTemperatureRecords(days, patientId), ...localRecords]
    .sort((left, right) => Date.parse(right.measured_at) - Date.parse(left.measured_at))
}

export function getDemoTemperatureRecordsCreatedBetween(patientId: string, start: string, end: string): TemperatureRecord[] {
  const startMs = Date.parse(start)
  const endMs = Date.parse(end)
  return (loadState().temperatureRecords ?? [])
    .filter(record => record.patient_id === patientId && Date.parse(record.created_at) >= startMs && Date.parse(record.created_at) < endMs)
    .sort((left, right) => Date.parse(left.created_at) - Date.parse(right.created_at))
}

export function saveDemoTemperatureRecord(input: Omit<TemperatureRecord, 'id' | 'created_at' | 'recorded_by' | 'source'>): TemperatureRecord {
  const now = new Date().toISOString()
  const record: TemperatureRecord = {
    ...input,
    id: `demo-temperature-local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    created_at: now,
    recorded_by: DEMO_VISITOR_EMAIL,
    source: 'demo_local',
  }
  const state = loadState()
  const temperatureRecords = [...(state.temperatureRecords ?? []), record]
  saveState({ ...state, temperatureRecords })
  return record
}

export function updateDemoTemperatureRecord(id: string, patientId: string, values: Pick<TemperatureRecord, 'temperature_c' | 'measurement_site' | 'context' | 'notes'>): boolean {
  const state = loadState()
  let changed = false
  const temperatureRecords = (state.temperatureRecords ?? []).map(record => {
    if (record.id !== id || record.patient_id !== patientId) return record
    changed = true
    return { ...record, ...values }
  })
  if (changed) saveState({ ...state, temperatureRecords })
  return changed
}

export function deleteDemoTemperatureRecord(id: string, patientId: string): boolean {
  const state = loadState()
  const temperatureRecords = (state.temperatureRecords ?? []).filter(record => record.id !== id || record.patient_id !== patientId)
  if (temperatureRecords.length === (state.temperatureRecords ?? []).length) return false
  saveState({ ...state, temperatureRecords })
  return true
}
