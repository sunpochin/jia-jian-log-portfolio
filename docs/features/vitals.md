<!--
檔案用途：整理血壓／心跳／體重輸入、警示、Dashboard 與報告規格。
所在層：docs/features；供 vitals UI、統計、匯出與照護流程修改使用。
主要關聯：src/features/vitals、src/lib/dashboardStats.ts、vitalPresentation.ts 與 data-model。
-->

# 生命徵象 / Vitals

## 量測流程

輸入頁以手機優先，先確認第一筆資料已寫入遠端或已明確暫存本機，再開始 60 秒休息倒數；畫面會把「已寫入資料庫」與「等待同步」分開標示，不能把離線暫存冒充成遠端成功。第二筆完成後顯示當下時段摘要；若仍有 pending，不顯示不完整的遠端摘要。時段依台北時間分成 pagi、siang、malam1、malam2、malam3，夜間 bucket 是觀察點，不是強迫使用者每天必須量三次的排程。

血壓 INSERT 遇到連線中斷、408／429 或暫時性 5xx 時，會把同一筆含 `patient_id`、normalized `recorded_by` 與 client UUID 的資料放進 `localStorage` pending queue；storage key 本身也依病人與帳號分區。恢復連線、重新載入輸入頁或按「現在同步」時逐筆送出，固定 UUID 讓回應遺失後的重試不會多出第二筆。RLS、每日上限與格式錯誤不進 queue，因為重試不能修好授權或資料問題；Telegram 通知仍是獨立副作用，不會因資料 queue 盲目重送而製造重複提醒。

第一筆成功後，App 外殼會以目前 `patient_id`、照護日與量測時段保存這一輪量測的截止時間，並在主要頁面上方顯示大字倒數。倒數不放在血壓輸入卡內，讓照護者等待時可以切到照護大事記、健康資料或其他每日照護分頁；第二筆成功或切換病人後才清除這個暫時狀態。狀態只存在 `sessionStorage`，因為它是本次裝置操作的流程提示，不是新的健康紀錄，也不應跨裝置同步；重新載入若已跨過照護日／時段，就會捨棄舊流程，避免第一筆新量測被誤當第二筆。

722 原則是建議參考：連續 7 天、早晚各 2 次、每次 2 遍且間隔 1 分鐘；實際夜間量測依媽媽狀況與醫囑，不把建議寫成硬性警報。

## 照護日與真實時間

每日照護摘要、最近量測摘要、輸入頁的同一輪量測 key 與血壓每日新增配額，使用台北時間 04:00–隔日 04:00 的照護日。這能讓凌晨 02:00–03:59 的睡前後續量測和前一晚留在同一份交接資料，也讓 05:00 起床量測自然開始新的一天。

每筆資料仍以 `measured_at` 保存實際發生時間；醫師／GPT 報告明示照護日區間並保留逐筆原始時間。照護大事記與體重目前維持各自的日曆日語意，不可把照護日當成全系統任意改寫的日期。

## 警示

目前顯示規則以家庭量測的高壓／低壓與心跳界線為基礎：

| 狀態 | 規則 |
| --- | --- |
| danger | 收縮壓 ≥ 160 或舒張壓 ≥ 100 |
| warning | 收縮壓 ≥ 130、舒張壓 ≥ 80 或心跳 > 120 |
| danger-low | 收縮壓 < 90 或舒張壓 < 50 |
| warning-low | 收縮壓 90–99 或舒張壓 50–54 |
| normal | 其他情況，含刻意降噪的舒張壓 55–59 |

高壓端先判定，再判低壓端；banner 以成功送出的 snapshot 為準，不讀 reset 後的輸入框。警示不得只靠顏色，必須同時有文字或 badge。

`VitalAlertBadge`（`src/features/vitals/components/VitalAlertBadge.tsx`）包裝 `evaluateReading`，統一輸出這個 badge；`DashboardStatsCards`「最新」列與 `DailyBloodPressureRecords`（本照護日新增的量測紀錄）逐筆量測共用同一份判定與樣式，避免兩處各自維護一份規則，導致總覽顯示偏高、當日清單卻看不出風險等級。

## 視覺識別

收縮壓使用 `#C23B3B`（dark `#F87171`），舒張壓使用 `#2563EB`（dark `#60A5FA`），心跳使用 `#7C3AED`（dark `#C084FC`）。圖表以高壓實線圓點、低壓實線菱形、心跳虛線方點區分；不要再加佔手機寬度的小圓點。

## Telegram 通知可靠性

血壓寫入 Supabase 成功後，`src/lib/telegramNotification.ts` 只把 `recordId` 與 `patientId` 交給帶目前登入 session 的 `blood-pressure-notifier` Edge Function。Function 以 caller-scoped Supabase client 對 `blood_pressure_records` 做精確的 `id + patient_id` 查詢，再由 RLS 與 JWT email 驗證目前使用者；血壓數值、病人名稱與提交者不接受瀏覽器自訂。通知失敗不回滾已保存的血壓，Function 對 Telegram 429／5xx 重試一次，網路錯誤不重送，避免回應遺失時產生重複提醒。

