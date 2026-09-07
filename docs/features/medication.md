<!--
檔案用途：整理藥品目錄、病人藥單、服藥紀錄與管理後台的現行設計。
所在層：docs/features；供 medication feature、TFDA sync 與藥單 RLS 修改使用。
主要關聯：src/features/medication、src/lib/medications.ts、medicationCatalog.ts 與 data-model。
-->

# 服藥 / Medication

## 產品邊界

服藥頁是每日照護工作區，不把尚未確認的醫囑猜成固定時段。固定藥按 plan 逐顆勾選；PRN 不計入固定時段完成判斷。完成卡只在當下成功操作後顯示，重新載入或切換病人不重播舊提示。

### PRN 使用事件與每日狀態

PRN 顯示在固定藥之外的獨立區塊，不產生黃色「尚未服用」卡，也不影響固定藥進度或餐次完成。每次按「記錄使用」都建立一筆 `prn_medication_events`，保存實際使用時間、台北 04:00 `care_date`、實際量、原因／症狀、效果狀態、備註與記錄人；同日可有多筆，不使用 routine 的 `dose_number`。

畫面上的使用次數、最後時間與 `used` 狀態由 active events 計算。沒有事件只表示 `not_assessed`，不等於今天不需要；照護者必須明確標記 `not_needed` 才會顯示「今天未需要」。系統不推導再次使用時間、最大劑量或醫療建議，表單會提醒核對藥袋／醫囑。

每筆事件以 client 產生的 UUID 做冪等鍵，網路重試只回讀原事件。更正流程是輸入原因將原事件作廢，保留作廢時間、操作者與原因；若需要正確資料，再建立另一筆事件，不直接刪除或覆寫原始事實。Demo 沿用相同語意但只寫入 localStorage；PRN 事件不自動建立 `care_timeline_entries`，避免把每次使用淹沒交接時間線。

既有 `as_needed = true` 的 plan 安全搬遷時只由新 adapter 分區讀取，不把未知歷史使用回填成事件，也不改寫原有 schedule slot、routine intake history 或 plan id。migration 尚未進入預覽環境時，routine 讀取仍可工作；PRN 寫入前仍需先套用 `20260812020000_create_prn_medication_events.sql`。

## 照護日邊界

每日服藥的「今天」固定採 `Asia/Taipei` 04:00–隔日 04:00 的照護日。凌晨 00:00–03:59 的睡前藥仍保留 `taken_at` 真實時間，但會歸在前一個照護日；05:00 起床則已屬新照護日。這是照護工作區的分組規則，不是醫囑、提醒時間或醫療上的服藥建議。

`medication_intake_logs.care_date` 是每日卡片、查詢與跨裝置去重的 canonical 欄位；`taken_on` 保留既有日曆日相容性，`taken_at` 永遠是稽核用的實際時間。結構化藥單與舊版單顆藥各自以照護日建立唯一鍵，避免 02:00 重新繞過去重。資料庫 trigger 會依 `taken_at` 重算 `care_date`，避免舊版 PWA 或手動請求送入錯誤日期。歷史衝突在 migration 期間會停止並要求人工判斷，不靜默刪除或合併服藥紀錄。

## 服藥次數回顧

服藥模組內含「近期趨勢」，呈現最近每個照護日**實際完成的劑次數**，資料來自 `medication_intake_logs.care_date`。

刻意不呈現遵從率百分比。要算某一天的「應服次數」必須重建那一天當下的藥單版本，而 `medication_plans` 目前保存的是現況與變更紀錄，不足以可靠還原任意過去日期的完整藥單。硬算出來的百分比會看起來精確卻是錯的，在用藥情境下誤導比缺少更危險，因此只呈現可從紀錄直接驗證的事實次數。若日後要提供真正的遵從率，前提是先為 plan 建立可查詢的歷史快照。

這與「變更紀錄」分頁互補而非重複：變更紀錄回答「藥單被改過什麼」，次數回顧回答「這禮拜到底吃了幾次」。原本兩個問題只有前者答得出來。彙整規則在 `src/lib/trendSeries.ts`，回歸測試在 `tests/unit/trendSeries.test.ts`。

## 換看護交接手冊

`src/features/care-family/pages/CareHandbookPage.tsx` 是設定頁「產生交接手冊」按鈕開出的一頁可列印雙語文件（繁中／印尼文並列，不像一般畫面文字只依當前語言顯示其中一種），對應 issue #418（換看護交接包）。列印機制沿用血壓報告已有的 `window.print()` + `@media print` 做法（見 `src/index.css` 的 `.care-handbook-*` 規則），不是新的路由或後端匯出。

