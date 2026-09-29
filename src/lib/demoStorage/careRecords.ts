/*
檔案用途：/demo 展示模式的其餘日常照護紀錄本機存取——失智照護、輸出入量、飲食與照護大事記時間軸。
所在層：src/lib/demoStorage；這幾類各自資料量小、不足以獨立成檔，依「非生理量測、非藥物」的日常照護記錄
歸為同一類，狀態透過 ./store 的共用 loadState／saveState 存取。
主要關聯：由 DementiaCarePage、FluidBalancePage、NutritionPage／NutritionTrendPanel、
care-family 的照護大事記 hooks 經 demoStorage/index.ts 呼叫。
*/
import type { DementiaCareRecord, FluidBalanceRecord, MealFoodCatalogItem, MealRecord, MealRecordItem } from '../../types/database'
import { getFallbackDemoCareTimeline } from '../demoData'
import type { CareTimelineEntry } from '../careTimeline'
import { loadState, isPersistenceFailed, saveState } from './store'

export function readDemoDementiaCareRecords(patientId: string, dayStartIso: string, dayEndIso?: string): DementiaCareRecord[] {
  return (loadState().dementiaCareRecords ?? [])
    .filter(record => record.patient_id === patientId && Date.parse(record.occurred_at) >= Date.parse(dayStartIso) && (dayEndIso === undefined || Date.parse(record.occurred_at) < Date.parse(dayEndIso)))
    .sort((left, right) => Date.parse(right.occurred_at) - Date.parse(left.occurred_at))
}

export function saveDemoDementiaCareRecord(record: DementiaCareRecord): void {
  const state = loadState()
  saveState({ ...state, dementiaCareRecords: [...(state.dementiaCareRecords ?? []), record] })
}

export function readDemoFluidBalanceRecords(patientId: string, dayStartIso: string, dayEndIso?: string): FluidBalanceRecord[] {
  return (loadState().fluidBalanceRecords ?? [])
    .filter(record => record.patient_id === patientId && Date.parse(record.occurred_at) >= Date.parse(dayStartIso) && (dayEndIso === undefined || Date.parse(record.occurred_at) < Date.parse(dayEndIso)))
    .sort((left, right) => Date.parse(right.occurred_at) - Date.parse(left.occurred_at))
}

export function saveDemoFluidBalanceRecord(record: FluidBalanceRecord): void {
  const state = loadState()
  saveState({ ...state, fluidBalanceRecords: [...(state.fluidBalanceRecords ?? []), record] })
}

export function readDemoMealData(patientId: string, since: string, until: string) {
  const state = loadState()
  const records = (state.mealRecords ?? []).filter(record => record.patient_id === patientId && record.occurred_at >= since && record.occurred_at <= until)
    .sort((left, right) => right.occurred_at.localeCompare(left.occurred_at))
  const recordIds = new Set(records.map(record => record.id))
  return {
    records,
    items: (state.mealRecordItems ?? []).filter(item => item.patient_id === patientId && recordIds.has(item.meal_record_id)),
  }
}

export function searchDemoMealFoodCatalog(patientId: string, query: string): MealFoodCatalogItem[] {
  const normalized = query.normalize('NFKC').toLowerCase().trim()
  if (normalized.length < 2) return []
  return (loadState().mealFoodCatalogItems ?? [])
    .filter(item => item.patient_id === patientId && item.normalized_search_text.includes(normalized))
    .sort((left, right) => right.last_used_at.localeCompare(left.last_used_at))
    .slice(0, 8)
}

