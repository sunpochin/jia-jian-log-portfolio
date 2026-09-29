/*
檔案用途：驗證血壓輸入頁最近量測摘要 (fetchRecentSummary) 的查詢彙整與時段分組計算。
所在層：tests/unit；保護 InputPage 前端最近 3 日時段摘要表格的資料邊界。
主要關聯：src/features/vitals/pages/InputPage.utils.ts、careDay 與 blood_pressure_records 表。
*/
import { describe, expect, mock, test } from 'bun:test'
import { saveDemoBpRecord } from '../../src/lib/demoStorage'

let queryResult: { data: unknown; error: unknown } = { data: [], error: null }

const supabase = {
  from: (_table: string) => {
    const chain: Record<string, (...args: unknown[]) => unknown> = {}
    chain.select = (..._args) => chain
    chain.eq = (..._args) => chain
    chain.gte = (..._args) => chain
    chain.order = (..._args) => chain
    chain.then = (onFulfilled?: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) => Promise.resolve(queryResult).then(onFulfilled, onRejected)
    return chain
  },
}

mock.module('../../src/lib/supabase', () => ({ supabase }))

const { fetchRecentSummary } = await import('../../src/features/vitals/pages/InputPage.utils')
const { DEMO_MEILING_PATIENT_ID } = await import('../../src/lib/demoData')

describe('fetchRecentSummary', () => {
  test('returns empty array when query returns null or empty list', async () => {
    queryResult = { data: null, error: null }
    expect(await fetchRecentSummary('patient-test')).toEqual([])

    queryResult = { data: [], error: null }
    expect(await fetchRecentSummary('patient-test')).toEqual([])
  })

  test('groups records by care date and session and calculates averages', async () => {
    const now = new Date()
    const morningTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 8, 30, 0).toISOString()
    const morningTime2 = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 8, 45, 0).toISOString()
    const eveningTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 20, 15, 0).toISOString()

    queryResult = {
      data: [
        { systolic: 120, diastolic: 80, pulse: 70, measured_at: morningTime },
        { systolic: 130, diastolic: 84, pulse: 74, measured_at: morningTime2 },
        { systolic: 125, diastolic: 85, pulse: null, measured_at: eveningTime },
      ],
      error: null,
    }

    const summaries = await fetchRecentSummary('patient-test')
    expect(summaries.length).toBe(2)

    const morningSummary = summaries.find(s => s.session === 'pagi' || s.session === 'siang' || s.session === 'malam')
    expect(morningSummary).toBeDefined()
    // 檢查平均值四捨五入計算
    const morning = summaries[0]
    expect(morning.avgSys).toBe(125) // (120 + 130) / 2
    expect(morning.avgDia).toBe(82)  // (80 + 84) / 2
    expect(morning.avgPul).toBe(72)  // (70 + 74) / 2

    // 檢查無 pulse 的處理
    const evening = summaries[1]
    expect(evening.avgSys).toBe(125)
    expect(evening.avgDia).toBe(85)
    expect(evening.avgPul).toBe(0) // 空 pulse 陣列平均為 0
  })

  test('in demo mode, reads from local demo records and excludes ones outside the recent window instead of querying Supabase', async () => {
    const originalWindow = globalThis.window
    const values = new Map<string, string>()
    globalThis.window = {
      location: { pathname: '/demo' },
      localStorage: {
        getItem: (k: string) => values.get(k) ?? null,
        setItem: (k: string, v: string) => values.set(k, v),
        removeItem: (k: string) => values.delete(k),
      },
    } as unknown as Window & typeof globalThis

    const now = new Date()
    const withinWindow = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 8, 30, 0).toISOString()
    const longAgo = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 30, 8, 30, 0).toISOString()
    saveDemoBpRecord({ patient_id: DEMO_MEILING_PATIENT_ID, systolic: 118, diastolic: 76, pulse: 68, measured_at: withinWindow })
    saveDemoBpRecord({ patient_id: DEMO_MEILING_PATIENT_ID, systolic: 150, diastolic: 95, pulse: 80, measured_at: longAgo })

    try {
      const summaries = await fetchRecentSummary(DEMO_MEILING_PATIENT_ID)
      expect(summaries).toHaveLength(1)
      expect(summaries[0].avgSys).toBe(118)
    } finally {
      if (originalWindow) globalThis.window = originalWindow
      else delete (globalThis as { window?: unknown }).window
    }
  })
})
