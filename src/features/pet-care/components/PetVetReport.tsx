/*
檔案用途：慢性病照護一頁式回診報告——彙整體重曲線、食慾／飲水／嘔吐次數、用藥（胰島素單位／皮下點滴）
與上次回診日期，提供可列印／存 PDF 的單一版面，比照血壓模組 RecordReport 的 @media print 做法。
所在層：src/features/pet-care/components；由 PetEndocrinePage 透過 lazy 掛載於「回診報告」收合區塊，
寵物與人類病人（因 petEndocrine 現已對人類開放）共用同一個元件，靠 careRecipientType 切換用語。
主要關聯：lib/petVetReport 提供彙整資料模型，WeightTrendPanel 提供體重曲線圖，與 RecordReport 共用
index.css 的 .record-report／.print-hidden 等既有列印樣式。

為什麼欄位跟血壓 RecordReport 完全不同、需要獨立元件：這份報告沒有血壓／心跳，
而是體重、食慾、液體管理、消化健康、皮下點滴與胰島素／血糖六個模組的彙整，
資料形狀與呈現方式都不同，複用 RecordReport 只會讓兩邊互相遷就而更難讀。
*/
import { lazy, useEffect, useState } from 'react'
import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import timezone from 'dayjs/plugin/timezone'
import { PrintSourceFooter } from '../../../components/system/PrintSourceFooter'
import { common, useI18n } from '../../../lib/i18n'
import { loadPetVetReportModel, type PetVetReportModel } from '../../../lib/petVetReport'
import { formatWeightKg } from '../../../lib/weight'
import { TZ } from '../../../lib/timezone'
import type { TrendPeriodDays } from '../../../lib/trendPreference'

const WeightTrendPanel = lazy(() => import('../../vitals/components/WeightTrendPanel').then(module => ({ default: module.WeightTrendPanel })))

dayjs.extend(utc)
dayjs.extend(timezone)

function StatCard({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
      <p className="text-xs print:text-[10px] font-bold text-slate-500">{label}</p>
      <p className="mt-1 text-lg font-black tabular-nums text-slate-950">{value}</p>
      {detail && <p className="mt-0.5 text-xs print:text-[10px] font-semibold text-slate-500">{detail}</p>}
    </div>
  )
}

