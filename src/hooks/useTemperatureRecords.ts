/*
檔案用途：依照照護對象與日期範圍讀取體溫紀錄。
所在層：src/hooks；提供體溫輸入頁與健康趨勢圖共用的讀取轉接層。
主要關聯：body_temperature_records、demoStorage、TemperaturePage 與 TemperatureTrend。
*/
import { useCallback, useEffect, useRef, useState } from 'react'
import dayjs from 'dayjs'
import timezone from 'dayjs/plugin/timezone'
import type { TemperatureRecord } from '../types/database'
import { getDemoTemperatureRecords, isDemoMode } from '../lib/demoStorage'
import { isDemoPatientId } from '../lib/demoData'
import { useI18n } from '../lib/i18n'
import { supabase } from '../lib/supabase'
import { TZ } from '../lib/timezone'

dayjs.extend(timezone)

export function useTemperatureRecords(days = 24, patientId?: string) {
  const { text } = useI18n()
  const [records, setRecords] = useState<TemperatureRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const requestIdRef = useRef(0)

  const fetchRecords = useCallback(async () => {
    const requestId = ++requestIdRef.current
    // 繁體中文註解：病人切換或重抓時，舊請求可能晚回來；只允許最新請求改寫畫面。
    const isCurrentRequest = () => requestId === requestIdRef.current
    const today = dayjs().tz(TZ)
    const since = today.subtract(Math.max(1, days) - 1, 'day').startOf('day')
    const until = today.endOf('day')

    if (!patientId) {
      if (!isCurrentRequest()) return
      setRecords([])
      setLoading(false)
      return
    }

    if (isDemoMode() && isDemoPatientId(patientId)) {
      if (!isCurrentRequest()) return
      setRecords(getDemoTemperatureRecords(days, patientId))
      setError(null)
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)
    const { data, error: queryError } = await supabase
      .from('body_temperature_records')
      .select('*')
      .eq('patient_id', patientId)
      .gte('measured_at', since.toISOString())
      .lte('measured_at', until.toISOString())
      .order('measured_at', { ascending: false })

    if (!isCurrentRequest()) return
    if (queryError) {
      console.error('[body temperature read error]', queryError)
      setRecords([])
      setError(text({ id: 'Gagal membaca suhu. Periksa koneksi lalu coba lagi.', zh: '暫時無法讀取體溫紀錄，請確認網路後重試。', en: 'Temperature log could not be read at this time. Please check your network and try again.' }))
    } else {
      setRecords((data ?? []) as TemperatureRecord[])
    }
    setLoading(false)
  }, [days, patientId, text])

  useEffect(() => {
    // 病人變更時先清掉上一位的紀錄，避免新查詢期間短暫顯示錯誤對象的健康資料。
    setRecords([])
    setError(null)
    setLoading(true)
    void fetchRecords()
    return () => {
      requestIdRef.current += 1
    }
  }, [fetchRecords])

  return { records, loading, error, refetch: fetchRecords }
}
