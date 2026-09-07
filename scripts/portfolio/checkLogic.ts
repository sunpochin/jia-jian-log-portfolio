/*
檔案用途：PORTFOLIO-01 的 portfolio:check 純邏輯（禁字設定驗證、硬拒絕檔名判斷、
regex 跳脫變體），從 check.ts 抽出來讓 tests/unit/portfolioCheckLogic.test.ts 能直接
測試，不必觸碰檔案系統或 process.exit。
所在層：scripts/portfolio；不執行任何 I/O，是 check.ts 的邏輯依賴。
主要關聯：scripts/portfolio/check.ts、docs/operations/portfolio-pipeline.md 第 3.3、3.4 節。
*/

export type ForbiddenCategory = 'emails' | 'emailLocalParts' | 'namesAndTitles' | 'supabaseProjectRefs' | 'domains' | 'other'
export const FORBIDDEN_CATEGORIES: ForbiddenCategory[] = ['emails', 'emailLocalParts', 'namesAndTitles', 'supabaseProjectRefs', 'domains', 'other']

export type ForbiddenEntry = { value: string; category: ForbiddenCategory }

export function flattenCategories(raw: Record<string, unknown>): ForbiddenEntry[] {
  const entries: ForbiddenEntry[] = []
  for (const category of FORBIDDEN_CATEGORIES) {
    const list = raw[category]
    if (!Array.isArray(list)) continue
    for (const value of list) if (typeof value === 'string' && value.length > 0) entries.push({ value, category })
  }
  return entries
}

export type ForbiddenValidationResult =
  | { ok: true; minEntries: number; entries: ForbiddenEntry[] }
  | { ok: false; reason: string }

// 為什麼一定要有這份私有設定才能 check：禁字清單本身就是「哪些字串是真實個資」的定義，
// 沒有它就無從判斷輸出乾不乾淨——所以缺失、格式錯誤或條目不足時一律視為失敗，不當作
// 「這次沒東西要掃」略過。同時比對範本裡的字面佔位字串，擋住「複製範本後湊數量但沒真的
// 換成自己資料」這種更隱蔽的繞過方式（見 docs/operations/portfolio-pipeline.md 3.3 節）。
export function validateForbiddenConfig(raw: Record<string, unknown>, exampleRaw: Record<string, unknown> | null): ForbiddenValidationResult {
  const minEntries = raw.minEntries
  // 為什麼要求正整數：minEntries 是 0 或負數時，`entries.length < minEntries` 對空清單
  // 永遠是 false，等於一份完全沒填的禁字設定也會「通過」門檻檢查——直接破壞 fail-closed
  // 的設計初衷（Codex review 在 PR #584 抓到這個邊界情況）。
  if (typeof minEntries !== 'number' || !Number.isInteger(minEntries) || minEntries <= 0) {
    return { ok: false, reason: 'forbidden.local.json 的 minEntries 必須是正整數。' }
  }

  const entries = flattenCategories(raw)
  if (entries.length < minEntries) {
    return { ok: false, reason: `禁字清單只有 ${entries.length} 條，低於 minEntries=${minEntries}。這通常代表範本被複製後沒有填入真實內容，直接視為設定不完整。` }
  }

  if (exampleRaw) {
    const exampleValues = new Set(flattenCategories(exampleRaw).map(entry => entry.value))
    const untouched = entries.filter(entry => exampleValues.has(entry.value))
    if (untouched.length > 0) {
      return {
        ok: false,
        reason: `${untouched.length} 條禁字設定跟範本的字面佔位字串完全相同。這代表範本被複製後至少有一條沒有真的換成自己的資料，條目數再多也不算完成設定。`,
      }
    }
  }

  return { ok: true, minEntries, entries }
}

// 有些程式碼把網域／字串包在 regex 常值裡（例如 /https:\/\/real-app\.vercel\.app\//），
// `.` 和 `/` 會被跳脫成 `\.`、`\/`——純文字比對找不到跳脫過的寫法，兩種都要比對才算真的掃過。
export function regexEscapedVariant(value: string): string {
  return value.replace(/[./]/g, '\\$&')
}

