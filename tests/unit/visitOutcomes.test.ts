/*
檔案用途：驗證門診頁純函式（照護閉環 T5，issue #949）——答案與看診的時間相近性配對（視窗、最近、同距取較早、
未配對組、排序）、下一個非藥量倒數提醒的挑選，以及就診前摘要規則標籤三語齊全。
所在層：tests/unit；只測純函式，不啟動瀏覽器或資料庫。
主要關聯：src/lib/visitOutcomes.ts、src/lib/visitQuestions.ts、src/lib/careDueReminders.ts。
*/
import { describe, expect, test } from 'bun:test'
import dayjs from 'dayjs'
import { nextClinicalReminder, OUTCOME_VISIT_TIME_TOLERANCE_MINUTES, pairAnsweredQuestionsWithVisits, PRE_VISIT_RULE_LABELS, type HealthVisitSummary } from '../../src/lib/visitOutcomes'
import type { VisitQuestion } from '../../src/lib/visitQuestions'
import type { CareDueReminder } from '../../src/lib/careDueReminders'

function question(overrides: Partial<VisitQuestion> = {}): VisitQuestion {
  return {
    id: 'q1', patient_id: 'p1', question: '這項血鉀結果是否需要追蹤？', answer: '三個月後再驗', status: 'asked', asked_at: null,
    answered_at: '2026-09-10T03:00:00.000Z', source: 'manual', source_rule_id: null, source_entity_id: null, sort_order: 1,
    created_by_user_id: 'u1', created_by_email: 'owner@example.com', created_at: '2026-09-01T00:00:00.000Z', updated_at: '2026-09-01T00:00:00.000Z',
    ...overrides,
  }
}

function visit(overrides: Partial<HealthVisitSummary> = {}): HealthVisitSummary {
  return { id: 'v1', patient_id: 'p1', title: '心臟內科回診', occurred_at: '2026-09-10T01:00:00.000Z', visit_kind: 'outpatient', visit_department: '心臟內科', visit_institution: null, ...overrides }
}

function reminder(overrides: Partial<CareDueReminder> = {}): CareDueReminder {
  return {
    id: 'r1', patient_id: 'p1', reminder_type: 'follow_up_visit', medication_plan_id: null, days_supply: null, start_date: '2026-09-01',
    due_date: '2026-10-01', threshold_days: 7, status: 'active', completed_at: null, created_by_user_id: null,
    created_at: '2026-09-01T00:00:00.000Z', updated_at: '2026-09-01T00:00:00.000Z', related_entry_id: null, related_lab_result_id: null, visit_department: null,
    ...overrides,
  }
}

