<!--
檔案用途：整理健康、服藥、家庭與目錄資料的 canonical 身分與關聯。
所在層：docs/architecture；供 migration、RPC、資料查詢與匯出修改使用。
主要關聯：supabase/migrations、src/lib/database.types.ts、medications 與 patient access 文件。
-->

# 資料模型 / Data Model

## Canonical 身分

公開多租戶模型以 UUID 為核心：`app_profiles`／`profiles` 表示登入帳號，`households` 表示家庭，`patients` 表示照護對象，`household_members` 表示家庭成員關係。健康資料的 `patient_id` 是唯一可靠的照護對象邊界；舊的 `nenek`、`saya`、`caregiver` subject 僅作相容或顯示用途，不能再用來推測跨家庭權限。

血壓紀錄至少要能分辨：

- `patient_id`：被量測者。
- `recorded_by_user_id`／`recorded_by`：實際操作人。
- `measured_at`：實際量測時間，依台北時區顯示。
- `created_at`：伺服器寫入時間，不代表量測時間。

服藥、照護事件、匯出與 Dashboard 查詢都沿用 `patient_id`，避免一個頁面使用 subject、另一個頁面使用 email 而混資料。

所有代表身體狀態的數值，以及會改變健康判讀的病人專屬目標、基準與警示門檻，都屬於 patient-scoped 資料。畫面查詢、表單草稿、離線快取、圖表、報告與通知必須攜帶或分區保存 `patient_id`；「自己」也要先解析成 patient，不能直接把登入帳號 UUID 當成被量測者。這個區分讓同一位照護者切換多人時不會看到、送出或覆寫上一位病人的數值。

## 帳號設定與照護資料分離

`user_settings` 是登入帳號層的輕量設定表，目前保存 `medication_slots_expanded`、`created_at` 與 `updated_at`。主鍵直接參照 `auth.users.id`，所以同一帳號在不同裝置登入時可以讀到相同的閱讀偏好；這筆資料不含 `patient_id`，也不會改變藥單、服藥紀錄或照護授權。

`patient_daily_care_preferences` 是畫面顯示的病人分區設定，主鍵為 `patient_id`，保存血壓、體溫、服藥、飲食、體重、5 個寵物慢性病模組與失智照護模組共十一個 boolean，再加一個 `use_custom_template` 開關，讓同一位被照顧者的授權照護者看到一致入口。它不是健康事實，也不取代 `care_access`；RLS 仍要求登入者對目標病人的明確照護授權。沒有 row 時前端以其餘十項全部開啟相容既有使用者，唯獨 `show_dementia_care` 預設 `FALSE`（見下方 `dementia_care_records`），並以 CHECK 保證至少留下一個照護入口。`use_custom_template` 預設 `FALSE`：關閉時 `visibleDailyCareModules()` 依病人物種（`patients.care_recipient_type`）自動篩掉不適用的模組（例如貓狗不會看到血壓）；開啟後跳過物種篩選，改由這十一個 boolean 各自決定。舊 `user_patient_care_preferences` 保留作歷史相容資料。

`account_usage_limits.photo_retention_tier` 是私有的帳號級照片保留設定，只有 `standard` 與 `vip`；它不取代 `patient_id` 授權，也不重用控制每日寫入配額的 `plan_code`。清理規則對應 30 與 180 天，瀏覽器不能讀取或修改這個欄位。

共用表的寫入能力與照護紀錄一致要求 `care_access.can_record`；舊表在過渡期仍可被舊版客戶端讀寫，但其寫入也受同一能力限制，並由 trigger 同步到共用表。這避免 view-only 帳號繞過新表 policy，也避免尚未更新的 PWA 形成分裂設定。

語言、顯示單位、圖表期間與版面展開狀態等不帶健康判讀意義的設定可以維持 user-scoped。若設定會因人而異地改變目標範圍、危險判定、警示或照護行為，就不再是單純介面偏好，必須存成 patient-scoped 資料並套用相同授權邊界。

設定表的 RLS 只允許 `auth.uid() = user_id` 的 SELECT／INSERT／UPDATE／DELETE。偏好尚未建立時由前端與資料庫預設為展開；展示模式沒有登入身分，才退回 localStorage，避免匿名展示資料建立正式帳號設定。

