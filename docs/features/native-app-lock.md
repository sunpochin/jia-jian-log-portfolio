<!--
檔案用途：iOS 原生殼「生物辨識 App 鎖」（issue #821）的現行設計、原生碼審查紀錄、已知限制與驗收清單。
所在層：docs/features；功能落地後的單一真相文件，路線圖（docs/product/mobile-capability-roadmap.md）只保留「為什麼排 P2」。
主要關聯：src/hooks/useAppLock.ts、src/components/system/AppLockGate.tsx、src/components/settings/AppLockSettings.tsx、
  src/lib/preferences/appLockPreference.ts、src/lib/nativeAppLock.ts、ios/App/App/AppLockPlugin.swift、ios/App/App/AppBridgeViewController.swift。
-->

# 原生殼 App 鎖 / Native App Lock（issue #821）

## 做什麼、不做什麼

- **只在 iOS 原生殼**、**預設關閉**。使用者在「設定 → App 鎖」自己打開，開啟前會先實際驗證一次（確認這台裝置解得開，也確認是手機主人本人）。
- App 在背景超過設定時間（1／5／15／30 分鐘，預設 5）後回到前景，整個畫面被不透明遮罩蓋住並自動叫出 Face ID／Touch ID；失敗或選擇時可退回裝置密碼（`LAPolicy.deviceOwnerAuthentication`）。逾時內回來不打擾。
- **只是畫面鎖**：不登出、不動 Supabase session、不清任何資料；設定頁與鎖定畫面都用三語明講這一點，要清除登入狀態請按「登出」。
- 不做：WebAuthn／Passkey、替換 session 儲存、Web／PWA 版的鎖、Android（見下方限制）、任何 RLS 變更。

## 設計重點（為什麼這樣做）

| 決策 | 理由 |
| --- | --- |
| 原生碼寫在 `ios/App/App/AppLockPlugin.swift`，不裝 npm plugin | Capacitor 沒有官方生物辨識 plugin；社群套件要引入整包第三方原生碼與 npm 供應鏈。本功能只需要 Apple 的 `LAContext`，自己寫約百行即可逐行審（ADR-004、`docs/agents/skill-security.md` 的最小外部依賴原則）。不改 `package.json`，`cap sync` 漂移守門（#815）不受影響。 |
| plugin 在 `AppBridgeViewController.capacitorDidLoad()` 手動註冊 | Capacitor 只自動註冊 npm 套件內的 plugin；App target 內的 plugin 必須由 `CAPBridgeViewController` 子類別註冊，`SceneDelegate` 因此改用這個子類別。 |
| 設定與「最後進背景時間」存在這台裝置的 localStorage | 功能只在共用裝置才有意義，換人登入同一支手機鎖仍要在；它不改變健康判讀，屬 AGENTS.md 生理數值對象綁定不變量的「純介面偏好」例外。時間要持久化，否則「從多工畫面滑掉再重開」就能繞過。 |
| 找不到進背景時間或裝置時鐘被往回調 → 上鎖 | 無法證明還在逾時內時 fail closed。 |
| 兩層遮蔽 | JS 在 `appStateChange(inactive)` 就畫出遮罩（控制中心、多工畫面）；原生在 `didEnterBackground` 加一層空白 view，保證 iOS 拍多工畫面截圖前已蓋住。原生不在 `willResignActive` 遮，因為 Face ID 對話框本身也會觸發它。 |
| 離開時間在 `appStateChange(inactive)` 就記，`pause` 只當備援且不覆寫 | `pause` 是進背景後才送進 WebView 的 JS 事件；WebView 先被系統暫停時，它會延到回來才和 `resume` 一起送達，記下的就變成回來的時間，放一小時也不鎖。inactive 發生時 App 還在前景；Face ID 對話框造成的 inactive 只會讓時間記得更早，只可能多鎖。 |
| 「要不要上鎖」只在 `resume` 判斷 | Face ID 對話框只觸發 inactive／active，不會觸發 pause／resume，否則每次解鎖都會再鎖一次。 |
| 每輪上鎖只自動彈一次驗證 | 使用者按取消後若自動再彈，會變成關不掉的迴圈；之後改用畫面上的「解鎖」按鈕。 |
| 底下的 App 保持掛載，`#root` 設 `inert`＋`aria-hidden` | 未存的表單草稿不會因上鎖消失；遮罩用 portal 放在 `#root` 外，鍵盤焦點與讀屏器都碰不到底下的健康數值。 |
| 只有原生端回報「裝置沒有密碼」（`LAError.passcodeNotSet`）才解鎖並關閉功能 | 能移除裝置密碼的人本來就知道密碼；繼續鎖只會把照護者永遠擋在外面。JS 橋接層的任何例外一律當「失敗」維持上鎖，不能變成繞過的後門。 |
| 以平台（iOS）守門，而不是只靠設定值 | Android 殼沒有原生實作；若在 Android 誤開，會變成永遠解不開的鎖。 |

