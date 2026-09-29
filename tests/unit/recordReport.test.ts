/*
檔案用途：驗證血壓報表的照護日分組、CSV 匯出與 GPT 摘要資料格式。
所在層：tests/unit 單元測試層；使用固定量測時間避免時區測試漂移。
主要關聯：對應 src/lib/recordReport.ts、src/lib/dashboardStats.ts 與 src/lib/careDay.ts。
*/
import { describe, expect, test } from 'bun:test'
import dayjs from 'dayjs'
import { buildGptReportText, buildRecordCsv, buildRecordReportModel } from '../../src/lib/recordReport'
import { GENERAL_ADULT_RESOLVER } from '../../src/lib/bpStandards'
import type { BpRecord, MedicationCatalog } from '../../src/types/database'
import type { DueReminderTrajectoryEvent, MedicationChangeTrajectoryEvent, TimelineTrajectoryEvent } from '../../src/lib/medicalTrajectory'
import type { PreVisitBriefItem } from '../../src/lib/preVisitBrief'

function record(id: string, overrides: Partial<BpRecord>): BpRecord {
  return {
    id,
    systolic: 110,
    diastolic: 70,
    pulse: 70,
    measured_at: '2026-07-14T00:00:00.000Z',
    source: 'manual_web',
    subject: 'nenek',
    recorded_by: 'caregiver@example.com',
    created_at: '2026-07-14T00:01:00.000Z',
    ...overrides,
  }
}

describe('buildRecordReportModel', () => {
  test('sorts, groups by Taipei date, and keeps complete extreme readings', () => {
    const model = buildRecordReportModel([
      record('night-high', { systolic: 165, diastolic: 90, pulse: 88, measured_at: '2026-07-14T15:30:00.000Z' }),
      record('next-day-low', { systolic: 92, diastolic: 52, pulse: null, measured_at: '2026-07-14T16:30:00.000Z' }),
      record('morning', { systolic: 118, diastolic: 68, pulse: 121, measured_at: '2026-07-15T00:30:00.000Z' }),
    ], GENERAL_ADULT_RESOLVER)

    // UTC 午夜附近最容易跨錯日；報告固定台北時區才能讓醫師與照護者看到同一份分組。
    expect(model.dailyGroups.map(group => group.date)).toEqual(['2026-07-15', '2026-07-14'])
    expect(model.newestFirst.map(item => item.id)).toEqual(['morning', 'next-day-low', 'night-high'])
    expect(model.chronological.map(item => item.id)).toEqual(['night-high', 'next-day-low', 'morning'])
    expect(model.highestSystolic?.id).toBe('night-high')
    expect(model.lowestDiastolic?.id).toBe('next-day-low')
    expect(model.daysWithRecords).toBe(2)
    expect(model.flaggedCount).toBe(3)
    expect(model.missingPulseCount).toBe(1)
    expect(model.summary.alertCounts.warning).toBe(0)
    expect(model.summary.pulseWarningCount).toBe(1)
    expect(model.morningSummary.recordCount).toBe(1)
    expect(model.eveningSummary.recordCount).toBe(2)
  })

  test('returns safe empty values when the selected period has no records', () => {
    const model = buildRecordReportModel([], GENERAL_ADULT_RESOLVER)

    expect(model.startAt).toBeNull()
    expect(model.summary.recordCount).toBe(0)
    expect(model.dailyGroups).toEqual([])
    expect(model.systolicRange).toBeNull()
    expect(model.highestSystolic).toBeNull()
  })
})

