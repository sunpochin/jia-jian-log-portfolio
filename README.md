# 家健錄（Jia Jian Log）— Sanitized Portfolio Edition

> 這是家健錄（一個家人與寵物健康紀錄 App）私有 repository 的**淨化作品集版本**，由可重建的自動化產線產生，
> 不是完整原始碼。所有個人資料、正式環境金鑰、基礎設施識別碼與私有維運流程皆已移除或替換為合成資料。
>
> 產線細節與設計理由見私有 repo 的 `docs/operations/portfolio-pipeline.md`（PORTFOLIO-01）。

## 技術棧

Vite + React 18 + TypeScript、Supabase（Postgres + RLS + Edge Functions）、Capacitor（iOS／Android 殼）、Cloudflare Worker。

## 這個版本刻意不包含的內容

- Supabase migration 歷史與 RLS 逐步演進（改以架構文件呈現設計，而非可執行的完整 schema 變更序列）。
- 部署、備份、資料匯入等維運腳本與其設定。
- 任何私有環境金鑰、正式環境網域與資料庫識別碼。

## 開發

```bash
bun install
bun run dev
bun test tests/unit
bun run build
```
