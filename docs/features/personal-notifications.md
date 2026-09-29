<!--
檔案用途：定義個人化通知（付費會員各自綁定 Telegram／LINE 收取專屬通知）的架構決策、資料邊界與分階段實作計劃。
所在層：docs/features；描述尚未實作的 server-side 通知擴充，不取代 notifications.md 既有的日曆／到期提醒規格。
主要關聯：blood-pressure-notifier、account_usage_limits、docs/adr/003-personal-notification-channels.md 與 docs/features/notifications.md。
-->

# 個人化通知 / Personal Notifications

> **狀態：規劃中（Planned）。** 本文件是實作計劃，不是既有規格。程式尚未落地；實際行為以 `docs/features/notifications.md` 為準，直到本文件的分階段上線走完並改寫為現行規格。
>
> 實作依 GitHub issue 逐項交接，對照表見文末「實作拆分」。

## 目的與範圍

目前 `blood-pressure-notifier`、`calendar-notifier`、`care-due-reminders` 三支 Edge Function 都讀同一組全域 secret `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID`，所有病人的所有通知都送進同一個家庭群組。沒有「誰收到什麼」的概念。

本計劃讓**被標記為付費的帳號**綁定自己的 Telegram **與／或** LINE，各自收到專屬通知。

本輪範圍**只有血壓通知**；日曆通知與照護到期提醒維持現狀，不在這次改動範圍內。付費狀態**先由維護者手動標記**，不接金流。

## 決策一：external id 永遠不離開資料庫（outbox 模式）

`blood-pressure-notifier` 是 caller-scoped 邊界：`withSupabase({ auth: 'user' })`、套 RLS、**沒有 service role**。`tests/unit/bloodPressureNotifier.test.ts` 有一條 `expect(source).not.toContain('SUPABASE_SERVICE_ROLE_KEY')` 把這個姿態鎖死。它讀不到別的照護者的 chat id。

而一個「回傳 chat id」的 `SECURITY DEFINER` RPC **會被 PostgREST 曝露**——任何登入的照護者都能直接在瀏覽器呼叫它，等於外洩全家人的 Telegram／LINE ID。這是本設計要擋掉的核心風險，也是為什麼不採用「查出收件人後直接送出」這個較直覺的做法。

因此改為 outbox（收件匣）模式：

```
存血壓
  → blood-pressure-notifier（JWT、caller-scoped，姿態不變）
  → RPC enqueue_blood_pressure_personal_notifications(record_id, patient_id) → 只回傳筆數
  → personal_notification_outbox 只存 recipient_user_id + channel
    （不存 external id、不存訊息內容）
  → personal-notification-drain（Cron + service role）解析 external id、重讀紀錄、
    依管道 render、送出、寫回逐筆狀態
```

**取捨**：血壓通知從即時變成延遲最多約 60 秒（pg_cron 最小間隔 1 分鐘）。換來的是重試、去重、逐收件人逐管道的稽核狀態——這三件事正是既有 `notification_deliveries` 與 `care_due_reminder_deliveries` 已經在做的。對照護場景而言，一分鐘內的延遲遠比「偽造或漏送」風險小。

## 決策二：一個付費旗標，管道自選

`personal_notification_tier`（`'none' | 'personal'`）**不分管道**。付費解鎖的是「個人化通知」這個能力；使用者自己決定綁 Telegram、綁 LINE，或兩個都綁——都綁就兩邊都收得到。

這避免日後每加一個管道就要改一次授權模型，也讓「付費」在資料上只有一個真實來源。

## 決策三：LINE 的範圍澄清

`TODO.md` §0 有一條已勾選的決定「不在此 repo 新增 LINE webhook endpoint」，但同檔 P0 待辦又寫「通知管道改用 LINE Messaging API（LINE Notify 已終止）」。

§0 的原意是**不把 `../appscript` 的 LINE bot 當「輸入端」搬進來**（照護者用 LINE 打字記錄血壓）；legacy GAS 仍是 production 輸入端，仍不搬，退役步驟仍在 `LEGACY_GAS_RETIREMENT.md`。本計劃新增的是**輸出端**的通知綁定 webhook，兩者不衝突。

完整決策記錄見 [`docs/adr/003-personal-notification-channels.md`](../adr/003-personal-notification-channels.md)。

