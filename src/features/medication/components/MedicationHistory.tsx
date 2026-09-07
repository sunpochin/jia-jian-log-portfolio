/*
檔案用途：顯示病人用藥的歷史變更紀錄，包含新增、停藥與劑量修改。
所在層：src/components；為服藥進度頁面的輔助區塊。
主要關聯：由 MedicationPage 載入，讀取 medication_plan_change_logs 顯示時間軸。
*/
import { useEffect, useState } from 'react'
import dayjs from 'dayjs'
import timezone from 'dayjs/plugin/timezone'
import { TZ } from '../../../lib/timezone'
import { readMedicationHistory, formatMedicationDisplayName, formatDoseAmountLocalized, type MedicationPlanChangeLogView } from '../../../lib/medications'
import { MedicationSnapshotNameHeading } from './MedicationNameHeading'
import { useI18n, common } from '../../../lib/i18n'
import { medicationSlotText } from '../../../lib/medicationSchedule'

dayjs.extend(timezone)

export function MedicationHistory({ patientId, nameEnglishFirst }: { patientId: string; nameEnglishFirst: boolean }) {
  const { locale, text } = useI18n()
  const [history, setHistory] = useState<MedicationPlanChangeLogView[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(false)
    readMedicationHistory(patientId)
      .then(data => {
        if (!cancelled) setHistory(data)
      })
      .catch(err => {
        console.error('[medication history read error]', err)
        if (!cancelled) setError(true)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => { cancelled = true }
  }, [patientId])

  if (loading) {
    return <p className="py-4 text-center text-sm text-gray-500">{text(common.loading)}</p>
  }

  if (error) {
    return <section className="rounded-3xl border border-red-200 bg-red-50 p-5 shadow-sm" role="alert">
      <p className="text-center text-sm font-semibold text-red-700">{text({ id: 'Gagal memuat riwayat obat', zh: '無法載入用藥變更紀錄', en: 'Failed to load medication change history' })}</p>
    </section>
  }

  if (history.length === 0) {
    // 這個元件現在是獨立 tab 的唯一內容；沒有資料也要留下狀態，避免點進來像是畫面失效。
    return <section className="rounded-3xl border border-dashed border-slate-300 bg-white p-5 shadow-sm" role="status" aria-labelledby="medication-history-title">
      <h2 id="medication-history-title" className="text-lg font-black text-slate-900">
        {text({ id: 'Riwayat Perubahan Obat', zh: '用藥變更紀錄', en: 'Medication Change History' })}
      </h2>
      <p className="mt-2 text-sm font-medium leading-6 text-slate-600">
        {text({ id: 'Belum ada perubahan obat yang tercatat.', zh: '目前還沒有用藥變更紀錄。', en: 'Not yet ada changes medication that recorded.' })}
      </p>
    </section>
  }

  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm" aria-labelledby="medication-history-title">
      <div className="mb-4">
        <h2 id="medication-history-title" className="text-lg font-black text-slate-900">
          {text({ id: 'Riwayat Perubahan Obat', zh: '用藥變更紀錄', en: 'Medication Change History' })}
        </h2>
        <p className="mt-1 text-xs text-slate-500">
          {text({ id: 'Penambahan, penghentian, dan perubahan dosis.', zh: '藥物新增、停用與劑量調整。', en: 'Penambahan, penghentian, and changes dose.' })}
        </p>
      </div>

      <ol className="relative border-l-2 border-slate-200 ml-2 space-y-4">
        {history.map((log) => {
          const isStop = log.action === 'deactivate'
          const isUpdate = log.action === 'update'
          // 變更紀錄以快照為準；目錄日後改名或 plan 停用，都不能讓歷史卡片換成另一個藥名。
          const snapshot = (isStop ? log.before_snapshot : log.after_snapshot) || {}
          const englishName = snapshot.brand_name || log.medication.brand_name
          const localizedName = (locale === 'zh' ? snapshot.brand_name_zh : null) || formatMedicationDisplayName(log.medication, locale)
          const date = dayjs(log.effective_at || log.recorded_at || log.created_at).tz(TZ)
          
          let actionLabel = text({ id: 'Menambahkan', zh: '新增', en: 'Add' })
          if (isStop) {
            actionLabel = text({ id: 'Menghentikan', zh: '停用', en: 'Disable' })
          } else if (isUpdate) {
            actionLabel = text({ id: 'Mengubah', zh: '調整', en: 'Mengubah' })
          }

          // 繁體中文註解：依據動作布林標記決定徽章顏色，避免依賴翻譯文字比對導致樣式判斷失效。
          let badgeColor = 'bg-emerald-100 text-emerald-800 border-emerald-200'
          if (isStop) {
            badgeColor = 'bg-red-100 text-red-800 border-red-200'
          } else if (isUpdate) {
            badgeColor = 'bg-amber-100 text-amber-800 border-amber-200'
          }

          return (
            <li key={log.id} className="pl-4">
              <div className={`absolute -left-[5px] mt-1.5 h-2 w-2 rounded-full border border-white bg-slate-400 ${isStop ? 'bg-red-400' : 'bg-emerald-400'}`}></div>
              <div className="flex flex-col gap-1">
                <div className="flex flex-wrap items-center gap-x-2 text-xs">
                  <span className={`rounded-md border px-1.5 py-0.5 font-bold ${badgeColor}`}>
                    {actionLabel}
                  </span>
                  <time className="text-slate-500 font-medium">{date.format('YYYY/MM/DD')}</time>
                </div>
                
                <MedicationSnapshotNameHeading englishName={englishName} localizedName={localizedName} englishFirst={nameEnglishFirst} />

                <div className="text-sm text-slate-600 flex flex-wrap gap-x-2">
                  {!isStop && snapshot.schedule_slot && (
                    <span>{text(medicationSlotText(snapshot.schedule_slot))}</span>
                  )}
                  {!isStop && snapshot.dose_amount && (
                    <span>· {formatDoseAmountLocalized(snapshot.dose_amount, snapshot.dosage_form || log.medication.dosage_form, locale)}</span>
                  )}
                  {!isStop && snapshot.as_needed && (
                    <span>· {text({ id: 'Bila perlu', zh: '需要時服用', en: 'Bila perlu' })}</span>
                  )}
                </div>

                {log.reason && (
                  <p className="mt-1 text-sm font-medium text-slate-700 bg-slate-50 rounded-lg p-2 inline-block">
                    {text({ id: 'Alasan', zh: '原因', en: 'Reason' })}: {log.reason}
                  </p>
                )}
              </div>
            </li>
          )
        })}
      </ol>
    </section>
  )
}
