/*
檔案用途：提供各照護模組共用的「近期趨勢」區塊外框，含期間選擇、展開記憶與延遲載入邊界。
所在層：src/components/daily-care；只負責外框與互動，實際圖表由各模組傳入。
主要關聯：InputPage、TemperaturePage、WeightPage、NutritionPage、MedicationPage 與 lib/trendPreference。

為什麼抽成共用元件：五個模組都要在「記錄完馬上看得到趨勢」，若各自實作，
期間選項、展開行為與標題很快就會長出五種版本（違反〈介面元件化規範〉）。
外框統一後，各模組只需要提供自己的圖表內容。
*/
import { Suspense, useState, type ReactNode } from 'react'
import { common, useI18n, type LocalizedText } from '../../lib/i18n'
import {
  readTrendExpanded,
  readTrendPeriod,
  saveTrendExpanded,
  saveTrendPeriod,
  TREND_PERIOD_OPTIONS,
  type TrendPeriodDays,
} from '../../lib/trendPreference'

const DEFAULT_TITLE: LocalizedText = { id: 'Tren terkini', zh: '近期趨勢' ,en: 'Recent trend' }

export function ModuleTrendSection({ moduleId, titleId, children, showPeriodPicker = true, title = DEFAULT_TITLE }: {
  moduleId: string
  titleId: string
  // 以 render prop 傳入圖表，才能在收合時完全不掛載較重的圖表元件與資料查詢。
  children: (days: TrendPeriodDays) => ReactNode
  showPeriodPicker?: boolean
  // 大多數模組沿用「近期趨勢」；獸醫報告等非單純趨勢圖的內容需要換成自己的標題，避免文不對題。
  title?: LocalizedText
}) {
  const { text } = useI18n()
  const [expanded, setExpanded] = useState(() => readTrendExpanded(moduleId))
  const [days, setDays] = useState<TrendPeriodDays>(readTrendPeriod)

  const toggle = () => {
    const next = !expanded
    setExpanded(next)
    saveTrendExpanded(moduleId, next)
  }

  const selectDays = (nextDays: TrendPeriodDays) => {
    // 期間是跨模組共用的偏好；在血壓改成 28 天後切到體溫，應該看到同一個區間。
    setDays(nextDays)
    saveTrendPeriod(nextDays)
  }

  return (
    <section className="mt-4 rounded-3xl border border-slate-200 bg-white shadow-sm" aria-labelledby={titleId}>
      <h2 id={titleId}>
        <button
          type="button"
          onClick={toggle}
          aria-expanded={expanded}
          aria-controls={`${moduleId}-trend-panel`}
          className="flex min-h-14 w-full items-center justify-between gap-3 rounded-3xl px-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600 focus-visible:ring-inset"
        >
          <span className="text-base font-extrabold text-slate-950">{text(title)}</span>
          <span className="flex shrink-0 items-center gap-2 text-sm font-bold text-slate-600">
            {expanded ? text({ id: 'Tutup', zh: '收合' ,en: 'Collapse' }) : text({ id: 'Lihat', zh: '查看' ,en: 'View' })}
            <span aria-hidden="true">{expanded ? '⌃' : '⌄'}</span>
          </span>
        </button>
      </h2>

      {expanded && (
        <div id={`${moduleId}-trend-panel`} className="border-t border-slate-100 px-4 pb-4 pt-3">
          {showPeriodPicker && (
            <div className="flex flex-wrap gap-2" role="group" aria-label={text({ id: 'Rentang tren', zh: '趨勢區間' ,en: 'Trend range' })}>
              {TREND_PERIOD_OPTIONS.map(option => (
                <button
                  key={option}
                  type="button"
                  aria-pressed={days === option}
                  onClick={() => selectDays(option)}
                  className={`min-h-11 rounded-xl border px-3 py-2 text-sm font-semibold transition focus-visible:outline-2 focus-visible:outline-emerald-700 ${
                    days === option
                      ? 'border-emerald-700 bg-emerald-700 text-white'
                      : 'border-gray-200 bg-white text-gray-700 active:bg-gray-100'
                  }`}
                >
                  {text(common.days(option))}
                </button>
              ))}
            </div>
          )}
          {/* 圖表套件較重，收合時不載入；展開後的下載空檔用明確的載入文字說明，避免看起來當掉。 */}
          <Suspense fallback={<p role="status" className="mt-3 text-sm text-slate-500">{text(common.loading)}</p>}>
            <div className="mt-3">{children(days)}</div>
          </Suspense>
        </div>
      )}
    </section>
  )
}