describe('pairAnsweredQuestionsWithVisits', () => {
  test('pairs each answered question with the nearest visit inside the window and sorts visits newest first', () => {
    const groups = pairAnsweredQuestionsWithVisits(
      [
        question({ id: 'q-old', answered_at: '2026-08-02T00:00:00.000Z' }),
        question({ id: 'q-new', answered_at: '2026-09-10T03:00:00.000Z' }),
        question({ id: 'q-new-later', answered_at: '2026-09-12T03:00:00.000Z' }),
      ],
      [visit({ id: 'v-aug', occurred_at: '2026-08-01T01:00:00.000Z' }), visit({ id: 'v-sep', occurred_at: '2026-09-10T01:00:00.000Z' })],
    )
    expect(groups.map(group => group.visit?.id)).toEqual(['v-sep', 'v-aug'])
    expect(groups[0].questions.map(item => item.id)).toEqual(['q-new-later', 'q-new'])
    expect(groups[1].questions.map(item => item.id)).toEqual(['q-old'])
  })

  test('skips questions without an answer and puts answers outside the window or without answered_at in the unpaired group last', () => {
    const groups = pairAnsweredQuestionsWithVisits(
      [
        question({ id: 'q-unanswered', answer: null }),
        question({ id: 'q-blank', answer: '   ' }),
        question({ id: 'q-legacy', answered_at: null }),
        question({ id: 'q-far', answered_at: '2026-12-01T00:00:00.000Z' }),
        question({ id: 'q-paired' }),
      ],
      [visit()],
    )
    expect(groups.length).toBe(2)
    expect(groups[0].visit?.id).toBe('v1')
    expect(groups[0].questions.map(item => item.id)).toEqual(['q-paired'])
    expect(groups[1].visit).toBeNull()
    expect(groups[1].questions.map(item => item.id).sort()).toEqual(['q-far', 'q-legacy'])
  })

  test('breaks a distance tie by choosing the earlier visit and honours a custom window', () => {
    // 平手要發生在兩個都「可能是出處」的看診之間：一筆早於回答、一筆在預約時間誤差內稍晚（隔天的看診已不算候選）。
    const groups = pairAnsweredQuestionsWithVisits(
      [question({ answered_at: '2026-09-10T12:00:00+08:00' })],
      [visit({ id: 'v-after', occurred_at: '2026-09-10T13:00:00+08:00' }), visit({ id: 'v-before', occurred_at: '2026-09-10T11:00:00+08:00' })],
      { now: '2026-09-20T12:00:00+08:00' },
    )
    expect(groups[0].visit?.id).toBe('v-before')

    const narrow = pairAnsweredQuestionsWithVisits([question({ answered_at: '2026-09-20T00:00:00.000Z' })], [visit()], { windowDays: 3 })
    expect(narrow[0].visit).toBeNull()
  })

  test('returns no groups when nothing has been answered', () => {
    expect(pairAnsweredQuestionsWithVisits([question({ answer: null })], [visit()])).toEqual([])
  })
})

