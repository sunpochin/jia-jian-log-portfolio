<!--
檔案用途：規劃 Security F-5（issue #590）第 2 步——把 care_access 的授權身分從 email 字串改綁 auth.users.id 的雙軌遷移設計。
所在層：docs/architecture；授權／資料模型的規劃文件。落地前是三個施工單位的唯一設計依據，落地後把「現行契約」併回 auth-and-rls.md 與 data-model.md，本檔只保留決策理由。
主要關聯：docs/operations/security-scanning.md 的 F-5 一節、docs/operations/security-review-handoff.md、docs/architecture/auth-and-rls.md、
supabase/migrations/20260715020000_separate_care_access_from_bp_owner.sql（care_access 與 "users read their care access" policy）、
supabase/tests/rls-authorization.sql、supabase/seed.sql、.github/workflows/verify-supabase-migrations.yml。
-->

# care_access 身分綁定：從 email 主鍵改綁 `auth.uid()`（F-5 第 2 步規劃）

- 狀態：單位 1（[#710](https://github.com/portfolio-author/jia-jian-log/issues/710)）已實作，見
  `supabase/migrations/20260913160242_bind_care_access_to_auth_user_id.sql`；單位 2（[#711](https://github.com/portfolio-author/jia-jian-log/issues/711)）已實作，見
  `supabase/migrations/20260913165000_bind_care_access_rpcs_to_auth_user_id.sql`（新增 `current_care_access()` helper、13 支以呼叫者 email 授權的 RPC 與
  兩支分享兌換 RPC 改走身分綁定、四支家庭同步 RPC 直接寫入 `members.user_id`，以及
  `personal-notification-drain`／`medication-ocr`／`medication-ai-draft` 的查詢對齊）。
  單位 3（[#713](https://github.com/portfolio-author/jia-jian-log/issues/713)）已實作，見
  `supabase/migrations/20260914130000_drop_care_access_email_fallback.sql`（user_id 改 NOT NULL、
  policy 與 `current_care_access`／`fetch_shareable_patients` 拿掉 email 分支、trigger fail closed、
  正規化殘留重複列後建立 `(user_id, patient_id)` 唯一約束、八支寫入 RPC 的 conflict target 一併改過）；
  **上線前置條件（§5.2 第 1 點，營運檢查，非程式）尚未由有 staging／production 唯讀查詢權限的人執行確認**——
  這支 migration 已把該檢查做成自我防護的 runtime assertion（有殘留未綁定列會直接中止整支 migration），
  但仍需要在套用到 staging／production 前，比照文件描述的方式先看一次唯讀計數並處置非零列。
  單位 4 止血（[#774](https://github.com/portfolio-author/jia-jian-log/issues/774)）已實作，見
  `supabase/migrations/20260914150000_sync_care_access_profile_email_on_login.sql`（新增 `sync_care_access_profile_email()` RPC，
  前端每次解析身分都先把本人名下的 `profile_email` 快照同步成 JWT email，關掉「改 email 後失去既有病人」的
  可用性缺口）；做法 1 收尾也已落地，見 `supabase/migrations/20260915100000_bind_downstream_policies_to_care_access_user_id.sql`
  （101 條下游 policy 的 `care_access` 子查詢改認 `user_id = auth.uid()`，整條授權鏈不再看 email 快照，見 §5.3）。
  追蹤 issue [#590](https://github.com/portfolio-author/jia-jian-log/issues/590)。
- 日期：2026-09-11
- 風險等級：AGENTS.md 第 5 節的高風險類別（Authorization、Supabase RLS、照護者資料存取邊界、migration）。每個單位都必須由高能力推理模型實作、由不同模型獨立複審，並在 staging 以核心照護帳號正反向實測。
- 基準：`origin/staging` commit `6949c70`（本規劃盤點時的 head；實作時以當時 head 重新盤點附錄 A／B）。

## 0. ELI5（給完全不懂技術的人看）

資料庫現在判斷「這個人是不是媽媽的照護者」的方法，是看他登入時**信箱地址**是不是名單上的那一個——像警衛只看名牌上的名字。名字是可以被別人印一張一樣的：只要登入方式的設定被改掉、或公司把離職者的信箱給了新人，新來的人就直接繼承了舊人的鑰匙。

這次要改成看**身分證號碼**（Supabase 在每個帳號建立時發的 `auth.users.id`，不會重複、不會被改）。名牌先留著當備用：舊名單上還沒對到身分證的人，第一次登入時就把身分證號碼記下來，之後只認身分證。等每個人都對上了，再把「只看名牌」這條備用規則拿掉。

## 1. 為什麼要做：現況與精確的威脅模型

### 1.1 現況（2026-09-11 盤點）

- `care_access(profile_email, patient_id, can_record, can_manage_medication, can_share_readonly)` 是全站病人資料的授權真相；`profile_email` 是 `profiles(email)` 的外鍵，也是唯一鍵 `(profile_email, patient_id)` 的一半。
- **94 條現行 RLS policy、分佈在 38 張表**（含 `storage.objects` 的 4 條照片 policy）都用同一個子查詢決定授權：
  `EXISTS (SELECT 1 FROM care_access access WHERE LOWER(access.profile_email) = LOWER(auth.jwt() ->> 'email') AND access.patient_id = <row>.patient_id [AND access.can_record])`。
- **22 支現行 `SECURITY DEFINER` RPC 讀取 `care_access`**，其中 13 支以「呼叫者的 JWT email」決定授權（見附錄 B）；它們以 owner 身分執行、**不受 `care_access` 自己的 RLS 約束**。
- Edge Function：`personal-notification-drain` 用 service role 以 email 查 `care_access`；`enqueue_blood_pressure_personal_notifications` 以 `LOWER(u.email) = LOWER(ca.profile_email)` 把授權列 JOIN 回 `auth.users`；`medication-ocr`／`medication-ai-draft` 走 caller-scoped client（受 RLS），但額外帶了 `.eq('profile_email', …)`。
- 前端 `src/lib/auth.ts` 的 `profileForEmail()` 直接 `SELECT` 自己的 `care_access` 列來組病人選單，依賴 `"users read their care access"` policy。

所有這些路徑的共同點：**授權最後繫在「誰現在拿得出這個 email 的 JWT」，而不是「哪一個帳號」**。

### 1.2 「同一個 email、不同 `auth.uid()`」到底怎麼發生（比 issue 原文更精確）

issue 寫的是「啟用第二種登入方式」。實際機制要分開講，否則實作時會低估或高估：

1. Supabase `auth.users` 對非 SSO 使用者有 email 唯一索引。所以「開了 email/password provider、拿別人的 email 註冊」對**已經存在**的帳號通常不會生出第二個 user——會被拒絕，或（provider 已驗證 email 時）被 Supabase 的 automatic linking 連到既有 user。
2. 真正會產生「同 email、不同 uid」或「未證明信箱擁有權就拿到 email claim」的路徑，全部是 repo 看不到的 Dashboard／平台設定：
   - SAML SSO 使用者（`is_sso_user = true`）不受上面那個唯一索引約束，IdP 說什麼 email 就是什麼 email；
   - third-party auth（Clerk／Auth0／Firebase 等 JWT）——`email` claim 由第三方決定；
   - email/password provider 且 **Confirm email 關閉**：對「`auth.users` 裡還不存在」的 email，任何人都能立刻取得帶該 email 的 session；
   - 而 `care_access` 列**可以早於帳號存在**（seed、歷史 migration、`scripts/seed-staging.ts`、以 email 指定但對方尚未登入的授權）。這種列的擁有權就是「誰先用那個 email 登入誰的」。
3. **email 回收（Google Workspace 把離職者地址給新人）是另一種機制**：新持有者用 Google 登入時 Google 會發新的 `sub`，但 Supabase 依「已驗證的相同 email」會把新 identity 自動連結到**既有 user**——也就是同一個 `auth.uid()`。這代表 **`user_id` 綁定本身擋不住 email 回收**；擋得住的是「人離開時撤銷 `care_access` 或刪除帳號」。本計畫因此把 `user_id` 的外鍵設成 `ON DELETE CASCADE`（刪帳號＝清授權），並把「照護者離開時撤銷」列為營運檢查項。這一條是依 Supabase 文件的 automatic linking 行為推斷，**必須在 staging 用兩個測試 Google 帳號實測**（見 §6）。

結論：`user_id` 綁定把「第 2 點的所有設定層風險」從「大規模外洩」降成「只有尚未綁定的列（TOFU 視窗）有風險」，第 3 步再把視窗關掉；第 3 點靠 CASCADE 加營運流程。這和 issue 的判斷一致：值得做，但不是全面改寫。

## 2. 紅線（遷移的任何一個階段都不能破壞）

1. **核心照護授權不變量**（AGENTS.md「核心照護授權不變量」一節）：兩位核心照護者帳號對媽媽病人的讀取、照護紀錄寫入、藥單管理，遷移前後都必須通過 `supabase/tests/rls-authorization.sql` 的正反向 assertions。本檔只以角色稱呼這三個帳號，不重複其 identifier。
2. **`care_access.patient_id` 仍是唯一授權來源**；不得順手引入 household membership、role 字串或前端 flag 當捷徑。
3. **撤銷立即失效**：既有「DELETE care_access 後立刻查不到」的測試必須維持。
4. **只收緊、不放寬**：雙軌 predicate 是 OR，但已綁定（`user_id IS NOT NULL`）的列**只走 uid 軌**；不允許出現「uid 對不上但 email 對得上就放行」的寫法。
5. **不做全面改寫**：`profiles.email` 主鍵、`care_access.profile_email` 欄位與外鍵、`(profile_email, patient_id)` 唯一鍵全部保留（issue 第 3 點）。`account_usage_limits.profile_email` 等帳號層 email 鍵不在本計畫範圍。
6. **資料治理邊界**：migration 只描述規則；backfill 用 `JOIN auth.users`，不列舉任何真實 email；測試與文件只用 `owner@example.test` 這類假 identifier；核心帳號在本檔與 sub-issue 一律以角色稱呼（核心照護者 A／B、媽媽病人本人），不把既有 seed 裡的 identifier 複製到任何新檔案。
7. **可用性**：每個階段部署後，既有帳號登入不得掉任何一位病人；這用 §6 的 staging 實測與 `verify-supabase-migrations` 兩條線同時把關。

## 3. 設計決策（為什麼選這個做法，而不是另一個）

### 3.1 單一關卡：改 `care_access` 自己的 SELECT policy，而不是重寫 94 條 policy

PostgreSQL 在別張表的 policy 表達式裡引用 `care_access` 時，是用**目前查詢者的角色**去讀它，所以 `care_access` 自己的 RLS 也會套用。repo 已經有兩個證據：`is_household_member()` 之所以做成 `SECURITY DEFINER`，正是為了避免 policy 讀 `household_members` 時觸發遞迴（`20260724040000`）；`rls-authorization.sql` 開頭也註明「若不先補 `care_access` 的 grant，policy 會直接 permission denied」。

因此只要把 `"users read their care access"` 改成身分綁定版：

```sql
DROP POLICY IF EXISTS "users read their care access" ON public.care_access;
CREATE POLICY "users read their care access"
  ON public.care_access FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR (user_id IS NULL AND LOWER(profile_email) = LOWER(auth.jwt() ->> 'email'))
  );
```

94 條下游 policy 的 `EXISTS (SELECT 1 FROM care_access …)` 子查詢就**自動只看得到屬於 `auth.uid()` 的列**；它們原本的 `LOWER(access.profile_email) = LOWER(auth.jwt() ->> 'email')` 變成多餘的 AND 條件——不需要改，也不可能放寬。policy 名稱刻意不變，`scripts/backup/verify-restore.ts` 比對的 policy 身分集合與 `tests/unit/securityReviewFollowupsMigration.test.ts` 都不受影響。

被否決的替代方案：

- **逐條重寫 94 條 policy 成 `access.user_id = auth.uid() OR (…)`**（issue 原文的字面寫法）：要在一支 migration 裡 DROP／CREATE 跨 85 支歷史 migration 的 policy，diff 上千行、reviewer 無法逐條驗證、漏一條就是缺口。單一關卡達到同樣效果，且可由一條 runtime assertion 證明。
- **改成 view 或 helper function 再讓 policy 引用**：一樣要改每一條 policy，沒有比較便宜。
- **只靠 Dashboard 維持 Google-only provider**：這是第 1 步，已完成；但它是 repo 管不到的開關，沒有 code review、沒有 CI，不能當永久解法（issue 與 `environment-variables.md` 都已記載）。

### 3.2 雙軌 predicate 與 TOFU（trust on first use）

`user_id = auth.uid() OR (user_id IS NULL AND email 相符)`：已綁定的列只認 uid；尚未綁定的列沿用 email，並在第一次以該 email 登入時綁定。這維持了「今天能登入的人明天還能登入」，同時讓每一列在綁定後就不能再被 email 搶走。過渡期的殘餘風險只剩「尚未綁定的列」，由 §3.6 的第 3 單位收掉。

### 3.3 綁定寫入：trigger 當安全網，有權威 uid 的 RPC 明確寫入

`care_access` 目前有十幾條 INSERT 路徑（附錄 B 的 RPC、歷史 migration、`scripts/seed-staging.ts`、`supabase/seed.sql`）。不逐一改寫，而是：

- **`BEFORE INSERT OR UPDATE OF profile_email` trigger `bind_care_access_user_id`**（`SECURITY DEFINER`、`SET search_path = public`）：`NEW.user_id IS NULL` 時，若 `auth.users` 中 `LOWER(email)` **恰好一筆**匹配就填入，否則留 NULL。它只補值、不阻擋，所以既有寫入路徑全部不用改就會綁定。
- **拿得到權威 uid 的 RPC 改成明確寫入 `user_id`**（email 只當稽核快照，這正是 issue 點出的 `approve_caregiver_invitation` 已有 `requested_by_user_id` 的意思）：`approve_caregiver_invitation`（`requested_by_user_id`）、`accept_patient_care_invitation`（`auth.uid()`）、`auto_provision_profile`（`auth.uid()`）、`set_household_patient_access`（從 `household_members.user_id` 取）、`add_household_care_recipient`／`add_household_member`／`archive_household_pet` 的家庭同步（同上）。
- **首次登入綁定**：`auto_provision_profile` 末尾加 `UPDATE care_access SET user_id = auth.uid() WHERE user_id IS NULL AND LOWER(profile_email) = v_email`。注意 `profileForEmail()` 只在 profile 還沒有 `patient_id` 時才呼叫這支 RPC（首次登入），所以**既有帳號靠 migration backfill，不靠這一條**。
- **`delete_user_account`** 加 `DELETE FROM care_access WHERE user_id = v_user_id`（現有的依 email 刪除保留，兩者互補）。

帳號改 email 之後，單位 1 會出現「同一個 `user_id`、同一位 patient、兩個 `profile_email`」的兩列：兩列都只授權給同一個 uid，不放大任何人的權限，所以單位 1 刻意只建非唯一索引、不擋這種列；把它們合併回一列與改 upsert 的 conflict target 是單位 3 的前置工作（§5.2）。

為什麼不在 trigger 裡做「`NEW.user_id` 與 `NEW.profile_email` 必須對應同一個 `auth.users`」的一致性檢查：Google 帳號改 email 後 `auth.users.email` 與 `profiles.email` 可能短暫不一致，硬檢查會把合法寫入擋掉。第 3 單位再評估是否需要。

### 3.4 Backfill 規則：只綁「恰好一筆」匹配，不猜

```sql
UPDATE public.care_access ca
SET user_id = matched.id
FROM (
  SELECT LOWER(email) AS email_key, MIN(id::text)::uuid AS id, COUNT(*) AS n
  FROM auth.users GROUP BY LOWER(email)
) matched
WHERE ca.user_id IS NULL
  AND LOWER(ca.profile_email) = matched.email_key
  AND matched.n = 1;
```

- 零匹配（該 email 從未登入）與多筆匹配（SSO 等情況）一律留 NULL，並 `RAISE NOTICE` 未綁定筆數；**不中止 migration**，因為 staging seed 帳號本來就可能沒登入過。這沿用 `20260812110000` 的原則：對應不唯一時不猜歸屬（該 migration 選擇中止；這裡因為「授權對象尚未登入」是合法狀態而選擇留 NULL）。
- 不寫任何 email 字面值。
- backfill 是 `UPDATE … OF user_id`，不會觸發 `enforce_mother_patient_only_access_trigger`（它只監看 `profile_email, patient_id`），也不會觸發 §3.3 的 trigger。

### 3.5 外鍵用 `ON DELETE CASCADE`，不用 `SET NULL`

`SET NULL` 會讓「帳號被刪除」的列退回 email 軌——回收 email 的新持有者又能繼承，正是要堵的路徑。`CASCADE` 精確表達「帳號不存在＝授權不存在」，而且和 `app_profiles.user_id`、`household_members.user_id` 的既有做法一致。代價是 Dashboard 刪帳號會繞過 `revoke_caregiver_access` 的「核心照護授權不可撤銷」保護；這是可接受的，因為刪除帳號本來就是比撤銷更大的動作，且 `rls-authorization.sql` 會繼續證明三個核心帳號存在時授權完整。

### 3.6 三個施工單位（各自可獨立合併、依序依賴）

| 單位 | 目標 | 合併後關掉了什麼 | 合併後還沒關的 |
| --- | --- | --- | --- |
| **1. 資料層 + 單一關卡 + 測試** | 加欄位、trigger、backfill、改 `care_access` policy、seed 建 `auth.users`、RLS 測試補正反向 assertions | 所有經 RLS 評估的路徑（94 條 policy、storage、前端直接查詢、caller-scoped Edge Function） | `SECURITY DEFINER` RPC 與 service-role Function 仍以 email 判斷 |
| **2. RPC 與 Edge Function 改走身分綁定** | 新增 `current_care_access(p_patient_id)` helper；13 支以呼叫者 email 授權的 RPC 改用 helper；`enqueue_blood_pressure_personal_notifications` 與 `personal-notification-drain` 改以 `user_id` 對應 | 繞過 RLS 的所有伺服器端路徑 | 尚未綁定的列仍走 email 軌 |
| **3. 收尾：拿掉 email 軌** | 確認 staging／production `user_id IS NULL` 的列已清零或處置後：`SET NOT NULL`、policy 只留 `user_id = auth.uid()`、trigger 改成找不到 uid 就拒絕（fail closed）、加 `(user_id, patient_id)` 唯一索引、`environment-variables.md` 的 provider 檢查降級為縱深防禦 | TOFU 視窗 | — |

拆成三個而不是一個大 PR 的理由：每一個都能被獨立驗證與回滾；單位 1 的 diff 小到 reviewer 能逐行看；單位 2 是機械性但量大（13 支 RPC 重新定義），混進單位 1 會稀釋對關卡本身的審查。

## 4. 單位 1 的實作規格（施工者可直接照做）

### 4.1 Migration（一支，forward-only，冪等）

檔名 `supabase/migrations/<YYYYMMDDHHmmss>_bind_care_access_to_auth_user_id.sql`（timestamp 由施工時決定，`bun run check:migrations` 會擋重複與亂序），內容依序：

1. `ALTER TABLE public.care_access ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;`＋`COMMENT ON COLUMN`。
2. `CREATE INDEX IF NOT EXISTS idx_care_access_user_patient ON public.care_access(user_id, patient_id);`（policy 子查詢從此以 uid 過濾，沒有索引就是全表掃）。
3. §3.3 的 trigger function 與 `CREATE TRIGGER bind_care_access_user_id_trigger BEFORE INSERT OR UPDATE OF profile_email ON public.care_access FOR EACH ROW EXECUTE FUNCTION …`（先 `DROP TRIGGER IF EXISTS`）。
4. §3.4 的 backfill（含 NOTICE 計數）。
5. §3.1 的 policy 替換（同名、`TO authenticated`）。
6. `auto_provision_profile`、`approve_caregiver_invitation`、`accept_patient_care_invitation`、`set_household_patient_access`、`delete_user_account` 的 `CREATE OR REPLACE`（只加 `user_id` 寫入，其餘邏輯逐字保留；每支之後重述 `REVOKE … FROM PUBLIC` / `GRANT EXECUTE … TO authenticated`）。
7. `NOTIFY pgrst, 'reload schema';`

每一段都要有繁體中文「為什麼」註解，特別標明：policy 是 OR 但已綁定列只走 uid；backfill 不猜；CASCADE 的理由。

### 4.2 CI seed：`supabase/seed.sql` 先建 `auth.users` 再建 `care_access`

`verify-supabase-migrations.yml` 只跑 `supabase db start`（只有 Postgres，沒有 Auth 服務），而 seed 目前**沒有**任何 `auth.users` 列——所以 backfill 在 CI 什麼都綁不到，`auth.uid()` 軌完全測不到。必須在 seed 的 `care_access` INSERT **之前**加入固定 UUID 的 `auth.users` 列（trigger 才會在 INSERT 當下綁定）：

- 三個核心帳號沿用 `rls-authorization.sql` 既有的 `sub`：`…0001`（核心照護者 A）、`…0002`（核心照護者 B）、`…0005`（媽媽病人本人）；`unauthorized@example.test` 沿用 `…0004`；`owner@example.test`／`caregiver@example.test`／`viewer@example.test` 新配固定 UUID。
- 最小欄位：`id, instance_id ('00000000-0000-0000-0000-000000000000'), aud ('authenticated'), role ('authenticated'), email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at`；**同時把 `confirmation_token`、`recovery_token`、`email_change`、`email_change_token_new` 填成 `''`**——CI 只跑 Postgres 不會踩到，但開發者用完整 `supabase start` 時 GoTrue 讀到 NULL 會直接壞掉，這是 Supabase 手工 seed 的已知坑。
- `ON CONFLICT (id) DO NOTHING`，維持 seed 可重播。
- **seed 的 `auth.users` 列只代表授權矩陣，不代表 staging／production 真實帳號**（沿用 `auth-and-rls.md` 既有原則）。

### 4.3 `supabase/tests/rls-authorization.sql` 的變更

1. **`sub` 改成動態解析**：restore drill 會拿 staging dump 跑同一份測試（`database-backup.yml`），dump 內 `care_access.user_id` 是 staging 真實 uid，寫死的 `…0001` 會讓「核心照護者 A 讀得到媽媽資料」直接失敗。改成在開頭 `DO` 區塊用 `SELECT id FROM auth.users WHERE LOWER(email) = …` 解析、找不到才退回固定 UUID，並以 `set_config('request.jwt.claims', json_build_object(...)::text, true)` 取代 `SET LOCAL request.jwt.claims = '<字面值>'`。
2. **新增 F-5 核心反向 assertion**（放在核心帳號正向測試之後）：先斷言核心照護者 A 對媽媽 patient 的 `care_access.user_id IS NOT NULL`（否則 seed 沒綁定、測試無意義），再以「**同 email、不同 `sub`**」的 claims 查血壓、藥單與 `care_access` 本身，三者都必須為空。這一條就是 F-5 的回歸測試：email 被搶走也拿不到資料。
3. **新增 TOFU 過渡 assertion**：以 superuser 建一筆 `unbound@example.test` 的 profile＋`care_access`（`user_id` NULL、無 `auth.users` 列）→ 任意 `sub` 配該 email 可讀（過渡期預期）→ 模擬首次登入 `UPDATE user_id = <sub A>` → `<sub B>` 配同 email 必須讀不到。整段包在 SAVEPOINT 內回滾。
4. **新增 CASCADE assertion**：superuser 在 SAVEPOINT 內 `DELETE FROM auth.users WHERE id = <viewer uid>`，斷言 viewer 的 `care_access` 列消失，然後回滾。
5. 既有「撤銷後立即失效」「view-only 不可寫」「unauthorized 讀不到」全部保留，且要在**綁定後的 claims** 下通過。

### 4.4 其他檔案

- `tests/unit/careAccessIdentityBindingMigration.test.ts`：靜態契約（欄位＋`ON DELETE CASCADE`、索引、trigger 只補值不放行、policy 含 `user_id = auth.uid()` 且 `user_id IS NULL AND` 守著 email 軌、`TO authenticated`、五支 RPC 都寫 `user_id`、migration 內沒有任何 `GRANT … TO anon`、沒有 email 字面值）。沿用 `tests/unit/securityReviewFollowupsMigration.test.ts` 的寫法。
- `src/lib/database.types.ts`：`care_access` 加 `user_id: string | null` 與對應外鍵；前端不需要讀它。
- 文件：`docs/architecture/auth-and-rls.md`「授權模型」加一段現行契約；`docs/architecture/data-model.md` 的 `care_access` 條目補 `user_id`；`docs/operations/security-scanning.md` F-5 與 `security-review-handoff.md` 的 F-5 列改狀態；本檔狀態改為「單位 1 已落地」。

## 5. 單位 2 與單位 3 的規格摘要

### 5.1 單位 2

- 新增 helper（`SECURITY DEFINER`、`STABLE`、`SET search_path = public`、`REVOKE ALL FROM PUBLIC, anon, authenticated`——它只在其他 `SECURITY DEFINER` RPC 內被呼叫）：

  ```sql
  CREATE OR REPLACE FUNCTION public.current_care_access(p_patient_id UUID)
  RETURNS public.care_access
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT access.* FROM public.care_access access
    WHERE access.patient_id = p_patient_id
      AND (access.user_id = auth.uid()
           OR (access.user_id IS NULL AND LOWER(access.profile_email) = LOWER(auth.jwt() ->> 'email')))
    LIMIT 1
  $$;
  ```

  RPC 內改成 `SELECT * INTO v_access FROM public.current_care_access(p_patient_id); IF v_access.patient_id IS NULL OR NOT v_access.can_manage_medication THEN RAISE EXCEPTION …`，錯誤訊息逐字沿用。

- 逐支重新定義附錄 B 標記「呼叫者 email」的 13 支 RPC；每支的 `REVOKE`／`GRANT` 重述。`enqueue_blood_pressure_personal_notifications` 的收件人 JOIN 改成 `u.id = ca.user_id OR (ca.user_id IS NULL AND LOWER(u.email) = LOWER(ca.profile_email))`；`personal-notification-drain` 改 `.eq('user_id', row.recipient_user_id)`（過渡期保留 email 後援）；`medication-ocr`／`medication-ai-draft` 已受 RLS 保護，只把 `.eq('profile_email', …)` 換成以 JWT `sub` 比對 `user_id`，讓程式碼意圖與資料庫關卡一致。
- 測試：`rls-authorization.sql` 以「同 email、不同 `sub`」呼叫 `apply_medication_plan_change`，必須 `RAISE 'Not authorized …'`；單位 1 合併後這一條**會失敗**（RPC 仍看 email），正是單位 2 存在的證明——所以這條 assertion 由單位 2 一併加入，不在單位 1 先加。
- 單位 2 可視 diff 大小拆成兩個 PR（健康資料 RPC／分享與家庭管理 RPC），但同一個 sub-issue。

### 5.2 單位 3

- 前提（營運檢查，不是程式）：在 staging 與 production 各執行一次唯讀 `SELECT count(*) FROM care_access WHERE user_id IS NULL`（只看數字、不列 email）；非零的列逐筆決定是「對方從未登入的授權 → 撤銷」還是「等他登入」；`scripts/seed-staging.ts` 要先確認它寫的 email 在 staging 都有 `auth.users`，否則 `NOT NULL` 上線後 seed 會失敗。
- **migration 自我檢查在 CI 也要能通過，但不靠放寬檢查本身**：migration 一開始會用 `SELECT count(*) FROM care_access WHERE user_id IS NULL` 自我檢查前提是否成立，非零就 `RAISE EXCEPTION` 中止，無條件執行，不因環境不同而放寬。但 CI 的 `replay-local-migrations`（`supabase db start` 快速重播）不啟動 Auth 服務，從零重播時 `auth.users` 是空的，歷史上以字面 email 授權的 7 列 `care_access` 全部綁不到，這個檢查在 CI 會確定性失敗——曾經試過在 migration 裡加「auth.users 是空的就跳過／清空未綁定列」的條件，已證實會刪掉 `seed.sql` 稍後才會正確綁定回去的既有列，已改回無條件檢查；也試過在 workflow 裡「先搬開單位 1–3、套用 seed 之後再放回」，但 `20260914120000` 依賴單位 2 定義的 `current_care_access()`、`seed.sql` 依賴單位 1 新增的 `user_id` 欄位，順序一調就在 CI 之前壞掉（本機以純 Postgres 重播實證），且搬開的檔名在合併時已改成 `20260914130000`，那一版 workflow 從未成功跑過。現行解法：`verify-supabase-migrations.yml` 在 `supabase db start` **之前**用 awk 把 `supabase/seed.sql` 既有的 `auth.users` 區塊原樣擷取成排序最前的第一支 migration（版本 `20000101000000`，只存在於 runner），讓 CI 專用的假 `auth.users` 身分在所有真實 migration 之前就存在——這正是 staging／production 的真實起點（帳號早就登入過）。不另開 fixture 檔重複這些 email：`seed.sql` 已是 repo 內 CI／本機假身分的唯一來源與既有例外。該區塊除了原有的七個身分，還補上 `neneknancylee`／`demo-oauth-tester`／`joseguitarra17` 三個歷史 migration 直接以字面 email 寫入 `care_access` 的對象，因為從零重播時這三列一定存在、綁定靠 email 相符（不能改用合成 email）、而 staging 上它們已是「已綁定或已撤銷」（count = 0）。`tests/unit/ciAuthUsersFixture.test.ts` 鎖住 `seed.sql` 區塊與 workflow 擷取步驟不漂移。**本機從零 `supabase db reset` 也會撞到同一條自我檢查**，做法相同：先用同一條 awk 把區塊擷取進 `supabase/migrations/` 再 reset，事後刪掉，不要 commit。
- migration：`ALTER COLUMN user_id SET NOT NULL`；policy 改為只有 `user_id = auth.uid()`；trigger 改成解析不到 uid 就 `RAISE EXCEPTION`（fail closed，之後不會再產生未綁定列）；`current_care_access` 拿掉 email 分支。
- **`(user_id, patient_id)` 唯一索引不能直接加**，因為既有 upsert 全部以 `ON CONFLICT (profile_email, patient_id)` 為 conflict target：帳號改過 email 後，舊列仍以舊 email 為鍵、`user_id` 相同，新 email 的 INSERT 對不到舊 conflict target，會直接撞新唯一索引，讓邀請確認或家庭同步整個中止。要依序做完三件事才能建索引：
  1. **正規化重複列**：找出同一 `(user_id, patient_id)` 卻有多個 `profile_email` 的群組，保留 `profile_email` 等於目前 `auth.users.email` 的那一列，能力欄位取群組 OR，其餘刪除；找不到符合現行 email 的列就中止並輸出計數，不猜。
  2. **改所有 upsert 的 conflict target 為 `(user_id, patient_id)`**，`DO UPDATE` 同時 `SET profile_email = EXCLUDED.profile_email`（新 email 的 `profiles` 列由 `auto_provision_profile` 在該次登入已建立，外鍵不會失敗）。盤點時的寫入點：`auto_provision_profile`、`approve_caregiver_invitation`、`accept_patient_care_invitation`、`set_household_patient_access`、`add_household_care_recipient`／`add_household_member`／`archive_household_pet`／`remove_household_member` 的家庭同步、`scripts/seed-demo.ts`（`onConflict: 'profile_email,patient_id'`）與 `scripts/seed-staging.ts`；實作時重新 grep `ON CONFLICT (profile_email, patient_id)` 與 `onConflict`。
  3. 前兩步同一支 migration 內完成後才 `CREATE UNIQUE INDEX … ON care_access(user_id, patient_id)`。若第 2 步要延後，索引就維持單位 1 的非唯一版本，不得先建唯一索引。
- 文件：`environment-variables.md` 的「Supabase Auth provider」改寫成縱深防禦（仍檢查，但不再是唯一防線）；`auth-and-rls.md` 的「email 比對要用防禦性的不區分大小寫方式；但 email 不能成為 patient 的資料主鍵」補上「也不再是照護者身分的主鍵」。

### 5.3 單位 4：下游 policy 仍 AND email 的可用性缺口（issue #774）

- **現況**：§3.1 刻意不逐條重寫下游 policy，所以單位 3 之後的整體授權是「`care_access` RLS 以 `user_id = auth.uid()` 篩列」AND「下游 83 條 policy 仍比對 `LOWER(access.profile_email) = LOWER(auth.jwt() ->> 'email')`」。安全面只收緊、不放寬（偽造 email claim 拿不到任何健康資料，`rls-authorization.sql` 的 `f5_unit3_uid_only` 已斷言）；可用性面：同一個 uid 若 Google 帳號改了 email，JWT email 變了但 `profile_email` 快照沒同步，該使用者會失去所有既有病人的讀寫，直到某條寫入路徑剛好更新那一列。這與 AGENTS.md「核心照護帳號不得掉任何一位病人」有張力。
- **做法取捨**（#774 列了三個選項）：
  1. 逐條把下游 83 條 policy 的 email 條件改成 `access.user_id = auth.uid()`（或拿掉 email 條件）——語意最乾淨，但 §3.1 反對逐條重寫的理由（跨 85 支歷史 migration、diff 上千行、reviewer 無法逐條驗證、漏一條就是缺口）現在仍成立，且 `scripts/backup/verify-restore.ts` 比對的 policy 身分集合要同步更新。
  2. **同步快照——已實作**：`20260914150000_sync_care_access_profile_email_on_login.sql` 新增只做快照對齊的 RPC `sync_care_access_profile_email()`。只改 `ca.user_id = auth.uid()`（本人）的列、只改 `profile_email`、改成本人剛驗證過的 JWT email；能力欄位與 `patient_id` 不動，因此不會新增或放寬任何一筆授權，只是讓早就屬於這個 uid 的授權重新可用。前端 `profileForEmail()` 每次解析身分都先呼叫它再讀 `profiles`／`care_access`；`auto_provision_profile()` 首次 provision 時也呼叫一次。**#774 原文寫的「`auto_provision_profile()` 每次登入都會呼叫」不成立**：`src/lib/auth.ts` 只在「這個 email 還沒有 `profiles` 列」時才呼叫它——改 email 的主要情境（新 email 沒有 `profiles` 列）確實會經過，但 (a) 曾因唯一鍵守門略過同步、owner 之後才撤銷殘留授權，(b) 新 email 早就有 `profiles` 列（例如以前被邀請過），(c) 有待接受的病人邀請而延後 provision，這三種情況之後的登入都不會再進去；所以同步必須是獨立、每次解析身分都可呼叫、且冪等的 RPC。
  3. 兩者都做：先 2 止血、再 1 收尾——**兩者現在都已落地**（2 於 2026-09-14，1 於 2026-09-15，見本節末「收尾」）。選擇先做 2 的理由是爆炸半徑：它不動任何 policy、不動 schema，整體授權語意維持單位 3 的「uid AND email」，偽造 email 的既有斷言一條都不用改；做錯的最壞情況是「某位使用者維持登入前狀態」，而做法 1 做錯的最壞情況是某條 policy 缺口。
- **為什麼同步目標是 JWT email 而不是 `auth.users.email`**：下游 policy 比對的正是 JWT email；JWT 換發前兩者可能短暫不一致，同步成 `auth.users.email` 反而會讓舊 token 的請求在換發前對不上。也不在 `auth` schema 上掛 trigger（Supabase 不建議，且 auth 端沒有可靠的「email 改了」事件）。
- **三個必須守住的邊界**（`tests/unit/careAccessProfileEmailSyncMigration.test.ts` 靜態鎖定、`rls-authorization.sql` 的 `f5_unit4_email_sync`／`f5_unit4_email_sync_conflict` runtime 驗證）：
  1. 外鍵前提：新 email 的 `profiles` 列不存在時 RPC 是 no-op（回 0）；`auto_provision_profile()` 因此在 `INSERT INTO profiles (v_email)` 之後才呼叫它，否則 `profile_email → profiles(email)` 找不到新 email。
  2. `(profile_email, patient_id)` 唯一鍵：同一位 patient 若已有一列「新 email 但綁在別的 `user_id`」（email 曾屬於別的帳號、那一列還沒被撤銷或 CASCADE 掉），`NOT EXISTS` 讓同步略過本人那一筆——不猜、不合併，留給 owner 依 `set_household_patient_access` 既有的「先撤銷舊授權」規則處理。
  3. 同步失敗不阻斷登入：整段包在 `BEGIN … EXCEPTION WHEN OTHERS` 裡，失敗只回 0、寫 WARNING 並維持同步前狀態；前端對 RPC 錯誤也只 `console.error` 後照常讀取身分。讓登入／`auto_provision_profile` 整支失敗會連個人空間都進不去，比現況更糟。這不是授權判斷，所以不適用 fail closed。
- **policy 數量**：#774 盤點時是 83 條；§3.1 規劃時是 94 條；本 PR 本機重播時 `pg_policies` 裡引用 `care_access` 的已超過 100 條（後續 migration 持續新增）。文件裡的數字只是盤點快照。做法 1 施工時（無 Docker）改以「靜態重播 `supabase/migrations` 全部 `CREATE`／`ALTER`／`DROP POLICY`、取每條 policy 最後定義」建構清單：123 條 live policy 中 102 條提到 `profile_email`，其中 101 條是 `care_access` 子查詢的 email 比對（40 張表，含 `storage.objects` 5 條），剩下 1 條（`active_patient_preferences` SELECT）比對的是自己那一列的 `profile_email` 欄位、不在範圍內；83／94 都低估了。
- **觸發器面**：`bind_care_access_user_id_trigger` 只在 `NEW.user_id IS NULL` 時解析身分，這裡 `user_id` 早已 NOT NULL，不會進 fail-closed 分支；`enforce_mother_patient_only_access_trigger` 只在新 email 是媽媽帳號且 patient 不是她本人時 `RETURN NULL`（靜默略過該列），不會 RAISE、不可能放寬。
- **驗證**：本機純 Postgres 重播全部 migration → `seed.sql` → `rls-authorization.sql`（bootstrap 最小 `auth`／`storage` shim，不進 repo）；PR 觸發 `verify-supabase-migrations`。
- **收尾（已施工，2026-09-15）**：`20260915100000_bind_downstream_policies_to_care_access_user_id.sql` 用 `ALTER POLICY` 逐條把 101 條 policy 的 `LOWER(access.profile_email) = LOWER(auth.jwt() ->> 'email')` 換成 `access.user_id = auth.uid()`；名稱、指令、角色與其他條件（`patient_id` 對應、能力位、`recorded_by`／`created_by` 記錄者稽核、`is_admin_email()`、storage path 前綴）逐字不動，所以 `verify-restore.ts` 比對的 policy 身分集合**不需要**更新（§3.1 反對逐條重寫的「diff 上千行」顧慮，靠「只換一個述詞、其他逐字保留、reviewer 可 diff 對照」化解）。檔尾以 `pg_depend` 自我檢查（查 policy 對 `care_access.profile_email` 欄位的 catalog 依賴，不比對 `pg_policies` 反解析文字，別名或引號怎麼寫都躲不掉）沒有任何 policy 還在比對 `access.profile_email`，漏一條就讓 `db push` 失敗；`ALTER POLICY` 對不存在的 policy 直接報錯（不用 `IF EXISTS`），環境 policy 集合跟 repo 不一致時也會擋下。`rls-authorization.sql` 的 `f5_unit3_uid_only` (c) 與 `f5_unit4_email_sync` 前置斷言已反轉成「快照過期仍讀得到」；`tests/unit/downstreamPolicyUidOnlyMigration.test.ts` 靜態鎖定 101 條身分清單、只用 `ALTER POLICY`、無殘留 email 比對。本節的同步 RPC 保留（無害、仍讓稽核快照跟上 JWT email）。

## 6. 驗證方式

| 層 | 做什麼 | 通過標準 |
| --- | --- | --- |
| 靜態契約 | `bun test tests/unit/careAccessIdentityBindingMigration.test.ts`（單位 1 新增） | 全綠；`bun test tests/unit` 其餘不受影響 |
| Migration replay + runtime RLS | PR 觸發 `verify-supabase-migrations`（改到 `supabase/migrations/**`、`supabase/tests/**`、`supabase/seed.sql` 都會觸發） | replay 成功；`rls-authorization.sql` 舊有 assertions＋§4.3 新增四組全過。本機沒有 Docker 時不得 `pip install` 或改用其他工具鏈，以 CI 結果為準並在 PR 註明 |
| 還原演練 | 合併後下一次 `database-backup.yml` 的 restore drill | `verify-restore.ts` 的 policy 集合比對與 RLS assertions 仍綠（這是動態 `sub` 的驗收點） |
| Staging 實測（人工，migration 由 staging workflow 自動套用後） | (1) 三個核心帳號登入，各自能看到並讀寫媽媽的血壓／藥單；(2) 用 staging 測試帳號走一次「邀請家人 → 申請 → owner 確認」，用唯讀查詢確認新列 `user_id IS NOT NULL`；(3) owner 撤銷後對方立即被拒；(4) **CASCADE 實測**：用一個可拋棄的 staging Google 帳號登入取得授權，在 Supabase Dashboard 刪除該 `auth.users` 列後，確認其 `care_access` 已 CASCADE 消失；再以同 email 重新登入，確認拿到的是全新 uid 且沒有任何授權（這一步只證明 CASCADE 與「刪帳號後重新登入不繼承」，**不能**證明 automatic linking）；(5) **automatic linking**：只有在有 Google Workspace 測試網域、能把同一個地址重新指派給另一個 Google identity時才做——保留舊的 `auth.users` 列不刪，以新 identity 登入，查看 session 的 `sub` 是否等於舊 uid。做不到就維持「未驗證」，不得改寫 §1.2 的措辭 | (1)～(4) 皆符合；(5) 若無法執行，在 `security-review-handoff.md` 明寫未驗證。任何一項不符即停止 promotion 並回到本檔修訂設計 |
| 語意化安全審查 | 本機 `/security-review`（載入 `ai-security-review-prompt.md` 與 `ai-security-review-false-positives.md`），並依 `docs/ai/model-routing.md` 交由獨立模型複審 | Critical／High 為零或有人工 disposition；結果回寫 `security-review-handoff.md` |

驗證時**不得**讀取 secret、真實健康資料或對 production 做任何試探；staging 查詢只回傳計數。

## 7. 風險、回滾與未驗證假設

- **回滾**：repo 是 forward-only migration。單位 1 的回滾是一支新 migration：把 policy 改回 email-only、`DROP TRIGGER`；欄位與索引留著無害。單位 3 的回滾是恢復雙軌 policy 並 `DROP NOT NULL`。
- **效能**：`care_access` 列數等於「照護者×病人」，很小；但 policy 子查詢是每張表每列都跑，所以 `(user_id, patient_id)` 索引必須跟欄位同一支 migration 上線。repo 現行 policy 用裸 `auth.uid()`，本計畫沿用；若 Supabase linter 提出 `auth_rls_initplan`，另開 issue 統一改成 `(SELECT auth.uid())`，不在這裡混做。
- **restore drill 相容性**：dump 是否包含 `auth.users` 決定 backfill 在還原庫的結果；§4.3 的動態 `sub` 兩種情況都能過，但第一次 drill 結果要人工看一眼。
- **Supabase linter**：外鍵沒有索引會被 `unindexed_foreign_keys` 標記——§4.1 第 2 步已涵蓋。
- **未驗證假設**（實作前或 staging 階段要證實，不能寫進文件當事實）：
  1. Supabase automatic linking 對「同 email、不同 Google `sub`」的行為（§1.2 第 3 點）。§6 的 (4) 驗不到它，只有 (5) 能，而 (5) 需要 Workspace 測試網域。設計對兩種結果都安全：會 link 時靠「離開即撤銷／刪帳號 + CASCADE」，不會 link 時新持有者拿到全新 uid、本來就沒有授權；所以這條假設影響的是營運檢查的優先順序，不是設計正確性；
  2. `supabase db start` 的本機 `auth.users` 可用 §4.2 的最小欄位集合插入；
  3. `auth.users.email` 在既有環境已全部小寫（backfill 用 `LOWER()` 比對，即使不是也安全）；
  4. staging／production 目前 `user_id IS NULL` 的列數（單位 3 的前提）。

## 8. 不做的事（明確劃出邊界）

- 不改 `profiles.email` 主鍵、不改 `account_usage_limits.profile_email`（付費旗標仍 email-keyed；若要處理另開 issue，屬於帳號層而非病人資料層）。
- 不改 `medication_plans "admin can manage medication plans"`／`medications "admin can manage medication catalog"` 這類以管理者 email 硬寫的 policy（F-6 類型，已另有處置紀錄）。
- 不改 `weight_settings`、`active_patient_preferences` 等帳號偏好表的 email policy（不含健康判讀）。
- 不引入 Google `sub`／`auth.identities.provider_id` 綁定；`auth.users.id` 已足夠且是 Supabase 的正式主鍵。
- 不把單位 2 的 13 支 RPC 改寫混進單位 1。

## 9. UI／UX 觸點（延後，不阻塞三個單位）

這份規劃的三個單位都不改任何畫面：前端 `profileForEmail()` 讀 `care_access` 的方式不變，照護者登入後看到的病人選單也不變。但盤點時發現四個「資料層改了之後，畫面才說得清楚」的觸點。它們**不是**這次的驗收條件，先記在這裡，之後另開 session 用 `/ui-ux-pro-max` 做設計；設計時仍受 AGENTS.md 三語規範（zh／id／en 同一個變更內補齊）與「前端隱藏不是授權」約束。

| 觸點 | 為什麼會浮上來 | 延後到哪個時間點 | 設計時要回答的問題 |
| --- | --- | --- | --- |
| 家庭管理頁的照護者清單顯示「尚未登入／已綁定」 | 單位 3 的前提是「`user_id IS NULL` 的列已處置」。現在 owner 只看得到 email 清單，看不出哪些人從沒登入過、哪些是「留著沒用的鑰匙」；營運上得靠 SQL 查計數 | 單位 2 合併後、單位 3 之前 | `fetch_household_patient_access` 是否多回傳一個 `bound: boolean`；未綁定要不要在列上給「提醒對方登入」／「撤銷」兩個動作；三語文案怎麼寫才不會讓家屬以為「未綁定＝資料外洩」 |
| 「照護者離開時撤銷」的引導 | §1.2 第 3 點：email 回收靠撤銷或刪帳號擋，不靠 `user_id`。撤銷入口已存在（`CaregiverInvitationManagement` 的 `revoke_caregiver_access`），但沒有任何地方提醒 owner「人離開了記得撤銷」 | 與上一列同一次設計 | 是放在家庭管理頁的常駐說明、還是只在「超過 N 天未登入」時才出現；要不要在公開教學頁 `/guides/family-invitations` 補一段 |
| 刪除帳號確認框的說明文字 | §3.5 的 `ON DELETE CASCADE` 讓「刪帳號」多了一層語意：同時移除你對所有病人的照護授權（以前是 RPC 自己刪，語意相同但沒寫在畫面上） | 單位 1 合併後即可，改的只是 `DeleteAccountModal` 的三語文案 | 一句話讓看護與家屬都懂：「刪除後你將無法再看到或記錄任何人的資料；家人若要你回來，需重新邀請」 |
| 分享連結因建立者帳號被刪而失效 | 附錄 B 最後一列：`patient_share_links` 改以 `created_by_user_id` 檢查後，建立者刪帳號＝連結立即失效，接收端只會看到既有的中性「連結無效或已過期」 | 不需要新畫面；只在 `docs/product/family-invitations.md`／分享連結說明補一句 | 是否需要在管理頁的連結列表顯示「建立者已離開」 |

刻意不在本規劃裡直接寫這些畫面的 UI 規格：它們的價值取決於單位 3 何時能拿掉 email 軌，先做畫面會讓「未綁定」這個過渡狀態被固化成產品概念。

## 附錄 A：現行 policy 分佈（2026-09-11，`origin/staging` `6949c70`）

以 migration 時序重建的**現行** policy 中，引用 `care_access` 的共 94 條、38 張表：`active_patient_preferences` 2、`blood_pressure_notification_deliveries` 3、`blood_pressure_records` 5、`body_temperature_records` 4、`calendar_notification_sources` 1、`care_due_reminder_deliveries` 1、`care_due_reminders` 4、`care_timeline_entries` 4、`dementia_care_records` 3、`fluid_balance_records` 4、`meal_food_catalog_items` 4、`meal_record_items` 2、`meal_records` 2、`medication_intake_logs` 3、`medication_ocr_call_logs` 1、`medication_plan_change_logs` 1、`medication_plans` 1、`notification_deliveries` 1、`notification_subscriptions` 1、`patient_daily_care_preferences` 4、`patient_medication_instructions` 4、`patient_weight_measurement_records` 3、`patients` 1、`personal_notification_outbox` 1、`pet_appetite_records` 2、`pet_blood_glucose_records` 2、`pet_blood_glucose_target_ranges` 1、`pet_digestion_records` 2、`pet_insulin_records` 2、`pet_liquid_intake_records` 2、`pet_subcutaneous_fluid_records` 2、`prn_medication_daily_assessments` 3、`prn_medication_events` 3、`storage.objects` 4、`user_patient_care_preferences` 4、`weight_measurement_records` 3、`weight_records` 2、`weight_settings` 2。

這些全部由 §3.1 的單一關卡覆蓋，不需逐條修改。實作時用同樣方法重新盤點一次（policy 可能在本檔之後又增加）。

## 附錄 B：現行讀取 `care_access` 的 `SECURITY DEFINER` RPC（22 支）

| RPC | 授權依據 | 單位 2 處置 |
| --- | --- | --- |
| `apply_medication_plan_change` | 呼叫者 email | 改用 `current_care_access` |
| `create_caregiver_invitation(UUID, TEXT, BOOLEAN, BOOLEAN)` | 呼叫者 email（owner 需對病人有 access） | 改用 `current_care_access` |
| `create_patient_share_link`、`list_patient_share_links`、`revoke_patient_share_link`、`fetch_shareable_patients` | 呼叫者 email | 改用 `current_care_access` |
| `enqueue_blood_pressure_personal_notifications` | 呼叫者 email；收件人以 email JOIN `auth.users` | 呼叫者改 helper；JOIN 改 `user_id`（過渡期保留 email 後援） |
| `fetch_household_archived_pets`、`fetch_household_management_patients` | 呼叫者 email | 改用 `current_care_access` |
| `record_meal_item`、`search_patient_food_catalog` | 呼叫者 email | 改用 `current_care_access` |
| `record_pet_endocrine`、`upsert_pet_blood_glucose_target_range` | 呼叫者 email | 改用 `current_care_access` |
| `approve_caregiver_invitation`、`accept_patient_care_invitation`、`auto_provision_profile`、`set_household_patient_access`、`delete_user_account` | 寫入路徑（呼叫者以 `auth.uid()`／household 驗證） | 單位 1 已改成寫入 `user_id` |
| `archive_household_pet`、`remove_household_member`、`add_household_care_recipient`、`add_household_member` | household owner（`auth.uid()`）；同步 `care_access` 時以 household 成員 email 寫入 | trigger 自動綁定；單位 2 改成直接用 `members.user_id` 寫入 |
| `fetch_caregiver_invitations`、`fetch_household_patient_access`、`revoke_caregiver_access` | household owner（`auth.uid()`）；以**目標** email 查／刪 `care_access` | 不變（目標 email 仍是 owner 指定的收件人；刪除同時比對 `user_id` 可選） |
| `redeem_patient_share_link`、`get_patient_share_summary` | service-role token 流程；以 `links.created_by_email` 對 `care_access.profile_email` 檢查建立者的 `can_share_readonly` 是否仍在 | `patient_share_links` 已有 `created_by_user_id`（nullable、`ON DELETE SET NULL`）：改成 `access.user_id = links.created_by_user_id`，`created_by_user_id IS NULL` 的舊連結才退回 email 比對；建立者帳號被刪除時連結因此自動失效，這是想要的行為 |

Edge Function：`personal-notification-drain`（service role，改 `user_id`）、`medication-ocr`／`medication-ai-draft`（caller-scoped，單位 1 即受保護；單位 2 只對齊查詢條件）、`blood-pressure-notifier`／`calendar-agenda`／`care-due-reminders`（caller-scoped 或只讀自己的訂閱，不直接查 `care_access` 的 email，不需改）。
