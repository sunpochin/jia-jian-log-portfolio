/*
檔案用途：唯讀呈現一位已封存照護對象的完整血壓與體溫歷史，供家屬事後回顧。
所在層：src/features/system-admin/pages；只能從設定頁的「查看生命歷史」進入，不掛在底部主導覽。
主要關聯：BloodPressureReportPanel、TemperatureTrend、lib/trendPreference；由 SettingsPage 以固定 patientId 掛載。

為什麼不經過 activeSubject：已封存對象若進入全域的目前操作對象狀態，會被切換分頁時的
careSubjectGuard 攔下或造成顯示與寫入不一致的風險（見 AGENTS.md〈生理數值對象綁定不變量〉）。
這個頁面直接以明確的 patientId 讀取資料，完全不呼叫 setActiveSubject／onSubjectSelect，
從結構上排除「已封存對象變成目前操作對象」這個問題類別，而不是只在事後攔截。
*/
import { lazy, useState } from 'react'
import type { PatientIdentity } from '../../../lib/auth'
import { common, useI18n } from '../../../lib/i18n'
import { readTrendPeriod, saveTrendPeriod, TREND_PERIOD_OPTIONS, type TrendPeriodDays } from '../../../lib/trendPreference'

const BloodPressureReportPanel = lazy(() => import('../../vitals/components/BloodPressureReportPanel').then(m => ({ default: m.BloodPressureReportPanel })))
const TemperatureTrend = lazy(() => import('../../vitals/components/TemperatureTrend').then(m => ({ default: m.TemperatureTrend })))

export function ArchivedPatientHistoryPage({ patientId, patientName, careRecipientType, userEmail, onBack }: {
  patientId: string
  patientName: string
  careRecipientType: PatientIdentity['careRecipientType']
  userEmail?: string
  onBack: () => void
}) {
  const { text } = useI18n()
  const [days, setDays] = useState<TrendPeriodDays>(readTrendPeriod)

  return (
    <section className="min-h-full bg-slate-50 px-5 pt-5 pb-8 text-gray-900">
      <button
        type="button"
        onClick={onBack}
        className="min-h-11 -ml-1 flex items-center gap-1 rounded-lg px-1 text-sm font-bold text-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600"
      >
        <span aria-hidden="true">←</span>
        {text({ id: 'Kembali ke Pengaturan', zh: '返回設定', en: 'Back to Settings' })}
      </button>

      <header className="mt-2">
        <p className="text-xs font-bold uppercase tracking-wider text-indigo-700">
          {text({ id: 'Riwayat hidup (hanya baca)', zh: '生命歷史（唯讀）', en: 'History of Life (Read Only)' })}
        </p>
        <h1 className="mt-1 text-2xl font-bold text-gray-900">{patientName}</h1>
        {/* 這裡不提供任何寫入入口；已封存對象只能在這個頁面被閱讀，不能被誤觸產生新紀錄。 */}
        <p className="mt-1 text-sm text-gray-500">
          {text({ id: 'Data ini diarsipkan dan tidak dapat ditambah atau diubah dari sini.', zh: '此對象已封存，這裡無法新增或修改任何紀錄。', en: 'This object has been archived and no records can be added or modified here.' })}
        </p>
      </header>

      <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label={text({ id: 'Rentang riwayat', zh: '歷史區間', en: 'Historical Sections' })}>
        {TREND_PERIOD_OPTIONS.map(option => (
          <button
            key={option}
            type="button"
            aria-pressed={days === option}
            className={`min-h-11 rounded-xl border px-3 py-2 text-sm font-semibold transition focus-visible:outline-2 focus-visible:outline-emerald-700 ${
              days === option
                ? 'border-emerald-700 bg-emerald-700 text-white'
                : 'border-gray-200 bg-white text-gray-700 active:bg-gray-100'
            }`}
            onClick={() => { setDays(option); saveTrendPeriod(option) }}
          >
            {text(common.days(option))}
          </button>
        ))}
      </div>

      <div className="mt-4">
        <BloodPressureReportPanel patientId={patientId} days={days} subjectLabel={patientName} careRecipientType={careRecipientType} userEmail={userEmail} />
      </div>

      <div className="mt-4">
        <TemperatureTrend patientId={patientId} days={days} />
      </div>
    </section>
  )
}
