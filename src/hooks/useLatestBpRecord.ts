/*
檔案用途：讀取指定照護對象最新一筆血壓紀錄，提供即時輸入頁面的安全確認訊號。
所在層：src/hooks；為讀取單筆最新資料的專用 Custom Hook。
主要關聯：由 InputPage 與 LatestVitals 呼叫，並使用 lib/supabase 進行單筆資料查詢。
*/
import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { BpRecord } from '../types/database'
import { isDemoPatientId } from '../lib/demoData'
import { getDemoBpRecords, isDemoMode } from '../lib/demoStorage'
import { useI18n } from '../lib/i18n'
import { describeReadError } from '../lib/dataErrors'
import { useLatestRequest } from './useLatestRequest'

// 讀取失敗一律走共用雙語訊息；Supabase 原始 err.message 是英文且常含資料表名稱，不可直接顯示給看護。
const LATEST_BP_READ_ERROR = {
  id: 'Gagal membaca pembacaan terakhir. Periksa koneksi lalu coba lagi.',
  zh: '暫時無法讀取最新血壓，請確認網路後重試。', en: 'There was an error reading the latest blood pressure, please check your network and try again.',
} as const

// A separate one-row query keeps the input page light. The caregiver needs a
// confidence signal ("Supabase already has the latest reading") without loading
// the full dashboard dataset after every measurement.
export function useLatestBpRecord(patientId: string) {
  const { text } = useI18n()
  const [record, setRecord] = useState<BpRecord | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const request = useLatestRequest()
  // 記錄目前真正選擇的病人；避免切換對象後才完成的舊查詢把結果寫回新對象畫面。
  const patientIdRef = useRef(patientId)
  useEffect(() => {
    patientIdRef.current = patientId
  }, [patientId])

  const setOptimisticRecord = useCallback((nextRecord: BpRecord) => {
    // 寫入已成功才接受這個快照；先更新畫面可避免手機網路慢時把「已保存」誤顯示成空白。
    // invalidate 讓仍在飛的查詢無法把這個較新的結果蓋掉。
    request.invalidate()
    setRecord(nextRecord)
    setError(null)
    setLoading(false)
  }, [request])

  const refetch = useCallback(async () => {
    const isCurrent = request.begin()
    const requestedPatientId = patientId
    setLoading(true)
    setError(null)
    setRecord(null)

    if (isDemoMode() && isDemoPatientId(patientId)) {
      // 最新卡片也必須讀同一份本機 overlay；只更新明細列表會讓頁首仍顯示舊的固定故事值。
      setRecord(getDemoBpRecords(90, patientId)[0] ?? null)
      setLoading(false)
      return
    }

    const { data, error: err } = await supabase
      .from('blood_pressure_records')
      .select('*')
      .eq('patient_id', patientId)
      .order('measured_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    // 對象切換時舊查詢可能較晚回來；只接受最後一次請求，且發起時的病人仍是目前對象，避免把前一人的健康資料短暫顯示給目前對象。
    if (!isCurrent() || patientIdRef.current !== requestedPatientId) return

    if (err) {
      console.error('[latest blood pressure read error]', err)
      setError(text(describeReadError(err, LATEST_BP_READ_ERROR)))
    } else {
      setRecord(data ?? null)
    }
    setLoading(false)
  }, [patientId, request, text])

  useEffect(() => { refetch() }, [refetch])

  return { record, loading, error, refetch, setOptimisticRecord }
}
