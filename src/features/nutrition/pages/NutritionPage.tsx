/*
檔案用途：提供被照護者的每餐熱量登錄與病人專屬食物搜尋。
所在層：src/features/nutrition/pages；由每日照護頁以目前 patient_id 掛載。
主要關聯：meal_records、meal_food_catalog_items、demoStorage 與 nutrition 規則；體重由每日照護的獨立 panel 掛載。
*/
import { lazy, useCallback, useEffect, useMemo, useState } from 'react'
import dayjs from 'dayjs'
import timezone from 'dayjs/plugin/timezone'
import { useI18n } from '../../../lib/i18n'
import { supabase } from '../../../lib/supabase'
import { TZ } from '../../../lib/timezone'
import { isDemoMode, readDemoMealData, saveDemoMealItem, searchDemoMealFoodCatalog } from '../../../lib/demoStorage'
import { hasUnknownCalories, isValidCalories, isValidQuantity, MEAL_TYPES, MEAL_TYPE_LABELS, mealCaloriesTotal, normalizeFoodQuery } from '../../../lib/nutrition'
import type { MealFoodCatalogItem, MealRecord, MealRecordItem, MealType } from '../../../types/database'
import { usePwaUpdateGuard } from '../../../lib/pwaUpdateGuard'
import { ModuleTrendSection } from '../../../components/daily-care/ModuleTrendSection'

dayjs.extend(timezone)

const UNSAVED_INPUT_SOURCE = 'nutrition-meal'

// 圖表套件只在照護者展開趨勢時才下載，不進入每日照護的初始載入路徑。
const NutritionTrendPanel = lazy(() => import('../components/NutritionTrendPanel').then(m => ({ default: m.NutritionTrendPanel })))

