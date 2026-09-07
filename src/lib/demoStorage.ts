/*
檔案用途：保存免登入 /demo 的本機試用變更，讓血壓、體溫與藥單操作能真的反映在畫面上。
所在層：src/lib；只服務展示模式的 localStorage 資料轉接層，不連接真實照護資料。
主要關聯：由血壓／體溫 hooks、每日輸入、藥單與藥品管理 adapter 呼叫；基準資料仍來自 demoData。
*/
import type { BpRecord, DementiaCareRecord, FluidBalanceRecord, MealFoodCatalogItem, MealRecord, MealRecordItem, MedicationCatalog, MedicationIntakeLog, MedicationPlan, MedicationPlanChangeLog, PetAppetiteRecord, PetBloodGlucoseRecord, PetDigestionRecord, PetInsulinRecord, PetLiquidIntakeRecord, PetSubcutaneousFluidRecord, PrnMedicationDailyAssessment, PrnMedicationEvent, TemperatureRecord } from '../types/database'
import dayjs from 'dayjs'
import { calendarDateKey, careDateKey } from './careDay'
import { getFallbackDemoBpRecords, getFallbackDemoLeeMedicationCatalog, getFallbackDemoLeeMedicationPlans, getFallbackDemoMedicationCatalog, getFallbackDemoMedicationHistory, getFallbackDemoMedicationPlans, getFallbackDemoTemperatureRecords, isDemoPatientId } from './demoData'
import type { MedicationPlanView, MedicationPlanChangeLogView } from './medications'
import type { AdminMedicationPlan, MedicationCorrectionInput, MedicationOption, NewMedicationPlanInput } from './medicationAdmin'
import { taipeiWeightDate } from './weight'

export const DEMO_VISITOR_EMAIL = 'demo.visitor@example.test'

export interface DemoWeightRecord {
  id: string
  patient_id: string
  weight_kg: number
  measured_on: string
  measurement_number: number
  measured_at: string
}

const STORAGE_KEY = 'jia-jian-log.demo-state.v1'

interface DemoState {
  version: 1
  bpRecords: BpRecord[]
  temperatureRecords?: TemperatureRecord[]
  medications: MedicationCatalog[]
  medicationPlans: MedicationPlan[]
  medicationLogs: MedicationIntakeLog[]
  medicationChanges: MedicationPlanChangeLog[]
  prnMedicationEvents?: PrnMedicationEvent[]
  prnMedicationAssessments?: PrnMedicationDailyAssessment[]
  mealFoodCatalogItems?: MealFoodCatalogItem[]
  mealRecords?: MealRecord[]
  mealRecordItems?: MealRecordItem[]
  weightRecords?: DemoWeightRecord[]
  petLiquidIntakeRecords?: PetLiquidIntakeRecord[]
  petDigestionRecords?: PetDigestionRecord[]
  petAppetiteRecords?: PetAppetiteRecord[]
  petFluidRecords?: PetSubcutaneousFluidRecord[]
  petInsulinRecords?: PetInsulinRecord[]
  petGlucoseRecords?: PetBloodGlucoseRecord[]
  dementiaCareRecords?: DementiaCareRecord[]
  fluidBalanceRecords?: FluidBalanceRecord[]
}

export function isDemoMode() {
  return typeof window !== 'undefined' && window.location.pathname === '/demo'
}

function initialDemoState(): DemoState {
  const medicationChanges = getFallbackDemoMedicationHistory().map(({ medication: _medication, ...change }) => ({
    ...change,
    dose_count: change.dose_count ?? 1,
  }))
  return {
    version: 1,
    bpRecords: [],
    temperatureRecords: [],
    // 李阿姨的藥單與其他展示對象合併成同一份初始清單；她永遠存在，不受任一展示故事的登入或重置流程影響。
    medications: [...getFallbackDemoLeeMedicationCatalog(), ...getFallbackDemoMedicationCatalog()],
    medicationPlans: [...getFallbackDemoLeeMedicationPlans(), ...getFallbackDemoMedicationPlans()],
    medicationLogs: [],
    medicationChanges,
    prnMedicationEvents: [],
    prnMedicationAssessments: [],
    mealFoodCatalogItems: [],
    mealRecords: [],
    mealRecordItems: [],
    weightRecords: [],
    petLiquidIntakeRecords: [],
    petDigestionRecords: [],
    petAppetiteRecords: [],
    petFluidRecords: [],
    petInsulinRecords: [],
    petGlucoseRecords: [],
    dementiaCareRecords: [],
    fluidBalanceRecords: [],
  }
}