Telegram 標題使用 Function 從授權紀錄重新讀到的病人顯示名稱，例如「媽媽血壓量測通知」或「portfolio-author 血壓量測通知」；提交者由 JWT email 產生並移到第二行，讓收件者先辨認是哪一位被照顧者，再看到誰代為提交。前端已完全不依賴 `VITE_WORKER_URL`／`VITE_WORKER_API_KEY`；舊版 Cloudflare Worker `/notify` 已於 2026-09-07 停用並自 repo 移除，不再是任何 build 的相容路徑。

這個順序是刻意的：照護紀錄是單一真相，Telegram 是提醒副本；不能為了通知重試而重複寫入血壓，也不能把通知錯誤靜默成成功。部署修正後仍需在 staging 部署 `blood-pressure-notifier`、設定該環境的 `TELEGRAM_BOT_TOKEN`／`TELEGRAM_CHAT_ID`，並用兩個核心照護帳號驗證各自可寫入的病人紀錄通知；不執行 production 直接部署。

## 記錄與回顧的分工

每個照護模組都自己內含「今天輸入」與「近期趨勢」，趨勢不再集中在另一個底部分頁。這是刻意的：量完血壓最自然的下一個動作就是跟前幾天比一下，若必須切換底部分頁才看得到，日常動線每天都要被打斷一次。更關鍵的是，原本的切法只做了一半——血壓與體溫有趨勢，體重、飲食與服藥完全沒有，使用者學到的「想看趨勢就去那一頁」有三次會落空。

五個模組共用 `ModuleTrendSection` 外框（期間選項、展開記憶、延遲載入邊界），避免各自長出五種版本。趨勢區塊預設收合並記住狀態：照護分頁的首要工作是記錄，預設展開會把輸入表單推到摺線以下，也會讓較重的圖表套件進入每次開 App 的載入路徑。因此每個趨勢面板都是自己的 lazy chunk，recharts 只在照護者第一次展開時下載。

期間選擇與展開狀態由 `src/lib/trendPreference.ts` 統一保存，各模組與封存對象的唯讀歷史頁共用同一份；依〈生理數值對象綁定不變量〉，圖表期間與版面展開狀態屬純帳號層偏好，不需要 patient-scoped 分區。

## 血壓報告（原獨立的報告底部分頁）

已無獨立的「報告」底部分頁。血壓與體溫的趨勢圖原本同時存在於各自模組的「近期趨勢」與這個報告頁，是純粹的重複顯示；統計卡片、逐筆報告與 CSV／GPT 匯出則是報告頁裡真正沒有重複的部分。因此改為：血壓與體溫的趨勢圖只留在各自模組；統計卡片、逐筆報告與匯出併入血壓模組的「近期趨勢」，因為這些內容本來就是血壓資料的延伸，不需要另外佔一個底部分頁才看得到。

`BloodPressureReportPanel`（`src/features/vitals/components/BloodPressureReportPanel.tsx`）是這些內容現在的共同落點，接受明確的 `patientId`，不再依賴全域的目前操作對象狀態；它以 patient 篩選趨勢、平均、偏高／偏低與時段分布，並用結構化 record report 供醫師／家屬閱讀，顯示測量時間與規則狀態，不把資料庫寫入時間冒充量測時間。目前報告與 CSV 的資料範圍仍是血壓；體重、飲食與服藥次數已可在各自模組查閱，尚未併入匯出檔。

結構化報告卡片同時以 `readMedicationDay(patientId, 今天照護日)` 讀出「目前藥單」（依時段分組、`as_needed` 藥品另列「需要時服用」），與統計卡片、極值和列印／存 PDF 共用同一份 `.record-report`，讓照護者就診前不必切到服藥分頁再截圖。這裡刻意讀當日有效藥單，不是 `readMedicationHistory` 的變更紀錄——變更紀錄回答「藥單什麼時候改過」，看診當下要看的是「現在正在吃什麼」，兩者語意不同不能互換。藥單清單只在畫面上顯示，不寫進 CSV／GPT 匯出，避免既有的匯出格式（每列固定血壓欄位）被迫塞進和血壓無關的欄位。

列印報告底部共用 `src/components/system/PrintSourceFooter.tsx`，顯示家健錄名稱、正式公開首頁與繁中／印尼文／英文的「家庭自記錄，非醫療診斷文件」免責文字。QR 由 `src/lib/qrCode.ts` 以 inline SVG 矩陣產生，payload 固定為 `APP_CANONICAL_URL`，不把 `patientId`、姓名、token 或目前頁面 query 帶進紙本；這個固定邊界也讓 staging 預覽不會把 staging host 印成對外來源。

