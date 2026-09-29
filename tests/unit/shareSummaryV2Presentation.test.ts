/*
檔案用途：v2 分享頁純呈現層的查表與分組——每一條 ruleKey 都有標籤、視覺階由伺服器 level／ruleKeys 決定、R5 文字與列印報告同源、
  藥單依時段分組、照護日分組——以及三語文案（設計 §6 B–E）逐句鎖住。
所在層：tests/unit；不渲染 React。
主要關聯：src/lib/shareSummaryV2Presentation.ts、src/features/care-family/shareSummaryV2Copy.ts、src/lib/recordReport.ts describeBpStandard。
*/
import { describe, expect, test } from 'bun:test'
import {
  describeStandardUsed,
  firstIncludedCareDay,
  groupMedicationsBySlot,
  groupReadingsByCareDay,
  lastIncludedCareDay,
  readingRuleLabels,
  readingTone,
} from '../../src/lib/shareSummaryV2Presentation'
import { standardMarker } from '../../src/features/care-family/components/shareSummaryV2/ShareSummaryBloodPressureSection'
import { describeBpStandard } from '../../src/lib/recordReport'
import { resolveBpStandard } from '../../src/types/database'
import { parseShareSummaryV2 } from '../../src/lib/shareSummaryV2Dto'
import { cloneShareSummaryV2Fixture } from './fixtures/shareSummaryV2Fixture'
import {
  SHARE_V2_DATA_LIMITS, SHARE_V2_EMPTY_BP, SHARE_V2_EMPTY_EVENTS, SHARE_V2_EMPTY_MEDICATIONS, SHARE_V2_INTRO,
  SHARE_V2_INVALID, SHARE_V2_OPEN_QUESTIONS, SHARE_V2_SNAPSHOT, SHARE_V2_STANDARD_NOT_REPAINTED, SHARE_V2_TRUNCATED, SHARE_V2_UNAVAILABLE,
} from '../../src/features/care-family/shareSummaryV2Copy'

const dto = parseShareSummaryV2(cloneShareSummaryV2Fixture())

describe('reading presentation (no re-evaluation, every rule shown)', () => {
  test('returns one label per rule key, in server order, and never drops the second axis', () => {
    const labels = readingRuleLabels(['off_target', 'diastolic_below_ref'])
    expect(labels).toHaveLength(2)
    expect(labels[0].zh).toContain('超出目標')
    expect(labels[1].zh).toContain('舒張壓低於參考值')
  })

  test('an unknown rule key is shown as-is instead of being painted normal', () => {
    expect(readingRuleLabels(['future_rule'])[0]).toEqual({ zh: 'future_rule', id: 'future_rule', en: 'future_rule' })
    expect(readingTone({ level: 'danger', ruleKeys: ['future_rule'], pulseWarning: false })).toBe('danger')
  })

  test('tone follows the server level: critical for danger_high, pulse-warning when only the heartbeat pushed the level, on-target for on_target', () => {
    expect(readingTone({ level: 'danger', ruleKeys: ['danger_high'], pulseWarning: false })).toBe('critical')
    expect(readingTone({ level: 'warning', ruleKeys: ['normal'], pulseWarning: true })).toBe('pulse-warning')
    expect(readingTone({ level: 'normal', ruleKeys: ['on_target'], pulseWarning: false })).toBe('on-target')
    expect(readingTone({ level: 'warning', ruleKeys: ['off_target', 'observasi'], pulseWarning: false })).toBe('warning')
    expect(readingTone({ level: 'danger-low', ruleKeys: ['danger_low'], pulseWarning: false })).toBe('danger-low')
  })

  test('R5 wording is byte-identical to the printed report for configured and unconfigured standards', () => {
    expect(describeStandardUsed(dto.bloodPressure.standardsUsed[0])).toEqual(describeBpStandard({
      standard: resolveBpStandard('post_op_strict'), templateKey: 'post_op_strict', prescribedNote: null, configured: true, unavailable: false,
    }))
    expect(describeStandardUsed(dto.bloodPressure.standardsUsed[1]).zh).toContain('當時未設定個別標準')
    const custom = describeStandardUsed({ templateKey: 'custom', customBounds: { systolicMin: 110, systolicMax: 120, diastolicMin: 60, diastolicMax: 79 }, effectiveFrom: null, effectiveTo: null, configured: true })
    expect(custom.en).toContain('110–120 mmHg')
  })
})

