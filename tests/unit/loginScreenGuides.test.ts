/*
檔案用途：驗證未登入公開首頁（LoginScreen）正確呈現顯眼的家庭邀請教學入口與全部指南連結。
所在層：tests/unit 測試層；以最小 hook 執行環境驗證渲染結果與雙語／三語文案。
主要關聯：src/components/auth/LoginScreen.tsx、/guides/family-invitations、/guides。
*/
import { describe, expect, test } from 'bun:test'
import { installReactHookHarness, renderHook } from './helpers/reactHookHarness'
import { findAll, textContent } from './helpers/elementTree'

if (typeof (globalThis as any).__APP_VERSION__ === 'undefined') {
  ;(globalThis as any).__APP_VERSION__ = '1.1.1'
  ;(globalThis as any).__APP_RELEASE_DATE__ = '2026-08-13'
  ;(globalThis as any).__APP_GIT_SHA__ = 'test-sha'
  ;(globalThis as any).__APP_ENVIRONMENT__ = 'test'
  ;(globalThis as any).__APP_BUILD_TIME__ = '2026-08-13T00:00:00.000Z'
}

const { LoginScreen } = await import('../../src/components/auth/LoginScreen')

installReactHookHarness()

describe('LoginScreen guides and family invitation entrance', () => {
  test('renders prominent family invitation guide entry pointing to /guides/family-invitations in Traditional Chinese', () => {
    const hook = renderHook(() => LoginScreen({ showDemo: false }), {
      defaultContext: { locale: 'zh' as const, setLocale: () => {} },
    })

    const links = findAll(hook.current, node => node.type === 'a')
    const familyInviteLink = links.find(link => link.props?.href === '/guides/family-invitations')

    expect(familyInviteLink).toBeDefined()
    const text = textContent(familyInviteLink)
    expect(text).toContain('如何邀請家人使用家健錄？')
    expect(text).toContain('操作教學')
    expect(text).toContain('搞懂本人與照護者邀請，分享連結與確認帳號')

    // 驗證同時存在通往全部指南頁的連結
    const allGuidesLink = links.find(link => link.props?.href === '/guides')
    expect(allGuidesLink).toBeDefined()
    expect(textContent(allGuidesLink)).toContain('全部指南')
  })

  test('renders localized family invitation guide entry in Indonesian', () => {
    const hook = renderHook(() => LoginScreen({ showDemo: false }), {
      defaultContext: { locale: 'id' as const, setLocale: () => {} },
    })

    const links = findAll(hook.current, node => node.type === 'a')
    const familyInviteLink = links.find(link => link.props?.href === '/guides/family-invitations')

    expect(familyInviteLink).toBeDefined()
    const text = textContent(familyInviteLink)
    expect(text).toContain('Cara Mengundang Keluarga')
    expect(text).toContain('Panduan')
    expect(text).toContain('Langkah mengundang pasien & pengasuh keluarga')

    const allGuidesLink = links.find(link => link.props?.href === '/guides')
    expect(allGuidesLink).toBeDefined()
    expect(textContent(allGuidesLink)).toContain('Semua')
  })

  test('renders localized family invitation guide entry in English', () => {
    const hook = renderHook(() => LoginScreen({ showDemo: false }), {
      defaultContext: { locale: 'en' as const, setLocale: () => {} },
    })

    const links = findAll(hook.current, node => node.type === 'a')
    const familyInviteLink = links.find(link => link.props?.href === '/guides/family-invitations')

    expect(familyInviteLink).toBeDefined()
    const text = textContent(familyInviteLink)
    expect(text).toContain('How to invite family to Family Health Note')
    expect(text).toContain('Guide')
    expect(text).toContain('Inviting patients & family caregivers step-by-step')

    const allGuidesLink = links.find(link => link.props?.href === '/guides')
    expect(allGuidesLink).toBeDefined()
    expect(textContent(allGuidesLink)).toContain('All guides')
  })
})