## 原生碼審查紀錄（取代第三方 plugin 的供應鏈審查）

- 新增的原生碼只有兩個檔案：`AppLockPlugin.swift`、`AppBridgeViewController.swift`，全部在本 repo，沒有 install script、沒有新的 SPM／CocoaPods／npm 依賴。
- `AppLockPlugin.swift` 只 import `Capacitor`、`LocalAuthentication`、`UIKit`：沒有網路、檔案、Keychain、UserDefaults 或 log API。
- App 只拿到 `success`／`cancelled`／`failed`／`unavailable` 四種結果；臉部／指紋模板由 iOS 處理、App 碰不到；不記錄失敗次數、不送任何伺服器。
- `Info.plist` 新增 `NSFaceIDUsageDescription`（三語 `InfoPlist.strings`），沒有這個 key 時呼叫 Face ID 會讓 App 直接被系統終止。商店隱私聲明不需變更（生物辨識資料不離開裝置）。

## 已知限制與後續

- **Android 未實作**：需要 `androidx.biometric` 的 `BiometricPrompt`（BIOMETRIC_WEAK | DEVICE_CREDENTIAL）與 `FLAG_SECURE`；在 Android 上設定卡片與遮罩都不渲染。要做時另開 issue，並一起在 Android 殼上驗證。
- 鎖定是本機畫面鎖：有辦法取得 WebView 資料（越獄、備份檔）的人不受這層保護——真正的授權邊界仍是 Supabase session 與 RLS。
- 通知內容不在 App 鎖範圍：iOS 鎖定畫面的通知預覽由系統「顯示預覽」設定控制。

## 驗收清單（iOS Simulator 或實機）

1. 關閉時：切背景再回來完全無感，多工畫面預覽正常。
2. 開啟（先驗證一次）後：逾時內回來不打擾；多工畫面預覽是空白卡片。
3. 超過逾時回來：遮罩出現並自動彈 Face ID；Simulator 用 Features → Face ID → Matching Face／Non-matching Face 模擬成功／失敗；失敗維持上鎖並顯示「解鎖失敗」，可退回密碼；不會登出。
4. 按取消：不會自動再彈；按「解鎖」才重試。
4a. 把 App 留在背景**超過逾時**（例如設 1 分鐘、放 2 分鐘以上，讓系統有機會暫停 WebView）再回來：一定要上鎖。單元測試用 mock 依序送事件，抓不到真實的延遲送達，必須在 Simulator／實機確認。
5. 超過逾時後從多工畫面把 App 滑掉再開：第一個畫面就是鎖定畫面，沒有閃出健康數值。
6. 三種語言切換檢查設定卡與鎖定畫面文字。

自動化測試：`tests/unit/appLockPreference.test.ts`（設定與逾時純函式）、`tests/unit/useAppLock.test.ts`（生命週期狀態機）、`tests/unit/appLockGateRender.test.ts`（Web／Android 不渲染）。
