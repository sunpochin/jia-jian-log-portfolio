/*
檔案用途：PORTFOLIO-01 產線的第二步——對 portfolio:build 產生的輸出目錄做 fail-closed 驗證：
禁字掃描、危險副檔名硬拒絕、通用 secret pattern 掃描（best-effort），以及完整的
install／lint／typecheck／test／build。任一項失敗都直接 exit 1，不給「大致上沒問題」的模糊結果。
所在層：scripts/portfolio，由 package.json 的 `portfolio:check` 呼叫，只讀寫輸出目錄，不觸碰 GitHub。
純判斷邏輯在 checkLogic.ts（供 tests/unit/portfolioCheckLogic.test.ts 測試）；這裡只做 I/O 與流程控制。
主要關聯：docs/operations/portfolio-pipeline.md 第 3.3、4 節；
scripts/portfolio/forbidden.local.json（私有、版控外，見 forbidden.local.json.example）。
*/
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

import { findForbiddenHit, isExcludedScanDir, isHardRejectedPath, isTextFile, validateForbiddenConfig, type ForbiddenCategory, type ForbiddenEntry } from './checkLogic'

const REPO_ROOT = process.cwd()
const OUTPUT_DIR = join(REPO_ROOT, 'tmp', 'jia-jian-log-portfolio')
const FORBIDDEN_PATH = join(REPO_ROOT, 'scripts', 'portfolio', 'forbidden.local.json')
const FORBIDDEN_EXAMPLE_PATH = join(REPO_ROOT, 'scripts', 'portfolio', 'forbidden.local.json.example')

// 這個 process（`bun run portfolio:check`）是在私有 repo 根目錄啟動的，Bun 會自動把根目錄的
// .env／.env.local（含真實 Supabase／Google 等金鑰）載進 process.env。Bun.spawn 預設會讓子行程
// 繼承整個 process.env——即使子行程的 cwd 是「乾淨」的 tmp/jia-jian-log-portfolio，真實金鑰仍會
// 透過環境變數繼承漏進 bun install／lint／tsc／test／build 這幾步，導致 build 出的 dist/ 內嵌真實
// Client ID，也讓「應該讀不到真實值」的測試（如 googleIdentity.test.ts）因為汙染而產生不可預期的結果。
// 跟 allowlist.ts 同樣的 fail-closed 精神：只明確放行子行程真正需要的系統變數，其餘一律不繼承。
const SAFE_ENV_KEYS = ['PATH', 'HOME', 'SHELL', 'LANG', 'LC_ALL', 'TERM', 'TMPDIR', 'TZ', 'USER', 'LOGNAME']
function buildChildEnv(): Record<string, string> {
  const env: Record<string, string> = {}
  for (const key of SAFE_ENV_KEYS) {
    const value = process.env[key]
    if (value !== undefined) env[key] = value
  }
  return env
}

function toPosixRelative(from: string, to: string): string {
  return relative(from, to).split(sep).join('/')
}

function loadForbidden(): { minEntries: number; entries: ForbiddenEntry[] } {
  if (!existsSync(FORBIDDEN_PATH)) {
    console.error(`❌ PORTFOLIO SANITIZATION FAILED: 找不到 ${toPosixRelative(REPO_ROOT, FORBIDDEN_PATH)}`)
    console.error('   請複製 scripts/portfolio/forbidden.local.json.example 為 forbidden.local.json，並填入真實的禁字清單。')
    process.exit(1)
  }

  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(readFileSync(FORBIDDEN_PATH, 'utf8'))
  } catch (error) {
    console.error(`❌ PORTFOLIO SANITIZATION FAILED: ${toPosixRelative(REPO_ROOT, FORBIDDEN_PATH)} 不是合法 JSON。`)
    console.error(`   ${(error as Error).message}`)
    process.exit(1)
  }

  const exampleRaw = existsSync(FORBIDDEN_EXAMPLE_PATH) ? JSON.parse(readFileSync(FORBIDDEN_EXAMPLE_PATH, 'utf8')) : null
  const result = validateForbiddenConfig(parsed, exampleRaw)
  if (!result.ok) {
    console.error(`❌ PORTFOLIO SANITIZATION FAILED: ${result.reason}`)
    process.exit(1)
  }
  return result
}

function listFilesRecursive(dir: string): string[] {
  const entries = readdirSync(dir, { withFileTypes: true })
  const files: string[] = []
  for (const entry of entries) {
    if (entry.isDirectory() && isExcludedScanDir(entry.name)) continue
    const fullPath = join(dir, entry.name)
    if (entry.isDirectory()) files.push(...listFilesRecursive(fullPath))
    else files.push(fullPath)
  }
  return files
}

async function runStep(label: string, command: string, args: string[]): Promise<void> {
  console.log(`→ ${label}`)
  const proc = Bun.spawn([command, ...args], { cwd: OUTPUT_DIR, env: buildChildEnv(), stdout: 'inherit', stderr: 'inherit' })
  const exitCode = await proc.exited
  if (exitCode !== 0) {
    console.error(`❌ PORTFOLIO SANITIZATION FAILED: ${label} 失敗（exit ${exitCode}）。`)
    process.exit(1)
  }
}

