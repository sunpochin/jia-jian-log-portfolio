/*
檔案用途：PORTFOLIO-01 產線的第一步——把私有 repo 依 allowlist 複製到本機輸出目錄，
套用替換規則後產生一份可供 portfolio:check 驗證的乾淨快照。純本機執行，絕不觸網、絕不 push。
所在層：scripts/portfolio，由 package.json 的 `portfolio:build` 呼叫。
主要關聯：docs/operations/portfolio-pipeline.md 第 3、4 節；allowlist.ts；
scripts/portfolio/replacements.local.json（私有、版控外，見 replacements.local.json.example）。
*/
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'

import {
  ALLOWLIST_DIRS,
  ALLOWLIST_FILES,
  ALLOWLIST_GLOB_SPEC_FILES,
  EXCLUDE_WITHIN_ALLOWLIST,
  KEPT_PACKAGE_JSON_SCRIPTS,
} from './allowlist'

const REPO_ROOT = process.cwd()
const OUTPUT_DIR = join(REPO_ROOT, 'tmp', 'jia-jian-log-portfolio')
const REPLACEMENTS_PATH = join(REPO_ROOT, 'scripts', 'portfolio', 'replacements.local.json')

// 只對這些副檔名的檔案內容做文字替換；圖片與 lockfile 等二進位／格式敏感檔案不動內容。
const TEXT_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.json', '.md', '.css', '.html', '.yml', '.yaml', '.svg', '.txt'])

type ReplacementsConfig = {
  minEntries: number
  literalReplacements: Record<string, string>
}

// 為什麼一定要有這份私有設定才能 build：替換規則本身就是「哪些字串是真實個資」的清單，
// 沒有它，build 出來的東西就是原始資料原封不動地複製一份——這比明確報錯更危險，
// 所以設定缺失、格式錯誤或條目數不足時一律直接失敗，不當作「這次沒有東西要換」略過。
function loadReplacements(): ReplacementsConfig {
  if (!existsSync(REPLACEMENTS_PATH)) {
    console.error(`❌ PORTFOLIO BUILD FAILED: 找不到 ${relative(REPO_ROOT, REPLACEMENTS_PATH)}`)
    console.error('   請複製 scripts/portfolio/replacements.local.json.example 為 replacements.local.json，並填入真實的替換規則。')
    process.exit(1)
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(readFileSync(REPLACEMENTS_PATH, 'utf8'))
  } catch (error) {
    console.error(`❌ PORTFOLIO BUILD FAILED: ${relative(REPO_ROOT, REPLACEMENTS_PATH)} 不是合法 JSON。`)
    console.error(`   ${(error as Error).message}`)
    process.exit(1)
  }

  const config = parsed as Partial<ReplacementsConfig>
  const literalReplacements = config.literalReplacements
  const minEntries = config.minEntries
  // 為什麼要求正整數：minEntries 是 0 或負數時，下面的 entryCount < minEntries 對空的
  // literalReplacements 永遠是 false，等於一份完全沒填替換規則的設定也會「通過」——
  // build 會靜默做零筆替換、把原始資料原封不動複製出去，比明確報錯更危險
  // （同一類邊界問題也出現在 checkLogic.ts 的 validateForbiddenConfig，見該檔案註解）。
  if (
    typeof minEntries !== 'number' ||
    !Number.isInteger(minEntries) ||
    minEntries <= 0 ||
    !literalReplacements ||
    typeof literalReplacements !== 'object'
  ) {
    console.error('❌ PORTFOLIO BUILD FAILED: replacements.local.json 缺少 literalReplacements 欄位，或 minEntries 不是正整數。')
    process.exit(1)
  }

  const entryCount = Object.keys(literalReplacements).length
  if (entryCount < minEntries) {
    console.error(`❌ PORTFOLIO BUILD FAILED: literalReplacements 只有 ${entryCount} 條，低於 minEntries=${minEntries}。`)
    console.error('   這通常代表範本被複製後沒有填入真實內容，直接視為設定不完整。')
    process.exit(1)
  }

  return { minEntries, literalReplacements: literalReplacements as Record<string, string> }
}