- **服藥時間**：資料齊全，直接呼叫 `readMedicationDay(patientId, careDateKey())` 帶入今日藥單，依 `medicationSchedule.ts` 的時段排序分組顯示，PRN 另列。
- **禁忌／過敏、慣用作息、緊急聯絡人**：v1 資料庫完全沒有對應欄位（見 issue #418 討論），刻意不新增 schema；改為列印當下由家屬手動輸入的 `<textarea>`，只存在元件的 local state，不寫回伺服器，換病人或關閉頁面就消失。列印時額外鏡射成純文字區塊顯示，因為瀏覽器列印 `<textarea>` 常只印出目前捲動到的內容，容易漏字。
- **病人隔離**：跟 `ArchivedPatientHistoryPage` 相同做法，`patientId` 由呼叫端明確傳入，元件內完全不呼叫 `setActiveSubject`／讀取全域目前操作對象，結構上排除混入其他病人資料的可能。

日後如果要讓禁忌／作息／聯絡人可持久保存、重複使用，需要另外設計 patient-scoped 的資料表與 RLS，屬於獨立範圍更大的任務，目前不在此頁的範圍內。

交接手冊的列印底部共用 `PrintSourceFooter`，固定帶出家健錄正式公開首頁、inline SVG QR，以及繁中／印尼文／英文的「家庭自記錄，非醫療診斷文件」文字。QR 不接受 `patientId` 或手冊內容作為輸入，只能導向公開首頁；因此換看護紙本即使離開原本登入裝置，也不會攜帶任何照護識別資訊。

## 資料契約

`medications` 是可重用目錄；`medication_plans` 是 patient 的安排；`medication_intake_logs` 是每日實際服用。plan 停用而非刪除，保留 intake history。唯一索引與 idempotent RPC 才是跨裝置防重複邊界，前端停用按鈕只是降低誤觸。

### 藥量倒數提醒

`care_due_reminders` 是獨立的 patient-scoped 排程資料，不把尚未確認的處方頻率猜成提醒日期。藥量提醒由照護者輸入領藥日與天數計算到期日；它只描述時間與數量，不提供診斷或調藥建議。提醒管理沿用 `care_access.can_manage_medication`，通知 delivery 另存 audit，避免重送或刪除歷史時失去可追溯性。

服藥頁的病人切換必須先通過 `care_access.patient_id`。媽媽帳號不能把家庭內寵物當成自己的 patient；若舊版留下 Momo 的 access，修復 migration 會撤銷它，資料庫 trigger 也會阻止未來再寫入。這避免媽媽在誤選後看到 Momo 的驅蟲藥並把錯誤按鍵變成服藥紀錄。

媽媽藥單不能以 caregiver 登入信箱作主鍵；portfolio-author 需要代為照護，而 caregiver 不應讀到 portfolio-author 個人藥。新查詢與 RLS 以 patient／plan 身分篩選，舊 RPC 可保留轉接以支援資料庫先於前端升級。

## 目錄與 TFDA

查證特定藥品的官方許可證、仿單或分類網址前，先查 `docs/references/drug-classification-sources.md`，找到就不用重新搜尋；查到新來源也直接補進那份文件。


官方候選資料寫入獨立 `drug_products`，保留許可證、中英文品名、成分、劑型、製造商與日期。搜尋可回傳可能相符，但不靜默修正錯字；藥品連結以官方許可證字號，不以藥名或成分模糊 join。外觀只在有確認來源時回填；多色與多外觀保留原文 note，不假裝成唯一顏色。

未驗證自訂藥允許保留照護價值，但 UI 必須清楚標示 `unverified`，不能拿照片、劑量或相互作用做推測。TFDA 同步只更新公共主檔；若既有補償 migration 仍未套用，照護畫面可能維持舊名稱／外觀，需依 AGENTS.md 的同步閘門處理。

`scripts/import-tfda-drug-products.ts` 除了藥證主檔（dataset 37）與外觀（dataset 42），也同步 TFDA「藥品藥理治療分類 ATC 碼」公開資料集（政府資料開放平臺 dataset #9119，export URL 沿用同一慣例的 dataset 41），寫入 `tfda_drug_atc_classifications`（複合主鍵 `tfda_license_number, atc_code`，因複方藥常對應多個碼；`is_primary` 欄位對照官方「主或次項」標示，只有主項才代表這顆藥的主要功能），再由 `refresh_official_medication_atc()` 回填 `medications.atc_code`（優先採用官方標示的主項分類，同為主項或都缺標示時才退回字母序最小值）。ATC 碼本身不直接顯示；`src/lib/medicationAtcCategories.ts` 用一份靜態雙語對照表（前綴匹配，如 `C09` 對應「降血壓藥（ACE抑制劑／ARB）」）把它轉成照護者看得懂的「主要功能」標籤。這個標籤現在顯示在 `MedicationNameHeading` 的藥名正下方（跟藥名同字級、桃紅色粗體，取代舊版藏在色塊旁邊的小字藍底徽章，方便長輩一眼看到），每日服藥打卡卡片裡的 `MedicationAppearance` 因此改用 `showCategory={false}` 隱藏原位置避免重複；排藥／PRN 頓服等沒有搭配 `MedicationNameHeading` 的畫面則仍由 `MedicationAppearance` 就地顯示。改分類措辭只需改對照表，不必跑 migration；沒有官方 ATC 資料或對照表沒收錄的分類一律不顯示，不用猜測的標籤誤導照護判斷。

