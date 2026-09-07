<!--
檔案用途：記錄 2026-09 對 src/components、src/features 的重構掃描結論、已執行項目與延後待辦。
所在層：docs/architecture；補充 overview.md，聚焦一次性的元件結構整理，不是常態規格。
主要關聯：TECHNICAL.md 索引、docs/features/medication.md、src/hooks/useSaveStatus.ts、
  src/features/medication/hooks/useMedicationAdminForm.ts、PR #583。
-->

# 元件重構掃描（2026-09）

## 背景

使用者請求掃描主要 `src/components`、`src/features` 元件，找出可重構成 best practice 的地方。掃描結論是：這個
repo 已是 feature-sliced 架構（`src/features/*/{pages,components}`），`src/lib/` 有 60+ 個資料層模組，底子不差；
真正的問題是「好模式沒有被推廣」——`src/hooks/useBpRecords.ts` 已經示範了正確的讀取模式（demo 模式 → 本機快取 →
Supabase 查詢 → 競態防護 `useLatestRequest` → 雙語錯誤），但多個頁面各自重造沒有這些保護的樣板。

## 已執行（PR #583）

1. **`MedicationAdminSection.tsx`**：從 747 行、37 個 `useState` 拆成：
   - `hooks/useMedicationAdminForm.ts`：所有狀態與讀寫邏輯（`refresh`／`addExisting`／`addNew`／`remove`／
     `chooseMedication`／`chooseCatalogProduct`…），依語意分成既有醫囑表單、新藥品表單、資料載入三組。
   - `ExistingPlanForm.tsx`、`NewMedicationForm.tsx`：兩個表單各自的 JSX。
   - `MedicationAdminFormFields.tsx`：兩個表單共用的展示元件（藥品卡片、劑型／時段欄位、照片上傳）。
   - `MedicationAdminSection.tsx` 容器降到 67 行。
2. **`src/hooks/useSaveStatus.ts`**：把 `WeightPage`、`FluidBalancePage`、`PetEndocrinePage` 各自重複的
   `status: 'idle'|'saving'|'ok'|'err'` + `message` + 成功後 `setTimeout` 回到 idle 收成一個共用 hook。
   `WeightPage` 原本把讀取狀態與送出狀態混在同一顆 `status`，拆成獨立 `loading` + 共用的送出狀態。
   （後續 review 發現 `succeed()` 排的計時器若在下一次送出前未清除，會把進行中的新請求誤判成 idle 而允許
   重複送出；已在 hook 內用 ref 追蹤計時器並於 `begin`／`succeed`／`fail`／`reset`／卸載時清除。）

兩項都是純程式碼結構重構，行為、文案、雙語內容、寫入 payload 不變；驗證方式見 PR #583（lint／build／972 個
unit test／`/demo` 展示模式手動走查四條路徑）。

## 延後（未在這次 PR 執行）

依效益排序，記錄在此供之後排入 backlog，不代表已核准排程：

3. **收斂頁面內直接呼叫 `supabase.from(...)` 進資料層**：pet-care 6 頁、`FluidBalancePage`、`WeightPage` 等
   20+ 個 `features/` 檔案仍直接查詢資料庫，跟 `src/lib/*` 既有資料層（例如 `medications.ts`、
   `prnMedication.ts`）不一致，也少了 `useLatestRequest` 競態防護與本機快取。
4. **以 `useBpRecords` 為範本做讀取 hook 工廠**（快取＋競態防護＋demo fallback），但需要先完成第 3 項才划算，
   否則工廠只是把現有的不一致樣板再包一層。
5. **拆 `App.tsx`**（913 行、26 個 `useState`）的路由與全域狀態；風險較高，需要單獨一個 PR 處理。

## 為什麼記在這裡

這份文件本身不是「持續維護的規格」，是一次性重構的存證，讓後續 Agent 或維護者知道：為什麼元件被拆成現在的樣子、
拆分邊界怎麼決定的、還有哪些已知的類似問題尚未處理。若之後執行第 3–5 項，更新本檔的「已執行」章節，不必另開新檔。

## 2026-09 後續：憲法規範化

本次重構提煉的三條狀態管理規則（Rule A / B / C）已正式化為 [`AGENTS.md`](../../AGENTS.md) § 4 的「前端元件狀態管理規則」，
作為所有新元件、新表單頁與狀態邏輯的憲法。往後任何同類問題（元件 `useState` 過多、樣板重複、讀寫狀態混用）都應
遵循憲法規則，而不是重複執行本次掃描；`TECHNICAL.md` 的文件索引表也補上了該條規則的導航。這確保代碼不會再次演化成
「16 個 loading 樣板各自重造」的局面。
