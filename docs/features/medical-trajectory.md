<!--
檔案用途：記錄「近期醫療軌跡」讀取模型（issue #684，#659 的 S1）的設計決策、資料來源與已知取捨。
所在層：docs/features；醫療軌跡屬於血壓報告的延伸功能，資料模型獨立於 vitals.md 描述的日常量測流程。
主要關聯：src/lib/medicalTrajectory.ts、src/lib/preVisitSources.ts、
src/features/vitals/hooks/usePreVisitSources.ts、src/features/vitals/components/TrajectorySection.tsx、
src/lib/recordReport.ts 的 buildGptReportText；S2（#686）、S3（#685）依賴本檔描述的 TrajectoryEvent[] 與擴寬血壓視窗。
軌跡頁（D 期，issue #735，src/features/care-family/pages/TrajectoryPage.tsx）另外呼叫同檔案的
buildCareTrajectoryFeed，差異見 docs/features/care-timeline.md。
-->

# 醫療軌跡讀取模型（S1）

## 為什麼要做

`RecordReport.tsx` 的醫師版報告過去只列「現在在吃什麼」，不列「這段期間改了什麼」；`DashboardChart.tsx`
在圖上標調藥點，但沒有跟血壓讀值、看診事件、到期提醒放進同一份可列印報告。調藥紀錄
（`medication_plan_change_logs`）、照護時間線（`care_timeline_entries`）與到期提醒
（`care_due_reminders`）都已是既有的不可篡改或獨立資料來源，缺的是把它們合併成一條時間序、
印進報告的**讀取模型**。這是 #659（Clinical Care Ops 產品戰略重定位）五個施工單位（S1–S5）的第一張，
純描述、無 schema 變更；S2（#686，規則引擎與措辭契約見 [`pre-visit-brief.md`](./pre-visit-brief.md)）
已在這份時間序上疊加規則引擎，S3（#685）在 S1 之後任何時間可平行開工。軌跡頁（D 期，issue #735）
另外用同一份合併去重邏輯衍生出不限報告視窗、不收斂事件型別的 `buildCareTrajectoryFeed`，
取代原本的事件 tab；差異與取捨說明見 [`care-timeline.md`](./care-timeline.md) 的「軌跡頁」一節。

## 規劃文件缺口說明

原始 issue #684 內文引用「規劃文件 `docs/product/clinical-care-ops.md`（§5.1、§6、§8）」，但該檔案在
repo 裡實際不存在——`docs/product/` 底下只有 [`clinical-care-ops-ui-design.md`](../product/clinical-care-ops-ui-design.md)，
內容是版型與色彩重整的 UI audit，沒有涵蓋醫療軌跡的資料模型章節。本檔案就是用來補上這個缺口：
issue #684 本文的 Scope／Touch points／Acceptance 段落已經足夠詳細，S1 的實作與這裡的說明都以 issue
本文與既有程式碼慣例為準；日後若真的建立 `clinical-care-ops.md`，應該反過來引用本檔，而不是本檔臆測
一份不存在文件的章節內容。

## 資料模型與邊界

### 調藥的唯一正典來源

`medication_plan_change_logs` 是調藥的唯一正典來源；`care_timeline_entries` 裡帶
`medication_plan_change_log_id` 的列只是同一筆調藥的 1:1 顯示投影（見
`supabase/migrations/20260812010000_reliable_medication_timeline_events.sql` 的
`apply_medication_plan_change`）。`buildMedicalTrajectory`（`src/lib/medicalTrajectory.ts`）合併時
會排除所有 `medication_plan_change_log_id IS NOT NULL` 的時間線列，只用 change log 本身產生事件，
否則同一次調藥會顯示兩次（Codex review PR #689）。

### 為什麼調藥要用「±7 天事件回顧窗」判斷是否落在報告區間

