/*
檔案用途：驗證 PORTFOLIO-01 portfolio:check 的純判斷邏輯——禁字設定 fail-closed 規則、
regex 跳脫變體比對、硬性拒絕檔名判斷。
所在層：tests/unit；不觸碰檔案系統，只測 scripts/portfolio/checkLogic.ts 的純函式。
主要關聯：scripts/portfolio/checkLogic.ts、scripts/portfolio/check.ts、
docs/operations/portfolio-pipeline.md 第 3.3、3.4 節。
*/
import { describe, expect, test } from 'bun:test'
import {
  findForbiddenHit,
  flattenCategories,
  isExcludedScanDir,
  isHardRejectedPath,
  isTextFile,
  regexEscapedVariant,
  validateForbiddenConfig,
} from '../../scripts/portfolio/checkLogic'

describe('validateForbiddenConfig', () => {
  test('rejects when minEntries is missing', () => {
    const result = validateForbiddenConfig({ emails: ['a@example.com'] }, null)
    expect(result.ok).toBe(false)
  })

  test('rejects when entry count is below minEntries', () => {
    const result = validateForbiddenConfig({ minEntries: 5, emails: ['a@example.com'] }, null)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toContain('低於 minEntries')
  })

  test('rejects minEntries of 0 even with an empty config (Codex PR #584 finding)', () => {
    const result = validateForbiddenConfig({ minEntries: 0 }, null)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toContain('正整數')
  })

  test('rejects a negative minEntries', () => {
    const result = validateForbiddenConfig({ minEntries: -1, emails: ['a@example.com'] }, null)
    expect(result.ok).toBe(false)
  })

  test('rejects a non-integer minEntries', () => {
    const result = validateForbiddenConfig({ minEntries: 1.5, emails: ['a@example.com'] }, null)
    expect(result.ok).toBe(false)
  })

  test('rejects when every entry is untouched from the example template', () => {
    const example = { minEntries: 1, emails: ['real.person@example.com'] }
    const config = { minEntries: 1, emails: ['real.person@example.com'] }
    const result = validateForbiddenConfig(config, example)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toContain('範本的字面佔位字串完全相同')
  })

  test('accepts real-looking config that differs from the example and meets minEntries', () => {
    const example = { minEntries: 1, emails: ['real.person@example.com'] }
    const config = { minEntries: 2, emails: ['someone@real-domain.example'], domains: ['real-app.example'] }
    const result = validateForbiddenConfig(config, example)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.entries).toHaveLength(2)
  })

  test('works with no example file available (null)', () => {
    const result = validateForbiddenConfig({ minEntries: 1, other: ['x'] }, null)
    expect(result.ok).toBe(true)
  })
})

describe('flattenCategories', () => {
  test('ignores unknown keys and non-array values', () => {
    const entries = flattenCategories({ emails: ['a@example.com'], unknownField: ['ignored'], domains: 'not-an-array' })
    expect(entries).toEqual([{ value: 'a@example.com', category: 'emails' }])
  })

  test('skips empty strings', () => {
    const entries = flattenCategories({ other: ['', 'kept'] })
    expect(entries).toEqual([{ value: 'kept', category: 'other' }])
  })
})

describe('regexEscapedVariant', () => {
  test('escapes dots and slashes the way JS regex literals do', () => {
    expect(regexEscapedVariant('real-app.vercel.app')).toBe('real-app\\.vercel\\.app')
    expect(regexEscapedVariant('https://real-app.vercel.app/')).toBe('https:\\/\\/real-app\\.vercel\\.app\\/')
  })

  test('leaves strings without dots or slashes unchanged', () => {
    expect(regexEscapedVariant('ADMIN_EMAIL')).toBe('ADMIN_EMAIL')
  })
})

