/*
檔案用途：驗證 issue #415「主動異常示警」純規則層——體重驟降、連續未回報服藥、血壓連續偏高、
        夜間低血壓次數——的邊界條件，以及示警文案不得出現診斷或調藥字樣（驗收條件硬性要求）。
所在層：tests/unit 單元測試層；以純函式輸入固定資料，不連線 Supabase。
主要關聯：對應 src/lib/careAnomalySignals.ts。
*/
import { describe, expect, test } from 'bun:test'
import {
  detectWeightDropSignal,
  detectMissedMedicationSignal,
  detectBpHighStreakSignal,
  detectBpNightLowSignal,
  describeAnomalySignal,
  ANOMALY_SIGNAL_TITLE,
  type AnomalySignal,
  type AnomalySignalKind,
} from '../../src/lib/careAnomalySignals'
import { GENERAL_ADULT_RESOLVER } from '../../src/lib/bpStandards'
import type { TrendPoint } from '../../src/lib/trendSeries'
import type { BpRecord } from '../../src/types/database'

function bpRecord(overrides: Partial<BpRecord>): BpRecord {
  return {
    id: crypto.randomUUID(),
    systolic: 110,
    diastolic: 70,
    pulse: 70,
    measured_at: '2026-07-03T04:00:00.000Z',
    source: 'manual_web',
    recorded_by: 'caregiver@example.com',
    patient_id: 'patient-1',
    created_at: '2026-07-03T04:01:00.000Z',
    ...overrides,
  }
}

// Taipei 中午量測，避免照護日 04:00 界線把測資意外分到前一天。
function noonTaipei(date: string): string {
  return `${date}T04:00:00.000Z`
}

// Taipei 晚上 18:05（malam1 時段），供夜間低血壓測資使用。
function eveningTaipei(date: string): string {
  return `${date}T10:05:00.000Z`
}

describe('detectWeightDropSignal', () => {
  test('fires when drop meets the threshold, comparing earliest vs latest available values', () => {
    const points: TrendPoint[] = [
      { date: '2026-08-01', value: 60 },
      { date: '2026-08-15', value: null },
      { date: '2026-08-30', value: 57 },
    ]
    const signal = detectWeightDropSignal(points, 30, 5)
    expect(signal).toEqual({ kind: 'weight_drop', windowDays: 30, baselineWeightKg: 60, latestWeightKg: 57, dropPercent: 5 })
  })

  test('does not fire when the drop is below threshold', () => {
    const points: TrendPoint[] = [{ date: '2026-08-01', value: 60 }, { date: '2026-08-30', value: 58 }]
    expect(detectWeightDropSignal(points, 30, 5)).toBeNull()
  })

  test('does not fire on weight gain', () => {
    const points: TrendPoint[] = [{ date: '2026-08-01', value: 55 }, { date: '2026-08-30', value: 60 }]
    expect(detectWeightDropSignal(points, 30, 5)).toBeNull()
  })

  test('does not fire with fewer than two recorded values', () => {
    expect(detectWeightDropSignal([{ date: '2026-08-01', value: 60 }], 30, 5)).toBeNull()
    expect(detectWeightDropSignal([{ date: '2026-08-01', value: null }, { date: '2026-08-02', value: null }], 30, 5)).toBeNull()
  })
})

describe('detectMissedMedicationSignal', () => {
  // 陣列最後一個元素代表「今天」，規則刻意忽略它——今天還沒過完，0 劑不代表漏服。
  const threeMissedDaysThenToday: TrendPoint[] = [
    { date: '2026-08-01', value: 0 },
    { date: '2026-08-02', value: 0 },
    { date: '2026-08-03', value: 0 },
    { date: '2026-08-04', value: 0 },
  ]

  test('never fires when the patient has no active scheduled medication plan', () => {
    expect(detectMissedMedicationSignal(threeMissedDaysThenToday, 3, false)).toBeNull()
  })

  test('fires once the consecutive missed days (excluding today) reach the threshold', () => {
    expect(detectMissedMedicationSignal(threeMissedDaysThenToday, 3, true)).toEqual({ kind: 'missed_medication', consecutiveDays: 3 })
  })

  test('stops counting at the first day with a recorded dose, walking backward from yesterday', () => {
    const points: TrendPoint[] = [
      { date: '2026-08-01', value: 0 },
      { date: '2026-08-02', value: 1 },
      { date: '2026-08-03', value: 0 },
      { date: '2026-08-04', value: 0 },
    ]
    expect(detectMissedMedicationSignal(points, 3, true)).toBeNull()
    expect(detectMissedMedicationSignal(points, 1, true)).toEqual({ kind: 'missed_medication', consecutiveDays: 1 })
  })

  test('does not count days before the currently active plan started', () => {
    // 藥單在 08-02 才建立；08-01 之前根本沒有藥要吃，不能算進漏服連續天數。
    const points: TrendPoint[] = [
      { date: '2026-08-01', value: 0 },
      { date: '2026-08-02', value: 0 },
      { date: '2026-08-03', value: 0 },
      { date: '2026-08-04', value: 0 }, // 今天，被規則忽略
    ]
    expect(detectMissedMedicationSignal(points, 3, true, '2026-08-02')).toBeNull()
    expect(detectMissedMedicationSignal(points, 2, true, '2026-08-02')).toEqual({ kind: 'missed_medication', consecutiveDays: 2 })
  })
})

