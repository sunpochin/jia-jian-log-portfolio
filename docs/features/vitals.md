<!--
檔案用途：整理血壓／心跳／體重輸入、警示、Dashboard 與報告規格。
所在層：docs/features；供 vitals UI、統計、匯出與照護流程修改使用。
主要關聯：src/features/vitals、src/lib/dashboardStats.ts、vitalPresentation.ts 與 data-model。
-->

# 生命徵象 / Vitals

## 量測流程

輸入頁以手機優先，先確認第一筆資料已寫入遠端或已明確暫存本機，再開始 60 秒休息倒數；畫面會把「已寫入資料庫」與「等待同步」分開標示，不能把離線暫存冒充成遠端成功。第二筆完成後顯示當下時段摘要；若仍有 pending，不顯示不完整的遠端摘要。時段依台北時間分成 pagi、siang、malam1、malam2、malam3，夜間 bucket 是觀察點，不是強迫使用者每天必須量三次的排程。

血壓 INSERT 遇到連線中斷、408／429 或暫時性 5xx 時，會把同一筆含 `patient_id`、normalized `recorded_by` 與 client UUID 的資料放進 `localStorage` pending queue；storage key 本身也依病人與帳號分區。RLS、每日上限與格式錯誤不進 queue，因為重試不能修好授權或資料問題；Telegram 通知仍是獨立副作用，不會因資料 queue 盲目重送而製造重複提醒。

### 離線佇列自動同步

除了按「現在同步」手動重送，`src/features/vitals/hooks/usePendingBloodPressureFlush.ts` 會在連線恢復（`online`）、分頁回前景（`visibilitychange` → visible）、iOS bfcache 還原（`pageshow`）與原生殼回前景（Capacitor `App` `appStateChange`，`isActive: true`）時自動觸發既有的 `flushPendingBloodPressureRecords()`，固定 client UUID 讓回應遺失後的重試不會多出第二筆。看護在收訊不穩的地下室、電梯旁量完血壓後即使直接關掉 App，回到有訊號處或原生殼切回前景的 30 秒內也會自動送出，不需要記得手動同步。

自動觸發以單一旗標防重入，同一時間只會有一輪同步在跑；同步失敗會以遞增退避（30 秒／2 分鐘／10 分鐘，之後固定停在 10 分鐘）安排下一次自動重試，避免弱網路反覆嘗試時打爆 Supabase。血壓輸入頁下方在有待送紀錄時顯示三語「N 筆尚未同步」與最後一次嘗試時間，成功清空後這個狀態列會自動消失；永久性錯誤（權限、格式）仍照既有規則跳過，並顯示既有的錯誤訊息。

第一筆成功後，App 外殼會以目前 `patient_id`、照護日與量測時段保存這一輪量測的截止時間，並在主要頁面上方顯示大字倒數。倒數不放在血壓輸入卡內，讓照護者等待時可以切到照護大事記、健康資料或其他每日照護分頁；第二筆成功或切換病人後才清除這個暫時狀態。狀態只存在 `sessionStorage`，因為它是本次裝置操作的流程提示，不是新的健康紀錄，也不應跨裝置同步；重新載入若已跨過照護日／時段，就會捨棄舊流程，避免第一筆新量測被誤當第二筆。

722 原則是建議參考：連續 7 天、早晚各 2 次、每次 2 遍且間隔 1 分鐘；實際夜間量測依媽媽狀況與醫囑，不把建議寫成硬性警報。

## 照護日與真實時間

每日照護摘要、最近量測摘要、輸入頁的同一輪量測 key 與血壓每日新增配額，使用台北時間 04:00–隔日 04:00 的照護日。這能讓凌晨 02:00–03:59 的睡前後續量測和前一晚留在同一份交接資料，也讓 05:00 起床量測自然開始新的一天。

每筆資料仍以 `measured_at` 保存實際發生時間；醫師／GPT 報告明示照護日區間並保留逐筆原始時間。照護大事記與體重目前維持各自的日曆日語意，不可把照護日當成全系統任意改寫的日期。

## 警示

目前顯示規則以家庭量測的高壓／低壓與心跳界線為基礎：

| 狀態 | 規則 |
| --- | --- |
| danger | 收縮壓 ≥ 160 或舒張壓 ≥ 100 |
| warning | 收縮壓 ≥ 130、舒張壓 ≥ 80 或心跳 > 120 |
| danger-low | 收縮壓 < 90 或舒張壓 < 50 |
| warning-low | 收縮壓 90–99 或舒張壓 50–54 |
| normal | 其他情況，含刻意降噪的舒張壓 55–59 |

高壓端先判定，再判低壓端；banner 以成功送出的 snapshot 為準，不讀 reset 後的輸入框。警示不得只靠顏色，必須同時有文字或 badge。

`VitalAlertBadge`（`src/features/vitals/components/VitalAlertBadge.tsx`）包裝 `evaluateReading`，統一輸出這個 badge；`DashboardStatsCards`「最新」列與 `DailyBloodPressureRecords`（本照護日新增的量測紀錄）逐筆量測共用同一份判定與樣式，避免兩處各自維護一份規則，導致總覽顯示偏高、當日清單卻看不出風險等級。

### 判讀標準模板（BP standard templates）

上表是 `general_adult` 這一份標準的內容，不是全 app 唯一的標準。自 issue #896 起，判讀函式改成「**讀數 ＋ 一份標準**」：

```ts
evaluateBp(sys, dia, standard)                    // 最嚴重的那一條規則
evaluateReading(sys, dia, pulse, standard)        // level／labels／recommendations／standardKey
getAlertLevel(sys, dia, pulse, standard)
```

**`standard` 參數必填、沒有預設值。** 全 repo 有 14 個呼叫點散在 10 個檔案；寫成選填會讓漏接的呼叫點照常編譯、靜默用一般成人標準，於是同一位病人的圖表、異常示警、輸入即時回饋與列印報告可以各說各話（`AGENTS.md` § 3.5）。必填把每一個漏接變成編譯錯誤。自 issue #898 起這 14 個呼叫點全部改由病人綁定的 evaluator 供應，過渡期用的 `DEFAULT_BP_STANDARD` 別名已移除——留著只會變成下一個靜默預設的入口。

三份資料檔的分工（「抽詞彙，不抽階梯」）：

