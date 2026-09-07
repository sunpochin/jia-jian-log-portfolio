<!--
檔案用途：記錄登入、同意、家庭授權與資料庫 RLS 的安全設計。
所在層：docs/architecture；供 auth、care access、patient boundary 與 migration 修改使用。
主要關聯：AGENTS.md 核心照護授權不變量、Supabase migrations、src/lib/auth.ts 與 tenant adapter。
-->

# 身分驗證與 RLS / Auth and RLS

## 安全邊界

Google Identity Services 只證明登入者身分；前端 route guard 只改善體驗。Supabase anon key 會出現在瀏覽器，因此所有 SELECT、INSERT、UPDATE、DELETE 與 RPC 權限都必須由 RLS／資料庫函式強制執行。任何「前端看不到」的資料都仍要能抵抗直接 REST API 呼叫。

## 登入流程

1. 使用者在公開登入頁閱讀條款與隱私連結，點擊 Google 官方按鈕。
2. Google 在 popup／FedCM 完成帳號選擇，把 ID token credential 回傳給前端；前端以原始 nonce 呼叫 `supabase.auth.signInWithIdToken()`，不把使用者導到 Supabase project-ref 網域。
3. nonce 每次登入重新產生；Google 收到 SHA-256 hex，Supabase 收到原始值，讓 Auth 能驗證 token 沒有被重放。
4. session 取得後，資料庫以 Auth UID／JWT email 對應 profile。
5. 未授權帳號看到雙語拒絕頁，不建立可讀寫家庭資料的捷徑。
6. 新家庭使用 transaction RPC 一次建立 profile、household、owner membership 與第一位 patient，避免前端分五次寫入留下半套帳戶。

LINE 內建瀏覽器不適合完成 Google GIS 登入。App 不再用 `location.href` 在 LINE 內自我重新整理，因為那只會留下同一個 WebView；偵測到 LINE 時改顯示雙語提示與 `target="_blank"` 外部瀏覽器連結，讓使用者明確在 Safari／Chrome 完成登入。這也避免第一筆照護資料寫入後，第二次操作因 WebView session／Google popup 限制而看似「跳出 App」。

GIS 按鈕仍需要 Supabase Dashboard 的 Google provider 啟用並設定同一個 Google Web Client ID／secret；差異只在前台不再使用 Supabase OAuth callback redirect。`VITE_GOOGLE_CLIENT_ID` 是可公開的瀏覽器設定，不是 secret；允許登入的帳號仍由 `profiles` 與 RLS 決定。

### Capacitor 原生登入轉接（Issue #544）

Capacitor iOS 只把既有 Vite `dist/` 放進原生殼；`src/lib/nativeAuth.ts` 是薄 adapter，使用 `signInWithOAuth({ skipBrowserRedirect: true })` 取得 Supabase authorize URL，再交給系統瀏覽器，回到固定的 `jia-jian-log://auth/callback` 後只接受 PKCE `code` 並呼叫 `exchangeCodeForSession()`。Web／PWA 不走這條路，仍使用上面的 GIS ID-token 流程；因此不會為 iOS 複製一套 React UI、資料模型或 session store。

callback parser 只接受固定 scheme／host／path、PKCE 相關欄位與有限長度，拒絕 fragment、authority credentials、token query 參數與未知欄位；OAuth error 只回傳固定哨兵值，不把 provider 描述帶進畫面或 log。交換前釋放 adapter 持有的 code，callback 由原生 event 直接交給 Supabase，不寫入 adapter 自己的 localStorage、analytics 或錯誤訊息。PKCE verifier 與 session persistence 仍由共用 Supabase client 管理，這是「冷啟動可恢復」與「不自行複製 token 管理」之間的必要邊界。

原生殼不改變授權：健康資料查詢仍須由登入後 session、明確的 `care_access.patient_id` 與既有 RLS 放行；未授權帳號不能因知道 deep link 或 patient UUID 而讀取資料。本 issue 不新增 migration、不放寬 RLS、不加入通知、HealthKit 或 SwiftUI 第二套畫面；Simulator／staging OAuth redirect allowlist 與正反授權資料矩陣仍是人工驗收 gate。

email 比對要用防禦性的不區分大小寫方式；但 email 不能成為 patient 的資料主鍵。

## 授權模型

`care_access.patient_id` 或 `household_members` 是可讀寫範圍的明確來源。每筆資料的 policy 必須同時檢查登入 UID、目標 patient 與操作類型；代填者的權限不應被誤當成病人本人。

