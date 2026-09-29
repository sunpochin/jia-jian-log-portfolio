/*
檔案用途：唯讀分享摘要 `daily-summary-v2` 在接收端的 DTO 型別與逐鍵驗證——把 share-summary 回來的 JSON 變成前端可信的形狀，
  任何缺鍵、型別不符、未知等級或事件型別都視為「連結無效」，不讓 undefined 進畫面。
所在層：src/lib 資料轉接層；只服務 ShareSummaryPage。與 supabase/functions/share-summary/shareSummaryV2.ts 的 DTO 同形，
  但前端與 Deno Edge Function 是兩個建置環境，這裡刻意重新宣告而不是跨環境 import。
主要關聯：src/lib/shareSummaryClient.ts（依 scopeVersion 分派到這裡）、src/lib/shareSummaryV2Presentation.ts、
  src/features/care-family/components/shareSummaryV2/*、docs/product/share-summary-v2-design.md §4.1、tests/unit/shareSummaryV2Dto.test.ts。
*/
import type { AlertLevel, BpCustomBounds } from '../types/database'
import type { Session } from './session'
import type { LocalizedText } from './i18n'

export const SHARE_SUMMARY_V2_SCOPE = 'daily-summary-v2' as const

export type ShareSummaryV2Reading = {
  measuredAt: string
  systolic: number
  diastolic: number
  pulse: number | null
  session: Session
  level: AlertLevel
  // 命中的全部規則 key；畫面要每一條都顯示，不得只取第一條（ADR-009 不變量 2）。
  ruleKeys: string[]
  pulseWarning: boolean
  standardIndex: number
}

export type ShareSummaryV2StandardUsed = {
  templateKey: string
  customBounds: BpCustomBounds | null
  effectiveFrom: string | null
  effectiveTo: string | null
  configured: boolean
}

export type ShareSummaryV2Summary = {
  recordCount: number
  daysWithRecords: number
  daysWithMorning: number
  daysWithEvening: number
  avgSystolic: number | null
  avgDiastolic: number | null
  avgPulse: number | null
  morningAvg: { systolic: number; diastolic: number } | null
  eveningAvg: { systolic: number; diastolic: number } | null
  nightLowCount: number
  levelCounts: Record<AlertLevel, number>
}

export type ShareSummaryV2Medication = {
  displayName: { brand: string; brandZh: string | null; brandId: string | null; generic: string }
  strengthLabel: string | null
  strengthMg: number | null
  dosageForm: string
  scheduleSlot: string
  asNeeded: boolean
  doseAmount: number
  doseCount: number
  appearance: { color: string | null; shape: string | null }
  verificationStatus: 'official' | 'manually_verified' | 'unverified'
  tfdaLicenseNumber: string | null
  instructionCodes: string[]
}

export type ShareSummaryV2Event = {
  occurredAt: string
  eventType: 'health_visit' | 'medication_change'
  visitKind: string | null
  visitDepartment: string | null
  medicationChange: { action: 'upsert' | 'deactivate'; medicationDisplayName: string } | null
}

export type PatientShareSummaryV2Dto = {
  scopeVersion: typeof SHARE_SUMMARY_V2_SCOPE
  patientAlias: LocalizedText
  timezone: string
  generatedAt: string
  bloodPressure: {
    window: { start: string; end: string; careDays: number }
    readings: ShareSummaryV2Reading[]
    truncated: boolean
    summary: ShareSummaryV2Summary
    standardsUsed: ShareSummaryV2StandardUsed[]
  }
  medications: { asOf: string; items: ShareSummaryV2Medication[] }
  recentEvents: { window: { start: string; end: string; days: number }; items: ShareSummaryV2Event[]; truncated: boolean }
  openConcerns: { openQuestionCount: number }
}

const ALERT_LEVELS: readonly AlertLevel[] = ['normal', 'warning', 'danger', 'warning-low', 'danger-low', 'off-target', 'below-target']
const SESSIONS: readonly Session[] = ['pagi', 'siang', 'malam1', 'malam2', 'malam3']
const VERIFICATION_STATUSES = ['official', 'manually_verified', 'unverified'] as const

