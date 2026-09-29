<!--
檔案用途：定義 Google Calendar 到 Telegram 的照護提醒資料邊界、可靠性策略與啟用程序。
所在層：docs/features；描述 server-side 通知功能，不取代 Supabase 平台或發布規則。
主要關聯：calendar-notifier Edge Function、通知 migration、Google Cloud service account 與 Telegram。
-->

# 日曆通知 / Calendar Notifications

## 目的與範圍

日曆通知讓家人在外地也能透過 Telegram 收到「即將有專用照護日曆行程」的雙語提醒。它不是前端 Google 登入功能的延伸：現有 Google Identity Services（GIS）只負責使用者登入，保持原本 scope 不變；通知改用獨立的 Google Cloud service account，以 reader 身分被分享給一個專用的次要 Calendar。

未來行程頁與 Telegram 使用同一個 Google service account，但兩個開關刻意分離：`enabled` 只代表 notifier，`agenda_enabled` 才允許家健錄顯示未來 7／14 天。行程頁直接讀 Google 作為 SSOT，不建立 event cache，也不把預約自動寫成 care timeline；完整的所有權與多租戶 OAuth 決策見 [ADR-001](../adr/001-calendar-ownership-and-agenda-access.md)。

前端在底部主導覽提供獨立的「行程／Jadwal」頁，永遠以 App 目前選定的 `patient_id` 查詢，可切換未來 7／14 天。切換照護對象或範圍時，render 階段就先隱藏上一個 scope 的內容並取消舊請求，避免上一人的就醫行程短暫出現在另一人姓名下；Demo 只顯示未連結提示，不呼叫私人 Calendar。

這個切分讓手機、外地電腦和排程都不需要保存家人的 Google OAuth refresh token，也避免把所有主日曆交給系統。service account 只能讀取被明確分享的次要日曆，權限為「查看所有活動詳細資料」即可；不要授予編輯者、不要分享個人主日曆。

## 帳號與 staging 測試對照（避免誤認）

這次已完成的通知不是媽媽日曆的正式通知，而是一個隔離的 staging 演練：

| 項目 | 實際使用者／資源 | 代表什麼 |
| --- | --- | --- |
| 建立假事件的 Google 帳號 | `admin@careapp.local` | 只用來在 Google Calendar 網頁建立 staging 假事件；它不是通知收件人的病人身分。 |
| 被讀取的 Calendar | `Jia Jian Log Staging Care（測試）` | 專用測試副日曆；不是 `admin@careapp.local` 的主日曆，也不是媽媽的日曆。 |
| Calendar 唯讀身分 | `jia-jian-calendar-staging@jia-jian-log.iam.gserviceaccount.com` | Edge Function 使用的 service account，只能讀上面那本被明確分享的 staging 日曆。 |
| 媽媽在家健錄的帳號／病人 | `demo.mother@example.test` | 這次沒有讀取、寫入或修改她的資料；正式來源仍要另外綁定明確的 `patient_id`。 |
| Telegram | staging Supabase secrets 裡既有的 bot token／chat ID | 測試確實送出一則通用雙語提醒，但訊息沒有包含事件標題、地點或描述。 |

本次送出的通知來自 Supabase Edge Function `calendar-notifier`，不是 Vercel 前端，也不是既有血壓通知 Worker。第一次測試留下 1 筆 `sent`；第二次同一事件被去重跳過，沒有再送一次。測試來源已停用，媽媽的 production 資料與 production Calendar 都沒有碰到。

小朋友版：`admin@careapp.local` 只是拿來在「測試日曆」放一張假紙條；service account 像只拿到那個抽屜鑰匙的郵差；`demo.mother@example.test` 媽媽的抽屜完全沒有打開。

## 資料與隱私邊界

`calendar_notification_sources` 每列都帶明確 `patient_id`、Google Calendar ID、提前分鐘數與啟用狀態。`notification_deliveries` 只保存 source、patient、SHA-256 occurrence key、實例開始時間、提前分鐘數與送達狀態；key 只在 Function 記憶體中由 raw event ID、開始時間與 lead time 算出，永不保存原始 event ID。外鍵以 `(source_id, patient_id)` 再次驗證同一個病人，避免 source ID 被跨病人引用，而 delivery 自己保留當時的 lead time 作為去重稽核。