## 資料模型

一支 migration：`supabase/migrations/<timestamp>_add_personal_notification_channels.sql`。

### `user_messaging_links` — 瀏覽器完全讀不到

| 欄位 | 型別 | 說明 |
| --- | --- | --- |
| `user_id` | UUID NOT NULL → `auth.users(id)` ON DELETE CASCADE | |
| `channel` | TEXT NOT NULL CHECK IN (`telegram`,`line`) | |
| `external_id` | TEXT NOT NULL | Telegram chat id 或 LINE userId |
| `linked_at`, `updated_at` | TIMESTAMPTZ | |

PRIMARY KEY `(user_id, channel)`；UNIQUE `(channel, external_id)`（一個 Telegram／LINE 帳號只能綁一個 App 帳號）。

`ENABLE ROW LEVEL SECURITY` + **不建立任何 policy** + `REVOKE ALL ... FROM PUBLIC, anon, authenticated`（**不 GRANT SELECT**）。連使用者自己的 external id 都不回給前端——UI 只需要知道「已綁定／未綁定」。

`external_id` 用 TEXT 而非 BIGINT：Telegram chat id 是數字，LINE userId 是 `U` + 32 hex，必須共用一欄。

以 `auth.uid()` 為鍵而非 email，沿用 `user_settings`（`20260808090000`）立下的「帳號設定用 UID、健康資料授權用 email」慣例。

### `messaging_link_tokens` — 一次性綁定券

`token_hash TEXT PRIMARY KEY CHECK (~ '^[0-9a-f]{64}$')`（只存 SHA-256）、`user_id`、`channel`、`created_at`、`expires_at NOT NULL`、`consumed_at`。部分索引 `(user_id, channel) WHERE consumed_at IS NULL`。

RLS on、無 policy、`REVOKE ALL`。原始 token 只在「回傳給發起者」那一次存在，資料庫裡永遠只有 hash。

### `personal_notification_outbox`

`id`、`recipient_user_id`、`channel`、`patient_id` → `patients(id)` ON DELETE RESTRICT、`notification_kind` CHECK IN (`blood_pressure`)、`source_record_id`、`status`、`provider_http_status`、`failure_code`、`created_at`、`attempt_started_at`、`resolved_at`。

去重唯一鍵：`(notification_kind, source_record_id, recipient_user_id, channel)`。

狀態機沿用既有慣例：`pending → sending → sent | delivery_unknown | failed_terminal`。`delivery_unknown` **不得由下一輪盲目重送**，因為對方可能已經收到而只是 HTTP 回應遺失。