這個回填函式刻意**不**比照 `refresh_official_medication_appearances()` 額外要求 `verification_status = 'official'`：實測發現 `apply_medication_plan_change`（見 `20260821030000_guard_shared_medication_catalog_writes.sql`）不論藥品是否從官方目錄搜尋加入，一律把 `verification_status` 寫成 `'unverified'`；`'official'` 這個狀態目前只有極少數幾筆最早期手動處理過的藥品才有。ATC 分類是純附加資訊、不會覆蓋任何使用者可能自己修正過的欄位（跟外觀顏色／形狀不同），因此不需要額外要求驗證狀態。

**`20260828020047_backfill_generic_medication_atc_codes.sql` 是第二條、人工維護的回填路徑**，跟上面 `refresh_official_medication_atc()` 走的 TFDA 同步表是兩回事：涵蓋的是只知道學名成分、從未連結過任何 TFDA 商品（`diphenidol-25`／`famotidine-20`／`mirtazapine-30` 這類「學名／商品未確認」項目，見 `20260711030000_add_mother_medication_plans.sql`），或已連結官方藥證但該許可證在 `tfda_drug_atc_classifications` 裡剛好沒有 ATC 資料的藥品。這些藥的 WHO ATC 碼是照該成分（不是特定包裝／外觀）的公認藥理分類手動查證後直接寫死在 migration 裡，只在 `atc_code IS NULL` 時才寫入，不會覆蓋已由官方同步算出的結果。之所以能安全略過驗證狀態，是因為 ATC 標籤描述的是「這個成分是什麼藥效」，跟需要核對外觀照片才能顯示的「這顆藥長什麼樣子」是不同等級的風險；但這代表 `medications.atc_code` 目前有兩個彼此獨立的資料來源，之後若要重新同步或除錯分類不準，要記得檢查是不是命中了這條手動路徑。

**連結官方藥證用的是 `catalog_source`／`catalog_source_id`，不是 `drug_product_id`**：`20260827050000_relax_atc_refresh_to_drug_product_link.sql` 第一版誤以為一般藥品會有 `drug_product_id` 這個外鍵，把回填條件改成只要求它連結；但實測正式環境重新同步後回填數量完全沒變（仍是 12 筆）才發現 `apply_medication_plan_change` 從來不會寫入 `drug_product_id`——這個欄位只有 `link_mother_medications_to_tfda.sql`／`link_bokey_official_product.sql` 這類早期一次性手動遷移才會設定。使用者從官方目錄搜尋加入藥品時，實際寫入的是 `catalog_source = 'tfda'` 與 `catalog_source_id`（TFDA 授權字號，見 `src/lib/medicationCatalogRegistry.ts` 的 `TfdaCatalogProvider.sourceId`）。`20260827060000_fix_atc_refresh_to_use_catalog_source_link.sql` 改成同時比對三種可能連結來源（`drug_product_id` 相容舊資料、舊版 `tfda_license_number` 欄位、`catalog_source = 'tfda'` 時的 `catalog_source_id`），一般搜尋加入的藥品才真正吃得到分類。

實際欄位名稱已在 2026-08-27 第一次真正對外部執行同步時，由 GitHub Actions log 的 `[tfda atc sample fields]` 確認為：`許可證字號`／`代碼`／`中文分類名稱`／`英文分類名稱`／`主或次項`（`toAtcClassifications()` 仍保留候選欄位清單當保險，TFDA 之後若調整命名，命中失敗只會讓那次同步跳過 ATC 分類，不會讓整個匯入失敗）。

## 後台安全與 UX

`/admin` 是隱藏入口但不是安全邊界；資料庫才限制管理者。管理他人藥單時要求額外確認；搜尋候選被選取後隱藏自訂藥表單，避免官方藥與未驗證藥被誤當成同一流程。新增成功後收合表單、清空選取，避免手機連點重複建立。

### 劑型與單位

劑型 (`medications.dosage_form`) 決定照護者在畫面上讀到的單位，目前有 `tablet`／`capsule`／`liquid`／`powder` 四種，資料庫沒有 enum 限制，新增劑型不需要 migration。

`powder` 是沖泡粉包（例如鈣加 D 檸檬酸鈣），單位是「包 / sachet」而不是「錠」。單位散落在四個地方，加新劑型時必須一起補齊，否則同一顆藥會在不同畫面顯示不同單位：`formatDoseAmount()`（英文）、`formatDoseAmountLocalized()`（中文／印尼文）、`prnDoseUnitForDosageForm()`（PRN 使用紀錄的 `dose_unit`）與 `PrnMedicationSection` 的 `doseUnitLabel()`。劑量欄位標題也跟著 `doseAmountFieldLabel()` 改成「每次幾包」——「每次幾顆」對一包粉是錯誤指示。

