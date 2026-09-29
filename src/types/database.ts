/*
檔案用途：前端讀寫 Supabase 資料表的 TypeScript 型別與生命徵象規則型別的 barrel re-export（維持既有 import 路徑相容）。
所在層：src/types 共用資料契約層；不包含資料庫連線或畫面邏輯；實際型別定義依領域拆分於 src/types/database/ 各檔案。
主要關聯：components、hooks 與 lib 以此維持血壓、體溫、體重、藥單及照護事件資料一致；
拆分背景見 issue #836（原 758 行單檔依領域拆分，不改動任何型別定義／欄位，僅搬移程式碼位置）。
不是 src/lib/database.types.ts（Supabase CLI 產生的型別快照，是另一份獨立檔案，見 issue #833）。
*/
export * from './database/bloodPressure'
export * from './database/vitals'
export * from './database/medication'
export * from './database/careEvents'
export * from './database/nutrition'
export * from './database/preferences'
export * from './database/pet'
export * from './database/labResults'
export * from './database/schema'