`failure_code` 改用 `provider_*` 前綴（`provider_http_4xx`、`provider_http_5xx`、`provider_network_unknown`、`provider_api_rejected`、`configuration_error`、`recipient_unlinked`、`recipient_unauthorized`）以涵蓋兩個管道。[ADR-007](../adr/007-notification-delivery-semantics.md) D5 已定案四張表統一用 `provider_*`：票 1（issue #958，migration `20260926155217`）把值域擴成同一份（另加 `provider_rate_limited`、`delivery_expired`、`unattempted_abandoned`），並替四張表補上 `attempt_count`、`next_attempt_at`、`claim_token`、`claim_generation`、`resolution_source`；既有兩張 cron 帳本在票 9 contract 之前仍**同時**接受 `telegram_*`（expand 窗口）。outbox 既有的 `pending` 列依上線約束 1 以 owner 核准的 `BACKFILL_CUTOFF` 分流：門檻內保留、超過的改判 `failed_terminal` ＋ `delivery_expired` 並標 `resolution_source = 'migration'`。票 3（issue #960，migration `20260926160515`）已讓 `_shared/telegram.ts` 直接產出 `provider_*`、移除 drain 的 `TELEGRAM_TO_OUTBOX_FAILURE_CODE` 對照表，並把兩張 cron 帳本的歷史 `telegram_*` 列回填成 `provider_*`（規則在 `backfill_provider_failure_codes_adr007()`，票 9 contract 前會對 expand 窗口內新寫出的舊值再跑一次）；五支 Cron Function 的 secret 比對改走 `_shared/cron.ts` 的常數時間比對。票 4（issue #961，migration `20260926163732`）落地 D4：outbox 是四條路徑裡唯一有重試者的，drain 對合法的 Telegram／LINE 429（可解析的 provider 錯誤封包）依 `planRateLimitedRetry` 把列寫回 `pending` ＋ `provider_rate_limited`——先遞增 `attempt_count` 再比對上限（`MAX_DELIVERY_ATTEMPTS = 5`）、`retry_after` 先驗證（無效用 `RETRY_MIN = 30s`、超過 `RETRY_MAX = 5 min` 直接終結）、`next_attempt_at = LEAST(now + retry_after, created_at + DELIVERY_DEADLINE)`，越過 30 分鐘期限一律 `failed_terminal` ＋ `delivery_expired`；`claim_pending_personal_notifications` 尊重 `next_attempt_at` 與期限，並在同一支 RPC 內把越界的 `pending` 就地終結，每次 claim 寫 `claim_token`、遞增 `claim_generation`；drain 每一次寫回都以 `claim_token` 圍籬，舊一代的寫回在 `WHERE` 就落空；drain 先呼叫 claim RPC、之後才依實際搶到的管道惰性讀取 `TELEGRAM_BOT_TOKEN`／`LINE_CHANNEL_ACCESS_TOKEN`，所以 secret 缺失時逾期列照樣被標成 `delivery_expired`、搶到的列寫 `failed_terminal` ＋ `configuration_error`，不會整支 500 而讓帳本停住；每一列送出前還會再查一次 `created_at + DELIVERY_DEADLINE`（一批最多 25 列逐一處理，排在後面的列到真的送出時可能已越界），越界就不呼叫 provider、直接終結為 `delivery_expired`。轉 `sent` 一律清空 `failure_code`（D2）。裸 429（解析不出封包）一律 `delivery_unknown`。

**刻意不存訊息內容**：血壓數值已在 `blood_pressure_records`，drain 時用 service role 重讀重組即可。這沿用 `src/lib/telegramNotification.ts` 已在用的「只傳 ID、server 重讀」原則，避免健康數值在資料庫裡多出一份未受 patient 分區保護的副本。

RLS：只給 SELECT，條件為 `recipient_user_id = auth.uid()` **且**對該 `patient_id` 有 `care_access`。無任何寫入權限。

### 付費旗標

```sql
ALTER TABLE public.account_usage_limits
  ADD COLUMN IF NOT EXISTS personal_notification_tier TEXT NOT NULL DEFAULT 'none';
-- CHECK (personal_notification_tier IN ('none','personal'))
```

**重用既有的 `account_usage_limits`**（`20260730070000`）：它已經是 email-keyed、已經 `REVOKE ALL FROM anon, authenticated`（瀏覽器讀不到也改不了自己的付費身分）、已經只透過 SECURITY DEFINER 讀取。

**開新欄位而不是用 `plan_code='paid'`**：沿用 `photo_retention_tier`（`20260814100000`）立下的「每個授權軸各自一欄」先例，避免個人化通知的開關意外改動每日寫入配額。

### RPC

全部 `SECURITY DEFINER SET search_path = public`。

| RPC | 回傳 | EXECUTE 授權 |
| --- | --- | --- |
| `create_messaging_link_token(p_channel TEXT)` | 原始 token TEXT（只此一次） | `authenticated` |
| `current_messaging_link_status()` | `(channel, linked, linked_at, notification_tier)` — **無 external id** | `authenticated` |
| `unlink_messaging_channel(p_channel TEXT)` | void | `authenticated` |
| `consume_messaging_link_token(p_token_hash, p_channel, p_external_id)` | BOOLEAN | **只有 `service_role`** |
| `enqueue_blood_pressure_personal_notifications(p_record_id, p_patient_id)` | INTEGER 筆數 | `authenticated` |

`create_messaging_link_token`：**必須先確認呼叫者自己的 `personal_notification_tier = 'personal'`，否則 raise exception**。前端把未付費的按鈕停用只是體驗，任何登入者都能直接對 PostgREST 呼叫這支 RPC；若這裡不擋，未付費帳號可以繞過 UI 取得 token 並完成綁定，與「RPC 才是真正的閘門」的說法矛盾。（若日後產品要改成「先綁定、後付費」，那是需要明確決定的產品變更，不是預設行為。）