外觀示意圖同樣不能退回圓錠：`powder` 沒登錄形狀時使用粉包示意圖，形狀選單也提供「粉包」，避免畫面暗示照護者手上是一顆藥。`parseDosageFormFromText()` 會把官方劑型的「散劑／顆粒／粉劑／乾粉」與 powder／granule／sachet 判成 `powder`；判斷順序要放在錠劑預設之前，否則「顆粒劑」會因為有「顆」字被當成錠劑。

`formatDoseAmountLocalized()` 內部的劑型單位對照表已抽成獨立匯出的 `dosageFormUnitLabel(dosageForm, locale)`；下面「時段顆數摘要」需要同一份單位對照，直接呼叫這個函式，不再各自維護一份複本。加新劑型時仍是同一份對照表，不會因為多了呼叫端而變成要改兩處。

### 時段顆數摘要：次數（dose_count）≠ 顆數（dose_amount），劑型也不能混算

「服藥打卡」「每週藥單」「排藥」三個畫面的時段標題都會顯示一個顆數摘要，讓照護者不用逐項心算就知道這餐要準備幾種藥、共幾顆／幾包／幾份。這個數字牽涉兩層換算，兩層都不能簡化：

1. **次數（`dose_count`）不等於顆數（`dose_amount`）**：`dose_count` 是同一筆醫囑要在這個時段核對幾次（服藥打卡會拆成對應張數的卡片），`dose_amount` 是每次核對要吞的份量（例如鉀離子藥常見 `dose_amount = 2、dose_count = 1`，一次核對、吞兩顆）。「服藥打卡」畫面同時顯示「N 次已服用」與「M 顆已服用」兩個獨立分數，只顯示次數會讓照護者誤以為顆數也對得上。實際顆數＝該時段所有固定用藥（排除 PRN）的 `dose_amount × dose_count` 加總。
2. **不同劑型不能直接加總**：藥錠／膠囊論「顆」，粉劑論「包」，液劑論「份」，同一時段常見同時有藥錠與粉包（例如鈣加 D 是沖泡粉包）。把 2 顆藥錠＋1 包粉直接加總說成「3 顆」會誤導照護者核對藥盒時對不上實際包裝數量，因此顆數摘要一律先按 `medications.dosage_form` 分組加總，每組各自套用正確單位，多種劑型時用「＋」接起來（例如「2 錠＋1 包」），不會硬併成一個數字。

實作集中在 `src/lib/medicationSchedule.ts` 兩個函式，供上述三個畫面共用同一套換算，不各自寫一份：

- `medicationSlotQuantityText(plans)`：純總量（沒有「已服用」概念），排藥／每週藥單的時段徽章與「每日總計」都呼叫這個。
- `medicationSlotQuantityProgressText(takenDoses, allDoses)`：「已服用／應服用」分數版本，服藥打卡的時段標題呼叫這個；輸入是已展開成一次一份的 dose 陣列（`{ dose_amount, dosage_form }`），不是原始的 plan 陣列。

兩者都回傳 `LocalizedText`（`{ id, zh }`），呼叫端組字串時要分別取 `.id`／`.zh` 接進外層雙語模板，不能對已經解析好語言的 `LocalizedText` 再包一層 `text()`，否則會把目前介面語言的文字誤植入另一個語言的模板。

`AdminMedicationPlan`（排藥）本身沒有 `dosage_form` 欄位，要透過 `medicationById` 查藥品資料才能組出 `{ dose_amount, dose_count, dosage_form }`（見 `hooks/useMedicationAdminForm.ts` 的 `withDosageForm()`）；`MedicationPlanView`（服藥打卡／每週藥單）已經內嵌 `medication.dosage_form`，直接取用即可（見 `MedicationPage.tsx` 的 `medicationQuantityInputs()`）。

`MedicationAdminSection.tsx` 本身只是容器：狀態與讀寫邏輯在 `hooks/useMedicationAdminForm.ts`（一個 hook 回傳所有狀態與操作），表單 UI 拆成 `ExistingPlanForm.tsx`（加入既有藥品／調整醫囑）與 `NewMedicationForm.tsx`（新增未驗證自訂藥品），兩者共用的展示元件（藥品卡片、劑型／時段欄位、照片上傳）在 `MedicationAdminFormFields.tsx`。這個拆分不改變任何寫入行為或畫面文案，純粹是原本 747 行單一元件（37 個 useState）的可讀性重構。

### 調整既有醫囑的可見回饋

藥卡上的「調整」是修改「這一筆醫囑」的時段與劑量，不是換藥。按下後必須有照護者看得見的回饋：表單自動捲到眼前、該張藥卡的按鈕顯示為「調整中」、表單頂端寫出正在調整哪顆藥與目前醫囑，送出鍵改為「儲存調整」，並提供「取消調整」。只把畫面外的表單展開而不捲動，在手機上與「按了沒反應」無法區分，照護者會改用「加入」流程覆蓋原本的醫囑。

調整模式不顯示藥箱與搜尋清單：要換成另一顆藥應該回列表移除後重新加入，才會在稽核紀錄留下停用與新增兩筆事實，而不是把一筆醫囑的藥品欄悄悄換掉。編輯目標 (`editingPlanId`) 必須在收合表單、取消或改選其他藥品時一併清除；殘留的編輯目標會讓下一次送出被當成更新前一筆醫囑。時段、劑量與 PRN 勾選同樣要在換藥時歸零，避免前一顆藥的醫囑被當成系統預填的建議值。