// 硬性拒絕的檔案類型：不管禁字清單掃不掃得到，這幾類東西本來就不該出現在輸出目錄裡
// （呼應 2026-07-04 CSV 洩漏事故；.git/ 則是「絕不能繼承私有歷史」的最後一道防線）。
// relPath 一律用 `/` 分隔（呼叫端負責正規化），跟平台無關。
export function isHardRejectedPath(relPath: string): boolean {
  if (relPath.split('/').includes('.git')) return true
  if (/\.csv$/i.test(relPath)) return true
  if (/\.sql$/i.test(relPath)) return true
  // 為什麼用檔名而不是「找最後一段沒有點的字尾」：原本的 regex 只擋得住 `.env.xxx`
  // （xxx 不含點），像 `.env.production.local` 這種多重字尾就漏網（Codex review 在
  // PR #584 抓到）。改成直接比對檔名：只有精確等於 `.env` 或以 `.env.` 開頭且不是
  // `.env.example` 才拒絕，`.env.production.local`、`.env.staging` 都會被擋下來。
  const basename = relPath.split('/').pop() ?? relPath
  if (basename === '.env' || (basename.startsWith('.env.') && basename !== '.env.example')) return true
  return false
}

// 為什麼用「已知二進位副檔名」的 denylist，而不是「已知文字副檔名」的 allowlist：
// allowlist 版本原本漏掉 `.env.example`（`path.lastIndexOf('.')` 抓到的是最後一個點，
// 也就是 `.example`，不在文字副檔名清單裡，導致這個明確要求要掃描的檔案內容完全沒被
// 掃過——即使 Docker 不可用，這個漏洞仍會讓帶著真實個資的 .env.example 通過檢查。
// Codex review 在 PR #584 抓到這個問題，一併點出 `.env.production.local` 這種多重
// 字尾也會被 allowlist 版本誤判成非文字檔）。反過來用 denylist：只有明確已知的二進位
// 格式才不掃內容，其餘一律當文字掃——多掃一點二進位檔案只是浪費一點時間，
// 少掃一個該掃的文字檔才是真正的安全漏洞。
const BINARY_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.ico', '.webp', '.woff', '.woff2', '.ttf', '.eot', '.pdf', '.zip'])

export function isTextFile(path: string): boolean {
  const lastDot = path.lastIndexOf('.')
  const ext = lastDot === -1 ? '' : path.slice(lastDot).toLowerCase()
  return !BINARY_EXTENSIONS.has(ext)
}

// 這幾個目錄一律不遞迴掃描：都是輸出目錄裡「不屬於要公開的內容」的副產物，不是 allowlist
// 複製過去的東西——node_modules／dist 是 check.ts 自己執行 bun install／bun run build 這兩步
// 的副作用（且已經在 build.ts 產生的 .gitignore 裡排除，永遠不會被 push），.git 是 release.ts
// 建立新歷史後才會出現。真實踩過的坑：release.ts 重新呼叫 check.ts 時，上一輪 check.ts 留下的
// node_modules 還在，裡面第三方套件原始碼的變數名稱（例如 `icaregiverngDeclaration` 剛好包含
// `caregiver` 這幾個字母）跟禁字清單的 emailLocalParts 巧合命中，擋下了完全無關的內容。
const SCAN_EXCLUDED_DIRS = new Set(['node_modules', 'dist', '.git'])

export function isExcludedScanDir(dirName: string): boolean {
  return SCAN_EXCLUDED_DIRS.has(dirName)
}

// 對單一檔案（路徑 + 內容，內容為 null 代表二進位／不掃內容）比對禁字清單，
// 命中就回傳類別，否則回傳 null；呼叫端只需要知道「有沒有中、中在哪一類」。
//
// 為什麼一定要用小寫比對：真實案例是同一個 email 在不同測試檔案裡被打成不同大小寫
// （'admin@careapp.local' vs 'admin@careapp.local'），原本的大小寫敏感 .includes()
// 完全放過了後者——build.ts 的替換規則也只設了小寫版本，於是這個真實 email 的
// 混合大小寫寫法就這樣通過禁字掃描，差點被公開發布。這個掃描的目的是「這個識別字串
// 不能以任何大小寫形式出現」，不是「必須逐字精確比對」，所以統一轉小寫才是正確語意。
export function findForbiddenHit(relPath: string, content: string | null, entries: ForbiddenEntry[]): ForbiddenCategory | null {
  const haystacks = (content === null ? [relPath] : [relPath, content]).map(h => h.toLowerCase())
  for (const { value, category } of entries) {
    const escaped = regexEscapedVariant(value)
    const variants = [value.toLowerCase(), ...(escaped === value ? [] : [escaped.toLowerCase()])]
    if (variants.some(variant => haystacks.some(haystack => haystack.includes(variant)))) return category
  }
  return null
}
