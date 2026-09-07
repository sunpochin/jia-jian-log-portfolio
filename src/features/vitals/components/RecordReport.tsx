/*
檔案用途：將血壓原始紀錄整理成每日列表、結構化報告、CSV 與 GPT 摘要輸出。
所在層：src/components；由血壓模組的近期趨勢與封存對象唯讀歷史頁共用的報告內容元件。
主要關聯：由 BloodPressureReportPanel 傳入紀錄，使用 lib/recordReport 計算模型，並以 VitalReading 與 PulseReading 呈現固定生命徵象樣式。
*/
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import dayjs from 'dayjs'
import 'dayjs/locale/id'
import 'dayjs/locale/zh-tw'
import utc from 'dayjs/plugin/utc'
import timezone from 'dayjs/plugin/timezone'
import type { BpRecord } from '../../../types/database'
import { evaluateReading } from '../../../types/database'
import { SESSION_LABELS } from '../../../lib/dashboardStats'
import { buildGptReportText, buildRecordCsv, buildRecordReportModel, reportWindow, REPORT_TIMEZONE } from '../../../lib/recordReport'
import { formatDoseAmountLocalized, formatMedicationDisplayName, type MedicationPlanView } from '../../../lib/medications'
import { compareMedicationSlots, medicationSlotText } from '../../../lib/medicationSchedule'
import { PulseReading, VitalReading } from './VitalReading'
import { type LocalizedText, useI18n } from '../../../lib/i18n'
import { CARE_DAY_START_HOUR } from '../../../lib/careDay'
import { PrintSourceFooter } from '../../../components/system/PrintSourceFooter'

// 元件可能被測試或 lazy-load 單獨載入，不能依賴 recordReport 的副作用先註冊 .tz()。
dayjs.extend(utc)
dayjs.extend(timezone)

type RecordFilter = 'all' | 'flagged'

