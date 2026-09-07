/*
檔案用途：在 375px 展示模式驗證四個底欄入口與未連結的 Google Calendar 行程提示。
所在層：tests 根目錄 Playwright；保護手機導覽寬度、雙語文案與 Demo 不呼叫私人日曆。
主要關聯：App、UpcomingSchedulePage、TabHeader 與 calendar-agenda Function 邊界。
*/
import { expect, test } from '@playwright/test'

test.use({ viewport: { width: 375, height: 812 } })

test.beforeEach(async ({ page }) => {
  // 為什麼預先略過教學：本檔驗證底欄與行程頁，延遲出現的 tutorial overlay 會讓點擊時序變成無關的 flake。
  await page.addInitScript(() => localStorage.setItem('jia-jian-log-demo-tutorial', 'true'))
})

test('shows the fourth schedule tab and an explicit demo not-connected state without horizontal scrolling', async ({ page }) => {
  await page.goto('/demo')
  await expect(page.getByRole('button', { name: '事件', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '照護', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '行程', exact: true })).toBeVisible()
  // 已無獨立的「報告」底部分頁；趨勢與報告已回到各照護模組。
  await expect(page.getByRole('button', { name: '設定', exact: true })).toBeVisible()
  await page.getByRole('button', { name: '行程', exact: true }).click()
  await expect(page.getByRole('button', { name: '7 天', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '14 天', exact: true })).toBeVisible()
  await expect(page.getByText('展示模式尚未連結 Google Calendar。', { exact: true })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)

  await page.getByRole('button', { name: 'Indo', exact: true }).click()
  await expect(page.getByText('Mode demo belum terhubung ke Google Calendar.', { exact: true })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})

test('keeps the schedule entry usable from phone through desktop widths', async ({ page }) => {
  for (const width of [375, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/demo')
    await page.getByRole('button', { name: '行程', exact: true }).click()
    await expect(page.getByRole('heading', { name: '行程', exact: true })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  }
})
