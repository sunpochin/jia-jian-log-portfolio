<!--
檔案用途：2026-09 維護性審查（issue #848）的第二輪排序：重驗 A2／A3／A5／A6／A8／A10 六個未拆票項目的 defer 前提
  自 2026-09-17 以來有沒有改變、給 A8 處置建議、把「Astra 複審產能」當成限制條件算本季還能塞幾項、
  判定哪幾項要先出 ADR、產出更新後的排序表。只排序、給選項；不改程式碼、不開實作票、不關閉 #848。
所在層：docs/architecture；一次性排序存證，是 maintainability-review-2026-09.md §7 的續篇，不是規格。
  owner 依 §7 挑選後才開票；開票或實作後回寫原審查文件 §5 對應項目的狀態。
主要關聯：docs/architecture/maintainability-review-2026-09.md（§5 六項 finding 的事實與選項，本文件不重抄）、
  docs/product/q4-2026-outcome-compression.md §7（A2／A3／A5 defer 到 2027-Q1 的原始理由與「新增病人級資料表」觸發條件）、
  docs/adr/007-notification-delivery-semantics.md（#958–#965）、docs/adr/008-audit-coverage-boundary.md（#967–#969）、
  docs/adr/005-care-loop-closure.md（#945–#949）、docs/ai/model-routing.md（模型標籤與 Astra 出場條件）、
  supabase/schema.sql（重播後快照，本文件的 FK 事實來源）、AGENTS.md § 3.5（切換病人不變量）。
-->

# 維護性審查 2026-09 第二輪排序：六個未拆票項目的 defer 前提重驗與本季產能分配

