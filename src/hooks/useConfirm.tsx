/*
檔案用途：以畫面內對話框取代 window.confirm，回傳 Promise<boolean> 供既有的
  `if (!confirm(...)) return` 寫法直接改成 `if (!(await confirm(...))) return`。
所在層：src/hooks；提供給任何需要「危險操作前二次確認」的元件。
主要關聯：取代先前散落在 AdminPage／CareTimeline／CareRecipientManagement／
  HouseholdMemberManagement／MedicationTodayCard／MedicationAdminSection／
  TemperaturePage／DailyBloodPressureRecords 各處的 window.confirm 呼叫——
  部分行動瀏覽器在短時間內彈出多次原生對話框後會直接封鎖或讓 confirm() 拋出例外，
  讓整個送出流程在畫面上毫無反應（真實案例：儲存藥物調整時「按了沒反應」）。
*/
import { useCallback, useEffect, useRef, useState } from 'react'
import { useI18n } from '../lib/i18n'

interface ConfirmOptions {
  // 標記為 true 時確認鈕改用紅色警示樣式；用於「無法復原」等真正危險的操作。
  danger?: boolean
}

interface ConfirmRequest extends ConfirmOptions {
  message: string
  resolve: (result: boolean) => void
}

export function useConfirm() {
  const { text } = useI18n()
  const [request, setRequest] = useState<ConfirmRequest | null>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  const cancelButtonRef = useRef<HTMLButtonElement>(null)
  const previousActiveElementRef = useRef<HTMLElement | null>(null)

  // 呼叫端維持跟 window.confirm 一樣同步好讀的寫法：await confirm(message)。
  const confirm = useCallback((message: string, options?: ConfirmOptions) => {
    return new Promise<boolean>(resolve => {
      setRequest({ message, resolve, ...options })
    })
  }, [])

  const settle = useCallback((result: boolean) => {
    setRequest(current => {
      current?.resolve(result)
      return null
    })
  }, [])

  // 這兩個 effect 只碰真實瀏覽器才有的 DOM API；專案的 bun test 執行環境沒有 jsdom，
  // 部分測試檔會把 globalThis.document 換成極簡替身（例如只有 documentElement），
  // 缺 addEventListener／HTMLElement 時必須整段跳過，而不是讓對話框本身把測試打爆。
  const hasDom = typeof document !== 'undefined' && typeof document.addEventListener === 'function' && typeof HTMLElement !== 'undefined'

  useEffect(() => {
    if (!hasDom) return
    if (request) {
      // 跟 DeleteAccountModal 一致：先聚焦取消鈕，避免危險動作變成對話框開啟後的預設操作。
      previousActiveElementRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
      const timer = window.setTimeout(() => cancelButtonRef.current?.focus(), 0)
      return () => window.clearTimeout(timer)
    }
    previousActiveElementRef.current?.focus()
    previousActiveElementRef.current = null
  }, [hasDom, request])

  useEffect(() => {
    if (!hasDom || !request) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        settle(false)
        return
      }
      if (event.key !== 'Tab' || !dialogRef.current) return
      const focusableElements = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'
      ))
      if (focusableElements.length === 0) return
      const firstElement = focusableElements[0]
      const lastElement = focusableElements[focusableElements.length - 1]
      if (event.shiftKey && (document.activeElement === firstElement || !dialogRef.current.contains(document.activeElement))) {
        event.preventDefault()
        lastElement.focus()
      } else if (!event.shiftKey && (document.activeElement === lastElement || !dialogRef.current.contains(document.activeElement))) {
        event.preventDefault()
        firstElement.focus()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [hasDom, request, settle])

  const dialog = request && (
    <div
      ref={dialogRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs"
      role="alertdialog"
      aria-modal="true"
      aria-describedby="confirm-dialog-message"
    >
      <div className="w-full max-w-sm rounded-3xl border border-gray-100 bg-white p-5 text-gray-900 shadow-xl">
        {/* 保留原生 confirm() 對多行文字（\n）的排版方式，避免醫囑摘要擠成一行看不清楚。 */}
        <p id="confirm-dialog-message" className="whitespace-pre-line text-sm leading-relaxed">{request.message}</p>
        <div className="mt-4 flex gap-2">
          <button
            ref={cancelButtonRef}
            type="button"
            onClick={() => settle(false)}
            className="min-h-11 flex-1 rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-xs font-bold text-gray-700 transition active:bg-gray-100"
          >
            {text({ id: 'Batal', zh: '取消' ,en: "Cancel" })}
          </button>
          <button
            type="button"
            onClick={() => settle(true)}
            className={`min-h-11 flex-1 rounded-xl px-3 py-2.5 text-xs font-bold text-white shadow-sm transition ${request.danger ? 'bg-red-600 active:bg-red-700' : 'bg-emerald-700 active:bg-emerald-800'}`}
          >
            {text({ id: 'Konfirmasi', zh: '確定' ,en: "Confirm" })}
          </button>
        </div>
      </div>
    </div>
  )

  return { confirm, dialog }
}
