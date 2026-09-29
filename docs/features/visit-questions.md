<!--
檔案用途：說明回診問題清單（visit questions）功能的使用情境、資料模型與刻意取捨。
所在層：docs/features；由 docs/AGENT_MAP.md 與 TECHNICAL.md 指向的功能文件。
主要關聯：src/lib/visitQuestions.ts、src/features/reminders/pages/VisitQuestionsPage.tsx、
         supabase/migrations/20260912120800_create_patient_visit_questions.sql。
-->

# 回診問題清單（issue #723）

## 動機

[issue #723](https://github.com/portfolio-author/jia-jian-log/issues/723)：有些家屬回診前會把腫瘤才有的「良性／惡性」分類方式，套用到血管性疾病（例如腦動脈瘤）上——這類疾病其實該問的是診斷名稱、檢查數值／大小、下一次追蹤時間、什麼情況要立刻回診或掛急診，以及需不需要調整日常活動。

暴露的產品問題：家屬帶著模糊的問題去看診，離開時也沒有把醫師的回答記下來。下次回診又從零開始，或依賴不同家屬各自的口耳轉述。

## 使用方式

1. 在設定頁的「每日照護顯示」卡片開啟「回診問題清單」（預設關閉，比照失智照護／術後體液平衡，只在照護者主動開啟後才出現）。
2. 每日照護頁會多一個「回診問題清單」頁籤。
3. 平時想到要問的問題就先加進清單，可以直接點選起手式範本一鍵帶入。
4. 回診時逐條勾選「已問」或「略過」，並可展開填入醫師的回答。
5. 已處理的問題會收進「已處理」區塊，仍可重新開啟或編輯。

## 資料模型與權限

- `patient_visit_questions`：`patient_id`、`question`、`answer`（可留白）、`status`（`open` / `asked` / `skipped`）、`sort_order`、`created_by_email`。
- **照護閉環 T1（issue #945，#847 delta #1／#2；migration `20260925180000`）**：這張表同時是 Concern（「這件事還沒有答案」）與 Outcome（「醫師怎麼回答」）的最小載體，不另開 `concerns` 表（理由見 [ADR-005](../adr/005-care-loop-closure.md)）。
  - `source`（`manual` / `pre_visit_rule`，預設 `manual`）＋ `source_rule_id`（規則代號 `R1`–`R5`）＋ `source_entity_id`（觸發它的那一列 id：R1→`medication_plan_change_logs.id`、R2／R3→`care_due_reminders.id`、R4→`care_timeline_entries.id`、R5→`patient_lab_results.id`）。資料庫 CHECK 保證後兩欄只在 `pre_visit_rule` 時可有值且**必須成對**；partial unique index 保證同一位病人對同一 `(rule, entity)` 只能採納一次（連點兩下或兩位照護者同時按會被 23505 擋下）。刻意不對來源表建外鍵：四張表主鍵型別不一，且來源列被刪不該讓已經問過醫師的問題消失；改由 `validate_patient_visit_question_source` BEFORE INSERT／UPDATE trigger（SECURITY DEFINER）在寫入當下依規則代號查對應來源表，確認那一列存在且 `patient_id` 相同——跨病人或不存在一律 23503（與 T2 複合外鍵同碼、不當存在性 oracle）、未知規則代號 23514；來源三欄沒變的更新（改答案、狀態）不再驗，來源列被刪後仍可回答（Codex review PR #951 P1）。
  - `answered_at`：由 `maintain_patient_visit_question_answered_at` BEFORE INSERT／UPDATE trigger 維護——`answer` 由空變有（含改寫）設為 `now()`、被清空設回 `NULL`、沒變就沿用舊值；前端送來的值一律被覆寫，`src/lib/visitQuestions.ts` 也從不送這個欄位。門診頁「醫師說了什麼」用它跟最近一筆 `health_visit.occurred_at` 做時間相近性配對；不借用 `updated_at`（沒有 trigger 維護）或 `asked_at`（狀態離開 `asked` 就會被清空）。
  - RLS policy 不變：把就診前摘要的觀察加入清單，跟手動新增一樣只要求一般 `care_access`。
  - **舊答案回填（`20260925191000`）**：這支 migration 之前就填了答案的列沒有 `answered_at`。回填只信任 `asked_at`（看診時按「已問」才寫入，最接近回答時間），且只填 `status = 'asked'`、答案非空白的列；略過或重新開啟而 `asked_at` 已清空的列維持 `NULL`，在門診頁歸入「未配對到看診紀錄」——拿 `created_at`／`updated_at` 配對會把答案掛到錯的看診，比不配對更誤導。回填期間只在同一個交易內暫停 `maintain_patient_visit_question_answered_at_trigger`，否則它會把 `answered_at` 設回舊值。
  - **⚠️ 來源列改歸屬時沒有自動保護**：`source_entity_id` 沒有外鍵，驗證只發生在問題寫入當下。未來任何 migration／RPC 若要改 `medication_plan_change_logs`、`care_due_reminders`、`care_timeline_entries` 或 `patient_lab_results` 的 `patient_id`（例如家庭合併、照護對象轉移），必須同時處理引用它的 `patient_visit_questions`（清空來源欄位或重新驗證），這裡不會自動擋——跟 `care_due_reminders` 的真外鍵不同（2026-09-26 獨立複審）。
- **獨立於 `care_due_reminders`**：清單是病人層級長期累積的問題庫，不綁定某一筆回診提醒，避免提醒被刪除或改期時問題跟著失去歸屬。
- **讀寫權限刻意比到期提醒寬鬆**：只要求一般 `care_access`，不像提醒表額外要求 `can_manage_medication`——回診前一起想問題、看診時記答案，是全體被授權照護者都該能參與的準備工作，不是醫囑或用藥排程的異動。
  - 取捨：被授權「看」的親戚也能編輯或刪除別人寫的題目與答案。畫面上每筆問題都會顯示 `created_by_email`（由 DB 端 `auth.jwt()` 自動填入，前端不能竄改）做最低限度的可追溯性；之後要收緊權限不需要改 schema。

## 門診 tab 的入口（照護閉環 T5，issue #949）

底部導覽「門診」頁的「問什麼」區塊以 `embedded` 模式嵌入同一個 `VisitQuestionsPage`（不必先在設定頁開啟每日照護的回診問題清單模組）；已填答案的問題另在「醫師說了什麼」依 `answered_at` 配對最近一次看診顯示，見 [`next-visit.md`](./next-visit.md)。

## 從就診前摘要一鍵加入（照護閉環 T4，issue #948）

血壓模組「近期趨勢」的就診前摘要，每個有提問的項目（R1–R5）旁有「加入問題清單」按鈕，寫入時 `source =
'pre_visit_rule'` 並成對記下規則代號與來源列 id；同一來源第二次按會顯示「已在清單」。細節見
[`pre-visit-brief.md`](./pre-visit-brief.md)「加入問題清單」一節。手動新增的路徑不變。

## 範本問題文案的邊界

`VISIT_QUESTION_PRESETS` 只放中性、事實性的起手式問題，三語提供。比照 `care_due_reminders` 的文案約束，**不得推論病因或建議治療**，只問「該問醫師什麼」，直接對應 issue #723 那個提問方式本身就有問題的情境。

## 尚未支援

- Demo 模式（`/demo`）目前顯示「尚未支援展示模式」，未提供種子資料。
- 沒有拖曳排序 UI；`sort_order` 欄位已保留，新增問題時取現有最大值 +1，之後要補拖曳排序不需要再開一次 migration。
