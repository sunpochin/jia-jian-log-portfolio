/*
檔案用途：驗證血壓報表的照護日分組、CSV 匯出與 GPT 摘要資料格式。
所在層：tests/unit 單元測試層；使用固定量測時間避免時區測試漂移。
主要關聯：對應 src/lib/recordReport.ts、src/lib/dashboardStats.ts 與 src/lib/careDay.ts。
*/
import { describe, expect, test } from 'bun:test'
import dayjs from 'dayjs'
import { buildGptReportText, buildRecordCsv, buildRecordReportModel } from '../../src/lib/recordReport'
import type { BpRecord } from '../../src/types/database'

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
    ])

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
    const model = buildRecordReportModel([])

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
})
