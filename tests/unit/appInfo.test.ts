/*
檔案用途：驗證 appInfo 常數與作者個人網站連結設定。
所在層：tests/unit；針對共用靜態品牌與版本常數的單元測試。
主要關聯：src/lib/appInfo.ts、LoginScreen、PrivacyPage 與 TermsPage。
*/
import { describe, expect, test } from 'bun:test'

// 在單元測試環境模擬 Vite 在建置時期注入的全域變數
if (typeof (globalThis as any).__APP_VERSION__ === 'undefined') {
  ;(globalThis as any).__APP_VERSION__ = '1.1.1'
  ;(globalThis as any).__APP_RELEASE_DATE__ = '2026-08-13'
  ;(globalThis as any).__APP_GIT_SHA__ = 'test-sha'
  ;(globalThis as any).__APP_ENVIRONMENT__ = 'test'
  ;(globalThis as any).__APP_BUILD_TIME__ = '2026-08-13T00:00:00.000Z'
}

const { APP_AUTHOR_URL, APP_CANONICAL_URL, APP_GITHUB_RELEASES_URL, APP_DOCUMENT_TITLE, APP_HEADER_TITLE, APP_HOME_SCREEN_TITLE, APP_SUBTITLE } = await import('../../src/lib/appInfo')

describe('appInfo links and constants', () => {
  test('exports correct author personal website URL', () => {
    // 確保聯絡我連結指向作者個人首頁，供登入頁與條款頁統一使用
    expect(APP_AUTHOR_URL).toBe('https://portfolio-author.github.io/')
  })

  test('exports canonical URLs properly', () => {
    expect(APP_CANONICAL_URL).toBe('https://demo.careapp.local/')
    expect(APP_GITHUB_RELEASES_URL).toBe('https://github.com/portfolio-author/jia-jian-log/releases')
  })

  test('keeps visible subtitle and document title bilingual', () => {
    expect(APP_SUBTITLE).toMatchObject({ id: 'Catatan Kesehatan Keluarga', zh: '家庭健康紀錄', en: 'Family Health Record' })
    expect(APP_DOCUMENT_TITLE.id).toContain('JiaJian Log')
    expect(APP_DOCUMENT_TITLE.id).toContain('Catatan Kesehatan Keluarga')
    expect(APP_DOCUMENT_TITLE.zh).toContain('家健錄 JiaJian Log')
    expect(APP_DOCUMENT_TITLE.zh).toContain('家庭健康紀錄')
  })

  test('keeps the home-screen shortcut title short and bilingual with exact casing', () => {
    // iOS「加入主畫面」讀 apple-mobile-web-app-title；文字必須短且大小寫固定，才不會被系統截斷成看不出語系差異的字串。
    expect(APP_HOME_SCREEN_TITLE).toEqual({ id: 'Family Health Note', zh: '家健錄' ,en: "Family Health Note" })
  })

  test('keeps the public brand header labels bilingual', () => {
    // 公開登入與 WebView 標頭共用這組常數，避免其中一個入口退回單一語言品牌。
    expect(APP_HEADER_TITLE).toMatchObject({ id: 'JiaJian Log', zh: '家健錄 JiaJian Log', en: expect.any(String) })
    expect(APP_SUBTITLE).toMatchObject({ id: 'Catatan Kesehatan Keluarga', zh: '家庭健康紀錄', en: 'Family Health Record' })
  })
})