| 檔案 | 內容 |
| --- | --- |
| `src/config/blood-pressure-spec.json` | 九級表本尊，D1 凍結，**一個字不改**。`general_adult` 的階梯直接指向它，不複製 |
| `src/config/bp-levels.json` | 等級詞彙：每個等級 key 的 `zh`／`id`／`en` 標籤、臨床建議與 `webAlertLevel`，全專案一份 |
| `src/config/bp-standards/*.json` | 每個模板一份**完整門檻階梯**，只描述「哪個數值區間對應哪個等級 key」 |

模板刻意**不是**對九級表的 diff：diff 表達不出 `elderly_relaxed` 的「低於 120 就該注意」，也會讓自訂模板的下界欄位變成可證明永遠不影響判讀的死欄位。理由全文見 [`docs/product/blood-pressure-standard-templates.md`](../product/blood-pressure-standard-templates.md) § 6.3。

**hard floor 先行，且 floor 不是模板資料。** `≥180/120` 與 `<90/50` 是 `bpStandard.ts` 裡的程式守衛，不在任何模板 JSON 裡，模板因此在結構上無法表達降級。唯一例外是 `general_adult`：九級表自己的第 1 條與第 5 條就是 floor，但它們之間還夾著 `cukup_tinggi` 與 `tinggi`，把 `danger_low` 守衛提到最前面會讓 140/45 從「⚠️ 偏高」變成「🔴 明顯偏低」——那是真正的行為變更，撞 R3，所以九級表走原本的 first-match 流程。


#### 病人級標準的儲存：生效日期化（issue #897）

`patient_bp_standards` 存的**不是「這位病人現在用哪個標準」，而是「這位病人在哪段期間用哪個標準」**——append-only、每列一段 `[effective_from, effective_to)`，依讀數的 `measured_at` 解析。

為什麼不是每位病人一列可覆寫的設定：判讀是在**畫面渲染時**即時算的（`evaluateReading` 跑在每一筆歷史紀錄上）。若只存一列，術後嚴格控制的階段結束、換回一般成人之後，**過去那段期間的所有讀數會被重新漆成綠色**，而且列印報告會在歷史讀數旁印出當下的標準名稱——那比不印更糟，醫師會以為那段期間就是用這個標準判讀的。

也**不是**「INSERT 當下把標準快照到血壓紀錄上」：本 app 支援補登舊量測，補登 8 月的讀數該套用 8 月生效的標準，快照會答錯這一題。

| 保護 | 機制 |
| --- | --- |
| 同一病人的區間不得重疊 | `EXCLUDE USING gist` ＋ `btree_gist`；沒有它，換標準的兩步寫入中途失敗會留下兩列同時生效，解析結果變成看資料列順序的運氣 |
| 歷史不可竄改 | trigger `protect_patient_bp_standard_immutable_fields`：UPDATE **只允許改 `effective_to`**，且已結束的區間不得再動。RLS 管「誰能改這一列」，trigger 管「可以改成什麼」——policy 表達不了欄位級的不可變性 |
| 歷史不可消失 | **不授予 `DELETE`**。打錯字的修正方式是結束該列再開一列；刪掉會讓那段期間的讀數退回 `general_adult`，等於靜默改寫歷史判讀 |
| 自訂目標不得把危險值設成正常 | CHECK 限制在 R1 floor 之內（收縮 90–179、舒張 50–119），與引擎的 `assertCustomBounds()` 是同一組規則的兩道防線 |
| 換標準是原子操作 | RPC `set_patient_bp_standard()`（**SECURITY INVOKER**，RLS 照常生效）。順序被 EXCLUDE 綁死（必須先關再開），兩步之間失敗會留下沒有標準涵蓋的空窗 |

**一個容易漏掉的 RLS 行為**：唯讀照護者（`can_manage_medication = false`）執行 UPDATE 時，Postgres 在 `USING` 濾掉所有列的情況下**只回報 0 rows、不拋錯**。因此 RPC 內部必須自己判斷「有開放區間卻關不掉 ⇒ 沒有權限」並 `RAISE EXCEPTION`，否則照護者按下「換標準」會看起來成功但什麼都沒發生。

`src/lib/bpStandards.ts` 只提供「一次取回全部區間」的 `readBpStandardIntervals()` ＋ 純函式 `resolveStandardAt()`，刻意沒有單筆查詢 API：清單一次渲染幾十筆讀數，逐筆查詢會變成 N 次網路往返。沒有任何區間涵蓋某個 `measured_at` 時（功能上線前的歷史資料）退回 `general_adult` 並回報 `configured: false`，報告必須據此標示「當時未設定個別標準」。

**雙軸模板會同時回傳兩條規則。** `post_op_strict` 把收縮壓與舒張壓當成兩條獨立的階梯，`ReadingEvaluation.bpRules` 依「收縮壓在前、舒張壓在後」列出全部命中的規則，`labels` 把它們串起來（沿用心跳警示既有的串接做法），`bpRule` 與 `level` 則取其中最嚴重的那一條決定顏色。例如 109/56 ＝「🔻 低於目標；🔻 舒張壓低於參考值」。

`AlertLevel` 因此新增**兩個**等級：`'off-target'`（超出目標）與 `'below-target'`（低於目標／低於參考值）。收縮壓「低於目標」與舒張壓「低於參考值」**共用** `below-target`，由規則 key（`below_target`／`diastolic_below_ref`）產生不同標籤——`bpRule.key` 決定文案、`webAlertLevel` 決定顏色，不為舒張壓再開第三個等級。

`ReadingEvaluation` 另外新增 `standardKey`，讓列印報告、就診前摘要、分享連結與通知能印出「依據：術後嚴格控制 110–120」（規劃文件 R5）；目標帶用 `targetSystolicBand(standard)` 從階梯推導，不另外寫一個會漂移的摘要欄位。

第一版模板：`general_adult`（預設）、`post_op_strict`、`elderly_relaxed`、`ckd_diabetes`、`custom`。`custom` 由 `createCustomStandard(bounds)` 用照護者輸入的目標帶展開成完整階梯——**展開發生在建立標準時，不是判讀時**。妊娠與兒童明確不做，理由見規劃文件 § 3。

⚠️ 只有 `post_op_strict` 的階梯由規劃文件 § 3.1 逐格指定；`elderly_relaxed`／`ckd_diabetes`／`custom` 的完整階梯是依 § 3 摘要欄推導的第一版，對正式使用者開啟模板選單（issue #898）之前需要臨床確認。回歸測試在 `tests/unit/bpStandardTemplates.test.ts`。