`care_access` 對 `authenticated` 只開放 SELECT，且 policy 仍以 JWT email 限制只能看自己的授權列；`20260822100000_grant_authenticated_care_access_select.sql` 是補足 PostgreSQL table privilege，不是把授權表變成可任意瀏覽或可直接修改。新增／修改／撤銷 access 仍必須走受控 RPC，健康資料的 RLS 也會再次以 `patient_id` 驗證。

媽媽帳號 `demo.mother@example.test` 的 `profiles.patient_id` 是唯一可操作對象。家庭成員／寵物同步不得把 household membership 轉成她對其他 patient 的 access；`20260815010000_enforce_mother_patient_only_access.sql` 會清理既有 foreign grants 與 stale active-patient preference，並在 `care_access` 寫入前阻止再次授權。這個資料庫閘門與前端 `profileForEmail` 的 own-patient 過濾互相獨立，避免只靠畫面隱藏造成服藥或其他健康資料旁路。

被照顧者加入採兩階段授權：`create_household_patient_invitation` 只由 owner 建立人類 patient 與待接受邀請，不寫入 `care_access`；受邀 Google 帳號只能透過 email 綁定的 `accept_patient_care_invitation` 接受，成功後才建立被照顧者自己的 access 與邀請照顧者的 access。待接受邀請查詢也回傳由 `auth.users`／`app_profiles` 衍生的邀請人姓名與 Email，供被照顧者在同意前核對，不把可自由填寫的授權依據當成身分證明；查詢錯誤不得被當成空結果而觸發 auto-provision。邀請 table 不開放直接 SELECT／寫入，避免 client 以任意 patient UUID 或 email 偽造授權。

生理數值與會改變健康判讀的病人專屬目標／警示門檻，不論從輸入表單、圖表、匯出、通知或快取進出，都必須先解析並驗證目標 `patient_id`。「自己」只是 UI 關係描述，不是授權捷徑；資料庫仍要把登入者對應到可存取的 patient。純顯示偏好可以只檢查 `auth.uid()`，但一旦設定會影響特定病人的健康判讀，就必須改走 patient 授權。

內分泌模組遵守同一個邊界：`pet_blood_glucose_target_ranges.patient_id` 是血糖 target 的唯一分區鍵，讀取 policy 只允許該 JWT 對應的 `care_access.patient_id`，更新只能由 RPC 再驗證 `can_record`。`record_pet_endocrine` 不信任前端的 actor email 或 active tab，先驗證明確 patient access，再在同一交易內寫入胰島素與血糖；invalid value 或撤銷 access 會讓整次寫入失敗。這避免「頁面隱藏了病人」或「第一個 request 成功」被誤當成授權／一致性的證據。

核心照護不變量：`admin@careapp.local` 與 `demo.caregiver@example.test` 必須持續能讀取、寫入照護紀錄並管理 `demo.mother@example.test` 對應病人的藥單。任何 RLS 或家庭管理變更都要以 staging 測試這條 read/write 路徑。

既有帳號若在家庭搬遷 migration 之後才首次登入，可能已有明確的 `care_access` 卻尚未有 `household_members`。`20260811010000_repair_core_household_memberships.sql` 只對三個已確認核心帳號，沿著完整 `care_access` 的 `patient_id → patients.household_id` 補回對應 membership；找不到完整授權時不建立任何 membership，也不覆蓋既有角色。這讓家庭管理 RPC 能工作，同時不把任意登入帳號的病人存取權推論成家庭成員資格。

因為前一版 `20260811010000` 可能已先部署到 staging，`20260811020000_repair_viewer_household_membership.sql` 以同樣的冪等策略補 viewer 的最小明確存取條件，確保已部署環境也能完成修復。

`user_settings` 是例外的帳號層偏好，不需要 `care_access`：每個 policy 都以 `user_id = auth.uid()` 限制本人讀寫，client 傳入的 UID 仍不能越過 RLS。它只保存介面閱讀習慣，不含 patient 或健康事實，因此不會改變核心照護授權不變量。

`patient_daily_care_preferences` 是被照護者共用的顯示偏好，policy 只允許透過 `care_access.patient_id` 授權的照護者讀寫該病人的共同設定；它不能讓未授權帳號藉由偏好列取得血壓、服藥或其他健康資料，資料本身仍由各 feature table 的 RLS 保護。舊的 `user_patient_care_preferences` 保留作 migration 相容與稽核參考，不再是現行讀寫來源。