日曆標題、description、location、attendee 與原始 Google 回應都不得寫入 Postgres 或 log。Telegram MVP 也刻意只送「請開啟 Google Calendar 看詳情」的繁中／印尼文通用提醒；這避免把日曆敏感內容複製到另一個聊天系統。未來若要顯示標題，需先經過明確的隱私設計與使用者同意。

授權照護者只能 SELECT 自己有 `care_access` 的病人來源與送達狀態；瀏覽器角色沒有 INSERT／UPDATE／DELETE 權限。設定來源和實際排程處理由 service role Edge Function 進行，RLS 仍保護一般 client，service role 僅可存在於 Supabase server secret。

行程頁的 `calendar-agenda` Function 是不同邊界：它需要已登入者 JWT，使用 caller RLS context 查詢 `patient_id + agenda_enabled=true`，不使用 service role。回應只在 React 記憶體使用並帶 `Cache-Control: private, no-store`；不得放入 localStorage、IndexedDB 或 PWA cache。

部署 acceptance gate：本次不碰 staging 資料或權限；套用 migration／Function 後，必須分別以 `admin@careapp.local` 與 `demo.caregiver@example.test` 實測讀取 `demo.mother@example.test` 媽媽 patient 的 7／14 天 agenda，並以未授權帳號確認 RLS 回傳未設定／拒絕而非日曆內容。這是既有核心照護授權不變量在 agenda 路徑的必要驗收，不可由前端隱藏按鈕取代。

## 去重與送達狀態

排程對每個 enabled source 以「現在往前 grace window」判斷是否到提醒時間，並向 Google 以加上 lead time 的事件開始窗口查詢。只取 timed event；取消和全天事件一律忽略，因為全天事件沒有可靠的分鐘級開始時間。

`(source_id, calendar_occurrence_key)` 是資料庫唯一鍵。key 已含 recurring event 的每個 occurrence 開始時間與 lead time，因此重疊的 Cron、短暫延遲或 API 重試都不會重送同一個提醒。

送達單先以 `pending` 保留，再在發送前切成 `sending`。Telegram 成功是 `sent`；已知 4xx 是 `failed_terminal`；網路中斷或 Telegram 5xx 是 `delivery_unknown`。後兩種尤其 `delivery_unknown` 不得由下一輪排程盲目重送，因為 Telegram 可能已收到但 HTTP 回應遺失。`sending` 也保留供人檢查，而不是自動猜測它沒有送出。

[ADR-007](../adr/007-notification-delivery-semantics.md) 票 1（issue #958，migration `20260926155217`）已把四張 delivery 帳本的 schema 對齊：每張表都有 `attempt_count`、`next_attempt_at`、`claim_token`、`claim_generation` 與 `resolution_source`（`runtime`／`migration`），`failure_code` 的正規值域統一為 `provider_*`（含新增的 `provider_rate_limited`、`delivery_expired`、`unattempted_abandoned`），`notification_deliveries` 與 `care_due_reminder_deliveries` 在票 9 contract 之前**同時**接受舊的 `telegram_*`（expand 窗口，讓仍在線上的舊分類器寫得進去）。既有的 `pending` 列依上線約束 1 逐表處理：這兩張 cron 帳本的 `pending` 一律改判 `failed_terminal` ＋ `unattempted_abandoned` 並標 `resolution_source = 'migration'`——它們沒有重試者，留著只是一個沒人取的抽屜。票 3（#960）已讓分類器直接產出 `provider_*`；票 4（#961）落地 D4：這兩條路徑**沒有重試者**，所以合法的 Telegram 429（可解析的錯誤封包）直接 `failed_terminal` ＋ `provider_rate_limited`、不寫 `pending`（D4 條件 0，由 D7 的零門檻告警立刻發出訊號），裸 429 一律 `delivery_unknown`；轉 `sent` 一律清空 `failure_code`（D2）。兩支 Function 每一輪在取得 service-role client 之後、任何查詢與 early return 之前，先把自己帳本裡「上一輪遺留」的 `pending`（`created_at` 早於 15 分鐘寬限、仍是 `pending`，可證明停在 INSERT 與 `sending` 之間、從未送出）終結為 `failed_terminal` ＋ `unattempted_abandoned` ＋ `resolution_source = 'runtime'`；清理失敗只記聚合 log、不中止整輪送出（`_shared/ownerlessPending.ts`）。