舊資料與 PRN 可能存著 `anytime`、`morning`、`after_meal` 等已不在選單的時段。編輯表單要為這類值補上一個「（原本時段）」選項；缺少它時瀏覽器會顯示第一個選項（早餐前），但送出的仍是舊時段，畫面與實際寫入不一致。

### 修正既有藥品的劑型／外觀登錄錯誤

`medications` 是跨病人共用的目錄（`id` 由品名/學名/劑量/劑型算出，不含 `patient_id`），不是每個病人各自一份。調整既有醫囑時若展開「這顆藥的劑型或顏色登錄錯了嗎？點這裡修正」，送出的 `dosageForm`／`appearanceColor`／`appearanceShape`／`appearancePhotoUrl` 會透過 `apply_medication_plan_change` 的既有機制（帶入 `p_brand_name` 即觸發 `medications` upsert）覆寫這一整筆目錄資料，套用到所有使用這顆藥的病人與所有時段，而不只是眼前這一筆醫囑；確認視窗必須明講這一點。

授權仍以 `care_access.can_manage_medication` 針對呼叫當下的 `p_patient_id` 驗證，但目錄本身不分病人。為了不讓只被授權管理病人 A 的照護者，透過同一個 `medication_id` 悄悄改掉病人 B 看到的資料，RPC 只在「調整既有醫囑」這條路徑（`action = update` 且目錄裡已有這筆舊資料）檢查是否有其他病人的現役醫囑正在使用同一個 `medication_id`；若有，直接擋下並回傳錯誤，要求照護者改成新增一筆獨立藥品，而不是靜默覆蓋或部分套用。新增藥品／從官方目錄建立（`action = create`）維持原本的 idempotent 行為不變，避免把「幫另一位病人加入同一顆已存在藥品」這個既有正常流程也一併擋下。前端會把這個特定錯誤訊息換成雙語提示，不會誤報成一般的網路錯誤。

稽核快照必須反映「真正被取代的舊資料」：RPC 在覆寫 `medications` 之前就先把舊列存進區域變數，`medication_plan_change_logs.before_snapshot` 一律用這份存好的舊值組成，不會重新查表讀到已經被本次 upsert 蓋掉的新值（修正前的舊版本會把「調整前」誤記成「調整後」的劑型，稽核紀錄無法追回真正被取代的值）。

照片網址沿用「新增未驗證自訂藥品」表單的規則，只收 `https://` 開頭，避免修正把 `http://` 或打錯字的網址存進共用目錄。

外觀照片改用手機「拍照／從相簿選取」上傳（`src/lib/medicationAppearancePhotos.ts`），不再要求照護者自備圖床貼網址；元件與壓縮流程比照照護大事記照片（見 `docs/features/care-timeline.md`），共用邏輯抽在 `src/lib/imageCompression.ts`／`src/lib/randomId.ts`。但 Storage 設計刻意與照護大事記不同：`medications` 本身跨病人共用，不像照護大事記綁定單一 `patient_id`，因此照片存進 **public** 的 `medication-appearance-photos` bucket、上傳後直接取得 public URL 存回 `appearance_photo_url`，不走 private bucket 與 signed URL；寫入 RLS 只檢查 `care_access.can_manage_medication`（任一病人皆可，不比對特定 `patient_id`），因為目錄本身沒有病人邊界可比對，真正的「哪個病人能改哪顆藥」授權仍由 `apply_medication_plan_change` RPC 把關。

### 加入一顆藥單已經有的藥

`apply_medication_plan_change` 對 `(patient, medication, schedule_slot)` 是 idempotent 的：以 `create` 送出既有組合會直接改寫那筆醫囑並記成 `update`。所以 UI 不能讓「加入」看起來只是多加一顆藥。

- 選到藥單上已有的藥時，先列出這顆藥現有的每一筆醫囑，並提供「改成調整這一筆」直接切到編輯模式。
- 時段選單標出已被同一顆藥佔用的時段（已有醫囑）；選其他時段＝合法的第二次服用（例如早晚各一次），選同一個時段＝覆蓋。
- 覆蓋時送出鍵改為「覆蓋原本的醫囑」，確認視窗同時列出新醫囑與原本醫囑，並帶上被覆蓋那筆的 `plan_id` 走明確的 `update`，而不是依賴資料庫的三元鍵行為。
- 編輯時若把醫囑改到已被同一顆藥佔用的時段，前端直接擋下並要求改為調整那一筆或先移除；資料庫的 `update` 分支不會去重，放行會留下兩筆重複醫囑。

每個可見狀態同時使用文字、圖示與顏色；未服用與已服用卡片不能只靠色差。服藥頁、管理頁、錯誤與確認都必須符合目前語系與雙語規範。

### 藥卡顯示偏好