## 服藥三層模型

1. `drug_products`／相關官方表：TFDA、健保或 MOA 的公共候選主檔。
2. `medications`：家庭可選取的穩定藥品項目，保存商品名、學名、數值劑量、劑型、驗證狀態與可選外觀。
3. `medication_plans`：某一 patient 的服用安排，保存時段、顆數、順序與 PRN。
4. `medication_intake_logs`：某一 plan 在某日某顆的實際勾選。

需要時服用不共用這個 routine log：`prn_medication_events` 是每次實際使用的 append-only 事件，保存 `patient_id`、`plan_id`、實際 `taken_at`、資料庫推導的 `care_date`、實際量、原因／症狀、效果狀態、備註與記錄人。事件 UUID 由 client 在第一次送出前建立，重試遇到唯一鍵衝突時回讀同一事件；更正不能覆寫醫療事實，而是將原事件標為 `voided` 並留下原因，再視需要建立新事件。`prn_medication_daily_assessments` 只保存明確的 `not_needed` 或可恢復的 `not_assessed`，`used`、次數與最後時間永遠由 active events 導出。

服藥紀錄的日期欄位分工如下：`taken_at` 是不可取代的實際服用時間；`taken_on` 是既有日曆日相容欄位；`care_date` 是以 `Asia/Taipei` 04:00 切分的照護日。結構化藥單唯一索引使用 `patient_id + plan_id + care_date + dose_number`；舊版沒有 `plan_id` 的單顆藥則使用 `LOWER(account_email) + medication_id + care_date`，兩種路徑都能把跨午夜但未跨 04:00 的紀錄視為同一筆。資料庫 trigger 以 `taken_at` 強制計算 `care_date`，前端只提供 UX 預覽。

官方主檔不直接等同於病人的醫囑；使用者選到官方候選後才建立或連結 `medications`。未驗證自訂藥品可以支援照護記錄，但不能被說成官方資料，也不能餵給成分交互作用或總量判斷。

### 服用方式（A／B 兩層，issue #622）

服藥三層模型只回答「什麼時候吃、吃了沒」，不回答「這顆藥能不能整顆吞」；這一格由獨立的兩層資料補上：

- **A 層**：`medications.official_dosage_form_text`／`official_score_text` 兩個唯讀欄位，由
  `refresh_official_medication_dosage_details()` 從 `drug_products.dosage_form`／`tfda_drug_appearances.score`
  回填，寫法完全比照 `atc_code` 回填——只由 service-role 的 refresh 函式寫入，`apply_medication_plan_change`
  不碰，也不要求 `verification_status = 'official'`。前端純函式 `resolveSwallowGuidance()`
  （`src/lib/medication/medicationSwallowGuidance.ts`）讀這兩個欄位轉成三語提示，不進資料庫。
- **B 層**：`patient_medication_instructions`，主鍵 `(patient_id, medication_id)`——一個病人的一顆藥只有一種吃法，
  不像 `medication_plans` 是 (patient, medication, slot) 三元組。刻意不塞進 `medications`（跨病人共用目錄）
  也不塞進 `medication_plans`（要動 20 參數 RPC）；`instruction_codes`（代碼陣列）、`instruction_note`
  （200 字內）、`source`（`pharmacist`／`doctor`／`package_insert`／`family`）、`confirmed_on`、`updated_by`／
  `updated_at`（trigger 從 JWT 強制寫入）。只用一般 `supabase.from()` 讀寫，RLS 把關，不進
  `medication_plan_change_logs`（不動處方，`updated_by`／`updated_at` 就是這張表自己的稽核）。

A、B 兩層互不覆蓋、互不裁決：畫面上兩邊都照顯示，矛盾時額外附一條警告，不靜默讓任一邊勝出（見
`docs/features/medication.md` 的「服用方式」小節與 `detectInstructionConflict()`）。

## 其他核心表