共用顯示偏好的 INSERT／UPDATE／DELETE 以及舊表的 INSERT／UPDATE 都要求 `care_access.can_record`；view-only 照護者仍可讀取，但不能藉由舊版 PWA 間接改動共同入口。過渡期內，舊表的新增／更新由 invoker trigger 同步到共用表，共用表變更則由受控的 `SECURITY DEFINER` trigger 回填所有舊列；雙向 trigger 以 trigger depth 防止遞迴，避免舊版分頁成功寫入卻讓新客戶端看到另一套設定。

照護大事記照片使用 private `care-event-photos` bucket，不使用 public URL。Storage object path 的病人 UUID 只作分區索引，真正的 SELECT／INSERT／DELETE policy 仍查 `care_access`；資料表 CHECK validator 還會逐筆比對 `patients/{patient_id}/events/{id}/` 前綴及原圖／縮圖成對命名，避免有權限看多位病人的照護者藉由手寫 JSONB path 交叉引用照片。前端只在時間線列表簽署縮圖，單張（尤其剛上傳的第一張）直接使用單檔 endpoint，點擊時才簽署原圖；批次簽署缺項時改用單檔 endpoint 補簽，URL 過期時重新簽署，並在原圖失敗時保留預覽退路，這些行為都不改變 private bucket、caller session 或 RLS，signed URL 也不回寫資料庫。瀏覽器 CSP 僅將 Supabase project subdomain 加入 `img-src`，讓 signed URL 能載入但不允許任意外部圖片來源。保留層級放在無 client grant 的 `account_usage_limits.photo_retention_tier`；service-role 清理 Function 只刪 private Storage API 允許的 path，完成後才清空事件 metadata。

PRN 使用事件與每日 assessment 都以 `care_access.patient_id` 為讀寫邊界，寫入要求 `can_record`；事件另外要求 JWT 的 `auth.uid()`／email 與記錄人一致，並確認 plan、medication、patient 三者相符且 plan 是 `as_needed`。事件只能由 active 轉為 voided，資料庫 trigger 鎖住實際時間、病人、藥單、記錄人等稽核欄位。這條路徑不依賴 household membership 或前端隱藏按鈕，因此不會削弱 portfolio-author 與 caregiver 對媽媽 patient 的既有明確授權。

調藥 RPC 仍以 `care_access.patient_id` 與 `can_manage_medication` 驗證，`auth.uid()`／JWT email 只作 actor 稽核欄位；時間線 system event 的 linkage 由 SECURITY DEFINER RPC 建立，authenticated INSERT policy 明確拒絕 `medication_change` 與非 NULL linkage。UPDATE／DELETE policy 與資料庫 trigger 同時拒絕修改或刪除 linked system event。staging 驗證時必須用 `admin@careapp.local` 與 `demo.caregiver@example.test` 對 `demo.mother@example.test` 的 patient 實測讀取、建立／調整／停用 plan，並確認兩張表各只有一筆對應事件。

Calendar 通知的 `calendar_notification_sources` 與 `notification_deliveries` 也只允許 authenticated 使用者以 `care_access.patient_id` SELECT 自己被授權病人的狀態。兩張表沒有 authenticated 的 INSERT／UPDATE／DELETE policy，且 SQL privilege 明確 revoke client DML；這使瀏覽器不能手動建立 delivery、跳過唯一去重鍵或把 source 接到另一個病人。Supabase Cron 呼叫的 Edge Function 使用 server-only service role，但 Function 的 HTTP 入口仍以 `CALENDAR_NOTIFIER_CRON_SECRET` 驗證，因為它不是照護者 JWT。這條路徑用 service account 讀取已分享的專用次要 Calendar，不修改現有 Google GIS scope，也不把 Google OAuth token 交給前端。

`care_due_reminders` 延續同一個病人級邊界：一般照護者只能 SELECT 自己有 `care_access` 的提醒，新增／修改／刪除必須同時有該 patient 的 `can_manage_medication`；delivery audit 只允許授權讀取，寫入與狀態轉移只由 Cron service role 執行。提醒表與 delivery 以 `(reminder_id, patient_id)` 複合外鍵再驗一次歸屬，避免只換 UUID 就把送達紀錄接到另一位病人；`supabase/tests/rls-authorization.sql` 同時覆蓋已授權建立與未授權拒絕。