function isTextFile(path: string): boolean {
  const ext = path.slice(path.lastIndexOf('.'))
  return TEXT_EXTENSIONS.has(ext)
}

function listFilesRecursive(dir: string): string[] {
  const entries = readdirSync(dir, { withFileTypes: true })
  const files: string[] = []
  for (const entry of entries) {
    const fullPath = join(dir, entry.name)
    if (entry.isDirectory()) files.push(...listFilesRecursive(fullPath))
    else files.push(fullPath)
  }
  return files
}

// 有些程式碼把網域／字串包在 regex 常值裡（例如 /https:\/\/real-app\.vercel\.app\//），
// `.` 和 `/` 會被跳脫成 `\.`、`\/`——這時候純文字比對找不到，字面上根本是不同的字串。
// 所以每個 key 除了比對原始寫法，也要比對「跳脫過的」寫法，兩種都命中才算真的掃過。
function regexEscapedVariant(value: string): string {
  return value.replace(/[./]/g, '\\$&')
}

// 回傳每個 literalReplacements key 被實際套用的次數，讓呼叫端判斷有沒有「設定了但完全沒用到」的字串——
// 那通常代表範本沒改、或程式碼已經變了但設定忘記更新，兩種情況都不該悄悄放行。
function applyReplacements(outputFiles: string[], literalReplacements: Record<string, string>): Map<string, number> {
  const matchCounts = new Map<string, number>(Object.keys(literalReplacements).map(key => [key, 0]))

  // 把每個 key 展開成「原始寫法」與「regex 跳脫寫法」兩筆，再一起由長到短排序。
  // 為什麼一定要長到短：例如 "demo.careapp.local" 是 "staging-demo.careapp.local" 的
  // 子字串，若先換短的，長字串裡的子字串會被提早吃掉，導致長字串本身永遠不會再命中——
  // 這正是 build.ts 自己的「設定了但完全沒命中」防呆會抓到的情境，但先排序可以避免這個假警報。
  const expandedEntries: { from: string; to: string; originalKey: string }[] = []
  for (const [from, to] of Object.entries(literalReplacements)) {
    expandedEntries.push({ from, to, originalKey: from })
    const escapedFrom = regexEscapedVariant(from)
    if (escapedFrom !== from) expandedEntries.push({ from: escapedFrom, to: regexEscapedVariant(to), originalKey: from })
  }
  expandedEntries.sort((a, b) => b.from.length - a.from.length)

  for (const filePath of outputFiles) {
    if (!isTextFile(filePath)) continue
    let content = readFileSync(filePath, 'utf8')
    let changed = false
    for (const { from, to, originalKey } of expandedEntries) {
      // 大小寫不敏感比對＋替換：真實案例是同一個 email 在不同測試檔案裡被打成不同大小寫
      // （'admin@careapp.local' vs 'admin@careapp.local'），原本大小寫敏感的 .includes()／
      // .split().join() 完全放過了後者，讓混合大小寫的真實 email 沒被換掉、也差點沒被
      // 禁字掃描攔下（見 checkLogic.ts findForbiddenHit 同一次修正）。這裡要保留原始大小寫
      // 的 `to` 值直接取代整段大小寫不同的命中內容，語意是「這個字串本身不該存在，不管
      // 打成什麼大小寫」，不是「盡量保留原大小寫」。
      const pattern = new RegExp(from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')
      const occurrences = content.match(pattern)?.length ?? 0
      if (occurrences === 0) continue
      matchCounts.set(originalKey, (matchCounts.get(originalKey) ?? 0) + occurrences)
      // 用 replacer function 而不是直接把 `to` 傳給 replace()：字串型 replacement 裡的
      // `$&`／`$$`／$`／$' 會被 String.replace 當成特殊樣式展開（`$&` 會插回「原本命中的
      // 字串」本身），如果哪天 replacements.local.json 剛好填了含 `$` 的替換值，字面型 replace
      // 會把應該被隱藏的原始內容原封不動寫回輸出——sanitizer 自己造成洩漏，比沒替換到更糟。
      // Function replacer 的回傳值永遠當純文字插入，不會有這個問題（Codex PR #597 review finding）。
      content = content.replace(pattern, () => to)
      changed = true
    }
    if (changed) writeFileSync(filePath, content)
  }

  return matchCounts
}

// package.json 的 dependencies／devDependencies／overrides 原封不動保留，讓既有 bun.lock 仍然有效；
// 只砍掉指向 native app 建置與私有維運腳本（未進 allowlist）的 script 條目。
function writePrunedPackageJson(srcPath: string, destPath: string) {
  const pkg = JSON.parse(readFileSync(srcPath, 'utf8'))
  const prunedScripts: Record<string, string> = {}
  for (const key of KEPT_PACKAGE_JSON_SCRIPTS) {
    if (pkg.scripts?.[key]) prunedScripts[key] = pkg.scripts[key]
  }
  pkg.scripts = prunedScripts
  writeFileSync(destPath, `${JSON.stringify(pkg, null, 2)}\n`)
}

function writeGeneratedReadme(destPath: string) {
  const content = `# 家健錄（Jia Jian Log）— Sanitized Portfolio Edition

> 這是家健錄（一個家人與寵物健康紀錄 App）私有 repository 的**淨化作品集版本**，由可重建的自動化產線產生，
> 不是完整原始碼。所有個人資料、正式環境金鑰、基礎設施識別碼與私有維運流程皆已移除或替換為合成資料。
>
> 產線細節與設計理由見私有 repo 的 \`docs/operations/portfolio-pipeline.md\`（PORTFOLIO-01）。

## 技術棧

Vite + React 18 + TypeScript、Supabase（Postgres + RLS + Edge Functions）、Capacitor（iOS／Android 殼）、Cloudflare Worker。

## 這個版本刻意不包含的內容

- Supabase migration 歷史與 RLS 逐步演進（改以架構文件呈現設計，而非可執行的完整 schema 變更序列）。
- 部署、備份、資料匯入等維運腳本與其設定。
- 任何私有環境金鑰、正式環境網域與資料庫識別碼。

## 開發

\`\`\`bash
bun install
bun run dev
bun test tests/unit
bun run build
\`\`\`
`
  writeFileSync(destPath, content)
}

function writeGeneratedGitignore(destPath: string) {
  writeFileSync(destPath, 'node_modules\ndist\n.env\n.env.local\n.DS_Store\n/test-results/\n/playwright-report/\n')
}

// 已知的 gitleaks 誤判：tests/unit/bloodPressureMeasurementSession.test.ts 裡的測試假資料
// sessionKey（日期＋場次＋假病患 id 組成的字串）熵值剛好高到被 generic-api-key 規則標記，
// 不是任何形式的真實密鑰。這裡用固定路徑／行號的 fingerprint（--no-git 模式格式，不含 commit
// hash——commit hash 要到 release.ts 建立新歷史時才會產生，無法在這裡預先算出，所以下面的
// portfolio-ci.yml 特意也改用同樣的 --no-git 模式掃描，才能吃到同一份 .gitleaksignore）。
// 路徑寫死用 /repo/ 開頭：check.ts 與 portfolio-ci.yml 的 docker 指令都用 `-v ...:/repo` 掛載、
// `--source /repo`（絕對路徑），gitleaks 的 Fingerprint 會直接印出這個絕對路徑，不是相對路徑
// （實測驗證過：曾經用相對路徑寫這份清單，結果比對不到，掃描依然回報找到 1 筆洩漏）。
function writeGeneratedGitleaksIgnore(destPath: string) {
  writeFileSync(
    destPath,
    '# gitleaks 誤判白名單（--no-git 模式的 path:rule:line fingerprint，不含 commit hash）：\n' +
      '# 下面這筆是測試假資料（日期＋場次＋假病患 id），熵值恰好觸發 generic-api-key 規則，不是真實密鑰。\n' +
      '# 路徑用 /repo/ 開頭：對應 docker run -v ...:/repo --source /repo（見 check.ts、portfolio-ci.yml）。\n' +
      '/repo/tests/unit/bloodPressureMeasurementSession.test.ts:generic-api-key:79\n',
  )
}

function writeGeneratedCiWorkflow(destPath: string) {
  mkdirSync(dirname(destPath), { recursive: true })
  const content = `# 公開作品集的精簡 CI：只做 lint／typecheck／test／build／gitleaks，不含任何身分掃描。
# 為什麼不掃身分字串：禁字清單本身就是要隱藏的識別資訊，放進公開 repo 的 CI 等於直接公布；
# 身分掃描永遠只留在私有側的 portfolio:check（見 docs/operations/portfolio-pipeline.md 3.3、5.5 節）。
# gitleaks 特意用 --no-git（掃工作目錄，不掃 git 歷史）而不是官方 gitleaks-action：
# --no-git 的 fingerprint 只跟檔案路徑／行號有關、不含 commit hash，才能跟 repo 根目錄的
# .gitleaksignore（build.ts 產生）用同一份格式對得上，不受每次 push 產生新 commit hash 影響。
name: portfolio-ci
on: [push, pull_request]
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - run: bun install --frozen-lockfile
      - run: bun run lint
      - run: npx tsc --noEmit
      - run: bun test tests/unit
      - run: bun run build
      - run: docker run --rm -v "\${{ github.workspace }}:/repo" ghcr.io/gitleaks/gitleaks:v8.30.0 detect --source /repo --no-git
`
  writeFileSync(destPath, content)
}

function main() {
  const { literalReplacements } = loadReplacements()

  rmSync(OUTPUT_DIR, { recursive: true, force: true })
  mkdirSync(OUTPUT_DIR, { recursive: true })

  for (const dir of ALLOWLIST_DIRS) {
    const srcDir = join(REPO_ROOT, dir)
    if (!existsSync(srcDir)) continue
    cpSync(srcDir, join(OUTPUT_DIR, dir), { recursive: true })
  }
  for (const excluded of EXCLUDE_WITHIN_ALLOWLIST) {
    const target = join(OUTPUT_DIR, excluded)
    if (existsSync(target)) rmSync(target)
  }
  for (const file of [...ALLOWLIST_FILES, ...ALLOWLIST_GLOB_SPEC_FILES]) {
    const srcPath = join(REPO_ROOT, file)
    if (!existsSync(srcPath)) continue
    if (file === 'package.json') {
      writePrunedPackageJson(srcPath, join(OUTPUT_DIR, file))
      continue
    }
    mkdirSync(dirname(join(OUTPUT_DIR, file)), { recursive: true })
    cpSync(srcPath, join(OUTPUT_DIR, file))
  }

  const outputFiles = listFilesRecursive(OUTPUT_DIR).filter(path => statSync(path).isFile())
  const matchCounts = applyReplacements(outputFiles, literalReplacements)
  const unused = [...matchCounts.entries()].filter(([, count]) => count === 0).map(([key]) => key)
  if (unused.length > 0) {
    console.error(`❌ PORTFOLIO BUILD FAILED: ${unused.length} 條 literalReplacements 完全沒有在輸出內容中命中：`)
    for (const key of unused) console.error(`   - (${key.length} chars, 不印出真實內容)`)
    console.error('   這通常代表範本沒改、或程式碼已經變了但設定忘記更新，兩種都需要人工確認，不應該悄悄通過。')
    process.exit(1)
  }

  writeGeneratedReadme(join(OUTPUT_DIR, 'README.md'))
  writeGeneratedGitignore(join(OUTPUT_DIR, '.gitignore'))
  writeGeneratedGitleaksIgnore(join(OUTPUT_DIR, '.gitleaksignore'))
  writeGeneratedCiWorkflow(join(OUTPUT_DIR, '.github', 'workflows', 'portfolio-ci.yml'))

  if (existsSync(join(OUTPUT_DIR, '.git'))) {
    console.error('❌ PORTFOLIO BUILD FAILED: 輸出目錄不應該有 .git（不得繼承私有 repo 的歷史）。')
    process.exit(1)
  }

  console.log(`✅ portfolio:build 完成：${outputFiles.length} 個檔案已複製到 ${relative(REPO_ROOT, OUTPUT_DIR)}`)
  console.log('   下一步：bun run portfolio:check')
}

main()