- `care_timeline_entries`：看診、症狀、藥物調整、疫苗、飲食與家屬觀察等交接事件；`photo_paths` 保存最多四組 private Storage 的原圖／縮圖相對 path，照片二進位不進 Postgres，immutable CHECK validator 會把每組 path 綁定到同列的 `patient_id + id`。照片保留起點使用資料庫控制的 `created_at`，清理後保留文字事件但清空附件 metadata。
- `care-event-photos`：private Supabase Storage bucket；path 以 `patients/{patient_id}/events/{event_id}/` 分區，Storage RLS 沿用 `care_access`，讀取檢查可見病人，寫入／刪除要求 `can_record`。逾期刪除必須由 `care-event-photo-retention` Edge Function 使用 Storage API 執行，不能只刪 `storage.objects` 的 SQL 列。
- `body_temperature_records`：病人級體溫、測量部位、量測情境與備註；沿用血壓相同的 `care_access` 讀寫邊界，並由資料庫 trigger 限制每日 24 筆、保留 24 天。
- `weight_records`／設定：病人級體重與是否啟用追蹤的設定；`recorded_by` 只保留代填稽核，唯一鍵以 `patient_id + measured_on` 防止跨裝置重複。
- `patient_weight_measurement_records`：病人級當日最多十二筆體重；`measurement_number`（1–12）與 `patient_id + measured_on` 形成跨裝置去重邊界。過去日期由資料庫 trigger 僅保留 `measured_at` 最新的一筆；舊 `weight_records` 保留每日單筆唯一鍵供快取 PWA 使用，舊寫入由 trigger 同步到新版第 1 槽位。更早的 `weight_measurement_records` 相容表也由 `20260812110000_scope_legacy_weight_measurements.sql` 回填並強制使用 `patient_id`，不再以 email 作為健康資料邊界；若 email／日期對應多位病人，migration 會中止而不猜測歸屬。
- `meal_food_catalog_items`：每位病人已確認過的食物／產品快取，可作模糊搜尋；不是跨家庭公開營養資料。
- `meal_records`／`meal_record_items`：病人級餐次與食物快照；子項目的複合外鍵要求和餐次同一個 patient，避免跨人串接。
- `care_access`：舊家庭版的明確病人授權表，仍是安全檢查的重要來源。`(profile_email, patient_id)` 仍是唯一鍵，另外加了 `user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE`（F-5，issue #590 單位 1）：授權身分正從 email 改綁 `auth.uid()`，`user_id` 為 `NULL` 代表尚未綁定、仍走 email 過渡軌，已綁定的列只認 `user_id`。詳見 [`auth-and-rls.md`](auth-and-rls.md) 與 [`care-access-identity-binding.md`](care-access-identity-binding.md)。
- `calendar_notification_sources`：病人級的專用 Google Calendar 來源，保存 Calendar ID、提前分鐘、Telegram `enabled` 與行程頁 `agenda_enabled`；兩個旗標互不推導。partial unique index 限制同一 `patient_id + google_calendar_id` 至多一個 agenda source，避免相同行程在頁面重複；它不保存行程內容，也不使用登入者帳號作為病人歸屬。
- `notification_deliveries`：通知副作用的最小稽核資料，只保存 SHA-256 occurrence key、occurrence 開始時間、提前分鐘與狀態。key 在 Function 記憶體中以 raw Google event ID、開始時間與 lead time 算出，原始 ID 不落 DB／log；複合外鍵 `(source_id, patient_id)` 必須對回同一個 source，唯一鍵 `(source_id, calendar_occurrence_key)` 是 Cron 重疊時的真正去重邊界；不得新增 title、description 或 location 欄位。ADR-007 票 1（`20260926155217`）起，它與 `care_due_reminder_deliveries`、`personal_notification_outbox`、`blood_pressure_notification_deliveries` 四張 delivery 帳本共用同一組五值 `status`、同一份 `provider_*` `failure_code` 值域（兩張 cron 帳本在票 9 之前另收 `telegram_*` 過渡值）與同一組欄位：`attempt_count`／`next_attempt_at`（D4）、`claim_token`／`claim_generation`（D9）、`resolution_source`（`runtime`／`migration`，遷移判定的終局列才是 `migration`）。直送帳本同時補上 `failure_code`、`attempt_started_at`、`provider_http_status`。任何一張表的值域或欄位單獨漂移都會被 `tests/unit/notificationDeliveryLedgerAlignmentMigration.test.ts` 與 `rls-authorization.sql` 擋下。票 6（`20260926165847`）另加 `notification_delivery_incidents`：sweeper 的告警表，每個 delivery 列最多一筆，鍵 `(delivery_table, delivery_id, source_created_at)`，非正規化 `patient_id` 由 INSERT 回查驗證且不可變；四張 delivery 表因此多了凍結 `patient_id`／`created_at` 的 `BEFORE UPDATE` 與連帶刪 incident 的 `BEFORE DELETE` trigger，並有一條只對 `notification_delivery_sweeper` 角色生效的 SELECT policy。詳見 `docs/features/notifications.md`「delivery sweeper」。
- `household_members`：公開多租戶家庭內的 member role 與 patient 關聯。
- `record_change_logs`（ADR-008 AUDIT-1，issue #967）：通用異動稽核表，由 `log_record_change()` AFTER trigger 寫入，目前掛在 `care_access`、`household_members`、`patients`（Tier A，全事件、永久）與 `patient_anomaly_alert_settings`、`pet_blood_glucose_target_ranges`（Tier A′）；Tier B 健康表由 AUDIT-2（#968）掛。每列存 `table_name`／`row_id`（複合主鍵表存 `user_id`，每病人一列的設定表存 `patient_id`）、`patient_id`／`household_id` 分區鍵、`action`、`actor_kind`（`user`／`service_role`／`system`）＋ `actor_user_id`（只記 `auth.uid()`，永遠不記 email）、`actor_source`、`changed_columns`、`before_row`（剝除 email 型記錄者欄位後的整列 OLD）、`after_diff`（只含改到的欄位）、`expires_at`（Tier A／A′ 為 NULL）。**整張表沒有任何外鍵**（cascade 會撞不可變 trigger、反過來讓刪帳號／刪病人失敗），沒有 email 欄位，只有 SELECT policy（`can_record` 照護者讀病人層列、家庭 owner 經 `is_household_owner()` 讀家庭層列），API role 沒有任何 DML，UPDATE 一律拒絕、DELETE 只放行 `app.audit_bypass = 'on'` 的 purge。trigger 參數：`TG_ARGV[0]` 保留類別（`'permanent'` 或 interval 字面值）、`TG_ARGV[1]` row_id 欄位、`TG_ARGV[2]` 額外剝除欄位；transaction-local GUC：`app.audit_bypass`（系統清理與 `delete_user_account` 的健康列段落）、`app.audit_actor_kind = 'system'`（規則 trigger 在使用者 session 內的系統寫入，目前是 `revoke_share_readonly_for_caregiver_role`，設完必須還原）、`app.audit_source`。剝除後沒有差異的 UPDATE（同值回寫、只換 `profile_email` 快照）不留列；分區鍵（`row_id`／`patient_id`／`household_id`）改變的 UPDATE 寫成舊分區一筆 `delete` ＋ 新分區一筆 `insert`，舊快照永遠不落到新分區（PR #975 review）。讀取層與 UI 見 AUDIT-3／AUDIT-4；理由與被拒絕方案見 [`../adr/008-audit-coverage-boundary.md`](../adr/008-audit-coverage-boundary.md)。
- `legal_consents`：條款、隱私與健康資料同意版本、伺服器時間與代理關係。
- `patient_share_consents`：病人級的分享同意／授權稽核，保存 `patient_id`、操作者、本人／代理人類型、代理依據、固定 `scope_version`、同意文字版本與 server timestamp；不能用帳號層 `legal_consents` 單獨取代這筆分享授權。
- `patient_share_links`：病人級唯讀 bearer link metadata，只保存 token hash，不保存 raw token；`expires_at` 最多七天、`revoked_at` 可即時失效，並以 `(share_consent_id, patient_id, scope_version)` 複合外鍵把 link 綁回同一位病人與 scope。Stage 2 新增 `redeem_patient_share_link`（token hash → link）與 `get_patient_share_summary`（link → 固定 DTO）兩支 service-role-only RPC 讀取這張表，仍沒有任何 anon／authenticated 可直接查詢的 token lookup 入口。
- `patient_share_link_access_events`（issue #923）：唯讀分享連結的逐次存取稽核，append-only。`redeem_patient_share_link` 兌換成功寫一筆 `exchange`、`get_patient_share_summary`／`_v2` 讀取成功寫一筆 `summary_read`，都在 RPC 授權閘門通過之後、同一交易內由內部函式 `record_patient_share_link_access()` 寫入（寫入失敗時整次兌換／讀取一起失敗）；失敗路徑一律不寫。欄位只有 `link_id`、`patient_id`（由連結帶出）、`event_type`、`occurred_at`，沒有健康數值、token、token hash、IP 或 email。啟用 RLS、沒有 policy，`anon`／`authenticated`／`service_role` 都沒有任何權限；UPDATE 由 trigger 一律拒絕，DELETE 只剩保存期清理（`purge_expired_patient_share_link_access_events()`，180 天，pg_cron `purge-patient-share-link-access-events` 每日台北 01:45，兌換時也順手清）與刪連結／刪病人的 cascade。外洩時的查法見 [`../operations/share-link-breach-response.md`](../operations/share-link-breach-response.md) §2。
- `share_link_rate_limits`：唯讀分享公開入口的速率限制 bucket，只保存雜湊過的 key（IP、token 或 link 的 SHA-256）與時間窗內請求次數，不保存 raw IP 或 raw token；`check_share_link_rate_limit` 機會性清除超過一天的舊 bucket，避免長期累積可回推來源的紀錄。
- 寵物慢性病照護（`pet_liquid_intake_records`、`pet_digestion_records`、`pet_appetite_records`、`pet_subcutaneous_fluid_records`、`pet_insulin_records`、`pet_blood_glucose_records`）：只服務每日照護分頁的寵物模組，不進 Dashboard 摘要卡。液體管理與消化健康是「一天一筆」，以 `patient_id + recorded_date` 唯一鍵防止同一天覆蓋成兩筆；食慾（含 `meal_type`）、皮下點滴、胰島素與血糖是一天可多筆的時間戳紀錄。胰島素與血糖刻意拆成兩張表，因為兩者量測頻率不同、且不是每次都同時記錄。RLS 沿用既有 `care_access`（需要 `can_record` 才能寫入），`recorded_by`／`administered_by` 只表示操作人。