#### UI 怎麼取得標準：`useBpEvaluator()`（issue #898）

畫面**不直接呼叫裸函式**。`<BpStandardProvider patientId>` 一次載入該病人的全部生效區間，底下所有元件用 `useBpEvaluator()` 取得同一份 evaluator：

```ts
evaluator.evaluateAt(sys, dia, pulse, measuredAt)  // 清單／圖表／報告：用該筆量測當時生效的標準
evaluator.evaluateNow(sys, dia, pulse)             // 輸入即時回饋與平均值：還沒有 measured_at
evaluator.resolver                                 // 傳給 src/lib 的純函式（它們不得自己查資料庫）
```

掛載點只有兩個：`App.tsx` 的 `selectedPatientId`，以及 `BloodPressureReportPanel` 自己的 `patientId`（封存對象的唯讀歷史頁傳進來的 id 刻意不進入 `activeSubject`，巢狀 Provider 讓內層覆蓋外層）。

**沒有 Provider 時 `useBpEvaluator()` 直接丟例外**，不退回 general_adult：退回會讓漏掛的畫面看起來完全正常、只是用錯人的標準判讀，那種錯誤不會有人回報。防呆檢查的是 `typeof value?.resolver === 'function'` 而不是只檢查 truthy——測試的 hook harness 對沒有對應 Provider 的 context 會回傳一個共用預設值，只檢查 null 會放行。

**載入狀態與 `patientId` 綁在同一個 state。** Provider 存的是 `{ patientId, intervals }` 而不是裸的 `intervals`，判讀前先比對 owner。用 `useEffect` 在切換病人時清空是**不夠的**：passive effect 在 commit 之後才跑，`patientId` 換掉的那一次 render 整棵子樹會先拿著上一位病人的區間跑完一遍（Codex review，PR #905 P2）。綁 owner 讓比對在 render 當下同步完成，不依賴 effect 時機。

**「讀不到」與「查過了、沒設定」是兩件事。** `ResolvedBpStandard` 除了 `configured` 還有 `unavailable`：載入中、查詢失敗，或手上的區間還屬於上一位病人時，resolver 是 `UNAVAILABLE_BP_STANDARD_RESOLVER`（仍給一份門檻讓畫面畫得出來——空白的血壓清單比暫時用預設門檻更糟——但 `unavailable: true`）。這個區別是必要的：報告若把讀取失敗印成「當時未設定個別標準」，就是對醫師陳述一個我們並不知道的事實。

消費端因此必須真的用到 `loading`／`error`，不能只放著：`BloodPressureReportPanel` 連同標準一起等載入完成，讀取失敗時顯示可重試的警告並**停用匯出**（CSV 與 GPT 摘要會離開 app 進到醫師手上，不能帶著一份我們自己都不確定的判讀出去）。回歸測試在 `tests/unit/bpEvaluatorProvider.test.ts`。

`src/lib` 的純函式（`dashboardStats`／`recordReport`／`preVisitBrief`／`careAnomalySignals`）改成收一個 `BpStandardResolver`，同樣**必填**；沒有病人情境的呼叫端（主要是測試）必須顯式傳 `GENERAL_ADULT_RESOLVER`，讓 review 看得到那是刻意的。

#### 分級紅與配色落點收斂

`src/lib/alertPresentation.ts` 是全 app **唯一一份**等級對照表。原本 badge、列印報告、圖表 tooltip、輸入頁與統計卡各自維護一份 class map，新增等級時漏改一處就會出現「總覽紅、清單綠」。

它的 key 是 `AlertTone`，刻意比 `AlertLevel` 多三階：

| 額外的階 | 為什麼要分出來 |
| --- | --- |
| `critical` vs `danger` | 兩者的 `webAlertLevel` 都是 `danger`，但 185/120 是「現在就打電話」、165/95 是「今天內回報醫師」。同一個紅講兩件事＝警報疲乏 |
| `on-target` vs `normal` | 兩者都是 `normal`，但「在目標內」是對著醫囑目標說的正向回饋 |
| `pulse-warning` | 血壓沒到警示級、只是心跳 >120 時用心跳自己的琥珀。「紅＝血壓」是全 app 一致的語彙 |

視覺階梯：**外框 → 實心 → 實心＋色條 → 深實心＋色條＋行動文字**。`warning` 與 `danger` 的底色相同，左側 4px 色條是它們在灰階下唯一的差別；`critical` 再靠更深的底色與「立即複測」分出來。高側用紅、低側用琥珀，加上上／下三角圖示，讓「往哪邊調」在紅綠色盲與灰階列印下都還在。列印報告走 `ALERT_SOFT_CHIP_CLASS`（淺底）但**保留同一組色條**：實心深紅會吃墨、家用印表機容易糊成一塊黑。色條一律連同 `rounded-l-none` 一起給（`ALERT_BAR_CLASS`）：chip 是圓角，只加左邊框會被瀏覽器沿圓角彎成彎月形，看起來像顏色溢出的 bug；左側兩角改直角後才是一條直線。

跨畫面一致性由 `tests/unit/alertPresentation.test.ts` 鎖住：掃過整個值域 × 兩份標準，確認每一組數值在五個落點都查得到樣式，而且四階紅的非色相差異還在。

#### R5：報告必須說出依據哪一份標準

`RecordReport` 表頭、CSV 的每一列與 GPT 摘要都印出判讀標準（例如「術後嚴格控制 110–120 mmHg」）。這是本功能最容易漏、後果最嚴重的一點：醫師看到「偏高」卻不知道基準是 110–120 還是一般成人的 135/85，會做出不同的處置決定。

- 印的是**該筆讀數當時**生效的標準，不是現在的。跨越標準變更日的報告會列出兩份而不是一份（`bpStandardsUsed()` 逐筆解析後去重）。
- `configured: false` 一律印「當時未設定個別標準（一般成人）」，**不得**改印現在的標準名稱。
- CSV 把標準放在**每一列**而不只是表頭：匯出的檔案會被排序、篩選與部分複製，表頭一離開那一列就失去對應關係。

#### 設定面板

`src/components/settings/BpStandardSettings.tsx`，比照 `CareAnomalyAlertSettings` 的自給自足慣例（只接 `patientId`／`isDemoMode`／`canManageMedication`）。只有 `can_manage_medication` 的照護者能改，唯讀家屬看到鎖住的欄位與說明，不會等到儲存才被 RLS 拒絕。