class ShareSummaryV2ParseError extends Error {
  constructor(path: string) {
    super(`share summary v2 field is invalid: ${path}`)
    this.name = 'ShareSummaryV2ParseError'
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)
const isIso = (value: unknown): value is string => typeof value === 'string' && !Number.isNaN(Date.parse(value))
const isNum = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)
const isInt = (value: unknown): value is number => Number.isInteger(value)

function need<T>(ok: boolean, value: unknown, path: string): T {
  if (!ok) throw new ShareSummaryV2ParseError(path)
  return value as T
}

const str = (value: unknown, path: string) => need<string>(typeof value === 'string', value, path)
const nullableStr = (value: unknown, path: string) => need<string | null>(value === null || typeof value === 'string', value, path)
const nullableNum = (value: unknown, path: string) => need<number | null>(value === null || isNum(value), value, path)
const bool = (value: unknown, path: string) => need<boolean>(typeof value === 'boolean', value, path)
const count = (value: unknown, path: string) => need<number>(isInt(value) && (value as number) >= 0, value, path)
const record = (value: unknown, path: string) => need<Record<string, unknown>>(isRecord(value), value, path)
const list = (value: unknown, path: string) => need<unknown[]>(Array.isArray(value), value, path)
const oneOf = <T extends string>(options: readonly T[], value: unknown, path: string) => need<T>(options.includes(value as T), value, path)

function parseLocalized(value: unknown, path: string): LocalizedText {
  const raw = record(value, path)
  return { zh: str(raw.zh, `${path}.zh`), id: str(raw.id, `${path}.id`), en: str(raw.en, `${path}.en`) }
}

function parsePair(value: unknown, path: string): { systolic: number; diastolic: number } | null {
  if (value === null) return null
  const raw = record(value, path)
  return { systolic: need<number>(isNum(raw.systolic), raw.systolic, `${path}.systolic`), diastolic: need<number>(isNum(raw.diastolic), raw.diastolic, `${path}.diastolic`) }
}

function parseReading(value: unknown, path: string, standardsCount: number): ShareSummaryV2Reading {
  const raw = record(value, path)
  const standardIndex = count(raw.standardIndex, `${path}.standardIndex`)
  // standardIndex 一定要指到 standardsUsed 裡存在的一份，否則畫面上「判讀依據」會變成空白——那正是 R5 要防的。
  need(standardIndex < standardsCount, standardIndex, `${path}.standardIndex`)
  return {
    measuredAt: need<string>(isIso(raw.measuredAt), raw.measuredAt, `${path}.measuredAt`),
    systolic: need<number>(isInt(raw.systolic), raw.systolic, `${path}.systolic`),
    diastolic: need<number>(isInt(raw.diastolic), raw.diastolic, `${path}.diastolic`),
    pulse: need<number | null>(raw.pulse === null || isInt(raw.pulse), raw.pulse, `${path}.pulse`),
    session: oneOf(SESSIONS, raw.session, `${path}.session`),
    level: oneOf(ALERT_LEVELS, raw.level, `${path}.level`),
    ruleKeys: list(raw.ruleKeys, `${path}.ruleKeys`).map((key, index) => str(key, `${path}.ruleKeys[${index}]`)),
    pulseWarning: bool(raw.pulseWarning, `${path}.pulseWarning`),
    standardIndex,
  }
}

