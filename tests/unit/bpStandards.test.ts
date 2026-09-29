/*
檔案用途：驗證病人級血壓標準的生效區間解析（issue #897）——尤其「歷史不得被重新判讀」
        與「補登舊量測套用當時的標準」這兩條，它們是生效日期化存在的唯一理由。
所在層：tests/unit。
主要關聯：src/lib/bpStandards.ts、supabase/migrations/20260922230000_create_patient_bp_standards.sql。
*/
import { describe, test, expect } from 'bun:test'
import { resolveStandardAt, currentInterval, scheduledIntervals, GENERAL_ADULT_RESOLVER, UNAVAILABLE_BP_STANDARD_RESOLVER, type BpStandardInterval } from '../../src/lib/bpStandards'
import { describeBpStandard } from '../../src/lib/recordReport'

const interval = (
  templateKey: string,
  effectiveFrom: string,
  effectiveTo: string | null,
  extra: Partial<BpStandardInterval> = {},
): BpStandardInterval => ({
  id: `${templateKey}-${effectiveFrom}`,
  templateKey,
  customBounds: null,
  prescribedNote: null,
  effectiveFrom,
  effectiveTo,
  ...extra,
})

// 術後嚴格控制 8/1–9/22，之後換回一般成人。
const HISTORY: BpStandardInterval[] = [
  interval('post_op_strict', '2026-08-01T00:00:00Z', '2026-09-22T00:00:00Z', { prescribedNote: '2026-08 心血管科門診' }),
  interval('general_adult', '2026-09-22T00:00:00Z', null),
]

describe('resolveStandardAt', () => {
  test('歷史不得被重新判讀：術後階段的讀數仍解析到當時的標準', () => {
    // 這是生效日期化存在的唯一理由。若只存一列現行標準，換回一般成人之後
    // 這一筆會被重新漆成綠色，報告還會在它旁邊印出「一般成人」。
    const resolved = resolveStandardAt(HISTORY, '2026-08-15T09:00:00Z')
    expect(resolved.templateKey).toBe('post_op_strict')
    expect(resolved.configured).toBe(true)
    expect(resolved.prescribedNote).toBe('2026-08 心血管科門診')
  })

  test('補登舊量測套用當時的標準，不是補登當下的', () => {
    // 本 app 明確支援補登（DailyBloodPressureRecords 的補登入口）。
    // 「INSERT 當下快照標準」會答錯這一題，所以採區間解析。
    expect(resolveStandardAt(HISTORY, '2026-08-31T23:59:59Z').templateKey).toBe('post_op_strict')
  })

  test('目前的讀數用目前的標準', () => {
    expect(resolveStandardAt(HISTORY, '2026-09-23T08:00:00Z').templateKey).toBe('general_adult')
  })

  test('交界時間點只屬於後一段，不會同時命中兩段', () => {
    // 區間是 [from, to)，與資料庫 tstzrange 的預設邊界一致。
    expect(resolveStandardAt(HISTORY, '2026-09-22T00:00:00Z').templateKey).toBe('general_adult')
    expect(resolveStandardAt(HISTORY, '2026-09-21T23:59:59Z').templateKey).toBe('post_op_strict')
  })

  test('沒有任何區間涵蓋時退回 general_adult，但標記 configured=false', () => {
    // 功能上線前的歷史資料。報告必須據此標示「當時未設定個別標準」，
    // 不得假裝那段期間就是用現在這個標準判讀的。
    const resolved = resolveStandardAt(HISTORY, '2026-01-01T00:00:00Z')
    expect(resolved.templateKey).toBe('general_adult')
    expect(resolved.configured).toBe(false)
    expect(resolved.prescribedNote).toBeNull()
  })

  test('完全沒設定過的病人一律 configured=false', () => {
    expect(resolveStandardAt([], '2026-09-23T00:00:00Z').configured).toBe(false)
  })

  test('custom 區間會把 bounds 帶進解析出來的模板', () => {
    const custom = [interval('custom', '2026-01-01T00:00:00Z', null, {
      customBounds: { systolicMin: 100, systolicMax: 130, diastolicMin: 60, diastolicMax: 80 },
    })]
    const resolved = resolveStandardAt(custom, '2026-06-01T00:00:00Z')
    expect(resolved.templateKey).toBe('custom')
    expect(resolved.standard.ladder.kind).toBe('dual-axis')
  })

  test('未知的 template_key 退回 general_adult，不沿用別人的標準', () => {
    // 資料庫回滾到舊版、或本版不認得的 key：退回預設比丟例外安全，
    // 但絕不能靜默沿用上一位病人的標準（§3.5）。
    const rogue = [interval('from_the_future', '2026-01-01T00:00:00Z', null)]
    expect(resolveStandardAt(rogue, '2026-06-01T00:00:00Z').standard.key).toBe('general_adult')
  })

  test('Date 物件與 ISO 字串等價', () => {
    expect(resolveStandardAt(HISTORY, new Date('2026-08-15T09:00:00Z')).templateKey)
      .toBe(resolveStandardAt(HISTORY, '2026-08-15T09:00:00Z').templateKey)
  })
})

