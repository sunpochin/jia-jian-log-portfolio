<!--
檔案用途：說明底部導覽「門診」tab（NextVisitPage，照護閉環 T5，issue #949；clinical-care-ops-ui-design.md phase E）
的區塊組成、資料來源、配對規則與刻意取捨。
所在層：docs/features；由 TECHNICAL.md 與 docs/AGENT_MAP.md 指向的功能文件。
主要關聯：src/features/visit/pages/NextVisitPage.tsx、src/features/visit/hooks/useNextVisitOverview.ts、
src/lib/visitOutcomes.ts、docs/product/care-loop-domain-model.md §5、docs/product/clinical-care-ops-ui-design.md §5／§6 W3。
-->

# 門診 tab（Next visit，phase E）

## 為什麼要做

五層 IA（今天／記錄／軌跡／門診／設定）的第五層「門診」回答「下次門診要帶什麼、問什麼、醫師說了什麼」。
S1–S3 早已合併，但門診頁需要的「看診中／看診後」資料（Concern／Appointment／Outcome）直到 #847 核准、T1／T2
落地後才在 schema 上存在。這一頁是照護閉環的顯示層終點：不新增資料表，只組合既有元件與 T1／T2 的欄位。

## 區塊與資料來源

| 區塊 | 內容 | 來源 | 讀不到時 |
| --- | --- | --- | --- |
| **下次** | 最接近的非藥量倒數 active 提醒（回診／抽血／打針／寵物疫苗等）＋距今天數＋科別（T2 `visit_department`）；「所有提醒」跳到照護 tab 的到期提醒 | `listCareDueReminders` → `nextClinicalReminder` | 三語「提醒無法讀取」；展示模式顯示「尚未支援展示模式」 |
| **Google 行程** | 原「行程」tab 的清單、7／14 天切換與重新整理原封不動搬進來（`UpcomingScheduleSection`） | `useUpcomingSchedule` | 只在 `canUseSchedule`（家庭擁有者）時掛載；其餘照護者不顯示這一段（ADR-001：行事曆不投影進時間線） |
| **帶去給醫師** | 既有 `BloodPressureReportPanel`：趨勢圖、統計、逐筆報告、近期醫療軌跡、就診前摘要（含 T3 來源標籤與 T4「加入問題清單」）、列印／複製 | `ModuleTrendSection`（期間偏好跨模組共用） | 沿用報告面板自己的錯誤與離線處理 |
| **問什麼** | `VisitQuestionsPage` 以 `embedded` 嵌入：範本、新增、已問／略過、填答案 | `patient_visit_questions` | 沿用該頁文案；寵物病人整段隱藏 |
| **醫師說了什麼** | 已填 `answer` 的問題，依 `answered_at` 與最近一筆 `health_visit` 時間相近性配對分組；來自就診前摘要的問題標出規則來源 | `listVisitQuestions` ＋ `care_timeline_entries(event_type='health_visit')` 最近 30 筆 → `pairAnsweredQuestionsWithVisits` | 三語「回答或看診紀錄無法讀取」；寵物病人隱藏 |
| **看診後** | `TrajectoryEntryForm`（預設事件類型 `doctor_instruction`），存檔後重新讀取本頁；「查看軌跡」跳到軌跡 tab | `useTrajectoryEntryEditor` | 沿用表單自己的錯誤處理 |

## 「醫師說了什麼」的配對規則（`src/lib/visitOutcomes.ts`）

- 只看有實際內容的 `answer`；`answered_at`（T1 的 trigger 維護，前端不可寫）是唯一的配對時間點，不借用
  `updated_at`／`asked_at`（規劃文件 Q3 的理由）。
- 只有「可能是這個回答出處」的看診才是候選：看診在畫面當下已經發生，而且不晚於 `answered_at` 超過
  `OUTCOME_VISIT_TIME_TOLERANCE_MINUTES`（2 小時）。這個容忍是因為看診時間常記成預約時間，醫師可能提早看完；
  刻意不放寬到整個照護日，否則早上寫的回答會在同一天晚上另一次門診過後被搬過去（#984 Codex P1）。
  時間線表單允許輸入未來日期（排定的回診），只比時間差會把「今天寫下的回答」掛到「明天那次」上，誤導成那次
  已經看過（PR #981 Codex P1，修正於 `isOutcomeSourceCandidate`）。
- 在候選中找 |answered_at − occurred_at| 最小、且在 14 天視窗內的看診；同距離取較早的看診。沒有候選、超過
  視窗或 `answered_at` 為 NULL（T1 之前寫的舊答案）進「未配對到看診紀錄」組，放最後——配不到也要顯示，不能
  把醫師的回答藏起來。
- 群組依看診時間降冪；群組內依 `answered_at` 降冪。這是**顯示層的時間相近性**，不是資料庫外鍵；一個問題
  仍可以橫跨兩次回診才被回答（`docs/features/visit-questions.md` 不綁定單次看診的既有設計）。

## 刻意取捨

- **不做排程實體**：「下次」只是提醒的到期日，沒有時分、診間或「已確認」狀態機（ADR-005 決策一）。
- **行程 tab 退役而不是並存**：底部導覽維持五個（Material 上限）；Google 行程仍是家庭擁有者限定，門診頁只是
  把它放在「下次」底下同頁顯示。
- **寵物病人**：「問什麼」「醫師說了什麼」隱藏（就診前摘要與提問文案是人類醫療情境），「下次」「帶去給醫師」
  「看診後」照常。
- **展示模式**：提醒與問題清單沒有種子資料也對 anon 撤銷了讀取，直接顯示「尚未支援展示模式」，不打注定失敗的
  請求；看診紀錄走本機展示時間線。

## 驗證方式

- `bun test tests/unit/visitOutcomes.test.ts tests/unit/nextVisitPageRender.test.ts tests/unit/tabNaming.test.ts tests/unit/navigationSemantics.test.ts tests/unit/i18n.test.ts`
- `bun run lint`、`npx tsc --noEmit`、`bun run build`
- Playwright `tests/calendarSchedule.spec.ts`（展示模式五個 tab、門診頁標題與寬度）
- staging 人工驗證：用測試病人建立一筆回診提醒（帶科別）、一筆看診紀錄與一筆已填答案的問題，確認「下次」卡、
  「醫師說了什麼」配對與切換病人後無殘留；寵物病人不顯示提問段。
