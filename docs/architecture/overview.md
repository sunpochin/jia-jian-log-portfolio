<!--
檔案用途：說明家健錄的執行時分層、feature-first 邊界與主要資料流。
所在層：docs/architecture；供跨功能開發先建立整體模型。
主要關聯：TECHNICAL.md 索引、src/App.tsx、src/features、src/lib 與 Supabase 文件。
-->

# 架構總覽 / Architecture Overview

## 分層

家健錄是 Vite + React + TypeScript 的 mobile-first SPA。`src/App.tsx` 負責登入、公開頁與主畫面路由；`src/features/` 以照護領域分組頁面與元件；`src/components/` 放跨功能 UI；`src/lib/` 放資料存取、規則、時間、i18n 與儲存 adapter；`supabase/migrations/` 是資料庫契約。

```text
App shell / session
  ├─ public pages: privacy, terms, health-data-notice, demo
  └─ authenticated shell
       ├─ vitals: input, dashboard, weight
       ├─ medication: today, plans, catalog, admin
       ├─ care-family: daily care, timeline, patients, members
       └─ system-admin: account, export, legal, admin
```

這樣的切分保留 feature 的狀態與測試邊界；不把所有畫面抽成一個巨型 `App`，因為照護流程與管理流程的資料風險不同。

## 主要資料流

1. Supabase Auth 建立已驗證 session。
2. `useAuth`／tenant adapter 取得 profile、household 與可存取 patient。
3. 頁面只傳遞目前 patient UUID；資料讀寫函式也必須帶明確病人範圍。
4. Supabase RLS 再次檢查登入者與 patient 的關係。
5. 成功資料回到 Dashboard、每日照護、匯出或交接視圖；失敗時 UI 顯示可行動的雙語訊息，詳細錯誤留在維護者可查的 log。

前端的選擇器、email 判斷與 route guard 是減少誤觸的 UX，不是資料安全邊界。

## 讀取層的共用基礎元件

以 patient 為邊界的非同步讀取有三個每次都會遇到、且一旦各自實作就會慢慢漂移的問題。它們各自收斂成一個共用模組，新的資料 hook 應該直接沿用，不要再抄一份：

| 問題 | 共用模組 | 為什麼不各寫一份 |
| --- | --- | --- |
| 切換照護對象時，前一位的查詢比較晚回來 | `src/hooks/useLatestRequest.ts` | 過期結果若被回寫，畫面會把上一位的血壓標成目前對象的數值，直接違反「生理數值必須綁定 `patient_id`」的不變量。`begin()` 回傳的判定函式是唯一的回寫閘門。 |
| Supabase／網路錯誤形狀不一致（`code`／`status`／原生 `TypeError`） | `src/lib/dataErrors.ts` | 過去有四份各自的 `'code' in error` 型別窄化，已經開始漂移——體溫少了「連線／設定有問題」這個分支。判斷收斂後兩邊行為自動一致。 |
| 離線快取的 JSON 壞掉、儲存被停用或容量已滿 | `src/lib/localCache.ts` | `localStorage` 在 Safari 無痕模式會直接 throw，容量滿時 `setItem` 會丟 `QuotaExceededError`；這些都只該降級成「這次沒有離線備份」，不能讓剛成功的線上讀取失敗。`patientScopedCacheKey()` 讓快取分區在 key 層就綁定病人。 |
| 血壓寫入遇到暫時性網路錯誤 | `src/lib/bloodPressurePendingQueue.ts`、`src/lib/bloodPressureRecords.ts` | pending queue 只收暫時性寫入失敗，並以病人／帳號 storage key 與固定 client UUID 去重；RLS／配額錯誤不重試，通知副作用也不跟著盲目重播。 |

`dataErrors` 的訊息函式一律回傳 `LocalizedText` 而不是已經選好語言的字串。這是刻意的型別設計：呼叫端只能透過 `text()`／`localized()` 顯示，因此憲法要求的「兩種語言都要有、畫面只顯示一種」在編譯期就被強制，不可能再出現把中印文用斜線串成一句丟到畫面上的寫法。同理，資料庫原始錯誤只進 `console`，畫面永遠只拿到看護能據以行動的雙語句子。

## UI 與效能設計

- 主 shell 使用 `dvh`、flex column 與固定底部 tab；可捲動內容只在 main 區域捲動，避免 iOS fixed 元件跳位。
- Dashboard 與管理頁允許內容捲動；輸入頁優先保留量測按鈕、時鐘與狀態提示。
- Feature-first 模組讓後續新增功能能以頁面、資料 adapter、測試一起移動；不另引入路由套件來解決少量公開頁。
- Vercel Speed Insights 掛在 `src/main.tsx`，因為公開頁、登入頁與 app 內頁都需要同一個生命週期。
- Code splitting 與 PWA precache 必須一起驗證；動態 chunk 不能被錯誤的快取策略變成舊版入口。

## 外部服務

Supabase 負責 Auth、Postgres、RLS、RPC 與帶 caller session 的 Edge Function；Vercel 負責前端建置與 hosting；Telegram 是可失敗的通知副作用，不得阻塞健康資料成功儲存。舊 Cloudflare Worker（曾為尚未更新的前端 bundle 保留相容性）已於 2026-09-07 停用並自 repo 移除；健康通知全程只走 Supabase Edge Function。

血壓通知流程是「Supabase INSERT 成功後，前端非同步呼叫 `blood-pressure-notifier`」；Function 透過登入者 JWT／RLS 重新取得精確紀錄與病人名稱，從 JWT 取得提交者，再用 server secret 呼叫 Telegram。Function 失敗只記錄，不回滾已成功的健康紀錄。Vercel Speed Insights 掛在入口 provider，因為公開頁、GIS 登入頁與登入後畫面都屬於需要觀測的前端生命週期。

Code splitting 只在可由 PWA precache 正確管理時採用；動態 chunk 不應被舊 service worker 長期保留。這是效能設計與離線設計的交界，修改其中一方要連同另一方驗證。

## 不採用的架構替代

- 不把人與寵物拆成兩個 app，因為家庭授權、時間線與藥品目錄會重複。
- 不把所有資料寫入 localStorage，因為跨裝置服藥與照護交接需要同一份 server truth。
- 不以 email／姓名作 patient primary key，因為資料搬遷、同名與家庭成員變更都會破壞識別。
- 不以前端 feature flag 代替 RLS，因為 anon key 本來就會出現在瀏覽器。
