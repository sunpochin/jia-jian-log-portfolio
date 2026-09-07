<!--
檔案用途：說明面試展示的 demo 入口、種子資料與唯讀安全隔離。
所在層：docs/features；供 /demo、seed-demo 與公開 RLS 修改使用。
主要關聯：src/lib/demoData.ts、demoStorage.ts、Supabase public policy 與 auth-and-rls。
-->

# Demo 模式 / Demo Mode

## 目的

`/demo` 是面試與產品展示的低摩擦入口，讓訪客看見血壓趨勢、服藥進度、照護事件、寵物與家庭邊界；它不是正式照護登入的替代品，也不應要求 production caregiver 更新 PWA 來驗證。

## 雙通道

- 線上展示：讀取明確的 demo patient／seed 資料，只提供唯讀視圖。
- 本機試用：在本機以受控 demo data adapter 提供互動預覽；資料留在 demo storage，不寫入 production。

兩條路徑都要在 UI 明確標示展示／唯讀狀態，避免訪客把假資料當成媽媽的真實健康資料。

## 安全邊界

Demo 展示資料由 `demoData`／`demoStorage` 的本機虛構資料提供；正式 Supabase 健康資料表不對 `PUBLIC`／`anon` 開放 SELECT 或 DML。登入後的 staging seed 仍必須遵守 authenticated 的 `care_access.patient_id` RLS，不能複製 caregiver、媽媽或其他真實健康資料。

## 種子案例

故事化 seed 應展示正常、偏高／偏低、服藥完成與未完成、時間線事件、多人／寵物與封存對象等邊界，但每個案例都要能由 patient UUID 清楚隔離。新增案例先確認不會讓 UI 依固定姓名判斷權限。

目前展示案例包含一位 90 天趨勢人物與一位多重狀況邊界人物，涵蓋改藥、低舒張壓、漏藥、極端高壓二測、體重變化與交接事件。seed script 必須由環境注入 service role，不能把 URL 或 key 硬編碼；寫入前驗證藥品名稱與生命徵象範圍，展示帳號的藥單管理仍遵守最小權限。

若公開 demo 資料庫尚未套 migration 或離線，本機 `demoData` 可用固定 base date 回退，讓截圖與測試可重現；`demoStorage` 的互動只留在該瀏覽器，使用紀錄 ID／病人／藥品／時段做 upsert，不把匿名操作送進 Supabase。提示條要寫明虛構資料與保存位置。

瀏覽器的返回／前進鍵會同步 `/demo` 路徑與 React 的 demo 狀態；localStorage 寫入被隱私模式或容量限制拒絕時，當前頁面仍保留記憶體內的試用變更，但清除網站資料後會重新回到固定故事。這兩個邊界刻意分開，避免把「暫時不能寫入」誤判成「使用者要求清除」。

## 初次與重播導覽教學 (Onboarding Tutorial)

Demo 模式提供互動式視覺導覽，幫助首次造訪者快速熟悉主要頁面功能：

- **架構與狀態 (`TutorialProvider` & `TutorialOverlay`)**: 全域 Context (`src/components/tutorial/TutorialContext.tsx`) 控制導覽步驟、當前索引與開啟狀態；`TutorialOverlay` 負責全域半透明遮罩、目標元素高亮框、動態指示箭頭與無障礙提示對話框。
- **初次自動觸發**: 首次進入 Demo 模式時，檢查 `localStorage.getItem('jia-jian-log-demo-tutorial')`；若未儲存紀錄，自動觸發 5 步驟導覽（展示歡迎 -> 每日照護 -> 設定頁重播說明 -> 承接轉換 CTA），完成後將 Key 設為 `'true'`。
- **重播與手動重置**: 設定頁面 (`SettingsPage.tsx`) 提供「重播教學導覽」連結，使用者可隨時重新開啟導覽步驟。
- **目標元素定位 (Targeting)**: 頁面 key UI 元件（如底欄 Tab `tab-events`, `tab-dailyCare`, `tab-dashboard`, `tab-settings`）傳入 `dataTutorial` 屬性，Overlay 以 `getBoundingClientRect()` 與 `MutationObserver` 動態追蹤定位與繪製指示標誌。
- **無障礙與鍵盤導覽 (A11y & Focus Trap)**: 導覽開啟時保存觸發前 focus 元素並於結束時還原，步驟切換時自動聚焦「下一步」按鈕，支援 `Escape` 鍵跳過，並以 `Focus Trap` 將 Tab 焦點鎖定在 Modal 內。
- **步驟可覆蓋主按鈕 (`primaryActionLabel` / `onPrimaryAction`)**: 一般步驟的主按鈕固定呼叫 `nextStep()`；只有需要轉換動作的步驟（目前僅最後一步的登入 CTA）會帶這兩個欄位，讓 `TutorialOverlay` 改顯示自訂文字並呼叫自訂行為，而不是照常前進到下一步。

## 試用承接：demo → 登入的模組偏好交接 (Demo Handoff)

導覽最後一步的 CTA「開始記錄我家人的」處理 issue #443 的承接問題——試用結束不能沒有下文，登入後也不該逼使用者重選一次模組：

- **只搬「開關偏好」，絕不搬健康數值**：CTA 觸發時只讀取 `readDailyCarePreference()` 算出的模組 id 清單與 `useCustomTemplate`，寫進獨立於病人／帳號的中繼 key（`src/lib/demoHandoff.ts`，`jiajianlog.demo-handoff.v1`），再導向 `/`。不會讀取、也不會寫入任何 demo 血壓、體溫、藥單等健康紀錄。
- **首次登入才套用，套用即清除**：`App.tsx` 讀取每日照護偏好時，若這是這位病人第一次使用（`!hasStoredPreference && !hasCompletedOnboardingWizard`）且讀到承接記錄，會直接用 `buildOnboardingDailyCarePreference()` 套用、存檔、標記精靈已完成、清掉中繼記錄，並顯示「你剛剛試用的是這些模組，可在設定調整」的空狀態提示，而不是照常跳三題精靈。
- **使用者可以拒絕承接**：空狀態提示附「重新設定」，點下去會清掉提示並重新開啟三題精靈，讓使用者從頭選擇；拒絕承接不影響流程能不能完成。
- **邊界維持**：`demoStorage` 與正式資料庫的既有唯讀／隔離邊界不變——這裡只多了一個純前端 localStorage 中繼記錄，不共用 session，也不讓 demo 訪客的匿名寫入路徑碰得到正式帳號資料。

## 不採用的替代

- 不恢復整站匿名讀取，因為展示方便不值得暴露真實資料。
- 不開放匿名資料庫寫入，因為 rate limit、清理與惡意資料污染都會擴大風險。
- 不在 demo 中共用正式 session 或 production localStorage，避免跨 origin cache／授權混淆。
