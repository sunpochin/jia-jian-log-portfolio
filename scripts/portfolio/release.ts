/*
檔案用途：PORTFOLIO-01 產線的第三步、也是唯一會碰 GitHub 的一步——把已通過 portfolio:check
的輸出目錄初始化成一個全新的 Git 歷史，push 到公開 repo。所在層：scripts/portfolio，由
package.json 的 `portfolio:release` 呼叫。這是整條產線風險最高的一步（一旦 push 出去，
即使事後刪除，也可能已經有人 clone／快取過），所以每一步都刻意加防呆而不是求方便。
主要關聯：docs/operations/portfolio-pipeline.md 第 1.2 第 6、7 點、第 4 節、第 7 節。
*/
import { existsSync } from 'node:fs'
import { join } from 'node:path'

const REPO_ROOT = process.cwd()
const OUTPUT_DIR = join(REPO_ROOT, 'tmp', 'jia-jian-log-portfolio')

function parseArgs(argv: string[]): { remote: string | null; yes: boolean } {
  const remoteIndex = argv.indexOf('--remote')
  const remote = remoteIndex >= 0 ? argv[remoteIndex + 1] ?? null : null
  return { remote, yes: argv.includes('--yes') }
}

// GitHub remote URL 有 https 與 ssh 兩種寫法，且可能帶或不帶 `.git`；統一抽出
// `owner/repo` 小寫字串才能可靠比較，不能直接比對原始字串。
function extractOwnerRepo(url: string): string | null {
  const match = url.match(/github\.com[:/]([^/\s]+\/[^/\s]+?)(?:\.git)?$/i)
  return match ? match[1].toLowerCase() : null
}

async function run(command: string, args: string[], cwd: string): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const proc = Bun.spawn([command, ...args], { cwd, stdout: 'pipe', stderr: 'pipe' })
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ])
  return { exitCode, stdout, stderr }
}

// 為什麼一定要在「私有 repo」這一側檢查，而不是只檢查輸出目錄：真正的地雷是有人已經在
// 私有 repo 裡執行過 `git remote add public <公開 repo url>`，之後不小心在私有 repo
// 根目錄跑了 `git push public`，一次把全部 376 commits 的私有歷史送上公開 repo。
// 輸出目錄本身「沒有 .git」（build.ts 已斷言）擋不住這個情境，因為問題出在私有 repo 那邊，
// 不是輸出目錄。
async function assertPrivateRepoHasNoRemoteToPublicRepo(remoteUrl: string): Promise<void> {
  const targetOwnerRepo = extractOwnerRepo(remoteUrl)
  const { exitCode, stdout } = await run('git', ['remote', '-v'], REPO_ROOT)
  if (exitCode !== 0) {
    console.error('❌ PORTFOLIO RELEASE FAILED: 無法讀取私有 repo 的 git remote 清單。')
    process.exit(1)
  }
  if (!targetOwnerRepo) return // 不是 github.com 網址（例如本機測試用的 file:// 路徑）就略過這項比對

  for (const line of stdout.split('\n')) {
    const url = line.split(/\s+/)[1]
    if (!url) continue
    if (extractOwnerRepo(url) === targetOwnerRepo) {
      console.error('❌ PORTFOLIO RELEASE FAILED: 私有 repo 的 git remote 清單裡已經有指向公開 repo 的設定：')
      console.error(`   ${line.trim()}`)
      console.error('   這正是「不小心在私有 repo 根目錄 push 全部歷史」的地雷，必須移除這個 remote 才能繼續。')
      process.exit(1)
    }
  }
}

async function runPortfolioCheck(): Promise<void> {
  console.log('→ 重新執行 portfolio:check（不相信呼叫端已經跑過）')
  const proc = Bun.spawn(['bun', 'run', 'scripts/portfolio/check.ts'], { cwd: REPO_ROOT, stdout: 'inherit', stderr: 'inherit' })
  const exitCode = await proc.exited
  if (exitCode !== 0) {
    console.error('❌ PORTFOLIO RELEASE FAILED: portfolio:check 沒有通過，不會執行任何 git 操作。')
    process.exit(1)
  }
}