## delivery sweeper：只告警、不重送（ADR-007 D7，票 6，issue #963）

四張 delivery 帳本（`personal_notification_outbox`、`care_due_reminder_deliveries`、`notification_deliveries`、`blood_pressure_notification_deliveries`）由 `notification-delivery-sweeper`（Cron 每 5 分鐘）呼叫資料庫函式 `run_notification_delivery_sweep()` 掃一輪，把需要有人看的列寫進 `notification_delivery_incidents`。**它只讀 delivery 表、只寫告警表、絕不呼叫 provider、絕不改任何 delivery 列**——這不是叮嚀而是資料庫權限：掃描函式由專屬角色 `notification_delivery_sweeper` 擁有（`SECURITY DEFINER` 以它的權限執行），該角色對四張表只有 SELECT（`SELECT … FOR UPDATE` 在權限層就是 42501，不會讓 `FOR UPDATE SKIP LOCKED` 的取件安靜跳過任何列），也沒有任何 claim／reserve／resolve RPC 的 EXECUTE。

四種掃描對象與起算欄位：`sending` 超過 M（10 分鐘，與 D9-b 的 fresh／expired 分界及 `_shared/deliveryPolicy.ts` 同一個值）以 `attempt_started_at` 起算；`delivery_unknown` 以 `resolved_at` 起算、門檻 0；`pending` 逾期以 `COALESCE(next_attempt_at, created_at)` 起算（10 分鐘）並另以 `created_at + 30 分鐘` 絕對期限；`failed_terminal` 門檻 0、落下即告警，**只有 `recipient_unauthorized` 不告警**（`recipient_unlinked`、`provider_rate_limited`、`delivery_expired`、`unattempted_abandoned`、`provider_http_4xx`、`provider_api_rejected`、`configuration_error` 都告警）。

每個 delivery 列最多一筆有效 incident，鍵是 `(delivery_table, delivery_id, source_created_at)`（`id` 的 `gen_random_uuid()` 不是不重用的保證），`alert_kind` 是屬性、隨狀態就地更新；來源走到 `sent` 就 `closed`；人為結案 `acknowledged` 之後 sweeper 只更新 `last_seen_at`，**重新開啟綁世代**（來源列的 `claim_generation` 前進才重開，與狀態變不變無關，也不看 `attempt_count`）。incident 帶非正規化 `patient_id`，INSERT 時以**不加鎖**的 SELECT 回查來源列 `(delivery_id, created_at)` 驗證相符，四個身分欄寫入後不可變；四張 delivery 表的 `patient_id` 與 `created_at` 由 `BEFORE UPDATE` trigger 凍結、`BEFORE DELETE` 連帶刪掉指向它的 incident；每輪掃描先對帳刪掉回查不到來源的孤兒。列上只有指標與授權鍵，不含訊息內容、數值、email 或 external id。

讀取：對該 `patient_id` 有 `care_access` 的登入者（RLS）。結案：`acknowledge_notification_delivery_incident(id, claim_generation)`（migration `20260928000000`），呼叫者須有 `care_access` **且** `can_record`，並交出畫面上看到的 `claim_generation_seen`：世代已前進（sweeper 就地重開同一筆 id）就回 `stale` 不結案、前端重讀，避免結掉一個照護者沒看過的新失敗；已非 open 回 `closed`；管理者身分只放寬 `can_record`、不放寬 `care_access`（沒有該病人 `care_access` 的管理者讀不到也結不掉）；`authenticated` 對 incident 表沒有直接 UPDATE。誠實上限：sweeper 帶來的是「100% 可稽核」，不是字面上的 100% 送達。

