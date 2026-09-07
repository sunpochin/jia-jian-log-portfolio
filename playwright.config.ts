// 檔案用途：定義 Playwright 端對端測試、瀏覽器與自動啟動的 Vite 伺服器。
// 所在層：repository root 的測試設定；主要關聯為 tests/*.spec.ts 與 vite.config.ts。

import { closeSync, mkdirSync, openSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { createConnection } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { defineConfig, devices } from '@playwright/test'

const DEFAULT_PORT = 5100
const MAX_PORT = 65535
// ponytail: 測試啟動數低，共用一個暫存 lock 目錄就足夠，不另養 allocator daemon。
const PORT_LOCK_DIR = join(tmpdir(), 'jia-jian-log-playwright-ports')

type PortLease = {
  lockPath: string
  port: number
}

type LeaseCandidate = {
  lockPath: string
  reused: boolean
}

type LeaseRecord = {
  cwd?: unknown
  pid?: unknown
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    // EPERM 代表程序仍存在但目前無法檢查；只有 ESRCH 才能安全視為已結束。
    return (error as NodeJS.ErrnoException).code !== 'ESRCH'
  }
}

function readLeaseRecord(lockPath: string): LeaseRecord | undefined {
  try {
    return JSON.parse(readFileSync(lockPath, 'utf8')) as LeaseRecord
  } catch {
    // 損壞或不完整的 lock 不代表有活躍測試，讓後續流程回收它即可。
    return undefined
  }
}

function tryLeasePort(port: number): LeaseCandidate | undefined {
  const lockPath = join(PORT_LOCK_DIR, `${port}.lock`)

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      // wx 是原子建立；平行 worktree 會競爭同一個檔案，但只會有一個拿到該 port。
      const descriptor = openSync(lockPath, 'wx')
      try {
        writeFileSync(descriptor, JSON.stringify({ cwd: process.cwd(), pid: process.pid }), 'utf8')
      } finally {
        closeSync(descriptor)
      }
      return { lockPath, reused: false }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
      const existingLease = readLeaseRecord(lockPath)
      const ownerIsAlive = typeof existingLease?.pid === 'number' && isProcessAlive(existingLease.pid)
      if (ownerIsAlive && existingLease?.cwd === process.cwd()) {
        // Playwright 會在 runner／worker 間重載設定；同一 worktree 必須沿用主程序的 port。
        return { lockPath, reused: true }
      }
      if (ownerIsAlive) return undefined

      // 只回收已結束程序留下的 lock；ENOENT 表示另一個競爭者已先處理，重試即可。
      try {
        unlinkSync(lockPath)
      } catch (unlinkError) {
        if ((unlinkError as NodeJS.ErrnoException).code !== 'ENOENT') throw unlinkError
      }
    }
  }

  return undefined
}

function canConnect(port: number, host: string): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = createConnection({ host, port })
    const finish = (available: boolean) => {
      socket.destroy()
      resolve(available)
    }
    socket.once('connect', () => finish(false))
    // ECONNREFUSED／未建立連線代表目前沒有 server；真正的 listener 會觸發 connect。
    socket.once('error', () => finish(true))
    socket.setTimeout(250, () => finish(true))
  })
}

async function isPortAvailable(port: number): Promise<boolean> {
  // localhost 可能優先解析到 IPv6；兩個 loopback 都檢查才能避免漏掉另一側的 Vite server。
  return (await canConnect(port, '127.0.0.1')) && (await canConnect(port, '::1'))
}

function releasePortLease(lease: PortLease): void {
  try {
    unlinkSync(lease.lockPath)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
}

function parseConfiguredPort(value: string | undefined): number | undefined {
  if (!value?.trim()) return undefined

  const port = Number(value)
  if (!Number.isInteger(port) || port < 1024 || port > MAX_PORT) {
    throw new Error(`PLAYWRIGHT_PORT must be an integer between 1024 and ${MAX_PORT}`)
  }
  return port
}

async function acquirePortLease(): Promise<PortLease> {
  mkdirSync(PORT_LOCK_DIR, { recursive: true })

  const configuredPort = parseConfiguredPort(process.env.PLAYWRIGHT_PORT)
  const firstPort = configuredPort ?? DEFAULT_PORT
  const lastPort = configuredPort ?? MAX_PORT

  for (let port = firstPort; port <= lastPort; port += 1) {
    const candidate = tryLeasePort(port)
    if (!candidate) continue
    if (candidate.reused) return { lockPath: candidate.lockPath, port }

    if (await isPortAvailable(port)) {
      return { lockPath: candidate.lockPath, port }
    }

    releasePortLease({ lockPath: candidate.lockPath, port })
    if (configuredPort !== undefined) {
      throw new Error(`PLAYWRIGHT_PORT=${configuredPort} is already in use`)
    }
  }

  throw new Error('No available Playwright port could be leased')
}

// 以原子 lock 協調所有 worktree，再檢查兩個 loopback 的連線；撞號時會改拿下一個可用 port。
const portLease = await acquirePortLease()
const port = portLease.port
const baseURL = `http://localhost:${port}`

// Auto-starts `bun run dev` and waits for it before running tests, then
// tears it down after. Keeps CI/local usage to a single `bunx playwright test`.
export default defineConfig({
  testDir: './tests',
  // Bun 單元測試也放在 tests/；只跑 spec 才不會讓 Node 誤載 `bun:test` 而使 E2E 在啟動前失敗。
  testMatch: '**/*.spec.ts',
  fullyParallel: true,
  reporter: 'list',
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  webServer: {
    command: 'bun run dev',
    port,
    // 測試必須使用自己啟動的伺服器，不能因 5100 已被其他 worktree 佔用就誤測舊版本。
    reuseExistingServer: false,
    env: { PORT: String(port) },
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
})