- 狀態：**排序完成；owner 已於 2026-09-26 對 §8 前三個問題做出決定；PR #971 的 Codex review 帶出兩個新問題（§8 第 4、5 項）待 owner 決定**（本文件不修改任何程式碼、migration 或設定，不開實作票，不關閉 #848；§7 各項仍待 owner 挑選開票）
- 日期：2026-09-26
- 基準：`origin/staging` commit `841d4109`（209 支 migration；原審查基準 `85a6359` 為 195 支，其間新增 14 支）
- 追蹤：issue [#848](https://github.com/portfolio-author/jia-jian-log/issues/848)
- 上一輪：[`maintainability-review-2026-09.md`](./maintainability-review-2026-09.md) §7（2026-09-17）與 [`q4-2026-outcome-compression.md`](../product/q4-2026-outcome-compression.md) §7（2026-09-17）

## 0. ELI5（給完全不懂技術的人看）

九天前有一份「房子哪裡半年後會漏水」的清單，十項裡三項已經派工（通知、營運邊界、異動簿），六項說「今年先不修，明年一月再看」。這份文件只做一件事：回頭檢查那六項「先不修」的理由**現在還成不成立**。

結論是：有一項的理由已經破了——清單當初預言「下一個新模組會忘了更新刪帳號程式」，九天後真的發生了，只是不是預期的那個模組（不是照護閉環，是血壓標準）。**【推測】** 現在只要有人替病人設定過血壓標準，那個人就再也刪不掉自己的帳號。PR 審查時又找到更早的同類問題：從 8 月中開始，**只要發過邀請**的帳號也刪不掉。另外一項（型別檢查）因為別的工作順手把地基打好了，變得很便宜。其餘四項的理由仍然成立。

然後是產能：今年剩下的三個月，最稀缺的不是寫程式的人，是「幫高風險程式做獨立複審」的那一位（Astra，只能由 owner 在 Codex 執行）。已經排隊的九張高風險票會把這個名額用完，所以本文件建議**本季只再新增一輪 Astra 複審**，給「切換病人時畫面不能混到上一位的數值」這件事（它碰的是健康資料顯示路徑，依規定必須獨立複審），另外加三件不需要它的小事。

## 1. 已拆票項目的現況（不重審，只對齊事實）

| 項目 | 現況（2026-09-26） | 對本文件的影響 |
| --- | --- | --- |
| A1 通知 delivery 語意 | ADR-007 的核准 PR [#966](https://github.com/portfolio-author/jia-jian-log/pull/966) 仍 open（非 draft，開向 `staging`）；staging 上的 ADR 檔案仍寫 `Proposed`。實作票已開：#958–#963、#965 七張 `[Opus / Astra]`，#964 一張 `[Sonnet]`，票 7 沿用 #603 | 七張 Astra 票是 §5 產能計算的主要占用者 |
| A4 營運邊界 | #877 已完成（PR #893，2026-09-21）；#944 改為逐支部署；#950（自動開的缺 secret 票）仍 open | 不影響本文件排序 |
| A7 audit 覆蓋 | ADR-008 的核准 PR [#970](https://github.com/portfolio-author/jia-jian-log/pull/970) 仍 open；owner 決定本季實作，#967、#968 `[Opus / Astra]`，#969 `[Sonnet]` | 兩張 Astra 票；#967 會重新定義 `delete_user_account`，是 §3.2 A5 修補的可能落點 |

## 2. 方法與無法驗證的部分

- 每一項只問一個問題：Q4 文件 §7 寫的 defer 前提（「要 X 發生才會壞」）自 09-17 以來有沒有被 14 支新 migration、#847 核准、care-loop T1–T5（PR #951–#955、#957）、分享摘要 v2（#939–#942）、血壓標準（#902–#905、#909）、#424 決策 E（#918、#922）改變。
- 事實一律取自目前工作樹與 `supabase/schema.sql`（migration 重播後的快照，PR #932 起由 CI 保證與 migration 一致）；**【推測】** 標記的段落沒有在任何環境執行過。
- 本文件無法驗證：(1) staging／production 是否已有 `patient_bp_standards` 列或 `caregiver_invitations`／`patient_care_invitations` 列——沒有列，§3.2 的刪帳號失敗就還沒發生過；(2) 09-17 以來合併的 PR 中，哪幾個真的經過 Astra 複審、哪幾個是 Claude 自己的獨立複審暫代（PR body 出現「Astra」不等於 Astra 已審）；(3) §3.5 的競態防護盤點用的是 token grep（`cancelled`／`isMounted`／`AbortController`／`useLatestRequest` 等），只能分出「完全沒有防護字樣」與「有某種防護字樣」，不能證明後者的防護正確。

## 3. 六項 defer 前提重驗（回答問題 1）

### 3.1 A2 授權雙軌——前提未變，但雙軌又長了一條規則

**Q4 的 defer 前提**：要「第二個多家庭使用者出現」才會壞；#847 若新增病人級表要先決定走哪一軌。

**自 09-17 以來的事實**

- #847 六題於 2026-09-24 核准（ADR-005 `Accepted`），**全部採用「不新開表」方案**。care-loop T1–T5 的三支 migration（`20260925180000`、`20260925190000`、`20260925191000`）只在 `patient_visit_questions` 與 `care_due_reminders` 加欄位與複合外鍵，`git diff 85a6359..HEAD -- supabase/migrations` 中沒有任何一行 `CREATE TABLE` 來自 care-loop，也沒有任何一行動到 `household_members`、`fetch_household_*` 或新增 `p_household_id`。**A2 原本等 #847 的那個問題（新表走哪一軌）已經沒有了**，因為沒有新表；既有兩張表都在 `care_access` 軌上。
- 11 支「第一筆 membership」RPC 一支都沒改；SEC-20260908-03 在 handoff 仍是待修（`docs/operations/security-review-handoff.md:252`）。
- **新增的耦合**：#424 決策 E 的 migration `20260924191747_revoke_caregiver_share_readonly.sql` 加了第四處 role → 能力位的 inline 規則——trigger `enforce_caregiver_share_readonly_disabled`（`:61-91`）與 `revoke_share_readonly_for_caregiver_role`（`:103-149`）規定「`household_members.role = 'caregiver'` 的 `care_access` 列 `can_share_readonly` 必須為 false」。它的 household 定位走 `patients.household_id`（`:71-74`），**不是** `LIMIT 1` 第一筆 membership——這是正確的寫法，也是 A2 選項 2 要推廣的寫法；但它仍是 inline 而非共用函式，`role_capabilities()` 之類的單一解析點還是不存在。

**判定**：前提未變。成果 2 帶進的「第一個非家人使用者」是分享連結的讀者，沒有 household；成果 3 的 dogfood 使用者都在同一個家庭。**維持 defer 到 2027-Q1**。但要記錄：雙軌的規則數從三處變四處，每季不處理就多一處；2027-Q1 的 ADR（§6）應把 #424 這條 trigger 一併納入解析點。

### 3.2 A5 legacy 表與 `delete_user_account`——blocker 已觸發，來源不是 care-loop

**Q4 的 defer 前提**：要「下一個新模組忘了複製 `delete_user_account`」才會壞；「若本季任何一個成果的實作導致要新增病人級資料表，立刻升為 blocker」。

**自 09-17 以來的事實**

- care-loop T1–T5 **沒有**新增資料表（見 §3.1），所以 #847 這條路沒有觸發 blocker。
- 但 14 支新 migration 裡有兩支 `CREATE TABLE`，都不是 care-loop：
  1. `patient_bp_standards`（`20260922230000_create_patient_bp_standards.sql:21`，#897，成果 2 血壓判讀線）——病人級表。
  2. `care_access_capability_change_logs`（`20260924191747_revoke_caregiver_share_readonly.sql:25`，#424 決策 E）——授權稽核表。
- `delete_user_account` 在這 14 支 migration 中 **0 次**被提及；最新定義仍是 `20260914042410_add_patient_lab_results.sql:266`，仍是 9 份手抄，最後一句仍是 `DELETE FROM auth.users WHERE id = v_user_id`。
- `patient_bp_standards.created_by UUID REFERENCES auth.users(id)`（`:34`）**沒有 `ON DELETE` 子句**（`schema.sql:7697`），預設 `NO ACTION`。
- **PR #971 的 Codex review 補出的事實（已逐條核對）**：`supabase/schema.sql` 裡指向 `auth.users` 的 20 條外鍵，動作分佈如下。會擋住 `DELETE FROM auth.users` 的不只一條：

  | 動作 | 條數 | 外鍵 | 刪帳號時 |
  | --- | --- | --- | --- |
  | `CASCADE` | 9 | `app_profiles`、`care_access`、`household_members`、`legal_consents`、`messaging_link_tokens`、`personal_notification_outbox`、`user_messaging_links`、`user_patient_care_preferences`、`user_settings` | 連帶刪除 |
  | `SET NULL` | 8 | `blood_pressure_records`、`care_due_reminders`、`caregiver_invitations.requested_by_user_id`、`patient_care_invitations.accepted_by_user_id`、`patient_share_consents` 兩欄、`patient_share_links` 兩欄 | 清成 NULL |
  | `RESTRICT` | 2 | `caregiver_invitations.invited_by_user_id`（`20260905010000_add_caregiver_invitations.sql:11`）、`patient_care_invitations.invited_by_user_id`（`20260814040000_add_patient_care_invitations.sql:13`），兩欄都 `NOT NULL` | **擋住**，除非先刪掉該帳號發出的邀請列 |
  | 未寫（`NO ACTION`） | 1 | `patient_bp_standards.created_by` | **擋住** |

  `delete_user_account` 的最新定義不刪任何邀請列，兩支建表 migration 也沒有說明為什麼選 `RESTRICT`。
- 同一支 migration 的 `protect_patient_bp_standard_immutable_fields` trigger（`:134-167`）把 `created_by` 列為不可變欄位，且 `effective_to` 已關閉的列拒絕任何 UPDATE；表對 `authenticated` 刻意不給 DELETE。
- 既有測試抓不到：`tests/unit/patientLabResultsMigration.test.ts:92-95` 只 `toContain` 特定 `DELETE FROM` 字串；`supabase/tests/rls-authorization.sql:2516-2524` 只驗證 `care_access.user_id` 的 CASCADE，fixture 沒有 `patient_bp_standards` 列。

**【推測】失敗情境**：任何曾透過 #905 的模板選單為病人設定過血壓標準的帳號，呼叫 `delete_user_account()` 時，函式做到最後一句 `DELETE FROM auth.users` 會因 `patient_bp_standards_created_by_fkey`（預設 `NO ACTION`）拋 `23503`，整個函式回滾，**帳號刪不掉**；Supabase Dashboard 手動刪除同樣會被這條外鍵擋下。三位核心使用者中，設定過標準的很可能就是 owner 本人。這正是原審查 A5「推測」段的第一句，只是提前了五個月、換了一個模組。

**【推測】更早的同類失敗**：任何發過家庭邀請或病人照護邀請的帳號，刪帳號時會在同一句撞上兩條 `RESTRICT` 外鍵，同樣整個回滾。這條自 2026-08-14 起就存在，比原審查基準還早，原審查與本文件初版都漏了。發過邀請的幾乎一定包含 owner。

**修法不是一行**：直覺的 `ALTER ... ON DELETE SET NULL` 會在刪帳號時對每一列做 UPDATE，觸發上述 immutability trigger 的 `created_by` 檢查與「已關閉的列不得更新」檢查而再度失敗。三個可行方向都需要一個小設計決定：

| 方向 | 內容 | 取捨 |
| --- | --- | --- |
| (a) 拿掉外鍵，`created_by` 保留為 dangling uid | 與 ADR-008 對 `record_change_logs.actor_user_id`「整張表不加任何 FK」的決定一致 | 最小；但失去「一定指向真實帳號」的保證（ADR-008 已接受同一取捨） |
| (b) `ON DELETE SET NULL` ＋ trigger 放行「`created_by` → NULL 且其他欄位不變」的過渡，含已關閉列 | 保留外鍵 | trigger 多一個例外分支，reviewer 要驗證它不能被 client 拿來改別的欄位 |
| (c) `delete_user_account` 內以 GUC bypass 先 `UPDATE ... SET created_by = NULL` | 沿用 ADR-008 的 `app.audit_bypass` 手法 | 又在 9 份手抄裡多一段；沒有解決「下一張表再忘一次」 |

**判定**：A5 選項 1（三代體重表與偏好舊表退役）的 defer 理由沒有變——它需要 owner 在 staging／production 做唯讀計數並書面同意 `DROP`，本季不做。**但 A5 的另一半（`delete_user_account` 與新表的契約）已經從「推測」變成「可讀出來的缺陷」**，且 Q4 文件自己寫的觸發條件已經成立。處置分兩層：

1. **修這一條**：`[Opus / Astra]`（外鍵、trigger、帳號刪除都在 AGENTS.md § 5 高風險類別）。**owner 已決定（2026-09-26）與 #967（AUDIT-1）同一次 Astra 複審**——#967 本來就要重新定義 `delete_user_account`（ADR-008 決策四的兩段 GUC），把方向 (a)／(b) 放進同一支或相鄰 migration，不多耗一輪複審。若 #967 延期，不自動拆成獨立票，回到 owner 重新決定（見 §8）。**不建議**塞進任何 `[Sonnet]` 票。
   兩條邀請 `RESTRICT` 外鍵是 owner 決定之後才找到的，**尚未決定**是否一併掛 #967（§8 第 5 項）。它屬於「邀請流程／帳號綁定」高風險類別，修法要先決定語意：未接受的邀請隨發出者刪除，已接受的邀請保留但 `invited_by_user_id` 改為可 NULL 並 `SET NULL`。建議與血壓標準那條同一支 migration、同一輪 Astra，因為兩者都在改 `delete_user_account` 與同一組刪帳號 fixture。
2. **防下一次**：兩層測試，缺一不可。
   - **靜態契約測試**（`[Sonnet]`，不需要 Astra，不動 migration）：讀 `supabase/schema.sql`，斷言每一條指向 `auth.users` 的外鍵動作只能是 `CASCADE` 或 `SET NULL`。`RESTRICT`、`NO ACTION` 與未寫一律視為違規，除非列在附理由的 allowlist。初版只斷言「有寫 `ON DELETE`」，Codex review 指出它會放過兩條明寫的 `RESTRICT`，已更正。比照 `tests/unit/downstreamPolicyUidOnlyMigration.test.ts` 的寫法。
   - **執行期測試**（屬修補外鍵那張票，`[Opus / Astra]`）：在 `supabase/tests/rls-authorization.sql` 建一個帳號，讓它在**每一張**有外鍵指向 `auth.users` 的表都擁有一列，然後呼叫 `delete_user_account()`，斷言成功。靜態測試只看外鍵動作，看不到 trigger 擋 `SET NULL` 這類組合，所以執行期測試才是真正的契約。

### 3.3 A3 email 身分殘留——前提未變，但殘留在加速累積

**Q4 的 defer 前提**：要「使用者換 Google 帳號 email」才會壞。

**自 09-17 以來的事實**

- 沒有換 email 事件；`account_usage_limits` 主鍵、22 個 TEXT 記錄者欄位、三條管理者字面值 policy、`src/lib/auth.ts:21` 的 `ADMIN_EMAIL`、`src/lib/bloodPressurePendingQueue.ts:47,74` 的 email 佇列 key，全部原樣。
- **新增的殘留**：`care_access_capability_change_logs` 的 `actor_email TEXT NOT NULL`、`target_email TEXT NOT NULL`（`20260924191747:27,29`），寫入者 `revoke_share_readonly_for_caregiver_role` 以 `auth.jwt() ->> 'email'` 當 actor（`:110`），營運 RPC `set_patient_share_readonly` 收 `p_actor_email TEXT`（`:160-165`）。這張表在 2026-09-25 合併，**比 ADR-008 決策三「actor 只記 `auth.uid()`，不記 email」晚一天寫成**，而且不在 ADR-008 與 `audit-coverage-design.md` 的任何 Tier 清單裡（兩份文件對它零提及）。它比照的是 `account_entitlement_change_logs`（原審查已點名的舊做法）。

**判定**：前提未變，**維持 defer 到 2027-Q1**。但 A3 的成本曲線已經可以量測：九天內多一張 email 鍵稽核表、兩個 email 欄、一支 email 參數 RPC。建議加一道 `[Sonnet]` 防線（與 §3.2 第 2 點的靜態測試合併成同一張「schema 契約測試」票）：靜態斷言新 migration 不得新增 `*_email TEXT` 欄位或 `auth.jwt() ->> 'email'` 述詞，除非列在 allowlist（今天的 allowlist 就是原審查 A3 盤點的那一份加上 `care_access_capability_change_logs`）。防線本身不修任何殘留，只讓 2027-Q1 動工時清單不再變長；ADR-008 的 AUDIT-1 實作票也應被提醒「不要再比照 `care_access_capability_change_logs`」。

### 3.4 A6 型別契約雙源——前提已變：地基被 #932 打好了

**Q4 的處置**：defer；#768（replay 缺 auth 歷史）跟著走，因為 A6 選項 1 要靠 CI 的 local replay。

**自 09-17 以來的事實**

- 事實面原樣：`src/lib/database.types.ts` 仍沒有任何 `src/` 檔案 import（只剩 `src/types/database/schema.ts:5`、`src/types/database.ts:6` 兩處註解提到它）；`src/lib/supabase.ts:21` 的 `createClient` 仍未帶 `<Database>`。
- **地基已變**：PR #932（2026-09-25）讓 `verify-supabase-migrations.yml` 在 `supabase db start` 重播後執行 `scripts/dump-schema-snapshot.ts --check`，快照與 migration 不一致就 fail（`:61-67`）；同一支 workflow 已用 seed 抽出的 `auth.users` fixture 補上 #768 的缺口（`:55-59`）。A6 選項 1 的兩個前置——「CI 有 local replay」「replay 跑得起來」——都已存在。

**判定**：**解鎖**。A6 選項 1 現在是一張 `[Sonnet]` 票：在同一個 job 的快照檢查之後加一步 `types:generate:local` 並 `diff` tracked 的 `database.types.ts`（**【推測】** `supabase gen types --local` 在只有 `db start` 的環境可用，票內第一步先驗證），再加一個 unit test 以快照的 `Tables<'x'>['Row']` 對手寫型別做結構相容斷言。不動 migration、不動 RLS、不需要 Astra；同時關掉 #768 的 defer 理由。選項 2（`createClient<Database>`）仍留 2027-Q1。

### 3.5 A8 demo 平行層與 feature 直接查表——前提未變，`#827` 這個等待條件已消失

**自 09-17 以來的事實**

- 數字原樣：`src/features` 仍是 **47 個 `supabase.from(` 分佈於 20 個檔案**，仍只有 2 個檔案用 `useLatestRequest`（`useCareTrajectoryFeed.ts`、`usePreVisitSources.ts`）。care-loop T3–T5 與分享摘要 v2 新增的元件都沒有直接查表，沒有讓數字變差。
- 原審查說搬家「應等 #827 PR 合併」；#827 已關閉。
- `src/hooks/useLatestRequest.ts` 檔頭自述「這是健康資料的安全機制，不只是體驗優化」——與 AGENTS.md § 3.5 的措辭一致，但 20 個 feature 檔案裡 18 個沒有用它。
- 依 §2 說明的 token grep，20 個檔案裡 **8 個完全沒有任何競態防護字樣**：`useTrajectoryEntryEditor.ts`、`DementiaCarePage.tsx`、`NutritionPage.tsx`、`PetAppetitePage.tsx`、`PetEndocrinePage.tsx`、`PetFluidTherapyPage.tsx`、`FluidBalancePage.tsx`、`TemperaturePage.tsx`；其餘 12 個有某種字樣（`cancelled` 旗標之類），正確性未逐一驗證。`PetTrendPanel.tsx` 6 個查詢仍是單檔最多。

**判定**：前提未變，A8 選項 1／2（資料層契約與搬家）維持 defer；選項 3（競態防護）的處置見 §4。

### 3.6 A10 路由手抄與死目錄——前提未變，仍是最便宜的一項

- `supabase-public/` 仍在（`config.toml` 與 `migrations/`）；`src/App.tsx` 與 `PublicRouteSwitch.tsx` 仍沒有 `popstate`；#851（Q4 文件指定承接刪目錄的票）仍 open 且未開工；#820（Universal Links，會再加 3 條路徑）與 #806（首次造訪 404）仍 open。
- 判定：選項 1（刪目錄）維持「併入 #851」；選項 2（路由單一來源）在 #820 動工前做最划算，否則 2027-Q1。

## 4. A8 的處置建議（回答問題 2）

**建議：先拆出選項 3（競態防護）本季做，選項 1／2 defer 到 2027-Q1 並先出 ADR。**

依 AGENTS.md § 3.5 評估風險：

- **不變量原文**：查詢、快取、圖表都以 `patient_id` 分區，「切換照護對象後不得殘留、混用或覆寫另一人的數值」。
- **觸發條件**：同一個登入者有兩個以上可切換的 patient（在這個系統裡寵物也是 patient），在較慢的查詢回來前切換。三位核心使用者的家庭同時有媽媽與寵物，**寵物頁正好是 §3.5 那 8 個零防護檔案中的 3 個**，`PetTrendPanel` 又是查詢最多的檔案——這不是「第二個多家庭使用者」那種尚未出現的前提，是每天都在發生的操作。
- **失敗形態**：舊病人的數值被畫進新病人的圖或列表，直到下一次重新查詢。不會寫壞資料庫（寫入路徑有 RLS 與 `patient_id` 綁定），但會違反不變量、且沒有任何測試會抓到。
- **選項 3 的性質**：純前端、不動 migration／RLS、每檔一到三行。但它決定「哪一位病人的健康數值會出現在畫面上」，屬 AGENTS.md § 5 的「敏感健康資料存取路徑」與 `docs/agents/model-escalation.md` 的「敏感健康資料的存取路徑變更」。依 `docs/ai/model-routing.md`，落入高風險類別就一律 `[Opus / Astra]`，不看改動大小。本文件初版與原審查都標成 `[Sonnet]`、不需 Astra，是錯的；PR #971 的 Codex review 指出，已更正。
- **為了少占 Astra 名額**：8 個零防護檔案合成**一張 PR、一輪 Astra**，全部改用既有的 `useLatestRequest`，不各自發明防護寫法，並附一組「切換病人後過期回應不落地」的 hook 測試。另外 12 個有防護字樣的檔案，逐一核對與改寫屬第二張 PR，排 2027-Q1。
- **選項 1／2 為什麼等**：`PatientDataSource` 契約與 `no-restricted-imports` 規則會影響所有 feature，屬 ADR README「影響兩個以上 feature 的架構選擇」，且 ESLint 規則落地會讓 20 個檔案同時紅，需要 allowlist 與逐模組搬家；這是 2027-Q1 的 `[Opus]` 設計題，不是本季的產能可以吃下的。

## 5. 複審產能作為限制條件（回答問題 3）

**定義**：一「輪」＝ Astra 在 Codex 對一個 PR 做一次獨立複審（含回修後的再看）。Claude session 無法呼叫 Astra，每一輪都要 owner 手動執行。

**已排隊的輪數（事實）**

| 線 | `[Opus / Astra]` 票 | 依賴形狀 | 最少輪數 |
| --- | --- | --- | --- |
| 通知（ADR-007） | #958、#959、#960、#961、#962、#963、#965（#964 是 Sonnet；票 7 是 #603 文件） | 1 → 2 → 3 → 4 → 6 → 9 串行，5 可平行；票 9 前置是票 2／3 **已部署** | 7 |
| audit（ADR-008） | #967、#968（#969 是 Sonnet） | 1 → 2 串行；#968 掛 18 張表 | 2 |
| 線外、已 open 且標 `[Opus / Astra]` | #923（分享連結讀取 audit，09-24 新開）、#553（/share Stage 2 部署，等 #424）、#655（/share 擴充）、mobile 系列（#814、#544、#819–#821、#856、#865、#866） | 各自獨立 | 依 owner 是否啟動 |

九張線內票至少九輪；care-loop 的經驗是複審會回修（#957 在合併後的獨立複審才抓到三個 bug），保守估 +30%，約 **12 輪**。

**觀察到的吞吐（事實，但見 §2 無法驗證第 2 點）**：09-17 到 09-25 的九天內合併了 10 張 PR body 提到 Astra 的 PR，其中 09-22 到 09-25 四天集中了 9 張（09-25 一天 5 張）——這是衝刺，不是常態；#957 的存在說明複審在那段期間落後於實作。本文件**不假設**這個速率能持續到 12-31。

**假設**：若可持續速率是每週 1～2 輪，12 輪需要 6～12 週；今天到 12-31 剩約 13.7 週，而通知線（成果 1）必須在 12-31 前 ship。**結論：本季的 Astra 名額已被線內九張票用完，六項裡任何需要 Astra 的選項都不該再塞進本季。**

**本季還能再塞幾項？——一項需要 Astra，三項不需要：**

1. A8 選項 3 的第一張 PR（8 個零防護檔案，§4），`[Opus / Astra]`，**新增一輪 Astra**。線內加回修約 12 輪，再加這一輪約 13 輪。在每週 1～2 輪的假設下，只有接近每週 1 輪以上時才排得下；它仍然排進本季，因為它是六項中唯一每天都在發生的不變量違反。是否接受這一輪，待 owner 決定（§8 第 4 項）。
2. A6 選項 1（型別快照對照 CI＋結構相容測試，§3.4），`[Sonnet]`。
3. schema 契約測試一張票：`auth.users` 外鍵動作只能是 `CASCADE`／`SET NULL`（§3.2 第 2 點）＋ 新 migration 不得新增 email 鍵欄位／述詞（§3.3），`[Sonnet]`。
4. A10 選項 1 併入 #851（不另開票），`[Sonnet]`。

**唯一的例外**是 §3.2 第 1 點的 `patient_bp_standards` 修補：它需要 Astra，owner 已決定**掛在 #967 同一輪**，所以不多占名額；兩條邀請外鍵若也掛同一輪（§8 第 5 項）同樣不多占。

## 6. 哪些要先出 ADR／設計文件，哪些可以直接開實作票（回答問題 4）

| 項目 | 需要先出什麼 | 理由 | 何時 |
| --- | --- | --- | --- |
| A2 選項 2 ＋ A3 選項 1 ＋ A5 選項 3 | **一份 ADR**（暫名「帳號層身分與家庭授權解析點」）；設計 `[Opus]`，若併入 A3 選項 2（20 張表補 uid 欄）則升 `[Fable]` | 三者都在做同一件事：把「帳號層」從 email 搬到 uid、把「家庭層」的 role 解析收成一個函式；分開寫三份 ADR 會互相引用。改 RPC 簽章、entitlement 主鍵、drop policy 都符合 ADR README「改變 RLS／影響兩個以上 feature」。應納入 #424 那條 trigger（§3.1）與 `care_access_capability_change_logs`（§3.3） | 2027-Q1 第一件事 |
| A5 選項 1（舊表退役） | 不需要 ADR；需要 **owner 動作清單**：(a) 唯讀計數四張表最近 30 天寫入數；(b) 書面同意 `RENAME` 與下一個 release 的 `DROP` | 決策已在原審查寫清楚，缺的是 AGENTS.md § 3.1 要求的明確同意與 repo 外的計數 | 2027-Q1，計數可隨時做 |
| A5 `patient_bp_standards` 與兩條邀請外鍵修補 | 不需要 ADR；需要在票內**先選 §3.2 的 (a)／(b)**，建議 (a)（與 ADR-008 一致），並寫下邀請列的刪除語意 | 小決定，寫在 migration 的「為什麼」註解裡即可 | 本季，隨 #967（邀請部分待 §8 第 5 項） |
| A6 選項 1 | 直接開票 | CI step ＋ 測試，需求明確 | 本季 |
| A6 選項 2 | 一條 `DECISIONS`／設計段落，不需要 ADR | 開發工具鏈選擇，不影響 runtime 架構 | 選項 1 穩定後 |
| A8 選項 3 | 直接開票，`[Opus / Astra]` | 機械、純前端，但屬敏感健康資料存取路徑 | 本季第一張，第二張 2027-Q1 |
| A8 選項 2（→ 1） | **ADR**，設計 `[Opus]` | `PatientDataSource` 契約與 ESLint 規則影響全部 feature | 2027-Q1，可與上面第一份 ADR 分開 |
| A10 選項 1 | 併入 #851 | 10 分鐘 | 本季 |
| A10 選項 2 | 直接開票 `[Sonnet]` | `overview.md` 已決定不引入 router 套件，剩下是把清單收成一份 | #820 動工前，否則 2027-Q1 |
| schema 契約測試（§3.2／§3.3） | 直接開票 | 靜態測試，有 `downstreamPolicyUidOnlyMigration.test.ts` 與 `stagingProjectRefScope.test.ts` 兩個現成範本 | 本季 |

## 7. 更新後的排序表（回答問題 5）

排序依「半年後代價 × 現在便宜 × 不占 Astra 名額」。模型標籤依 `docs/ai/model-routing.md`；「Astra」欄是本文件的判斷，實際仍依 AGENTS.md § 5 類別。

### 7.1 本季（2026-Q4，只新增一輪獨立的 Astra，待 owner 確認）

| 序 | 項目 | 建議模型 | Astra | 與既有 issue 的關係 | 備註 |
| --- | --- | --- | --- | --- | --- |
| 1 | A5：`patient_bp_standards.created_by` 外鍵讓 `delete_user_account` 失敗——依 §3.2 方向 (a) 或 (b) 修 | `[Opus / Astra]` | 是，**掛 #967 同一輪** | #967（AUDIT-1，重新定義 `delete_user_account`）、#897（缺陷來源）、#848 A5 | 唯一「已觸發」的項目；**owner 決定掛 #967**。兩條邀請 `RESTRICT` 外鍵建議一併處理（§8 第 5 項待決）。#967 的 PR 同時要移除第 3 項 allowlist 裡已修好的條目，並附 §3.2 的執行期刪帳號測試 |
| 2 | A8 選項 3：8 個零防護檔案改用 `useLatestRequest` | `[Opus / Astra]` | 是，**新增一輪**（§8 第 4 項待決） | #848 A8、`component-refactor-2026-09.md` 延後第 3／4 項的前置；#827 已關閉不再是等待條件 | 一張 PR 附 hook 測試；另 12 個檔案的核對排 2027-Q1；AGENTS.md § 3.5 不變量 |
| 3 | schema 契約測試：`auth.users` 外鍵動作只能是 `CASCADE`／`SET NULL`＋ 新 migration 禁新增 email 鍵欄位／述詞 | `[Sonnet]` | 否 | #848 A5 選項 2 的最小版、A3 的防線；提醒 #967／#968 不得比照 `care_access_capability_change_logs` | **owner 決定先 allowlist**：初始 allowlist 含三條，`patient_bp_standards_created_by_fkey` 與兩條 `*_invitations_invited_by_user_id_fkey`，各附理由；測試同時斷言 allowlist 內每一條「仍然違規」，第 1 項修好後 allowlist 沒刪就紅，逼 #967 的 PR 一併移除 |
| 4 | A6 選項 1：CI 快照後跑 `types:generate:local` 並 diff；結構相容 unit test | `[Sonnet]` | 否 | #848 A6、#932（地基）、#768（可一併結案或改寫重啟條件）、#833／#836 | 票內第一步驗證 `gen types --local` 在 `db start` 環境可用 |
| 5 | A10 選項 1：刪 `supabase-public/`，同步兩處文件 | `[Sonnet]` | 否 | 併入 #851（Q4 文件已指定），不另開票 | — |

### 7.2 2027-Q1（維持 defer，但帶著本季新增的事實）

| 序 | 項目 | 建議模型 | Astra | 與既有 issue 的關係 | 前提／觸發條件 |
| --- | --- | --- | --- | --- | --- |
| 6 | ADR「帳號層身分與家庭授權解析點」：A2 選項 2 ＋ A3 選項 1 ＋ A5 選項 3 | 設計 `[Opus]`（含 A3 選項 2 則 `[Fable]`）；實作 `[Opus / Astra]` 拆 3～4 張 | 是 | SEC-20260908-03（症狀，仍待修）、#814／#544 RLS 矩陣、#424 決策 E trigger、`care-access-identity-binding.md` §8、#590 | 通知線九輪結束後；第二個多家庭使用者或換 email 事件出現則提前 |
| 7 | A5 選項 1：三代體重表與偏好舊表退役 | `[Opus / Astra]` | 是 | #848 A5、`vitals.md:89` | **owner-blocked**：唯讀計數＋書面同意 `DROP`（AGENTS.md § 3.1） |
| 7b | A8 選項 3 第二張：核對並改寫 12 個有防護字樣的檔案 | `[Opus / Astra]` | 是 | #848 A8 | 第 2 項合併後；可與第 8 項的搬家合併進行 |
| 8 | A8 選項 2 → 1：`PatientDataSource` ADR、ESLint 規則、逐模組搬家 | 設計 `[Opus]`；搬家 `[Sonnet]` ×7 模組 | 設計不需要；搬家不需要 | #848 A8、`component-refactor-2026-09.md` 第 3／4 項、#806 | 第 2 項完成後；新模組（#823 HealthKit）動工前最好先有契約 |
| 9 | A10 選項 2：路由表單一來源＋`popstate` | `[Sonnet]` | 否 | #806、#820（會再加 3 條路徑）、#441 | #820 動工前 |
| 10 | A6 選項 2：`createClient<Database>`，手寫型別改別名 | `[Opus]` | 否 | #848 A6 | 第 4 項穩定一個 release 後 |

**與 Q4 文件 §7 的差異**：Q4 文件把 A2／A3／A5 整包 defer；本文件把 A5 拆成「舊表退役（仍 defer）」與「`delete_user_account` 契約（已觸發，本季隨 #967 修）」，並把 A6 從 defer 改為本季 `[Sonnet]`；A8 選項 3 本季做且改為 `[Opus / Astra]`。其餘一致。

## 8. owner 決定（2026-09-26）

| # | 問題 | 決定 | 對排序的影響 |
| --- | --- | --- | --- |
| 1 | §3.2 的 `patient_bp_standards` 外鍵修補要掛 #967 同一輪，還是獨立提前 | **掛 #967 同一輪** | §7.1 第 1 項併入 #967 的範圍；本季 Astra 輪數維持線內九張。若 #967 延期，不自動拆票，回到 owner 重新決定 |
| 2 | 是否接受「每週 1～2 輪 Astra」的產能假設 | **接受** | §5 結論成立：本季不再新增需要 Astra 的項目；§7.2 第 6 項的 ADR 設計維持 2027-Q1，不提前 |
| 3 | §7.1 第 3 項的第一條斷言今天就會紅，要先 allowlist 還是等修補合併再開 | **先 allowlist** | 第 3 項可立即開票，不依賴第 1 項；allowlist 以「仍然違規」斷言自我過期，第 1 項修好的同一個 PR 必須移除該條 |

**PR #971 的 Codex review 帶出的兩個新問題（待 owner 決定）**

| # | 問題 | 建議 | 為什麼要重新問 |
| --- | --- | --- | --- |
| 4 | A8 選項 3 改為 `[Opus / Astra]` 後，本季要不要多給一輪 Astra | **給**：一張 PR 收 8 個零防護檔案，只占一輪 | 第 2 項接受的是「本季不再新增 Astra」，那個結論建立在錯的模型標籤上；多一輪會讓總數約 13，需要接近每週 1 輪以上才排得下 |
| 5 | 兩條邀請 `RESTRICT` 外鍵要不要一併掛 #967 | **掛**：同一支 migration、同一組刪帳號測試、不多占一輪 | 第 1 項只決定了血壓標準那一條；邀請外鍵是之後才找到的，且修法涉及邀請流程語意 |

**已同步到 issue 的部分**：第 1、3 項的範圍已於 2026-09-26 以留言補進 #967。第 5 項若決定掛 #967，要再補一則。

## 9. 安全與隱私聲明

本文件只引用檔案路徑、行號、identifier 名稱與 issue／PR 編號；不含 secret 值、真實健康數值、真實 invite token 或 chat id。提到的核心帳號只以角色稱呼。審查過程沒有連線 staging／production，沒有讀取 `.env*`，沒有執行任何 migration 或 SQL。

## 10. English summary

Second-pass triage of the six un-ticketed findings (A2, A3, A5, A6, A8, A10) from the 2026-09 maintainability review, against `origin/staging` `841d4109` (209 migrations, 14 new since the review baseline).

- **A5's blocker has fired, but not from care-loop.** Care-loop T1–T5 added no tables. Two other tables were added since the baseline: `patient_bp_standards` (#897) and `care_access_capability_change_logs` (#424). `delete_user_account` was not updated (still 9 hand-copied definitions). `patient_bp_standards.created_by → auth.users` is the only one of 20 FKs to `auth.users` with no `ON DELETE` action, and the table's immutability trigger forbids changing `created_by`. **Inferred, not executed:** any account that ever set a BP standard can no longer delete itself. Codex review on PR #971 found an older instance: `caregiver_invitations` and `patient_care_invitations` reference the inviter with `ON DELETE RESTRICT`, and `delete_user_account` deletes neither, so any account that ever sent an invitation has likely been undeletable since 2026-08-14. Recommended fix: drop the FK (matching ADR-008's no-FK precedent) or add a trigger exemption, `[Opus / Astra]`, reviewed in the same Astra round as #967, which already redefines `delete_user_account` (**owner decision, 2026-09-26**). Add a `[Sonnet]` static test allowing only `CASCADE`/`SET NULL` on FKs to `auth.users`, shipped now with a self-expiring allowlist of the three offending FKs (**owner decision**), plus a runtime test that deletes an account owning a row in every referencing table. Whether the invitation FKs also ride on #967 is pending an owner decision.
- **A2, A3 premises unchanged** (no second multi-household user, no email change). But #424 added a fourth inline role→capability rule and a new email-keyed audit table one day after ADR-008 decided "uid only". Keep deferred to 2027-Q1 under one ADR ("account identity and household resolution"); add a `[Sonnet]` migration-lint fence now.
- **A6 unlocked** by #932 (CI now replays migrations and checks `schema.sql`): option 1 is a `[Sonnet]` ticket, no Astra.
- **A8**: counts unchanged (47 `supabase.from(` in 20 files, 2 guarded). 8 files show no race-guard token at all, 3 of them pet pages; with a mother and pets in the same household this violates AGENTS.md § 3.5 in daily use. Do option 3 (race guards) this quarter. It changes a sensitive health-data access path, so it is `[Opus / Astra]`, not `[Sonnet]` as first written (corrected after Codex review). One PR for the 8 unguarded files takes one Astra round; the other 12 files move to 2027-Q1. Options 1/2 need an ADR in 2027-Q1.
- **A10** unchanged; fold the dead-directory deletion into #851.
- **Review capacity**: 7 notify + 2 audit `[Opus / Astra]` tickets are already queued (≥9 Astra rounds, ~12 with rework). Assuming a sustainable 1–2 rounds/week (**accepted by the owner, 2026-09-26**), that fills the quarter. **Add one new Astra round** (A8-3, pending owner confirmation, ~13 total) and three `[Sonnet]` items (A6-1, schema contract tests, A10-1 via #851).