`calendar-agenda` 不是 Cron endpoint：它保持 `verify_jwt = true`，用 `withSupabase({ auth: 'user' })` 的 caller-scoped client 驗證登入者並查詢同一張來源表的 `patient_id` 與 `agenda_enabled=true`。它不使用 service role，因此 caregiver 只會取得她已有 `care_access` 的媽媽來源；request 不接受 calendar ID、email 或任意 source ID，避免前端把自己的日曆改接到別人病人。Google 資料只在 Function 與 React 記憶體短暫存在，沒有新增可由 RLS 誤讀的 event table。

`blood-pressure-notifier` 不是資料寫入捷徑：它保持 `verify_jwt = true`，只接受 `recordId`／`patientId`，再用同一個 caller-scoped client 精確讀取血壓紀錄與病人名稱。RLS 先限制該 JWT 能看到的 `patient_id`，Function 再要求 `recorded_by` 與 JWT email 相同，避免有權讀取多位病人的照護者代送別人的 Telegram 提醒；血壓數值與名稱不信任瀏覽器 payload，也不使用 service role。這讓 `admin@careapp.local`、`demo.caregiver@example.test` 對媽媽 patient 的既有 read/write access 直接沿用資料庫授權，不需要帳號白名單。

唯讀分享 Stage 2 新增兩支 `verify_jwt = false` 的公開 Function，服務沒有帳號的分享連結接收者：`share-link-exchange` 接受 raw bearer token，以 SHA-256 hash 呼叫 `redeem_patient_share_link`（只授權給 `service_role`）換成 15 分鐘的 HMAC session，兩層 hashed bucket（IP、token）rate limit 由 `check_share_link_rate_limit` 把關，任何失敗（格式錯誤、查無此連結、已撤銷、已過期、同意已撤回）一律回同一句「連結無效或已過期」，不透露差異；`share-summary` 驗證 session 簽章與到期時間後，呼叫 `get_patient_share_summary` 重新查詢連結與同意現況（不信任 session payload 本身代表授權），回傳固定的 `daily-summary-v1` 白名單 DTO（`patientAlias` 是固定的雙語物件 `{ zh: '照護對象', id: 'Objek perawatan' }`，不是單一語言字串、也不是 `patients.display_name`；加上當日台北時區血壓最新值或 `null`）。兩支 Function 與其 RPC 都不落 raw token、raw IP 或病人真實姓名於 log；response 一律帶 `Cache-Control: no-store`、`Referrer-Policy: no-referrer`、`X-Robots-Tag: noindex, nofollow, noarchive`。`SHARE_LINK_SESSION_SECRET` 由兩支 Function 共用，只存在 server-only 環境變數。

`admin-list-users` 是唯一使用 service role 讀取 `auth.users` 的 Function，供 `/admin`「使用者管理」分頁顯示總註冊人數、各帳號 email、註冊日期與最後登入日期。它同樣保持 `verify_jwt = true`，先用 `withSupabase({ auth: 'user' })` 拿到 `ctx.userClaims.email`，比對等於 `src/lib/auth.ts` 的 `ADMIN_EMAIL`（目前僅 `admin@careapp.local`）才建立 service role client；比對失敗直接回 403，不會先建立 service role client 再篩選結果。分頁讀取 `auth.admin.listUsers()` 設有頁數上限，超過上限視為異常直接丟錯，不悄悄回傳不完整清單；回應只挑選 email、`app_profiles.display_name`、`created_at`、`last_sign_in_at` 四個欄位，Function log 只記筆數，不記 email 或姓名。這是目前唯一允許讀取全站帳號清單的路徑，前端 `AdminPage` 的 `/admin` route guard 只是體驗層，真正邊界在這支 Function 對 JWT email 的比對。

## 健康資料同意

帳號條款同意與健康資料同意分開。健康資料同意由版本化、server-timestamp 的 SECURITY DEFINER RPC 記錄；代理人必須提供關係／授權依據，不能因 Google 登入成功就推定病人同意。公開 health-data-notice 在 GIS 登入前可讀，避免把同意流程藏在登入後。

登入 session 恢復時，`loadLegalConsentWithRetry()` 只讀取 `privacy_policy_version` 與 `health_consent_version`，不會順便改寫 `privacy_acknowledged_at`。政策版本落後時，App 先顯示 `PrivacyPolicyUpdateScreen`；使用者閱讀 `/privacy`／`/terms` 並按下確認後，才呼叫 `record_account_legal_acceptance()`。這個順序避免既有帳號在沒有重新看到新版分析揭露時，被背景載入誤記成已接受新政策。

