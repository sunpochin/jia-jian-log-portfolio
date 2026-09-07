/*
檔案用途：驗證分享預覽卡（LINE／Facebook／Slack）文案與網址常數的雙語與格式正確性。
所在層：tests/unit；針對 src/lib/shareMeta.ts 與 vite.config.ts 建置期插入 index.html 使用的靜態常數。
主要關聯：src/lib/shareMeta.ts、src/lib/canonicalUrl.ts、index.html 的 shareMetaPlugin 插入點。
*/
import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { APP_CANONICAL_URL } from '../../src/lib/canonicalUrl'
import {
  SHARE_HREFLANG_ALTERNATES,
  SHARE_PREVIEW_DESCRIPTION,
  SHARE_PREVIEW_IMAGE_ALT,
  SHARE_PREVIEW_IMAGE_HEIGHT,
  SHARE_PREVIEW_IMAGE_PATH,
  SHARE_PREVIEW_IMAGE_URL,
  SHARE_PREVIEW_IMAGE_WIDTH,
  SHARE_PREVIEW_TITLE,
} from '../../src/lib/shareMeta'

describe('shareMeta constants used to build index.html preview meta', () => {
  test('og:image stays self-hosted even though CSP also allows private care-photo signed URLs', () => {
    expect(SHARE_PREVIEW_IMAGE_URL).toBe('https://demo.careapp.local/og-image.png')
    expect(SHARE_PREVIEW_IMAGE_URL.startsWith(APP_CANONICAL_URL)).toBe(true)
    expect(SHARE_PREVIEW_IMAGE_PATH).not.toMatch(/^https?:\/\//)
  })

  test('preview image is sized 1200x630 for LINE/Facebook/Slack crawlers', () => {
    expect(SHARE_PREVIEW_IMAGE_WIDTH).toBe(1200)
    expect(SHARE_PREVIEW_IMAGE_HEIGHT).toBe(630)
  })

  test('title, description and image alt text are bilingual (zh + id)', () => {
    for (const text of [SHARE_PREVIEW_TITLE, SHARE_PREVIEW_DESCRIPTION, SHARE_PREVIEW_IMAGE_ALT]) {
      expect(text).toMatch(/[一-鿿]/)
      expect(/[a-zA-Z]{4,}/.test(text)).toBe(true)
    }
  })

  test('preview copy never mentions a real patient name or raw vital numbers', () => {
    const forbidden = ['血壓值', 'mmHg', '李', '沈']
    for (const word of forbidden) {
      expect(SHARE_PREVIEW_TITLE).not.toContain(word)
      expect(SHARE_PREVIEW_DESCRIPTION).not.toContain(word)
    }
  })

  test('hreflang alternates cover zh-Hant, id and x-default, all self-referencing canonical URL', () => {
    const tags = SHARE_HREFLANG_ALTERNATES.map((entry) => entry.hreflang)
    expect(tags).toEqual(['zh-Hant', 'id', 'x-default'])
    for (const entry of SHARE_HREFLANG_ALTERNATES) {
      expect(entry.href).toBe(APP_CANONICAL_URL)
    }
  })

  test('index.html keeps the share-meta-placeholder marker that vite.config.ts replaces at build time', () => {
    // 這個標記若被誤刪，shareMetaPlugin 的 html.replace 會直接沒有作用，
    // 建置出的 index.html 就會悄悄回到沒有任何分享預覽卡 meta 的狀態。
    const indexHtml = readFileSync(join(import.meta.dir, '../../index.html'), 'utf-8')
    expect(indexHtml).toContain('<!--share-meta-placeholder-->')
  })
})