S2 的 R1 規則需要每筆調藥前 7 天的血壓基線，且調藥本身可能落在報告視窗起點前 7 天，仍是這段期間血壓
持續受影響的原因。因此 `buildMedicalTrajectory` 不是直接比對調藥 `effective_at` 是否落在
`[windowStart, windowEnd]`，而是用 `careTimeline.ts` 既有的 `eventReviewWindow(effective_at, 7)`
算出「這筆調藥前後 7 天」，只要這個區間與報告視窗相交就納入。看診／醫囑／意外／重新評估等一般時間線
事件，以及到期提醒，維持直接比對是否落在報告視窗內即可，不套用這個 ±7 天緩衝。

### 血壓基線視窗（供 S2 使用，S1 本身不消費）

`useBpRecords(days)` 只抓剛好 `days` 天；S2 的 R1 需要每筆調藥前 7 天的基線，且調藥可能落在視窗起點
前 7 天，兩段 7 天相加＝ 14 天緩衝。`usePreVisitSources.ts` 因此另外呼叫一次
`useBpRecords(selectedDays + 14, patientId)`。因為 `useBpRecords` 內部的 `patientScopedCacheKey`
把 `days` 編進快取鍵，天數不同天生就是不同的 localStorage key，不需要另外設計快取隔離機制，也不會
覆蓋 `BloodPressureReportPanel` 自己那份 `useBpRecords(selectedDays, patientId)` 用來顯示畫面與 CSV
的快取。**S1 的畫面與 CSV 匯出只顯示 `selectedDays`**，這份擴寬後的資料只存在於
`usePreVisitSources` 的回傳值裡，等 S2 的規則引擎真的需要時才會被消費。

### 三態讀取狀態：ok / unavailable / not_applicable

`src/lib/preVisitSources.ts` 的三個資料來源（調藥歷史、時間線區間、到期提醒）各自獨立回報
`ok`／`unavailable`／`not_applicable`：

- `ok`：成功讀到資料（可能是空陣列，代表這段期間真的沒有異動）。
- `unavailable`：查詢失敗（多半是離線或網路錯誤）。UI 與 GPT 匯出文字都必須印「無法讀取」，
  不能被誤讀成「這段期間沒有異動」——這兩者是不同的事實，混在一起會讓照護者或醫師誤判資料完整性。
- `not_applicable`：這個來源在目前情境下本來就不適用。目前唯一的例子是 `/demo` 訪客模式的到期提醒——
  `care_due_reminders` 沒有展示模式的種子資料或本機 fallback，硬打查詢只會被 anon RLS 擋下並產生一次
  注定失敗的網路請求，違反「/demo 零網路請求」的驗收條件，因此直接短路回報 `not_applicable`。

### ATC 分組只是貼標籤，不是判斷

`resolveTrajectoryMedicationGroup`（`src/lib/medicalTrajectory.ts`）把調藥的 ATC code 分成
`blood_pressure`（C02/C07/C08/C09）、`diuretic`（C03）、`potassium`（A12B）、`diabetes`（A10）、
`anticoagulant`（B01A）五組，是專門給 S2 的 R1 規則引擎用來決定「這筆調藥該比對哪組生理數值」的
分類鍵；S1 本身不對這個分組做任何比對、建議或警示——純分類貼標籤，符合 issue 的「純描述、無規則」
邊界。畫面上顯示給人看的雙語標籤仍然固定經過既有的 `resolveMedicationCategory`
（`src/lib/medication/medicationAtcCategories.ts`），兩者是不同用途、不同對照表，不要合併。

## 驗證方式

- `bun test tests/unit/medicalTrajectory.test.ts tests/unit/recordReport.test.ts tests/unit/trajectorySectionRender.test.ts`
- `bun run lint`、`bun run build`、`npx tsc --noEmit`
- `supabase/tests/rls-authorization.sql` 新增的斷言：`authenticated` 對 `medication_plan_change_logs`
  的 UPDATE／DELETE 必須 raise `medication_plan_change_logs_are_immutable`（由 CI 的
  `verify-supabase-migrations` 執行）。
- staging 人工驗證：每日照護 → 血壓 → 近期趨勢，確認新段落在列印預覽與 GPT 複製文字都出現、
  切換病人無殘留、devtools 離線時顯示「無法讀取」而不是「沒有異動」。
