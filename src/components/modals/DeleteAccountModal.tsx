/*
檔案用途：二次確認與執行刪除帳號/清空個人資料的跳出對話框。
所在層：src/components；為帳號安全與隱私刪除對話框。
主要關聯：由 SettingsPage 載入，呼叫 Supabase Auth 清除帳號。
*/
import { useEffect, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { signOut } from '../../lib/auth'
import { useI18n } from '../../lib/i18n'

interface DeleteAccountModalProps {
  isOpen: boolean
  onClose: () => void
}

export function DeleteAccountModal({ isOpen, onClose }: DeleteAccountModalProps) {
  const { text } = useI18n()
  const [confirmInput, setConfirmInput] = useState('')
  const [status, setStatus] = useState<'idle' | 'deleting' | 'error'>('idle')
  const [errorMessage, setErrorMessage] = useState('')
  const dialogRef = useRef<HTMLDivElement>(null)
  const cancelButtonRef = useRef<HTMLButtonElement>(null)
  const previousActiveElementRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (isOpen) {
      // 繁體中文註解：先聚焦取消按鈕，避免危險動作成為對話框開啟後的意外預設操作。
      previousActiveElementRef.current = document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null
      const timer = window.setTimeout(() => cancelButtonRef.current?.focus(), 0)
      return () => window.clearTimeout(timer)
    }

    // 繁體中文註解：刪除確認結束或取消後回到觸發按鈕，避免焦點遺失到背景文件。
    previousActiveElementRef.current?.focus()
    previousActiveElementRef.current = null
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        // 繁體中文註解：刪除 RPC 執行期間不可離開對話框，避免使用者誤以為動作已取消。
        if (status === 'deleting') {
          event.preventDefault()
          return
        }
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
      // 繁體中文註解：aria-modal 不會自動阻擋背景 Tab，因此在文件層攔截循環焦點。
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
  }, [isOpen, onClose, status])

  if (!isOpen) return null

  const isConfirmed = confirmInput.trim() === 'DELETE'

  const handleDelete = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!isConfirmed || status === 'deleting') return

    setStatus('deleting')
    setErrorMessage('')

    try {
      // 繁體中文註解：呼叫後端 delete_user_account RPC 安全清理用戶 profiles 與 auth.users 紀錄
      const { error } = await supabase.rpc('delete_user_account')
      if (error) {
        console.error('[delete account rpc error]', error)
        setErrorMessage(text({
          id: 'Gagal menghapus akun, silakan coba lagi nanti.',
          zh: '刪除帳號失敗，請稍後再試。', en: 'Account deletion failed, please try again later.'
        }))
        setStatus('error')
        return
      }

      // 刪除成功後一律登出並清理 client-side session
      await signOut()
    } catch (err) {
      console.error('[delete account exception]', err)
      setErrorMessage(text({
        id: 'Terjadi kesalahan saat menghapus akun.',
        zh: '刪除帳號時發生錯誤。', en: 'There was an error deleting your account.'
      }))
      setStatus('error')
    }
  }

  return (
    <div
      ref={dialogRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-account-title"
      aria-describedby="delete-account-description"
    >
      <div className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-xl text-gray-900 border border-gray-100">
        <div className="flex items-center gap-3 text-red-600">
          <span className="text-2xl" aria-hidden="true">⚠️</span>
          <h2 id="delete-account-title" className="text-lg font-black tracking-tight">
            {text({ id: 'Hapus Akun', zh: '刪除帳號', en: 'DELETE ACCOUNT' })}
          </h2>
        </div>

        <div id="delete-account-description" className="mt-3 rounded-2xl bg-red-50 p-3.5 text-xs leading-relaxed text-red-800 border border-red-200">
          <p className="font-bold">
            {text({ id: 'Tindakan ini tidak dapat dibatalkan!', zh: '此動作無法復原！', en: 'This cannot be undone.' })}
          </p>
          <p className="mt-1">
            {text({
              id: 'Semua profil, pengaturan, dan catatan darah Anda akan dihapus secara permanen dari sistem.',
              zh: '您的個人設定、存取權限與所有血壓紀錄將會被永久刪除。', en: 'Your personal settings, access rights, and all blood pressure records will be permanently deleted.'
            })}
          </p>
        </div>

        <form onSubmit={handleDelete} className="mt-4 space-y-4">
          <label className="block text-xs font-bold text-gray-700">
            {text({
              id: 'Ketik "DELETE" di bawah untuk mengonfirmasi:',
              zh: '請在下方輸入 "DELETE" 以確認刪除：',
             en: 'Type "DELETE" below to confirm:'
            })}
            <input
              type="text"
              required
              value={confirmInput}
              onChange={e => setConfirmInput(e.target.value)}
              placeholder="DELETE"
              className="mt-1.5 w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm font-semibold tracking-wider placeholder:font-normal placeholder:tracking-normal focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-200"
            />
          </label>

          {errorMessage && (
            <p role="alert" className="rounded-xl bg-red-100 p-2.5 text-xs font-semibold text-red-700">
              {errorMessage}
            </p>
          )}

          <div className="flex gap-2 pt-1">
            <button
              ref={cancelButtonRef}
              type="button"
              disabled={status === 'deleting'}
              onClick={onClose}
              className="flex-1 rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-xs font-bold text-gray-700 transition active:bg-gray-100 disabled:opacity-50"
            >
              {text({ id: 'Batal', zh: '取消', en: 'CANCEL' })}
            </button>

            <button
              type="submit"
              disabled={!isConfirmed || status === 'deleting'}
              className="flex-1 rounded-xl bg-red-600 px-3 py-2.5 text-xs font-bold text-white shadow-sm transition active:bg-red-700 disabled:opacity-40"
            >
              {status === 'deleting'
                ? text({ id: 'Menghapus…', zh: '刪除中…', en: 'Deleting...' })
                : text({ id: 'Hapus Akun', zh: '確認刪除', en: 'Delete account' })}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
