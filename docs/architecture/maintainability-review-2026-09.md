<!--
檔案用途：2026-09 跨系統架構維護性審查（issue #848／#871）的排序結果：概念重複、legacy 相容表、通知路徑、email 身分殘留、
  demo 平行層、死目錄與文件漂移，每項附證據路徑、半年後失敗情境、處置選項、建議模型標籤與既有 issue 關係。
所在層：docs/architecture；一次性審查存證與開票依據，不是常態規格。owner 依 §7 挑選後開實作票，實作完成後回寫 §5 對應項目的狀態。
主要關聯：AGENTS.md § 5、docs/ai/model-routing.md、docs/operations/security-review-handoff.md（排除清單來源）、
  docs/architecture/component-refactor-2026-09.md、docs/architecture/care-access-identity-binding.md、supabase/migrations/*、
  supabase/functions/*、src/lib/demoStorage/、src/App.tsx、vite.config.ts。
-->

# 維護性審查 2026-09：六個月後維護者視角的跨系統架構排序

- 狀態：**審查完成，待 owner 挑選開票**（本文件不修改任何程式碼、migration 或設定）
- 日期：2026-09-17
- 審查基準：`origin/staging` commit `85a6359`（195 支 migration、17 支 Edge Function、1 支 Vercel API route）
- 審查模型：Fable 5.1（依 [`docs/ai/model-routing.md`](../ai/model-routing.md)「里程碑完成後的 architecture audit」）；證據蒐集以六個唯讀子代理分區掃描，§5 每項的關鍵證據都由主審查者再次直接開檔核對
- 追蹤：issue [#848](https://github.com/portfolio-author/jia-jian-log/issues/848)（範圍與驗收）、[#871](https://github.com/portfolio-author/jia-jian-log/issues/871)（執行票）

## 0. ELI5（給完全不懂技術的人看）

這份文件像是請一位「半年後才接手這個專案的工程師」先來看一遍房子，把「現在還能住、但半年後會漏水的地方」按嚴重程度排好順序。它**不修任何東西**，只說：哪裡有問題、證據在哪個檔案第幾行、如果放著不管半年後會怎樣、有哪幾種修法各要花多少力氣、應該派哪一種模型去修。安全漏洞、元件太肥、手機 App 這些別人已經審過的，這裡不重審。

## 1. 排除清單（已由其他審查涵蓋，本文件不重做）

下列項目只在與 §5 某項有結構性關聯時被引用，不重新判定、不重新排序：

| 已排除項目 | 權威文件 |
| --- | --- |
| F-1～F-7、SEC-20260908-01～03 | [`docs/operations/security-review-handoff.md`](../operations/security-review-handoff.md)、`security-scanning.md` |
| 2026-09-15 黑箱測試（PR #809）、ZAP #745 處置表 | `docs/operations/staging-security-test-2026-09-15.md` |
| F-5 `care_access` 身分綁定四單位 | [`care-access-identity-binding.md`](./care-access-identity-binding.md) |
| 元件重構、Rule A／B／C | [`component-refactor-2026-09.md`](./component-refactor-2026-09.md)、`docs/agents/code-conventions.md` § 6 |
| 檔案大小票 #827～#839 及其 PR | 不對正在拆的檔案（`MedicationPage.tsx`、`InputPage.tsx`、`useMedicationAdminForm.ts` 等）下結論 |
| Mobile（ADR-004／#810） | `docs/product/mobile-capability-roadmap.md` |
| OSV `ignoreUntil` 2026-11-20 | `osv-scanner.toml`、handoff「有期限技術債」 |

§5 的 A2（授權雙軌）會引用 SEC-20260908-03 作為「雙軌混淆」的既有症狀，但不重審該 finding 本身；A3（email 殘留）只處理 `care_access` **以外**的 email 鍵，F-5 已收尾的部分不再談。

## 2. 方法與證據邊界

### 2.1 已知事實與推測的標記

- **【事實】**：在審查基準 commit 上可直接以檔案路徑與行號重現；所有 migration 引用都取「最後一次定義」（後面的 migration 覆寫前面的），不是第一次出現的地方。
- **【推測】**：依事實推導的半年後情境或 runtime 行為，未在 staging／production 實測。每一項 finding 的「半年後失敗情境」整段都是推測，只有其前提是事實。

### 2.2 本次無法驗證的部分

| 無法驗證 | 原因 | 影響哪些 finding |
| --- | --- | --- |
| staging／production 的 runtime 狀態：哪些 Supabase Cron job 實際存在、哪些 Function secret 已設定、各 delivery 表是否已有 `delivery_unknown`／`failed_terminal` 列、`weight_records`／`weight_measurement_records` 是否還有寫入 | 本 session 沒有兩個環境的查詢權限，且 Cron 與 secret 都是 Dashboard 狀態、不在 repo | A1、A2、A5、A9 |
| 「30 天 513 個 commit」的長時程判斷 | 本 session 的 clone 是 shallow clone，`git log` 只回溯到 2026-09-06（466 個 commit、12 個日曆日）；migration 檔名時間戳的月分佈為 2026-06：1、07：80、08：64、09：50 | 只影響 §3 的敘述，不影響排序 |
| 39 條仍比對 JWT email 的 policy 在 Postgres 內的實際評估成本 | 需要 `EXPLAIN` 真實資料量 | A3 的效能面只列為推測 |
| Supabase Auth Dashboard 是否仍只啟用 Google provider | repo 外設定（handoff 已列） | A3 前提 |
| 子代理掃描的完整性 | 六個子代理各自窮舉一個面向；主審查者只逐一重驗 §5 每項的關鍵行號（見 §2.3），沒有重跑全部 grep | 所有 finding 的「數量」都應視為下限 |

### 2.3 主審查者直接重驗過的關鍵事實

`DROP TABLE` 在 195 支 migration 中出現 0 次；`add_household_care_recipient` 最新定義的先取 household 再全域查 role 兩段式判斷；`personal_notification_outbox.notification_kind` 的單值 CHECK；`blood_pressure_notification_deliveries.status` 只有兩個值；`care-due-reminders` 對 `23505` 計入 `skipped`；`account_usage_limits.profile_email` 為 PK；`medical-trajectory.md` 第 27–28 行宣稱規劃文件不存在；反向同步 trigger 只寫 5 個 `show_*` 欄位；`delete_user_account` 在 9 支 migration 各有一份完整定義；`hasValidCronSecret` 5 份複製；`src/features` 47 個 `supabase.from(` 分佈於 20 個檔案；`useLatestRequest` 在 `src/features` 只有 2 個檔案使用；70 個 `src/` 檔案帶 demo 分支；`supabase-public/` 在自身目錄外只有 3 處純文件提及；`src/lib/database.types.ts` 沒有任何 `src/` 檔案 import；`src/lib/supabase.ts` 的 `createClient` 未帶泛型。

## 3. 對 issue #848 原文的修正（先講清楚，避免後續票沿用錯數字）

| issue 原文 | 實際（基準 commit） | 證據 |
| --- | --- | --- |
| `vite.config.ts` 703 行內含 6 個 plugin | **372 行，5 個本地 plugin**（`buildProvenancePlugin`／`shareMetaPlugin`／`publicRoutePrerenderPlugin`／`sitemapPlugin`／`localizedManifestPlugin`）＋ 3 個第三方，`plugins` 陣列 8 項；10 個具名 export 全部有單元測試（`tests/unit/pwaManifest.test.ts`、`publicRoutes.test.ts`、`shareMeta.test.ts`） | `vite.config.ts:57,73,114,149,237,280-365` |
| `App.tsx` 手刻 router＋deep link | 423 行、4 個 `useState`、0 個 `useEffect`；沒有任何 router 套件；路由切換在 `PublicRouteSwitch.tsx`（13 條路徑）。「913 行、26 個 `useState`」是 `component-refactor-2026-09.md` 第 43 行的舊數字，#827 已註明不符 | `src/App.tsx:206-225`、`src/components/system/PublicRouteSwitch.tsx:42-54` |
| `*_nenek_*` 舊 RPC | **已全部在 2026-07-28 drop 且未再建立**；`src/` 沒有任何 `rpc('…nenek…')` 呼叫；`subject` 欄位也全數移除。殘留的只是 TypeScript 型別別名 `Subject = string`（代表 patient UUID）與 `useActiveSubject` 這類命名 | `supabase/migrations/20260728020000_remove_legacy_subject_identity.sql:33-51,67`、`src/lib/auth.ts:36` |
| ~12 張健康表的 `recorded_by/created_by TEXT` 無 FK | **22 個欄位、20 張表**；其中只有 3 張同時有 `*_user_id` UUID 欄位 | 見 A3 |
| 三個佇列＋一條直送 | **一個真佇列（outbox，有 `FOR UPDATE SKIP LOCKED` claim RPC）＋ 兩張「先保留再送」的去重帳本（`care_due_reminder_deliveries`、`notification_deliveries`）＋ 一條直送**；cron secret 在通知領域是 3 個（直送走 JWT、沒有 cron secret），repo 全域 5 個 | 見 A1 |
| 30 天 513 個 commit | 無法驗證（shallow clone，見 §2.2） | — |

其餘 issue 原文的敘述（email 殘留、legacy 表、同步 trigger、`profiles`／`app_profiles`、audit 缺口、demo 層、`supabase-public/` 死目錄、文件漂移）都成立，且多數比原文估計更大，見 §5。

## 4. 排序總覽

排序依「半年後失敗的代價 × 拖越久修復成本上升的速度」，不依工作量。嚴重度只反映維護性與照護安全，不是安全漏洞等級（安全漏洞走 handoff）。

| # | Finding | 嚴重度／信心 | 半年後最可能的失敗 | 建議模型 | 既有 issue |
| --- | --- | --- | --- | --- | --- |
| A1 | 通知：四套 delivery 語意，三套不可重試，直送帳本只有兩個狀態 | **High**／高 | 危險血壓的個人化通知遇 Telegram 5xx 後永遠不再送，沒有任何 sweeper | 設計 `[Fable]`，實作 `[Opus / Astra]` | #603、#819、#415 |
| A2 | 授權雙軌：11 支 household RPC 都用「第一筆 membership」決定家庭，沒有 `p_household_id`，沒有跨軌一致性測試與前端 capability resolver | **High**／高 | 第二個多家庭使用者出現時，SEC-20260908-03 的變體在另一支 RPC 重演 | `[Opus / Astra]` | SEC-20260908-03（症狀）、#814／#544 RLS 矩陣 |
| A3 | email 身分殘留在 `care_access` 之外：配額 PK、22 個 TEXT 記錄者欄位、39 條 policy、3 條管理者字面值 policy、離線佇列 key | **High**／高 | 使用者換 Google 帳號 email 後配額掉回 free、離線血壓佇列孤兒化、歷史紀錄「記錄者」分裂 | `[Opus / Astra]` | #590（已結）、care-access-identity-binding §8 明列不做 |
| A4 | staging／production 營運邊界：Cron 與 Function secret 全在 Dashboard、CI 不同步也不檢查、17 支 Function 只有 3 支對缺 secret fail-soft | **High**／中 | promotion 後某支 Function 在 production 因缺 secret 回 500，直到照護者漏收提醒才被發現 | `[Opus]`（CI／secret 邊界屬高風險類別） | #826、#808、#722 |
| A5 | legacy 相容表從未 drop：3 張死體重表仍被 trigger 餵資料、偏好表凍結在 5 個 flag 卻雙向同步、`profiles`／`app_profiles` 雙身分、`delete_user_account` 手抄 9 次 | **Medium-High**／高 | 新模組 migration 忘了複製 `delete_user_account`，刪帳號留下該模組的健康資料；或下一次 policy 全域改寫又為死表多寫 6 條 | `[Opus / Astra]` | 無（新） |
| A6 | 型別契約雙源：`supabase gen types` 快照 1,939 行無人 import、`createClient` 未型別化、手寫 `src/types/database/*` 才是真契約但沒有任何機制對照 migration | **Medium**／高 | migration 改欄位、手寫型別沒跟上，`tsc` 全綠但 runtime 拿到 `undefined` | `[Sonnet]` | #833（只補了產生說明）、#836 |
| A7 | audit 覆蓋：全 repo 沒有任何 audit trigger，30 張病人級表只有 `medication_plans` 有異動史，四張 change-log 表兩張完全無人讀取，`household_members` 角色變更零痕跡 | **Medium**／高 | 家屬問「誰把媽媽的體重改掉」或「誰把看護降成 viewer」時無法回答 | 設計 `[Fable]`（要先決定「哪些表值得 audit」），實作 `[Opus / Astra]` | #847（CARE-LOOP 會決定資料模型）、#655 |
| A8 | demo 平行層與 feature 直接查表：70 個檔案以全域 `pathname === '/demo'` 分支、沒有 adapter 契約；`src/features` 47 個 `supabase.from(` 只有 2 個檔案有競態防護 | **Medium**／高 | 新模組沒寫 demo 分支導致 `/demo` 打真 Supabase；或切換病人時舊回應覆寫新病人數值（違反 § 3.5 不變量） | `[Opus]`（跨 3 層以上） | component-refactor 延後第 3／4 項、#827 |
| A9 | 文件漂移：`clinical-care-ops.md` 與 `personal-notifications.md` 都寫「規劃中」但已 shipped、兩份 feature 文件宣稱規劃文件不存在、README 是另一個產品、三個互不相容的「北極星」、程式碼引用不存在的 `CLAUDE.md` 設計鐵律 | **Medium**／高 | 下一個 Agent 依「規劃中」文件重做已完成功能，或依 README 判斷產品是血壓 tracker | `[Sonnet]`（#851 已開） | #851、#849、#850 |
| A10 | 路由清單五處手抄、無 `popstate`、`supabase-public/` 死目錄 | **Low**／高 | 新公開頁在 sitemap／prerender／CSP header／robots 四處漏一處 | `[Sonnet]` | #806（症狀）、#441 |

## 5. 逐項 finding

每項固定五段：事實（含證據路徑）、推測（半年後情境）、處置選項（含成本）、建議模型、與既有 issue 的關係。

### A1　通知：四套 delivery 語意，三套不可重試

**事實**

- 四條送出路徑、四張狀態表，狀態機不一致：

  | 表 | 狀態值 | `failure_code` 前綴 | 觸發 |
  | --- | --- | --- | --- |
  | `personal_notification_outbox` | `pending／sending／sent／delivery_unknown／failed_terminal` | `provider_*` | Cron → `personal-notification-drain`，有 `FOR UPDATE SKIP LOCKED` claim RPC（`20260908000528`） |
  | `care_due_reminder_deliveries` | 同上五值 | `telegram_*` | Cron → `care-due-reminders`，列由本輪 cron 在送出前 INSERT |
  | `notification_deliveries` | 同上五值 | `telegram_*` | Cron → `calendar-notifier`，同上 |
  | `blood_pressure_notification_deliveries` | **只有 `pending／sent`** | 無 | 瀏覽器 → `blood-pressure-notifier`（JWT，無 cron secret） |

  證據：`supabase/migrations/20260907194036_add_personal_notification_channels.sql:64,69`、`20260906020000_create_care_due_reminders.sql:54-60`、`20260814030000_create_calendar_notifications.sql:35-41`、`20260910010000_add_notification_subscriptions.sql:58`。
- **兩張帳本與 outbox 都不會重試失敗的送出。** 帳本的去重唯一鍵在 Telegram 呼叫**之前**就 INSERT，落到 `delivery_unknown`／`failed_terminal` 的列之後每一輪都撞 `23505`，程式明確計入 `skipped`：`supabase/functions/care-due-reminders/index.ts:91`、`calendar-notifier/index.ts:116-119`。outbox 的 claim 只選 `status = 'pending'`（`20260908000528:25`），例外中斷的列停在 `sending`（`personal-notification-drain/index.ts:196-199`，註解自承「只能靠稽核列事後排查」）。repo 內沒有任何 sweeper、dead-letter 或 backoff 排程。
- 唯一會重試的是直送（`blood-pressure-notifier/index.ts:30-48`，一次 250 ms），但它的帳本沒有 `delivery_unknown`，失敗列永遠停在 `pending`，程式反過來把 `pending` 當「可重送」（`:128`）——與另外三套語意相反。
- `notification_kind` 是單值 CHECK `('blood_pressure')`（`20260907194036:61`），`notification_subscriptions.channel` 是單值 CHECK `('telegram')`（`20260910010000:16`），而 outbox 的 `channel` 已是 `('telegram','line')`：訂閱閘門表達不了 LINE 訂閱。`notification_subscriptions` 沒有任何 runtime 寫入路徑（只有 migration backfill 一列，`:127-129`），要為新病人開通知得動 migration 或直接改 DB。
- 兩套 failure code 命名（`telegram_http_4xx` vs `provider_http_4xx`）造成一層活的翻譯 shim：`personal-notification-drain/personalNotificationDrain.ts:57-68`。
- 複製而非共用：`hasValidCronSecret` 5 份逐字相同（`calendar-notifier/index.ts:42`、`care-due-reminders/index.ts:23`、`personal-notification-drain/index.ts:32`、兩支 photo-retention），全部用 `===` 比對 header；`readRequiredEnv` 12 份；service-role client 建立 9 份；`updateDeliveryStatus` 3 份只差表名；`sendTelegramMessage` 在 `_shared/telegram.ts:28` 與 `blood-pressure-notifier/index.ts:28` 是**同名不同簽章**的兩個實作（後者 throw、前者回分類物件——這正是直送帳本記不了 `delivery_unknown` 的原因）。
- `calendar-notifier` 是唯一沒有 `*Function.test.ts` 契約測試的 cron Function；`CALENDAR_NOTIFIER_CRON_SECRET` 檢查沒有任何測試斷言。

**推測（半年後）**

- 個人化通知是「危險血壓 100% 送達家屬」這條鏈的第二管道（`docs/product/mobile-capability-roadmap.md:118`）。Telegram 一次 5xx 讓那筆危險值的私訊變成 `delivery_unknown`，之後永遠不會再送；群組直送若同時失敗則停在 `pending`，下一次瀏覽器重叫才會補。沒有人會看 outbox 表，家屬只會覺得「那天沒收到」。
- #819 要把原生 push 接進「既有 outbox drain」：接進來的是一個單值 kind、兩值 channel、無重試的 outbox，push 的 token 失效語意（`Unregistered`）沒有對應狀態可放。
- 第五條通知（#415 主動異常示警若要推播）大概率會被複製成第五張表、第六份 `hasValidCronSecret`。

**處置選項**

| 選項 | 內容 | 成本 | 取捨 |
| --- | --- | --- | --- |
| 1. 只補 sweeper（止血） | 一支新 cron Function 掃 `delivery_unknown` 超過 N 分鐘與 `sending` 超過 M 分鐘的列，依 `attempt_started_at` 決定重送或標 terminal；outbox 與兩張帳本各寫一次 | 1 支 Function、3 段查詢、1 個新 cron secret；不動 schema | 第四份 cron auth 複製；`delivery_unknown` 重送有重複通知風險（設計上已被 ADR-003 否決為「不得盲目重送」，所以只能對 `sending` 逾時列重送、對 `delivery_unknown` 只告警） |
| 2. 統一 delivery 語意（建議） | 一份 ADR 定義單一狀態機與 failure code 命名；`blood_pressure_notification_deliveries` 補齊五值與 `failure_code`；三張表的 `telegram_*` 改 `provider_*`（或反之）並拿掉 shim；`_shared/cron.ts`（`hasValidCronSecret` 常數時間比較＋`readRequiredEnv`＋admin client）；`notification_kind`／`subscriptions.channel` CHECK 擴成可枚舉清單 | 1 份 ADR、1～2 支 migration（改 CHECK、回填 failure code）、5 支 Function 改 import、既有 `*Function.test.ts` 更新；不合併表 | 不解決「帳本先佔鍵再送」的結構問題，但讓四套可用同一份 sweeper 與同一套告警 |
| 3. 三合一為單一 outbox | `care_due_reminders` 與 calendar 的送出也 enqueue 進 outbox，由 drain 統一送；兩張帳本降級為 enqueue 去重鍵 | 2 支 Function 重寫、1 支 migration、`notification_kind` 三值、drain 要學會群組 chat 目的地 | 血壓群組直送仍獨立（它刻意不持 service role）；改動面大，需要 Astra 複審與 staging 真 bot 正反向實測 |

建議順序：先 2 再 1（sweeper 只寫一次），3 留給 #819 的 push 設計一起決定。

**建議模型**：ADR 與狀態機設計 `[Fable]`；migration＋Function 實作 `[Opus / Astra]`（Telegram／LINE 第三方整合、service role、cron secret 都是 AGENTS.md § 5 高風險類別）。

**既有 issue**：#603（個人化通知文件收斂）應等本項 ADR 定案再寫；#819（原生 push 第三管道）**依賴**本項；#415（主動異常示警）若要推播應沿用本項結果而不是開第五張表；SEC-20260908-01 已修的部分不動。

### A2　授權雙軌：`household_members.role` 與 `care_access` 能力位沒有共同的解析點

**事實**

- RLS 已於 2026-07-29 全面改走 `care_access`（`20260729010000_require_explicit_patient_access.sql:1`「家庭成員只是帳號群組，不是病歷授權」）；今天只剩 `households`、`household_members` 兩張表用 `is_household_member()` policy，**沒有任何一張表同時有兩種 policy**。RLS 層的分工是乾淨的。
- RPC 層不是。**11 支 SECURITY DEFINER RPC 以 `household_members.role` 授權，全部沒有 `p_household_id` 參數，全部用 `ORDER BY created_at LIMIT 1` 取呼叫者的「第一個」家庭**：`add_household_care_recipient`（`20260914130000_drop_care_access_email_fallback.sql:587`）、`archive_household_pet`（`:625`）、`add_household_member`（`:659`）、`remove_household_member`（`:692`）、`set_household_patient_access`（`:507`）、`fetch_household_management_patients`／`fetch_household_archived_pets`（`20260913165000:869,902`）、`fetch_household_members`／`fetch_household_patient_access`（`20260729020000:175,81`）、`fetch_household_pets`（`20260822010000:50`，且完全沒有 `care_access` 閘門）、`fetch_current_household_role`（`20260730040000:2`）。
- SEC-20260908-03 的兩段式判斷仍在最新定義：`20260914130000:603-605` 先以第一筆 membership 取 `v_household_id`，再以**不綁 household** 的 `EXISTS (... role IN ('owner','caregiver'))` 查角色。
- 角色 → 能力位的映射是 inline 表達式，散在三處：`add_household_care_recipient`（`:612`）與 `add_household_member`（`:680`）都寫 `role IN ('owner','caregiver')` 同時給 `can_record` 與 `can_manage_medication`；`archive_household_pet`（`:642`）硬寫 `false, false`。`can_share_readonly` 不在任何映射裡。沒有 `role_capabilities()` 之類的單一函式。
- 同步是單向的（household RPC 寫 `care_access`），沒有反向 trigger；`remove_household_member` 只刪寵物的 `care_access`（`:705-707`），人類病人的授權不隨成員移除撤銷。
- 沒有任何測試斷言兩軌一致：`supabase/tests/rls-authorization.sql` 2,231 行裡 `household` 只出現在 fixture 建立；`tests/unit` 30 個提到 `care_access` 的檔案中沒有一個交叉斷言 membership。
- 前端沒有 `permissions.ts`：role 字面值散在 6 個檔案（`HouseholdMemberManagement.tsx` 7 處、`CareRecipientManagement.tsx:69-70` 以 `role === 'owner' || role === 'caregiver'` 決定按鈕），能力位散在 15 個檔案；role 由 `fetch_current_household_role` RPC 取得、能力位由 `src/lib/auth.ts:85` 直接查 `care_access`，兩者沒有任何地方對照。第三條軌（`account_usage_limits` 的 entitlement，`App.tsx:214-216`）又是另一套。

**推測（半年後）**

- 目前 production 實際上只有一個核心家庭，`LIMIT 1` 永遠取到同一列，所以問題不會浮現。第一個真正的多家庭使用者（例如看護同時服務兩戶）出現時，SEC-20260908-03 在 `add_household_care_recipient` 修好了，`fetch_household_pets`／`archive_household_pet` 也會以「第一個家庭」回答第二個家庭的問題——不是外洩，是**功能對第二個家庭直接壞掉**，且每支 RPC 要各修一次。
- 有人在 UI 加「viewer 也能新增寵物」時只改 `CareRecipientManagement.tsx:69`，SQL 端拒絕；或反過來只改 SQL，UI 藏按鈕——兩邊沒有共同來源。

**處置選項**

| 選項 | 內容 | 成本 | 取捨 |
| --- | --- | --- | --- |
| 1. 只修 SEC-03 一支 RPC | 已在 handoff 追蹤，屬安全修補 | 小 | 不處理另外 10 支的結構問題（本文件不重審） |
| 2. 單一 SQL 解析點（建議） | 新增 `current_household_membership(p_household_id UUID DEFAULT NULL)` 回傳呼叫者在**指定**家庭的 membership 列（NULL 時才退回單一家庭，且多家庭時 RAISE）；11 支 RPC 改呼叫它並補 `p_household_id` 可選參數；`role_capabilities(role)` 一支 IMMUTABLE 函式取代三處 inline 映射；`rls-authorization.sql` 補 viewer(A)+caregiver(B) fixture 的反向斷言 | 1 支 migration（11 支 `CREATE OR REPLACE`、2 支 helper）、前端 `tenant.ts` 帶 household id、1 組 SQL 測試 | `CREATE OR REPLACE` 11 支 RPC diff 大，但每支只改前置查詢；要沿用 F-5 單位 2 的「錯誤訊息逐字不變」做法讓 reviewer 能 diff 對照。新增 `p_household_id` 會改變函式簽章，`CREATE OR REPLACE` 不會取代舊簽章而是新增一個 overload，migration 必須逐支先 `DROP FUNCTION` 舊簽章，否則舊版本仍可被直接呼叫、繞過新的家庭選擇（本 repo 已有同類前例：`20260804040600_fix_daily_limit_function_overload.sql`） |
| 3. 廢 `household_members.role`，全部走 `care_access` | 家庭管理也改成 patient 級授權 | 大：10+ RPC 重寫、UI 家庭頁重做、資料回填 | `households` 是 onboarding 與寵物歸屬的容器，不只是授權；不建議 |
| 4. 前端 capability resolver | `src/lib/permissions.ts` 匯出 `resolveCapabilities({ role, careAccess })`，UI 只問它 | 1 個模組＋替換 15 個檔案的判斷 | 可與 2 平行；單獨做只治表面 |

**建議模型**：`[Opus / Astra]`（授權判斷、SECURITY DEFINER、RLS 測試，AGENTS.md § 5 高風險類別）。

**既有 issue**：SEC-20260908-03 是本項的既有症狀（handoff 標 `待修`）；#814／#544 的 RLS 矩陣驗收應加入多家庭 fixture；#847（CARE-LOOP）若新增 `patient_appointments` 等表，應先確定走哪一軌。

### A3　email 身分殘留在 `care_access` 之外

F-5 四單位已讓 `care_access` 與 101 條下游 policy 的**授權**看 `auth.uid()`。以下是 F-5 明列不做（`care-access-identity-binding.md` §8）而至今沒有票的部分。

**事實**

- **配額與 entitlement 以 email 為主鍵**：`account_usage_limits.profile_email TEXT PRIMARY KEY`（`20260730070000_add_account_usage_limits.sql:6`），後續 7 支 migration 只加 tier／limit 欄位，沒有 `user_id`；讀取路徑 `current_account_daily_limit()` 以 `LOWER(COALESCE(auth.jwt() ->> 'email', p_actor_email))` 查表（`20260810100000:134,146-147`），血壓、體溫、時間線的每日上限 trigger 傳的是列上的 `recorded_by`／`created_by` TEXT（`20260810040100:25`、`20260810100000:216`、`20260812010000:158`）。
- **entitlement 稽核只記 email**：`account_entitlement_change_logs.actor_email／target_email TEXT NOT NULL`，沒有 `*_user_id`（`20260910150000:166-178`）；四天後建立的 `app_admin_config_audit_log` 卻已用 `actor_user_id UUID`（`20260914110000:26`）——同一週兩種做法。
- **22 個 TEXT 記錄者欄位、20 張表、無 FK**（完整清單見子代理報告，代表性：`blood_pressure_records.recorded_by`、`care_timeline_entries.created_by`、六張 `pet_*` 的 `recorded_by／administered_by`、`patient_lab_results.recorded_by`、`patient_medication_appearance_overrides.updated_by`）。只有 `blood_pressure_records`、`prn_medication_events`、`medication_plan_change_logs` 同時有 `*_user_id` UUID 欄。
- **39 條 live policy 仍比對 `auth.jwt() ->> 'email'`**（重播 195 支 migration 取最後定義）：22 條是「記錄者稽核」（`WITH CHECK (LOWER(recorded_by) = LOWER(auth.jwt() ->> 'email'))`，`20260915100000` 檔頭第 22–23 行明寫刻意逐字保留）、3 條 `active_patient_preferences`（該表 PK 仍是 `profile_email`，`20260728020000:8-21`）、**3 條以管理者 email 字面值硬寫的 policy**（`medication_plans`「admin can manage medication plans」`20260711050000:71`、`medications`「admin can manage medication catalog」`20260711010000:54`、`profiles`「admin can read profiles」`20260711030000:7`——這三條沒有跟著 `20260914100000` 改讀 `app_admin_config`）、11 條藥品目錄「email 是否在 `profiles`」的讀取 policy。
- `medication_plans.account_email`／`medication_intake_logs.account_email` 仍 `NOT NULL`，plan RPC 仍寫入（`20260914120000:282`）；legacy intake log 的唯一索引是 `(LOWER(account_email), medication_id, care_date) WHERE plan_id IS NULL`（`20260810040000:60-63`）。
- 前端：`src/lib/bloodPressurePendingQueue.ts:45-48` 的離線佇列 storage key 含 email；`src/lib/auth.ts:21` 匯出 `ADMIN_EMAIL` 常數；14 個 feature 頁面的 insert payload 直接塞 `recorded_by: userEmail.toLowerCase()`；`WeightPage.tsx:137` 同一筆同時寫 `profile_email` 與 `recorded_by`。

**推測（半年後）**

- 使用者換 Google 帳號 email（F-5 單位 4 的 `sync_care_access_profile_email` 讓授權不掉）：**配額掉回 `free`**（新 email 查不到 `account_usage_limits`）、AI 藥單草稿 entitlement 消失、離線血壓佇列裡未送出的紀錄留在舊 key 下再也不 flush、歷史紀錄的「記錄者」從此分成兩個字串、`active_patient_preferences` 的病人選擇重置。這些都不是安全事件，所以不會進 handoff，只會變成「客訴＋手動 SQL」。
- 管理者帳號若換 email：`app_admin_config` 改了，三條字面值 policy 沒改，管理者對 `medications`／`medication_plans` 的 DML 權限靜默消失。
- 22 個 TEXT 欄沒有 FK，`delete_user_account` 的 CASCADE 清不到它們，帳號刪除後 email 字串永久留在健康表——GDPR 式的刪除請求無法乾淨完成。

**處置選項**

| 選項 | 內容 | 成本 | 取捨 |
| --- | --- | --- | --- |
| 1. 帳號層改 uid（建議先做） | `account_usage_limits`／`account_entitlement_change_logs`／`active_patient_preferences` 加 `user_id UUID REFERENCES auth.users ON DELETE CASCADE`，沿用 F-5 單位 1 的 backfill（只綁恰好一筆）與 trigger 補值；`current_account_daily_limit()` 改收 `auth.uid()`；三條字面值 admin policy 改 `is_admin_email()` 或直接 drop | 1～2 支 migration、`set_account_entitlement` 與 admin Edge Function 改參數、`ADMIN_EMAIL` 常數移除；F-5 已有現成 pattern 與測試寫法 | 每日上限 trigger 目前吃 `NEW.recorded_by`，要改成 `auth.uid()`（trigger 內可用）；staging 要驗核心帳號配額不變 |
| 2. 健康表補 `*_user_id` 雙欄 | 20 張表加 `recorded_by_user_id UUID DEFAULT auth.uid()`，22 條記錄者 policy 改比對 uid；`recorded_by` TEXT 降為顯示快照 | 1 支大 migration（沿用 `20260915100000` 的「只換一個述詞、其他逐字保留」手法）、前端 14 個 payload 可不改（DEFAULT 補） | 歷史列回填要 JOIN `auth.users` 且只綁唯一匹配；不建議與 1 同一 PR |
| 3. 只修字面值 policy 與離線 key | 三條 admin policy 改 `is_admin_email()`；pending queue key 改 `user_id` 並做一次舊 key 搬移 | 半天 | 止血，不處理主鍵 |

**建議模型**：`[Opus / Astra]`（RLS、migration、entitlement 屬高風險類別）。選項 3 可 `[Sonnet]`。

**既有 issue**：#590 已結（F-5）；`care-access-identity-binding.md` §8 第 1、2、3 條就是本項範圍，當時明寫「另開 issue」但沒有開；F-6 類型的 admin policy 已有處置紀錄但三條字面值 policy 仍在。

### A4　staging／production 營運邊界：Cron 與 secret 都不在 repo，CI 不同步也不檢查

**事實**

- 兩個 migration workflow 都 `supabase functions deploy` 全部 17 支 Function（`staging-supabase-migrations.yml`、`production-supabase-migrations.yml` 差異只有 project id 來源與註解），**沒有任何 workflow 執行 `supabase secrets list／set`**（grep 全部 `.github/workflows/*.yml` 為 0）。`environment-variables.md`「Edge Functions 部署與 Secrets 分界」一段自承 secret 要維護者在 production 手動設。
- 每個環境要手動設定的 server-only secret 至少 15 個（Telegram ×3、LINE ×2、Resend ×3、Gemini ×2、Vision ×1、Calendar SA ×1、share ×2、5 個 cron secret、`ADMIN_EMAIL`），且 5 個 cron secret 刻意不共用（`docs/platform/supabase.md:51`）。
- 三條 Cron job（每分鐘 drain、每日 care-due、每 5 分鐘 calendar）與兩條 retention cron 都是 Dashboard 手動建立：195 支 migration 沒有任何 `cron.schedule`，`vercel.json` 沒有 `cron` 鍵。repo 無法回答「production 目前有哪些 cron 在跑」。
- 17 支 Function 只有 3 支對缺 secret 回 503 fail-soft（`medication-ocr`、`medication-ai-draft`、`blood-pressure-notifier`）；其餘 `readRequiredEnv` 直接 throw → 500，log 裡才看得到。
- #808 的根因是前端 header 大小寫（PR #825），但調查時「先懷疑 Gemini 模型被棄用」是合理的：`GEMINI_MODEL` 是版本化字串、只存在 Dashboard，repo 沒有它的值也沒有 smoke。#826 補的 smoke test 只 `workflow_dispatch`，且三個 secret 沒設就「視為通過」。
- `verify-supabase-migrations.yml` 的 replay 對「需要真實 `auth.users` 歷史」的 migration 結構性測不到（#768 已開）。

**推測（半年後）**

- 一次 promotion 帶進新 Function 或新 secret 名稱（例如 A1 選項 2 的 `_shared/cron.ts` 若換 env 名），staging 因為有人手動設好而綠，production 沒設 → 該 Function 每次呼叫 500。cron 類的失敗沒有使用者看得到，會持續到照護者說「最近都沒收到到期提醒」。
- Gemini 官方棄用 `GEMINI_MODEL` 指到的版本：兩個環境同時壞，症狀與 #808 一模一樣，smoke test 因為沒人按沒有預警。
- 有人清 Supabase 專案或重建 staging（#722 備份還原演練會做這件事）：cron job 不會跟著還原，restore drill 通過但通知全停。

**處置選項**

| 選項 | 內容 | 成本 | 取捨 |
| --- | --- | --- | --- |
| 1. 部署後 secret 存在性檢查（建議先做） | workflow 在 `functions deploy` 後 `supabase secrets list` 比對一份 tracked 的 `supabase/functions/required-secrets.json`（只列名稱），缺少即 fail；`config.toml` 每支 Function 旁註明所需 secret 名 | 1 個 JSON、2 個 workflow 各加一步、1 個 unit test 鎖住 JSON 與 `Deno.env.get` 掃描一致 | 只查名稱不查值；production workflow 已在 Environment reviewer 後面，多一步不改變閘門 |
| 2. Cron 進 repo | 以 `pg_cron` migration（`cron.schedule` + `net.http_post` 帶 secret 從 `vault`）取代 Dashboard cron，或至少 tracked 一份 `docs/operations/cron-inventory.md` 列出名稱／頻率／目標 Function／secret 名 | migration 版需要 `pg_net`＋vault 權限，且 secret 值進 vault 仍是手動；文件版半天 | migration 版讓 staging／production cron 完全對稱、restore drill 可驗；但把 cron 定義放進 forward-only migration 要處理「改頻率」的 migration 慣例 |
| 3. Function 一律 fail-soft＋健康端點 | `_shared/env.ts` 統一 `readRequiredEnv`，缺值回 503 帶 `configuration_error`；每支 Function 支援 `GET /health` 回「設定齊全與否」不打第三方 API；#826 smoke 改成每週一次只打 health，不燒 token | 12 份 `readRequiredEnv` 收斂＋17 支 Function 各加一個分支 | 與 A1 選項 2 的 `_shared` 收斂同一個 PR 最省 |

**建議模型**：`[Opus]`（CI／部署／secret 邊界屬第三方整合與發布流程高風險類別；不需 Astra 除非動 vault）。

**既有 issue**：#826（smoke test 只手動）、#808（已修，本項是其結構原因）、#722（備份還原演練應涵蓋 cron／secret 清單）、#768（replay 測不到 auth 歷史）、#603（個人化通知上線 checklist 的 B／C 階段就是手動 cron）。

### A5　legacy 相容表從未 drop，且每張都還在被維護

**事實**

- **195 支 migration 沒有一句 `DROP TABLE`。** 所有「相容」「舊版 PWA 快取」的表都仍在、仍有 grant、仍被每一次 policy 全域改寫觸及。
- 體重三代：`weight_records`（2026-07-23）、`weight_measurement_records`（08-12）、`patient_weight_measurement_records`（08-12）＋`weight_settings`。`src/` 只讀寫第三代（`WeightPage.tsx:72,139-140`、`WeightTrendPanel.tsx:39`、`useCareAnomalySignals.ts:86`、`accountExport.ts:331,389`）。`weight_records` 在 `src/` 沒有任何查詢（只有型別），但 `scripts/seed-staging.ts:909` 仍寫它，觸發兩個 AFTER trigger 同時寫進第二、三代（`20260812090000:64-67`、`20260812100000:81-84`）。`weight_measurement_records` **在 `src/` 連型別都沒有**，RLS 是事後補啟用的（`20260813120000`），仍 `GRANT SELECT, INSERT, UPDATE TO authenticated`（`20260901020000:52`）。`weight_settings` 原本是 `weight_records` INSERT policy 的閘門（`20260728020000:65`），`20260812060600:74` 換成 `care_access` 後就不再閘任何東西，但 `20260915100000:987,994` 還為它改寫兩條 policy。
- 偏好表雙向同步：`user_patient_care_preferences`（PK `(user_id, patient_id)`）↔ `patient_daily_care_preferences`（PK `patient_id`）由 `20260814020000` 的兩個 trigger 雙向同步，遞迴靠 `pg_trigger_depth() > 1` 擋。**legacy 表建立後沒有任何 `ALTER TABLE`，凍結在 5 個 `show_*`；shared 表已長到 16 個欄位**（pet ×5、dementia、fluid、care_reminders、visit_questions、lab_results、`use_custom_template`）。反向 trigger 只回寫 5 個欄（`:144-152`），前端 `dailyCarePreferences.ts:78` 每次 upsert 都寫 `updated_at`，所以每次存偏好都觸發一次對死表的 UPDATE。`src/` 對 legacy 表零查詢。
- `profiles`（PK `email`，帶 `patient_id`，是 policy／RPC 的主要查詢對象）與 `app_profiles`（PK `user_id`，`email UNIQUE`）並存；同步只發生在 `auto_provision_profile()`（`20260914150000:125-127`）；前端改顯示名稱時 `profiles` 的 update 有 await 與錯誤檢查、`app_profiles` 的是 `void`（`src/lib/auth.ts:261,264`）。兩支 migration 明寫「`app_profiles` 不是權威來源，要走 `auth.users`」（`20260913165000:414`、`20260907194036:334`）。
- `delete_user_account()` 在 **9 支 migration** 各有一份完整定義，最新在 `20260914042410_add_patient_lab_results.sql:278`；每一支新模組 migration（體溫、四筆體重、十二筆體重、體液、lab）都要把整支函式抄一遍、在裡面加自己的 `DELETE`。
- `active_patient_preferences` 是唯一仍以 `profile_email` 為 PK 且 SELECT policy 仍看 JWT email 的活表（`20260915100000:34` 註明例外），`src/` 仍在用（`activeSubjectPreference.ts:14,20`）。

**推測（半年後）**

- 下一個新模組（#847 的 Concern／Appointment、#823 HealthKit 匯入）忘了複製 `delete_user_account`：刪帳號後該模組的病人資料留在庫裡，沒有測試會抓到（現有測試只 `toContain` 特定字串）。
- 下一次 policy 全域改寫（例如 A3 選項 2、或 Supabase linter 要求 `(SELECT auth.uid())`）要為 3 張死表再寫 6 條 policy，reviewer 逐條看的成本照算。
- 有人為 `patient_daily_care_preferences` 加第 17 個欄位並改 PK 或 rename，反向 trigger 靜默失敗或 `pg_trigger_depth` 邏輯被打破，偏好儲存整個炸掉——而錯誤來自一張沒有人記得的表。

**處置選項**

| 選項 | 內容 | 成本 | 取捨 |
| --- | --- | --- | --- |
| 1. 三段式退役（建議） | (a) 先量：在 staging／production 唯讀查 `weight_records`／`weight_measurement_records`／`user_patient_care_preferences`／`weight_settings` 最近 30 天寫入數（只看計數）；(b) 若為 0：一支 migration `DROP TRIGGER` 四個同步 trigger、`REVOKE ALL` 四張表、`RENAME TO *_retired_2026xx`（不 DROP，保留一個 release 週期）；(c) 下一個 release `DROP TABLE`。`seed-staging.ts:909` 改寫第三代表 | 1 次唯讀查詢、2 支小 migration、`seed-staging.ts` 一處、`downstreamPolicyUidOnlyMigration.test.ts` 的清單同步 | AGENTS.md § 3.1 把 `drop table` 列為需明確同意的破壞性操作：本選項的 DROP 必須由 owner 明確核准，Agent 只能做到 (b) |
| 2. `delete_user_account` 改成資料驅動 | 以 `ON DELETE CASCADE` 補齊所有 `user_id` 外鍵，函式只刪 `auth.users` 可達的根（即該帳號自己寫入的列）；`information_schema` 動態列舉只能用來找出「哪些表缺 `user_id` 外鍵」以便補齊，**不得**用 `patient_id` 做帳號刪除的 cascade 依據——`patient_id` 只表示資料屬於哪個病人，同一病人常有多個照護者共同寫入（AGENTS.md § 3.5），用 `patient_id` 級聯刪除會連帶刪掉其他照護者的紀錄；`patient_id` 級聯只在刪除病人本體（而非某個照護帳號）時才適用 | 1 支 migration 審 30 張表的 FK 動作 | 動態列舉在 SECURITY DEFINER 內有 search_path 風險，要 Astra 看；且必須明確區分「刪 actor 的 `user_id`」與「刪病人本體」兩種語意，不能共用同一份動態列舉結果 |
| 3. `profiles`／`app_profiles` 收斂 | `profiles` 加 `user_id UNIQUE` 並讓 `app_profiles` 變 view（或反之），前端只寫一張 | 中：policy 與 RPC 讀 `profiles(email)` 的地方很多 | 可等 A3 選項 1 一起，因為兩者都在把「帳號層」從 email 搬到 uid |

**建議模型**：`[Opus / Astra]`（drop／rename 表、trigger、`delete_user_account` 屬不可逆 migration）。選項 1(a) 的唯讀計數要有查詢權限的人執行。

**既有 issue**：無直接對應；`vitals.md:89` 與 `TECHNICAL.md` 都記錄了「保留給舊版快取 PWA」的理由，但沒有寫退役條件或期限。

### A6　型別契約雙源：產生的快照無人 import，手寫型別無人對照

**事實**

- `src/lib/database.types.ts`（1,939 行，`supabase gen types` 快照）**沒有任何 `src/` 檔案 import 它**（grep `database.types` 只命中三處註解）；`src/lib/supabase.ts:21` 的 `createClient` 沒有帶 `<Database>` 泛型，所以所有 `supabase.from()` 回傳都是 `any` 形狀。
- 真正被 65 個檔案 import 的是手寫的 `src/types/database/*`（#836 拆成 9 個檔）；它與 migration 之間沒有任何自動對照（沒有 script、沒有 CI、沒有測試比對欄位名）。
- `data-model.md`「database.types.ts 產生流程」與 #833 已確認快照漏更新（缺 `20260915110000`～`130000` 三支 migration 的表），並補了 `types:generate` script——但 script 產出的檔案仍然沒人用。

**推測（半年後）**

- migration 改欄位名或 CHECK 值（例如 A1 把 `telegram_*` 改 `provider_*`、A3 把 `recorded_by` 降級），手寫型別沒跟上，`tsc` 全綠，runtime 讀到 `undefined` 或 insert 被 RLS／CHECK 拒絕；#808 就是這一類「兩端各自對、中間契約沒人管」的失敗。
- 有人終於把 `<Database>` 掛上 `createClient`，1,939 行快照立刻與 65 個檔案的手寫型別衝突，變成一次大型型別修正。

**處置選項**

| 選項 | 內容 | 成本 | 取捨 |
| --- | --- | --- | --- |
| 1. 快照當契約檢查，不當 import（建議） | CI 在 `verify-supabase-migrations` 的 local replay 後跑 `types:generate:local`，`diff` 與 tracked 快照不一致就 fail（強迫快照跟 migration 走）；另加一個 unit test 用快照的 `Tables<'x'>['Row']` 對手寫型別做 `satisfies`／結構相容斷言 | 1 個 workflow step、1 個測試檔；前端零改動 | replay 目前缺 auth 歷史（#768）可能讓 `types:generate:local` 在 CI 跑不起來，要先確認 |
| 2. 直接以快照為唯一來源 | `createClient<Database>`，手寫型別改為 `Tables<'…'>` 的別名 | 65 個 import 點逐一對齊，型別錯誤量未知 | 一次到位但風險集中；可作為 1 穩定後的第二步 |
| 3. 刪快照 | 承認手寫型別是契約，刪 `database.types.ts` 與 `types:generate` | 最便宜 | 放棄唯一能自動對照 schema 的工具 |

**建議模型**：`[Sonnet]`（CI script 與測試，明確需求）；選項 2 若做，`[Opus]`。

**既有 issue**：#833（只補產生流程說明）、#836（手寫型別拆檔），兩者都沒有處理「誰對照誰」。

### A7　audit 覆蓋：沒有 audit 層，只有一張表有異動史

**事實**

- 全 repo 28 個 `CREATE TRIGGER` 都是配額、欄位推導、不可變保護、legacy 同步、身分綁定；**沒有任何 `AFTER INSERT OR UPDATE OR DELETE` 寫入 audit 表的 trigger**。四張 change-log 表（`medication_plan_change_logs`、`medication_catalog_change_logs`、`account_entitlement_change_logs`、`app_admin_config_audit_log`）全由 RPC 內的顯式 `INSERT` 寫入。
- 30 張病人級／授權表中，**只有 `medication_plans` 有異動史**（透過 change log），`prn_medication_events` 有 `voided` 軟刪除，`care_due_reminders`／`patient_visit_questions` 有生命週期 status。其餘（血壓、體溫、三代體重、體液、餐次、失智、六張寵物表、lab、時間線、`care_access`、`household_members`、`patients`）UPDATE／DELETE 不留任何痕跡。`household_members` 連 `updated_at` 都沒有（`20260724040000:27-33`），`add_household_member` 的 `ON CONFLICT DO UPDATE SET role` 讓角色變更零痕跡。
- 四張 change-log 表有兩張完全無人讀取：`medication_catalog_change_logs`、`account_entitlement_change_logs` 在 `src/`／`api/`／Function 裡沒有任何讀取；`app_admin_config_audit_log` 設計上只有 service_role 可讀。`patient_share_consents` 不屬於這四張 change-log 表，且被 `redeem_patient_share_link`／`get_patient_share_summary` 兩支 RPC 在每次兌換／查詢時 JOIN 讀取（`20260904010000_add_patient_share_link_redemption.sql:86,128`、`20260913165000_bind_care_access_rpcs_to_auth_user_id.sql:701,752`），並由 `share-link-exchange`／`share-summary` 兩個 Edge Function 呼叫，是仍在使用中的授權相依表，不應計入本項「無人讀取」的盤點。
- issue 原文點名的 `care_due_reminders`、`patient_visit_questions`、寵物六表、`meal_*`、`dementia_care_records`、`patient_weight_measurement_records` 全部確認無 audit；原文沒點名但同樣無 audit 的還有血壓、體溫、lab、時間線與兩張授權表。

**推測（半年後）**

- 家屬或看護之間發生「是誰把媽媽昨天的體重／血壓改掉」「是誰把我從 caregiver 改成 viewer」的爭議時，資料庫無法回答；`medical-trajectory.md` 的醫療軌跡是給醫師看的，不是操作稽核。
- #847（CARE-LOOP）若引入 Concern → Outcome 的狀態流轉，沒有 audit 層就等於每一個新表要各自決定要不要留痕跡——會再長出第五、六張各自為政的 log 表。

**處置選項**

| 選項 | 內容 | 成本 | 取捨 |
| --- | --- | --- | --- |
| 1. 通用 audit trigger（建議，但先設計） | 一張 `record_change_logs(table_name, row_id, patient_id, action, actor_user_id, actor_email_snapshot, before, after, at)` ＋ 一支通用 trigger function，只掛在「數值可被改寫的病人級表」；RLS 以 `patient_id` 沿用 `care_access`；先不做 UI | 1 份短 ADR 決定「哪些表」與「保留多久」、1 支 migration、每張表一行 `CREATE TRIGGER` | JSONB before/after 會放大儲存量（Supabase 免費額度）；`recorded_by` TEXT 若不先做 A3 選項 2，actor 只能記 JWT email 快照 |
| 2. 只補授權表 | `care_access`、`household_members` 各加 audit trigger 與 `updated_at` | 小 | 回答「誰改了權限」但不回答「誰改了數值」 |
| 3. 統一四張 change-log 為一張 | 把 catalog／entitlement／admin-config 的 log 併進選項 1 的表 | 中 | 三張表各自有 RLS 語意（admin log 只 service_role），合併反而複雜 |

**建議模型**：範圍設計 `[Fable]`（要跨 #847 的 domain model 與 A3 的身分欄一起決定）；實作 `[Opus / Astra]`（新表＋RLS＋trigger）。

**既有 issue**：#847（先決定 domain model，再決定 audit 粒度）、#655（分享摘要若要顯示「最近誰改了什麼」依賴本項）。

### A8　demo 平行層與 feature 直接查表

**事實**

- 沒有 adapter 介面。`isDemoMode()` 讀 `window.location.pathname === '/demo'`（`src/lib/demoStorage/store.ts:55-57`）；**70 個 `src/` 檔案**帶 demo 分支（34 個在 `features/`、12 個 `hooks/`、17 個 `lib/`），14 個檔案不呼叫 `isDemoMode()` 而直接重寫 `pathname === '/demo'`（`useAuth.ts:14,44,52,105` 一檔四次）。分支謂詞不一致：`useBpRecords.ts:53` 要 `isDemoMode() && isDemoPatientId()`，`PetAppetitePage.tsx:38` 只看 `isDemoMode()`；`useBpRecords.ts` 自己就有兩套 demo fallback（`:53` localStorage 覆蓋、`:104` 寫死劇本）。demo 專用程式碼 1,641 行。
- `src/features` 有 **47 個 `supabase.from(` 分佈於 20 個檔案**（`PetTrendPanel.tsx` 6 個、`useTrajectoryEntryEditor.ts` 5 個含手寫補償刪除 `:188`、`WeightPage.tsx:139-140` 手寫 upsert），`src/lib` 23 個、`src/hooks` 0 個；RPC 相反（features 3、lib 43）。25 個 import supabase client 的 feature 檔案只有 2 個用 `useLatestRequest`（`useCareTrajectoryFeed.ts`、`usePreVisitSources.ts`）。`overview.md`「讀取層的共用基礎元件」明寫這是違反 § 3.5 不變量的風險。
- demo 有測試（13 個測試檔、`demoStorage.test.ts` 615 行），且寵物頁有一對 demo／Supabase 平行測試（`petCarePagesRender.test.ts`／`petCarePagesSupabase.test.ts`）；其他模組沒有平行對。

**推測（半年後）**

- 新模組（#847、#823）照最近的頁面抄：一定會再出現一個 `if (isDemoMode())` 加一個 `supabase.from()`，沒有競態防護；教學導覽 v2（`demo-tutorial-expansion-plan.md`）要為每個新模組各補一份 demo storage。
- 快速切換兩位病人時，`PetTrendPanel` 六個查詢中較慢的一個把前一位寵物的血糖畫進目前寵物的圖——正是 § 3.5 禁止的情境，而且沒有測試會抓到。

**處置選項**

| 選項 | 內容 | 成本 | 取捨 |
| --- | --- | --- | --- |
| 1. 讀取 hook 工廠（component-refactor 第 4 項） | `createPatientScopedReader({ demo, remote, cacheKey })` 內建 `useLatestRequest`、`localCache`、demo 分支；新模組只能用它 | 1 個 hook 工廠＋以 `useBpRecords` 為第一個遷移對象 | component-refactor 文件自己說「要先完成第 3 項才划算」——但第 3 項（把 47 個查詢搬進 lib）是一次大搬家，可分模組進行 |
| 2. 資料層契約先於搬家 | 定義 `PatientDataSource` 介面（read／write／list per domain），`demoStorage/*` 與 `src/lib/*` 各實作一份，`isDemoMode()` 只在一個 provider 決定注入哪份；feature 頁面禁止 import `supabase` client（ESLint `no-restricted-imports` 對 `src/features/**`） | 介面設計半天、ESLint 規則一條、之後每個模組各一張 `[Sonnet]` 搬家票（pet-care 6 頁、vitals 3 頁、nutrition 2、postop 1、dementia 1、care-family 3、today 2） | ESLint 規則會立刻讓 20 個檔案紅，要先加 allowlist 再逐檔移除 |
| 3. 只補競態防護 | 23 個沒有 `useLatestRequest` 的 feature 檔案各加一行 | 小、機械 | 不解決 demo 與資料層問題，但直接關掉 § 3.5 風險 |

建議 3 先做（安全不變量），2 的介面與 ESLint 規則接著，1 隨 2 的搬家逐模組落地。

**建議模型**：介面與 ESLint 規則 `[Opus]`（跨 3 層）；逐模組搬家 `[Sonnet]`；選項 3 原標 `[Sonnet]`，**已於第二輪排序更正為 `[Opus / Astra]`**（屬 AGENTS.md § 5「敏感健康資料存取路徑」，見 [`maintainability-review-2026-09-second-sort.md`](./maintainability-review-2026-09-second-sort.md) §4）。

**既有 issue**：`component-refactor-2026-09.md` 延後第 3／4 項（本項是其架構層前提，不重審元件）；#827（拆檔票，不對正在拆的檔案下結論，搬家應等其 PR 合併）；#806（service worker 掩蓋路由缺口）與 demo 的 pathname 判斷共用同一個弱點。

### A9　文件漂移：狀態、定位與北極星

**事實**

- `docs/product/clinical-care-ops.md:4,17` 與 `TECHNICAL.md:357` 都寫「規劃中（2026-09-11）」，但 S1–S5（#684／#686／#685／#687／#688）已於 2026-09-13～14 全部合併（`CHANGELOG.md`、`src/lib/medicalTrajectory.ts`、`preVisitBrief.ts`、`20260914043552`、`20260914042410`、`src/lib/adapters/nhi/labs.ts`）；該文件 `:318` 仍把 S4 白名單列為 blocked 的開放決策，`src/lib/labResults.ts:2` 已 ship 同一份白名單。
- `docs/features/medical-trajectory.md:27-32` 與 `pre-visit-brief.md:22-25` 各有一節「規劃文件缺口說明」宣稱 `clinical-care-ops.md`「實際不存在」；它自 2026-09-11 就存在且含被引用的 §4／§5.1／§5.2／§6／§10。兩份 feature 文件比規劃文件晚兩天建立。
- **同樣的漂移還有一份 issue 原文沒點名的**：`docs/features/personal-notifications.md:9` 與 `TECHNICAL.md:318` 都寫「規劃中／尚未實作」，但 `personal_notification_outbox`、claim RPC、`personal-notification-drain`、`telegram-webhook`／`line-webhook`、`user_messaging_links` 全部已在 repo（見 A1）。
- `README.md:15-33` 仍把產品描述為「看護輸入媽媽血壓」的單家庭血壓 tracker，功能清單沒有寵物、餐次、時間線、到期提醒、回診提問、醫療軌跡、lab、邀請、個人化通知、AI 藥單、原生殼；tech 表列 Cloudflare Tunnel（`:47,112-118`）。`docs/operations/portfolio-pipeline.md:43` 把 2026-09-07 已移除的 Cloudflare Worker寫成現行 stack。
- 「北極星」三個互不相容的定義：A 成長指標「每週至少 3 天有紀錄的活躍家庭數」（`acquisition-and-distribution.md:217`）；B 三軸「省看護分鐘數、省溝通分鐘數、警報精準度」且「第 3 條＝危險血壓 100% 送達」（`mobile-capability-roadmap.md:68,118`）；C 程式碼註解引用「北極星設計鐵律第 3 條＝只有需要現在行動的事才推播」（`src/lib/careAnomalySignals.ts:14`）。B 與 C 的「第 3 條」內容不同。`demo-tutorial-expansion-plan.md:71` 說鐵律「對齊 `CLAUDE.md`」，`CLAUDE.md` 只有 16 行、沒有任何鐵律清單。
- `TODO.md:62` 把 D1 北極星指標列為未勾選待辦，來源文件 `acquisition-and-distribution.md:209` 已寫「已完成（2026-09-06）」。`PLAN.md:9` 仍以退役產品名為標題；`PLAN.md`／`TODO.md`／`PRACTICE.md` 不被 `AGENTS.md`、`TECHNICAL.md`、`README.md`、`AGENT_MAP.md` 任何一個索引連結，卻被 6 份 `docs/` 文件當權威引用。
- 結構面是健康的：`TECHNICAL.md` 74 個連結 0 個斷、`AGENT_MAP.md` 246 個路徑全部存在；5 份 `docs/` 孤兒檔（`docs/ai/devin-knowledge.md`、`docs/features/visit-questions.md`（`:3` 自稱被 TECHNICAL.md 指向，實際沒有）、`docs/operations/ai-security-review-{prompt,false-positives}.md`、`docs/references/drug-classification-sources.md`）。

**推測（半年後）**

- 一個新 session 讀到 `personal-notifications.md`「尚未實作」就重新設計 outbox；或讀到 `medical-trajectory.md`「規劃文件不存在」就把 `clinical-care-ops.md` 的決策再寫一遍到 feature 文件——這在 #598／#607 事故（handoff 2026-09-08 一則）已發生過一次形式相近的多 session 漂移。
- 「北極星第 3 條」在 code review 裡被引用來否決一個推播需求時，兩位 reviewer 各引一份定義。

**處置選項**

| 選項 | 內容 | 成本 | 取捨 |
| --- | --- | --- | --- |
| 1. 執行 #851 並擴大到 personal-notifications（建議） | #851 已列 clinical-care-ops 狀態、兩份 feature 文件、README、PLAN.md 搬 archive；本項要求把 `personal-notifications.md`＋`TECHNICAL.md:318`、`portfolio-pipeline.md:43`、`visit-questions.md:3`、5 份孤兒檔的索引一起納入 | 純文件，一張票 | 北極星取捨 #851 明寫等 #849 |
| 2. 「狀態」單一來源 | 規劃文件的 `狀態：` 行改為連結 GitHub issue 狀態（或 CHANGELOG 版本），文件不再手寫「規劃中」；`TECHNICAL.md` 索引的粗體狀態字全部移除 | 改索引慣例、`issue-driven-workflow.md` 補一句 | 少一個會漂的欄位，但讀者要多點一下 |
| 3. 北極星定案並寫進一處 | #849 決定後只在 `docs/product/` 一份文件定義，`careAnomalySignals.ts:14` 等註解改引用該檔路徑，`CLAUDE.md` 誤引移除 | 半天 | 依賴 #849 |

**建議模型**：`[Sonnet]`（#851 已標）；北極星取捨屬 #849 `[Fable]`。

**既有 issue**：#851（範圍需擴大如上）、#849（北極星）、#850（AI 邊界文件，`GEMINI_MODEL`／smoke 的營運面應與 A4 對齊）。

### A10　路由清單五處手抄、`supabase-public/` 死目錄、vite 數字修正

**事實**

- 公開路由清單存在於：`src/lib/publicRoutes.ts:32-77`（6 條，build-time SEO；檔頭 `:8-10` 自承不是 runtime 路由）、`PublicRouteSwitch.tsx:42-54`（13 條，runtime）、`vercel.json:70,79`（4＋1 條 cache header）、`public/robots.txt`（2 條）、`GuidesIndexPage.tsx:47-89`（5 條連結）。`/demo`、`/join`、`/patient-invite` 不在 `PublicRouteSwitch`，靠 14 個檔案各自的 `pathname ===` 辨識。`App.tsx:206` 只在 render 讀一次 `pathname`，沒有 `popstate` 監聽。`vercel.json` 沒有 `rewrites`。唯一做對的地方：`vite.config.ts:87` 從 `publicRoutes.ts` 派生 PWA `globIgnores` 以避免第二份清單。
- `supabase-public/`：7 個檔 307 行，`git log` 只有一個 commit（2026-09-12 一次加入），自身目錄外只有 3 處純文件提及（`docs/platform/supabase.md:4` 檔頭關聯、`portfolio-pipeline.md:53,137` 明寫「不要當成作品集 schema」與排除清單）；沒有 workflow、script、`package.json`、`config.toml`、`check-migrations.ts`（硬編 `supabase/migrations`）碰得到它；6 支 migration 有 5 支與 `supabase/migrations/` 同名檔逐位元相同，`config.toml` 是 6 行 stub。**死目錄，確認。**
- `vite.config.ts`／`App.tsx` 的實際數字見 §3；兩者都有測試覆蓋，不構成獨立 finding。

**推測（半年後）**

- 新增一個公開頁（例如 #655 的分享摘要擴充、#801 的商店頁）漏掉 `robots.txt` 或 `vercel.json` cache header，或漏 `PublicRouteSwitch` 導致 #806 那種「首次造訪 404、service worker 掩蓋」再現。
- 有人在 `supabase-public/` 加 migration 以為會被套用。

**處置選項**

| 選項 | 內容 | 成本 | 取捨 |
| --- | --- | --- | --- |
| 1. 刪 `supabase-public/`（建議，立即） | `git rm -r`，`docs/platform/supabase.md:4` 與 `portfolio-pipeline.md:53,137` 兩處文字同步 | 10 分鐘 | 唯一獨有檔 `20260724000000_create_public_bp_records.sql`（16 行）若有歷史價值搬 `docs/archive/` |
| 2. 路由表單一來源 | `publicRoutes.ts` 擴成完整 `ROUTES` 表（path、component loader、noindex、cache policy、是否 prerender），`PublicRouteSwitch`／sitemap／prerender／`robots.txt` 產生／`vercel.json` headers 的測試都從它派生；加 `popstate` 監聽 | 1 個模組重構＋`publicRoutes.test.ts` 擴充；不引入 router 套件（`overview.md:52` 的既有決策） | `vercel.json` 是靜態檔，只能用測試比對而非產生 |

**建議模型**：`[Sonnet]`。

**既有 issue**：#806（症狀）、#441（公開路由 SEO 原票）、#820（Universal Links 會再加 3 條路徑，應在 2 之後）。

## 6. 跨項關聯（開票時的先後依賴）

```text
A4 secret／cron 檢查 ──┐
                       ├─→ A1 通知語意 ADR ──→ A1 實作 ──→ #819 push、#415 推播
A3 帳號層改 uid ───────┤
                       └─→ A7 audit 設計（actor 要有 uid）──→ A7 實作
A2 單一 household 解析點 ──（獨立）
A5 legacy 退役 (a) 唯讀計數 ──→ (b) revoke＋rename ──→ owner 核准 ──→ (c) drop
A6 型別對照 CI ──（獨立，但 A1／A3 的 schema 改動會立刻受益）
A8 選項 3 競態防護 ──→ A8 介面＋ESLint ──→ 逐模組搬家（等 #827 PR 合併）
A9 #851 擴大 ──（獨立）；北極星等 #849
A10 刪死目錄 ──（獨立，立即）
```

## 7. 建議先開票的前 5 項

依「半年後代價 × 現在便宜」排序；每張票標題依 `docs/ai/model-routing.md` 慣例帶模型前綴。

1. **`[Fable] [NOTIFY] 通知 delivery 語意 ADR：單一狀態機、failure code 命名、sweeper 邊界`**（A1 選項 2 的設計部分）——先於一切通知擴充；產出 ADR 後拆 `[Opus / Astra]` 實作票（`_shared/cron.ts`、直送帳本補五值、CHECK 擴充、sweeper）。
2. **`[Opus] [OPS] Edge Function secret 存在性檢查與 cron 清單進 repo`**（A4 選項 1＋2 文件版）——最便宜、直接關掉「promotion 後 production 靜默 500」。
3. **`[Opus / Astra] [AUTH] household RPC 單一 membership 解析點與 role→capability 函式`**（A2 選項 2）——含 viewer(A)+caregiver(B) 反向 fixture；與 SEC-20260908-03 修補同一 PR 或緊接其後。
4. **`[Opus / Astra] [IDENTITY] 帳號層（配額／entitlement／active preference）改綁 auth.uid()，移除三條管理者字面值 policy`**（A3 選項 1）——F-5 的直接續集，pattern 與測試寫法都現成。
5. **`[Opus / Astra] [LEGACY] 三代體重表與偏好舊表退役：唯讀計數 → revoke＋rename → owner 核准 drop`**（A5 選項 1）——附帶 `delete_user_account` 資料驅動化（A5 選項 2）的評估。

其餘建議順序：A10 選項 1（刪目錄，可併入任何一張純文件 PR）→ A9（擴大 #851）→ A6 選項 1 → A8 選項 3 → A7（等 #847 domain model）→ A8 選項 2。

> **第二輪排序（2026-09-26）**：A1／A4／A7 拆票後，未拆的 A2／A3／A5／A6／A8／A10 的 defer 前提重驗、A8 處置、Astra 複審產能分配與更新後的排序表在 [`maintainability-review-2026-09-second-sort.md`](./maintainability-review-2026-09-second-sort.md)。要點：A5 的 `delete_user_account` blocker 已由 `patient_bp_standards`（#897）觸發、A6 因 #932 解鎖為 `[Sonnet]`、邀請表的兩條 `RESTRICT` 外鍵同樣會擋刪帳號、A8 選項 3 改為 `[Opus / Astra]` 且本季只再新增這一輪 Astra。

## 8. 安全與隱私聲明

本文件只引用檔案路徑、行號與 identifier 名稱；不含 secret 值、真實健康數值、真實 invite token 或 chat id。migration 中出現的核心照護帳號 email 字面值屬 AGENTS.md § 3.4 既有例外，本文件只以「管理者 email 字面值」「核心照護帳號」稱呼，不複製其值。審查過程沒有連線 staging／production，沒有讀取 `.env*`。