`pet_blood_glucose_target_ranges` 是病人級血糖判讀門檻，`patient_id` 是主鍵且沒有 authenticated 直接 DML；`upsert_pet_blood_glucose_target_range` 只接受對該 patient 具 `can_record` 的照護者。`record_pet_endocrine` 則在同一交易內寫入胰島素與血糖兩張表，避免前端依序 request 造成半套紀錄。沒有 target row 時不套用全域門檻，前端只顯示原始血糖值。

寵物歷史趨勢仍直接讀這六張表，不建立第二份彙總表或快取真相；查詢必須以 `patient_id` 和明確的台北日期／時間範圍分區。前端只在圖表展開後載入，並在 `src/lib/petTrendSeries.ts` 將每日一筆紀錄保留原值、食慾／血糖取每日平均、點滴／胰島素取每日總量；沒有紀錄的日期維持空值，避免把缺少照護輸入誤解成零值。

- `dementia_care_records`：失智照護模組（issue #421）的三種觀察紀錄——躁動時段、日夜顛倒模式、走失風險，用 `record_type` 區分，共用同一張表（時間、時段、備註欄位一致，不需要拆表）。`time_period` 可不填。RLS 沿用既有 `care_access`（`can_record` 才能寫入），`recorded_by` 只表示操作人；只在病人啟用 `dailyCareModules.dementiaCare` 時才會出現在每日照護頁（見下方預設關閉說明）。