原本的四顆快速跳轉錨點已在拆掉報告頁前就先移除：手機頁面需要目錄本身就是頁面過長的症狀，而且載入中與錯誤狀態下目標區塊尚未 render，按下去沒有反應。

已封存對象的完整血壓與體溫歷史改由設定頁的「查看生命歷史」進入 `ArchivedPatientHistoryPage`（`src/features/system-admin/pages/ArchivedPatientHistoryPage.tsx`），不掛在底部主導覽，也完全不呼叫 `setActiveSubject`／`onSubjectSelect`——這個頁面直接以已封存對象的 `patientId` 讀取資料，結構上就不會讓已封存對象進入 `activeSubject`，見〈生理數值對象綁定不變量〉與 `src/lib/careSubjectGuard.ts` 的說明。

CSV 匯出按 patient 產生獨立檔，分頁讀取避免 1,000 筆上限；藥品目錄分批讀取，使用 UTF-8 BOM 並防 Excel 公式注入。體重與飲食同樣以 patient UUID 讀寫，不能靠 email 拼檔。

## 體重

體重是病人級照護資料；當天最多保存十二筆，每筆保存 `measured_at`，使用 `patient_weight_measurement_records` 的 `measurement_number` 1–12 表示量測槽位，並以 `patient_id + measured_on + measurement_number` 做唯一鍵。跨日後，資料庫保留每個過去日期 `measured_at` 最新的一筆；當天才允許十二筆，避免歷史高頻量測無限堆積。新槽位使用 INSERT，避免兩台裝置同時填入空槽位時互相覆蓋；舊版 PWA 繼續使用 `weight_records`，由 trigger 同步到新版第 1 槽位。體重輸入與「最近紀錄」在每日照護的同一個體重區段呈現，避免照護者在不同入口間找歷史資料；詳細的每餐熱量與病人專屬食物快取見 [`nutrition.md`](./nutrition.md)。

體重模組另含「近期趨勢」，以每日平均呈現體重變化。取當日平均而非某一次讀值，是因為體重在一天內會因進食與排泄浮動，單看某一次容易把日常波動誤讀成趨勢；沒有量測的日子在圖上留白而不連線，讓「沒量」與「量了沒變」可以分辨。彙整規則在 `src/lib/trendSeries.ts`，回歸測試在 `tests/unit/trendSeries.test.ts`。

體重一律顯示小數點後兩位。資料庫欄位本來就是 `NUMERIC(5, 2)`、寫入前也已收斂到兩位，但畫面（今天的紀錄、最近紀錄、趨勢圖數值）之前只印一位：照護者輸入 58.25、回頭看到 58.3，會以為系統擅自改了他量到的數字。位數、輸入框 step 與格式化都集中在 `src/lib/weight.ts` 的 `WEIGHT_DECIMALS`、`WEIGHT_INPUT_STEP`、`formatWeightKg` 與 `roundWeightKg`，避免哪天只改了顯示或只改了寫入而再度不一致；`formatWeightKg` 也負責把 Supabase 可能回傳的字串型 NUMERIC 轉成數字，並讓壞資料顯示破折號而不是 NaN。回歸測試在 `tests/unit/weight.test.ts`。

`measurement_number` 是資料庫唯一鍵需要的內部欄位，不再出現在畫面上。照護者只會遇到兩種狀態：記錄新的一筆（欄位留白，寫入當日第一個空槽），或點今天清單裡的某一筆進行修改（沿用該筆槽位）。修改中的那一筆以量測時間標示——照護者記得的是「早上量的那次」，不是「第 3 次」。

原本要求先從十二顆按鈕選「第幾次」才能輸入。體重不像血壓的早中晚有臨床意義，「第 7 次」對照護者沒有語意，等於要求使用者幫系統管理一個對他無意義的編號；要修正今天量過的某一筆，還得先展開「更改量測次數」再從十二顆按鈕裡找出正確的那一顆。今天的紀錄現在直接列出並可點選修改，與血壓、體溫的當日清單是同一種操作方式。底層的 INSERT／UPDATE、台北日期與病人級唯一鍵都沒有改變。

體重入口只由 `patient_daily_care_preferences.show_weight` 控制，以目前被照護者的 `patient_id` 為唯一鍵；設定頁開啟後，體重只在每日照護的頁內區段顯示，不再新增底部主導覽 tab，避免同一筆健康資料在兩個入口分流。這個偏好按病人共用，不會因不同照護者登入而分歧。原本另有一層獨立的「體重功能」病人級開關（`weight_settings` 表），只是在這個顯示偏好之上多包一層永遠同步的鎖、沒有額外效果，因此已移除該開關的 UI 與 App 層狀態；`weight_settings` 資料表仍保留給舊版快取 PWA 用戶端的相容路徑，不再由目前 UI 讀寫。替代方案「只在前端對 `admin@careapp.local` 硬編碼」無法隨照護對象與授權同步，因此不採用。