export function NutritionPage({ patientId, patientName, userEmail }: { patientId: string; patientName?: string; userEmail?: string }) {
  const { text } = useI18n()
  const { registerUnsavedInput } = usePwaUpdateGuard()
  const [mealType, setMealType] = useState<MealType>('breakfast')
  const [foodName, setFoodName] = useState('')
  const [servingLabel, setServingLabel] = useState('')
  const [quantity, setQuantity] = useState<number | ''>(1)
  const [calories, setCalories] = useState<number | ''>('')
  const [records, setRecords] = useState<MealRecord[]>([])
  const [items, setItems] = useState<MealRecordItem[]>([])
  const [matches, setMatches] = useState<MealFoodCatalogItem[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  // PWA 常駐在手機上不會重新掛載；若日界線只在掛載時算一次，過了午夜「今日合計」與
  // 「今天的餐點」會一直停在前一天且不會自己更新（血壓頁與服藥頁都有跨日檢查，只有這裡沒有）。
  // 用台北日期字串當依賴，跨日時才重算範圍並觸發 refresh。
  const [dayKey, setDayKey] = useState(() => dayjs().tz(TZ).format('YYYY-MM-DD'))
  useEffect(() => {
    // 餐點紀錄不需要秒級精度，60 秒足以在跨日後很快換頁，也避免每秒重繪整頁。
    const timer = setInterval(() => setDayKey(dayjs().tz(TZ).format('YYYY-MM-DD')), 60_000)
    return () => clearInterval(timer)
  }, [])

  const dayRange = useMemo(() => {
    const now = dayjs().tz(TZ)
    return { start: now.startOf('day').toISOString(), end: now.endOf('day').toISOString() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dayKey])

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      if (isDemoMode()) {
        const data = readDemoMealData(patientId, dayRange.start, dayRange.end)
        setRecords(data.records)
        setItems(data.items)
        return
      }
      const { data: meals, error: mealsError } = await supabase.from('meal_records').select('*').eq('patient_id', patientId).gte('occurred_at', dayRange.start).lte('occurred_at', dayRange.end).order('occurred_at', { ascending: false })
      if (mealsError) throw mealsError
      const ids = (meals ?? []).map((meal: { id: string }) => meal.id)
      const { data: mealItems, error: itemsError } = ids.length
        ? await supabase.from('meal_record_items').select('*').eq('patient_id', patientId).in('meal_record_id', ids)
        : { data: [], error: null }
      if (itemsError) throw itemsError
      setRecords((meals ?? []) as MealRecord[])
      setItems((mealItems ?? []) as MealRecordItem[])
    } catch (error) {
      console.error('[meal read error]', error)
      setMessage(text({ id: 'Catatan makan belum dapat dibaca. Periksa jaringan lalu coba lagi.', zh: '暫時無法讀取飲食紀錄，請確認網路後再試。', en: 'There was an error reading your diet, please check your network and try again.' }))
    } finally {
      setLoading(false)
    }
  }, [dayRange.end, dayRange.start, patientId, text])

  useEffect(() => { void refresh() }, [refresh])
  useEffect(() => {
    registerUnsavedInput(UNSAVED_INPUT_SOURCE, Boolean(foodName.trim() || calories !== ''))
    return () => registerUnsavedInput(UNSAVED_INPUT_SOURCE, false)
  }, [calories, foodName, registerUnsavedInput])

  useEffect(() => {
    const query = normalizeFoodQuery(foodName)
    if (query.length < 2) { setMatches([]); return }
    const timer = window.setTimeout(() => {
      if (isDemoMode()) { setMatches(searchDemoMealFoodCatalog(patientId, query)); return }
      void supabase.rpc('search_patient_food_catalog', { p_patient_id: patientId, p_query: query, p_limit: 8 })
        .then(({ data, error }) => {
          if (error) { console.error('[meal catalog search error]', error); setMatches([]); return }
          setMatches((data ?? []).map((item: { id: string; display_name: string; brand_name: string | null; default_serving_label: string; default_calories_kcal: number | null; source: MealFoodCatalogItem['source'] }) => ({ ...item, patient_id: patientId, normalized_search_text: '', last_used_at: '', use_count: 0, created_by: '', created_at: '', updated_at: '' })))
        })
    }, 250)
    return () => window.clearTimeout(timer)
  }, [foodName, patientId])

  const selectMatch = (match: MealFoodCatalogItem) => {
    setFoodName(match.display_name)
    setServingLabel(match.default_serving_label)
    setCalories(match.default_calories_kcal ?? '')
    setMatches([])
  }

  const save = async () => {
    if (!userEmail || !foodName.trim() || !isValidQuantity(quantity) || !isValidCalories(calories) || saving) return
    setSaving(true)
    setMessage('')
    try {
      const occurredAt = new Date().toISOString()
      if (isDemoMode()) {
        saveDemoMealItem({ patient_id: patientId, meal_type: mealType, occurred_at: occurredAt, recorded_by: userEmail, food_name_snapshot: foodName, serving_label_snapshot: servingLabel, quantity, calories_kcal: calories, calorie_basis: 'user_entered' })
      } else {
        const { error } = await supabase.rpc('record_meal_item', { p_patient_id: patientId, p_meal_type: mealType, p_occurred_at: occurredAt, p_food_name: foodName, p_serving_label: servingLabel, p_quantity: quantity, p_calories_kcal: calories, p_calorie_basis: 'user_entered' })
        if (error) throw error
      }
      setFoodName(''); setServingLabel(''); setQuantity(1); setCalories(''); setMatches([])
      setMessage(text({ id: 'Makanan dan kalori sudah disimpan.', zh: '餐點與熱量已記錄。', en: 'Meal and calorie information saved.' }))
      await refresh()
    } catch (error) {
      console.error('[meal save error]', error)
      setMessage(text({ id: 'Makanan belum dapat disimpan. Periksa jaringan lalu coba lagi.', zh: '餐點儲存失敗，請確認網路後再試。', en: 'Mealan not yet can saved. Periksa network lalu try again.' }))
    } finally {
      setSaving(false)
    }
  }

  const total = mealCaloriesTotal(items)
  const itemByRecord = new Map(items.map(item => [item.meal_record_id, item]))
  return <div className="min-h-full bg-slate-50 px-5 pb-5 pt-3 text-slate-900">
    <header><p className="text-xs font-bold uppercase tracking-wider text-emerald-700">{text({ id: 'Nutrisi', zh: '飲食', en: 'Nutrition' })}</p><h2 className="mt-1 text-xl font-extrabold text-slate-950">{patientName || text({ id: 'Orang yang dirawat', zh: '被照護者', en: 'Person that dirawat' })}</h2></header>
    <section className="mt-3 rounded-3xl border border-emerald-200 bg-emerald-50 p-4" aria-label={text({ id: 'Total kalori hari ini', zh: '今日總熱量', en: 'Total calories today' })}><p className="text-sm font-bold text-emerald-900">{text({ id: 'Total hari ini', zh: '今日合計', en: 'Today’s total' })}</p><p className="mt-1 text-4xl font-black tabular-nums text-emerald-800">{total.toFixed(0)} <span className="text-base">kcal</span></p>{hasUnknownCalories(items) && <p className="mt-1 text-xs font-semibold text-amber-800">{text({ id: 'Sebagian makanan belum memiliki kalori.', zh: '部分餐點尚未有熱量。', en: 'Sebagian makanan not yet memiliki kalori.' })}</p>}</section>
    <section className="mt-3 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm" aria-labelledby="meal-entry-title"><h2 id="meal-entry-title" className="text-base font-extrabold">{text({ id: 'Catat satu makanan', zh: '記錄一項食物', en: 'Catat one makanan' })}</h2><fieldset className="mt-3"><legend className="text-sm font-bold text-slate-700">{text({ id: 'Waktu makan', zh: '餐次', en: 'Time meal' })}</legend><div className="mt-2 grid grid-cols-2 gap-2">{MEAL_TYPES.map(type => <button key={type} type="button" aria-pressed={mealType === type} onClick={() => setMealType(type)} className={`min-h-11 rounded-xl border px-3 py-2 text-sm font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 ${mealType === type ? 'border-emerald-700 bg-emerald-700 text-white' : 'border-slate-200 bg-slate-50 text-slate-700'}`}>{text(MEAL_TYPE_LABELS[type])}</button>)}</div></fieldset>
      <label className="mt-4 block text-sm font-bold text-slate-700" htmlFor="meal-food-name">{text({ id: 'Nama makanan atau produk', zh: '食物或產品名稱', en: 'Name makanan or produk' })}<input id="meal-food-name" value={foodName} onChange={event => setFoodName(event.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-slate-200 p-3 text-base outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-200" /></label>
      {matches.length > 0 && <ul className="mt-2 divide-y rounded-xl border border-emerald-200 bg-white">{matches.map(match => <li key={match.id}><button type="button" onClick={() => selectMatch(match)} className="w-full px-3 py-2 text-left text-sm hover:bg-emerald-50"><span className="font-bold">{match.display_name}</span>{match.default_calories_kcal != null && <span className="ml-2 text-emerald-800">{match.default_calories_kcal} kcal</span>}</button></li>)}</ul>}
      <div className="mt-3 grid grid-cols-2 gap-3"><label className="text-sm font-bold text-slate-700">{text({ id: 'Porsi', zh: '份量說明', en: 'Portion size instructions' })}<input value={servingLabel} onChange={event => setServingLabel(event.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-slate-200 p-3 text-base" /></label><label className="text-sm font-bold text-slate-700">{text({ id: 'Kalori (kcal)', zh: '熱量（kcal）', en: 'Calories (kcal)' })}<input type="number" inputMode="decimal" min="0" max="10000" value={calories} onChange={event => setCalories(event.target.value === '' ? '' : Number(event.target.value))} className="mt-1 min-h-11 w-full rounded-xl border border-slate-200 p-3 text-base" /></label><label className="text-sm font-bold text-slate-700">{text({ id: 'Jumlah', zh: '份數', en: 'Copies' })}<input type="number" inputMode="decimal" min="0.1" max="100" step="0.1" value={quantity} onChange={event => setQuantity(event.target.value === '' ? '' : Number(event.target.value))} className="mt-1 min-h-11 w-full rounded-xl border border-slate-200 p-3 text-base" /></label></div>
      <button type="button" onClick={() => void save()} disabled={!foodName.trim() || !isValidQuantity(quantity) || !isValidCalories(calories) || saving} className="mt-4 min-h-12 w-full rounded-2xl bg-emerald-700 px-4 py-3 text-base font-black text-white disabled:opacity-50">{saving ? text({ id: 'Menyimpan…', zh: '儲存中…', en: 'Saving...' }) : text({ id: 'Simpan makanan', zh: '儲存餐點', en: 'Save item' })}</button>{message && <p role="status" className="mt-2 text-sm font-bold text-emerald-800">{message}</p>}</section>
    <section className="mt-3 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm"><h2 className="font-extrabold">{text({ id: 'Catatan hari ini', zh: '今天的餐點', en: 'Today’s Meals' })}</h2>{loading ? <p className="mt-2 text-sm text-slate-500">{text({ id: 'Memuat…', zh: '讀取中…', en: 'Loading…' })}</p> : records.length === 0 ? <p className="mt-2 text-sm text-slate-500">{text({ id: 'Belum ada makanan tercatat hari ini.', zh: '今天還沒有餐點紀錄。', en: 'No items recorded for today.' })}</p> : <ol className="mt-2 space-y-2">{records.map(record => { const item = itemByRecord.get(record.id); return <li key={record.id} className="rounded-xl bg-slate-50 p-3"><p className="text-xs font-bold text-emerald-800">{text(MEAL_TYPE_LABELS[record.meal_type])}</p><div className="mt-1 flex justify-between gap-3"><span className="font-bold">{item?.food_name_snapshot}</span><span className="font-black tabular-nums">{item?.calories_kcal ?? '—'} kcal</span></div>{item?.serving_label_snapshot && <p className="mt-1 text-xs text-slate-500">{item.serving_label_snapshot}</p>}</li> })}</ol>}</section>
    {/* 原本飲食只查當日，看不到昨天也沒有任何熱量趨勢；回顧留在同一頁，不必跳到別的分頁。 */}
    <ModuleTrendSection moduleId="nutrition" titleId="nutrition-module-trend-title">
      {days => <NutritionTrendPanel patientId={patientId} days={days} />}
    </ModuleTrendSection>
    {/* 體重由每日照護 registry 以獨立 panel 掛載，讓只需要體重的人不必先開啟飲食。 */}
  </div>
}