describe('detectBpHighStreakSignal', () => {
  const warningReading = { systolic: 150, diastolic: 82 } // 對照 dashboardStats.test.ts 既有的 warning 邊界資料

  test('fires when consecutive care-day-level high readings reach the threshold, excluding today', () => {
    const records = [
      bpRecord({ ...warningReading, measured_at: noonTaipei('2026-07-04') }),
      bpRecord({ ...warningReading, measured_at: noonTaipei('2026-07-03') }),
      bpRecord({ ...warningReading, measured_at: noonTaipei('2026-07-02') }),
      // 「今天」也偏高，但今天還沒過完，規則從昨天開始算，這筆不該被計入連續天數。
      bpRecord({ ...warningReading, measured_at: noonTaipei('2026-07-05') }),
    ]
    expect(detectBpHighStreakSignal(records, 3, GENERAL_ADULT_RESOLVER, '2026-07-05')).toEqual({ kind: 'bp_high_streak', consecutiveDays: 3 })
    expect(detectBpHighStreakSignal(records, 4, GENERAL_ADULT_RESOLVER, '2026-07-05')).toBeNull()
  })

  test('a normal-range day breaks the streak', () => {
    const records = [
      bpRecord({ ...warningReading, measured_at: noonTaipei('2026-07-04') }),
      bpRecord({ systolic: 112, diastolic: 68, measured_at: noonTaipei('2026-07-03') }),
      bpRecord({ ...warningReading, measured_at: noonTaipei('2026-07-02') }),
    ]
    expect(detectBpHighStreakSignal(records, 1, GENERAL_ADULT_RESOLVER, '2026-07-05')).toEqual({ kind: 'bp_high_streak', consecutiveDays: 1 })
    expect(detectBpHighStreakSignal(records, 2, GENERAL_ADULT_RESOLVER, '2026-07-05')).toBeNull()
  })
})

describe('detectBpNightLowSignal', () => {
  test('only counts nighttime low readings inside the configured window, even when the input array is wider', () => {
    const records = [
      bpRecord({ systolic: 85, diastolic: 48, measured_at: eveningTaipei('2026-07-04') }),
      bpRecord({ systolic: 85, diastolic: 48, measured_at: eveningTaipei('2026-07-03') }),
      // 這筆在窗口外（呼叫端為了少打一次 API，可能把更寬的血壓連續偏高規則所需的資料一起傳進來）。
      bpRecord({ systolic: 85, diastolic: 48, measured_at: eveningTaipei('2026-07-01') }),
    ]
    expect(detectBpNightLowSignal(records, 3, 2, GENERAL_ADULT_RESOLVER, '2026-07-05')).toEqual({ kind: 'bp_night_low', windowDays: 3, count: 2 })
    expect(detectBpNightLowSignal(records, 3, 3, GENERAL_ADULT_RESOLVER, '2026-07-05')).toBeNull()
  })

  test('excludes a reading between 00:00-03:59 on the earliest window date, since it belongs to the prior care day', () => {
    // Taipei 07-03 02:00（session.ts 的 malam3 涵蓋跨夜零星量測，這筆會被算進「夜間」）；
    // 但它的照護日是 07-02（04:00 分界），在「窗口起點用日曆日 00:00 而非照護日 04:00」這個
    // 曾經存在的錯誤下會被誤算進 [07-03, 07-05] 這個 3 天窗口，這裡驗證它確實被正確排除。
    const records = [bpRecord({ systolic: 85, diastolic: 48, measured_at: '2026-07-02T18:00:00.000Z' })]
    expect(detectBpNightLowSignal(records, 3, 1, GENERAL_ADULT_RESOLVER, '2026-07-05')).toBeNull()
  })
})

describe('describeAnomalySignal safety boundary', () => {
  const forbiddenWords = ['診斷', '調藥', '病因', '腦動脈瘤', 'diagnos', 'ubah dosis', 'obat baru']
  const samples: AnomalySignal[] = [
    { kind: 'weight_drop', windowDays: 30, baselineWeightKg: 60, latestWeightKg: 57, dropPercent: 5 },
    { kind: 'missed_medication', consecutiveDays: 3 },
    { kind: 'bp_high_streak', consecutiveDays: 3 },
    { kind: 'bp_night_low', windowDays: 7, count: 3 },
  ]

  test('every signal has a title for all three languages', () => {
    (Object.keys(ANOMALY_SIGNAL_TITLE) as AnomalySignalKind[]).forEach(kind => {
      const title = ANOMALY_SIGNAL_TITLE[kind]
      expect(title.id.length).toBeGreaterThan(0)
      expect(title.zh.length).toBeGreaterThan(0)
      expect(title.en.length).toBeGreaterThan(0)
    })
  })

  test('copy only states the observed data change and suggests discussing with a doctor, never a diagnosis', () => {
    for (const signal of samples) {
      const description = describeAnomalySignal(signal)
      for (const locale of ['id', 'zh', 'en'] as const) {
        const text = description[locale]
        expect(text.length).toBeGreaterThan(0)
        for (const forbidden of forbiddenWords) {
          expect(text.toLowerCase()).not.toContain(forbidden.toLowerCase())
        }
      }
      // 中文文案是家屬主要閱讀語言，特別檢查一定出現「建議與醫師討論」這句話本身，而不只是不含禁詞。
      expect(description.zh).toContain('建議與醫師討論')
    }
  })
})