面板同時顯示「現在生效」與「已排程、從某日起生效」兩列——既然支援未來生效，排了程卻看不到會讓使用者以為沒存到。畫面上另有一行明說「變更從現在起生效，過去的紀錄不會被重新上色」：生效日期化最容易被誤解的就是這一點。

**面板不自己讀一份 intervals，也不自己重讀。** 它直接消費 Provider 的狀態，存檔後呼叫 `evaluator.reload()`。自己維護一份的後果是：換完標準走回「今天」或血壓輸入頁，那些畫面仍用舊的 resolver 判讀，要整頁重載才會更新——一個會改變健康判讀的設定不能有那種延遲（Codex review，PR #905 P1）。

**換病人時表單一律先重置再填。** 只在「新病人有生效區間」時才覆寫，會讓從一位設了自訂目標的病人切到尚未設定的病人時，畫面上顯示、而且可以直接按下儲存**前一位病人的目標帶與門診備註**——寫進另一個人健康判讀的值（同上，P1）。回歸測試在 `tests/unit/bpStandardSettingsPanel.test.ts`，兩條都經過「還原舊寫法會失敗」的驗證。

## 視覺識別

收縮壓使用 `#C23B3B`（dark `#F87171`），舒張壓使用 `#2563EB`（dark `#60A5FA`），心跳使用 `#7C3AED`（dark `#C084FC`）。圖表以高壓實線圓點、低壓實線菱形、心跳虛線方點區分；不要再加佔手機寬度的小圓點。

## Telegram 通知可靠性

血壓寫入 Supabase 成功後，`src/lib/telegramNotification.ts` 只把 `recordId` 與 `patientId` 交給帶目前登入 session 的 `blood-pressure-notifier` Edge Function。Function 以 caller-scoped Supabase client 對 `blood_pressure_records` 做精確的 `id + patient_id` 查詢，再由 RLS 與 JWT email 驗證目前使用者；血壓數值、病人名稱與提交者不接受瀏覽器自訂。通知失敗不回滾已保存的血壓；網路錯誤一律不重送，避免回應遺失時產生重複提醒。Telegram 暫時性 5xx 後的「請求內重試一次」由 optional secret `BLOOD_PRESSURE_NOTIFIER_IN_REQUEST_RETRY` 控制（429 不重試：直送沒有重試者，合法 429 依 ADR-007 D4 條件 0 直接終結，不會無視 `retry_after` 再打；重試後若有任何一次結果不明，整體回報仍是不明，不會被後一次的明確拒絕覆蓋）（[ADR-007](../adr/007-notification-delivery-semantics.md) 上線約束 4 的行為開關）：不存在時走 `supabase/functions/_shared/deliveryPolicy.ts` 的 `IN_REQUEST_RETRY_DEFAULT`，在票 6（sweeper）與票 10（今天頁告警橫幅）上線前預設**保留**重試——owner 已決定危險等級寧可漏送、但一定有人知道，所以只有「有人會知道」的出口先到位，才把重試拿掉。

**直送帳本的五值狀態機（ADR-007 票 2，issue #959，migration `20260926161421`）**：送出前 Function 呼叫 `reserve_blood_pressure_notification_delivery_v2`，`pending → sending` 由一次條件式 UPDATE 原子取得，回傳 `claimed` 與 `claim_token`；**只有 `claimed = true` 才送出**，其餘一律不送、也不得回報成功。送出器回傳 `provider_*` 分類而不 throw，之後呼叫 `resolve_blood_pressure_notification_delivery` 寫終局狀態（`sent`／`delivery_unknown`／`failed_terminal`；單向、驗證 `claim_token`，舊 token 的重試在 `WHERE` 就落空，這是 D9 的 ABA 防護）。`resolve` 失敗不回 502（訊息可能已在家屬手機上），改回報 `unknown`。Function 回應帶明確的 `sharedTelegram` 結果欄位：`delivered`／`in_progress`（另一個呼叫正在送，回應附伺服器算好的 `sharedRemainingMs`＝門檻 M＝10 分鐘扣掉那次送出已耗時間；前端只拿它當相對期限回看帳本直到終局，不把伺服器時間戳和手機時鐘相減）／`unknown`（`sending` 逾時、`delivery_unknown`、resolve 失敗）／`failed`（確定沒送，且**不會自動重試**——直送路徑沒有重試者，不得對看護說「稍後重試」）／`deferred`／`not_subscribed`；輸入頁對 `in_progress`／`unknown`／`failed` 各有三語提示，都先說「血壓已存檔」，看護不必重新輸入；`personalQueued = true`（個人化通知已排入 outbox、有自己的重試者）時 `unknown`／`failed` 改用只說「家人群組那一則」的版本，並說明個人通知會自動送出，不對整條家人通知路徑說「沒送出、不會重試」。Telegram 回 2xx 但回覆內容讀不到（header 之後斷線、不是 JSON、沒有 `ok`）判 `delivery_unknown`／`provider_network_unknown`，`provider_api_rejected` 只留給真的解析到 `ok:false` 的回覆。舊簽章 `reserve_blood_pressure_notification_delivery` 在部署窗口內仍供舊版 Function 呼叫，它建立的列帶 `created_by_legacy_reserve` 標記、對 v2 的 claim 不可見（上線約束 2）；舊簽章 `confirm_blood_pressure_notification_delivery` 同樣只收 legacy-marked 的 `pending` 列，記錄者無法用它把 v2 的 `sending`／`delivery_unknown`／`failed_terminal` 蓋成 `sent`。這個欄位的過渡預設是 `true`：卡在 migration 的 `ALTER TABLE` 鎖上、之後才恢復執行的舊函式本體不會寫這個欄位，必須一樣被當成 legacy，只有 v2 自己的 INSERT 明寫 `false`；`DROP`、第二次隔離與收掉過渡預設都屬票 9。

Telegram 標題使用 Function 從授權紀錄重新讀到的病人顯示名稱，例如「媽媽血壓量測通知」或「portfolio-author 血壓量測通知」；提交者由 JWT email 產生並移到第二行，讓收件者先辨認是哪一位被照顧者，再看到誰代為提交。前端已完全不依賴 `VITE_WORKER_URL`／`VITE_WORKER_API_KEY`；舊版 Cloudflare Worker `/notify` 已於 2026-09-07 停用並自 repo 移除，不再是任何 build 的相容路徑。

