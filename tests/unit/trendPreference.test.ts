/*
檔案用途：驗證趨勢期間與展開狀態的本機偏好讀寫、合法化與失敗 fallback。
所在層：tests/unit；不啟動瀏覽器，也不接觸健康資料或 Supabase。
主要關聯：src/lib/preferences/trendPreference.ts、ModuleTrendSection 與各照護模組的趨勢外框。
*/
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test'
import {
  DEFAULT_TREND_PERIOD,
  TREND_PERIOD_OPTIONS,
  isTrendPeriodDays,
  readTrendExpanded,
  readTrendPeriod,
  saveTrendExpanded,
  saveTrendPeriod,
} from '../../src/lib/preferences/trendPreference'

const store = new Map<string, string>()
let storageThrows = false
const previousLocalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')

beforeAll(() => {
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    writable: true,
    value: {
      getItem: (key: string) => {
        if (storageThrows) throw new Error('SecurityError')
        return store.get(key) ?? null
      },
      setItem: (key: string, value: string) => {
        if (storageThrows) throw new Error('QuotaExceededError')
        store.set(key, value)
      },
    },
  })
})

afterAll(() => {
  if (previousLocalStorage) Object.defineProperty(globalThis, 'localStorage', previousLocalStorage)
  else Reflect.deleteProperty(globalThis, 'localStorage')
})

beforeEach(() => {
  store.clear()
  storageThrows = false
})

describe('trend period preference', () => {
  test('只接受四個明確的趨勢期間', () => {
    expect(TREND_PERIOD_OPTIONS).toEqual([7, 14, 28, 42])
    expect(TREND_PERIOD_OPTIONS.every(isTrendPeriodDays)).toBe(true)
    expect(isTrendPeriodDays(30)).toBe(false)
    expect(isTrendPeriodDays('7')).toBe(false)
    expect(isTrendPeriodDays(null)).toBe(false)
  })

  test('讀取合法期間，其他值回到七天預設', () => {
    expect(readTrendPeriod()).toBe(DEFAULT_TREND_PERIOD)
    store.set('jiajianlog.trend-period', '28')
    expect(readTrendPeriod()).toBe(28)
    store.set('jiajianlog.trend-period', '30')
    expect(readTrendPeriod()).toBe(DEFAULT_TREND_PERIOD)
  })

  test('儲存期間時只寫入數字字串', () => {
    saveTrendPeriod(42)
    expect(store.get('jiajianlog.trend-period')).toBe('42')
  })

  test('storage 讀寫失敗不影響照護頁', () => {
    storageThrows = true
    expect(readTrendPeriod()).toBe(DEFAULT_TREND_PERIOD)
    expect(() => saveTrendPeriod(14)).not.toThrow()
  })
})

describe('trend expanded preference', () => {
  test('預設收合，並可分別記住不同模組的狀態', () => {
    expect(readTrendExpanded('blood-pressure')).toBe(false)
    saveTrendExpanded('blood-pressure', true)
    saveTrendExpanded('temperature', false)
    expect(readTrendExpanded('blood-pressure')).toBe(true)
    expect(readTrendExpanded('temperature')).toBe(false)
    expect(readTrendExpanded('weight')).toBe(false)
    expect(JSON.parse(store.get('jiajianlog.trend-expanded') ?? '')).toEqual({
      'blood-pressure': true,
      temperature: false,
    })
  })

  test('空字串、錯誤 JSON 與非 true 值都安全回到收合', () => {
    store.set('jiajianlog.trend-expanded', '')
    expect(readTrendExpanded('blood-pressure')).toBe(false)
    store.set('jiajianlog.trend-expanded', '{bad json')
    expect(readTrendExpanded('blood-pressure')).toBe(false)
    store.set('jiajianlog.trend-expanded', JSON.stringify({ 'blood-pressure': 'true' }))
    expect(readTrendExpanded('blood-pressure')).toBe(false)
  })

  test('expanded storage 失敗時不拋例外，並保留安全預設', () => {
    storageThrows = true
    expect(readTrendExpanded('blood-pressure')).toBe(false)
    expect(() => saveTrendExpanded('blood-pressure', true)).not.toThrow()
  })
})