## 體溫

體溫與血壓同屬每日照護的生命徵象，入口和服藥並列在每日照護頁，不新增底部導覽。每筆體溫以 `patient_id`、`recorded_by`、`measured_at` 與 `created_at` 保存，另記錄測量部位（耳、額、口、腋）、量測情境與 240 字內備註；測量部位不能省略，因為不同部位的讀值不能直接混為一談。

資料庫 trigger 以伺服器 `created_at` 為每日計數基準，依病人每天最多 24 筆，並以病人 UUID advisory lock 防止同時寫入超額。這是 bot 防爆上限，不是醫療建議；刪除錯誤紀錄會釋出額度，RLS 仍只允許 `care_access.can_record` 的照護者讀寫。

因為是防爆上限而不是照護目標，額度計數平常不顯示，只有剩下 `TEMPERATURE_QUOTA_WARNING_MARGIN` 筆以內才出現。一般照護一天量兩三次永遠碰不到 24 筆，把分母做成常駐的顯眼徽章等於每天提醒使用者一件不需要在意的事，還會製造「是不是快用完了」的焦慮。

體溫紀錄保留 24 天。正式 Supabase 若已啟用 `pg_cron`，每日台北凌晨會執行清理函式；沒有排程模組的本機／預覽環境，下一次新增體溫時會順手清掉逾期資料。選 24 天是保留一個發燒週期與就醫前後上下文，不把短期紀錄永久堆積；長期趨勢應由醫師或匯出資料保存，而不是把過期健康資料留在產品資料庫。

體溫趨勢使用獨立圖表與數字狀態文字，不和血壓共用刻度，也不只用顏色判斷。`38°C` 以上只顯示「發燒範圍」提醒，若有呼吸困難、胸痛、發紺、意識改變或高燒持續超過 72 小時，畫面提示儘速就醫；App 不取代醫師診斷。

體溫輸入欄在輸入時只接受小數點後一位；若貼上或鍵入第二位小數，欄位會拒絕該變更並在欄位旁顯示繁中／印尼文提示，避免照護者只看到儲存按鈕停用卻不知道原因。

## 輸入 UX 與圖表

直接數字輸入可用自動跳欄、聚焦全選與未完整數值的溫和雙語提示，讓照護者抄寫血壓計時少按、少滑、少出錯；行動裝置的 `inputMode="numeric"` 已能穩定叫出螢幕數字鍵盤，因此輸入方式統一為鍵盤，不再提供滾輪切換。圖表可在服藥 plan 變更時間加註記，但註記是時間線索，不是自動推論藥物造成了血壓變化。

自動跳欄三格共用 `bpAutoAdvance` 的同一條規則：三位數立刻跳（血壓三格上限都是三位數，第三位輸入完必定完整），兩位數且已達該欄位下限則延遲 `BP_AUTO_ADVANCE_DELAY_MS` 再跳。延遲是必要的——兩位數可能只是三位數打到一半（105 會先經過 10），立刻跳會在打字中途搶走焦點。修正前收縮壓要滿三位數才跳、舒張壓與心跳滿兩位數就跳，導致 98 不跳而 85 跳，外觀相同的三個框行為不同。回歸測試在 `tests/unit/bpAutoAdvance.test.ts`。

延遲跳轉等待期間，輸入框會顯示淡藍色 pulse 提示（`PickerCard` 的 `pendingAdvance`），讓照護者知道系統即將自動跳走，不必搶著手動點下一格；一旦任何欄位被手動聚焦（點擊或 Tab），就會立刻取消尚未觸發的延遲跳轉，避免自動 `focus()` 與手動 focus 互搶焦點造成卡頓。

當 `visualViewport` 因軟鍵盤縮小超過 150px，App 進入暫時性的 compact input mode：隱藏每日照護頁首、最新量測、輸入方式切換、下方紀錄與底部導覽，只保留三個輸入欄與儲存按鈕。欄位聚焦後延遲 250ms 執行 `scrollIntoView`，等待 iOS 鍵盤 resize 完成，避免立即捲動造成跳動；儲存成功後 blur 目前焦點，讓鍵盤與導覽恢復自然狀態。沒有 `visualViewport` 的瀏覽器維持原本版面，不改動桌面配置。

Dashboard 的今日照護摘要與最新讀值要把 `measured_at`、狀態規則和目前 patient 一起呈現；不要顯示 Supabase、migration 或資料庫名稱作為照護者主要訊息。合規頁、CSV 匯出、帳號刪除與條款／隱私入口屬系統管理，但都要保留在可追溯的公開或設定流程中。