- `care_due_reminders`：藥量倒數與人／寵物到期提醒（issue #414），讀取看 `care_access`、寫入要 `can_manage_medication`。照護閉環 T2（issue #946）起，非 `medication_refill` 型別可帶 `related_entry_id`（→ `care_timeline_entries`）或 `related_lab_result_id`（→ `patient_lab_results`，兩者互斥）與 `visit_department`（≤ 40 字自由文字，沿用時間線科別慣例），兩個關聯都是 `(欄位, patient_id)` 複合外鍵、`ON DELETE SET NULL (欄位)`，跨病人引用在資料庫層被拒；這不是排定實體（沒有時分、診間或「已確認」狀態機），仍只是「提醒你去約」的到期日（[ADR-005](../adr/005-care-loop-closure.md) 決策一）。`care_timeline_entries` 與 `patient_lab_results` 為此各補一個結構性 `UNIQUE (id, patient_id)`，不改既有欄位。
- `patient_visit_questions`：病人層級長期累積的回診問題清單（issue #723），只要求一般 `care_access`。照護閉環 T1（issue #945）起也是 Concern／Outcome 的最小載體：`source`／`source_rule_id`／`source_entity_id` 記錄「就診前摘要哪條規則、哪一列」採納成這筆問題（CHECK 保證成對、partial unique index 保證同病人同來源只採納一次，刻意不對來源表建外鍵，但 `validate_patient_visit_question_source` trigger 在寫入當下驗證來源列屬於同一位病人），`answered_at` 由 trigger 在 `answer` 變動時維護、前端只讀（`20260925191000` 以 `asked_at` 回填舊答案）。⚠️ `source_entity_id` 沒有外鍵，只在寫入時驗證；改動四張來源表 `patient_id` 的未來操作必須自行處理引用它的問題列。詳見 [`../features/visit-questions.md`](../features/visit-questions.md) 與 [ADR-005](../adr/005-care-loop-closure.md)。

