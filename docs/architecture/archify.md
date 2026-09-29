<!--
檔案用途：說明如何用 repo 內的 Archify skill 產生與驗證家健錄架構圖。
所在層：docs/architecture；供維護者重生 diagram source 與 HTML artifact。
主要關聯：.agents/skills/archify、scripts/archify-architecture.sh、jia-jian-log.architecture.json。
-->

# 用 Archify 產生家健錄架構圖

這個 repo 把架構圖的內容存成 JSON，再由 Archify 產生可互動的 HTML。JSON 是唯一來源；HTML 是產物，不要直接手改 HTML。

## 一次產生

需要 Node.js 18 以上。在 repository 根目錄執行：

```sh
bash scripts/archify-architecture.sh
```

這個 script 會先用 `showcase` 品質設定驗證 source，再產生：

- source：[`jia-jian-log.architecture.json`](./jia-jian-log.architecture.json)
- output：[`jia-jian-log-architecture.html`](./jia-jian-log-architecture.html)

產生後可以直接用瀏覽器開啟 HTML，查看深色／淺色主題、關係線與三個 guided views。

## 手動執行與除錯

若要分開看每一步，可使用以下命令：

```sh
node .agents/skills/archify/bin/archify.mjs validate \
  architecture docs/architecture/jia-jian-log.architecture.json \
  --quality showcase --json

node .agents/skills/archify/bin/archify.mjs deliver \
  architecture docs/architecture/jia-jian-log.architecture.json \
  docs/architecture/jia-jian-log-architecture.html \
  --quality showcase --json

node .agents/skills/archify/bin/archify.mjs visual-check \
  docs/architecture/jia-jian-log-architecture.html --json
```

`validate` 應回報 9/9 checks、`errors: 0`、`warnings: 0`；只有驗證通過才交付 HTML。`visual-check` 是產出後的瀏覽器證據檢查，若不想把檢查 sidecar 留在 repo，可先把 HTML 複製到暫存目錄再執行。

## 更新圖的方式

1. 編輯 [`jia-jian-log.architecture.json`](./jia-jian-log.architecture.json) 的元件、邊界、連線或 views。
2. 重新執行 `bash scripts/archify-architecture.sh`。
3. 在瀏覽器檢查 HTML，並確認 `git diff --check` 通過。

圖刻意只描述程式碼的高層拓撲：瀏覽器／PWA、React、Supabase Auth、Postgres + RLS、Edge Functions、Storage 與外部服務。不要把病人資料、token、secret 或 production 設定寫進 JSON；這張圖是溝通用的架構說明，不取代 RLS review、測試環境驗證或 live infrastructure evidence。

Archify 放在 `.agents/skills/archify`，只作為開發與文件工具，不會成為應用程式的 runtime dependency。保留這個 wrapper 是為了讓 source、品質設定與 output 路徑集中在一個可重複執行的位置，避免文件中的長命令逐漸漂移。

驗證 installed skill 完整性（doctor 檢查、獨立 validators 與 5 種圖表渲染引擎）可執行：

```sh
node .agents/skills/archify/bin/archify.mjs doctor
```