### 刪除血壓紀錄與 delivery 收據的生命週期（issue #932）

`blood_pressure_notification_deliveries` 的 `record_id, patient_id` 外鍵原本是 `ON DELETE RESTRICT`：只要 `blood-pressure-notifier` 替某筆血壓保留過一次 delivery（幾乎每一筆會推播的量測都會），照護者刪除那筆量測就會撞外鍵失敗，畫面卻只顯示「請確認網路後再試」，跟網路無關。`20260925140000` 把它改成 `ON DELETE CASCADE`：量測被刪除時，已經沒有用途的收據列（`status='sent'`，或根本沒建立過）一併刪除；一律不允許刪除（原 RESTRICT）曾經是唯一安全但過度保守的作法，現在改成「已解決的收據可以一起清掉，還在處理中的收據擋下刪除」。

但 CASCADE 不分青紅皂白：如果照護者剛好在 `reserve_blood_pressure_notification_delivery`（寫入 `status='pending'`）與 `confirm_blood_pressure_notification_delivery`（改成 `sent`）之間的極短時間窗刪除同一筆量測，CASCADE 會連帶刪掉那筆還在處理中的收據，讓 confirm 找不到列而丟例外，整支 Function 在呼叫 `enqueue_blood_pressure_personal_notifications` 之前就中止且不重試——即使 Telegram 那則警示已經送達，個人化通知仍會漏發。`20260925160000` 補上一個 `BEFORE DELETE` trigger：只要該筆量測還有 `status='pending'` 的收據就擋下刪除、丟出「稍後再試」的例外；沒有 pending 收據（未推播過，或已經 `sent`）時放行，交給既有的 CASCADE 清掉收據。這個時間窗通常只有一次 RPC 往返加一次 Telegram API 呼叫（不到幾秒），不需要重新設計 delivery 的狀態機或授權邏輯。

ADR-007 票 1／票 2 之後 `blood_pressure_notification_deliveries` 已是五值狀態機；`20260926161421` 把這個 `BEFORE DELETE` 守門改成「有**新鮮的** `pending` 或 `sending` 收據」——兩者都代表收據可能還在被 Function 使用中，但只擋門檻 M＝10 分鐘內的（以 `COALESCE(attempt_started_at, created_at)` 判斷；舊簽章 `reserve_*` 每次交出 legacy 的 `pending` 列都會蓋上 `attempt_started_at`，所以舊 Function 正在（重）送的列仍被擋）。Function 取單後中止或 `resolve` 失敗會讓列停在 `sending`，舊 confirm 失敗會留下 legacy `pending`，兩者都沒有人會再把它轉成終局，一律擋住就永遠刪不掉那筆量測；超過 M 的 stale 列與已終局（`sent`／`delivery_unknown`／`failed_terminal`）的收據照舊放行 CASCADE。`resolve_*` 另接受 `p_attempts`（這次實際拿到的 provider 回應數；請求內重試可能是 2、缺 secret 未送是 0），`attempt_count` 依它累加而不是固定 +1。

這個順序是刻意的：照護紀錄是單一真相，Telegram 是提醒副本；不能為了通知重試而重複寫入血壓，也不能把通知錯誤靜默成成功。部署修正後仍需在 staging 部署 `blood-pressure-notifier`、設定該環境的 `TELEGRAM_BOT_TOKEN`／`TELEGRAM_CHAT_ID`，並用兩個核心照護帳號驗證各自可寫入的病人紀錄通知；不執行 production 直接部署。

### 共用群組被略過時要看得見（Fail loudly）

共用 Telegram 群組只送給 `notification_subscriptions` 有啟用 `telegram` 列的病人（SEC-20260908-01）；這道閘門不放寬。以前沒訂閱或查詢失敗時 Function 什麼都不記、照樣回 `{ ok: true }`，家屬沒收到也沒有人知道。現在：

| 情況 | Function log（只有事件名與原因，不含病人 id、數值、email） | HTTP 回應 | 輸入頁 |
| --- | --- | --- | --- |
| 已訂閱 | — | 200 `{ ok: true, sharedTelegram: 'delivered' \| 'in_progress' \| 'unknown' \| 'failed' \| 'deferred', personalQueued }`（ADR-007 D9-b，見上方「直送帳本的五值狀態機」） | `delivered` 無提示；其餘依結果顯示三語提示 |
| 未訂閱，但有排入個人化通知 | `blood_pressure_notifier_legacy_destination_skipped`，`reason: 'not_subscribed'` | 200 `{ ok: true, sharedTelegram: 'not_subscribed', personalQueued: true }` | 無提示（付費家屬仍會經 outbox 收到） |
| 未訂閱，也沒有個人化通知 | 同上 | 200 `{ ok: true, sharedTelegram: 'not_subscribed', personalQueued: false }` | **只有警示級讀數**才顯示三語說明：這筆不會自動通知家人，危險值請直接聯絡家人（`role="status"`）；正常讀數不提示 |
| 訂閱查詢失敗 | 同上，`reason: 'subscription_query_failed'` | 先照常嘗試個人化 enqueue，再回 502 | 既有的「通知失敗，請截圖回報」警示 |
| 已訂閱，但請求沒帶 header `X-Delivery-Contract: 2`（部署窗口內仍在跑舊版快取 PWA 的看護），且結果是 `failed`／`unknown`／`in_progress`，或 `not_subscribed` 但個人那一則不明（`personalUnknown`） | `blood_pressure_notifier_legacy_contract_rejected`，`result` | 502 `{ error, sharedTelegram, personalQueued }` | 舊 adapter 只認「非 2xx＝通知失敗」，對它回 200 等於不警告；帳本、`resolve` 與個人化 enqueue 都已照常處理，只有回應退回舊契約（寧可多提醒；不能要求看護先更新 PWA，AGENTS.md § 3.7）。新版 client 以 header 帶契約版本才拿完整結果；走 header 而不是 body 欄位，是因為新版 bundle 可能先於新 Function 上線（PR preview 不部署 Function），已部署的舊 Function 只認兩個 body key、會忽略不認得的 header（PR #988 Codex P1）。`in_progress` 回看結束後若共用結果不是 delivered，前端會再呼叫一次冪等的 `enqueue_blood_pressure_personal_notifications` 重讀 `(queued_count, unknown_count)`，不拿回看前的個人快照承諾「會自動送出」；讀不到就當個人那一則不明 |
| 未訂閱，且個人化 enqueue 失敗 | 略過事件 ＋ `blood_pressure_notifier_enqueue_failed` | 502 | 同上（不能講成「沒設定」，因為不知道原本該不該有） |