`medication_plan_change_logs` 是不可變的藥單異動真相，保存明確 action、plan snapshot、actor 與 recorded/effective time。`care_timeline_entries.medication_plan_change_log_id` 是唯一投影 linkage，`medication_change_snapshot` 是供時間線讀取的展示投影，不取代 change log。歷史舊 log 可沒有完整 before snapshot，但 migration 會保留原資料並標示部分相容快照；新 mutation 必須完整保存前後狀態。

## 不變量

- 所有外鍵與 RPC 回傳都要保留 UUID，不用顯示名稱 join。
- 停用 medication plan 不刪除 intake history；歷史可追溯比畫面乾淨重要。
- 唯一索引是跨裝置去重的真正邊界；按鈕停用只提供 UX。
- 照護日只改每日工作區的分組，不改寫 `measured_at`、`taken_at` 或照護大事記的實際時間；任何報告若用照護日，必須在標題標明。
- 建立 plan 必須 idempotent，網路重試不能產生重複醫囑。
- PRN plan 的 `as_needed` 是分區與 RLS 關聯條件，不代表已使用；既有 PRN plan 搬遷時不猜測歷史使用、不回填 event，也不把它改成 routine slot。

- plan 時段或劑量調整若已有 plan id，必須以該 id 原地更新；不可用新增另一個 schedule row 代替，否則會留下兩個 active 醫囑。
- 名冊／profile 必須先於 care access 與 plan seed，否則外鍵與 RLS 重播會失敗。
- 匯出按 patient 分檔，不把登入者自己的帳號體重無條件混進其他成員資料。
- 新增生理數值或健康門檻前，先定義 patient 關聯與 RLS；前端 active patient、姓名或 localStorage key 不能成為唯一歸屬依據。
- 通知 delivery 的 `delivery_unknown` 與 `sending` 不能自動改回 pending；遠端 Telegram 結果不確定時，資料庫唯一鍵與可觀測狀態優先於補送。
- 有 `patient_id` 的新表預設掛 `log_record_change()` 通用 audit trigger（ADR-008 決策五），不得再開只記 email 的 bespoke log 表；`record_change_logs` 與任何 audit 表都不加外鍵，也不存 email。
- 指向 `auth.users` 的外鍵動作只能是 `CASCADE` 或 `SET NULL`，否則帳號會刪不掉；若 `SET NULL` 會被該表的不可變 trigger 擋下（`patient_bp_standards.created_by`，issue #967），改為刻意不建外鍵、保留 dangling uid，並在 migration 註解寫明理由。兩張邀請表的 `invited_by_user_id` 自 #967 範圍補充（migration `20260926051643`）起改為可 NULL 並 `ON DELETE SET NULL`：已接受的邀請保留作授權來源紀錄，未接受的由 `delete_user_account` 在刪帳號前清掉；`caregiver_invitations_request_pair_check` 不再要求 `requested_by_user_id` 非 NULL（否則經邀請加入過的帳號 SET NULL 時撞 23514）。`supabase/tests/rls-authorization.sql` 的 `account_deletion_every_auth_fk` 讓帳號在每張參照 `auth.users` 的表都有一列再刪，並把覆蓋清單綁在 catalog 上：新增這類外鍵卻沒補 fixture，測試就失敗。