token 本身：`encode(gen_random_bytes(24),'hex')` = 48 個 hex 字元，符合 Telegram `/start` payload 限制（1–64 字元、只允許 `A-Za-z0-9_-`），192 bits 熵。只存 hash、TTL 10 分鐘、發新券時先作廢同使用者同管道未使用的舊券、每小時上限 5 張。

`enqueue_...` 的前置驗證**必須包含三項，缺一不可**：

1. caller 對 `p_patient_id` 有 `care_access`
2. **該筆紀錄的 `blood_pressure_records.patient_id` 等於 `p_patient_id`**
3. 該筆紀錄的 `recorded_by` 等於 caller email

第 2 項不能省略，也不能倚賴 `blood-pressure-notifier` 已經做過同樣檢查：**這支 RPC 授權給 `authenticated`，任何登入者都能直接對 PostgREST 呼叫它，完全繞過 Edge Function**。少了它，一個同時有 A、B 兩位病人權限的照護者可以把 A 的血壓紀錄配上 `p_patient_id = B`——outbox 會依 B 展開收件人，而 drain 用 `source_record_id` 重讀時拿到的是 A 的數值，等於把 A 的健康數值送給只該看到 B 的人。這正是 `AGENTS.md` 生理數值對象綁定不變量要防的跨病人洩漏，授權測試必須涵蓋這組 ID 不相符的呼叫。

通過驗證後，以 `care_access → auth.users → user_messaging_links → account_usage_limits` 的 JOIN 展開收件人，
`WHERE personal_notification_tier = 'personal'`，`ON CONFLICT DO NOTHING`。

**收件人自己的付費狀態決定自己收不收**，不是寄件人的。走 `auth.users` 而非 `app_profiles`，因為前者才是 user_id↔email 的權威來源，且不依賴 onboarding RPC 是否補過那一列。綁兩個管道的人自然產生兩列。

## Edge Functions

| Function | verify_jwt | 授權方式 | 職責 |
| --- | --- | --- | --- |
| `blood-pressure-notifier`（修改） | true | 登入者 JWT | 驗證後**額外**呼叫 enqueue RPC。過渡期（B、C 階段）**仍保留**原本送進全域 `TELEGRAM_CHAT_ID` 的路徑，到 D 階段才移除——否則 B 階段 Cron 尚未建立時所有血壓通知會被靜默丟棄。姿態不變，絕不引入 service role。 |
| `telegram-webhook`（新） | false | `X-Telegram-Bot-Api-Secret-Token` = `TELEGRAM_WEBHOOK_SECRET`（constant-time 比較） | 接 `/start <token>`，綁定 chat id |
| `line-webhook`（新，最後一階段） | false | `X-Line-Signature` = base64(HMAC-SHA256(`LINE_CHANNEL_SECRET`, raw body)) | 接 `/link <token>`，綁定 LINE userId |
| `personal-notification-drain`（新） | false | `PERSONAL_NOTIFICATION_DRAIN_CRON_SECRET` + service role | 排空 outbox 並送出 |

### drain 的硬性檢查

drain 持有 service role，**讀取時繞過 RLS**，所以 enqueue 當下的授權判斷不能當成送出當下的授權判斷。enqueue 與實際送出之間隔著至少一輪 Cron，這中間照護者可能被撤銷 `care_access`、付費可能到期、綁定可能被解除。

因此每一列在 render 與送出**之前**都必須重新確認三件事，任一不成立就直接寫成 `failed_terminal` 並附對應 `failure_code`，不得送出、不得留在 `pending` 反覆重試：

1. 收件人對該 `patient_id` **目前仍有** `care_access` —— 否則 `recipient_unauthorized`
2. 收件人**目前仍是** `personal_notification_tier = 'personal'` —— 否則 `recipient_unauthorized`
3. 收件人該管道**目前仍有** `user_messaging_links` 列 —— 否則 `recipient_unlinked`

重讀血壓紀錄時也**必須同時以 `source_record_id` 與該列的 `patient_id` 兩個條件查詢**，不可只用 `source_record_id`。drain 讀取繞過 RLS，這是防止「紀錄與 outbox 列的病人不一致」時把某位病人的數值送給另一位病人照護者的最後一道防線（enqueue 已擋一次，這裡是縱深防禦）；查不到就寫 `failed_terminal` + `configuration_error`，不得改用單一條件重查。