export function saveDemoMealItem(input: Pick<MealRecord, 'patient_id' | 'meal_type' | 'occurred_at' | 'recorded_by'> & Pick<MealRecordItem, 'food_name_snapshot' | 'serving_label_snapshot' | 'quantity' | 'calories_kcal' | 'calorie_basis'>): { record: MealRecord; item: MealRecordItem } {
  const state = loadState()
  const now = new Date().toISOString()
  const normalized = input.food_name_snapshot.normalize('NFKC').toLowerCase().trim().replace(/\s+/g, ' ')
  const existingCatalog = (state.mealFoodCatalogItems ?? []).find(item => item.patient_id === input.patient_id && item.normalized_search_text === normalized && item.default_serving_label === input.serving_label_snapshot)
  const catalog: MealFoodCatalogItem = existingCatalog
    ? { ...existingCatalog, default_calories_kcal: input.calories_kcal, last_used_at: now, use_count: existingCatalog.use_count + 1, updated_at: now }
    : { id: `demo-food-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, patient_id: input.patient_id, display_name: input.food_name_snapshot.trim(), brand_name: null, normalized_search_text: normalized, default_serving_label: input.serving_label_snapshot.trim(), default_calories_kcal: input.calories_kcal, source: 'manual', last_used_at: now, use_count: 1, created_by: input.recorded_by, created_at: now, updated_at: now }
  const record: MealRecord = { id: `demo-meal-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, patient_id: input.patient_id, meal_type: input.meal_type, occurred_at: input.occurred_at, notes: null, source: 'manual', recorded_by: input.recorded_by, created_at: now, updated_at: now }
  const item: MealRecordItem = { id: `demo-meal-item-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, meal_record_id: record.id, patient_id: input.patient_id, food_catalog_item_id: catalog.id, food_name_snapshot: catalog.display_name, serving_label_snapshot: input.serving_label_snapshot.trim(), quantity: input.quantity, calories_kcal: input.calories_kcal, calorie_basis: input.calorie_basis, created_at: now }
  // Demo 也用病人 ID 隔離，讓端對端測試不會把美玲的餐點留到另一位展示對象。
  saveState({ ...state, mealFoodCatalogItems: [...(state.mealFoodCatalogItems ?? []).filter(candidate => candidate.id !== catalog.id), catalog], mealRecords: [...(state.mealRecords ?? []), record], mealRecordItems: [...(state.mealRecordItems ?? []), item] })
  return { record, item }
}

/**
 * 合併種子故事（程式碼常數）與訪客本機新增／修改的大事記，濾掉墓碑 id，並依發生時間新到舊排序。
 * 种子與本機資料用同一份 id 命名空間比對：本機資料若沿用種子 id（編輯種子事件）就地覆蓋，
 * 否則視為新增項目附加進清單，這樣「修改種子事件」與「新增一筆事件」共用同一條合併規則。
 */
export function readDemoCareTimeline(patientId: string): CareTimelineEntry[] {
  const state = loadState()
  const deletedIds = new Set(state.deletedCareTimelineIds ?? [])
  const localById = new Map((state.careTimelineEntries ?? []).filter(entry => entry.patient_id === patientId).map(entry => [entry.id, entry]))
  const seeded = getFallbackDemoCareTimeline().filter(entry => entry.patient_id === patientId)
  const merged = new Map<string, CareTimelineEntry>()
  for (const entry of seeded) merged.set(entry.id, entry)
  for (const [id, entry] of localById) merged.set(id, entry)
  return [...merged.values()]
    .filter(entry => !deletedIds.has(entry.id))
    .sort((left, right) => Date.parse(right.occurred_at) - Date.parse(left.occurred_at))
}

// 每張展示模式照片都是 data URI，壓縮後單張約 100KB、base64 編碼再放大約 1/3，遠比純文字事件重；
// 沒有上限的話，同一個瀏覽器多拍幾筆帶照片的事件，遲早會撞到 localStorage 常見的 5MiB 上限，
// 而 saveState 的寫入失敗目前只是 console.warn，畫面卻可能已經顯示「已儲存」。這裡抓一個明顯
// 低於上限的預算，只針對「帶照片」的本機事件做總量控制——不帶照片的純文字事件不受影響，
// 也完全不影響種子故事（種子資料是程式碼常數，從不進這個陣列）。
const DEMO_CARE_TIMELINE_PHOTO_BUDGET_BYTES = 3 * 1024 * 1024

function careTimelineEntryPhotoBytes(entry: CareTimelineEntry): number {
  // data URI 字串長度約等於編碼後的位元組數，這裡只是抓一個保守概算，不需要真的解碼。
  return (entry.demo_photo_urls ?? []).reduce((total, url) => total + url.length, 0)
}

/**
 * 依「越新越留」的原則，把帶照片的本機事件裁到預算以內；不帶照片的事件不佔預算、一律保留。
 * 舊的先丟：訪客越可能還記得剛剛拍了什麼，新加入的事件應該優先留下。
 */
function pruneCareTimelinePhotoBudget(entries: CareTimelineEntry[]): CareTimelineEntry[] {
  const sorted = [...entries].sort((left, right) => Date.parse(right.created_at) - Date.parse(left.created_at))
  const kept: CareTimelineEntry[] = []
  let usedBytes = 0
  for (const entry of sorted) {
    const bytes = careTimelineEntryPhotoBytes(entry)
    if (bytes > 0 && usedBytes + bytes > DEMO_CARE_TIMELINE_PHOTO_BUDGET_BYTES) continue
    usedBytes += bytes
    kept.push(entry)
  }
  return kept
}

/**
 * 新增或就地覆蓋一筆本機大事記；儲存的是完整 entry，呼叫端負責帶齊欄位（含既有照片）。
 * 回傳這筆是否真的留下來了：localStorage 寫入失敗，或者這筆本身在照片預算裁減時被排擠掉
 * （budget 遠大於單筆上限，理論上極少發生，但仍要讓呼叫端分辨得出來，不能默默回報成功），
 * 呼叫端應該把 false 當成儲存失敗處理，而不是照常顯示「已儲存」。
 */
export function saveDemoCareTimelineEntry(entry: CareTimelineEntry): boolean {
  const state = loadState()
  const merged = [...(state.careTimelineEntries ?? []).filter(existing => existing.id !== entry.id), entry]
  const careTimelineEntries = pruneCareTimelinePhotoBudget(merged)
  // 這筆本身被預算裁掉時不落地：merged 已經把舊版本濾掉了，若這裡照樣 saveState，
  // 等於編輯失敗卻把原本存在的舊版本一併清空，畫面卻只顯示存檔失敗——保留呼叫前的原始資料。
  if (!careTimelineEntries.some(saved => saved.id === entry.id)) return false
  saveState({ ...state, careTimelineEntries })
  return !isPersistenceFailed()
}

/**
 * 刪除一筆大事記。本機新增的項目直接從陣列移除；種子故事的項目沒有對應的本機紀錄可移除，
 * 改記進墓碑名單，讓 readDemoCareTimeline 之後一律濾掉——訪客看到的效果跟真的刪除一樣。
 */
export function deleteDemoCareTimelineEntry(id: string, patientId: string): boolean {
  const state = loadState()
  const visible = readDemoCareTimeline(patientId)
  if (!visible.some(entry => entry.id === id)) return false
  const careTimelineEntries = (state.careTimelineEntries ?? []).filter(entry => entry.id !== id)
  const deletedCareTimelineIds = [...new Set([...(state.deletedCareTimelineIds ?? []), id])]
  saveState({ ...state, careTimelineEntries, deletedCareTimelineIds })
  return true
}
