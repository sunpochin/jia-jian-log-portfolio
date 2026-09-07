/*
檔案用途：彙整體重、食慾、液體管理、消化健康、皮下點滴與內分泌（胰島素／血糖）等模組於指定期間內的統計，
供獸醫／醫師版一頁報告使用；「上次回診」則從照護時間軸挑出最近一筆「看診／健康處置」事件推算，
本 App 未另外儲存抽血日期欄位。
所在層：src/lib 資料轉接層；隔離 Supabase 查詢與 Demo 模式細節，只回傳給元件層純資料模型。
主要關聯：由 PetVetReport 元件呼叫；查詢 patient_weight_measurement_records、五張寵物照護紀錄表與
care_timeline_entries，並與 demoStorage／demoData 的展示模式資料源保持一致。
*/
import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import timezone from 'dayjs/plugin/timezone'
import { supabase } from './supabase'
import { TZ } from './timezone'
import { isDemoMode, readDemoPetAppetiteRecords, readDemoPetDigestionRecords, readDemoPetFluidRecords, readDemoPetGlucoseRecords, readDemoPetInsulinRecords, readDemoPetLiquidIntakeRecords, readDemoWeightRecords } from './demoStorage'
import { getFallbackDemoCareTimeline, isDemoPatientId } from './demoData'
import type { CareTimelineEntry } from './careTimeline'
import type { PatientWeightMeasurementRecord } from '../types/database'

dayjs.extend(utc)
dayjs.extend(timezone)

export interface PetVetReportBounds {
  sinceDate: string
  untilDate: string
  sinceIso: string
  untilIso: string
}

export interface PetVetReportModel {
  bounds: PetVetReportBounds
  weight: {
    latestKg: number | null
    latestMeasuredOn: string | null
    earliestKg: number | null
    earliestMeasuredOn: string | null
    deltaKg: number | null
    recordCount: number
  }
  appetite: { avgPercent: number | null; recordCount: number }
  liquid: { waterTotalMl: number | null; waterAvgMlPerDay: number | null; urinationTotal: number | null; recordDays: number }
  digestion: { vomitingTotal: number | null; defecationTotal: number | null; avgStoolScore: number | null; recordDays: number }
  fluidTherapy: { volumeTotalMl: number | null; recordCount: number }
  endocrine: { insulinTotalUnits: number | null; insulinRecordCount: number; glucoseAvgMgDl: number | null; glucoseRecordCount: number }
  lastHealthVisit: { occurredAt: string; title: string } | null
}

// 半開區間右界用「隔天 00:00」而不是 23:59:59.999，避免浮點精度漏掉當天最後一筆紀錄。
export function petVetReportBounds(days: number, now = dayjs().tz(TZ)): PetVetReportBounds {
  const safeDays = Math.max(1, Math.trunc(days))
  const start = now.startOf('day').subtract(safeDays - 1, 'day')
  const until = now.startOf('day').add(1, 'day')
  return {
    sinceDate: start.format('YYYY-MM-DD'),
    untilDate: now.format('YYYY-MM-DD'),
    sinceIso: start.toISOString(),
    untilIso: until.toISOString(),
  }
}

function sum(values: (number | null | undefined)[]): number | null {
  const finite = values.filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
  if (finite.length === 0) return null
  return finite.reduce((total, value) => total + value, 0)
}

function average(values: (number | null | undefined)[]): number | null {
  const finite = values.filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
  if (finite.length === 0) return null
  return finite.reduce((total, value) => total + value, 0) / finite.length
}