async function initCommitAndPush(remoteUrl: string): Promise<void> {
  const initSteps: [string, string[]][] = [
    ['git', ['init', '-q']],
    ['git', ['remote', 'add', 'origin', remoteUrl]],
  ]
  for (const [command, args] of initSteps) {
    const { exitCode, stderr } = await run(command, args, OUTPUT_DIR)
    if (exitCode !== 0) {
      console.error(`❌ PORTFOLIO RELEASE FAILED: \`${command} ${args.join(' ')}\` 失敗。`)
      console.error(stderr.trim())
      process.exit(1)
    }
  }

  // 繁體中文註解：嘗試取得遠端 main 分支狀態。若遠端已有既有發布歷史（例如已存在初始 commit），
  // 透過 mixed reset 錨定到遠端最新 commit 並保留當前工作目錄產出，產生乾淨的線性更新 commit，
  // 讓 git push 能直接 fast-forward，無須使用危險的 --force。
  console.log(`→ 檢查遠端分支狀態：${remoteUrl}`)
  const fetchRes = await run('git', ['fetch', 'origin', 'main', '-q'], OUTPUT_DIR)
  if (fetchRes.exitCode === 0) {
    console.log('✓ 遠端已有 main 分支，基於現有歷史建立更新 commit')
    await run('git', ['reset', '--mixed', 'origin/main'], OUTPUT_DIR)
  } else {
    console.log('✓ 遠端為全新倉庫，建立初始 main 分支')
    await run('git', ['checkout', '-q', '-b', 'main'], OUTPUT_DIR)
  }

  const addRes = await run('git', ['add', '-A'], OUTPUT_DIR)
  if (addRes.exitCode !== 0) {
    console.error('❌ git add 失敗：', addRes.stderr)
    process.exit(1)
  }

  const diffRes = await run('git', ['diff', '--cached', '--quiet'], OUTPUT_DIR)
  if (diffRes.exitCode === 0) {
    console.log('✓ 快照內容與遠端 main 完全一致，無須新增 commit。')
    return
  }

  const commitMsg = fetchRes.exitCode === 0
    ? 'chore: update sanitized portfolio snapshot'
    : 'chore: sanitized portfolio snapshot'
  const commitRes = await run('git', ['commit', '-q', '-m', commitMsg], OUTPUT_DIR)
  if (commitRes.exitCode !== 0) {
    console.error('❌ git commit 失敗：', commitRes.stderr)
    process.exit(1)
  }

  console.log(`→ git push -u origin main（目標：${remoteUrl}）`)
  // 刻意不加 --force：透過上面的 reset --mixed 形成線性 fast-forward 歷史；
  // 如果失敗，直接停下來讓 owner 判斷，絕不用 --force 覆蓋既有內容。
  const proc = Bun.spawn(['git', 'push', '-u', 'origin', 'main'], { cwd: OUTPUT_DIR, stdout: 'inherit', stderr: 'inherit' })
  const exitCode = await proc.exited
  if (exitCode !== 0) {
    console.error('❌ PORTFOLIO RELEASE FAILED: git push 失敗（詳見上方輸出）。')
    console.error('   常見原因：沒有 push 權限、或網路問題。')
    console.error('   不會自動改用 --force；請自行確認目標 repo 狀態後再重跑。')
    process.exit(1)
  }
}

async function main() {
  const { remote, yes } = parseArgs(Bun.argv.slice(2))

  if (!remote) {
    console.error('用法：bun run portfolio:release -- --remote <公開 repo 的 git url> --yes')
    console.error('例如：bun run portfolio:release -- --remote https://github.com/portfolio-author/jia-jian-log-portfolio.git --yes')
    process.exit(1)
  }

  if (!existsSync(OUTPUT_DIR)) {
    console.error(`❌ PORTFOLIO RELEASE FAILED: 找不到輸出目錄 ${OUTPUT_DIR}。請先執行 bun run portfolio:build。`)
    process.exit(1)
  }

  await assertPrivateRepoHasNoRemoteToPublicRepo(remote)
  await runPortfolioCheck()

  if (!yes) {
    console.log('這是 dry run（沒有加 --yes）。以上檢查全部通過，實際執行會：')
    console.log(`  1. 在 ${OUTPUT_DIR} 建立全新的 git 歷史（單一 commit）`)
    console.log(`  2. git push 到 ${remote}`)
    console.log('確認無誤後，在指令最後加上 --yes 才會真的執行。')
    return
  }

  await initCommitAndPush(remote)
  console.log(`✅ portfolio:release 完成，已 push 到 ${remote}`)
  console.log('   下一步：到公開 repo 確認它自己的 CI（portfolio-ci.yml）綠燈，並人工瀏覽一次內容。')
}

main()