這條是本功能最重要的資料邊界：撤銷照護權限必須立即停止健康數值外送，不能因為「通知已經排進佇列」而繼續送達給已無權限的人。`AGENTS.md` 的生理數值對象綁定不變量要求通知同樣受 `patient_id` 分區保護，而 service role 路徑只有靠這裡的明確重驗才能滿足。

### 搶單必須是原子操作

兩次 Cron 重疊、或維護者手動重跑時，兩個 worker 可能讀到同一批 `pending` 列而送出重複的健康通知。outbox 的 UNIQUE 鍵只去重 **enqueue**，不去重 **消費**。

因此搶單必須是單一的條件式 UPDATE，不可先 `SELECT` 再 `UPDATE`：

```sql
UPDATE personal_notification_outbox
   SET status = 'sending', attempt_started_at = now()
 WHERE id IN (
   SELECT id FROM personal_notification_outbox
    WHERE status = 'pending'
    ORDER BY created_at
    LIMIT 25
    FOR UPDATE SKIP LOCKED   -- 重疊的 worker 直接跳過已被鎖住的列，不排隊也不重複取得
 )
RETURNING *;
```

`FOR UPDATE SKIP LOCKED` 不只是效能考量：少了它，重疊的 worker 會互相阻塞在同一批列上，而且任何把這段改寫成「先查再更新」的重構都會靜默引入重複送出。測試必須涵蓋重疊 drain 的情境。

### 綁定 webhook 的硬性檢查

- 只接受一對一對話（Telegram `message.chat.type === 'private'`、LINE `source.type === 'user'`）。綁定群組沒有「個人化」意義，而且會把整群當成一個人。
- LINE 必須**用原始 body 位元組驗簽再 parse**，不可先 parse 再重組字串驗簽。
- payload 需先符合 token 格式再查資料庫，SHA-256 後交給 `consume_messaging_link_token`（service role）。
- **永遠回 200**（無效 token 也是），避免 Telegram／LINE 進入重試迴圈；成敗改用一則三語訊息回覆使用者本人。
- 原始 token 會留在使用者的對話紀錄裡——這正是 TTL 10 分鐘 + 一次性 + 只存 hash 的理由。

### 訊息 renderer 拆分

現有 `buildBloodPressureTelegramMessage` 直接吐 HTML（`<b>`、`<i>`），LINE 只吃純文字。拆成 `buildBloodPressureNotificationFields()` 產生結構化欄位，再由 `renderBloodPressureTelegramHtml()` 與 `renderBloodPressurePlainText()` 各自輸出；`buildBloodPressureTelegramMessage` 保留為薄包裝，既有測試不動。

### 共用模組

`supabase/functions/_shared/telegram.ts`：把目前在 `calendar-notifier` 與 `care-due-reminders` **逐字重複**的 `sendTelegramMessage` 與 `classifyTelegramDelivery` 抽出共用。順手還既有技術債，不改那兩支的行為。

`supabase/functions/_shared/line.ts`：`POST https://api.line.me/v2/bot/message/push`，`Authorization: Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`，body `{ to, messages: [{ type: 'text', text }] }`，把 HTTP 狀態映射到同一組 `provider_*` failure code。

## LINE 額度考量

LINE Messaging API 的推播在免費方案有月額度上限（台灣 LINE OA 免費版約 200 則／月級距，**實際數字以帳號當期方案為準，實作前必須先確認**）。血壓通知是逐筆推播，一家人一個月很容易超過。

因此 LINE 管道排在最後一個階段，且該階段必須包含用量觀察方式——最低限度是把「以 `channel='line'` + `status='sent'` 對 `personal_notification_outbox` 做月計數」的查詢寫進運維文件。超量時的降級策略（改為每日摘要而非逐筆推播）留待後續獨立提案，不在本計劃範圍。

Telegram 沒有等價的商用額度限制，這也是它先上的原因之一。

### 額度確認結果與用量查詢（issue #604）

實作前已在 issue #604 回報確認：