// gitleaks 是通用 secret pattern 的補充掃描，不是這個 repo 個資風險的主要防線（那是上面的禁字清單）。
// 本機沒有 Docker daemon 時就印警告略過，不讓工具環境缺陷擋住核心的身分掃描結果；
// 但這代表 portfolio:release 前，仍必須等公開 repo 自己的 CI（也會跑 gitleaks）綠燈才算完成。
async function runGitleaksBestEffort(): Promise<void> {
  console.log('→ gitleaks（best-effort，需要本機 Docker）')
  try {
    const proc = Bun.spawn(
      ['docker', 'run', '--rm', '-v', `${OUTPUT_DIR}:/repo`, 'ghcr.io/gitleaks/gitleaks:v8.30.0', 'detect', '--source', '/repo', '--no-git'],
      { stdout: 'pipe', stderr: 'pipe' },
    )
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ])
    if (exitCode === 0) {
      console.log('  gitleaks：沒有發現 secret pattern。')
      return
    }
    // exit code 125 是 Docker 官方定義的「docker run 本身出錯」（daemon 沒起來、image 抓不到、
    // registry 拒絕存取等），跟容器裡 gitleaks 自己判定「找到 secret」（exit code 1）是兩回事。
    // 只信字串比對曾經漏接「image pull 被拒絕」（denied／unauthorized）這種情況，一律當成真的
    // 掃到 secret 而擋下發布——但那次根本沒掃到任何內容，是 Docker 連 image 都沒抓下來。
    if (exitCode === 125 || /permission denied|Cannot connect to the Docker daemon|no such file or directory/i.test(stderr)) {
      console.warn('  ⚠️ 本機沒有可用的 Docker（或無法取得 gitleaks image），略過 gitleaks 本機掃描。')
      console.warn(`     詳細錯誤：${stderr.trim().split('\n').slice(-3).join(' / ')}`)
      console.warn('     公開 repo 自己的 CI（scripts/portfolio/build.ts 產生的 portfolio-ci.yml）仍會跑 gitleaks，')
      console.warn('     portfolio:release 後務必等那個 CI 綠燈才算完成，不能只看這裡的 best-effort 結果。')
      return
    }
    console.error('❌ PORTFOLIO SANITIZATION FAILED: gitleaks 發現可能的 secret pattern。')
    console.error(stdout.trim() || stderr.trim())
    process.exit(1)
  } catch (error) {
    console.warn(`  ⚠️ 無法執行 gitleaks（${(error as Error).message}），略過本機掃描，理由同上。`)
  }
}

async function main() {
  if (!existsSync(OUTPUT_DIR)) {
    console.error(`❌ PORTFOLIO SANITIZATION FAILED: 找不到輸出目錄 ${toPosixRelative(REPO_ROOT, OUTPUT_DIR)}。`)
    console.error('   請先執行 bun run portfolio:build。')
    process.exit(1)
  }

  const forbidden = loadForbidden()
  const files = listFilesRecursive(OUTPUT_DIR).filter(path => statSync(path).isFile())
  const relPaths = files.map(path => toPosixRelative(OUTPUT_DIR, path))

  const hardRejected = relPaths.filter(isHardRejectedPath)
  if (hardRejected.length > 0) {
    console.error(`❌ PORTFOLIO SANITIZATION FAILED: 輸出目錄含有 ${hardRejected.length} 個不該存在的檔案：`)
    for (const file of hardRejected) console.error(`   - ${file}`)
    process.exit(1)
  }

  // 命中輸出只印檔案路徑與命中類別，不印命中的真實字串本身，避免掃描結果自己變成外洩管道。
  const forbiddenHits: { file: string; category: ForbiddenCategory }[] = []
  for (let i = 0; i < files.length; i++) {
    const content = isTextFile(files[i]) ? readFileSync(files[i], 'utf8') : null
    const hit = findForbiddenHit(relPaths[i], content, forbidden.entries)
    if (hit) forbiddenHits.push({ file: relPaths[i], category: hit })
  }
  if (forbiddenHits.length > 0) {
    console.error(`❌ PORTFOLIO SANITIZATION FAILED: 偵測到 ${forbiddenHits.length} 處禁字命中：`)
    for (const hit of forbiddenHits) console.error(`   - ${hit.file}（類別：${hit.category}）`)
    process.exit(1)
  }
  console.log(`✓ 禁字掃描：${files.length} 個檔案，無命中。`)

  await runStep('bun install --frozen-lockfile', 'bun', ['install', '--frozen-lockfile'])
  await runStep('bun run lint', 'bun', ['run', 'lint'])
  await runStep('npx tsc --noEmit', 'npx', ['tsc', '--noEmit'])
  await runStep('bun test tests/unit', 'bun', ['test', 'tests/unit'])
  await runStep('bun run build', 'bun', ['run', 'build'])
  await runGitleaksBestEffort()

  console.log('✅ portfolio:check 全部通過。下一步：owner 逐檔 review 輸出目錄，之後才能執行 bun run portfolio:release。')
}

main()
