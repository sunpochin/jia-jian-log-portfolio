<!--
檔案用途：回答 maintainability review § A7「audit 覆蓋」的六個範圍設計問題——哪些表值得 audit（逐表分級與排除理由）、
  通用 record_change_logs 的形狀與儲存量估算、actor 身分在 A3 前後的寫法、RLS／隱私／保留期限／帳號刪除／備份邊界、
  與既有四張 change-log 表的關係、讀取端最小入口——並在末段給出實作票切分與依賴圖。
所在層：docs/architecture；授權／資料模型的規劃文件。ADR-008 只保存決策與被拒絕方案，本檔保存推導過程、逐表證據與估算；
  實作票合併後把「現行契約」併回 data-model.md 與 auth-and-rls.md，本檔只保留理由。
主要關聯：docs/adr/008-audit-coverage-boundary.md（本檔的決策記錄）、docs/architecture/maintainability-review-2026-09.md § A7／A3、
  docs/product/care-loop-domain-model.md §4／§7（#847 已核准的 schema delta）、docs/adr/005-care-loop-closure.md、
  docs/architecture/care-access-identity-binding.md §8、docs/adr/002-database-backup-boundary.md、docs/operations/cron-inventory.md、
  supabase/migrations/20260812010000_reliable_medication_timeline_events.sql（既有 immutability trigger 寫法）、
  supabase/migrations/20260914110000_add_admin_config_audit_and_self_heal_sync.sql（只記 uid 的既有先例）、
  supabase/tests/rls-authorization.sql。
-->

# Audit 覆蓋範圍設計：哪些表、什麼形狀、誰改的、誰能看、留多久