- **帳號**：LINE 官方帳號（真實 Basic ID 屬 operational identifier，依 AGENTS.md 不進 Git；實際值見維運端 LINE Official Account Manager，帳號名稱為「家庭健康紀錄」）
- **方案**：輕用量（Light，使用中，NT$0/月）
- **免費訊息則數**：200 則／月，**帳號級共用**——不是每個綁定收訊人各自 200 則，是整個 LINE OA 帳號不分收訊人共用的總額度
- **加購訊息**：輕用量方案不支援加購；超過 200 則後訊息直接發送失敗，不是額外計費。要加購需升級中用量方案（NT$800/月起，免費則數 3,000/月）

因為額度是帳號級共用而非每人各自獨立，本 issue 的 MVP 範圍刻意縮小為**單一收訊人、即時推播**：只送給帳號擁有者（premium 使用者）本人，不做「同一筆通知廣播給多個綁定家人」的家族群發。收訊人固定 1 位，額度壓力遠低於「N 個家人 × 逐筆」，在正常記錄頻率下 200 則/月應可支撐；家族群發、多收訊人推播與超量後的降級策略（例如改每日摘要）留待額度或方案調整後的後續提案，不在本次實作範圍。

用量觀察查詢——依月份統計 LINE 管道實際送達則數，追蹤是否逼近 200 則/月上限：

```sql
SELECT date_trunc('month', resolved_at) AS month, count(*)
FROM personal_notification_outbox
WHERE channel = 'line' AND status = 'sent'
GROUP BY 1 ORDER BY 1 DESC;
```

運維建議：每月人工核對一次這個查詢的最新一列，若單月已逼近 200 則（例如超過 150 則），先確認是否有非預期的重複觸發，再評估是否需要提前申請中用量方案或延後推動多收訊人範圍。

## 前端

- `src/lib/messagingLinks.ts`：`fetchMessagingLinkStatus()`、`createMessagingLinkUrl(channel)`、`unlinkMessagingChannel(channel)`。副作用以參數注入，比照 `src/lib/telegramNotification.ts` 的 `InvokeLike` 寫法。
- `src/components/settings/PersonalNotificationSettings.tsx`：比照 `src/components/settings/ReadingScaleSettings.tsx` 的自給自足元件慣例（不接 props、自己管狀態），避免再往 `SettingsPage` 已經很長的 props 清單塞東西。非同步寫入走 `src/hooks/useSaveStatus.ts`，錯誤用 `describeSaveError`。
- 每個管道一列：已綁定顯示綁定時間與解除按鈕，未綁定顯示連結按鈕。未付費時整區顯示說明並停用按鈕——前端只是體驗，真正的閘門在 RPC。
- 掛載於 `src/features/system-admin/pages/SettingsPage.tsx`。
- 新公開環境變數 `VITE_TELEGRAM_BOT_USERNAME`、`VITE_LINE_OA_BASIC_ID`（bot handle 本來就是公開資訊）。
- 所有文案三語 inline `LocalizedText`，屬性順序 `{ id, zh, en }`。

## 測試

沿用 repo 的兩層慣例：純函式測試（副作用以參數注入）+ 對原始碼字串做契約斷言的 static source-contract 測試。全部用 `bun test`。

`tests/unit/personalNotificationChannelsMigration.test.ts` 是其中最重要的一支，負責把安全邊界鎖死：

- `user_messaging_links` 有 `REVOKE ALL ... FROM PUBLIC, anon, authenticated`，且**沒有**任何對 `authenticated` 的 `GRANT SELECT`
- `current_messaging_link_status` 的定義**不含** `external_id`
- `consume_messaging_link_token` 只 `GRANT EXECUTE ... TO service_role`
- `enqueue_...` 是 `RETURNS integer`，不是回傳 external id 的 table
- `channel` 與 `personal_notification_tier` 的 CHECK 值域、outbox 的 UNIQUE 去重鍵、檔尾 `NOTIFY pgrst, 'reload schema';`

`personalNotificationDrainFunction.test.ts` 必須涵蓋三條送出前的重驗路徑（`care_access` 撤銷、tier 降級、綁定解除）各自寫成正確的 `failed_terminal` + `failure_code` 而非送出、重讀時 `source_record_id` 與 `patient_id` 不相符時不送出，以及重疊 drain 不會重複取得同一列。

