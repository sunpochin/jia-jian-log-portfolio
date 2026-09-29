/*
檔案用途：在 375px 展示模式驗證五個底欄入口與門診頁（原「行程」tab 併入後）的可用性與雙語標題。
所在層：tests 根目錄 Playwright；保護手機導覽寬度、雙語文案與 Demo 不呼叫私人日曆（Google 行程區塊只給家庭擁有者，
展示模式不顯示，因此也不會打 calendar-agenda）。
主要關聯：App、NextVisitPage、UpcomingScheduleSection、TabHeader 與 calendar-agenda Function 邊界。
*/
import { expect, test } from '@playwright/test'

test.use({ viewport: { width: 375, height: 812 } })

test.beforeEach(async ({ page }) => {
  // 為什麼預先略過教學：本檔驗證底欄與門診頁，延遲出現的 tutorial overlay 會讓點擊時序變成無關的 flake。
  await page.addInitScript(() => localStorage.setItem('jia-jian-log-demo-tutorial', 'true'))
})

test('shows the five bottom tabs and the visit page sections without horizontal scrolling', async ({ page }) => {
  await page.goto('/demo')
  await expect(page.getByRole('button', { name: '今天', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '軌跡', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '照護', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '門診', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '設定', exact: true })).toBeVisible()
  await page.getByRole('button', { name: '門診', exact: true }).click()
  await expect(page.getByRole('heading', { name: '門診', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: '下次', exact: true })).toBeVisible()
  await expect(page.getByText('帶去給醫師', { exact: true })).toBeVisible()
  // 展示模式沒有家庭擁有者身分，Google 行程區塊不顯示，也就不會對私人日曆發出請求。
  await expect(page.getByText('Google 行程', { exact: true })).toHaveCount(0)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)

  await page.getByRole('button', { name: 'Indo', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Kunjungan dokter', exact: true })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})

test('keeps the visit entry usable from phone through desktop widths', async ({ page }) => {
  for (const width of [375, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/demo')
    await page.getByRole('button', { name: '門診', exact: true }).click()
    await expect(page.getByRole('heading', { name: '門診', exact: true })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  }
})