describe('record exports', () => {
  const records = [
    record('later', { systolic: 140, diastolic: 85, pulse: null, measured_at: '2026-07-14T16:30:00.000Z', source: 'manual,"web"' }),
    record('earlier', { systolic: 110, diastolic: 70, pulse: 72, measured_at: '2026-07-14T15:30:00.000Z' }),
  ]

  test('builds UTF-8 CSV in chronological order with fixed timezone and escaping', () => {
    const csv = buildRecordCsv(records, 'meiling, "媽媽"', {
      selectedDays: 7,
      generatedAt: dayjs('2026-07-15T02:00:00+08:00'),
      standardResolver: GENERAL_ADULT_RESOLVER,
    })

    expect(csv.startsWith('\uFEFF')).toBe(true)
    expect(csv).toContain('"Asia/Taipei"')
    expect(csv).toContain('"meiling, ""媽媽"""')
    expect(csv).toContain('"manual,""web"""')
    expect(csv).toContain('"2026-07-08 04:00 to 2026-07-15 04:00"')
    expect(csv).toContain('"2026-07-14T15:30:00.000Z"')
    expect(csv.indexOf('2026-07-14 23:30:00')).toBeLessThan(csv.indexOf('2026-07-15 00:30:00'))
  })

  test('neutralizes spreadsheet formulas in user-controlled CSV cells', () => {
    const csv = buildRecordCsv(records, '=HYPERLINK("https://example.com")', {
      selectedDays: 7,
      generatedAt: dayjs('2026-07-15T02:00:00+08:00'),
      standardResolver: GENERAL_ADULT_RESOLVER,
    })

    // 使用者顯示名稱不能在 Excel 開檔時被當成公式執行。
    expect(csv).toContain('"\'=HYPERLINK(""https://example.com"")"')
  })

  test('builds a name-removed GPT packet with selected coverage, raw data, and non-diagnostic instructions', () => {
    const text = buildGptReportText(records, {
      selectedDays: 7,
      generatedAt: dayjs('2026-07-15T02:00:00+08:00'),
      isOfflineData: true,
      cacheUpdatedAt: '2026-07-14T01:02:03.000Z',
      standardResolver: GENERAL_ADULT_RESOLVER,
    })

    expect(text).toContain('Asia/Taipei (UTC+8)')
    expect(text).toContain('2026-07-08 04:00 to 2026-07-15 04:00')
    expect(text).toContain('1/7')
    expect(text).toContain('Name-removed patient / 已移除姓名的紀錄對象')
    expect(text).not.toContain('meiling')
    expect(text).toContain('Offline cache / 離線快取')
    expect(text).toContain('資料限制')
    expect(text).toContain('不要診斷，也不要建議自行調藥')
    expect(text.indexOf('2026-07-14 23:30:00')).toBeLessThan(text.indexOf('2026-07-15 00:30:00'))
  })

  test('omitting the trajectory argument leaves the GPT packet byte-identical', () => {
    const context = {
      selectedDays: 7,
      generatedAt: dayjs('2026-07-15T02:00:00+08:00'),
      isOfflineData: true,
      cacheUpdatedAt: '2026-07-14T01:02:03.000Z',
      standardResolver: GENERAL_ADULT_RESOLVER,
    }
    expect(buildGptReportText(records, context)).toBe(buildGptReportText(records, context, undefined))
    expect(buildGptReportText(records, context)).not.toContain('Recent medical trajectory')
  })

  test('appends a bilingual trajectory section listing medication changes and timeline events', () => {
    const medication: MedicationCatalog = {
      id: 'med-1', drug_product_id: null, brand_name: 'Amdixal', brand_name_zh: '脈優', generic_name: 'Amlodipine',
      strength_mg: 5, dosage_form: 'tablet', specialties: [], verification_status: 'unverified',
      tfda_license_number: null, nhi_drug_code: null, appearance_note: null, appearance_color: null,
      appearance_shape: null, appearance_photo_url: null, atc_code: 'C09AA05',
    }
    const medicationEvent: MedicationChangeTrajectoryEvent = {
      id: 'log-1', occurredAt: '2026-07-10T00:00:00.000Z', kind: 'medication_change', direction: 'dose_up',
      medicationGroup: 'blood_pressure', medication, scheduleSlot: 'morning', doseAmount: 2, doseCount: 1,
      dosageForm: 'tablet', asNeeded: false, reason: '血壓仍偏高',
    }
    const visitEvent: TimelineTrajectoryEvent = {
      id: 'visit-1', occurredAt: '2026-07-11T00:00:00.000Z', kind: 'health_visit', title: '心臟科回診', details: '醫師確認調藥後續追蹤', reassessOn: null,
    }
    const text = buildGptReportText(records, { selectedDays: 7, generatedAt: dayjs('2026-07-15T02:00:00+08:00'), standardResolver: GENERAL_ADULT_RESOLVER }, {
      events: [medicationEvent, visitEvent],
      sourceStatus: { medicationChanges: 'ok', timelineEntries: 'ok', dueReminders: 'not_applicable' },
    })

    expect(text).toContain('## Recent medical trajectory / 近期醫療軌跡')
    expect(text).toContain('Amdixal / 脈優')
    expect(text).toContain('心臟科回診')
    expect(text).not.toContain('Unavailable sources')
  })

  test('lists an overdue reminder in the trajectory section with days overdue', () => {
    const reminderEvent: DueReminderTrajectoryEvent = {
      id: 'reminder-1', occurredAt: '2026-07-12T00:00:00.000Z', kind: 'due_reminder',
      reminderType: 'medication_refill', daysOverdue: 3,
    }
    const text = buildGptReportText(records, { selectedDays: 7, generatedAt: dayjs('2026-07-15T02:00:00+08:00'), standardResolver: GENERAL_ADULT_RESOLVER }, {
      events: [reminderEvent],
      sourceStatus: { medicationChanges: 'ok', timelineEntries: 'ok', dueReminders: 'ok' },
    })

    expect(text).toContain('Overdue reminder / 逾期提醒')
    expect(text).toContain('3 day(s) overdue / 逾期 3 天')
  })

  test('flags an unavailable source instead of implying nothing changed', () => {
    const text = buildGptReportText(records, { selectedDays: 7, generatedAt: dayjs('2026-07-15T02:00:00+08:00'), standardResolver: GENERAL_ADULT_RESOLVER }, {
      events: [],
      sourceStatus: { medicationChanges: 'unavailable', timelineEntries: 'ok', dueReminders: 'ok' },
    })

    expect(text).toContain('Unavailable sources / 無法讀取的來源: medication changes / 藥單異動')
  })

  test('prints an explicit no-change line when every source read successfully but nothing happened', () => {
    const text = buildGptReportText(records, { selectedDays: 7, generatedAt: dayjs('2026-07-15T02:00:00+08:00'), standardResolver: GENERAL_ADULT_RESOLVER }, {
      events: [],
      sourceStatus: { medicationChanges: 'ok', timelineEntries: 'ok', dueReminders: 'ok' },
    })

    expect(text).toContain('此區間沒有藥單異動、看診事件或到期提醒')
    expect(text).not.toContain('Unavailable sources')
  })

  test('appends a pre-visit brief section with each item’s observation and optional question', () => {
    const items: PreVisitBriefItem[] = [
      {
        ruleId: 'R5', priority: 1, occurredAt: '2026-07-10T00:00:00.000Z',
        relatedMedicationId: null, dedupeId: 'lab-k-low',
        observation: { en: 'Potassium 2.8mmol/L is below the report’s reference range', zh: '鉀離子 2.8mmol/L 低於報告參考值', id: 'Kalium 2.8mmol/L di bawah nilai rujukan laporan' },
        question: { en: 'Should we recheck potassium?', zh: '需要複驗鉀離子嗎？', id: 'Perlukah cek ulang kalium?' },
      },
      {
        ruleId: 'R6', priority: 5, occurredAt: '2026-07-10T00:00:00.000Z',
        relatedMedicationId: null, dedupeId: 'coverage',
        observation: { en: 'Measurement coverage was low this period', zh: '此區間量測涵蓋率偏低', id: 'Cakupan pengukuran rendah pada periode ini' },
        question: null,
      },
    ]
    const text = buildGptReportText(records, { selectedDays: 7, generatedAt: dayjs('2026-07-15T02:00:00+08:00'), standardResolver: GENERAL_ADULT_RESOLVER }, undefined, items)

    expect(text).toContain('## Pre-visit brief / 就診前摘要')
    expect(text).toContain('[R5] Potassium 2.8mmol/L is below the report’s reference range / 鉀離子 2.8mmol/L 低於報告參考值')
    expect(text).toContain('Should we recheck potassium? / 需要複驗鉀離子嗎？')
    expect(text).toContain('[R6] Measurement coverage was low this period / 此區間量測涵蓋率偏低')
  })

  test('prints a fixed "nothing to compare" line when the pre-visit brief has zero items', () => {
    const text = buildGptReportText(records, { selectedDays: 7, generatedAt: dayjs('2026-07-15T02:00:00+08:00'), standardResolver: GENERAL_ADULT_RESOLVER }, undefined, [])

    expect(text).toContain('## Pre-visit brief / 就診前摘要')
    expect(text).toContain('沒有可對照的藥單異動或逾期提醒')
  })
})