let memoryState: DemoState | null = null
let memoryStatePersistenceFailed = false

function loadState(): DemoState {
  if (typeof window !== 'undefined') {
    let storageReadFailed = false
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY)
      if (memoryState && memoryStatePersistenceFailed) {
        // 寫入失敗時 localStorage 可能只讀到舊快照；先相信本頁記憶體狀態，避免剛完成的試用操作被舊值蓋掉。
        return memoryState
      }
      if (raw) {
        const parsed = JSON.parse(raw) as DemoState
        if (parsed?.version === 1 && Array.isArray(parsed.bpRecords) && Array.isArray(parsed.medications) && Array.isArray(parsed.medicationPlans) && Array.isArray(parsed.medicationLogs) && Array.isArray(parsed.medicationChanges)) {
          // 舊的 Demo 快照沒有體溫欄位；讀取時補空陣列，避免新功能讓既有展示資料整份失效。
          // 舊 Demo 快照要同時補齊新 PRN 與餐點欄位，避免其中一個功能讀到 undefined 而遺失本頁操作。
          memoryState = { ...parsed, temperatureRecords: parsed.temperatureRecords ?? [], prnMedicationEvents: parsed.prnMedicationEvents ?? [], prnMedicationAssessments: parsed.prnMedicationAssessments ?? [], mealFoodCatalogItems: parsed.mealFoodCatalogItems ?? [], mealRecords: parsed.mealRecords ?? [], mealRecordItems: parsed.mealRecordItems ?? [], weightRecords: parsed.weightRecords ?? [] }
          memoryStatePersistenceFailed = false
          return memoryState
        }
      }
    } catch (error) {
      // localStorage 可能被隱私模式封鎖；保留記憶體備援，至少讓本次面試操作不會失效。
      console.warn('[demo storage read warning]', error)
      storageReadFailed = true
    }
    if (storageReadFailed) {
      if (!memoryState) memoryState = initialDemoState()
      return memoryState
    }
    // 清除網站資料後應回到乾淨的展示故事，而不是被模組記憶體偷偷復原舊試用結果。
    memoryState = initialDemoState()
    return memoryState
  }
  if (!memoryState) memoryState = initialDemoState()
  return memoryState
}

export function readDemoWeightRecords(patientId: string): DemoWeightRecord[] {
  return (loadState().weightRecords ?? [])
    .filter(record => record.patient_id === patientId)
    .sort((left, right) => Date.parse(right.measured_at) - Date.parse(left.measured_at))
}

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

export function readDemoDementiaCareRecords(patientId: string, dayStartIso: string, dayEndIso?: string): DementiaCareRecord[] {
  return (loadState().dementiaCareRecords ?? [])
    .filter(record => record.patient_id === patientId && Date.parse(record.occurred_at) >= Date.parse(dayStartIso) && (dayEndIso === undefined || Date.parse(record.occurred_at) < Date.parse(dayEndIso)))
    .sort((left, right) => Date.parse(right.occurred_at) - Date.parse(left.occurred_at))
}

export function saveDemoDementiaCareRecord(record: DementiaCareRecord): void {
  const state = loadState()
  saveState({ ...state, dementiaCareRecords: [...(state.dementiaCareRecords ?? []), record] })
}

export function readDemoFluidBalanceRecords(patientId: string, dayStartIso: string, dayEndIso?: string): FluidBalanceRecord[] {
  return (loadState().fluidBalanceRecords ?? [])
    .filter(record => record.patient_id === patientId && Date.parse(record.occurred_at) >= Date.parse(dayStartIso) && (dayEndIso === undefined || Date.parse(record.occurred_at) < Date.parse(dayEndIso)))
    .sort((left, right) => Date.parse(right.occurred_at) - Date.parse(left.occurred_at))
}