describe('isHardRejectedPath', () => {
  test('rejects csv, sql, and .git paths', () => {
    expect(isHardRejectedPath('data/leak.csv')).toBe(true)
    expect(isHardRejectedPath('supabase/dump.sql')).toBe(true)
    expect(isHardRejectedPath('vendor/.git/HEAD')).toBe(true)
  })

  test('rejects real .env but allows .env.example', () => {
    expect(isHardRejectedPath('.env')).toBe(true)
    expect(isHardRejectedPath('.env.local')).toBe(true)
    expect(isHardRejectedPath('.env.example')).toBe(false)
  })

  test('rejects multi-suffix dotenv variants (Codex PR #584 finding)', () => {
    expect(isHardRejectedPath('.env.production.local')).toBe(true)
    expect(isHardRejectedPath('src/.env.production.local')).toBe(true)
    expect(isHardRejectedPath('.env.staging')).toBe(true)
  })

  test('allows ordinary source files', () => {
    expect(isHardRejectedPath('src/lib/auth.ts')).toBe(false)
    expect(isHardRejectedPath('README.md')).toBe(false)
  })
})

describe('isTextFile', () => {
  test('treats known text extensions as scannable', () => {
    expect(isTextFile('src/lib/auth.ts')).toBe(true)
    expect(isTextFile('docs/features/vitals.md')).toBe(true)
  })

  test('treats .env.example as scannable (Codex PR #584 finding: multi-dot filenames)', () => {
    expect(isTextFile('.env.example')).toBe(true)
    expect(isTextFile('.env.production.local')).toBe(true)
  })

  test('treats a lockfile with no extension as scannable', () => {
    expect(isTextFile('bun.lock')).toBe(true)
  })

  test('treats known binary extensions as non-text', () => {
    expect(isTextFile('public/og-image.png')).toBe(false)
    expect(isTextFile('public/pwa-512x512.png')).toBe(false)
  })
})

describe('findForbiddenHit', () => {
  const entries = [
    { value: 'real.person@example.com', category: 'emails' as const },
    { value: 'real-app.vercel.app', category: 'domains' as const },
  ]

  test('matches a plain literal occurrence in content', () => {
    expect(findForbiddenHit('src/lib/auth.ts', "const x = 'real.person@example.com'", entries)).toBe('emails')
  })

  test('matches a regex-escaped occurrence in content', () => {
    expect(findForbiddenHit('tests/unit/x.test.ts', '/https:\\/\\/real-app\\.vercel\\.app\\//', entries)).toBe('domains')
  })

  test('matches a hit in the file path itself', () => {
    expect(findForbiddenHit('supabase/functions/real-app.vercel.app-notes.ts', null, entries)).toBe('domains')
  })

  test('returns null when nothing matches', () => {
    expect(findForbiddenHit('src/lib/demoData.ts', 'demo.chen@example.test', entries)).toBeNull()
  })

  test('matches a case variant of a forbidden email (real near-miss: admin@careapp.local slipped past a lowercase-only entry)', () => {
    expect(findForbiddenHit('tests/unit/x.test.ts', "account_email: 'Real.Person@Example.com'", entries)).toBe('emails')
  })

  test('matches a case variant in the file path itself', () => {
    expect(findForbiddenHit('supabase/functions/REAL-APP.VERCEL.APP-notes.ts', null, entries)).toBe('domains')
  })
})

describe('isExcludedScanDir', () => {
  test('excludes node_modules, dist, and .git (real case: a stale node_modules from a prior check.ts run collided with an emailLocalParts entry inside third-party minified code)', () => {
    expect(isExcludedScanDir('node_modules')).toBe(true)
    expect(isExcludedScanDir('dist')).toBe(true)
    expect(isExcludedScanDir('.git')).toBe(true)
  })

  test('does not exclude ordinary output directories', () => {
    expect(isExcludedScanDir('src')).toBe(false)
    expect(isExcludedScanDir('docs')).toBe(false)
    expect(isExcludedScanDir('tests')).toBe(false)
  })
})