查詢失敗與未訂閱刻意分開：前者是故障，不知道能不能送，所以不送（授權 fail closed）但也不回 ok。`personalQueued`／`personalUnknown`／`personalDelivered` 來自 `enqueue_blood_pressure_personal_notifications` 回傳的 `(queued_count, unknown_count, delivered_count)`（migration `20260927004500`）：分別是這筆紀錄目前 `pending`／`sending`、`delivery_unknown`、`sent` 的 outbox 列數（已存在＋這次新插入）；已送達另外回報，畫面才不會對 drain 已送出的通知說「已排入、會自動送出」，改用「個人通知已送達」的版本（優先序：不明 > 在路上 > 已送達）；同一筆紀錄重播或並行的第二個呼叫不會再拿到 0，否則共用群組失敗時畫面會說「家人通知沒送出、不會重試」而 outbox 其實正在重試。`personalUnknown`（至少有一則個人通知可能已送達、不會重送；可與 `personalQueued` 同時成立，此時以不明為準、不承諾「會自動送出」）時 `unknown`／`failed` 改用「個人通知無法確認是否送達」的版本，不講成「沒有個人通知」也不說「會自動送出」；`not_subscribed` 配 `personalUnknown` 時沒有任何一則被確認送達，同樣顯示「無法確認個人通知是否送達，請直接聯絡家人」而不是靜默；`failed_terminal` 的列兩邊都不算。「警示級」由 `InputPage.utils.ts` 的 `isFamilyAlertLevelReading()` 判定（北極星鐵律 3：警報分級、寧缺勿濫）：danger／danger-low／warning-low 與 warning 會提示，但 warning 裡的「偏高觀察」（九級表寫明「記錄即可，無須警報」）不提示，除非同時心跳 >120；normal、off-target、below-target（建議是記錄、回診時回報）也不提示。多數病人沒有任何家屬通知，若每筆都提示，看護很快就會忽略，真正危險的那筆反而沒人看。線上送出用 `evaluateNow`，離線補送用該筆 `measured_at` 當下生效的標準（`evaluateAt`）。Function log 不受這個門檻影響，每次略過都照記。前端 `parseTelegramNotificationResult` 對認不得的回應（例如部署窗口內舊版 Function 的 `{ ok: true }`）一律視為未略過，避免對每一筆跳出錯誤提示。回歸測試：`tests/unit/bloodPressureNotifier.test.ts`、`tests/unit/telegramNotification.test.ts`。

### 通知與畫面同源判讀（issue #899）

通知的「狀態」與畫面**逐字相同**，而且用的是該病人**量測當下**生效的判讀標準。在這之前 Function 有自己一套門檻（130/80 起算 warning、≥180 沒有獨立的「立即複測」等級、心跳 >120 會把危險低血壓降成 warning），已經和九級表漂移；病人級標準上線後差距只會更大——家屬在 Telegram 讀到「✅ 正常」、打開 app 卻是「超出目標」。

- **同一份資料、對齊的兩份引擎**：Function 不能直接 import 前端引擎（JSON module 與前端相依過不了 Deno bundler），所以 `scripts/sync-bp-rules-to-edge.ts` 把 `src/config` 的九級表、等級詞彙與各模板階梯逐字寫成 `supabase/functions/_shared/bpRuleData.ts`，`_shared/bpEvaluation.ts` 是與 `evaluateReading()`／`resolveStandardAt()` 對齊的 Deno 版引擎。**改完 `src/config` 的血壓規則必須跑一次產生器**；改任一邊的判讀程式必須兩邊一起改。
- **漂移守門**：`tests/unit/bpRuleParity.test.ts` 同時讀兩邊——資料逐欄相等，且對每個模板與多組自訂目標帶掃過所有整數讀數（收縮 60–200 × 舒張 30–130 × 有無心跳警示）比對等級與三語標籤，外加生效區間解析與 R5 來源標示。任何一邊單獨改動都會紅燈。
- **讀標準的授權邊界**：`blood-pressure-notifier` 以 caller-scoped client 讀 `patient_bp_standards`，**不得**為此改用 service role；`personal-notification-drain` 本來就持有 service role，用同一個欄位清單讀取。兩者的 select 清單（`BP_STANDARD_INTERVAL_COLUMNS`）刻意不含醫囑備註 `prescribed_note`，由測試鎖住。
- **R5**：訊息多一行「📐 判讀標準」，印出標準名稱與收縮壓目標帶（例如「術後嚴格控制 110–120 mmHg」）；未設定個別標準時印「一般成人（未設定個別標準）」。
- **讀不到標準時照樣送出**：查詢失敗或資料形狀不對時，暫以一般成人標準判讀，但「判讀標準」那一行明說「無法讀取個別判讀標準」。一般成人九級表刻意不套 hard floor（R3），例如 140/45 會先命中「偏高」，而雙軸模板會判成 danger-low；因此讀不到標準時 `evaluateNotificationReading` 會另外套上 hard floor（≥180/120、<90/50）並取較嚴重的等級，危險讀數不會因查詢故障而漏報。為了一張設定表讀不到就吞掉整則健康通知，才是 Fail loudly 要擋的事。
- **全域群組訊息的版面**：只有改寫／新增的「狀態」與「判讀標準」兩行補上英文（`zh / id / en`），其餘行維持既有中文＋印尼文格式。
- **讀得到紀錄就讀得到標準**：`patient_bp_standards` 的 SELECT policy 與 `blood_pressure_records` 的讀取 policy 用同一個述詞（`care_access.user_id = auth.uid()`，見 migration `20260915100000`），所以不會出現「讀得到這筆血壓、卻因權限讀不到標準而被靜默當成未設定」的情況——未綁定 `user_id` 的記錄者在 `record_lookup` 就已經 404。日後若放寬其中一邊的 policy，這個等價就不再成立，必須一起檢查。

## 記錄與回顧的分工

每個照護模組都自己內含「今天輸入」與「近期趨勢」，趨勢不再集中在另一個底部分頁。這是刻意的：量完血壓最自然的下一個動作就是跟前幾天比一下，若必須切換底部分頁才看得到，日常動線每天都要被打斷一次。更關鍵的是，原本的切法只做了一半——血壓與體溫有趨勢，體重、飲食與服藥完全沒有，使用者學到的「想看趨勢就去那一頁」有三次會落空。