export function RecordReport({ records, subjectLabel, selectedDays, canExport, isOfflineData, cacheUpdatedAt, currentMedications = [] }: {
  records: BpRecord[]
  subjectLabel: string
  selectedDays: number
  canExport: boolean
  isOfflineData: boolean
  cacheUpdatedAt: string | null
  currentMedications?: MedicationPlanView[]
}) {
  const { locale, text } = useI18n()
  const [filter, setFilter] = useState<RecordFilter>('all')
  const [actionStatus, setActionStatus] = useState<{ kind: 'success' | 'error'; text: string } | null>(null)
  const model = useMemo(() => buildRecordReportModel(records), [records])
  // 定期藥依時段分組方便對照藥袋；「需要時」藥效不固定時段，另外整段列出，不能混進固定時段分組誤導成規律服藥。
  const scheduledMedicationGroups = useMemo(() => {
    const groups = new Map<string, MedicationPlanView[]>()
    for (const plan of currentMedications) {
      if (plan.as_needed) continue
      groups.set(plan.schedule_slot, [...(groups.get(plan.schedule_slot) ?? []), plan])
    }
    return [...groups.entries()].sort(([left], [right]) => compareMedicationSlots(left, right))
  }, [currentMedications])
  const asNeededMedications = useMemo(() => currentMedications.filter(plan => plan.as_needed), [currentMedications])
  const generatedAt = dayjs().tz(REPORT_TIMEZONE)
  const selectedWindow = reportWindow(selectedDays, generatedAt)
  const periodLabel = `${selectedWindow.start.format('YYYY/MM/DD')} 04:00 – ${selectedWindow.end.format('YYYY/MM/DD')} ${String(CARE_DAY_START_HOUR).padStart(2, '0')}:00`
  const measurementPeriodLabel = model.startAt && model.endAt
    ? `${dayjs(model.startAt).tz(REPORT_TIMEZONE).format('YYYY/MM/DD HH:mm')} – ${dayjs(model.endAt).tz(REPORT_TIMEZONE).format('YYYY/MM/DD HH:mm')}`
    : '—'
  const exportContext = { selectedDays, isOfflineData, cacheUpdatedAt }

  useEffect(() => {
    // 切換對象、區間或資料來源後，舊的「已複製」訊息已不再可信，必須清掉。
    setActionStatus(null)
  }, [records, subjectLabel, selectedDays, isOfflineData, cacheUpdatedAt])

  const copyForGpt = async () => {
    // 部分 WebView/非 HTTPS 環境沒有 Clipboard API，先判斷避免點擊按鈕直接拋錯。
    if (!navigator.clipboard) {
      setActionStatus({ kind: 'error', text: text({ id: 'Browser tidak mendukung API clipboard.', zh: '瀏覽器不支援剪貼簿 API。', en: 'The browser does not support the Clipboard API.' }) })
      return
    }
    try {
      await navigator.clipboard.writeText(buildGptReportText(records, exportContext))
      setActionStatus({ kind: 'success', text: text({ id: 'Ringkasan disalin; siap ditempel ke GPT.', zh: '摘要已複製，可貼給 GPT。', en: 'The summary has been copied and can be pasted into GPT.' }) })
    } catch {
      setActionStatus({ kind: 'error', text: text({ id: 'Tidak dapat menyalin. Periksa izin browser.', zh: '無法複製，請確認瀏覽器權限。', en: 'Unable to copy, please confirm your browser permissions.' }) })
    }
  }

  const downloadCsv = () => {
    const csv = buildRecordCsv(records, subjectLabel, exportContext)
    const link = document.createElement('a')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const start = model.startAt ? dayjs(model.startAt).tz(REPORT_TIMEZONE).format('YYYY-MM-DD') : 'empty'
    const end = model.endAt ? dayjs(model.endAt).tz(REPORT_TIMEZONE).format('YYYY-MM-DD') : 'empty'
    link.href = url
    // 檔名不放姓名，避免下載檔留在共用裝置時直接暴露健康資料屬於誰。
    link.download = `blood-pressure-${start}-${end}.csv`
    document.body.append(link)
    link.click()
    link.remove()
    // 某些瀏覽器尚未排入下載就撤銷 Blob URL 會產生空檔，因此延後釋放資源。
    setTimeout(() => URL.revokeObjectURL(url), 100)
    setActionStatus({ kind: 'success', text: text({ id: 'CSV berhasil diunduh.', zh: 'CSV 已下載。', en: 'CSV downloaded.' }) })
  }

  const hasRecords = records.length > 0
  const actionsDisabled = !hasRecords || !canExport
  const actionClass = 'min-h-11 rounded-xl border px-3 py-2 text-left text-xs font-bold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:cursor-not-allowed disabled:opacity-45'
  const average = model.summary.avgSystolic == null || model.summary.avgDiastolic == null
    ? '—'
    : <VitalReading systolic={model.summary.avgSystolic} diastolic={model.summary.avgDiastolic} showPulse={false} showUnits={false} />
  const morningAverage = model.morningSummary.avgSystolic == null || model.morningSummary.avgDiastolic == null
    ? '—'
    : <VitalReading systolic={model.morningSummary.avgSystolic} diastolic={model.morningSummary.avgDiastolic} showPulse={false} showUnits={false} />
  const eveningAverage = model.eveningSummary.avgSystolic == null || model.eveningSummary.avgDiastolic == null
    ? '—'
    : <VitalReading systolic={model.eveningSummary.avgSystolic} diastolic={model.eveningSummary.avgDiastolic} showPulse={false} showUnits={false} />

  return (
    <div className="space-y-4 record-report-container">
      {/* 依據照護使用者需求，將「每日紀錄」（Detail harian）獨立為最上方的專屬卡片區塊，與「結構化報告」（Untuk dokter & GPT）拆開，讓看護與家屬在進入頁面時能優先瀏覽與對照逐筆血壓明細。 */}
      <section className="daily-records-section rounded-3xl border border-slate-200 bg-white p-4 shadow-[0_8px_30px_rgba(15,23,42,0.06)]" aria-labelledby="daily-records-title">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            {/* 繁體中文註解：Dashboard 已用 h1，明細與日期依序降為 h2/h3，讓讀屏器不會跳過層級。 */}
            <h2 id="daily-records-title" className="text-base font-extrabold tracking-tight text-slate-950">{text({ id: 'Detail harian', zh: '每日紀錄', en: 'Daily Record' })}</h2>
            <p className="mt-0.5 text-xs print:text-[11px] text-slate-500">{text({ id: 'Angka asli selalu ditampilkan', zh: '永遠保留原始數值', en: 'Always keep original value' })}</p>
          </div>
          <div className="print-hidden inline-flex self-start rounded-lg bg-slate-100 p-1" aria-label={text({ id: 'Saring catatan', zh: '篩選紀錄', en: 'Saring record' })}>
            {([
              ['all', text({ id: `Semua ${model.summary.recordCount}`, zh: `全部 ${model.summary.recordCount}`, en: `All ${model.summary.recordCount}` })],
              ['flagged', text({ id: `Perlu dilihat ${model.flaggedCount}`, zh: `需留意 ${model.flaggedCount}`, en: `${model.flaggedCount} need attention` })],
            ] as const).map(([value, label]) => (
              <button
                key={value}
                type="button"
                aria-pressed={filter === value}
                onClick={() => setFilter(value)}
                className={`min-h-11 rounded-lg px-3 text-xs print:text-[11px] font-bold focus-visible:outline-2 focus-visible:outline-indigo-600 ${filter === value ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-500'}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {!hasRecords && (
          <div className="mt-4 rounded-xl border border-dashed border-slate-300 px-4 py-8 text-center">
            <p className="text-sm font-semibold text-slate-700">{text({ id: 'Belum ada data', zh: '目前沒有資料', en: 'Not yet ada data' })}</p>
            <p className="mt-1 text-xs text-slate-500">{text({ id: 'Pilih rentang lain atau tambah catatan.', zh: '請切換區間或新增紀錄。', en: 'Select rentang lain or tambah record.' })}</p>
          </div>
        )}

        {hasRecords && filter === 'flagged' && model.flaggedCount === 0 && (
          <p className="mt-4 rounded-xl bg-emerald-50 px-4 py-5 text-center text-sm font-semibold text-emerald-800">
            {text({ id: 'Tidak ada catatan yang ditandai', zh: '此期間沒有系統標記紀錄', en: 'There are no system flag records for this period' })}
          </p>
        )}

        <div className="mt-3 space-y-3">
          {model.dailyGroups.map(group => (
            <article key={group.date} className={`record-day overflow-hidden rounded-xl border border-slate-200 ${filter === 'flagged' && group.flaggedCount === 0 ? 'record-filter-hidden' : ''}`} aria-labelledby={`day-${group.date}`}>
              <div className="flex items-center justify-between gap-3 bg-slate-50 px-3 py-2.5">
                <div>
                  <h3 id={`day-${group.date}`} className="text-xs font-extrabold text-slate-900">
                    {dayjs.tz(`${group.date} 04:00:00`, REPORT_TIMEZONE).locale(locale === 'zh' ? 'zh-tw' : 'id').format(locale === 'zh' ? 'YYYY/MM/DD（ddd）' : 'ddd, DD MMM YYYY')}
                  </h3>
                  <p className="mt-0.5 text-xs print:text-[10px] text-slate-500">{text({ id: `${group.summary.recordCount} catatan`, zh: `${group.summary.recordCount} 筆紀錄`, en: `${group.summary.recordCount} records` })}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs print:text-[10px] text-slate-500">{text({ id: 'Rata-rata', zh: '當日平均', en: 'Average for the day' })}</p>
                  {group.summary.avgSystolic != null && group.summary.avgDiastolic != null && <VitalReading systolic={group.summary.avgSystolic} diastolic={group.summary.avgDiastolic} showPulse={false} className="text-sm font-extrabold text-slate-900" />}
                </div>
              </div>
              <div className="hidden grid-cols-[minmax(7rem,0.8fr)_minmax(6rem,0.7fr)_minmax(5rem,0.5fr)_minmax(10rem,1.6fr)] gap-3 border-y border-slate-100 px-3 py-2 text-xs print:text-[10px] font-bold uppercase tracking-wide text-slate-400 sm:grid">
                <span>{text({ id: 'Waktu', zh: '時間', en: 'time' })}</span><span>{text({ id: 'Tekanan', zh: '血壓', en: 'Tekanan' })}</span><span>{text({ id: 'Pulse', zh: '心跳', en: 'Heart rate' })}</span><span>{text({ id: 'Tanda sistem', zh: '系統提示', en: 'Tanda sistem' })}</span>
              </div>
              <ul className="divide-y divide-slate-100">
                {group.records.map(record => (
                  <RecordRow
                    key={record.id}
                    record={record}
                    hiddenOnScreen={filter === 'flagged' && evaluateReading(record.systolic, record.diastolic, record.pulse).level === 'normal'}
                  />
                ))}
              </ul>
            </article>
          ))}
        </div>
      </section>

      {/* 結構化報告卡片獨立收納醫師與 GPT 匯出選項、時段平均與極值統計 */}
      <section className="record-report rounded-3xl border border-slate-200 bg-white p-4 shadow-[0_8px_30px_rgba(15,23,42,0.06)]" aria-labelledby="record-report-title">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs print:text-[10px] font-bold uppercase tracking-[0.16em] text-indigo-600">{text({ id: 'Laporan terstruktur', zh: '結構化報告', en: 'Laporan terstruktur' })}</p>
            <h2 id="record-report-title" className="mt-1 text-lg font-extrabold tracking-tight text-slate-950">{text({ id: 'Untuk dokter & GPT', zh: '醫師與 GPT 版', en: 'Untuk doctor & GPT' })}</h2>
            <p className="mt-1 text-xs text-slate-500">{subjectLabel} · {periodLabel} · {REPORT_TIMEZONE} (UTC+8)</p>
            <p className="mt-1 text-xs print:text-[11px] text-slate-500">{text({ id: 'Data tersedia:', zh: '實際首末筆：', en: 'Actual first and last strokes:' })}{measurementPeriodLabel}</p>
          </div>
          <div className="record-report-print-only hidden text-right text-xs text-slate-500">
            <p className="font-semibold text-slate-800">{text({ id: 'Catatan tekanan darah rumah', zh: '居家血壓紀錄', en: 'Home Blood Pressure Record' })}</p>
            <p>{text({ id: 'Dibuat:', zh: '產生時間：', en: 'When' })}{dayjs().tz(REPORT_TIMEZONE).format('YYYY/MM/DD HH:mm')}</p>
          </div>
        </div>

        {isOfflineData && (
          <div className="mt-3 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs print:text-[11px] leading-relaxed text-amber-900" role="status">
            <p className="font-bold">{text({ id: 'Data cache offline', zh: '離線快取資料', en: 'Data cache offline' })}</p>
            <p>
              {text({ id: 'Terakhir sinkron:', zh: '最後同步：', en: 'Last synced:' })}{cacheUpdatedAt ? dayjs(cacheUpdatedAt).tz(REPORT_TIMEZONE).format('YYYY/MM/DD HH:mm:ss') : text({ id: 'Tidak diketahui', zh: '未知', en: 'None known.' })}。{text({ id: 'Data mungkin bukan yang terbaru.', zh: '內容可能不是最新資料。', en: 'Content may not be up-to-date.' })}
            </p>
          </div>
        )}

        <div className="print-hidden mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3" aria-label={text({ id: 'Ekspor laporan', zh: '輸出報告', en: 'Export laporan' })}>
          <button type="button" disabled={actionsDisabled} onClick={copyForGpt} className={`${actionClass} col-span-2 border-indigo-200 bg-indigo-50 text-indigo-900 sm:col-span-1`}>
            <span className="block text-base" aria-hidden="true">✦</span>
            {text({ id: 'Salin untuk GPT', zh: '複製摘要', en: 'Salin for GPT' })}
          </button>
          <button type="button" disabled={actionsDisabled} onClick={downloadCsv} className={`${actionClass} border-slate-200 bg-white text-slate-800`}>
            <span className="block text-base" aria-hidden="true">↓</span>
            {text({ id: 'Unduh CSV', zh: '下載 CSV', en: 'Download CSV' })}
          </button>
          <button type="button" disabled={actionsDisabled} onClick={() => window.print()} className={`${actionClass} border-slate-200 bg-white text-slate-800`}>
            <span className="block text-base" aria-hidden="true">▧</span>
            {text({ id: 'Cetak / Simpan PDF', zh: '列印 / 存為 PDF', en: 'Print/Save as PDF' })}
          </button>
        </div>

        {!canExport && (
          <p className="print-hidden mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs print:text-[11px] text-amber-800">
            {text({ id: 'Masuk untuk memakai tombol ekspor', zh: '登入後可使用輸出按鈕', en: 'Log in to use the Output button' })}
          </p>
        )}
        {canExport && (
          <p className="print-hidden mt-2 rounded-lg bg-indigo-50 px-3 py-2 text-xs print:text-[11px] leading-relaxed text-indigo-800">
            {text({ id: 'Paket GPT tidak memuat nama, tetapi berisi semua nilai kesehatan per catatan. Periksa sebelum membagikannya.', zh: 'GPT 摘要不含姓名，但包含所有逐筆健康數值，貼出前請確認。', en: 'The GPT summary does not contain the name, but contains all health values on a case-by-case basis. Please confirm before posting.' })}
          </p>
        )}
        <p className={`print-hidden mt-2 min-h-4 text-xs print:text-[11px] ${actionStatus?.kind === 'error' ? 'text-red-700' : 'text-emerald-700'}`} role="status" aria-live="polite">
          {actionStatus?.text ?? ''}
        </p>

        <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4">
          <SummaryCard label={text({ id: 'Rata-rata', zh: '逐筆平均', en: 'Rata-rata' })} value={average} detail={<><PulseReading pulse={model.summary.avgPulse} className="text-xs print:text-[10px]" /> · n={model.summary.recordCount}</>} />
          <SummaryCard label={text({ id: 'Pagi', zh: '早上平均', en: 'Morning average' })} value={morningAverage} detail={`n=${model.morningSummary.recordCount}`} />
          <SummaryCard label={text({ id: 'Malam', zh: '晚間平均', en: 'Evening Average' })} value={eveningAverage} detail={`n=${model.eveningSummary.recordCount}`} />
          <SummaryCard
            label={text({ id: 'Perlu dilihat', zh: '需留意', en: 'Perlu dilihat' })}
            value={String(model.flaggedCount)}
            detail={`↑ ${model.summary.alertCounts.warning + model.summary.alertCounts.danger} · ↓ ${model.summary.alertCounts['warning-low'] + model.summary.alertCounts['danger-low']} · ♥ ${model.summary.pulseWarningCount}`}
            tone={model.flaggedCount > 0 ? 'amber' : 'emerald'}
          />
        </div>
        <p className="mt-2 text-xs print:text-[10px] leading-relaxed text-slate-500">
          {text({ id: `Rata-rata dihitung per catatan; sesi diperkirakan dari waktu ukur; data tersedia pada ${model.daysWithRecords}/${selectedDays} hari terpilih.`, zh: `平均按每筆紀錄計算；時段由量測時間推算；選取期間有 ${model.daysWithRecords}/${selectedDays} 天有紀錄。`, en: `Averages use each record; sessions are estimated from measurement times; data is available on ${model.daysWithRecords} of ${selectedDays} selected days.` })}
        </p>

        {hasRecords && (
          <div className="mt-4 grid gap-2 sm:grid-cols-2" aria-label={text({ id: 'Nilai ekstrem', zh: '極值事件', en: 'Extreme event' })}>
            <ExtremeReading label={text({ id: 'Sistolik tertinggi', zh: '最高收縮壓', en: 'Highest sys' })} record={model.highestSystolic} />
            <ExtremeReading label={text({ id: 'Diastolik terendah', zh: '最低舒張壓', en: 'Minimum diastolic pressure' })} record={model.lowestDiastolic} />
          </div>
        )}

        <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-bold text-slate-800">{text({ id: 'Waktu ukur', zh: '量測時段分布', en: 'Time ukur' })}</p>
            <p className="text-xs print:text-[10px] text-slate-500">n={model.summary.recordCount}</p>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-5">
            {(['pagi', 'siang', 'malam1', 'malam2', 'malam3'] as const).map(session => (
              <div key={session} className="rounded-lg bg-white px-2 py-2 text-center ring-1 ring-inset ring-slate-200 last:col-span-2 sm:last:col-span-1">
                <p className="text-xs print:text-[10px] text-slate-500">{text(SESSION_LABELS[session])}</p>
                <p className="mt-0.5 text-sm font-extrabold tabular-nums text-slate-900">{model.summary.sessionCounts[session]}</p>
              </div>
            ))}
          </div>
        </div>

        {/* 就診當下最有用的是「現在正在吃什麼」；跟血壓數據放在同一份可列印報告，看診時不用切換分頁。 */}
        {currentMedications.length > 0 && (
          <div className="mt-4 rounded-xl border border-slate-200 bg-white p-3" aria-labelledby="current-medications-title">
            <p id="current-medications-title" className="text-xs print:text-[10px] font-bold uppercase tracking-[0.16em] text-indigo-600">{text({ id: 'Daftar obat saat ini', zh: '目前藥單', en: 'List medication when this' })}</p>
            <div className="mt-2 space-y-2">
              {scheduledMedicationGroups.map(([slot, plans]) => (
                <div key={slot}>
                  <p className="text-xs print:text-[10px] font-bold text-slate-500">{text(medicationSlotText(slot))}</p>
                  <ul className="mt-1 space-y-0.5">
                    {plans.map(plan => (
                      <li key={plan.id} className="text-xs print:text-[11px] text-slate-800">
                        {formatMedicationDisplayName(plan.medication, locale)} · {formatDoseAmountLocalized(plan.dose_amount, plan.medication.dosage_form, locale)}
                        {plan.dose_count > 1 ? ` × ${plan.dose_count}` : ''}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
              {asNeededMedications.length > 0 && (
                <div>
                  <p className="text-xs print:text-[10px] font-bold text-slate-500">{text({ id: 'Bila perlu', zh: '需要時服用', en: 'Bila perlu' })}</p>
                  <ul className="mt-1 space-y-0.5">
                    {asNeededMedications.map(plan => (
                      <li key={plan.id} className="text-xs print:text-[11px] text-slate-800">
                        {formatMedicationDisplayName(plan.medication, locale)} · {formatDoseAmountLocalized(plan.dose_amount, plan.medication.dosage_form, locale)}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        )}

        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 text-xs print:text-[11px] leading-relaxed text-amber-900">
          <p className="font-bold">{text({ id: 'Batas data', zh: '資料限制', en: 'Batas data' })}</p>
          <p className="mt-1">{text({ id: 'Hanya berisi tekanan darah, denyut, dan waktu. Tidak memuat gejala, posisi, alat, waktu obat, atau pasangan pengukuran yang terkonfirmasi.', zh: '僅含血壓、心跳與時間；不含症狀、姿勢、裝置、服藥時間或可確認的雙次量測配對。', en: 'Blood pressure, heartbeat, and time only; no symptoms, posture, device, medication time, or identifiable double-measurement pairing.' })}</p>
          <p className="mt-1 font-semibold">{text({ id: 'Tanda sistem bukan diagnosis. Jangan ubah obat tanpa dokter.', zh: '系統提示不是診斷，請勿自行調藥。', en: 'Tanda sistem not diagnosis. Jangan ubah medication tanpa doctor.' })}</p>
        </div>
        <PrintSourceFooter />
      </section>
    </div>
  )
}

function SummaryCard({ label, value, detail, tone = 'slate' }: {
  label: string
  value: ReactNode
  detail: ReactNode
  tone?: 'slate' | 'amber' | 'emerald'
}) {
  const styles = tone === 'amber'
    ? 'border-amber-200 bg-amber-50 text-amber-950'
    : tone === 'emerald'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-950'
      : 'border-slate-200 bg-slate-50 text-slate-950'
  return (
    <div className={`rounded-xl border p-3 ${styles}`}>
      <p className="text-xs print:text-[10px] font-bold text-current opacity-65">{label}</p>
      <div className="mt-1 text-xl font-black tabular-nums">{value}</div>
      <div className="mt-1 text-xs print:text-[10px] font-semibold opacity-70">{detail}</div>
    </div>
  )
}

function ExtremeReading({ label, record }: { label: string; record: BpRecord | null }) {
  if (!record) return null
  return (
    <div className="rounded-xl border border-slate-200 px-3 py-3">
      <p className="text-xs print:text-[10px] font-bold text-slate-500">{label}</p>
      <VitalReading systolic={record.systolic} diastolic={record.diastolic} pulse={record.pulse} className="mt-1 text-lg font-black text-slate-950" unitClassName="text-slate-400" />
      <p className="mt-1 text-xs print:text-[10px] text-slate-500">{dayjs(record.measured_at).tz(REPORT_TIMEZONE).format('YYYY/MM/DD HH:mm')}</p>
    </div>
  )
}

function compactRecordStatus(evaluation: ReturnType<typeof evaluateReading>): LocalizedText {
  const labels: Record<string, LocalizedText> = {
    danger_high: { id: 'Darurat', zh: '極高危險', en: 'Extremely High Hazard' },
    cukup_tinggi: { id: 'Tinggi', zh: '明顯偏高', en: 'Significantly higher' },
    tinggi: { id: 'Tinggi', zh: '偏高', en: 'Somewhat high' },
    observasi: { id: 'Awasi', zh: '偏高觀察', en: 'Over-observation' },
    danger_low: { id: 'Sangat rendah', zh: '明顯偏低', en: 'Significantly low' },
    warning_low: { id: 'Rendah', zh: '偏低', en: 'Somewhat low' },
    diastolic_low: { id: 'N · D rendah', zh: '正常・低壓低', en: 'Normal/Low Low Pressure' },
    normal_low: { id: 'N · rendah', zh: '正常・偏低', en: 'Normal/Low' },
    normal: { id: 'Normal', zh: '正常', en: 'Normal' },
    normal_default: { id: 'Normal', zh: '正常', en: 'Normal' },
  }
  const base = labels[evaluation.bpRule.key] ?? evaluation.labels

  // 手機欄位必須同列，將規則名稱縮短但保留「偏高／偏低／心跳快」等可行動訊息，不能只留下顏色或省略風險。
  if (!evaluation.pulseWarning) return base
  return {
    id: `${base.id} · Nadi↑`,
    zh: `${base.zh}・心跳快`, en: `${base.en} · Fast heartbeat`,
  }
}

function RecordRow({ record, hiddenOnScreen }: { record: BpRecord; hiddenOnScreen: boolean }) {
  const { text } = useI18n()
  const evaluation = evaluateReading(record.systolic, record.diastolic, record.pulse)
  const compactStatus = compactRecordStatus(evaluation)
  const statusStyle = evaluation.level === 'danger' || evaluation.level === 'danger-low'
    ? 'bg-red-100 text-red-800'
    : evaluation.level === 'warning' || evaluation.level === 'warning-low'
      ? 'bg-orange-100 text-orange-800'
      : 'bg-emerald-100 text-emerald-800'

  return (
    <li className={`record-row grid grid-cols-[2.5rem_4.25rem_2.75rem_minmax(0,1fr)] items-center gap-1 px-3 py-2 sm:grid-cols-[minmax(7rem,0.8fr)_minmax(6rem,0.7fr)_minmax(5rem,0.5fr)_minmax(10rem,1.6fr)] sm:gap-3 sm:py-3 ${hiddenOnScreen ? 'record-filter-hidden' : ''}`}>
      <div className="whitespace-nowrap">
        <time className="text-sm font-extrabold tabular-nums text-slate-950" dateTime={record.measured_at}>
          {dayjs(record.measured_at).tz(REPORT_TIMEZONE).format('HH:mm')}
        </time>
      </div>
      <VitalReading systolic={record.systolic} diastolic={record.diastolic} showPulse={false} showUnits={false} className="whitespace-nowrap text-sm font-black text-slate-950 sm:text-sm" unitClassName="text-slate-400" />
      <PulseReading pulse={record.pulse} className="whitespace-nowrap text-xs print:text-[11px] font-bold text-slate-950" unitClassName="text-slate-400" />
      {/* 狀態是照護者判斷下一步的主要線索，因此維持至少 12px；允許換行避免印尼文長標籤造成手機水平溢出。 */}
      <span aria-label={text(evaluation.labels)} className={`min-w-0 whitespace-normal rounded-md px-1.5 py-1 text-xs print:text-[10px] font-bold leading-tight ${statusStyle} sm:justify-self-start sm:px-2 sm:leading-snug`}>
        <span className="sm:hidden">{text(compactStatus)}</span>
        <span className="hidden sm:inline">{text(evaluation.labels)}</span>
      </span>
    </li>
  )
}
