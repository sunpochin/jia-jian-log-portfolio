/*
檔案用途：呈現寵物慢性病五個模組的歷史趨勢與可讀數字表格。
所在層：src/features/pet-care/components；由各寵物輸入頁透過 lazy 趨勢區塊掛載。
主要關聯：ModuleTrendSection、DailyTrendChart、petTrendSeries、Supabase 六張寵物紀錄表與 demoStorage。

為什麼共用一個面板：五個模組的查詢欄位不同，但都只需要「病人級日期範圍 → 每日序列 → 共用圖表」；
集中在這裡可讓每個輸入頁只負責自己的今天表單，避免五份歷史查詢和空白日規則逐漸分歧。
*/
import { useEffect, useState } from 'react'
import dayjs from 'dayjs'
import timezone from 'dayjs/plugin/timezone'
import utc from 'dayjs/plugin/utc'
import { DailyTrendChart } from '../../../components/daily-care/DailyTrendChart'
import { common, useI18n, type LocalizedText } from '../../../lib/i18n'
import {
  isDemoMode,
  readDemoPetAppetiteRecords,
  readDemoPetDigestionRecords,
  readDemoPetFluidRecords,
  readDemoPetGlucoseRecords,
  readDemoPetInsulinRecords,
  readDemoPetLiquidIntakeRecords,
} from '../../../lib/demoStorage'
import { dailyPetAverages, dailyPetDateValues, dailyPetTotals } from '../../../lib/petTrendSeries'
import { supabase } from '../../../lib/supabase'
import { TZ } from '../../../lib/timezone'
import type { TrendPoint } from '../../../lib/trendSeries'

dayjs.extend(utc)
dayjs.extend(timezone)

export type PetTrendKind = 'liquid' | 'digestion' | 'appetite' | 'fluid' | 'endocrine'

interface PetTrendSeries {
  id: string
  label: LocalizedText
  // 雙語介面規範：連度量單位都要跟著語系換；ml/%/mg/dL 中印尼文寫法相同，但「次」「顆」「分」「單位」不是。
  unit: LocalizedText
  color: string
  points: TrendPoint[]
  valueFormatter?: (value: number) => string
}

interface TrendBounds {
  now: dayjs.Dayjs
  sinceDate: string
  untilDate: string
  sinceIso: string
  untilIso: string
}

type TrendValue = number | string | null
type LiquidTrendRow = { recorded_date: string; water_intake_ml: TrendValue; urination_count: TrendValue; litter_box_urine_clumps: TrendValue }
type DigestionTrendRow = { recorded_date: string; defecation_count: TrendValue; stool_score: TrendValue; vomiting_count: TrendValue }
type AppetiteTrendRow = { recorded_at: string; appetite_percent: TrendValue }
type FluidTrendRow = { administered_at: string; fluid_volume_ml: TrendValue }
type InsulinTrendRow = { administered_at: string; insulin_units: TrendValue }
type GlucoseTrendRow = { measured_at: string; glucose_mg_dl: TrendValue }

const EMPTY_SERIES_LABEL: LocalizedText = {
  id: 'Belum ada catatan untuk indikator ini dalam rentang yang dipilih.',
  zh: '這個區間還沒有這個指標的紀錄。', en: "No recordan for indikator this in rentang selected.",
}

const TREND_EMPTY_LABEL: Record<PetTrendKind, LocalizedText> = {
  liquid: { id: 'Belum ada catatan asupan cairan dalam rentang ini.', zh: '這個區間還沒有液體管理紀錄。' ,en: "No recordan fluid intake in rentang this." },
  digestion: { id: 'Belum ada catatan pencernaan dalam rentang ini.', zh: '這個區間還沒有消化健康紀錄。' ,en: "No recordan pencernaan in rentang this." },
  appetite: { id: 'Belum ada catatan nafsu makan dalam rentang ini.', zh: '這個區間還沒有食慾紀錄。' ,en: "No recordan nafsu makan in rentang this." },
  fluid: { id: 'Belum ada catatan terapi cairan dalam rentang ini.', zh: '這個區間還沒有皮下點滴紀錄。' ,en: "No recordan terapi fluid in rentang this." },
  endocrine: { id: 'Belum ada catatan endokrin dalam rentang ini.', zh: '這個區間還沒有內分泌紀錄。' ,en: "No recordan endokrin in rentang this." },
}

