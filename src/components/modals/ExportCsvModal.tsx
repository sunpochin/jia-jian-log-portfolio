/*
檔案用途：提供選擇照護對象並下載完整照護 CSV 的彈出視窗。
所在層：src/components 互動 UI 層；不直接讀取資料庫，交由 accountExport 服務處理。
主要關聯：由 App.tsx 與 TenantApp.tsx 的設定入口掛載，呼叫 lib/accountExport.ts 產生個別檔案。
*/
import { useEffect, useRef, useState } from 'react'
import { useI18n, type LocalizedText } from '../../lib/i18n'
import { downloadAccountCsv } from '../../lib/accountExport'

export interface ExportTarget {
  id: string
  label: LocalizedText
  patientId?: string
}

interface ExportCsvModalProps {
  isOpen: boolean
  onClose: () => void
  targets: ExportTarget[]
}

export function ExportCsvModal({ isOpen, onClose, targets }: ExportCsvModalProps) {
  const { text } = useI18n()
  const [selectedId, setSelectedId] = useState<string>(targets[0]?.id ?? 'all')
  const [isExporting, setIsExporting] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const dialogRef = useRef<HTMLDivElement>(null)
  const cancelButtonRef = useRef<HTMLButtonElement>(null)
  const previousActiveElementRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (isOpen) {
      // 繁體中文註解：保存開啟按鈕，關閉後把焦點送回原處，避免鍵盤使用者跳回頁面頂端。
      previousActiveElementRef.current = document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null
      const timer = window.setTimeout(() => cancelButtonRef.current?.focus(), 0)
      return () => window.clearTimeout(timer)
    }

    // 繁體中文註解：對話框卸載後恢復觸發者焦點，讓下一次 Tab 仍從原本的工作位置繼續。
    previousActiveElementRef.current?.focus()
    previousActiveElementRef.current = null
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        // 匯出仍在非同步寫檔時不可關閉對話框，否則使用者看不到失敗結果且可能重複觸發下載。
        if (isExporting) return
        event.preventDefault()
        onClose()
        return
      }

      if (event.key !== 'Tab' || !dialogRef.current) return
      const focusableElements = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'
      ))
      if (focusableElements.length === 0) return

      const firstElement = focusableElements[0]
      const lastElement = focusableElements[focusableElements.length - 1]
      // 繁體中文註解：背景仍存在於 DOM，需攔截 Tab 才能確保 aria-modal 不只是視覺遮罩。
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
  }, [isOpen, isExporting, onClose])

  if (!isOpen) return null

  const handleExport = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsExporting(true)
    setErrorMessage('')

    try {
      if (selectedId === 'all') {
        // 繁體中文註解：若選擇全體，依據可選對象逐一分開產出 CSV 檔，確保各成員健康資料獨立清晰
        const specificTargets = targets.filter(t => t.id !== 'all')
        if (specificTargets.length > 0) {
          for (const target of specificTargets) {
            await downloadAccountCsv(text(target.label), target.patientId)
          }
        } else {
          throw new Error('No patient selected for CSV export')
        }
      } else {
        const target = targets.find(t => t.id === selectedId)
        if (target) {
          await downloadAccountCsv(text(target.label), target.patientId)
        }
      }
      onClose()
    } catch (err: unknown) {
      console.error('[csv modal export error]', err)
      // 繁體中文註解：匯出錯誤可能含瀏覽器或資料庫內部英文，不能直接漏到 UI；畫面固定使用可理解的雙語訊息。
      setErrorMessage(text({ id: 'Gagal mengunduh CSV.', zh: '匯出 CSV 失敗。', en: 'Export CSV failed.' }))
    } finally {
      setIsExporting(false)
    }
  }

  return (
    <div
      ref={dialogRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="export-csv-title"
      aria-describedby="export-csv-description"
    >
      <div className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-xl text-gray-900 border border-gray-100">
        <div className="flex items-center gap-3 text-blue-600">
          <span className="text-2xl" aria-hidden="true">📥</span>
          <h2 id="export-csv-title" className="text-lg font-black tracking-tight">
            {text({ id: 'Ekspor Data CSV', zh: '匯出 CSV 資料', en: 'Export CSV data' })}
          </h2>
        </div>

        <p id="export-csv-description" className="mt-2 text-xs text-gray-600 leading-relaxed">
          {text({
            id: 'Pilih anggota keluarga untuk mengunduh riwayat tekanan darah, obat, dan perawatan lengkap:',
            zh: '請選擇要匯出的家庭成員；檔案會包含完整血壓、用藥與照護大事記：', en: 'Select a family member to download complete blood pressure, medication, and care history:'
          })}
        </p>

        <form onSubmit={handleExport} className="mt-4 space-y-4">
          <div role="radiogroup" aria-label={text({ id: 'Pilih anggota', zh: '選擇成員', en: 'Select members' })} className="space-y-2">
            {targets.map(target => {
              const active = selectedId === target.id
              return (
                <button
                  key={target.id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => setSelectedId(target.id)}
                  className={`flex w-full items-center justify-between rounded-xl border p-3 text-left transition ${
                    active ? 'border-blue-500 bg-blue-50/60 font-bold text-blue-950' : 'border-gray-200 bg-white text-gray-700'
                  }`}
                >
                  <span className="text-sm">{text(target.label)}</span>
                  <span className={active ? 'text-blue-600 font-bold' : 'text-gray-300'}>
                    {active ? '●' : '○'}
                  </span>
                </button>
              )
            })}
          </div>

          {errorMessage && (
            <p role="alert" className="rounded-xl bg-red-100 p-2.5 text-xs font-semibold text-red-700">
              {errorMessage}
            </p>
          )}

          <div className="flex gap-2 pt-1">
            <button
              ref={cancelButtonRef}
              type="button"
              disabled={isExporting}
              onClick={onClose}
              className="flex-1 rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-xs font-bold text-gray-700 transition active:bg-gray-100 disabled:opacity-50"
            >
              {text({ id: 'Batal', zh: '取消', en: 'CANCEL' })}
            </button>

            <button
              type="submit"
              disabled={isExporting}
              className="flex-1 rounded-xl bg-blue-600 px-3 py-2.5 text-xs font-bold text-white shadow-sm transition active:bg-blue-700 disabled:opacity-50"
            >
              {isExporting
                ? text({ id: 'Mengunduh…', zh: '下載中…', en: 'Downloading…' })
                : text({ id: 'Unduh CSV', zh: '下載 CSV', en: 'Download CSV' })}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
