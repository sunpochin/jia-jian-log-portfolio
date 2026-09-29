/*
檔案用途：daily-summary-v2 前端 DTO 的假資料 fixture（設計 §4.1 形狀），給 parser、presentation 與 client 測試共用。
所在層：tests/unit/fixtures；純資料，全部是假值，不含真實病人數值或姓名。
主要關聯：tests/unit/shareSummaryV2Dto.test.ts、shareSummaryV2Presentation.test.ts、shareSummaryClient.test.ts。
*/

export const shareSummaryV2Fixture = {
  scopeVersion: 'daily-summary-v2',
  patientAlias: { zh: '照護對象', en: 'Care recipient', id: 'Objek perawatan' },
  timezone: 'Asia/Taipei',
  generatedAt: '2026-09-25T02:00:00.000Z',
  bloodPressure: {
    window: { start: '2026-09-11T20:00:00.000Z', end: '2026-09-25T20:00:00.000Z', careDays: 14 },
    readings: [
      { measuredAt: '2026-09-15T00:00:00.000Z', systolic: 128, diastolic: 82, pulse: 70, session: 'pagi', level: 'warning', ruleKeys: ['off_target', 'observasi'], pulseWarning: false, standardIndex: 0 },
      { measuredAt: '2026-09-23T11:00:00.000Z', systolic: 118, diastolic: 76, pulse: 125, session: 'malam2', level: 'warning', ruleKeys: ['normal'], pulseWarning: true, standardIndex: 1 },
      { measuredAt: '2026-09-23T18:30:00.000Z', systolic: 88, diastolic: 48, pulse: null, session: 'malam3', level: 'danger-low', ruleKeys: ['danger_low'], pulseWarning: false, standardIndex: 1 },
    ],
    truncated: false,
    summary: {
      recordCount: 3, daysWithRecords: 2, daysWithMorning: 1, daysWithEvening: 1,
      avgSystolic: 111.3, avgDiastolic: 68.7, avgPulse: 97.5,
      morningAvg: { systolic: 128, diastolic: 82 }, eveningAvg: { systolic: 103, diastolic: 62 },
      nightLowCount: 1,
      levelCounts: { normal: 0, warning: 2, danger: 0, 'warning-low': 0, 'danger-low': 1, 'off-target': 0, 'below-target': 0 },
    },
    standardsUsed: [
      { templateKey: 'post_op_strict', customBounds: null, effectiveFrom: '2026-09-05T00:00:00.000Z', effectiveTo: '2026-09-19T00:00:00.000Z', configured: true },
      { templateKey: 'general_adult', customBounds: null, effectiveFrom: null, effectiveTo: null, configured: false },
    ],
  },
  medications: {
    asOf: '2026-09-25T02:00:00.000Z',
    items: [
      {
        displayName: { brand: 'Norvasc', brandZh: '脈優錠', brandId: null, generic: 'Amlodipine' },
        strengthLabel: '5 mg', strengthMg: 5, dosageForm: 'tablet', scheduleSlot: 'after_breakfast', asNeeded: false, doseAmount: 1, doseCount: 1,
        appearance: { color: 'white', shape: 'round' }, verificationStatus: 'official', tfdaLicenseNumber: '衛署藥輸字第000000號', instructionCodes: ['with_food'],
      },
      {
        displayName: { brand: 'Panadol', brandZh: null, brandId: null, generic: 'Paracetamol' },
        strengthLabel: null, strengthMg: 500, dosageForm: 'tablet', scheduleSlot: 'anytime', asNeeded: true, doseAmount: 1, doseCount: 1,
        appearance: { color: null, shape: null }, verificationStatus: 'unverified', tfdaLicenseNumber: null, instructionCodes: [],
      },
      {
        displayName: { brand: 'Diovan', brandZh: '得安穩', brandId: 'Diovan', generic: 'Valsartan' },
        strengthLabel: '80 mg', strengthMg: 80, dosageForm: 'tablet', scheduleSlot: 'before_breakfast', asNeeded: false, doseAmount: 1, doseCount: 2,
        appearance: { color: 'pink', shape: 'oval' }, verificationStatus: 'manually_verified', tfdaLicenseNumber: null, instructionCodes: [],
      },
    ],
  },
  recentEvents: {
    window: { start: '2026-08-26T02:00:00.000Z', end: '2026-09-25T02:00:00.000Z', days: 30 },
    items: [
      { occurredAt: '2026-09-24T01:00:00.000Z', eventType: 'health_visit', visitKind: 'emergency', visitDepartment: '心臟內科', medicationChange: null },
      { occurredAt: '2026-09-20T01:00:00.000Z', eventType: 'medication_change', visitKind: null, visitDepartment: null, medicationChange: { action: 'deactivate', medicationDisplayName: 'Diovan' } },
    ],
    truncated: false,
  },
  openConcerns: { openQuestionCount: 3 },
} as const

/** 深拷貝成可變物件，讓測試改一個鍵就能造出畸形 payload。 */
export const cloneShareSummaryV2Fixture = (): Record<string, unknown> => JSON.parse(JSON.stringify(shareSummaryV2Fixture)) as Record<string, unknown>