五個模組共用 `ModuleTrendSection` 外框（期間選項、展開記憶、延遲載入邊界），避免各自長出五種版本。趨勢區塊預設收合並記住狀態：照護分頁的首要工作是記錄，預設展開會把輸入表單推到摺線以下，也會讓較重的圖表套件進入每次開 App 的載入路徑。因此每個趨勢面板都是自己的 lazy chunk，recharts 只在照護者第一次展開時下載。

期間選擇與展開狀態由 `src/lib/preferences/trendPreference.ts` 統一保存，各模組與封存對象的唯讀歷史頁共用同一份；依〈生理數值對象綁定不變量〉，圖表期間與版面展開狀態屬純帳號層偏好，不需要 patient-scoped 分區。

## 血壓報告（原獨立的報告底部分頁）

已無獨立的「報告」底部分頁。血壓與體溫的趨勢圖原本同時存在於各自模組的「近期趨勢」與這個報告頁，是純粹的重複顯示；統計卡片、逐筆報告與 CSV／GPT 匯出則是報告頁裡真正沒有重複的部分。因此改為：血壓與體溫的趨勢圖只留在各自模組；統計卡片、逐筆報告與匯出併入血壓模組的「近期趨勢」，因為這些內容本來就是血壓資料的延伸，不需要另外佔一個底部分頁才看得到。

`BloodPressureReportPanel`（`src/features/vitals/components/BloodPressureReportPanel.tsx`）是這些內容現在的共同落點，接受明確的 `patientId`，不再依賴全域的目前操作對象狀態；它以 patient 篩選趨勢、平均、偏高／偏低與時段分布，並用結構化 record report 供醫師／家屬閱讀，顯示測量時間與規則狀態，不把資料庫寫入時間冒充量測時間。目前報告與 CSV 的資料範圍仍是血壓；體重、飲食與服藥次數已可在各自模組查閱，尚未併入匯出檔。

結構化報告卡片同時以 `readMedicationDay(patientId, 今天照護日)` 讀出「目前藥單」（依時段分組、`as_needed` 藥品另列「需要時服用」），與統計卡片、極值和列印／存 PDF 共用同一份 `.record-report`，讓照護者就診前不必切到服藥分頁再截圖。這裡刻意讀當日有效藥單，不是 `readMedicationHistory` 的變更紀錄——變更紀錄回答「藥單什麼時候改過」，看診當下要看的是「現在正在吃什麼」，兩者語意不同不能互換。藥單清單只在畫面上顯示，不寫進 CSV／GPT 匯出，避免既有的匯出格式（每列固定血壓欄位）被迫塞進和血壓無關的欄位。

列印報告底部共用 `src/components/system/PrintSourceFooter.tsx`，顯示家健錄名稱、正式公開首頁與繁中／印尼文／英文的「家庭自記錄，非醫療診斷文件」免責文字。QR 由 `src/lib/qrCode.ts` 以 inline SVG 矩陣產生，payload 固定為 `APP_CANONICAL_URL`，不把 `patientId`、姓名、token 或目前頁面 query 帶進紙本；這個固定邊界也讓 staging 預覽不會把 staging host 印成對外來源。

原本的四顆快速跳轉錨點已在拆掉報告頁前就先移除：手機頁面需要目錄本身就是頁面過長的症狀，而且載入中與錯誤狀態下目標區塊尚未 render，按下去沒有反應。

已封存對象的完整血壓與體溫歷史改由設定頁的「查看生命歷史」進入 `ArchivedPatientHistoryPage`（`src/features/system-admin/pages/ArchivedPatientHistoryPage.tsx`），不掛在底部主導覽，也完全不呼叫 `setActiveSubject`／`onSubjectSelect`——這個頁面直接以已封存對象的 `patientId` 讀取資料，結構上就不會讓已封存對象進入 `activeSubject`，見〈生理數值對象綁定不變量〉與 `src/lib/careSubjectGuard.ts` 的說明。

CSV 匯出按 patient 產生獨立檔，分頁讀取避免 1,000 筆上限；藥品目錄分批讀取，使用 UTF-8 BOM 並防 Excel 公式注入。體重與飲食同樣以 patient UUID 讀寫，不能靠 email 拼檔。

## 體重

體重是病人級照護資料；當天最多保存十二筆，每筆保存 `measured_at`，使用 `patient_weight_measurement_records` 的 `measurement_number` 1–12 表示量測槽位，並以 `patient_id + measured_on + measurement_number` 做唯一鍵。跨日後，資料庫保留每個過去日期 `measured_at` 最新的一筆；當天才允許十二筆，避免歷史高頻量測無限堆積。新槽位使用 INSERT，避免兩台裝置同時填入空槽位時互相覆蓋；舊版 PWA 繼續使用 `weight_records`，由 trigger 同步到新版第 1 槽位。體重輸入與「最近紀錄」在每日照護的同一個體重區段呈現，避免照護者在不同入口間找歷史資料；詳細的每餐熱量與病人專屬食物快取見 [`nutrition.md`](./nutrition.md)。

體重模組另含「近期趨勢」，以每日平均呈現體重變化。取當日平均而非某一次讀值，是因為體重在一天內會因進食與排泄浮動，單看某一次容易把日常波動誤讀成趨勢；沒有量測的日子在圖上留白而不連線，讓「沒量」與「量了沒變」可以分辨。彙整規則在 `src/lib/trendSeries.ts`，回歸測試在 `tests/unit/trendSeries.test.ts`。

體重一律顯示小數點後兩位。資料庫欄位本來就是 `NUMERIC(5, 2)`、寫入前也已收斂到兩位，但畫面（今天的紀錄、最近紀錄、趨勢圖數值）之前只印一位：照護者輸入 58.25、回頭看到 58.3，會以為系統擅自改了他量到的數字。位數、輸入框 step 與格式化都集中在 `src/lib/weight.ts` 的 `WEIGHT_DECIMALS`、`WEIGHT_INPUT_STEP`、`formatWeightKg` 與 `roundWeightKg`，避免哪天只改了顯示或只改了寫入而再度不一致；`formatWeightKg` 也負責把 Supabase 可能回傳的字串型 NUMERIC 轉成數字，並讓壞資料顯示破折號而不是 NaN。回歸測試在 `tests/unit/weight.test.ts`。

