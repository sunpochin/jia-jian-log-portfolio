/*
檔案用途：依照護對象與天數載入血壓歷史紀錄列表，支援寫入後自動重新整理。
所在層：src/hooks；為讀取與寫入血壓紀錄資料的核心 Custom Hook。
主要關聯：由 BloodPressureReportPanel、EventsPage 與 InputPage 呼叫，並連線 lib/supabase 進行資料庫操作。
*/
import { useState, useEffect, useCallback } from 'react'
import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import timezone from 'dayjs/plugin/timezone'
import { supabase } from '../lib/supabase'
import type { BpRecord } from '../types/database'
import { isDemoPatientId, getFallbackDemoBpRecords } from '../lib/demoData'
import { getDemoBpRecords, isDemoMode } from '../lib/demoStorage'
import { careDayWindow } from '../lib/careDay'
import { useI18n } from '../lib/i18n'
import { describeReadError } from '../lib/dataErrors'
import { patientScopedCacheKey, readLocalCache, reviveCachedList, writeLocalCache } from '../lib/localCache'
import { useLatestRequest } from './useLatestRequest'

dayjs.extend(utc)
dayjs.extend(timezone)

const BP_TIMEZONE = 'Asia/Taipei'

// 讀取失敗的文案要兩種語言都存在，畫面只顯示看護目前選的那一種；不可把兩份文案用斜線串起來顯示。
const BP_READ_ERROR = {
  id: 'Gagal membaca tekanan darah. Periksa koneksi lalu coba lagi.',
  zh: '暫時無法讀取血壓紀錄，請確認網路後重試。', en: 'There was an error reading the blood pressure record, please check your network and try again.',
} as const

// 快取可能來自舊版本；缺少關鍵欄位的紀錄直接丟掉，不讓壞資料流進圖表與報告。
function isCachedBpRecord(item: unknown): item is BpRecord {
  if (typeof item !== 'object' || item === null) return false
  const record = item as Record<string, unknown>
  return typeof record.id === 'string' && typeof record.measured_at === 'string'
}

// 血壓查詢只接受 patient UUID；不能再讓 UI 以可猜測的角色字串當資料邊界。
export function useBpRecords(days = 7, patientId?: string) {
  const { text } = useI18n()
  const [records, setRecords] = useState<BpRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isOfflineData, setIsOfflineData] = useState(false)
  const [cacheUpdatedAt, setCacheUpdatedAt] = useState<string | null>(null)
  const request = useLatestRequest()

  const fetch = useCallback(async () => {
    // 切換照護對象時前一位的查詢可能較晚回來；過期結果一律不得回寫，避免顯示錯人的血壓。
    const isCurrent = request.begin()
    // 「7 天」代表目前照護日往前的 7 個 04:00–04:00 區間；真實量測時間仍不會被改寫。
    const { start: since, end: until } = careDayWindow(days, dayjs().tz(BP_TIMEZONE))
    if (isDemoMode() && patientId && isDemoPatientId(patientId)) {
      // Demo 的本機變更要先於 Supabase fallback，否則匿名讀取只會重新拿到固定故事而看不到剛輸入的數值。
      if (!isCurrent()) return
      setRecords(getDemoBpRecords(days, patientId))
      setError(null)
      setIsOfflineData(false)
      setCacheUpdatedAt(null)
      setLoading(false)
      return
    }
    // 1. 先嘗試從快取讀取，以便即時顯示與支援離線模式
    const cacheKey = patientScopedCacheKey('bp-records', patientId, days)
    const cached = readLocalCache(cacheKey, parsed => reviveCachedList<BpRecord>(parsed, isCachedBpRecord))
    const hasCache = cached !== null
    if (!isCurrent()) return
    if (!cached) {
      setCacheUpdatedAt(null)
    } else {
      setRecords(cached.value.filter(record => {
        const measuredAt = dayjs(record.measured_at)
        // 繁體中文註解：照護日窗是半開區間，隔日 04:00 必須留給下一頁，避免快取和 Supabase 查詢分組不同。
        return !measuredAt.isBefore(since) && measuredAt.isBefore(until)
      }))
      setCacheUpdatedAt(cached.savedAt)
    }

    // 如果沒有快取才顯示載入中，避免畫面閃爍；先清空上一位對象的資料，避免切換期間誤看錯人的血壓。
    if (!hasCache) {
      setLoading(true)
      setRecords([])
      setIsOfflineData(false)
    }
    setError(null)

    try {
      let query = supabase
        .from('blood_pressure_records')
        .select('*')
        .gte('measured_at', since.toISOString())
        .lt('measured_at', until.toISOString())
        .order('measured_at', { ascending: false })

      // 沒有 UUID 時不查詢；呼叫端會先顯示安全提示，避免退回 legacy subject 全表篩選。
      if (patientId) query = query.eq('patient_id', patientId)
      // 提早結束仍會走到 finally 收掉 loading，沒有選定對象時畫面不會停在載入中。
      else return

      const { data, error: err } = await query
      if (!isCurrent()) return

      if (err || (!data || data.length === 0)) {
        if (isDemoPatientId(patientId)) {
          const fallback = getFallbackDemoBpRecords(days, patientId)
          setRecords(fallback)
          setIsOfflineData(false)
          setError(null)
        } else if (err) {
          // 如果已經有快取資料，不要顯示嚴重的錯誤訊息給使用者，只記錄在 console，讓他們在離線時也能看資料
          if (hasCache) {
            setIsOfflineData(true)
            console.warn('Network fetch failed, using cached data.', err.message)
          } else {
            // 沒有可回退的快取時必須清空狀態，避免查詢失敗仍短暫顯示上一位照護對象的讀值。
            setRecords([])
            setIsOfflineData(false)
            // 繁體中文註解：後端原始錯誤常含資料表或服務名稱，畫面只提供使用者可採取的下一步，細節留在 console。
            console.error('[blood pressure record read error]', err)
            setError(text(describeReadError(err, BP_READ_ERROR)))
          }
        } else {
          setRecords([])
        }
      } else {
        setRecords(data)
        // 快取連同同步時間保存，離線交給醫師或 GPT 時才能判斷資料是否可能過期。
        setCacheUpdatedAt(writeLocalCache(cacheKey, data))
        setIsOfflineData(false) // 成功讀取真實資料，關閉離線資料標記
      }
    } catch (e) {
      // 捕捉網路斷線等連線異常
      if (!isCurrent()) return
      if (hasCache) {
        setIsOfflineData(true)
        console.warn('Network fetch failed due to exception, using cached data.', e)
      } else {
        // 例外路徑也要清空舊資料；網路中斷不應讓畫面把上一位病人的資料當成目前結果。
        setRecords([])
        setIsOfflineData(false)
        console.error('[blood pressure record read exception]', e)
        setError(text(describeReadError(e, BP_READ_ERROR)))
      }
    } finally {
      if (isCurrent()) setLoading(false)
    }
  }, [days, patientId, request, text])

  useEffect(() => { fetch() }, [fetch])

  return { records, loading, error, isOfflineData, cacheUpdatedAt, refetch: fetch }
}