const TREND_SUMMARY: Record<PetTrendKind, LocalizedText> = {
  liquid: { id: 'Hari tanpa catatan dibiarkan kosong, bukan dihitung nol.', zh: '沒有紀錄的日子留白，不會當成 0。' ,en: "Day without recordan dibiarkan empty, bukan dihthatng nol." },
  digestion: { id: 'Hari tanpa catatan dibiarkan kosong, bukan dihitung nol.', zh: '沒有紀錄的日子留白，不會當成 0。' ,en: "Day without recordan dibiarkan empty, bukan dihthatng nol." },
  appetite: { id: 'Persentase adalah rata-rata catatan makan pada hari itu; hari tanpa catatan dibiarkan kosong.', zh: '進食比例是當日已記錄餐次的平均；沒有紀錄的日子留白。' ,en: "Persentase adalah rata-rata recordan makan on days that; days without recordan dibiarkan empty." },
  fluid: { id: 'Volume adalah total cairan subkutan yang tercatat pada hari itu; hari tanpa catatan dibiarkan kosong.', zh: '液體體積是當日已記錄的皮下點滴總量；沒有紀錄的日子留白。' ,en: "Volume adalah total fluid subkutan that recorded on days that; days without recordan dibiarkan empty." },
  endocrine: { id: 'Insulin adalah total harian; gula darah adalah rata-rata harian. Hari tanpa catatan dibiarkan kosong.', zh: '胰島素是每日總量；血糖是每日平均。沒有紀錄的日子留白。' ,en: "Insulin adalah total daily; gula blood adalah rata-rata daily. Day without recordan dibiarkan empty." },
}

function trendBounds(days: number): TrendBounds {
  const now = dayjs().tz(TZ)
  const start = now.startOf('day').subtract(Math.max(1, days) - 1, 'day')
  // 使用下一天 00:00 作半開區間右界，避免 23:59:59.999 的紀錄因浮點精度被漏掉。
  const until = now.startOf('day').add(1, 'day')
  return {
    now,
    sinceDate: start.format('YYYY-MM-DD'),
    untilDate: now.format('YYYY-MM-DD'),
    sinceIso: start.toISOString(),
    untilIso: until.toISOString(),
  }
}

// 度量單位中印尼文寫法相同的直接共用同一個值；「次」「顆」「分」「單位」中印尼文不同，各自明確列出。
const UNIT_ML: LocalizedText = { id: 'ml', zh: 'ml' ,en: "ml" }
const UNIT_PERCENT: LocalizedText = { id: '%', zh: '%' ,en: "%" }
const UNIT_MG_DL: LocalizedText = { id: 'mg/dL', zh: 'mg/dL' ,en: "mg/dL" }
const UNIT_TIMES: LocalizedText = { id: 'kali', zh: '次' ,en: "kali" }
const UNIT_CLUMPS: LocalizedText = { id: 'gumpalan', zh: '顆' ,en: "gumpalan" }
const UNIT_SCORE: LocalizedText = { id: 'skor', zh: '分' ,en: "skor" }
const UNIT_INSULIN: LocalizedText = { id: 'unit', zh: '單位' ,en: "unit" }

function wholeNumber(value: number): string {
  return String(Math.round(value))
}

function oneDecimal(value: number): string {
  return value.toFixed(1)
}

function dateSeries(id: string, label: LocalizedText, points: TrendPoint[], unit: LocalizedText, color: string, valueFormatter = wholeNumber): PetTrendSeries {
  return { id, label, points, unit, color, valueFormatter }
}

function timedSeries(id: string, label: LocalizedText, records: { at: string; value: number | string | null }[], aggregate: 'average' | 'total', days: number, now: dayjs.Dayjs, unit: LocalizedText, color: string, valueFormatter = wholeNumber): PetTrendSeries {
  const points = aggregate === 'average' ? dailyPetAverages(records, days, now) : dailyPetTotals(records, days, now)
  return dateSeries(id, label, points, unit, color, valueFormatter)
}

function buildLiquidSeries(records: LiquidTrendRow[], days: number, now: dayjs.Dayjs): PetTrendSeries[] {
  return [
    dateSeries('water', { id: 'Asupan air harian', zh: '每日飲水量' ,en: "Asupan water daily" }, dailyPetDateValues(records.map(record => ({ date: record.recorded_date, value: record.water_intake_ml })), days, now), UNIT_ML, '#2563EB'),
    dateSeries('urination', { id: 'Buang air kecil per hari', zh: '每日排尿次數' ,en: "Buang water tocil per days" }, dailyPetDateValues(records.map(record => ({ date: record.recorded_date, value: record.urination_count })), days, now), UNIT_TIMES, '#0F766E'),
    dateSeries('urine-clumps', { id: 'Gumpalan urin per hari', zh: '每日尿塊數' ,en: "Gumpalan urin per days" }, dailyPetDateValues(records.map(record => ({ date: record.recorded_date, value: record.litter_box_urine_clumps })), days, now), UNIT_CLUMPS, '#7C3AED'),
  ]
}