export function PetVetReport({ patientId, subjectLabel, days, careRecipientType }: {
  patientId: string
  subjectLabel: string
  days: TrendPeriodDays
  careRecipientType?: 'human' | 'dog' | 'cat' | 'bird' | 'rabbit' | 'other'
}) {
  const { text, locale } = useI18n()
  // 內分泌分頁現在人類病人也會用到，報告標題與「請與 OO 討論」不能寫死成獸醫版。
  const isHuman = careRecipientType === 'human'
  const doctorWordId = isHuman ? 'dokter' : 'dokter hewan'
  const doctorWordZh = isHuman ? '醫師' : '獸醫師'
  const [model, setModel] = useState<PetVetReportModel | null>(null)
  const [failed, setFailed] = useState(false)
  const [retryKey, setRetryKey] = useState(0)

  useEffect(() => {
    let cancelled = false
    setModel(null)
    setFailed(false)
    loadPetVetReportModel(patientId, days)
      .then(next => { if (!cancelled) setModel(next) })
      .catch(error => {
        console.error('[pet vet report load error]', error)
        if (!cancelled) setFailed(true)
      })
    return () => { cancelled = true }
  }, [patientId, days, retryKey])

  if (failed) {
    return (
      <div>
        <p role="alert" className="text-sm font-semibold text-red-700">{text({ id: 'Laporan dokter hewan tidak dapat dimuat.', zh: '目前無法讀取獸醫報告。' ,en: "Laporan dokter animal not could be loaded." })}</p>
        <button type="button" onClick={() => setRetryKey(value => value + 1)} className="mt-3 min-h-11 rounded-xl border border-red-200 bg-white px-4 text-sm font-bold text-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500">
          {text(common.retry)}
        </button>
      </div>
    )
  }
  if (!model) return <p role="status" className="text-sm text-slate-500">{text(common.loading)}</p>

  const generatedAt = dayjs().tz(TZ)
  const periodLabel = `${model.bounds.sinceDate} – ${model.bounds.untilDate}`
  const dateFormat = locale === 'zh' ? 'YYYY/MM/DD' : 'DD MMM YYYY'
  const weightDeltaLabel = model.weight.deltaKg == null
    ? null
    : model.weight.deltaKg > 0
      ? `+${formatWeightKg(model.weight.deltaKg)} kg`
      : `${formatWeightKg(model.weight.deltaKg)} kg`

  return (
    <section className="record-report-container space-y-4">
      <div className="record-report rounded-2xl border border-slate-200 bg-white p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs print:text-[10px] font-bold uppercase tracking-[0.16em] text-indigo-600">{text({ id: 'Laporan satu halaman', zh: '一頁式彙整報告' ,en: "Laporan satu halaman" })}</p>
            <h2 className="mt-1 text-lg font-extrabold tracking-tight text-slate-950">{text({ id: `Untuk ${doctorWordId}`, zh: `給${doctorWordZh}的彙整報告` ,en: `Untuk ${doctorWordId}` })}</h2>
            <p className="mt-1 text-xs text-slate-500">{subjectLabel} · {periodLabel} · {TZ} (UTC+8)</p>
            <p className="mt-1 text-xs print:text-[10px] text-slate-500">{text({ id: 'Dibuat:', zh: '產生時間：' ,en: "Dibuat:" })}{generatedAt.format('YYYY/MM/DD HH:mm')}</p>
          </div>
          <button type="button" onClick={() => window.print()} className="print-hidden min-h-11 shrink-0 self-start rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600">
            <span className="mr-1" aria-hidden="true">▧</span>
            {text({ id: 'Cetak / Simpan PDF', zh: '列印 / 存為 PDF' ,en: "Cetak / Save PDF" })}
          </button>
        </div>

        {/* 驗收條件：匯出內容需標示資料來源與期間，並註明為家庭自記錄而非醫療診斷文件。 */}
        <div className="mt-3 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs print:text-[11px] leading-relaxed text-indigo-900">
          <p className="font-bold">{text({ id: 'Sumber & cakupan data', zh: '資料來源與範圍' ,en: "Sumber & cakupan data" })}</p>
          <p className="mt-1">{text({ id: `Dicatat mandiri oleh keluarga/pengasuh di aplikasi ini, periode ${periodLabel}. Bukan dokumen diagnosis medis.`, zh: `由家屬／照護者於本 App 自行記錄，統計期間 ${periodLabel}；本文件為家庭自記錄，非醫療診斷文件。` ,en: `Direcord mandiri oleh family/caregiver in aplikasi this, periode ${periodLabel}. Bukan dokumen diagnosis medis.` })}</p>
        </div>

        <div className="print-report-chart mt-4 rounded-xl border border-slate-200 p-3">
          <h3 className="text-sm font-bold text-slate-800">{text({ id: 'Tren berat badan', zh: '體重曲線' ,en: "Tren weight baand" })}</h3>
          <div className="mt-2">
            <WeightTrendPanel patientId={patientId} days={days} />
          </div>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs print:text-[10px] text-slate-600">
            <span>{text({ id: 'Terbaru:', zh: '最新：' ,en: "Terbaru:" })} {model.weight.latestKg == null ? '—' : `${formatWeightKg(model.weight.latestKg)} kg (${dayjs(model.weight.latestMeasuredOn).format(dateFormat)})`}</span>
            <span>{text({ id: 'Perubahan periode:', zh: '期間變化：' ,en: "Changes periode:" })} {weightDeltaLabel ?? '—'}</span>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
          <StatCard
            label={text({ id: 'Nafsu makan rata-rata', zh: '平均食慾' ,en: "Nafsu makan rata-rata" })}
            value={model.appetite.avgPercent == null ? '—' : `${Math.round(model.appetite.avgPercent)}%`}
            detail={text({ id: `n=${model.appetite.recordCount}`, zh: `n=${model.appetite.recordCount}` ,en: `n=${model.appetite.recordCount}` })}
          />
          <StatCard
            label={text({ id: 'Asupan air total', zh: '總飲水量' ,en: "Asupan water total" })}
            value={model.liquid.waterTotalMl == null ? '—' : `${model.liquid.waterTotalMl} ml`}
            detail={model.liquid.waterAvgMlPerDay == null ? undefined : text({ id: `Rata-rata ${model.liquid.waterAvgMlPerDay} ml/hari`, zh: `平均每日 ${model.liquid.waterAvgMlPerDay} ml` ,en: `Rata-rata ${model.liquid.waterAvgMlPerDay} ml/days` })}
          />
          <StatCard
            label={text({ id: 'Frekuensi muntah', zh: '嘔吐次數' ,en: "Frekuensi muntah" })}
            value={model.digestion.vomitingTotal == null ? '—' : String(model.digestion.vomitingTotal)}
            detail={text({ id: `${model.digestion.recordDays} hari tercatat`, zh: `共 ${model.digestion.recordDays} 天有紀錄` ,en: `${model.digestion.recordDays} days recorded` })}
          />
          <StatCard
            label={text({ id: 'Frekuensi buang air besar', zh: '排便次數' ,en: "Frekuensi bowel movement" })}
            value={model.digestion.defecationTotal == null ? '—' : String(model.digestion.defecationTotal)}
            detail={model.digestion.avgStoolScore == null ? undefined : text({ id: `Skor feses rata-rata ${model.digestion.avgStoolScore.toFixed(1)}`, zh: `平均糞便評分 ${model.digestion.avgStoolScore.toFixed(1)}` ,en: `Skor feses rata-rata ${model.digestion.avgStoolScore.toFixed(1)}` })}
          />
          <StatCard
            label={text({ id: 'Total insulin', zh: '胰島素總量' ,en: "Total insulin" })}
            value={model.endocrine.insulinTotalUnits == null ? '—' : `${model.endocrine.insulinTotalUnits} unit`}
            detail={text({ id: `n=${model.endocrine.insulinRecordCount}`, zh: `n=${model.endocrine.insulinRecordCount}` ,en: `n=${model.endocrine.insulinRecordCount}` })}
          />
          <StatCard
            label={text({ id: 'Rata-rata gula darah', zh: '平均血糖' ,en: "Rata-rata gula blood" })}
            value={model.endocrine.glucoseAvgMgDl == null ? '—' : `${Math.round(model.endocrine.glucoseAvgMgDl)} mg/dL`}
            detail={text({ id: `n=${model.endocrine.glucoseRecordCount}`, zh: `n=${model.endocrine.glucoseRecordCount}` ,en: `n=${model.endocrine.glucoseRecordCount}` })}
          />
          <StatCard
            label={text({ id: 'Total cairan subkutan', zh: '皮下點滴總量' ,en: "Total fluid subkutan" })}
            value={model.fluidTherapy.volumeTotalMl == null ? '—' : `${model.fluidTherapy.volumeTotalMl} ml`}
            detail={text({ id: `n=${model.fluidTherapy.recordCount}`, zh: `n=${model.fluidTherapy.recordCount}` ,en: `n=${model.fluidTherapy.recordCount}` })}
          />
          <StatCard
            label={text({ id: 'Buang air kecil total', zh: '排尿次數' ,en: "Buang water tocil total" })}
            value={model.liquid.urinationTotal == null ? '—' : String(model.liquid.urinationTotal)}
            detail={text({ id: `${model.liquid.recordDays} hari tercatat`, zh: `共 ${model.liquid.recordDays} 天有紀錄` ,en: `${model.liquid.recordDays} days recorded` })}
          />
          <StatCard
            label={text({ id: 'Kunjungan kesehatan terakhir', zh: '上次回診／看診' ,en: "Kunjungan tosehatan terakhir" })}
            value={model.lastHealthVisit ? dayjs(model.lastHealthVisit.occurredAt).format(dateFormat) : '—'}
            detail={model.lastHealthVisit ? model.lastHealthVisit.title : text({ id: 'Belum ada catatan kunjungan kesehatan', zh: '尚無看診紀錄' ,en: "No recordan kunjungan tosehatan" })}
          />
        </div>

        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 text-xs print:text-[11px] leading-relaxed text-amber-900">
          <p className="font-bold">{text({ id: 'Batas data', zh: '資料限制' ,en: "Batas data" })}</p>
          <p className="mt-1">{text({ id: 'Tanggal kunjungan kesehatan diambil dari catatan waktu terbaru, bukan tanggal tes darah yang terverifikasi. Total dan rata-rata hanya mencakup catatan yang dimasukkan keluarga/pengasuh; hari tanpa catatan tidak dihitung sebagai nol.', zh: '上次回診日期取自照護時間軸最近一筆「看診／健康處置」事件，不是可驗證的抽血日期。加總與平均只計入家屬／照護者實際輸入的紀錄；沒有輸入的日子不計為 0。' ,en: "Tanggal kunjungan tosehatan diambil from recordan time terbaru, bukan tanggal tes blood that terverifikasi. Total and rata-rata only mencakup recordan that dimasukkan family/caregiver; days without recordan not dihthatng sebagai nol." })}</p>
          <p className="mt-1 font-semibold">{text({ id: `Laporan ini bukan diagnosis. Diskusikan setiap perubahan pengobatan dengan ${doctorWordId}.`, zh: `本報告不是診斷，任何用藥調整請與${doctorWordZh}討論。` ,en: `Laporan this bukan diagnosis. Diskusikan each changes pengmedicationan with ${doctorWordId}.` })}</p>
        </div>
        <PrintSourceFooter />
      </div>
    </section>
  )
}