export function saveDemoFluidBalanceRecord(record: FluidBalanceRecord): void {
  const state = loadState()
  saveState({ ...state, fluidBalanceRecords: [...(state.fluidBalanceRecords ?? []), record] })
}

function saveState(state: DemoState) {
  memoryState = state
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    memoryStatePersistenceFailed = false
  } catch (error) {
    // 試用資料不是正式健康資料；儲存被封鎖時不把畫面操作變成錯誤流程。
    memoryStatePersistenceFailed = true
    console.warn('[demo storage write warning]', error)
  }
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

export interface DemoMedicationDay {
  plans: MedicationPlanView[]
  logs: MedicationIntakeLog[]
}

export interface DemoMedicationAdminData {
  plans: AdminMedicationPlan[]
  medications: MedicationOption[]
  changes: Array<MedicationPlanChangeLog & { patient_id: string }>
}

function localId(prefix: string) {
  return `demo-${prefix}-local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function medicationFor(state: DemoState, medicationId: string) {
  return state.medications.find(medication => medication.id === medicationId)
}

function demoMedicationCareDate(log: MedicationIntakeLog): string {
  // 繁體中文註解：舊 localStorage 沒有 care_date 時仍依真實時間推導，避免升級後凌晨紀錄消失。
  return log.care_date ?? careDateKey(dayjs(log.taken_at))
}

export function readDemoMedicationDay(patientId: string, date: string): DemoMedicationDay {
  const state = loadState()
  const medicationById = new Map(state.medications.map(medication => [medication.id, medication]))
  const plans = state.medicationPlans
    .filter(plan => plan.patient_id === patientId && plan.active)
    .flatMap(plan => {
      const medication = medicationById.get(plan.medication_id)
      return medication ? [{ ...plan, medication }] : []
    })
  return {
    plans,
    logs: state.medicationLogs.filter(log => log.patient_id === patientId && demoMedicationCareDate(log) === date),
  }
}

export function readDemoPrnMedicationDay(patientId: string, date: string, planIds: string[]) {
  const state = loadState()
  const selectedPlanIds = new Set(planIds)
  return {
    // 展示模式仍保留 voided 歷史，讓畫面可驗證「次數只算 active、作廢仍可追溯」的資料語意。
    events: (state.prnMedicationEvents ?? []).filter(event => event.patient_id === patientId && event.care_date === date && selectedPlanIds.has(event.plan_id)),
    assessments: (state.prnMedicationAssessments ?? []).filter(assessment => assessment.patient_id === patientId && assessment.care_date === date && selectedPlanIds.has(assessment.plan_id)),
  }
}

export function readDemoMedicationAdminData(patientId: string): DemoMedicationAdminData {
  const state = loadState()
  return {
    plans: state.medicationPlans.filter(plan => plan.patient_id === patientId) as AdminMedicationPlan[],
    // Admin adapter 需要來源欄位；fallback 主檔沒有官方來源時明確填 null，避免把不完整型別硬塞給表單。
    medications: state.medications.map(medication => ({ ...medication, catalog_source: null, catalog_source_id: null })) as MedicationOption[],
    changes: state.medicationChanges.filter(change => change.patient_id === patientId),
  }
}

export function readDemoMedicationHistory(patientId: string, limit = 20): MedicationPlanChangeLogView[] {
  const state = loadState()
  const medicationById = new Map(state.medications.map(medication => [medication.id, medication]))
  return state.medicationChanges
    .filter(change => change.patient_id === patientId)
    .sort((left, right) => Date.parse(right.created_at) - Date.parse(left.created_at))
    .slice(0, limit)
    .flatMap(change => {
      const medication = medicationById.get(change.medication_id)
      return medication ? [{ ...change, medication }] : []
    })
}

function appendMedicationChange(state: DemoState, plan: MedicationPlan, action: MedicationPlanChangeLog['action'], reason: string, actorEmail: string, beforePlan?: MedicationPlan): DemoState {
  const snapshot = (value: MedicationPlan) => ({
    plan_id: value.id, medication_id: value.medication_id, schedule_slot: value.schedule_slot, dose_amount: value.dose_amount,
    dose_count: value.dose_count, as_needed: value.as_needed, active: value.active,
  })
  const now = new Date().toISOString()
  const change: MedicationPlanChangeLog = {
    id: localId('change'),
    patient_id: plan.patient_id,
    action,
    plan_id: plan.id,
    medication_id: plan.medication_id,
    schedule_slot: plan.schedule_slot,
    dose_amount: plan.dose_amount,
    dose_count: plan.dose_count,
    as_needed: plan.as_needed,
    reason: reason.trim() || null,
    actor_email: actorEmail.trim().toLowerCase(),
    before_snapshot: beforePlan ? snapshot(beforePlan) : {},
    after_snapshot: snapshot(plan),
    recorded_at: now,
    effective_at: now,
    created_at: now,
  }
  return { ...state, medicationChanges: [change, ...state.medicationChanges] }
}

export function createDemoMedicationPlan(input: NewMedicationPlanInput, medicationId: string, patientId: string, reason: string, actorEmail = DEMO_VISITOR_EMAIL) {
  const state = loadState()
  const now = new Date().toISOString()
  const existingMedication = medicationFor(state, medicationId)
  const medication: MedicationCatalog = {
    id: medicationId,
    drug_product_id: existingMedication?.drug_product_id ?? null,
    brand_name: input.brandName.trim(),
    brand_name_zh: input.brandNameZh.trim() || null,
    brand_name_id: existingMedication?.brand_name_id ?? null,
    generic_name: input.genericName.trim() || input.brandName.trim(),
    strength_mg: input.strengthMg,
    strength_label: existingMedication?.strength_label ?? null,
    dosage_form: input.dosageForm,
    specialties: existingMedication?.specialties ?? [],
    verification_status: existingMedication?.verification_status ?? 'unverified',
    tfda_license_number: existingMedication?.tfda_license_number ?? null,
    nhi_drug_code: existingMedication?.nhi_drug_code ?? null,
    appearance_note: existingMedication?.appearance_note ?? null,
    appearance_color: input.appearanceColor || null,
    appearance_shape: input.appearanceShape || null,
    appearance_photo_url: input.appearancePhotoUrl.trim() || null,
    created_at: existingMedication?.created_at ?? now,
  }
  const existingPlan = state.medicationPlans.find(plan => plan.patient_id === patientId && plan.medication_id === medicationId && plan.schedule_slot === input.scheduleSlot)
  const plan: MedicationPlan = existingPlan
    ? { ...existingPlan, account_email: actorEmail.trim().toLowerCase(), as_needed: input.asNeeded, dose_amount: input.doseAmount, dose_count: input.doseCount, active: true, display_order: Math.floor(Date.now() / 1_000) }
    : {
        id: localId('plan'), account_email: actorEmail.trim().toLowerCase(), patient_id: patientId, medication_id: medicationId,
        schedule_slot: input.scheduleSlot, as_needed: input.asNeeded, dose_amount: input.doseAmount, dose_count: input.doseCount,
        display_order: Math.floor(Date.now() / 1_000), active: true, created_at: now,
      }
  const planIndex = existingPlan ? state.medicationPlans.findIndex(item => item.id === existingPlan.id) : -1
  const medicationPlans = planIndex >= 0 ? state.medicationPlans.map((item, index) => index === planIndex ? plan : item) : [...state.medicationPlans, plan]
  saveState(appendMedicationChange({ ...state, medications: existingMedication ? state.medications.map(item => item.id === medicationId ? medication : item) : [...state.medications, medication], medicationPlans }, plan, existingPlan ? 'update' : 'create', reason, actorEmail, existingPlan))
}

export function addExistingDemoMedicationPlan(medicationId: string, patientId: string, scheduleSlot: string, doseAmount: number, asNeeded: boolean, reason = '', actorEmail = DEMO_VISITOR_EMAIL, planId?: string, medicationCorrection?: MedicationCorrectionInput) {
  const state = loadState()
  const medication = medicationFor(state, medicationId)
  if (!medication) throw new Error('Demo medication not found')
  const existingPlan = planId
    ? state.medicationPlans.find(plan => plan.id === planId && plan.patient_id === patientId)
    : state.medicationPlans.find(plan => plan.patient_id === patientId && plan.medication_id === medicationId && plan.schedule_slot === scheduleSlot)
  const plan: MedicationPlan = existingPlan
    // Demo 也要套用和正式 RPC 相同的 plan-id 語意；否則調整時段只會顯示成功，實際藥單仍保留舊藥與舊時段。
    ? { ...existingPlan, account_email: actorEmail.trim().toLowerCase(), medication_id: medicationId, schedule_slot: scheduleSlot, as_needed: asNeeded, dose_amount: doseAmount, active: true, display_order: Math.floor(Date.now() / 1_000) }
    : {
        id: localId('plan'), account_email: actorEmail.trim().toLowerCase(), patient_id: patientId, medication_id: medicationId,
        schedule_slot: scheduleSlot, as_needed: asNeeded, dose_amount: doseAmount, dose_count: 1, display_order: Math.floor(Date.now() / 1_000), active: true, created_at: new Date().toISOString(),
      }
  const planIndex = existingPlan ? state.medicationPlans.findIndex(item => item.id === existingPlan.id) : -1
  const medicationPlans = planIndex >= 0 ? state.medicationPlans.map((item, index) => index === planIndex ? plan : item) : [...state.medicationPlans, plan]
  // 修正資料只在有帶入時才覆寫，避免單純調整時段／劑量的呼叫誤把藥品外觀清空。
  const medications = medicationCorrection
    ? state.medications.map(item => item.id === medicationId ? {
        ...item,
        brand_name: medicationCorrection.brandName.trim() || item.brand_name,
        brand_name_zh: medicationCorrection.brandNameZh.trim() || item.brand_name_zh,
        generic_name: medicationCorrection.genericName.trim() || item.generic_name,
        strength_mg: medicationCorrection.strengthMg || item.strength_mg,
        dosage_form: medicationCorrection.dosageForm || item.dosage_form,
        appearance_color: medicationCorrection.appearanceColor || null,
        appearance_shape: medicationCorrection.appearanceShape || null,
        appearance_photo_url: medicationCorrection.appearancePhotoUrl.trim() || null,
      } : item)
    : state.medications
  saveState(appendMedicationChange({ ...state, medicationPlans, medications }, plan, existingPlan ? 'update' : 'create', reason, actorEmail, existingPlan))
}

export function deactivateDemoMedicationPlan(planId: string, patientId: string, reason = '', actorEmail = DEMO_VISITOR_EMAIL) {
  const state = loadState()
  const plan = state.medicationPlans.find(item => item.id === planId && item.patient_id === patientId)
  if (!plan) throw new Error('Demo medication plan not found')
  const nextPlan = { ...plan, active: false }
  const medicationPlans = state.medicationPlans.map(item => item.id === planId ? nextPlan : item)
  saveState(appendMedicationChange({ ...state, medicationPlans }, nextPlan, 'deactivate', reason, actorEmail))
}

export function saveDemoMedicationDose(plan: MedicationPlanView, date: string, doseNumber: number, recordedByEmail: string): MedicationIntakeLog {
  const state = loadState()
  const existing = state.medicationLogs.find(log => log.patient_id === plan.patient_id && log.plan_id === plan.id && demoMedicationCareDate(log) === date && log.dose_number === doseNumber)
  if (existing) return existing
  const now = new Date().toISOString()
  const nowDay = dayjs(now)
  const log: MedicationIntakeLog = {
    id: `demo-intake-${plan.id}-${date}-${doseNumber}`,
    account_email: recordedByEmail.trim().toLowerCase(),
    patient_id: plan.patient_id,
    medication_id: plan.medication_id,
    medication_name: plan.medication.brand_name,
    plan_id: plan.id,
    dose_number: doseNumber,
    // Demo 可固定指定照護日來重播故事；正式 Supabase 仍由 trigger 依 taken_at 強制計算。
    care_date: date,
    taken_on: calendarDateKey(nowDay),
    taken_at: now,
    created_at: now,
  }
  saveState({ ...state, medicationLogs: [...state.medicationLogs, log] })
  return log
}

type DemoPrnEventInsert = Pick<PrnMedicationEvent, 'id' | 'patient_id' | 'plan_id' | 'medication_id' | 'taken_at' | 'care_date' | 'dose_amount' | 'dose_unit' | 'reason' | 'effect_status' | 'notes'> & {
  recorded_by_email: string
}

export function saveDemoPrnMedicationEvent(payload: DemoPrnEventInsert): PrnMedicationEvent {
  const state = loadState()
  const existing = (state.prnMedicationEvents ?? []).find(event => event.id === payload.id && event.patient_id === payload.patient_id)
  if (existing) return existing
  const now = new Date().toISOString()
  const event: PrnMedicationEvent = {
    ...payload,
    recorded_by_user_id: null,
    recorded_by_email: payload.recorded_by_email,
    status: 'active',
    voided_at: null,
    voided_by_user_id: null,
    voided_by_email: null,
    void_reason: null,
    created_at: now,
  }
  saveState({ ...state, prnMedicationEvents: [...(state.prnMedicationEvents ?? []), event] })
  return event
}

export function voidDemoPrnMedicationEvent(eventId: string, patientId: string, reason: string): PrnMedicationEvent {
  const state = loadState()
  const existing = (state.prnMedicationEvents ?? []).find(event => event.id === eventId && event.patient_id === patientId)
  if (!existing) throw new Error('Demo PRN event not found')
  if (existing.status === 'voided') return existing
  const now = new Date().toISOString()
  const voided = { ...existing, status: 'voided' as const, voided_at: now, voided_by_email: DEMO_VISITOR_EMAIL, void_reason: reason }
  saveState({ ...state, prnMedicationEvents: (state.prnMedicationEvents ?? []).map(event => event.id === eventId ? voided : event) })
  return voided
}

export function updateDemoPrnMedicationEffectStatus(eventId: string, patientId: string, effectStatus: PrnMedicationEvent['effect_status']): PrnMedicationEvent {
  const state = loadState()
  const existing = (state.prnMedicationEvents ?? []).find(event => event.id === eventId && event.patient_id === patientId)
  if (!existing) throw new Error('Demo PRN event not found')
  if (existing.status === 'voided') throw new Error('Voided PRN event cannot be assessed')
  const updated = { ...existing, effect_status: effectStatus }
  // Demo 也只改效果欄位；保留原始使用時間與劑量，讓展示流程和正式 append-only 邊界一致。
  saveState({ ...state, prnMedicationEvents: (state.prnMedicationEvents ?? []).map(event => event.id === eventId ? updated : event) })
  return updated
}

export function saveDemoPrnDailyAssessment(payload: Pick<PrnMedicationDailyAssessment, 'patient_id' | 'plan_id' | 'care_date' | 'status' | 'notes'>): PrnMedicationDailyAssessment {
  const state = loadState()
  const now = new Date().toISOString()
  const existing = (state.prnMedicationAssessments ?? []).find(assessment => assessment.patient_id === payload.patient_id && assessment.plan_id === payload.plan_id && assessment.care_date === payload.care_date)
  const assessment: PrnMedicationDailyAssessment = existing
    ? { ...existing, ...payload, assessed_at: now, assessed_by_email: DEMO_VISITOR_EMAIL, updated_at: now }
    : { id: localId('prn-assessment'), ...payload, assessed_at: now, assessed_by_user_id: null, assessed_by_email: DEMO_VISITOR_EMAIL, created_at: now, updated_at: now }
  const assessments = existing
    ? (state.prnMedicationAssessments ?? []).map(item => item.id === existing.id ? assessment : item)
    : [...(state.prnMedicationAssessments ?? []), assessment]
  saveState({ ...state, prnMedicationAssessments: assessments })
  return assessment
}

export function readDemoMealData(patientId: string, since: string, until: string) {
  const state = loadState()
  const records = (state.mealRecords ?? []).filter(record => record.patient_id === patientId && record.occurred_at >= since && record.occurred_at <= until)
    .sort((left, right) => right.occurred_at.localeCompare(left.occurred_at))
  const recordIds = new Set(records.map(record => record.id))
  return {
    records,
    items: (state.mealRecordItems ?? []).filter(item => item.patient_id === patientId && recordIds.has(item.meal_record_id)),
  }
}

export function searchDemoMealFoodCatalog(patientId: string, query: string): MealFoodCatalogItem[] {
  const normalized = query.normalize('NFKC').toLowerCase().trim()
  if (normalized.length < 2) return []
  return (loadState().mealFoodCatalogItems ?? [])
    .filter(item => item.patient_id === patientId && item.normalized_search_text.includes(normalized))
    .sort((left, right) => right.last_used_at.localeCompare(left.last_used_at))
    .slice(0, 8)
}

export function saveDemoMealItem(input: Pick<MealRecord, 'patient_id' | 'meal_type' | 'occurred_at' | 'recorded_by'> & Pick<MealRecordItem, 'food_name_snapshot' | 'serving_label_snapshot' | 'quantity' | 'calories_kcal' | 'calorie_basis'>): { record: MealRecord; item: MealRecordItem } {
  const state = loadState()
  const now = new Date().toISOString()
  const normalized = input.food_name_snapshot.normalize('NFKC').toLowerCase().trim().replace(/\s+/g, ' ')
  const existingCatalog = (state.mealFoodCatalogItems ?? []).find(item => item.patient_id === input.patient_id && item.normalized_search_text === normalized && item.default_serving_label === input.serving_label_snapshot)
  const catalog: MealFoodCatalogItem = existingCatalog
    ? { ...existingCatalog, default_calories_kcal: input.calories_kcal, last_used_at: now, use_count: existingCatalog.use_count + 1, updated_at: now }
    : { id: `demo-food-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, patient_id: input.patient_id, display_name: input.food_name_snapshot.trim(), brand_name: null, normalized_search_text: normalized, default_serving_label: input.serving_label_snapshot.trim(), default_calories_kcal: input.calories_kcal, source: 'manual', last_used_at: now, use_count: 1, created_by: input.recorded_by, created_at: now, updated_at: now }
  const record: MealRecord = { id: `demo-meal-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, patient_id: input.patient_id, meal_type: input.meal_type, occurred_at: input.occurred_at, notes: null, source: 'manual', recorded_by: input.recorded_by, created_at: now, updated_at: now }
  const item: MealRecordItem = { id: `demo-meal-item-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, meal_record_id: record.id, patient_id: input.patient_id, food_catalog_item_id: catalog.id, food_name_snapshot: catalog.display_name, serving_label_snapshot: input.serving_label_snapshot.trim(), quantity: input.quantity, calories_kcal: input.calories_kcal, calorie_basis: input.calorie_basis, created_at: now }
  // Demo 也用病人 ID 隔離，讓端對端測試不會把美玲的餐點留到另一位展示對象。
  saveState({ ...state, mealFoodCatalogItems: [...(state.mealFoodCatalogItems ?? []).filter(candidate => candidate.id !== catalog.id), catalog], mealRecords: [...(state.mealRecords ?? []), record], mealRecordItems: [...(state.mealRecordItems ?? []), item] })
  return { record, item }
}

export function clearDemoMedicationDose(planId: string, patientId: string, date: string, doseNumber: number) {
  const state = loadState()
  const medicationLogs = state.medicationLogs.filter(log => !(log.patient_id === patientId && log.plan_id === planId && demoMedicationCareDate(log) === date && log.dose_number === doseNumber))
  if (medicationLogs.length === state.medicationLogs.length) return false
  saveState({ ...state, medicationLogs })
  return true
}
