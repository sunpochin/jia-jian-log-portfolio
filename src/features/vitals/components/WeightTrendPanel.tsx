/*
檔案用途：在體重照護模組內呈現每日平均體重的近期趨勢。
所在層：src/features/vitals/components；由 WeightPage 透過 lazy 掛載在「近期趨勢」區塊內。
主要關聯：patient_weight_measurement_records、demoStorage、lib/trendSeries 與共用的 DailyTrendChart。

為什麼新增：體重原本只有「最近紀錄」清單，全 App 沒有任何地方畫得出體重變化——
而體重趨勢正是長者與寵物照護最常被醫師問到的指標之一。
*/
import { useEffect, useState } from 'react'
import dayjs from 'dayjs'
import timezone from 'dayjs/plugin/timezone'
import { DailyTrendChart } from '../../../components/daily-care/DailyTrendChart'
import { common, useI18n } from '../../../lib/i18n'
import { isDemoMode, readDemoWeightRecords } from '../../../lib/demoStorage'
import { supabase } from '../../../lib/supabase'
import { TZ } from '../../../lib/timezone'
import { dailyWeightAverages, type TrendPoint } from '../../../lib/trendSeries'
import { formatWeightKg } from '../../../lib/weight'

dayjs.extend(timezone)

export function WeightTrendPanel({ patientId, days }: { patientId: string; days: number }) {
  const { text } = useI18n()
  const [points, setPoints] = useState<TrendPoint[] | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    setPoints(null)
    setFailed(false)
    const since = dayjs().tz(TZ).startOf('day').subtract(Math.max(1, days) - 1, 'day').format('YYYY-MM-DD')

    if (isDemoMode()) {
      const records = readDemoWeightRecords(patientId).filter(record => record.measured_on >= since)
      setPoints(dailyWeightAverages(records, days))
      return
    }

    void supabase.from('patient_weight_measurement_records')
      .select('weight_kg, measured_on')
      .eq('patient_id', patientId)
      .gte('measured_on', since)
      .order('measured_on', { ascending: true })
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) {
          console.error('[weight trend read error]', error)
          setFailed(true)
          return
        }
        setPoints(dailyWeightAverages((data ?? []) as { measured_on: string; weight_kg: number }[], days))
      })

    return () => { cancelled = true }
  }, [days, patientId])

  if (failed) return <p role="alert" className="text-sm font-semibold text-red-700">{text({ id: 'Tren berat badan tidak dapat dimuat.', zh: '目前無法讀取體重趨勢。' ,en: 'Tren berat baand not can dimuat.' })}</p>
  if (!points) return <p role="status" className="text-sm text-slate-500">{text(common.loading)}</p>

  return <DailyTrendChart
    points={points}
    color="#1D4ED8"
    unit={{ id: 'kg', zh: 'kg' ,en: "kg" }}
    seriesLabel={{ id: 'Berat badan harian (rata-rata)', zh: '每日體重（當日平均）' ,en: 'Daily weight (average for the day)' }}
    emptyLabel={{ id: 'Belum ada catatan berat badan pada rentang ini.', zh: '這個區間還沒有體重紀錄。' ,en: 'Not yet ada record berat baand on rentang this.' }}
    valueFormatter={value => formatWeightKg(value)}
  />
}