每日服藥頁預設直接展開每個用餐時段的藥卡，讓照護者不用先點開餐次才能核對或記錄。設定頁可切換為精簡收合模式；精簡模式只展開排序後最早的時段，展開模式則保持所有時段展開。兩種模式都允許手動收合單一餐次。

登入帳號的閱讀密度偏好寫入 `user_settings`，以 `auth.uid()` 作為唯一帳號鍵並由 RLS 限制只能讀寫自己的設定，因此在手機、平板與桌機登入同一帳號時會同步。找不到設定列時預設展開；若資料庫尚未完成 migration 或暫時讀取失敗，畫面仍安全地回到展開模式並提示使用者。`/demo` 沒有登入身分，才使用 localStorage 作為展示模式的本機備援，不會把展示資料送進 Supabase。

`/demo` 的展示對象清單第一位永遠是「李阿姨」（`DEMO_LEE_PATIENT_ID`，見 `src/lib/demoData.ts`／`src/lib/auth.ts`），藥單對照真實案例的七項服藥（Bokey、BRILINTA、Exforge、Lipitor、Nebilet、Calcium plus + Vitamin D biomedicine、Diphenidol），分在「早餐後」「晚餐前」兩個時段。她不依賴任何登入帳號或真實 Supabase 資料，因此可以在 staging 隨時重現四個服藥分頁與藥名顯示規則（英文優先、紅色醒目）供驗證，且不會因為真實照護資料異動而消失。展示對象預設仍是王美玲（`ownPatientId`），她的血壓／體溫故事線維持不變；李阿姨只保證服藥資料存在。

登入真帳號（不經過 `/demo`）驗證時，同一個「李阿姨」也存在於 `scripts/seed-staging.ts` 種下的真實 Staging Supabase 資料（原本命名為「王阿姨」，改名對應 `/demo` 的展示對象），她的 `patient_id` 是固定的 `33333333-3333-4333-a333-333333333333`，`admin@careapp.local`／`demo.caregiver@example.test`／`demo.mother@example.test` 三個核心照護帳號都已透過 `care_access` 授權可存取，並加入 Bokey／BRILINTA／Exforge 三筆藥單（`plan-bokey-wa`／`plan-brilinta-wa`／`plan-exforge-wa`）。這是兩套完全獨立的資料來源：`/demo` 只讀本機 fallback 資料，`seed-staging.ts` 則要由具備 `STAGING_SUPABASE_SERVICE_ROLE_KEY` 的人手動執行 `bun run seed:staging` 才會寫入 Staging 資料庫（見 `scripts/verify-staging-data.ts` 驗證腳本），改完本檔仍要重新執行種子腳本才會反映到畫面上。

取消已記錄的服藥資料必須先顯示 App 內的確認視窗，清楚列出藥品與原本的記錄時間，並提供語意明確的「返回」與「取消紀錄」按鈕。確認取消後，原藥卡要等同步結束並重新可操作才恢復鍵盤焦點，避免焦點落在停用控制項。完成提示只能說明「已記錄為服用」，不能聲稱系統已確認病人實際吞服；這會保留照護紀錄的可稽核語意。

服藥工作區與輸入血壓工作區共用病人、頁首與底部導覽，但各自保持領域狀態；藥單管理與變更藥物避免在一張輸入表單中塞入醫囑編輯，改走獨立畫面。服藥頁固定顯示「服藥打卡」「每週藥單」「排藥」「變更藥物」四個頁籤（`MedicationViewTabs`），取代原本只把後三者降級成今日畫面角落文字連結的設計；四個頁籤共用同一套 `role="tablist"` 鍵盤左右鍵切換與 `aria-controls` 對應面板，跟每日照護的 `DailyCareSectionTabs` 是同一套規範。藥品外觀辨識卡只顯示已確認的資料，保健品可保存包裝劑量（例如 IU／µg）而不強轉成 mg。

四個頁籤中的藥名一律用 `MedicationNameHeading`／`MedicationSnapshotNameHeading`（`src/features/medication/components/MedicationNameHeading.tsx`）呈現：紅色粗體主要名稱＋灰階次要名稱，避免各分頁各自重寫顏色與排序判斷。主要／次要名稱何者是英文商品名、何者是本地化品名由「藥名優先顯示英文商品名」帳號偏好決定（`src/lib/medicationDisplayPreference.ts` 的 `medication_name_english_first`，預設英文優先），跟「每餐是否展開」使用同一張 `user_settings` 表但各自獨立讀寫，登入帳號寫 Supabase、`/demo` 寫 localStorage。預設英文優先是因為外籍看護與家屬核藥時最先認得包裝上的英文商品名。

