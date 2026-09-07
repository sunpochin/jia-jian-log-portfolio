<!--
檔案用途：說明照護大事記、每日照護入口與交接資料的產品邊界。
所在層：docs/features；供 care-family pages、事件 RPC 與匯出修改使用。
主要關聯：src/features/care-family、src/lib/careTimeline.ts、vitals 與 medication。
-->

# 照護時間線 / Care Timeline

## 角色

照護大事記用來記錄看診、意外、家屬觀察、症狀、藥物調整、疫苗與飲食變化。它服務人與寵物，不因物種隱藏事件入口。血壓趨勢頁專心呈現數據；事件頁可保留近期血壓作前後脈絡，但不能把單筆量測推論成事件原因。

## 每日照護入口

血壓、體溫、服藥、飲食、體重與寵物照護等模組共用「每日照護」入口，在頁內以動態 tab 切換。共享頁首、病人選擇與時間只出現一次，避免看起來像切換了不同對象；這也是窄手機不塞多個底部導覽名稱的原因。當帳號只開啟一項功能時，tab 列會收起，直接呈現該功能。

`patient_daily_care_preferences` 以 `patient_id` 保存每位被照護者共用的顯示選擇；授權照護者看到同一組入口，讀取失敗時暫時使用完整入口。舊的 `user_patient_care_preferences` 保留作歷史相容資料，不再作為現行讀寫來源。它只控制畫面，不刪除健康紀錄，也不改變 `care_access`。至少一項必須保持開啟；服藥仍受現有權限過濾。

失智照護（`dementiaCare`：躁動時段、日夜顛倒模式、走失風險三種紀錄，見 `dementia_care_records`）是唯一預設關閉的模組——其餘模組沒有設定列時全部顯示，失智照護則要照護者在設定頁明確開啟才會出現，避免沒有相關照護需求的長者也被迫看到這三個分頁。文案只描述觀察到的行為（例如「想出門」「重複問同樣的問題」），不評價被照護者本人。

## 資料規則

- 每筆事件必須帶明確 `patient_id`，並由 RLS 驗證登入者可寫入該病人。
- 事件可以標註類型、標題、內容與發生時間；自由筆記可保留原文。
- 事件可選擇最多 4 張照片；同一個人與寵物共用事件表單，手機可分別選「拍照」或「從相簿／檔案選取」，避免 iOS Safari 對 `capture + multiple` 的差異影響既有相片選取。瀏覽器先把原圖縮成 WebP（長邊最多 1800px、最多 600 KiB），另產生 480px 縮圖（最多 120 KiB），超標時持續縮小／降品質，仍無法達標就不上傳。二者上傳到 private `care-event-photos` bucket；資料庫 validator 會再確認每組 path 都綁定同一筆事件的 `patient_id` 與事件 `id`。`care_timeline_entries.photo_paths` 只存相對 path，不存二進位或短效 signed URL。
- 新事件有照片時，前端先用 client UUID 固定 `patients/{patient_id}/events/{event_id}/...` path，再上傳照片並寫入事件 metadata；任一步驟失敗會盡力清理 Storage 檔案與空事件，避免 patient 切換或網路重試造成孤兒資料。
- 時間線載入時只簽署縮圖 URL；單張 path（包含剛上傳的第一張照片）直接使用單檔 endpoint，使用者點擊才簽原圖。若多張歷史 path 讓批次簽署失敗，前端會對缺少 URL 的照片改用單檔 endpoint 補簽；縮圖 URL 過期或載入失敗時會重新簽署，必要時退回原圖作為預覽，重試次數用盡則顯示明確的照片暫時無法載入狀態。Vercel CSP 的 `img-src` 只額外允許 `https://*.supabase.co`，讓 private Storage 的 signed URL 能顯示，同時不放寬成任意外部圖片來源。Storage 的 SELECT／INSERT／DELETE policy 會在簽發與物件操作時沿著 `care_access.patient_id` 驗證授權；signed URL 簽出後在到期前仍是 bearer link，實體檔案若已被保留期限清理，前端無法恢復。
- 匯出時與血壓、藥單、服藥紀錄一起按 patient 合併，固定雙語欄位與資料類型。
- 每日照護寫入有資料上限與更正流程，重試不能繞過每日限制。
- 刪除／更正要保留最小必要的稽核與交接語意，不以前端隱藏取代 policy。

每日照護有單日寫入上限與更正流程，用資料庫鎖／RPC 保護跨請求競態；錯誤重試不能繞過限制。更正要清楚區分「原本記錄」與「修正後內容」，讓家屬交接時不把修正誤讀成新的量測。

