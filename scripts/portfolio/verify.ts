/*
檔案用途：PORTFOLIO-01 產線的便利指令——把「清掉舊輸出目錄 → build → check」這三步日常重跑的動作
串成一個指令，避免每次修改 allowlist／replacements 設定後，owner 手動重跑忘記先 `rm -rf` 舊的
tmp/jia-jian-log-portfolio，導致殘留檔案干擾這次的結果（例如巢狀複製、舊測試殘留）。
所在層：scripts/portfolio，由 package.json 的 `portfolio:verify` 呼叫。只操作輸出目錄，不觸碰 GitHub、
不執行 git pull——是否要先同步最新程式碼，仍由 owner 自己決定並手動執行，不在此腳本自動代勞範圍內。
主要關聯：docs/operations/portfolio-pipeline.md 第 4、7 節；scripts/portfolio/build.ts、check.ts。
*/
import { rmSync } from 'node:fs'
import { join } from 'node:path'

const REPO_ROOT = process.cwd()
const OUTPUT_DIR = join(REPO_ROOT, 'tmp', 'jia-jian-log-portfolio')

async function runStep(label: string, args: string[]): Promise<void> {
  console.log(`\n=== ${label} ===`)
  const proc = Bun.spawn(['bun', ...args], { cwd: REPO_ROOT, stdout: 'inherit', stderr: 'inherit' })
  const exitCode = await proc.exited
  if (exitCode !== 0) {
    console.error(`❌ portfolio:verify 中止：${label} 失敗（exit ${exitCode}）。`)
    process.exit(1)
  }
}

async function main() {
  console.log(`→ 清除舊的輸出目錄：${OUTPUT_DIR}`)
  rmSync(OUTPUT_DIR, { recursive: true, force: true })

  await runStep('portfolio:build', ['run', 'scripts/portfolio/build.ts'])
  await runStep('portfolio:check', ['run', 'scripts/portfolio/check.ts'])

  console.log('\n✅ portfolio:verify 全部通過。下一步：owner 逐檔 review 輸出目錄，之後才能執行 bun run portfolio:release。')
}

main()