## database.types.ts 產生流程

`src/lib/database.types.ts` 是 Supabase 公開 schema 的 TypeScript 型別快照，理論上應該由
`supabase gen types typescript` 產生，而不是手寫維護。issue #833 調查（2026-09）確認：

- repo 的 `package.json` scripts 與 `.github/workflows/*.yml` 都沒有任何步驟會自動重新產生這個檔案；
  一直是開發者本機手動執行指令後貼上結果送 PR。
- 這個手動流程沒有強制檢查點，調查當下就已經漏更新：本檔目前缺少
  `20260915110000_add_medication_catalog_curator_entitlement.sql` 到
  `20260915130000_create_patient_medication_appearance_overrides.sql`
  這幾支 migration 新增的表與欄位（例如 `patient_medication_appearance_overrides` 整張表都不在快照裡）。
  這代表使用到這些新表的程式碼目前拿不到型別檢查保護，是需要另外排查的風險，但不在本 issue 範圍內修正。

### 重新產生步驟

1. `supabase login`（或在 CI／本機安全環境設定 `SUPABASE_ACCESS_TOKEN`）取得存取權杖；本機互動式登入
   的憑證不要落地寫進任何 git-tracked 檔案。
2. 依分支狀態選其中一種：
   - **分支沒有新增 migration，或新增的 migration 已經合併進 staging**：先依
     `docs/staging-environment-guide.md`「真值從哪裡取得」設定 `STAGING_SUPABASE_PROJECT_ID`
     環境變數，再執行 `bun run types:generate`（實際指令是
     `bunx supabase@2.109.1 gen types typescript --project-id "$STAGING_SUPABASE_PROJECT_ID" --schema public`，
     CLI 版本釘住 `2.109.1` 與 `staging-supabase-migrations.yml` 等 migration workflow 一致，避免
     不同機器裝到不同版本的 CLI 產生不一致的快照；issue #888 之後這個 project ref 不再寫死於
     `package.json`，只保留在 `supabase/config.toml`、`scripts/seed-staging.ts`、
     `scripts/verify-staging-data.ts` 三個已記錄例外的 tracked 檔案裡，不需要另外查詢）。
   - **分支自己新增了 migration，staging 還沒部署**（`staging-supabase-migrations.yml` 只在合併
     進 `staging` 之後才 `supabase db push`，所以 `--project-id` 這條遠端指令讀到的是舊 schema，
     看不到分支自己新增的表／欄位——這正是本次調查一開始想避免的「型別落後」問題）：改執行
     `bun run types:generate:local`，先跑 `supabase start` 在本機 Docker 用該分支的完整
     migration 清單重播 schema，再對本機資料庫產生型別（`bunx supabase@2.109.1 gen types
     typescript --local --schema public`），這樣才會包含分支自己的 migration。
   兩個 script 都先寫進暫存檔，CLI 成功才覆寫 `src/lib/database.types.ts`，避免失敗時把本檔清空——
   這是本次調查時實測第一版 script 在沒有存取權杖的情況下曾直接把本檔清空後才修正的教訓。
3. 執行 `npx tsc --noEmit`，確認新型別沒有讓既有程式碼出現型別錯誤，再檢視 diff 並送 PR。

本次調查所在的沙盒環境沒有 `SUPABASE_ACCESS_TOKEN`，也沒有可用的 Docker daemon 跑
`supabase gen types typescript --local`，因此無法在這次 PR 內實際重新產生並回填最新內容；
新增的 `types:generate`／`types:generate:local` script 已可在具備登入權杖與（`--local` 時）
Docker 的環境下直接使用。

## 資料搬遷原則

先以受控 migration 將舊 subject／email 對應到已確認 UUID，再改查詢與 RLS；不以模糊藥名、同名或猜測照片補資料。照護日 migration 只由 `taken_at` 推導 `care_date`，建立唯一索引前若發現歷史跨邊界衝突就中止，不能自動刪除資料。新增 RPC 後要 reload PostgREST schema。若資料邊界改變，必須先驗證核心照護帳號仍能讀寫媽媽資料，再進 staging 驗收。