describe('currentInterval', () => {
  const NOW = new Date('2026-09-23T00:00:00Z')

  test('回傳此刻涵蓋的那一段', () => {
    expect(currentInterval(HISTORY, NOW)?.templateKey).toBe('general_adult')
  })

  test('全部都已結束時回 null（不會誤把最後一段當成現行）', () => {
    const closed = [interval('post_op_strict', '2026-08-01T00:00:00Z', '2026-09-22T00:00:00Z')]
    expect(currentInterval(closed, NOW)).toBeNull()
  })

  // 排未來生效時，舊區間會拿到一個**未來**的 effectiveTo，而排程中的新區間才是
  // effectiveTo === null 的那一列。只看 null 會讓設定畫面宣稱一個還沒生效的標準已經在用。
  test('排程在未來時，仍回傳此刻真正生效的那一段', () => {
    const scheduled: BpStandardInterval[] = [
      interval('general_adult', '2026-09-22T00:00:00Z', '2026-12-01T00:00:00Z'),
      interval('post_op_strict', '2026-12-01T00:00:00Z', null),
    ]
    expect(currentInterval(scheduled, NOW)?.templateKey).toBe('general_adult')
    // 判讀也必須一致：今天的讀數用今天生效的那一份
    expect(resolveStandardAt(scheduled, NOW.toISOString()).templateKey).toBe('general_adult')
    // 到了生效日才換
    expect(resolveStandardAt(scheduled, '2026-12-01T00:00:00Z').templateKey).toBe('post_op_strict')
  })
})

describe('scheduledIntervals', () => {
  test('列出尚未生效的排程，讓設定畫面說得出「Y 從某日起生效」', () => {
    const scheduled: BpStandardInterval[] = [
      interval('general_adult', '2026-09-22T00:00:00Z', '2026-12-01T00:00:00Z'),
      interval('post_op_strict', '2026-12-01T00:00:00Z', null),
    ]
    const upcoming = scheduledIntervals(scheduled, new Date('2026-09-23T00:00:00Z'))
    expect(upcoming.map(item => item.templateKey)).toEqual(['post_op_strict'])
  })

  test('沒有排程時回空陣列', () => {
    expect(scheduledIntervals(HISTORY, new Date('2026-09-23T00:00:00Z'))).toEqual([])
  })
})

describe('「讀不到標準」與「查過了、沒設定」是兩件不同的事（Codex review，PR #905）', () => {
  test('resolveStandardAt 的兩條路徑都明確標記 unavailable: false', () => {
    // 它是真的查過資料才回答的，所以結果可信——就算結論是「這段期間沒設定」。
    const covered = resolveStandardAt(
      [{ id: 'i', templateKey: 'post_op_strict', customBounds: null, prescribedNote: null, effectiveFrom: '2026-08-01T00:00:00Z', effectiveTo: null }],
      '2026-09-01T00:00:00Z',
    )
    expect(covered.configured).toBe(true)
    expect(covered.unavailable).toBe(false)
    expect(resolveStandardAt([], '2026-09-01T00:00:00Z').unavailable).toBe(false)
  })

  test('UNAVAILABLE_BP_STANDARD_RESOLVER 仍給得出門檻，但把不可信說出來', () => {
    const resolved = UNAVAILABLE_BP_STANDARD_RESOLVER('2026-09-01T00:00:00Z')
    // 仍要給一份門檻：空白的血壓清單比暫時用預設門檻更糟。
    expect(resolved.standard.key).toBe('general_adult')
    // 但不得宣稱「查過了、那段期間沒設定」——那是對醫師陳述一個我們並不知道的事實。
    expect(resolved.configured).toBe(false)
    expect(resolved.unavailable).toBe(true)
  })

  test('報告對這兩種情況印出不同的句子', () => {
    const notConfigured = describeBpStandard(GENERAL_ADULT_RESOLVER('2026-09-01T00:00:00Z'))
    const unavailable = describeBpStandard(UNAVAILABLE_BP_STANDARD_RESOLVER('2026-09-01T00:00:00Z'))
    expect(notConfigured.zh).not.toBe(unavailable.zh)
    expect(unavailable.zh).toContain('讀取失敗')
    // 三語都要有，而且英文不得退回中文（AGENTS.md §3.6；醫師版報告用的是英文那一欄）。
    for (const locale of ['zh', 'id', 'en'] as const) {
      expect(typeof unavailable[locale]).toBe('string')
      expect(unavailable[locale].length).toBeGreaterThan(0)
    }
    expect(/[一-鿿]/.test(unavailable.en)).toBe(false)
  })
})