async function loadWeight(patientId: string, bounds: PetVetReportBounds): Promise<PetVetReportModel['weight']> {
  const empty = { latestKg: null, latestMeasuredOn: null, earliestKg: null, earliestMeasuredOn: null, deltaKg: null, recordCount: 0 }
  let records: { weight_kg: number; measured_on: string }[]
  if (isDemoMode()) {
    records = readDemoWeightRecords(patientId).filter(record => record.measured_on >= bounds.sinceDate)
  } else {
    const { data, error } = await supabase.from('patient_weight_measurement_records')
      .select('weight_kg, measured_on')
      .eq('patient_id', patientId)
      .gte('measured_on', bounds.sinceDate)
      .order('measured_on', { ascending: true })
    if (error) throw error
    records = (data ?? []) as Pick<PatientWeightMeasurementRecord, 'weight_kg' | 'measured_on'>[]
  }
  if (records.length === 0) return empty
  // 同一天可能多次量測，先依日期彙整成當日平均，再取期間內最早／最新一天做比較，避免單筆離群值誤導趨勢。
  const byDate = new Map<string, { sum: number; count: number }>()
  for (const record of records) {
    const weight = Number(record.weight_kg)
    if (!Number.isFinite(weight)) continue
    const bucket = byDate.get(record.measured_on) ?? { sum: 0, count: 0 }
    byDate.set(record.measured_on, { sum: bucket.sum + weight, count: bucket.count + 1 })
  }
  const dates = [...byDate.keys()].sort()
  if (dates.length === 0) return empty
  const earliestDate = dates[0]
  const latestDate = dates[dates.length - 1]
  const earliestBucket = byDate.get(earliestDate)!
  const latestBucket = byDate.get(latestDate)!
  const earliestKg = Number((earliestBucket.sum / earliestBucket.count).toFixed(2))
  const latestKg = Number((latestBucket.sum / latestBucket.count).toFixed(2))
  return {
    latestKg,
    latestMeasuredOn: latestDate,
    earliestKg,
    earliestMeasuredOn: earliestDate,
    deltaKg: Number((latestKg - earliestKg).toFixed(2)),
    recordCount: records.length,
  }
}

async function loadAppetite(patientId: string, bounds: PetVetReportBounds): Promise<PetVetReportModel['appetite']> {
  const records = isDemoMode()
    ? readDemoPetAppetiteRecords(patientId, bounds.sinceIso, bounds.untilIso)
    : await (async () => {
        const { data, error } = await supabase.from('pet_appetite_records')
          .select('appetite_percent')
          .eq('patient_id', patientId)
          .gte('recorded_at', bounds.sinceIso)
          .lt('recorded_at', bounds.untilIso)
        if (error) throw error
        return (data ?? []) as { appetite_percent: number }[]
      })()
  return { avgPercent: average(records.map(record => record.appetite_percent)), recordCount: records.length }
}

async function loadLiquid(patientId: string, bounds: PetVetReportBounds): Promise<PetVetReportModel['liquid']> {
  const records = isDemoMode()
    ? readDemoPetLiquidIntakeRecords(patientId, bounds.sinceDate, bounds.untilDate)
    : await (async () => {
        const { data, error } = await supabase.from('pet_liquid_intake_records')
          .select('water_intake_ml, urination_count')
          .eq('patient_id', patientId)
          .gte('recorded_date', bounds.sinceDate)
          .lte('recorded_date', bounds.untilDate)
        if (error) throw error
        return (data ?? []) as { water_intake_ml: number | null; urination_count: number | null }[]
      })()
  const waterTotalMl = sum(records.map(record => record.water_intake_ml))
  const recordDays = records.filter(record => record.water_intake_ml != null || record.urination_count != null).length
  return {
    waterTotalMl,
    waterAvgMlPerDay: waterTotalMl != null && recordDays > 0 ? Number((waterTotalMl / recordDays).toFixed(0)) : null,
    urinationTotal: sum(records.map(record => record.urination_count)),
    recordDays,
  }
}

async function loadDigestion(patientId: string, bounds: PetVetReportBounds): Promise<PetVetReportModel['digestion']> {
  const records = isDemoMode()
    ? readDemoPetDigestionRecords(patientId, bounds.sinceDate, bounds.untilDate)
    : await (async () => {
        const { data, error } = await supabase.from('pet_digestion_records')
          .select('vomiting_count, defecation_count, stool_score')
          .eq('patient_id', patientId)
          .gte('recorded_date', bounds.sinceDate)
          .lte('recorded_date', bounds.untilDate)
        if (error) throw error
        return (data ?? []) as { vomiting_count: number | null; defecation_count: number | null; stool_score: number | null }[]
      })()
  return {
    vomitingTotal: sum(records.map(record => record.vomiting_count)),
    defecationTotal: sum(records.map(record => record.defecation_count)),
    avgStoolScore: average(records.map(record => record.stool_score)),
    recordDays: records.filter(record => record.vomiting_count != null || record.defecation_count != null || record.stool_score != null).length,
  }
}