**告警的指名消費者（票 10，issue #974）**：「今天」頁頂端的 `NotificationIncidentBanner`（`src/features/today/components/`）讀該病人的 open incident（`src/lib/notificationDeliveryIncidents.ts`，以 `patient_id` 分區、RLS 再擋一次），三語、印尼文優先、大字高對比、左對齊；文字只說「有一則家人通知可能沒有送到，請直接聯絡家人確認」，**不含數值、收件人或訊息內容**。有 `can_record`（或管理者）的人看到一顆「已處理」，一次結掉該病人全部 open incident（15 秒原則，不逐筆點）；viewer 看得到橫幅但沒有按鈕。**Fail loudly**：incident 查詢失敗顯示「無法確認家人通知狀態」，不得顯示成沒有告警。切換病人時 hook 立刻清空並讓舊請求失效（§ 3.5），進行中的結案與失敗記號都以「病人＋incident」分區：不會讓新病人的按鈕卡在「儲存中」，結案失敗只在那筆 incident 仍 open 時顯示（被別人結掉或 sweeper 關掉就丟棄，之後重開也不再頂著舊失敗）；結案成功會讓還在路上的補查作廢，免得結案前拍下的快照把剛結掉的告警放回畫面。頁面停留期間每 60 秒背景補查一次（分頁隱藏時跳過）、回到前景（分頁重新可見／視窗取得焦點）立刻補查，sweeper 之後新開或重開的 incident 不會因為畫面沒動而看不到；補查等待期間舊清單留著、不閃「載入中」，補查失敗同樣顯示「無法確認」。展示模式沒有 Supabase，回空清單（沒有告警是正確答案）。**不用 Telegram 再發一則告警**：失敗的正是那條管道。票 2 的「移除 5xx 請求內重試」開關要等本橫幅上線、且 production 的 A6 sweeper Cron 確認存在後，才把 `IN_REQUEST_RETRY_DEFAULT` 改成 `false`（另開 follow-up）。

## 一次性平台設定（由維護者執行）

這些步驟只文件化；migration 不硬編碼 project URL、Cron token 或任何 secret，Agent 也不得自行執行：

1. 在 Google Cloud 建立專用 service account，建立 JSON key，並將該 service account email 以 reader 分享到新的次要 Google Calendar。不要改現有 GIS OAuth consent screen 或瀏覽器 scope。
2. 在 Supabase 專案設定 Edge Function secrets：`GOOGLE_CALENDAR_SERVICE_ACCOUNT_JSON`、`TELEGRAM_BOT_TOKEN`、`TELEGRAM_CHAT_ID`、`CALENDAR_NOTIFIER_CRON_SECRET`；可選 `CALENDAR_NOTIFIER_GRACE_MINUTES`（預設 7，範圍 1–60）。Supabase 會為 Function 提供 `SUPABASE_URL` 與 `SUPABASE_SERVICE_ROLE_KEY`，不用也不能把它們提交到 repo。
3. 套用 migration、部署 `calendar-notifier` Function 後，建立 Supabase Cron job，例如每 5 分鐘以 `POST` 呼叫 Function，帶 `Authorization: Bearer <CALENDAR_NOTIFIER_CRON_SECRET>`。Cron 的 project URL 和 token 必須留在受控平台設定，不可寫入 SQL migration。ADR-007 票 6 之後另設 `NOTIFICATION_DELIVERY_SWEEPER_CRON_SECRET` 並替 `notification-delivery-sweeper` 建一條每 5 分鐘的 Cron（見 `docs/operations/cron-inventory.md` A6）。
4. 以 staging 的專用測試日曆建立一筆分鐘級行程，確認 Telegram 收到雙語通用提醒；接著確認同一行程在下一輪 Cron 只留下同一筆 delivery。最後用未授權帳號確認 REST SELECT 被 RLS 拒絕，並用 `admin@careapp.local`、`demo.caregiver@example.test` 驗證可讀媽媽病人的通知狀態。

