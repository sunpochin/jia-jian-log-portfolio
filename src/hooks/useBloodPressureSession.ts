/*
檔案用途：管理量血壓倒數提示的 session 狀態，包含跨帳號／跨病人切換時的自動取消判斷。
所在層：src/hooks；封裝 App.tsx 原本內嵌的血壓量測 session state 與相關 effect／callback。
主要關聯：由 App.tsx 呼叫，供 BloodPressureCountdownBanner 與 DailyCarePage 使用；
依賴 lib/bloodPressureMeasurementSession 的讀寫與判斷函式。
*/
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  clearBloodPressureMeasurementSession,
  getBloodPressureMeasurementSessionKey,
  readBloodPressureMeasurementSession,
  saveBloodPressureMeasurementSession,
  shouldCancelBloodPressureMeasurementSession,
  type BloodPressureMeasurementSession,
} from '../lib/bloodPressureMeasurementSession'

interface UseBloodPressureSessionParams {
  loading: boolean
  userId: string | undefined
  resolvedSelectedPatientId: string
}

export function useBloodPressureSession({ loading, userId, resolvedSelectedPatientId }: UseBloodPressureSessionParams) {
  const [bloodPressureMeasurementSession, setBloodPressureMeasurementSession] = useState<BloodPressureMeasurementSession | null>(() => readBloodPressureMeasurementSession())
  const measurementAccountRef = useRef<string | undefined>(undefined)
  const measurementIdentityResolvedRef = useRef(false)

  const completeBloodPressureMeasurementSession = useCallback(() => {
    clearBloodPressureMeasurementSession()
    setBloodPressureMeasurementSession(null)
    // Web banner 是第二次量測的流程狀態；完成或範圍切換時要清掉，iOS 即時測試通知則各自保留紀錄。
  }, [])

  useEffect(() => {
    if (loading) return

    const accountChanged = measurementIdentityResolvedRef.current && measurementAccountRef.current !== userId
    const initialSignedOut = !measurementIdentityResolvedRef.current && !userId && bloodPressureMeasurementSession !== null
    measurementIdentityResolvedRef.current = true
    measurementAccountRef.current = userId

    if (shouldCancelBloodPressureMeasurementSession(
      bloodPressureMeasurementSession,
      resolvedSelectedPatientId,
      accountChanged || initialSignedOut,
    )) {
      // 這裡涵蓋 auth／授權清單／建立病人等直接 setActiveSubject 的路徑，避免只靠 picker callback 才取消通知。
      completeBloodPressureMeasurementSession()
    }
  }, [bloodPressureMeasurementSession, completeBloodPressureMeasurementSession, loading, resolvedSelectedPatientId, userId])

  const startBloodPressureMeasurementSession = (session: BloodPressureMeasurementSession) => {
    // 儲存只是為了重新載入後恢復提示；即使瀏覽器拒絕 sessionStorage，也不能影響已完成的血壓寫入。
    saveBloodPressureMeasurementSession(session)
    setBloodPressureMeasurementSession(session)
  }

  const currentMeasurementSession = bloodPressureMeasurementSession
    && bloodPressureMeasurementSession.patientId === resolvedSelectedPatientId
    && bloodPressureMeasurementSession.sessionKey === getBloodPressureMeasurementSessionKey(resolvedSelectedPatientId)
    ? bloodPressureMeasurementSession
    : null

  return {
    completeBloodPressureMeasurementSession,
    startBloodPressureMeasurementSession,
    currentMeasurementSession,
  }
}
