/*
檔案用途：鎖住 /privacy 與健康資料告知頁的「唯讀分享連結」段落，逐項涵蓋 #424 要求的揭露內容且三語齊全。
所在層：tests/unit；純資料檢查加兩頁的靜態掛載檢查。
主要關聯：src/features/system-admin/sharePrivacyNotice.ts、PrivacyPage.tsx、HealthDataNoticePage.tsx、
  docs/product/share-link-stage0-self-assessment.md §4 第 1 項（風險 R2、R6）。
*/
import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { joinSharePrivacyItems, SHARE_LINK_PRIVACY_ITEMS } from '../../src/features/system-admin/sharePrivacyNotice'

const all = (locale: 'zh' | 'id' | 'en') => joinSharePrivacyItems(locale)

describe('share link privacy notice', () => {
  test('every item has non-empty zh, id and en text', () => {
    for (const item of SHARE_LINK_PRIVACY_ITEMS) {
      for (const locale of ['zh', 'id', 'en'] as const) {
        expect(item.label[locale].trim().length).toBeGreaterThan(0)
        expect(item.body[locale].trim().length).toBeGreaterThan(0)
      }
    }
  })

  test('covers controller, purpose, fields, expiry, recipients abroad, providers and review status', () => {
    const zh = all('zh')
    expect(zh).toContain('個人開發者 portfolio-author')
    expect(zh).toContain('讓家人與醫師了解照護對象的照護狀況')
    expect(zh).toContain('對方打開連結當天（台灣時間）最新一筆血壓')
    expect(zh).toContain('連結有效期間每天更新')
    expect(zh).toContain('近 14 天的血壓讀數')
    expect(zh).toContain('完整藥單')
    expect(zh).toContain('預設 24 小時，最長 7 天')
    expect(zh).toContain('接收者由分享者自行選擇，可能在台灣以外')
    expect(zh).toContain('Supabase')
    expect(zh).toContain('Vercel')
    expect(zh).toContain('資料可能在台灣以外的地區處理')
    expect(zh).toContain('未經律師或個資專責人員審閱')

    const en = all('en')
    expect(en).toContain('individual developer portfolio-author')
    expect(en).toContain('family members and doctors understand')
    expect(en).toContain('24 hours by default, 7 days at most')
    expect(en).toContain('may be outside Taiwan')
    expect(en).toContain('Supabase')
    expect(en).toContain('Vercel')
    expect(en).toContain('processed outside Taiwan')
    expect(en).toContain('has not been reviewed by a lawyer or a data-protection specialist')

    const id = all('id')
    expect(id).toContain('Pengembang perorangan portfolio-author')
    expect(id).toContain('di luar Taiwan')
    expect(id).toContain('Supabase')
    expect(id).toContain('Vercel')
    expect(id).toContain('belum ditinjau oleh pengacara')
  })

  test('the privacy-update screen every existing user sees after the bump describes share links in all three locales', () => {
    // 2026-09-25 升版會讓所有既有使用者看到這個畫面；摘要若還停在上一版（分析事件）就等於沒告知這次改了什麼。
    const screen = readFileSync(new URL('../../src/features/care-family/components/PrivacyPolicyUpdateScreen.tsx', import.meta.url), 'utf8')
    expect(screen).toContain('唯讀分享連結')
    expect(screen).toContain('tautan berbagi baca-saja')
    expect(screen).toContain('read-only share links')
    expect(screen).not.toContain('不會送出身分資料或健康數值')
  })

  test('both public notices render the shared section', () => {
    const privacyPage = readFileSync(new URL('../../src/features/system-admin/pages/PrivacyPage.tsx', import.meta.url), 'utf8')
    const noticePage = readFileSync(new URL('../../src/features/system-admin/pages/HealthDataNoticePage.tsx', import.meta.url), 'utf8')
    expect(privacyPage).toContain('<ShareLinkPrivacySection />')
    expect(privacyPage).toContain('SHARE_LINK_PRIVACY_ITEMS.map')
    expect(noticePage).toContain('joinSharePrivacyItems(locale)')
  })
})
