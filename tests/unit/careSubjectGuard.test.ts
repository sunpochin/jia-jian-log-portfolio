/*
檔案用途：驗證目前照護對象不可寫入時會換回可寫入對象，作為 A1 不變量的防禦性檢查。
所在層：tests/unit；守護 AGENTS.md〈生理數值對象綁定不變量〉在前端導覽層的最後一道防線。
主要關聯：src/lib/careSubjectGuard.ts、src/App.tsx 的 changeTab、src/lib/auth.ts 的 accessibleSubjects。
*/
import { describe, expect, test } from 'bun:test'
import { resolveWritableSubject } from '../../src/lib/careSubjectGuard'

const LIVE_PATIENT = '11111111-1111-4111-8111-111111111111'
const OTHER_LIVE_PATIENT = '22222222-2222-4222-8222-222222222222'
const ARCHIVED_PET = '33333333-3333-4333-8333-333333333333'
const WRITABLE = [LIVE_PATIENT, OTHER_LIVE_PATIENT]

describe('resolveWritableSubject', () => {
  test('不可寫入的對象換回第一個可寫入對象並回報已改變', () => {
    // 正常操作下這不會發生——已封存對象只透過 ArchivedPatientHistoryPage 查看，
    // 完全不會進入這裡檢查的 activeSubject。這條測試守的是「萬一發生了」的防線。
    expect(resolveWritableSubject(ARCHIVED_PET, WRITABLE)).toEqual({
      subject: LIVE_PATIENT,
      redirected: true,
    })
  })

  test('對象本來就可寫入時不介入，避免每次切分頁都把人換回第一位', () => {
    expect(resolveWritableSubject(OTHER_LIVE_PATIENT, WRITABLE)).toEqual({
      subject: OTHER_LIVE_PATIENT,
      redirected: false,
    })
  })

  test('沒有任何可寫入對象時不硬換人', () => {
    expect(resolveWritableSubject(ARCHIVED_PET, [])).toEqual({
      subject: ARCHIVED_PET,
      redirected: false,
    })
  })

  test('尚未解析出對象時維持原狀，不誤報自動切換', () => {
    expect(resolveWritableSubject('', WRITABLE)).toEqual({
      subject: '',
      redirected: false,
    })
  })
})