async function loadFluidTherapy(patientId: string, bounds: PetVetReportBounds): Promise<PetVetReportModel['fluidTherapy']> {
  const records = isDemoMode()
    ? readDemoPetFluidRecords(patientId, bounds.sinceIso, bounds.untilIso)
    : await (async () => {
        const { data, error } = await supabase.from('pet_subcutaneous_fluid_records')
          .select('fluid_volume_ml')
          .eq('patient_id', patientId)
          .gte('administered_at', bounds.sinceIso)
          .lt('administered_at', bounds.untilIso)
        if (error) throw error
        return (data ?? []) as { fluid_volume_ml: number }[]
      })()
  return { volumeTotalMl: sum(records.map(record => record.fluid_volume_ml)), recordCount: records.length }
}

async function loadEndocrine(patientId: string, bounds: PetVetReportBounds): Promise<PetVetReportModel['endocrine']> {
  const [insulinRecords, glucoseRecords] = isDemoMode()
    ? [readDemoPetInsulinRecords(patientId, bounds.sinceIso, bounds.untilIso), readDemoPetGlucoseRecords(patientId, bounds.sinceIso, bounds.untilIso)]
    : await Promise.all([
        (async () => {
          const { data, error } = await supabase.from('pet_insulin_records')
            .select('insulin_units')
            .eq('patient_id', patientId)
            .gte('administered_at', bounds.sinceIso)
            .lt('administered_at', bounds.untilIso)
          if (error) throw error
          return (data ?? []) as { insulin_units: number }[]
        })(),
        (async () => {
          const { data, error } = await supabase.from('pet_blood_glucose_records')
            .select('glucose_mg_dl')
            .eq('patient_id', patientId)
            .gte('measured_at', bounds.sinceIso)
            .lt('measured_at', bounds.untilIso)
          if (error) throw error
          return (data ?? []) as { glucose_mg_dl: number }[]
        })(),
      ])
  return {
    insulinTotalUnits: sum(insulinRecords.map(record => record.insulin_units)),
    insulinRecordCount: insulinRecords.length,
    glucoseAvgMgDl: average(glucoseRecords.map(record => record.glucose_mg_dl)),
    glucoseRecordCount: glucoseRecords.length,
  }
}

// 「上次回診／抽血」沒有獨立資料表；借用照護時間軸裡最近一筆「看診／健康處置」事件當代理指標，
// 且不限於報告期間內——照護者更想知道「距離上次回診多久」，而不是只在選取區間才找得到。
async function loadLastHealthVisit(patientId: string): Promise<PetVetReportModel['lastHealthVisit']> {
  if (isDemoMode() || isDemoPatientId(patientId)) {
    const fallback = getFallbackDemoCareTimeline()
      .filter((entry: CareTimelineEntry) => entry.patient_id === patientId && entry.event_type === 'health_visit')
      .sort((left, right) => dayjs(right.occurred_at).valueOf() - dayjs(left.occurred_at).valueOf())
    return fallback[0] ? { occurredAt: fallback[0].occurred_at, title: fallback[0].title } : null
  }
  const { data, error } = await supabase.from('care_timeline_entries')
    .select('occurred_at, title')
    .eq('patient_id', patientId)
    .eq('event_type', 'health_visit')
    .order('occurred_at', { ascending: false })
    .limit(1)
  if (error) throw error
  const latest = (data ?? [])[0] as { occurred_at: string; title: string } | undefined
  return latest ? { occurredAt: latest.occurred_at, title: latest.title } : null
}

export async function loadPetVetReportModel(patientId: string, days: number): Promise<PetVetReportModel> {
  const bounds = petVetReportBounds(days)
  const [weight, appetite, liquid, digestion, fluidTherapy, endocrine, lastHealthVisit] = await Promise.all([
    loadWeight(patientId, bounds),
    loadAppetite(patientId, bounds),
    loadLiquid(patientId, bounds),
    loadDigestion(patientId, bounds),
    loadFluidTherapy(patientId, bounds),
    loadEndocrine(patientId, bounds),
    loadLastHealthVisit(patientId),
  ])
  return { bounds, weight, appetite, liquid, digestion, fluidTherapy, endocrine, lastHealthVisit }
}
