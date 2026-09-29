/*
檔案用途：接收端 v2 DTO parser 的邊界——完整 fixture 逐鍵通過、缺鍵／型別錯／未知等級／standardIndex 越界／事件欄位互斥都 fail closed，
  以及 client 依 scopeVersion 分派、v1 形狀不受影響。
所在層：tests/unit；不連線 Supabase。
主要關聯：src/lib/shareSummaryV2Dto.ts、src/lib/shareSummaryClient.ts、tests/unit/fixtures/shareSummaryV2Fixture.ts。
*/
import { describe, expect, test } from 'bun:test'
import { parseShareSummaryV2 } from '../../src/lib/shareSummaryV2Dto'
import { isShareSummaryV2, parseShareSummaryResponse } from '../../src/lib/shareSummaryClient'
import { cloneShareSummaryV2Fixture, shareSummaryV2Fixture } from './fixtures/shareSummaryV2Fixture'

const mutate = (apply: (draft: Record<string, unknown>) => void) => {
  const draft = cloneShareSummaryV2Fixture()
  apply(draft)
  return draft
}
const bp = (draft: Record<string, unknown>) => draft.bloodPressure as Record<string, unknown>
const readings = (draft: Record<string, unknown>) => bp(draft).readings as Array<Record<string, unknown>>
const meds = (draft: Record<string, unknown>) => (draft.medications as Record<string, unknown>).items as Array<Record<string, unknown>>
const events = (draft: Record<string, unknown>) => (draft.recentEvents as Record<string, unknown>).items as Array<Record<string, unknown>>

describe('parseShareSummaryV2', () => {
  test('accepts the full fixture and returns exactly the whitelisted shape', () => {
    const parsed = parseShareSummaryV2(cloneShareSummaryV2Fixture())
    expect(parsed).toEqual(JSON.parse(JSON.stringify(shareSummaryV2Fixture)))
    expect(parsed.bloodPressure.readings[0].ruleKeys).toEqual(['off_target', 'observasi'])
  })

  test('drops nothing silently: unknown extra keys are ignored but every whitelisted key must be present and typed', () => {
    const extra = mutate(draft => { draft.photo = 'nope'; readings(draft)[0].name = 'nope' })
    const parsed = parseShareSummaryV2(extra) as unknown as Record<string, unknown>
    expect('photo' in parsed).toBe(false)
    expect('name' in (parsed.bloodPressure as { readings: Array<Record<string, unknown>> }).readings[0]).toBe(false)
  })

  test.each([
    ['wrong scope', (d: Record<string, unknown>) => { d.scopeVersion = 'daily-summary-v1' }],
    ['missing bloodPressure', (d: Record<string, unknown>) => { delete d.bloodPressure }],
    ['non-integer systolic', (d: Record<string, unknown>) => { readings(d)[0].systolic = 'high' }],
    ['unknown level', (d: Record<string, unknown>) => { readings(d)[0].level = 'critical' }],
    ['unknown session', (d: Record<string, unknown>) => { readings(d)[0].session = 'siang2' }],
    ['ruleKeys not strings', (d: Record<string, unknown>) => { readings(d)[0].ruleKeys = [1] }],
    ['standardIndex out of range', (d: Record<string, unknown>) => { readings(d)[0].standardIndex = 5 }],
    ['missing levelCounts entry', (d: Record<string, unknown>) => { delete ((bp(d).summary as Record<string, unknown>).levelCounts as Record<string, unknown>).normal }],
    ['negative open question count', (d: Record<string, unknown>) => { (d.openConcerns as Record<string, unknown>).openQuestionCount = -1 }],
    ['unknown verification status', (d: Record<string, unknown>) => { meds(d)[0].verificationStatus = 'verified' }],
    ['unknown event type', (d: Record<string, unknown>) => { events(d)[0].eventType = 'care_note' }],
    ['visit carrying a medication change', (d: Record<string, unknown>) => { events(d)[0].medicationChange = { action: 'upsert', medicationDisplayName: 'x' } }],
    ['medication change without payload', (d: Record<string, unknown>) => { events(d)[1].medicationChange = null }],
    ['single-language alias', (d: Record<string, unknown>) => { d.patientAlias = '照護對象' }],
  ])('rejects %s instead of rendering partial data', (_label, apply) => {
    expect(() => parseShareSummaryV2(mutate(apply))).toThrow('share summary v2 field is invalid')
  })
})

describe('parseShareSummaryResponse dispatch', () => {
  test('routes a v2 payload to the v2 parser and a v1 payload to the unchanged v1 shape', () => {
    const v2 = parseShareSummaryResponse({ summary: cloneShareSummaryV2Fixture() })
    expect(isShareSummaryV2(v2)).toBe(true)
    const v1 = parseShareSummaryResponse({ summary: {
      patientAlias: { zh: '照護對象', en: 'Care recipient', id: 'Objek perawatan' }, summaryDate: '2026-09-25', timezone: 'Asia/Taipei', bloodPressure: null, generatedAt: '2026-09-25T02:00:00.000Z',
    } })
    expect(isShareSummaryV2(v1)).toBe(false)
    expect('scopeVersion' in v1).toBe(false)
  })

  test('refuses an unknown scope rather than guessing a version', () => {
    expect(() => parseShareSummaryResponse({ summary: { ...cloneShareSummaryV2Fixture(), scopeVersion: 'daily-summary-v3' } })).toThrow('scope is not supported')
  })
})
