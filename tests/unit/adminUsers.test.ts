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
      users: [{ userId: 'u1', email: 'a@example.com', displayName: 'A', createdAt: '2026-01-01T00:00:00Z', lastSignInAt: null }],
    })
    expect(parsed.totalCount).toBe(1)
    expect(parsed.users[0]).toEqual({ userId: 'u1', email: 'a@example.com', displayName: 'A', createdAt: '2026-01-01T00:00:00Z', lastSignInAt: null })
  })

  test.each([
    [null],
    [{ users: 'not-an-array', totalCount: 0 }],
    [{ users: [], totalCount: 'not-a-number' }],
    [{ users: [{ userId: 1, email: 'a@example.com' }], totalCount: 1 }],
    [{ users: [{ userId: 'u1', email: 'a@example.com', displayName: 1 }], totalCount: 1 }],
  ])('拒絕不合法的回應形狀 %#', input => {
    expect(() => parseAdminUsersResponse(input)).toThrow()
  })
})