授權測試另需涵蓋 **enqueue RPC 的跨病人呼叫**：caller 同時有 A、B 權限時，以 A 的 `record_id` 配 B 的 `patient_id` 呼叫必須被拒絕，不得產生任何 outbox 列。

另有 `messagingLinks.test.ts`（前端）、`telegramWebhookFunction.test.ts`、`lineWebhookFunction.test.ts`（含簽章 vector），並擴充 `bloodPressureNotifier.test.ts`（既有訊息斷言不得改動；且需斷言過渡期仍保留全域送出路徑）。`supabase/tests/rls-authorization.sql` 補反向斷言：`authenticated` 無法 SELECT `user_messaging_links`、無法 EXECUTE `consume_messaging_link_token`。

## 分階段上線

| 階段 | 內容 | 全域 `TELEGRAM_CHAT_ID` |
| --- | --- | --- |
| A | 資料層 + Telegram 綁定 + 設定頁 UI。notifier 尚未改。 | 照舊，唯一送達路徑 |
| B | notifier **額外**呼叫 enqueue（全域送出仍保留）；Cron 尚未建立。人工檢查 outbox 列是否正確產生。 | 照舊，仍是唯一實際送達路徑 |
| C | 建立 Cron，drain 開始送出。已綁定又付費的人會**暫時收到兩則**（群組 + 私訊），已知且可接受的過渡狀態。 | 保留 |
| D | 全家都綁定後，移除 notifier 的全域送出。 | 停用 |
| E | LINE 管道上線。 | 已停用 |

## 驗收

每個階段跑：`bun test tests/unit` → `bun run lint` → `npx tsc --noEmit` → `bun run check:migrations`。

Staging 實機（階段 C 之後），以 `admin@careapp.local` 與 `demo.caregiver@example.test` 對媽媽的 patient 各驗一次：

- 已綁定 + 付費 → 收到
- 已綁定 + 未付費 → 不收到
- 未綁定 + 付費 → 不收到，且不留 `pending` 殘留

再以未授權帳號確認 RLS 拒絕，並直接打 PostgREST `/rest/v1/user_messaging_links` 確認回 401/403（瀏覽器永遠拿不到任何 external id）。

**必須保住 `AGENTS.md` 的核心照護授權不變量**：上述兩個帳號對媽媽 patient 的 read／care-write／medication-manage 權限不受影響。

## 一次性平台設定（由維護者執行，Agent 不得代做）

1. BotFather 建立／確認 Telegram bot，記下 username。
2. 呼叫 Telegram `setWebhook`，帶 `secret_token`（= `TELEGRAM_WEBHOOK_SECRET`）。
3. 建立 LINE 官方帳號並在 LINE Official Account Manager 啟用 Messaging API（不能直接在 Developers Console 建，也不是 LINE Login channel），取得 channel secret／access token 並設定 webhook URL（最後一階段才需要）。逐步操作、兩個環境各一個官方帳號的理由與 staging 驗收見 [`docs/operations/line-messaging-setup.md`](../operations/line-messaging-setup.md)。
4. 在 staging 與 production **分別**設定所有新 secret，不可複製共用。
5. 建立每分鐘的 Supabase Cron job 呼叫 drain。
6. 標記付費會員：`UPDATE account_usage_limits SET personal_notification_tier = 'personal' WHERE LOWER(profile_email) = ...`。

## 實作拆分

工作拆成 7 個 GitHub issue，依序相依：

1. ADR-003：架構決策與 LINE 範圍澄清（純文件，先合）
2. 資料層：多管道綁定、付費旗標與 outbox migration
3. Telegram 綁定 webhook 與 `_shared/telegram.ts` 抽取
4. 設定頁綁定 UI
5. 送出管線：notifier 改 enqueue + outbox drain
6. 文件與分階段上線
7. LINE 管道：webhook 簽章驗證、push sender 與額度觀察

## 回滾與限制

暫停個人化通知優先把使用者的 `personal_notification_tier` 改回 `'none'` 或停用 Cron，而不是刪除 outbox 稽核列。回滾程式時先停 Cron，再回退 notifier；既有 `delivery_unknown` 不可為了補送而改回 `pending`。移除資料表或大量刪除通知紀錄屬於破壞性資料操作，需另行明確授權。