function parseStandardUsed(value: unknown, path: string): ShareSummaryV2StandardUsed {
  const raw = record(value, path)
  let customBounds: BpCustomBounds | null = null
  if (raw.customBounds !== null) {
    const bounds = record(raw.customBounds, `${path}.customBounds`)
    customBounds = {
      systolicMin: need<number>(isInt(bounds.systolicMin), bounds.systolicMin, `${path}.customBounds.systolicMin`),
      systolicMax: need<number>(isInt(bounds.systolicMax), bounds.systolicMax, `${path}.customBounds.systolicMax`),
      diastolicMin: need<number>(isInt(bounds.diastolicMin), bounds.diastolicMin, `${path}.customBounds.diastolicMin`),
      diastolicMax: need<number>(isInt(bounds.diastolicMax), bounds.diastolicMax, `${path}.customBounds.diastolicMax`),
    }
  }
  return {
    templateKey: str(raw.templateKey, `${path}.templateKey`),
    customBounds,
    effectiveFrom: need<string | null>(raw.effectiveFrom === null || isIso(raw.effectiveFrom), raw.effectiveFrom, `${path}.effectiveFrom`),
    effectiveTo: need<string | null>(raw.effectiveTo === null || isIso(raw.effectiveTo), raw.effectiveTo, `${path}.effectiveTo`),
    configured: bool(raw.configured, `${path}.configured`),
  }
}

function parseSummary(value: unknown, path: string): ShareSummaryV2Summary {
  const raw = record(value, path)
  const levelCountsRaw = record(raw.levelCounts, `${path}.levelCounts`)
  const levelCounts = Object.fromEntries(ALERT_LEVELS.map(level => [level, count(levelCountsRaw[level], `${path}.levelCounts.${level}`)])) as Record<AlertLevel, number>
  return {
    recordCount: count(raw.recordCount, `${path}.recordCount`),
    daysWithRecords: count(raw.daysWithRecords, `${path}.daysWithRecords`),
    daysWithMorning: count(raw.daysWithMorning, `${path}.daysWithMorning`),
    daysWithEvening: count(raw.daysWithEvening, `${path}.daysWithEvening`),
    avgSystolic: nullableNum(raw.avgSystolic, `${path}.avgSystolic`),
    avgDiastolic: nullableNum(raw.avgDiastolic, `${path}.avgDiastolic`),
    avgPulse: nullableNum(raw.avgPulse, `${path}.avgPulse`),
    morningAvg: parsePair(raw.morningAvg, `${path}.morningAvg`),
    eveningAvg: parsePair(raw.eveningAvg, `${path}.eveningAvg`),
    nightLowCount: count(raw.nightLowCount, `${path}.nightLowCount`),
    levelCounts,
  }
}

function parseMedication(value: unknown, path: string): ShareSummaryV2Medication {
  const raw = record(value, path)
  const name = record(raw.displayName, `${path}.displayName`)
  const appearance = record(raw.appearance, `${path}.appearance`)
  return {
    displayName: {
      brand: str(name.brand, `${path}.displayName.brand`),
      brandZh: nullableStr(name.brandZh, `${path}.displayName.brandZh`),
      brandId: nullableStr(name.brandId, `${path}.displayName.brandId`),
      generic: str(name.generic, `${path}.displayName.generic`),
    },
    strengthLabel: nullableStr(raw.strengthLabel, `${path}.strengthLabel`),
    strengthMg: nullableNum(raw.strengthMg, `${path}.strengthMg`),
    dosageForm: str(raw.dosageForm, `${path}.dosageForm`),
    scheduleSlot: str(raw.scheduleSlot, `${path}.scheduleSlot`),
    asNeeded: bool(raw.asNeeded, `${path}.asNeeded`),
    doseAmount: need<number>(isNum(raw.doseAmount), raw.doseAmount, `${path}.doseAmount`),
    doseCount: count(raw.doseCount, `${path}.doseCount`),
    appearance: { color: nullableStr(appearance.color, `${path}.appearance.color`), shape: nullableStr(appearance.shape, `${path}.appearance.shape`) },
    verificationStatus: oneOf(VERIFICATION_STATUSES, raw.verificationStatus, `${path}.verificationStatus`),
    tfdaLicenseNumber: nullableStr(raw.tfdaLicenseNumber, `${path}.tfdaLicenseNumber`),
    instructionCodes: list(raw.instructionCodes, `${path}.instructionCodes`).map((code, index) => str(code, `${path}.instructionCodes[${index}]`)),
  }
}