若 Calendar API、Telegram 或 secret 有問題，排程不會改動健康紀錄；只會留下不含日曆內容的聚合 Function log 與 delivery 狀態，方便維護者安全排查。

## 藥量與照護到期提醒（`care-due-reminders`）

issue #414 的提醒資料位於 `care_due_reminders`，每列都以明確 `patient_id` 分區；人類可建立回診、抽血、打針，寵物可建立疫苗、心絲蟲預防、驅蟲，兩者都可建立藥量倒數。RLS 的讀取沿用 `care_access`，寫入與管理要求同一位病人的 `can_manage_medication`，不使用 email、角色字串或前端隱藏作授權。每日照護入口偏好也以同一個 `patient_id` 保存，切換病人時不重用上一位的資料。

藥量到期日固定是領藥日期加上天數；其他類型只保存照護者明確輸入的日期。門檻是每筆提醒可調的 1–180 天數，預設依類型提供；提醒畫面與 Telegram 只陳述類型、日期、剩餘或逾期天數，絕不推論病因、醫療結果或調藥方式。已送出的提醒保留 `care_due_reminder_deliveries` 稽核列，因此只能改成「略過」，不能刪除歷史。

**訂閱的寫入路徑（ADR-007 票 5，issue #962，migration `20260926164959`）**：`notification_subscriptions` 決定「哪個 patient 可以用專案擁有的共用 Telegram 目的地」（SEC-20260908-01），它**不是照護權限的一部分**。唯一的開通／停用入口是 `SECURITY DEFINER` RPC `set_notification_subscription(patient_id, channel, enabled)`：呼叫者必須**同時**是管理者（`is_admin_email`）**且**對該 patient 有 `care_access`——只有 `care_access`（含 owner、可記錄者）不夠，管理者身分也不是繞過 `care_access` 的旁路；停用寫 `enabled = false`、不刪列；`channel` 只收正規詞彙表 `telegram | line | push`（與 `personal_notification_outbox.channel` 同一份，只擴充不移除）；每一次變更由 ADR-008 的 `record_change_logs` 留痕（只記 `auth.uid()`、原值、新值、時間）。`authenticated`／`anon` 對表本身仍沒有任何 INSERT／UPDATE／DELETE，repo 內也不得有其他寫入路徑（`tests/unit/notificationSubscriptionWritePathMigration.test.ts` 掃原始碼）。**目前沒有任何 caller**：後台開關 UI 另開 issue #994。在它落地之前，唯一合法的呼叫方式是**帶著管理者登入 JWT 的 client**——例如管理者在 App 登入後，用同一個 session 的 supabase-js 呼叫 `supabase.rpc('set_notification_subscription', { p_patient_id, p_channel, p_enabled })`，或以該 session 的 access token 打 PostgREST（`POST /rest/v1/rpc/set_notification_subscription`，`Authorization: Bearer <access token>`＋`apikey`）。**不能用 Supabase Dashboard 的 SQL editor**：它不帶應用 JWT，`auth.uid()` 為空，RPC 一定回 `Authenticated user with email required`；而且那是需要事前明確核准的直接資料庫操作（AGENTS.md § 3.2）。

排程 Function `care-due-reminders` 使用 `CARE_DUE_REMINDERS_CRON_SECRET`，以台北日曆日判斷門檻，並用 `(reminder_id, due_date)` 去重；Telegram 沿用既有 `TELEGRAM_BOT_TOKEN`／`TELEGRAM_CHAT_ID`，不新增 LINE 假設定。Staging 手動 gate 是設定 secret、部署 Function、建立每日 Cron，再用兩個已授權照護者與一個未授權身份驗證同病人 read/write 的正反向結果；本 repo 不會自動接 production 或執行遠端 migration。

## 回滾與限制

暫停通知優先把 source 的 `enabled` 設為 false，而不是刪除 delivery audit。若需回滾程式，先停用 Cron，再停用來源；既有 `delivery_unknown` 不可為了補送而改回 pending。移除資料表或大量刪除通知紀錄屬於破壞性資料操作，需另行明確授權。
