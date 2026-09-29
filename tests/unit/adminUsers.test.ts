/*
檔案用途：驗證 admin-list-users Edge Function 回應的前端解析邊界，確保形狀跑掉時 fail closed 而非渲染出壞資料。
所在層：tests/unit；不呼叫真正的 Supabase Function。
主要關聯：src/lib/adminUsers.ts、AdminPage.tsx 使用者管理分頁。
*/
import { describe, expect, test } from 'bun:test'
import { parseAdminUsersResponse } from '../../src/lib/adminUsers'

describe('parseAdminUsersResponse', () => {
  test('接受合法回應並保留欄位', () => {
    const parsed = parseAdminUsersResponse({
      totalCount: 1,
      users: [{
        userId: 'u1', email: 'a@example.com', displayName: 'A', createdAt: '2026-01-01T00:00:00Z', lastSignInAt: null,
        personalNotificationTier: 'personal', medicationAiDraftTier: 'none', premiumTier: 'premium', medicationCatalogCuratorTier: 'curator',
      }],
    })
    expect(parsed.totalCount).toBe(1)
    expect(parsed.users[0]).toEqual({
      userId: 'u1', email: 'a@example.com', displayName: 'A', createdAt: '2026-01-01T00:00:00Z', lastSignInAt: null,
      personalNotificationTier: 'personal', medicationAiDraftTier: 'none', premiumTier: 'premium', medicationCatalogCuratorTier: 'curator',
    })
  })

  const validUser = {
    userId: 'u1', email: 'a@example.com', displayName: null, createdAt: null, lastSignInAt: null,
    personalNotificationTier: 'none', medicationAiDraftTier: 'none', premiumTier: 'none', medicationCatalogCuratorTier: 'none',
  }

  test.each([
    [null],
    [{ users: 'not-an-array', totalCount: 0 }],
    [{ users: [], totalCount: 'not-a-number' }],
    [{ users: [{ ...validUser, userId: 1 }], totalCount: 1 }],
    [{ users: [{ ...validUser, displayName: 1 }], totalCount: 1 }],
    [{ users: [{ ...validUser, personalNotificationTier: undefined }], totalCount: 1 }],
    [{ users: [{ ...validUser, medicationAiDraftTier: undefined }], totalCount: 1 }],
    [{ users: [{ ...validUser, premiumTier: 1 }], totalCount: 1 }],
    [{ users: [{ ...validUser, medicationCatalogCuratorTier: 1 }], totalCount: 1 }],
  ])('拒絕不合法的回應形狀 %#', input => {
    expect(() => parseAdminUsersResponse(input)).toThrow()
  })

  test('舊版 admin-list-users Function（部署空窗期）沒有回傳 premiumTier 時，退回 none 而不是整頁報錯', () => {
    // premiumTier 是後補的欄位；Edge Function 沒有自動部署，Vercel 前端卻會自動部署，
    // 兩者之間有一段視窗前端已更新但 Function 還沒重新部署，那段時間的回應不會帶這個欄位。
    const { premiumTier, ...rowWithoutPremiumTier } = validUser
    const parsed = parseAdminUsersResponse({ users: [rowWithoutPremiumTier], totalCount: 1 })
    expect(parsed.users[0].premiumTier).toBe('none')
  })

  test('舊版 admin-list-users Function 沒有回傳 medicationCatalogCuratorTier 時，退回 none 而不是整頁報錯', () => {
    const { medicationCatalogCuratorTier, ...rowWithoutCuratorTier } = validUser
    const parsed = parseAdminUsersResponse({ users: [rowWithoutCuratorTier], totalCount: 1 })
    expect(parsed.users[0].medicationCatalogCuratorTier).toBe('none')
  })
})