「每週藥單」是唯讀畫面，直接沿用目前固定套用的 `medication_plans`（服藥模組尚未有「星期幾」層級的排程，因此本週＝現行藥單），任何有讀取權限的人（包含被照顧者自己）都能看到，不受排藥權限限制，也不提供任何寫入操作。「排藥」（原「調整藥單」）與「變更藥物」（原「變更紀錄」）則只開放給 `care_access.can_manage_medication` 為真的照護者，沒有管理權的視角只會看到「服藥打卡」與「每週藥單」兩個頁籤（`MedicationViewTabs` 的 `canManage` 參數）。這個判斷完全走 `care_access` 資料表、不寫死任何 email——服務裡不會只有一組照顧者／被照顧者，之後每多一位被照顧者都要能沿用同一套機制，不能每加一位就多改一次程式碼：

本週藥單的每個餐次保留一張外層卡片，卡片內以獨立 `<li>` 列出每筆 `medication_plan`，用留白與細分隔線切開長品名，並將顯示名稱與劑量資訊分成主次層級。這樣保留餐次群組的掃讀順序，又避免每項唯讀藥品各自套一張陰影卡片，造成手機畫面邊界過多。每一列現在是可點擊的 `button`（右側加 `›` 箭頭提示可互動），點下去開啟 `MedicationDetailDialog`（`src/features/medication/components/MedicationDetailDialog.tsx`）詳情視窗，PRN 清單比照辦理；藥單本身仍是唯讀，這個互動只用來查看，不提供任何寫入操作。

### 藥品詳情視窗（用途／副作用／衛教）

詳情視窗只呈現系統已確認的資料：外觀（沿用 `MedicationAppearance`）、劑量與時段、學名成分、資料驗證狀態（`verification_status`）與 `tfda_license_number`。刻意不顯示「用途」「副作用」「相關衛教」這類出院衛教單常見的欄位，因為 TFDA 目前同步的三個公開資料集（藥證主檔 dataset 37、外觀 dataset 42、ATC 分類 dataset 41）都不包含這類完整衛教文字；`medications.indications` 欄位目前只有農業部動物用藥同步（`scripts/import-moa-animal-drugs.ts`）會寫入，人用藥從未有值。用 AI 生成或網路爬來的內容假裝成這些欄位，等於把沒藥師核對過的用藥資訊當成事實顯示給照護者，風險比「暫時沒有」更高，因此視窗改為明講目前沒有這項資料，並附上 TFDA 許可證查詢系統入口（`https://info.fda.gov.tw/MLMS/H0001.aspx`）與許可證字號，讓照護者自己核對官方仿單；這個查詢系統是通用搜尋頁，不支援用字號直接深連結到單一藥品頁，因此只印出字號給人工貼上查詢，不假裝成已經連好的仿單連結。

視窗下方同時附一顆「用 Google 搜尋『英文商品名 仿單』」連結（`buildDrugSearchUrl()`），只帶 `q` 查詢字串，不照抄使用者瀏覽器產生的搜尋網址——那種網址常帶 `rlz`／`oq`／`gs_lcrp` 這類個人帳號與 session 追蹤參數，寫進程式碼等於把別人的個資到處散布。用英文商品名（`brand_name`）而非中文譯名，是因為包裝上照護者最先認得出的字就是英文商品名，搜尋準確度也比中文譯名高。這條連結刻意跟 TFDA 官方連結分開標示，因為 Google 搜尋結果不受我們控制（可能出現藥局業配文或非官方網站），只當作「還有其他管道可以查」的備援，不是官方資料來源。

日後如果要讓用途／副作用／衛教變成系統真正顯示的資料，需要另外幫 `medications`（跨病人共用目錄）加可信欄位並設計人工輸入／審核流程（例如比照外觀照片先由照護者上傳出院衛教單再由人核對），屬於需要另外走 Supabase migration 核准流程與可能修改 `apply_medication_plan_change` 的獨立任務，目前不在此次範圍內。

- 帳號自己的 patient 若沒有任何 `care_access` 列，預設 `canManageMedication = true`（見 `src/lib/auth.ts` 的 `profileForEmail`）——這是給一般自行管理健康資料的使用者的合理預設。
- 被照顧者透過「被照顧者邀請」流程（`create_household_patient_invitation` → `accept_patient_care_invitation`，見 `20260814040000_add_patient_care_invitations.sql`）加入時，接受邀請當下就會明確寫入 `can_record = true、can_manage_medication = false` 的 `care_access` 列，蓋掉上面的預設值，讓她能查看服藥打卡／每週藥單與服藥進度，但看不到「排藥」「變更藥物」。
- 照護者也可以在「家庭成員與照護授權」（`HouseholdMemberManagement` → `set_household_patient_access` RPC）畫面，針對任何成員、任何 patient（含成員自己的 patient）逐一勾選「可調整藥單」，隨時開放或收回，同樣不需要改動任何程式碼。
- 若被照顧者的帳號是在邀請流程上線前就建立、還沒有這筆明確 `care_access` 列，則走一次性資料修正（例如 `20260820102714_backfill_care_recipient_medication_access.sql`）補上，而不是在應用程式邏輯裡加 email 判斷。

切換病人或日期時，藥單卡片的收合預設必須等新對象的 plans 真正載入後才初始化；舊 plans 只能暫留作畫面過渡，不能決定新對象第一個待辦時段。複方藥與保健品的管理、確認與日常畫面都優先沿用已核對的 `strength_label`，避免把複方成分相加成錯誤的單一 mg 數字。