唯讀分享再增加一層 patient-scoped 能力：`care_access.can_share_readonly` 預設為 `false`，不會因既有 `can_record` 或 `can_manage_medication` 自動開啟。Stage 1 的 `patient_share_consents` 與 `patient_share_links` 直接以 `patient_id` 綁定，管理 RPC 以登入者 JWT email、目標 patient、目前 `legal_consents.health_consent_version` 與本人／代理人條件共同驗證；兩張表撤銷 authenticated 直接 table DML，避免 client 繞過稽核。資料庫只接收 token hash，沒有匿名查詢入口；公開 token exchange、固定摘要 DTO、`no-store`／rate limit 與 session 失效留到後續 stage，Stage 0 合規 sign-off 前也不得套用這個 migration。

## 公開與 Demo 邊界

### 原本漏洞（ELI5）

原本是為了讓 Demo 顯示血壓，建立了一扇「公開讀取」的門；但那扇門的條件寫成 `USING (true)`，等於沒有檢查病人身分。任何拿到網站 publishable key 的未登入訪客，都能直接問 Supabase：「請給我 `blood_pressure_records` 的資料。」因為規則說全部都 `true`，同一張表裡不是 Demo 的列也可能被回傳。

這就像店家想讓路人看兩個展示模型，卻把倉庫門貼上「所有人都能進」：Demo 的本機展示本身不是問題，公開「整張健康資料表」才是問題。RLS 的允許規則是加在一起看的；只要有一條規則允許，另一條較嚴格的規則不能把它抵銷。因此 `care_access.patient_id` 雖然保護正式照護資料，仍會被那條全表 `USING (true)` 規則繞過。現在展示資料走 `demoData`／`demoStorage`，資料庫不再需要匿名健康資料入口。

歷史 guest read policy 與 Demo allowlist policy 已由 `20260901020000_revoke_anonymous_health_data_access.sql` 一併移除；它也收回 `PUBLIC`／`anon` 在患者、血壓／體重、服藥、照護時間線、PRN、失智與體液資料表的所有 table privilege，並把未指定角色的既有 policy 收斂到 `authenticated`。因此 publishable key 即使被直接拿去呼叫 REST，也沒有匿名健康資料讀取入口；正式資料仍由 `care_access.patient_id` 的 RLS 授權 authenticated 使用者，不能只依賴前端畫面或 policy 名稱。

## 權限修改檢查表

CI 不只以單元測試搜尋 migration 文字。資料庫相關 PR 會先從空白本機 Supabase 重播 migrations 與 seed，再於同一個 runner 以 `authenticated` PostgreSQL role 與測試 JWT claims 執行 `supabase/tests/rls-authorization.sql`。因為舊核心表的 local migration baseline 沒有 API role 預設 grants，測試只在 disposable transaction 內暫時補上測 policy 所需的最小 table privilege，最後與所有 assertions 一起 rollback，不會把這些 grants 推到 staging／production。測試必須證明核心照護者可讀寫代表媽媽的 patient、view-only 帳號不可寫、未授權帳號查不到資料，而且移除 `care_access` 後權限立即失效；所有測試寫入都包在 transaction 後 rollback。這是為了測到 PostgreSQL 真正套用的 policy 組合，而不是只確認 SQL 檔案包含某段字串。

本機 seed 只代表授權矩陣，不代表 staging／production 真實帳號或健康資料。正式核心帳號的不變量仍須在 staging 用安全測試資料驗證；CI 不得複製 production 紀錄，也不得用 `postgres`／service-role assertion 假裝通過 RLS，因為兩者會繞過 policy。

- 查詢是否每次都帶 `patient_id`，而不是用顯示名稱？
- 表單、快取、圖表、報告與通知切換 patient 後，是否仍可能沿用上一人的生理數值或門檻？
- INSERT 是否驗證病人可寫入範圍與實際操作人？
- UPDATE／DELETE 是否只允許正確 role，且不會藉由任意 email 指定他人？
- RPC 是否使用 `auth.uid()`／JWT，而不是信任 client 傳入的 user id？
- 新 profile 是否先建立再寫 access／plan，避免外鍵或 seed 順序錯誤？
- migration 是否 reload schema，並在 local／staging 驗證直接 API 與 UI 兩條路徑？
- 是否意外恢復匿名讀取健康資料？

若文件與程式碼或 migration 不一致，先修正可驗證的現行契約並補 ADR；不要盲目恢復舊 policy。
