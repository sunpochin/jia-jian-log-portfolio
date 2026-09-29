/*
檔案用途：/demo 展示模式的寵物照護本機存取——液體攝取、消化、食慾、皮下輸液、胰島素與血糖六類紀錄。
所在層：src/lib/demoStorage；pet-care 領域，狀態透過 ./store 的共用 loadState／saveState 存取。
主要關聯：由 features/pet-care 各頁面與 PetTrendPanel、petVetReport 經 demoStorage/index.ts 呼叫；對應正式資料庫六張寵物紀錄表。
*/
import type { PetAppetiteRecord, PetBloodGlucoseRecord, PetDigestionRecord, PetInsulinRecord, PetLiquidIntakeRecord, PetSubcutaneousFluidRecord } from '../../types/database'
import { calendarDateKey } from '../careDay'
import { loadState, saveState } from './store'

export function readDemoPetLiquidIntakeRecords(patientId: string, startDate: string, endDate: string): PetLiquidIntakeRecord[] {
  return (loadState().petLiquidIntakeRecords ?? [])
    .filter(record => record.patient_id === patientId && record.recorded_date >= startDate && record.recorded_date <= endDate)
    .sort((left, right) => right.recorded_date.localeCompare(left.recorded_date))
}

export function readDemoPetDigestionRecords(patientId: string, startDate: string, endDate: string): PetDigestionRecord[] {
  return (loadState().petDigestionRecords ?? [])
    .filter(record => record.patient_id === patientId && record.recorded_date >= startDate && record.recorded_date <= endDate)
    .sort((left, right) => right.recorded_date.localeCompare(left.recorded_date))
}

// 液體管理與消化健康是「一天一筆」，比照正式表的 UNIQUE(patient_id, recorded_date)；
// 用 calendarDateKey() 找今天既有的那筆，讀不到就代表要新增，讀到就要覆蓋同一筆而不是疊加。
export function readDemoPetLiquidIntakeRecord(patientId: string): PetLiquidIntakeRecord | null {
  const today = calendarDateKey()
  return (loadState().petLiquidIntakeRecords ?? []).find(record => record.patient_id === patientId && record.recorded_date === today) ?? null
}

export function saveDemoPetLiquidIntakeRecord(record: PetLiquidIntakeRecord): void {
  const state = loadState()
  const records = [...(state.petLiquidIntakeRecords ?? []).filter(existing => existing.id !== record.id), record]
  saveState({ ...state, petLiquidIntakeRecords: records })
}

export function readDemoPetDigestionRecord(patientId: string): PetDigestionRecord | null {
  const today = calendarDateKey()
  return (loadState().petDigestionRecords ?? []).find(record => record.patient_id === patientId && record.recorded_date === today) ?? null
}

export function saveDemoPetDigestionRecord(record: PetDigestionRecord): void {
  const state = loadState()
  const records = [...(state.petDigestionRecords ?? []).filter(existing => existing.id !== record.id), record]
  saveState({ ...state, petDigestionRecords: records })
}

// 食慾、點滴、胰島素、血糖是一天可多筆的時間戳紀錄；趨勢查詢另外傳入結束時間，避免把未來資料帶進目前區間。
export function readDemoPetAppetiteRecords(patientId: string, dayStartIso: string, dayEndIso?: string): PetAppetiteRecord[] {
  return (loadState().petAppetiteRecords ?? [])
    .filter(record => record.patient_id === patientId && Date.parse(record.recorded_at) >= Date.parse(dayStartIso) && (dayEndIso === undefined || Date.parse(record.recorded_at) < Date.parse(dayEndIso)))
    .sort((left, right) => Date.parse(right.recorded_at) - Date.parse(left.recorded_at))
}

export function saveDemoPetAppetiteRecord(record: PetAppetiteRecord): void {
  const state = loadState()
  saveState({ ...state, petAppetiteRecords: [...(state.petAppetiteRecords ?? []), record] })
}

export function readDemoPetFluidRecords(patientId: string, dayStartIso: string, dayEndIso?: string): PetSubcutaneousFluidRecord[] {
  return (loadState().petFluidRecords ?? [])
    .filter(record => record.patient_id === patientId && Date.parse(record.administered_at) >= Date.parse(dayStartIso) && (dayEndIso === undefined || Date.parse(record.administered_at) < Date.parse(dayEndIso)))
    .sort((left, right) => Date.parse(right.administered_at) - Date.parse(left.administered_at))
}

export function saveDemoPetFluidRecord(record: PetSubcutaneousFluidRecord): void {
  const state = loadState()
  saveState({ ...state, petFluidRecords: [...(state.petFluidRecords ?? []), record] })
}

// 胰島素與血糖比照正式資料庫分開存在兩張表，即使展示模式也不合併，避免展示行為與真實寫入邏輯分岔。
export function readDemoPetInsulinRecords(patientId: string, dayStartIso: string, dayEndIso?: string): PetInsulinRecord[] {
  return (loadState().petInsulinRecords ?? [])
    .filter(record => record.patient_id === patientId && Date.parse(record.administered_at) >= Date.parse(dayStartIso) && (dayEndIso === undefined || Date.parse(record.administered_at) < Date.parse(dayEndIso)))
    .sort((left, right) => Date.parse(right.administered_at) - Date.parse(left.administered_at))
}

export function saveDemoPetInsulinRecord(record: PetInsulinRecord): void {
  const state = loadState()
  saveState({ ...state, petInsulinRecords: [...(state.petInsulinRecords ?? []), record] })
}

export function readDemoPetGlucoseRecords(patientId: string, dayStartIso: string, dayEndIso?: string): PetBloodGlucoseRecord[] {
  return (loadState().petGlucoseRecords ?? [])
    .filter(record => record.patient_id === patientId && Date.parse(record.measured_at) >= Date.parse(dayStartIso) && (dayEndIso === undefined || Date.parse(record.measured_at) < Date.parse(dayEndIso)))
    .sort((left, right) => Date.parse(right.measured_at) - Date.parse(left.measured_at))
}

export function saveDemoPetGlucoseRecord(record: PetBloodGlucoseRecord): void {
  const state = loadState()
  saveState({ ...state, petGlucoseRecords: [...(state.petGlucoseRecords ?? []), record] })
}
