/*
檔案用途：把「送出中／成功／失敗」加一則訊息、成功後幾秒自動回到 idle 這組樣板收成一個 hook。
所在層：src/hooks；供只需要單一表單送出狀態（不含資料讀取狀態）的頁面共用。
主要關聯：目前由 FluidBalancePage、PetEndocrinePage 使用；WeightPage 等頁面若讀取狀態與送出狀態本來就分開，
  也可以直接套用。呼叫端仍自行組出雙語訊息文字（例如透過 lib/dataErrors 的 describeSaveError）與 console.error，
  這裡只管理 status/message 本身，避免把各頁不同的錯誤判斷邏輯強行統一。
*/
import { useCallback, useEffect, useRef, useState } from 'react'

export type SaveStatus = 'idle' | 'saving' | 'ok' | 'err'

export function useSaveStatus() {
  const [status, setStatus] = useState<SaveStatus>('idle')
  const [message, setMessage] = useState('')
  // 記錄 succeed() 排的自動回到 idle 計時器：兩秒內若又送出下一筆（例如快速連按或另一筆記錄接著存），
  // 舊計時器仍會在背景把 status 改回 idle，讓表單看起來可再次送出，等同允許同一筆健康資料被重複寫入。
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearIdleTimer = useCallback(() => {
    if (idleTimerRef.current !== null) {
      clearTimeout(idleTimerRef.current)
      idleTimerRef.current = null
    }
  }, [])

  // 送出前呼叫：清掉上一次的訊息與尚未觸發的自動回到 idle 計時器，避免舊的成功／失敗狀態在新請求進行中被覆蓋。
  const begin = useCallback(() => {
    clearIdleTimer()
    setStatus('saving')
    setMessage('')
  }, [clearIdleTimer])

  // 成功後預設 2 秒回到 idle：跟原本三個頁面各自寫的 setTimeout 行為一致，讓成功提示不會永遠停在畫面上。
  const succeed = useCallback((successMessage: string, autoIdleDelayMs = 2000) => {
    clearIdleTimer()
    setStatus('ok')
    setMessage(successMessage)
    idleTimerRef.current = setTimeout(() => {
      idleTimerRef.current = null
      setStatus('idle')
    }, autoIdleDelayMs)
  }, [clearIdleTimer])

  const fail = useCallback((errorMessage: string) => {
    clearIdleTimer()
    setStatus('err')
    setMessage(errorMessage)
  }, [clearIdleTimer])

  // 切換照護對象等情境用來清空上一位對象殘留的訊息。
  const reset = useCallback(() => {
    clearIdleTimer()
    setStatus('idle')
    setMessage('')
  }, [clearIdleTimer])

  // 元件卸載後不得再呼叫 setStatus，避免對已消失的畫面做多餘的狀態更新。
  useEffect(() => clearIdleTimer, [clearIdleTimer])

  return { status, message, setStatus, setMessage, begin, succeed, fail, reset }
}