// PR #981 Codex P1：醫師的回答只可能來自已經發生、且不晚於回答（只容許 2 小時預約時間誤差）的看診。
describe('pairAnsweredQuestionsWithVisits — only visits that could be the source of the answer', () => {
  const pastVisit = visit({ id: 'v-five-days-ago', occurred_at: '2026-09-15T10:00:00+08:00' })
  const nextDayVisit = visit({ id: 'v-tomorrow', occurred_at: '2026-09-21T09:00:00+08:00' })
  const answeredToday = question({ answered_at: '2026-09-20T10:00:00+08:00' })

  test('never attaches an answer to a later-day visit, even when it is closer in time', () => {
    // 回答前一天的看診還沒發生：舊邏輯只比時間差，會因為 23 小時 < 5 天而掛到明天那次。
    const beforeTheVisit = pairAnsweredQuestionsWithVisits([answeredToday], [pastVisit, nextDayVisit], { now: '2026-09-20T12:00:00+08:00' })
    expect(beforeTheVisit.map(group => group.visit?.id)).toEqual(['v-five-days-ago'])
    // 那次看診之後真的發生了也一樣：回答比它早將近一天，遠超過預約時間誤差，不可能是那次醫師說的。
    const afterTheVisit = pairAnsweredQuestionsWithVisits([answeredToday], [pastVisit, nextDayVisit], { now: '2026-09-26T12:00:00+08:00' })
    expect(afterTheVisit.map(group => group.visit?.id)).toEqual(['v-five-days-ago'])
  })

  test('still pairs a visit logged slightly after the answer (appointment time vs. when the doctor was seen)', () => {
    const groups = pairAnsweredQuestionsWithVisits(
      [question({ answered_at: '2026-09-20T15:20:00+08:00' })],
      [visit({ id: 'v-ten-days-ago', occurred_at: '2026-09-10T15:00:00+08:00' }), visit({ id: 'v-today', occurred_at: '2026-09-20T15:30:00+08:00' })],
      { now: '2026-09-20T18:00:00+08:00' },
    )
    expect(groups.map(group => group.visit?.id)).toEqual(['v-today'])
  })

  test('ignores a visit that has not happened yet, falling back to an earlier visit or the unpaired group', () => {
    const laterToday = visit({ id: 'v-later-today', occurred_at: '2026-09-20T16:00:00+08:00' })
    const now = '2026-09-20T12:00:00+08:00'
    expect(pairAnsweredQuestionsWithVisits([answeredToday], [pastVisit, laterToday], { now }).map(group => group.visit?.id)).toEqual(['v-five-days-ago'])
    const onlyFuture = pairAnsweredQuestionsWithVisits([answeredToday], [laterToday, nextDayVisit], { now })
    expect(onlyFuture).toHaveLength(1)
    expect(onlyFuture[0].visit).toBeNull()
  })

  test('does not move a morning answer onto a later appointment the same day once that appointment has passed (#984 Codex P1)', () => {
    // 早上 09:00 寫下的回答，同一天晚上 20:00 另有一次門診；晚上過後重開頁面，20:00 那次雖然已發生、也比三天前近，
    // 但比回答晚了 11 小時，遠超過預約時間誤差，不能把舊回答搬過去。
    const groups = pairAnsweredQuestionsWithVisits(
      [question({ answered_at: '2026-09-20T09:00:00+08:00' })],
      [visit({ id: 'v-three-days-ago', occurred_at: '2026-09-17T10:00:00+08:00' }), visit({ id: 'v-tonight', occurred_at: '2026-09-20T20:00:00+08:00' })],
      { now: '2026-09-20T22:00:00+08:00' },
    )
    expect(groups.map(group => group.visit?.id)).toEqual(['v-three-days-ago'])
  })

  test('accepts a visit up to the tolerance after the answer and rejects anything later', () => {
    const answered = '2026-09-20T09:00:00+08:00'
    const now = '2026-09-20T22:00:00+08:00'
    const atTolerance = dayjs(answered).add(OUTCOME_VISIT_TIME_TOLERANCE_MINUTES, 'minute').toISOString()
    const pastTolerance = dayjs(answered).add(OUTCOME_VISIT_TIME_TOLERANCE_MINUTES + 1, 'minute').toISOString()
    expect(pairAnsweredQuestionsWithVisits([question({ answered_at: answered })], [visit({ id: 'v-edge', occurred_at: atTolerance })], { now })[0].visit?.id).toBe('v-edge')
    expect(pairAnsweredQuestionsWithVisits([question({ answered_at: answered })], [visit({ id: 'v-late', occurred_at: pastTolerance })], { now })[0].visit).toBeNull()
  })
})

describe('nextClinicalReminder', () => {
  test('picks the earliest active non-refill reminder and ignores completed or refill ones', () => {
    const picked = nextClinicalReminder([
      reminder({ id: 'refill', reminder_type: 'medication_refill', days_supply: 14, due_date: '2026-09-05' }),
      reminder({ id: 'done', status: 'completed', due_date: '2026-09-06' }),
      reminder({ id: 'blood', reminder_type: 'blood_draw', due_date: '2026-09-20' }),
      reminder({ id: 'visit', due_date: '2026-10-01', visit_department: '心臟內科' }),
    ])
    expect(picked?.id).toBe('blood')
    expect(nextClinicalReminder([reminder({ reminder_type: 'medication_refill', days_supply: 14 })])).toBeNull()
  })
})

describe('PRE_VISIT_RULE_LABELS', () => {
  test('covers R1–R5 with three distinct locales each', () => {
    for (const rule of ['R1', 'R2', 'R3', 'R4', 'R5']) {
      const label = PRE_VISIT_RULE_LABELS[rule]
      expect(label.zh.length).toBeGreaterThan(0)
      expect(label.id.length).toBeGreaterThan(0)
      expect(label.en.length).toBeGreaterThan(0)
      expect(label.id).not.toBe(label.en)
    }
    // R6 只有觀察沒有提問，永遠不會被加入清單，因此沒有標籤。
    expect(PRE_VISIT_RULE_LABELS.R6).toBeUndefined()
  })
})