describe('window labels and standard markers', () => {
  test('the exclusive 04:00 end boundary is shown as the last included care day, not one day too many', () => {
    // 視窗 [09-12 04:00, 09-26 04:00) 台北時間 ＝ 涵蓋 09-12 到 09-25 共 14 個照護日。
    expect(firstIncludedCareDay('2026-09-11T20:00:00.000Z')).toBe('2026-09-12')
    expect(lastIncludedCareDay('2026-09-25T20:00:00.000Z')).toBe('2026-09-25')
    expect(lastIncludedCareDay(dto.bloodPressure.window.end)).toBe('2026-09-25')
  })

  test('standard markers are stable circled numbers that index standardsUsed', () => {
    expect(standardMarker(0)).toBe('①')
    expect(standardMarker(1)).toBe('②')
    expect(standardMarker(10)).toBe('(11)')
    expect(dto.bloodPressure.readings.map(reading => standardMarker(reading.standardIndex))).toEqual(['①', '②', '②'])
  })
})

describe('grouping', () => {
  test('groups readings by Taipei care day (04:00 boundary), newest day first, ascending within a day', () => {
    const groups = groupReadingsByCareDay(dto.bloodPressure.readings)
    expect(groups.map(group => group.careDay)).toEqual(['2026-09-23', '2026-09-15'])
    // 台北 24 日 02:30 的那筆仍屬 23 日照護日。
    expect(groups[0].readings.map(reading => reading.measuredAt)).toEqual(['2026-09-23T11:00:00.000Z', '2026-09-23T18:30:00.000Z'])
  })

  test('groups medications by slot in the app slot order and lists PRN separately', () => {
    const { scheduled, asNeeded } = groupMedicationsBySlot(dto.medications.items)
    expect(scheduled.map(group => group.slot)).toEqual(['before_breakfast', 'after_breakfast'])
    expect(asNeeded.map(item => item.displayName.brand)).toEqual(['Panadol'])
  })
})

describe('v2 copy (設計 §6 B–E)', () => {
  test('intro and footer state not-a-diagnosis, data limits and snapshot semantics in all three locales', () => {
    expect(SHARE_V2_INTRO.zh).toContain('不是診斷，也不是醫療建議')
    expect(SHARE_V2_INTRO.id).toContain('bukan diagnosis atau saran medis')
    expect(SHARE_V2_INTRO.en).toContain('not a diagnosis or medical advice')
    expect(SHARE_V2_DATA_LIMITS.zh).toContain('缺少的日期代表當天沒有紀錄，不代表數值正常')
    expect(SHARE_V2_DATA_LIMITS.en).toContain('not that values were normal')
    expect(SHARE_V2_SNAPSHOT('2026-09-25 10:00').en).toContain('snapshot generated at 2026-09-25 10:00')
    expect(SHARE_V2_STANDARD_NOT_REPAINTED.id).toContain('tidak dinilai ulang')
  })

  test('empty, truncated, count and error states have all three locales and interpolate counts', () => {
    for (const copy of [SHARE_V2_EMPTY_BP, SHARE_V2_EMPTY_MEDICATIONS, SHARE_V2_EMPTY_EVENTS, SHARE_V2_INVALID, SHARE_V2_UNAVAILABLE, SHARE_V2_TRUNCATED(120), SHARE_V2_OPEN_QUESTIONS(3)]) {
      expect(copy.zh.length).toBeGreaterThan(0)
      expect(copy.id.length).toBeGreaterThan(0)
      expect(copy.en.length).toBeGreaterThan(0)
      expect(copy.id).not.toBe(copy.en)
    }
    expect(SHARE_V2_TRUNCATED(120).zh).toBe('紀錄過多，只顯示最新的 120 筆。')
    expect(SHARE_V2_OPEN_QUESTIONS(3).en).toBe('The family has 3 questions not yet asked at a visit.')
    // 503 與連結無效必須是不同的句子。
    expect(SHARE_V2_UNAVAILABLE.zh).not.toBe(SHARE_V2_INVALID.zh)
  })
})
