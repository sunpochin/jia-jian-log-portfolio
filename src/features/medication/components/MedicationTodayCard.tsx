/*
檔案用途：顯示與操作特定帳號的今日服藥紀錄 MVP 卡片，支援跨裝置同步與安全復原。
所在層：src/components；為 DailyCarePage/InputPage 所掛載的服藥狀態卡片。
主要關聯：使用 lib/medicationToday 資料層與 lib/i18n 雙語文字機制。
*/
import { useEffect, useState } from 'react'
import dayjs from 'dayjs'
import timezone from 'dayjs/plugin/timezone'
import utc from 'dayjs/plugin/utc'
import { useI18n } from '../../../lib/i18n'
import {
  clearMedicationTodayLog,
  MEDICATION_TZ,
  getMedicationSyncErrorKind,
  medicationSyncErrorMessage,
  readMedicationTodayLog,
  saveMedicationTodayLog,
  taipeiDateKey,
  TODAY_MEDICATION_MVP,
  type MedicationTodayLog,
} from '../../../lib/medicationToday'
import { useConfirm } from '../../../hooks/useConfirm'

dayjs.extend(utc)
dayjs.extend(timezone)

export function MedicationTodayCard({ userEmail }: { userEmail?: string }) {
  const { text } = useI18n()
  const { confirm, dialog: confirmDialog } = useConfirm()
  const normalizedEmail = userEmail?.trim().toLowerCase()
  const isTargetAccount = normalizedEmail === TODAY_MEDICATION_MVP.accountEmail
  const [today, setToday] = useState(() => taipeiDateKey())
  const [log, setLog] = useState<MedicationTodayLog | null>(null)
  const [status, setStatus] = useState<'loading' | 'idle' | 'saving' | 'error'>('loading')
  const [errorMessage, setErrorMessage] = useState('')

  useEffect(() => {
    // 04:00 是照護日的硬邊界；每秒檢查避免卡片在切日後仍顯示前一天近一分鐘。
    const timer = setInterval(() => setToday(taipeiDateKey()), 1_000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    if (!isTargetAccount || !normalizedEmail) {
      setLog(null)
      setStatus('idle')
      return
    }

    let cancelled = false
    setStatus('loading')
    readMedicationTodayLog(normalizedEmail, TODAY_MEDICATION_MVP.medicationId, today)
      .then(result => {
        if (cancelled) return
        setLog(result)
        setStatus('idle')
        setErrorMessage('')
      })
      .catch(error => {
        if (cancelled) return
        // 繁體中文註解：跨裝置同步失敗時不能假裝沒吃，直接顯示錯誤避免使用者用錯資訊判斷是否補吃。
        console.error('[medication today read error]', error)
        setErrorMessage(medicationSyncErrorMessage(getMedicationSyncErrorKind(error)))
        setStatus('error')
      })
    return () => { cancelled = true }
  }, [isTargetAccount, normalizedEmail, today])

  if (!isTargetAccount || !normalizedEmail) return null

  const takenTime = log ? dayjs(log.takenAt).tz(MEDICATION_TZ).format('HH:mm') : null

  const markTaken = () => {
    if (log || status === 'saving') return
    setStatus('saving')
    // 繁體中文註解：改存 Supabase，讓 iPhone 與 Mac Chrome 讀同一筆紀錄，而不是各自相信自己的瀏覽器。
    saveMedicationTodayLog(normalizedEmail, TODAY_MEDICATION_MVP.medicationId, today)
      .then(result => {
        setLog(result)
        setStatus('idle')
        setErrorMessage('')
      })
      .catch(error => {
        console.error('[medication today save error]', error)
        setErrorMessage(medicationSyncErrorMessage(getMedicationSyncErrorKind(error)))
        setStatus('error')
      })
  }

  const undoTaken = async () => {
    // 繁體中文註解：取消會刪除跨裝置共用的今日紀錄，先以雙語二次確認，避免手滑後所有裝置都誤判為未服藥。
    const confirmPrompt = text({
      id: 'Apakah Anda yakin ingin membatalkan catatan obat hari perawatan ini?\nTindakan ini akan disinkronkan ke perangkat lain.',
      zh: '確定要取消本照護日的服藥紀錄嗎？\n此操作會同步到其他裝置。', en: 'Apakah You yakin ingin membatalkan record medication days care this?\nTindakan this will disinkronkan to pernumberst lain.',
    })
    if (!(await confirm(confirmPrompt, { danger: true }))) return

    setStatus('saving')
    clearMedicationTodayLog(normalizedEmail, TODAY_MEDICATION_MVP.medicationId, today)
      .then(() => {
        setLog(null)
        setStatus('idle')
        setErrorMessage('')
      })
      .catch(error => {
        console.error('[medication today clear error]', error)
        setErrorMessage(medicationSyncErrorMessage(getMedicationSyncErrorKind(error)))
        setStatus('error')
      })
  }

  return (
    <section className="shrink-0 px-5 pt-2 pb-1.5">
      {confirmDialog}
      <div className={`rounded-2xl border px-4 py-3 ${
        log ? 'bg-green-50 border-green-200 text-green-900' : 'bg-amber-50 border-amber-200 text-amber-900'
      }`}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide opacity-70">
              {text({ id: 'Obat hari perawatan ini', zh: '本照護日服藥', en: 'Taking medication on this day of care' })}
            </p>
            <h2 className="mt-0.5 text-lg font-black">{TODAY_MEDICATION_MVP.nameZh}</h2>
            <p className="mt-0.5 text-xs opacity-75">{text({ id: 'Hari perawatan', zh: '照護日', en: 'Care Day' })} · {today}</p>
          </div>
          <span className="text-2xl leading-none">{log ? '✅' : '💊'}</span>
        </div>

        <button
          type="button"
          onClick={markTaken}
          disabled={Boolean(log) || status === 'loading' || status === 'saving'}
          aria-busy={status === 'loading' || status === 'saving'}
          className={`mt-3 w-full rounded-xl py-3 text-sm font-black transition-all disabled:cursor-not-allowed ${
            log ? 'bg-green-100 text-green-700' : 'bg-amber-500 text-white active:scale-[0.99]'
          }`}
        >
          {status === 'loading' ? text({ id: 'Memuat catatan hari perawatan ini...', zh: '讀取本照護日紀錄…', en: 'Loading record days care this...' }) :
           status === 'saving' ? text({ id: 'Menyinkronkan...', zh: '同步中…', en: 'Syncing…' }) :
           log ? text({ id: `Sudah minum obat pada hari perawatan ini${takenTime ? ` · ${takenTime}` : ''}`, zh: `本照護日已吃過${takenTime ? ` · ${takenTime}` : ''}`, en: `Taken on this care day${takenTime ? ` · ${takenTime}` : ''}` }) :
           text({ id: 'Saya sudah minum, catat hari perawatan ini', zh: '我吃完了，記錄本照護日已服用', en: 'I’m done, record that the care day has been taken' })}
        </button>

        {status === 'error' && (
          <p className="mt-2 text-center text-xs font-semibold text-red-600">
            {errorMessage}
          </p>
        )}

        {log && (
          <button
            type="button"
            onClick={undoTaken}
            disabled={status === 'saving'}
            className="mt-2 w-full text-xs font-semibold text-green-700 underline underline-offset-2 disabled:opacity-50"
          >
            {text({ id: 'Salah tekan, batalkan catatan hari perawatan ini', zh: '誤按，取消本照護日紀錄', en: 'Salah tekan, batalkan record days care this' })}
          </button>
        )}
      </div>
    </section>
  )
}