PRN 每次使用保留在專屬 `prn_medication_events` 邊界，不自動寫入 `care_timeline_entries`；交接若需要摘要，未來可用明確連結或報表呈現，不能把事件流量直接灌入泛用時間線。

## 照片 MVP 邊界

照片目前是事件的附加 metadata，不另外建立 attachment table；這符合目前「拍照 → 寫一句話 → 出現在大事記」的最小流程。每筆最多 4 張，刪除事件時會同步刪除已知 path。MVP 暫不提供單張重排、單張刪除或 PDF；若未來需要附件排序、獨立稽核、文件分類或跨事件共用，再把 JSONB metadata 搬到 `care_event_attachments`，並保留現有 path／patient RLS。

照片壓縮是瀏覽器端的容量與流量閘門，不是醫療影像保存規格：原圖不保存，WebP 大圖供點擊檢視，縮圖供列表瀏覽。上傳前會持續降低畫布尺寸／品質直到原圖不超過 600 KiB、縮圖不超過 120 KiB；仍無法達標就明確拒絕，不把超標 Blob 交給 Storage。若瀏覽器不支援 WebP canvas 或無法解碼圖片，也應顯示失敗並讓照護者重新選檔，不把原始 HEIC/JPEG 直接塞進 Storage。

## 照片保留與清理

照片保留期限以事件建立者的帳號方案決定，不把 `patient_id` UUID 改成字串方案值：`account_usage_limits.photo_retention_tier = 'standard'` 預設保留 30 天，設為 `'vip'` 則保留 180 天。期限從事件的資料庫 `created_at` 起算，因此在很舊事件上後補照片時，照片可能很快進入清理範圍；這個保守規則避免由瀏覽器自行回寫保留期限。

管理者要標記 VIP 帳號時，請在受控 SQL／migration 中對 `account_usage_limits` 以 `profile_email` 建立或更新 `photo_retention_tier = 'vip'`；沒有設定列的帳號一律採 30 天。不要把病人 UUID 或登入 user UUID 改寫成 `vip`，因為它們仍是授權與資料關聯的 canonical identity。

```sql
INSERT INTO account_usage_limits (profile_email, photo_retention_tier)
VALUES ('vip-account@example.com', 'vip')
ON CONFLICT (profile_email) DO UPDATE
SET photo_retention_tier = EXCLUDED.photo_retention_tier, updated_at = now();
```

`care-event-photo-retention` Edge Function 以 service role 讀取事件 metadata，先呼叫 Storage API 刪除原圖與縮圖，再透過 expected-path CAS RPC 清空 `photo_paths`；不能直接刪 `storage.objects`，否則可能只刪資料庫列而留下實體孤兒檔。若照護者剛好同時補照片，CAS 會保留新 metadata，下一輪再重試。部署後應每日排程呼叫它，並設定 `CARE_EVENT_PHOTO_RETENTION_CRON_SECRET`。目前每張照片最多約 720 KiB（原圖與縮圖合計），所以標準方案在少量家庭使用下可控；VIP 六個月的最壞情況仍可能超過免費方案容量，正式商業規模需監控 Storage usage 或改用付費方案／外部長期封存。

## 交接設計

時間線載入後預設只顯示最新五筆，較早紀錄透過雙語「顯示較早紀錄／Tampilkan catatan sebelumnya」按鈕展開。這只是前端顯示範圍，查詢仍保留已載入且依發生時間由新到舊排序的資料；展開不會改變 patient 邊界、編輯／刪除／新增行為或事件內容。這樣可降低手機初始閱讀噪音，同時保留需要完整交接時的一鍵檢視。

事件是照護者與家屬共享的上下文，不是醫療診斷引擎。UI 只描述已記錄的事實與下一步；不從顏色或單次數值生成未經確認的醫療結論。藥單變更與照護事件要能在時間線中被匯出，以便交接與後續就醫。

不把事件拆成只給寵物或只給血壓兩套資料模型，因為家庭照護的交接需要同一條時間軸；依類型與物種顯示適當欄位即可。

## 藥單異動事件

`medication_change` 是保留給資料讀取與歷史顯示的 system event，不是人工表單選項。它必須帶 `medication_plan_change_log_id` 與 snapshot，且由調藥 RPC 在同一 transaction 建立；partial unique index 確保同一筆 canonical change log 不會出現兩個時間線投影。畫面不提供這類事件的修改／刪除按鈕，避免交班時間線與實際藥單脫鉤。

一般人工紀錄仍可使用 `doctor_instruction`、`family_observation`、`reassessment` 等類型。每日兩筆限制只計手動事件，調藥不會因當天已寫滿手動筆記而失敗；這個例外由資料庫 trigger 依 linkage 判斷，不依賴前端提示。