function buildDigestionSeries(records: DigestionTrendRow[], days: number, now: dayjs.Dayjs): PetTrendSeries[] {
  return [
    dateSeries('defecation', { id: 'Buang air besar per hari', zh: '每日排便次數' ,en: "Buang water besar per days" }, dailyPetDateValues(records.map(record => ({ date: record.recorded_date, value: record.defecation_count })), days, now), UNIT_TIMES, '#047857'),
    dateSeries('stool-score', { id: 'Skor feses harian', zh: '每日糞便評分' ,en: "Skor feses daily" }, dailyPetDateValues(records.map(record => ({ date: record.recorded_date, value: record.stool_score })), days, now), UNIT_SCORE, '#B45309', wholeNumber),
    dateSeries('vomiting', { id: 'Muntah per hari', zh: '每日嘔吐次數' ,en: "Muntah per days" }, dailyPetDateValues(records.map(record => ({ date: record.recorded_date, value: record.vomiting_count })), days, now), UNIT_TIMES, '#BE123C'),
  ]
}

function buildAppetiteSeries(records: AppetiteTrendRow[], days: number, now: dayjs.Dayjs): PetTrendSeries[] {
  return [timedSeries('appetite', { id: 'Rata-rata nafsu makan harian', zh: '每日平均進食比例' ,en: "Rata-rata nafsu makan daily" }, records.map(record => ({ at: record.recorded_at, value: record.appetite_percent })), 'average', days, now, UNIT_PERCENT, '#4F46E5')]
}

function buildFluidSeries(records: FluidTrendRow[], days: number, now: dayjs.Dayjs): PetTrendSeries[] {
  return [timedSeries('fluid-volume', { id: 'Total cairan subkutan harian', zh: '每日皮下點滴總量' ,en: "Total fluid subkutan daily" }, records.map(record => ({ at: record.administered_at, value: record.fluid_volume_ml })), 'total', days, now, UNIT_ML, '#0891B2', oneDecimal)]
}

function buildEndocrineSeries(insulin: InsulinTrendRow[], glucose: GlucoseTrendRow[], days: number, now: dayjs.Dayjs): PetTrendSeries[] {
  return [
    timedSeries('insulin', { id: 'Total insulin harian', zh: '每日胰島素總量' ,en: "Total insulin daily" }, insulin.map(record => ({ at: record.administered_at, value: record.insulin_units })), 'total', days, now, UNIT_INSULIN, '#7C3AED', oneDecimal),
    timedSeries('glucose', { id: 'Rata-rata gula darah harian', zh: '每日平均血糖' ,en: "Rata-rata gula blood daily" }, glucose.map(record => ({ at: record.measured_at, value: record.glucose_mg_dl })), 'average', days, now, UNIT_MG_DL, '#DB2777'),
  ]
}

function readQueryError(error: unknown): Error {
  return error instanceof Error ? error : new Error('Pet trend query failed')
}