function parseEvent(value: unknown, path: string): ShareSummaryV2Event {
  const raw = record(value, path)
  const eventType = oneOf(['health_visit', 'medication_change'] as const, raw.eventType, `${path}.eventType`)
  let medicationChange: ShareSummaryV2Event['medicationChange'] = null
  if (raw.medicationChange !== null) {
    const change = record(raw.medicationChange, `${path}.medicationChange`)
    medicationChange = {
      action: oneOf(['upsert', 'deactivate'] as const, change.action, `${path}.medicationChange.action`),
      medicationDisplayName: str(change.medicationDisplayName, `${path}.medicationChange.medicationDisplayName`),
    }
  }
  // 兩型的欄位互斥：就診沒有調藥資料、調藥沒有科別；混在一起代表伺服器契約錯開。
  need(eventType === 'medication_change' ? medicationChange !== null : medicationChange === null, raw, `${path}.medicationChange`)
  return {
    occurredAt: need<string>(isIso(raw.occurredAt), raw.occurredAt, `${path}.occurredAt`),
    eventType,
    visitKind: nullableStr(raw.visitKind, `${path}.visitKind`),
    visitDepartment: nullableStr(raw.visitDepartment, `${path}.visitDepartment`),
    medicationChange,
  }
}

/**
 * 逐鍵驗證 v2 摘要。呼叫端已確認 `summary.scopeVersion === 'daily-summary-v2'`。
 * 為什麼每個鍵都要驗：這支頁面沒有帳號保護，回應畸形時必須收斂成「連結無效」，不能讓半份摘要進畫面。
 */
export function parseShareSummaryV2(summary: Record<string, unknown>): PatientShareSummaryV2Dto {
  need(summary.scopeVersion === SHARE_SUMMARY_V2_SCOPE, summary.scopeVersion, 'scopeVersion')
  const bp = record(summary.bloodPressure, 'bloodPressure')
  const bpWindow = record(bp.window, 'bloodPressure.window')
  const standardsUsed = list(bp.standardsUsed, 'bloodPressure.standardsUsed').map((item, index) => parseStandardUsed(item, `bloodPressure.standardsUsed[${index}]`))
  const medications = record(summary.medications, 'medications')
  const events = record(summary.recentEvents, 'recentEvents')
  const eventsWindow = record(events.window, 'recentEvents.window')
  const concerns = record(summary.openConcerns, 'openConcerns')
  return {
    scopeVersion: SHARE_SUMMARY_V2_SCOPE,
    patientAlias: parseLocalized(summary.patientAlias, 'patientAlias'),
    timezone: str(summary.timezone, 'timezone'),
    generatedAt: need<string>(isIso(summary.generatedAt), summary.generatedAt, 'generatedAt'),
    bloodPressure: {
      window: { start: need(isIso(bpWindow.start), bpWindow.start, 'bloodPressure.window.start'), end: need(isIso(bpWindow.end), bpWindow.end, 'bloodPressure.window.end'), careDays: count(bpWindow.careDays, 'bloodPressure.window.careDays') },
      readings: list(bp.readings, 'bloodPressure.readings').map((item, index) => parseReading(item, `bloodPressure.readings[${index}]`, standardsUsed.length)),
      truncated: bool(bp.truncated, 'bloodPressure.truncated'),
      summary: parseSummary(bp.summary, 'bloodPressure.summary'),
      standardsUsed,
    },
    medications: {
      asOf: need(isIso(medications.asOf), medications.asOf, 'medications.asOf'),
      items: list(medications.items, 'medications.items').map((item, index) => parseMedication(item, `medications.items[${index}]`)),
    },
    recentEvents: {
      window: { start: need(isIso(eventsWindow.start), eventsWindow.start, 'recentEvents.window.start'), end: need(isIso(eventsWindow.end), eventsWindow.end, 'recentEvents.window.end'), days: count(eventsWindow.days, 'recentEvents.window.days') },
      items: list(events.items, 'recentEvents.items').map((item, index) => parseEvent(item, `recentEvents.items[${index}]`)),
      truncated: bool(events.truncated, 'recentEvents.truncated'),
    },
    openConcerns: { openQuestionCount: count(concerns.openQuestionCount, 'openConcerns.openQuestionCount') },
  }
}
