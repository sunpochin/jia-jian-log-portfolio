/*
檔案用途：在飲食照護模組內呈現每日熱量合計的近期趨勢。
所在層：src/features/nutrition/components；由 NutritionPage 透過 lazy 掛載在「近期趨勢」區塊內。
主要關聯：meal_records、meal_record_items、demoStorage、lib/trendSeries 與共用的 DailyTrendChart。

為什麼新增：飲食原本只查當日範圍，全 App 完全看不到昨天吃了什麼、也沒有任何熱量趨勢，
照護者無法回答「這禮拜吃得夠不夠」這種最基本的問題。
*/
import { useEffect, useState } from 'react'
import dayjs from 'dayjs'
import timezone from 'dayjs/plugin/timezone'
import { DailyTrendChart } from '../../../components/daily-care/DailyTrendChart'
import { common, useI18n } from '../../../lib/i18n'
import { isDemoMode, readDemoMealData } from '../../../lib/demoStorage'
import { supabase } from '../../../lib/supabase'
import { TZ } from '../../../lib/timezone'
import { dailyCalorieTotals, type TrendPoint } from '../../../lib/trendSeries'

dayjs.extend(timezone)

export function NutritionTrendPanel({ patientId, days }: { patientId: string; days: number }) {
  const { text } = useI18n()
  const [points, setPoints] = useState<TrendPoint[] | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    setPoints(null)
    setFailed(false)
    const now = dayjs().tz(TZ)
    const since = now.startOf('day').subtract(Math.max(1, days) - 1, 'day').toISOString()
    const until = now.endOf('day').toISOString()

    const load = async () => {
      if (isDemoMode()) {
        const data = readDemoMealData(patientId, since, until)
        const byRecord = new Map(data.records.map(record => [record.id, record.occurred_at]))
        return data.items.map(item => ({
          occurredAt: byRecord.get(item.meal_record_id) ?? now.toISOString(),
          calories: item.calories_kcal ?? null,
        }))
      }

      const { data: meals, error: mealsError } = await supabase.from('meal_records')
        .select('id, occurred_at')
        .eq('patient_id', patientId)
        .gte('occurred_at', since)
        .lte('occurred_at', until)
      if (mealsError) throw mealsError

      const mealRows = (meals ?? []) as { id: string; occurred_at: string }[]
      if (mealRows.length === 0) return []

      const { data: mealItems, error: itemsError } = await supabase.from('meal_record_items')
        .select('meal_record_id, calories_kcal')
        .eq('patient_id', patientId)
        .in('meal_record_id', mealRows.map(meal => meal.id))
      if (itemsError) throw itemsError

      const occurredByRecord = new Map(mealRows.map(meal => [meal.id, meal.occurred_at]))
      return ((mealItems ?? []) as { meal_record_id: string; calories_kcal: number | null }[]).map(item => ({
        occurredAt: occurredByRecord.get(item.meal_record_id) ?? now.toISOString(),
        calories: item.calories_kcal ?? null,
      }))
    }

    void load()
      .then(items => { if (!cancelled) setPoints(dailyCalorieTotals(items, days)) })
      .catch(error => {
        console.error('[nutrition trend read error]', error)
        if (!cancelled) setFailed(true)
      })

    return () => { cancelled = true }
  }, [days, patientId])

  if (failed) return <p role="alert" className="text-sm font-semibold text-red-700">{text({ id: 'Tren kalori tidak dapat dimuat.', zh: '目前無法讀取熱量趨勢。' ,en: 'Tren kalori not can dimuat.' })}</p>
  if (!points) return <p role="status" className="text-sm text-slate-500">{text(common.loading)}</p>

  return <>
    <DailyTrendChart
      points={points}
      color="#047857"
      unit={{ id: 'kcal', zh: 'kcal' ,en: "kcal" }}
      seriesLabel={{ id: 'Total kalori harian', zh: '每日熱量合計' ,en: 'Total Daily Calories' }}
      emptyLabel={{ id: 'Belum ada catatan makan pada rentang ini.', zh: '這個區間還沒有飲食紀錄。' ,en: 'Not yet ada record meal on rentang this.' }}
      valueFormatter={value => value.toFixed(0)}
    />
    {/* 空白與 0 必須可分辨，否則「那天沒記錄」會被誤讀成「那天沒吃」。 */}
    <p className="mt-2 text-xs text-slate-500">
      {text({ id: 'Hari tanpa catatan dibiarkan kosong, bukan dihitung nol.', zh: '沒有紀錄的日子留白，不會當成 0 大卡。' ,en: 'Leave blank for unrecorded days, not 0 cards.' })}
    </p>
  </>
}