async function loadPetTrendSeries(kind: PetTrendKind, patientId: string, days: number, bounds: TrendBounds): Promise<PetTrendSeries[]> {
  if (isDemoMode()) {
    if (kind === 'liquid') {
      const records = readDemoPetLiquidIntakeRecords(patientId, bounds.sinceDate, bounds.untilDate)
      return buildLiquidSeries(records, days, bounds.now)
    }
    if (kind === 'digestion') {
      const records = readDemoPetDigestionRecords(patientId, bounds.sinceDate, bounds.untilDate)
      return buildDigestionSeries(records, days, bounds.now)
    }
    if (kind === 'appetite') {
      const records = readDemoPetAppetiteRecords(patientId, bounds.sinceIso, bounds.untilIso)
      return buildAppetiteSeries(records, days, bounds.now)
    }
    if (kind === 'fluid') {
      const records = readDemoPetFluidRecords(patientId, bounds.sinceIso, bounds.untilIso)
      return buildFluidSeries(records, days, bounds.now)
    }
    const [insulin, glucose] = [
      readDemoPetInsulinRecords(patientId, bounds.sinceIso, bounds.untilIso),
      readDemoPetGlucoseRecords(patientId, bounds.sinceIso, bounds.untilIso),
    ]
    return buildEndocrineSeries(insulin, glucose, days, bounds.now)
  }

  if (kind === 'liquid') {
    const { data, error } = await supabase.from('pet_liquid_intake_records')
      .select('recorded_date, water_intake_ml, urination_count, litter_box_urine_clumps')
      .eq('patient_id', patientId)
      .gte('recorded_date', bounds.sinceDate)
      .lte('recorded_date', bounds.untilDate)
    if (error) throw readQueryError(error)
    const records = (data ?? []) as LiquidTrendRow[]
    return buildLiquidSeries(records, days, bounds.now)
  }
  if (kind === 'digestion') {
    const { data, error } = await supabase.from('pet_digestion_records')
      .select('recorded_date, defecation_count, stool_score, vomiting_count')
      .eq('patient_id', patientId)
      .gte('recorded_date', bounds.sinceDate)
      .lte('recorded_date', bounds.untilDate)
    if (error) throw readQueryError(error)
    const records = (data ?? []) as DigestionTrendRow[]
    return buildDigestionSeries(records, days, bounds.now)
  }
  if (kind === 'appetite') {
    const { data, error } = await supabase.from('pet_appetite_records')
      .select('recorded_at, appetite_percent')
      .eq('patient_id', patientId)
      .gte('recorded_at', bounds.sinceIso)
      .lt('recorded_at', bounds.untilIso)
    if (error) throw readQueryError(error)
    return buildAppetiteSeries((data ?? []) as AppetiteTrendRow[], days, bounds.now)
  }
  if (kind === 'fluid') {
    const { data, error } = await supabase.from('pet_subcutaneous_fluid_records')
      .select('administered_at, fluid_volume_ml')
      .eq('patient_id', patientId)
      .gte('administered_at', bounds.sinceIso)
      .lt('administered_at', bounds.untilIso)
    if (error) throw readQueryError(error)
    return buildFluidSeries((data ?? []) as FluidTrendRow[], days, bounds.now)
  }

  const [insulinResult, glucoseResult] = await Promise.all([
    supabase.from('pet_insulin_records')
      .select('administered_at, insulin_units')
      .eq('patient_id', patientId)
      .gte('administered_at', bounds.sinceIso)
      .lt('administered_at', bounds.untilIso),
    supabase.from('pet_blood_glucose_records')
      .select('measured_at, glucose_mg_dl')
      .eq('patient_id', patientId)
      .gte('measured_at', bounds.sinceIso)
      .lt('measured_at', bounds.untilIso),
  ])
  if (insulinResult.error) throw readQueryError(insulinResult.error)
  if (glucoseResult.error) throw readQueryError(glucoseResult.error)
  return buildEndocrineSeries(
    (insulinResult.data ?? []) as InsulinTrendRow[],
    (glucoseResult.data ?? []) as GlucoseTrendRow[],
    days,
    bounds.now,
  )
}

export function PetTrendPanel({ kind, patientId, days, refreshKey = '' }: { kind: PetTrendKind; patientId: string; days: number; refreshKey?: string }) {
  const { text } = useI18n()
  const [series, setSeries] = useState<PetTrendSeries[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [retryKey, setRetryKey] = useState(0)

  useEffect(() => {
    let cancelled = false
    setSeries(null)
    setFailed(false)
    const bounds = trendBounds(days)
    void loadPetTrendSeries(kind, patientId, days, bounds)
      .then(nextSeries => { if (!cancelled) setSeries(nextSeries) })
      .catch(error => {
        console.error('[pet trend read error]', error)
        if (!cancelled) setFailed(true)
      })
    return () => { cancelled = true }
  }, [days, kind, patientId, refreshKey, retryKey])

  if (failed) return (
    <div>
      <p role="alert" className="text-sm font-semibold text-red-700">{text({ id: 'Tren hewan tidak dapat dimuat.', zh: '目前無法讀取寵物趨勢。' ,en: "Tren animal not could be loaded." })}</p>
      <button type="button" onClick={() => setRetryKey(value => value + 1)} className="mt-3 min-h-11 rounded-xl border border-red-200 bg-white px-4 text-sm font-bold text-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500">
        {text({ id: 'Coba lagi', zh: '重新載入' ,en: "Try again" })}
      </button>
    </div>
  )
  if (!series) return <p role="status" className="text-sm text-slate-500">{text(common.loading)}</p>
  if (!series.some(item => item.points.some(point => point.value != null))) return <p className="text-sm text-slate-500">{text(TREND_EMPTY_LABEL[kind])}</p>

  return (
    <div className="space-y-3">
      <p className="text-xs leading-5 text-slate-500">{text(TREND_SUMMARY[kind])}</p>
      {series.map(item => (
        <section key={item.id} className="rounded-2xl border border-slate-100 bg-slate-50/60 p-3">
          <h3 className="text-sm font-bold text-slate-800">{text(item.label)}</h3>
          <div className="mt-2">
            <DailyTrendChart
              points={item.points}
              color={item.color}
              unit={item.unit}
              seriesLabel={item.label}
              emptyLabel={EMPTY_SERIES_LABEL}
              valueFormatter={item.valueFormatter}
            />
          </div>
        </section>
      ))}
    </div>
  )
}
