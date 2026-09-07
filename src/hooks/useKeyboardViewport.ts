/*
檔案用途：偵測軟鍵盤造成的 visual viewport 壓縮，供手機輸入畫面切換精簡模式。
所在層：src/hooks；提供 App 外殼與每日照護頁共用的瀏覽器狀態轉接。
主要關聯：InputPage、DailyCarePage 與 App.tsx 依此暫時讓出非必要導覽與資訊高度。
*/
import { useEffect, useRef, useState } from 'react'

export const KEYBOARD_VIEWPORT_THRESHOLD = 150

export function isKeyboardViewportOpen(innerHeight: number, viewportHeight: number, scale = 1, hasEditableFocus = true, wasKeyboardOpen = false) {
  // 繁體中文註解：150px 可避開 Safari 工具列的小幅變動，只有真正鍵盤壓縮才切換模式。
  // 繁體中文註解：縮放也會讓 visual viewport 變矮；必須有輸入焦點，或已在鍵盤模式中，才能避免誤藏導覽。
  return innerHeight - viewportHeight > KEYBOARD_VIEWPORT_THRESHOLD
    && scale <= 1.01
    && (hasEditableFocus || wasKeyboardOpen)
}

// 鍵盤收合動畫期間，visualViewport 常連續送出好幾個高度尚未回穩的中間值；
// 若每次都立即切回「鍵盤已關閉」，底部導覽列會在動畫過程中忽隱忽現、跳來跳去。
// 只有「回到已關閉」這個方向需要這個緩衝，「偵測到鍵盤開啟」仍要立即生效才能馬上讓出輸入空間。
const KEYBOARD_CLOSE_SETTLE_MS = 120

export function useKeyboardViewport() {
  const [keyboardOpen, setKeyboardOpen] = useState(false)
  const keyboardOpenRef = useRef(false)
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const viewport = window.visualViewport
    if (!viewport) return

    const clearPendingClose = () => {
      if (closeTimerRef.current !== null) {
        clearTimeout(closeTimerRef.current)
        closeTimerRef.current = null
      }
    }

    const commit = (next: boolean) => {
      keyboardOpenRef.current = next
      setKeyboardOpen(next)
    }

    const update = () => {
      const active = document.activeElement
      const hasEditableFocus = active instanceof HTMLInputElement
        || active instanceof HTMLTextAreaElement
        || active instanceof HTMLSelectElement
        || active instanceof HTMLElement && active.isContentEditable
      const next = isKeyboardViewportOpen(window.innerHeight, viewport.height, viewport.scale, hasEditableFocus, keyboardOpenRef.current)
      if (next === keyboardOpenRef.current) { clearPendingClose(); return }
      if (next) { clearPendingClose(); commit(true); return }
      // 準備轉為「關閉」；等高度在短暫延遲後仍然回穩才真的顯示導覽列，避免動畫中途誤判。
      clearPendingClose()
      closeTimerRef.current = setTimeout(() => {
        closeTimerRef.current = null
        const stillClosed = !isKeyboardViewportOpen(window.innerHeight, viewport.height, viewport.scale, hasEditableFocus, keyboardOpenRef.current)
        if (stillClosed) commit(false)
      }, KEYBOARD_CLOSE_SETTLE_MS)
    }
    viewport.addEventListener('resize', update)
    viewport.addEventListener('scroll', update)
    update()

    return () => {
      clearPendingClose()
      viewport.removeEventListener('resize', update)
      viewport.removeEventListener('scroll', update)
    }
  }, [])

  return keyboardOpen
}
