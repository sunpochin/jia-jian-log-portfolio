/*
檔案用途：保存免登入 /demo 的本機試用變更，讓血壓、體溫與藥單操作能真的反映在畫面上。
所在層：src/lib/demoStorage；只服務展示模式的 localStorage 資料轉接層，不連接真實照護資料。
主要關聯：對外公開介面（供呼叫端以 `../../lib/demoStorage` 匯入，維持與拆分前相同的路徑）；
實際邏輯依領域拆分到同目錄的 store／vitals／petCare／medication／medicationPrn／careRecords。
*/
export * from './store'
export * from './vitals'
export * from './petCare'
export * from './medication'
export * from './medicationPrn'
export * from './careRecords'