`measurement_number` 是資料庫唯一鍵需要的內部欄位，不再出現在畫面上。照護者只會遇到兩種狀態：記錄新的一筆（欄位留白，寫入當日第一個空槽），或點今天清單裡的某一筆進行修改（沿用該筆槽位）。修改中的那一筆以量測時間標示——照護者記得的是「早上量的那次」，不是「第 3 次」。

原本要求先從十二顆按鈕選「第幾次」才能輸入。體重不像血壓的早中晚有臨床意義，「第 7 次」對照護者沒有語意，等於要求使用者幫系統管理一個對他無意義的編號；要修正今天量過的某一筆，還得先展開「更改量測次數」再從十二顆按鈕裡找出正確的那一顆。今天的紀錄現在直接列出並可點選修改，與血壓、體溫的當日清單是同一種操作方式。底層的 INSERT／UPDATE、台北日期與病人級唯一鍵都沒有改變。

體重入口只由 `patient_daily_care_preferences.show_weight` 控制，以目前被照護者的 `patient_id` 為唯一鍵；設定頁開啟後，體重只在每日照護的頁內區段顯示，不再新增底部主導覽 tab，避免同一筆健康資料在兩個入口分流。這個偏好按病人共用，不會因不同照護者登入而分歧。原本另有一層獨立的「體重功能」病人級開關（`weight_settings` 表），只是在這個顯示偏好之上多包一層永遠同步的鎖、沒有額外效果，因此已移除該開關的 UI 與 App 層狀態；`weight_settings` 資料表仍保留給舊版快取 PWA 用戶端的相容路徑，不再由目前 UI 讀寫。替代方案「只在前端對 `admin@careapp.local` 硬編碼」無法隨照護對象與授權同步，因此不採用。

## 體溫

體溫與血壓同屬每日照護的生命徵象，入口和服藥並列在每日照護頁，不新增底部導覽。每筆體溫以 `patient_id`、`recorded_by`、`measured_at` 與 `created_at` 保存，另記錄測量部位（耳、額、口、腋）、量測情境與 240 字內備註；測量部位不能省略，因為不同部位的讀值不能直接混為一談。

資料庫 trigger 以伺服器 `created_at` 為每日計數基準，依病人每天最多 24 筆，並以病人 UUID advisory lock 防止同時寫入超額。這是 bot 防爆上限，不是醫療建議；刪除錯誤紀錄會釋出額度，RLS 仍只允許 `care_access.can_record` 的照護者讀寫。

因為是防爆上限而不是照護目標，額度計數平常不顯示，只有剩下 `TEMPERATURE_QUOTA_WARNING_MARGIN` 筆以內才出現。一般照護一天量兩三次永遠碰不到 24 筆，把分母做成常駐的顯眼徽章等於每天提醒使用者一件不需要在意的事，還會製造「是不是快用完了」的焦慮。

體溫紀錄保留 24 天。正式 Supabase 若已啟用 `pg_cron`，每日台北凌晨會執行清理函式；沒有排程模組的本機／預覽環境，下一次新增體溫時會順手清掉逾期資料。選 24 天是保留一個發燒週期與就醫前後上下文，不把短期紀錄永久堆積；長期趨勢應由醫師或匯出資料保存，而不是把過期健康資料留在產品資料庫。

體溫趨勢使用獨立圖表與數字狀態文字，不和血壓共用刻度，也不只用顏色判斷。`38°C` 以上只顯示「發燒範圍」提醒，若有呼吸困難、胸痛、發紺、意識改變或高燒持續超過 72 小時，畫面提示儘速就醫；App 不取代醫師診斷。

體溫輸入欄在輸入時只接受小數點後一位；若貼上或鍵入第二位小數，欄位會拒絕該變更並在欄位旁顯示繁中／印尼文提示，避免照護者只看到儲存按鈕停用卻不知道原因。

## 輸入 UX 與圖表

直接數字輸入可用自動跳欄、聚焦全選與未完整數值的溫和雙語提示，讓照護者抄寫血壓計時少按、少滑、少出錯；行動裝置的 `inputMode="numeric"` 已能穩定叫出螢幕數字鍵盤，因此輸入方式統一為鍵盤，不再提供滾輪切換。圖表可在服藥 plan 變更時間加註記，但註記是時間線索，不是自動推論藥物造成了血壓變化。

自動跳欄三格共用 `bpAutoAdvance` 的同一條規則：三位數立刻跳（血壓三格上限都是三位數，第三位輸入完必定完整），兩位數且已達該欄位下限則延遲 `BP_AUTO_ADVANCE_DELAY_MS` 再跳。延遲是必要的——兩位數可能只是三位數打到一半（105 會先經過 10），立刻跳會在打字中途搶走焦點。修正前收縮壓要滿三位數才跳、舒張壓與心跳滿兩位數就跳，導致 98 不跳而 85 跳，外觀相同的三個框行為不同。回歸測試在 `tests/unit/bpAutoAdvance.test.ts`。

延遲跳轉等待期間，輸入框會顯示淡藍色 pulse 提示（`PickerCard` 的 `pendingAdvance`），讓照護者知道系統即將自動跳走，不必搶著手動點下一格；一旦任何欄位被手動聚焦（點擊或 Tab），就會立刻取消尚未觸發的延遲跳轉，避免自動 `focus()` 與手動 focus 互搶焦點造成卡頓。

當 `visualViewport` 因軟鍵盤縮小超過 150px，App 進入暫時性的 compact input mode：隱藏每日照護頁首、最新量測、輸入方式切換、下方紀錄與底部導覽，只保留三個輸入欄與儲存按鈕。欄位聚焦後延遲 250ms 執行 `scrollIntoView`，等待 iOS 鍵盤 resize 完成，避免立即捲動造成跳動；儲存成功後 blur 目前焦點，讓鍵盤與導覽恢復自然狀態。沒有 `visualViewport` 的瀏覽器維持原本版面，不改動桌面配置。

Dashboard 的今日照護摘要與最新讀值要把 `measured_at`、狀態規則和目前 patient 一起呈現；不要顯示 Supabase、migration 或資料庫名稱作為照護者主要訊息。合規頁、CSV 匯出、帳號刪除與條款／隱私入口屬系統管理，但都要保留在可追溯的公開或設定流程中。
