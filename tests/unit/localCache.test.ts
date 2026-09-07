/*
檔案用途：驗證離線快取的 key 分區、壞資料防護與寫入失敗降級行為。
所在層：tests/unit；保護「快取必須綁定 patient_id」與「快取壞掉不得讓畫面崩潰」兩條規則。
主要關聯：src/lib/localCache.ts 與 hooks/useBpRecords 的離線血壓快取。
*/
import { afterEach, describe, expect, test } from 'bun:test'
import {
  clearLocalCache,
  patientScopedCacheKey,
  readLocalCache,
  reviveCachedList,
  writeLocalCache,
} from '../../src/lib/localCache'

// bun 測試環境沒有瀏覽器 localStorage，這裡用最小替身讓純邏輯可被測到。
function installStorage(overrides: Partial<Storage> = {}) {
  const store = new Map<string, string>()
  const storage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => { store.set(key, value) },
    removeItem: (key: string) => { store.delete(key) },
    ...overrides,
  }
  ;(globalThis as unknown as { localStorage: unknown }).localStorage = storage
  return store
}

afterEach(() => {
  delete (globalThis as unknown as { localStorage?: unknown }).localStorage
})

const isRecord = (item: unknown): item is { id: string } =>
  typeof item === 'object' && item !== null && typeof (item as { id?: unknown }).id === 'string'

describe('patientScopedCacheKey', () => {
  test('gives每位照護對象各自的 key，不會互相覆蓋', () => {
    expect(patientScopedCacheKey('bp-records', 'patient-a', 7)).toBe('bp-records-patient-patient-a-7')
    expect(patientScopedCacheKey('bp-records', 'patient-a', 7))
      .not.toBe(patientScopedCacheKey('bp-records', 'patient-b', 7))
  })

  test('separates ranges so a 7-day cache never answers a 30-day question', () => {
    expect(patientScopedCacheKey('bp-records', 'a', 7)).not.toBe(patientScopedCacheKey('bp-records', 'a', 30))
  })

  test('marks a missing patient explicitly instead of sharing one anonymous key', () => {
    expect(patientScopedCacheKey('bp-records', undefined, 7)).toBe('bp-records-missing-patient-7')
  })
})

describe('readLocalCache', () => {
  test('returns null instead of throwing when the cached JSON is corrupt', () => {
    const store = installStorage()
    store.set('k', '{not json')
    expect(readLocalCache('k', parsed => reviveCachedList(parsed, isRecord))).toBeNull()
  })

  test('returns null when storage itself is unavailable', () => {
    installStorage({ getItem: () => { throw new Error('SecurityError') } })
    expect(readLocalCache('k', parsed => reviveCachedList(parsed, isRecord))).toBeNull()
  })

  test('round-trips a written value with its sync time', () => {
    installStorage()
    const savedAt = writeLocalCache('k', [{ id: 'r1' }])
    const cached = readLocalCache('k', parsed => reviveCachedList(parsed, isRecord))
    expect(cached?.value).toEqual([{ id: 'r1' }])
    expect(cached?.savedAt).toBe(savedAt)
  })

  test('returns null instead of crashing when the caller-supplied revive throws', () => {
    const store = installStorage()
    store.set('k', '{"anything":true}')
    expect(readLocalCache('k', () => { throw new Error('revive blew up') })).toBeNull()
  })
})

describe('reviveCachedList', () => {
  test('accepts the legacy bare-array cache with an unknown sync time', () => {
    // 舊版只存陣列；同步時間未知必須如實回報 null，不可自行猜一個時間給醫師看。
    expect(reviveCachedList([{ id: 'r1' }], isRecord)).toEqual({ value: [{ id: 'r1' }], savedAt: null })
  })

  test('accepts the legacy `records` envelope written by older builds', () => {
    expect(reviveCachedList({ records: [{ id: 'r1' }], savedAt: '2026-01-01T00:00:00.000Z' }, isRecord))
      .toEqual({ value: [{ id: 'r1' }], savedAt: '2026-01-01T00:00:00.000Z' })
  })

  test('drops entries missing required fields rather than feeding charts bad rows', () => {
    expect(reviveCachedList([{ id: 'r1' }, { nope: true }, null], isRecord)?.value).toEqual([{ id: 'r1' }])
  })

  test('rejects shapes that are not a cached list at all', () => {
    expect(reviveCachedList('nope', isRecord)).toBeNull()
    expect(reviveCachedList({ value: 'nope' }, isRecord)).toBeNull()
  })
})

describe('writeLocalCache', () => {
  test('degrades to "no offline copy" instead of failing the successful read', () => {
    installStorage({ setItem: () => { throw new Error('QuotaExceededError') } })
    expect(writeLocalCache('k', [{ id: 'r1' }])).toBeNull()
  })

  test('clearLocalCache never throws when storage is unavailable', () => {
    installStorage({ removeItem: () => { throw new Error('SecurityError') } })
    expect(() => clearLocalCache('k')).not.toThrow()
  })
})
