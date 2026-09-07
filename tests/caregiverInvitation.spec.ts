/*
檔案用途：驗證未登入家人照護邀請入口的中性外殼、fragment 清理與雙語登入體驗。
所在層：tests 根目錄 Playwright；不使用真實帳號或 staging 健康資料。
主要關聯：/join、CaregiverInvitationJoinPage、LoginScreen 與 GoogleSignInButton。
*/
import { expect, test } from '@playwright/test'

test('join link keeps an unauthenticated visitor outside health data and removes the raw fragment', async ({ page }) => {
  await page.goto('/join#token=' + 'a'.repeat(64))

  await expect(page.getByTestId('google-sign-in-entry')).toBeVisible()
  await expect(page.getByRole('button', { name: /Coba sekarang|試用看看/ })).toHaveCount(0)
  await expect(page.getByText(/Ajukan untuk bergabung|申請加入/)).toHaveCount(0)
  await expect.poll(() => new URL(page.url()).hash).toBe('')
  await expect(page.locator('body')).not.toContainText(/120\/80|mmHg|診斷|diagnosis/i)
})

test('join login shell can switch language without exposing a demo shortcut', async ({ page }) => {
  await page.goto('/join#token=' + 'b'.repeat(64))
  await page.getByRole('button', { name: 'Indo', exact: true }).click()
  await expect(page.getByTestId('google-sign-in-entry')).toBeVisible()
  await expect(page.getByRole('button', { name: /Coba sekarang|試用看看/ })).toHaveCount(0)
  await page.getByRole('button', { name: '繁中', exact: true }).click()
  await expect(page.getByTestId('google-sign-in-entry')).toBeVisible()
})

test('patient invitation link uses a separate neutral login shell', async ({ page }) => {
  await page.goto('/patient-invite#token=' + 'c'.repeat(64))

  await expect(page.getByTestId('google-sign-in-entry')).toBeVisible()
  await expect(page.getByRole('button', { name: /Coba sekarang|試用看看/ })).toHaveCount(0)
  await expect.poll(() => new URL(page.url()).hash).toBe('')
  await expect(page.locator('body')).not.toContainText(/120\/80|mmHg|診斷|diagnosis/i)
})

test('family invitation guide explains both invitation paths without requiring login', async ({ page }) => {
  await page.goto('/guides/family-invitations')

  await expect(page.getByRole('heading', { name: /Cara Mengundang Keluarga|如何邀請家人/ })).toBeVisible()
  await expect(page.getByRole('heading', { name: /Mengundang orang yang dirawat|邀請被照顧者本人/ })).toBeVisible()
  await expect(page.getByRole('heading', { name: /Mengundang saudara|邀請兄弟姐妹一起照護/ })).toBeVisible()
  await expect(page.getByText(/email belum dikonfigurasi|email 尚未設定/)).toHaveCount(2)
  await expect(page.getByRole('link', { name: /Kembali ke Beranda|返回首頁/ })).toBeVisible()
})