- 狀態：**已核准**（owner 於 2026-09-26 在 [issue #910](https://github.com/portfolio-author/jia-jian-log/issues/910) 核准 ADR-008；AUDIT-1～3 本季實作，AUDIT-4 延到 2027-Q1）。本文件只出設計，不寫程式、不開 migration；實作票依 §10 開立，票號見 §10。
- 日期：2026-09-24
- 審查模型：Fable 5.1（依 [`docs/ai/model-routing.md`](../ai/model-routing.md)「跨三個以上子系統的一次性整體設計與 ADR」；本題同時跨 #847 domain model、A3 身分欄、ADR-002 備份邊界、#655 分享摘要四個面向）
- 基準：`origin/staging` commit `05a2fe10`（197 支 migration）
- 來源：[#848](https://github.com/portfolio-author/jia-jian-log/issues/848) § A7；[#847](https://github.com/portfolio-author/jia-jian-log/issues/847) 已於 2026-09-24 核准六題全部採用「採用方案」（[核准紀錄](https://github.com/portfolio-author/jia-jian-log/issues/847#issuecomment-5811367851)），A7 因此解鎖

## 0. ELI5（給完全不懂技術的人看）

家裡的健康本子，現在只有「藥單」那一頁改過會留下痕跡。其他頁——血壓、體重、體溫、誰有權限看本子——如果有人把數字改掉或整行擦掉，本子不會記得是誰、什麼時候、原本寫什麼。

這份文件決定四件事：

1. **哪幾頁要留痕跡**：誰有權限（一定要）、會影響警報判斷的門檻設定（一定要）、看護和家人平常記的數字（改掉或擦掉時要，新寫一筆不用——因為那一筆本身就是紀錄）。藥單那頁已經有自己的痕跡本，不重做。
2. **痕跡長什麼樣**：一本共用的「異動簿」，每一條寫「哪一頁、哪一行、誰、什麼時候、改之前整行長什麼樣、改了哪幾格」。不為每一頁各做一本，因為以後加新頁就要再做一本。
3. **誰能翻異動簿**：只有能在那位病人本子上寫字的人。只能看、不能寫的人（viewer）翻不到——異動簿裡有「哪個照護者改了什麼」，那是另一個人的資料。
4. **留多久**：權限和門檻的痕跡永久留；數字的痕跡留半年，之後自動清掉。系統自己例行清舊資料（例如體溫只留 24 天）不算「有人改」，不進異動簿，否則清掉的資料只是搬到另一本繼續佔空間。

誠實的但書：這份文件**不會**做出一個可以點開看的「誰改了」畫面；它只決定資料庫要怎麼記，讓以後想做那個畫面時資料已經在了。

## 1. 為什麼現在做、範圍是什麼

### 1.1 事實：今天資料庫答不出「誰改的」

- 全 repo 28 個 `CREATE TRIGGER` 都是配額、欄位推導、不可變保護、legacy 同步或身分綁定；**沒有任何 `AFTER … UPDATE OR DELETE` 寫入 audit 表的 trigger**（`grep -rhn "CREATE TRIGGER" supabase/migrations`，本檔 §2.1 列出全部 28 個）。
- 四張 change-log 表全由 RPC 內顯式 `INSERT` 寫入：`medication_plan_change_logs`（`20260720060000_add_medication_plan_change_log.sql`）、`medication_catalog_change_logs`（`20260914120000_stop_shared_medication_catalog_silent_overwrite.sql:48-58`）、`account_entitlement_change_logs`（`20260910150000_add_medication_ai_draft_entitlement.sql`）、`app_admin_config_audit_log`（`20260914110000_add_admin_config_audit_and_self_heal_sync.sql:22-29`）。
- 血壓列可以被 client 直接改值與刪除：`src/features/vitals/components/DailyBloodPressureRecords.tsx:143`（`update({ systolic, diastolic, pulse })`）、`:166`（`delete()`）；policy 在 `20260730060000_limit_daily_care_entries.sql:51-60`（`can_record` 即可 UPDATE／DELETE）。時間線手動事件同樣：`src/features/care-family/hooks/useTrajectoryEntryEditor.ts:150,189,236`。改完之後，列上只剩新值。
- `protect_*_audit_fields_before_update` 這一族 trigger（例：`20260730060000:30-49`）只保護 `patient_id`／`recorded_by`／`created_at`／`source` 不被改，**不保護數值本身**，也不留舊值。它的名字裡有 audit，但它是「防篡改記錄者」，不是「記錄誰改了」。
- `household_members(household_id, user_id, role, created_at)` 沒有 `updated_at`（`20260724040000_add_multitenant_households.sql:27-33`）；`add_household_member` 的 `ON CONFLICT (household_id, user_id) DO UPDATE SET role = EXCLUDED.role`（最新定義 `20260914130000_drop_care_access_email_fallback.sql:678`）讓角色從 caregiver 變 viewer 零痕跡。
- `care_access` 沒有任何 client 直接 DML 的 policy（`TECHNICAL.md`「不可破壞的資料邊界」：授權異動只走受控 RPC），但 RPC 內的 `DELETE FROM care_access` 有 42 處（`grep -rn "DELETE FROM care_access" supabase/migrations | wc -l`），`enforce_mother_patient_only_access` trigger 也會刪（`20260815010000_enforce_mother_patient_only_access.sql:20`）；沒有一處留下「刪之前是誰、有哪些能力位」。

### 1.2 為什麼是現在

- #847 已核准，本季**不新增病人級資料表**成立（`q4-2026-outcome-compression.md` §1 第 1 點）。這代表 audit 掛載清單在本季是封閉的：§3 列出的表就是全部，不會一邊設計一邊長出新表。
- #847 §4 delta #1／#2 會給 `patient_visit_questions` 加 `source`／`source_rule_id`／`source_entity_id`／`answered_at`，delta #5 給 `care_due_reminders` 加 `related_entry_id`／`related_lab_result_id`／`visit_department`。「醫師說了什麼」（`answer`）從此是使用者可見、可改寫的臨床結論——**誰改了醫師的答案**是新的、本設計必須涵蓋的問題。若 audit 形狀是每表各自的具名欄位，這些 delta 每落地一次就要改一次 audit；通用 JSONB 形狀（§4）才能讓 #847 與本設計互不阻塞。
- A3（帳號層改 uid）尚未開票。本設計的 actor 欄位必須在 A3 前就能寫、A3 後不需重寫（§5）。

### 1.3 不在範圍內

- 任何程式碼、migration、RLS policy、cron 設定（留給 §10 的實作票）。
- UI（§8 只定義最小讀取入口，不畫畫面；依 `q4-2026-outcome-compression.md` §3，本季三個成果不含 audit UI）。
- `medication_plans` 的異動史（已有 `medication_plan_change_logs`，§7）。
- 帳號層（`account_usage_limits`、entitlement）的 audit——那是 A3 選項 1 的範圍，不是病人資料層。
- 回答「資料被誰**讀**過」（access log）。本設計只記寫入；讀取稽核需要完全不同的機制（PostgREST 層或 `pgaudit`），且對 Supabase 免費額度不現實。

## 2. 事實盤點（附路徑，供實作票直接引用）

### 2.1 既有 28 個 trigger 的類別

| 類別 | trigger（節錄） | 與本設計的關係 |
| --- | --- | --- |
| 配額（BEFORE INSERT） | `enforce_daily_blood_pressure_limit_before_insert`、`…body_temperature…`、`…care_timeline…`、`…medication_ocr…`、`…patient_lab_results…` | 不相干；本設計不掛 INSERT 在健康表上 |
| 不可變保護（BEFORE UPDATE） | `protect_blood_pressure_audit_fields_before_update`、`…body_temperature…`、`…care_timeline…`、`…fluid_balance…`、`…patient_lab_results…`、`…weight_record…`、`protect_patient_bp_standard_immutable_fields` | 保證 `recorded_by`／`created_at` 不會出現在 audit 的 `after_diff`；不衝突 |
| 系統列不可變 | `prevent_system_generated_timeline_mutation_trigger`（`20260812010000:171-191`）、`prevent_medication_plan_change_log_mutation_trigger`（`:193-206`） | **本設計 immutability trigger 的範本**（`RAISE EXCEPTION` 一行） |
| 欄位推導／從 JWT 補值（BEFORE） | `medication_intake_care_date_trigger`、`patient_medication_instruction_fields_trigger`、`patient_medication_appearance_override_fields_trigger`、`prn_medication_event_fields_trigger`、`prn_medication_daily_assessment_fields_trigger`、`fill_medication_plan_subject_before_write`、`bind_care_access_user_id_trigger` | BEFORE 先跑、AFTER audit 後跑，`after_diff` 看到的是補完值的列；正確 |
| 保留期限（AFTER 寫入即刪舊列） | `enforce_patient_weight_daily_retention_after_write`（`20260812162518:71`、`20260812165451:35` 有 `DELETE FROM patient_weight_measurement_records`） | **系統刪除，必須繞過 audit**（§6.3） |
| legacy 同步 | `sync_legacy_patient_weight_after_write`、`sync_legacy_weight_record_after_write`（`AFTER INSERT OR UPDATE ON weight_records`，`20260812100000:83`、`20260812090000:66`）、`sync_legacy_daily_care_preference`、`sync_shared_daily_care_preference_to_legacy` | 同一 transaction 內的回寫可能觸發 canonical 表的 no-op UPDATE；用 `WHEN (OLD.* IS DISTINCT FROM NEW.*)` 擋掉（§4.4） |
| 授權防線 | `enforce_mother_patient_only_access_trigger`（會 `DELETE FROM care_access`） | 這種刪除**要**進 audit，actor 記 `system`（§5.3） |

### 2.2 系統性刪除／清理路徑（不是「有人改」）

| 路徑 | 位置 | 頻率 | 處置 |
| --- | --- | --- | --- |
| 體溫 24 天清理 | `purge_expired_body_temperature_records()`（`20260810100000:161-162`），pg_cron `30 17 * * *`（`:249-253`） | 每天，每筆體溫最終都會被刪一次 | 繞過 audit；否則 24 天保留的儲存量只是搬到 audit 表 |
| 體重每日保留 | `enforce_patient_weight_daily_retention`（同上） | 每次寫入 | 繞過 audit |
| 照護事件照片保留 | `supabase/functions/care-event-photo-retention/index.ts:50`（只 SELECT 列）、`:89`（只刪 Storage 物件） | 每天 | **不寫列**，與本設計無關（已驗證，不是推測） |
| 帳號刪除 | `delete_user_account()`（最新定義 `20260914042410_add_patient_lab_results.sql:266-294`）：以 `recorded_by = email` 刪血壓、體溫、體液、lab 列，再刪 `care_access`／`household_members`／`app_profiles`／`auth.users` | 極少 | 健康列的刪除繞過 audit；授權列的刪除保留（§6.4） |

### 2.3 Edge Function 以 service_role 寫入的表

`grep -rnoE "\.from\('[a-z_]+'\)\s*\.(update|delete|upsert|insert)" supabase/functions`：只有五處，全是通知／OCR 帳本（`notification_deliveries`、`care_due_reminder_deliveries`、`medication_ocr_call_logs`、`personal_notification_outbox`）。**沒有任何 Edge Function 以 service_role 寫入 §3 的病人級表**。`medication-ocr`／`medication-ai-draft` 走 caller-scoped client（受 RLS），寫入時 `auth.uid()` 存在。這讓 §5 的 actor 規則可以很簡單。

### 2.4 既有「只記 uid」的先例

`app_admin_config_audit_log.actor_user_id UUID`，migration 註解原文：「只記 auth.uid()，不記 email：這張表本身也不該變成第二份個資副本」（`20260914110000:26`）。四天前建的 `medication_catalog_change_logs` 卻同時存 `actor_user_id` 與 `actor_email TEXT NOT NULL`（`20260914120000:51-52`）。本設計採前者。兩張表的 `actor_user_id` 都**沒有** FK 到 `auth.users`。

### 2.5 判讀設定表的三種現況

| 表 | 形狀 | 已有歷史？ |
| --- | --- | --- |
| `patient_bp_standards`（`20260922230000`） | 版本化：`effective_from`／`effective_to`（NULL＝現行）、`created_by UUID`、不可變欄位 trigger | **有**——每次改門檻是新增一列並封舊列，表本身就是歷史 |
| `patient_anomaly_alert_settings`（`20260915014457`） | 每病人一列（`patient_id` PK），原地 UPDATE，只有 `updated_at` | 無 |
| `pet_blood_glucose_target_ranges`（`20260907020000`） | 每病人一列，原地 UPDATE，`updated_by TEXT`／`updated_at` | 無（只知最後一次） |

## 3. Q1：哪些表值得 audit——逐表分級

分級標準（依序）：(a) 改了會不會改變**授權或健康判讀**；(b) 現在有沒有等價的異動史；(c) 是不是使用者可從 client 改寫或刪除；(d) 儲存量是否可控。

### Tier A：授權表——INSERT／UPDATE／DELETE 全記，永久保留

| 表 | 為什麼 | 寫入路徑（全是 RPC 或 trigger，無 client DML） |
| --- | --- | --- |
| `care_access` | 病人資料的唯一授權真相（AGENTS.md § 3.4）；能力位 `can_record`／`can_manage_medication`／`can_share_readonly` 的變化就是「誰能改媽媽的資料」的變化 | `approve_caregiver_invitation`、`accept_patient_care_invitation`、`set_household_patient_access`、`remove_household_member`、`auto_provision_profile`、`enforce_mother_patient_only_access` trigger、`delete_user_account`、`bind_care_access_user_id` trigger（只補 `user_id`，UPDATE 會被記為一筆「綁定」，可接受） |
| `household_members` | `role` 是家庭層權限；今天 `DO UPDATE SET role` 零痕跡 | `add_household_member`、`remove_household_member`、`repair_*_household_memberships` migration、`delete_user_account` cascade |
| `patients` | `display_name`、`archived_at`、`care_recipient_type`；封存一個病人等於讓所有紀錄從畫面消失（`archive_household_pet`：`UPDATE patients SET archived_at = NOW()`，最新 `20260914130000:640`） | `add_household_care_recipient`、`archive_household_pet`、`auto_provision_profile` |

**不做**：`household_members` 補 `updated_at`（A7 選項 2 的一部分）。理由：audit 列的 `changed_at` 已經回答「什麼時候」，再加一個只有最後一次的欄位是雙重記帳；UI 若要顯示「角色最後變更時間」，讀 audit 表。

### Tier A′：判讀設定表——INSERT／UPDATE／DELETE 全記，永久保留

| 表 | 判定 |
| --- | --- |
| `patient_anomaly_alert_settings` | **納入**。門檻改了，異常示警（#415）的觸發條件就變了；AGENTS.md § 3.5 明列「會改變健康判讀的警示門檻」為病人層健康資料。一列一病人，儲存量可忽略 |
| `pet_blood_glucose_target_ranges` | **納入**，同上理由。`updated_by TEXT` 只知最後一次 |
| `patient_bp_standards` | **排除**。§2.5：它已經是版本化表，加 audit 是雙重記帳。它反而是「以後新的門檻表該長什麼樣」的範本 |
| `patient_daily_care_preferences`、`user_patient_care_preferences` | **排除**。模組顯示開關不改變健康判讀（AGENTS.md § 3.5 允許純顯示偏好綁帳號） |

### Tier B：數值可改寫的病人級健康表——只記 UPDATE／DELETE，保留 180 天

不記 INSERT 的理由：新增的那一列本身就是紀錄，`recorded_by`／`created_at` 由 `protect_*` trigger 保證不可變；再複製一份進 audit 等於把健康表的儲存量翻倍，卻沒有多回答任何問題。「誰記的」看列本身；「誰改的／誰刪的」看 audit。

| # | 表 | 客戶端可 UPDATE／DELETE？ | 判定與備註 |
| --- | --- | --- | --- |
| 1 | `blood_pressure_records` | 是（`DailyBloodPressureRecords.tsx:143,166`） | 納入。Track A 心臟；警報已送出後把數值改掉是最典型的爭議 |
| 2 | `body_temperature_records` | 是 | 納入。24 天系統清理必須繞過（§6.3） |
| 3 | `patient_weight_measurement_records` | 是 | 納入。三代體重表中**只掛這張 canonical**；`weight_records`、`weight_measurement_records` 是 A5 要退役的 legacy，且由 `sync_legacy_*` trigger 從這張回寫，掛了會一次改動記三筆 |
| 4 | `fluid_balance_records` | 是 | 納入（#656 若決定收掉模組，trigger 隨表一起走） |
| 5 | `meal_records` | 是（policy `FOR ALL`） | 納入 |
| 6 | `meal_record_items` | 是（policy `FOR ALL`） | 納入，但**推測**：若餐次編輯的實作是「刪光子項再重建」，一次編輯會產生 N 筆 DELETE audit；實作票要先 grep `meal_record_items` 的寫入模式，必要時只掛 `meal_records` |
| 7 | `dementia_care_records` | 是 | 納入（同 #4，看 #656） |
| 8–13 | `pet_appetite_records`、`pet_blood_glucose_records`、`pet_digestion_records`、`pet_insulin_records`、`pet_liquid_intake_records`、`pet_subcutaneous_fluid_records` | 是（policy `FOR ALL`） | 納入。胰島素劑量與血糖值是寵物端的「血壓」 |
| 14 | `patient_lab_results` | 是 | 納入。#847 Q5 讓 `care_due_reminders` 用複合 FK 指向它（`ON DELETE SET NULL`）；刪一筆檢驗值會連帶清空提醒的關聯欄位，兩張表各留一筆 audit，可以互相對上 |
| 15 | `care_timeline_entries` | 手動列是（`useTrajectoryEntryEditor.ts`）；系統列被 `prevent_system_generated_timeline_mutation` 擋 | 納入。`medication_change_snapshot` JSONB 是 `medication_plan_change_logs` 的投影，實作時以 TG_ARGV 從快照排除，避免重複存 |
| 16 | `care_due_reminders` | 是 | 納入。#847 delta #5／#6 加的三欄自動進 `after_diff`；`status` 從 active → dismissed 是「誰把提醒關掉」 |
| 17 | `patient_visit_questions` | 是 | 納入。#847 delta #1／#2 之後 `answer` 是「醫師說了什麼」；**誰改了醫師的答案**是本設計必答題 |
| 18 | `medication_intake_logs` | 只有 DELETE policy，無 UPDATE | 納入（實際只會記 DELETE）。取消勾藥就是刪列；「誰把已勾的藥取消」是照護交接爭議。**推測**：取消是否經 RPC 而非直接 DELETE，實作時確認，不影響 trigger 掛法 |

### Tier C：排除（附理由）

| 表 | 排除理由 |
| --- | --- |
| `medication_plans` | 已有 `medication_plan_change_logs`（append-only、immutability trigger、`before_snapshot`／`after` 快照、有 `medicalTrajectory.ts:276` 消費）。雙重記帳 |
| `prn_medication_events`、`prn_medication_daily_assessments` | 事件用 `voided`＋理由軟刪除、「修正則另建新事件」（TECHNICAL.md「每日照護時間語意」）、`prn_medication_event_fields_trigger` 鎖欄位；本身就是 append-only 設計。評估表低爭議，列入觀察名單 |
| `patient_medication_instructions`、`patient_medication_appearance_overrides` | 前者 data-model.md 明寫「`updated_by`／`updated_at` 就是這張表自己的稽核」；後者純外觀。兩者都不改變劑量或判讀 |
| `weight_records`、`weight_measurement_records`、`active_subject_preferences` | A5 legacy；掛了會放大 A5 退役的 revoke／rename 範圍 |
| `medications`、`drug_products`、`tfda_*`、`nhi_tcm_products`、`moa_animal_drugs`、`meal_food_catalog_items` | 跨病人共用目錄，沒有 `patient_id`，無法沿用 `care_access` RLS；目錄已有 `medication_catalog_change_logs`（§7） |
| 四張 delivery 表、`personal_notification_outbox`、`notification_subscriptions` | ADR-007 的狀態機就是它們的歷史 |
| `patient_share_links`、`patient_share_consents`、三張 invitation 表、`legal_consents` | 本身就是同意／授權稽核，有 status 生命週期，撤銷走 RPC 改 status 不刪列 |
| `profiles`、`app_profiles`、`user_settings`、`account_usage_limits`、`app_admin_config` | 帳號層，A3 選項 1 範圍；`app_admin_config` 已有自己的 audit log |
| `households` | 只有名稱；改名不影響授權或判讀 |

**被否決方案（Q1）**

- **A7 選項 2「只補授權表」**：便宜，但回答不了「誰把媽媽的體重改掉」——那才是 A7 推測情境的第一句。而且一旦通用 trigger function 存在，Tier B 的邊際成本是每張表一行 `CREATE TRIGGER`，不值得為了省這幾行留一個「以後再說」。
- **全部 30 張病人級表 INSERT 也記**：儲存量翻倍（§4.3），沒有多回答任何問題。
- **只記 Tier B、不記 Tier A**：`care_access` 是整個 RLS 的根；「誰把看護降成 viewer」的答案缺席時，Tier B 的「誰改了數值」也失去可信基礎（改完數值再把自己移出授權，兩邊都查不到）。

## 4. Q2：粒度與形狀

### 4.1 採用方案：一張通用表 `record_change_logs` ＋ 一支通用 trigger function

```sql
-- 形狀提案（實作票依此寫 migration；本檔不是 migration）
CREATE TABLE record_change_logs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name      TEXT NOT NULL,                     -- TG_TABLE_NAME
  row_id          UUID NOT NULL,                     -- 被改那列的主鍵；複合主鍵表（household_members、care_access）見 4.2
  patient_id      UUID,                              -- 病人層 RLS 分區鍵；household_members 為 NULL。刻意不加 FK（4.4 第 3 點）
  household_id    UUID,                              -- 只有 household_members／patients 會填。刻意不加 FK（同上）
  action          TEXT NOT NULL CHECK (action IN ('insert', 'update', 'delete')),
  actor_kind      TEXT NOT NULL CHECK (actor_kind IN ('user', 'service_role', 'system')),
  actor_user_id   UUID,                              -- auth.uid()；刻意不加 FK（4.4 第 3 點）
  actor_source    TEXT,                              -- 可選：RPC／函式名，由 SET LOCAL app.audit_source 提供
  changed_columns TEXT[],                            -- UPDATE 才有；insert／delete 為 NULL
  before_row      JSONB,                             -- update／delete：to_jsonb(OLD) 剝除 email 型記錄者欄位（5.2）
  after_diff      JSONB,                             -- update：剝除後 NEW 中只含 changed_columns 的值；insert：剝除後完整 NEW
  changed_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at      TIMESTAMPTZ                        -- NULL＝永久（Tier A／A′）；Tier B＝changed_at + 180 天
);
ALTER TABLE record_change_logs ENABLE ROW LEVEL SECURITY;   -- 沒有這行，6.1 的 policy 只是裝飾（Codex review）
CREATE INDEX ON record_change_logs (patient_id, changed_at DESC);
CREATE INDEX ON record_change_logs (table_name, row_id);
CREATE INDEX ON record_change_logs (expires_at) WHERE expires_at IS NOT NULL;
```

**整張表沒有任何外鍵**——`actor_user_id`、`patient_id`、`household_id` 都只是識別值，不是關聯。理由統一寫在 4.4 第 3 點：任何 `ON DELETE CASCADE`／`SET NULL` 都會對這張不可變的表發 UPDATE／DELETE，被 immutability trigger 擋下，反過來讓父列的刪除失敗。

一支 `log_record_change()`（`SECURITY DEFINER`、`SET search_path = public`），用 `to_jsonb(OLD)`／`to_jsonb(NEW)` 取列、`TG_TABLE_NAME` 取表名、`TG_ARGV[0]` 取保留類別（`permanent`｜`health`）、`TG_ARGV[1]`（可選）取要從快照排除的欄位清單。每張表一行：

```sql
-- Tier A／A′
CREATE TRIGGER audit_record_change AFTER INSERT OR UPDATE OR DELETE ON care_access
  FOR EACH ROW EXECUTE FUNCTION log_record_change('permanent');
-- Tier B（WHEN 子句擋掉 no-op UPDATE，見 4.4）
CREATE TRIGGER audit_record_change AFTER UPDATE OR DELETE ON blood_pressure_records
  FOR EACH ROW WHEN (TG_OP = 'DELETE' OR OLD.* IS DISTINCT FROM NEW.*)
  EXECUTE FUNCTION log_record_change('health');
```

> 註：`WHEN` 子句不能直接引用 `TG_OP`；實作時拆成兩個 trigger（`AFTER UPDATE … WHEN (OLD.* IS DISTINCT FROM NEW.*)` 與 `AFTER DELETE`），或在函式內第一行判斷。這是實作細節，不改變設計。

### 4.2 為什麼是「before 全列 ＋ after 只存 diff」

| 形狀 | 每筆 UPDATE 約佔（見 4.3） | 能回答 | 缺點 |
| --- | ---: | --- | --- |
| before 全列 ＋ after 全列 | 0.45 KB ＋ 2R | 全部 | 儲存量最大；after 全列在 DELETE 時為空、在 UPDATE 時 90% 與 before 重複 |
| **before 全列 ＋ after diff（採用）** | **0.45 KB ＋ R ＋ ~0.1 KB** | 「改之前整列長什麼樣」（可還原）、「改了哪幾格、改成什麼」 | 要看「改之後整列」必須 before ⊕ diff 自己合；讀取層做一次即可 |
| before diff ＋ after diff | 0.45 KB ＋ ~0.2 KB | 「哪幾格從什麼變什麼」 | DELETE 仍需 before 全列（兩套路徑）；連續多次改動後要重建某一時刻整列得從頭 replay |
| 每表各自具名欄位的 log 表 | 同第一種 | 同第一種，且可加 CHECK | 19 張表 × schema 漂移：#847 每加一欄就要改一張 log 表；正是 A7 推測「再長出第五、六張各自為政的 log 表」 |

`row_id` 對複合主鍵表的處理：`household_members(household_id, user_id)` 與 `care_access(user_id, patient_id)` 沒有單欄 UUID 主鍵。**採用**：`row_id` 存 `user_id`（兩張表都有），配合 `household_id`／`patient_id` 欄位即可唯一定位；`before_row` 內本來就有完整鍵。**否決**：給兩張表補 surrogate `id`——為了 audit 改授權表主鍵是本末倒置，且動到 F-5 剛建的 `(user_id, patient_id)` 唯一約束。

### 4.3 儲存量估算（只用 schema 推算，未讀任何真實資料）

**單列 JSONB 大小 R**（`to_jsonb(row)`：欄位名 ＋ 值 ＋ JSONB 結構開銷約 1.2×；UUID 以 36 字元、timestamptz 以 25 字元計）：

| 表群 | 欄位數（含後續 ALTER） | R 估計 |
| --- | ---: | ---: |
| 血壓、體溫、體重、體液、餐次（主表）、失智、六張寵物表 | 8–12（含 `notes` 短文字） | 0.4–0.6 KB |
| `patient_lab_results` | 14 | ~0.6 KB |
| `care_due_reminders`（＋#847 三欄） | 16 | ~0.7 KB |
| `patient_visit_questions`（＋#847 四欄，`question`／`answer` 自由文字） | 15 | 0.6–1.5 KB |
| `care_timeline_entries`（`details` 自由文字、`photo_paths`；`medication_change_snapshot` 排除） | ~12 | 0.5–3 KB |
| `care_access`、`household_members`、`patients`、兩張設定表 | 4–9 | 0.2–0.4 KB |

**每筆 audit 列的固定開銷**：tuple header ＋ 11 個自身欄位 ＋ 3 個索引項 ≈ **0.45 KB**。所以一筆 Tier B UPDATE ≈ 0.45 ＋ R ＋ 0.1 ≈ **1 KB**（以 R = 0.5 KB 計）；DELETE ≈ 0.95 KB；Tier A 一筆 ≈ 0.7 KB。

**頻率是推測**（無法從 repo 得知真實編輯率；以下是設計用的上下界）：

| 情境 | 每日 UPDATE／DELETE 筆數 | 每年新增 | 180 天保留下的穩態 |
| --- | ---: | ---: | ---: |
| 目前單一家庭，偶爾修錯字 | 5 | 1.8 MB | 0.9 MB |
| 單一家庭，高頻修改 | 20 | 7.3 MB | 3.6 MB |
| 100 個家庭 × 5 | 500 | 183 MB | 90 MB |
| 100 個家庭 × 20 | 2,000 | 730 MB | 360 MB |

對照 Supabase Free plan 資料庫上限（公開定價為 500 MB，**repo 外資訊，實作票要再確認當時額度**）：單一家庭在任何形狀下都不是問題；差別出現在多家庭。三個結論：

1. **保留期限才是槓桿，不是 diff 與否**。全列＋diff 與純 diff 的差距是 1.5× 以內；180 天 vs 永久的差距是無上限 vs 有上限。
2. **系統清理必須繞過**。體溫每筆最終都會被 24 天清理刪掉（每人每天最多 24 筆，`enforce_daily_body_temperature_limit`）；若記進 audit，等於把 24 天保留期改成 180 天，而且是以 2 倍大小（audit 開銷）存。體重每日保留同理。
3. Tier A／A′ 永久保留的量級：授權變更以「次」計，一個家庭一年不會超過幾十筆；可以忽略。

### 4.4 實作時必踩的三個坑（先寫在這裡，避免實作票重新發現）

1. **legacy 同步的回寫會觸發 no-op UPDATE**：`weight_records` 的 `sync_legacy_*` trigger 在 `AFTER INSERT OR UPDATE` 時寫 `patient_weight_measurement_records`；若 canonical 表的 audit trigger 沒有 `WHEN (OLD.* IS DISTINCT FROM NEW.*)`，一次體重修改可能記兩筆（一筆真改、一筆同值回寫）。`rls-authorization.sql` 要有「改一次體重只產生一筆 audit」的案例。
2. **AFTER trigger 的 `NEW` 是所有 BEFORE trigger 跑完的結果**：#847 delta #2 的 `answered_at` BEFORE UPDATE trigger 補的值會出現在 `after_diff`，這是**正確**行為（audit 記的是最終落地的列）；但 `changed_columns` 會多出 `answered_at`，讀取層顯示時要能區分「使用者改的」與「系統推導的」欄位。最簡單的做法是讀取層維護一份「推導欄位」清單（`answered_at`、`updated_at`、`care_date`），不在資料庫層處理。
3. **整張表不加任何 FK（`actor_user_id`、`patient_id`、`household_id` 都不加）**。三個欄位的問題同源：FK 的 `ON DELETE SET NULL`／`CASCADE` 會對 audit 表執行 UPDATE／DELETE，被 immutability trigger 擋下，父列的刪除因此失敗——`actor_user_id` 加 FK 會讓 `delete_user_account` 失敗；`patient_id`／`household_id` 加 `CASCADE` 會讓刪病人／刪家庭失敗，而且 `patients` 的 `AFTER DELETE` audit trigger 還會試圖插入一筆指向已刪病人的列，撞 FK（Codex review）。`app_admin_config_audit_log`／`medication_catalog_change_logs` 的 `actor_user_id` 都沒有 FK，是同一個理由（雖然它們的 migration 沒寫出來）。dangling uid 由讀取層解析成「已刪除的帳號」；dangling `patient_id`／`household_id` 的孤兒列由 purge 清理（6.3）。今天 `patients` 實際上不會被硬刪（`care_access.patient_id` 是 `ON DELETE RESTRICT`，`archive_household_pet` 只設 `archived_at`），但設計不能靠這個巧合。

**被否決方案（Q2）**

- **每表各自 log**：見 4.2 表；主要是 schema 漂移成本與「第五張 log 表」的預言自我實現。
- **只記 diff**：DELETE 仍要全列，兩套路徑；replay 成本。
- **`pgaudit` 擴充或 PostgREST 存取日誌**：記的是 SQL 語句不是列值，無法用 `patient_id` 做 RLS，也不在 Supabase Free 的可控範圍；且它是「誰讀過」的工具，不是本題。
- **Supabase Realtime／Webhook 把變更送到外部 log**：把健康資料送出資料庫邊界，違反 ADR-002「不讓 CI／外部長期擁有解密歷史健康資料的能力」的精神，且多一個要監控的 dead-man。

## 5. Q3：actor 身分

### 5.1 採用方案：只記 `auth.uid()`，不記 email；三種 `actor_kind`

```text
IF current_setting('app.audit_actor_kind', true) = 'system'   → actor_kind = 'system',       actor_user_id = NULL
   -- 可信覆寫：只有 migration 內定義的 SECURITY DEFINER 函式／trigger 會 SET LOCAL 它；
   -- client 經 PostgREST 沒有執行任意 SQL 的路徑，設不了這個 GUC（Codex review）
ELSIF auth.uid() IS NOT NULL                                  → actor_kind = 'user',         actor_user_id = auth.uid()
ELSIF (current_setting('request.jwt.claims', true)::jsonb ->> 'role') = 'service_role'
                                                              → actor_kind = 'service_role', actor_user_id = NULL
ELSE  -- pg_cron、migration、沒有 request context 的 trigger 連鎖
                                                              → actor_kind = 'system',       actor_user_id = NULL
actor_source = current_setting('app.audit_source', true)      -- 可為 NULL；RPC／清理函式可 SET LOCAL 標記自己
```

**為什麼需要第一行的覆寫**：`SECURITY DEFINER` 函式與 trigger 都在呼叫者的 session 裡跑，`auth.uid()` 全程存在。`enforce_mother_patient_only_access` 在使用者寫入 `care_access` 時順便 `DELETE` 掉其他病人的授權——那筆 DELETE 的「決定者」是系統規則，不是觸發它的使用者；沒有覆寫就會記成 `user`，稽核說謊。規則：**只有「不是這個 session 的人決定的」寫入才設 `system`**；使用者自己呼叫的 RPC（含 `delete_user_account`，6.4）如實記 `user`。

**為什麼今天就能記 uid，不需要等 A3**：A7 原文寫「`recorded_by` TEXT 若不先做 A3 選項 2，actor 只能記 JWT email 快照」——那句話混淆了兩件事。`recorded_by` TEXT 是**列上的原始記錄者**欄位；audit 的 actor 是**發出這次 UPDATE／DELETE 的 session**。F-5 四單位完成後，`care_access.user_id NOT NULL`（`20260914130000`）、101 條下游 policy 都認 `auth.uid()`（`20260915100000`），任何能通過 RLS 寫入病人表的 session 都必然有 `auth.uid()`。trigger 內呼叫 `auth.uid()` 讀的是同一個 `request.jwt.claims`（`bind_care_access_user_id_trigger` 就是這樣做的，`20260913160242:101-113`）。

**A3 之後不需重寫的證明**：

- A3 選項 1（帳號層改 uid）：不碰本表。
- A3 選項 2（健康表補 `recorded_by_user_id`）：新欄位會自動出現在 `to_jsonb(OLD)`，`before_row` 從此多一個 uid 欄；`recorded_by` TEXT 被降級為顯示快照後，本設計的 email 剝除清單（5.2）仍然適用。**零改動，只會變好**。
- 若 A3 最終選擇把 `recorded_by` TEXT 整個 drop：剝除清單裡多一個不存在的鍵，`jsonb - text[]` 對不存在的鍵是 no-op。

### 5.2 快照裡的 email 型記錄者欄位一律剝除——OLD 與 NEW 都剝，再算 diff

```text
v_strip    := ARRAY['recorded_by', 'created_by', 'administered_by', 'updated_by', 'created_by_email', 'profile_email', 'account_email']
v_old      := to_jsonb(OLD) - v_strip        -- update／delete
v_new      := to_jsonb(NEW) - v_strip        -- insert／update
before_row := v_old
after_diff := insert → v_new；update → v_new 中「值與 v_old 不同」的鍵（changed_columns 也從剝除後的兩份算）
```

順序很重要：**先剝再 diff**。若只剝 `before_row`（本檔第一版的寫法），`care_access` 的 INSERT 會把 `profile_email` 原封不動抄進 `after_diff`，`pet_blood_glucose_target_ranges` 的 UPDATE 會抄進 `updated_by`，「audit 表零 email」的承諾就破了，帳號刪除後 email 也還留在表裡（Codex review）。清單以 A3 盤點的 22 個 TEXT 記錄者欄位為準，實作時 grep 確認。理由：

- 沿用 `app_admin_config_audit_log` 的「不成為第二份個資副本」（§2.4）。
- `delete_user_account` 不必去 JSONB 裡面清 email；帳號刪除後 audit 表裡沒有任何可識別該帳號的字串，只有 dangling uid（§6.4）。
- 代價：DELETE 一筆血壓時，「被刪的那筆原本是誰記的」在只有 TEXT 記錄者的表上會遺失；三張已有 `*_user_id` 的表（`blood_pressure_records`、`prn_medication_events`、`medication_plan_change_logs`）不受影響，A3 選項 2 落地後全部不受影響。這個代價是刻意換取「audit 表零 email」。

### 5.3 三種寫入者各記什麼

| 寫入者 | `actor_kind` | `actor_user_id` | `actor_source` | 例子 |
| --- | --- | --- | --- | --- |
| 登入使用者直接 DML 或呼叫 `SECURITY DEFINER` RPC（含 `delete_user_account`） | `user` | `auth.uid()`（RPC 內 `auth.uid()` 仍是呼叫者，不是 owner） | RPC 可選擇 `SET LOCAL app.audit_source = 'set_household_patient_access'` | 改血壓、降 viewer、封存寵物、刪自己的帳號 |
| Edge Function 以 service_role 寫入 | `service_role` | NULL | Function 可選擇設定 | §2.3：**今天沒有這種寫入病人表的路徑**；規則是為未來準備 |
| pg_cron、migration（沒有 request context，自動落入 `system`） | `system` | NULL | 清理函式**必須**設定（讓「系統刪的」與「不知道誰刪的」可區分） | 體溫 24 天清理（實際上 bypass，不會有列） |
| 使用者的寫入順便觸發的系統決定：`enforce_mother_patient_only_access` trigger 內的 DELETE、未來同類的規則 trigger | `system`（**必須 `SET LOCAL app.audit_actor_kind = 'system'` 覆寫**，因為 `auth.uid()` 此時仍存在） | NULL | **必須**設定 trigger／函式名 | `enforce_mother_patient_only_access` 撤銷授權 |

**被否決方案（Q3）**

- **記 JWT email 快照（A7 原文的過渡方案）**：讓 audit 表變成第 23 個 email 記錄者欄位，A3 之後還要多清一張表；且使用者換 Google 帳號 email 後歷史分裂（A3 推測情境）。
- **actor 記列上的 `recorded_by`**：那是原始記錄者，不是改動者；兩者混淆正是 AGENTS.md § 3.5「`recorded_by` 只表示誰操作，不能表示數值屬於誰」要避免的同類錯誤。
- **`actor_user_id` 加 FK `ON DELETE SET NULL`**：見 4.4 第 3 點，會讓刪帳號失敗。
- **要求每支 RPC 都傳 `actor_source`**：42 處 `DELETE FROM care_access` 逐支改是 A2（單一 membership 解析點）的工作；本設計只要求清理函式與規則 trigger 必設，其餘可選。
- **只靠 `auth.uid()` 判 `user`／`system`、不做覆寫（本檔第一版）**：`SECURITY DEFINER` 函式與 trigger 在呼叫者 session 內跑，`auth.uid()` 全程存在，規則 trigger 的系統撤銷會被記成觸發它的使用者做的（Codex review）。
- **`delete_user_account` 記成 `system`（本檔第一版 6.4 的寫法）**：刪帳號的人就是操作者，記 `system` 是把「她自己刪的」改寫成「系統刪的」；如實記 `user`＋dangling uid，讀取層顯示「已刪除的帳號」，資訊更準確。

## 6. Q4：RLS、隱私、保留期限、帳號刪除、備份

### 6.1 讀取 RLS：兩條 SELECT policy，`TO authenticated`

```sql
ALTER TABLE record_change_logs ENABLE ROW LEVEL SECURITY;  -- 先開，否則下面兩條 policy 不會被評估
-- 病人層列：能在該病人身上「寫」的人才能看誰改過
CREATE POLICY "carers read patient record change logs" ON record_change_logs FOR SELECT TO authenticated
  USING (patient_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM care_access access
    WHERE access.user_id = auth.uid() AND access.patient_id = record_change_logs.patient_id AND access.can_record));
-- 家庭層列（household_members 的變更）：只有 owner
CREATE POLICY "household owners read membership change logs" ON record_change_logs FOR SELECT TO authenticated
  USING (household_id IS NOT NULL AND patient_id IS NULL AND EXISTS (
    SELECT 1 FROM household_members m
    WHERE m.user_id = auth.uid() AND m.household_id = record_change_logs.household_id AND m.role = 'owner'));
```

- **RLS 必須明確 `ENABLE`**：Postgres 在 RLS 未啟用時忽略所有 policy；§8 的讀取層要求 `GRANT SELECT … TO authenticated`，若漏掉 `ENABLE`，任何登入者都能整表讀到 JSONB 快照（Codex review，P1）。`rls-authorization.sql` 要有「與該病人毫無 `care_access` 關係的登入者 `SELECT` 為零列」的案例，這條案例同時驗證 policy 與 `ENABLE` 兩件事。
- **viewer 看不到**（`can_record = false`、或只有 `can_share_readonly`）。理由：audit 列的核心內容是「另一個照護者的 uid 在什麼時候改了什麼」，這是第三人的個資；viewer 拿到的是現行真相，不是爭議紀錄。只要一條 `can_record` 述詞就把 §1.1 兩個爭議情境的當事人（會寫的人）都涵蓋。
- **`patients` 表的變更同時填 `patient_id` 與 `household_id`**，兩條 policy 任一命中即可讀：封存病人是家庭 owner 的操作，但該病人的照護者也該知道「病人被封存了」。
- **沒有 INSERT／UPDATE／DELETE policy，也 `REVOKE INSERT, UPDATE, DELETE … FROM authenticated, anon`**；唯一寫入者是 `SECURITY DEFINER` 的 `log_record_change()`（owner 為 postgres，繞過 RLS）。這跟 `blood_pressure_notification_deliveries` 第二階段「RPC 成為唯一寫入入口」（#773）是同一種收法。
- **immutability trigger**：`BEFORE UPDATE OR DELETE ON record_change_logs` 一律 `RAISE EXCEPTION 'record_change_logs_are_immutable'`，除非 `current_setting('app.audit_bypass', true) = 'on'`（只有 6.3 的 purge 會設）。範本：`prevent_medication_plan_change_log_mutation`。
- **A2 的兩軌在此交會**：這是全 repo 第一張同時需要 `care_access` 與 `household_members.role` 兩條 policy 的表。不是因為設計想要，而是 `household_members` 本身沒有 `patient_id`。若 A2 選項 2（單一 membership 解析點）先落地，第二條 policy 改呼叫該解析函式即可，不改本設計。

### 6.2 隱私邊界

- audit 表含健康數值（`before_row`），適用與來源表**相同**的：健康資料同意版本（`legal_consents.health_consent_version`）、`care_access` 授權、ADR-002 備份加密。它不引入新的資料類別，只是舊值多留一段時間。
- **不進 `/share` 摘要**：#655 的 DTO 白名單測試（`q4-2026-outcome-compression.md` 成果 2 第 2 項）必須斷言 `record_change_logs` 不在 `get_patient_share_summary` 讀取的表裡；分享對象是「醫師／外地手足」，看現況，不看誰改過。
- 快照零 email（5.2）；`actor_user_id` 是 Supabase 內部 uid，不是對外識別。

### 6.3 保留期限與清理

| 類別 | `expires_at` | 理由 |
| --- | --- | --- |
| Tier A（授權）、Tier A′（判讀設定） | NULL（永久） | 量級以「次」計；「半年前是誰把她加進來的」仍需可答 |
| Tier B（健康數值） | `changed_at + 180 天` | 比體溫 24 天、照片保留期長；涵蓋一到兩個回診間隔（回診通常 1–3 個月，**推測**），讓「上次回診後誰改過」可答；比永久短，讓多家庭情境的儲存量有上限（4.3）。**數字由 owner 調整，寫成 trigger 的參數而不是常數** |

清理：`purge_expired_record_change_logs()` 一支函式（`SET LOCAL app.audit_bypass = 'on'` 後 `DELETE … WHERE expires_at < now()`，**同一支函式一併刪除孤兒列**：`patient_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM patients WHERE id = patient_id)`，`household_id` 同理——因為表上沒有 FK（4.4 第 3 點），父列硬刪後的 audit 列沒有任何 policy 能讀到它，留著只是無人可讀的健康快照），以 pg_cron 每日執行，**寫法與 guard 完全比照** `purge_expired_body_temperature_records`（`20260810100000:240-260`：擴充不存在時不阻斷 migration），並在 [`docs/operations/cron-inventory.md`](../operations/cron-inventory.md) 新增一列（它是 migration 內 pg_cron，不是 Dashboard Cron）。

**系統清理繞過 audit**（4.3 結論 2）：`purge_expired_body_temperature_records()`、`enforce_patient_weight_daily_retention()` 在函式開頭 `PERFORM set_config('app.audit_bypass', 'on', true)`（transaction-local），結尾設回 `'off'`。`log_record_change()` 第一行檢查此 GUC，`'on'` 就 `RETURN NULL`。這兩支是**全部**需要繞過的既有路徑（§2.2）；新增清理路徑時比照。

### 6.4 帳號刪除（`delete_user_account`）

現行函式（`20260914042410:266-294`）分兩段：先以 `recorded_by = email` 刪四張健康表的列，再刪 `care_access`／`household_members`／`app_profiles`／`auth.users`。本設計的處置：

1. **健康列的刪除段落設 `app.audit_bypass = 'on'`**：這些是被刪帳號自己記的紀錄，記一筆「system 刪了一筆血壓、before_row 含數值」等於把要被抹除的資料換個地方留 180 天。
2. **授權列的刪除段落不繞過**（設回 `'off'`，並 `SET LOCAL app.audit_source = 'delete_user_account'`）：`care_access`／`household_members` 的 DELETE（含 `auth.users` cascade）**如實記為 `user`**——`auth.uid()` 在這支 `SECURITY DEFINER` 函式內全程存在，而且刪帳號的人確實就是操作者，記成 `system` 反而是說謊（本檔第一版寫 `system`，Codex review 指出做不到；改為 `user` 之後更準確）。`before_row` 因 5.2 剝除了 `profile_email`，只剩 `patient_id`、dangling `user_id`、能力位。家庭 owner 因此能回答「為什麼看護的權限不見了 → 她自己刪了帳號」（`actor_source` 說明原因），而被刪帳號在資料庫裡不再有任何可識別字串。
3. **`actor_user_id` 因無 FK 而 dangling**，不需要額外 UPDATE；讀取層對解析不到 `app_profiles` 的 uid 顯示「已刪除的帳號」。

這一條與 A5 選項 2「`delete_user_account` 資料驅動化」相容：資料驅動化之後，繞過與否是每張表的一個旗標。

### 6.5 備份邊界（ADR-002）

- 邏輯備份自動涵蓋新表；ADR-002 已否決「每張表硬編 core count 清單」，本設計不新增任何清單。
- 還原演練的 RLS invariants 補一條 negative case：viewer 帳號 `SELECT record_change_logs` 必須為零列。
- 備份內容多了 `before_row` 快照；加密邊界、`_SUCCESS` 封條、ephemeral key 全部不變。**無法在本設計驗證的部分**：`database-backup-staging` 實機驗收狀態（ADR-002 狀態欄仍寫「待實機驗收」）。

**被否決方案（Q4）**

- **任何有 `care_access` 列的人（含 viewer）都能讀**：把其他照護者的操作紀錄暴露給只讀者；且 `/share` 的 Stage 0 法遵清單（#424）正在為「只讀分享」定義最小欄位，audit 明顯不在其中。
- **只有 household owner 能讀病人層 audit**：看護（caregiver）常常是唯一在場、需要證明「不是我改的」的人；把她排除等於讓 audit 只服務雇主。
- **永久保留全部**：4.3 表最後一列；且健康值舊快照是額外的個資暴露面，沒有需求支持無限期。
- **30 天保留**：短於回診間隔，「上次回診後誰改過」答不出來。
- **audit 也記進 `delete_user_account` 的健康列刪除**：抹除請求無法乾淨完成（A3 推測情境的同類問題）。
- **加 `actor_user_id` FK**：4.4 第 3 點。

## 7. Q5：與既有四張 change-log 表的關係

| 表 | 範圍鍵 | 讀者 | 處置 | 理由 |
| --- | --- | --- | --- | --- |
| `medication_plan_change_logs` | `patient_id` | `src/lib/medicalTrajectory.ts:276`、`src/lib/medication/medications.ts`、`care_timeline_entries` 一對一投影（FK `medication_plan_change_log_id`）；#847 Q1 以它的 `id` 作為 `source_entity_id` | **保留，不併入** | 它是**領域事件**（`action`＝create／update／deactivate、`effective_at`、`reason`），通用 diff 表達不出「這是一次調藥」；且 #847 已核准的設計依賴它的 `id`。`medication_plans` 不掛通用 trigger（§3 Tier C） |
| `app_admin_config_audit_log` | 無（全站） | 設計上只有 service_role | **保留，不併入** | 帳號／平台層，沒有 `patient_id`，無法沿用本設計的兩條 policy；它已是「只記 uid」的正確形狀 |
| `medication_catalog_change_logs` | `medication_id`（跨病人目錄） | **無人讀取**（`src/`／`api/`／Function 皆無） | **保留，不併入；「無人讀取」另開 follow-up、不在本設計** | 目錄是跨病人共用資料，RLS 語意是「目錄管理員」不是 `care_access`；併入會讓通用表出現第三種 policy。無人讀取是「缺讀取端」問題，不是「表不該存在」——curator RPC（`20260915120000`）每次 merge／adopt 都在寫它，砍掉等於砍掉目錄的爭議紀錄 |
| `account_entitlement_change_logs` | `target_email`（帳號層） | **無人讀取** | **保留，不併入；隨 A3 選項 1 改 uid** | 帳號層；A3 選項 1 的處置已寫明「加 `user_id`」。與病人層 audit 併表會把「誰付費」和「誰改血壓」放進同一張表、同一組 policy |

**新表規則（給未來的 migration 作者）**：病人級表（有 `patient_id`）預設掛 `log_record_change()`，**不得**新開 bespoke log 表，除非它要表達通用 diff 表達不出的領域語意（例如 `effective_at`、`reason` 列舉、與另一張表的一對一投影）——`medication_plan_change_logs` 是唯一符合這個例外的既有案例。帳號層與全站層的 log 各自維持，不併入病人層 audit。

**被否決方案（Q5）**

- **A7 選項 3「統一四張為一張」**：四張表的範圍鍵分別是病人、目錄、帳號、全站，RLS 主體各不相同；合併後一張表要四組 policy，reviewer 逐條看的成本比四張表更高（A7 原文的取捨欄已指出）。
- **退役兩張無人讀取的表**：它們無人讀是缺讀取端，不是缺寫入需求；退役等於在目錄與 entitlement 兩條已經有稽核的路徑上**倒退**成零稽核。
- **把 `medication_plans` 也掛通用 trigger、之後再退役 `medication_plan_change_logs`**：破壞 #847 已核准的 `source_entity_id` 對應與時間線一對一投影。

## 8. Q6：讀取端

### 8.1 本期：只做資料層 ＋ 一支型別化讀取函式，不做 UI

- `src/lib/database.types.ts` 補 `record_change_logs`（走 A6 的產生流程，`docs/architecture/data-model.md`「database.types.ts 產生流程」）。
- `src/lib/recordChangeHistory.ts`（`[Sonnet]`）：`fetchRecordChangeHistory({ patientId, tableName, rowId })` 與 `fetchRecentPatientChanges({ patientId, days })`，直接 `supabase.from('record_change_logs')`（RLS 把關，不需要 RPC）；把 `before_row ⊕ after_diff` 合成「改後整列」、把 4.4 第 2 點的推導欄位從 `changed_columns` 過濾、把 `actor_user_id` 解析成顯示名稱（見 8.2）。附單元測試。
- **不做**任何頁面、按鈕或三語文案。理由：`q4-2026-outcome-compression.md` §3 三個成果沒有它；AGENTS.md § 3.6 三語規則讓每一個 UI 觸點都是完整交付單位，不該與資料層綁在同一張票。

### 8.2 未來最小讀取入口（`[Sonnet]`，2027-Q1，需 owner 另核）

- **紀錄層級**：既有編輯入口（`DailyBloodPressureRecords.tsx` 的編輯／刪除、`useTrajectoryEntryEditor.ts`、回診問題清單）各加一個「異動歷史」抽屜，讀 `fetchRecordChangeHistory`。這直接回答「誰把媽媽的體重改掉」，不需要新頁面。
- **病人層級**：設定頁一個「最近 30 天異動」清單，讀 `fetchRecentPatientChanges`；只對 `can_record` 顯示。
- **actor 顯示名稱**：`app_profiles(user_id PK, display_name)` 可依 uid 解析；**無法在本設計驗證**：照護者能否讀到同病人其他照護者的 `app_profiles` 列（RLS）。若不能，改用 `fetch_household_members` RPC 已回傳的成員身分做對照；解析不到的 uid 顯示「已刪除的帳號」（三語）。
- **系統列顯示**：`actor_kind = 'system'` ＋ `actor_source` 顯示為「系統（自動清理）」「系統（帳號刪除）」等，不顯示成空白。

### 8.3 與 #655（分享摘要）的關係

- **本期與可見未來都不進 `/share`**（6.2）。
- A7 原文提到「#655 若要顯示『最近誰改了什麼』依賴本項」：那個「誰」對外部分享對象沒有意義（他們不認識照護者），對登入家屬才有意義。因此「最近誰改了什麼」是 8.2 的病人層清單，不是 #655 的 DTO 欄位。若 owner 之後仍要在分享頁顯示「這份摘要的資料最後更新於 X」，那只需要 `MAX(changed_at)` 一個時間戳，且應由 `get_patient_share_summary` 在 RPC 內算，不把 audit 列送出去。

**被否決方案（Q6）**

- **本期一併做 UI**：三語＋兩種入口＋actor 顯示的 RLS 未知，是獨立可審查的交付單位；與 migration 綁在一起會讓 `[Opus / Astra]` 票膨脹成跨 layer。
- **用 `SECURITY DEFINER` RPC 讀 audit**：RLS 兩條 policy 已足夠，RPC 只會多一個要 REVOKE／GRANT 的面。
- **把 audit 投影成 `care_timeline_entries` 新事件類型**：ADR-005 已否決「時間線記還沒解決的問題」，同理它也不該記「誰改了數值」——時間線是照護事件，不是系統稽核。

## 9. 已知事實／推測／無法驗證

| 類別 | 內容 |
| --- | --- |
| **已知事實** | §1.1、§2 全部項目均由本 session 直接 grep／開檔核對，附路徑與行號；Edge Function 沒有 service_role 寫入病人表（§2.3）；`care-event-photo-retention` 不寫列（§2.2）；`patient_bp_standards` 已版本化（§2.5）；`app_admin_config_audit_log` 與 `medication_catalog_change_logs` 的 `actor_user_id` 無 FK（§2.4）；#847 六題已核准（issue 留言）。 |
| **推測** | 4.3 的每日 UPDATE／DELETE 筆數（無真實數據，只給上下界）；180 天保留的「涵蓋一到兩個回診間隔」；`meal_record_items` 的編輯是否為「刪光重建」（§3 Tier B #6）；`medication_intake_logs` 取消勾藥是否直接 DELETE（#18）；`app_profiles` 跨照護者可讀性（8.2）。 |
| **無法驗證** | staging／production 的真實資料量與編輯頻率（本設計不連線）；Supabase Free plan 當下的資料庫額度（repo 外）；ADR-002 的 `database-backup-staging` 是否已完成實機驗收；pg_cron 擴充在 production 是否啟用（`20260810100000` 的 guard 就是為此存在，本設計沿用同一 guard）。 |

## 10. 實作票切分與依賴圖（owner 2026-09-26 核准後開票，票號見本節末）

```text
ADR-008 核准（owner，#910）
    │
    ├──► AUDIT-1 [Opus / Astra]：record_change_logs 表（無任何 FK）、ENABLE ROW LEVEL SECURITY、
    │      log_record_change()（app.audit_actor_kind 覆寫優先於 auth.uid()；OLD／NEW 先剝 email 再 diff）、
    │      immutability trigger、REVOKE 與兩條 SELECT policy、Tier A＋A′ 五張表掛 AFTER INSERT OR UPDATE OR DELETE、
    │      enforce_mother_patient_only_access 加 actor_kind 覆寫、delete_user_account 的兩段 bypass／source、
    │      rls-authorization.sql 正負向案例（無關登入者零列、viewer 零列、caregiver 可讀、
    │        household owner 讀得到 membership 列但讀不到別家的、authenticated 直接 INSERT／UPDATE／DELETE 被拒、
    │        刪帳號不失敗且事後表內無 email、care_access INSERT 的 after_diff 不含 profile_email、
    │        規則 trigger 的撤銷記為 system 而非觸發者）、database.types.ts、ADR-002 還原演練 invariant 補一條
    │        │
    │        ├──► AUDIT-2 [Opus / Astra]：Tier B 18 張健康表掛 AFTER UPDATE／AFTER DELETE（WHEN 子句）、
    │        │      care_timeline_entries 以 TG_ARGV 排除 medication_change_snapshot、
    │        │      purge_expired_body_temperature_records／enforce_patient_weight_daily_retention 加 bypass、
    │        │      expires_at ＋ purge_expired_record_change_logs()（含孤兒列清理）＋ pg_cron（比照 20260810100000 的 guard）、
    │        │      cron-inventory.md 新增一列、「改一次體重只產生一筆 audit」與「體溫清理零 audit」案例、
    │        │      seed-staging.ts 重播不受影響（它會 UPDATE 嗎？實作時確認）
    │        │
    │        └──► AUDIT-3 [Sonnet]：src/lib/recordChangeHistory.ts（before ⊕ diff 合成、推導欄位過濾、
    │               actor 解析含「已刪除的帳號」）＋ 單元測試；不做 UI
    │                 │
    │                 └──► AUDIT-4 [Sonnet]（2027-Q1，需 owner 另核；本季 defer）：
    │                        紀錄詳情「異動歷史」抽屜 ＋ 設定頁「最近 30 天異動」，三語
    │
    ├─ 獨立：A3 選項 1／2（不阻塞、不被阻塞；選項 2 落地後 before_row 自動多 recorded_by_user_id）
    ├─ 獨立：#847 delta #1／#2／#5／#6（trigger 欄位無關；**建議 AUDIT-2 排在它們之後**，
    │         純粹避免兩張票同時改 rls-authorization.sql 同一段落——工程協調，不是技術依賴）
    ├─ 獨立：A5 legacy 退役（Tier B 已排除兩張 legacy 體重表；A5 (c) drop 時不需動本設計）
    ├─ 獨立：A2 單一 membership 解析點（落地後 6.1 第二條 policy 可改呼叫它；不改本設計）
    └─ Follow-up（不屬本設計，owner 決定要不要開）：medication_catalog_change_logs 與
         account_entitlement_change_logs 的讀取端；後者隨 A3 選項 1 改 uid
```

拆分原則：AUDIT-1 與 AUDIT-2 都是 migration／RLS（AGENTS.md § 5 高風險），拆開是因為 Tier A 五張表的爭議價值最高、diff 最小、可以先合併驗證整套機制；Tier B 18 張表加清理排程是第二批，失敗時回滾範圍不會波及授權表的 audit。AUDIT-3 是純 TypeScript 讀取層，`[Sonnet]` 即可。**不拆更細**：`log_record_change()` 與 immutability trigger、RLS 是同一個安全邊界，拆開會出現「表存在但沒有 RLS」的中間狀態。

**已開立（2026-09-26）**：AUDIT-1 #967、AUDIT-2 #968、AUDIT-3 #969。AUDIT-4（UI）依 owner 決定延到 2027-Q1，未開票；兩張舊 change-log 表的讀取端 follow-up 依 owner 決定不開。

## 11. 驗證方式

本文件本身不需要程式碼驗證。核准後的實作票最小驗證沿用 `care-loop-domain-model.md` §8 的模式：`bun run lint`、對應 `bun test tests/unit/<檔案>`、`npx tsc --noEmit`；migration 票另加 `bun run check:migrations`、CI 的 `verify-supabase-migrations` 與 `supabase/tests/rls-authorization.sql` 正負向案例（§10 各票已列）。回滾：`DROP TRIGGER`（每張表一行）→ `DROP FUNCTION log_record_change` → `DROP TABLE record_change_logs`；Tier B 的 bypass GUC 在函式內多一行 `set_config`，移除不影響清理邏輯。所有變更都是新表、新函式與新 trigger，**不改任何既有表的欄位**，回滾不涉及資料搬遷。

## 12. English summary

**Scope**: design only (no code, no migration) for maintainability review § A7 "audit coverage", unblocked by the 2026-09-24 approval of #847.

**Decisions**:

1. **Which tables** — Tier A (authorization: `care_access`, `household_members`, `patients`) and Tier A′ (in-place threshold settings: `patient_anomaly_alert_settings`, `pet_blood_glucose_target_ranges`) get INSERT/UPDATE/DELETE audited, retained forever. Tier B (18 patient-scoped tables whose values users can edit or delete: blood pressure, temperature, canonical weight, fluid balance, meals, dementia, six pet tables, lab results, timeline, due reminders, visit questions, intake logs) get UPDATE/DELETE only, retained 180 days. Excluded: `medication_plans` (already has `medication_plan_change_logs`), PRN (append-only by design), versioned `patient_bp_standards`, legacy weight tables (A5), catalogs, delivery/consent/invitation tables, account-level tables (A3).
2. **Shape** — one generic `record_change_logs` table + one `SECURITY DEFINER` trigger function using `to_jsonb()`. `before_row` is the full OLD row, `after_diff` only the changed columns; `changed_columns TEXT[]` for cheap queries. Storage estimate (schema-derived, usage rates are guesses): ~1 KB per Tier B change; a single household is negligible; at 100 households retention, not diff-vs-full, is the lever. System retention purges (24-day temperature purge, daily weight retention) must bypass audit via a transaction-local GUC or they merely relocate the storage they were built to cap.
3. **Actor** — a trusted `app.audit_actor_kind = 'system'` GUC override is checked first (for rule triggers such as `enforce_mother_patient_only_access`, whose deletes run inside the triggering user's session where `auth.uid()` is still set), then `actor_user_id = auth.uid()` (available today because F-5 made every writing session uid-bound), then `service_role`, else `system`. Optional `actor_source`. No email is ever stored: email-typed recorder columns are stripped from **both** OLD and NEW before the snapshot and the diff are built. This needs no rewrite after A3 option 1 or 2. The table has **no foreign keys at all** (`actor_user_id`, `patient_id`, `household_id`): any cascading FK would fire the immutability trigger and make deleting the parent (account, patient, household) fail; orphan rows are removed by the purge.
4. **RLS & privacy** — `ENABLE ROW LEVEL SECURITY` is explicit (policies are ignored otherwise). SELECT only: patient-scoped rows require `care_access.can_record` (viewers cannot see who changed what); `household_members` rows require household owner role. Authenticated roles have no DML; the table is immutable except the purge path. `delete_user_account` bypasses audit for the user's own health rows and records the (email-free) authorization-removal rows truthfully as `user` with `actor_source = 'delete_user_account'` — the deleting user is the actor. Never part of `/share` (#655). ADR-002 backup covers the table automatically; add one negative RLS invariant to the restore drill.
5. **Existing four change-log tables** — all kept, none merged (different scope keys: patient / catalog / account / global). Rule for future patient-scoped tables: attach the generic trigger; bespoke logs only for domain events the generic diff cannot express (`medication_plan_change_logs` is the sole existing case). Zero-reader tables are a missing-reader problem, not a reason to retire.
6. **Read side** — this cycle ships data layer + a typed `src/lib/recordChangeHistory.ts` (no UI). Future minimal UI: a per-record "history" drawer in existing edit sheets and a patient-level "last 30 days" list, Sonnet, 2027-Q1, owner approval required.

**Tickets (not opened)**: AUDIT-1 `[Opus / Astra]` table+function+RLS+Tier A/A′ → AUDIT-2 `[Opus / Astra]` Tier B + purge cron → AUDIT-3 `[Sonnet]` read layer → AUDIT-4 `[Sonnet]` UI (deferred). Independent of A3, A5, A2 and the #847 deltas.

## 13. 參考

- Issue [#910](https://github.com/portfolio-author/jia-jian-log/issues/910)（本設計的追蹤票）、[#848](https://github.com/portfolio-author/jia-jian-log/issues/848) § A7／A3、[#847](https://github.com/portfolio-author/jia-jian-log/issues/847)（已核准）、[#655](https://github.com/portfolio-author/jia-jian-log/issues/655)。
- [`docs/adr/008-audit-coverage-boundary.md`](../adr/008-audit-coverage-boundary.md)：本檔的決策記錄與被拒絕方案摘要。
- [`docs/architecture/maintainability-review-2026-09.md`](./maintainability-review-2026-09.md) § A7（三個處置選項）、§ A3（22 個 TEXT 記錄者欄位）、§ A2（授權雙軌）、§ A5（legacy 退役）。
- [`docs/product/care-loop-domain-model.md`](../product/care-loop-domain-model.md) §4 delta #1／#2／#5／#6、§7 依賴圖；[`docs/adr/005-care-loop-closure.md`](../adr/005-care-loop-closure.md)。
- [`docs/architecture/care-access-identity-binding.md`](./care-access-identity-binding.md) §8（F-5 明列不做的三條，即 A3 範圍）。
- [`docs/adr/002-database-backup-boundary.md`](../adr/002-database-backup-boundary.md)、[`docs/operations/cron-inventory.md`](../operations/cron-inventory.md)。
- [`docs/product/q4-2026-outcome-compression.md`](../product/q4-2026-outcome-compression.md) §1（本季不新增病人級表）、§3（三個成果不含 audit UI）。
- [`docs/architecture/data-model.md`](./data-model.md)、[`docs/architecture/auth-and-rls.md`](./auth-and-rls.md)、`supabase/tests/rls-authorization.sql`。
- `docs/ai/model-routing.md`：本檔標題與 §10 的模型標籤慣例來源。