藥單變更與停用要留下交接可讀的歷史；固定藥時段完成後提示「該時段已完成」，但 PRN 不算缺漏。這些提示不能因切換 patient、跨日或非同步回應順序錯亂而顯示到另一位病人身上。

### 調藥稽核與時間線投影

調整藥單只能透過 `apply_medication_plan_change`。資料庫在同一 transaction 產生唯一一筆 `medication_plan_change_logs`，action 明確為 `create`、`update` 或 `deactivate`，並保存 before／after snapshot、操作人、記錄時間與生效時間。`reason` 是補充說明，不再被用來猜 action。

每筆 change log 同 transaction 投影一筆 system-generated `care_timeline_entries`，由 FK `medication_plan_change_log_id` 與 partial unique index 強制一對一；timeline 也帶快照 projection，因此 plan 停用或藥品目錄改名後，歷史仍能顯示當時藥名與劑量。此 system event 不消耗每日兩筆手動照護筆記配額，也不能由一般 UI/RLS 修改或刪除；修正應再做一次補償性 plan mutation。

既有舊 log 的 `upsert` 會在 migration 中依同一 plan 的時間順序保守轉成 `create`／`update`，並標記部分快照；不重建時間線、不刪除歷史，避免把未知的舊事件偽造得比實際更精確。新 UI 的時間線表單不再提供 `medication_change` 或任意藥單關聯；尚未套用的醫師指示請使用 `doctor_instruction`，真正調藥請到藥單管理。

## 藥袋照片 OCR（issue #423 決策落地，MVP）

拍藥袋只是幫忙猜品名，不是另一條寫入路徑：`MedicationPhotoOcrSection` 呼叫 `supabase/functions/medication-ocr`
把壓縮後的照片位元組（沿用 `careEventPhotos.ts` 的 `prepareSingleCompressedImage`，不經 Storage、只存在單次
請求的記憶體中）送給 Google Cloud Vision Text Detection；辨識結果回來後比對病人 `patients.display_name`，
捨棄含姓名的文字行，剩下的文字才拿去跑候選斷詞與 `search_drug_products`／`search_nhi_tcm_products`／
`search_moa_animal_drugs` 目錄比對。照護者點選候選卡片後，只是把猜到的品名字串塞進 `MedicationAdminSection`
既有的搜尋欄位（`externalCatalogQuery` prop），接下來仍走原本「搜尋 → 確認藥品 → 選時段劑量 → 送出」的
完整人工流程與 `apply_medication_plan_change` RPC——沒有新增任何繞過人工確認的儲存路徑。

`medication_ocr_call_logs` 只記錄「誰、哪個病人、何時、成功或失敗」，靠 `enforce_daily_medication_ocr_limit`
trigger（比照血壓/大事記的 `account_usage_limits` + `pg_advisory_xact_lock` 慣例）擋每日呼叫上限，即使辨識
失敗也算一次，避免無限重試推高 Vision 帳單。沒有設定 `GOOGLE_CLOUD_VISION_API_KEY` 時 Edge Function 會回傳
「尚未開通、請改用手動輸入」，前端優雅退回既有手動流程，不會整個功能掛掉。

去識別化措辭經過一次修正：一開始的決策記錄寫「送出前遮蔽姓名」，但這在技術上有雞生蛋問題（要遮蔽姓名必須先
定位文字，定位文字通常得先做一次辨識，若那次也送 Google 就等於還是送出過未遮蔽原圖）；改為「整張照片送出、
辨識後由我方伺服器事後過濾捨棄」，`/privacy` 與 `/health-data-notice` 的文案與 `docs/product/growth-roadmap.md`
P0-1 決策記錄都已同步更新為這個措辭，同意版本也一併升版到 2026-08-26（見 `src/lib/legalConsent.ts` 的
`CURRENT_HEALTH_CONSENT_VERSION`）。

## 不採用的替代

- 不以 localStorage 作服藥真相，因為 iPhone 與 Mac 會分裂。
- 不複製媽媽藥單給照顧者，因為兩份 plan 與 log 會失去同步。
- 不把舊處方每日一次猜成早餐或睡前；缺少提醒比錯誤醫囑安全。
- 不刪除 plan／medication 來整理畫面，避免破壞歷史外鍵。
- 不把登入帳號的閱讀偏好只放在 localStorage，因為 iPhone、Android 與桌機會各自記住不同狀態；偏好放在獨立的 `user_settings`，並以 `auth.uid()` RLS 隔離，不碰 patient 的健康資料授權。
- 不讓 `/demo` 為了模擬跨裝置設定建立匿名資料列；展示模式只留在目前瀏覽器，避免把虛構資料混進正式帳號資料。
- 不使用瀏覽器原生 `confirm()` 取消服藥紀錄，因為按鈕名稱會隨瀏覽器而變成模糊的 OK／Cancel，也無法呈現正在修改的藥品與記錄時間。
